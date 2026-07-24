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
    output = output.replace(/(from\s+['"])(\.{1,2}\/[^'"]+)(['"])/g, (_match, start, spec, end) =>
      /\.[cm]?js$/.test(spec) ? `${start}${spec}${end}` : `${start}${spec}.mjs${end}`);
    writeFileSync(join(outDir, file.replace(/\.ts$/, '.mjs')), output, 'utf8');
  }
  return outDir;
}

const compiledDir = compileGameModules();
const simulation = await import(pathToFileURL(join(compiledDir, 'simulation.mjs')).href);
const buildings = await import(pathToFileURL(join(compiledDir, 'buildings.mjs')).href);
const workerSlots = await import(pathToFileURL(join(compiledDir, 'workerSlots.mjs')).href);
const catalog = await import(pathToFileURL(join(compiledDir, 'resourceCatalog.mjs')).href);

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
  state.rank = 'bu';
  state.weather = 'clear';
  state.subTick = 1;
  state.pendingChoice = null;
  state.gameOver = null;
  state.processingReserves.wood = 0;
  state.processingReserves.iron = 0;
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

function runUntil(state, predicate, maxTicks = 80, observe = () => {}) {
  for (let tick = 0; tick < maxTicks && !predicate(); tick++) {
    simulation.advanceTick(state);
    observe();
  }
  assert.ok(predicate(), `condition was not reached within ${maxTicks} ticks`);
}

// 장작꾼은 전역 재고를 순간 소비하지 않고 창고 왕복 뒤 장작마당 현장 목재를 사용한다.
{
  const state = prepare(2026071018);
  const shed = addBuilt(state, 'woodShed', 12, 2);
  const splitter = worker(state, 0, 'woodSplitter', 11, 2);
  assert.equal(workerSlots.assignResidentToBuilding(state, splitter.id, shed.id), null);
  state.resources.wood = 10;

  simulation.advanceTick(state);
  assert.equal(shed.inventory.firewood ?? 0, 0);
  assert.ok((splitter.carrying.wood ?? 0) > 0, 'the first trip reaches storage but does not produce remotely');

  let sawCarriedWood = (splitter.carrying.wood ?? 0) > 0;
  let sawWorkplaceWood = false;
  runUntil(
    state,
    () => (shed.inventory.firewood ?? 0) > 0,
    50,
    () => {
      sawCarriedWood ||= (splitter.carrying.wood ?? 0) > 0;
      sawWorkplaceWood ||= (shed.inventory.wood ?? 0) > 0;
    },
  );
  assert.equal(sawCarriedWood, true, 'the wood splitter physically carries wood');
  assert.equal(sawWorkplaceWood, true, 'wood is unloaded at the wood yard before processing');
  assert.ok(state.resources.wood < 10);
  assert.equal(state.resources.firewood, 0, 'finished firewood remains at the workplace');
}

// 가공 비축량은 창고에서 꺼낼 수 있는 양을 제한한다.
{
  const state = prepare(2026071019);
  const shed = addBuilt(state, 'woodShed', 12, 2);
  const splitter = worker(state, 0, 'woodSplitter', 11, 2);
  assert.equal(workerSlots.assignResidentToBuilding(state, splitter.id, shed.id), null);
  state.resources.wood = 10;
  state.processingReserves.wood = 8;

  runUntil(state, () => (shed.inventory.firewood ?? 0) > 0);
  assert.equal(state.resources.wood, 8);
}

// 운반꾼은 작업장 원료는 건드리지 않고 완성품만 창고로 회수한다.
{
  const state = prepare(2026071020);
  const shed = addBuilt(state, 'woodShed', 12, 2, { wood: 3 });
  const hauler = worker(state, 0, 'hauler', 11, 2);

  for (let tick = 0; tick < 8; tick++) simulation.advanceTick(state);
  assert.equal(shed.inventory.wood, 3);
  assert.equal(hauler.carrying.wood ?? 0, 0);

  shed.inventory.firewood = 2;
  runUntil(state, () => state.resources.firewood > 0);
  assert.equal(shed.inventory.wood, 3, 'input wood remains protected while output is hauled');
  assert.ok(state.resources.firewood > 0, 'finished firewood reaches settlement stock');
}

// 대장장이는 철과 목재를 각각 창고에서 가져온 뒤 지정 대장간에서 생산한다.
{
  const state = prepare(2026071021);
  const smithy = addBuilt(state, 'smithy', 12, 2);
  simulation.setSmithyProduct(state, smithy.id, 'spears');
  const smith = worker(state, 0, 'smith', 11, 2);
  assert.equal(workerSlots.assignResidentToBuilding(state, smith.id, smithy.id), null);
  state.resources.iron = 10;
  state.resources.wood = 10;

  let sawIron = false;
  let sawWood = false;
  runUntil(
    state,
    () => (smithy.inventory.spears ?? 0) > 0,
    80,
    () => {
      sawIron ||= (smith.carrying.iron ?? 0) > 0 || (smithy.inventory.iron ?? 0) > 0;
      sawWood ||= (smith.carrying.wood ?? 0) > 0 || (smithy.inventory.wood ?? 0) > 0;
    },
  );
  assert.equal(sawIron, true);
  assert.equal(sawWood, true);
  assert.ok(state.resources.iron < 10);
  assert.ok(state.resources.wood < 10);
}

// 수레 제작용 도구는 마을 비축을 통째로 빼지 않고 1개만 가져온다.
{
  const state = prepare(2026071022);
  const smithy = addBuilt(state, 'smithy', 12, 2, { wood: 6, iron: 3 });
  simulation.setSmithyProduct(state, smithy.id, 'carts');
  const smith = worker(state, 0, 'smith', 11, 2);
  assert.equal(workerSlots.assignResidentToBuilding(state, smith.id, smithy.id), null);
  state.resources.tools = 10;

  runUntil(state, () => (smith.carrying.tools ?? 0) > 0 || (smithy.inventory.tools ?? 0) > 0);

  assert.equal(state.resources.tools, 9, 'the smith takes one expensive tool per supply trip');
}

console.log('processor input logistics tests passed');
