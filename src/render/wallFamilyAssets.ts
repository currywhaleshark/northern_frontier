import type { BuildingTypeId, Season } from '../game/types';
import type { WallConnections } from '../game/walls';

export const WALL_FAMILY_WALL_TYPES = [
  'palisade',
  'earthFort',
  'stoneWall',
] as const satisfies readonly BuildingTypeId[];

export const WALL_MODULAR_PIECES = [
  'pillar',
  'horizontal',
  'vertical',
] as const;

export type WallFamilyWallType = typeof WALL_FAMILY_WALL_TYPES[number];
export type WallModularPiece = typeof WALL_MODULAR_PIECES[number];
export type WallVisualMaterial = 'wood' | 'earth' | 'stone';

export const WALL_FAMILY_SHEET = {
  tileSize: 28,
  spriteHeight: 40,
  columns: 3,
  rows: 6,
  src: '/assets/wall-family-modular-v1.png',
} as const;

const WALL_FAMILY_WALL_TYPE_SET: ReadonlySet<BuildingTypeId> = new Set(WALL_FAMILY_WALL_TYPES);

const MATERIAL_BY_TYPE: Record<WallFamilyWallType, WallVisualMaterial> = {
  palisade: 'wood',
  earthFort: 'earth',
  stoneWall: 'stone',
};

const NORMAL_ROWS: Record<WallFamilyWallType, number> = {
  palisade: 0,
  earthFort: 1,
  stoneWall: 2,
};

const PIECE_COLUMNS: Record<WallModularPiece, number> = {
  pillar: 0,
  horizontal: 1,
  vertical: 2,
};

const WINTER_ROW_OFFSET = 3;

export function isWallFamilyWallType(type: BuildingTypeId): type is WallFamilyWallType {
  return WALL_FAMILY_WALL_TYPE_SET.has(type);
}

export function wallVisualMaterial(type: WallFamilyWallType): WallVisualMaterial {
  return MATERIAL_BY_TYPE[type];
}

export function modularWallPiece(connections?: WallConnections): WallModularPiece {
  if (!connections) return 'pillar';

  const horizontal = connections.e && connections.w;
  const vertical = connections.n && connections.s;
  const horizontalOnly = horizontal && !connections.n && !connections.s;
  const verticalOnly = vertical && !connections.e && !connections.w;

  if (horizontalOnly) return 'horizontal';
  if (verticalOnly) return 'vertical';
  return 'pillar';
}

export function wallFamilyPieceSourceRect(
  type: WallFamilyWallType,
  piece: WallModularPiece,
  season: Season,
) {
  const row = NORMAL_ROWS[type] + (season === 'winter' ? WINTER_ROW_OFFSET : 0);
  const col = PIECE_COLUMNS[piece];
  return {
    sx: col * WALL_FAMILY_SHEET.tileSize,
    sy: row * WALL_FAMILY_SHEET.spriteHeight,
    sw: WALL_FAMILY_SHEET.tileSize,
    sh: WALL_FAMILY_SHEET.spriteHeight,
  };
}

export function wallFamilySourceRect(
  type: WallFamilyWallType,
  connections: WallConnections | undefined,
  season: Season,
) {
  return wallFamilyPieceSourceRect(type, modularWallPiece(connections), season);
}
