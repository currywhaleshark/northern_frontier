import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-game-tests-'));
  const files = readdirSync(srcDir).filter(file => file.endsWith('.ts'));
  for (const file of files) {
    const source = readFileSync(new URL(file, srcDir), 'utf8');
    let output = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.ES2022,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText;
    output = output.replace(/(from\s+['"])(\.{1,2}\/[^'"]+)(['"])/g, (_match, start, spec, end) => {
      if (/\.[cm]?js$/.test(spec)) return `${start}${spec}${end}`;
      return `${start}${spec}.mjs${end}`;
    });
    writeFileSync(join(outDir, file.replace(/\.ts$/, '.mjs')), output, 'utf8');
  }
  return outDir;
}

const compiledDir = compileGameModules();
const simulation = await import(pathToFileURL(join(compiledDir, 'simulation.mjs')).href);
const buildings = await import(pathToFileURL(join(compiledDir, 'buildings.mjs')).href);
const crops = await import(pathToFileURL(join(compiledDir, 'crops.mjs')).href);
const resources = await import(pathToFileURL(join(compiledDir, 'resources.mjs')).href);
const processing = await import(pathToFileURL(join(compiledDir, 'processing.mjs')).href);
const workerSlots = await import(pathToFileURL(join(compiledDir, 'workerSlots.mjs')).href);
const { CONFIG } = await import(pathToFileURL(join(compiledDir, 'config.mjs')).href);

function clearMapToPlain(state) {
  for (const row of state.map) {
    for (const tile of row) {
      tile.terrain = 'plain';
      tile.hasIron = false;
      tile.buildingId = null;
    }
  }
  state.buildings = [];
  state.exploration = { explored: state.map.map(row => row.map(() => true)) };
}

function addBuilt(state, type, x, y, overrides = {}) {
  const building = {
    id: 9600 + state.buildings.length,
    type,
    x,
    y,
    progress: buildings.BUILDING_DEFS[type].buildDays,
    built: true,
    fieldGrowth: 0,
    ...overrides,
  };
  state.buildings.push(building);
  buildings.occupyBuildingTiles(state, building);
  return building;
}

function workableResident(state, index, job, x, y) {
  const resident = state.residents[index];
  Object.assign(resident, {
    alive: true,
    sick: false,
    health: 100,
    hunger: 100,
    warmth: 100,
    morale: 50,
    skills: {},
    job,
    assignedBuildingId: null,
    x,
    y,
    px: x,
    py: y,
    phase: 'rest',
    path: [],
    workTimer: 0,
    targetId: null,
    carrying: {},
    manualOrder: null,
  });
  return resident;
}

function prepareState(seed = 2026070911, rank = 'bo') {
  const state = simulation.newGame(seed);
  clearMapToPlain(state);
  state.rank = rank;
  state.weather = 'clear';
  state.pendingChoice = null;
  state.gameOver = null;
  state.resources.wood = 500;
  state.resources.stone = 500;
  state.resources.tools = 500;
  state.resources.food = 0;
  state.resources.meat = 0;
  state.resources.fish = 0;
  state.resources.grain = 0;
  for (let i = 0; i < state.residents.length; i++) {
    workableResident(state, i, 'idle', 2 + i, 2);
  }
  return state;
}

function runTicks(state, ticks) {
  for (let i = 0; i < ticks; i++) simulation.advanceTick(state);
}

function makePaddyEligibleTile(state, x, y) {
  state.map[y][x].terrain = 'fertile';
  state.map[y][x + 1].terrain = 'river';
  state.map[y][x + 1].buildingId = null;
  return state.map[y][x];
}

{
  assert.equal(crops.CROP_DEFS.millet.output, 'grain', 'millet harvests as tribute-ready grain');
  assert.equal(crops.CROP_DEFS.rice.output, 'grain', 'rice harvests as grain before efficient milling');
  assert.deepEqual(workerSlots.workerSlotConfig('paddy'), { job: 'farmer', slots: 1 });
  assert.deepEqual(workerSlots.workerSlotConfig('watermill'), { job: 'miller', slots: 2 });
}

