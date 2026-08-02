import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

// 게임 모듈 전체를 임시 ESM으로 옮겨 순수 상태 API를 브라우저 없이 검증한다.
function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-wall-drag-tests-'));
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
const load = name => import(pathToFileURL(join(compiledDir, `${name}.mjs`)).href);
const simulation = await load('simulation');
const buildings = await load('buildings');
const walls = await load('walls');
const agents = await load('agents');
const clearing = await load('landClearing');
const saveLoad = await load('saveLoad');

function installStorage(backing = new Map()) {
  globalThis.localStorage = {
    get length() { return backing.size; },
    getItem: key => backing.get(key) ?? null,
    setItem: (key, value) => backing.set(key, String(value)),
    removeItem: key => backing.delete(key),
    key: index => [...backing.keys()][index] ?? null,
  };
  return backing;
}

function freshState(seed = 2026080201) {
  const state = simulation.newGame(seed);
  state.rank = 'bu';
  state.foreignSites = [];
  state.exploration = { explored: state.map.map(row => row.map(() => true)) };
  for (const row of state.map) {
    for (const tile of row) {
      tile.terrain = 'plain';
      tile.treeStage = undefined;
      tile.buildingId = null;
    }
  }
  state.buildings = [];
  for (const resource of Object.keys(state.resources)) state.resources[resource] = 1_000;
  return state;
}

function snapshotPlacement(state) {
  return JSON.stringify({
    buildings: state.buildings,
    resources: state.resources,
    nextBuildingId: state.nextBuildingId,
    map: state.map.map(row => row.map(tile => ({ terrain: tile.terrain, buildingId: tile.buildingId }))),
  });
}

function addBuiltWall(state, type, x, y, extra = {}) {
  const building = {
    id: state.nextBuildingId++, type, x, y,
    progress: buildings.BUILDING_DEFS[type].buildDays,
    built: true, fieldGrowth: 0, ...extra,
  };
  state.buildings.push(building);
  buildings.occupyBuildingTiles(state, building);
  return building;
}

function prepareBuildersAt(state, x, y) {
  state.subTick = 9;
  for (const resident of state.residents) {
    if (!resident.alive) continue;
    resident.job = 'builder';
    resident.x = x;
    resident.y = y;
    resident.px = x;
    resident.py = y;
    resident.path = [];
    agents.resetAgent(state, resident);
  }
}

function finishGateConversion(state, wall, limit = 360) {
  prepareBuildersAt(state, wall.x, wall.y);
  for (let tick = 0; tick < limit && wall.gateConversion; tick++) simulation.advanceTick(state);
  assert.equal(wall.gateConversion, undefined, 'builders finish the short gate-conversion work order');
  assert.equal(wall.type, 'gate', 'completed conversion replaces the wall type with a gate');
}

// ── 선 좌표는 지배축으로 스냅하고 양 끝점을 포함한다 ──
assert.deepEqual(
  walls.wallLineRect(4, 7, 7, 8),
  { x: 4, y: 7, w: 4, h: 1 },
  'horizontal-dominant drag snaps to a horizontal inclusive line',
);
assert.deepEqual(
  walls.wallLineTiles(4, 7, 7, 8),
  [{ x: 4, y: 7 }, { x: 5, y: 7 }, { x: 6, y: 7 }, { x: 7, y: 7 }],
  'horizontal wall line includes both endpoints in order',
);
assert.deepEqual(
  walls.wallLineRect(9, 8, 7, 4),
  { x: 9, y: 4, w: 1, h: 5 },
  'vertical-dominant drag snaps to a vertical inclusive line',
);
assert.deepEqual(
  walls.wallLineTiles(9, 8, 7, 4),
  [{ x: 9, y: 4 }, { x: 9, y: 5 }, { x: 9, y: 6 }, { x: 9, y: 7 }, { x: 9, y: 8 }],
  'reverse vertical drag retains start-to-end ordering',
);
assert.deepEqual(
  walls.wallLineRect(10, 10, 12, 12, 'vertical'),
  { x: 10, y: 10, w: 1, h: 3 },
  'equal diagonal deltas follow the last vertical pointer movement',
);
assert.deepEqual(
  walls.wallLineRect(10, 10, 12, 12, 'horizontal'),
  { x: 10, y: 10, w: 3, h: 1 },
  'equal diagonal deltas follow the last horizontal pointer movement',
);

