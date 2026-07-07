import type { BuildingTypeId, Season } from '../game/types';

export const GENERATED_BUILDING_SHEET = {
  tileSize: 28,
  spriteHeight: 40,
  columns: 15,
  rows: 3,
  src: '/assets/folk-buildings-generated-v1.png',
} as const;

const BUILDING_COLUMNS: Record<BuildingTypeId, number> = {
  center: 0,
  hut: 1,
  ondol: 2,
  storehouse: 3,
  lumberCamp: 4,
  huntLodge: 5,
  herbHut: 6,
  field: 7,
  smithy: 8,
  tannery: 9,
  beacon: 10,
  palisade: 11,
  watchtower: 12,
  garrison: 13,
  market: 14,
  cannonEmplacement: 12, // 전용 그림이 나오기 전까지 망루 그림을 빌려 쓴다
};

const FIELD_SEASON_COLUMNS: Record<Season, number> = {
  spring: 0,
  summer: 1,
  autumn: 2,
  winter: 3,
};

export function generatedBuildingSourceRect(type: BuildingTypeId, season: Season) {
  const tile = GENERATED_BUILDING_SHEET.tileSize;
  const height = GENERATED_BUILDING_SHEET.spriteHeight;
  const col = type === 'field' ? FIELD_SEASON_COLUMNS[season] : BUILDING_COLUMNS[type];
  const row = type === 'field' ? 2 : season === 'winter' ? 1 : 0;
  return {
    sx: col * tile,
    sy: row * height,
    sw: tile,
    sh: height,
  };
}
