import type { BuildingTypeId } from '../game/types';

export const WATERWORK_BUILDING_SHEETS = {
  standard: {
    tileSize: 28,
    spriteHeight: 28,
    columns: 4,
    src: '/assets/waterworks-buildings-v2.png',
  },
  highDefinition: {
    tileSize: 56,
    spriteHeight: 56,
    columns: 4,
    src: '/assets/waterworks-buildings-hd-v2.png',
  },
} as const;

type WaterworksSheet = typeof WATERWORK_BUILDING_SHEETS.standard | typeof WATERWORK_BUILDING_SHEETS.highDefinition;

export type WaterworksOrientation = 'horizontal' | 'vertical';

const COLUMNS: Readonly<Record<`${'weir' | 'levee'}:${WaterworksOrientation}`, number>> = {
  'weir:horizontal': 0,
  'weir:vertical': 1,
  'levee:horizontal': 2,
  'levee:vertical': 3,
};

export function isWaterworksBuildingType(type: BuildingTypeId): type is 'weir' | 'levee' {
  return type === 'weir' || type === 'levee';
}

export function waterworksBuildingSourceRect(
  type: BuildingTypeId,
  orientation: WaterworksOrientation,
  sheet: WaterworksSheet,
) {
  if (!isWaterworksBuildingType(type)) return null;
  const column = COLUMNS[`${type}:${orientation}`];
  return {
    sx: column * sheet.tileSize,
    sy: 0,
    sw: sheet.tileSize,
    sh: sheet.spriteHeight,
  };
}
