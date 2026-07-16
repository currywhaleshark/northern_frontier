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
const workerSlots = await import(pathToFileURL(join(compiledDir, 'workerSlots.mjs')).href);

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
  prepareResident(resident, job, x, y);
  state.weather = 'clear';
  return resident;
}

function prepareResident(resident, job, x, y) {
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
    assignedBuildingId: null,
  });
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

{
  const state = simulation.newGame(2026070803);
  clearMapToPlain(state);
  state.rank = 'bu';
  const smithy = addBuilt(state, 'smithy', 15, 15);
  const smithyTile = state.map[15][15];
  const resident = onlyResident(state, 'idle', 14, 15);

  const action = selectionActions.getPointerAction(state, { kind: 'resident', id: resident.id }, smithyTile);

  assert.equal(action.kind, 'work', 'idle resident can target a built smithy for slot assignment');
  assert.equal(action.buildingId, smithy.id, 'smithy assignment action includes the target building id');
  assert.equal(simulation.issueResidentWorkOrder(state, resident.id, action), null);
  assert.equal(resident.job, 'smith', 'work order switches resident to the smith slot job');
  assert.equal(resident.assignedBuildingId, smithy.id, 'work order assigns resident to smithy slot');
  assert.equal(resident.manualOrder, null, 'slot assignment does not leave a manual work order');
}

{
  const state = simulation.newGame(2026070804);
  clearMapToPlain(state);
  state.rank = 'bu';
  const field = addBuilt(state, 'field', 15, 15);
  const fieldTile = state.map[15][15];
  const first = prepareResident(state.residents[0], 'idle', 14, 15);
  const second = prepareResident(state.residents[1], 'idle', 16, 15);
  for (const resident of state.residents) resident.alive = resident.id === first.id || resident.id === second.id;

  assert.equal(workerSlots.assignResidentToBuilding(state, first.id, field.id), null);

  const action = selectionActions.getPointerAction(state, { kind: 'resident', id: second.id }, fieldTile);

  assert.equal(action.kind, 'invalid', 'full field slot rejects a second resident assignment');
  assert.match(action.label, /slot|worker|full|available/i, 'full slot action has a useful label');
}

{
  const state = simulation.newGame(2026070805);
  clearMapToPlain(state);
  state.rank = 'bu';
  const smithy = addBuilt(state, 'smithy', 15, 15);
  const resident = onlyResident(state, 'idle', 14, 15);

  assert.equal(simulation.assignResidentToBuilding(state, resident.id, smithy.id), null);
  resident.path = [{ x: 1, y: 1 }];

  assert.equal(simulation.assignResidentToBuilding(state, resident.id, smithy.id), null);

  assert.deepEqual(
    resident.path,
    [{ x: 1, y: 1 }],
    'idempotent building assignment does not reset resident path',
  );
}

{
  const state = simulation.newGame(2026070806);
  clearMapToPlain(state);
  const resident = onlyResident(state, 'idle', 14, 15);
  resident.path = [{ x: 1, y: 1 }];

  simulation.unassignResidentFromBuilding(state, resident.id);

  assert.deepEqual(
    resident.path,
    [{ x: 1, y: 1 }],
    'unassigning an unassigned resident does not reset path',
  );
}

{
  const state = simulation.newGame(2026070807);
  clearMapToPlain(state);
  state.rank = 'bu';
  const smithy = addBuilt(state, 'smithy', 15, 15);
  const resident = onlyResident(state, 'idle', 14, 15);

  assert.equal(simulation.assignResidentToBuilding(state, resident.id, smithy.id), null);
  resident.path = [{ x: 1, y: 1 }];

  simulation.unassignResidentFromBuilding(state, resident.id);

  assert.equal(resident.assignedBuildingId, null, 'successful unassign clears building assignment');
  assert.deepEqual(resident.path, [], 'successful unassign resets resident path');
}

{
  const state = simulation.newGame(2026070808);
  clearMapToPlain(state);
  const emptyTile = state.map[10][10];
  const otherTile = state.map[10][11];
  const resident = onlyResident(state, 'idle', 14, 15);
  const smithy = addBuilt(state, 'smithy', 15, 15);
  const smithyTile = state.map[15][15];

  assert.equal(
    selectionActions.selectedEntityAfterTileClick(state, { kind: 'resident', id: resident.id }, emptyTile),
    null,
    'an empty-tile left click clears a resident selection',
  );
  assert.equal(
    selectionActions.selectedEntityAfterTileClick(state, { kind: 'building', id: smithy.id }, emptyTile),
    null,
    'an empty-tile left click clears a building selection',
  );
  assert.equal(
    selectionActions.selectedEntityAfterTileClick(
      state,
      { kind: 'tile', x: emptyTile.x, y: emptyTile.y },
      emptyTile,
    ),
    null,
    'clicking the selected terrain tile again clears it',
  );
  assert.deepEqual(
    selectionActions.selectedEntityAfterTileClick(
      state,
      { kind: 'tile', x: emptyTile.x, y: emptyTile.y },
      otherTile,
    ),
    { kind: 'tile', x: otherTile.x, y: otherTile.y },
    'clicking different terrain moves the terrain selection',
  );
  assert.deepEqual(
    selectionActions.selectedEntityAfterTileClick(state, { kind: 'resident', id: resident.id }, smithyTile),
    { kind: 'building', id: smithy.id },
    'clicking a building replaces the current resident selection',
  );
}

console.log('selection action tests passed');
