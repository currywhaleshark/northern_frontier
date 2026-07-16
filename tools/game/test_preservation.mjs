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

const compiledDir = compileGameModules();
const simulation = await import(pathToFileURL(join(compiledDir, 'simulation.mjs')).href);
const buildings = await import(pathToFileURL(join(compiledDir, 'buildings.mjs')).href);
const preservation = await import(pathToFileURL(join(compiledDir, 'preservation.mjs')).href);
const processing = await import(pathToFileURL(join(compiledDir, 'processing.mjs')).href);
const catalog = await import(pathToFileURL(join(compiledDir, 'resourceCatalog.mjs')).href);
const spoilage = await import(pathToFileURL(join(compiledDir, 'spoilage.mjs')).href);
const workerSlots = await import(pathToFileURL(join(compiledDir, 'workerSlots.mjs')).href);

function prepare(seed) {
  const state = simulation.newGame(seed);
  for (const row of state.map) {
    for (const tile of row) {
      tile.terrain = 'plain';
      tile.hasIron = false;
      tile.buildingId = null;
    }
  }
  state.buildings = [];
  state.exploration = { explored: state.map.map(row => row.map(() => true)) };
  for (const resource of catalog.RESOURCE_IDS) state.resources[resource] = 0;
  for (const resident of state.residents) resident.alive = false;
  state.weather = 'clear';
  state.pendingChoice = null;
  state.gameOver = null;
  addBuilt(state, 'center', 2, 2);
  addBuilt(state, 'storehouse', 7, 2);
  return state;
}

function addBuilt(state, type, x, y, inventory = {}) {
  const building = {
    id: state.nextBuildingId++, type, x, y,
    progress: buildings.BUILDING_DEFS[type].buildDays,
    built: true, fieldGrowth: 0, inventory,
  };
  if (type === 'dryingRack') building.dryingProduct = 'saltedFish';
  state.buildings.push(building);
  buildings.occupyBuildingTiles(state, building);
  return building;
}

function worker(state, index, job, x, y) {
  const resident = state.residents[index];
  Object.assign(resident, {
    alive: true, sick: false, health: 100, hunger: 100, warmth: 100, morale: 70,
    job, assignedBuildingId: null, x, y, px: x, py: y, phase: 'rest', path: [],
    workTimer: 0, targetId: null, carrying: {}, haulTask: null, manualOrder: null, skills: {},
  });
  return resident;
}

function runUntil(state, predicate, maxTicks = 80) {
  for (let tick = 0; tick < maxTicks && !predicate(); tick++) simulation.advanceTick(state);
  assert.ok(predicate(), `condition was not reached within ${maxTicks} ticks`);
}

{
  assert.equal(buildings.BUILDING_DEFS.smokehouse.placement, 'land');
  assert.equal(buildings.BUILDING_DEFS.dryingRack.placement, 'riverbank');
  assert.equal(workerSlots.workerSlotConfig('smokehouse').job, 'curer');
  assert.equal(workerSlots.workerSlotConfig('dryingRack').job, 'curer');
  assert.deepEqual(preservation.DRYING_PRODUCT_ORDER, ['saltedFish', 'driedFish']);
}

// 훈연소는 현장 고기와 숯을 우선 사용해 보존육을 만든다.
{
  const state = prepare(2026071602);
  const smokehouse = addBuilt(state, 'smokehouse', 12, 2, { meat: 10, charcoal: 2, firewood: 2 });
  const curer = worker(state, 0, 'curer', smokehouse.x, smokehouse.y);
  assert.equal(workerSlots.assignResidentToBuilding(state, curer.id, smokehouse.id), null);

  simulation.advanceTick(state);

  assert.ok(smokehouse.inventory.curedMeat > 0);
  assert.ok(smokehouse.inventory.meat < 10);
  assert.ok(smokehouse.inventory.charcoal < 2, 'charcoal already at the smokehouse is preferred');
  assert.equal(smokehouse.inventory.firewood, 2);
}

// 자반은 생선과 소금을 소비한다.
{
  const state = prepare(2026071603);
  const rack = addBuilt(state, 'dryingRack', 12, 2, { fish: 10, salt: 3 });
  const curer = worker(state, 0, 'curer', rack.x, rack.y);
  assert.equal(workerSlots.assignResidentToBuilding(state, curer.id, rack.id), null);
  assert.equal(simulation.setDryingProduct(state, rack.id, 'saltedFish'), null);

  simulation.advanceTick(state);

  assert.ok(rack.inventory.saltedFish > 0);
  assert.ok(rack.inventory.fish < 10);
  assert.ok(rack.inventory.salt < 3);
}

// 건어물은 비가 오면 원료를 소비하지 않고, 날이 개면 다시 생산한다.
{
  const state = prepare(2026071604);
  const rack = addBuilt(state, 'dryingRack', 12, 2, { fish: 10 });
  const curer = worker(state, 0, 'curer', rack.x, rack.y);
  assert.equal(workerSlots.assignResidentToBuilding(state, curer.id, rack.id), null);
  assert.equal(simulation.setDryingProduct(state, rack.id, 'driedFish'), null);
  state.weather = 'rain';

  simulation.advanceTick(state);
  assert.equal(rack.inventory.driedFish ?? 0, 0);
  assert.equal(rack.inventory.fish, 10);
  assert.equal(curer.task, '비가 그치기를 기다림');

  state.weather = 'clear';
  simulation.advanceTick(state);
  assert.ok(rack.inventory.driedFish > 0);
  assert.ok(rack.inventory.fish < 10);
}

// 고기·생선 비축선은 작업자가 창고에서 꺼낼 수 있는 양을 제한한다.
{
  const state = prepare(2026071605);
  state.resources.meat = 8;
  state.resources.fish = 8;
  assert.equal(processing.processableAmount(state, 'meat'), 0);
  assert.equal(processing.processableAmount(state, 'fish'), 0);
}

// 보존식은 부패 대상이 아니다.
{
  const state = prepare(2026071606);
  Object.assign(state.resources, { curedMeat: 10, saltedFish: 10, driedFish: 10 });
  spoilage.applyDailySpoilage(state);
  assert.equal(state.resources.curedMeat, 10);
  assert.equal(state.resources.saltedFish, 10);
  assert.equal(state.resources.driedFish, 10);
}

// 운반꾼은 생선 원료를 남기고 완성된 자반만 회수한다.
{
  const state = prepare(2026071607);
  Object.assign(state.resources, { grain: 100, meat: 20, fish: 20, vegetables: 20, stone: 40 });
  const rack = addBuilt(state, 'dryingRack', 12, 2, { fish: 3, saltedFish: 8 });
  worker(state, 0, 'hauler', 11, 2);

  runUntil(state, () => state.resources.saltedFish > 0);
  assert.equal(rack.inventory.fish, 3);
}

console.log('preservation tests passed');
