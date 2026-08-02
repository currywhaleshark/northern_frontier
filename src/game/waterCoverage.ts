import { buildingFootprintDims } from './buildings';
import { CONFIG } from './config';
import { flowingCanalTileSet } from './irrigation';
import { isNaturalWaterTerrain } from './terrain';
import type { Building, GameState } from './types';

export interface NaturalWaterCoverage {
  river: Set<string>;
  lake: Set<string>;
  canal: Set<string>;
}

export function waterCoverageTileKey(x: number, y: number): string {
  return `${x},${y}`;
}

function addCoverageAround(
  coverage: Set<string>,
  state: Pick<GameState, 'map'>,
  originX: number,
  originY: number,
  radius: number,
): void {
  const limit = Math.max(0, Math.floor(radius));
  for (let dy = -limit; dy <= limit; dy++) {
    const span = limit - Math.abs(dy);
    for (let dx = -span; dx <= span; dx++) {
      if (state.map[originY + dy]?.[originX + dx]) {
        coverage.add(waterCoverageTileKey(originX + dx, originY + dy));
      }
    }
  }
}

export function naturalWaterCoverageTileSets(
  state: Pick<GameState, 'map' | 'buildings'>,
): NaturalWaterCoverage {
  const river = new Set<string>();
  const lake = new Set<string>();
  for (let y = 0; y < state.map.length; y++) {
    const row = state.map[y];
    for (let x = 0; x < row.length; x++) {
      if (row[x].terrain === 'river') {
        addCoverageAround(river, state, x, y, CONFIG.water.riverCoverageRadius);
      }
      if (row[x].terrain === 'lake') {
        addCoverageAround(lake, state, x, y, CONFIG.water.riverCoverageRadius);
      }
    }
  }

  const canal = new Set<string>();
  for (const tileKey of flowingCanalTileSet(state)) {
    const separator = tileKey.indexOf(',');
    const x = Number(tileKey.slice(0, separator));
    const y = Number(tileKey.slice(separator + 1));
    addCoverageAround(canal, state, x, y, CONFIG.water.canalCoverageRadius);
  }
  for (const tileKey of river) canal.delete(tileKey);
  for (const tileKey of lake) canal.delete(tileKey);
  return { river, lake, canal };
}

export function buildingTouchesWaterCoverage(
  building: Pick<Building, 'type' | 'x' | 'y' | 'w' | 'h'>,
  coverage: ReadonlySet<string>,
): boolean {
  const { w, h } = buildingFootprintDims(building);
  for (let y = building.y; y < building.y + h; y++) {
    for (let x = building.x; x < building.x + w; x++) {
      if (coverage.has(waterCoverageTileKey(x, y))) return true;
    }
  }
  return false;
}

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

/** 강·호수 모두 생활·관개용 자연 급수권이다. */
export function nearestNaturalWaterDistance(
  state: Pick<GameState, 'map'>,
  x: number,
  y: number,
  maxDistance = CONFIG.water.riverCoverageRadius,
): number | null {
  const limit = Math.max(0, Math.floor(maxDistance));
  for (let distance = 0; distance <= limit; distance++) {
    for (let dy = -distance; dy <= distance; dy++) {
      const dx = distance - Math.abs(dy);
      const rightTerrain = state.map[y + dy]?.[x + dx]?.terrain;
      if (rightTerrain && isNaturalWaterTerrain(rightTerrain)) return distance;
      const leftTerrain = dx > 0 ? state.map[y + dy]?.[x - dx]?.terrain : undefined;
      if (leftTerrain && isNaturalWaterTerrain(leftTerrain)) return distance;
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

export function buildingHasNaturalWaterAccess(
  state: Pick<GameState, 'map'>,
  building: Pick<Building, 'type' | 'x' | 'y' | 'w' | 'h'>,
  radius = CONFIG.water.riverCoverageRadius,
): boolean {
  const { w, h } = buildingFootprintDims(building);
  for (let y = building.y; y < building.y + h; y++) {
    for (let x = building.x; x < building.x + w; x++) {
      if (nearestNaturalWaterDistance(state, x, y, radius) != null) return true;
    }
  }
  return false;
}

export function buildingHasCanalWaterAccess(
  state: Pick<GameState, 'map' | 'buildings'>,
  building: Pick<Building, 'type' | 'x' | 'y' | 'w' | 'h'>,
): boolean {
  return buildingTouchesWaterCoverage(
    building,
    naturalWaterCoverageTileSets(state).canal,
  );
}
