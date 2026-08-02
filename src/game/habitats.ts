import { CONFIG } from './config';
import type { AnimalHabitat, GatheringWorkArea, Terrain, Tile } from './types';

// 서식지 후보 — 숲 덩어리(연결 성분)의 중심. 지도 생성 때 확률로 서식지가 된다.
export interface HabitatCandidate {
  x: number;
  y: number;
  radius: number;
  forestTiles: number;
}

export interface ForestHabitatOptions {
  minTiles: number;
  radius: number;
}

const DEFAULT_OPTIONS: ForestHabitatOptions = {
  minTiles: 8,
  radius: 4,
};

// 마을에서 이 거리 안에 서식지가 하나도 안 나오면 가장 가까운 후보를 보장한다
const GUARANTEE_RADIUS = 16;

export function isForestHabitatCover(terrain: Terrain): boolean {
  return terrain === 'forest';
}

// 숲 덩어리(상하좌우 연결)마다 서식지 후보 하나 — 중심은 무게중심에 가장 가까운 타일
export function findHabitatCandidates(
  map: Tile[][],
  options: Partial<ForestHabitatOptions> = {},
): HabitatCandidate[] {
  const resolved = { ...DEFAULT_OPTIONS, ...options };
  const height = map.length;
  const width = map[0]?.length ?? 0;
  const visited = new Set<string>();
  const candidates: HabitatCandidate[] = [];

  const keyOf = (x: number, y: number) => `${x},${y}`;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const start = map[y]?.[x];
      const startKey = keyOf(x, y);
      if (!start || visited.has(startKey) || !isForestHabitatCover(start.terrain)) continue;

      const component: Tile[] = [];
      const stack: Array<[number, number]> = [[x, y]];
      visited.add(startKey);

      while (stack.length > 0) {
        const [cx, cy] = stack.pop()!;
        const tile = map[cy]?.[cx];
        if (!tile || !isForestHabitatCover(tile.terrain)) continue;
        component.push(tile);

        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx;
          const ny = cy + dy;
          const next = map[ny]?.[nx];
          const nextKey = keyOf(nx, ny);
          if (!next || visited.has(nextKey) || !isForestHabitatCover(next.terrain)) continue;
          visited.add(nextKey);
          stack.push([nx, ny]);
        }
      }

      if (component.length < resolved.minTiles) continue;
      const center = pickCenterTile(component);
      candidates.push({
        x: center.x,
        y: center.y,
        radius: resolved.radius,
        forestTiles: component.length,
      });
    }
  }

  return candidates;
}

// 서식지 확정 — 후보마다 난이도별 확률(chance)로 주사위를 굴린다.
// 사냥이 아예 불가능해지지 않게, 마을 근처에 하나도 안 나오면
// 마을에서 가장 가까운 후보 하나를 보장한다.
export function spawnAnimalHabitats(
  map: Tile[][],
  centerX: number,
  centerY: number,
  rng: () => number,
  chance: number,
  options: Partial<ForestHabitatOptions> = {},
): AnimalHabitat[] {
  const candidates = findHabitatCandidates(map, options);
  const spawned = candidates.filter(() => rng() < chance);

  const distSq = (c: { x: number; y: number }) =>
    (c.x - centerX) ** 2 + (c.y - centerY) ** 2;
  const hasNearby = spawned.some(c => distSq(c) <= GUARANTEE_RADIUS ** 2);
  if (!hasNearby && candidates.length > 0) {
    const nearest = candidates.reduce((a, b) => (distSq(a) <= distSq(b) ? a : b));
    if (!spawned.includes(nearest)) spawned.push(nearest);
  }

  return spawned.map((c, i) => {
    const capacity = habitatCapacity(habitatForestTiles(map, c));
    return { id: i + 1, x: c.x, y: c.y, radius: c.radius, active: true, stock: capacity, capacity };
  });
}

