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
    case 'fertile':
      return 0;
    case 'forest':
      return 5; // 수풀·낙지 바닥 위에 성장 단계 나무를 세운다.
    case 'mountain':
    case 'rock':
      return 3; // 산맥과 광상 아래에는 바위·자갈 지면을 쓴다.
    case 'river':
    case 'lake':
      return null;
  }
}

export function historicalTerrainSourceRect(terrain: Terrain, season: Season, sourceScale = 1) {
  const column = historicalTerrainColumn(terrain);
  if (column == null) return null;
  return {
    sx: (column * HISTORICAL_TERRAIN_TILE_SIZE + HISTORICAL_TERRAIN_EDGE_INSET) * sourceScale,
    sy: (historicalTerrainSeasonRow(season) * HISTORICAL_TERRAIN_TILE_SIZE + HISTORICAL_TERRAIN_EDGE_INSET) * sourceScale,
    sw: HISTORICAL_TERRAIN_SAMPLE_SIZE * sourceScale,
    sh: HISTORICAL_TERRAIN_SAMPLE_SIZE * sourceScale,
  };
}

export function historicalTerrainSampleOffsetFromHash(hash: number, sourceScale = 1) {
  return {
    dx: ((hash >>> 2) % 3) * sourceScale,
    dy: ((hash >>> 4) % 3) * sourceScale,
  };
}

export function historicalTerrainVariantFromHash(hash: number) {
  return {
    flipX: (hash & 1) !== 0,
    flipY: (hash & 2) !== 0,
  };
}

export function historicalTerrainVariantFor(terrain: Terrain, hash: number) {
  if (terrain === 'forest' || terrain === 'mountain' || terrain === 'rock') {
    return { flipX: false, flipY: false };
  }
  return historicalTerrainVariantFromHash(hash);
}
