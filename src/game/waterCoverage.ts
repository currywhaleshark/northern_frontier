import { buildingFootprintDims } from './buildings';
import { CONFIG } from './config';
import type { Building, GameState } from './types';

export function nearestRiverDistance(
  state: Pick<GameState, 'map'>,
  x: number,
  y: number,
  maxDistance = CONFIG.water.riverCoverageRadius,
): number | null {
  const limit = Math.max(0, Math.floor(maxDistance));
  for (let distance = 0; distance <= limit; distance++) {
    for (let dy = -distance; dy <= distance; dy++) {
      const dx = distance - Math.abs(dy);
      if (state.map[y + dy]?.[x + dx]?.terrain === 'river') return distance;
      if (dx > 0 && state.map[y + dy]?.[x - dx]?.terrain === 'river') return distance;
    }
  }
  return null;
}

export function buildingHasRiverWaterAccess(
  state: Pick<GameState, 'map'>,
  building: Pick<Building, 'type' | 'x' | 'y' | 'w' | 'h'>,
  radius = CONFIG.water.riverCoverageRadius,
): boolean {
  const { w, h } = buildingFootprintDims(building);
  for (let y = building.y; y < building.y + h; y++) {
    for (let x = building.x; x < building.x + w; x++) {
      if (nearestRiverDistance(state, x, y, radius) != null) return true;
    }
  }
  return false;
}
