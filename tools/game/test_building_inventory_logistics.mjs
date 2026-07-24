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

function clearWorld(state) {
  for (const row of state.map) {
    for (const tile of row) {
      tile.terrain = 'plain';
      tile.hasIron = false;
      tile.buildingId = null;
    }
  }
  state.buildings = [];
  state.exploration = { explored: state.map.map(row => row.map(() => true)) };
  for (const id of catalog.RESOURCE_IDS) state.resources[id] = 0;
  for (const resident of state.residents) resident.alive = false;
  state.pendingChoice = null;
  state.gameOver = null;
  state.weather = 'clear';
}

function addBuilt(state, type, x, y, overrides = {}) {
  const building = {
    id: state.nextBuildingId++, type, x, y,
    progress: buildings.BUILDING_DEFS[type].buildDays,
    built: true, fieldGrowth: 0, inventory: {}, ...overrides,
  };
  state.buildings.push(building);
  buildings.occupyBuildingTiles(state, building);
  return building;
}

function worker(state, index, job, x, y) {
  const resident = state.residents[index];
  Object.assign(resident, {
    alive: true, sick: false, health: 100, hunger: 100, warmth: 100, morale: 60,
    job, assignedBuildingId: null, x, y, px: x, py: y, phase: 'rest', path: [],
    workTimer: 0, targetId: null, carrying: {}, haulTask: null, manualOrder: null,
  });
  return resident;
}

{
  const state = simulation.newGame(2026071002);
  clearWorld(state);
  addBuilt(state, 'center', 2, 2);
  const field = addBuilt(state, 'field', 8, 8, {
    fieldGrowth: 100, cropId: 'millet', queuedCropId: null,
  });
  state.day = 25;
  state.subTick = 1;
  const farmer = worker(state, 0, 'farmer', 8, 8);
  assert.equal(workerSlots.assignResidentToBuilding(state, farmer.id, field.id), null);

  simulation.advanceTick(state);

  assert.equal(state.resources.grain, 0);
  assert.ok((field.inventory.grain ?? 0) > 0, 'harvest remains at the field');
}

{
  const state = simulation.newGame(2026071003);
  clearWorld(state);
  addBuilt(state, 'center', 2, 2);
  const field = addBuilt(state, 'field', 8, 8, { inventory: { grain: 6 } });
  worker(state, 0, 'hauler', 8, 8);
  state.subTick = 1;

  for (let i = 0; i < 7; i++) simulation.advanceTick(state);

  assert.equal(field.inventory.grain, 0);
  assert.equal(state.resources.grain, 6);
}

{
  const state = simulation.newGame(2026071004);
  clearWorld(state);
  addBuilt(state, 'center', 2, 2);
  const field = addBuilt(state, 'field', 8, 8, { inventory: { grain: 10 } });
  const first = worker(state, 0, 'hauler', 8, 8);
  const second = worker(state, 1, 'hauler', 8, 8);
  state.subTick = 1;

  simulation.advanceTick(state);

  const carried = (first.carrying.grain ?? 0) + (second.carrying.grain ?? 0);
  assert.equal(carried, 10, 'parallel haulers do not duplicate a source reservation');
  assert.equal(field.inventory.grain, 0);
}

console.log('building inventory logistics tests passed');
