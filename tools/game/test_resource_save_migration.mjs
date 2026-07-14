import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-game-tests-'));
  for (const file of readdirSync(srcDir).filter(file => file.endsWith('.ts'))) {
    const source = readFileSync(new URL(file, srcDir), 'utf8');
    let output = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    output = output.replace(/(from\s+['"])(\.{1,2}\/[^'"]+)(['"])/g, (_m, start, spec, end) =>
      /\.[cm]?js$/.test(spec) ? `${start}${spec}${end}` : `${start}${spec}.mjs${end}`);
    writeFileSync(join(outDir, file.replace(/\.ts$/, '.mjs')), output, 'utf8');
  }
  return outDir;
}

const store = new Map();
globalThis.localStorage = {
  getItem: key => store.get(key) ?? null,
  setItem: (key, value) => store.set(key, value),
  removeItem: key => store.delete(key),
};

const compiledDir = compileGameModules();
const simulation = await import(pathToFileURL(join(compiledDir, 'simulation.mjs')).href);
const saveLoad = await import(pathToFileURL(join(compiledDir, 'saveLoad.mjs')).href);
const tactical = await import(pathToFileURL(join(compiledDir, 'tacticalBattle.mjs')).href);
const catalog = await import(pathToFileURL(join(compiledDir, 'resourceCatalog.mjs')).href);
const { CONFIG } = await import(pathToFileURL(join(compiledDir, 'config.mjs')).href);

assert.equal(saveLoad.CURRENT_SCHEMA_VERSION, 8, 'three-line formations require schema version 8');
assert.equal(typeof saveLoad.migrateV7ToV8, 'function');

{
  const legacy = simulation.newGame(2026071010);
  delete legacy.schemaVersion;
  legacy.resources = {
    food: 11, clothes: 2, game: 3, grain: 5, meat: 1, hide: 1,
    wood: 20, stone: 10, tools: 4, reputation: 50, defense: 0,
  };
  legacy.residents[0].carrying = { food: 2, clothes: 1, game: 1 };
  legacy.buildings[0].inventory = { food: 3, game: 2 };
  legacy.processingReserves = { wood: 7, grain: 9, game: 2, hide: 1, iron: 0 };
  legacy.courtTribute = { year: 1, items: { clothes: 3 }, dueDay: 37, resolved: false, paid: false };
  legacy.pendingChoice = {
    kind: 'trade', title: 'legacy trade', body: '', options: [],
    data: { give: 'food', giveAmt: 2, get: 'game', getAmt: 1 },
  };
  delete legacy.lastImmigrationDay;
  delete legacy.tacticalBattle;
  delete legacy.tacticalBattleReport;
  const legacyStone = legacy.map.flat().find(tile => tile.terrain === 'rock' && !tile.hasIron);
  const legacyIron = legacy.map.flat().find(tile => tile.terrain === 'rock' && tile.hasIron);
  assert.ok(legacyStone && legacyIron);
  delete legacyStone.mineralRemaining;
  delete legacyIron.mineralRemaining;

  assert.equal(saveLoad.saveGame(legacy), true);
  const loaded = saveLoad.loadGame();
  assert.ok(loaded);
  assert.equal(loaded.schemaVersion, saveLoad.CURRENT_SCHEMA_VERSION);

  assert.equal(loaded.resources.grain, 16);
  assert.equal(loaded.resources.meat, 13);
  assert.equal(loaded.resources.hide, 4);
  assert.equal(loaded.resources.hideClothes, 2);
  assert.equal(loaded.residents[0].carrying.grain, 2);
  assert.equal(loaded.residents[0].carrying.meat, 4);
  assert.equal(loaded.residents[0].carrying.hide, 1);
  assert.equal(loaded.buildings[0].inventory.grain, 3);
  assert.equal(loaded.buildings[0].inventory.meat, 8);
  assert.equal(loaded.buildings[0].inventory.hide, 2);
  assert.deepEqual(loaded.courtTribute.items, { hideClothes: 3 });
  assert.equal(loaded.processingReserves.wood, 7);
  assert.equal(loaded.processingReserves.rice, 0);
  assert.equal(loaded.pendingChoice, null);
  assert.equal(loaded.lastImmigrationDay, -999);
  assert.equal(loaded.tacticalBattle, null);
  assert.equal(loaded.tacticalBattleReport, null);
  for (const id of catalog.RESOURCE_IDS) assert.equal(typeof loaded.resources[id], 'number');
  assert.equal(Object.hasOwn(loaded.resources, 'food'), false);
  assert.equal(Object.hasOwn(loaded.resources, 'clothes'), false);
  assert.equal(Object.hasOwn(loaded.resources, 'game'), false);
  assert.equal(loaded.map[legacyStone.y][legacyStone.x].mineralRemaining, CONFIG.minerals.legacyStone);
  assert.equal(loaded.map[legacyIron.y][legacyIron.x].mineralRemaining, CONFIG.minerals.legacyIron);
}

