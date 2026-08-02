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
const workerSlots = await import(pathToFileURL(join(compiledDir, 'workerSlots.mjs')).href);
const catalog = await import(pathToFileURL(join(compiledDir, 'resourceCatalog.mjs')).href);
const residents = await import(pathToFileURL(join(compiledDir, 'residents.mjs')).href);
const { CONFIG } = await import(pathToFileURL(join(compiledDir, 'config.mjs')).href);

function prepare(seed) {
  const state = simulation.newGame(seed);
  for (const row of state.map) for (const tile of row) {
    tile.terrain = 'plain';
    tile.hasIron = false;
    tile.buildingId = null;
  }
  state.buildings = [];
  state.exploration = { explored: state.map.map(row => row.map(() => true)) };
  for (const id of catalog.RESOURCE_IDS) state.resources[id] = 0;
  for (const resident of state.residents) resident.alive = false;
  state.rank = 'bu';
  state.subTick = 9;
  state.weather = 'clear';
  state.pendingChoice = null;
  state.gameOver = null;
  state.resources.grain = 100;
  state.processingReserves.wood = 0;
  return state;
}

function addBuilt(state, type, x, y) {
  const building = {
    id: state.nextBuildingId++, type, x, y,
    progress: buildings.BUILDING_DEFS[type].buildDays,
    built: true, fieldGrowth: 0, inventory: {},
  };
  state.buildings.push(building);
  buildings.occupyBuildingTiles(state, building);
  return building;
}

function worker(state, job, x, y) {
  const resident = state.residents.find(candidate => !candidate.alive);
  Object.assign(resident, {
    alive: true, sick: false, health: 100, hunger: 100, warmth: 100, morale: 60,
    job, assignedBuildingId: null, x, y, px: x, py: y, phase: 'rest', path: [],
    workTimer: 0, targetId: null, carrying: {}, haulTask: null, manualOrder: null,
  });
  return resident;
}

function runTicks(state, ticks) {
  for (let i = 0; i < ticks; i++) {
    state.pendingChoice = null;
    simulation.advanceTick(state);
  }
}

{
  const state = prepare(2026071007);
  addBuilt(state, 'center', 2, 2);
  const camp = addBuilt(state, 'lumberCamp', 9, 9);
  for (let y = 6; y <= 10; y++) for (let x = 5; x <= 8; x++) state.map[y][x].terrain = 'forest';
  const cutter = worker(state, 'woodcutter', 8, 8);
  assert.equal(workerSlots.assignResidentToBuilding(state, cutter.id, camp.id), null);
  runTicks(state, CONFIG.agents.subticksPerDay * 4);
  assert.ok((camp.inventory.wood ?? 0) > 0);
  assert.ok((camp.inventory.brushwood ?? 0) > 0);
}

{
  const state = prepare(2026071010);
  addBuilt(state, 'center', 2, 2);
  const lodge = addBuilt(state, 'huntLodge', 9, 9);
  for (let y = 11; y <= 17; y++) for (let x = 11; x <= 17; x++) state.map[y][x].terrain = 'forest';
  state.habitats = [{ id: 1, x: 14, y: 14, radius: 4, active: true }];
  const hunter = worker(state, 'hunter', 14, 14);
  assert.equal(workerSlots.assignResidentToBuilding(state, hunter.id, lodge.id), null);
  runTicks(state, CONFIG.agents.subticksPerDay * 4);
  assert.ok((lodge.inventory.meat ?? 0) > 0);
  assert.ok((lodge.inventory.hide ?? 0) > 0);
}

{
  const state = prepare(2026071008);
  addBuilt(state, 'center', 2, 2);
  const shed = addBuilt(state, 'woodShed', 9, 9);
  const splitter = worker(state, 'woodSplitter', 8, 9);
  state.resources.wood = 20;
  assert.equal(workerSlots.assignResidentToBuilding(state, splitter.id, shed.id), null);
  runTicks(state, CONFIG.agents.subticksPerDay * 4);
  assert.ok((shed.inventory.firewood ?? 0) > 0);
  assert.equal(state.resources.firewood, 0, 'processed fuel waits for a hauler');
}

{
  const state = prepare(2026071009);
  addBuilt(state, 'center', 2, 2);
  const kiln = addBuilt(state, 'charcoalKiln', 9, 9);
  const burner = worker(state, 'charcoalBurner', 8, 9);
  assert.equal(workerSlots.assignResidentToBuilding(state, burner.id, kiln.id), null);
  state.resources.wood = 20;
  runTicks(state, CONFIG.agents.subticksPerDay * 4);
  assert.ok((kiln.inventory.charcoal ?? 0) > 0);
  assert.equal(state.resources.charcoal, 0);
}

{
  const state = prepare(2026071011);
  addBuilt(state, 'center', 2, 2);
  const tannery = addBuilt(state, 'tannery', 9, 9, { tanneryProduct: 'hideClothes' });
  const tanner = worker(state, 'tanner', 8, 9);
  state.resources.hide = 10;
  assert.equal(workerSlots.assignResidentToBuilding(state, tanner.id, tannery.id), null);
  runTicks(state, CONFIG.agents.subticksPerDay * 4);
  assert.ok((tannery.inventory.hideClothes ?? 0) > 0);
  assert.equal(state.resources.hideClothes, 0);
}

{
  const state = prepare(2026071012);
  addBuilt(state, 'center', 2, 2);
  const weaving = addBuilt(state, 'weavingHouse', 9, 9);
  const weaver = worker(state, 'weaver', 8, 9);
  state.resources.cotton = 10;
  assert.equal(workerSlots.assignResidentToBuilding(state, weaver.id, weaving.id), null);
  runTicks(state, CONFIG.agents.subticksPerDay * 4);
  assert.ok((weaving.inventory.cottonClothes ?? 0) > 0);
  assert.equal(state.resources.cottonClothes, 0);
}

function hutWarmthAfterWinter(weather) {
  const state = prepare(2026071013);
  addBuilt(state, 'center', 2, 2);
  addBuilt(state, 'hut', 5, 5);
  const resident = worker(state, 'idle', 4, 5);
  resident.worn = { clothing: { resource: 'hideClothes', wear: 0 } };
  state.day = 37;
  state.weather = weather;
  for (let day = 0; day < 12; day++) {
    residents.updateResidentNeeds(state, () => 1, 1, 1, 1, 1, 1);
  }
  return resident.warmth;
}

{
  assert.equal(CONFIG.needs.heatHut, 11, 'the starting hut receives the intended heating increase');
  const clearWinterWarmth = hutWarmthAfterWinter('clear');
  const heavySnowWarmth = hutWarmthAfterWinter('heavySnow');
  assert.ok(clearWinterWarmth >= 60, `a supplied hut should endure a clear winter (${clearWinterWarmth})`);
  assert.ok(
    heavySnowWarmth >= 25 && heavySnowWarmth < 30,
    `a supplied hut should avoid direct cold damage but remain sickness-prone in prolonged heavy snow (${heavySnowWarmth})`,
  );
}

console.log('fuel and clothing chain tests passed');
