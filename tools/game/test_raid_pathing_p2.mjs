import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

// 브라우저·렌더러 없이 게임 상태의 침입 경로 계약만 검증한다.
function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-raid-pathing-p2-'));
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
const raidRoutes = await load('raidRoutes');
const forestGrowth = await load('forestGrowth');
const walls = await load('walls');
const raids = await load('raids');
const agents = await load('agents');
const saveLoad = await load('saveLoad');
const constants = await load('constants');
const { CONFIG } = await load('config');

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

function freshState(seed = 2026080301) {
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

function addBuilt(state, type, x, y, extra = {}) {
  const building = {
    id: state.nextBuildingId++, type, x, y,
    progress: buildings.BUILDING_DEFS[type].buildDays,
    built: true, fieldGrowth: 0, ...extra,
  };
  state.buildings.push(building);
  buildings.occupyBuildingTiles(state, building);
  return building;
}

function lineWall(state, x, fromY, toY, type = 'palisade') {
  for (let y = fromY; y <= toY; y++) addBuilt(state, type, x, y);
}

function interiorHas(interior, x, y) {
  return interior.has(`${x},${y}`);
}

// 성목 비용은 침입 경로에만 적용한다. 한 줄 복도에서는 성목만 비용이 올라가고
// 어린나무는 평지와 동치여야 한다.
{
  const plain = freshState(2026080302);
  const young = freshState(2026080303);
  const mature = freshState(2026080304);
  for (const state of [plain, young, mature]) {
    for (let y = 0; y < state.map.length; y++) {
      for (let x = 0; x < state.map[y].length; x++) {
        if (y !== 10 || x < 2 || x > 25) state.map[y][x].terrain = 'mountain';
      }
    }
  }
  forestGrowth.setTreeStage(young.map[10][13], 'young');
  forestGrowth.setTreeStage(mature.map[10][13], 'mature');

  const start = { x: 2, y: 10 };
  const target = { x: 25, y: 10 };
  const plainPlan = raidRoutes.planRaidRoute(plain, start, target, 40);
  const youngPlan = raidRoutes.planRaidRoute(young, start, target, 40);
  const maturePlan = raidRoutes.planRaidRoute(mature, start, target, 40);
  assert.equal(youngPlan.totalCost, plainPlan.totalCost, 'young trees cost the same as plain terrain to raiders');
  assert.equal(maturePlan.totalCost - plainPlan.totalCost, Math.round(10 * 2.0) - 10,
    'one cardinal mature-forest step applies the tuned 2.0 multiplier exactly');
  assert.ok(maturePlan.steps.some(step => step.x === 13 && step.y === 10), 'the forced route crosses the mature tree tile');
  const residentPath = state => agents.findPath(
    state, start.x, start.y,
    tile => tile.x === target.x && tile.y === target.y,
    (x, y) => agents.isPassable(state, x, y),
  );
  assert.deepEqual(residentPath(mature), residentPath(plain),
    'mature-forest weighting does not alter the resident A* route');
}

// 벽을 피해 도는 개방 경로에는 선택 평가용 부담을 더해 경계선의 중규모 무리를
// 공성으로 유도하되, 소규모 무리의 넓은 우회 허용 성향은 유지한다.
{
  const open = { steps: [], breaches: [], totalCost: 149, kind: 'open' };
  const assault = { steps: [], breaches: [{ buildingId: 1, x: 0, y: 0 }], totalCost: 100, kind: 'assault' };
  assert.equal(CONFIG.raidPathing.openRouteDetourCostMultiplier, 1.1,
    'open detours receive the tuned 10% route-selection surcharge');
  assert.equal(raidRoutes.selectRaidRoute(open, assault, 40).kind, 'assault',
    'the detour surcharge tips a borderline medium party toward assault');
  assert.equal(raidRoutes.selectRaidRoute(open, assault, 29).kind, 'open',
    'small parties retain enough detour budget to use the same opening');
}

// 공격 경로도 두 벽 모서리 사이를 대각선으로 무상 통과할 수 없다.
{
  const state = freshState(2026080311);
  for (const row of state.map) for (const tile of row) tile.terrain = 'mountain';
  state.map[4][4].terrain = 'plain';
  state.map[5][5].terrain = 'plain';
  state.map[4][5].terrain = 'plain';
  state.map[5][4].terrain = 'plain';
  addBuilt(state, 'palisade', 5, 4);
  addBuilt(state, 'palisade', 4, 5);
  const cornerPlan = raidRoutes.planRaidRoute(state, { x: 4, y: 4 }, { x: 5, y: 5 }, 60);
  assert.ok(cornerPlan && cornerPlan.breaches.length >= 1,
    'crossing a two-wall corner requires an explicit paid breach');
  assert.notDeepEqual(cornerPlan.steps, [{ x: 5, y: 5 }],
    'the assault route cannot jump directly between blocking wall corners');
}

// 외국 거점 둘레의 산·강 출발점은 첫 칸에서 빠져나올 때만 예외를 허용한다.
{
  const state = freshState(2026080312);
  for (const row of state.map) for (const tile of row) tile.terrain = 'mountain';
  for (let x = 3; x <= 12; x++) state.map[10][x].terrain = 'plain';
  state.map[10][3].terrain = 'mountain';
  const start = { x: 3, y: 10 };
  const target = { x: 12, y: 10 };
  assert.equal(raidRoutes.planRaidRoute(state, start, target, 40), null,
    'ordinary map-edge starts still reject mountain tiles');
  assert.ok(raidRoutes.planRaidRoute(state, start, target, 40, { allowBlockedStart: true }),
    'foreign-site origin planning may leave its blocked perimeter start exactly once');
}

// 같은 긴 장벽의 빈틈에 대해 작은 무리는 우회하고 큰 무리는 가까운 약벽을 돌파한다.
{
  const state = freshState(2026080305);
  const start = { x: 3, y: 14 };
  const target = { x: 26, y: 14 };
  // 위쪽의 단 하나의 빈틈은 멀고, 중간 목책은 가까워 돌파/우회 예산을 분명히 만든다.
  lineWall(state, 14, 1, state.map.length - 2);
  const gap = state.buildings.find(building => building.x === 14 && building.y === 1);
  state.buildings = state.buildings.filter(building => building.id !== gap.id);
  state.map[1][14].buildingId = null;

  const small = raidRoutes.planRaidRoute(state, start, target, 29);
  const large = raidRoutes.planRaidRoute(state, start, target, 50);
  assert.equal(small.kind, 'open', 'small party keeps to the long open gap route');
  assert.equal(large.kind, 'assault', 'large party takes the controlled wall breach route');
  assert.equal(large.breaches.length, 1, 'single wall route records one breach target');
  assert.ok(large.breaches[0].x === 14 && large.breaches[0].y > 1,
    'large party selects a nearby wall segment rather than the distant gap');
}

// 두 장벽을 가로지르는 공격 계획은 바깥쪽에서 안쪽으로 모든 돌파 지점을 기록한다.
{
  const state = freshState(2026080306);
  const start = { x: 3, y: 14 };
  const target = { x: 26, y: 14 };
  lineWall(state, 11, 0, state.map.length - 1);
  lineWall(state, 17, 0, state.map.length - 1, 'earthFort');
  const plan = raidRoutes.planRaidRoute(state, start, target, 60);
  assert.equal(plan.kind, 'assault');
  assert.equal(plan.breaches.length, 2, 'multi-wall assault remembers every required breach');
  assert.deepEqual(plan.breaches.map(breach => breach.x), [11, 17],
    'breach list is ordered from the raider approach toward the target');
}

// 가장자리 flood-fill을 막는 완전 고리만 보호 영역을 만든다. 틈·돌파 잔해는 고리를 무효화한다.
{
  const state = freshState(2026080307);
  addBuilt(state, 'center', 14, 13);
  for (let x = 11; x <= 18; x++) {
    addBuilt(state, 'palisade', x, 10);
    addBuilt(state, 'palisade', x, 16);
  }
  for (let y = 11; y <= 15; y++) {
    addBuilt(state, 'palisade', 11, y);
    addBuilt(state, 'palisade', 18, y);
  }
  let interior = raidRoutes.protectedInterior(state);
  assert.ok(interiorHas(interior, 14, 13), 'a complete unbreached ring contains the center');
  assert.equal(interiorHas(interior, 1, 1), false, 'map-edge-reachable exterior is not protected');

  const gateWall = state.buildings.find(building => building.x === 14 && building.y === 10);
  gateWall.type = 'gate';
  gateWall.gateWallType = 'palisade';
  interior = raidRoutes.protectedInterior(state);
  assert.ok(interiorHas(interior, 14, 13), 'a completed closed gate remains part of the protected boundary');
  gateWall.structureIntegrity = 0;
  gateWall.breached = true;
  interior = raidRoutes.protectedInterior(state);
  assert.equal(interiorHas(interior, 14, 13), false, 'zero-integrity breached gate opens the boundary');
  assert.equal(walls.builtWallTileSet(state).has('14,10'), false, 'breached gate also drops out of wall connectivity');
  gateWall.type = 'palisade';
  delete gateWall.gateWallType;
  delete gateWall.structureIntegrity;
  gateWall.breached = false;

  const gapWall = state.buildings.find(building => building.x === 14 && building.y === 10);
  state.buildings = state.buildings.filter(building => building.id !== gapWall.id);
  state.map[10][14].buildingId = null;
  interior = raidRoutes.protectedInterior(state);
  assert.equal(interiorHas(interior, 14, 13), false, 'a gap makes the ring exterior-reachable');

  addBuilt(state, 'palisade', 14, 10, { breached: true });
  interior = raidRoutes.protectedInterior(state);
  assert.equal(interiorHas(interior, 14, 13), false, 'a breached segment also opens the ring');
}

// 두 벽의 실제 돌파는 외벽을 연 뒤에야 내벽을 목표로 삼는다.
{
  const state = freshState(2026080313);
  for (const row of state.map) for (const tile of row) tile.terrain = 'mountain';
  for (let x = 2; x <= 26; x++) state.map[10][x].terrain = 'plain';
  const outer = addBuilt(state, 'palisade', 10, 10);
  const inner = addBuilt(state, 'earthFort', 17, 10);
  addBuilt(state, 'center', 27, 9);
  const route = raidRoutes.planRaidRoute(state, { x: 2, y: 10 }, { x: 25, y: 10 }, 60);
  state.raiders = {
    x: 2, y: 10, px: 2, py: 10, path: [...route.steps], route,
    routeTarget: { x: 25, y: 10 }, routeRevision: state.defenseTopologyRevision,
    phase: 'approaching', power: 60, size: 5,
    faction: constants.FACTIONS[0].name, warned: true, spotted: true,
    siege: false, speed: 1, trail: [],
  };
  for (let tick = 0; tick < 160 && !outer.breached; tick++) raids.raidersTick(state, () => 0);
  assert.equal(outer.breached, true, 'the outer breach completes first');
  assert.equal(inner.structureIntegrity, undefined, 'the inner wall takes no damage before the outer breach opens');
  for (let tick = 0; tick < 80 && state.raiders?.breachTargetId !== inner.id; tick++) raids.raidersTick(state, () => 0);
  assert.equal(state.raiders.breachTargetId, inner.id, 'the second wall becomes the next breach target after replanning');
  assert.equal(inner.breached, undefined);
  for (let tick = 0; tick < 220 && !inner.breached; tick++) raids.raidersTick(state, () => 0);
  assert.equal(inner.breached, true, 'the inner wall is breached only after becoming the active target');
}

// 바깥의 별도 목책은 P2에서 먼저 돌파하고, 중심지 완전 고리의 첫 경계에서만 siege 폴백한다.
{
  const state = freshState(2026080314);
  for (const row of state.map) for (const tile of row) tile.terrain = 'mountain';
  for (let x = 2; x <= 28; x++) state.map[10][x].terrain = 'plain';
  const outer = addBuilt(state, 'palisade', 10, 10);
  for (let x = 20; x <= 27; x++) {
    addBuilt(state, 'palisade', x, 7);
    addBuilt(state, 'palisade', x, 13);
  }
  for (let y = 8; y <= 12; y++) {
    addBuilt(state, 'palisade', 20, y);
    addBuilt(state, 'palisade', 27, y);
  }
  const center = addBuilt(state, 'center', 23, 9);
  const route = raidRoutes.planRaidRoute(state, { x: 2, y: 10 }, { x: 22, y: 10 }, 60);
  assert.equal(raidRoutes.isProtectedBoundaryBreach(state, center, route.breaches[0]), false,
    'an isolated outer wall is not mislabeled as the center protected boundary');
  assert.equal(raidRoutes.isProtectedBoundaryBreach(state, center, route.breaches[1]), true,
    'the following complete-ring wall is the protected boundary');
  state.raiders = {
    x: 2, y: 10, px: 2, py: 10, path: [...route.steps], route,
    routeTarget: { x: 22, y: 10 }, routeRevision: state.defenseTopologyRevision,
    phase: 'approaching', power: 60, size: 5,
    faction: constants.FACTIONS[0].name, warned: true, spotted: true,
    siege: false, speed: 1, trail: [],
  };
  for (let tick = 0; tick < 160 && !outer.breached; tick++) raids.raidersTick(state, () => 0);
  assert.equal(outer.breached, true, 'the isolated outer wall is breached normally');
  for (let tick = 0; tick < 120 && !state.pendingChoice; tick++) raids.raidersTick(state, () => 0);
  const ringWall = state.buildings.find(building => building.x === 20 && building.y === 10);
  assert.equal(state.raiders.siege, true, 'replanning marks siege only when the protected ring becomes first breach');
  assert.equal(ringWall.breached, undefined, 'the protected ring does not auto-breach before the siege choice');
  assert.equal(state.pendingChoice?.kind, 'raid', 'the P3 siege opening choice uses the shared raid modal shell');
  assert.equal(state.pendingChoice?.data.longSiegeChoice, 'initial', 'the protected ring enters the P3 long siege');
  assert.equal(state.siegeState?.phase, 'evacuation', 'the long siege begins with a physical evacuation window');
}

// 실제 습격 틱은 벽 앞에서 멈춰 내구를 깎고, 0이 된 같은 건물 ID를 통행 가능한 잔해로 남긴다.
{
  const state = freshState(2026080308);
  const wall = addBuilt(state, 'palisade', 5, 10);
  const defenseBefore = buildings.computeDefense(state);
  const route = {
    steps: [{ x: 5, y: 10 }, { x: 6, y: 10 }],
    breaches: [{ buildingId: wall.id, x: 5, y: 10 }],
    totalCost: 80,
    kind: 'assault',
  };
  state.raiders = {
    x: 4, y: 10, px: 4, py: 10, path: [...route.steps], route,
    routeTarget: { x: 6, y: 10 }, routeRevision: state.defenseTopologyRevision,
    phase: 'approaching', power: 60, size: 5,
    faction: constants.FACTIONS[0].name, warned: true, spotted: true,
    siege: false, speed: 1, trail: [],
  };
  const revisionBefore = state.defenseTopologyRevision;
  for (let tick = 0; tick < 120 && !wall.breached; tick++) raids.raidersTick(state, () => 0);
  assert.equal(wall.breached, true, 'raid ticks breach the actual wall after consuming its integrity');
  assert.equal(wall.structureIntegrity, 0);
  assert.ok(state.buildings.some(building => building.id === wall.id), 'breached rubble retains the original building id');
  assert.equal(state.map[10][5].buildingId, wall.id, 'breached rubble retains tile selection occupancy');
  assert.equal(agents.isPassable(state, 5, 10), true, 'residents can pass a breached wall tile');
  assert.equal(raidRoutes.isRaidTileTraversable(state, 5, 10, false), true, 'raiders can pass breached rubble without assault mode');
  assert.ok(buildings.computeDefense(state) < defenseBefore, 'breached walls stop contributing building defense');
  assert.equal(state.defenseTopologyRevision, revisionBefore + 1, 'the topology revision changes exactly when the wall opens');

  assert.ok(simulation.startBreachedWallRepair(state, wall.id),
    'repair cannot start while raiders occupy an adjacent tile');
  assert.equal(wall.structureRepair, undefined);
  state.raiders = null;
  const repairRevision = state.defenseTopologyRevision;
  assert.equal(simulation.startBreachedWallRepair(state, wall.id), null, 'a safe breached segment accepts a repair order');
  assert.equal(agents.isPassable(state, 5, 10), true, 'repair work leaves the rubble passage open');
  state.subTick = 9;
  for (const resident of state.residents) {
    if (!resident.alive) continue;
    resident.job = 'builder';
    resident.x = 4;
    resident.y = 10;
    resident.px = 4;
    resident.py = 10;
    resident.path = [];
    agents.resetAgent(state, resident);
  }
  for (let tick = 0; tick < 240 && wall.structureRepair; tick++) simulation.advanceTick(state);
  assert.equal(wall.structureRepair, undefined, 'builders complete breached-wall repair');
  assert.equal(wall.breached, false);
  assert.equal(wall.structureIntegrity, wall.structureIntegrityMax);
  assert.equal(agents.isPassable(state, 5, 10), false, 'the repaired wall blocks residents only on completion');
  assert.equal(state.defenseTopologyRevision, repairRevision + 1, 'repair completion changes the topology revision once');
}

// 같은 revision에서는 저장 경로를 재사용하고, revision이 바뀐 첫 틱에만 다시 계획한다.
{
  const state = freshState(2026080310);
  addBuilt(state, 'center', 25, 10);
  const route = raidRoutes.planRaidRoute(state, { x: 2, y: 10 }, { x: 20, y: 10 }, 35);
  state.raiders = {
    x: 2, y: 10, px: 2, py: 10, path: [...route.steps], route,
    routeTarget: { x: 20, y: 10 }, routeRevision: state.defenseTopologyRevision,
    phase: 'approaching', power: 35, size: 4,
    faction: constants.FACTIONS[0].name, warned: true, spotted: true,
    siege: false, speed: 0, trail: [],
  };
  for (let tick = 0; tick < 100; tick++) raids.raidersTick(state, () => 0);
  assert.equal(state.raiders.route, route, 'unchanged topology keeps the cached route object');
  const offRouteWall = addBuilt(state, 'palisade', 1, 1);
  const revisionBefore = state.defenseTopologyRevision;
  assert.equal(simulation.demolishBuilding(state, offRouteWall.x, offRouteWall.y), null);
  assert.equal(state.defenseTopologyRevision, revisionBefore + 1, 'a real wall topology mutation advances revision once');
  raids.raidersTick(state, () => 0);
  assert.notEqual(state.raiders.route, route, 'changed topology replans on the next raid tick');
  assert.equal(state.raiders.routeRevision, state.defenseTopologyRevision);
}

// revision 표식이 누락돼도 다음 칸이 실제로 무효가 되면 진입 전에 다시 계획한다.
{
  const state = freshState(2026080315);
  addBuilt(state, 'center', 25, 10);
  const route = raidRoutes.planRaidRoute(state, { x: 2, y: 10 }, { x: 20, y: 10 }, 20);
  const blockedStep = route.steps[0];
  state.raiders = {
    x: 2, y: 10, px: 2, py: 10, path: [...route.steps], route,
    routeTarget: { x: 20, y: 10 }, routeRevision: state.defenseTopologyRevision,
    phase: 'approaching', power: 20, size: 3,
    faction: constants.FACTIONS[0].name, warned: true, spotted: true,
    siege: false, speed: 1, trail: [],
  };
  addBuilt(state, 'palisade', blockedStep.x, blockedStep.y); // 일부러 revision helper를 거치지 않는 외부 변이
  const revision = state.defenseTopologyRevision;
  raids.raidersTick(state, () => 0);
  assert.deepEqual({ x: state.raiders.x, y: state.raiders.y }, { x: 2, y: 10 },
    'raiders never enter an invalidated next step before replanning');
  assert.notEqual(state.raiders.route, route, 'next-step invalidation replans even with an unchanged revision');
  assert.equal(state.defenseTopologyRevision, revision);
}

// 실제 일일 young→mature 변화가 topology revision을 한 번 올린다.
{
  const state = freshState(2026080316);
  forestGrowth.setTreeStage(state.map[10][10], 'young');
  const previousChance = CONFIG.agents.forestYoungMatureChance;
  CONFIG.agents.forestYoungMatureChance = 1;
  const revision = state.defenseTopologyRevision;
  state.subTick = agents.SUBTICKS - 1;
  try {
    simulation.advanceTick(state);
  } finally {
    CONFIG.agents.forestYoungMatureChance = previousChance;
  }
  assert.equal(forestGrowth.treeStageFor(state.map[10][10]), 'mature');
  assert.equal(state.defenseTopologyRevision, revision + 1,
    'the actual daily young-to-mature transition invalidates cached raid routes once');
}

// 중간 돌파 상태는 저장 왕복하고, v53의 구 siege 상태에는 새 route를 임의 생성하지 않는다.
{
  const state = freshState(2026080309);
  const wall = addBuilt(state, 'earthFort', 8, 8, {
    structureIntegrityMax: 150,
    structureIntegrity: 73.5,
  });
  state.raiders = {
    x: 7, y: 8, px: 7, py: 8, path: [{ x: 8, y: 8 }],
    power: 48, size: 4, faction: constants.FACTIONS[0].name,
    warned: false, spotted: true, siege: false, speed: 1, trail: [],
    phase: 'breaching', breachTargetId: wall.id,
    routeRevision: 12, routeTarget: { x: 10, y: 8 },
    route: {
      steps: [{ x: 8, y: 8 }, { x: 9, y: 8 }, { x: 10, y: 8 }],
      breaches: [{ buildingId: wall.id, x: 8, y: 8 }],
      totalCost: 240, kind: 'assault',
    },
  };
  state.defenseTopologyRevision = 12;
  installStorage();
  assert.equal(saveLoad.saveGame(state), true);
  const loaded = saveLoad.loadGame();
  const restoredWall = loaded.buildings.find(building => building.id === wall.id);
  assert.equal(restoredWall.structureIntegrity, 73.5);
  assert.equal(restoredWall.structureIntegrityMax, 150);
  assert.equal(loaded.raiders.phase, 'breaching');
  assert.equal(loaded.raiders.breachTargetId, wall.id);
  assert.deepEqual(loaded.raiders.route.breaches, [{ buildingId: wall.id, x: 8, y: 8 }]);
  assert.equal(loaded.defenseTopologyRevision, 12);
  assert.equal(saveLoad.saveGame(loaded), true);
  const loadedAgain = saveLoad.loadGame();
  assert.deepEqual(loadedAgain.raiders.route, loaded.raiders.route, 'load-save-load preserves the complete route plan');
  assert.equal(loadedAgain.raiders.phase, 'breaching');
  assert.equal(loadedAgain.buildings.find(building => building.id === wall.id).structureIntegrity, 73.5);

  const malformed = structuredClone(state);
  const malformedWall = malformed.buildings.find(building => building.id === wall.id);
  malformedWall.structureIntegrityMax = 999_999;
  malformedWall.structureIntegrity = -50;
  malformedWall.breached = false;
  malformed.raiders.route.kind = 'invalid';
  malformed.raiders.breachTargetId = 999_999;
  localStorage.setItem('buksae-save-v3', JSON.stringify(malformed));
  const normalized = saveLoad.loadGame();
  const normalizedWall = normalized.buildings.find(building => building.id === wall.id);
  assert.equal(normalizedWall.structureIntegrityMax, 150, 'malformed max integrity normalizes to the wall grade');
  assert.equal(normalizedWall.structureIntegrity, 0);
  assert.equal(normalizedWall.breached, true);
  assert.equal(normalized.raiders.route, undefined);
  assert.equal(normalized.raiders.breachTargetId, undefined);
  assert.equal(normalized.raiders.phase, 'approaching');

  const legacy = { ...state, schemaVersion: 53, defenseTopologyRevision: undefined };
  legacy.raiders = { ...state.raiders, siege: true };
  delete legacy.raiders.route;
  delete legacy.raiders.routeRevision;
  delete legacy.raiders.routeTarget;
  delete legacy.raiders.breachTargetId;
  delete legacy.raiders.phase;
  localStorage.setItem('buksae-save-v3', JSON.stringify(legacy));
  const migrated = saveLoad.loadGame();
  assert.equal(migrated.raiders.siege, true, 'legacy siege meaning is preserved');
  assert.equal(migrated.raiders.route, undefined, 'legacy siege does not synthesize a new long-siege or route state');
}

console.log('raid pathing P2 tests passed');
