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
const selectionActions = await import(pathToFileURL(join(compiledDir, 'selectionActions.mjs')).href);

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

function addBuilt(state, type, x, y) {
  const building = {
    id: 9200 + state.buildings.length,
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

function onlyResident(state, job, x, y) {
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
    carrying: {},
    manualOrder: null,
  });
  state.weather = 'clear';
  return resident;
}

{
  const state = simulation.newGame(2026070801);
  clearMapToPlain(state);
  const rockTile = state.map[10][10];
  rockTile.terrain = 'rock';
  const emptyPlain = state.map[12][10];

  const hauler = onlyResident(state, 'hauler', 9, 10);
  assert.equal(
    selectionActions.getPointerAction(state, { kind: 'resident', id: hauler.id }, rockTile).kind,
    'work',
    'hauler can manually quarry rock',
  );

  hauler.job = 'farmer';
  assert.equal(
    selectionActions.getPointerAction(state, { kind: 'resident', id: hauler.id }, rockTile).kind,
    'invalid',
    'farmer cannot work rock',
  );
  assert.equal(
    selectionActions.getPointerAction(state, { kind: 'resident', id: hauler.id }, emptyPlain).kind,
    'move',
    'farmer can move to empty passable plain',
  );
}

{
  const state = simulation.newGame(2026070802);
  clearMapToPlain(state);
  const smithy = addBuilt(state, 'smithy', 15, 15);
  const smithyTile = state.map[15][15];

  assert.equal(
    selectionActions.getPointerAction(state, { kind: 'building', id: smithy.id }, smithyTile).kind,
    'building',
    'selected building exposes building action over its footprint',
  );
}

console.log('selection action tests passed');
