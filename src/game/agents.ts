// 주민 에이전트 시뮬레이션 — 서브틱 단위의 이동, 작업, 운반
// 자원은 창고/거점에 짐을 부려야 마을 비축량에 더해진다.
import { CONFIG } from './config';
import {
  BUILDING_DEFS, buildingFootprintTiles, isSmithyProductUnlocked, officeEfficiencyMultiplier,
  SMITHY_PRODUCT_DEFS, smithyProductOf,
} from './buildings';
import { addLog } from './events';
import { collectHuntableTiles } from './habitats';
import { makeRng } from './map';
import { getSeason } from './seasons';
import { outdoorMult } from './weather';
import { processableAmount } from './processing';
import { isExplored, refreshExploration } from './exploration';
import { isGateBuilding } from './walls';
import { assignedBuildingForResident, isResidentInAssignedSlot } from './workerSlots';
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
  'woodcutter', 'hunter', 'farmer', 'builder', 'smith', 'miner', 'fisher',
  'charcoalBurner', 'herder', 'powderMaker', 'tanner', 'herbalist', 'hauler',
];
const OUTDOOR_JOBS = [
  'woodcutter', 'hunter', 'herbalist', 'farmer', 'builder', 'miner', 'fisher',
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
  for (const [res, amt] of Object.entries(r.carrying)) {
    state.resources[res as ResourceId] += amt ?? 0;
  }
  r.carrying = {};
}

// 직업 변경/사망 등으로 에이전트 상태를 정리 (짐은 마을 몫으로 귀속)
export function resetAgent(state: GameState, r: Resident): void {
  depositAll(state, r);
  r.path = [];
  r.phase = 'rest';
  r.workTimer = 0;
  r.targetId = null;
  r.manualOrder = null;
}

// ─────────────────────────── 이동/경로 ───────────────────────────

