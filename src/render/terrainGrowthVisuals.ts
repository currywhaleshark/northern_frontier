import type { Terrain, Tile } from '../game/types';

export type TreeSpecies = 'broadleaf' | 'conifer';
export type MountainProfile = 'shoulder' | 'ridgeLow' | 'ridgeHigh' | 'peak' | 'cliff';

export interface TerrainNeighbors {
  n: boolean;
  e: boolean;
  s: boolean;
  w: boolean;
  ne: boolean;
  se: boolean;
  sw: boolean;
  nw: boolean;
}

export function terrainVisualHash(x: number, y: number): number {
  let value = Math.imul(x + 0x7ed55d16, 0x85ebca6b) ^ Math.imul(y + 0x165667b1, 0xc2b2ae35);
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15;
  return value >>> 0;
}

export function treeSpeciesFromHash(hash: number, mountainNearby: boolean): TreeSpecies {
  if (mountainNearby) return hash % 3 === 0 ? 'broadleaf' : 'conifer';
  return hash % 4 === 0 ? 'conifer' : 'broadleaf';
}

export function terrainVariantFromHash(hash: number, variants = 2): number {
  return variants <= 1 ? 0 : Math.abs(hash >>> 0) % variants;
}

function terrainAt(map: Tile[][], x: number, y: number): Terrain | null {
  return map[y]?.[x]?.terrain ?? null;
}

export function terrainNeighborsFor(map: Tile[][], x: number, y: number, terrain: Terrain): TerrainNeighbors {
  const same = (tx: number, ty: number): boolean => {
    const value = terrainAt(map, tx, ty);
    // 산맥은 지도 북·동쪽 밖으로 이어지는 것으로 취급해 잘린 외곽 절벽을 피한다.
    if (value == null && terrain === 'mountain' && (tx >= map[0]?.length || ty < 0)) return true;
    return value === terrain;
  };
  return {
    n: same(x, y - 1),
    e: same(x + 1, y),
    s: same(x, y + 1),
    w: same(x - 1, y),
    ne: same(x + 1, y - 1),
    se: same(x + 1, y + 1),
    sw: same(x - 1, y + 1),
    nw: same(x - 1, y - 1),
  };
}

export function mountainDepthAt(map: Tile[][], x: number, y: number, maxDepth = 3): number {
  if (terrainAt(map, x, y) !== 'mountain') return 0;
  for (let distance = 1; distance < maxDepth; distance++) {
    for (let dy = -distance; dy <= distance; dy++) {
      const dx = distance - Math.abs(dy);
      for (const signedDx of dx === 0 ? [0] : [-dx, dx]) {
        const tx = x + signedDx;
        const ty = y + dy;
        const value = terrainAt(map, tx, ty);
        if (value == null && (tx >= map[0]?.length || ty < 0)) continue;
        if (value !== 'mountain') return distance;
      }
    }
  }
  return maxDepth;
}

export function mountainProfileFor(
  neighbors: TerrainNeighbors,
  depth: number,
  hash: number,
): MountainProfile {
  if (!neighbors.s && (neighbors.n || neighbors.e || neighbors.w)) return 'cliff';
  if (depth >= 3 && hash % 5 === 0) return 'peak';
  if (depth >= 3) return 'ridgeHigh';
  if (depth === 2) return 'ridgeLow';
  return 'shoulder';
}
