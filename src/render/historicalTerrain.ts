import type { Season, Terrain } from '../game/types';

export const HISTORICAL_TERRAIN_TILE_SIZE = 28;
export const HISTORICAL_TERRAIN_EDGE_INSET = 3;
export const HISTORICAL_TERRAIN_SAMPLE_SIZE = 20;

const SEASON_ROWS: Record<Season, number> = {
  spring: 0,
  summer: 1,
  autumn: 2,
  winter: 3,
};

export function historicalTerrainSeasonRow(season: Season): number {
  return SEASON_ROWS[season];
}

export function historicalTerrainColumn(terrain: Terrain): number | null {
  switch (terrain) {
    case 'plain':
    case 'center':
    case 'forest':
    case 'mountain':
    case 'rock':
    case 'fertile':
      return 0;
    case 'river':
      return null;
  }
}

export function historicalTerrainSourceRect(terrain: Terrain, season: Season) {
  const column = historicalTerrainColumn(terrain);
  if (column == null) return null;
  return {
    sx: column * HISTORICAL_TERRAIN_TILE_SIZE + HISTORICAL_TERRAIN_EDGE_INSET,
    sy: historicalTerrainSeasonRow(season) * HISTORICAL_TERRAIN_TILE_SIZE + HISTORICAL_TERRAIN_EDGE_INSET,
    sw: HISTORICAL_TERRAIN_SAMPLE_SIZE,
    sh: HISTORICAL_TERRAIN_SAMPLE_SIZE,
  };
}

export function historicalTerrainSampleOffsetFromHash(hash: number) {
  return {
    dx: (hash >>> 2) % 3,
    dy: (hash >>> 4) % 3,
  };
}

export function historicalTerrainVariantFromHash(hash: number) {
  return {
    flipX: (hash & 1) !== 0,
    flipY: (hash & 2) !== 0,
  };
}
