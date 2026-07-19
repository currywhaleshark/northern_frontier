// 주민 에이전트 시뮬레이션 — 서브틱 단위의 이동, 작업, 운반
// 자원은 창고/거점에 짐을 부려야 마을 비축량에 더해진다.
import { CONFIG } from './config';
import {
  BUILDING_DEFS, footprintTilesOf, isSmithyProductUnlocked, officeEfficiencyMultiplier,
  plotArea, SMITHY_PRODUCT_DEFS, smithyProductOf, sownAreaOf,
} from './buildings';
import { JOB_NAMES, RESOURCE_NAMES } from './constants';
import { addLog } from './events';
import { enrolledStudentIds, skillGainMult } from './education';
import { haulerCarryCapacity, haulingMoveSpeedMultiplier, scaledCarryCapacity } from './equipment';
import { collectHuntableTiles } from './habitats';
import { makeRng } from './map';
import { buryCorpse, cemeteryFreePlots, corpsesOf, laborEfficiencyMult, nextCorpseToCollect } from './lifecycle';
import { extractMineralDeposit, mineralRemaining } from './minerals';
import { isVeinSealedTile, recordRockMining, recordSilverMined } from './silver';
import { getSeason } from './seasons';
import { outdoorMult } from './weather';
import { processableAmount } from './processing';
import { DRYING_PRODUCT_DEFS, dryingProductOf } from './preservation';
import { jangdokdaeInputNeeds } from './fermentation';
import { canGrowCropNow, canHarvestCropNow, canPlantCropNow, cropIdForBuilding, CROP_DEFS } from './crops';
import { clothingCoverageTotal, foodTotal, fuelHeatTotal } from './consumption';
import { isExplored } from './exploration';
import { activePredatorScoutIds } from './expeditionIntel';
import { FOOD_RESOURCES, FUEL_RESOURCES } from './resourceCatalog';
import { isGateBuilding } from './walls';
import {
  ensureLivestockState, hayFromHarvestProgress, livestockProductForHerder, plotWorkMultiplier,
} from './livestock';
import { performPhysicianTreatment } from './medicine';
import { mineralDepositsInMineRange, servingMineForTile } from './miningSites';
import { rankProductionEfficiency } from './productionEfficiency';
import { buildGoalField, describeGoal, type DescribedGoal, type GoalField } from './pathGoals';
import { reconcileResidentHomes } from './residents';
import { canEnterForeignTerritory, canWorkForeignTerritory, noteTerritoryViolation } from './territory';
import {
  assignedBuildingForResident, autoAssignWorkersToBuilding, isResidentInAssignedSlot,
} from './workerSlots';
import {
  addBuildingStock, buildingStock, depositResidentToBuilding, depositResidentToSettlement,
  isHaulSourceBuilding, isStorageBuilding, takeBuildingStock,
} from './inventory';
import type {
  Building, BuildingTypeId, GameState, ManualOrder, ProcessingInputId, Resident, ResourceId, Season,
  SmithyProductId, Tile,
} from './types';

export const SUBTICKS = CONFIG.agents.subticksPerDay;

interface Ctx {
  season: Season;
  outdoor: number;
  tMod: number;   // 도구 보정
  mMod: number;   // 사기·관청·등급 노동 보정
  outputMod: number; // mMod에 RC 자원 산출 보정을 한 번만 합성
  rng: () => number;
  centerId: number;
  huntable: Map<string, number>; // 사냥 가능 타일 ("x,y") → 수확 배율 — 서식지 범위/크기와 연동
  goalFields: Partial<Record<'forest' | 'huntable' | 'mineral', GoalField>>;
  goalFieldUserCounts: Record<'forest' | 'huntable' | 'mineral', number>;
}

const PRODUCING_JOBS = [
  'woodcutter', 'woodSplitter', 'hunter', 'farmer', 'miller', 'builder', 'curer', 'potter', 'smith', 'miner', 'fisher',
  'charcoalBurner', 'herder', 'powderMaker', 'tanner', 'weaver', 'herbalist', 'hauler',
];
const OUTDOOR_JOBS = [
  'woodcutter', 'woodSplitter', 'hunter', 'herbalist', 'farmer', 'builder', 'miner', 'fisher',
  'charcoalBurner', 'herder',
];

// ─────────────────────────── 공통 헬퍼 ───────────────────────────

function effOf(r: Resident): number {
  return (1 + (r.skills[r.job] ?? 0) * CONFIG.production.skillEffect) * laborEfficiencyMult(r);
}

function gainSkillTick(r: Resident): void {
  const cur = r.skills[r.job] ?? 0;
  // 문해자는 무엇을 배워도 빠르다 (서당 교육의 평생 보상)
  r.skills[r.job] = Math.min(1, cur + (CONFIG.production.skillGainPerDay / 5) * skillGainMult(r));
}

function carryTotal(r: Resident): number {
  return Object.values(r.carrying).reduce((s: number, v) => s + (v ?? 0), 0);
}

function addCarry(r: Resident, res: ResourceId, amt: number): void {
  r.carrying[res] = (r.carrying[res] ?? 0) + amt;
}

function depositAll(state: GameState, r: Resident): void {
  depositResidentToSettlement(state, r);
}

// 직업 변경/사망 등으로 에이전트 상태를 정리 (짐은 마을 몫으로 귀속)
export function resetAgent(state: GameState, r: Resident): void {
  depositAll(state, r);
  r.path = [];
  r.phase = 'rest';
  r.workTimer = 0;
  r.targetId = null;
  r.miningDepositBuildingId = null;
  r.haulTask = null;
  r.manualOrder = null;
}

// ─────────────────────────── 이동/경로 ───────────────────────────

const PASSABLE_BUILDING_TYPES: ReadonlySet<BuildingTypeId> = new Set<BuildingTypeId>([
  'field',
  'paddy',
  'bridge',
  'ferry',
  'dock',
  'lumberCamp',
  'huntLodge',
  'herbHut',
  'mine',
]);

function buildingAtTile(state: GameState, t: Tile): Building | undefined {
  if (t.buildingId == null) return undefined;
  return state.buildings.find(b => b.id === t.buildingId);
}

function isPassableBuilding(type: BuildingTypeId): boolean {
  return PASSABLE_BUILDING_TYPES.has(type) || isGateBuilding(type);
}

export function isTerrainPassable(state: GameState, x: number, y: number): boolean {
  const t = state.map[y]?.[x];
  if (!t) return false;
  const building = buildingAtTile(state, t);
  if (building && !isPassableBuilding(building.type)) return false;
  if (t.terrain === 'mountain') return false;
  if (t.terrain === 'river') {
    if (building && (building.type === 'bridge' || building.type === 'ferry' || building.type === 'dock')) return true;
    // 겨울 언 강 위는 걸어서 건널 수 있다 (해빙기 홍수 제외)
    return getSeason(state.day) === 'winter' && state.weather !== 'thawFlood';
  }
  return true;
}

export function isPassable(
  state: GameState,
  x: number,
  y: number,
  ignoredTerritorySiteIds: readonly number[] = [],
): boolean {
  return isTerrainPassable(state, x, y) && canEnterForeignTerritory(state, x, y, ignoredTerritorySiteIds);
}

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

function goalTiles(state: GameState, isGoal: (t: Tile) => boolean): { x: number; y: number }[] {
  const goals: { x: number; y: number }[] = [];
  for (const row of state.map) {
    for (const tile of row) {
      if (isGoal(tile)) goals.push({ x: tile.x, y: tile.y });
    }
  }
  return goals;
}

function octileDistance(x: number, y: number, goals: readonly { x: number; y: number }[]): number {
  let best = Infinity;
  for (const goal of goals) {
    const dx = Math.abs(goal.x - x);
    const dy = Math.abs(goal.y - y);
    const diag = Math.min(dx, dy);
    const straight = Math.max(dx, dy) - diag;
    best = Math.min(best, diag * 14 + straight * 10);
  }
  return best === Infinity ? 0 : best;
}

function reconstructPath(prev: Int32Array, width: number, start: number, end: number): { x: number; y: number }[] {
  const path: { x: number; y: number }[] = [];
  let node = end;
  while (node !== start) {
    if (node < 0) return [];
    const x = node % width;
    path.push({ x, y: (node - x) / width });
    node = prev[node];
  }
  path.reverse();
  return path;
}

// A*: 조건을 만족하는 가장 가까운 타일까지의 경로 (시작 타일 제외)
// passable을 넘기면 주민과 다른 통행 규칙을 적용할 수 있다.
// 성능: (1) 통행 판정은 탐색 한 번 안에서 칸당 1회로 메모한다 — 세력권·건물 검사가 비싸다.
//       (2) open 리스트는 이진 힙 (push 시점 점수 고정 + closed 스킵의 lazy deletion).
function runtimePathStartTime(): number | null {
  if (typeof window === 'undefined') return null;
  return (window as unknown as { __runtimePerfStartTime?: () => number | null })
    .__runtimePerfStartTime?.() ?? null;
}

function recordRuntimePathfinding(
  startedAt: number | null,
  detail: Record<string, string | number | boolean | null>,
): void {
  if (typeof window === 'undefined') return;
  (window as unknown as {
    __recordRuntimePerfSince?: (
      name: string,
      start: number | null,
      detail?: Record<string, string | number | boolean | null>,
    ) => void;
  }).__recordRuntimePerfSince?.('pathfinding', startedAt, detail);
}

export function findPath(
  state: GameState,
  sx: number,
  sy: number,
  isGoal: (t: Tile) => boolean,
  passable?: (x: number, y: number) => boolean,
): { x: number; y: number }[] | null {
  const startedAt = runtimePathStartTime();
  const result = findPathCore(state, sx, sy, isGoal, passable);
  recordRuntimePathfinding(startedAt, {
    fromX: sx,
    fromY: sy,
    pathLength: result?.length ?? 0,
    found: result !== null,
  });
  return result;
}

function findPathCore(
  state: GameState,
  sx: number,
  sy: number,
  isGoal: (t: Tile) => boolean,
  passable?: (x: number, y: number) => boolean,
): { x: number; y: number }[] | null {
  const basePass = passable ?? ((x: number, y: number) => isPassable(state, x, y));
  const h = state.map.length, w = state.map[0]?.length ?? 0;
  if (sx < 0 || sy < 0 || sx >= w || sy >= h || !state.map[sy]?.[sx]) return null;
  const described = isGoal as DescribedGoal;
  const describedFits = described.goalPoints &&
    (described.goalWidth == null || described.goalWidth === w) &&
    (described.goalHeight == null || described.goalHeight === h);
  const goals = describedFits ? described.goalPoints! : goalTiles(state, isGoal);
  if (goals.length === 0) return null;
  const estimate = describedFits && described.goalHeuristic?.length === w * h
    ? (x: number, y: number) => described.goalHeuristic![y * w + x]
    : goals.length <= 128
    ? (x: number, y: number) => octileDistance(x, y, goals)
    : () => 0;

  const passMemo = new Int8Array(w * h).fill(-1);
  const canPass = (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= w || y >= h) return false;
    const i = y * w + x;
    const cached = passMemo[i];
    if (cached >= 0) return cached === 1;
    const ok = basePass(x, y);
    passMemo[i] = ok ? 1 : 0;
    return ok;
  };

  const start = sy * w + sx;
  const prev = new Int32Array(w * h).fill(-2);
  const cost = new Int32Array(w * h).fill(0x3fffffff);
  const closed = new Uint8Array(w * h);
  prev[start] = -1;
  cost[start] = 0;

  // 이진 최소 힙 — 점수/노드 병렬 배열, 점수는 push 시점에 고정
  const heapScore: number[] = [];
  const heapNode: number[] = [];
  const heapPush = (s: number, n: number): void => {
    let i = heapScore.length;
    heapScore.push(s);
    heapNode.push(n);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heapScore[p] <= heapScore[i]) break;
      [heapScore[p], heapScore[i]] = [heapScore[i], heapScore[p]];
      [heapNode[p], heapNode[i]] = [heapNode[i], heapNode[p]];
      i = p;
    }
  };
  const heapPop = (): number => {
    const top = heapNode[0];
    const lastScore = heapScore.pop()!;
    const lastNode = heapNode.pop()!;
    if (heapNode.length > 0) {
      heapScore[0] = lastScore;
      heapNode[0] = lastNode;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < heapScore.length && heapScore[l] < heapScore[m]) m = l;
        if (r < heapScore.length && heapScore[r] < heapScore[m]) m = r;
        if (m === i) break;
        [heapScore[m], heapScore[i]] = [heapScore[i], heapScore[m]];
        [heapNode[m], heapNode[i]] = [heapNode[i], heapNode[m]];
        i = m;
      }
    }
    return top;
  };

  heapPush(estimate(sx, sy), start);
  while (heapNode.length > 0) {
    const cur = heapPop();
    if (closed[cur]) continue;
    closed[cur] = 1;
    const cx = cur % w, cy = (cur - cx) / w;
    const tile = state.map[cy]?.[cx];
    if (!tile) continue;
    if (cur !== start && isGoal(tile)) {
      return reconstructPath(prev, w, start, cur);
    }
    for (const [dx, dy] of DIRS) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      if (!canPass(nx, ny)) continue;
      if (dx !== 0 && dy !== 0 && (!canPass(cx + dx, cy) || !canPass(cx, cy + dy))) continue;
      const ni = ny * w + nx;
      const nextCost = cost[cur] + (dx !== 0 && dy !== 0 ? 14 : 10);
      if (nextCost >= cost[ni]) continue;
      prev[ni] = cur;
      cost[ni] = nextCost;
      heapPush(nextCost + estimate(nx, ny), ni);
    }
  }
  return null;
}

