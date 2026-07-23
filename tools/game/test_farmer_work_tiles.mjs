import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-farmer-work-tiles-'));
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
const agents = await import(pathToFileURL(join(compiledDir, 'agents.mjs')).href);
const buildings = await import(pathToFileURL(join(compiledDir, 'buildings.mjs')).href);
const farmTiles = await import(pathToFileURL(join(compiledDir, 'farmWorkTiles.mjs')).href);
const simulation = await import(pathToFileURL(join(compiledDir, 'simulation.mjs')).href);
const workerSlots = await import(pathToFileURL(join(compiledDir, 'workerSlots.mjs')).href);
const { CONFIG } = await import(pathToFileURL(join(compiledDir, 'config.mjs')).href);

const plot = { type: 'field', x: 10, y: 20, w: 2, h: 2 };
assert.deepEqual(farmTiles.farmWorkTilePath(plot), [
  { x: 10, y: 20 }, { x: 11, y: 20 }, { x: 11, y: 21 }, { x: 10, y: 21 },
]);
const split = farmTiles.farmWorkTilesByResident(plot, [20, 10]);
assert.deepEqual(split.get(10), [{ x: 10, y: 20 }, { x: 11, y: 20 }]);
assert.deepEqual(split.get(20), [{ x: 11, y: 21 }, { x: 10, y: 21 }]);
assert.equal(new Set([...split.values()].flat().map(tile => `${tile.x},${tile.y}`)).size, 4,
  'two farmers cover all four cells without sharing an assigned cell');
assert.deepEqual(farmTiles.farmWorkTileForTick(plot, [10, 20], 10, 0), { x: 10, y: 20 });
assert.deepEqual(
  farmTiles.farmWorkTileForTick(plot, [10, 20], 10, farmTiles.FARM_WORK_TILE_DWELL_SUBTICKS),
  { x: 11, y: 20 },
);

const state = simulation.newGame(2026072301);
for (const row of state.map) {
  for (const tile of row) {
    tile.terrain = 'plain';
    tile.hasIron = false;
    tile.buildingId = null;
  }
}
state.buildings = [];
state.exploration = { explored: state.map.map(row => row.map(() => true)) };
state.day = 13;
state.subTick = 0;
state.weather = 'clear';
state.resources.tools = 100;

const farm = {
  id: 9100,
  type: 'field',
  x: 10,
  y: 10,
  w: 2,
  h: 2,
  built: true,
  progress: buildings.BUILDING_DEFS.field.buildDays,
  cropId: 'millet',
  queuedCropId: null,
  sownArea: 4,
  fieldGrowth: 20,
  inventory: {},
};
state.buildings.push(farm);
buildings.occupyBuildingTiles(state, farm);

const farmers = state.residents.slice(0, 2);
for (const resident of state.residents) resident.alive = farmers.includes(resident);
for (let index = 0; index < farmers.length; index++) {
  Object.assign(farmers[index], {
    alive: true, sick: false, quarantinedUntil: 0, health: 100, hunger: 100, warmth: 100,
    morale: 70, job: 'farmer', assignedBuildingId: null,
    x: 10, y: 10 + index, px: 10, py: 10 + index,
    phase: 'rest', path: [], workTimer: 0, targetId: null, carrying: {}, cartEquipped: false,
    task: '대기', skills: { farmer: 0 }, manualOrder: null, haulTask: null,
  });
  assert.equal(workerSlots.assignResidentToBuilding(state, farmers[index].id, farm.id), null);
}

const visited = new Map(farmers.map(farmer => [farmer.id, new Set()]));
for (let tick = 0; tick < 6; tick++) {
  const growthBefore = farm.fieldGrowth;
  agents.agentsTick(state);
  assert.ok(farm.fieldGrowth > growthBefore, `farm production continues on visual work tick ${tick}`);
  for (const farmer of farmers) {
    if (farmer.task.endsWith('재배 중') && farmer.x === farmer.px && farmer.y === farmer.py) {
      visited.get(farmer.id).add(`${farmer.x},${farmer.y}`);
    }
  }
  state.subTick++;
}

for (const farmer of farmers) {
  assert.equal(visited.get(farmer.id).size, 2, `farmer ${farmer.id} visibly works both assigned cells`);
}
assert.equal(new Set([...visited.values()].flatMap(points => [...points])).size, 4,
  'the two farmers visibly work every cell of the 2x2 plot');

farmers[0].alive = false;
let activeFarmerIds = workerSlots.assignedWorkers(state, farm).map(worker => worker.id);
assert.deepEqual(activeFarmerIds, [farmers[1].id], 'a dead farmer immediately leaves the active plot assignment');
assert.equal(
  new Set([...farmTiles.farmWorkTilesByResident(farm, activeFarmerIds).values()].flat().map(tile => `${tile.x},${tile.y}`)).size,
  4,
  'the surviving farmer safely receives the full plot',
);
farmers[0].alive = true;
farmers[0].job = 'hauler';
activeFarmerIds = workerSlots.assignedWorkers(state, farm).map(worker => worker.id);
assert.deepEqual(activeFarmerIds, [farmers[1].id], 'a job-changed farmer immediately leaves the active plot assignment');

