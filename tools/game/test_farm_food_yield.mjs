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
const workerSlots = await import(pathToFileURL(join(compiledDir, 'workerSlots.mjs')).href);
const { CONFIG } = await import(pathToFileURL(join(compiledDir, 'config.mjs')).href);
const { CROP_DEFS } = await import(pathToFileURL(join(compiledDir, 'crops.mjs')).href);

function centerTile(state) {
  const center = state.buildings.find(b => b.type === 'center');
  assert.ok(center, 'center exists');
  return state.map[center.y][center.x];
}

function openInteriorTile(state) {
  for (let y = 2; y < state.map.length - 2; y++) {
    for (let x = 2; x < state.map[y].length - 2; x++) {
      const tile = state.map[y][x];
      if (tile.buildingId == null) return tile;
    }
  }
  throw new Error('no open tile found');
}

function placeBuilt(state, type, tile, extra = {}) {
  const building = {
    id: 9000 + state.buildings.length,
    type,
    x: tile.x,
    y: tile.y,
    progress: 99,
    built: true,
    fieldGrowth: 0,
    ...extra,
  };
  state.buildings.push(building);
  tile.buildingId = building.id;
  return building;
}

function onlyWorkerAt(state, job, tile) {
  const worker = state.residents[0];
  for (const resident of state.residents) resident.alive = resident.id === worker.id;
  Object.assign(worker, {
    alive: true,
    sick: false,
    health: 100,
    hunger: 100,
    warmth: 100,
    morale: 50,
    skills: {},
    job,
    x: tile.x,
    y: tile.y,
    px: tile.x,
    py: tile.y,
    phase: 'rest',
    path: [],
    workTimer: 0,
    targetId: null,
    carrying: {},
  });
  state.weather = 'clear';
  state.resources.tools = 100;
  return worker;
}

function runTicks(state, ticks) {
  for (let i = 0; i < ticks; i++) simulation.advanceTick(state);
}

{
  assert.equal(CONFIG.production.fieldGrainYield, 36, 'full-growth field yield reflects stronger agriculture');
  assert.ok(CROP_DEFS.millet.yield < CONFIG.production.fieldGrainYield, 'early millet yields less than dense paddy grain');
  assert.equal(CROP_DEFS.millet.output, 'grain', 'millet harvests as tribute-ready grain');
  assert.equal(CROP_DEFS.rice.output, 'grain', 'rice harvests as grain for efficient milling');
  assert.equal(CONFIG.production.foodPerGrain, 1.5, 'grain milling preserves agriculture as dense food');
}

{
  const state = simulation.newGame(8201);
  state.day = 25; // autumn
  state.weather = 'clear';
  const fieldTile = openInteriorTile(state);
  fieldTile.terrain = 'plain';
  const field = placeBuilt(state, 'field', fieldTile, { fieldGrowth: 100 });
  const farmer = onlyWorkerAt(state, 'farmer', fieldTile);
  assert.equal(workerSlots.assignResidentToBuilding(state, farmer.id, field.id), null);

  runTicks(state, 1);

  assert.equal(field.fieldGrowth, 92, 'farmer harvests one subtick worth of field growth');
  const harvested = (8 / 100) * CROP_DEFS.millet.yield;
  assert.ok(Math.abs((farmer.carrying.grain ?? 0) - harvested) < 0.001, 'millet harvest becomes stored grain');
  assert.equal(farmer.carrying.food ?? 0, 0, 'millet no longer bypasses the grain stockpile');
}

{
  const state = simulation.newGame(8202);
  state.rank = 'bo';
  const tile = openInteriorTile(state);
  const watermill = placeBuilt(state, 'watermill', tile);
  const miller = onlyWorkerAt(state, 'miller', state.map[tile.y][Math.max(0, tile.x - 1)]);
  assert.equal(workerSlots.assignResidentToBuilding(state, miller.id, watermill.id), null);
  state.resources.game = 0;
  state.resources.wood = 0;
  state.resources.grain = 10;
  state.resources.food = 0;
  state.resources.stone = CONFIG.production.stoneReserveTarget;
  state.processingReserves.grain = 0;

  runTicks(state, 1);

  const milled = CONFIG.production.millerGrainPerDay / 5;
  assert.equal(miller.task, '방아 찧기');
  assert.ok(Math.abs(state.resources.grain - (10 - milled)) < 0.001, 'miller mills the expected grain amount');
  assert.ok(Math.abs(state.resources.food - (milled * 1.5)) < 0.001, 'milled grain creates 1.5 food per grain');
}

console.log('farm food yield tests passed');
