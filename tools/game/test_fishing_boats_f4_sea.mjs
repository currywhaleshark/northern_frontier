import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-fishing-boats-f4-'));
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
const seaConditions = await load('seaConditions');
const simulation = await load('simulation');
const workerSlots = await load('workerSlots');
const { CONFIG } = await load('config');

function seedForCondition(condition, day = 15, weather = 'rain') {
  for (let seed = 1; seed < 20000; seed++) {
    if (seaConditions.seaConditionForDay(seed, day, weather) === condition) return seed;
  }
  throw new Error(`seed not found for ${condition}`);
}

function plainMap(width, height) {
  return Array.from({ length: height }, (_row, y) => Array.from({ length: width }, (_cell, x) => ({
    x, y, terrain: 'plain', hasIron: false, buildingId: null,
  })));
}

function makeSeaState(condition = 'calm', day = 15, weather = 'rain') {
  const seed = seedForCondition(condition, day, weather);
  const state = simulation.newGameFromOptions({ region: 'coast', seed });
  state.map = plainMap(18, 14);
  for (let y = 3; y <= 12; y++) for (let x = 1; x <= 16; x++) state.map[y][x].terrain = 'sea';
  state.exploration.explored = state.map.map(row => row.map(() => true));
  state.buildings = [];
  state.fishingBoats = [];
  state.nextFishingBoatId = 2;
  state.rank = 'bo';
  state.day = day;
  state.subTick = 9;
  state.weather = weather;
  const port = {
    id: 200, type: 'fishingPort', x: 3, y: 2,
    progress: buildings.BUILDING_DEFS.fishingPort.buildDays, built: true, fieldGrowth: 0,
    gatheringWorkArea: { x: 8, y: 7, radius: 9 }, inventory: {},
  };
  state.buildings.push(port);
  buildings.occupyBuildingTiles(state, port);
  state.fishingGrounds = [
    { id: 'sea:shore:test', kind: 'sea', depthBand: 'shore', x: 3, y: 3, radius: 1,
      tiles: [{ x: 3, y: 3 }], stock: 20, capacity: 20, recoveryPerDay: 1 },
    { id: 'sea:mid:test', kind: 'sea', depthBand: 'mid', x: 6, y: 5, radius: 3,
      tiles: [{ x: 6, y: 5 }], stock: 30, capacity: 30, recoveryPerDay: 2 },
    { id: 'sea:deep:test', kind: 'sea', depthBand: 'deep', x: 10, y: 8, radius: 5,
      tiles: [{ x: 10, y: 8 }], stock: 40, capacity: 40, recoveryPerDay: 3 },
  ];
  for (const resident of state.residents) resident.alive = false;
  const fisher = state.residents[0];
  Object.assign(fisher, {
    alive: true, sick: false, health: 100, hunger: 100, warmth: 100, morale: 70,
    job: 'fisher', assignedBuildingId: port.id, x: port.x, y: port.y, px: port.x, py: port.y,
    phase: 'rest', path: [], workTimer: 0, targetId: null, carrying: {}, manualOrder: null,
    fishingBoatId: null, skills: {},
  });
  const boat = {
    id: 1, portId: port.id, boatyardId: null, fisherId: null, x: 3, y: 3,
    cargoFish: 0, cargoCapacity: CONFIG.fishingBoats.cargoCapacity,
    durability: CONFIG.fishingBoats.durability, maxDurability: CONFIG.fishingBoats.durability,
    status: 'moored', route: [], routeIndex: 0,
  };
  state.fishingBoats.push(boat);
  return { state, port, fisher, boat };
}

const calmSeed = seedForCondition('calm');
assert.equal(seaConditions.seaConditionForDay(calmSeed, 15, 'rain'), 'calm');
assert.equal(seaConditions.seaConditionForDay(calmSeed, 15, 'rain'), 'calm',
  '해상 상태는 같은 시드·날짜·날씨에서 결정적이다');