// ── 한 번의 확정은 여러 독립 1×1 구간과 합산 비용을 만든다 ──
{
  const state = freshState();
  const woodBefore = state.resources.wood;
  assert.equal(simulation.tryPlaceWallLine(state, 'palisade', 4, 6, 7, 6), null);
  const placed = state.buildings.filter(building => building.type === 'palisade');
  assert.equal(placed.length, 4, 'four inclusive tiles become four building records');
  assert.equal(new Set(placed.map(building => building.id)).size, 4, 'each wall segment has an independent id');
  assert.deepEqual(placed.map(({ x, y }) => ({ x, y })),
    [{ x: 4, y: 6 }, { x: 5, y: 6 }, { x: 6, y: 6 }, { x: 7, y: 6 }]);
  assert.ok(placed.every(building => !building.built && building.progress === 0), 'segments start as independent construction sites');
  assert.ok(placed.every(building => state.map[building.y][building.x].buildingId === building.id),
    'every segment occupies only its own tile immediately');
  assert.equal(state.resources.wood, woodBefore - buildings.BUILDING_DEFS.palisade.cost.wood * 4,
    'the line charges the sum of all segment costs exactly once');
}

// ── 어떤 칸 하나라도 실패하면 전체 배치는 자원·ID·지도까지 불변이다 ──
for (const { setup, line, label } of [
  {
    setup: state => { addBuiltWall(state, 'palisade', 5, 5); },
    line: [3, 5, 6, 5], label: 'occupied segment',
  },
  {
    setup: state => { state.resources.wood = buildings.BUILDING_DEFS.palisade.cost.wood * 2; },
    line: [3, 5, 6, 5], label: 'insufficient aggregate resources',
  },
  {
    setup: () => {}, line: [-1, 5, 2, 5], label: 'out-of-map segment',
  },
  {
    setup: state => {
      state.foreignSites.push({ id: 1, discovered: true, x: 5, y: 5, width: 1, height: 1 });
    },
    line: [3, 5, 6, 5], label: 'foreign site segment',
  },
]) {
  const state = freshState();
  setup(state);
  const before = snapshotPlacement(state);
  const result = simulation.tryPlaceWallLine(state, 'palisade', ...line);
  assert.ok(result, `${label} reports an error`);
  assert.equal(snapshotPlacement(state), before, `${label} leaves the line placement fully atomic`);
}

// ── 숲은 승인 전 원자적으로 대기하고, 승인 뒤에는 벌목장 작업영역과 관계없이 공사터가 된다 ──
{
  const state = freshState();
  state.map[10][10].terrain = 'forest';
  state.map[10][12].terrain = 'forest';
  // 반경 밖에 일부러 벌목장을 둬도 공사터 벌목은 clearing crew가 우선한다.
  addBuiltWall(state, 'lumberCamp', 1, 1);
  const before = snapshotPlacement(state);
  assert.equal(simulation.tryPlaceWallLine(state, 'palisade', 10, 10, 12, 10), simulation.CLEARING_APPROVAL_REQUIRED,
    'forest line asks for one all-or-nothing clearing approval');
  assert.equal(snapshotPlacement(state), before, 'rejecting approval mutates nothing');

  assert.equal(simulation.tryPlaceWallLine(state, 'palisade', 10, 10, 12, 10, { approveClearing: true }), null);
  const line = state.buildings.filter(building => building.type === 'palisade');
  assert.equal(line.length, 3);
  assert.deepEqual(line.flatMap(building => clearing.pendingClearingTiles(state, building).map(tile => [tile.x, tile.y])),
    [[10, 10], [12, 10]], 'forest segments await clearing while clear segments can build');
  const crew = state.residents.filter(resident => resident.alive).slice(0, 2);
  for (const resident of crew) resident.job = 'woodcutter';
  const assignments = clearing.assignClearingCrews(state, crew);
  assert.ok(line.some(building => [...assignments.values()].includes(building.id)),
    'construction clearing receives crews even outside lumber-camp work range');
}