{
  const state = prepareState();
  state.day = 3; // spring
  const field = addBuilt(state, 'field', 8, 8, { cropId: 'millet', fieldGrowth: 42 });

  assert.equal(simulation.setBuildingCrop(state, field.id, 'buckwheat', 'queue'), null);
  assert.equal(field.cropId, 'millet', 'queue keeps the current crop in the ground');
  assert.equal(field.queuedCropId, 'buckwheat', 'queue stores the next crop');
  assert.equal(field.fieldGrowth, 42, 'queue does not destroy current growth');

  assert.equal(simulation.setBuildingCrop(state, field.id, 'sorghum', 'uproot'), null);
  assert.equal(field.cropId, 'sorghum', 'uproot replaces with a crop plantable now');
  assert.equal(field.queuedCropId, null, 'uproot clears stale queued crop');
  assert.equal(field.fieldGrowth, 0, 'uproot resets growth');
}

{
  const state = prepareState();
  state.day = 37; // winter
  const field = addBuilt(state, 'field', 8, 8, { cropId: 'barley', fieldGrowth: 55 });

  assert.equal(simulation.setBuildingCrop(state, field.id, 'buckwheat', 'uproot'), null);
  assert.equal(field.cropId, null, 'winter uproot clears current crop because buckwheat cannot be planted');
  assert.equal(field.queuedCropId, 'buckwheat', 'winter uproot queues the selected crop for its next planting season');
  assert.equal(field.fieldGrowth, 0);
}

{
  const state = prepareState();
  const eligible = makePaddyEligibleTile(state, 10, 10);
  const dry = state.map[14][14];
  dry.terrain = 'fertile';
  assert.equal(buildings.canPlaceBuildingAt(state, 'paddy', eligible.x, eligible.y), true, 'paddy fits fertile river-adjacent land');
  assert.equal(buildings.canPlaceBuildingAt(state, 'paddy', dry.x, dry.y), false, 'paddy rejects fertile land away from a river');

  const field = addBuilt(state, 'field', eligible.x, eligible.y, { cropId: 'millet', fieldGrowth: 20 });
  assert.equal(simulation.convertFieldToPaddy(state, field.id), null);
  assert.equal(field.type, 'paddy', 'field converts in place to a paddy');
  assert.equal(field.cropId, 'rice');
  assert.equal(field.queuedCropId, null);
  assert.equal(field.fieldGrowth, 0);
}

{
  const state = prepareState();
  state.day = 25; // autumn
  const paddy = addBuilt(state, 'paddy', 9, 9, { cropId: 'rice', fieldGrowth: 100 });
  const farmer = workableResident(state, 0, 'farmer', 9, 9);
  assert.equal(workerSlots.assignResidentToBuilding(state, farmer.id, paddy.id), null);

  runTicks(state, 1);

  assert.equal(paddy.fieldGrowth, 92, 'rice harvest removes one harvest step');
  assert.ok((farmer.carrying.grain ?? 0) > 0, 'rice harvest carries grain');
  assert.equal(farmer.carrying.food ?? 0, 0, 'rice harvest is not already milled');
}

{
  const state = prepareState();
  state.day = 3;
  const mill = addBuilt(state, 'watermill', 12, 12);
  const miller = workableResident(state, 0, 'miller', 11, 12);
  state.resources.grain = 10;
  state.resources.food = 0;
  state.processingReserves.grain = 0;
  assert.equal(workerSlots.assignResidentToBuilding(state, miller.id, mill.id), null);

  runTicks(state, 1);

  const milled = CONFIG.production.millerGrainPerDay / 5;
  assert.equal(miller.task, '방아 찧기');
  assert.ok(Math.abs(state.resources.grain - (10 - milled)) < 0.001, 'miller consumes grain');
  assert.ok(Math.abs(state.resources.food - (milled * CONFIG.production.foodPerGrain)) < 0.001, 'miller produces milled food');
}

{
  const state = prepareState();
  for (const resident of state.residents) resident.alive = false;
  const first = workableResident(state, 0, 'idle', 2, 2);
  first.alive = true;
  state.resources.food = 0;
  state.resources.meat = 0;
  state.resources.fish = 0;
  state.resources.grain = 9.5;
  processing.setProcessingReserve(state, 'grain', 9);

  simulation.advanceDay(state);

  assert.equal(resources.edibleFoodTotal(state), 0, 'reserved grain is not counted as available food');
  assert.equal(state.resources.grain, 9, 'daily consumption eats only unreserved grain');
  assert.equal(first.hunger, 100, 'resident can eat unreserved grain directly');
}

console.log('crop, paddy, and milling tests passed');