const bfs = findPath;

function moveSteps(state: GameState, r: Resident, ctx: Ctx): number {
  let sp: number = CONFIG.agents.moveSpeed;
  if (ctx.season === 'winter') sp = CONFIG.agents.moveSpeedWinter;
  if (state.weather === 'blizzard' || state.weather === 'heavySnow') {
    sp = Math.min(sp, CONFIG.agents.moveSpeedSnow);
  }
  sp *= haulingMoveSpeedMultiplier(r);
  const n = Math.floor(sp);
  return n + (ctx.rng() < sp - n ? 1 : 0);
}

type GoResult = 'arrived' | 'moving' | 'stuck';

// 실패한 경로 탐색은 몇 서브틱 쉬어 간다 — 막힌 주민이 매 틱 지도 전체를 다시 뒤지는 것을 막는다.
// (저장되지 않는 순수 성능 캐시. 지형은 서브틱 사이에 거의 변하지 않는다.)
const PATH_FAIL_COOLDOWN_TICKS = 3;
const pathFailUntil = new Map<number, number>();

function absoluteTick(state: GameState): number {
  return state.day * SUBTICKS + state.subTick;
}

// 목표 조건을 향해 이동. 이미 목표 위면 arrived.
function goTo(
  state: GameState,
  r: Resident,
  ctx: Ctx,
  isGoal: (t: Tile) => boolean,
  passable?: (x: number, y: number) => boolean,
  onStep?: (x: number, y: number) => void,
): GoResult {
  const canPass = passable ?? ((x: number, y: number) => isPassable(state, x, y));
  if (isGoal(state.map[r.y][r.x])) { r.path = []; return 'arrived'; }
  if (r.path.length === 0) {
    const nowTick = absoluteTick(state);
    if ((pathFailUntil.get(r.id) ?? 0) > nowTick) return 'stuck';
    const p = bfs(state, r.x, r.y, isGoal, canPass);
    if (!p) {
      pathFailUntil.set(r.id, nowTick + PATH_FAIL_COOLDOWN_TICKS);
      return 'stuck';
    }
    pathFailUntil.delete(r.id);
    r.path = p;
  }
  const steps = moveSteps(state, r, ctx);
  for (let i = 0; i < steps && r.path.length > 0; i++) {
    const next = r.path[0];
    if (!canPass(next.x, next.y)) { r.path = []; return 'moving'; } // 다음 틱에 재탐색
    r.path.shift();
    r.x = next.x; r.y = next.y;
    onStep?.(next.x, next.y);
  }
  return isGoal(state.map[r.y][r.x]) ? 'arrived' : 'moving';
}

function isBuildingInteractionTile(state: GameState, t: Tile, buildingId: number): boolean {
  const building = state.buildings.find(b => b.id === buildingId);
  if (!building) return false;
  if (!isPassable(state, t.x, t.y)) return false;
  if (isPassableBuilding(building.type)) return t.buildingId === building.id;

  const footprint = footprintTilesOf(state, building);
  if (!footprint) return false;
  return footprint.some(tile =>
    Math.max(Math.abs(tile.x - t.x), Math.abs(tile.y - t.y)) === 1);
}

function isResidentAtBuildingInteraction(state: GameState, r: Resident, buildingId: number): boolean {
  const tile = state.map[r.y]?.[r.x];
  return tile ? isBuildingInteractionTile(state, tile, buildingId) : false;
}

// 건물 상호작용 칸을 미리 집합으로 만든다 — 경로 탐색이 지도 전 칸에 목표 판정을 돌리므로
// 판정은 O(1)이어야 한다 (칸마다 건물 검색+발자국 검사를 하면 탐색 한 번에 수십만 연산이 된다).
function buildingInteractionGoal(state: GameState, buildingIds: readonly number[]): (t: Tile) => boolean {
  const w = state.map[0]?.length ?? 0;
  const goalSet = new Set<number>();
  for (const id of buildingIds) {
    const building = state.buildings.find(b => b.id === id);
    if (!building) continue;
    const footprint = footprintTilesOf(state, building);
    if (!footprint) continue;
    if (isPassableBuilding(building.type)) {
      for (const tile of footprint) {
        if (tile.buildingId === building.id && isPassable(state, tile.x, tile.y)) {
          goalSet.add(tile.y * w + tile.x);
        }
      }
      continue;
    }
    const inFootprint = new Set(footprint.map(tile => tile.y * w + tile.x));
    for (const tile of footprint) {
      for (const [dx, dy] of DIRS) {
        const nx = tile.x + dx, ny = tile.y + dy;
        if (!state.map[ny]?.[nx]) continue;
        const ni = ny * w + nx;
        if (inFootprint.has(ni) || goalSet.has(ni)) continue;
        if (!isPassable(state, nx, ny)) continue;
        goalSet.add(ni);
      }
    }
  }
  const points = [...goalSet]
    .sort((a, b) => a - b)
    .map(index => ({ x: index % w, y: Math.floor(index / w) }));
  return describeGoal(t => goalSet.has(t.y * w + t.x), points);
}

// 하역 거점: 중심지 + 창고 (+직업별 거점 건물)
function depositBuildings(state: GameState, extra: BuildingTypeId[]): Building[] {
  const productionSites = state.buildings.filter(b => b.built && extra.includes(b.type));
  if (productionSites.length > 0) return productionSites;
  return state.buildings.filter(isStorageBuilding);
}

function depositGoal(state: GameState, extra: BuildingTypeId[]): (t: Tile) => boolean {
  return buildingInteractionGoal(state, depositBuildings(state, extra).map(building => building.id));
}

function unloadAtDepositGoal(
  state: GameState,
  resident: Resident,
  extra: BuildingTypeId[],
): void {
  const productionSite = depositBuildings(state, extra)
    .find(building => !isStorageBuilding(building) &&
      isResidentAtBuildingInteraction(state, resident, building.id));
  if (productionSite) depositResidentToBuilding(productionSite, resident);
  else depositResidentToSettlement(state, resident);
}

function buildingGoal(state: GameState, id: number): (t: Tile) => boolean {
  return buildingInteractionGoal(state, [id]);
}

function goToCenter(state: GameState, r: Resident, ctx: Ctx): GoResult {
  return goTo(state, r, ctx, buildingGoal(state, ctx.centerId));
}

function manhattanXY(ax: number, ay: number, bx: number, by: number): number {
  return Math.abs(ax - bx) + Math.abs(ay - by);
}

function canStepTo(state: GameState, x: number, y: number, dx: number, dy: number): boolean {
  const nx = x + dx, ny = y + dy;
  if (!isPassable(state, nx, ny)) return false;
  if (dx !== 0 && dy !== 0 && (!isPassable(state, x + dx, y) || !isPassable(state, x, y + dy))) return false;
  return true;
}

function tryLoiterStep(
  state: GameState,
  r: Resident,
  ctx: Ctx,
  anchorX: number,
  anchorY: number,
  radius: number,
): boolean {
  const start = Math.floor(ctx.rng() * DIRS.length);
  for (let i = 0; i < DIRS.length; i++) {
    const [dx, dy] = DIRS[(start + i) % DIRS.length];
    const nx = r.x + dx, ny = r.y + dy;
    if (manhattanXY(nx, ny, anchorX, anchorY) > radius) continue;
    if (!canStepTo(state, r.x, r.y, dx, dy)) continue;
    r.x = nx;
    r.y = ny;
    return true;
  }
  return false;
}

function loiterNearPoint(
  state: GameState,
  r: Resident,
  ctx: Ctx,
  anchorX: number,
  anchorY: number,
  radius: number,
  task: string,
): GoResult {
  r.task = task;
  if (manhattanXY(r.x, r.y, anchorX, anchorY) > radius) {
    const returnRadius = Math.max(1, Math.min(2, radius));
    return goTo(state, r, ctx, tile =>
      isPassable(state, tile.x, tile.y) && manhattanXY(tile.x, tile.y, anchorX, anchorY) <= returnRadius);
  }
  r.path = [];
  if (ctx.rng() < 0.65 && tryLoiterStep(state, r, ctx, anchorX, anchorY, radius)) return 'moving';
  return 'arrived';
}

function loiterNearCenter(state: GameState, r: Resident, ctx: Ctx, task: string): GoResult {
  const center = state.buildings.find(b => b.id === ctx.centerId);
  if (!center) {
    r.task = task;
    r.path = [];
    tryLoiterStep(state, r, ctx, r.x, r.y, 2);
    return 'arrived';
  }
  return loiterNearPoint(state, r, ctx, center.x, center.y, 8, task);
}

function loiterNearBuilding(
  state: GameState,
  r: Resident,
  ctx: Ctx,
  building: Building,
  radius: number,
  task: string,
): GoResult {
  r.task = task;
  if (manhattanXY(r.x, r.y, building.x, building.y) > radius) {
    return goTo(state, r, ctx, buildingGoal(state, building.id));
  }
  r.path = [];
  if (ctx.rng() < 0.55 && tryLoiterStep(state, r, ctx, building.x, building.y, radius)) return 'moving';
  return 'arrived';
}

function depositCarriedResources(
  state: GameState,
  r: Resident,
  ctx: Ctx,
  extra: BuildingTypeId[],
  task: string,
): boolean {
  if (carryTotal(r) <= 0) return false;
  r.phase = 'toDeposit';
  r.task = task;
  const st = goTo(state, r, ctx, depositGoal(state, extra));
  if (st === 'arrived') {
    unloadAtDepositGoal(state, r, extra);
    r.phase = 'rest';
  } else if (st === 'stuck') {
    depositResidentToSettlement(state, r);
    r.phase = 'rest';
  }
  return true;
}

function assignedWorkplace(
  state: GameState,
  r: Resident,
  ctx: Ctx,
  type: BuildingTypeId,
  waitTask: string,
): Building | null {
  return assignedWorkplaceOfTypes(state, r, ctx, [type], waitTask);
}

function assignedWorkplaceOfTypes(
  state: GameState,
  r: Resident,
  ctx: Ctx,
  types: readonly BuildingTypeId[],
  waitTask: string,
): Building | null {
  const building = assignedBuildingForResident(state, r);
  if (!building || !types.includes(building.type) || !isResidentInAssignedSlot(state, r, building)) {
    if (depositCarriedResources(state, r, ctx, [], waitTask)) return null;
    loiterNearCenter(state, r, ctx, waitTask);
    return null;
  }
  return building;
}

type WorkplaceInputs = Partial<Record<ResourceId, number>>;

function isReservedProcessingInput(resource: ResourceId): resource is ProcessingInputId {
  return resource === 'wood' || resource === 'rice' || resource === 'hide' || resource === 'iron'
    || resource === 'meat' || resource === 'fish';
}

function settlementProcessingStock(state: GameState, resource: ResourceId): number {
  return isReservedProcessingInput(resource) ? processableAmount(state, resource) : state.resources[resource];
}

function workplaceInputResources(building: Building): ResourceId[] {
  switch (building.type) {
    case 'watermill': return ['rice'];
    case 'woodShed': return ['wood'];
    case 'charcoalKiln': return ['wood'];
    case 'tannery': return ['hide'];
    case 'weavingHouse': return ['cotton'];
    case 'nitreYard': return ['firewood', 'stone'];
    case 'smithy': return Object.keys(SMITHY_PRODUCT_DEFS[smithyProductOf(building)].inputPerUnit) as ResourceId[];
    case 'smokehouse': return ['meat', 'firewood', 'charcoal'];
    case 'dryingRack': return Object.keys(DRYING_PRODUCT_DEFS[dryingProductOf(building)].inputPerUnit) as ResourceId[];
    case 'onggiKiln': return ['firewood', 'charcoal'];
    case 'jangdokdae': return ['beans', 'salt', 'onggi'];
    default: return [];
  }
}

function isWorkplaceInputStock(building: Building, resource: ResourceId): boolean {
  return workplaceInputResources(building).includes(resource);
}

function processorCarryCapacity(resource: ResourceId): number {
  const capacities = CONFIG.agents.carryCap as Partial<Record<ResourceId, number>>;
  return scaledCarryCapacity(capacities[resource] ?? CONFIG.agents.haulerCarryCap);
}

function unloadWorkplaceInputs(building: Building, resident: Resident, inputs: Set<ResourceId>): void {
  for (const [resource, amount] of Object.entries(resident.carrying) as [ResourceId, number][]) {
    if (!inputs.has(resource) || amount <= 0) continue;
    addBuildingStock(building, resource, amount);
    delete resident.carrying[resource];
  }
}

