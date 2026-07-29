import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-spring-flood-tests-'));
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
const agents = await import(pathToFileURL(join(compiledDir, 'agents.mjs')).href);
const buildings = await import(pathToFileURL(join(compiledDir, 'buildings.mjs')).href);
const disasters = await import(pathToFileURL(join(compiledDir, 'disasters.mjs')).href);
const simulation = await import(pathToFileURL(join(compiledDir, 'simulation.mjs')).href);
const weatherSchedule = await import(pathToFileURL(join(compiledDir, 'weatherSchedule.mjs')).href);
const { CONFIG } = await import(pathToFileURL(join(compiledDir, 'config.mjs')).href);

function makeTileMap(width = 9, height = 9) {
  return Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => ({
      x,
      y,
      terrain: x === 4 ? 'river' : 'plain',
      hasIron: false,
      buildingId: null,
    })));
}

function makeState(seed = 72029) {
  const state = simulation.newGame(seed, 'normal', '시험촌');
  state.day = 1;
  state.weather = 'clear';
  state.map = makeTileMap();
  state.exploration = { explored: state.map.map(row => row.map(() => true)) };
  state.buildings = [];
  state.residents = [];
  state.pendingDisasters = [];
  state.lastSpringFloodYear = 0;
  state.nextBuildingId = 1;
  return state;
}

function addBuilding(state, type, x, y, extras = {}) {
  const building = {
    id: state.nextBuildingId++,
    type,
    x,
    y,
    built: true,
    progress: buildings.BUILDING_DEFS[type].buildDays,
    fieldGrowth: 0,
    ...extras,
  };
  state.buildings.push(building);
  state.map[y][x].buildingId = building.id;
  return building;
}

{
  const legacyState = makeState();
  const legacyWeir = addBuilding(legacyState, 'weir', 4, 5);
  assert.equal(legacyWeir.weirReservoir, undefined);
  disasters.advanceWeirReservoirs(legacyState);
  assert.equal(legacyWeir.weirReservoir.tiles.length, 2,
    'an already-built weir from an older save must initialize on daily processing');
}

{
  const state = makeState();
  const weir = addBuilding(state, 'weir', 4, 5);
  assert.equal(disasters.initializeWeirReservoir(state, weir), true);
  assert.equal(weir.weirReservoir.tiles.length, 2);
  assert.ok(weir.weirReservoir.tiles.every(tile => tile.y < weir.y),
    'reservoir targets must be upstream of the weir');
  const reserved = weir.weirReservoir.tiles[0];
  assert.equal(buildings.canPlaceBuildingAt(state, 'field', reserved.x, reserved.y, 1, 1), false,
    'a filling reservoir tile must be reserved against construction');

  state.day = 2;
  assert.equal(disasters.advanceWeirReservoirs(state), false);
  assert.equal(weir.weirReservoir.floodedCount, 0);
  assert.ok(disasters.weirReservoirWaterVisuals(state).some(tile => tile.progress > 0),
    'water-rise visuals must appear before terrain conversion');

  state.day = 3;
  assert.equal(disasters.advanceWeirReservoirs(state), true);
  assert.equal(weir.weirReservoir.floodedCount, 1);
  state.day = 4;
  assert.equal(disasters.advanceWeirReservoirs(state), true);
  assert.equal(weir.weirReservoir.floodedCount, 2);
  assert.ok(weir.weirReservoir.tiles.every(tile => state.map[tile.y][tile.x].terrain === 'river'));

  assert.equal(disasters.restoreWeirReservoir(state, weir), true);
  assert.equal(weir.weirReservoir, undefined);
  assert.ok([state.map[4][3].terrain, state.map[4][5].terrain].every(terrain => terrain === 'plain'),
    'dismantling must restore the original bank terrain');
}

