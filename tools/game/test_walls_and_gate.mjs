import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-wall-tests-'));
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
const agents = await import(pathToFileURL(join(compiledDir, 'agents.mjs')).href);
const buildings = await import(pathToFileURL(join(compiledDir, 'buildings.mjs')).href);
const raids = await import(pathToFileURL(join(compiledDir, 'raids.mjs')).href);
const simulation = await import(pathToFileURL(join(compiledDir, 'simulation.mjs')).href);
const walls = await import(pathToFileURL(join(compiledDir, 'walls.mjs')).href);

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
  state.rank = 'bu';
  state.cannonsGranted = 10;
}

function addBuilt(state, type, x, y, built = true) {
  const building = {
    id: 9000 + state.buildings.length,
    type,
    x,
    y,
    progress: built ? buildings.BUILDING_DEFS[type].buildDays : 0,
    built,
    fieldGrowth: 0,
  };
  state.buildings.push(building);
  buildings.occupyBuildingTiles(state, building);
  return building;
}

function addWallRing(state, left, top, right, bottom, gateAt = null) {
  const addSegment = (x, y) => {
    const type = gateAt && gateAt.x === x && gateAt.y === y ? 'gate' : 'palisade';
    addBuilt(state, type, x, y);
  };
  for (let x = left; x <= right; x++) {
    addSegment(x, top);
    addSegment(x, bottom);
  }
  for (let y = top + 1; y <= bottom - 1; y++) {
    addSegment(left, y);
    addSegment(right, y);
  }
}

{
  assert.equal(buildings.BUILDING_DEFS.gate.name, '성문', 'gate definition exists');
  assert.equal(buildings.BUILDING_DEFS.gate.defense, 2, 'gate is weaker than palisade');
  assert.ok(buildings.BUILD_MENU_ORDER.includes('gate'), 'gate is in build menu order');
  assert.equal(buildings.buildingFootprintSize('gate'), 1, 'gate is a single-tile building');

  assert.equal(walls.isWallBuilding('palisade'), true, 'palisade is a wall-family building');
  assert.equal(walls.isWallBuilding('earthFort'), true, 'earthFort is a wall-family building');
  assert.equal(walls.isWallBuilding('stoneWall'), true, 'stoneWall is a wall-family building');
  assert.equal(walls.isWallBuilding('gate'), true, 'gate is a wall-family building');
  assert.equal(walls.isSolidWallBuilding('gate'), false, 'gate is not a solid resident wall');
  assert.equal(walls.isGateBuilding('gate'), true, 'gate helper identifies gate');
  assert.equal(walls.isWallBuilding('watchtower'), false, 'watchtower is not a wall-family connector');
}

{
  const state = simulation.newGame(2026070801);
  clearMapToPlain(state);
  addBuilt(state, 'palisade', 10, 10);
  assert.deepEqual(
    walls.wallConnectionsAt(state, 10, 10),
    { n: false, e: false, s: false, w: false },
    'isolated wall has no connections',
  );

  addBuilt(state, 'gate', 11, 10);
  assert.deepEqual(
    walls.wallConnectionsAt(state, 10, 10),
    { n: false, e: true, s: false, w: false },
    'wall line connects to adjacent wall-family segment',
  );

  addBuilt(state, 'stoneWall', 10, 11);
  assert.deepEqual(
    walls.wallConnectionsAt(state, 10, 10),
    { n: false, e: true, s: true, w: false },
    'wall corner connects to adjacent wall-family segments',
  );

  addBuilt(state, 'earthFort', 10, 9);
  addBuilt(state, 'palisade', 9, 10);
  assert.deepEqual(
    walls.wallConnectionsAt(state, 10, 10),
    { n: true, e: true, s: true, w: true },
    'wall connects to every wall-family type',
  );
}

{
  const state = simulation.newGame(2026070802);
  clearMapToPlain(state);

  addBuilt(state, 'palisade', 5, 5);
  addBuilt(state, 'earthFort', 6, 5);
  addBuilt(state, 'stoneWall', 7, 5);
  addBuilt(state, 'gate', 8, 5);

  assert.equal(agents.isPassable(state, 5, 5), false, 'palisade blocks residents');
  assert.equal(agents.isPassable(state, 6, 5), false, 'earthFort blocks residents');
  assert.equal(agents.isPassable(state, 7, 5), false, 'stoneWall blocks residents');
  assert.equal(agents.isPassable(state, 8, 5), true, 'gate lets residents pass');
}

{
  const state = simulation.newGame(2026070803);
  clearMapToPlain(state);
  addWallRing(state, 8, 8, 12, 12, { x: 10, y: 8 });

  const path = agents.findPath(state, 10, 6, tile => tile.x === 10 && tile.y === 10);
  assert.ok(path, 'resident path exists through the gate');
  assert.ok(
    path.some(step => step.x === 10 && step.y === 8),
    'resident path uses the gate tile',
  );
}

{
  const state = simulation.newGame(2026070804);
  clearMapToPlain(state);
  addWallRing(state, 8, 8, 12, 12);

  const path = agents.findPath(state, 10, 6, tile => tile.x === 10 && tile.y === 10);
  assert.equal(path, null, 'resident path is blocked by a ring with no gate');
}

{
  const state = simulation.newGame(2026070805);
  clearMapToPlain(state);
  addBuilt(state, 'center', 10, 10);
  addWallRing(state, 8, 8, 13, 13, { x: 10, y: 8 });

  raids.spawnRaiders(state, () => 0.4, false);
  assert.ok(state.raiders, 'raiders spawn near enclosed center');
  assert.equal(state.raiders.siege, true, 'raiders siege instead of passing through the gate');
  assert.ok(
    state.raiders.path.length > 0,
    'raiders still get a path to a siege position',
  );
}

{
  const state = simulation.newGame(2026070806);
  clearMapToPlain(state);
  boostResources(state);
  state.resources.wood = 0;
  const gate = addBuilt(state, 'gate', 5, 5);
  state.resources.defense = buildings.computeDefense(state);

  assert.equal(simulation.demolishBuilding(state, 5, 5), null, 'demolishing gate succeeds');
  assert.equal(state.resources.wood, 3, 'demolishing gate refunds half wood cost');
  assert.equal(state.map[5][5].buildingId, null, 'demolishing gate clears tile occupancy');
  assert.equal(state.buildings.some(building => building.id === gate.id), false, 'demolished gate is removed');
  assert.equal(state.resources.defense, buildings.computeDefense(state), 'defense is recalculated');
}

{
  const state = simulation.newGame(2026070807);
  clearMapToPlain(state);
  boostResources(state);
  state.resources.wood = 0;
  addBuilt(state, 'storehouse', 5, 5);

  const err = simulation.demolishBuilding(state, 5, 5);
  assert.equal(err, '성벽 계열만 철거할 수 있습니다.', 'non-wall demolition is rejected');
  assert.notEqual(state.map[5][5].buildingId, null, 'rejected demolition keeps building occupancy');
  assert.equal(state.resources.wood, 0, 'rejected demolition does not refund resources');
}

{
  const state = simulation.newGame(2026070808);
  clearMapToPlain(state);

  assert.equal(simulation.demolishBuilding(state, 2, 2), '철거할 건물이 없습니다.');
  assert.equal(simulation.demolishBuilding(state, -1, 2), '지도 밖입니다.');
}

console.log('wall and gate tests passed');