{
  const source = { schemaVersion: 3, residents: [] };
  const migrated = saveLoad.migrateToCurrent(source);
  assert.equal(source.schemaVersion, 3, 'schema migration must not mutate its input');
  assert.equal(migrated.schemaVersion, saveLoad.CURRENT_SCHEMA_VERSION);
}

{
  const future = { schemaVersion: saveLoad.CURRENT_SCHEMA_VERSION + 1 };
  assert.throws(() => saveLoad.migrateToCurrent(future), /future|미래|지원하지/i);
  store.set('buksae-save-v3', JSON.stringify(future));
  assert.equal(saveLoad.loadGame(), null, 'a future schema save is rejected instead of being downgraded');
}

function prepareFormationTestCombatants(state) {
  state.resources.muskets = 1;
  state.resources.hornBows = 1;
  state.resources.spears = 1;
  state.resources.gunpowder = 10;
  state.residents.slice(0, 3).forEach(resident => {
    resident.job = 'militia';
    resident.sick = false;
    resident.health = 100;
    resident.quarantinedUntil = 0;
  });
}

{
  const v7 = simulation.newGame(2026071457);
  prepareFormationTestCombatants(v7);
  const battle = tactical.createTacticalBattle(v7, {
    factionName: 'v7 formation preservation', power: 40, warned: true, siege: false, mode: 'garrison',
  });
  const muskets = battle.defenderGroups.find(group => group.kind === 'militia-musket');
  assert.ok(muskets);
  muskets.line = 'rear';
  store.set('buksae-save-v3', JSON.stringify({ ...v7, schemaVersion: 7 }));
  const loaded = saveLoad.loadGame();
  assert.equal(loaded?.schemaVersion, 8);
  assert.equal(
    loaded?.tacticalBattle?.defenderGroups.find(group => group.id === muskets.id)?.line,
    'rear',
    'valid v7 front/rear placements remain unchanged',
  );
}

{
  const v8 = simulation.newGame(2026071458);
  prepareFormationTestCombatants(v8);
  const battle = tactical.createTacticalBattle(v8, {
    factionName: 'v8 formation load', power: 40, warned: true, siege: false, mode: 'garrison',
  });
  const muskets = battle.defenderGroups.find(group => group.kind === 'militia-musket');
  assert.ok(muskets);
  assert.equal(muskets.line, 'middle');
  assert.equal(saveLoad.saveGame(v8), true);
  const loaded = saveLoad.loadGame();
  assert.equal(loaded?.schemaVersion, 8);
  assert.equal(loaded?.tacticalBattle?.defenderGroups.find(group => group.id === muskets.id)?.line, 'middle');
}

{
  const redeploySave = simulation.newGame(2026071461);
  prepareFormationTestCombatants(redeploySave);
  const battle = tactical.createTacticalBattle(redeploySave, {
    factionName: 'redeploy save continuation', power: 40, warned: true, siege: false, mode: 'garrison',
  });
  assert.equal(tactical.advanceTacticalPhase(redeploySave), null);
  assert.equal(tactical.advanceTacticalPhase(redeploySave), null);
  const muskets = battle.defenderGroups.find(group => group.kind === 'militia-musket');
  assert.ok(muskets);
  assert.equal(tactical.setDefenderFormationLine(redeploySave, muskets.id, 'front'), null);
  assert.equal(muskets.line, 'middle');
  assert.equal(muskets.pendingLine, 'front');
  assert.equal(muskets.command, 'redeploy');
  assert.equal(saveLoad.saveGame(redeploySave), true);
  const loaded = saveLoad.loadGame();
  const loadedMuskets = loaded?.tacticalBattle?.defenderGroups.find(group => group.id === muskets.id);
  assert.equal(loadedMuskets?.line, 'middle');
  assert.equal(loadedMuskets?.pendingLine, 'front');
  assert.equal(loadedMuskets?.command, 'redeploy');
  assert.equal(tactical.resolveTacticalRound(loaded), null);
  assert.equal(loadedMuskets.line, 'middle');
  assert.equal(tactical.completeTacticalSimulation(loaded), null);
  assert.equal(loaded.tacticalBattle.pendingReport.ended, false);
  assert.equal(tactical.acknowledgeTacticalReport(loaded), null);
  assert.equal(loadedMuskets.line, 'front', 'saved redeployment continues after load and report acknowledgement');
  assert.equal(loadedMuskets.pendingLine, undefined);
}

