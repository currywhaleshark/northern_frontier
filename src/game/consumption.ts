import { FOOD_RESOURCES, FUEL_RESOURCES, RESOURCE_DEFS } from './resourceCatalog';
import { clothingCoverageTotal as equippedClothingCoverageTotal } from './wearables';
import type { GameState, ResourceId } from './types';

interface ResourceStockState {
  resources: Partial<Record<ResourceId, number>>;
}

export interface ConsumptionResult {
  totalConsumed: number;
  byResource: Partial<Record<ResourceId, number>>;
  shortageRatio: number;
  varietyScore: number;
  vegetableRatio: number;
}

export const FOOD_VARIETY_GROUPS = [
  { id: 'grain', resources: ['grain'] as const, weight: 2 },
  { id: 'meat', resources: ['meat', 'eggs', 'milk', 'curedMeat'] as const, weight: 1 },
  { id: 'fish', resources: ['fish', 'saltedFish', 'driedFish'] as const, weight: 1 },
  { id: 'vegetables', resources: ['vegetables', 'kimchi'] as const, weight: 1 },
  { id: 'beans', resources: ['beans', 'jang'] as const, weight: 0.5 },
] as const;

const FOOD_CONSUMPTION_ORDER: readonly ResourceId[] = [
  'grain', 'meat', 'eggs', 'milk', 'fish', 'vegetables', 'kimchi', 'beans', 'jang', 'curedMeat', 'saltedFish', 'driedFish',
];

function finitePositive(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function foodTotal(state: ResourceStockState): number {
  return FOOD_RESOURCES.reduce((sum, id) => sum + finitePositive(state.resources[id] ?? 0), 0);
}

export function fuelHeatTotal(state: ResourceStockState): number {
  return FUEL_RESOURCES.reduce(
    (sum, id) => sum + finitePositive(state.resources[id] ?? 0) * (RESOURCE_DEFS[id].fuelValue ?? 0),
    0,
  );
}

export function clothingCoverageTotal(state: GameState): number {
  return equippedClothingCoverageTotal(state);
}

export function luxuryStockTotal(state: GameState): number {
  return (['porcelain', 'brassware', 'lacquerware', 'silk', 'preciousMetal'] as const)
    .reduce((sum, id) => sum + finitePositive(state.resources[id] ?? 0), 0);
}

export function consumeFoodByDiet(state: ResourceStockState, requested: number): ConsumptionResult {
  const amount = finitePositive(requested);
  const byResource: Partial<Record<ResourceId, number>> = {};
  let remaining = amount;
  const totalWeight = FOOD_VARIETY_GROUPS.reduce((sum, group) => sum + group.weight, 0);

  const takeFood = (id: ResourceId, wanted: number): number => {
    const taken = Math.min(finitePositive(state.resources[id] ?? 0), Math.max(0, wanted));
    state.resources[id] = Math.max(0, (state.resources[id] ?? 0) - taken);
    byResource[id] = (byResource[id] ?? 0) + taken;
    remaining = Math.max(0, remaining - taken);
    return taken;
  };

  for (const group of FOOD_VARIETY_GROUPS) {
    let desired = amount * (group.weight / totalWeight);
    for (const id of group.resources) {
      if (desired <= 0) break;
      desired -= takeFood(id, desired);
    }
  }

  if (remaining > 0) {
    for (const id of FOOD_CONSUMPTION_ORDER) {
      if (remaining <= 0.000000001) {
        remaining = 0;
        break;
      }
      takeFood(id, remaining);
    }
  }

  const totalConsumed = Math.max(0, amount - remaining);
  const presentTypes = FOOD_VARIETY_GROUPS.filter(group =>
    group.resources.some(id => (byResource[id] ?? 0) > 0.001)).length;
  const vegetableGroup = FOOD_VARIETY_GROUPS.find(group => group.id === 'vegetables');
  const vegetableTarget = amount * ((vegetableGroup?.weight ?? 1) / totalWeight);
  return {
    totalConsumed,
    byResource,
    shortageRatio: amount > 0 ? totalConsumed / amount : 1,
    varietyScore: presentTypes / FOOD_VARIETY_GROUPS.length,
    vegetableRatio: vegetableTarget > 0
      ? Math.min(1, ((byResource.vegetables ?? 0) + (byResource.kimchi ?? 0)) / vegetableTarget)
      : 1,
  };
}

export function consumeFuelHeat(state: ResourceStockState, requestedHeat: number): number {
  let remaining = finitePositive(requestedHeat);
  let provided = 0;
  for (const id of FUEL_RESOURCES) {
    if (remaining <= 0) break;
    const value = RESOURCE_DEFS[id].fuelValue ?? 1;
    const units = Math.min(finitePositive(state.resources[id] ?? 0), remaining / value);
    state.resources[id] = Math.max(0, (state.resources[id] ?? 0) - units);
    const heat = units * value;
    remaining -= heat;
    provided += heat;
  }
  return provided;
}

export function consumeClothingWear(state: GameState, requestedUnits: number): number {
  let remaining = finitePositive(requestedUnits);
  let consumed = 0;
  for (const id of ['cottonClothes', 'hideClothes'] as const) {
    if (remaining <= 0) break;
    const taken = Math.min(finitePositive(state.resources[id] ?? 0), remaining);
    state.resources[id] = Math.max(0, (state.resources[id] ?? 0) - taken);
    remaining -= taken;
    consumed += taken;
  }
  return consumed;
}