export function habitatCapacity(forestTiles: number): number {
  return Math.max(
    CONFIG.habitats.reserveMin,
    Math.min(CONFIG.habitats.reserveMax, forestTiles * CONFIG.habitats.reservePerForestTile),
  );
}

export function normalizeHabitatReserve(map: Tile[][], habitat: AnimalHabitat): void {
  const capacity = habitatCapacity(habitatForestTiles(map, habitat));
  // 숲 변화가 만든 새 수용력은 즉시 반영하되, 개체수는 일일 회복으로만 늘어난다.
  habitat.capacity = capacity;
  habitat.stock = Number.isFinite(habitat.stock)
    ? Math.max(0, Math.min(capacity, habitat.stock))
    : capacity;
}

// 3배 비축 밸런스 이전 저장은 남아 있던 비율을 그대로 새 최대치에 옮긴다.
// 일반 일일 정규화와 분리해 숲 재생만으로 개체수가 즉시 불어나는 일은 막는다.
export function rebalanceLoadedHabitatReserve(map: Tile[][], habitat: AnimalHabitat): void {
  const previousCapacity = Number(habitat.capacity);
  const previousStock = Number(habitat.stock);
  const nextCapacity = habitatCapacity(habitatForestTiles(map, habitat));
  if (Number.isFinite(previousCapacity) && previousCapacity > 0 && previousCapacity < nextCapacity &&
      Number.isFinite(previousStock)) {
    habitat.stock = Math.max(0, previousStock) * (nextCapacity / previousCapacity);
  }
  normalizeHabitatReserve(map, habitat);
}

export function advanceHabitatReserve(map: Tile[][], habitat: AnimalHabitat): number {
  const previous = Number.isFinite(habitat.stock) ? Math.max(0, habitat.stock) : 0;
  normalizeHabitatReserve(map, habitat);
  if (!habitat.active) {
    habitat.stock = 0;
    return habitat.stock - previous;
  }
  const recovery = Math.max(
    CONFIG.habitats.recoveryPerDayMin,
    habitat.capacity * CONFIG.habitats.recoveryPerDayRatio,
  );
  habitat.stock = Math.min(habitat.capacity, habitat.stock + recovery);
  return habitat.stock - previous;
}

export function takeHabitatStock(habitat: AnimalHabitat, amount = 1): number {
  const requested = Number.isFinite(amount) ? Math.max(0, amount) : 0;
  const taken = Math.min(Math.max(0, habitat.stock), requested);
  habitat.stock = Math.max(0, habitat.stock - taken);
  return taken;
}

// 서식지 반경 안의 숲 타일 수 — 짐승이 머무는 조건이자 수확 배율의 근거
export function habitatForestTiles(map: Tile[][], habitat: Pick<AnimalHabitat, 'x' | 'y' | 'radius'>): number {
  const r = habitat.radius;
  let count = 0;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > r * r) continue; // 렌더러의 범위 원과 같은 원형 판정
      const tile = map[habitat.y + dy]?.[habitat.x + dx];
      if (tile && isForestHabitatCover(tile.terrain)) count++;
    }
  }
  return count;
}

// 반경 안 숲이 이만큼은 남아 있어야 짐승이 머문다
export function isHabitatActive(
  map: Tile[][],
  habitat: Pick<AnimalHabitat, 'x' | 'y' | 'radius'>,
  minTiles = DEFAULT_OPTIONS.minTiles,
): boolean {
  return habitatForestTiles(map, habitat) >= minTiles;
}

// 사냥 수확 배율 규칙 — config 값을 호출자가 넘긴다 (이 모듈은 의존성 없이 단독 테스트된다)
export interface HuntableYieldOptions {
  habitatYieldBase: number;    // 서식지 기본 배율
  habitatYieldPerTile: number; // 서식지 숲 1타일당 가산
  habitatYieldMax: number;
}

export function habitatYieldMult(forestTiles: number, opts: HuntableYieldOptions): number {
  return Math.min(opts.habitatYieldMax, opts.habitatYieldBase + opts.habitatYieldPerTile * forestTiles);
}

