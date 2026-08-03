import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-fishing-boats-f2-'));
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
const boats = await load('fishingBoats');
const buildings = await load('buildings');
const saveLoad = await load('saveLoad');
const simulation = await load('simulation');
const { CONFIG } = await load('config');

assert.equal(boats.fishingBoatFacingForStep(1, 0), 'ne');
assert.equal(boats.fishingBoatFacingForStep(-1, 0), 'sw');
assert.equal(boats.fishingBoatFacingForStep(0, 1), 'se');
assert.equal(boats.fishingBoatFacingForStep(0, -1), 'nw');

const savedSlots = new Map();
globalThis.localStorage = {
  getItem: key => savedSlots.get(key) ?? null,
  setItem: (key, value) => savedSlots.set(key, String(value)),
  removeItem: key => savedSlots.delete(key),
};

function plainMap(width, height) {
  return Array.from({ length: height }, (_row, y) => Array.from({ length: width }, (_cell, x) => ({
    x, y, terrain: 'plain', hasIron: false, buildingId: null,
  })));
}

function built(id, type, x, y) {
  return { id, type, x, y, progress: buildings.BUILDING_DEFS[type].buildDays, built: true, fieldGrowth: 0 };
}

const state = simulation.newGameFromOptions({ region: 'lake', seed: 20260892 });
state.map = plainMap(14, 10);
for (let y = 4; y <= 6; y++) for (let x = 1; x <= 12; x++) state.map[y][x].terrain = 'lake';
state.exploration.explored = state.map.map(row => row.map(() => true));
state.buildings = [];
state.fishingBoats = [];
state.nextFishingBoatId = 1;
state.resources.wood = 100;
state.resources.tools = 20;

assert.equal(buildings.canPlaceBuildingAt(state, 'fishingPort', 3, 3), true,
  '호수 포구채는 평지에 놓이고 잔교가 물 위로 세 칸 뻗는다');
assert.deepEqual(boats.fishingPortPierAt(state.map, 3, 3), { direction: 's', length: 3 });
assert.deepEqual(
  buildings.buildingFootprintTiles(state, 'fishingPort', 3, 3).map(tile => [tile.x, tile.y]),
  [[3, 3], [3, 4], [3, 5], [3, 6]],
  '포구채와 잔교 세 칸은 하나의 비직사각 파츠 목록이다',
);
assert.equal(buildings.canPlaceBuildingAt(state, 'fishingPort', 3, 1), false,
  '포구는 물에서 떨어진 내륙에 놓이지 않는다');
assert.equal(buildings.canPlaceBuildingAt(state, 'boatyard', 8, 2), true,
  '2×2 배무이터도 발자국 한 변이 호수에 닿으면 놓인다');

const coastMap = plainMap(10, 10);
for (let x = 0; x < 10; x++) coastMap[4][x].terrain = 'mudflat';
for (let y = 5; y < 10; y++) for (let x = 0; x < 10; x++) coastMap[y][x].terrain = 'sea';
const coastState = {
  ...state,
  map: coastMap,
  buildings: [],
  fishingGrounds: [],
  exploration: { ...state.exploration, explored: coastMap.map(row => row.map(() => true)) },
  rank: 'bo',
  resources: { ...state.resources, wood: 100, stone: 100, tools: 20 },
};
assert.deepEqual(boats.fishingPortPierAt(coastMap, 5, 2), { direction: 's', length: 3 },
  '바다 포구 잔교는 모래 해안 띠와 갯벌을 지나 수면에 닿는다');
assert.equal(buildings.canPlaceBuildingAt(coastState, 'fishingPort', 5, 2), true);
assert.equal(buildings.canPlaceBuildingAt(coastState, 'fishingPort', 5, 3), false,
  '모래로 보이는 해안 타일에는 포구 본채를 놓지 않는다');
coastMap[4][5].buildingId = 999;
assert.equal(buildings.canPlaceBuildingAt(coastState, 'fishingPort', 5, 2), false,
  '잔교 파츠 한 칸이라도 점유되어 있으면 전체 배치를 막는다');
coastMap[4][5].buildingId = null;
assert.equal(simulation.tryPlaceBuilding(coastState, 'fishingPort', 5, 2), null);
const compositePort = coastState.buildings.find(building => building.type === 'fishingPort');
assert.ok(compositePort);
assert.deepEqual(compositePort?.portPier, { direction: 's', length: 3 },
  '신축 포구는 선택된 잔교 방향과 길이를 저장한다');
assert.ok(
  buildings.footprintTilesOf(coastState, compositePort).every(tile => tile.buildingId === compositePort.id),
  '포구채·잔교·계류대가 같은 건물 ID로 점유된다',
);
assert.equal(saveLoad.saveGame(coastState, 8), true);
const loadedCompositePort = saveLoad.loadGame(8).buildings.find(building => building.type === 'fishingPort');
assert.deepEqual(loadedCompositePort?.portPier, { direction: 's', length: 3 },
  '저장/불러오기 뒤에도 복합 포구 잔교가 보존된다');

