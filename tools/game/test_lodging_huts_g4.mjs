import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-game-tests-'));
  for (const file of readdirSync(srcDir).filter(file => file.endsWith('.ts'))) {
    const source = readFileSync(new URL(file, srcDir), 'utf8');
    let output = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
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
const lodging = await import(pathToFileURL(join(compiledDir, 'lodgingHuts.mjs')).href);
const agents = await import(pathToFileURL(join(compiledDir, 'agents.mjs')).href);
const workerSlots = await import(pathToFileURL(join(compiledDir, 'workerSlots.mjs')).href);

function clearState(state) {
  for (const row of state.map) {
    for (const tile of row) {
      tile.terrain = 'plain';
      tile.hasIron = false;
      tile.hasSilver = false;
      tile.buildingId = null;
    }
  }
  state.buildings = [];
  state.foreignSites = [];
  state.silverVein = null;
  state.exploration = { explored: state.map.map(row => row.map(() => true)) };
}

function addBuilt(state, type, x, y, extra = {}) {
  const building = {
    id: state.nextBuildingId++,
    type,
    x,
    y,
    progress: buildings.BUILDING_DEFS[type].buildDays,
    built: true,
    fieldGrowth: 0,
    ...extra,
  };
  state.buildings.push(building);
  buildings.occupyBuildingTiles(state, building);
  return building;
}

function lodgingFixture(seed) {
  const state = simulation.newGame(seed);
  clearState(state);
  const center = addBuilt(state, 'center', 1, 1, { w: 3, h: 2 });
  const home = addBuilt(state, 'hut', 4, 4);
  const camp = addBuilt(state, 'lumberCamp', 10, 4);
  const resident = state.residents[0];
  for (const other of state.residents) other.alive = other.id === resident.id;
  Object.assign(resident, {
    alive: true,
    sick: false,
    health: 100,
    hunger: 50,
    warmth: 70,
    job: 'woodcutter',
    homeBuildingId: home.id,
    x: 3,
    y: 4,
    px: 3,
    py: 4,
    phase: 'sleeping',
    targetId: home.id,
    path: [],
    carrying: {},
    lodgingSupplyHutId: null,
    lodgingHomeRestDay: null,
  });
  assert.equal(workerSlots.assignResidentToBuilding(state, resident.id, camp.id), null);
  state.resources.wood = 100;
  state.resources.hide = 100;
  state.resources.grain = 100;
  state.resources.firewood = 100;
  return { state, center, home, camp, resident };
}

{
  const { state, camp } = lodgingFixture(2026080201);
  const outside = simulation.tryPlaceBuilding(state, 'lodgingHut', 30, 30);
  assert.match(outside, /작업영역 안/);
  assert.equal(simulation.tryPlaceBuilding(state, 'lodgingHut', 13, 4), null);
  const hut = state.buildings.find(building => building.type === 'lodgingHut');
  assert.ok(hut);
  assert.equal(hut.linkedGatheringBuildingId, camp.id, 'placement inside the work area auto-links the camp');
  assert.match(simulation.tryPlaceBuilding(state, 'lodgingHut', 12, 6), /아직 움막이 없는/,
    'one gathering worksite accepts only one lodging hut, including construction sites');
  hut.built = true;
  hut.progress = buildings.BUILDING_DEFS.lodgingHut.buildDays;
  assert.equal(lodging.lodgingHutForResident(state, state.residents[0])?.id, hut.id);
}

{
  const { state, camp, resident } = lodgingFixture(2026080202);
  const hut = addBuilt(state, 'lodgingHut', 13, 4, { linkedGatheringBuildingId: camp.id, inventory: {} });
  const needs = lodging.lodgingDailyNeeds(state, [resident]);
  hut.inventory.grain = needs.rationedFood;
  hut.inventory.firewood = needs.rationedFuelHeat;
  resident.x = 12;
  resident.y = 4;
  resident.px = 12;
  resident.py = 4;
  resident.phase = 'sleeping';
  resident.targetId = hut.id;
  state.subTick = 71;
  const settlementFood = state.resources.grain;
  const settlementFuel = state.resources.firewood;
  simulation.advanceTick(state);
  assert.equal(state.resources.grain, settlementFood, 'lodging residents do not eat settlement food twice');
  assert.equal(state.resources.firewood, settlementFuel, 'lodging residents do not burn settlement fuel twice');
  assert.ok((hut.inventory.grain ?? 0) < 0.0001 && (hut.inventory.firewood ?? 0) < 0.0001,
    'the overnight stay consumes the hut-local stock');
  assert.equal(resident.lodgingHomeRestDay, state.day, 'a depleted hut schedules the next day at home');
  state.subTick = 0;
  agents.agentsTick(state);
  assert.match(resident.task, /귀가|집에서 쉬며/, 'the depleted worker returns home for a rest day');
}

{
  const { state, camp, home, resident } = lodgingFixture(2026080203);
  const hut = addBuilt(state, 'lodgingHut', 13, 4, { linkedGatheringBuildingId: camp.id, inventory: {} });
  resident.lodgingHomeRestDay = state.day - 1;
  resident.x = 3;
  resident.y = 4;
  resident.px = 3;
  resident.py = 4;
  resident.phase = 'sleeping';
  resident.targetId = home.id;
  const foodBefore = state.resources.grain;
  const fuelBefore = state.resources.brushwood + state.resources.firewood + state.resources.charcoal;
  for (let subTick = 0; subTick <= 30 && lodging.lodgingSupplySummary(state, hut).food <= 0; subTick++) {
    state.subTick = subTick;
    agents.agentsTick(state);
  }
  const summary = lodging.lodgingSupplySummary(state, hut);
  assert.ok(summary.food > 0 && summary.fuelHeat > 0, 'the worker carries food and fuel from home to the lodging hut');
  const fuelAfter = state.resources.brushwood + state.resources.firewood + state.resources.charcoal;
  assert.ok(state.resources.grain < foodBefore && fuelAfter < fuelBefore);
  assert.equal(resident.lodgingSupplyHutId, null);
}

{
  const { state, camp } = lodgingFixture(2026080204);
  const first = addBuilt(state, 'lodgingHut', 13, 4, { linkedGatheringBuildingId: camp.id });
  const duplicate = addBuilt(state, 'lodgingHut', 12, 6, { linkedGatheringBuildingId: camp.id });
  lodging.normalizeLodgingHutState(state);
  assert.equal(first.linkedGatheringBuildingId, camp.id);
  assert.equal(duplicate.linkedGatheringBuildingId, null, 'load normalization keeps one hut per worksite');
}

console.log('lodging hut G4 tests passed');
