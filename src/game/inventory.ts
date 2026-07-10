import type { Building, BuildingTypeId, GameState, Resident, ResourceId } from './types';

const HAUL_SOURCE_BUILDING_TYPES: ReadonlySet<BuildingTypeId> = new Set([
  'field', 'paddy', 'lumberCamp', 'woodShed', 'huntLodge', 'herbHut',
  'smithy', 'mine', 'ferry', 'watermill', 'charcoalKiln', 'stable',
  'nitreYard', 'tannery', 'weavingHouse',
]);

export function ensureBuildingInventory(building: Building): Partial<Record<ResourceId, number>> {
  if (!building.inventory) building.inventory = {};
  return building.inventory;
}

export function buildingStock(building: Building, resource: ResourceId): number {
  const amount = building.inventory?.[resource] ?? 0;
  return Number.isFinite(amount) ? Math.max(0, amount) : 0;
}

export function addBuildingStock(building: Building, resource: ResourceId, amount: number): void {
  if (!Number.isFinite(amount) || amount <= 0) return;
  const inventory = ensureBuildingInventory(building);
  inventory[resource] = buildingStock(building, resource) + amount;
}

export function takeBuildingStock(building: Building, resource: ResourceId, amount: number): number {
  const requested = Number.isFinite(amount) ? Math.max(0, amount) : 0;
  const taken = Math.min(buildingStock(building, resource), requested);
  const inventory = ensureBuildingInventory(building);
  inventory[resource] = Math.max(0, buildingStock(building, resource) - taken);
  return taken;
}

export function isStorageBuilding(building: Building): boolean {
  return building.built && (building.type === 'center' || building.type === 'storehouse');
}

export function isHaulSourceBuilding(building: Building): boolean {
  return building.built && HAUL_SOURCE_BUILDING_TYPES.has(building.type);
}

export function addSettlementStock(state: GameState, resource: ResourceId, amount: number): void {
  if (!Number.isFinite(amount) || amount <= 0) return;
  state.resources[resource] = Math.max(0, (state.resources[resource] ?? 0) + amount);
}

export function depositResidentToBuilding(building: Building, resident: Resident): void {
  for (const [resource, amount] of Object.entries(resident.carrying) as [ResourceId, number][]) {
    addBuildingStock(building, resource, amount ?? 0);
  }
  resident.carrying = {};
}

export function depositResidentToSettlement(state: GameState, resident: Resident): void {
  for (const [resource, amount] of Object.entries(resident.carrying) as [ResourceId, number][]) {
    addSettlementStock(state, resource, amount ?? 0);
  }
  resident.carrying = {};
}
