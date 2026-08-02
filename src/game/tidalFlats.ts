import { CONFIG } from './config';
import type { GatheringWorkArea, Season, Tile } from './types';

export type CoastalGroundKind = 'mudflat' | 'sand' | 'shingle' | 'rocky';

function finiteNonNegative(value: unknown, fallback: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, numeric) : fallback;
}

export function normalizeTidalFlatTile(tile: Tile): void {
  if (tile.terrain !== 'mudflat') {
    delete tile.tidalStock;
    delete tile.tidalCapacity;
    return;
  }
  const capacity = finiteNonNegative(tile.tidalCapacity, CONFIG.tidalFlats.capacityPerTile);
  tile.tidalCapacity = capacity;
  tile.tidalStock = Math.min(capacity, finiteNonNegative(tile.tidalStock, capacity));
}

export function ensureTidalFlatStocks(map: Tile[][]): void {
  for (const tile of map.flat()) normalizeTidalFlatTile(tile);
}

export function advanceTidalFlatStocks(map: Tile[][]): number {
  let recovered = 0;
  for (const tile of map.flat()) {
    if (tile.terrain !== 'mudflat') continue;
    normalizeTidalFlatTile(tile);
    const before = tile.tidalStock ?? 0;
    tile.tidalStock = Math.min(
      tile.tidalCapacity ?? CONFIG.tidalFlats.capacityPerTile,
      before + CONFIG.tidalFlats.recoveryPerTilePerDay,
    );
    recovered += tile.tidalStock - before;
  }
  return recovered;
}

export function takeTidalFlatStock(tile: Tile, amount: number): number {
  if (tile.terrain !== 'mudflat') return 0;
  normalizeTidalFlatTile(tile);
  const requested = Number.isFinite(amount) ? Math.max(0, amount) : 0;
  const taken = Math.min(tile.tidalStock ?? 0, requested);
  tile.tidalStock = Math.max(0, (tile.tidalStock ?? 0) - taken);
  return taken;
}

export interface TidalFlatSummary {
  tiles: number;
  stock: number;
  capacity: number;
}

export function tidalFlatSummaryInArea(map: Tile[][], area: GatheringWorkArea): TidalFlatSummary {
  const summary: TidalFlatSummary = { tiles: 0, stock: 0, capacity: 0 };
  for (let y = area.y - area.radius; y <= area.y + area.radius; y++) {
    for (let x = area.x - area.radius; x <= area.x + area.radius; x++) {
      const tile = map[y]?.[x];
      if (!tile || tile.terrain !== 'mudflat' || (x - area.x) ** 2 + (y - area.y) ** 2 > area.radius ** 2) continue;
      normalizeTidalFlatTile(tile);
      summary.tiles++;
      summary.stock += tile.tidalStock ?? 0;
      summary.capacity += tile.tidalCapacity ?? 0;
    }
  }
  return summary;
}

export function tidalFlatTileCountNear(map: Tile[][], x: number, y: number, radius: number): number {
  let count = 0;
  for (let ty = y - radius; ty <= y + radius; ty++) {
    for (let tx = x - radius; tx <= x + radius; tx++) {
      if ((tx - x) ** 2 + (ty - y) ** 2 > radius ** 2) continue;
      if (map[ty]?.[tx]?.terrain === 'mudflat') count++;
    }
  }
  return count;
}

export function tidalFlatYieldMultiplier(season: Season): number {
  return CONFIG.tidalFlats.yieldMultiplier * CONFIG.tidalFlats.seasonYieldMult[season];
}

function visualHash(x: number, y: number): number {
  let value = Math.imul(x + 37, 0x45d9f3b) ^ Math.imul(y + 71, 0x119de1f3);
  value ^= value >>> 16;
  return value >>> 0;
}

export function seaDistanceAt(map: Tile[][], x: number, y: number, maximum = 2): number | null {
  for (let distance = 1; distance <= maximum; distance++) {
    for (let dy = -distance; dy <= distance; dy++) {
      const dx = distance - Math.abs(dy);
      if (map[y + dy]?.[x + dx]?.terrain === 'sea' || map[y + dy]?.[x - dx]?.terrain === 'sea') return distance;
    }
  }
  return null;
}

export function coastalGroundAt(map: Tile[][], x: number, y: number): CoastalGroundKind | null {
  const tile = map[y]?.[x];
  if (!tile) return null;
  if (tile.terrain === 'mudflat') return 'mudflat';
  if (tile.terrain === 'sea') {
    const neighbor = [[0, -1], [1, 0], [0, 1], [-1, 0]]
      .map(([dx, dy]) => map[y + dy]?.[x + dx])
      .find(candidate => candidate && candidate.terrain !== 'sea');
    if (!neighbor) return null;
    if (neighbor?.terrain === 'mudflat') return 'mudflat';
  } else if (seaDistanceAt(map, x, y) == null) return null;
  const rockyNeighbor = [-2, -1, 0, 1, 2].some(dy => [-2, -1, 0, 1, 2].some(dx => {
    const terrain = map[y + dy]?.[x + dx]?.terrain;
    return terrain === 'rock' || terrain === 'mountain';
  }));
  if (rockyNeighbor) return 'rocky';
  // 바닥 종류를 타일마다 뒤섞지 않고 6칸 안팎의 해안 구간으로 묶어 체크무늬를 피한다.
  const hash = visualHash(Math.floor(x / 6), Math.floor(y / 6));
  if (hash % 7 === 0) return 'rocky';
  return hash % 3 === 0 ? 'shingle' : 'sand';
}
