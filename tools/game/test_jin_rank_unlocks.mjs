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
const workerSlots = await import(pathToFileURL(join(compiledDir, 'workerSlots.mjs')).href);
const selectionActions = await import(pathToFileURL(join(compiledDir, 'selectionActions.mjs')).href);
const { CONFIG } = await import(pathToFileURL(join(compiledDir, 'config.mjs')).href);

const JIN_BUILDINGS = ['tileHouse', 'earthFort', 'charcoalKiln', 'stable', 'clinic'];
const JIN_JOBS = ['charcoalBurner', 'herder', 'physician'];

function boostResources(state) {
  for (const key of Object.keys(state.resources)) state.resources[key] = 1000;
  state.exploration = { explored: state.map.map(row => row.map(() => true)) };
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

function prepareLandTile(state) {
  const tile = openInteriorTile(state);
  tile.terrain = 'plain';
  tile.hasIron = false;
  tile.buildingId = null;
  return tile;
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
  state.rank = 'jin';
  state.weather = 'clear';
  state.resources.tools = 100;
  return worker;
}

function runTicks(state, ticks) {
  for (let i = 0; i < ticks; i++) simulation.advanceTick(state);
}

{
  assert.ok(
    buildings.BUILDING_DEFS.earthFort.defense > buildings.BUILDING_DEFS.palisade.defense,
    'earth fort is a stronger palisade-tier defense segment',
  );

  const state = simulation.newGame(202607071);
  boostResources(state);
  state.rank = 'bo';

  for (const building of JIN_BUILDINGS) {
    assert.equal(buildings.isBuildingUnlocked(state.rank, building), false, `${building} is locked before jin`);
    const tile = prepareLandTile(state);
    const lockMessage = simulation.tryPlaceBuilding(state, building, tile.x, tile.y);
    assert.ok(lockMessage, `${building} placement is rejected before jin`);
    assert.match(lockMessage, /진/);
  }

  for (const job of JIN_JOBS) {
    assert.equal(constants.isJobUnlocked(state.rank, job), false, `${job} is locked before jin`);
  }

  const resident = state.residents.find(r => r.alive);
  const oldJob = resident.job;
  assert.equal(simulation.reassignJob(state, oldJob, 'charcoalBurner'), false);
  assert.equal(resident.job, oldJob);
  simulation.setResidentJob(state, resident.id, 'herder');
  assert.equal(resident.job, oldJob);
}

{
  for (const building of JIN_BUILDINGS) {
    const state = simulation.newGame(202607072);
    boostResources(state);
    state.rank = 'jin';
    assert.equal(buildings.isBuildingUnlocked(state.rank, building), true, `${building} is unlocked at jin`);
    const tile = prepareLandTile(state);
    assert.equal(simulation.tryPlaceBuilding(state, building, tile.x, tile.y), null, `${building} can be placed at jin`);
  }

  const state = simulation.newGame(202607073);
  boostResources(state);
  state.rank = 'jin';
  for (const job of JIN_JOBS) {
    assert.equal(constants.isJobUnlocked(state.rank, job), true, `${job} is unlocked at jin`);
  }
  const resident = state.residents.find(r => r.alive);
  const oldJob = resident.job;
  assert.equal(simulation.reassignJob(state, oldJob, 'charcoalBurner'), true);
  assert.equal(resident.job, 'charcoalBurner');
  simulation.setResidentJob(state, resident.id, 'herder');
  assert.equal(resident.job, 'herder');
}

{
  const state = simulation.newGame(2026070720);
  boostResources(state);
  state.rank = 'bo';
  const hut = state.buildings.find(building => building.type === 'hut');
  assert.ok(hut, 'new game has a hut to upgrade');
  assert.equal(simulation.upgradeHousingBuilding(state, hut.id, 'ondol'), null);
  hut.progress = buildings.BUILDING_DEFS.ondol.buildDays;
  hut.built = true;
  assert.deepEqual(selectionActions.getBuildingActions(state, hut), [], 'tile house upgrade action is hidden before jin');
  assert.ok(simulation.upgradeHousingBuilding(state, hut.id, 'tileHouse'), 'tile house upgrade is locked before jin');
  assert.equal(hut.type, 'ondol');

  state.rank = 'jin';
  assert.equal(selectionActions.getBuildingActions(state, hut)[0]?.id, 'upgrade:tileHouse');
  assert.equal(simulation.upgradeHousingBuilding(state, hut.id, 'tileHouse'), null, 'ondol upgrades to tile house at jin');
  assert.equal(hut.type, 'tileHouse');
}

{
  const state = simulation.newGame(202607074);
  const kilnTile = prepareLandTile(state);
  const kiln = placeBuilt(state, 'charcoalKiln', kilnTile);
  kiln.inventory = { wood: 2 };
  const burner = onlyWorkerAt(state, 'charcoalBurner', kilnTile);
  assert.equal(workerSlots.assignResidentToBuilding(state, burner.id, kiln.id), null);
  state.resources.wood = 10;
  state.resources.firewood = 0;
  state.processingReserves.wood = 8;
  runTicks(state, 8);

  assert.ok((kiln.inventory?.charcoal ?? 0) > 0, 'charcoal burner stores charcoal at a kiln');
  assert.equal(state.resources.firewood, 0, 'charcoal is a distinct fuel');
  assert.ok(kiln.inventory.wood < 2, 'charcoal burner consumes wood delivered to the kiln');
}

{
  const state = simulation.newGame(202607075);
  const stableTile = prepareLandTile(state);
  const stable = placeBuilt(state, 'stable', stableTile);
  const herder = onlyWorkerAt(state, 'herder', stableTile);
  assert.equal(workerSlots.assignResidentToBuilding(state, herder.id, stable.id), null);
  runTicks(state, 8);

  assert.ok((stable.inventory?.eggs ?? 0) > 0, 'herder gathers eggs into the assigned stable inventory');
  assert.equal(herder.carrying.meat ?? 0, 0, 'routine herding no longer creates meat without slaughter');
  assert.equal(herder.carrying.hide ?? 0, 0, 'routine herding no longer creates hide');
}

console.log('jin rank unlock tests passed');
