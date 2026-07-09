import { CONFIG } from './config';
import type { Building, BuildingTypeId, CropId, ResourceId, Season } from './types';

export interface CropDef {
  id: CropId;
  name: string;
  desc: string;
  buildingTypes: readonly Extract<BuildingTypeId, 'field' | 'paddy'>[];
  plantSeasons: readonly Season[];
  growSeasons: readonly Season[];
  harvestSeasons: readonly Season[];
  output: ResourceId;
  yield: number;
  survivesWinter: boolean;
}

export const CROP_DEFS: Record<CropId, CropDef> = {
  millet: {
    id: 'millet',
    name: '조',
    desc: '초반 주식. 그대로 먹을 수 있고 세공에도 쓸 수 있지만 소출은 낮습니다.',
    buildingTypes: ['field'],
    plantSeasons: ['spring'],
    growSeasons: ['spring', 'summer'],
    harvestSeasons: ['autumn'],
    output: 'grain',
    yield: CONFIG.production.fieldGrainYield * 0.65,
    survivesWinter: false,
  },
  sorghum: {
    id: 'sorghum',
    name: '수수',
    desc: '조보다 소출이 조금 높은 밭 곡물입니다.',
    buildingTypes: ['field'],
    plantSeasons: ['spring'],
    growSeasons: ['spring', 'summer'],
    harvestSeasons: ['autumn'],
    output: 'grain',
    yield: CONFIG.production.fieldGrainYield * 0.78,
    survivesWinter: false,
  },
  buckwheat: {
    id: 'buckwheat',
    name: '메밀',
    desc: '여름에 넣어 가을에 거둘 수 있는 짧은 밭 곡물입니다.',
    buildingTypes: ['field'],
    plantSeasons: ['summer'],
    growSeasons: ['summer'],
    harvestSeasons: ['autumn'],
    output: 'grain',
    yield: CONFIG.production.fieldGrainYield * 0.55,
    survivesWinter: false,
  },
  barley: {
    id: 'barley',
    name: '보리',
    desc: '가을에 뿌려 겨울을 넘기고 이른 수확을 노리는 밭 곡물입니다.',
    buildingTypes: ['field'],
    plantSeasons: ['autumn'],
    growSeasons: ['autumn', 'spring', 'summer'],
    harvestSeasons: ['summer'],
    output: 'grain',
    yield: CONFIG.production.fieldGrainYield * 0.72,
    survivesWinter: true,
  },
  rice: {
    id: 'rice',
    name: '벼',
    desc: '논에서만 기르는 고효율 곡물. 방앗간에서 찧으면 더 많은 식량이 됩니다.',
    buildingTypes: ['paddy'],
    plantSeasons: ['spring', 'summer'],
    growSeasons: ['spring', 'summer'],
    harvestSeasons: ['autumn'],
    output: 'grain',
    yield: CONFIG.production.fieldGrainYield * 0.95,
    survivesWinter: false,
  },
};

export const CROP_ORDER: CropId[] = ['millet', 'sorghum', 'buckwheat', 'barley', 'rice'];

export function defaultCropForBuildingType(type: BuildingTypeId): CropId | null {
  if (type === 'field') return 'millet';
  if (type === 'paddy') return 'rice';
  return null;
}

export function cropIdForBuilding(building: Pick<Building, 'type' | 'cropId'>): CropId | null {
  if (Object.prototype.hasOwnProperty.call(building, 'cropId')) {
    return building.cropId ?? null;
  }
  return defaultCropForBuildingType(building.type);
}

export function allowedCropsForBuilding(type: BuildingTypeId): CropId[] {
  return CROP_ORDER.filter(cropId => CROP_DEFS[cropId].buildingTypes.includes(type as 'field' | 'paddy'));
}

export function isCropAllowedOnBuilding(cropId: CropId, type: BuildingTypeId): boolean {
  return CROP_DEFS[cropId].buildingTypes.includes(type as 'field' | 'paddy');
}

export function canPlantCropNow(cropId: CropId, type: BuildingTypeId, season: Season): boolean {
  const def = CROP_DEFS[cropId];
  return isCropAllowedOnBuilding(cropId, type) && def.plantSeasons.includes(season);
}

export function canGrowCropNow(cropId: CropId, type: BuildingTypeId, season: Season): boolean {
  const def = CROP_DEFS[cropId];
  return isCropAllowedOnBuilding(cropId, type) && def.growSeasons.includes(season);
}

export function canHarvestCropNow(cropId: CropId, type: BuildingTypeId, season: Season): boolean {
  const def = CROP_DEFS[cropId];
  return isCropAllowedOnBuilding(cropId, type) && def.harvestSeasons.includes(season);
}