const forecast = seaConditions.forecastSeaCondition({ seed: calmSeed, day: 15 });
assert.equal(forecast.day, 16);
assert.equal(forecast.condition, seaConditions.seaConditionForDay(calmSeed, 16, forecast.weather),
  '내일 포구 예보도 실제 다음 날 해상 상태와 일치한다');

{
  const calm = makeSeaState('calm');
  const rough = makeSeaState('rough');
  const calmPlan = boats.seaFishingTripPlan(calm.state, calm.boat, 36);
  const roughPlan = boats.seaFishingTripPlan(rough.state, rough.boat, 36);
  assert.ok(calmPlan && roughPlan, '잔잔하거나 거친 바다는 출항할 수 있다');
  assert.ok(roughPlan.expectedDurabilityCost > calmPlan.expectedDurabilityCost,
    '거친 물결은 같은 거리와 어획의 예상 내구 소모를 늘린다');
}

{
  const storm = makeSeaState('storm');
  assert.equal(boats.seaFishingTripPlan(storm.state, storm.boat, 36), null,
    '풍랑일에는 신규 출항을 취소한다');
  assert.equal(workerSlots.assignResidentToBuilding(storm.state, storm.fisher.id, storm.port.id), null);
  const shoreBefore = storm.state.fishingGrounds[0].stock;
  for (let tick = 0; tick < 12; tick++) simulation.advanceTick(storm.state);
  assert.equal(storm.boat.status, 'moored', '풍랑 중에도 계류 어선은 출항하지 않는다');
  assert.ok(storm.state.fishingGrounds[0].stock < shoreBefore,
    `풍랑 출항 취소 시 포구 어부의 안전한 연안 낚시는 남는다 (${storm.fisher.task})`);
}

{
  const winter = makeSeaState('calm', 37, 'clear');
  assert.ok(boats.seaFishingTripPlan(winter.state, winter.boat, 36),
    '바다는 겨울에도 얼지 않아 해상 상태가 좋으면 출항한다');
}

function completeTrip(condition) {
  const setup = makeSeaState(condition);
  const { state, port, fisher, boat } = setup;
  const durabilityBefore = boat.durability;
  assert.equal(boats.boardFishingBoat(state, boat.id, fisher.id), null);
  assert.equal(boats.startFishingBoatTrip(state, boat.id, 36), null);
  for (let tick = 0; tick < 80 && boat.status !== 'moored' && boat.status !== 'disabled'; tick++) {
    boats.advanceFishingBoatTrip(state, boat.id);
  }
  assert.ok((port.inventory?.fish ?? 0) > 0);
  return durabilityBefore - boat.durability;
}

const calmLoss = completeTrip('calm');
const roughLoss = completeTrip('rough');
assert.ok(roughLoss > calmLoss, '거친 물결은 실제 왕복·조업 내구 소모도 늘린다');

{
  let injured = false;
  let verifiedStormReturn = false;
  for (let seed = 1; seed < 20000 && !injured; seed++) {
    if (seaConditions.seaConditionForDay(seed, 15, 'rain') !== 'storm') continue;
    const { state, fisher, boat } = makeSeaState('calm');
    state.seed = seed;
    state.weather = 'rain';
    boat.fisherId = fisher.id;
    boat.status = 'fishing';
    boat.x = 10;
    boat.y = 8;
    boat.targetGroundId = 'sea:deep:test';
    boat.tripDepthBand = 'deep';
    boat.tripCatchTarget = 8;
    fisher.fishingBoatId = boat.id;
    fisher.x = boat.x;
    fisher.y = boat.y;
    const durabilityBefore = boat.durability;
    boats.advanceFishingBoatTrip(state, boat.id);
    verifiedStormReturn ||= boat.status === 'returning' && boat.durability < durabilityBefore;
    injured = fisher.health < 100;
  }
  assert.equal(verifiedStormReturn, true, '출어 중 풍랑은 즉시 귀항시키고 선체를 추가 파손한다');
  assert.equal(injured, true, '결정론적 풍랑 판정에는 드문 어부 부상 가능성이 있다');
}

console.log('fishing boats F4 sea tests passed');
