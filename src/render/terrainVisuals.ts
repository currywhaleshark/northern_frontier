import type { Terrain } from '../game/types';

export type TerrainCanopyLayer = 'forest' | null;

export function terrainCanopyLayer(terrain: Terrain): TerrainCanopyLayer {
  switch (terrain) {
    case 'forest':
    case 'hunting':
      return 'forest';
    case 'plain':
    case 'river':
    case 'mountain':
    case 'fertile':
    case 'rock':
    case 'center':
      return null;
  }
}

export function terrainShowsStandaloneGameTrail(_terrain: Terrain): boolean {
  return false;
}
