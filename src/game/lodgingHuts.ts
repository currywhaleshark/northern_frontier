import { CONFIG } from './config';
import { consumeFoodByDiet, consumeFuelHeat, foodTotal, fuelHeatTotal, type ConsumptionResult } from './consumption';
import { edictFoodRationMultiplier, edictFuelRationMultiplier } from './edicts';
import { isGatheringBuildingType, isTileInGatheringWorkArea } from './gatheringZones';
import { residentConsumptionShare } from './lifecycle';
import { isTileInMineWorkArea } from './miningSites';
import { getSeason } from './seasons';
import { firewoodWeatherMult } from './weather';
import type { Building, BuildingTypeId, GameState, Resident } from './types';

type LodgingWorksiteType = Extract<BuildingTypeId, 'lumberCamp' | 'huntLodge' | 'herbHut' | 'mine'>;

const LODGING_WORKSITE_TYPES: ReadonlySet<BuildingTypeId> = new Set([
  'lumberCamp', 'huntLodge', 'herbHut', 'mine',
]);

interface LodgingSupplySummary {
  food: number;
  fuelHeat: number;
  workers: number;
  foodDays: number;
  fuelDays: number;
}

interface LodgingConsumptionGroup {
  hut: Building;
  residents: Resident[];
  foodNeed: number;
  fuelNeed: number;
  rationedFoodNeed: number;
  rationedFuelNeed: number;
  foodResult: ConsumptionResult;
  heatProvided: number;
  fedRatio: number;
  firewoodRatio: number;
}

function isLodgingWorksiteType(type: BuildingTypeId): type is LodgingWorksiteType {
  return LODGING_WORKSITE_TYPES.has(type);
}

export function isInsideLodgingWorksite(worksite: Building, x: number, y: number): boolean {
  if (!isLodgingWorksiteType(worksite.type)) return false;
  const point = { x, y };
  if (worksite.type === 'mine') return isTileInMineWorkArea(worksite, point);
  if (!isGatheringBuildingType(worksite.type)) return false;
  return isTileInGatheringWorkArea(worksite, point);
}

export function lodgingHutForWorksite(state: GameState, worksiteId: number): Building | null {
  return state.buildings.find(building =>
    building.type === 'lodgingHut' && building.built &&
    building.linkedGatheringBuildingId === worksiteId) ?? null;
}

export function linkedLodgingWorksite(state: GameState, hut: Building): Building | null {
  if (hut.type !== 'lodgingHut' || hut.linkedGatheringBuildingId == null) return null;
  return state.buildings.find(building =>
    building.id === hut.linkedGatheringBuildingId && building.built &&
    isLodgingWorksiteType(building.type)) ?? null;
}

export function lodgingHutForResident(state: GameState, resident: Resident): Building | null {
  if (resident.assignedBuildingId == null) return null;
  const worksite = state.buildings.find(building =>
    building.id === resident.assignedBuildingId && building.built &&
    isLodgingWorksiteType(building.type));
  return worksite ? lodgingHutForWorksite(state, worksite.id) : null;
}

export function lodgingWorkers(state: GameState, hut: Building): Resident[] {
  const worksite = linkedLodgingWorksite(state, hut);
  if (!worksite) return [];
  return state.residents.filter(resident =>
    resident.alive && resident.assignedBuildingId === worksite.id);
}

export function lodgingHutPlacementTarget(state: GameState, x: number, y: number): Building | null {
  return state.buildings
    .filter(building => building.built && isLodgingWorksiteType(building.type) &&
      isInsideLodgingWorksite(building, x, y) && !state.buildings.some(candidate =>
        candidate.type === 'lodgingHut' && candidate.linkedGatheringBuildingId === building.id))
    .sort((a, b) => {
      const da = (a.x - x) ** 2 + (a.y - y) ** 2;
      const db = (b.x - x) ** 2 + (b.y - y) ** 2;
      return da - db || a.id - b.id;
    })[0] ?? null;
}

function residentSleepingAtLodgingHut(state: GameState, resident: Resident): Building | null {
  if (resident.phase !== 'sleeping' || resident.targetId == null) return null;
  const hut = lodgingHutForResident(state, resident);
  return hut?.id === resident.targetId ? hut : null;
}

