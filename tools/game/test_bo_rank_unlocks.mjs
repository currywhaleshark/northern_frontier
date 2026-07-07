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
const constants = await import(pathToFileURL(join(compiledDir, 'constants.mjs')).href);
const agents = await import(pathToFileURL(join(compiledDir, 'agents.mjs')).href);
const { CONFIG } = await import(pathToFileURL(join(compiledDir, 'config.mjs')).href);

const BO_BUILDINGS = ['bridge', 'mine', 'tileHouse', 'ferry'];
const BO_JOBS = ['miner', 'fisher'];

function boostResources(state) {
  for (const key of Object.keys(state.resources)) state.resources[key] = 1000;
}

function openInteriorTile(state) {
  for (let y = 2; y < CONFIG.map.height - 2; y++) {
    for (let x = 2; x < CONFIG.map.width - 2; x++) {
      const tile = state.map[y][x];
      if (tile.buildingId == null) return tile;
    }
  }
  throw new Error('no open tile found');
}

function prepareTile(state, terrain) {
  const tile = openInteriorTile(state);
  tile.terrain = terrain;
  tile.hasIron = false;
  tile.buildingId = null;
  return tile;
}

function prepareRiverbank(state) {
  const bank = openInteriorTile(state);
  const river = state.map[bank.y][bank.x + 1];
  assert.ok(river, 'river neighbor exists');
  bank.terrain = 'plain';
  bank.hasIron = false;
  bank.buildingId = null;
  river.terrain = 'river';
  river.hasIron = false;
  river.buildingId = null;
  return bank;
}

function placeBuilt(state, type, tile) {
  const building = {
    id: 9000 + state.buildings.length,
    type,
    x: tile.x,
    y: tile.y,
    progress: 99,
    built: true,
    fieldGrowth: 0,
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
    morale: 70,
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
  state.rank = 'bo';
  state.weather = 'clear';
  state.resources.tools = 100;
  return worker;
}

function runTicks(state, ticks) {
  for (let i = 0; i < ticks; i++) simulation.advanceTick(state);
}

{
  const state = simulation.newGame(20260707);
  boostResources(state);

  for (const building of BO_BUILDINGS) {
    assert.equal(buildings.isBuildingUnlocked(state.rank, building), false, `${building} is locked before bo`);
  }
  for (const job of BO_JOBS) {
    assert.equal(constants.isJobUnlocked(state.rank, job), false, `${job} is locked before bo`);
  }

  const resident = state.residents.find(r => r.alive);
  const oldJob = resident.job;
  assert.equal(simulation.reassignJob(state, oldJob, 'miner'), false);
  assert.equal(resident.job, oldJob);
  simulation.setResidentJob(state, resident.id, 'fisher');
  assert.equal(resident.job, oldJob);

  const river = prepareTile(state, 'river');
  const lockMessage = simulation.tryPlaceBuilding(state, 'bridge', river.x, river.y);
  assert.ok(lockMessage, 'bridge placement is rejected before bo');
  assert.match(lockMessage, /보/);
}

{
  for (const building of BO_BUILDINGS) {
    const state = simulation.newGame(42);
    boostResources(state);
    state.rank = 'bo';
    assert.equal(buildings.isBuildingUnlocked(state.rank, building), true, `${building} is unlocked at bo`);

    const tile = building === 'bridge'
      ? prepareTile(state, 'river')
      : building === 'mine'
        ? prepareTile(state, 'rock')
        : building === 'ferry'
          ? prepareRiverbank(state)
          : prepareTile(state, 'plain');
    if (building === 'mine') tile.hasIron = true;

    assert.equal(simulation.tryPlaceBuilding(state, building, tile.x, tile.y), null, `${building} can be placed at bo`);
  }
}

{
  const state = simulation.newGame(43);
  boostResources(state);
  state.rank = 'bo';
  const inland = prepareTile(state, 'plain');
  assert.ok(simulation.tryPlaceBuilding(state, 'mine', inland.x, inland.y), 'mine rejects plain land');

  const ferryState = simulation.newGame(44);
  boostResources(ferryState);
  ferryState.rank = 'bo';
  const dry = prepareTile(ferryState, 'plain');
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    ferryState.map[dry.y + dy][dry.x + dx].terrain = 'plain';
  }
  assert.ok(simulation.tryPlaceBuilding(ferryState, 'ferry', dry.x, dry.y), 'ferry requires a riverbank');
}

{
  const state = simulation.newGame(45);
  state.day = 1;
  state.weather = 'clear';
  const river = prepareTile(state, 'river');
  assert.equal(agents.isPassable(state, river.x, river.y), false, 'spring river blocks movement without bridge');

  placeBuilt(state, 'bridge', river);
  assert.equal(agents.isPassable(state, river.x, river.y), true, 'built bridge opens river movement');
}

{
  const state = simulation.newGame(46);
  const mineTile = prepareTile(state, 'rock');
  mineTile.hasIron = true;
  placeBuilt(state, 'mine', mineTile);
  const miner = onlyWorkerAt(state, 'miner', mineTile);
  runTicks(state, 6);

  assert.ok((miner.carrying.iron ?? 0) > 0, 'miner carries iron from an iron mine');
  assert.ok((miner.carrying.stone ?? 0) > 0, 'miner also brings stone from an iron mine');
}

{
  const state = simulation.newGame(47);
  const ferryTile = prepareRiverbank(state);
  placeBuilt(state, 'ferry', ferryTile);
  const fisher = onlyWorkerAt(state, 'fisher', ferryTile);
  runTicks(state, 6);

  assert.ok((fisher.carrying.food ?? 0) > 0, 'fisher carries food from ferry fishing');
}

console.log('bo rank unlock tests passed');