// ── 성문은 완공·미파손 고체 성벽의 전환 공사이고, 등급별 차액만 받는다 ──
for (const [type, extraCost] of [
  ['palisade', { wood: 1 }],
  ['earthFort', { wood: 3, tools: 1 }],
  ['stoneWall', { wood: 4, iron: 1, tools: 1 }],
]) {
  const state = freshState();
  const wall = addBuiltWall(state, type, 8, 8);
  const before = { ...state.resources };
  assert.equal(simulation.startGateConversion(state, wall.id), null, `${type} starts gate conversion`);
  assert.equal(wall.type, type, 'the original wall remains in place during conversion');
  assert.equal(agents.isPassable(state, 8, 8), false, 'conversion never opens a temporary passage');
  assert.equal(wall.gateWallType, type, 'conversion retains the base wall grade for the future gate');
  for (const [resource, amount] of Object.entries(extraCost)) {
    assert.equal(state.resources[resource], before[resource] - amount, `${type} charges its positive gate delta`);
  }
  assert.equal(simulation.cancelGateConversion(state, wall.id), null, 'conversion can be cancelled');
  assert.equal(wall.type, type, 'cancellation restores/retains the original solid wall');
  assert.equal(wall.gateWallType, undefined, 'cancelled conversion leaves no gate metadata');
  assert.deepEqual(state.resources, before, 'cancellation refunds the full extra conversion cost');
}

// ── 실제 건축가 틱이 전환을 끝내고, 성문의 방어도·철거 환급은 기반 벽을 따른다 ──
for (const type of ['earthFort', 'stoneWall']) {
  const state = freshState(type === 'earthFort' ? 2026080202 : 2026080203);
  const wall = addBuiltWall(state, type, 8, 8);
  const defenseBefore = buildings.computeDefense(state);
  assert.equal(simulation.startGateConversion(state, wall.id), null);
  assert.equal(agents.isPassable(state, wall.x, wall.y), false, 'a converting wall stays impassable');
  finishGateConversion(state, wall);
  assert.equal(wall.gateWallType, type, 'completed gate retains its source wall grade');
  assert.equal(agents.isPassable(state, wall.x, wall.y), true, 'completed gate is passable to residents');
  assert.equal(buildings.computeDefense(state), defenseBefore,
    'completed gate contributes the same building defense as its source wall');

  const resourcesBeforeDemolition = { ...state.resources };
  const invested = buildings.buildingCostForInstance(wall);
  assert.equal(simulation.demolishBuilding(state, wall.x, wall.y), null, 'converted gate can be demolished as a wall-family building');
  for (const [resource, amount] of Object.entries(invested)) {
    const expectedRefund = Math.max(1, Math.floor(amount / 2));
    assert.equal(state.resources[resource], resourcesBeforeDemolition[resource] + expectedRefund,
      `${type}-based gate refunds half of original wall plus conversion investment`);
  }
  assert.equal(state.map[8][8].buildingId, null, 'demolition frees the converted gate tile');
}

// 전환 대상 검증: 빈 땅, 미완공 벽, 이미 파손된 벽은 자원과 상태를 바꾸면 안 된다.
for (const target of ['empty', 'unfinished', 'breached']) {
  const state = freshState();
  const wall = target === 'empty' ? null : addBuiltWall(state, 'palisade', 8, 8, target === 'breached' ? { breached: true } : {});
  if (target === 'unfinished') { wall.built = false; wall.progress = 0; }
  const before = snapshotPlacement(state);
  const result = simulation.startGateConversion(state, wall?.id ?? 999_999);
  assert.ok(result, `${target} target is rejected`);
  assert.equal(snapshotPlacement(state), before, `${target} conversion rejection is atomic`);
}

// 구 저장 성문은 목책 기반으로 보정하고, 진행 중 전환은 비용·공정을 왕복 보존한다.
{
  const state = freshState();
  const legacyGate = addBuiltWall(state, 'gate', 8, 8);
  installStorage();
  localStorage.setItem('buksae-save-v3', JSON.stringify(state));
  const loaded = saveLoad.loadGame();
  const normalizedGate = loaded?.buildings.find(building => building.id === legacyGate.id);
  assert.equal(normalizedGate?.gateWallType, 'palisade', 'legacy grade-less gates normalize to palisade');
}

{
  const state = freshState();
  const wall = addBuiltWall(state, 'stoneWall', 9, 9);
  assert.equal(simulation.startGateConversion(state, wall.id), null);
  wall.gateConversion.progress = 0.75;
  installStorage();
  assert.equal(saveLoad.saveGame(state), true);
  const loaded = saveLoad.loadGame();
  const restored = loaded?.buildings.find(building => building.id === wall.id);
  assert.equal(restored?.type, 'stoneWall');
  assert.equal(restored?.gateWallType, 'stoneWall');
  assert.equal(restored?.gateConversion?.wallType, 'stoneWall');
  assert.equal(restored?.gateConversion?.progress, 0.75);
  assert.deepEqual(restored?.gateConversion?.paidCost, { wood: 4, iron: 1, tools: 1 });
}

console.log('wall drag and gate conversion tests passed');
