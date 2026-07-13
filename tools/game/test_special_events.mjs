import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-special-event-tests-'));
  for (const file of readdirSync(srcDir).filter(file => file.endsWith('.ts'))) {
    const source = readFileSync(new URL(file, srcDir), 'utf8');
    let output = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    output = output.replace(/(from\s+['"])(\.{1,2}\/[^'"]+)(['"])/g, (_match, start, spec, end) => {
      if (/\.[cm]?js$/.test(spec)) return `${start}${spec}${end}`;
      return `${start}${spec}.mjs${end}`;
    });
    writeFileSync(join(outDir, file.replace(/\.ts$/, '.mjs')), output, 'utf8');
  }
  return outDir;
}

function sequenceRng(values, fallback = 0.5) {
  let index = 0;
  return () => values[index++] ?? fallback;
}

const compiledDir = compileGameModules();
const simulation = await import(pathToFileURL(join(compiledDir, 'simulation.mjs')).href);
const specialEvents = await import(pathToFileURL(join(compiledDir, 'specialEvents.mjs')).href);
const events = await import(pathToFileURL(join(compiledDir, 'events.mjs')).href);
const tribute = await import(pathToFileURL(join(compiledDir, 'courtTribute.mjs')).href);

{
  for (let seed = 1; seed <= 30; seed++) {
    assert.equal(specialEvents.createIncidentState(seed, 1).scheduledDays.length, 1);
    assert.ok([1, 2].includes(specialEvents.createIncidentState(seed, 2).scheduledDays.length));
  }
  assert.ok(Array.from({ length: 30 }, (_, i) => specialEvents.createIncidentState(i + 1, 2))
    .some(state => state.scheduledDays.length === 2));
}

{
  const state = simulation.newGame(1101);
  state.incidents.scheduledDays = [state.day];
  state.incidents.cooldownUntil = { tiger: 999, wildGinseng: 999 };
  assert.equal(specialEvents.maybeOpenSpecialEvent(state, () => 0), true);
  assert.equal(state.pendingChoice?.data.eventId, 'wolf');
  specialEvents.resolveSpecialEvent(state, 'prepare', () => 0);
  assert.ok(state.incidents.predatorThreats.wolf);

  for (const resident of state.residents.slice(0, 4)) resident.job = 'hunter';
  state.resources.hornBows = 4;
  assert.equal(specialEvents.openPredatorHunt(state, 'wolf'), null);
  specialEvents.resolveSpecialEvent(state, 'hunt', () => 0);
  assert.equal(state.incidents.predatorThreats.wolf, undefined);
  assert.ok(state.resources.meat >= 10);
  assert.ok(state.resources.hide >= 10);
}

{
  const state = simulation.newGame(2202);
  state.incidents.scheduledDays = [state.day + 20];
  state.incidents.predatorThreats.wolf = { kind: 'wolf', untilDay: state.day + 5 };
  const victim = state.residents[0];
  state.map[victim.y][victim.x].terrain = 'forest';
  const before = victim.health;
  specialEvents.updateSpecialEvents(state, sequenceRng([0, 0, 1, 0], 1));
  assert.ok(victim.health < before);
  assert.ok(victim.alive);
}

{
  const state = simulation.newGame(2252);
  state.incidents.scheduledDays = [state.day];
  state.incidents.cooldownUntil = { wolf: 999, wildGinseng: 999 };
  assert.equal(specialEvents.maybeOpenSpecialEvent(state, () => 0), true);
  assert.equal(state.pendingChoice?.data.eventId, 'tiger');
  specialEvents.resolveSpecialEvent(state, 'hunt-now', () => 0);
  assert.ok(state.incidents.predatorThreats.tiger, 'initial tiger hunt now prepares an expedition threat');
  assert.equal(state.specialItems.tigerPelt, 0, 'initial choice no longer resolves combat immediately');
  assert.ok(!state.discoveredSpecialItems.includes('tigerPelt'));
}

{
  const state = simulation.newGame(3303);
  state.incidents.scheduledDays = [state.day];
  state.incidents.cooldownUntil = { wolf: 999, tiger: 999 };
  assert.equal(specialEvents.maybeOpenSpecialEvent(state, () => 0), true);
  assert.equal(state.pendingChoice?.data.eventId, 'wildGinseng');
  specialEvents.resolveSpecialEvent(state, 'keep', () => 0);
  assert.equal(state.specialItems.wildGinseng, 1);
  assert.ok(state.discoveredSpecialItems.includes('wildGinseng'));

  state.buildings.push({ id: state.nextBuildingId++, type: 'market', x: 0, y: 0, built: true, progress: 1, fieldGrowth: 0 });
  assert.equal(events.requestTrade(state, '오도리 씨족'), null);
  assert.equal(events.negotiateTrade(state, 'grain', 5, 'wildGinseng'), null);
  const grainBefore = state.resources.grain;
  events.resolveTrade(state, 'confirm');
  assert.equal(state.specialItems.wildGinseng, 0);
  assert.equal(state.resources.grain, grainBefore + 5);
}

{
  const state = simulation.newGame(4404);
  state.tributeWaivers = 1;
  state.day = 37;
  assert.ok(state.courtTribute && !state.courtTribute.resolved);
  tribute.maybeCollectTribute(state);
  assert.equal(state.tributeWaivers, 0);
  assert.equal(state.courtTribute.resolved, true);
  assert.equal(state.courtTribute.paid, true);
}

