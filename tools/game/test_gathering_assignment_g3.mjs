import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const srcDir = new URL('../../src/game/', import.meta.url);
const outDir = mkdtempSync(join(tmpdir(), 'northern-gathering-assignment-g3-tests-'));
for (const file of readdirSync(srcDir).filter(name => name.endsWith('.ts'))) {
  const source = readFileSync(new URL(file, srcDir), 'utf8');
  let output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  output = output.replace(/(from\s+['"])(\.{1,2}\/[^'"]+)(['"])/g, (_match, start, spec, end) =>
    /\.[cm]?js$/.test(spec) ? `${start}${spec}${end}` : `${start}${spec}.mjs${end}`);
  writeFileSync(join(outDir, file.replace(/\.ts$/, '.mjs')), output, 'utf8');
}

const load = name => import(pathToFileURL(join(outDir, `${name}.mjs`)).href);
const simulation = await load('simulation');
const buildings = await load('buildings');
const saveLoad = await load('saveLoad');
const workerSlots = await load('workerSlots');
const { CONFIG } = await load('config');

function runTicks(state, ticks) {
  for (let tick = 0; tick < ticks; tick++) {
    state.pendingChoice = null;
    simulation.advanceTick(state);
  }
}

function loneWorkerState(seed, job, x = 10, y = 10) {
  const state = simulation.newGame(seed);
  state.exploration = { explored: state.map.map(row => row.map(() => true)) };
  state.foreignSites = [];
  for (const resident of state.residents) resident.alive = false;
  const resident = state.residents[0];
  Object.assign(resident, {
    alive: true, sick: false, health: 100, hunger: 100, warmth: 100, morale: 70,
    job, assignedBuildingId: null, x, y, px: x, py: y, phase: 'rest', path: [],
    workTimer: 0, targetId: null, carrying: {}, haulTask: null, manualOrder: null,
  });
  return { state, resident };
}

assert.equal(buildings.isBuildingUnlocked('settlement', 'mine'), true);
assert.equal(buildings.BUILDING_DEFS.mine.minRank, undefined);
assert.deepEqual(buildings.BUILDING_DEFS.lumberCamp.cost, { wood: 3 });
assert.equal(buildings.BUILDING_DEFS.lumberCamp.buildDays, 2);
assert.ok(workerSlots.AUTO_ASSIGN_BUILDING_TYPES.includes('lumberCamp'));
assert.ok(workerSlots.AUTO_ASSIGN_BUILDING_TYPES.includes('huntLodge'));
assert.ok(workerSlots.AUTO_ASSIGN_BUILDING_TYPES.includes('herbHut'));
assert.ok(workerSlots.AUTO_ASSIGN_BUILDING_TYPES.includes('mine'));

// 미배정 벌목꾼은 눈앞의 성목도 일반 벌목하지 않는다.
{
  const { state } = loneWorkerState(2026080204, 'woodcutter');
  const tree = state.map[10][11];
  tree.terrain = 'forest';
  tree.treeStage = 'mature';
  tree.buildingId = null;
  const originalChance = CONFIG.agents.forestDepleteChance;
  CONFIG.agents.forestDepleteChance = 1;
  runTicks(state, CONFIG.agents.subticksPerDay * 4);
  CONFIG.agents.forestDepleteChance = originalChance;
  assert.equal(tree.treeStage, 'mature');
  assert.equal(state.residents[0].carrying.wood ?? 0, 0);
}

// 미배정 채광꾼도 노두를 자유 채집하지 않는다.
{
  const { state, resident } = loneWorkerState(2026080205, 'miner');
  const rock = state.map[10][11];
  rock.terrain = 'rock';
  rock.hasIron = true;
  rock.mineralRemaining = 12;
  rock.buildingId = null;
  runTicks(state, CONFIG.agents.subticksPerDay * 4);
  assert.equal(rock.mineralRemaining, 12);
  assert.equal(resident.carrying.iron ?? 0, 0);
}

// 구버전 방랑 채집꾼은 가까운 빈 슬롯에 붙고, 넘치는 인원·거점 없는 직종은 무직이 된다.
{
  const state = simulation.newGame(2026080206);
  const camp = {
    id: state.nextBuildingId++, type: 'lumberCamp', x: 10, y: 10,
    progress: buildings.BUILDING_DEFS.lumberCamp.buildDays,
    built: true, fieldGrowth: 0,
  };
  state.buildings.push(camp);
  for (let index = 0; index < state.residents.length; index++) {
    const resident = state.residents[index];
    resident.alive = index < 6;
    resident.assignedBuildingId = null;
    resident.job = index < 5 ? 'woodcutter' : 'hunter';
    resident.x = 10 + index;
    resident.y = 10;
  }
  const result = saveLoad.migrateGatheringAssignments(state);
  assert.deepEqual(result, { assigned: 4, idled: 2 });
  assert.equal(state.residents.filter(resident => resident.assignedBuildingId === camp.id).length, 4);
  assert.equal(state.residents.filter(resident => resident.alive && resident.job === 'idle').length, 2);
  assert.ok(state.log.some(entry => entry.text.includes('자동 배정 4명') && entry.text.includes('무직 전환 2명')));
}

console.log('gathering assignment G3 tests passed');