{
  const normalized = disasters.normalizePendingDisasters([{
    id: 'springFlood',
    choiceId: 'inundated',
    startedDay: 4,
    resolveDay: 6,
    affectedTiles: [
      { x: 2, y: 3, originalTerrain: 'plain', depth: 1 },
      { x: -1, y: 3, originalTerrain: 'plain', depth: 1 },
      { x: 3, y: 3, originalTerrain: 'unknown', depth: 2 },
    ],
  }]);
  assert.deepEqual(normalized[0].affectedTiles, [
    { x: 2, y: 3, originalTerrain: 'plain', depth: 1 },
  ], 'spring-flood tiles must survive save normalization while malformed entries are dropped');
}

{
  const open = makeState();
  assert.equal(buildings.canPlaceBuildingAt(open, 'levee', 2, 4), true,
    'levees may be built within two tiles of the river');
  assert.equal(buildings.canPlaceBuildingAt(open, 'levee', 1, 4), false,
    'levees may not be built farther than two tiles from the river');
  assert.ok(disasters.springFloodAffectedTiles(open, 2).some(tile => tile.x === 2 && tile.y === 4));

  const protectedState = makeState();
  addBuilding(protectedState, 'levee', 3, 4);
  const protectedTiles = disasters.springFloodAffectedTiles(protectedState, 2);
  assert.equal(protectedTiles.some(tile => tile.x === 2 && tile.y === 4), false,
    'a levee segment must block the direct two-tile flood path behind it');
}

{
  const state = makeState();
  const weir = addBuilding(state, 'weir', 4, 5);
  disasters.initializeWeirReservoir(state, weir);
  state.day = 4;
  disasters.advanceWeirReservoirs(state);
  assert.equal(weir.weirReservoir.floodedCount, 2);

  assert.equal(disasters.startSpringFlood(state, 2, 1, () => 0), true);
  assert.equal(weir.built, false);
  assert.equal(weir.repairing, true);
  assert.equal(weir.weirReservoir, undefined, 'a breached weir must release its reservoir immediately');
  assert.equal(state.map[4][3].terrain, 'plain');
  assert.equal(state.map[4][5].terrain, 'plain');
  assert.equal(disasters.isSpringFloodedTile(state, 3, 4), true,
    'released reservoir banks must remain temporarily submerged during the great flood');
  assert.equal(disasters.isSpringFloodedTile(state, 3, 5), true);
  assert.equal(agents.isTerrainPassable(state, 3, 5), false,
    'temporarily flooded land must be impassable');

  const originalDepositChance = CONFIG.disasters.springFlood.fertileDepositChance;
  CONFIG.disasters.springFlood.fertileDepositChance = 1;
  state.day += 1;
  disasters.advancePendingDisasters(state);
  CONFIG.disasters.springFlood.fertileDepositChance = originalDepositChance;
  assert.equal(disasters.isSpringFloodActive(state), false);
  assert.equal(agents.isTerrainPassable(state, 3, 5), true);
  assert.equal(state.map[5][3].terrain, 'fertile',
    'drained floodplain must support fertile deposition');

  weir.built = true;
  weir.repairing = false;
  assert.equal(disasters.initializeWeirReservoir(state, weir), true,
    'a repaired breached weir must begin filling a fresh reservoir');
}

{
  let trigger = null;
  for (let seed = 1; seed <= 1000 && !trigger; seed++) {
    const schedule = weatherSchedule.seasonWeatherSchedule(seed, 1, 'spring');
    const thawDays = schedule.filter(weather => weather === 'thawFlood').length;
    if (thawDays >= CONFIG.disasters.springFlood.triggerMinThawFloodDays) {
      trigger = { seed, day: schedule.indexOf('thawFlood') + 1 };
    }
  }
  assert.ok(trigger, 'the deterministic weather table should contain a great-flood-eligible seed');
  const state = makeState(trigger.seed);
  state.day = trigger.day;
  state.weather = 'thawFlood';
  assert.equal(disasters.maybeStartSpringFlood(state), true);
  assert.equal(state.lastSpringFloodYear, 1);
  assert.equal(disasters.maybeStartSpringFlood(state), false,
    'a spring can produce at most one great flood');
}

console.log('spring flood, levee, and weir reservoir checks passed');