const port = built(100, 'fishingPort', 3, 3);
const yard = built(101, 'boatyard', 8, 2);
state.buildings.push(port, yard);

const route = boats.fishingBoatRoute(state.map, { x: 3, y: 4 }, { x: 9, y: 4 });
assert.ok(route.length >= 7, '같은 호수 안에서 결정적인 4방향 수상 경로를 찾는다');
state.map[4][7].terrain = 'plain';
state.map[5][7].terrain = 'plain';
state.map[6][7].terrain = 'plain';
assert.deepEqual(boats.fishingBoatRoute(state.map, { x: 3, y: 4 }, { x: 9, y: 4 }), [],
  '육지로 완전히 갈라진 수역 사이에는 어선 경로가 없다');
for (let y = 4; y <= 6; y++) state.map[y][7].terrain = 'lake';

const beforeWood = state.resources.wood;
const beforeTools = state.resources.tools;
assert.equal(boats.startFishingBoatConstruction(state, yard.id), null);
assert.equal(state.resources.wood, beforeWood - CONFIG.fishingBoats.buildWood);
assert.equal(state.resources.tools, beforeTools - CONFIG.fishingBoats.buildTools);
assert.equal(yard.boatWorkOrder.kind, 'build');
assert.equal(state.priorityBuildingId, yard.id, '어선 공정은 건축가 최우선 작업으로 잡힌다');
assert.equal(simulation.buildingHasActiveWork(yard), true);
assert.equal(boats.advanceFishingBoatWork(state, yard, CONFIG.fishingBoats.buildWorkDays), 'built');
assert.equal(state.fishingBoats.length, 1);
assert.equal(state.fishingBoats[0].portId, port.id);
assert.ok(['ne', 'nw', 'se', 'sw'].includes(state.fishingBoats[0].facing));
assert.equal(state.map[state.fishingBoats[0].y][state.fishingBoats[0].x].terrain, 'lake');
assert.equal(state.priorityBuildingId, null);

const fisher = state.residents[0];
Object.assign(fisher, {
  alive: true, job: 'fisher', assignedBuildingId: port.id,
  x: port.x, y: port.y, px: port.x, py: port.y, path: [], fishingBoatId: null,
});
const boat = state.fishingBoats[0];
assert.equal(boats.boardFishingBoat(state, boat.id, fisher.id), null);
assert.equal(boat.fisherId, fisher.id);
assert.equal(fisher.fishingBoatId, boat.id);
assert.match(boats.boardFishingBoat(state, boat.id, fisher.id), /계류/);
assert.equal(boats.disembarkFishingBoat(state, boat.id), null);
assert.equal(fisher.fishingBoatId, null);
assert.equal(boat.status, 'moored');

boat.durability = 37;
const repairWood = state.resources.wood;
assert.equal(boats.startFishingBoatRepair(state, yard.id, boat.id), null);
assert.equal(state.resources.wood, repairWood - CONFIG.fishingBoats.repairWood);
assert.equal(boat.status, 'repairing');
assert.equal(boats.advanceFishingBoatWork(state, yard, CONFIG.fishingBoats.repairWorkDays), 'repaired');
assert.equal(boat.durability, boat.maxDurability);
assert.equal(boat.status, 'moored');

const migrated = saveLoad.migrateV58ToV59({ schemaVersion: 58 });
assert.equal(migrated.schemaVersion, 59);
assert.deepEqual(migrated.fishingBoats, []);
assert.equal(migrated.nextFishingBoatId, 1);

boat.fisherId = 999999;
boat.status = 'boarded';
boats.normalizeFishingBoats(state);
boat.facing = 'invalid';
boats.normalizeFishingBoats(state);
assert.equal(boat.facing, 'ne', '구 저장이나 손상된 방향 값은 NE로 정규화한다');
assert.equal(boat.fisherId, null, '로드 정규화는 사라진 어부와 선체 관계를 끊는다');
assert.equal(boat.status, 'moored');
assert.ok(state.nextFishingBoatId > boat.id);

assert.equal(saveLoad.saveGame(state, 7), true);
const loaded = saveLoad.loadGame(7);
assert.ok(loaded);
assert.equal(loaded.schemaVersion, 60);
assert.equal(loaded.fishingBoats.length, 1);
assert.equal(loaded.fishingBoats[0].id, boat.id);
assert.equal(loaded.fishingBoats[0].portId, port.id);
assert.equal(loaded.fishingBoats[0].durability, boat.maxDurability);

console.log('fishing boats F2 tests passed');
