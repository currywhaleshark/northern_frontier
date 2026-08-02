import type { BuildingTypeId, GameState, ResourceId, SolidWallBuildingTypeId } from './types';

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

export function isSolidWallBuilding(type: BuildingTypeId): type is SolidWallBuildingTypeId {
  return SOLID_WALL_BUILDING_SET.has(type);
}

export function isGateBuilding(type: BuildingTypeId): boolean {
  return type === 'gate';
}

export function wallTileKey(x: number, y: number): string {
  return `${x},${y}`;
}

export interface WallLineRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type WallLineAxis = 'horizontal' | 'vertical';

/** 시작점에서 현재점까지 더 많이 움직인 축으로 고정한다. 동률은 마지막으로 움직인 축을 따른다. */
export function wallLineRect(
  ax: number,
  ay: number,
  cx: number,
  cy: number,
  lastAxis: WallLineAxis = 'horizontal',
): WallLineRect {
  const dx = Math.abs(cx - ax);
  const dy = Math.abs(cy - ay);
  const horizontal = dx === dy ? lastAxis === 'horizontal' : dx > dy;
  const endX = horizontal ? cx : ax;
  const endY = horizontal ? ay : cy;
  return {
    x: Math.min(ax, endX),
    y: Math.min(ay, endY),
    w: Math.abs(endX - ax) + 1,
    h: Math.abs(endY - ay) + 1,
  };
}

export function wallLineTiles(
  ax: number,
  ay: number,
  cx: number,
  cy: number,
  lastAxis: WallLineAxis = 'horizontal',
): Array<{ x: number; y: number }> {
  const rect = wallLineRect(ax, ay, cx, cy, lastAxis);
  const tiles: Array<{ x: number; y: number }> = [];
  for (let dy = 0; dy < rect.h; dy++) {
    for (let dx = 0; dx < rect.w; dx++) tiles.push({ x: rect.x + dx, y: rect.y + dy });
  }
  return tiles;
}

export const GATE_CONVERSION_COSTS: Readonly<Record<SolidWallBuildingTypeId, Partial<Record<ResourceId, number>>>> = {
  palisade: { wood: 1 },
  earthFort: { wood: 3, tools: 1 },
  stoneWall: { wood: 4, iron: 1, tools: 1 },
};

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
