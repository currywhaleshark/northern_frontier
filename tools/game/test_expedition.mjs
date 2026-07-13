import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-expedition-tests-'));
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

const store = new Map();
globalThis.localStorage = {
  getItem: key => store.get(key) ?? null,
  setItem: (key, value) => store.set(key, value),
  removeItem: key => store.delete(key),
};

const compiledDir = compileGameModules();
const simulation = await import(pathToFileURL(join(compiledDir, 'simulation.mjs')).href);
const agents = await import(pathToFileURL(join(compiledDir, 'agents.mjs')).href);
const buildings = await import(pathToFileURL(join(compiledDir, 'buildings.mjs')).href);
const expedition = await import(pathToFileURL(join(compiledDir, 'expedition.mjs')).href);
const raids = await import(pathToFileURL(join(compiledDir, 'raids.mjs')).href);
const residents = await import(pathToFileURL(join(compiledDir, 'residents.mjs')).href);
const saveLoad = await import(pathToFileURL(join(compiledDir, 'saveLoad.mjs')).href);
const weapons = await import(pathToFileURL(join(compiledDir, 'weapons.mjs')).href);

function expeditionTargets(state) {
  const center = state.buildings.find(building => building.type === 'center' && building.built);
  assert.ok(center);
  const candidates = state.map.flat().filter(tile =>
    agents.isTerrainPassable(state, tile.x, tile.y) &&
    Math.abs(tile.x - center.x) + Math.abs(tile.y - center.y) >= 5);
  candidates.sort((a, b) =>
    Math.abs(a.x - center.x) + Math.abs(a.y - center.y) -
    (Math.abs(b.x - center.x) + Math.abs(b.y - center.y)));
  return candidates;
}

function createReachableExpedition(state, input) {
  for (const target of expeditionTargets(state)) {
    const error = expedition.createExpedition(state, { ...input, targetX: target.x, targetY: target.y });
    if (error == null) return target;
    assert.equal(state.expedition, null);
  }
  assert.fail('no reachable expedition target found');
}

function prepareState(seed, speed = 1.25) {
  const state = simulation.newGame(seed);
  for (const resident of state.residents) {
    resident.job = 'idle';
    resident.sick = false;
    resident.health = 100;
  }
  const members = state.residents.slice(0, 3);
  members[0].job = 'militia';
  members[1].job = 'watchman';
  members[2].job = 'hunter';
  state.residents[3].job = 'farmer';
  state.resources.muskets = 1;
  state.resources.hornBows = 1;
  state.resources.spears = 1;
  state.resources.gunpowder = 5;
  weapons.setAutomaticWeaponAllocation(state);
  const target = createReachableExpedition(state, {
    kind: 'predatorHunt',
    predatorKind: 'wolf',
    memberIds: members.map(member => member.id),
    speed,
  });
  return { state, members, target };
}

function tickUntil(state, predicate, limit = 300) {
  for (let i = 0; i < limit && !predicate(); i++) expedition.expeditionTick(state);
  assert.ok(predicate(), `condition not reached within ${limit} expedition ticks`);
}

function addBuiltMarket(state) {
  state.buildings.push({
    id: state.nextBuildingId++, type: 'market', x: 0, y: 0,
    progress: 999, built: true, fieldGrowth: 0,
  });
}

{
  const state = simulation.newGame(2026071351);
  for (const resident of state.residents) resident.job = 'idle';
  const members = state.residents.slice(0, 3);
  members[0].job = 'militia';
  members[1].job = 'watchman';
  members[2].job = 'hunter';
  state.resources.muskets = 1;
  state.resources.hornBows = 1;
  state.resources.spears = 1;
  state.resources.gunpowder = 5;
  weapons.setAutomaticWeaponAllocation(state);
  const fullDefense = buildings.computeDefense(state, { includeExpedition: true });
  createReachableExpedition(state, {
    kind: 'lairAssault', memberIds: members.map(member => member.id),
  });
  assert.ok(buildings.computeDefense(state) < fullDefense, 'away residents and their weapons lower village defense');
  agents.agentsTick(state);
  assert.ok(members.every(member => member.task === '토벌 집결 중'));
  members[0].health = 1;
  members[0].hunger = 0;
  members[0].warmth = 0;
  residents.updateResidentNeeds(state, () => 0.99, 0, 0, 0, 0, 0, new Set(state.expedition.memberIds));
  assert.equal(members[0].health, 1, 'expedition members do not take daily starvation or cold damage');
  assert.equal(members[0].alive, true);
  members[0].health = 100;

  tickUntil(state, () => state.expedition?.phase === 'engage');
  assert.ok(members.every(member => member.task === '토벌 교전 대기'));
  assert.equal(expedition.orderExpeditionReturn(state), null);
  tickUntil(state, () => state.expedition == null);
  assert.equal(buildings.computeDefense(state), fullDefense);
  assert.ok(members.every(member => member.task === '대기'));
}

