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
}

function boostResources(state) {
  for (const key of Object.keys(state.resources)) state.resources[key] = 1000;
}

function addBuilt(state, type, x, y, overrides = {}) {
  const building = {
    id: 9100 + state.buildings.length,
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

function onlyResidentAt(state, job, x, y) {
  const resident = state.residents[0];
  for (const other of state.residents) other.alive = other.id === resident.id;
  Object.assign(resident, {
    alive: true,
    sick: false,
    health: 100,
    hunger: 100,
    warmth: 100,
    morale: 70,
    job,
    x,
    y,
    px: x,
    py: y,
    phase: 'rest',
    path: [],
    workTimer: 0,
    targetId: null,
    assignedBuildingId: null,
    carrying: {},
  });
  state.weather = 'clear';
  return resident;
}

function manhattan(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function advance(state, ticks) {
  for (let i = 0; i < ticks; i++) simulation.advanceTick(state);
}

{
  const state = simulation.newGame(2026070713);
  clearMapToPlain(state);
  boostResources(state);
  const center = addBuilt(state, 'center', 10, 10);
  const builder = onlyResidentAt(state, 'builder', 12, 10);
  const start = { x: builder.x, y: builder.y };

  advance(state, 24);

  assert.notDeepEqual(
    { x: builder.x, y: builder.y },
    start,
    'builder with no construction work wanders instead of standing still at center',
  );
  assert.ok(
    manhattan(builder, center) <= 8,
    'builder loitering stays near the village center',
  );
}

{
  const state = simulation.newGame(2026070714);
  clearMapToPlain(state);
  boostResources(state);
  addBuilt(state, 'center', 4, 4);
  const field = addBuilt(state, 'field', 18, 18, { fieldGrowth: 100 });
  const farmer = onlyResidentAt(state, 'farmer', 6, 4);
  assert.equal(workerSlots.assignResidentToBuilding(state, farmer.id, field.id), null);
  state.day = 13; // summer
  state.subTick = 9;

  advance(state, 30);

  assert.ok(
    manhattan(farmer, field) <= 3,
    'farmer tends mature summer fields instead of returning to the center',
  );
  assert.match(farmer.task, /밭|김매기|농사/, 'farmer task describes field work');
}

console.log('agent loiter and farming tests passed');
