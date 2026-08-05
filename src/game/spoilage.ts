import { CONFIG } from './config';
import { getSeason } from './seasons';
import type { GameState, ResourceId, Season } from './types';

export const SPOILABLE_RESOURCE_IDS = ['fish', 'milk', 'meat', 'eggs', 'vegetables'] as const satisfies readonly ResourceId[];
type SpoilableResourceId = typeof SPOILABLE_RESOURCE_IDS[number];

interface SpoilageItem {
  resource: SpoilableResourceId;
  stock: number;
  eligibleStock: number;
  freshAmount: number;
  protectedAmount: number;
  exposedAmount: number;
  loss: number;
}

interface SpoilageReport {
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

export function spoilageStockSnapshot(state: Pick<GameState, 'resources'>): Partial<Record<ResourceId, number>> {
  return {
    fish: finiteStock(state.resources.fish),
    milk: finiteStock(state.resources.milk),
    meat: finiteStock(state.resources.meat),
    eggs: finiteStock(state.resources.eggs),
    vegetables: finiteStock(state.resources.vegetables),
  };
}

function cellarCount(state: GameState): number {
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
    // 하루 시작 이후 새로 입고된 몫은 다음 날부터 부패한다. 구버전 저장처럼
    // 스냅숏이 없으면 현재 재고 전부를 기존 재고로 보아 보수적으로 처리한다.
    const dayStartStock = state.spoilageStockAtDayStart?.[resource];
    const eligibleStock = Math.min(stock, dayStartStock == null ? stock : finiteStock(dayStartStock));
    const freshAmount = stock - eligibleStock;
    const protectedAmount = Math.min(eligibleStock, remainingCapacity);
    const exposedAmount = eligibleStock - protectedAmount;
    const rate = CONFIG.spoilage.dailyRate[resource] * CONFIG.spoilage.seasonMult[season];
    const loss = Math.min(
      stock,
      exposedAmount * rate + protectedAmount * rate * CONFIG.spoilage.cellarRateMult,
    );
    items[resource] = { resource, stock, eligibleStock, freshAmount, protectedAmount, exposedAmount, loss };
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
  state.spoilageStockAtDayStart = spoilageStockSnapshot(state);
  return report;
}
