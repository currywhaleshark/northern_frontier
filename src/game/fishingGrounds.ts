import { CONFIG } from './config';
import type {
  FishingGroundDepthBand, FishingGroundKind, FishingGroundState, FishingGroundTile,
  GameState, GatheringWorkArea, Terrain, Tile,
} from './types';

const CARDINAL_STEPS = [[0, -1], [1, 0], [0, 1], [-1, 0]] as const;
const RESOURCE_TERRAINS = new Set<Terrain>(['river', 'mudflat', 'lake', 'sea']);

function key(x: number, y: number): string {
  return `${x},${y}`;
}

function finiteNonNegative(value: unknown, fallback: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, numeric) : fallback;
}

function terrainKind(terrain: Terrain): FishingGroundKind | null {
  return RESOURCE_TERRAINS.has(terrain) ? terrain as FishingGroundKind : null;
}

function groundRadius(depthBand: FishingGroundDepthBand): number {
  if (depthBand === 'shore') return CONFIG.fishingGrounds.shoreRadius;
  if (depthBand === 'mid') return CONFIG.fishingGrounds.midRadius;
  return CONFIG.fishingGrounds.deepRadius;
}

function waterDepths(map: Tile[][], kind: Extract<FishingGroundKind, 'lake' | 'sea'>): Map<string, number> {
  const distances = new Map<string, number>();
  const queue: FishingGroundTile[] = [];
  for (const row of map) for (const tile of row) {
    if (tile.terrain !== kind) continue;
    const atShore = CARDINAL_STEPS.some(([dx, dy]) => {
      const neighbor = map[tile.y + dy]?.[tile.x + dx];
      return neighbor != null && neighbor.terrain !== kind;
    });
    if (!atShore) continue;
    distances.set(key(tile.x, tile.y), 1);
    queue.push({ x: tile.x, y: tile.y });
  }
  for (let index = 0; index < queue.length; index++) {
    const tile = queue[index];
    const distance = distances.get(key(tile.x, tile.y)) ?? 1;
    for (const [dx, dy] of CARDINAL_STEPS) {
      const x = tile.x + dx;
      const y = tile.y + dy;
      const tileKey = key(x, y);
      if (map[y]?.[x]?.terrain !== kind || distances.has(tileKey)) continue;
      distances.set(tileKey, distance + 1);
      queue.push({ x, y });
    }
  }
  return distances;
}

function depthBandFor(
  tile: Tile,
  lakeDepths: Map<string, number>,
  seaDepths: Map<string, number>,
): FishingGroundDepthBand | null {
  if (tile.terrain === 'river' || tile.terrain === 'mudflat') return 'shore';
  const distance = tile.terrain === 'lake'
    ? lakeDepths.get(key(tile.x, tile.y))
    : tile.terrain === 'sea'
      ? seaDepths.get(key(tile.x, tile.y))
      : null;
  if (distance == null) return null;
  if (distance <= 1) return 'shore';
  if (distance <= 3) return 'mid';
  return 'deep';
}

function capacityPerTile(kind: FishingGroundKind, band: FishingGroundDepthBand): number {
  if (kind === 'mudflat') return CONFIG.tidalFlats.capacityPerTile;
  return CONFIG.fishingGrounds.capacityPerTile[kind][band];
}

function recoveryPerTile(kind: FishingGroundKind, band: FishingGroundDepthBand): number {
  if (kind === 'mudflat') return CONFIG.tidalFlats.recoveryPerTilePerDay;
  return CONFIG.fishingGrounds.recoveryPerTilePerDay[kind][band];
}

function legacyReserveRatio(map: Tile[][], tiles: FishingGroundTile[], kind: FishingGroundKind): number {
  if (kind !== 'mudflat') return 1;
  let stock = 0;
  let capacity = 0;
  let hasLegacyReserve = false;
  for (const point of tiles) {
    const tile = map[point.y]?.[point.x];
    if (!tile) continue;
    if (tile.tidalStock != null || tile.tidalCapacity != null) hasLegacyReserve = true;
    const tileCapacity = finiteNonNegative(tile.tidalCapacity, CONFIG.tidalFlats.capacityPerTile);
    capacity += tileCapacity;
    stock += Math.min(tileCapacity, finiteNonNegative(tile.tidalStock, tileCapacity));
  }
  return hasLegacyReserve && capacity > 0 ? stock / capacity : 1;
}

