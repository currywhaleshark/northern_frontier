import { clothingCoverageTotal, foodTotal, fuelHeatTotal } from '../game/consumption';
import { RESOURCE_ORDER } from '../game/resourceCatalog';
import type { ResourceIconId } from '../game/tradePresentation';
import type { GameState, ResourceId } from '../game/types';

export const METRIC_RESOURCE_IDS = ['reputation', 'defense'] as const satisfies readonly ResourceId[];

export type MetricResourceId = typeof METRIC_RESOURCE_IDS[number];
export type StockResourceId = Exclude<ResourceId, MetricResourceId>;

export const RESOURCE_DISPLAY_GROUP_IDS = [
  'food',
  'fuel',
  'clothing',
  'materials',
  'military',
  'luxury',
  'valuables',
] as const;

export type ResourceDisplayGroupId = typeof RESOURCE_DISPLAY_GROUP_IDS[number];

export const RESOURCE_DISPLAY_GROUP_BY_RESOURCE = {
  grain: 'food',
  rice: 'food',
  meat: 'food',
  eggs: 'food',
  fish: 'food',
  curedMeat: 'food',
  saltedFish: 'food',
  driedFish: 'food',
  beans: 'food',
  jang: 'food',
  vegetables: 'food',
  kimchi: 'food',
  brushwood: 'fuel',
  firewood: 'fuel',
  charcoal: 'fuel',
  hideClothes: 'clothing',
  cottonClothes: 'clothing',
  wood: 'materials',
  stone: 'materials',
  iron: 'materials',
  tools: 'materials',
  onggi: 'materials',
  carts: 'materials',
  hide: 'materials',
  cotton: 'materials',
  herbs: 'materials',
  salt: 'materials',
  gunpowder: 'military',
  spears: 'military',
  hornBows: 'military',
  muskets: 'military',
  porcelain: 'luxury',
  brassware: 'luxury',
  lacquerware: 'luxury',
  silk: 'luxury',
  preciousMetal: 'valuables',
} as const satisfies Record<StockResourceId, ResourceDisplayGroupId>;

export function isStockResourceId(value: unknown): value is StockResourceId {
  return typeof value === 'string'
    && Object.prototype.hasOwnProperty.call(RESOURCE_DISPLAY_GROUP_BY_RESOURCE, value);
}

export function isResourceDisplayGroupId(value: unknown): value is ResourceDisplayGroupId {
  return typeof value === 'string'
    && (RESOURCE_DISPLAY_GROUP_IDS as readonly string[]).includes(value);
}

export const STOCK_RESOURCE_ORDER = RESOURCE_ORDER.filter(isStockResourceId);

export interface ResourceDisplayGroup {
  id: ResourceDisplayGroupId;
  title: string;
  icon: ResourceIconId;
  resources: readonly StockResourceId[];
}

const RESOURCE_DISPLAY_GROUP_META: ReadonlyArray<Omit<ResourceDisplayGroup, 'resources'>> = [
  { id: 'food', title: '식량', icon: 'foodGroup' },
  { id: 'fuel', title: '땔감', icon: 'fuelGroup' },
  { id: 'clothing', title: '의복', icon: 'clothingGroup' },
  { id: 'materials', title: '자재', icon: 'wood' },
  { id: 'military', title: '군수', icon: 'spears' },
  { id: 'luxury', title: '사치품', icon: 'luxuryGroup' },
  { id: 'valuables', title: '가치재', icon: 'preciousMetal' },
];

export const RESOURCE_DISPLAY_GROUPS: readonly ResourceDisplayGroup[] = RESOURCE_DISPLAY_GROUP_META.map(group => ({
  ...group,
  resources: STOCK_RESOURCE_ORDER.filter(resource => RESOURCE_DISPLAY_GROUP_BY_RESOURCE[resource] === group.id),
}));

export const DISPLAY_RESOURCE_ORDER: readonly StockResourceId[] = RESOURCE_DISPLAY_GROUPS
  .flatMap(group => group.resources);

const RESOURCE_DISPLAY_GROUP_BY_ID = Object.fromEntries(
  RESOURCE_DISPLAY_GROUPS.map(group => [group.id, group]),
) as Record<ResourceDisplayGroupId, ResourceDisplayGroup>;

type ResourceLowRule = (amount: number, state: GameState, population: number) => boolean;

// 품목 경고는 표시 정책이다. 새 품목별 기준은 이 표에만 추가한다.
const RESOURCE_LOW_RULES: Partial<Record<StockResourceId, ResourceLowRule>> = {
  tools: amount => amount < 3,
};

export function isResourceLow(state: GameState, resource: StockResourceId, population: number): boolean {
  return RESOURCE_LOW_RULES[resource]?.(state.resources[resource], state, population) ?? false;
}

export function resourceDisplayGroupTotal(state: GameState, groupId: ResourceDisplayGroupId): number {
  switch (groupId) {
    case 'food': return foodTotal(state);
    case 'fuel': return fuelHeatTotal(state);
    case 'clothing': return clothingCoverageTotal(state);
    default:
      return RESOURCE_DISPLAY_GROUP_BY_ID[groupId].resources
        .reduce((total, resource) => total + Math.max(0, state.resources[resource] ?? 0), 0);
  }
}

export function isResourceDisplayGroupLow(
  state: GameState,
  groupId: ResourceDisplayGroupId,
  population: number,
): boolean {
  if (groupId === 'food') return resourceDisplayGroupTotal(state, groupId) < population * 3;
  if (groupId === 'fuel') return resourceDisplayGroupTotal(state, groupId) < population * 2;
  if (groupId === 'clothing') return resourceDisplayGroupTotal(state, groupId) < population * 0.5;
  return RESOURCE_DISPLAY_GROUP_BY_ID[groupId].resources
    .some(resource => isResourceLow(state, resource, population));
}
