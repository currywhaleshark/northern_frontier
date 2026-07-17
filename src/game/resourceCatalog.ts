import type { ResourceId } from './types';

export type ResourceCategory =
  | 'food'
  | 'fuel'
  | 'clothing'
  | 'material'
  | 'military'
  | 'luxury'
  | 'currency'
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

export const FOOD_RESOURCES = [
  'grain', 'meat', 'eggs', 'milk', 'fish', 'vegetables', 'kimchi', 'beans', 'jang', 'curedMeat', 'saltedFish', 'driedFish',
] as const satisfies readonly ResourceId[];
export const FUEL_RESOURCES = ['brushwood', 'firewood', 'charcoal'] as const satisfies readonly ResourceId[];
export const CLOTHING_RESOURCES = ['hideClothes', 'cottonClothes'] as const satisfies readonly ResourceId[];
export const LUXURY_RESOURCES = ['porcelain', 'brassware', 'lacquerware', 'silk', 'preciousMetal'] as const satisfies readonly ResourceId[];

export const RESOURCE_DEFS: Record<ResourceId, ResourceDef> = {
  grain: { id: 'grain', name: '곡물', icon: '🌾', category: 'food', foodWeight: 2, tradeBaseValue: 1 },
  rice: { id: 'rice', name: '벼', icon: '🌾', category: 'material', tradeBaseValue: 0.8 },
  meat: { id: 'meat', name: '고기', icon: '🥩', category: 'food', foodWeight: 1, tradeBaseValue: 1.6 },
  eggs: { id: 'eggs', name: '달걀', icon: '🥚', category: 'food', foodWeight: 1, tradeBaseValue: 1.5 },
  milk: { id: 'milk', name: '젖', icon: '🥛', category: 'food', foodWeight: 1, tradeBaseValue: 1.7 },
  fish: { id: 'fish', name: '생선', icon: '🐟', category: 'food', foodWeight: 1, tradeBaseValue: 1.3 },
  curedMeat: { id: 'curedMeat', name: '보존육', icon: '🍖', category: 'food', foodWeight: 1, tradeBaseValue: 2.4 },
  saltedFish: { id: 'saltedFish', name: '자반', icon: '🐟', category: 'food', foodWeight: 1, tradeBaseValue: 2.2 },
  driedFish: { id: 'driedFish', name: '건어물', icon: '🐠', category: 'food', foodWeight: 1, tradeBaseValue: 2 },
  vegetables: { id: 'vegetables', name: '채소', icon: '🥬', category: 'food', foodWeight: 1, tradeBaseValue: 1.1 },
  kimchi: { id: 'kimchi', name: '김치', icon: '🥬', category: 'food', foodWeight: 1, tradeBaseValue: 2.6 },
  beans: { id: 'beans', name: '콩', icon: '🫘', category: 'food', foodWeight: 0.5, tradeBaseValue: 1.2 },
  jang: { id: 'jang', name: '장', icon: '🥣', category: 'food', foodWeight: 0.5, tradeBaseValue: 3.4 },
  salt: { id: 'salt', name: '소금', icon: '🧂', category: 'material', tradeBaseValue: 1.8 },
  brushwood: { id: 'brushwood', name: '땔나무', icon: '🪵', category: 'fuel', fuelValue: 0.6, tradeBaseValue: 0.5 },
  firewood: { id: 'firewood', name: '장작', icon: '🔥', category: 'fuel', fuelValue: 1, tradeBaseValue: 0.9 },
  charcoal: { id: 'charcoal', name: '숯', icon: '⚫', category: 'fuel', fuelValue: 1.5, tradeBaseValue: 1.4 },
  wood: { id: 'wood', name: '목재', icon: '🪵', category: 'material', tradeBaseValue: 1 },
  stone: { id: 'stone', name: '돌', icon: '🪨', category: 'material', tradeBaseValue: 0.8 },
  iron: { id: 'iron', name: '철', icon: '⛏️', category: 'material', tradeBaseValue: 2.4 },
  tools: { id: 'tools', name: '도구', icon: '🔨', category: 'material', tradeBaseValue: 4 },
  onggi: { id: 'onggi', name: '옹기', icon: '🏺', category: 'material', tradeBaseValue: 4 },
  carts: { id: 'carts', name: '수레', icon: '🛒', category: 'material', tradeBaseValue: 16 },
  hide: { id: 'hide', name: '가죽', icon: '🦌', category: 'material', tradeBaseValue: 1.8 },
  hideClothes: { id: 'hideClothes', name: '가죽옷', icon: '🧥', category: 'clothing', clothingValue: 1.1, tradeBaseValue: 3.4 },
  cotton: { id: 'cotton', name: '목화', icon: '☁️', category: 'material', tradeBaseValue: 1.7 },
  wool: { id: 'wool', name: '양털', icon: '🧶', category: 'material', tradeBaseValue: 2 },
  hay: { id: 'hay', name: '건초', icon: '🌾', category: 'material', tradeBaseValue: 0.6 },
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
  // 은은 사치 만족 집계(LUXURY_RESOURCES)에 넣지 않는다 — 쓰는 사치품이 아니라 쌓는 결제 수단.
  silver: { id: 'silver', name: '은', icon: '🥈', category: 'currency', tradeBaseValue: 8 },
  reputation: { id: 'reputation', name: '명성', icon: '📜', category: 'abstract', tradeBaseValue: 0 },
  defense: { id: 'defense', name: '방어도', icon: '🛡️', category: 'abstract', tradeBaseValue: 0 },
};

export const RESOURCE_IDS = Object.keys(RESOURCE_DEFS) as ResourceId[];

export const RESOURCE_ORDER: ResourceId[] = [
  'grain', 'rice', 'meat', 'eggs', 'milk', 'fish', 'curedMeat', 'saltedFish', 'driedFish', 'vegetables', 'kimchi', 'beans', 'jang',
  'brushwood', 'firewood', 'charcoal',
  'wood', 'stone', 'iron', 'tools', 'onggi', 'carts', 'hide', 'cotton', 'wool', 'hay', 'herbs', 'salt',
  'hideClothes', 'cottonClothes',
  'porcelain', 'brassware', 'lacquerware', 'silk', 'preciousMetal', 'silver',
  'gunpowder', 'spears', 'hornBows', 'muskets', 'reputation', 'defense',
];