// 가공 작업자는 창고에서 원료를 직접 가져와 지정 작업장의 현장 재고로 만든다.
function supplyWorkplaceInputs(
  state: GameState,
  resident: Resident,
  ctx: Ctx,
  workplace: Building,
  requirements: WorkplaceInputs,
): boolean {
  const inputIds = (Object.entries(requirements) as [ResourceId, number][])
    .filter(([, amount]) => amount > 0)
    .map(([resource]) => resource);
  const inputSet = new Set(inputIds);
  const hasCarriedInput = inputIds.some(resource => (resident.carrying[resource] ?? 0) > 0);

  if (hasCarriedInput) {
    resident.phase = 'toDeposit';
    resident.task = '작업장에 원료 운반';
    const st = goTo(state, resident, ctx, buildingGoal(state, workplace.id));
    if (st === 'arrived') {
      unloadWorkplaceInputs(workplace, resident, inputSet);
      resident.phase = 'rest';
      resident.path = [];
    } else if (st === 'stuck') {
      depositResidentToSettlement(state, resident);
      resident.phase = 'rest';
    }
    return true;
  }

  if (carryTotal(resident) > 0) {
    return depositCarriedResources(state, resident, ctx, [], '남은 짐 정리');
  }

  const resource = (Object.entries(requirements) as [ResourceId, number][]).find(([candidate, needed]) =>
    needed > 0 &&
    buildingStock(workplace, candidate) + 0.0001 < needed &&
    settlementProcessingStock(state, candidate) > 0.05)?.[0];
  if (!resource) return false;

  const storage = nearestBuilding(resident, state.buildings.filter(isStorageBuilding));
  if (!storage) {
    resident.phase = 'rest';
    resident.task = '원료 창고 없음';
    return true;
  }

  resident.phase = 'toWork';
  resident.task = `${RESOURCE_NAMES[resource]} 가지러 이동`;
  const st = goTo(state, resident, ctx, buildingGoal(state, storage.id));
  if (st === 'arrived') {
    const pickupCap = resource === 'tools'
      ? Math.min(1, processorCarryCapacity(resource))
      : processorCarryCapacity(resource);
    const amount = Math.min(settlementProcessingStock(state, resource), pickupCap);
    if (amount > 0.05) {
      state.resources[resource] = Math.max(0, state.resources[resource] - amount);
      addCarry(resident, resource, amount);
      resident.phase = 'toDeposit';
      resident.path = [];
      resident.task = `${RESOURCE_NAMES[resource]} 운반`;
    } else {
      resident.phase = 'rest';
      resident.path = [];
      resident.task = `${RESOURCE_NAMES[resource]} 대기`;
    }
  } else if (st === 'stuck') {
    resident.phase = 'rest';
    resident.task = '창고 길이 막힘';
  }
  return true;
}

function nearestPassableTile(state: GameState, x: number, y: number, maxRadius = 8): Tile | null {
  for (let radius = 1; radius <= maxRadius; radius++) {
    for (let ty = y - radius; ty <= y + radius; ty++) {
      for (let tx = x - radius; tx <= x + radius; tx++) {
        if (Math.max(Math.abs(tx - x), Math.abs(ty - y)) !== radius) continue;
        const tile = state.map[ty]?.[tx];
        if (tile && isPassable(state, tx, ty)) return tile;
      }
    }
  }
  return null;
}

function ensureResidentOnPassableTile(state: GameState, r: Resident): void {
  const ignored = r.manualOrder?.unauthorizedSiteIds ?? [];
  if (isPassable(state, r.x, r.y, ignored)) return;
  const tile = nearestPassableTile(state, r.x, r.y);
  if (!tile) return;
  r.x = tile.x;
  r.y = tile.y;
  r.px = tile.x;
  r.py = tile.y;
  r.path = [];
}

// ─────────────────────────── 채집형 작업 공통 루틴 ───────────────────────────

interface GatherOpts {
  goal: (t: Tile) => boolean;
  workTicks: number;
  yieldRes: ResourceId;
  yieldAmt: number | ((tile: Tile) => number); // 보정 전 1회 채집량 (타일에 따라 달라질 수 있다)
  cap: number;            // 이만큼 지면 하역하러 간다
  depositExtra: BuildingTypeId[];
  depositTargets?: (state: GameState, resident: Resident) => Building[];
  onDeposit?: (resident: Resident) => void;
  taskWork: string;
  taskMove: string;
  taskHaul: string;
  taskNone?: string;
  adjustHarvestAmount?: (tile: Tile, r: Resident, amount: number) => number;
  onHarvest?: (tile: Tile, r: Resident, amount: number) => void;
  goalField?: () => GoalField;
}

type GatherGoalKind = 'forest' | 'huntable' | 'mineral';

// 넓은 목표장 자체는 매 주민/매 서브틱이 아니라 state+일자 단위로 재사용한다.
// 필드는 일부 아직 답사하지 못한/봉인된 후보도 포함하므로 heuristic으로만 쓰며,
// 실제 도착 판정과 목표 목록은 아래에서 현재 답사·통행 가능한 칸으로 다시 좁힌다.
const broadGoalFieldCache = new WeakMap<GameState, Map<GatherGoalKind, { day: number; field: GoalField }>>();

function gatherGoalField(
  state: GameState,
  ctx: Ctx,
  kind: GatherGoalKind,
  goal: (tile: Tile) => boolean,
): GoalField {
  const cached = ctx.goalFields[kind];
  if (cached) return cached;
  let byKind = broadGoalFieldCache.get(state);
  if (!byKind) {
    byKind = new Map();
    broadGoalFieldCache.set(state, byKind);
  }
  let broad = byKind.get(kind);
  if (!broad || broad.day !== state.day) {
    broad = { day: state.day, field: buildGoalField(state.map, goal) };
    byKind.set(kind, broad);
  }
  const field: GoalField = {
    ...broad.field,
    goals: broad.field.goals.filter(point =>
      isExplored(state, point.x, point.y) && canWorkForeignTerritory(state, point.x, point.y)),
  };
  ctx.goalFields[kind] = field;
  return field;
}

function gatherJob(state: GameState, r: Resident, ctx: Ctx, o: GatherOpts): void {
  const forced = r.manualOrder?.kind === 'work' ? r.manualOrder.unauthorizedSiteIds ?? [] : [];
  let knownGoal: DescribedGoal = (tile: Tile): boolean => isExplored(state, tile.x, tile.y) && o.goal(tile) &&
    canWorkForeignTerritory(state, tile.x, tile.y, forced);
  if (forced.length === 0 && o.goalField) {
    const field = o.goalField();
    knownGoal = describeGoal(knownGoal, field.goals, field);
  }
  // 짐이 찼거나 하역 중이면 거점으로
  if (carryTotal(r) >= scaledCarryCapacity(o.cap) ||
    (r.phase === 'toDeposit' && carryTotal(r) > 0)) {
    r.phase = 'toDeposit';
    r.task = o.taskHaul;
    const targets = o.depositTargets?.(state, r) ?? depositBuildings(state, o.depositExtra);
    const st = goTo(state, r, ctx, buildingInteractionGoal(state, targets.map(building => building.id)));
    if (st === 'arrived') {
      const productionSite = targets.find(building => !isStorageBuilding(building) &&
        isResidentAtBuildingInteraction(state, r, building.id));
      if (productionSite) depositResidentToBuilding(productionSite, r);
      else depositResidentToSettlement(state, r);
      o.onDeposit?.(r);
      r.phase = 'rest';
    } else if (st === 'stuck') {
      depositResidentToSettlement(state, r); // 고립된 짐은 비상 회수로 처리한다
      o.onDeposit?.(r);
      r.phase = 'rest';
    }
    return;
  }
  // 작업 중
  if (r.phase === 'working') {
    if (!knownGoal(state.map[r.y][r.x])) { r.phase = 'rest'; return; } // 서 있던 타일이 변함(벌목 소진 등)
    r.task = o.taskWork;
    r.workTimer -= ctx.outdoor; // 궂은 날씨엔 일이 더디다
    gainSkillTick(r);
    if (r.workTimer <= 0) {
      const base = typeof o.yieldAmt === 'function' ? o.yieldAmt(state.map[r.y][r.x]) : o.yieldAmt;
      const requested = base * ctx.tMod * ctx.outputMod * effOf(r);
      const amt = Math.max(0, o.adjustHarvestAmount?.(state.map[r.y][r.x], r, requested) ?? requested);
      if (amt > 0) addCarry(r, o.yieldRes, amt);
      o.onHarvest?.(state.map[r.y][r.x], r, amt);
      r.phase = 'rest';
    }
    return;
  }
  // 작업지 탐색/이동
  const st = goTo(state, r, ctx, knownGoal);
  if (st === 'arrived') {
    r.phase = 'working';
    r.workTimer = o.workTicks;
    r.task = o.taskWork;
  } else if (st === 'stuck') {
    r.phase = 'rest';
    if (carryTotal(r) > 0) r.phase = 'toDeposit';
    else loiterNearCenter(state, r, ctx, o.taskNone ?? '갈 곳 없음');
  } else {
    r.phase = 'toWork';
    r.task = o.taskMove;
  }
}

// ─────────────────────────── 플레이어 수동 명령 ───────────────────────────

function clearManualOrder(r: Resident): void {
  r.manualOrder = null;
  r.path = [];
  r.phase = 'rest';
  r.workTimer = 0;
  r.targetId = null;
}

function exactTileGoal(x: number, y: number): (t: Tile) => boolean {
  return t => t.x === x && t.y === y;
}

function manualGoTo(
  state: GameState,
  resident: Resident,
  ctx: Ctx,
  order: ManualOrder,
  goal: (tile: Tile) => boolean,
): GoResult {
  const siteIds = order.unauthorizedSiteIds ?? [];
  return goTo(
    state,
    resident,
    ctx,
    goal,
    (x, y) => isPassable(state, x, y, siteIds),
    (x, y) => noteTerritoryViolation(state, siteIds, x, y, 'passage'),
  );
}

function logMineralDepletion(state: GameState, tile: Tile, resource: 'stone' | 'iron' | 'silver'): void {
  const mine = servingMineForTile(state, tile);
  const depositName = resource === 'silver' ? '은맥' : resource === 'iron' ? '철광맥' : '석재 노두';
  const otherDeposits = mine ? mineralDepositsInMineRange(state, mine, true).length : 0;
  addLog(
    state,
    mine
      ? otherDeposits > 0
        ? depositName + '이(가) 고갈되었습니다. 채광꾼들이 주변의 다른 광상으로 옮겨갑니다.'
        : depositName + '이(가) 고갈되었습니다. 채광장 주변 광상이 모두 바닥났습니다.'
      : depositName + '이(가) 고갈되어 지표에서 사라졌습니다.',
    'bad',
    true,
  );
}

function handleManualMoveOrder(state: GameState, r: Resident, ctx: Ctx, order: ManualOrder & { kind: 'move' }): boolean {
  if (!isPassable(state, order.x, order.y, order.unauthorizedSiteIds)) {
    r.task = '명령 지점 막힘';
    clearManualOrder(r);
    return true;
  }

  const st = manualGoTo(state, r, ctx, order, exactTileGoal(order.x, order.y));
  if (st === 'arrived') {
    r.task = '이동 완료';
    clearManualOrder(r);
  } else if (st === 'stuck') {
    r.task = '명령 지점 막힘';
    clearManualOrder(r);
  } else {
    r.phase = 'toWork';
    r.task = '이동 명령';
  }
  return true;
}

function reserveManualHaulTask(state: GameState, resident: Resident, source: Building): boolean {
  const current = resident.haulTask;
  if (current?.sourceBuildingId === source.id && buildingStock(source, current.resource) > 0.05) {
    return true;
  }
  clearHaulTask(resident);
  for (const resource of HAUL_PRIORITY) {
    const available = availableHaulAmount(state, source, resource, resident.id);
    if (available <= 0.05) continue;
    resident.haulTask = {
      sourceBuildingId: source.id,
      resource,
      amount: Math.min(haulerCarryCapacity(resident), available),
    };
    resident.targetId = source.id;
    return true;
  }
  return false;
}

function handleManualHaulerTransport(
  state: GameState,
  resident: Resident,
  ctx: Ctx,
  order: ManualOrder & { kind: 'work' },
): boolean {
  const source = order.buildingId == null
    ? undefined
    : state.buildings.find(building => building.id === order.buildingId);
  if (!source || !isHaulSourceBuilding(source)) {
    clearHaulTask(resident);
    clearManualOrder(resident);
    resident.task = '운송 대상 없음';
    return true;
  }

  if (carryTotal(resident) > 0) {
    resident.phase = 'toDeposit';
    resident.task = `${BUILDING_DEFS[source.type].name} 강제 운송`;
    const st = manualGoTo(state, resident, ctx, order, depositGoal(state, []));
    if (st === 'arrived' || st === 'stuck') {
      depositResidentToSettlement(state, resident);
      clearHaulTask(resident);
      resident.phase = 'rest';
    }
    return true;
  }

  const hasLoad = reserveManualHaulTask(state, resident, source);
  resident.phase = 'toWork';
  resident.task = hasLoad
    ? `${BUILDING_DEFS[source.type].name} 지정 수거`
    : `${BUILDING_DEFS[source.type].name} 운송 대기`;
  const st = manualGoTo(state, resident, ctx, order, buildingGoal(state, source.id));
  if (st === 'arrived') {
    noteTerritoryViolation(state, order.unauthorizedSiteIds ?? [], resident.x, resident.y, 'work');
    if (hasLoad && collectHaulLoad(state, resident, source) > 0) {
      resident.phase = 'toDeposit';
      resident.path = [];
    } else {
      clearHaulTask(resident);
      resident.phase = 'rest';
      resident.task = `${BUILDING_DEFS[source.type].name} 운송 대기`;
    }
  } else if (st === 'stuck') {
    clearHaulTask(resident);
    resident.phase = 'rest';
    resident.task = `${BUILDING_DEFS[source.type].name} 운송 길 막힘`;
  }
  return true;
}

