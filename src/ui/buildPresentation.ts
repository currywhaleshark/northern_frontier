import { BUILD_MENU_ORDER } from '../game/buildings';
import type { BuildingTypeId } from '../game/types';
import type { UiIconName } from './uiIconAssets';

export type BuildableBuildingTypeId = Exclude<BuildingTypeId, 'center'>;

export const BUILD_CATEGORY_IDS = ['housing', 'production', 'farming', 'defense', 'special'] as const;
export type BuildCategoryId = typeof BUILD_CATEGORY_IDS[number];

export const DEFAULT_BUILD_CATEGORY: BuildCategoryId = 'housing';

export const BUILD_CATEGORY_BY_TYPE = {
  hut: 'housing',
  ondol: 'housing',
  tileHouse: 'housing',
  storehouse: 'housing',
  cellar: 'housing',
  bridge: 'housing',
  smokehouse: 'production',
  dryingRack: 'production',
  onggiKiln: 'production',
  jangdokdae: 'production',
  lumberCamp: 'production',
  woodShed: 'production',
  huntLodge: 'production',
  herbHut: 'production',
  clinic: 'special',
  mine: 'production',
  ferry: 'production',
  charcoalKiln: 'production',
  watermill: 'production',
  smithy: 'production',
  tannery: 'production',
  weavingHouse: 'production',
  field: 'farming',
  paddy: 'farming',
  stable: 'farming',
  palisade: 'defense',
  earthFort: 'defense',
  stoneWall: 'defense',
  gate: 'defense',
  watchtower: 'defense',
  beacon: 'defense',
  garrison: 'defense',
  cannonEmplacement: 'defense',
  nitreYard: 'special',
  dock: 'special',
  market: 'special',
  office: 'special',
  cemetery: 'special',
  school: 'special',
  shrine: 'special',
  hermitage: 'special',
} as const satisfies Record<BuildableBuildingTypeId, BuildCategoryId>;

export interface BuildCategory {
  id: BuildCategoryId;
  label: string;
  icon: UiIconName;
  types: readonly BuildableBuildingTypeId[];
}

export interface BuildDrawerState {
  openCategory: BuildCategoryId | null;
  restoreCategory: BuildCategoryId | null;
}

export function closedBuildDrawerState(): BuildDrawerState {
  return { openCategory: null, restoreCategory: null };
}

export function toggleBuildDrawerCategory(
  state: BuildDrawerState,
  category: BuildCategoryId,
): BuildDrawerState {
  return {
    ...state,
    openCategory: state.openCategory === category ? null : category,
  };
}

export function beginBuildPlacement(
  state: BuildDrawerState,
  category: BuildCategoryId,
): BuildDrawerState {
  return { ...state, openCategory: null, restoreCategory: category };
}

export function finishBuildPlacement(
  state: BuildDrawerState,
  fallbackCategory: BuildCategoryId,
): BuildDrawerState {
  return {
    openCategory: state.restoreCategory ?? fallbackCategory,
    restoreCategory: null,
  };
}

const BUILD_CATEGORY_META: ReadonlyArray<Omit<BuildCategory, 'types'>> = [
  { id: 'housing', label: '주거', icon: 'buildHousing' },
  { id: 'production', label: '생산', icon: 'buildProduction' },
  { id: 'farming', label: '농사', icon: 'buildFarming' },
  { id: 'defense', label: '방어', icon: 'buildDefense' },
  { id: 'special', label: '특수', icon: 'buildSpecial' },
];

export const BUILD_CATEGORIES: readonly BuildCategory[] = BUILD_CATEGORY_META.map(category => ({
  ...category,
  types: BUILD_MENU_ORDER.filter(
    (type): type is BuildableBuildingTypeId => type !== 'center' && BUILD_CATEGORY_BY_TYPE[type] === category.id,
  ),
}));

export function isBuildCategoryId(value: unknown): value is BuildCategoryId {
  return typeof value === 'string' && (BUILD_CATEGORY_IDS as readonly string[]).includes(value);
}

export function isBuildableBuildingType(value: BuildingTypeId): value is BuildableBuildingTypeId {
  return value !== 'center' && Object.prototype.hasOwnProperty.call(BUILD_CATEGORY_BY_TYPE, value);
}

export function buildCategoryFor(type: BuildableBuildingTypeId): BuildCategoryId {
  return BUILD_CATEGORY_BY_TYPE[type];
}
