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
const buildings = await import(pathToFileURL(join(compiledDir, 'buildings.mjs')).href);
const simulation = await import(pathToFileURL(join(compiledDir, 'simulation.mjs')).href);
const workerSlots = await import(pathToFileURL(join(compiledDir, 'workerSlots.mjs')).href);

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
  for (const resident of state.residents) resident.alive = false;
  const resident = state.residents[index];
  Object.assign(resident, {
    alive: true,
    sick: false,
    health: 100,
    hunger: 100,
    warmth: 100,
    morale: 70,
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
    skills: {},
  });
  return resident;
}

function prepareState(seed) {
  const state = simulation.newGame(seed);
  clearMapToPlain(state);
  state.rank = 'bu';
  state.day = 1;
  state.weather = 'clear';
  state.resources.tools = 100;
  state.processingReserves.iron = 0;
  state.processingReserves.wood = 0;
  state.processingReserves.hide = 0;
  return state;
}

{
  const state = prepareState(2026070911);
  const field = addBuilt(state, 'field', 10, 10, { fieldGrowth: 0 });
  workableResident(state, 0, 'farmer', field.x, field.y);

  simulation.advanceTick(state);

  assert.equal(field.fieldGrowth, 0, 'unassigned farmer does not grow a built field');
}

{
  const state = prepareState(2026070912);
  const field = addBuilt(state, 'field', 10, 10, { fieldGrowth: 0 });
  const farmer = workableResident(state, 0, 'farmer', field.x, field.y);
  assert.equal(workerSlots.assignResidentToBuilding(state, farmer.id, field.id), null);

  simulation.advanceTick(state);

  assert.ok(field.fieldGrowth > 0, 'assigned farmer grows the assigned field');
}

{
  const state = prepareState(2026070913);
  addBuilt(state, 'tannery', 10, 10);
  workableResident(state, 0, 'tanner', 9, 10);
  state.resources.hide = 10;
  state.resources.clothes = 0;

  simulation.advanceDay(state);

  assert.equal(state.resources.hide, 10, 'unassigned tannery leaves hide untouched');
  assert.equal(state.resources.clothes, 0, 'unassigned tannery does not make clothes');
}

{
  const state = prepareState(2026070914);
  const tannery = addBuilt(state, 'tannery', 10, 10);
  const tanner = workableResident(state, 0, 'tanner', 9, 10);
  assert.equal(workerSlots.assignResidentToBuilding(state, tanner.id, tannery.id), null);
  state.resources.hide = 10;
  state.resources.clothes = 0;

  simulation.advanceTick(state);

  assert.ok(state.resources.hide < 10, 'assigned tanner consumes hide at the assigned tannery');
  assert.ok(state.resources.clothes > 0, 'assigned tanner produces clothes at the assigned tannery');
}

{
  const state = prepareState(2026070915);
  const smithy = addBuilt(state, 'smithy', 10, 10);
  simulation.setSmithyProduct(state, smithy.id, 'spears');
  const smith = workableResident(state, 0, 'smith', 9, 10);
  assert.equal(workerSlots.assignResidentToBuilding(state, smith.id, smithy.id), null);
  state.resources.iron = 10;
  state.resources.wood = 10;
  state.resources.spears = 0;

  simulation.advanceTick(state);

  assert.ok(state.resources.spears > 0, 'assigned smith produces the selected assigned smithy product');
}

console.log('worker slot production tests passed');
