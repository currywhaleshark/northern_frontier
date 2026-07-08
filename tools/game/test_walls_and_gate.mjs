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

  addBuilt(state, 'earthFort', 10, 9);
  addBuilt(state, 'gate', 11, 10);
  addBuilt(state, 'stoneWall', 10, 11);
  addBuilt(state, 'palisade', 9, 10);
  assert.deepEqual(
    walls.wallConnectionsAt(state, 10, 10),
    { n: true, e: true, s: true, w: true },
    'wall connects to every wall-family type',
  );
}

console.log('wall and gate tests passed');