function handleManualWorkOrder(state: GameState, r: Resident, ctx: Ctx, order: ManualOrder & { kind: 'work' }): boolean {
  if (order.repeat && r.job === 'hauler' && order.buildingId != null) {
    return handleManualHaulerTransport(state, r, ctx, order);
  }

  const tile = state.map[order.y]?.[order.x];
  if (!tile) {
    r.task = '명령 대상 없음';
    clearManualOrder(r);
    return true;
  }

  if (order.started) {
    if (r.phase === 'working') return false;
    clearManualOrder(r);
    return true;
  }

  const goal = order.buildingId != null ? buildingGoal(state, order.buildingId) : exactTileGoal(order.x, order.y);
  const st = manualGoTo(state, r, ctx, order, goal);
  if (st === 'arrived') {
    order.started = true;
    noteTerritoryViolation(state, order.unauthorizedSiteIds ?? [], r.x, r.y, 'work');
    return false;
  }
  if (st === 'stuck') {
    r.task = '명령 지점 막힘';
    clearManualOrder(r);
    return true;
  }
  r.phase = 'toWork';
  r.task = '명령 작업지로 이동';
  return true;
}

function handleManualOrder(state: GameState, r: Resident, ctx: Ctx): boolean {
  const order = r.manualOrder;
  if (!order) return false;
  if (order.kind === 'move') return handleManualMoveOrder(state, r, ctx, order);
  return handleManualWorkOrder(state, r, ctx, order);
}

// ─────────────────────────── 직업별 행동 ───────────────────────────

function woodcutterTick(state: GameState, r: Resident, ctx: Ctx): void {
  const a = CONFIG.agents;
  gatherJob(state, r, ctx, {
    goal: t => t.terrain === 'forest',
    workTicks: a.work.chop,
    yieldRes: 'wood',
    yieldAmt: a.yields.wood * CONFIG.seasons.woodMult[ctx.season],
    cap: a.carryCap.wood,
    depositExtra: ['lumberCamp'],
    goalField: ctx.goalFieldUserCounts.forest >= 3
      ? () => gatherGoalField(state, ctx, 'forest', t => t.terrain === 'forest')
      : undefined,
    taskWork: '벌목 중', taskMove: '숲으로 이동', taskHaul: '목재 운반',
    onHarvest: (tile, worker, woodAmount) => {
      addCarry(worker, 'brushwood', woodAmount * CONFIG.production.brushwoodPerWood);
      // 벌목한 숲은 이따금 개활지가 된다
      if (ctx.rng() < a.forestDepleteChance && tile.buildingId == null) tile.terrain = 'plain';
    },
  });
}

function hunterTick(state: GameState, r: Resident, ctx: Ctx): void {
  const a = CONFIG.agents;
  gatherJob(state, r, ctx, {
    // 짐승이 사는 서식지 범위 안에서만 사냥이 된다 (렌더러의 서식지 원과 동일 판정)
    goal: t => ctx.huntable.has(`${t.x},${t.y}`),
    workTicks: a.work.hunt,
    yieldRes: 'meat',
    // 서식지가 클수록 사냥감이 풍부하다
    yieldAmt: t => a.yields.game * CONFIG.seasons.gameMult[ctx.season] *
      (ctx.huntable.get(`${t.x},${t.y}`) ?? 0) * CONFIG.production.meatPerGame,
    cap: a.carryCap.meat,
    depositExtra: ['huntLodge'],
    goalField: ctx.goalFieldUserCounts.huntable >= 3
      ? () => gatherGoalField(state, ctx, 'huntable', t => ctx.huntable.has(`${t.x},${t.y}`))
      : undefined,
    taskWork: '사냥 중', taskMove: '서식지로 이동', taskHaul: '사냥감 운반',
    onHarvest: (_tile, res, meatAmount) => {
      addCarry(res, 'hide', (meatAmount / CONFIG.production.meatPerGame) * CONFIG.production.hidePerGame);
      if (ctx.rng() < 0.06) {
        addLog(state, `사냥꾼 ${res.name}이(가) 노루를 잡아 식량과 가죽을 가져옵니다.`, 'good');
      }
    },
  });
}

function herbalistTick(state: GameState, r: Resident, ctx: Ctx): void {
  const a = CONFIG.agents;
  const forageRatio = CONFIG.production.foragedVegetablesPerHerb;
  if (ctx.season === 'winter') {
    if (carryTotal(r) > 0) { r.phase = 'toDeposit'; }
    if (carryTotal(r) > 0) {
      goToCenter(state, r, ctx);
      if (isResidentAtBuildingInteraction(state, r, ctx.centerId)) depositAll(state, r);
    } else {
      loiterNearCenter(state, r, ctx, '마른 약초 손질');
    }
    return;
  }
  gatherJob(state, r, ctx, {
    goal: t => t.terrain === 'forest',
    workTicks: a.work.herb,
    yieldRes: 'herbs',
    yieldAmt: a.yields.herbs,
    cap: a.carryCap.herbs * (1 + forageRatio),
    depositExtra: ['herbHut'],
    goalField: ctx.goalFieldUserCounts.forest >= 3
      ? () => gatherGoalField(state, ctx, 'forest', t => t.terrain === 'forest')
      : undefined,
    taskWork: '약초·산물 채집 중', taskMove: '산기슭으로 이동', taskHaul: '약초·산물 운반',
    onHarvest: (_tile, worker, herbAmount) => {
      addCarry(worker, 'vegetables', herbAmount * forageRatio);
    },
  });
}

function maybeApplyQueuedCrop(farm: Building, season: Season): void {
  if (!farm.queuedCropId) return;
  const currentCrop = cropIdForBuilding(farm);
  if (currentCrop && farm.fieldGrowth > 0.5) return;
  if (!canPlantCropNow(farm.queuedCropId, farm.type, season)) return;
  farm.cropId = farm.queuedCropId;
  farm.queuedCropId = null;
  farm.fieldGrowth = 0;
  farm.sownArea = 0;
}

function farmerTick(state: GameState, r: Resident, ctx: Ctx): void {
  const a = CONFIG.agents;
  const p = CONFIG.production;
  const f = CONFIG.farming;
  const farm = assignedBuildingForResident(state, r);

  if (!farm || (farm.type !== 'field' && farm.type !== 'paddy') || !isResidentInAssignedSlot(state, r, farm)) {
    if (carryTotal(r) > 0) {
      const st = goTo(state, r, ctx, depositGoal(state, []));
      if (st === 'arrived' || st === 'stuck') depositAll(state, r);
      return;
    }
    loiterNearCenter(state, r, ctx, '밭 배정 없음');
    return;
  }

  maybeApplyQueuedCrop(farm, ctx.season);
  const cropId = cropIdForBuilding(farm);
  const crop = cropId ? CROP_DEFS[cropId] : null;

  if (ctx.season === 'winter') {
    if (carryTotal(r) > 0) {
      const st = goTo(state, r, ctx, depositGoal(state, []));
      if (st === 'arrived' || st === 'stuck') depositAll(state, r);
      return;
    }
    loiterNearBuilding(state, r, ctx, farm, 3, crop?.survivesWinter ? '월동 작물 관리' : '겨울 채비');
    return;
  }

  if (!cropId || !crop) {
    loiterNearBuilding(state, r, ctx, farm, 3, farm.queuedCropId ? '파종철 대기' : '작물 미선택');
    return;
  }

  const area = plotArea(farm);
  const sown = sownAreaOf(farm);
  farm.sownArea = sown;
  // 농부 1명이 tilesPerFarmer칸 몫을 감당한다 — 파종을 마친 칸수로 나눠 넓을수록 손이 더 간다
  const workBoost = f.tilesPerFarmer * plotWorkMultiplier(state, farm);
  const perTileDivisor = Math.max(1, sown);

  if (canHarvestCropNow(cropId, farm.type, ctx.season) && sown >= 0.5) {
    // 수확: 성장도가 남은 밭/논에서 선택 작물을 거둔다
    const target = farm.fieldGrowth > 0.5 ? farm : null;
    if (!target) {
      if (carryTotal(r) > 0) { r.phase = 'toDeposit'; return; }
      if (farm.queuedCropId) maybeApplyQueuedCrop(farm, ctx.season);
      loiterNearBuilding(state, r, ctx, farm, 3, '수확 마무리');
      return;
    }
    const st = goTo(state, r, ctx, buildingGoal(state, target.id));
    if (st === 'arrived') {
      r.task = '수확 중';
      const take = Math.min(
        target.fieldGrowth,
        a.work.harvestPerSubtick * ctx.outdoor * effOf(r) * workBoost / perTileDivisor,
      );
      target.fieldGrowth -= take;
      // 비옥지 보너스는 발자국 내 비옥 칸 비율만큼 (다칸 경작지의 혼합 지형 대응)
      const footprint = footprintTilesOf(state, target) ?? [];
      const fertileFraction = footprint.length > 0
        ? footprint.filter(t => t.terrain === 'fertile').length / footprint.length
        : 0;
      const fertile = target.type === 'field' ? 1 + fertileFraction * (p.fertileBonus - 1) : 1;
      // 소출은 파종을 마친 칸수에 비례한다 — 1×1 만작이면 기존과 동일
      addBuildingStock(target, crop.output, (take / 100) * crop.yield * sown * fertile * ctx.outputMod);
      if (ctx.season === 'autumn' && (crop.output === 'grain' || crop.output === 'rice')) {
        addBuildingStock(target, 'hay', hayFromHarvestProgress(take * sown));
      }
      if (target.fieldGrowth <= 0.5) {
        // 작기 종료 — 다음 파종을 위해 파종 칸을 비운다
        target.fieldGrowth = 0;
        target.sownArea = 0;
        if (target.queuedCropId) {
          target.cropId = target.queuedCropId;
          target.queuedCropId = null;
        }
      }
      gainSkillTick(r);
    } else {
      r.task = st === 'stuck' ? '길이 막힘' : `${BUILDING_DEFS[farm.type].name}(으)로 이동`;
    }
    return;
  }

  // 파종철: 아직 씨를 넣지 못한 칸부터 채운다
  if (canPlantCropNow(cropId, farm.type, ctx.season) && sown < area) {
    const st = goTo(state, r, ctx, buildingGoal(state, farm.id));
    if (st === 'arrived') {
      r.task = `${crop.name} 파종 중`;
      const sowRate = ctx.outdoor * effOf(r) * plotWorkMultiplier(state, farm) / f.sowWorkPerTile;
      farm.sownArea = Math.min(area, sown + sowRate);
      gainSkillTick(r);
    } else {
      r.task = st === 'stuck' ? '길이 막힘' : `${BUILDING_DEFS[farm.type].name}(으)로 이동`;
    }
    return;
  }

  if (!canGrowCropNow(cropId, farm.type, ctx.season) || sown < 0.5) {
    loiterNearBuilding(state, r, ctx, farm, 3, '파종철 대기');
    return;
  }

  // 생육철: 아직 안 자란 작물을 돌본다
  const target = farm.fieldGrowth < 100 ? farm : null;
  if (!target) {
    loiterNearBuilding(state, r, ctx, farm, 3, `${BUILDING_DEFS[farm.type].name} 관리`);
    return;
  }
  const st = goTo(state, r, ctx, buildingGoal(state, target.id));
  if (st === 'arrived') {
    r.task = `${crop.name} 재배 중`;
    const weatherGrow = state.weather === 'rain' ? 1.2 : state.weather === 'frost' ? 0.7 : 1;
    target.fieldGrowth = Math.min(
      100,
      target.fieldGrowth + a.work.growPerSubtick * weatherGrow * effOf(r) * workBoost / perTileDivisor,
    );
    gainSkillTick(r);
  } else {
    r.task = st === 'stuck' ? '길이 막힘' : `${BUILDING_DEFS[farm.type].name}(으)로 이동`;
  }
}

