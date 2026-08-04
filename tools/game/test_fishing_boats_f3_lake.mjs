import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-fishing-boats-f3-'));
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

function built(id, type, x, y, overrides = {}) {
  return {
    id, type, x, y, progress: buildings.BUILDING_DEFS[type].buildDays, built: true, fieldGrowth: 0, ...overrides,
  };
}

function makeLakeState() {
  const state = simulation.newGameFromOptions({ region: 'lake', seed: 2026080303 });
  state.map = plainMap(18, 14);
  for (let y = 3; y <= 12; y++) for (let x = 1; x <= 16; x++) state.map[y][x].terrain = 'lake';
  state.exploration.explored = state.map.map(row => row.map(() => true));
  state.buildings = [];
  state.fishingBoats = [];
  state.nextFishingBoatId = 2;
  state.rank = 'bo';
  state.day = 7;
  state.subTick = 9;
  const port = built(100, 'fishingPort', 3, 2, {
    gatheringWorkArea: { x: 8, y: 7, radius: 9 }, inventory: {}, portPier: { direction: 's', length: 3 },
  });
  state.buildings.push(port);
  buildings.occupyBuildingTiles(state, port);
  state.fishingGrounds = [
    { id: 'lake:shore:test', kind: 'lake', depthBand: 'shore', x: 3, y: 3, radius: 1,
      tiles: [{ x: 3, y: 3 }], stock: 10, capacity: 10, recoveryPerDay: 1 },
    { id: 'lake:mid:test', kind: 'lake', depthBand: 'mid', x: 6, y: 5, radius: 3,
      tiles: [{ x: 6, y: 5 }], stock: 30, capacity: 30, recoveryPerDay: 2 },
    { id: 'lake:deep:test', kind: 'lake', depthBand: 'deep', x: 10, y: 8, radius: 5,
      tiles: [{ x: 10, y: 8 }], stock: 40, capacity: 40, recoveryPerDay: 3 },
  ];
  const fisher = state.residents[0];
  for (const resident of state.residents) resident.alive = false;
  Object.assign(fisher, {
    alive: true, sick: false, health: 100, hunger: 100, warmth: 100, morale: 70,
    job: 'fisher', assignedBuildingId: null, x: port.x, y: port.y, px: port.x, py: port.y,
    phase: 'rest', path: [], workTimer: 0, targetId: null, carrying: {}, manualOrder: null,
    fishingBoatId: null, skills: {},
  });
  const boat = {
    id: 1, portId: port.id, mooringSlot: 0, boatyardId: null, fisherIds: [fisher.id], x: 3, y: 3,
    cargoFish: 0, cargoCapacity: CONFIG.fishingBoats.cargoCapacity,
    durability: CONFIG.fishingBoats.durability, maxDurability: CONFIG.fishingBoats.durability,
    status: 'moored', route: [], routeIndex: 0,
  };
  state.fishingBoats.push(boat);
  return { state, port, fisher, boat };
}

assert.equal(boats.lakeFishingDepartureAllowed(1), false, '봄 1일은 심수 출항을 막는다');
assert.equal(boats.lakeFishingDepartureAllowed(6), false, '봄 6일까지 심수 출항을 막는다');
assert.equal(boats.lakeFishingDepartureAllowed(7), true, '봄 7일부터 호수 심수 출항을 연다');
assert.equal(boats.lakeFishingDepartureAllowed(37), false, '겨울에는 전 기간 출항을 막는다');
assert.ok(boats.fishingBoatExpectedCatch('deep', 20) > boats.fishingBoatExpectedCatch('mid', 8),
  '멀고 깊은 어장의 목표 어획이 더 크다');