// 사냥꾼이 일할 수 있는 타일 → 수확 배율 ("x,y" 키).
// 활동 중인 서식지 반경 안의 숲만 사냥터가 되고, 배율은 반경 안 숲 크기에 비례한다.
// 여러 서식지가 겹치면 높은 배율을 따른다.
export function collectHuntableTiles(
  map: Tile[][],
  habitats: AnimalHabitat[],
  opts: HuntableYieldOptions,
): Map<string, number> {
  const tiles = new Map<string, number>();
  for (const habitat of habitats) {
    if (!habitat.active || habitat.stock <= 0) continue;
    const mult = habitatYieldMult(habitatForestTiles(map, habitat), opts);
    const r = habitat.radius;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r) continue;
        const tile = map[habitat.y + dy]?.[habitat.x + dx];
        if (!tile || !isForestHabitatCover(tile.terrain)) continue;
        const key = `${tile.x},${tile.y}`;
        tiles.set(key, Math.max(tiles.get(key) ?? 0, mult));
      }
    }
  }
  return tiles;
}

export function huntableHabitatAtTile(
  map: Tile[][],
  habitats: AnimalHabitat[],
  x: number,
  y: number,
  opts: HuntableYieldOptions,
): AnimalHabitat | null {
  const candidates = habitats.filter(habitat => {
    if (!habitat.active || habitat.stock <= 0) return false;
    const dx = x - habitat.x;
    const dy = y - habitat.y;
    return dx * dx + dy * dy <= habitat.radius ** 2 && map[y]?.[x]?.terrain === 'forest';
  });
  candidates.sort((a, b) =>
    habitatYieldMult(habitatForestTiles(map, b), opts) - habitatYieldMult(habitatForestTiles(map, a), opts) ||
    b.stock - a.stock || a.id - b.id);
  return candidates[0] ?? null;
}

export interface HabitatReserveSummary {
  habitats: number;
  stock: number;
  capacity: number;
}

export function habitatReserveSummaryInArea(
  map: Tile[][],
  habitats: AnimalHabitat[],
  area: GatheringWorkArea,
): HabitatReserveSummary {
  const summary: HabitatReserveSummary = { habitats: 0, stock: 0, capacity: 0 };
  for (const habitat of habitats) {
    let overlaps = false;
    for (let dy = -habitat.radius; dy <= habitat.radius && !overlaps; dy++) {
      for (let dx = -habitat.radius; dx <= habitat.radius; dx++) {
        if (dx * dx + dy * dy > habitat.radius ** 2) continue;
        const tile = map[habitat.y + dy]?.[habitat.x + dx];
        if (!tile || tile.terrain !== 'forest') continue;
        const ax = tile.x - area.x;
        const ay = tile.y - area.y;
        if (ax * ax + ay * ay <= area.radius ** 2) { overlaps = true; break; }
      }
    }
    if (!overlaps) continue;
    summary.habitats++;
    summary.stock += Math.max(0, habitat.stock);
    summary.capacity += Math.max(0, habitat.capacity);
  }
  return summary;
}

export function findHabitatIconAtTile(
  habitats: AnimalHabitat[],
  x: number,
  y: number,
): AnimalHabitat | null {
  return habitats.find(habitat => habitat.x === x && habitat.y === y) ?? null;
}

function pickCenterTile(component: Tile[]): Tile {
  const cx = component.reduce((sum, tile) => sum + tile.x, 0) / component.length;
  const cy = component.reduce((sum, tile) => sum + tile.y, 0) / component.length;
  return [...component].sort((a, b) => {
    const da = (a.x - cx) ** 2 + (a.y - cy) ** 2;
    const db = (b.x - cx) ** 2 + (b.y - cy) ** 2;
    if (da !== db) return da - db;
    if (a.y !== b.y) return a.y - b.y;
    return a.x - b.x;
  })[0];
}
