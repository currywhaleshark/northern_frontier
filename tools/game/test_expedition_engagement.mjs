import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-expedition-engagement-tests-'));
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
const expedition = await import(pathToFileURL(join(compiledDir, 'expedition.mjs')).href);
const engagement = await import(pathToFileURL(join(compiledDir, 'expeditionEngagement.mjs')).href);
const saveLoad = await import(pathToFileURL(join(compiledDir, 'saveLoad.mjs')).href);
const weapons = await import(pathToFileURL(join(compiledDir, 'weapons.mjs')).href);

function prepareState(seed) {
  const state = simulation.newGame(seed);
  for (const resident of state.residents) {
    resident.job = 'idle';
    resident.sick = false;
    resident.health = 100;
    resident.quarantinedUntil = 0;
  }
  const members = state.residents.slice(0, 2);
  const outsider = state.residents[2];
  members[0].job = 'militia';
  members[1].job = 'militia';
  outsider.job = 'militia';
  state.resources.muskets = 3;
  state.resources.gunpowder = 10;
  weapons.clearWeaponAssignments(state);
  assert.equal(weapons.setResidentWeapon(state, members[0].id, 'musket'), null);
  assert.equal(weapons.setResidentWeapon(state, members[1].id, 'musket'), null);
  assert.equal(weapons.setResidentWeapon(state, outsider.id, 'musket'), null);
  return { state, members, outsider };
}

function expeditionTargets(state) {
  const center = state.buildings.find(building => building.type === 'center' && building.built);
  assert.ok(center);
  return state.map.flat()
    .filter(tile => agents.isTerrainPassable(state, tile.x, tile.y) &&
      Math.abs(tile.x - center.x) + Math.abs(tile.y - center.y) >= 6)
    .sort((a, b) =>
      Math.abs(a.x - center.x) + Math.abs(a.y - center.y) -
      (Math.abs(b.x - center.x) + Math.abs(b.y - center.y)));
}

function createReachableExpedition(state, input) {
  for (const target of expeditionTargets(state)) {
    const error = expedition.createExpedition(state, { ...input, targetX: target.x, targetY: target.y });
    if (error == null) return target;
    assert.equal(state.expedition, null);
  }
  assert.fail('no reachable expedition target found');
}

function reachEngagement(state, limit = 300) {
  for (let i = 0; i < limit && state.expedition?.phase !== 'engage'; i++) expedition.expeditionTick(state);
  assert.equal(state.expedition?.phase, 'engage');
  assert.ok(state.expedition.trail.length > 0, 'march leaves a trail');
}

{
  const { state, members, outsider } = prepareState(2026071381);
  const lair = state.foreignSites.find(site => site.type === 'banditLair');
  assert.ok(lair);
  lair.discovered = true;
  lair.status = 'active';
  lair.militaryPower = 35;
  createReachableExpedition(state, {
    kind: 'lairAssault',
    targetSiteId: lair.id,
    memberIds: members.map(member => member.id),
  });
  reachEngagement(state);
  simulation.advanceTick(state);
  assert.equal(state.pendingChoice?.kind, 'expedition');
  assert.deepEqual(state.pendingChoice.options.map(option => option.id), ['auto', 'direct', 'withdraw']);
  assert.equal(state.pendingChoice.options.find(option => option.id === 'direct')?.disabled, false);

  const powderBefore = state.resources.gunpowder;
  const outsiderHealth = outsider.health;
  engagement.resolveExpeditionEngagementChoice(state, 'auto', () => 0);
  assert.equal(state.pendingChoice, null);
  assert.equal(state.expedition?.phase, 'return');
  assert.equal(lair.status, 'burned');
  assert.deepEqual(state.expedition?.carriedLoot, { grain: 8, hide: 6, tools: 2 });
  assert.ok(Math.abs(state.resources.gunpowder - (powderBefore - 0.8)) < 1e-9);
  assert.equal(outsider.health, outsiderHealth);
  assert.ok(state.battleScars?.some(scar => scar.x === state.expedition?.targetX && scar.y === state.expedition?.targetY));
}

{
  const { state, members } = prepareState(2026071382);
  const lair = state.foreignSites.find(site => site.type === 'banditLair');
  assert.ok(lair);
  lair.discovered = true;
  lair.status = 'active';
  lair.alarm = 20;
  createReachableExpedition(state, {
    kind: 'lairAssault',
    targetSiteId: lair.id,
    memberIds: members.map(member => member.id),
  });
  reachEngagement(state);
  engagement.maybeOpenExpeditionEngagementChoice(state);
  engagement.resolveExpeditionEngagementChoice(state, 'withdraw', () => 0.5);
  assert.equal(lair.status, 'active');
  assert.equal(lair.alarm, 30);
  assert.equal(state.expedition?.phase, 'return');
  assert.equal(state.battleScars?.length, 0, 'withdrawal does not create a battle scar');
}

{
  const { state, members } = prepareState(2026071383);
  state.incidents.predatorThreats.wolf = { kind: 'wolf', untilDay: state.day + 10 };
  createReachableExpedition(state, {
    kind: 'predatorHunt',
    predatorKind: 'wolf',
    memberIds: members.map(member => member.id),
  });
  reachEngagement(state);
  engagement.maybeOpenExpeditionEngagementChoice(state);
  assert.equal(state.pendingChoice?.options.find(option => option.id === 'direct')?.disabled, false);
  engagement.resolveExpeditionEngagementChoice(state, 'auto', () => 0);
  assert.equal(state.incidents.predatorThreats.wolf, undefined);
  assert.equal(state.expedition?.phase, 'return');
  assert.ok((state.expedition?.carriedLoot?.meat ?? 0) > 0);

  assert.equal(saveLoad.saveGame(state), true);
  const loaded = saveLoad.loadGame();
  assert.ok(loaded?.expedition);
  assert.ok(Array.isArray(loaded.expedition.trail));
  delete state.expedition.trail;
  assert.equal(saveLoad.saveGame(state), true);
  const legacyLoaded = saveLoad.loadGame();
  assert.deepEqual(legacyLoaded?.expedition?.trail, [], 'legacy active expedition receives an empty trail');
}

console.log('expedition engagement tests passed');
