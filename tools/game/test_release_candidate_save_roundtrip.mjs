import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-release-save-tests-'));
  for (const file of readdirSync(srcDir).filter(file => file.endsWith('.ts'))) {
    const source = readFileSync(new URL(file, srcDir), 'utf8');
    let output = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    output = output.replace(/(from\s+['"])(\.{1,2}\/[^'"]+)(['"])/g, (_match, start, spec, end) =>
      /\.[cm]?js$/.test(spec) ? `${start}${spec}${end}` : `${start}${spec}.mjs${end}`);
    writeFileSync(join(outDir, file.replace(/\.ts$/, '.mjs')), output, 'utf8');
  }
  return outDir;
}

const compiledDir = compileGameModules();
const load = name => import(pathToFileURL(join(compiledDir, `${name}.mjs`)).href);
const simulation = await load('simulation');
const saveLoad = await load('saveLoad');
const tactical = await load('tacticalBattle');
const expedition = await load('expedition');
const agents = await load('agents');
const livestock = await load('livestock');
const family = await load('family');
const { CONFIG } = await load('config');

const SAVE_KEY = 'buksae-save-v3';
const UI_PREFS_KEY = 'buksae-ui-prefs';
const TRANSITION_LOG = '마을의 규모가 커지며 주민들이 바라는 살림의 기준도 달라졌습니다.';

function saveKey(slot) {
  return slot <= 1 ? SAVE_KEY : `${SAVE_KEY}-slot${slot}`;
}

