import type { ResourceId } from './types';

export type ResourceCategory =
  | 'food'
  | 'fuel'
  | 'clothing'
  | 'material'
  | 'military'
  | 'luxury'
  | 'abstract';

export interface ResourceDef {
  id: ResourceId;
  name: string;
  icon: string;
  category: ResourceCategory;
  foodWeight?: number;
  fuelValue?: number;
  clothingValue?: number;
  tradeBaseValue: number;
}

export const FOOD_RESOURCES = ['grain', 'meat', 'fish', 'vegetables'] as const satisfies readonly ResourceId[];
export const FUEL_RESOURCES = ['brushwood', 'firewood', 'charcoal'] as const satisfies readonly ResourceId[];
export const CLOTHING_RESOURCES = ['hideClothes', 'cottonClothes'] as const satisfies readonly ResourceId[];
export const LUXURY_RESOURCES = ['porcelain', 'brassware', 'lacquerware', 'silk', 'preciousMetal'] as const satisfies readonly ResourceId[];

export const RESOURCE_DEFS: Record<ResourceId, ResourceDef> = {
  grain: { id: 'grain', name: '곡물', icon: '🌾', category: 'food', foodWeight: 2, tradeBaseValue: 1 },
  rice: { id: 'rice', name: '벼', icon: '🌾', category: 'material', tradeBaseValue: 0.8 },
  meat: { id: 'meat', name: '고기', icon: '🥩', category: 'food', foodWeight: 1, tradeBaseValue: 1.6 },
  fish: { id: 'fish', name: '생선', icon: '🐟', category: 'food', foodWeight: 1, tradeBaseValue: 1.3 },
  vegetables: { id: 'vegetables', name: '채소', icon: '🥬', category: 'food', foodWeight: 1, tradeBaseValue: 1.1 },
  brushwood: { id: 'brushwood', name: '땔나무', icon: '🪵', category: 'fuel', fuelValue: 0.6, tradeBaseValue: 0.5 },
  firewood: { id: 'firewood', name: '장작', icon: '🔥', category: 'fuel', fuelValue: 1, tradeBaseValue: 0.9 },
  charcoal: { id: 'charcoal', name: '숯', icon: '⚫', category: 'fuel', fuelValue: 1.5, tradeBaseValue: 1.4 },
  wood: { id: 'wood', name: '목재', icon: '🪵', category: 'material', tradeBaseValue: 1 },
  stone: { id: 'stone', name: '돌', icon: '🪨', category: 'material', tradeBaseValue: 0.8 },
  iron: { id: 'iron', name: '철', icon: '⛏️', category: 'material', tradeBaseValue: 2.4 },
  tools: { id: 'tools', name: '도구', icon: '🔨', category: 'material', tradeBaseValue: 4 },
  carts: { id: 'carts', name: '수레', icon: '🛒', category: 'material', tradeBaseValue: 16 },
  hide: { id: 'hide', name: '가죽', icon: '🦌', category: 'material', tradeBaseValue: 1.8 },
  hideClothes: { id: 'hideClothes', name: '가죽옷', icon: '🧥', category: 'clothing', clothingValue: 1.1, tradeBaseValue: 3.4 },
  cotton: { id: 'cotton', name: '목화', icon: '☁️', category: 'material', tradeBaseValue: 1.7 },
  cottonClothes: { id: 'cottonClothes', name: '무명옷', icon: '👕', category: 'clothing', clothingValue: 1, tradeBaseValue: 3 },
  herbs: { id: 'herbs', name: '약초', icon: '🌿', category: 'material', tradeBaseValue: 1.5 },
  gunpowder: { id: 'gunpowder', name: '화약', icon: '🧨', category: 'military', tradeBaseValue: 5 },
  spears: { id: 'spears', name: '창', icon: '槍', category: 'military', tradeBaseValue: 3.8 },
  hornBows: { id: 'hornBows', name: '각궁', icon: '弓', category: 'military', tradeBaseValue: 5 },
  muskets: { id: 'muskets', name: '조총', icon: '🔫', category: 'military', tradeBaseValue: 8 },
  porcelain: { id: 'porcelain', name: '자기', icon: '🏺', category: 'luxury', tradeBaseValue: 6 },
  brassware: { id: 'brassware', name: '유기', icon: '🥣', category: 'luxury', tradeBaseValue: 5 },
  lacquerware: { id: 'lacquerware', name: '칠기', icon: '📦', category: 'luxury', tradeBaseValue: 5.5 },
  silk: { id: 'silk', name: '비단', icon: '🧶', category: 'luxury', tradeBaseValue: 7 },
  preciousMetal: { id: 'preciousMetal', name: '귀금속', icon: '💍', category: 'luxury', tradeBaseValue: 9 },
  reputation: { id: 'reputation', name: '명성', icon: '📜', category: 'abstract', tradeBaseValue: 0 },
  defense: { id: 'defense', name: '방어도', icon: '🛡️', category: 'abstract', tradeBaseValue: 0 },
};

export const RESOURCE_IDS = Object.keys(RESOURCE_DEFS) as ResourceId[];

export const RESOURCE_ORDER: ResourceId[] = [
  'grain', 'rice', 'meat', 'fish', 'vegetables',
  'brushwood', 'firewood', 'charcoal',
  'wood', 'stone', 'iron', 'tools', 'carts', 'hide', 'cotton', 'herbs',
  'hideClothes', 'cottonClothes',
  'porcelain', 'brassware', 'lacquerware', 'silk', 'preciousMetal',
  'gunpowder', 'spears', 'hornBows', 'muskets', 'reputation', 'defense',
];
