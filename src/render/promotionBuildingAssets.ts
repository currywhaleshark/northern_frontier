import type { BuildingTypeId, Season } from '../game/types';

export const PROMOTION_BUILDING_TYPES = [
  'tileHouse',
  'bridge',
  'mine',
  'ferry',
  'charcoalKiln',
  'stable',
  'nitreYard',
  'dock',
  'earthFort',
  'stoneWall',
  'office',
  'cannonEmplacement',
] as const satisfies readonly BuildingTypeId[];

export const PROMOTION_BUILDING_SHEET = {
  tileSize: 28,
  spriteHeight: 40,
  columns: PROMOTION_BUILDING_TYPES.length,
  rows: 2,
  src: '/assets/promotion-buildings-generated-v1.png',
} as const;

export const PROMOTION_LARGE_BUILDING_SHEET = {
  tileSize: 56,
  spriteHeight: 80,
  columns: PROMOTION_BUILDING_TYPES.length,
  rows: 2,
  src: '/assets/promotion-buildings-generated-large-v1.png',
} as const;

const PROMOTION_BUILDING_COLUMNS: Partial<Record<BuildingTypeId, number>> = Object.fromEntries(
  PROMOTION_BUILDING_TYPES.map((type, index) => [type, index]),
) as Partial<Record<BuildingTypeId, number>>;

// 지자총통 포대는 신규 시트를 만들기 전 불랑기포대의 표준·HD 승격 셀을 그대로 사용한다.
PROMOTION_BUILDING_COLUMNS.chongtongEmplacement = PROMOTION_BUILDING_COLUMNS.cannonEmplacement;

export function isPromotionBuildingType(type: BuildingTypeId): boolean {
  return PROMOTION_BUILDING_COLUMNS[type] != null;
}

export function promotionBuildingSourceRect(type: BuildingTypeId, season: Season) {
  const col = PROMOTION_BUILDING_COLUMNS[type];
  if (col == null) return null;
  const tile = PROMOTION_BUILDING_SHEET.tileSize;
  const height = PROMOTION_BUILDING_SHEET.spriteHeight;
  return {
    sx: col * tile,
    sy: season === 'winter' ? height : 0,
    sw: tile,
    sh: height,
  };
}

export function promotionLargeBuildingSourceRect(type: BuildingTypeId, season: Season) {
  const col = PROMOTION_BUILDING_COLUMNS[type];
  if (col == null) return null;
  const tile = PROMOTION_LARGE_BUILDING_SHEET.tileSize;
  const height = PROMOTION_LARGE_BUILDING_SHEET.spriteHeight;
  return {
    sx: col * tile,
    sy: season === 'winter' ? height : 0,
    sw: tile,
    sh: height,
  };
}
