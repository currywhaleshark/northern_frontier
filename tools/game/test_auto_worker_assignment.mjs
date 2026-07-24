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
    output = output.replace(/(from\s+['"])(\.{1,2}\/[^'"]+)(['"])/g, (_match, start, spec, end) =>
      /\.[cm]?js$/.test(spec) ? `${start}${spec}${end}` : `${start}${spec}.mjs${end}`);
    writeFileSync(join(outDir, file.replace(/\.ts$/, '.mjs')), output, 'utf8');
  }
  return outDir;
}

const compiledDir = compileGameModules();
const simulation = await import(pathToFileURL(join(compiledDir, 'simulation.mjs')).href);
const buildings = await import(pathToFileURL(join(compiledDir, 'buildings.mjs')).href);
const agents = await import(pathToFileURL(join(compiledDir, 'agents.mjs')).href);
const workerSlots = await import(pathToFileURL(join(compiledDir, 'workerSlots.mjs')).href);

function prepare(seed) {
  const state = simulation.newGame(seed);
  for (const row of state.map) {
    for (const tile of row) {
      tile.terrain = 'plain';
      tile.hasIron = false;
      tile.buildingId = null;
    }
  }
  state.buildings = [];
  state.exploration = { explored: state.map.map(row => row.map(() => true)) };
  for (const resident of state.residents) resident.alive = false;
  state.rank = 'bu';
  state.weather = 'clear';
  state.pendingChoice = null;
  state.gameOver = null;
  addBuilding(state, 'center', 2, 2, true);
  return state;
}

function addBuilding(state, type, x, y, built, progress) {
  const building = {
    id: state.nextBuildingId++, type, x, y,
    progress: progress ?? (built ? buildings.BUILDING_DEFS[type].buildDays : 0),
    built, fieldGrowth: 0, inventory: {},
  };
  state.buildings.push(building);
  buildings.occupyBuildingTiles(state, building);
  return building;
}

function resident(state, index, job, x, y) {
  const person = state.residents[index];
  Object.assign(person, {
    alive: true, sick: false, health: 100, hunger: 100, warmth: 100, morale: 70,
    job, assignedBuildingId: null, x, y, px: x, py: y, phase: 'rest', path: [],
    workTimer: 0, targetId: null, carrying: {}, haulTask: null, manualOrder: null, skills: {},
  });
  return person;
}

// 완공 시 다른 시설 배정자는 건드리지 않고 가까운 같은 직업 미배정자부터 슬롯을 채운다.
{
  const state = prepare(2026071022);
  const target = addBuilding(
    state,
    'woodShed',
    12,
    10,
    false,
    buildings.BUILDING_DEFS.woodShed.buildDays - 0.001,
  );
  const other = addBuilding(state, 'woodShed', 28, 20, true);
  resident(state, 0, 'builder', 11, 10);
  const assignedElsewhere = resident(state, 1, 'woodSplitter', 10, 10);
  const nearest = resident(state, 2, 'woodSplitter', 11, 9);
  const nextNearest = resident(state, 3, 'woodSplitter', 16, 10);
  const farther = resident(state, 4, 'woodSplitter', 22, 10);
  const idleCloser = resident(state, 5, 'idle', 11, 10);
  assert.equal(workerSlots.assignResidentToBuilding(state, assignedElsewhere.id, other.id), null);

  state.subTick = 9;
  agents.agentsTick(state);

  assert.equal(target.built, true);
  assert.equal(assignedElsewhere.assignedBuildingId, other.id);
  assert.equal(nearest.assignedBuildingId, target.id);
  assert.equal(nextNearest.assignedBuildingId, target.id);
  assert.equal(farther.assignedBuildingId, null);
  assert.equal(idleCloser.assignedBuildingId, null, 'auto assignment never changes another job');
  assert.deepEqual(workerSlots.assignedWorkers(state, target).map(worker => worker.id), [nearest.id, nextNearest.id]);
  assert.ok(state.log.some(entry => entry.text.includes('자동 배정')));
}

