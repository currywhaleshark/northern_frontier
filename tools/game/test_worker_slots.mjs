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
const constants = await import(pathToFileURL(join(compiledDir, 'constants.mjs')).href);
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

function addBuilt(state, type, x, y, overrides = {}) {
  const building = {
    id: 9300 + state.buildings.length,
    type,
    x,
    y,
    progress: buildings.BUILDING_DEFS[type].buildDays,
    built: true,
    fieldGrowth: 0,
    ...overrides,
  };
  state.buildings.push(building);
  buildings.occupyBuildingTiles(state, building);
  return building;
}

function workableResident(state, index, job, x, y) {
  const resident = state.residents[index];
  Object.assign(resident, {
    alive: true,
    sick: false,
    health: 100,
    hunger: 100,
    warmth: 100,
    morale: 70,
    job,
    assignedBuildingId: null,
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
  return resident;
}

function prepareState(seed = 2026070901, rank = 'bu') {
  const state = simulation.newGame(seed);
  clearMapToPlain(state);
  state.rank = rank;
  state.weather = 'clear';
  for (let i = 0; i < state.residents.length; i++) {
    workableResident(state, i, 'idle', 2 + i, 2);
  }
  return state;
}

{
  assert.deepEqual(workerSlots.workerSlotConfig('field'), { job: 'farmer', slots: 1 });
  assert.deepEqual(workerSlots.workerSlotConfig('smithy'), { job: 'smith', slots: 2 });
  assert.deepEqual(workerSlots.workerSlotConfig('stable'), { job: 'herder', slots: 2 });
  assert.deepEqual(workerSlots.workerSlotConfig('nitreYard'), { job: 'powderMaker', slots: 2 });
  assert.deepEqual(workerSlots.workerSlotConfig('ferry'), { job: 'fisher', slots: 2 });
  assert.deepEqual(workerSlots.workerSlotConfig('tannery'), { job: 'tanner', slots: 2 });
  assert.equal(workerSlots.workerSlotConfig('center'), null);
  assert.equal(workerSlots.isSlottedProductionBuilding('center'), false);
  assert.equal(workerSlots.isSlottedProductionBuilding('field'), true);
  assert.equal(constants.JOB_NAMES.tanner, '무두장이');
}

{
  const state = prepareState();
  const field = addBuilt(state, 'field', 10, 10);
  const first = state.residents[0];
  const second = state.residents[1];

  assert.equal(workerSlots.assignResidentToBuilding(state, first.id, field.id), null);
  assert.equal(first.job, 'farmer');
  assert.equal(first.assignedBuildingId, field.id);
  assert.deepEqual(workerSlots.assignedWorkers(state, field).map(r => r.id), [first.id]);
  assert.equal(workerSlots.availableWorkerSlots(state, field), 0);

  assert.match(workerSlots.assignResidentToBuilding(state, second.id, field.id), /slot|capacity|full/i);
  assert.equal(second.job, 'idle');
  assert.equal(second.assignedBuildingId, null);
}

{
  const state = prepareState();
  const smithy = addBuilt(state, 'smithy', 10, 10);
  const smiths = state.residents.slice(0, 3);

  assert.equal(workerSlots.assignResidentToBuilding(state, smiths[0].id, smithy.id), null);
  assert.equal(workerSlots.assignResidentToBuilding(state, smiths[1].id, smithy.id), null);
  assert.deepEqual(workerSlots.assignedWorkers(state, smithy).map(r => r.id), [smiths[0].id, smiths[1].id]);
  assert.equal(workerSlots.availableWorkerSlots(state, smithy), 0);
  assert.match(workerSlots.assignResidentToBuilding(state, smiths[2].id, smithy.id), /slot|capacity|full/i);
  assert.equal(smiths[2].job, 'idle');
  assert.equal(smiths[2].assignedBuildingId, null);
}

{
  const state = prepareState(2026070902, 'settlement');
  const nitreYard = addBuilt(state, 'nitreYard', 10, 10);
  const resident = state.residents[0];

  assert.match(workerSlots.assignResidentToBuilding(state, resident.id, nitreYard.id), /unlock|rank/i);
  assert.equal(resident.job, 'idle');
  assert.equal(resident.assignedBuildingId, null);
}

{
  const state = prepareState();
  const tannery = addBuilt(state, 'tannery', 10, 10);
  const resident = state.residents[0];

  assert.equal(workerSlots.assignResidentToBuilding(state, resident.id, tannery.id), null);
  assert.equal(resident.job, 'tanner');
  assert.equal(workerSlots.assignedBuildingForResident(state, resident)?.id, tannery.id);
  workerSlots.unassignResidentFromBuilding(state, resident.id);
  assert.equal(resident.job, 'tanner');
  assert.equal(resident.assignedBuildingId, null);
  assert.equal(workerSlots.assignedBuildingForResident(state, resident), null);
}

{
  const state = prepareState();
  const stable = addBuilt(state, 'stable', 20, 20);
  const idleFar = workableResident(state, 0, 'idle', 18, 20);
  const herderFarther = workableResident(state, 1, 'herder', 14, 20);
  const herderNearest = workableResident(state, 2, 'herder', 19, 20);
  const idleNearest = workableResident(state, 3, 'idle', 20, 19);

  assert.equal(workerSlots.assignNearestWorkerToBuilding(state, stable.id), null);
  assert.equal(herderNearest.assignedBuildingId, stable.id);
  assert.equal(herderNearest.job, 'herder');
  assert.equal(idleFar.assignedBuildingId, null);
  assert.equal(herderFarther.assignedBuildingId, null);
  assert.equal(idleNearest.assignedBuildingId, null);
}

{
  const state = prepareState();
  const stable = addBuilt(state, 'stable', 20, 20);
  const nearestBuilder = workableResident(state, 0, 'builder', 19, 20);
  for (let i = 1; i < state.residents.length; i++) {
    workableResident(state, i, 'hauler', 30 + i, 30);
  }

  assert.equal(workerSlots.assignNearestWorkerToBuilding(state, stable.id), null);
  assert.equal(nearestBuilder.assignedBuildingId, stable.id);
  assert.equal(nearestBuilder.job, 'herder');
}

{
  const state = prepareState();
  const stable = addBuilt(state, 'stable', 20, 20);
  const closerBuilder = workableResident(state, 0, 'builder', 19, 20);
  const fartherHerder = workableResident(state, 1, 'herder', 12, 20);
  for (let i = 2; i < state.residents.length; i++) {
    workableResident(state, i, 'hauler', 30 + i, 30);
  }

  assert.equal(workerSlots.assignNearestWorkerToBuilding(state, stable.id), null);
  assert.equal(fartherHerder.assignedBuildingId, stable.id);
  assert.equal(fartherHerder.job, 'herder');
  assert.equal(closerBuilder.assignedBuildingId, null);
}

{
  const state = prepareState();
  const tannery = addBuilt(state, 'tannery', 10, 10);
  const resident = state.residents[0];

  assert.equal(workerSlots.assignResidentToBuilding(state, resident.id, tannery.id), null);
  assert.equal(resident.assignedBuildingId, tannery.id);
  simulation.setResidentJob(state, resident.id, 'farmer');
  assert.equal(resident.job, 'farmer');
  assert.equal(resident.assignedBuildingId, null);
}

{
  const state = prepareState();
  const field = addBuilt(state, 'field', 10, 10);
  const farmer = state.residents[0];
  workableResident(state, 1, 'woodcutter', 12, 10);

  assert.equal(workerSlots.assignResidentToBuilding(state, farmer.id, field.id), null);
  assert.equal(farmer.job, 'farmer');
  assert.equal(farmer.assignedBuildingId, field.id);
  assert.equal(simulation.reassignJob(state, 'farmer', 'woodcutter'), true);
  assert.equal(farmer.job, 'woodcutter');
  assert.equal(farmer.assignedBuildingId, null);
}

{
  const state = prepareState();
  const smithy = addBuilt(state, 'smithy', 10, 10);
  const first = state.residents[0];
  const second = state.residents[1];

  assert.equal(workerSlots.assignResidentToBuilding(state, first.id, smithy.id), null);
  assert.equal(workerSlots.assignResidentToBuilding(state, second.id, smithy.id), null);
  assert.equal(first.assignedBuildingId, smithy.id);
  assert.equal(second.assignedBuildingId, smithy.id);
  workerSlots.clearAssignmentsForBuilding(state, smithy.id);
  assert.equal(first.assignedBuildingId, null);
  assert.equal(second.assignedBuildingId, null);
}

console.log('worker slot tests passed');
