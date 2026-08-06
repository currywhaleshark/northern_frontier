// 침입자 전용 경로 계획. 주민 A*와 통행 규칙을 공유하지 않는다.
import { getSeason } from './seasons';
import { isLakeIceAt } from './lakeIce';
import { CONFIG } from './config';
import { treeStageFor } from './forestGrowth';
import { isGateBuilding, isSolidWallBuilding } from './walls';
import { footprintTilesOf } from './buildings';
import type { Building, GameState, RaidBreach, RaidRoutePlan, SolidWallBuildingTypeId } from './types';
export type { RaidRoutePlan } from './types';

const DIRECTIONS = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
] as const;
const CARDINAL_DIRECTIONS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;

function key(x: number, y: number): string {
  return `${x},${y}`;
}

function buildingAt(state: GameState, x: number, y: number): Building | null {
  const id = state.map[y]?.[x]?.buildingId;
  return id == null ? null : state.buildings.find(building => building.id === id) ?? null;
}

function raiderCanUseBuilding(building: Building): boolean {
  return building.built && (
    building.type === 'bridge' || building.type === 'ferry' ||
    building.type === 'dock' || building.type === 'canal'
  );
}

/** 성문은 구 저장에서도 목책 성문으로 취급한다. */
export function effectiveWallType(building: Building): SolidWallBuildingTypeId | null {
  if (isSolidWallBuilding(building.type)) return building.type;
  if (isGateBuilding(building.type)) return building.gateWallType ?? 'palisade';
  return null;
}

export function wallIntegrityMax(building: Building): number {
  const wallType = effectiveWallType(building);
  if (!wallType) return 0;
  return CONFIG.raidPathing.integrityMax[wallType];
}

export function wallIntegrity(building: Building): number {
  const stored = building.structureIntegrity;
  return typeof stored === 'number' && Number.isFinite(stored)
    ? Math.max(0, Math.min(wallIntegrityMax(building), stored))
    : wallIntegrityMax(building);
}

/** 완공·미파손 벽과 성문은 침입자 및 보호영역의 경계다. */
export function isBlockingDefenseWall(building: Building): boolean {
  const wallType = effectiveWallType(building);
  return wallType != null && building.built && !building.repairing &&
    building.breached !== true && wallIntegrity(building) > 0;
}

export function initializeWallIntegrity(building: Building): void {
  const max = wallIntegrityMax(building);
  if (max <= 0) {
    delete building.structureIntegrity;
    delete building.structureIntegrityMax;
    delete building.breached;
    delete building.structureRepair;
    return;
  }
  building.structureIntegrityMax = max;
  const current = Number(building.structureIntegrity);
  building.structureIntegrity = Number.isFinite(current)
    ? Math.max(0, Math.min(max, current))
    : max;
  building.breached = building.breached === true || building.structureIntegrity <= 0;
  if (!building.breached) delete building.structureRepair;
}

export function bumpDefenseTopology(state: GameState): void {
  state.defenseTopologyRevision = Math.max(0, Math.floor(state.defenseTopologyRevision ?? 0)) + 1;
}

/** 현재 남은 내구를 포함한 공격 경로용 통과 비용. */
function wallBreachCost(building: Building): number {
  const wallType = effectiveWallType(building);
  if (!wallType || !isBlockingDefenseWall(building)) return 0;
  return Math.max(1, Math.round(wallIntegrity(building) * CONFIG.raidPathing.breachCostMultiplier[wallType]));
}

export function isRaidTileTraversable(state: GameState, x: number, y: number, assault: boolean): boolean {
  const tile = state.map[y]?.[x];
  if (!tile || tile.terrain === 'mountain' || tile.terrain === 'rock' || tile.terrain === 'sea') return false;
  const building = buildingAt(state, x, y);
  if (building) {
    if (isBlockingDefenseWall(building)) return assault;
    if (effectiveWallType(building)) return true;
    return raiderCanUseBuilding(building);
  }
  if (tile.terrain === 'river') {
    return getSeason(state.day) === 'winter' && state.weather !== 'thawFlood';
  }
  if (tile.terrain === 'lake') return isLakeIceAt(state.map, state.day, x, y);
  return true;
}

