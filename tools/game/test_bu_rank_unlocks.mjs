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
const events = await import(pathToFileURL(join(compiledDir, 'events.mjs')).href);
const { CONFIG } = await import(pathToFileURL(join(compiledDir, 'config.mjs')).href);
const { FACTIONS } = constants;

const BU_BUILDINGS = ['nitreYard', 'stoneWall', 'office', 'dock'];
const BU_JOBS = ['powderMaker', 'clerk'];
const TRADER = FACTIONS.find(f => f.trades.length > 0).name;

function boostResources(state) {
  for (const key of Object.keys(state.resources)) state.resources[key] = 1000;
  state.exploration = { explored: state.map.map(row => row.map(() => true)) };
}

function openInteriorTile(state, type = 'hut') {
  for (let y = 2; y < CONFIG.map.height - 2; y++) {
    for (let x = 2; x < CONFIG.map.width - 2; x++) {
      const tiles = buildings.buildingFootprintTiles(state, type, x, y);
      if (tiles && tiles.every(tile => tile.buildingId == null)) return state.map[y][x];
    }
  }
  throw new Error('no open tile found');
}

function prepareLandTile(state, type = 'hut') {
  const tile = openInteriorTile(state, type);
  for (const footprintTile of buildings.buildingFootprintTiles(state, type, tile.x, tile.y)) {
    footprintTile.terrain = 'plain';
    footprintTile.hasIron = false;
    footprintTile.buildingId = null;
  }
  return tile;
}

function prepareRiverEdge(state) {
  const bank = openInteriorTile(state, 'dock');
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
  buildings.occupyBuildingTiles(state, building);
  return building;
}

function withMarket(state) {
  const tile = prepareLandTile(state, 'market');
  placeBuilt(state, 'market', tile);
  return state;
}

function withDock(state) {
  const { river } = prepareRiverEdge(state);
  placeBuilt(state, 'dock', river);
  return state;
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
  state.rank = 'bu';
  state.weather = 'clear';
  state.resources.tools = 100;
  return worker;
}

function runTicks(state, ticks) {
  for (let i = 0; i < ticks; i++) simulation.advanceTick(state);
}

{
  const state = simulation.newGame(202607080);
  state.rank = 'bu';
  state.gameOver = { won: true, reason: 'bu promotion reached' };
  const before = { day: state.day, subTick: state.subTick };

  simulation.advanceTick(state);
  assert.deepEqual(
    { day: state.day, subTick: state.subTick },
    before,
    'victory modal pauses simulation until the player chooses',
  );

  assert.equal(simulation.continueAfterVictory(state), true, 'won game can continue after victory modal');
  assert.equal(state.gameOver, null);
  simulation.advanceTick(state);
  assert.notDeepEqual(
    { day: state.day, subTick: state.subTick },
    before,
    'continued victory game advances again',
  );

  state.gameOver = { won: false, reason: 'lost' };
  assert.equal(simulation.continueAfterVictory(state), false, 'lost game cannot be continued through victory flow');
}

{
  const state = simulation.newGame(202607081);
  boostResources(state);
  state.rank = 'jin';

  for (const building of BU_BUILDINGS) {
    assert.ok(buildings.BUILDING_DEFS[building], `${building} has a building definition`);
    assert.equal(buildings.isBuildingUnlocked(state.rank, building), false, `${building} is locked before bu`);
    const tile = building === 'dock' ? prepareRiverEdge(state).river : prepareLandTile(state, building);
    const lockMessage = simulation.tryPlaceBuilding(state, building, tile.x, tile.y);
    assert.ok(lockMessage, `${building} placement is rejected before bu`);
    assert.match(lockMessage, /府|遺/);
  }

  for (const job of BU_JOBS) {
    assert.equal(constants.isJobUnlocked(state.rank, job), false, `${job} is locked before bu`);
  }

  const resident = state.residents.find(r => r.alive);
  const oldJob = resident.job;
  assert.equal(simulation.reassignJob(state, oldJob, 'powderMaker'), false);
  assert.equal(resident.job, oldJob);
  simulation.setResidentJob(state, resident.id, 'clerk');
  assert.equal(resident.job, oldJob);
}