{
  const state = simulation.newGame(4454);
  state.incidents.scheduledDays = [state.day];
  state.incidents.cooldownUntil = { wolf: 999, tiger: 999 };
  specialEvents.maybeOpenSpecialEvent(state, () => 0);
  specialEvents.resolveSpecialEvent(state, 'present', () => 0);
  assert.equal(state.tributeWaivers, 1);
  assert.ok(state.resources.tools >= 14);
}

{
  const state = simulation.newGame(5505);
  delete state.incidents;
  delete state.specialItems;
  delete state.discoveredSpecialItems;
  delete state.tributeWaivers;
  specialEvents.ensureIncidentState(state);
  assert.ok(state.incidents.scheduledDays.length >= 1);
  assert.deepEqual(state.specialItems, { wildGinseng: 0, tigerPelt: 0, gyrfalcon: 0 });
  assert.deepEqual(state.discoveredSpecialItems, []);
  assert.equal(state.tributeWaivers, 0);
}

function onlyEvent(state, eventId) {
  const ids = ['wolf', 'tiger', 'boar', 'wildGinseng', 'plagueSuspicion', 'grainRequisition', 'shipwreck', 'earlyFrost', 'gyrfalcon'];
  state.incidents.cooldownUntil = Object.fromEntries(ids.filter(id => id !== eventId).map(id => [id, 9999]));
  state.incidents.scheduledDays = [state.day];
}

{
  const state = simulation.newGame(6606);
  state.buildings.push({
    id: state.nextBuildingId++, type: 'field', x: 1, y: 1, built: true, progress: 1,
    fieldGrowth: 100, cropId: 'millet', inventory: {},
  });
  onlyEvent(state, 'boar');
  assert.equal(specialEvents.maybeOpenSpecialEvent(state, () => 0), true);
  assert.equal(state.pendingChoice?.data.eventId, 'boar');
  assert.equal(state.buildings.at(-1).fieldGrowth, 88);
  const wood = state.resources.wood;
  const tools = state.resources.tools;
  specialEvents.resolveSpecialEvent(state, 'trap', () => 0);
  assert.equal(state.resources.wood, wood - 8);
  assert.equal(state.resources.tools, tools - 1);
  assert.ok(state.resources.meat >= 7);
}

{
  const state = simulation.newGame(7707);
  state.buildings.push({
    id: state.nextBuildingId++, type: 'field', x: 1, y: 1, built: true, progress: 1,
    fieldGrowth: 100, cropId: 'millet', inventory: {},
  });
  onlyEvent(state, 'boar');
  specialEvents.maybeOpenSpecialEvent(state, () => 0);
  specialEvents.resolveSpecialEvent(state, 'leave', () => 0);
  const growth = state.buildings.at(-1).fieldGrowth;
  const grain = state.resources.grain;
  specialEvents.updateSpecialEvents(state, () => 0);
  assert.ok(state.buildings.at(-1).fieldGrowth < growth);
  assert.ok(state.resources.grain < grain);
}

{
  const state = simulation.newGame(8808);
  onlyEvent(state, 'plagueSuspicion');
  assert.equal(specialEvents.maybeOpenSpecialEvent(state, sequenceRng([0, 0, 0])), true);
  const patientId = state.pendingChoice.data.residentId;
  specialEvents.resolveSpecialEvent(state, 'observe', () => 0);
  state.day = state.incidents.plagueCase.resolvesOnDay;
  specialEvents.updateSpecialEvents(state, () => 0);
  assert.equal(state.pendingChoice?.data.eventId, 'plagueOutbreak');
  specialEvents.resolveSpecialEvent(state, 'isolate-all', () => 0);
  assert.equal(state.incidents.epidemic.mode, 'isolated');
  assert.ok(state.residents.find(resident => resident.id === patientId).quarantinedUntil > state.day);
}

{
  const state = simulation.newGame(9909);
  onlyEvent(state, 'grainRequisition');
  state.resources.grain = 200;
  state.threat = 60;
  specialEvents.maybeOpenSpecialEvent(state, () => 0);
  const amount = state.pendingChoice.data.amount;
  specialEvents.resolveSpecialEvent(state, 'give-full', () => 0);
  assert.equal(state.resources.grain, 200 - amount);
  assert.equal(state.threat, 32);
}

{
  const state = simulation.newGame(10110);
  onlyEvent(state, 'shipwreck');
  specialEvents.maybeOpenSpecialEvent(state, () => 0);
  const iron = state.resources.iron;
  const reputation = state.resources.reputation;
  specialEvents.resolveSpecialEvent(state, 'salvage-cargo', () => 0);
  assert.equal(state.resources.iron, iron + 4);
  assert.equal(state.resources.reputation, reputation - 4);
}

{
  const state = simulation.newGame(11111);
  state.day = 15;
  state.incidents.year = 1;
  state.buildings.push({
    id: state.nextBuildingId++, type: 'field', x: 1, y: 1, built: true, progress: 1,
    fieldGrowth: 80, cropId: 'millet', inventory: {},
  });
  onlyEvent(state, 'earlyFrost');
  specialEvents.maybeOpenSpecialEvent(state, () => 0);
  specialEvents.resolveSpecialEvent(state, 'harvest-early', () => 0);
  assert.equal(state.buildings.at(-1).fieldGrowth, 0);
  assert.ok(state.buildings.at(-1).inventory.grain > 0);
}

{
  const state = simulation.newGame(12112);
  onlyEvent(state, 'gyrfalcon');
  specialEvents.maybeOpenSpecialEvent(state, () => 0);
  specialEvents.resolveSpecialEvent(state, 'keep', () => 0);
  assert.equal(state.specialItems.gyrfalcon, 1);
  assert.ok(state.discoveredSpecialItems.includes('gyrfalcon'));
}

console.log('special event tests passed');