{
  const invalidPendingLine = simulation.newGame(2026071462);
  prepareFormationTestCombatants(invalidPendingLine);
  const battle = tactical.createTacticalBattle(invalidPendingLine, {
    factionName: 'invalid pending line recovery', power: 40, warned: true, siege: false, mode: 'garrison',
  });
  const spear = battle.defenderGroups.find(group => group.kind === 'militia-spear');
  assert.ok(spear);
  spear.command = 'redeploy';
  spear.commandSource = 'player';
  spear.pendingLine = 'rear';
  assert.equal(saveLoad.saveGame(invalidPendingLine), true);
  const loaded = saveLoad.loadGame();
  const loadedSpear = loaded?.tacticalBattle?.defenderGroups.find(group => group.id === spear.id);
  assert.equal(loadedSpear?.line, 'front');
  assert.equal(loadedSpear?.pendingLine, undefined, 'non-adjacent pendingLine is cleared field-by-field');
  assert.equal(loadedSpear?.command, null, 'redeploy without a valid target is cleared safely');
}

{
  const rearReserveSave = simulation.newGame(2026071465);
  prepareFormationTestCombatants(rearReserveSave);
  const battle = tactical.createTacticalBattle(rearReserveSave, {
    factionName: 'rear reserve save', power: 40, warned: true, siege: false, mode: 'garrison',
  });
  assert.equal(tactical.advanceTacticalPhase(rearReserveSave), null);
  assert.equal(tactical.advanceTacticalPhase(rearReserveSave), null);
  const spear = battle.defenderGroups.find(group => group.kind === 'militia-spear');
  const flanker = battle.raiderGroups.find(group => group.kind === 'flankers');
  assert.ok(spear && flanker);
  spear.line = 'middle';
  spear.zoneId = 'wall';
  flanker.zoneId = 'wall';
  flanker.rearAssault = true;
  assert.equal(tactical.setTacticalCommand(rearReserveSave, spear.id, 'reinforceRear'), null);
  assert.equal(saveLoad.saveGame(rearReserveSave), true);
  const loaded = saveLoad.loadGame();
  const loadedSpear = loaded?.tacticalBattle?.defenderGroups.find(group => group.id === spear.id);
  assert.equal(loadedSpear?.command, 'reinforceRear');
  assert.equal(loadedSpear?.commandSource, 'player');
}

{
  const invalidLines = simulation.newGame(2026071459);
  prepareFormationTestCombatants(invalidLines);
  const battle = tactical.createTacticalBattle(invalidLines, {
    factionName: 'invalid formation recovery', power: 40, warned: true, siege: false, mode: 'garrison',
  });
  for (const group of battle.defenderGroups) group.line = 'sideways';
  assert.equal(saveLoad.saveGame(invalidLines), true);
  const loaded = saveLoad.loadGame();
  assert.ok(loaded?.tacticalBattle, 'invalid lines repair only the affected fields');
  assert.equal(loaded.tacticalBattle.defenderGroups.find(group => group.kind === 'militia-musket')?.line, 'middle');
  assert.ok(loaded.tacticalBattle.defenderGroups
    .filter(group => ['militia-spear', 'militia-unarmed', 'watchman'].includes(group.kind))
    .every(group => group.line === 'front'));
  assert.ok(loaded.tacticalBattle.defenderGroups
    .filter(group => ['militia-bow', 'hunter', 'civilian'].includes(group.kind))
    .every(group => group.line === 'rear'));
}

function simulatingState(seed) {
  const state = simulation.newGame(seed);
  const battle = tactical.createTacticalBattle(state, {
    factionName: 'pending report validation', power: 30, warned: true, siege: false, mode: 'garrison',
  });
  assert.equal(tactical.advanceTacticalPhase(state), null);
  assert.equal(tactical.advanceTacticalPhase(state), null);
  assert.equal(tactical.resolveTacticalRound(state), null);
  assert.equal(battle.phase, 'simulating');
  assert.ok(battle.pendingReport);
  return { state, battle };
}