function stepCost(state: GameState, x: number, y: number, diagonal: boolean, assault: boolean): number {
  const tile = state.map[y]![x];
  const terrainCost = treeStageFor(tile) === 'mature'
    ? Math.round((diagonal ? 14 : 10) * CONFIG.raidPathing.matureForestCostMultiplier)
    : diagonal ? 14 : 10;
  const building = buildingAt(state, x, y);
  return terrainCost + (assault && building ? wallBreachCost(building) : 0);
}

function routeFor(
  state: GameState,
  start: { x: number; y: number },
  target: { x: number; y: number },
  kind: 'open' | 'assault',
  allowBlockedStart: boolean,
): RaidRoutePlan | null {
  const h = state.map.length;
  const w = state.map[0]?.length ?? 0;
  const assault = kind === 'assault';
  if ((!allowBlockedStart && !isRaidTileTraversable(state, start.x, start.y, assault)) ||
      !isRaidTileTraversable(state, target.x, target.y, assault)) return null;
  const startIndex = start.y * w + start.x;
  const targetIndex = target.y * w + target.x;
  const costs = new Int32Array(w * h).fill(0x3fffffff);
  const previous = new Int32Array(w * h).fill(-1);
  const closed = new Uint8Array(w * h);
  const heuristic = (x: number, y: number) => {
    const dx = Math.abs(target.x - x);
    const dy = Math.abs(target.y - y);
    return 10 * (dx + dy) - 6 * Math.min(dx, dy);
  };
  const queue: Array<{ index: number; score: number }> = [
    { index: startIndex, score: heuristic(start.x, start.y) },
  ];
  costs[startIndex] = 0;

  const push = (entry: { index: number; score: number }) => {
    queue.push(entry);
    let index = queue.length - 1;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (queue[parent].score <= queue[index].score) break;
      [queue[parent], queue[index]] = [queue[index], queue[parent]];
      index = parent;
    }
  };
  const pop = (): { index: number; score: number } => {
    const top = queue[0];
    const last = queue.pop()!;
    if (queue.length > 0) {
      queue[0] = last;
      let index = 0;
      for (;;) {
        const left = index * 2 + 1;
        const right = left + 1;
        let smallest = index;
        if (left < queue.length && queue[left].score < queue[smallest].score) smallest = left;
        if (right < queue.length && queue[right].score < queue[smallest].score) smallest = right;
        if (smallest === index) break;
        [queue[index], queue[smallest]] = [queue[smallest], queue[index]];
        index = smallest;
      }
    }
    return top;
  };

  while (queue.length > 0) {
    const current = pop().index;
    if (closed[current]) continue;
    closed[current] = 1;
    if (current === targetIndex) break;
    const x = current % w;
    const y = (current - x) / w;
    for (const [dx, dy] of DIRECTIONS) {
      const nx = x + dx;
      const ny = y + dy;
      if (!isRaidTileTraversable(state, nx, ny, assault)) continue;
      if (dx !== 0 && dy !== 0) {
        const horizontalBuilding = buildingAt(state, x + dx, y);
        const verticalBuilding = buildingAt(state, x, y + dy);
        // 공격 경로라도 벽 모서리를 대각선으로 비집고 지나가면 실제 벽 칸을 밟지 않아
        // 돌파 비용과 breaches[]가 사라진다. 모서리 양옆은 항상 개방 통행 가능해야 한다.
        if ((horizontalBuilding && isBlockingDefenseWall(horizontalBuilding)) ||
            (verticalBuilding && isBlockingDefenseWall(verticalBuilding)) ||
            !isRaidTileTraversable(state, x + dx, y, false) ||
            !isRaidTileTraversable(state, x, y + dy, false)) continue;
      }
      const next = ny * w + nx;
      const nextCost = costs[current] + stepCost(state, nx, ny, dx !== 0 && dy !== 0, assault);
      if (nextCost >= costs[next]) continue;
      costs[next] = nextCost;
      previous[next] = current;
      push({ index: next, score: nextCost + heuristic(nx, ny) });
    }
  }
  if (!closed[targetIndex]) return null;

  const steps: Array<{ x: number; y: number }> = [];
  for (let current = targetIndex; current !== startIndex; current = previous[current]) {
    if (current < 0) return null;
    steps.push({ x: current % w, y: Math.floor(current / w) });
  }
  steps.reverse();
  const breaches: RaidRoutePlan['breaches'] = [];
  const seen = new Set<number>();
  for (const step of steps) {
    const building = buildingAt(state, step.x, step.y);
    if (building && isBlockingDefenseWall(building) && !seen.has(building.id)) {
      breaches.push({ buildingId: building.id, x: step.x, y: step.y });
      seen.add(building.id);
    }
  }
  return { steps, breaches, totalCost: costs[targetIndex], kind };
}