function builderTick(state: GameState, r: Resident, ctx: Ctx): void {
  const sites = state.buildings.filter(b => !b.built);
  const repairs = sites.filter(b => b.repairing);
  const target = nearestBuilding(r, repairs.length > 0 ? repairs : sites);
  if (!target) { loiterNearCenter(state, r, ctx, '지을 것 없음'); return; }
  const st = goTo(state, r, ctx, buildingGoal(state, target.id));
  if (st === 'arrived') {
    r.task = target.repairing ? '건물 수리 중' : '건설 중';
    const def = BUILDING_DEFS[target.type];
    target.progress += CONFIG.agents.work.buildPerSubtick * effOf(r) * ctx.tMod * Math.max(0.5, ctx.outdoor);
    gainSkillTick(r);
    if (target.progress >= def.buildDays) {
      const repaired = target.repairing === true;
      target.progress = def.buildDays;
      target.built = true;
      target.repairing = false;
      reconcileResidentHomes(state, ctx.rng);
      addLog(state, repaired
        ? `${def.name} 수리가 끝나 다시 가동됩니다.`
        : `${def.name}이(가) 완공되었습니다.`, 'good',
      repaired || def.slots > 0 || def.capacity > 0 || def.unique);
      const autoAssigned = autoAssignWorkersToBuilding(state, target.id);
      for (const worker of autoAssigned) resetAgent(state, worker);
      if (autoAssigned.length > 0) {
        addLog(
          state,
          `${def.name}에 근처 ${JOB_NAMES[autoAssigned[0].job]} ${autoAssigned.length}명을 자동 배정했습니다.`,
          'good',
        );
      }
      if (def.winterBonus && !repaired) {
        addLog(state, '온돌집 덕분에 주민들의 체온 손실이 줄어들 것입니다.', 'good');
      }
    }
  } else {
    r.task = st === 'stuck' ? '길이 막힘' : '공사장으로 이동';
  }
}

const HAUL_PRIORITY: ResourceId[] = [
  'grain', 'rice', 'vegetables', 'kimchi', 'beans', 'meat', 'eggs', 'milk', 'fish',
  'curedMeat', 'saltedFish', 'driedFish', 'jang',
  'firewood', 'brushwood', 'charcoal', 'wood',
  'hideClothes', 'cottonClothes', 'tools', 'onggi', 'carts', 'gunpowder', 'spears', 'hornBows', 'muskets',
  'hide', 'cotton', 'wool', 'hay', 'herbs', 'stone', 'iron',
];

const FOOD_HAUL_RESOURCES = new Set<ResourceId>([...FOOD_RESOURCES, 'rice']);
const FUEL_HAUL_RESOURCES = new Set<ResourceId>(FUEL_RESOURCES);
const CLOTHING_HAUL_RESOURCES = new Set<ResourceId>(['hideClothes', 'cottonClothes']);
const COMBAT_HAUL_RESOURCES = new Set<ResourceId>(['gunpowder', 'spears', 'hornBows', 'muskets']);
const JANGDOKDAE_SUPPLY_PRIORITY = ['onggi', 'salt', 'beans'] as const satisfies readonly ResourceId[];

function reservedSupplyAmount(
  state: GameState,
  targetBuildingId: number,
  resource: ResourceId,
  exceptResidentId: number,
): number {
  return state.residents.reduce((sum, resident) => {
    const task = resident.haulTask;
    if (!resident.alive || resident.id === exceptResidentId || task?.kind !== 'supply') return sum;
    if (task.targetBuildingId !== targetBuildingId || task.resource !== resource) return sum;
    return sum + task.amount;
  }, 0);
}

function reservedSettlementSupplyAmount(
  state: GameState,
  resource: ResourceId,
  exceptResidentId: number,
): number {
  return state.residents.reduce((sum, resident) => {
    const task = resident.haulTask;
    if (!resident.alive || resident.id === exceptResidentId || task?.kind !== 'supply') return sum;
    if (task.resource !== resource || carryTotal(resident) > 0) return sum;
    return sum + task.amount;
  }, 0);
}

function assignJangdokdaeSupplyTask(state: GameState, resident: Resident): boolean {
  const storage = state.buildings
    .filter(isStorageBuilding)
    .sort((a, b) => (
      Math.abs(a.x - resident.x) + Math.abs(a.y - resident.y)
      - Math.abs(b.x - resident.x) - Math.abs(b.y - resident.y)
    ) || a.id - b.id)[0];
  if (!storage) return false;

  const targets = state.buildings
    .filter(building => building.built && building.type === 'jangdokdae')
    .sort((a, b) => (
      Math.abs(a.x - resident.x) + Math.abs(a.y - resident.y)
      - Math.abs(b.x - resident.x) - Math.abs(b.y - resident.y)
    ) || a.id - b.id);
  for (const target of targets) {
    const needs = jangdokdaeInputNeeds(state, target);
    for (const resource of JANGDOKDAE_SUPPLY_PRIORITY) {
      const missing = Math.max(
        0,
        (needs[resource] ?? 0) - reservedSupplyAmount(state, target.id, resource, resident.id),
      );
      const available = Math.max(
        0,
        state.resources[resource]
          - reservedSettlementSupplyAmount(state, resource, resident.id),
      );
      const amount = Math.min(haulerCarryCapacity(resident), missing, available);
      if (amount <= 0.05) continue;
      resident.haulTask = {
        kind: 'supply',
        sourceBuildingId: storage.id,
        targetBuildingId: target.id,
        resource,
        amount,
      };
      resident.targetId = storage.id;
      resident.path = [];
      return true;
    }
  }
  return false;
}

function reservedHaulAmount(
  state: GameState,
  sourceBuildingId: number,
  resource: ResourceId,
  exceptResidentId: number,
): number {
  return state.residents.reduce((sum, resident) => {
    const task = resident.haulTask;
    if (resident.id === exceptResidentId || !task || carryTotal(resident) > 0) return sum;
    if (task.kind === 'supply') return sum;
    if (task.sourceBuildingId !== sourceBuildingId || task.resource !== resource) return sum;
    return sum + task.amount;
  }, 0);
}

function availableHaulAmount(
  state: GameState,
  building: Building,
  resource: ResourceId,
  residentId: number,
): number {
  if (building.type === 'jangdokdae') {
    const protectedInputs = jangdokdaeInputNeeds(state, building);
    if (Object.prototype.hasOwnProperty.call(protectedInputs, resource)) return 0;
  } else if (isWorkplaceInputStock(building, resource)) return 0;
  return Math.max(
    0,
    buildingStock(building, resource) - reservedHaulAmount(state, building.id, resource, residentId),
  );
}

function haulBatchMinimum(resident: Resident): number {
  return resident.cartEquipped ? CONFIG.agents.haulerCartBatchMin : CONFIG.agents.haulerBatchMin;
}

function assignHaulTask(state: GameState, resident: Resident): boolean {
  if (assignJangdokdaeSupplyTask(state, resident)) return true;

  // 성능: 기존 구현은 자원 25종 × 건물마다 (다른 주민 전체를 훑는) 예약량 계산을
  // 반복해 운반꾼 1명당 수백만 연산이 됐다. 예약량·가용량·긴급 판정 재료를
  // 한 번씩만 집계해 두고 같은 결과를 고른다.
  const sources = state.buildings.filter(building => building.built && !isStorageBuilding(building));
  if (sources.length === 0) return false;

  // 다른 운반꾼이 이미 예약한 양 (건물|자원 → 합계)
  const reserved = new Map<string, number>();
  for (const other of state.residents) {
    const task = other.haulTask;
    if (other.id === resident.id || !task || task.kind === 'supply' || carryTotal(other) > 0) continue;
    if (task.sourceBuildingId == null || !task.resource) continue;
    const key = `${task.sourceBuildingId}|${task.resource}`;
    reserved.set(key, (reserved.get(key) ?? 0) + task.amount);
  }

  // 건물별 자원별 가용량 행렬 — availableHaulAmount와 같은 규칙, 계산은 한 번씩만
  const perBuilding = sources.map(building => {
    const protectedInputs = building.type === 'jangdokdae'
      ? jangdokdaeInputNeeds(state, building)
      : null;
    const inputResources = protectedInputs ? null : workplaceInputResources(building);
    const amounts = HAUL_PRIORITY.map(resource => {
      if (protectedInputs && Object.prototype.hasOwnProperty.call(protectedInputs, resource)) return 0;
      if (inputResources && inputResources.includes(resource)) return 0;
      return Math.max(
        0,
        buildingStock(building, resource) - (reserved.get(`${building.id}|${resource}`) ?? 0),
      );
    });
    return { building, amounts, load: amounts.reduce((total, amount) => total + amount, 0) };
  });

  // 긴급 판정의 자원 무관 재료를 한 번만 계산 (isUrgentHaulResource와 같은 기준)
  const living = state.residents.filter(other => other.alive);
  const population = living.length;
  const foodLow = foodTotal(state) < population * 3;
  const fuelLow = fuelHeatTotal(state) < population * 2;
  const toolsLow = state.resources.tools < 3;
  const clothingLow = clothingCoverageTotal(state) < population * 0.5;
  const anySick = living.some(other => other.sick);
  const cartlessHauler = living.some(other => other.job === 'hauler' && !other.cartEquipped);
  const combatTension = state.threat >= CONFIG.threat.raidThreshold || state.raiders != null || state.battle != null;
  const isUrgent = (resource: ResourceId, available: number): boolean =>
    (FOOD_HAUL_RESOURCES.has(resource) && foodLow) ||
    (FUEL_HAUL_RESOURCES.has(resource) && fuelLow) ||
    (resource === 'tools' && toolsLow) ||
    (resource === 'carts' && state.resources.carts < 1 && state.resources.carts + available >= 1 && cartlessHauler) ||
    (CLOTHING_HAUL_RESOURCES.has(resource) && clothingLow) ||
    (resource === 'herbs' && anySick) ||
    (COMBAT_HAUL_RESOURCES.has(resource) && combatTension);

  const batchMin = haulBatchMinimum(resident);
  for (let index = 0; index < HAUL_PRIORITY.length; index++) {
    const resource = HAUL_PRIORITY[index];
    let best: { building: Building; available: number; distance: number } | null = null;
    for (const candidate of perBuilding) {
      const available = candidate.amounts[index];
      if (available <= 0.05) continue;
      if (!isUrgent(resource, available) && candidate.load + 0.0001 < batchMin) continue;
      const distance = Math.abs(candidate.building.x - resident.x) + Math.abs(candidate.building.y - resident.y);
      if (!best || distance < best.distance ||
        (distance === best.distance && candidate.building.id < best.building.id)) {
        best = { building: candidate.building, available, distance };
      }
    }
    if (!best) continue;
    resident.haulTask = {
      sourceBuildingId: best.building.id,
      resource,
      amount: Math.min(haulerCarryCapacity(resident), best.available),
    };
    resident.targetId = best.building.id;
    resident.path = [];
    return true;
  }
  return false;
}

function clearHaulTask(resident: Resident): void {
  resident.haulTask = null;
  resident.targetId = null;
  resident.path = [];
}

function collectHaulLoad(state: GameState, resident: Resident, source: Building): number {
  const task = resident.haulTask;
  if (!task) return 0;
  const resources = [task.resource, ...HAUL_PRIORITY.filter(resource => resource !== task.resource)];
  for (const resource of resources) {
    const remaining = haulerCarryCapacity(resident) - carryTotal(resident);
    if (remaining <= 0.0001) break;
    const amount = Math.min(
      remaining,
      availableHaulAmount(state, source, resource, resident.id),
    );
    if (amount <= 0.05) continue;
    addCarry(resident, resource, takeBuildingStock(source, resource, amount));
  }
  return carryTotal(resident);
}

function handleSupplyHaulTask(state: GameState, resident: Resident, ctx: Ctx): void {
  const task = resident.haulTask;
  if (task?.kind !== 'supply' || task.targetBuildingId == null) return;
  const target = state.buildings.find(building =>
    building.id === task.targetBuildingId && building.built && building.type === 'jangdokdae');
  if (!target) {
    if (carryTotal(resident) > 0) depositResidentToSettlement(state, resident);
    clearHaulTask(resident);
    resident.phase = 'rest';
    return;
  }

  if (carryTotal(resident) > 0) {
    resident.phase = 'toDeposit';
    resident.task = `${BUILDING_DEFS[target.type].name} 재료 운반`;
    const status = goTo(state, resident, ctx, buildingGoal(state, target.id));
    if (status === 'arrived') {
      depositResidentToBuilding(target, resident);
      clearHaulTask(resident);
      resident.phase = 'rest';
    } else if (status === 'stuck') {
      depositResidentToSettlement(state, resident);
      clearHaulTask(resident);
      resident.phase = 'rest';
    }
    return;
  }

  const source = state.buildings.find(building =>
    building.id === task.sourceBuildingId && isStorageBuilding(building));
  if (!source || state.resources[task.resource] <= 0.05) {
    clearHaulTask(resident);
    resident.phase = 'rest';
    return;
  }
  resident.phase = 'toWork';
  resident.task = `${RESOURCE_NAMES[task.resource]} 싣는 중`;
  const status = goTo(state, resident, ctx, buildingGoal(state, source.id));
  if (status === 'arrived') {
    const amount = Math.min(task.amount, haulerCarryCapacity(resident), state.resources[task.resource]);
    if (amount > 0.05) {
      state.resources[task.resource] -= amount;
      addCarry(resident, task.resource, amount);
      resident.phase = 'toDeposit';
      resident.targetId = target.id;
      resident.path = [];
    } else {
      clearHaulTask(resident);
      resident.phase = 'rest';
    }
  } else if (status === 'stuck') {
    clearHaulTask(resident);
    resident.phase = 'rest';
  }
}

