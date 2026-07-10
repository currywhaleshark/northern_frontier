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
}

console.log('automatic worker assignment tests passed');