{
  const { state, battle } = simulatingState(2026071450);
  battle.pendingReport = null;
  assert.equal(saveLoad.saveGame(state), true);
  const loaded = saveLoad.loadGame();
  assert.ok(loaded, 'missing pendingReport only cancels the tactical battle');
  assert.equal(loaded.tacticalBattle, null);
  assert.ok(loaded.log.some(entry => entry.text.includes('전술전 데이터가 손상')));
}

for (const [field, seed] of [['events', 2026071451], ['lines', 2026071452]]) {
  const { state, battle } = simulatingState(seed);
  delete battle.pendingReport[field];
  assert.equal(saveLoad.saveGame(state), true);
  const loaded = saveLoad.loadGame();
  assert.ok(loaded, `missing pendingReport.${field} only cancels the tactical battle`);
  assert.equal(loaded.tacticalBattle, null);
}

{
  const { state, battle } = simulatingState(2026071453);
  battle.pendingReport.events[0].zoneId = 'missing-zone';
  assert.equal(saveLoad.saveGame(state), true);
  const loaded = saveLoad.loadGame();
  assert.ok(loaded, 'an event referencing an unknown zone only cancels the tactical battle');
  assert.equal(loaded.tacticalBattle, null);
}

{
  const state = simulation.newGame(2026071454);
  const battle = tactical.createTacticalBattle(state, {
    factionName: 'prep action validation', power: 30, warned: true, siege: false, mode: 'garrison',
  });
  const valid = battle.prepActions.find(action => action.id === 'preliminaryBombardment');
  assert.ok(valid);
  battle.prepActions = [
    { ...valid },
    { id: 'not-an-action', label: 'bad id', cost: 1, selected: false, applied: false },
    { id: 'repairWall', label: 'bad cost', cost: -1, selected: false, applied: false },
    { id: 'hideSupplies', label: 'bad selected', cost: 1, selected: 'yes', applied: false },
    { id: 'musterMilitia', label: 'bad applied', cost: 1, selected: false, applied: 'yes' },
  ];
  assert.equal(saveLoad.saveGame(state), true);
  const loaded = saveLoad.loadGame();
  assert.deepEqual(loaded?.tacticalBattle?.prepActions.map(action => action.id), ['preliminaryBombardment']);
}

{
  const legacy = simulation.newGame(2026071331);
  const battle = tactical.createTacticalBattle(legacy, {
    factionName: '변경 마적', power: 70, warned: true, siege: false, mode: 'garrison',
  });
  delete battle.enemyPlan;
  for (const group of battle.defenderGroups) delete group.line;
  for (const group of battle.raiderGroups) {
    delete group.engagementsInZone;
    delete group.flankPlan;
    delete group.flankPlanRevealed;
    delete group.rearAssault;
  }
  assert.equal(saveLoad.saveGame(legacy), true);
  const loaded = saveLoad.loadGame();
  assert.ok(loaded?.tacticalBattle);
  assert.ok(loaded.tacticalBattle.initialFriendlyPower > 0);
  assert.ok(loaded.tacticalBattle.initialEnemyPower > 0);
  assert.ok(loaded.tacticalBattle.defenderGroups
    .every(group => group.line === 'front' || group.line === 'middle' || group.line === 'rear'));
  assert.ok(loaded.tacticalBattle.defenderGroups
    .filter(group => group.kind === 'militia-musket')
    .every(group => group.line === 'middle'));
  assert.ok(loaded.tacticalBattle.defenderGroups
    .filter(group => ['militia-spear', 'militia-unarmed', 'watchman'].includes(group.kind))
    .every(group => group.line === 'front'));
  assert.ok(loaded.tacticalBattle.raiderGroups.every(group => group.engagementsInZone === 0));
  const flankers = loaded.tacticalBattle.raiderGroups.find(group => group.kind === 'flankers');
  assert.ok(flankers);
  assert.equal(flankers.flankPlan, 'breakthrough');
  assert.equal(flankers.flankPlanRevealed, false);
  assert.equal(flankers.rearAssault, false);
}

{
  const legacyPlan = simulation.newGame(2026071455);
  const battle = tactical.createTacticalBattle(legacyPlan, {
    factionName: 'legacy rear plan', power: 70, warned: true, siege: false, mode: 'garrison',
  });
  delete battle.enemyPlan;
  const flankers = battle.raiderGroups.find(group => group.kind === 'flankers');
  assert.ok(flankers);
  flankers.flankPlan = 'rearAssault';
  flankers.flankPlanRevealed = true;
  assert.equal(saveLoad.saveGame(legacyPlan), true);
  const loaded = saveLoad.loadGame();
  assert.deepEqual(loaded?.tacticalBattle?.enemyPlan, {
    objective: 'breakthrough',
    objectiveRevealed: true,
    stratagemPoints: 0,
    stratagems: [{ id: 'rearManeuver', revealed: true, counterLevel: 0 }],
  }, 'legacy flank fields synthesize the equivalent enemy plan');
}

