import type { Terrain } from '../game/types';

type TerrainCanopyLayer = 'forest' | null;

export function terrainCanopyLayer(terrain: Terrain): TerrainCanopyLayer {
  switch (terrain) {
    case 'forest':
      return 'forest';
    case 'plain':
    case 'mudflat':
    case 'river':
    case 'lake':
    case 'sea':
    case 'mountain':
    case 'fertile':
    case 'rock':
    case 'center':
      return null;
  }
}