export function planRaidRoute(
  state: GameState,
  start: { x: number; y: number },
  target: { x: number; y: number },
  power: number,
  options: { allowBlockedStart?: boolean } = {},
): RaidRoutePlan | null {
  const open = routeFor(state, start, target, 'open', options.allowBlockedStart === true);
  const assault = routeFor(state, start, target, 'assault', options.allowBlockedStart === true);
  return selectRaidRoute(open, assault, power);
}

/** 실제 이동비용은 보존하되 벽을 피해 도는 개방 경로에는 선택용 우회 부담을 더한다. */
export function selectRaidRoute(
  open: RaidRoutePlan | null,
  assault: RaidRoutePlan | null,
  power: number,
): RaidRoutePlan | null {
  if (!assault) return open;
  if (!open) return assault;
  const ratio = power < 30 ? CONFIG.raidPathing.detourRatio.small
    : power < 50 ? CONFIG.raidPathing.detourRatio.medium : CONFIG.raidPathing.detourRatio.large;
  const detourCost = open.totalCost * CONFIG.raidPathing.openRouteDetourCostMultiplier;
  return detourCost <= assault.totalCost * ratio ? open : assault;
}

/** 첫 돌파 지점이 중심지를 감싼 보호영역의 실제 외곽 경계인지 판정한다. */
export function isProtectedBoundaryBreach(
  state: GameState,
  center: Building,
  breach: RaidBreach | undefined,
): boolean {
  if (!breach) return false;
  const interior = protectedInterior(state);
  const centerFootprint = footprintTilesOf(state, center) ?? [{ x: center.x, y: center.y }];
  if (!centerFootprint.every(tile => interior.has(key(tile.x, tile.y)))) return false;
  const centerComponent = new Set(centerFootprint.map(tile => key(tile.x, tile.y)));
  const queue = [...centerFootprint];
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const tile = queue[cursor];
    for (const [dx, dy] of CARDINAL_DIRECTIONS) {
      const next = { x: tile.x + dx, y: tile.y + dy };
      const nextKey = key(next.x, next.y);
      if (!interior.has(nextKey) || centerComponent.has(nextKey)) continue;
      centerComponent.add(nextKey);
      queue.push(next);
    }
  }
  return CARDINAL_DIRECTIONS.some(([dx, dy]) => centerComponent.has(key(breach.x + dx, breach.y + dy)));
}

/** 지도 가장자리에서 닿지 않는, 완공·미돌파 벽 안쪽의 순수 영역. */
export function protectedInterior(state: GameState): Set<string> {
  const h = state.map.length;
  const w = state.map[0]?.length ?? 0;
  const exterior = new Set<string>();
  const queue: Array<{ x: number; y: number }> = [];
  const add = (x: number, y: number) => {
    const building = buildingAt(state, x, y);
    if (!state.map[y]?.[x] || (building && isBlockingDefenseWall(building))) return;
    const tileKey = key(x, y);
    if (exterior.has(tileKey)) return;
    exterior.add(tileKey);
    queue.push({ x, y });
  };
  for (let x = 0; x < w; x++) { add(x, 0); add(x, h - 1); }
  for (let y = 1; y < h - 1; y++) { add(0, y); add(w - 1, y); }
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const { x, y } = queue[cursor];
    for (const [dx, dy] of CARDINAL_DIRECTIONS) add(x + dx, y + dy);
  }
  const interior = new Set<string>();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const tileKey = key(x, y);
      const building = buildingAt(state, x, y);
      if (!exterior.has(tileKey) && !(building && isBlockingDefenseWall(building))) interior.add(tileKey);
    }
  }
  return interior;
}
