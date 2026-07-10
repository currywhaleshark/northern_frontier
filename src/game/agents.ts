// 주민 에이전트 시뮬레이션 — 서브틱 단위의 이동, 작업, 운반
// 자원은 창고/거점에 짐을 부려야 마을 비축량에 더해진다.
import { CONFIG } from './config';
import {
  BUILDING_DEFS, buildingFootprintTiles, isSmithyProductUnlocked, officeEfficiencyMultiplier,
  SMITHY_PRODUCT_DEFS, smithyProductOf,
} from './buildings';
import { JOB_NAMES, RESOURCE_NAMES } from './constants';
import { addLog } from './events';
import { haulerCarryCapacity } from './equipment';
import { collectHuntableTiles } from './habitats';
import { makeRng } from './map';
import { extractMineralDeposit, mineralRemaining } from './minerals';
import { getSeason } from './seasons';
import { outdoorMult } from './weather';
import { processableAmount } from './processing';
import { canGrowCropNow, canHarvestCropNow, canPlantCropNow, cropIdForBuilding, CROP_DEFS } from './crops';
import { clothingCoverageTotal, foodTotal, fuelHeatTotal } from './consumption';
import { isExplored, refreshExploration } from './exploration';
import { FOOD_RESOURCES, FUEL_RESOURCES } from './resourceCatalog';
import { isGateBuilding } from './walls';
import { reconcileResidentHomes } from './residents';
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
  mMod: number;   // 사기 보정
  rng: () => number;
  centerId: number;
  huntable: Map<string, number>; // 사냥 가능 타일 ("x,y") → 수확 배율 — 서식지 범위/크기와 연동
}

const PRODUCING_JOBS = [
  'woodcutter', 'woodSplitter', 'hunter', 'farmer', 'miller', 'builder', 'smith', 'miner', 'fisher',
  'charcoalBurner', 'herder', 'powderMaker', 'tanner', 'weaver', 'herbalist', 'hauler',
];
const OUTDOOR_JOBS = [
  'woodcutter', 'woodSplitter', 'hunter', 'herbalist', 'farmer', 'builder', 'miner', 'fisher',
  'charcoalBurner', 'herder',
];

// ─────────────────────────── 공통 헬퍼 ───────────────────────────

function effOf(r: Resident): number {
  return 1 + (r.skills[r.job] ?? 0) * CONFIG.production.skillEffect;
}