function haulerTick(state: GameState, r: Resident, ctx: Ctx): void {
  if (r.haulTask?.kind === 'supply') {
    handleSupplyHaulTask(state, r, ctx);
    return;
  }

  // 생산지에서 실은 짐을 창고에 하역한다.
  if (carryTotal(r) > 0) {
    r.phase = 'toDeposit';
    r.task = '창고로 운반';
    const st = goTo(state, r, ctx, depositGoal(state, []));
    if (st === 'arrived' || st === 'stuck') {
      depositResidentToSettlement(state, r);
      clearHaulTask(r);
      r.phase = 'rest';
    }
    return;
  }

  if (!r.haulTask) assignHaulTask(state, r);
  const assignedTask = r.haulTask as Resident['haulTask'];
  if (assignedTask?.kind === 'supply') {
    handleSupplyHaulTask(state, r, ctx);
    return;
  }
  const task = assignedTask;
  if (task) {
    const source = state.buildings.find(building =>
      building.id === task.sourceBuildingId && building.built && !isStorageBuilding(building));
    if (!source || buildingStock(source, task.resource) <= 0.05) {
      clearHaulTask(r);
      r.phase = 'rest';
      return;
    }
    r.phase = 'toWork';
    r.task = `${BUILDING_DEFS[source.type].name} 재고 수거`;
    const st = goTo(state, r, ctx, buildingGoal(state, source.id));
    if (st === 'arrived') {
      if (collectHaulLoad(state, r, source) > 0) {
        r.phase = 'toDeposit';
        r.path = [];
      } else {
        clearHaulTask(r);
        r.phase = 'rest';
      }
    } else if (st === 'stuck') {
      clearHaulTask(r);
      r.phase = 'rest';
    }
    return;
  }

  loiterNearCenter(state, r, ctx, '대기');
}

function millerTick(state: GameState, r: Resident, ctx: Ctx): void {
  const p = CONFIG.production;
  const mill = assignedWorkplace(state, r, ctx, 'watermill', '방앗간 배정 없음');
  if (!mill) return;

  const target = (p.millerRicePerDay / 5) * effOf(r) * ctx.outputMod;
  if (supplyWorkplaceInputs(state, r, ctx, mill, { rice: target })) return;

  const st = goTo(state, r, ctx, buildingGoal(state, mill.id));
  if (st !== 'arrived') {
    r.phase = st === 'stuck' ? 'rest' : 'toWork';
    r.task = st === 'stuck' ? '길이 막힘' : '방앗간으로 이동';
    return;
  }

  const q = Math.min(buildingStock(mill, 'rice'), target);
  if (q <= 0.05) {
    r.phase = 'rest';
    loiterNearBuilding(state, r, ctx, mill, 3, '도정할 곡물 없음');
    return;
  }

  takeBuildingStock(mill, 'rice', q);
  addBuildingStock(mill, 'grain', q * p.grainPerRice);
  r.phase = 'working';
  r.task = '방아 찧기';
  gainSkillTick(r);
}

function woodSplitterTick(state: GameState, r: Resident, ctx: Ctx): void {
  const shed = assignedWorkplace(state, r, ctx, 'woodShed', '장작마당 배정 없음');
  if (!shed) return;
  const target = (CONFIG.production.firewoodWoodPerDay / 5) * effOf(r) * ctx.outputMod;
  if (supplyWorkplaceInputs(state, r, ctx, shed, { wood: target })) return;
  const st = goTo(state, r, ctx, buildingGoal(state, shed.id));
  if (st !== 'arrived') {
    r.phase = st === 'stuck' ? 'rest' : 'toWork';
    r.task = st === 'stuck' ? '길이 막힘' : '장작마당으로 이동';
    return;
  }
  const wood = Math.min(
    buildingStock(shed, 'wood'),
    target,
  );
  if (wood <= 0.05) {
    r.phase = 'rest';
    r.task = '목재 대기';
    return;
  }
  takeBuildingStock(shed, 'wood', wood);
  addBuildingStock(shed, 'firewood', wood * CONFIG.production.firewoodPerWood);
  r.phase = 'working';
  r.task = '장작 패기';
  gainSkillTick(r);
}

function smithMaxCraftable(smithy: Building, product: SmithyProductId): number {
  const inputs = SMITHY_PRODUCT_DEFS[product].inputPerUnit;
  let max = Infinity;
  for (const [resource, perUnit] of Object.entries(inputs) as [ResourceId, number][]) {
    if (perUnit <= 0) continue;
    max = Math.min(max, buildingStock(smithy, resource) / perUnit);
  }
  return max === Infinity ? 0 : max;
}

function consumeSmithInputs(smithy: Building, product: SmithyProductId, made: number): void {
  const inputs = SMITHY_PRODUCT_DEFS[product].inputPerUnit;
  for (const [resource, perUnit] of Object.entries(inputs) as [ResourceId, number][]) {
    takeBuildingStock(smithy, resource, perUnit * made);
  }
}

function smithInputRequirements(product: SmithyProductId, target: number): WorkplaceInputs {
  const def = SMITHY_PRODUCT_DEFS[product];
  return Object.fromEntries(
    (Object.entries(def.inputPerUnit) as [ResourceId, number][])
      .map(([resource, amount]) => [resource, amount * target]),
  ) as WorkplaceInputs;
}

function smithInputWaitTask(smithy: Building, requirements: WorkplaceInputs): string {
  const missing = (Object.entries(requirements) as [ResourceId, number][])
    .find(([resource]) => buildingStock(smithy, resource) <= 0.02)?.[0];
  return missing ? `${RESOURCE_NAMES[missing]} 대기` : '재료 대기';
}

function smithTick(state: GameState, r: Resident, ctx: Ctx): void {
  const smithy = assignedWorkplace(state, r, ctx, 'smithy', '대장간 배정 없음');
  if (!smithy) return;
  const product = smithyProductOf(smithy);
  const def = SMITHY_PRODUCT_DEFS[product];
  // 도망 야장 막쇠 '천출의 망치' — 본인의 산출이 오른다
  const specialMult = r.special === 'runawaySmith' ? CONFIG.specialResidents.runawaySmithSmithyMult : 1;
  const target = (def.ratePerDay / 5) * effOf(r) * ctx.outputMod * specialMult;
  const requirements = smithInputRequirements(product, target);

  if (carryTotal(r) > 0) {
    supplyWorkplaceInputs(state, r, ctx, smithy, requirements);
    return;
  }

  if (!isSmithyProductUnlocked(state.rank, product)) {
    const st = goTo(state, r, ctx, buildingGoal(state, smithy.id));
    r.phase = st === 'moving' ? 'toWork' : 'rest';
    r.task = st === 'stuck' ? '길이 막힘' : st === 'arrived' ? '생산 잠김' : '대장간으로 이동';
    return;
  }

  if (supplyWorkplaceInputs(state, r, ctx, smithy, requirements)) return;
  const made = Math.min(target, smithMaxCraftable(smithy, product));
  if (made <= 0.02) {
    const st = goTo(state, r, ctx, buildingGoal(state, smithy.id));
    r.phase = st === 'moving' ? 'toWork' : 'rest';
    r.task = st === 'stuck' ? '길이 막힘' : st === 'arrived'
      ? smithInputWaitTask(smithy, requirements)
      : '대장간으로 이동';
    return;
  }

  const st = goTo(state, r, ctx, buildingGoal(state, smithy.id));
  if (st === 'arrived') {
    r.phase = 'working';
    r.task = def.task;
    consumeSmithInputs(smithy, product, made);
    addBuildingStock(smithy, def.output, made);
    gainSkillTick(r);
  } else {
    r.phase = st === 'stuck' ? 'rest' : 'toWork';
    r.task = st === 'stuck' ? '길이 막힘' : '대장간으로 이동';
  }
}

function scaledRequirements(inputs: WorkplaceInputs, target: number): WorkplaceInputs {
  return Object.fromEntries(
    (Object.entries(inputs) as [ResourceId, number][])
      .map(([resource, amount]) => [resource, amount * target]),
  ) as WorkplaceInputs;
}

function maxCraftableFrom(workplace: Building, inputs: WorkplaceInputs): number {
  let max = Infinity;
  for (const [resource, perUnit] of Object.entries(inputs) as [ResourceId, number][]) {
    if (perUnit <= 0) continue;
    max = Math.min(max, buildingStock(workplace, resource) / perUnit);
  }
  return max === Infinity ? 0 : max;
}

function consumeRecipeInputs(workplace: Building, inputs: WorkplaceInputs, made: number): void {
  for (const [resource, perUnit] of Object.entries(inputs) as [ResourceId, number][]) {
    takeBuildingStock(workplace, resource, perUnit * made);
  }
}

function inputWaitTask(workplace: Building, requirements: WorkplaceInputs): string {
  const missing = (Object.entries(requirements) as [ResourceId, number][])
    .find(([resource]) => buildingStock(workplace, resource) <= 0.02)?.[0];
  return missing ? `${RESOURCE_NAMES[missing]} 대기` : '재료 대기';
}

function preferredKilnFuel(state: GameState, workplace: Building): 'firewood' | 'charcoal' {
  if (buildingStock(workplace, 'charcoal') > 0.02) return 'charcoal';
  if (buildingStock(workplace, 'firewood') > 0.02) return 'firewood';
  if (state.resources.charcoal > 0.05) return 'charcoal';
  return 'firewood';
}

function curerTick(state: GameState, r: Resident, ctx: Ctx): void {
  const workplace = assignedWorkplaceOfTypes(
    state, r, ctx, ['smokehouse', 'dryingRack'], '갈무리 작업장 배정 없음',
  );
  if (!workplace) return;

  let output: ResourceId;
  let inputs: WorkplaceInputs;
  let target: number;
  let task: string;
  let rainBlocked = false;

  if (workplace.type === 'smokehouse') {
    const fuel = preferredKilnFuel(state, workplace);
    output = 'curedMeat';
    inputs = {
      meat: CONFIG.production.meatPerCuredMeat,
      [fuel]: fuel === 'charcoal'
        ? CONFIG.production.charcoalPerCuredMeat
        : CONFIG.production.firewoodPerCuredMeat,
    };
    target = (CONFIG.production.curedMeatPerDay / 5) * effOf(r) * ctx.outputMod;
    task = '고기 훈연 중';
  } else {
    const def = DRYING_PRODUCT_DEFS[dryingProductOf(workplace)];
    output = def.output;
    inputs = def.inputPerUnit;
    target = (def.ratePerDay / 5) * effOf(r) * ctx.outputMod;
    task = def.task;
    rainBlocked = def.stopsInRain && state.weather === 'rain';
  }

  const requirements = scaledRequirements(inputs, target);
  if (carryTotal(r) > 0) {
    supplyWorkplaceInputs(state, r, ctx, workplace, requirements);
    return;
  }
  if (supplyWorkplaceInputs(state, r, ctx, workplace, requirements)) return;

  const st = goTo(state, r, ctx, buildingGoal(state, workplace.id));
  if (st !== 'arrived') {
    r.phase = st === 'stuck' ? 'rest' : 'toWork';
    r.task = st === 'stuck' ? '길이 막힘' : `${BUILDING_DEFS[workplace.type].name}(으)로 이동`;
    return;
  }
  if (rainBlocked) {
    r.phase = 'rest';
    r.task = '비가 그치기를 기다림';
    return;
  }

  const made = Math.min(target, maxCraftableFrom(workplace, inputs));
  if (made <= 0.02) {
    r.phase = 'rest';
    r.task = inputWaitTask(workplace, requirements);
    return;
  }

  consumeRecipeInputs(workplace, inputs, made);
  addBuildingStock(workplace, output, made);
  r.phase = 'working';
  r.task = task;
  gainSkillTick(r);
}

function potterTick(state: GameState, r: Resident, ctx: Ctx): void {
  const kiln = assignedWorkplace(state, r, ctx, 'onggiKiln', '옹기가마 배정 없음');
  if (!kiln) return;
  const fuel = preferredKilnFuel(state, kiln);
  const inputs: WorkplaceInputs = {
    [fuel]: fuel === 'charcoal'
      ? CONFIG.production.charcoalPerOnggi
      : CONFIG.production.firewoodPerOnggi,
  };
  const target = (CONFIG.production.onggiPerDay / 5) * effOf(r) * ctx.outputMod;
  const requirements = scaledRequirements(inputs, target);

  if (carryTotal(r) > 0) {
    supplyWorkplaceInputs(state, r, ctx, kiln, requirements);
    return;
  }
  if (supplyWorkplaceInputs(state, r, ctx, kiln, requirements)) return;

  const st = goTo(state, r, ctx, buildingGoal(state, kiln.id));
  if (st !== 'arrived') {
    r.phase = st === 'stuck' ? 'rest' : 'toWork';
    r.task = st === 'stuck' ? '길이 막힘' : '옹기가마로 이동';
    return;
  }

  const made = Math.min(target, maxCraftableFrom(kiln, inputs));
  if (made <= 0.02) {
    r.phase = 'rest';
    r.task = inputWaitTask(kiln, requirements);
    return;
  }

  consumeRecipeInputs(kiln, inputs, made);
  addBuildingStock(kiln, 'onggi', made);
  r.phase = 'working';
  r.task = '점토를 빚어 옹기 굽는 중';
  gainSkillTick(r);
}

