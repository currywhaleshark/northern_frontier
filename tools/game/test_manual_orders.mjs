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
const { CONFIG } = await import(pathToFileURL(join(compiledDir, 'config.mjs')).href);

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
  const state = simulation.newGame(2026070802);
  clearMapToPlain(state);
  addBuilt(state, 'center', 4, 4);
  state.rank = 'bu';
  for (const key of Object.keys(state.resources)) state.resources[key] = 1000;
  const builder = onlyResident(state, 'builder', 7, 4);
  assert.equal(simulation.tryPlaceBuilding(state, 'smithy', 12, 4), null);
  const smithy = state.buildings.find(building => building.type === 'smithy');
  assert.ok(smithy && !smithy.built);

  const action = selectionActions.getPointerAction(
    state,
    { kind: 'resident', id: builder.id },
    state.map[smithy.y][smithy.x],
  );
  assert.equal(action.kind, 'work');
  assert.equal(simulation.issueResidentWorkOrder(state, builder.id, action), null,
    'a slotted but unfinished building must be treated as construction, not worker assignment');
  assert.equal(builder.manualOrder?.buildingId, smithy.id);
  builder.task = '길이 막힘';
  builder.path = [{ x: 8, y: 4 }];

  assert.equal(simulation.cancelBuildingConstruction(state, smithy.id), null);
  assert.equal(builder.manualOrder, null, 'cancelling construction clears its stale manual order');
  assert.deepEqual(builder.path, [], 'cancelling construction clears the builder path');
  assert.equal(builder.task, '새 공사 확인 중');
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
  rockTile.hasIron = false;
  rockTile.mineralRemaining = 2;
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
  assert.equal(rockTile.terrain, 'plain', 'depleted stone outcrops disappear');
  assert.equal(rockTile.mineralRemaining, 0);
  assert.ok(state.log.some(entry => entry.text.includes('석재 노두') && entry.text.includes('고갈')));
}

{
  const state = simulation.newGame(20260708041);
  clearMapToPlain(state);
  addBuilt(state, 'center', 4, 4);
  state.resources.iron = 0;
  const ironTile = state.map[4][12];
  ironTile.terrain = 'rock';
  ironTile.hasIron = true;
  ironTile.mineralRemaining = 1.5;
  const hauler = onlyResident(state, 'hauler', 7, 4);

  const action = selectionActions.getPointerAction(state, { kind: 'resident', id: hauler.id }, ironTile);
  assert.equal(action.kind, 'work');
  assert.ok(action.label.includes('철광'));
  assert.equal(simulation.issueResidentWorkOrder(state, hauler.id, action), null);

  for (let i = 0; i < 180 && state.resources.iron <= 0; i++) {
    agents.agentsTick(state);
    state.subTick++;
  }

  assert.ok(state.resources.iron > 0, 'manual iron orders deliver iron instead of stone');
  assert.equal(ironTile.terrain, 'plain');
  assert.equal(ironTile.mineralRemaining, 0);
}

{
  const state = simulation.newGame(20260708042);
  clearMapToPlain(state);
  addBuilt(state, 'center', 4, 4);
  const forestTile = state.map[4][10];
  forestTile.terrain = 'forest';
  const herbalist = onlyResident(state, 'herbalist', 7, 4);

  const action = selectionActions.getPointerAction(
    state,
    { kind: 'resident', id: herbalist.id },
    forestTile,
  );
  assert.equal(action.kind, 'work');
  assert.ok(action.label.includes('산물'));
  assert.equal(simulation.issueResidentWorkOrder(state, herbalist.id, action), null);

  for (let i = 0; i < 80 && (herbalist.carrying.herbs ?? 0) <= 0; i++) {
    agents.agentsTick(state);
    state.subTick++;
  }

  assert.ok((herbalist.carrying.herbs ?? 0) > 0, 'herbalist gathers herbs');
  assert.ok((herbalist.carrying.vegetables ?? 0) > 0, 'herbalist gathers wild food with herbs');
  assert.ok(Math.abs(
    (herbalist.carrying.vegetables ?? 0) /
      (herbalist.carrying.herbs ?? 1) - CONFIG.production.foragedVegetablesPerHerb,
  ) < 0.000001, 'wild food scales with gathered herbs');
}

{
  const state = simulation.newGame(2026070805);
  clearMapToPlain(state);
  addBuilt(state, 'center', 4, 4);
  const camp = addBuilt(state, 'lumberCamp', 12, 4);
  const lodge = addBuilt(state, 'huntLodge', 12, 8);
  camp.inventory = { wood: 8 };
  lodge.inventory = { meat: 5 };
  state.resources.wood = 0;
  state.resources.meat = 0;
  const hauler = onlyResident(state, 'hauler', 7, 4);

  const targetTile = state.map[camp.y][camp.x];
  const action = selectionActions.getPointerAction(
    state,
    { kind: 'resident', id: hauler.id },
    targetTile,
  );
  assert.equal(action.kind, 'work');
  assert.ok(action.label.includes('강제 운송'));
  assert.equal(simulation.issueResidentWorkOrder(state, hauler.id, action), null);
  assert.equal(hauler.manualOrder?.buildingId, camp.id);
  assert.equal(hauler.manualOrder?.repeat, true);

  for (let i = 0; i < 80 && state.resources.wood < 8; i++) {
    agents.agentsTick(state);
    state.subTick++;
  }

  assert.equal(state.resources.wood, 8, 'the selected production building is hauled');
  assert.equal(state.resources.meat, 0, 'other production buildings are ignored');
  assert.equal(lodge.inventory.meat, 5);
  assert.equal(hauler.manualOrder?.buildingId, camp.id, 'forced hauling remains active after delivery');

  camp.inventory.wood = 4;
  for (let i = 0; i < 80 && state.resources.wood < 12; i++) {
    agents.agentsTick(state);
    state.subTick++;
  }
  assert.equal(state.resources.wood, 12, 'new stock at the forced source is hauled again');
}

console.log('manual order tests passed');