{
  const { state } = prepareState(2026071352, 10);
  tickUntil(state, () => state.expedition?.phase === 'march');
  expedition.expeditionTick(state);
  raids.openRaidChoice(state, () => 0.5, true, 45, '변경 마적', true);
  assert.equal(state.pendingChoice?.kind, 'expeditionRaidOrder');
  simulation.resolveChoice(state, 'return');
  assert.equal(state.pendingChoice?.kind, 'raid');
  assert.ok(state.pendingChoice.options.some(option => option.id === 'fortify-wait'));
  simulation.resolveChoice(state, 'fortify-wait');
  assert.ok(state.raidHold);

  for (let i = 0; i < 8 && !state.pendingChoice; i++) {
    expedition.expeditionTick(state);
    raids.raidHoldTick(state, () => 0.5);
  }
  assert.equal(state.expedition, null, 'fast returning expedition joins before the assault deadline');
  assert.equal(state.pendingChoice?.kind, 'raid');
  assert.deepEqual(state.pendingChoice.options.map(option => option.id), ['levy', 'manual-levy']);
}

{
  const { state } = prepareState(2026071353, 0.5);
  tickUntil(state, () => state.expedition?.phase === 'march');
  raids.openRaidChoice(state, () => 0.5, false, 45, '변경 마적', false);
  simulation.resolveChoice(state, 'continue');
  assert.equal(state.expedition?.phase, 'march');
  simulation.resolveChoice(state, 'fortify-wait');
  assert.ok(state.raidHold);
  agents.agentsTick(state);
  assert.equal(state.residents[3].task, '완전 수성 중');

  for (let i = 0; i < 8 && !state.pendingChoice; i++) raids.raidHoldTick(state, () => 0.5);
  assert.ok(state.expedition, 'continuing expedition remains away when the deadline expires');
  assert.equal(state.pendingChoice?.kind, 'raid');
  assert.deepEqual(state.pendingChoice.options.map(option => option.id), ['levy', 'manual-levy']);
}

{
  const { state } = prepareState(20260713531, 0.5);
  addBuiltMarket(state);
  tickUntil(state, () => state.expedition?.phase === 'march');
  raids.openRaidChoice(state, () => 0.5, true, 45, '변경 마적', true);
  simulation.resolveChoice(state, 'continue');
  assert.ok(state.pendingChoice?.options.some(option => option.id === 'negotiate'));
  raids.resolveRaid(state, 'negotiate', () => 0);
  assert.equal(state.pendingChoice, null);
  assert.equal(state.expedition?.phase, 'march', 'successful negotiation preserves the continue order');
}

{
  const { state } = prepareState(20260713532, 0.5);
  addBuiltMarket(state);
  tickUntil(state, () => state.expedition?.phase === 'march');
  raids.openRaidChoice(state, () => 0.5, true, 45, '변경 마적', true);
  simulation.resolveChoice(state, 'return');
  assert.equal(state.expedition?.phase, 'return');
  raids.resolveRaid(state, 'negotiate', () => 0.99);
  assert.equal(state.expedition?.phase, 'return', 'failed negotiation preserves the return order');
  assert.equal(state.pendingChoice?.kind, 'raid');
  assert.deepEqual(state.pendingChoice.options.map(option => option.id), ['levy', 'manual-levy']);
}

{
  const { state } = prepareState(2026071354);
  assert.equal(saveLoad.saveGame(state), true);
  const loaded = saveLoad.loadGame();
  assert.ok(loaded?.expedition);
  assert.deepEqual(loaded.expedition.memberIds, state.expedition.memberIds);
  assert.ok(loaded.expedition.memberIds.every(id =>
    loaded.residents.find(resident => resident.id === id)?.task === '토벌 출정'));

  delete state.expedition;
  delete state.raidHold;
  assert.equal(saveLoad.saveGame(state), true);
  const legacyLoaded = saveLoad.loadGame();
  assert.equal(legacyLoaded.expedition, null);
  assert.equal(legacyLoaded.raidHold, null);
}

console.log('expedition tests passed');