function minerTick(state: GameState, r: Resident, ctx: Ctx): void {
  const a = CONFIG.agents;
  const miningTile = state.map[r.y]?.[r.x];
  const miningIron = miningTile?.terrain === 'rock' && miningTile.hasIron;
  const miningSilver = miningTile?.terrain === 'rock' && !!miningTile.hasSilver;
  // 설점(보고 후 허가) 채굴은 산출의 큰 몫이 조정 몫으로 빠진다
  const sanctionKeep = state.silverVein?.status === 'sanctioned'
    && state.silverVein.x === miningTile?.x && state.silverVein.y === miningTile?.y
    ? 1 - CONFIG.silver.sanctionTaxRatio
    : 1;
  // 맹인 지관 허생 '산세 읽기' — 마을 전체 채광 산출이 오른다
  const geomancerMult = state.residents.some(resident => resident.alive && resident.special === 'geomancer')
    ? 1 + CONFIG.specialResidents.geomancerMiningYieldBonus
    : 1;
  gatherJob(state, r, ctx, {
    goal: t => t.terrain === 'rock' && mineralRemaining(t) > 0 && !isVeinSealedTile(state, t),
    workTicks: a.work.mine,
    yieldRes: miningSilver ? 'silver' : miningIron ? 'iron' : 'stone',
    yieldAmt: tile => (tile.hasSilver ? a.yields.silver : tile.hasIron ? a.yields.iron : a.yields.stone) * geomancerMult,
    cap: miningSilver ? a.carryCap.silver : miningIron ? a.carryCap.iron : a.carryCap.stone,
    depositExtra: [],
    goalField: ctx.goalFieldUserCounts.mineral >= 3
      ? () => gatherGoalField(
        state,
        ctx,
        'mineral',
        t => t.terrain === 'rock' && mineralRemaining(t) > 0 && !isVeinSealedTile(state, t),
      )
      : undefined,
    depositTargets: (currentState, worker) => {
      const mine = worker.miningDepositBuildingId == null
        ? null
        : currentState.buildings.find(building =>
          building.id === worker.miningDepositBuildingId && building.built && building.type === 'mine');
      return mine ? [mine] : depositBuildings(currentState, []);
    },
    onDeposit: worker => { worker.miningDepositBuildingId = null; },
    taskWork: miningSilver ? '은맥 채굴 중' : '채광 중',
    taskMove: '광상으로 이동',
    taskHaul: '광물 운반',
    taskNone: '캘 광상 없음',
    adjustHarvestAmount: (tile, _worker, amount) => {
      const extraction = extractMineralDeposit(tile, amount);
      if (extraction.depleted) logMineralDepletion(state, tile, extraction.resource);
      if (extraction.resource === 'silver') {
        recordSilverMined(state, extraction.amount);
        return extraction.amount * sanctionKeep;
      }
      if (extraction.amount > 0) recordRockMining(state, tile);
      return extraction.amount;
    },
    onHarvest: (tile, worker, amount) => {
      worker.miningDepositBuildingId = servingMineForTile(state, tile)?.id ?? null;
      if (miningIron) addCarry(worker, 'stone', amount * (a.yields.mineStone / a.yields.iron));
    },
  });
}

function fisherTick(state: GameState, r: Resident, ctx: Ctx): void {
  const a = CONFIG.agents;
  const floodMult = state.weather === 'thawFlood' ? 0.25 : 1;
  const ferry = assignedWorkplace(state, r, ctx, 'ferry', '나루터 배정 없음');
  if (!ferry) return;
  gatherJob(state, r, ctx, {
    goal: buildingInteractionGoal(state, [ferry.id]),
    workTicks: a.work.fish,
    yieldRes: 'fish',
    yieldAmt: a.yields.fish * CONFIG.seasons.fishMult[ctx.season] * floodMult,
    cap: a.carryCap.fish,
    depositExtra: ['ferry'],
    taskWork: '고기잡이 중',
    taskMove: '나루터로 이동',
    taskHaul: '물고기 운반',
  });
}

function charcoalBurnerTick(state: GameState, r: Resident, ctx: Ctx): void {
  const p = CONFIG.production;
  const kiln = assignedWorkplace(state, r, ctx, 'charcoalKiln', '숯가마 배정 없음');
  if (!kiln) return;

  const target = (p.charcoalWoodPerDay / 5) * effOf(r) * ctx.outputMod;
  if (supplyWorkplaceInputs(state, r, ctx, kiln, { wood: target })) return;

  const st = goTo(state, r, ctx, buildingGoal(state, kiln.id));
  if (st !== 'arrived') {
    r.phase = st === 'stuck' ? 'rest' : 'toWork';
    r.task = st === 'stuck' ? '길이 막힘' : '숯가마로 이동';
    return;
  }

  const wood = Math.min(
    buildingStock(kiln, 'wood'),
    target,
  );
  if (wood <= 0.05) {
    r.phase = 'rest';
    loiterNearBuilding(state, r, ctx, kiln, 3, '목재 대기');
    return;
  }

  takeBuildingStock(kiln, 'wood', wood);
  addBuildingStock(kiln, 'charcoal', wood * p.charcoalPerWood);
  r.phase = 'working';
  r.task = '숯 굽기';
  gainSkillTick(r);
}

function herderTick(state: GameState, r: Resident, ctx: Ctx): void {
  const stable = assignedWorkplace(state, r, ctx, 'stable', '축사 배정 없음');
  if (!stable) return;
  const livestock = ensureLivestockState(stable);
  if (livestock.headcount <= 0) {
    loiterNearBuilding(state, r, ctx, stable, 3, '돌볼 가축 없음');
    return;
  }

  const st = goTo(state, r, ctx, buildingGoal(state, stable.id));
  if (st !== 'arrived') {
    r.phase = st === 'stuck' ? 'rest' : 'toWork';
    r.task = st === 'stuck' ? '길이 막힘' : '축사로 이동';
    return;
  }

  const product = livestockProductForHerder(livestock, ctx.season, (effOf(r) * ctx.outputMod) / SUBTICKS);
  if (product && product.amount > 0) addBuildingStock(stable, product.resource, product.amount);
  r.phase = 'working';
  r.task = product?.task ?? '가축 돌보기';
  gainSkillTick(r);
}

function physicianTick(state: GameState, r: Resident, ctx: Ctx): void {
  const clinic = assignedWorkplace(state, r, ctx, 'clinic', '의원 배정 없음');
  if (!clinic) return;
  const st = goTo(state, r, ctx, buildingGoal(state, clinic.id));
  if (st !== 'arrived') {
    r.phase = st === 'stuck' ? 'rest' : 'toWork';
    r.task = st === 'stuck' ? '길이 막힘' : '의원으로 이동';
    return;
  }

  const result = performPhysicianTreatment(state, r, effOf(r) * ctx.mMod, ctx.rng);
  if (result.status === 'no-patient') {
    loiterNearBuilding(state, r, ctx, clinic, 3, '진료할 환자 없음');
    return;
  }
  if (result.status === 'no-herbs') {
    loiterNearBuilding(state, r, ctx, clinic, 3, '약초 대기');
    return;
  }
  r.phase = 'working';
  r.task = `${result.patient?.name ?? '환자'} 진료 중`;
  gainSkillTick(r);
  if (result.status === 'recovered' && result.patient) {
    addLog(state, `의원 ${r.name}의 치료로 ${result.patient.name}이(가) 병에서 회복했습니다.`, 'good');
  }
}

function powderMakerTick(state: GameState, r: Resident, ctx: Ctx): void {
  const p = CONFIG.production;
  // 가동 중지(토글) 또는 감찰 은닉 중이면 화약을 만들지 않는다
  if (state.nitrePaused || state.day < state.nitreHiddenUntil) {
    loiterNearCenter(state, r, ctx, '염초장 가동 중지');
    return;
  }
  const yard = assignedWorkplace(state, r, ctx, 'nitreYard', '질초장 배정 없음');
  if (!yard) return;

  const target = (p.gunpowderPerDay / 5) * effOf(r) * ctx.outputMod;
  const requirements = {
    firewood: target * p.gunpowderFirewoodPerPowder,
    stone: target * p.gunpowderStonePerPowder,
  } satisfies WorkplaceInputs;
  if (supplyWorkplaceInputs(state, r, ctx, yard, requirements)) return;

  const st = goTo(state, r, ctx, buildingGoal(state, yard.id));
  if (st !== 'arrived') {
    r.phase = st === 'stuck' ? 'rest' : 'toWork';
    r.task = st === 'stuck' ? '길이 막힘' : '염초장으로 이동';
    return;
  }

  const firewoodLimit = buildingStock(yard, 'firewood') / p.gunpowderFirewoodPerPowder;
  const stoneLimit = buildingStock(yard, 'stone') / p.gunpowderStonePerPowder;
  const made = Math.min(target, firewoodLimit, stoneLimit);
  if (made <= 0.02) {
    r.phase = 'rest';
    loiterNearBuilding(state, r, ctx, yard, 3, '화약 재료 대기');
    return;
  }

  takeBuildingStock(yard, 'firewood', made * p.gunpowderFirewoodPerPowder);
  takeBuildingStock(yard, 'stone', made * p.gunpowderStonePerPowder);
  addBuildingStock(yard, 'gunpowder', made);
  r.phase = 'working';
  r.task = '화약 제조';
  gainSkillTick(r);
}

function tannerTick(state: GameState, r: Resident, ctx: Ctx): void {
  const p = CONFIG.production;
  const tannery = assignedWorkplace(state, r, ctx, 'tannery', '무두장 배정 없음');
  if (!tannery) return;

  const target = (p.tanneryHidePerDay / 5) * effOf(r) * ctx.outputMod;
  if (supplyWorkplaceInputs(state, r, ctx, tannery, { hide: target })) return;

  const st = goTo(state, r, ctx, buildingGoal(state, tannery.id));
  if (st !== 'arrived') {
    r.phase = st === 'stuck' ? 'rest' : 'toWork';
    r.task = st === 'stuck' ? '길이 막힘' : '무두장으로 이동';
    return;
  }

  const hideUsed = Math.min(
    buildingStock(tannery, 'hide'),
    target,
  );
  if (hideUsed <= 0.05) {
    r.phase = 'rest';
    loiterNearBuilding(state, r, ctx, tannery, 3, '가죽 대기');
    return;
  }

  takeBuildingStock(tannery, 'hide', hideUsed);
  addBuildingStock(tannery, 'hideClothes', hideUsed / 2);
  r.phase = 'working';
  r.task = '무두질';
  gainSkillTick(r);
}

function weaverTick(state: GameState, r: Resident, ctx: Ctx): void {
  const weavingHouse = assignedWorkplace(state, r, ctx, 'weavingHouse', '베틀집 배정 없음');
  if (!weavingHouse) return;
  const target = (CONFIG.production.weaverCottonPerDay / 5) * effOf(r) * ctx.outputMod;
  const cottonAvailable = buildingStock(weavingHouse, 'cotton') + (state.resources.cotton ?? 0);
  const woolAvailable = buildingStock(weavingHouse, 'wool') + (state.resources.wool ?? 0);
  const input: 'cotton' | 'wool' = cottonAvailable > 0.05 || woolAvailable <= 0.05 ? 'cotton' : 'wool';
  if (supplyWorkplaceInputs(state, r, ctx, weavingHouse, { [input]: target })) return;
  const st = goTo(state, r, ctx, buildingGoal(state, weavingHouse.id));
  if (st !== 'arrived') {
    r.phase = st === 'stuck' ? 'rest' : 'toWork';
    r.task = st === 'stuck' ? '길이 막힘' : '베틀집으로 이동';
    return;
  }
  const fiber = Math.min(
    buildingStock(weavingHouse, input),
    target,
  );
  if (fiber <= 0.05) {
    r.phase = 'rest';
    r.task = '섬유 대기';
    return;
  }
  takeBuildingStock(weavingHouse, input, fiber);
  addBuildingStock(weavingHouse, 'cottonClothes', fiber * CONFIG.production.cottonClothesPerCotton);
  r.phase = 'working';
  r.task = input === 'wool' ? '양털 짜기' : '베 짜기';
  gainSkillTick(r);
}

function clerkTick(state: GameState, r: Resident, ctx: Ctx): void {
  const office = nearestBuilding(r, state.buildings.filter(b => b.type === 'office' && b.built));
  if (!office) {
    loiterNearCenter(state, r, ctx, '관청 없음');
    return;
  }

  const st = goTo(state, r, ctx, buildingGoal(state, office.id));
  if (st === 'arrived') {
    r.phase = 'working';
    r.task = '관청 업무';
    gainSkillTick(r);
  } else {
    r.phase = st === 'stuck' ? 'rest' : 'toWork';
    r.task = st === 'stuck' ? '길이 막힘' : '관청으로 이동';
  }
}