const PASSABLE_BUILDING_TYPES: ReadonlySet<BuildingTypeId> = new Set<BuildingTypeId>([
  'field',
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
function depositGoal(state: GameState, extra: BuildingTypeId[]): (t: Tile) => boolean {
  const ids = new Set<number>();
  for (const b of state.buildings) {
    if (!b.built) continue;
    if (b.type === 'center' || b.type === 'storehouse' || extra.includes(b.type)) ids.add(b.id);
  }
  const goalIds = Array.from(ids);
  return t => goalIds.some(id => isBuildingInteractionTile(state, t, id));
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

function assignedWorkplace(
  state: GameState,
  r: Resident,
  ctx: Ctx,
  type: BuildingTypeId,
  waitTask: string,
): Building | null {
  const building = assignedBuildingForResident(state, r);
  if (!building || building.type !== type || !isResidentInAssignedSlot(state, r, building)) {
    loiterNearCenter(state, r, ctx, waitTask);
    return null;
  }
  return building;
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
  onHarvest?: (tile: Tile, r: Resident) => void;
}

function gatherJob(state: GameState, r: Resident, ctx: Ctx, o: GatherOpts): void {
  const knownGoal = (tile: Tile): boolean => isExplored(state, tile.x, tile.y) && o.goal(tile);
  // 짐이 찼거나 하역 중이면 거점으로
  if (carryTotal(r) >= o.cap || (r.phase === 'toDeposit' && carryTotal(r) > 0)) {
    r.phase = 'toDeposit';
    r.task = o.taskHaul;
    const st = goTo(state, r, ctx, depositGoal(state, o.depositExtra));
    if (st === 'arrived' || st === 'stuck') {
      depositAll(state, r); // 고립되면 그 자리에서 부린다
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
      const amt = base * ctx.tMod * ctx.mMod * effOf(r);
      addCarry(r, o.yieldRes, amt);
      o.onHarvest?.(state.map[r.y][r.x], r);
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
    else loiterNearCenter(state, r, ctx, '갈 곳 없음');
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
  const tile = state.map[order.y]?.[order.x];
  if (!tile || tile.terrain !== 'rock') {
    r.task = '명령 대상 없음';
    clearManualOrder(r);
    return true;
  }

  const a = CONFIG.agents;
  if (carryTotal(r) >= a.carryCap.stone || (r.phase === 'toDeposit' && carryTotal(r) > 0)) {
    r.phase = 'toDeposit';
    r.task = '돌 운반';
    const st = goTo(state, r, ctx, depositGoal(state, []));
    if (st === 'arrived' || st === 'stuck') {
      depositAll(state, r);
      r.phase = 'rest';
    }
    return true;
  }

  if (r.phase === 'working') {
    if (r.x !== order.x || r.y !== order.y) {
      r.phase = 'rest';
      r.workTimer = 0;
      return true;
    }
    r.task = '채석 중';
    r.workTimer -= ctx.outdoor;
    gainSkillTick(r);
    if (r.workTimer <= 0) {
      addCarry(r, 'stone', a.yields.stone * ctx.tMod * ctx.mMod * effOf(r));
      r.phase = 'rest';
    }
    return true;
  }

  const st = goTo(state, r, ctx, exactTileGoal(order.x, order.y));
  if (st === 'arrived') {
    r.phase = 'working';
    r.workTimer = a.work.quarry;
    r.task = '채석 중';
  } else if (st === 'stuck') {
    r.task = '명령 지점 막힘';
    clearManualOrder(r);
  } else {
    r.phase = 'toWork';
    r.task = '지정 채석지로 이동';
  }
  return true;
}

function handleManualWorkOrder(state: GameState, r: Resident, ctx: Ctx, order: ManualOrder & { kind: 'work' }): boolean {
  if (order.repeat && r.job === 'hauler') return handleManualHaulerQuarry(state, r, ctx, order);

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
    onHarvest: (tile) => {
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
    yieldRes: 'game',
    // 서식지가 클수록 사냥감이 풍부하다
    yieldAmt: t => a.yields.game * CONFIG.seasons.gameMult[ctx.season] * (ctx.huntable.get(`${t.x},${t.y}`) ?? 0),
    cap: a.carryCap.game,
    depositExtra: ['huntLodge'],
    taskWork: '사냥 중', taskMove: '서식지로 이동', taskHaul: '사냥감 운반',
    onHarvest: (_tile, res) => {
      if (ctx.rng() < 0.06) {
        addLog(state, `사냥꾼 ${res.name}이(가) 노루를 잡아 식량과 가죽을 가져옵니다.`, 'good');
      }
    },
  });
}

function herbalistTick(state: GameState, r: Resident, ctx: Ctx): void {
  const a = CONFIG.agents;
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
    cap: a.carryCap.herbs,
    depositExtra: ['herbHut'],
    taskWork: '약초 채집 중', taskMove: '산기슭으로 이동', taskHaul: '약초 운반',
  });
}

function farmerTick(state: GameState, r: Resident, ctx: Ctx): void {
  const a = CONFIG.agents;
  const p = CONFIG.production;
  const field = assignedBuildingForResident(state, r);

  if (!field || field.type !== 'field' || !isResidentInAssignedSlot(state, r, field)) {
    if (carryTotal(r) > 0) {
      const st = goTo(state, r, ctx, depositGoal(state, []));
      if (st === 'arrived' || st === 'stuck') depositAll(state, r);
      return;
    }
    assignedWorkplace(state, r, ctx, 'field', '밭 배정 없음');
    return;
  }

  if (ctx.season === 'winter') {
    if (carryTotal(r) > 0) {
      const st = goTo(state, r, ctx, depositGoal(state, []));
      if (st === 'arrived' || st === 'stuck') depositAll(state, r);
      return;
    }
    loiterNearBuilding(state, r, ctx, field, 3, '겨울 채비');
    return;
  }

  // 곡물을 지고 있으면 하역
  if (carryTotal(r) >= a.carryCap.grain || (r.phase === 'toDeposit' && carryTotal(r) > 0)) {
    r.phase = 'toDeposit';
    r.task = '곡물 운반';
    const st = goTo(state, r, ctx, depositGoal(state, []));
    if (st === 'arrived' || st === 'stuck') { depositAll(state, r); r.phase = 'rest'; }
    return;
  }

  if (ctx.season === 'autumn') {
    // 수확: 성장도가 남은 밭에서 곡물을 거둔다
    const target = field.fieldGrowth > 0.5 ? field : null;
    if (!target) {
      if (carryTotal(r) > 0) { r.phase = 'toDeposit'; return; }
      loiterNearBuilding(state, r, ctx, field, 3, '수확 마무리');
      return;
    }
    const st = goTo(state, r, ctx, buildingGoal(state, target.id));
    if (st === 'arrived') {
      r.task = '수확 중';
      const take = Math.min(target.fieldGrowth, a.work.harvestPerSubtick * ctx.outdoor * effOf(r));
      target.fieldGrowth -= take;
      const tile = state.map[target.y][target.x];
      const fertile = tile.terrain === 'fertile' ? p.fertileBonus : 1;
      addCarry(r, 'grain', (take / 100) * p.fieldGrainYield * fertile * ctx.mMod);
      gainSkillTick(r);
    } else {
      r.task = st === 'stuck' ? '길이 막힘' : '밭으로 이동';
    }
    return;
  }

  // 봄/여름: 아직 안 자란 밭을 돌본다
  const target = field.fieldGrowth < 100 ? field : null;
  if (!target) {
    loiterNearBuilding(state, r, ctx, field, 3, '밭 관리');
    return;
  }
  const st = goTo(state, r, ctx, buildingGoal(state, target.id));
  if (st === 'arrived') {
    r.task = '농사 중';
    const weatherGrow = state.weather === 'rain' ? 1.2 : state.weather === 'frost' ? 0.7 : 1;
    target.fieldGrowth = Math.min(100, target.fieldGrowth + a.work.growPerSubtick * weatherGrow * effOf(r));
    gainSkillTick(r);
  } else {
    r.task = st === 'stuck' ? '길이 막힘' : '밭으로 이동';
  }
}

function builderTick(state: GameState, r: Resident, ctx: Ctx): void {
  const sites = state.buildings.filter(b => !b.built);
  const target = nearestBuilding(r, sites);
  if (!target) { loiterNearCenter(state, r, ctx, '지을 것 없음'); return; }
  const st = goTo(state, r, ctx, buildingGoal(state, target.id));
  if (st === 'arrived') {
    r.task = '건설 중';
    const def = BUILDING_DEFS[target.type];
    target.progress += CONFIG.agents.work.buildPerSubtick * effOf(r) * ctx.tMod * Math.max(0.5, ctx.outdoor);
    gainSkillTick(r);
    if (target.progress >= def.buildDays) {
      target.built = true;
      addLog(state, `${def.name}이(가) 완공되었습니다.`, 'good');
      if (def.winterBonus) {
        addLog(state, '온돌집 덕분에 주민들의 체온 손실이 줄어들 것입니다.', 'good');
      }
    }
  } else {
    r.task = st === 'stuck' ? '길이 막힘' : '공사장으로 이동';
  }
}

function haulerTick(state: GameState, r: Resident, ctx: Ctx): void {
  const p = CONFIG.production;
  const a = CONFIG.agents;

  // 채석해 온 돌 하역
  if (carryTotal(r) > 0) {
    r.phase = 'toDeposit';
    r.task = '돌 운반';
    const st = goTo(state, r, ctx, depositGoal(state, []));
    if (st === 'arrived' || st === 'stuck') { depositAll(state, r); r.phase = 'rest'; }
    return;
  }

  const processableGame = processableAmount(state, 'game');
  const processableGrain = processableAmount(state, 'grain');
  const processableWood = processableAmount(state, 'wood');
  const hasProcessing = processableGame > 0.2 || processableGrain > 0.2 || processableWood > 0.5;
  if (hasProcessing) {
    // 창고/중심지에서 가공 작업. 채석 이동/작업 중 새 가공물이 생기면 생존 자원 처리를 우선한다.
    if (r.phase === 'toWork' || r.phase === 'working' || r.phase === 'toDeposit') {
      r.path = [];
      r.workTimer = 0;
    }
    const st = goTo(state, r, ctx, depositGoal(state, []));
    if (st !== 'arrived') {
      r.phase = st === 'stuck' ? 'rest' : 'toWork';
      r.task = st === 'stuck' ? '길이 막힘' : '창고로 이동';
      return;
    }
    r.phase = 'rest';
    const eff = effOf(r) * ctx.mMod;
    let label = '창고 정리';
    const g = Math.min(processableAmount(state, 'game'), (p.haulerGamePerDay / 5) * eff);
    if (g > 0) {
      state.resources.game -= g;
      state.resources.food += g * p.foodPerGame;
      state.resources.hide += g * p.hidePerGame;
      label = '사냥감 손질';
    }
    const q = Math.min(processableAmount(state, 'grain'), (p.haulerGrainPerDay / 5) * eff);
    if (q > 0) {
      state.resources.grain -= q;
      state.resources.food += q * p.foodPerGrain;
      label = '곡물 도정';
    }
    const w = Math.min(processableAmount(state, 'wood'), (p.haulerWoodToFirewood / 5) * eff);
    if (w > 0) {
      state.resources.wood -= w;
      state.resources.firewood += w * p.firewoodPerWood;
      label = '장작 패기';
    }
    r.task = label;
    gainSkillTick(r);
    return;
  }

  // 가공할 것이 없으면 채석
  if (state.resources.stone < p.stoneReserveTarget) {
    gatherJob(state, r, ctx, {
      goal: t => t.terrain === 'rock',
      workTicks: a.work.quarry,
      yieldRes: 'stone',
      yieldAmt: a.yields.stone,
      cap: a.carryCap.stone,
      depositExtra: [],
      taskWork: '채석 중', taskMove: '바위 지대로 이동', taskHaul: '돌 운반',
    });
    return;
  }
  loiterNearCenter(state, r, ctx, '대기');
}

function isSmithProcessableResource(resource: ResourceId): resource is ProcessingInputId {
  return resource === 'wood' || resource === 'iron' || resource === 'hide';
}

function smithAvailableResource(state: GameState, resource: ResourceId): number {
  return isSmithProcessableResource(resource) ? processableAmount(state, resource) : state.resources[resource];
}

function smithMaxCraftable(state: GameState, product: SmithyProductId): number {
  const inputs = SMITHY_PRODUCT_DEFS[product].inputPerUnit;
  let max = Infinity;
  for (const [resource, perUnit] of Object.entries(inputs) as [ResourceId, number][]) {
    if (perUnit <= 0) continue;
    max = Math.min(max, smithAvailableResource(state, resource) / perUnit);
  }
  return max === Infinity ? 0 : max;
}

function consumeSmithInputs(state: GameState, product: SmithyProductId, made: number): void {
  const inputs = SMITHY_PRODUCT_DEFS[product].inputPerUnit;
  for (const [resource, perUnit] of Object.entries(inputs) as [ResourceId, number][]) {
    state.resources[resource] = Math.max(0, state.resources[resource] - perUnit * made);
  }
}

function smithNeedsOutput(state: GameState, product: SmithyProductId, pop: number): boolean {
  if (product === 'tools') return state.resources.tools < pop * 0.7;
  return true;
}

interface SmithWork {
  smithy: Building;
  product: SmithyProductId;
  made: number;
}

function findSmithWork(state: GameState, r: Resident, ctx: Ctx, pop: number, smithy: Building): SmithWork | null {
  const product = smithyProductOf(smithy);
  if (!isSmithyProductUnlocked(state.rank, product)) return null;
  if (!smithNeedsOutput(state, product, pop)) return null;
  const def = SMITHY_PRODUCT_DEFS[product];
  const target = (def.ratePerDay / 5) * effOf(r) * ctx.mMod;
  const made = Math.min(target, smithMaxCraftable(state, product));
  if (made <= 0.02) return null;
  return { smithy, product, made };
}

function smithWantsIron(state: GameState, pop: number, smithy: Building): boolean {
  const product = smithyProductOf(smithy);
  if (!isSmithyProductUnlocked(state.rank, product)) return false;
  if (!smithNeedsOutput(state, product, pop)) return false;
  return (SMITHY_PRODUCT_DEFS[product].inputPerUnit.iron ?? 0) > 0 &&
    processableAmount(state, 'iron') <= 0.02;
}

function smithWaitTask(state: GameState, pop: number, r: Resident, ctx: Ctx, smithy: Building): string {
  const toolsRate = (CONFIG.production.toolsPerDay / 5) * effOf(r) * ctx.mMod;
  const needTools = state.resources.tools < pop * 0.7;
  if (needTools) return processableAmount(state, 'iron') < toolsRate ? '철 대기' : '재료 대기';
  const product = smithyProductOf(smithy);
  const hasWeaponSmithy = product !== 'tools' && isSmithyProductUnlocked(state.rank, product);
  return hasWeaponSmithy ? '재료 대기' : '도구 충분';
}

function smithTick(state: GameState, r: Resident, ctx: Ctx): void {
  const a = CONFIG.agents;
  const pop = state.residents.filter(x => x.alive).length;
  const hasMinerSupply = state.buildings.some(b => b.type === 'mine' && b.built) &&
    state.residents.some(x => x.alive && !x.sick && x.health >= 20 && x.job === 'miner');
  const smithy = assignedBuildingForResident(state, r);

  if (!smithy || smithy.type !== 'smithy' || !isResidentInAssignedSlot(state, r, smithy)) {
    if (carryTotal(r) > 0) {
      r.task = '철 운반';
      const st = goTo(state, r, ctx, depositGoal(state, ['smithy']));
      if (st === 'arrived' || st === 'stuck') { depositAll(state, r); r.phase = 'rest'; }
      return;
    }
    assignedWorkplace(state, r, ctx, 'smithy', '대장간 배정 없음');
    return;
  }

  // 캐 온 철 하역 (대장간도 하역 거점). 채광꾼이 있으면 들고 있던 철은 바로 내려놓고 대장간으로 복귀한다.
  if (carryTotal(r) > 0 && (r.phase === 'toDeposit' || hasMinerSupply)) {
    r.task = '철 운반';
    const st = goTo(state, r, ctx, depositGoal(state, ['smithy']));
    if (st === 'arrived' || st === 'stuck') { depositAll(state, r); r.phase = 'rest'; }
    return;
  }

  const work = findSmithWork(state, r, ctx, pop, smithy);
  if (work) {
    const st = goTo(state, r, ctx, buildingGoal(state, work.smithy.id));
    if (st === 'arrived') {
      const def = SMITHY_PRODUCT_DEFS[work.product];
      r.task = def.task;
      consumeSmithInputs(state, work.product, work.made);
      state.resources[def.output] += work.made;
      gainSkillTick(r);
    } else {
      r.task = st === 'stuck' ? '길이 막힘' : '대장간으로 이동';
    }
    return;
  }

  if (hasMinerSupply) {
    r.path = [];
    r.workTimer = 0;
    const st = goTo(state, r, ctx, buildingGoal(state, smithy.id));
    if (st === 'arrived') {
      r.phase = 'rest';
      r.task = smithWaitTask(state, pop, r, ctx, smithy);
    } else {
      r.phase = st === 'stuck' ? 'rest' : 'toWork';
      r.task = st === 'stuck' ? '길이 막힘' : '대장간으로 이동';
    }
    return;
  }

  // 재료가 없거나 도구가 충분하면 필요한 경우에만 철광 채굴
  const hasIron = state.map.some(row => row.some(t => isExplored(state, t.x, t.y) && t.terrain === 'rock' && t.hasIron));
  if (hasIron && smithWantsIron(state, pop, smithy)) {
    gatherJob(state, r, ctx, {
      goal: t => t.terrain === 'rock' && t.hasIron,
      workTicks: a.work.mine,
      yieldRes: 'iron',
      yieldAmt: a.yields.iron,
      cap: a.carryCap.iron,
      depositExtra: ['smithy'],
      taskWork: '철광 채굴 중', taskMove: '철광으로 이동', taskHaul: '철 운반',
      onHarvest: (_t, res) => addCarry(res, 'stone', a.yields.mineStone),
    });
    return;
  }
  loiterNearCenter(state, r, ctx, '재료 없음');
}

function minerTick(state: GameState, r: Resident, ctx: Ctx): void {
  const a = CONFIG.agents;
  gatherJob(state, r, ctx, {
    goal: t => t.buildingId != null && state.buildings.some(b =>
      b.id === t.buildingId && b.built && b.type === 'mine'),
    workTicks: a.work.mine,
    yieldRes: state.map[r.y]?.[r.x]?.hasIron ? 'iron' : 'stone',
    yieldAmt: tile => tile.hasIron ? a.yields.iron : a.yields.stone,
    cap: state.map[r.y]?.[r.x]?.hasIron ? a.carryCap.iron : a.carryCap.stone,
    depositExtra: ['mine'],
    taskWork: '채광 중',
    taskMove: '채광장으로 이동',
    taskHaul: '광물 운반',
    onHarvest: (tile, worker) => {
      if (tile.hasIron) addCarry(worker, 'stone', a.yields.mineStone);
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
    yieldRes: 'food',
    yieldAmt: a.yields.fish * CONFIG.seasons.fishMult[ctx.season] * floodMult,
    cap: a.carryCap.food,
    depositExtra: ['ferry'],
    taskWork: '고기잡이 중',
    taskMove: '나루터로 이동',
    taskHaul: '물고기 운반',
  });
}

function charcoalBurnerTick(state: GameState, r: Resident, ctx: Ctx): void {
  const p = CONFIG.production;
  const kiln = nearestBuilding(r, state.buildings.filter(b => b.type === 'charcoalKiln' && b.built));
  if (!kiln) {
    loiterNearCenter(state, r, ctx, '숯가마 없음');
    return;
  }

  const st = goTo(state, r, ctx, buildingGoal(state, kiln.id));
  if (st !== 'arrived') {
    r.phase = st === 'stuck' ? 'rest' : 'toWork';
    r.task = st === 'stuck' ? '길이 막힘' : '숯가마로 이동';
    return;
  }

  const wood = Math.min(
    processableAmount(state, 'wood'),
    (p.charcoalWoodPerDay / 5) * effOf(r) * ctx.mMod,
  );
  if (wood <= 0.05) {
    r.phase = 'rest';
    loiterNearBuilding(state, r, ctx, kiln, 3, '목재 대기');
    return;
  }

  state.resources.wood -= wood;
  state.resources.firewood += wood * p.charcoalFirewoodPerWood;
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
    yieldRes: 'food',
    yieldAmt: a.yields.herdFood,
    cap: a.carryCap.food,
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

  const st = goTo(state, r, ctx, buildingGoal(state, yard.id));
  if (st !== 'arrived') {
    r.phase = st === 'stuck' ? 'rest' : 'toWork';
    r.task = st === 'stuck' ? '길이 막힘' : '염초장으로 이동';
    return;
  }

  const target = (p.gunpowderPerDay / 5) * effOf(r) * ctx.mMod;
  const firewoodLimit = state.resources.firewood / p.gunpowderFirewoodPerPowder;
  const stoneLimit = state.resources.stone / p.gunpowderStonePerPowder;
  const made = Math.min(target, firewoodLimit, stoneLimit);
  if (made <= 0.02) {
    r.phase = 'rest';
    loiterNearBuilding(state, r, ctx, yard, 3, '화약 재료 대기');
    return;
  }

  state.resources.firewood -= made * p.gunpowderFirewoodPerPowder;
  state.resources.stone -= made * p.gunpowderStonePerPowder;
  state.resources.gunpowder += made;
  r.phase = 'working';
  r.task = '화약 제조';
  gainSkillTick(r);
}

function tannerTick(state: GameState, r: Resident, ctx: Ctx): void {
  const p = CONFIG.production;
  const tannery = assignedWorkplace(state, r, ctx, 'tannery', '무두장 배정 없음');
  if (!tannery) return;

  const st = goTo(state, r, ctx, buildingGoal(state, tannery.id));
  if (st !== 'arrived') {
    r.phase = st === 'stuck' ? 'rest' : 'toWork';
    r.task = st === 'stuck' ? '길이 막힘' : '무두장으로 이동';
    return;
  }

  const hideUsed = Math.min(
    processableAmount(state, 'hide'),
    (p.tanneryHidePerDay / 5) * effOf(r) * ctx.mMod,
  );
  if (hideUsed <= 0.05) {
    r.phase = 'rest';
    loiterNearBuilding(state, r, ctx, tannery, 3, '가죽 대기');
    return;
  }

  state.resources.hide -= hideUsed;
  state.resources.clothes += hideUsed / 2;
  r.phase = 'working';
  r.task = '무두질';
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
      case 'hunter': hunterTick(state, r, ctx); break;
      case 'herbalist': herbalistTick(state, r, ctx); break;
      case 'farmer': farmerTick(state, r, ctx); break;
      case 'builder': builderTick(state, r, ctx); break;
      case 'hauler': haulerTick(state, r, ctx); break;
      case 'smith': smithTick(state, r, ctx); break;
      case 'miner': minerTick(state, r, ctx); break;
      case 'fisher': fisherTick(state, r, ctx); break;
      case 'charcoalBurner': charcoalBurnerTick(state, r, ctx); break;
      case 'herder': herderTick(state, r, ctx); break;
      case 'powderMaker': powderMakerTick(state, r, ctx); break;
      case 'tanner': tannerTick(state, r, ctx); break;
      case 'clerk': clerkTick(state, r, ctx); break;
      case 'watchman': watchmanTick(state, r, ctx); break;
      case 'militia': militiaTick(state, r, ctx); break;
      default: idleTick(state, r, ctx); break;
    }
  }
  refreshExploration(state);
}
