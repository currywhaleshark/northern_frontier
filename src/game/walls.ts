import type { BuildingTypeId, GameState } from './types';

export interface WallConnections {
  n: boolean;
  e: boolean;
  s: boolean;
  w: boolean;
}

export const WALL_BUILDING_TYPES = [
  'palisade',
  'earthFort',
  'stoneWall',
  'gate',
] as const satisfies readonly BuildingTypeId[];

const WALL_BUILDING_SET: ReadonlySet<BuildingTypeId> = new Set(WALL_BUILDING_TYPES);
const SOLID_WALL_BUILDING_SET: ReadonlySet<BuildingTypeId> = new Set([
  'palisade',
  'earthFort',
  'stoneWall',
]);

export function isWallBuilding(type: BuildingTypeId): boolean {
  return WALL_BUILDING_SET.has(type);
}

export function isSolidWallBuilding(type: BuildingTypeId): boolean {
  return SOLID_WALL_BUILDING_SET.has(type);
}

export function isGateBuilding(type: BuildingTypeId): boolean {
  return type === 'gate';
}

export function wallTileKey(x: number, y: number): string {
  return `${x},${y}`;
}

export function builtWallTileSet(state: Pick<GameState, 'buildings'>): Set<string> {
  const tiles = new Set<string>();
  for (const building of state.buildings) {
    if (building.built && isWallBuilding(building.type)) {
      tiles.add(wallTileKey(building.x, building.y));
    }
  }
  return tiles;
}

export function wallConnectionsFromSet(wallTiles: ReadonlySet<string>, x: number, y: number): WallConnections {
  return {
    n: wallTiles.has(wallTileKey(x, y - 1)),
    e: wallTiles.has(wallTileKey(x + 1, y)),
    s: wallTiles.has(wallTileKey(x, y + 1)),
    w: wallTiles.has(wallTileKey(x - 1, y)),
  };
}

export function wallConnectionsAt(state: Pick<GameState, 'buildings'>, x: number, y: number): WallConnections {
  return wallConnectionsFromSet(builtWallTileSet(state), x, y);
}