function watchmanTick(state: GameState, r: Resident, ctx: Ctx): void {
  r.task = '경계 근무';
  // 방어 시설 사이를 순찰한다
  const posts = state.buildings.filter(b =>
    b.built && (BUILDING_DEFS[b.type].defense > 0 || b.type === 'center'));
  if (posts.length === 0) { loiterNearCenter(state, r, ctx, '경계 근무'); return; }
  let target = posts.find(b => b.id === r.targetId);
  if (!target || (r.workTimer <= 0 && isResidentAtBuildingInteraction(state, r, target.id))) {
    target = posts[Math.floor(ctx.rng() * posts.length)];
    r.targetId = target.id;
    r.path = [];
    r.workTimer = 3; // 도착 후 머무는 시간
  }
  const st = goTo(state, r, ctx, buildingGoal(state, target.id));
  if (st === 'arrived') r.workTimer -= 1;
  else if (st === 'stuck') r.targetId = null;
}

function militiaTick(state: GameState, r: Resident, ctx: Ctx): void {
  r.task = '조련 중';
  const garrison = state.buildings.find(b => b.type === 'garrison' && b.built);
  if (garrison) goTo(state, r, ctx, buildingGoal(state, garrison.id));
  else loiterNearCenter(state, r, ctx, '조련 중');
}


function battleAgentTick(state: GameState, r: Resident, ctx: Ctx): void {
  const battle = state.battle;
  if (!battle) return;
  if (battle.phase === 'muster') {
    r.task = '출전 중';
    const st = goTo(state, r, ctx, tile =>
      Math.abs(tile.x - battle.frontX) + Math.abs(tile.y - battle.frontY) <= 2);
    if (st === 'stuck') {
      r.path = [];
      r.task = '전선 대기';
    }
    return;
  }
  r.path = [];
  r.phase = 'working';
  r.task = '전투 중';
}

function idleTick(state: GameState, r: Resident, ctx: Ctx): void {
  loiterNearCenter(state, r, ctx, '대기');
}

// 훈장·무당·승려 — 제 일터에 상주한다 (효과는 배정 여부로 판정된다)
function teacherTick(state: GameState, r: Resident, ctx: Ctx): void {
  const school = assignedWorkplace(state, r, ctx, 'school', '서당 배정 없음');
  if (!school) return;
  loiterNearBuilding(state, r, ctx, school, 2, '글 가르치는 중');
}

function shamanTick(state: GameState, r: Resident, ctx: Ctx): void {
  const shrine = assignedWorkplace(state, r, ctx, 'shrine', '당집 배정 없음');
  if (!shrine) return;
  loiterNearBuilding(state, r, ctx, shrine, 2, '치성 드리는 중');
}

function monkTick(state: GameState, r: Resident, ctx: Ctx): void {
  const hermitage = assignedWorkplace(state, r, ctx, 'hermitage', '암자 배정 없음');
  if (!hermitage) return;
  loiterNearBuilding(state, r, ctx, hermitage, 2, '독경 중');
}

// 장의사 — 시신을 수습해 묘지에 안장한다. 시신이 없으면 묘지를 돌본다.
function undertakerTick(state: GameState, r: Resident, ctx: Ctx): void {
  const cemetery = assignedWorkplace(state, r, ctx, 'cemetery', '묘지 배정 없음');
  if (!cemetery) return;
  const f = CONFIG.funeral;

  // 운구 중 — 묘지로 모신다
  if (r.corpseCarryId != null) {
    const corpse = corpsesOf(state).find(candidate => candidate.id === r.corpseCarryId);
    if (!corpse) { r.corpseCarryId = null; return; }
    const st = goTo(state, r, ctx, buildingGoal(state, cemetery.id));
    if (st === 'stuck') { r.task = '길이 막힘'; return; }
    if (st !== 'arrived') { r.task = '상여 운구'; return; }
    if ((cemetery.graves ?? 0) >= f.plotsPerCemetery) {
      r.task = '묘 자리 부족';
      corpse.carried = false;
      corpse.x = r.x;
      corpse.y = r.y;
      r.corpseCarryId = null;
      return;
    }
    buryCorpse(state, corpse.id, cemetery);
    r.corpseCarryId = null;
    return;
  }

  const corpse = nextCorpseToCollect(state);
  if (!corpse) {
    loiterNearBuilding(state, r, ctx, cemetery, 2, '묘지 돌봄');
    return;
  }
  if (cemeteryFreePlots(state) <= 0) {
    loiterNearBuilding(state, r, ctx, cemetery, 2, '묘 자리 부족');
    return;
  }
  const st = goTo(state, r, ctx, t => Math.abs(t.x - corpse.x) + Math.abs(t.y - corpse.y) <= 1);
  if (st === 'stuck') {
    corpse.skipUntilDay = state.day + f.corpseRetryDays;
    r.task = '시신에 접근 불가';
    return;
  }
  if (st !== 'arrived') { r.task = '시신 수습하러 이동'; return; }
  corpse.carried = true;
  r.corpseCarryId = corpse.id;
  r.task = '상여 운구';
}

function nearestBuilding<T extends { x: number; y: number }>(r: Resident, list: T[]): T | null {
  let best: T | null = null;
  let bestD = Infinity;
  for (const b of list) {
    const d = Math.abs(b.x - r.x) + Math.abs(b.y - r.y);
    if (d < bestD) { bestD = d; best = b; }
  }
  return best;
}

// ─────────────────────────── 틱 진입점 ───────────────────────────

export function agentsTick(state: GameState): void {
  const rng = makeRng(state.seed + state.day * 7919 + state.subTick * 101 + 7);
  const season = getSeason(state.day);
  const living = state.residents.filter(r => r.alive);
  const predatorScouts = activePredatorScoutIds(state);
  const enrolledStudents = enrolledStudentIds(state); // 서당 정원 안의 취학 아동
  if (living.length === 0) return;

  const producers = living.filter(r =>
    PRODUCING_JOBS.includes(r.job) && !r.sick && state.day >= (r.quarantinedUntil ?? 0) && r.health >= 20).length;
  const t = state.resources.tools;
  const tMod = producers <= 0 || t >= producers ? 1 : 0.6 + 0.4 * (t / producers);
  const mAvg = living.reduce((s, r) => s + r.morale, 0) / living.length;
  const center = state.buildings.find(b => b.type === 'center');
  const goalFieldUserCounts = { forest: 0, huntable: 0, mineral: 0 };
  for (const resident of living) {
    if (resident.job === 'woodcutter' || resident.job === 'herbalist') goalFieldUserCounts.forest++;
    else if (resident.job === 'hunter') goalFieldUserCounts.huntable++;
    else if (resident.job === 'miner') goalFieldUserCounts.mineral++;
  }

  const laborOutputMod = (0.8 + (mAvg / 100) * 0.4) * officeEfficiencyMultiplier(state) *
    rankProductionEfficiency(state.rank);
  const ctx: Ctx = {
    season,
    outdoor: outdoorMult(state.weather),
    tMod,
    mMod: laborOutputMod,
    outputMod: laborOutputMod * CONFIG.production.resourceOutputMultiplier,
    rng,
    centerId: center ? center.id : -1,
    huntable: collectHuntableTiles(state.map, state.habitats, CONFIG.agents.hunting),
    goalFields: {},
    goalFieldUserCounts,
  };

  for (const r of living) {
    ensureResidentOnPassableTile(state, r);
    // 보간용 직전 위치 기록
    r.px = r.x;
    r.py = r.y;
    if (predatorScouts.has(r.id)) {
      r.task = '맹수 흔적 추적 중';
      clearHaulTask(r);
      r.path = [];
      r.manualOrder = null;
      if (carryTotal(r) > 0) depositAll(state, r);
      continue;
    }
    // 원정 참여자는 expeditionTick이 집결·행군·귀환을 전담한다.
    if (state.expedition?.memberIds.includes(r.id)) {
      r.task = state.expedition.phase === 'muster'
        ? '토벌 집결 중'
        : state.expedition.phase === 'return'
          ? '토벌 귀환 중'
          : state.expedition.phase === 'engage'
            ? '토벌 교전 대기'
            : '토벌 출정';
      clearHaulTask(r);
      continue;
    }
    if (state.raidHold) {
      r.task = '완전 수성 중';
      clearHaulTask(r);
      if (carryTotal(r) > 0) depositAll(state, r);
      goToCenter(state, r, ctx);
      continue;
    }
    // 아기·어린이와 취학 소년. 일 돕기를 고른 소년만 아래 일반 직업 흐름으로 내려간다.
    if (r.stage) {
      if (r.stage === 'infant') {
        clearHaulTask(r);
        r.task = '집에서 자람';
        r.phase = 'rest';
        r.path = [];
        continue;
      }
      if (r.stage === 'youth' && r.youthActivity !== 'school') {
        // 안전 직무 배정과 0.5 효율은 배정 경계/laborEfficiencyMult에서 단 한 번 적용한다.
      } else if (enrolledStudents.has(r.id)) {
        clearHaulTask(r);
        if (carryTotal(r) > 0) depositAll(state, r);
        const school = state.buildings.find(building => building.type === 'school' && building.built);
        if (school) loiterNearBuilding(state, r, ctx, school, 3, '글공부');
        else loiterNearCenter(state, r, ctx, '뛰노는 중');
        continue;
      } else if (r.stage === 'youth') {
        clearHaulTask(r);
        if (carryTotal(r) > 0) depositAll(state, r);
        loiterNearCenter(state, r, ctx, '서당 수업 중단');
        continue;
      } else {
        haulerTick(state, r, ctx);
        if (r.task === '대기') r.task = '심부름거리 찾는 중';
        continue;
      }
    }
    // 산모는 집에서 몸을 추스른다
    if (state.day < (r.birthRecoveryUntil ?? 0)) {
      r.task = '산후 조리';
      clearHaulTask(r);
      if (carryTotal(r) > 0) depositAll(state, r);
      goToCenter(state, r, ctx);
      continue;
    }
    // 병자/격리자/중상자는 마을 중심에서 쉬며 배정은 유지한다
    if (r.sick || state.day < (r.quarantinedUntil ?? 0) || r.health < 20) {
      r.task = state.day < (r.quarantinedUntil ?? 0) ? '격리 중' : '앓아누움';
      clearHaulTask(r);
      if (carryTotal(r) > 0) depositAll(state, r); // 짐은 이웃이 거둬 간다
      goToCenter(state, r, ctx);
      continue;
    }
    // 전투에 징집된 주민은 직업 행동보다 전선 행동을 우선한다.
    if (state.battle?.defenderIds.includes(r.id)) {
      battleAgentTick(state, r, ctx);
      continue;
    }
    // 심한 악천후엔 실외 작업자는 대피한다
    if (OUTDOOR_JOBS.includes(r.job) && ctx.outdoor < CONFIG.agents.shelterThreshold) {
      r.task = '악천후 대피';
      goToCenter(state, r, ctx);
      continue;
    }
    const forcedWorkSites = r.manualOrder?.kind === 'work' ? r.manualOrder.unauthorizedSiteIds ?? [] : [];
    if (r.phase === 'working' && !canWorkForeignTerritory(state, r.x, r.y, forcedWorkSites)) {
      r.phase = 'rest';
      r.workTimer = 0;
      r.path = [];
      r.task = '작업 허가 없음';
      goToCenter(state, r, ctx);
      continue;
    }
    if (handleManualOrder(state, r, ctx)) continue;
    const jobPerf = typeof window !== 'undefined' ? window.__renderPerf : undefined;
    const jobStart = jobPerf ? performance.now() : 0;
    switch (r.job) {
      case 'woodcutter': woodcutterTick(state, r, ctx); break;
      case 'woodSplitter': woodSplitterTick(state, r, ctx); break;
      case 'hunter': hunterTick(state, r, ctx); break;
      case 'herbalist': herbalistTick(state, r, ctx); break;
      case 'farmer': farmerTick(state, r, ctx); break;
      case 'miller': millerTick(state, r, ctx); break;
      case 'builder': builderTick(state, r, ctx); break;
      case 'hauler': haulerTick(state, r, ctx); break;
      case 'curer': curerTick(state, r, ctx); break;
      case 'potter': potterTick(state, r, ctx); break;
      case 'smith': smithTick(state, r, ctx); break;
      case 'miner': minerTick(state, r, ctx); break;
      case 'fisher': fisherTick(state, r, ctx); break;
      case 'charcoalBurner': charcoalBurnerTick(state, r, ctx); break;
      case 'herder': herderTick(state, r, ctx); break;
      case 'physician': physicianTick(state, r, ctx); break;
      case 'powderMaker': powderMakerTick(state, r, ctx); break;
      case 'tanner': tannerTick(state, r, ctx); break;
      case 'weaver': weaverTick(state, r, ctx); break;
      case 'clerk': clerkTick(state, r, ctx); break;
      case 'undertaker': undertakerTick(state, r, ctx); break;
      case 'teacher': teacherTick(state, r, ctx); break;
      case 'shaman': shamanTick(state, r, ctx); break;
      case 'monk': monkTick(state, r, ctx); break;
      case 'watchman': watchmanTick(state, r, ctx); break;
      case 'militia': militiaTick(state, r, ctx); break;
      default: idleTick(state, r, ctx); break;
    }
    if (jobPerf) {
      const key = `job-${r.job}`;
      const bucket = jobPerf[key] ?? (jobPerf[key] = { total: 0, count: 0 });
      bucket.total += performance.now() - jobStart;
      bucket.count++;
    }
  }
}
