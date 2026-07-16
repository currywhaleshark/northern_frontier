import { CONFIG } from './config';
import { getSeason } from './seasons';
import type { GameState, ResourceId, Season } from './types';

export const SPOILABLE_RESOURCE_IDS = ['fish', 'meat', 'eggs', 'vegetables'] as const satisfies readonly ResourceId[];
export type SpoilableResourceId = typeof SPOILABLE_RESOURCE_IDS[number];

export interface SpoilageItem {
  resource: SpoilableResourceId;
  stock: number;
  protectedAmount: number;
  exposedAmount: number;
  loss: number;
}

export interface SpoilageReport {
  season: Season;
  cellarCount: number;
  capacity: number;
  rawFoodTotal: number;
  protectedTotal: number;
  totalLoss: number;
  items: Partial<Record<ResourceId, SpoilageItem>>;
}

function finiteStock(value: number | undefined): number {
  return Number.isFinite(value) ? Math.max(0, value ?? 0) : 0;
}

export function cellarCount(state: GameState): number {
  return state.buildings.filter(building => building.type === 'cellar' && building.built).length;
}

export function spoilagePreview(state: GameState, season = getSeason(state.day)): SpoilageReport {
  const builtCellars = cellarCount(state);
  const capacity = builtCellars * CONFIG.spoilage.cellarCapacity;
  let remainingCapacity = capacity;
  let rawFoodTotal = 0;
  let protectedTotal = 0;
  let totalLoss = 0;
  const items: Partial<Record<ResourceId, SpoilageItem>> = {};

  // 보호 공간은 가장 빨리 상하는 품목부터 배정해 결과가 항상 결정적이게 한다.
  for (const resource of SPOILABLE_RESOURCE_IDS) {
    const stock = finiteStock(state.resources[resource]);
    const protectedAmount = Math.min(stock, remainingCapacity);
    const exposedAmount = stock - protectedAmount;
    const rate = CONFIG.spoilage.dailyRate[resource] * CONFIG.spoilage.seasonMult[season];
    const loss = Math.min(
      stock,
      exposedAmount * rate + protectedAmount * rate * CONFIG.spoilage.cellarRateMult,
    );
    items[resource] = { resource, stock, protectedAmount, exposedAmount, loss };
    remainingCapacity -= protectedAmount;
    rawFoodTotal += stock;
    protectedTotal += protectedAmount;
    totalLoss += loss;
  }

  return {
    season,
    cellarCount: builtCellars,
    capacity,
    rawFoodTotal,
    protectedTotal,
    totalLoss,
    items,
  };
}

export function applyDailySpoilage(state: GameState): SpoilageReport {
  const report = spoilagePreview(state);
  for (const resource of SPOILABLE_RESOURCE_IDS) {
    const loss = report.items[resource]?.loss ?? 0;
    state.resources[resource] = Math.max(0, finiteStock(state.resources[resource]) - loss);
  }
  return report;
}