function gainSkillTick(r: Resident): void {
  const cur = r.skills[r.job] ?? 0;
  r.skills[r.job] = Math.min(1, cur + CONFIG.production.skillGainPerDay / 5);
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

export function isPassable(state: GameState, x: number, y: number): boolean {
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

function octileDistance(x: number, y: number, goals: { x: number; y: number }[]): number {
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
export function findPath(
  state: GameState,
  sx: number,
  sy: number,
  isGoal: (t: Tile) => boolean,
  passable?: (x: number, y: number) => boolean,
): { x: number; y: number }[] | null {
  const canPass = passable ?? ((x: number, y: number) => isPassable(state, x, y));
  const h = state.map.length, w = state.map[0]?.length ?? 0;
  if (sx < 0 || sy < 0 || sx >= w || sy >= h || !state.map[sy]?.[sx]) return null;
  const goals = goalTiles(state, isGoal);
  if (goals.length === 0) return null;
  const estimate = goals.length <= 128
    ? (x: number, y: number) => octileDistance(x, y, goals)
    : () => 0;
  const start = sy * w + sx;
  const prev = new Int32Array(w * h).fill(-2);
  const cost = new Int32Array(w * h).fill(0x3fffffff);
  const score = new Int32Array(w * h).fill(0x3fffffff);
  const inOpen = new Uint8Array(w * h);
  prev[start] = -1;
  cost[start] = 0;
  score[start] = estimate(sx, sy);
  const open: number[] = [start];
  inOpen[start] = 1;
  while (open.length > 0) {
    let bestIndex = 0;
    let bestScore = score[open[0]];
    for (let i = 1; i < open.length; i++) {
      const curScore = score[open[i]];
      if (curScore < bestScore) {
        bestIndex = i;
        bestScore = curScore;
      }
    }
    const cur = open.splice(bestIndex, 1)[0];
    inOpen[cur] = 0;
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
      score[ni] = nextCost + estimate(nx, ny);
      if (!inOpen[ni]) {
        open.push(ni);
        inOpen[ni] = 1;
      }
    }
  }
  return null;
}

const bfs = findPath;

function moveSteps(state: GameState, ctx: Ctx): number {
  let sp: number = CONFIG.agents.moveSpeed;
  if (ctx.season === 'winter') sp = CONFIG.agents.moveSpeedWinter;
  if (state.weather === 'blizzard' || state.weather === 'heavySnow') {
    sp = Math.min(sp, CONFIG.agents.moveSpeedSnow);
  }
  const n = Math.floor(sp);
  return n + (ctx.rng() < sp - n ? 1 : 0);
}

type GoResult = 'arrived' | 'moving' | 'stuck';

// 목표 조건을 향해 이동. 이미 목표 위면 arrived.
function goTo(state: GameState, r: Resident, ctx: Ctx, isGoal: (t: Tile) => boolean): GoResult {
  if (isGoal(state.map[r.y][r.x])) { r.path = []; return 'arrived'; }
  if (r.path.length === 0) {
    const p = bfs(state, r.x, r.y, isGoal);
    if (!p) return 'stuck';
    r.path = p;
  }
  const steps = moveSteps(state, ctx);
  for (let i = 0; i < steps && r.path.length > 0; i++) {
    const next = r.path[0];
    if (!isPassable(state, next.x, next.y)) { r.path = []; return 'moving'; } // 다음 틱에 재탐색
    r.path.shift();
    r.x = next.x; r.y = next.y;
  }
  return isGoal(state.map[r.y][r.x]) ? 'arrived' : 'moving';
}

function isBuildingInteractionTile(state: GameState, t: Tile, buildingId: number): boolean {
  const building = state.buildings.find(b => b.id === buildingId);
  if (!building) return false;
  if (!isPassable(state, t.x, t.y)) return false;
  if (isPassableBuilding(building.type)) return t.buildingId === building.id;

  const footprint = buildingFootprintTiles(state, building.type, building.x, building.y);
  if (!footprint) return false;
  return footprint.some(tile =>
    Math.max(Math.abs(tile.x - t.x), Math.abs(tile.y - t.y)) === 1);
}

function isResidentAtBuildingInteraction(state: GameState, r: Resident, buildingId: number): boolean {
  const tile = state.map[r.y]?.[r.x];
  return tile ? isBuildingInteractionTile(state, tile, buildingId) : false;
}

// 하역 거점: 중심지 + 창고 (+직업별 거점 건물)
function depositBuildings(state: GameState, extra: BuildingTypeId[]): Building[] {
  const productionSites = state.buildings.filter(b => b.built && extra.includes(b.type));
  if (productionSites.length > 0) return productionSites;
  return state.buildings.filter(isStorageBuilding);
}

function depositGoal(state: GameState, extra: BuildingTypeId[]): (t: Tile) => boolean {
  const goalIds = depositBuildings(state, extra).map(building => building.id);
  return t => goalIds.some(id => isBuildingInteractionTile(state, t, id));
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
  return t => isBuildingInteractionTile(state, t, id);
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
  const building = assignedBuildingForResident(state, r);
  if (!building || building.type !== type || !isResidentInAssignedSlot(state, r, building)) {
    if (depositCarriedResources(state, r, ctx, [], waitTask)) return null;
    loiterNearCenter(state, r, ctx, waitTask);
    return null;
  }
  return building;
}

type WorkplaceInputs = Partial<Record<ResourceId, number>>;

function isReservedProcessingInput(resource: ResourceId): resource is ProcessingInputId {
  return resource === 'wood' || resource === 'rice' || resource === 'hide' || resource === 'iron';
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
    default: return [];
  }
}

function isWorkplaceInputStock(building: Building, resource: ResourceId): boolean {
  return workplaceInputResources(building).includes(resource);
}

function processorCarryCapacity(resource: ResourceId): number {
  const capacities = CONFIG.agents.carryCap as Partial<Record<ResourceId, number>>;
  return capacities[resource] ?? CONFIG.agents.haulerCarryCap;
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
  if (isPassable(state, r.x, r.y)) return;
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
  taskWork: string;
  taskMove: string;
  taskHaul: string;
  taskNone?: string;
  adjustHarvestAmount?: (tile: Tile, r: Resident, amount: number) => number;
  onHarvest?: (tile: Tile, r: Resident, amount: number) => void;
}

function gatherJob(state: GameState, r: Resident, ctx: Ctx, o: GatherOpts): void {
  const knownGoal = (tile: Tile): boolean => isExplored(state, tile.x, tile.y) && o.goal(tile);
  // 짐이 찼거나 하역 중이면 거점으로
  if (carryTotal(r) >= o.cap || (r.phase === 'toDeposit' && carryTotal(r) > 0)) {
    r.phase = 'toDeposit';
    r.task = o.taskHaul;
    const st = goTo(state, r, ctx, depositGoal(state, o.depositExtra));
    if (st === 'arrived') {
      unloadAtDepositGoal(state, r, o.depositExtra);
      r.phase = 'rest';
    } else if (st === 'stuck') {
      depositResidentToSettlement(state, r); // 고립된 짐은 비상 회수로 처리한다
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
      const requested = base * ctx.tMod * ctx.mMod * effOf(r);
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

function logMineralDepletion(state: GameState, tile: Tile, resource: 'stone' | 'iron'): void {
  const mine = tile.buildingId == null
    ? undefined
    : state.buildings.find(building => building.id === tile.buildingId && building.type === 'mine');
  const depositName = resource === 'iron' ? '철광맥' : '석재 노두';
  addLog(
    state,
    mine
      ? depositName + '이(가) 고갈되었습니다. 채광장은 폐광 상태입니다.'
      : depositName + '이(가) 고갈되어 지표에서 사라졌습니다.',
    'bad',
    true,
  );
}

function handleManualMoveOrder(state: GameState, r: Resident, ctx: Ctx, order: ManualOrder & { kind: 'move' }): boolean {
  if (!isPassable(state, order.x, order.y)) {
    r.task = '명령 지점 막힘';
    clearManualOrder(r);
    return true;
  }

  const st = goTo(state, r, ctx, exactTileGoal(order.x, order.y));
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

function handleManualHaulerQuarry(
  state: GameState,
  r: Resident,
  ctx: Ctx,
  order: ManualOrder & { kind: 'work' },
): boolean {
  const a = CONFIG.agents;
  if (carryTotal(r) >= haulerCarryCapacity(r) || (r.phase === 'toDeposit' && carryTotal(r) > 0)) {
    r.phase = 'toDeposit';
    r.task = (r.carrying.iron ?? 0) > 0 ? '철 운반' : '돌 운반';
    const st = goTo(state, r, ctx, depositGoal(state, []));
    if (st === 'arrived' || st === 'stuck') {
      depositAll(state, r);
      r.phase = 'rest';
    }
    return true;
  }

  const tile = state.map[order.y]?.[order.x];
  if (!tile || tile.terrain !== 'rock' || mineralRemaining(tile) <= 0) {
    r.task = '광상 고갈';
    clearManualOrder(r);
    return true;
  }
  const miningIron = tile.hasIron;

  if (r.phase === 'working') {
    if (r.x !== order.x || r.y !== order.y) {
      r.phase = 'rest';
      r.workTimer = 0;
      return true;
    }
    r.task = miningIron ? '철광 채취 중' : '채석 중';
    r.workTimer -= ctx.outdoor;
    gainSkillTick(r);
    if (r.workTimer <= 0) {
      const base = miningIron ? a.yields.iron : a.yields.stone;
      const extraction = extractMineralDeposit(tile, base * ctx.tMod * ctx.mMod * effOf(r));
      addCarry(r, extraction.resource, extraction.amount);
      if (miningIron) {
        addCarry(r, 'stone', extraction.amount * (a.yields.mineStone / a.yields.iron));
      }
      if (extraction.depleted) logMineralDepletion(state, tile, extraction.resource);
      r.phase = extraction.depleted ? 'toDeposit' : 'rest';
    }
    return true;
  }

  const st = goTo(state, r, ctx, exactTileGoal(order.x, order.y));
  if (st === 'arrived') {
    r.phase = 'working';
    r.workTimer = miningIron ? a.work.mine : a.work.quarry;
    r.task = miningIron ? '철광 채취 중' : '채석 중';
  } else if (st === 'stuck') {
    r.task = '명령 지점 막힘';
    clearManualOrder(r);
  } else {
    r.phase = 'toWork';
    r.task = '지정 채석지로 이동';
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
    const st = goTo(state, resident, ctx, depositGoal(state, []));
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
  const st = goTo(state, resident, ctx, buildingGoal(state, source.id));
  if (st === 'arrived') {
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
  if (order.repeat && r.job === 'hauler') {
    return order.buildingId == null
      ? handleManualHaulerQuarry(state, r, ctx, order)
      : handleManualHaulerTransport(state, r, ctx, order);
  }

  const tile = state.map[order.y]?.[order.x];
  if (!tile) {
    r.task = '명령 대상 없음';
    clearManualOrder(r);
    return true;
  }

  const goal = order.buildingId != null ? buildingGoal(state, order.buildingId) : exactTileGoal(order.x, order.y);
  const st = goTo(state, r, ctx, goal);
  if (st === 'arrived') {
    clearManualOrder(r);
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
}

function farmerTick(state: GameState, r: Resident, ctx: Ctx): void {
  const a = CONFIG.agents;
  const p = CONFIG.production;
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

  if (canHarvestCropNow(cropId, farm.type, ctx.season)) {
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
      const take = Math.min(target.fieldGrowth, a.work.harvestPerSubtick * ctx.outdoor * effOf(r));
      target.fieldGrowth -= take;
      const tile = state.map[target.y][target.x];
      const fertile = target.type === 'field' && tile.terrain === 'fertile' ? p.fertileBonus : 1;
      addBuildingStock(target, crop.output, (take / 100) * crop.yield * fertile * ctx.mMod);
      if (target.fieldGrowth <= 0.5 && target.queuedCropId) {
        target.cropId = target.queuedCropId;
        target.queuedCropId = null;
        target.fieldGrowth = 0;
      }
      gainSkillTick(r);
    } else {
      r.task = st === 'stuck' ? '길이 막힘' : `${BUILDING_DEFS[farm.type].name}(으)로 이동`;
    }
    return;
  }

  if (!canGrowCropNow(cropId, farm.type, ctx.season)) {
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
    target.fieldGrowth = Math.min(100, target.fieldGrowth + a.work.growPerSubtick * weatherGrow * effOf(r));
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
  'grain', 'rice', 'vegetables', 'meat', 'fish',
  'firewood', 'brushwood', 'charcoal', 'wood',
  'hideClothes', 'cottonClothes', 'tools', 'carts', 'gunpowder', 'spears', 'hornBows', 'muskets',
  'hide', 'cotton', 'herbs', 'stone', 'iron',
];

const FOOD_HAUL_RESOURCES = new Set<ResourceId>([...FOOD_RESOURCES, 'rice']);
const FUEL_HAUL_RESOURCES = new Set<ResourceId>(FUEL_RESOURCES);
const CLOTHING_HAUL_RESOURCES = new Set<ResourceId>(['hideClothes', 'cottonClothes']);
const COMBAT_HAUL_RESOURCES = new Set<ResourceId>(['gunpowder', 'spears', 'hornBows', 'muskets']);

function reservedHaulAmount(
  state: GameState,
  sourceBuildingId: number,
  resource: ResourceId,
  exceptResidentId: number,
): number {
  return state.residents.reduce((sum, resident) => {
    const task = resident.haulTask;
    if (resident.id === exceptResidentId || !task || carryTotal(resident) > 0) return sum;
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
  if (isWorkplaceInputStock(building, resource)) return 0;
  return Math.max(
    0,
    buildingStock(building, resource) - reservedHaulAmount(state, building.id, resource, residentId),
  );
}

function availableHaulLoad(state: GameState, building: Building, residentId: number): number {
  return HAUL_PRIORITY.reduce(
    (total, resource) => total + availableHaulAmount(state, building, resource, residentId),
    0,
  );
}

function isUrgentHaulResource(state: GameState, resource: ResourceId, available: number): boolean {
  const living = state.residents.filter(resident => resident.alive);
  const population = living.length;
  if (FOOD_HAUL_RESOURCES.has(resource) && foodTotal(state) < population * 3) return true;
  if (FUEL_HAUL_RESOURCES.has(resource) && fuelHeatTotal(state) < population * 2) return true;
  if (resource === 'tools' && state.resources.tools < 3) return true;
  if (resource === 'carts' && state.resources.carts < 1 && state.resources.carts + available >= 1 &&
      living.some(resident => resident.job === 'hauler' && !resident.cartEquipped)) return true;
  if (CLOTHING_HAUL_RESOURCES.has(resource) && clothingCoverageTotal(state) < population * 0.5) return true;
  if (resource === 'herbs' && living.some(resident => resident.sick)) return true;
  if (COMBAT_HAUL_RESOURCES.has(resource) && (
    state.threat >= CONFIG.threat.raidThreshold || state.raiders != null || state.battle != null
  )) return true;
  return false;
}

function haulBatchMinimum(state: GameState, resident: Resident): number {
  if (resident.cartEquipped) {
    return state.resources.stone < CONFIG.production.stoneReserveTarget
      ? CONFIG.agents.haulerCartQuarryBatchMin
      : CONFIG.agents.haulerCartBatchMin;
  }
  return state.resources.stone < CONFIG.production.stoneReserveTarget
    ? CONFIG.agents.haulerQuarryBatchMin
    : CONFIG.agents.haulerBatchMin;
}

function assignHaulTask(state: GameState, resident: Resident): boolean {
  for (const resource of HAUL_PRIORITY) {
    const source = state.buildings
      .filter(building => building.built && !isStorageBuilding(building))
      .map(building => ({
        building,
        available: availableHaulAmount(state, building, resource, resident.id),
        load: availableHaulLoad(state, building, resident.id),
      }))
      .filter(candidate => candidate.available > 0.05 && (
        isUrgentHaulResource(state, resource, candidate.available) ||
        candidate.load + 0.0001 >= haulBatchMinimum(state, resident)
      ))
      .sort((a, b) => {
        const aDistance = Math.abs(a.building.x - resident.x) + Math.abs(a.building.y - resident.y);
        const bDistance = Math.abs(b.building.x - resident.x) + Math.abs(b.building.y - resident.y);
        return aDistance - bDistance || a.building.id - b.building.id;
      })[0];
    if (!source) continue;
    resident.haulTask = {
      sourceBuildingId: source.building.id,
      resource,
      amount: Math.min(haulerCarryCapacity(resident), source.available),
    };
    resident.targetId = source.building.id;
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

function haulerTick(state: GameState, r: Resident, ctx: Ctx): void {
  const p = CONFIG.production;
  const a = CONFIG.agents;

  // 생산지에서 실은 짐 또는 비상 채석물을 창고에 하역한다.
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
  const task = r.haulTask;
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

  // 운반할 것이 없으면 채석
  if (state.resources.stone < p.stoneReserveTarget) {
    gatherJob(state, r, ctx, {
      goal: t => t.terrain === 'rock' && !t.hasIron && mineralRemaining(t) > 0,
      workTicks: a.work.quarry,
      yieldRes: 'stone',
      yieldAmt: a.yields.stone,
      cap: haulerCarryCapacity(r),
      depositExtra: [],
      taskWork: '채석 중', taskMove: '바위 지대로 이동', taskHaul: '돌 운반',
      taskNone: '채석할 석재 없음',
      adjustHarvestAmount: (tile, _worker, amount) => {
        const extraction = extractMineralDeposit(tile, amount);
        if (extraction.depleted) logMineralDepletion(state, tile, extraction.resource);
        return extraction.amount;
      },
    });
    return;
  }
  loiterNearCenter(state, r, ctx, '대기');
}

function millerTick(state: GameState, r: Resident, ctx: Ctx): void {
  const p = CONFIG.production;
  const mill = assignedWorkplace(state, r, ctx, 'watermill', '방앗간 배정 없음');
  if (!mill) return;

  const target = (p.millerRicePerDay / 5) * effOf(r) * ctx.mMod;
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
  const target = (CONFIG.production.firewoodWoodPerDay / 5) * effOf(r) * ctx.mMod;
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
  const target = (def.ratePerDay / 5) * effOf(r) * ctx.mMod;
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

function minerTick(state: GameState, r: Resident, ctx: Ctx): void {
  const a = CONFIG.agents;
  const miningTile = state.map[r.y]?.[r.x];
  const miningIron = miningTile?.terrain === 'rock' && miningTile.hasIron;
  gatherJob(state, r, ctx, {
    goal: t => t.buildingId != null && state.buildings.some(b =>
      b.id === t.buildingId && b.built && b.type === 'mine') && mineralRemaining(t) > 0,
    workTicks: a.work.mine,
    yieldRes: miningIron ? 'iron' : 'stone',
    yieldAmt: tile => tile.hasIron ? a.yields.iron : a.yields.stone,
    cap: miningIron ? a.carryCap.iron : a.carryCap.stone,
    depositExtra: ['mine'],
    taskWork: '채광 중',
    taskMove: '채광장으로 이동',
    taskHaul: '광물 운반',
    taskNone: '광맥 고갈',
    adjustHarvestAmount: (tile, _worker, amount) => {
      const extraction = extractMineralDeposit(tile, amount);
      if (extraction.depleted) logMineralDepletion(state, tile, extraction.resource);
      return extraction.amount;
    },
    onHarvest: (_tile, worker, amount) => {
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
    goal: t => isBuildingInteractionTile(state, t, ferry.id),
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

  const target = (p.charcoalWoodPerDay / 5) * effOf(r) * ctx.mMod;
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
  const a = CONFIG.agents;
  const stable = assignedWorkplace(state, r, ctx, 'stable', '축사 배정 없음');
  if (!stable) return;
  gatherJob(state, r, ctx, {
    goal: t => isBuildingInteractionTile(state, t, stable.id),
    workTicks: a.work.herd,
    yieldRes: 'meat',
    yieldAmt: a.yields.herdFood,
    cap: a.carryCap.meat,
    depositExtra: ['stable'],
    taskWork: '가축 돌보기',
    taskMove: '축사로 이동',
    taskHaul: '축산물 운반',
    onHarvest: (_tile, worker) => addCarry(worker, 'hide', a.yields.herdHide),
  });
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

  const target = (p.gunpowderPerDay / 5) * effOf(r) * ctx.mMod;
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

  const target = (p.tanneryHidePerDay / 5) * effOf(r) * ctx.mMod;
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
  const target = (CONFIG.production.weaverCottonPerDay / 5) * effOf(r) * ctx.mMod;
  if (supplyWorkplaceInputs(state, r, ctx, weavingHouse, { cotton: target })) return;
  const st = goTo(state, r, ctx, buildingGoal(state, weavingHouse.id));
  if (st !== 'arrived') {
    r.phase = st === 'stuck' ? 'rest' : 'toWork';
    r.task = st === 'stuck' ? '길이 막힘' : '베틀집으로 이동';
    return;
  }
  const cotton = Math.min(
    buildingStock(weavingHouse, 'cotton'),
    target,
  );
  if (cotton <= 0.05) {
    r.phase = 'rest';
    r.task = '목화 대기';
    return;
  }
  takeBuildingStock(weavingHouse, 'cotton', cotton);
  addBuildingStock(weavingHouse, 'cottonClothes', cotton * CONFIG.production.cottonClothesPerCotton);
  r.phase = 'working';
  r.task = '베 짜기';
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
  if (living.length === 0) return;

  const producers = living.filter(r => PRODUCING_JOBS.includes(r.job) && !r.sick && r.health >= 20).length;
  const t = state.resources.tools;
  const tMod = producers <= 0 || t >= producers ? 1 : 0.6 + 0.4 * (t / producers);
  const mAvg = living.reduce((s, r) => s + r.morale, 0) / living.length;
  const center = state.buildings.find(b => b.type === 'center');

  const ctx: Ctx = {
    season,
    outdoor: outdoorMult(state.weather),
    tMod,
    mMod: (0.8 + (mAvg / 100) * 0.4) * officeEfficiencyMultiplier(state),
    rng,
    centerId: center ? center.id : -1,
    huntable: collectHuntableTiles(state.map, state.habitats, CONFIG.agents.hunting),
  };

  for (const r of living) {
    ensureResidentOnPassableTile(state, r);
    // 보간용 직전 위치 기록
    r.px = r.x;
    r.py = r.y;
    // 병자/중상자는 마을 중심에서 앓는다
    if (r.sick || r.health < 20) {
      r.task = '앓아누움';
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
    if (handleManualOrder(state, r, ctx)) continue;
    switch (r.job) {
      case 'woodcutter': woodcutterTick(state, r, ctx); break;
      case 'woodSplitter': woodSplitterTick(state, r, ctx); break;
      case 'hunter': hunterTick(state, r, ctx); break;
      case 'herbalist': herbalistTick(state, r, ctx); break;
      case 'farmer': farmerTick(state, r, ctx); break;
      case 'miller': millerTick(state, r, ctx); break;
      case 'builder': builderTick(state, r, ctx); break;
      case 'hauler': haulerTick(state, r, ctx); break;
      case 'smith': smithTick(state, r, ctx); break;
      case 'miner': minerTick(state, r, ctx); break;
      case 'fisher': fisherTick(state, r, ctx); break;
      case 'charcoalBurner': charcoalBurnerTick(state, r, ctx); break;
      case 'herder': herderTick(state, r, ctx); break;
      case 'powderMaker': powderMakerTick(state, r, ctx); break;
      case 'tanner': tannerTick(state, r, ctx); break;
      case 'weaver': weaverTick(state, r, ctx); break;
      case 'clerk': clerkTick(state, r, ctx); break;
      case 'watchman': watchmanTick(state, r, ctx); break;
      case 'militia': militiaTick(state, r, ctx); break;
      default: idleTick(state, r, ctx); break;
    }
  }
  refreshExploration(state);
}