{
  const { state, port, fisher, boat } = makeLakeState();
  const plan = boats.lakeFishingTripPlan(state, boat, 36);
  assert.ok(plan, '근무시간 안에 왕복 가능한 호수 어장을 찾는다');
  assert.ok(plan.depthBand === 'mid' || plan.depthBand === 'deep');
  assert.notEqual(plan.groundId, 'lake:shore:test', '어선은 연안 어장을 표적으로 삼지 않는다');
  assert.ok(plan.requiredSubticks <= 36);
  assert.ok(plan.expectedDurabilityCost > 0);
  assert.equal(boats.lakeFishingTripPlan(state, { ...boat, durability: 20 }, 36), null,
    '최소 출항 내구 미만 선체는 출어하지 않는다');
  assert.equal(boats.lakeFishingTripPlan(state, boat, 3), null,
    '일몰 전 왕복할 수 없는 항로는 제외한다');

  const shoreBefore = state.fishingGrounds[0].stock;
  const deepStockBefore = state.fishingGrounds.slice(1).reduce((sum, ground) => sum + ground.stock, 0);
  const durabilityBefore = boat.durability;
  assert.equal(boats.boardFishingBoat(state, boat.id, fisher.id), null);
  assert.equal(fisher.x, boat.x, '승선 즉시 어부 위치를 선체와 맞춘다');
  assert.equal(boats.startLakeFishingTrip(state, boat.id, 36), null);
  const departure = { x: boat.x, y: boat.y };
  boats.advanceLakeFishingTrip(state, boat.id);
  assert.deepEqual({ x: boat.px, y: boat.py }, departure,
    '항행 선체는 직전 타일을 보존해 프레임 사이를 부드럽게 보간한다');
  let visitedFishing = false;
  for (let tick = 0; tick < 80 && boat.status !== 'moored' && boat.status !== 'disabled'; tick++) {
    boats.advanceLakeFishingTrip(state, boat.id);
    visitedFishing ||= boat.status === 'fishing';
  }
  const deepStockAfter = state.fishingGrounds.slice(1).reduce((sum, ground) => sum + ground.stock, 0);
  assert.equal(visitedFishing, true, '어선이 실제 어장 타일까지 항행해 조업한다');
  assert.ok(deepStockAfter < deepStockBefore, '중·심수 공유 비축을 실제로 차감한다');
  assert.equal(state.fishingGrounds[0].stock, shoreBefore, '항행 중 지나간 연안 어장 비축은 건드리지 않는다');
  assert.ok((port.inventory?.fish ?? 0) > 0, '귀항한 선체 적재를 포구 재고에 하역한다');
  assert.ok(boat.durability < durabilityBefore, '왕복 거리와 조업량만큼 내구가 감소한다');
  assert.equal(boat.cargoFish, 0);
  assert.equal(fisher.fishingBoatId, null, '하역 뒤 어부가 육지로 하선한다');
}

{
  const { state, port, fisher, boat } = makeLakeState();
  const secondFisher = state.residents[1];
  Object.assign(secondFisher, {
    alive: true, sick: false, health: 100, hunger: 100, warmth: 100, morale: 70,
    job: 'fisher', assignedBuildingId: null, x: port.x, y: port.y, px: port.x, py: port.y,
    phase: 'rest', path: [], workTimer: 0, targetId: null, carrying: {}, manualOrder: null,
    fishingBoatId: null, skills: {},
  });
  boat.fisherIds.push(secondFisher.id);
  simulation.advanceTick(state);
  assert.equal(fisher.fishingBoatId, boat.id);
  assert.equal(secondFisher.fishingBoatId, boat.id, '배정된 두 어부가 같은 서브틱에 함께 승선한다');
  simulation.advanceTick(state);
  assert.ok(boat.status === 'underway' || boat.status === 'fishing',
    `포구 배정 어부가 가동 가능한 어선을 자동으로 타고 출항한다 (${boat.status}, ${fisher.task})`);
}

{
  const { state, fisher, boat } = makeLakeState();
  assert.equal(boats.boardFishingBoat(state, boat.id, fisher.id), null);
  assert.equal(boats.startLakeFishingTrip(state, boat.id, 36), null);
  boats.advanceLakeFishingTrip(state, boat.id);
  const savedStatus = boat.status;
  const savedX = boat.x;
  const savedY = boat.y;
  assert.equal(saveLoad.saveGame(state, 8), true);
  const loaded = saveLoad.loadGame(8);
  assert.ok(loaded);
  const loadedBoat = loaded.fishingBoats[0];
  const loadedFisher = loaded.residents.find(resident => resident.id === fisher.id);
  assert.equal(loaded.schemaVersion, 61);
  assert.equal(loadedBoat.status, savedStatus);
  assert.equal(loadedBoat.x, savedX);
  assert.equal(loadedBoat.y, savedY);
  assert.ok(loadedBoat.targetGroundId);
  assert.equal(loadedFisher.fishingBoatId, loadedBoat.id);
  assert.equal(loadedFisher.x, loadedBoat.x, '로드 보정이 승선 어부를 물 밖으로 밀어내지 않는다');
  assert.equal(loadedFisher.y, loadedBoat.y);
}

const migrated = saveLoad.migrateV59ToV60({ schemaVersion: 59, fishingBoats: [] });
assert.equal(migrated.schemaVersion, 60);
assert.equal(saveLoad.migrateV60ToV61(migrated).schemaVersion, 61);

console.log('fishing boats F3 lake tests passed');