for (const farmer of farmers) farmer.path = [{ x: farm.x, y: farm.y }];
for (const row of state.map) {
  for (const tile of row) if (tile.buildingId === farm.id) tile.buildingId = null;
}
workerSlots.clearAssignmentsForBuilding(state, farm.id);
state.buildings = state.buildings.filter(building => building.id !== farm.id);
assert.doesNotThrow(() => agents.agentsTick(state), 'removing a plot never leaves an unsafe farmer path');
for (const farmer of farmers) {
  assert.equal(farmer.assignedBuildingId, null);
  assert.ok(farmer.path.every(tile => state.map[tile.y]?.[tile.x]), 'post-removal path stays inside the map');
}

const ticksPerYear = CONFIG.time.yearDays * CONFIG.agents.subticksPerDay;
const deterministicPath = ticks => Array.from({ length: ticks }, (_unused, tick) =>
  farmTiles.farmWorkTileForTick({ type: 'field', x: 4, y: 6, w: 3, h: 3 }, [30, 10, 20], 20, tick));
assert.deepEqual(deterministicPath(30 * CONFIG.agents.subticksPerDay), deterministicPath(30 * CONFIG.agents.subticksPerDay),
  '30 days of work-tile selection are deterministic');
assert.deepEqual(deterministicPath(ticksPerYear), deterministicPath(ticksPerYear),
  'one full configured year of work-tile selection is deterministic');

const threeWay = farmTiles.farmWorkTilesByResident({ type: 'field', x: 4, y: 6, w: 3, h: 3 }, [30, 10, 20]);
assert.equal(new Set([...threeWay.values()].flat().map(tile => `${tile.x},${tile.y}`)).size, 9,
  'three farmers visit the full 3x3 plot');
assert.equal([...threeWay.values()].flat().length, 9, 'farmer assigned regions never overlap');
const redistributed = farmTiles.farmWorkTilesByResident({ type: 'field', x: 4, y: 6, w: 3, h: 3 }, [10, 30]);
assert.equal(new Set([...redistributed.values()].flat().map(tile => `${tile.x},${tile.y}`)).size, 9,
  'worker-count changes redistribute the full plot safely');

function makeHeavySnowScenario() {
  const weatherState = simulation.newGame(2026072306);
  const center = weatherState.buildings.find(building => building.type === 'center');
  for (const row of weatherState.map) {
    for (const tile of row) {
      tile.terrain = 'plain';
      tile.hasIron = false;
      tile.buildingId = null;
    }
  }
  weatherState.buildings = center ? [center] : [];
  if (center) buildings.occupyBuildingTiles(weatherState, center);
  weatherState.exploration = { explored: weatherState.map.map(row => row.map(() => true)) };
  weatherState.day = 1;
  weatherState.subTick = 0;
  weatherState.resources.tools = 1000;
  weatherState.resources.firewood = 1000;
  const weatherFarm = {
    id: 9300, type: 'field', x: 10, y: 10, w: 3, h: 3, built: true,
    progress: buildings.BUILDING_DEFS.field.buildDays, cropId: 'millet', queuedCropId: null,
    sownArea: 0, fieldGrowth: 0, inventory: {},
  };
  weatherState.buildings.push(weatherFarm);
  buildings.occupyBuildingTiles(weatherState, weatherFarm);
  const weatherFarmers = weatherState.residents.slice(0, 3);
  for (const candidate of weatherState.residents) candidate.alive = weatherFarmers.includes(candidate);
  for (let index = 0; index < weatherFarmers.length; index++) {
    const worker = weatherFarmers[index];
    Object.assign(worker, {
      alive: true, sick: false, quarantinedUntil: 0, health: 100, hunger: 100, warmth: 100,
      morale: 70, job: 'farmer', assignedBuildingId: null, x: 10, y: 10 + index,
      px: 10, py: 10 + index, phase: 'rest', path: [], workTimer: 0, targetId: null,
      carrying: {}, cartEquipped: false, task: '대기', skills: { farmer: 0 }, manualOrder: null,
      haulTask: null,
    });
    assert.equal(workerSlots.assignResidentToBuilding(weatherState, worker.id, weatherFarm.id), null);
  }
  return { weatherState, weatherFarm, weatherFarmers };
}

function runHeavySnowSpring() {
  const { weatherState, weatherFarm, weatherFarmers } = makeHeavySnowScenario();
  for (let tick = 0; tick < CONFIG.time.seasonDays * CONFIG.agents.subticksPerDay; tick++) {
    for (const worker of weatherFarmers) {
      worker.alive = true; worker.sick = false; worker.health = 100;
      worker.hunger = 100; worker.warmth = 100; worker.morale = 70;
    }
    weatherState.weather = 'heavySnow';
    weatherState.pendingChoice = null;
    weatherState.raiders = null;
    simulation.advanceTick(weatherState);
  }
  return weatherFarm.sownArea ?? 0;
}

const heavySnowSown = runHeavySnowSpring();
assert.ok(heavySnowSown >= 7.6,
  `3x3 heavy-snow sowing must stay within 5% of the merge-base 8 tiles (got ${heavySnowSown})`);
assert.equal(runHeavySnowSpring(), heavySnowSown, 'heavy-snow farm production is deterministic');

console.log('farmer work tile tests passed');