{
  for (const building of BU_BUILDINGS) {
    const state = simulation.newGame(202607082);
    boostResources(state);
    state.rank = 'bu';
    assert.equal(buildings.isBuildingUnlocked(state.rank, building), true, `${building} is unlocked at bu`);
    const tile = building === 'dock' ? prepareRiverEdge(state).river : prepareLandTile(state, building);
    assert.equal(simulation.tryPlaceBuilding(state, building, tile.x, tile.y), null, `${building} can be placed at bu`);
  }

  const state = simulation.newGame(202607083);
  boostResources(state);
  state.rank = 'bu';
  for (const job of BU_JOBS) {
    assert.equal(constants.isJobUnlocked(state.rank, job), true, `${job} is unlocked at bu`);
  }
  const resident = state.residents.find(r => r.alive);
  const oldJob = resident.job;
  assert.equal(simulation.reassignJob(state, oldJob, 'powderMaker'), true);
  assert.equal(resident.job, 'powderMaker');
  simulation.setResidentJob(state, resident.id, 'clerk');
  assert.equal(resident.job, 'clerk');
}

{
  assert.ok(
    buildings.BUILDING_DEFS.stoneWall.defense > buildings.BUILDING_DEFS.earthFort.defense,
    'stone wall is a stronger earth fort-tier defense segment',
  );
}

{
  const state = simulation.newGame(202607084);
  const yardTile = prepareLandTile(state, 'nitreYard');
  placeBuilt(state, 'nitreYard', yardTile);
  onlyWorkerAt(state, 'powderMaker', yardTile);
  state.resources.firewood = 10;
  state.resources.stone = 10;
  state.resources.gunpowder = 0;
  runTicks(state, 8);

  assert.ok(state.resources.gunpowder > 0, 'powder maker produces gunpowder at a nitre yard');
  assert.ok(state.resources.firewood < 10, 'powder maker consumes firewood');
  assert.ok(state.resources.stone < 10, 'powder maker consumes stone');
}

{
  const state = simulation.newGame(202607085);
  assert.equal(buildings.officeEfficiencyMultiplier(state), 1);
  const officeTile = prepareLandTile(state, 'office');
  placeBuilt(state, 'office', officeTile);
  assert.equal(buildings.officeEfficiencyMultiplier(state), 1, 'office needs assigned clerks to boost work');

  state.residents[0].job = 'clerk';
  state.residents[0].alive = true;
  state.residents[0].sick = false;
  state.residents[0].health = 100;
  state.residents[1].job = 'clerk';
  state.residents[1].alive = true;
  state.residents[1].sick = false;
  state.residents[1].health = 100;

  assert.equal(
    buildings.officeEfficiencyMultiplier(state),
    1 + CONFIG.production.officeBonusPerClerk * 2,
    'clerks in a built office raise production efficiency',
  );
}

{
  const state = withDock(withMarket(simulation.newGame(202607086)));
  state.rank = 'bu';
  state.relations[TRADER] = 60;
  const faction = FACTIONS.find(f => f.name === TRADER);
  const original = faction.trades[0];
  const scaledGive = Math.ceil(original.giveAmt * CONFIG.trade.dockOfferScale);
  const scaledGet = Math.ceil(original.getAmt * CONFIG.trade.dockOfferScale);

  assert.equal(events.requestTrade(state, TRADER), null);
  const offer = state.pendingChoice.data.offers[0];
  assert.equal(offer.giveAmt, scaledGive, 'dock expands trade offer give amount');
  assert.equal(offer.getAmt, scaledGet, 'dock expands trade offer get amount');

  state.resources[offer.give] = offer.giveAmt + 5;
  const before = {
    give: state.resources[offer.give],
    get: state.resources[offer.get],
  };
  simulation.resolveChoice(state, 'offer-0');
  assert.equal(state.resources[offer.give], before.give - scaledGive);
  assert.equal(state.resources[offer.get], before.get + scaledGet);

  state.lastTradeByFaction[TRADER] = state.day;
  state.day += CONFIG.trade.dockPlayerCooldownDays - 1;
  assert.ok(events.canRequestTrade(state, TRADER), 'dock cooldown still blocks one day early');
  state.day += 1;
  assert.equal(events.canRequestTrade(state, TRADER), null, 'dock uses a shorter player trade cooldown');
}

console.log('bu rank unlock tests passed');
