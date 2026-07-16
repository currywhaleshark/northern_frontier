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
const workerSlots = await import(pathToFileURL(join(compiledDir, 'workerSlots.mjs')).href);
const selectionActions = await import(pathToFileURL(join(compiledDir, 'selectionActions.mjs')).href);
const { CONFIG } = await import(pathToFileURL(join(compiledDir, 'config.mjs')).href);

const BO_BUILDINGS = ['ondol', 'mine', 'ferry', 'paddy', 'watermill', 'onggiKiln', 'jangdokdae'];
const BO_JOBS = ['miner', 'fisher', 'miller', 'potter'];

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

function prepareTile(state, terrain) {
  const tile = openInteriorTile(state);
  tile.terrain = terrain;
  tile.hasIron = false;
  tile.buildingId = null;
  return tile;
}

function prepareRiverEdge(state) {
  const bank = openInteriorTile(state);
  const river = state.map[bank.y][bank.x + 1];
  assert.ok(river, 'river neighbor exists');
  bank.terrain = 'plain';
  bank.hasIron = false;
  bank.buildingId = null;
  river.terrain = 'river';
  river.hasIron = false;
  river.buildingId = null;
  return { bank, river };
}

function preparePaddyTile(state) {
  const { bank } = prepareRiverEdge(state);
  bank.terrain = 'fertile';
  return bank;
}

function prepareWatermillEdge(state) {
  const { bank, river } = prepareRiverEdge(state);
  const lowerBank = state.map[bank.y + 1]?.[bank.x];
  const lowerRiver = state.map[river.y + 1]?.[river.x];
  assert.ok(lowerBank && lowerRiver, 'watermill footprint exists');
  lowerBank.terrain = 'plain';
  lowerBank.hasIron = false;
  lowerBank.buildingId = null;
  lowerRiver.terrain = 'river';
  lowerRiver.hasIron = false;
  lowerRiver.buildingId = null;
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

  assert.equal(buildings.isBuildingUnlocked(state.rank, 'bridge'), true, 'bridge is unlocked before bo');
  const bridgeRiver = prepareTile(state, 'river');
  assert.equal(
    simulation.tryPlaceBuilding(state, 'bridge', bridgeRiver.x, bridgeRiver.y),
    null,
    'bridge can be placed before bo',
  );

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
          ? prepareRiverEdge(state).river
          : building === 'onggiKiln'
            ? prepareRiverEdge(state).river
          : building === 'paddy'
            ? preparePaddyTile(state)
            : building === 'watermill'
              ? prepareWatermillEdge(state)
              : prepareTile(state, 'plain');
    if (building === 'mine') tile.hasIron = true;
    const size = buildings.buildingFootprintSize(building);
    if (building === 'ondol' || building === 'jangdokdae') {
      for (let dy = 0; dy < size; dy++) {
        for (let dx = 0; dx < size; dx++) {
          const footprintTile = state.map[tile.y + dy][tile.x + dx];
          footprintTile.terrain = 'plain';
          footprintTile.buildingId = null;
        }
      }
    }

    assert.equal(simulation.tryPlaceBuilding(state, building, tile.x, tile.y), null, `${building} can be placed at bo`);
  }
}

{
  const state = simulation.newGame(420);
  boostResources(state);
  const hut = state.buildings.find(building => building.type === 'hut');
  assert.ok(hut, 'new game has a hut to upgrade');
  assert.deepEqual(selectionActions.getBuildingActions(state, hut), [], 'ondol upgrade action is hidden before bo');
  assert.ok(simulation.upgradeHousingBuilding(state, hut.id, 'ondol'), 'ondol upgrade is locked before bo');
  assert.equal(hut.type, 'hut');

  state.rank = 'bo';
  assert.equal(selectionActions.getBuildingActions(state, hut)[0]?.id, 'upgrade:ondol');
  assert.equal(simulation.upgradeHousingBuilding(state, hut.id, 'ondol'), null, 'hut upgrades to ondol at bo');
  assert.equal(hut.type, 'ondol');
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
  const { bank } = prepareRiverEdge(ferryState);
  assert.ok(simulation.tryPlaceBuilding(ferryState, 'ferry', bank.x, bank.y), 'ferry rejects land riverbank tiles');

  const inlandRiverState = simulation.newGame(440);
  boostResources(inlandRiverState);
  inlandRiverState.rank = 'bo';
  const river = prepareTile(inlandRiverState, 'river');
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    inlandRiverState.map[river.y + dy][river.x + dx].terrain = 'river';
  }
  assert.ok(
    simulation.tryPlaceBuilding(inlandRiverState, 'ferry', river.x, river.y),
    'ferry requires a river tile adjacent to land',
  );
}

{
  const state = simulation.newGame(45);
  state.day = 1;
  state.weather = 'clear';
  const river = prepareTile(state, 'river');
  assert.equal(agents.isPassable(state, river.x, river.y), false, 'spring river blocks movement without bridge');

  placeBuilt(state, 'bridge', river);
  assert.equal(agents.isPassable(state, river.x, river.y), true, 'built bridge opens river movement');

  const ferryState = simulation.newGame(450);
  ferryState.day = 1;
  ferryState.weather = 'clear';
  const ferryRiver = prepareRiverEdge(ferryState).river;
  assert.equal(agents.isPassable(ferryState, ferryRiver.x, ferryRiver.y), false, 'spring river blocks movement before ferry');
  placeBuilt(ferryState, 'ferry', ferryRiver);
  assert.equal(agents.isPassable(ferryState, ferryRiver.x, ferryRiver.y), true, 'built ferry opens its river tile');
}

{
  const state = simulation.newGame(46);
  const mineTile = prepareTile(state, 'rock');
  mineTile.hasIron = true;
  mineTile.mineralRemaining = 1;
  placeBuilt(state, 'mine', mineTile);
  const miner = onlyWorkerAt(state, 'miner', mineTile);
  runTicks(state, 6);

  assert.ok((miner.carrying.iron ?? 0) > 0, 'miner carries iron from an iron mine');
  assert.ok((miner.carrying.stone ?? 0) > 0, 'miner also brings stone from an iron mine');
  assert.equal(mineTile.terrain, 'plain', 'the mine deposit disappears when exhausted');
  assert.equal(mineTile.mineralRemaining, 0);
  assert.ok(state.log.some(entry => entry.text.includes('철광맥') && entry.text.includes('고갈')));
}

{
  const state = simulation.newGame(47);
  const ferryTile = prepareRiverEdge(state).river;
  const ferry = placeBuilt(state, 'ferry', ferryTile);
  const fisher = onlyWorkerAt(state, 'fisher', ferryTile);
  assert.equal(workerSlots.assignResidentToBuilding(state, fisher.id, ferry.id), null);
  runTicks(state, 6);

  assert.ok((fisher.carrying.fish ?? 0) > 0, 'fisher carries fish from ferry fishing');
}

console.log('bo rank unlock tests passed');
