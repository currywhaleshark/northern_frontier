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
const constants = await import(pathToFileURL(join(compiledDir, 'constants.mjs')).href);
const catalog = await import(pathToFileURL(join(compiledDir, 'resourceCatalog.mjs')).href);
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
  state.rank = 'bo';
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
  assert.equal(buildings.BUILDING_DEFS.onggiKiln.placement, 'riverbank');
  assert.equal(buildings.BUILDING_DEFS.onggiKiln.minRank, 'bo');
  assert.equal(buildings.buildingFootprintSize('onggiKiln'), 1);
  assert.deepEqual(workerSlots.workerSlotConfig('onggiKiln'), { job: 'potter', slots: 2 });
  assert.equal(constants.isJobUnlocked('settlement', 'potter'), false);
  assert.equal(constants.isJobUnlocked('bo', 'potter'), true);
  assert.equal(catalog.RESOURCE_DEFS.onggi.category, 'material');
  assert.equal(catalog.RESOURCE_IDS.includes('clay'), false, 'riverbank clay remains a local input, not a stock resource');
}

// 옹기장이는 현지 점토를 빚고, 작업장에 있는 숯을 우선 사용한다.
{
  const state = prepare(2026071609);
  state.map[2][12].terrain = 'river';
  const kiln = addBuilt(state, 'onggiKiln', 12, 2, { charcoal: 2, firewood: 2 });
  const potter = worker(state, 0, 'potter', 11, 2);
  assert.equal(workerSlots.assignResidentToBuilding(state, potter.id, kiln.id), null);

  runUntil(state, () => (kiln.inventory.onggi ?? 0) > 0);

  assert.ok(kiln.inventory.onggi > 0);
  assert.ok(kiln.inventory.charcoal < 2);
  assert.equal(kiln.inventory.firewood, 2);
  assert.equal(potter.task, '점토를 빚어 옹기 굽는 중');
}

// 운반꾼은 가마의 연료는 남기고 완성된 옹기만 회수한다.
{
  const state = prepare(2026071610);
  Object.assign(state.resources, { grain: 100, meat: 20, fish: 20, vegetables: 20, stone: 40 });
  state.map[2][12].terrain = 'river';
  const kiln = addBuilt(state, 'onggiKiln', 12, 2, { charcoal: 2, firewood: 2, onggi: 8 });
  worker(state, 0, 'hauler', 11, 2);

  runUntil(state, () => state.resources.onggi > 0);

  assert.equal(kiln.inventory.charcoal, 2);
  assert.equal(kiln.inventory.firewood, 2);
}

console.log('onggi tests passed');
