import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function transpile(source) {
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return output.replace(/(from\s+['"])(\.{1,2}\/[^'"]+)(['"])/g, (_match, start, spec, end) => {
    if (/\.[cm]?js$/.test(spec)) return `${start}${spec}${end}`;
    return `${start}${spec}.mjs${end}`;
  });
}

const rootDir = mkdtempSync(join(tmpdir(), 'northern-building-work-'));
const gameDir = join(rootDir, 'game');
mkdirSync(gameDir, { recursive: true });
for (const file of readdirSync(new URL('../../src/game/', import.meta.url)).filter(file => file.endsWith('.ts'))) {
  const source = readFileSync(new URL(`../../src/game/${file}`, import.meta.url), 'utf8');
  writeFileSync(join(gameDir, file.replace(/\.ts$/, '.mjs')), transpile(source), 'utf8');
}

const simulation = await import(pathToFileURL(join(gameDir, 'simulation.mjs')).href);
const agents = await import(pathToFileURL(join(gameDir, 'agents.mjs')).href);
const buildings = await import(pathToFileURL(join(gameDir, 'buildings.mjs')).href);
const exploration = await import(pathToFileURL(join(gameDir, 'exploration.mjs')).href);
const dayCycle = await import(pathToFileURL(join(gameDir, 'dayCycle.mjs')).href);
const saveLoad = await import(pathToFileURL(join(gameDir, 'saveLoad.mjs')).href);

function findClearExploredRect(state, width, height) {
  for (let y = 0; y <= state.map.length - height; y++) {
    for (let x = 0; x <= state.map[y].length - width; x++) {
      let clear = true;
      for (let dy = 0; dy < height && clear; dy++) {
        for (let dx = 0; dx < width; dx++) {
          const tile = state.map[y + dy][x + dx];
          if (tile.buildingId != null || !exploration.isExplored(state, x + dx, y + dy)) {
            clear = false;
            break;
          }
        }
      }
      if (clear) return { x, y };
    }
  }
  throw new Error(`No clear explored ${width}x${height} rectangle`);
}

function prepareBuilders(state, x, y) {
  state.subTick = dayCycle.DAY_BANDS.work.start + 1;
  for (const resident of state.residents) {
    resident.job = 'builder';
    resident.x = x;
    resident.y = y;
    resident.px = x;
    resident.py = y;
    resident.path = [];
    resident.alive = true;
    resident.sick = false;
    resident.health = 100;
    resident.quarantinedUntil = 0;
    agents.resetAgent(state, resident);
  }
}

function runBuildersUntil(state, predicate, limit = 1200) {
  for (let tick = 0; tick < limit; tick++) {
    agents.agentsTick(state);
    if (predicate()) return;
  }
  throw new Error('Builders did not finish within the test limit');
}

const state = simulation.newGame(97531);
state.foreignSites = [];
for (const resource of Object.keys(state.resources)) state.resources[resource] = 1000;
const huts = state.buildings.filter(building => building.type === 'hut');
assert.ok(huts.length >= 2);

const movingHut = huts[0];
const destination = findClearExploredRect(state, 2, 2);
for (let y = destination.y; y < destination.y + 2; y++) {
  for (let x = destination.x; x < destination.x + 2; x++) state.map[y][x].terrain = 'plain';
}
const woodBeforeMove = state.resources.wood;
assert.equal(simulation.startBuildingRelocation(state, movingHut.id, destination.x, destination.y), null);
assert.equal(movingHut.built, false);
assert.equal(movingHut.workOrder.kind, 'relocate');
assert.equal(state.resources.wood, woodBeforeMove, 'relocation starts without material cost');
assert.equal(buildings.canPlaceBuildingAt(state, 'hut', destination.x, destination.y), false,
  'relocation destination is reserved immediately');
assert.equal(simulation.togglePriorityBuilding(state, movingHut.id), null);
assert.equal(state.priorityBuildingId, movingHut.id);
const savedDuringMove = saveLoad.migrateToCurrent(JSON.parse(JSON.stringify(state)));
const savedMovingHut = savedDuringMove.buildings.find(building => building.id === movingHut.id);
assert.equal(savedMovingHut.workOrder.kind, 'relocate');
assert.equal(savedDuringMove.priorityBuildingId, movingHut.id);

prepareBuilders(state, movingHut.x, movingHut.y);
runBuildersUntil(state, () => movingHut.built && movingHut.workOrder == null);
assert.deepEqual({ x: movingHut.x, y: movingHut.y }, destination);
assert.equal(state.priorityBuildingId, null, 'priority clears when relocation finishes');
assert.equal(state.resources.wood, woodBeforeMove, 'relocation completion charges no material');

const demolishedHut = huts[1];
const woodBeforeDemolition = state.resources.wood;
assert.equal(simulation.startBuildingDemolition(state, demolishedHut.id), null);
assert.equal(simulation.togglePriorityBuilding(state, demolishedHut.id), null);
prepareBuilders(state, demolishedHut.x, demolishedHut.y);
runBuildersUntil(state, () => !state.buildings.some(building => building.id === demolishedHut.id));
assert.ok(state.resources.wood > woodBeforeDemolition, 'demolition refunds part of the construction materials');
assert.equal(state.priorityBuildingId, null, 'priority clears when demolition removes the building');

const nearSite = findClearExploredRect(state, 2, 2);
for (let y = nearSite.y; y < nearSite.y + 2; y++) {
  for (let x = nearSite.x; x < nearSite.x + 2; x++) state.map[y][x].terrain = 'plain';
}
assert.equal(simulation.tryPlaceBuilding(state, 'hut', nearSite.x, nearSite.y), null);
const nearConstruction = state.buildings.at(-1);
const prioritySite = findClearExploredRect(state, 2, 2);
for (let y = prioritySite.y; y < prioritySite.y + 2; y++) {
  for (let x = prioritySite.x; x < prioritySite.x + 2; x++) state.map[y][x].terrain = 'plain';
}
assert.equal(simulation.tryPlaceBuilding(state, 'hut', prioritySite.x, prioritySite.y), null);
const priorityConstruction = state.buildings.at(-1);
assert.equal(simulation.togglePriorityBuilding(state, priorityConstruction.id), null);
prepareBuilders(state, nearConstruction.x, nearConstruction.y);
runBuildersUntil(state, () => priorityConstruction.progress > 0);
assert.equal(nearConstruction.progress, 0,
  'builders ignore a nearer ordinary site while a priority construction site exists');

console.log('building work order tests passed');
