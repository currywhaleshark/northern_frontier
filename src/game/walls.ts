import type { BuildingTypeId, GameState } from './types';

export interface WallConnections {
  n: boolean;
  e: boolean;
  s: boolean;
  w: boolean;
}

export interface WallAdjacentTypes {
  n?: BuildingTypeId;
  e?: BuildingTypeId;
  s?: BuildingTypeId;
  w?: BuildingTypeId;
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

export function builtWallTileMap(state: Pick<GameState, 'buildings'>): Map<string, BuildingTypeId> {
  const tiles = new Map<string, BuildingTypeId>();
  for (const building of state.buildings) {
    if (building.built && isWallBuilding(building.type)) {
      tiles.set(wallTileKey(building.x, building.y), building.type);
    }
  }
  return tiles;
}

export function builtWallTileSet(state: Pick<GameState, 'buildings'>): Set<string> {
  return new Set(builtWallTileMap(state).keys());
}

export function wallConnectionsFromMap(
  wallTiles: ReadonlyMap<string, BuildingTypeId>,
  x: number,
  y: number,
): WallConnections {
  return {
    n: wallTiles.has(wallTileKey(x, y - 1)),
    e: wallTiles.has(wallTileKey(x + 1, y)),
    s: wallTiles.has(wallTileKey(x, y + 1)),
    w: wallTiles.has(wallTileKey(x - 1, y)),
  };
}

export function wallConnectionsFromSet(wallTiles: ReadonlySet<string>, x: number, y: number): WallConnections {
  return {
    n: wallTiles.has(wallTileKey(x, y - 1)),
    e: wallTiles.has(wallTileKey(x + 1, y)),
    s: wallTiles.has(wallTileKey(x, y + 1)),
    w: wallTiles.has(wallTileKey(x - 1, y)),
  };
}

export function wallAdjacentTypesFromMap(
  wallTiles: ReadonlyMap<string, BuildingTypeId>,
  x: number,
  y: number,
): WallAdjacentTypes {
  return {
    n: wallTiles.get(wallTileKey(x, y - 1)),
    e: wallTiles.get(wallTileKey(x + 1, y)),
    s: wallTiles.get(wallTileKey(x, y + 1)),
    w: wallTiles.get(wallTileKey(x - 1, y)),
  };
}

export function wallConnectionsAt(state: Pick<GameState, 'buildings'>, x: number, y: number): WallConnections {
  return wallConnectionsFromMap(builtWallTileMap(state), x, y);
}

export function wallAdjacentTypesAt(state: Pick<GameState, 'buildings'>, x: number, y: number): WallAdjacentTypes {
  return wallAdjacentTypesFromMap(builtWallTileMap(state), x, y);
}
