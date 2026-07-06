import type { Season, Terrain } from '../game/types';

export const GENERATED_TERRAIN_OBJECT_SHEET = {
  tileSize: 28,
  columns: 5,
  rows: 2,
  src: '/assets/folk-terrain-objects-generated-v3.png',
} as const;

export type GeneratedTerrainObject =
  | 'broadleaf'
  | 'pine'
  | 'autumnTree'
  | 'winterTree'
  | 'snowPine'
  | 'mountainCrag'
  | 'lowRock'
  | 'fieldstone'
  | 'ironOre';

const OBJECT_INDEX: Record<GeneratedTerrainObject, number> = {
  broadleaf: 0,
  pine: 1,
  autumnTree: 2,
  winterTree: 3,
  snowPine: 4,
  mountainCrag: 5,
  lowRock: 6,
  fieldstone: 7,
  ironOre: 8,
};

export function generatedTerrainObjectSourceRect(kind: GeneratedTerrainObject) {
  const i = OBJECT_INDEX[kind];
  const tile = GENERATED_TERRAIN_OBJECT_SHEET.tileSize;
  return {
    sx: (i % GENERATED_TERRAIN_OBJECT_SHEET.columns) * tile,
    sy: Math.floor(i / GENERATED_TERRAIN_OBJECT_SHEET.columns) * tile,
    sw: tile,
    sh: tile,
  };
}

export function terrainObjectFor(
  terrain: Terrain,
  season: Season,
  hasIron: boolean,
): GeneratedTerrainObject | null {
  if (terrain === 'forest') {
    if (season === 'winter') return 'winterTree';
    if (season === 'autumn') return 'autumnTree';
    return 'broadleaf';
  }
  if (terrain === 'mountain') return 'mountainCrag';
  if (terrain === 'rock') return hasIron ? 'ironOre' : 'lowRock';
  return null;
}

export function fertileGroundWash(season: Season): string {
  switch (season) {
    case 'spring':
      return 'rgba(195,205,120,0.16)';
    case 'summer':
      return 'rgba(214,204,120,0.18)';
    case 'autumn':
      return 'rgba(213,181,91,0.14)';
    case 'winter':
      return 'rgba(236,239,214,0.16)';
  }
}
