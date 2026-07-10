import { CLOTHING_RESOURCES, FOOD_RESOURCES, FUEL_RESOURCES, RESOURCE_DEFS } from './resourceCatalog';
import type { GameState, ResourceId } from './types';

export interface ConsumptionResult {
  totalConsumed: number;
  byResource: Partial<Record<ResourceId, number>>;
  shortageRatio: number;
  varietyScore: number;
  vegetableRatio: number;
}

function finitePositive(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function foodTotal(state: GameState): number {
  return FOOD_RESOURCES.reduce((sum, id) => sum + finitePositive(state.resources[id] ?? 0), 0);
}

export function fuelHeatTotal(state: GameState): number {
  return FUEL_RESOURCES.reduce(
    (sum, id) => sum + finitePositive(state.resources[id] ?? 0) * (RESOURCE_DEFS[id].fuelValue ?? 0),
    0,
  );
}

export function clothingCoverageTotal(state: GameState): number {
  return CLOTHING_RESOURCES.reduce(
    (sum, id) => sum + finitePositive(state.resources[id] ?? 0) * (RESOURCE_DEFS[id].clothingValue ?? 0),
    0,
  );
}

export function luxuryStockTotal(state: GameState): number {
  return (['porcelain', 'brassware', 'lacquerware', 'silk', 'preciousMetal'] as const)
    .reduce((sum, id) => sum + finitePositive(state.resources[id] ?? 0), 0);
}

export function consumeFoodByDiet(state: GameState, requested: number): ConsumptionResult {
  const amount = finitePositive(requested);
  const byResource: Partial<Record<ResourceId, number>> = {};
  let remaining = amount;
  const totalWeight = FOOD_RESOURCES.reduce(
    (sum, id) => sum + (RESOURCE_DEFS[id].foodWeight ?? 1),
    0,
  );

  for (const id of FOOD_RESOURCES) {
    const desired = amount * ((RESOURCE_DEFS[id].foodWeight ?? 1) / totalWeight);
    const taken = Math.min(finitePositive(state.resources[id] ?? 0), desired);
    state.resources[id] = Math.max(0, (state.resources[id] ?? 0) - taken);
    byResource[id] = taken;
    remaining -= taken;
  }

  if (remaining > 0) {
    for (const id of FOOD_RESOURCES) {
      if (remaining <= 0) break;
      const taken = Math.min(finitePositive(state.resources[id] ?? 0), remaining);
      state.resources[id] = Math.max(0, (state.resources[id] ?? 0) - taken);
      byResource[id] = (byResource[id] ?? 0) + taken;
      remaining -= taken;
    }
  }

  const totalConsumed = Math.max(0, amount - remaining);
  const presentTypes = FOOD_RESOURCES.filter(id => (byResource[id] ?? 0) > 0.001).length;
  const vegetableTarget = amount * ((RESOURCE_DEFS.vegetables.foodWeight ?? 1) / totalWeight);
  return {
    totalConsumed,
    byResource,
    shortageRatio: amount > 0 ? totalConsumed / amount : 1,
    varietyScore: presentTypes / FOOD_RESOURCES.length,
    vegetableRatio: vegetableTarget > 0
      ? Math.min(1, (byResource.vegetables ?? 0) / vegetableTarget)
      : 1,
  };
}

export function consumeFuelHeat(state: GameState, requestedHeat: number): number {
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
