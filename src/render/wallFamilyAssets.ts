import type { BuildingTypeId, Season } from '../game/types';
import type { WallAdjacentTypes, WallConnections } from '../game/walls';

export const WALL_FAMILY_BUILDING_TYPES = [
  'palisade',
  'earthFort',
  'stoneWall',
  'gate',
] as const satisfies readonly BuildingTypeId[];

export type WallFamilyBuildingType = typeof WALL_FAMILY_BUILDING_TYPES[number];
export type WallFamilyAdjacentTypes = Partial<Record<'n' | 'e' | 's' | 'w', WallFamilyBuildingType>>;
export type WallVisualMaterial = 'wood' | 'earth' | 'stone';

export const WALL_FAMILY_SHEET = {
  tileSize: 28,
  spriteHeight: 40,
  columns: 16,
  rows: 12,
  src: '/assets/wall-family-generated-v1.png',
} as const;

const NORMAL_WALL_ROWS: Record<Exclude<WallFamilyBuildingType, 'gate'>, number> = {
  palisade: 0,
  earthFort: 1,
  stoneWall: 2,
};

const NORMAL_GATE_ROWS: Record<WallVisualMaterial, number> = {
  wood: 3,
  earth: 4,
  stone: 5,
};

const WINTER_ROW_OFFSET = 6;
const WALL_FAMILY_BUILDING_TYPE_SET: ReadonlySet<BuildingTypeId> = new Set(WALL_FAMILY_BUILDING_TYPES);

export function isWallFamilyBuildingType(type: BuildingTypeId): type is WallFamilyBuildingType {
  return WALL_FAMILY_BUILDING_TYPE_SET.has(type);
}

export function toWallFamilyAdjacentTypes(adjacentTypes?: WallAdjacentTypes): WallFamilyAdjacentTypes | undefined {
  if (!adjacentTypes) return undefined;

  const narrowed: WallFamilyAdjacentTypes = {};
  if (adjacentTypes.n && isWallFamilyBuildingType(adjacentTypes.n)) narrowed.n = adjacentTypes.n;
  if (adjacentTypes.e && isWallFamilyBuildingType(adjacentTypes.e)) narrowed.e = adjacentTypes.e;
  if (adjacentTypes.s && isWallFamilyBuildingType(adjacentTypes.s)) narrowed.s = adjacentTypes.s;
  if (adjacentTypes.w && isWallFamilyBuildingType(adjacentTypes.w)) narrowed.w = adjacentTypes.w;
  return narrowed;
}

export function wallConnectionMask(connections?: WallConnections): number {
  if (!connections) return 0;
  return (
    (connections.n ? 1 : 0) +
    (connections.e ? 2 : 0) +
    (connections.s ? 4 : 0) +
    (connections.w ? 8 : 0)
  );
}

export function gateVisualMaterial(adjacentTypes?: WallFamilyAdjacentTypes): WallVisualMaterial {
  const adjacent = [
    adjacentTypes?.n,
    adjacentTypes?.e,
    adjacentTypes?.s,
    adjacentTypes?.w,
  ];
  if (adjacent.includes('stoneWall')) return 'stone';
  if (adjacent.includes('earthFort')) return 'earth';
  return 'wood';
}

function rowFor(type: WallFamilyBuildingType, season: Season, adjacentTypes?: WallFamilyAdjacentTypes): number {
  const seasonOffset = season === 'winter' ? WINTER_ROW_OFFSET : 0;
  if (type === 'gate') {
    return NORMAL_GATE_ROWS[gateVisualMaterial(adjacentTypes)] + seasonOffset;
  }
  return NORMAL_WALL_ROWS[type] + seasonOffset;
}

export function wallFamilySourceRect(
  type: WallFamilyBuildingType,
  connections: WallConnections | undefined,
  season: Season,
  adjacentTypes?: WallFamilyAdjacentTypes,
) {
  const col = wallConnectionMask(connections);
  const row = rowFor(type, season, adjacentTypes);
  return {
    sx: col * WALL_FAMILY_SHEET.tileSize,
    sy: row * WALL_FAMILY_SHEET.spriteHeight,
    sw: WALL_FAMILY_SHEET.tileSize,
    sh: WALL_FAMILY_SHEET.spriteHeight,
  };
}