{
  const malformedPlan = simulation.newGame(2026071456);
  const battle = tactical.createTacticalBattle(malformedPlan, {
    factionName: 'malformed plan', power: 70, warned: false, siege: false, mode: 'garrison',
  });
  battle.enemyPlan = {
    objective: 'invalid', objectiveRevealed: 'yes', stratagemPoints: 'many',
    stratagems: [
      { id: 'rearManeuver', revealed: 'yes', counterLevel: 7 },
      { id: 'unknown', revealed: true, counterLevel: 2 },
    ],
  };
  assert.equal(saveLoad.saveGame(malformedPlan), true);
  const loaded = saveLoad.loadGame();
  assert.ok(loaded?.tacticalBattle, 'a malformed enemy plan never discards the tactical battle');
  assert.deepEqual(loaded.tacticalBattle.enemyPlan, {
    objective: 'breakthrough',
    objectiveRevealed: false,
    stratagemPoints: 0,
    stratagems: [{ id: 'rearManeuver', revealed: false, counterLevel: 0 }],
  });
}

{
  const partial = simulation.newGame(2026071441);
  const battle = tactical.createTacticalBattle(partial, {
    factionName: 'migration test', power: 40, warned: true, siege: false, mode: 'garrison',
  });
  delete battle.prepActions;
  delete battle.preparationEvents;
  delete battle.reports;
  assert.equal(saveLoad.saveGame(partial), true);
  const loaded = saveLoad.loadGame();
  assert.ok(loaded?.tacticalBattle, 'missing optional tactical arrays are reconstructed');
  assert.ok(Array.isArray(loaded.tacticalBattle.prepActions));
  assert.ok(Array.isArray(loaded.tacticalBattle.preparationEvents));
  assert.ok(Array.isArray(loaded.tacticalBattle.reports));
}

{
  const corrupted = simulation.newGame(2026071442);
  const members = corrupted.residents.slice(0, 2);
  members.forEach(resident => { resident.job = 'militia'; resident.sick = false; resident.health = 100; });
  corrupted.expedition = {
    kind: 'lairAssault', targetX: 0, targetY: 0, musterX: members[0].x, musterY: members[0].y,
    phase: 'engage', memberIds: members.map(member => member.id), x: 0, y: 0, px: 0, py: 0,
    path: [], trail: [], speed: 1, ticks: 0,
  };
  corrupted.tacticalBattle = { phase: 'command', zones: 'broken', defenderGroups: [], raiderGroups: [] };
  corrupted.tacticalBattleReport = { broken: true };
  assert.equal(saveLoad.saveGame(corrupted), true);
  const loaded = saveLoad.loadGame();
  assert.ok(loaded, 'a broken tactical battle must not discard the whole save');
  assert.equal(loaded.tacticalBattle, null);
  assert.equal(loaded.tacticalBattleReport, null);
  assert.ok(loaded.expedition == null || loaded.expedition.phase === 'return');
  assert.ok(loaded.log.some(entry => entry.text.includes('전술전 데이터가 손상')));
}

{
  const legacyReport = simulation.newGame(2026071443);
  legacyReport.tacticalBattleReport = {
    battleId: 77,
    outcome: 'partialLoss',
    factionName: '변경 마적',
    outcomeLabel: '마을을 지켰으나 일부 피해를 입었습니다',
  };
  assert.equal(saveLoad.saveGame(legacyReport), true);
  const loaded = saveLoad.loadGame();
  assert.equal(loaded?.tacticalBattleReport?.result, 'victory');
  assert.ok(['greatVictory', 'victory', 'narrowVictory'].includes(loaded?.tacticalBattleReport?.grade));
  assert.ok(Number.isFinite(loaded?.tacticalBattleReport?.gradeScore));
  assert.equal(loaded?.tacticalBattleReport?.closingSummary, '습격대가 약탈을 포기하고 물러납니다.');
  assert.deepEqual(loaded?.tacticalBattleReport?.recoveredLoot, {});
}

console.log('resource save migration tests passed');
