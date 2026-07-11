import type { BuildingTypeId, Season } from '../game/types';

export const SPECIALIZED_BUILDING_SHEET = {
  tileSize: 28,
  spriteHeight: 40,
  columns: 6,
  rows: 2,
  src: '/assets/specialized-buildings-v1.png',
} as const;

export const SPECIALIZED_LARGE_BUILDING_SHEET = {
  tileSize: 56,
  spriteHeight: 80,
  columns: 6,
  rows: 2,
  src: '/assets/specialized-buildings-large-v1.png',
} as const;

const COLUMNS: Partial<Record<BuildingTypeId, number>> = {
  lumberCamp: 0,
  woodShed: 1,
  field: 2,
  paddy: 3,
  tannery: 4,
  weavingHouse: 5,
};

export function isSpecializedBuildingType(type: BuildingTypeId): boolean {
  return COLUMNS[type] != null;
}

export function specializedBuildingSourceRect(type: BuildingTypeId, season: Season, large = false) {
  const column = COLUMNS[type];
  if (column == null) return null;
  const sheet = large ? SPECIALIZED_LARGE_BUILDING_SHEET : SPECIALIZED_BUILDING_SHEET;
  return {
    sx: column * sheet.tileSize,
    sy: (season === 'winter' ? 1 : 0) * sheet.spriteHeight,
    sw: sheet.tileSize,
    sh: sheet.spriteHeight,
  };
}
