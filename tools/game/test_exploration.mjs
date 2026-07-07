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
const simulation = await import(pathToFileURL(join(compiledDir, 'simulation.mjs')).href);
const buildings = await import(pathToFileURL(join(compiledDir, 'buildings.mjs')).href);
const exploration = await import(pathToFileURL(join(compiledDir, 'exploration.mjs')).href);

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

function addBuilt(state, type, x, y) {
  const building = {
    id: 9400 + state.buildings.length,
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
  const state = simulation.newGame(2026070805);
  const center = state.buildings.find(building => building.type === 'center');
  assert.ok(center, 'new games should have a center');
  assert.equal(state.exploration.explored.length, state.map.length);
  assert.equal(state.exploration.explored[0].length, state.map[0].length);
  assert.equal(exploration.isExplored(state, center.x, center.y), true, 'center starts explored');
  assert.equal(exploration.isExplored(state, 0, 0), false, 'distant wilderness starts hidden');
}

{
  const state = simulation.newGame(2026070806);
  for (const resident of state.residents) resident.alive = false;
  const scout = state.residents[0];
  Object.assign(scout, {
    alive: true,
    sick: false,
    health: 100,
    hunger: 100,
    warmth: 100,
    morale: 70,
    job: 'idle',
    x: 1,
    y: 1,
    px: 1,
    py: 1,
    path: [],
    phase: 'rest',
    workTimer: 0,
    targetId: null,
    carrying: {},
    manualOrder: null,
  });
  state.exploration = exploration.createExploration(state);
  assert.equal(exploration.isExplored(state, 1, 1), false, 'manual reset starts hidden around moved scout');

  agents.agentsTick(state);
  assert.equal(exploration.isExplored(state, 1, 1), true, 'resident position reveals after agent tick');
}

{
  const state = simulation.newGame(2026070807);
  const hiddenTile = state.map[0][0];
  assert.equal(exploration.isExplored(state, hiddenTile.x, hiddenTile.y), false);
  const err = simulation.tryPlaceBuilding(state, 'hut', hiddenTile.x, hiddenTile.y);
  assert.equal(err, '아직 답사하지 않은 곳입니다.');
}

{
  const state = simulation.newGame(2026070808);
  clearMapToPlain(state);
  addBuilt(state, 'center', 5, 5);
  state.exploration = exploration.createExploration(state);
  exploration.revealAround(state, 5, 5, 4);
  const woodcutter = onlyResident(state, 'woodcutter', 8, 5);
  const hiddenForest = state.map[5][20];
  hiddenForest.terrain = 'forest';
  assert.equal(exploration.isExplored(state, hiddenForest.x, hiddenForest.y), false);

  agents.agentsTick(state);

  assert.notEqual(woodcutter.task, '숲으로 이동', 'woodcutter should not auto-target unexplored forest');
  assert.equal(
    woodcutter.path.some(step => step.x === hiddenForest.x && step.y === hiddenForest.y),
    false,
    'woodcutter path should not lead into hidden forest for work',
  );
}

console.log('exploration tests passed');
