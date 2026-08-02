import type { Terrain } from '../game/types';

export type TerrainCanopyLayer = 'forest' | null;

export function terrainCanopyLayer(terrain: Terrain): TerrainCanopyLayer {
  switch (terrain) {
    case 'forest':
      return 'forest';
    case 'plain':
    case 'river':
    case 'lake':
    case 'mountain':
    case 'fertile':
    case 'rock':
    case 'center':
      return null;
  }
}