// 일시적으로 아픈 기존 배정자의 자리도 보존하면서 남은 빈자리만 보충한다.
{
  const state = prepare(2026071023);
  const smithy = addBuilding(state, 'smithy', 12, 10, true);
  const sickAssigned = resident(state, 0, 'smith', 11, 10);
  sickAssigned.sick = true;
  sickAssigned.assignedBuildingId = smithy.id;
  const healthy = resident(state, 1, 'smith', 14, 10);
  const extra = resident(state, 2, 'smith', 18, 10);

  const assigned = workerSlots.autoAssignWorkersToBuilding(state, smithy.id);

  assert.deepEqual(assigned.map(worker => worker.id), [healthy.id]);
  assert.equal(sickAssigned.assignedBuildingId, smithy.id);
  assert.equal(healthy.assignedBuildingId, smithy.id);
  assert.equal(extra.assignedBuildingId, null);
  assert.deepEqual(workerSlots.assignedSlotResidents(state, smithy).map(worker => worker.id),
    [sickAssigned.id, healthy.id],
    'the slot roster keeps a temporarily sick assignee visible beside the active replacement');
  assert.deepEqual(workerSlots.assignedWorkers(state, smithy).map(worker => worker.id), [healthy.id],
    'temporarily sick assignees do not contribute production while their slot remains reserved');
  assert.equal(workerSlots.availableWorkerSlots(state, smithy), 0,
    'the displayed roster and automatic assignment agree that no unexplained vacancy remains');

  sickAssigned.sick = false;
  assert.deepEqual(workerSlots.assignedWorkers(state, smithy).map(worker => worker.id),
    [sickAssigned.id, healthy.id],
    'a recovered assignee automatically resumes work in the preserved slot');
}

// 대량 자동 배정은 선택한 건물 종류의 빈자리만 채우며, 기존 배정·다른 종류·직업은 보존한다.
{
  const state = prepare(2026071601);
  const assignedField = addBuilding(state, 'field', 10, 10, true);
  const emptyField = addBuilding(state, 'field', 24, 10, true);
  const unselectedPaddy = addBuilding(state, 'paddy', 18, 10, true);
  const existingFarmer = resident(state, 0, 'farmer', 10, 10);
  const fieldFarmer = resident(state, 1, 'farmer', 23, 10);
  const paddyFarmer = resident(state, 2, 'farmer', 18, 9);
  const idleNearField = resident(state, 3, 'idle', 24, 9);
  assert.equal(workerSlots.assignResidentToBuilding(state, existingFarmer.id, assignedField.id), null);

  const assigned = workerSlots.autoAssignWorkersToSelectedBuildingTypes(state, ['field']);

  assert.deepEqual(assigned.map(worker => worker.id), [fieldFarmer.id]);
  assert.equal(existingFarmer.assignedBuildingId, assignedField.id, 'existing assignments must be preserved');
  assert.equal(fieldFarmer.assignedBuildingId, emptyField.id, 'selected empty slots must be filled');
  assert.equal(paddyFarmer.assignedBuildingId, null, 'unselected building types must not receive workers');
  assert.equal(workerSlots.assignedWorkers(state, unselectedPaddy).length, 0,
    'the unselected paddy must remain unfilled');
  assert.equal(idleNearField.assignedBuildingId, null, 'automatic assignment must not change jobs');
}

// 직업 인원을 줄일 때는 건물 슬롯에 연결되지 않은 주민부터 무직으로 돌린다.
{
  const state = prepare(2026071602);
  const field = addBuilding(state, 'field', 10, 10, true);
  const assignedFarmer = resident(state, 0, 'farmer', 10, 10);
  const unassignedFarmer = resident(state, 1, 'farmer', 14, 10);
  assert.equal(workerSlots.assignResidentToBuilding(state, assignedFarmer.id, field.id), null);

  assert.equal(simulation.reassignJob(state, 'farmer', 'idle'), true);
  assert.equal(assignedFarmer.job, 'farmer');
  assert.equal(assignedFarmer.assignedBuildingId, field.id);
  assert.equal(unassignedFarmer.job, 'idle');
  assert.equal(unassignedFarmer.assignedBuildingId, null);
}

console.log('automatic worker assignment tests passed');
