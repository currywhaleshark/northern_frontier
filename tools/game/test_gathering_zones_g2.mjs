import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const srcDir = new URL('../../src/game/', import.meta.url);
const outDir = mkdtempSync(join(tmpdir(), 'northern-gathering-zones-g2-tests-'));
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
const gatheringZones = await load('gatheringZones');
const habitats = await load('habitats');
const inventory = await load('inventory');
const workerSlots = await load('workerSlots');
const { CONFIG } = await load('config');

function prepare(seed) {
  const state = simulation.newGame(seed);
  state.exploration = { explored: state.map.map(row => row.map(() => true)) };
  state.foreignSites = [];
  for (const row of state.map) {
    for (const tile of row) {
      if (tile.buildingId != null) continue;
      tile.terrain = 'plain';
      delete tile.treeStage;
    }
  }
  for (const resident of state.residents) resident.alive = false;
  return state;
}

function addBuilt(state, type, x, y) {
  const building = {
    id: state.nextBuildingId++, type, x, y,
    progress: buildings.BUILDING_DEFS[type].buildDays,
    built: true, fieldGrowth: 0,
  };
  state.buildings.push(building);
  buildings.occupyBuildingTiles(state, building);
  return building;
}

function worker(state, job, x, y) {
  const resident = state.residents[0];
  Object.assign(resident, {
    alive: true, sick: false, health: 100, hunger: 100, warmth: 100, morale: 70,
    job, x, y, px: x, py: y, phase: 'rest', path: [], workTimer: 0,
    targetId: null, carrying: {}, assignedBuildingId: null, haulTask: null, manualOrder: null,
  });
  return resident;
}

function forestSquare(state, cx, cy) {
  for (let y = cy - 1; y <= cy + 1; y++) {
    for (let x = cx - 1; x <= cx + 1; x++) {
      const tile = state.map[y][x];
      tile.terrain = 'forest';
      tile.treeStage = 'mature';
      tile.buildingId = null;
    }
  }
}

function runTicks(state, ticks) {
  for (let tick = 0; tick < ticks; tick++) {
    state.pendingChoice = null;
    simulation.advanceTick(state);
  }
}

// 배정 사냥꾼은 사냥막 영역과 겹친 서식지만 소모한다.
{
  const state = prepare(2026080202);
  const lodge = addBuilt(state, 'huntLodge', 12, 12);
  assert.equal(gatheringZones.adjustGatheringWorkArea(state, lodge.id, 2, 0, -4), null);
  const area = gatheringZones.gatheringWorkArea(lodge);
  assert.deepEqual(area, { x: 14, y: 12, radius: 3 });
  forestSquare(state, 14, 12);
  forestSquare(state, 25, 12);
  const capacity = habitats.habitatCapacity(9);
  state.habitats = [
    { id: 1, x: 14, y: 12, radius: 2, active: true, stock: capacity, capacity },
    { id: 2, x: 25, y: 12, radius: 2, active: true, stock: capacity, capacity },
  ];
  const hunter = worker(state, 'hunter', lodge.x, lodge.y);
  assert.equal(workerSlots.assignResidentToBuilding(state, hunter.id, lodge.id), null);
  runTicks(state, CONFIG.agents.subticksPerDay * 8);
  assert.ok(state.habitats[0].stock < capacity, 'the lodge-area habitat reserve is hunted');
  assert.equal(state.habitats[1].stock, capacity, 'the habitat outside the lodge area is untouched');
  assert.ok(inventory.buildingStock(lodge, 'meat') > 0, 'the assigned hunter unloads meat at the lodge');
}

// 배정 약초꾼은 약초막 영역 밖 숲을 무시하고, 영역을 옮기면 그 숲을 이용한다.
{
  const state = prepare(2026080203);
  const hut = addBuilt(state, 'herbHut', 12, 12);
  assert.equal(gatheringZones.adjustGatheringWorkArea(state, hut.id, 0, 0, -3), null);
  const remoteX = 22;
  const remoteY = 12;
  forestSquare(state, remoteX, remoteY);
  const herbalist = worker(state, 'herbalist', hut.x, hut.y);
  assert.equal(workerSlots.assignResidentToBuilding(state, herbalist.id, hut.id), null);
  runTicks(state, CONFIG.agents.subticksPerDay * 4);
  assert.equal(inventory.buildingStock(hut, 'herbs'), 0, 'forest outside the herb-hut area is ignored');

  hut.gatheringWorkArea = { x: remoteX, y: remoteY, radius: 3 };
  herbalist.phase = 'rest';
  herbalist.path = [];
  runTicks(state, CONFIG.agents.subticksPerDay * 6);
  assert.ok(inventory.buildingStock(hut, 'herbs') > 0, 'moving the area enables gathering in the remote forest');
}

console.log('gathering zones G2 tests passed');
