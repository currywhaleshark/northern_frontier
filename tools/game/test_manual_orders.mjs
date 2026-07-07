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
    id: 9300 + state.buildings.length,
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
  state.resources.tools = 100;
  return resident;
}

{
  const state = simulation.newGame(2026070803);
  clearMapToPlain(state);
  const farmer = onlyResident(state, 'farmer', 5, 5);

  const error = simulation.issueResidentMoveOrder(state, farmer.id, 8, 5);
  assert.equal(error, null);
  assert.equal(farmer.manualOrder.kind, 'move');

  for (let i = 0; i < 20 && farmer.manualOrder; i++) {
    agents.agentsTick(state);
    state.subTick++;
  }

  assert.equal(farmer.x, 8);
  assert.equal(farmer.y, 5);
  assert.equal(farmer.manualOrder, null);
}

{
  const state = simulation.newGame(2026070804);
  clearMapToPlain(state);
  addBuilt(state, 'center', 4, 4);
  state.resources.stone = 0;
  const rockTile = state.map[4][12];
  rockTile.terrain = 'rock';
  const hauler = onlyResident(state, 'hauler', 7, 4);

  const action = selectionActions.getPointerAction(state, { kind: 'resident', id: hauler.id }, rockTile);
  assert.equal(action.kind, 'work');
  const error = simulation.issueResidentWorkOrder(state, hauler.id, action);
  assert.equal(error, null);

  let sawCarry = false;
  for (let i = 0; i < 180 && state.resources.stone <= 0; i++) {
    agents.agentsTick(state);
    state.subTick++;
    sawCarry ||= (hauler.carrying.stone ?? 0) > 0;
  }

  assert.equal(sawCarry, true, 'hauler should quarry stone before depositing');
  assert.ok(state.resources.stone > 0, 'hauler should deposit manually quarried stone');
  assert.equal(hauler.manualOrder?.kind, 'work', 'manual quarry order persists after deposit');
}

console.log('manual order tests passed');