function installStorage(backing = new Map()) {
  globalThis.localStorage = {
    get length() { return backing.size; },
    getItem: key => backing.get(key) ?? null,
    setItem: (key, value) => backing.set(key, String(value)),
    removeItem: key => backing.delete(key),
    key: index => [...backing.keys()][index] ?? null,
  };
  return backing;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeStableState(seed) {
  const state = simulation.newGame(seed);
  for (const resource of Object.keys(state.resources)) state.resources[resource] = 2_000;
  state.resources.reputation = 50;
  state.threat = 0;
  state.raidCooldown = 10_000;
  state.lastTradeDay = state.day;
  state.lastImmigrationDay = state.day;
  state.inspectionCooldownUntil = state.day + 10_000;
  state.religionOfferCooldownUntil = state.day + 10_000;
  state.courtTribute = null;
  state.pendingChoice = null;
  state.gameOver = null;
  for (const resident of state.residents) {
    resident.alive = true;
    resident.sick = false;
    resident.health = 100;
    resident.hunger = 100;
    resident.warmth = 100;
    resident.morale = 80;
    resident.quarantinedUntil = 0;
  }
  return state;
}

function writeRawSave(state, schemaVersion, slot = 1) {
  localStorage.setItem(saveKey(slot), JSON.stringify({ ...clone(state), schemaVersion }));
}

function resolveOpenTacticalBattle(state) {
  for (let guard = 0; guard < 400 && state.tacticalBattle; guard++) {
    const phase = state.tacticalBattle.phase;
    let error = null;
    if (phase === 'preparation' || phase === 'preparationExecution' || phase === 'deployment') {
      error = tactical.advanceTacticalPhase(state);
    } else if (phase === 'command') {
      error = tactical.resolveTacticalRound(state);
    } else if (phase === 'simulating') {
      error = tactical.completeTacticalSimulation(state);
    } else if (phase === 'report') {
      error = tactical.acknowledgeTacticalReport(state);
    } else if (phase === 'finished') {
      tactical.finishTacticalBattle(state);
    } else {
      assert.fail(`unsupported tactical phase while resuming save: ${phase}`);
    }
    assert.equal(error, null, `tactical save recovery failed in ${phase}: ${error}`);
  }
  assert.equal(state.tacticalBattle, null, 'tactical battle must make bounded progress after load');
  if (state.tacticalBattleReport) tactical.dismissTacticalBattleReport(state);
}

function resolvePendingChoice(state) {
  const choice = state.pendingChoice;
  assert.ok(choice);
  const preferred = choice.kind === 'expedition'
    ? choice.options.find(option => option.id === 'auto' && !option.disabled)
    : null;
  const option = preferred ?? choice.options.find(candidate => !candidate.disabled);
  assert.ok(option, `pending choice ${choice.kind} has no enabled option`);
  simulation.resolveChoice(state, option.id);
  assert.notEqual(state.pendingChoice, choice, `pending choice ${choice.kind} did not make progress`);
}

function advanceDays(state, days) {
  const targetDay = state.day + days;
  for (let guard = 0; state.day < targetDay && guard < 20_000; guard++) {
    if (state.tacticalBattle) {
      resolveOpenTacticalBattle(state);
      continue;
    }
    if (state.tacticalBattleReport) {
      tactical.dismissTacticalBattleReport(state);
      continue;
    }
    if (state.pendingChoice) {
      resolvePendingChoice(state);
      continue;
    }
    if (state.gameOver) {
      if (state.gameOver.won) {
        assert.equal(simulation.continueAfterVictory(state), true);
        continue;
      }
      assert.fail(`save scenario reached game over before day ${targetDay}: ${state.gameOver.reason}`);
    }
    simulation.advanceDay(state);
  }
  assert.equal(state.day, targetDay, `save scenario must advance exactly ${days} days`);
}

function assertStateIntegrity(state, label) {
  assert.doesNotThrow(() => JSON.stringify(state), `${label}: state must remain serializable`);
  const residentIds = new Set(state.residents.map(resident => resident.id));
  const buildingIds = new Set(state.buildings.map(building => building.id));
  for (const [resource, amount] of Object.entries(state.resources)) {
    assert.ok(Number.isFinite(amount), `${label}: ${resource} must be finite`);
    assert.ok(amount >= -1e-9, `${label}: ${resource} must not be abnormally negative`);
  }
  for (const resident of state.residents) {
    if (resident.spouseId != null) {
      assert.ok(residentIds.has(resident.spouseId), `${label}: spouse ${resident.spouseId} must exist`);
    }
    if (resident.motherId != null) {
      assert.ok(residentIds.has(resident.motherId), `${label}: mother ${resident.motherId} must exist`);
    }
    if (resident.fatherId != null) {
      assert.ok(residentIds.has(resident.fatherId), `${label}: father ${resident.fatherId} must exist`);
    }
    if (resident.assignedBuildingId != null) {
      assert.ok(buildingIds.has(resident.assignedBuildingId),
        `${label}: assigned building ${resident.assignedBuildingId} must exist`);
    }
  }
  if (state.expedition) {
    assert.ok(state.expedition.memberIds.length > 0, `${label}: an expedition must retain members`);
    for (const id of state.expedition.memberIds) {
      assert.ok(state.residents.some(resident => resident.id === id && resident.alive),
        `${label}: expedition member ${id} must be living`);
    }
  }
  const cattle = state.buildings
    .filter(building => building.built && building.type === 'stable' && building.livestock?.species === 'cattle')
    .reduce((sum, building) => sum + building.livestock.headcount, 0);
  const assignedOxen = state.buildings
    .filter(building => building.type === 'field' || building.type === 'paddy')
    .reduce((sum, building) => sum + (building.plowOxen ?? 0), 0);
  assert.ok(assignedOxen <= cattle, `${label}: assigned oxen ${assignedOxen} exceed cattle ${cattle}`);
  const horses = state.buildings
    .filter(building => building.built && building.type === 'stable' && building.livestock?.species === 'horse')
    .reduce((sum, building) => sum + building.livestock.headcount, 0);
  assert.ok(Object.keys(state.mountAssignments).length <= horses,
    `${label}: mount assignments exceed available horses`);
}

async function roundTripScenario({ name, state, schemaVersion, afterFirstLoad, afterReload }) {
  const backing = installStorage();
  localStorage.setItem(UI_PREFS_KEY, '{"version":5,"sentinel":"keep"}');
  writeRawSave(state, schemaVersion);
  const originalDay = state.day;

  const loaded = saveLoad.loadGame();
  assert.ok(loaded, `${name}: initial load must succeed`);
  assert.equal(loaded.schemaVersion, saveLoad.CURRENT_SCHEMA_VERSION);
  afterFirstLoad?.(loaded);
  advanceDays(loaded, 10);
  assertStateIntegrity(loaded, `${name} after first 10 days`);
  assert.equal(saveLoad.saveGame(loaded), true, `${name}: save after 10 days must succeed`);

  installStorage(backing); // browser refresh: a new Storage facade over the same durable values
  const reloaded = saveLoad.loadGame();
  assert.ok(reloaded, `${name}: reload must succeed`);
  afterReload?.(reloaded, loaded);
  advanceDays(reloaded, 10);
  assertStateIntegrity(reloaded, `${name} after reload and 10 days`);
  assert.equal(reloaded.day, originalDay + 20);
  assert.equal(localStorage.getItem(UI_PREFS_KEY), '{"version":5,"sentinel":"keep"}',
    `${name}: game saves must not overwrite UI preferences`);
  return reloaded;
}

const results = [];

// 1. Direct-command tactical battles did not exist in schema v5.
{
  const state = makeStableState(2026071901);
  delete state.tacticalBattle;
  delete state.tacticalBattleReport;
  await roundTripScenario({
    name: 'pre-tactical-v5', state, schemaVersion: 5,
    afterFirstLoad: loaded => {
      assert.equal(loaded.tacticalBattle, null);
      assert.equal(loaded.tacticalBattleReport, null);
    },
  });
  results.push('pre-tactical-v5');
}

// 2. Both legacy bo and jin saves receive one fixed expectation transition, never an extension.
for (const [index, rank] of ['bo', 'jin'].entries()) {
  const state = makeStableState(2026071910 + index);
  state.day = 42;
  state.rank = rank;
  delete state.expectationTransitionUntil;
  delete state.expectationTransitionNotified;
  let firstUntil = null;
  await roundTripScenario({
    name: `pre-satisfaction-${rank}`, state, schemaVersion: 21,
    afterFirstLoad: loaded => {
      firstUntil = loaded.expectationTransitionUntil;
      assert.equal(firstUntil, 42 + CONFIG.satisfaction.legacyTransitionDays);
      assert.equal(loaded.expectationTransitionNotified, true);
      assert.equal(loaded.log.filter(entry => entry.text.startsWith(TRANSITION_LOG)).length, 1);
    },
    afterReload: reloaded => {
      assert.equal(reloaded.expectationTransitionUntil, firstUntil,
        'reloading a migrated high-tier save must not extend the transition');
      assert.equal(reloaded.log.filter(entry => entry.text.startsWith(TRANSITION_LOG)).length, 1,
        'the legacy expectation notice is written once');
    },
  });
  results.push(`pre-satisfaction-${rank}`);
}

// 3. A pre-livestock stable receives the v16 chicken default and survives a current round trip.
{
  const state = makeStableState(2026071920);
  const stable = {
    id: state.nextBuildingId++, type: 'stable', x: 2, y: 2,
    progress: 99, built: true, fieldGrowth: 0,
  };
  state.buildings.push(stable);
  delete state.unlockedLivestock;
  for (const resource of ['eggs', 'milk', 'wool', 'hay']) delete state.resources[resource];
  await roundTripScenario({
    name: 'pre-livestock-v15', state, schemaVersion: 15,
    afterFirstLoad: loaded => {
      const migrated = loaded.buildings.find(building => building.id === stable.id);
      assert.equal(migrated?.livestock?.species, 'chicken');
      assert.ok(loaded.unlockedLivestock.includes('chicken'));
    },
  });
  results.push('pre-livestock-v15');
}

// 4. A pre-lifecycle save restores additive lifecycle/corpse fields without discarding residents.
{
  const state = makeStableState(2026071930);
  for (const resident of state.residents) {
    for (const field of [
      'stage', 'stageProgress', 'youthActivity', 'education', 'literate', 'spouseId',
      'motherId', 'motherName', 'fatherId', 'fatherName', 'birthRecoveryUntil',
    ]) delete resident[field];
  }
  delete state.corpses;
  delete state.nextCorpseId;
  delete state.spoilageStockAtDayStart;
  const cemetery = {
    id: state.nextBuildingId++, type: 'cemetery', x: 5, y: 5,
    progress: 9, built: true, fieldGrowth: 0, graves: 2,
  };
  state.buildings.push(cemetery);
  const population = state.residents.length;
  await roundTripScenario({
    name: 'pre-lifecycle-v19', state, schemaVersion: 19,
    afterFirstLoad: loaded => {
      assert.equal(loaded.residents.length, population);
      assert.deepEqual(loaded.corpses, []);
      assert.equal(loaded.nextCorpseId, 1);
      assert.deepEqual(loaded.buildings.find(building => building.id === cemetery.id)?.burialRecords, [{}, {}],
        'legacy graves become explicit unknown records');
      assert.equal(loaded.spoilageStockAtDayStart.fish, loaded.resources.fish,
        'legacy saves conservatively treat current food as day-start stock');
    },
  });
  results.push('pre-lifecycle-v19');
}

// 5. A v21 1x1 field is upgraded to the v22 plot representation.
{
  const state = makeStableState(2026071940);
  const field = {
    id: state.nextBuildingId++, type: 'field', x: 2, y: 5,
    progress: 99, built: true, fieldGrowth: 45,
  };
  state.buildings.push(field);
  await roundTripScenario({
    name: 'v21-field', state, schemaVersion: 21,
    afterFirstLoad: loaded => {
      const migrated = loaded.buildings.find(building => building.id === field.id);
      assert.equal(migrated?.w, 1);
      assert.equal(migrated?.h, 1);
      assert.equal(migrated?.sownArea, 1);
      assert.equal(migrated?.plowOxen, 0);
    },
  });
  results.push('v21-field');
}

// 6. Current schema saves use the same two-stage round trip.
{
  const state = makeStableState(2026071950);
  await roundTripScenario({
    name: 'current-schema', state, schemaVersion: saveLoad.CURRENT_SCHEMA_VERSION,
  });
  results.push('current-schema');
}

// 7. A saved command-phase tactical battle resumes, reaches its report, and releases the day loop.
{
  const state = makeStableState(2026071960);
  state.residents.slice(0, 4).forEach(resident => {
    resident.stage = null;
    resident.age = 25;
    resident.job = 'militia';
  });
  state.resources.muskets = 1;
  state.resources.hornBows = 1;
  state.resources.spears = 2;
  state.resources.gunpowder = 100;
  const battle = tactical.createTacticalBattle(state, {
    factionName: '저장 검증 마적', power: 20, warned: true, siege: false, mode: 'garrison',
  });
  assert.ok(battle);
  assert.equal(tactical.advanceTacticalPhase(state), null);
  if (battle.phase === 'deployment') tactical.applyAutoDeployTacticalGroups(battle);
  assert.equal(tactical.advanceTacticalPhase(state), null);
  assert.equal(state.tacticalBattle.phase, 'command');
  await roundTripScenario({
    name: 'active-tactical', state, schemaVersion: saveLoad.CURRENT_SCHEMA_VERSION,
    afterFirstLoad: loaded => assert.equal(loaded.tacticalBattle?.phase, 'command'),
    afterReload: reloaded => {
      assert.equal(reloaded.tacticalBattle, null);
      assert.equal(reloaded.tacticalBattleReport, null);
    },
  });
  results.push('active-tactical');
}

function createReachableExpedition(state) {
  const center = state.buildings.find(building => building.type === 'center' && building.built);
  assert.ok(center);
  const members = state.residents.slice(0, 3);
  ['militia', 'watchman', 'hunter'].forEach((job, index) => {
    members[index].stage = null;
    members[index].age = 25;
    members[index].job = job;
    members[index].sick = false;
    members[index].health = 100;
  });
  const candidates = state.map.flat().filter(tile =>
    agents.isTerrainPassable(state, tile.x, tile.y) &&
    Math.abs(tile.x - center.x) + Math.abs(tile.y - center.y) >= 5);
  candidates.sort((a, b) =>
    Math.abs(a.x - center.x) + Math.abs(a.y - center.y) -
    (Math.abs(b.x - center.x) + Math.abs(b.y - center.y)) || a.y - b.y || a.x - b.x);
  for (const target of candidates) {
    const error = expedition.createExpedition(state, {
      kind: 'lairAssault', memberIds: members.map(member => member.id),
      targetX: target.x, targetY: target.y, speed: 1.25,
    });
    if (error == null) return members.map(member => member.id);
    assert.equal(state.expedition, null);
  }
  assert.fail('could not create a reachable release-candidate expedition');
}

// 8. A mustering expedition retains member references and can complete/continue after refresh.
{
  const state = makeStableState(2026071970);
  const memberIds = createReachableExpedition(state);
  await roundTripScenario({
    name: 'active-expedition', state, schemaVersion: saveLoad.CURRENT_SCHEMA_VERSION,
    afterFirstLoad: loaded => {
      assert.deepEqual(loaded.expedition?.memberIds, memberIds);
      assert.equal(loaded.expedition?.phase, 'muster');
    },
  });
  results.push('active-expedition');
}

// 9. A married named resident and their child preserve both live IDs and historical names.
{
  const state = makeStableState(2026071980);
  const named = state.residents[0];
  const spouse = state.residents[1];
  const child = state.residents[2];
  named.special = 'exiledScholar';
  named.literate = true;
  named.spouseId = spouse.id;
  spouse.spouseId = named.id;
  child.age = 8;
  child.stage = 'child';
  child.stageProgress = 0;
  child.motherId = named.id;
  child.motherName = named.name;
  child.fatherId = spouse.id;
  child.fatherName = spouse.name;
  state.spentSpecialIds = ['exiledScholar'];
  state.specialResidentRecords = {
    exiledScholar: { status: 'active', residentId: named.id, joinedDay: state.day },
  };
  const verifyFamily = loaded => {
    const loadedNamed = loaded.residents.find(resident => resident.id === named.id);
    const loadedSpouse = loaded.residents.find(resident => resident.id === spouse.id);
    const loadedChild = loaded.residents.find(resident => resident.id === child.id);
    assert.equal(loadedNamed?.spouseId, spouse.id);
    assert.equal(loadedSpouse?.spouseId, named.id);
    assert.equal(loadedChild?.motherName, named.name);
    assert.equal(loadedChild?.fatherName, spouse.name);
    assert.equal(family.familyReferenceName(loaded, loadedChild?.motherId, loadedChild?.motherName), named.name);
    assert.equal(loaded.specialResidentRecords.exiledScholar.status, 'active');
  };
  await roundTripScenario({
    name: 'named-resident-family', state, schemaVersion: saveLoad.CURRENT_SCHEMA_VERSION,
    afterFirstLoad: verifyFamily,
    afterReload: verifyFamily,
  });
  results.push('named-resident-family');
}

// 10. Multiple species, plow oxen, and mounted residents preserve bounded assignments.
{
  const state = makeStableState(2026071990);
  state.unlockedLivestock = ['chicken', 'goat', 'sheep', 'cattle', 'horse'];
  const species = [
    ['chicken', 4], ['goat', 3], ['sheep', 3], ['cattle', 3], ['horse', 3],
  ];
  for (const [index, [id, headcount]] of species.entries()) {
    state.buildings.push({
      id: state.nextBuildingId++, type: 'stable', x: 2 + index * 2, y: 2,
      progress: 99, built: true, fieldGrowth: 0,
      livestock: livestock.createLivestockState(id, headcount),
    });
  }
  const field = {
    id: state.nextBuildingId++, type: 'field', x: 2, y: 7,
    progress: 99, built: true, fieldGrowth: 0,
    w: 3, h: 3, sownArea: 0, plowOxen: 2, cropId: 'millet', queuedCropId: null,
  };
  state.buildings.push(field);
  state.residents.slice(0, 2).forEach((resident, index) => {
    resident.stage = null;
    resident.age = 25;
    resident.job = index === 0 ? 'militia' : 'watchman';
    state.mountAssignments[resident.id] = 'horse';
  });
  const verifyAssignments = loaded => {
    const loadedField = loaded.buildings.find(building => building.id === field.id);
    assert.equal(loadedField?.plowOxen, 2);
    assert.equal(Object.keys(loaded.mountAssignments).length, 2);
    assert.equal(loaded.buildings.filter(building => building.livestock?.headcount > 0).length, 5);
  };
  await roundTripScenario({
    name: 'livestock-oxen-mounts', state, schemaVersion: saveLoad.CURRENT_SCHEMA_VERSION,
    afterFirstLoad: verifyAssignments,
    afterReload: verifyAssignments,
  });
  results.push('livestock-oxen-mounts');
}

// Slots 1-4 are isolated, survive a refreshed storage facade, and never touch UI prefs.
{
  const backing = installStorage();
  const uiPrefs = '{"version":5,"starredResources":["grain"]}';
  localStorage.setItem(UI_PREFS_KEY, uiPrefs);
  for (let slot = 1; slot <= saveLoad.SAVE_SLOT_COUNT; slot++) {
    const state = makeStableState(2026072000 + slot);
    state.day = 100 + slot;
    assert.equal(saveLoad.saveGame(state, slot), true);
  }
  installStorage(backing);
  for (let slot = 1; slot <= saveLoad.SAVE_SLOT_COUNT; slot++) {
    assert.equal(saveLoad.hasSave(slot), true);
    assert.equal(saveLoad.loadGame(slot)?.day, 100 + slot, `slot ${slot} must retain its own state`);
  }
  assert.equal(localStorage.getItem(UI_PREFS_KEY), uiPrefs);
}

// Future saves remain explicit rejections rather than being silently downgraded or discarded into another slot.
{
  installStorage();
  const future = makeStableState(2026072100);
  writeRawSave(future, saveLoad.CURRENT_SCHEMA_VERSION + 1, 4);
  assert.equal(saveLoad.loadGame(4), null);
  assert.equal(saveLoad.hasSave(4), true, 'rejection must not silently delete the future save');
  assert.equal(saveLoad.loadGame(1), null, 'a rejected slot must not contaminate another slot');
}

assert.equal(results.length, 11, 'the ten requested rows include separate bo and jin legacy fixtures');
console.log(`release-candidate save round trips passed: ${results.join(', ')}`);