export function lodgingDailyNeeds(state: GameState, residents: readonly Resident[]): {
  food: number;
  rationedFood: number;
  fuelHeat: number;
  rationedFuelHeat: number;
} {
  const weight = residents.reduce((sum, resident) => sum + residentConsumptionShare(resident), 0);
  const food = weight * CONFIG.needs.foodPerDay;
  const fuelHeat = weight * CONFIG.needs.firewoodPerPerson *
    CONFIG.seasons.firewoodMult[getSeason(state.day)] * firewoodWeatherMult(state.weather);
  return {
    food,
    rationedFood: food * edictFoodRationMultiplier(state),
    fuelHeat,
    rationedFuelHeat: fuelHeat * edictFuelRationMultiplier(state),
  };
}

export function lodgingSupplySummary(state: GameState, hut: Building): LodgingSupplySummary {
  const workers = lodgingWorkers(state, hut);
  const daily = lodgingDailyNeeds(state, workers);
  const stock = { resources: hut.inventory ?? {} };
  const food = foodTotal(stock);
  const fuelHeat = fuelHeatTotal(stock);
  return {
    food,
    fuelHeat,
    workers: workers.length,
    foodDays: daily.rationedFood > 0 ? food / daily.rationedFood : 0,
    fuelDays: daily.rationedFuelHeat > 0 ? fuelHeat / daily.rationedFuelHeat : 0,
  };
}

export function lodgingCanHostTonight(state: GameState, hut: Building): boolean {
  const workers = lodgingWorkers(state, hut).filter(resident =>
    !resident.sick && state.day >= (resident.quarantinedUntil ?? 0) && resident.health >= 20);
  if (workers.length === 0) return false;
  const needs = lodgingDailyNeeds(state, workers);
  const stock = { resources: hut.inventory ?? {} };
  return foodTotal(stock) + 0.000001 >= needs.rationedFood &&
    fuelHeatTotal(stock) + 0.000001 >= needs.rationedFuelHeat;
}

export function consumeLodgingHutSupplies(state: GameState): LodgingConsumptionGroup[] {
  const groups: LodgingConsumptionGroup[] = [];
  for (const hut of state.buildings) {
    if (hut.type !== 'lodgingHut' || !hut.built) continue;
    const residents = state.residents.filter(resident =>
      resident.alive && residentSleepingAtLodgingHut(state, resident)?.id === hut.id);
    if (residents.length === 0) continue;
    const needs = lodgingDailyNeeds(state, residents);
    hut.inventory ??= {};
    const stock = { resources: hut.inventory };
    const foodResult = consumeFoodByDiet(stock, needs.rationedFood);
    const heatProvided = consumeFuelHeat(stock, needs.rationedFuelHeat);
    groups.push({
      hut,
      residents,
      foodNeed: needs.food,
      fuelNeed: needs.fuelHeat,
      rationedFoodNeed: needs.rationedFood,
      rationedFuelNeed: needs.rationedFuelHeat,
      foodResult,
      heatProvided,
      fedRatio: needs.food > 0 ? Math.min(1, foodResult.totalConsumed / needs.food) : 1,
      firewoodRatio: needs.fuelHeat > 0 ? Math.min(1, heatProvided / needs.fuelHeat) : 1,
    });
  }
  return groups;
}

export function clearLodgingLinksForBuilding(state: GameState, buildingId: number): void {
  for (const building of state.buildings) {
    if (building.type === 'lodgingHut' && building.linkedGatheringBuildingId === buildingId) {
      building.linkedGatheringBuildingId = null;
    }
  }
  for (const resident of state.residents) {
    if (resident.lodgingSupplyHutId === buildingId) resident.lodgingSupplyHutId = null;
    if (resident.targetId === buildingId && (resident.phase === 'toHome' || resident.phase === 'sleeping')) {
      resident.phase = 'rest';
      resident.path = [];
      resident.targetId = null;
    }
  }
}

export function normalizeLodgingHutState(state: GameState): void {
  const claimed = new Set<number>();
  for (const hut of [...state.buildings]
    .filter(building => building.type === 'lodgingHut')
    .sort((a, b) => a.id - b.id)) {
    const linked = hut.linkedGatheringBuildingId == null ? null : state.buildings.find(building =>
      building.id === hut.linkedGatheringBuildingId && isLodgingWorksiteType(building.type));
    if (!linked || claimed.has(linked.id)) hut.linkedGatheringBuildingId = null;
    else claimed.add(linked.id);
  }
  for (const resident of state.residents) {
    if (!Number.isInteger(resident.lodgingHomeRestDay)) resident.lodgingHomeRestDay = null;
    const supplyHut = resident.lodgingSupplyHutId == null ? null : state.buildings.find(building =>
      building.id === resident.lodgingSupplyHutId && building.type === 'lodgingHut');
    if (!supplyHut) resident.lodgingSupplyHutId = null;
  }
}
