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
const agents = await import(pathToFileURL(join(compiledDir, 'agents.mjs')).href);
const buildings = await import(pathToFileURL(join(compiledDir, 'buildings.mjs')).href);
const simulation = await import(pathToFileURL(join(compiledDir, 'simulation.mjs')).href);

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

function boostResources(state) {
  for (const key of Object.keys(state.resources)) state.resources[key] = 1000;
  state.rank = 'bu';
  state.cannonsGranted = 10;
}

function addBuilt(state, type, x, y) {
  const building = {
    id: 9000 + state.buildings.length,
    type,
    x,
    y,
    progress: buildings.BUILDING_DEFS[type].buildDays,
    built: true,
    fieldGrowth: 0,
  };
  state.buildings.push(building);
  buildings.occupyBuildingTiles(state, building);
  return building;
}

function onlyBuilderAt(state, x, y) {
  const builder = state.residents[0];
  for (const resident of state.residents) resident.alive = resident.id === builder.id;
  Object.assign(builder, {
    alive: true,
    sick: false,
    health: 100,
    hunger: 100,
    warmth: 100,
    morale: 70,
    job: 'builder',
    x,
    y,
    px: x,
    py: y,
    phase: 'rest',
    path: [],
    workTimer: 0,
    targetId: null,
    carrying: {},
  });
  state.weather = 'clear';
  return builder;
}

{
  const state = simulation.newGame(2026070710);
  clearMapToPlain(state);
  addBuilt(state, 'storehouse', 5, 5);

  assert.equal(agents.isPassable(state, 5, 5), false, 'solid building origin blocks movement');
  assert.equal(agents.isPassable(state, 6, 5), false, 'solid building east footprint blocks movement');
  assert.equal(agents.isPassable(state, 5, 6), false, 'solid building south footprint blocks movement');
  assert.equal(agents.isPassable(state, 6, 6), false, 'solid building southeast footprint blocks movement');
}

{
  const state = simulation.newGame(2026070711);
  clearMapToPlain(state);
  addBuilt(state, 'storehouse', 5, 5);

  const path = agents.findPath(state, 3, 5, tile => tile.x === 8 && tile.y === 5);
  assert.ok(path, 'path exists around the blocked building');
  assert.equal(path.at(-1).x, 8);
  assert.equal(path.at(-1).y, 5);
  assert.ok(
    path.every(step => state.map[step.y][step.x].buildingId == null),
    'path does not step through solid building footprint',
  );
}

{
  const state = simulation.newGame(2026070712);
  clearMapToPlain(state);
  boostResources(state);
  assert.equal(simulation.tryPlaceBuilding(state, 'smithy', 10, 10), null);
  const smithy = state.buildings.find(building => building.type === 'smithy');
  const builder = onlyBuilderAt(state, 8, 10);

  for (let i = 0; i < 6; i++) simulation.advanceTick(state);

  assert.ok(smithy.progress > 0, 'builder progresses construction from outside the solid building');
  assert.notEqual(
    state.map[builder.y][builder.x].buildingId,
    smithy.id,
    'builder does not stand inside the solid building footprint',
  );
}

console.log('pathfinding collision tests passed');
