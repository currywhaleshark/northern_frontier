// 주민 이동 판정과 A* 경로 탐색.
// agents.ts의 직업·일과 로직에서 분리된 순수 계층 — 이 모듈은 agents.ts를 참조하지 않는다.
import { isBuildingUpperPassageTile } from './buildings';
import { getSeason } from './seasons';
import { isLakeIceAt } from './lakeIce';
import { isSpringFloodedTile } from './disasters';
import { isGateBuilding, isWallBuilding } from './walls';
import { canEnterForeignTerritory } from './territory';
import type { DescribedGoal } from './pathGoals';
import type { Building, BuildingTypeId, GameState, Tile } from './types';

const PASSABLE_BUILDING_TYPES: ReadonlySet<BuildingTypeId> = new Set<BuildingTypeId>([
  'field',
  'paddy',
  'bridge',
  'canal',
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

export function isPassableBuilding(type: BuildingTypeId): boolean {
  return PASSABLE_BUILDING_TYPES.has(type) || isGateBuilding(type);
}

export function isTerrainPassable(state: GameState, x: number, y: number): boolean {
  const t = state.map[y]?.[x];
  if (!t) return false;
  if (isSpringFloodedTile(state, x, y)) return false;
  const building = buildingAtTile(state, t);
  const breachedPassage = building?.breached === true && isWallBuilding(building.type);
  const siegeGateClosed = building?.type === 'gate' && state.siegeState != null &&
    state.siegeState.phase !== 'evacuation' && state.siegeState.phase !== 'sortie' &&
    state.siegeState.phase !== 'withdrawal';
  if (siegeGateClosed && !breachedPassage) return false;
  if (building && !breachedPassage && !isPassableBuilding(building.type) &&
      !isBuildingUpperPassageTile(building, x, y)) return false;
  if (t.terrain === 'mountain' || t.terrain === 'rock' || t.terrain === 'sea') return false;
  if (t.terrain === 'river') {
    if (building && (building.type === 'bridge' || building.type === 'ferry' || building.type === 'dock')) return true;
    // 겨울 언 강 위는 걸어서 건널 수 있다 (해빙기 홍수 제외)
    return getSeason(state.day) === 'winter' && state.weather !== 'thawFlood';
  }
  if (t.terrain === 'lake') return isLakeIceAt(state.map, state.day, x, y);
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

export const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
export const CARDINAL_DIRS = DIRS.slice(0, 4);

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