function baseFishingGrounds(map: Tile[][]): FishingGroundState[] {
  const lakeDepths = waterDepths(map, 'lake');
  const seaDepths = waterDepths(map, 'sea');
  const candidates = map.flat().flatMap(tile => {
    const kind = terrainKind(tile.terrain);
    const depthBand = depthBandFor(tile, lakeDepths, seaDepths);
    return kind && depthBand ? [{ tile, kind, depthBand }] : [];
  });
  const byKey = new Map(candidates.map(candidate => [key(candidate.tile.x, candidate.tile.y), candidate]));
  const assigned = new Set<string>();
  const grounds: FishingGroundState[] = [];

  for (const candidate of candidates) {
    const startKey = key(candidate.tile.x, candidate.tile.y);
    if (assigned.has(startKey)) continue;
    const radius = groundRadius(candidate.depthBand);
    const tiles: FishingGroundTile[] = [];
    const queued = new Set<string>([startKey]);
    const queue: FishingGroundTile[] = [{ x: candidate.tile.x, y: candidate.tile.y }];
    for (let index = 0; index < queue.length; index++) {
      const point = queue[index];
      const pointKey = key(point.x, point.y);
      const current = byKey.get(pointKey);
      if (!current || assigned.has(pointKey) || current.kind !== candidate.kind ||
          current.depthBand !== candidate.depthBand) continue;
      const dx = point.x - candidate.tile.x;
      const dy = point.y - candidate.tile.y;
      if (dx * dx + dy * dy > radius * radius) continue;
      assigned.add(pointKey);
      tiles.push(point);
      for (const [stepX, stepY] of CARDINAL_STEPS) {
        const next = { x: point.x + stepX, y: point.y + stepY };
        const nextKey = key(next.x, next.y);
        if (queued.has(nextKey)) continue;
        queued.add(nextKey);
        queue.push(next);
      }
    }
    if (tiles.length === 0) continue;
    const capacity = tiles.length * capacityPerTile(candidate.kind, candidate.depthBand);
    grounds.push({
      id: `${candidate.kind}:${candidate.depthBand}:${candidate.tile.x},${candidate.tile.y}`,
      kind: candidate.kind,
      depthBand: candidate.depthBand,
      x: candidate.tile.x,
      y: candidate.tile.y,
      radius,
      tiles,
      stock: capacity * legacyReserveRatio(map, tiles, candidate.kind),
      capacity,
      recoveryPerDay: tiles.length * recoveryPerTile(candidate.kind, candidate.depthBand),
    });
  }
  return grounds;
}

function clearLegacyTidalReserves(map: Tile[][]): void {
  for (const tile of map.flat()) {
    delete tile.tidalStock;
    delete tile.tidalCapacity;
  }
}

export function spawnFishingGrounds(map: Tile[][]): FishingGroundState[] {
  const grounds = baseFishingGrounds(map);
  clearLegacyTidalReserves(map);
  return grounds;
}

export function ensureFishingGrounds(state: Pick<GameState, 'map' | 'fishingGrounds'>): void {
  const existing = Array.isArray(state.fishingGrounds) ? state.fishingGrounds : [];
  const existingById = new Map(existing
    .filter(ground => ground && typeof ground.id === 'string')
    .map(ground => [ground.id, ground]));
  const grounds = baseFishingGrounds(state.map);
  for (const ground of grounds) {
    const previous = existingById.get(ground.id);
    if (!previous) continue;
    const previousCapacity = finiteNonNegative(previous.capacity, ground.capacity);
    const previousStock = Math.min(previousCapacity, finiteNonNegative(previous.stock, previousCapacity));
    const ratio = previousCapacity > 0 ? previousStock / previousCapacity : 0;
    ground.stock = ground.capacity * ratio;
  }
  state.fishingGrounds = grounds;
  clearLegacyTidalReserves(state.map);
}

export function advanceFishingGrounds(grounds: FishingGroundState[]): number {
  let recovered = 0;
  for (const ground of grounds) {
    const capacity = finiteNonNegative(ground.capacity, 0);
    const before = Math.min(capacity, finiteNonNegative(ground.stock, capacity));
    ground.capacity = capacity;
    ground.stock = Math.min(capacity, before + finiteNonNegative(ground.recoveryPerDay, 0));
    recovered += ground.stock - before;
  }
  return recovered;
}

export function fishingGroundAt(
  grounds: readonly FishingGroundState[],
  x: number,
  y: number,
  depthBand?: FishingGroundDepthBand,
): FishingGroundState | null {
  for (const ground of grounds) {
    if (depthBand && ground.depthBand !== depthBand) continue;
    if (ground.tiles.some(tile => tile.x === x && tile.y === y)) return ground;
  }
  return null;
}

export function fishingGroundStockAt(
  grounds: readonly FishingGroundState[],
  x: number,
  y: number,
  depthBand: FishingGroundDepthBand = 'shore',
): number {
  return fishingGroundAt(grounds, x, y, depthBand)?.stock ?? 0;
}

export function takeFishingGroundStock(
  grounds: FishingGroundState[],
  x: number,
  y: number,
  amount: number,
  depthBand: FishingGroundDepthBand = 'shore',
): number {
  const ground = fishingGroundAt(grounds, x, y, depthBand);
  if (!ground) return 0;
  const requested = finiteNonNegative(amount, 0);
  const taken = Math.min(ground.stock, requested);
  ground.stock = Math.max(0, ground.stock - taken);
  return taken;
}

export interface FishingGroundSummary {
  grounds: number;
  tiles: number;
  stock: number;
  capacity: number;
}

export function fishingGroundSummaryInArea(
  grounds: readonly FishingGroundState[],
  area: GatheringWorkArea,
  kind?: FishingGroundKind,
  depthBand: FishingGroundDepthBand = 'shore',
): FishingGroundSummary {
  const summary: FishingGroundSummary = { grounds: 0, tiles: 0, stock: 0, capacity: 0 };
  for (const ground of grounds) {
    if (ground.depthBand !== depthBand || (kind && ground.kind !== kind)) continue;
    const includedTiles = ground.tiles.filter(tile =>
      (tile.x - area.x) ** 2 + (tile.y - area.y) ** 2 <= area.radius ** 2).length;
    if (includedTiles === 0) continue;
    summary.grounds++;
    summary.tiles += includedTiles;
    summary.stock += ground.stock;
    summary.capacity += ground.capacity;
  }
  return summary;
}
