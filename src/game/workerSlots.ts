import { isJobUnlocked } from './constants';
import { isBuildingUnlocked } from './buildings';
import type { Building, BuildingTypeId, GameState, JobId, Resident } from './types';

export interface WorkerSlotConfig {
  job: JobId;
  slots: number;
}

export const SLOTTED_BUILDING_CONFIG: Partial<Record<BuildingTypeId, WorkerSlotConfig>> = {
  field: { job: 'farmer', slots: 1 },
  paddy: { job: 'farmer', slots: 1 },
  watermill: { job: 'miller', slots: 2 },
  woodShed: { job: 'woodSplitter', slots: 2 },
  charcoalKiln: { job: 'charcoalBurner', slots: 3 },
  smithy: { job: 'smith', slots: 2 },
  stable: { job: 'herder', slots: 2 },
  nitreYard: { job: 'powderMaker', slots: 2 },
  ferry: { job: 'fisher', slots: 2 },
  tannery: { job: 'tanner', slots: 2 },
  weavingHouse: { job: 'weaver', slots: 2 },
};

function isWorkableResident(resident: Resident | undefined): resident is Resident {
  return resident != null && resident.alive && !resident.sick && resident.health >= 20;
}

function slottedConfigForBuilding(
  state: GameState,
  building: Building | undefined,
): WorkerSlotConfig | null {
  if (!building || !building.built) return null;
  if (!isBuildingUnlocked(state.rank, building.type)) return null;
  const config = workerSlotConfig(building.type);
  if (!config || !isJobUnlocked(state.rank, config.job)) return null;
  return config;
}

function distance(a: Pick<Resident, 'x' | 'y'>, b: Pick<Building, 'x' | 'y'>): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function workerSlotConfig(type: BuildingTypeId): WorkerSlotConfig | null {
  return SLOTTED_BUILDING_CONFIG[type] ?? null;
}

export function isSlottedProductionBuilding(type: BuildingTypeId): boolean {
  return workerSlotConfig(type) != null;
}

export function assignedWorkers(state: GameState, building: Building): Resident[] {
  const config = slottedConfigForBuilding(state, building);
  if (!config) return [];
  return state.residents
    .filter(resident =>
      resident.assignedBuildingId === building.id &&
      isWorkableResident(resident) &&
      resident.job === config.job)
    .sort((a, b) => a.id - b.id)
    .slice(0, config.slots);
}

export function isResidentInAssignedSlot(state: GameState, resident: Resident, building: Building): boolean {
  return assignedWorkers(state, building).some(worker => worker.id === resident.id);
}

export function availableWorkerSlots(state: GameState, building: Building): number {
  const config = slottedConfigForBuilding(state, building);
  if (!config) return 0;
  return Math.max(0, config.slots - assignedWorkers(state, building).length);
}

export function autoAssignWorkersToBuilding(state: GameState, buildingId: number): Resident[] {
  const building = state.buildings.find(candidate => candidate.id === buildingId);
  const config = slottedConfigForBuilding(state, building);
  if (!building || !config) return [];

  // 병자처럼 잠시 일을 못 하는 기존 배정자도 자리는 유지한다.
  const reservedSlots = state.residents.filter(resident =>
    resident.alive &&
    resident.job === config.job &&
    resident.assignedBuildingId === building.id).length;
  const vacancies = Math.max(0, config.slots - reservedSlots);
  if (vacancies === 0) return [];

  const candidates = state.residents
    .filter(resident =>
      resident.assignedBuildingId == null &&
      resident.job === config.job &&
      isWorkableResident(resident))
    .sort((a, b) => distance(a, building) - distance(b, building) || a.id - b.id)
    .slice(0, vacancies);

  const assigned: Resident[] = [];
  for (const resident of candidates) {
    if (assignResidentToBuilding(state, resident.id, building.id) == null) assigned.push(resident);
  }
  return assigned;
}

export function assignedBuildingForResident(state: GameState, resident: Resident): Building | null {
  if (resident.assignedBuildingId == null) return null;
  const building = state.buildings.find(candidate => candidate.id === resident.assignedBuildingId);
  if (!building) return null;
  return isResidentInAssignedSlot(state, resident, building) ? building : null;
}

export function canAssignResidentToBuilding(
  state: GameState,
  residentId: number,
  buildingId: number,
): string | null {
  const resident = state.residents.find(candidate => candidate.id === residentId);
  if (!resident) return 'resident missing';
  if (!resident.alive) return 'resident is dead';
  if (resident.sick) return 'resident is sick';
  if (resident.health < 20) return 'resident health is too low';

  const building = state.buildings.find(candidate => candidate.id === buildingId);
  if (!building) return 'building missing';
  if (!building.built) return 'building is not built';
  if (!workerSlotConfig(building.type)) return 'building has no worker slots';
  if (!isBuildingUnlocked(state.rank, building.type)) return 'building is locked by rank';

  const config = workerSlotConfig(building.type);
  if (!config) return 'building has no worker slots';
  if (!isJobUnlocked(state.rank, config.job)) return 'job is locked by rank';

  const assigned = assignedWorkers(state, building);
  if (
    assigned.length >= config.slots &&
    !assigned.some(worker => worker.id === resident.id)
  ) {
    return 'no available worker slots';
  }

  return null;
}

export function assignResidentToBuilding(
  state: GameState,
  residentId: number,
  buildingId: number,
): string | null {
  const reason = canAssignResidentToBuilding(state, residentId, buildingId);
  if (reason) return reason;

  const resident = state.residents.find(candidate => candidate.id === residentId);
  const building = state.buildings.find(candidate => candidate.id === buildingId);
  const config = building ? workerSlotConfig(building.type) : null;
  if (!resident || !building || !config) return 'assignment target missing';

  resident.job = config.job;
  resident.assignedBuildingId = building.id;
  return null;
}

export function unassignResidentFromBuilding(state: GameState, residentId: number): void {
  const resident = state.residents.find(candidate => candidate.id === residentId);
  if (resident) resident.assignedBuildingId = null;
}

export function clearAssignmentsForBuilding(state: GameState, buildingId: number): void {
  for (const resident of state.residents) {
    if (resident.assignedBuildingId === buildingId) resident.assignedBuildingId = null;
  }
}

export function clearIncompatibleAssignment(state: GameState, resident: Resident): void {
  if (resident.assignedBuildingId == null) return;
  if (!assignedBuildingForResident(state, resident)) resident.assignedBuildingId = null;
}

export function assignNearestWorkerToBuilding(state: GameState, buildingId: number): string | null {
  const building = state.buildings.find(candidate => candidate.id === buildingId);
  if (!building) return 'building missing';
  const config = slottedConfigForBuilding(state, building);
  if (!config) {
    if (!building.built) return 'building is not built';
    if (!workerSlotConfig(building.type)) return 'building has no worker slots';
    if (!isBuildingUnlocked(state.rank, building.type)) return 'building is locked by rank';
    return 'job is locked by rank';
  }
  if (availableWorkerSlots(state, building) <= 0) return 'no available worker slots';

  const candidate = state.residents
    .filter(resident =>
      resident.assignedBuildingId == null &&
      isWorkableResident(resident))
    .sort((a, b) => {
      const jobPreference = Number(b.job === config.job) - Number(a.job === config.job);
      if (jobPreference !== 0) return jobPreference;
      const distanceDelta = distance(a, building) - distance(b, building);
      if (distanceDelta !== 0) return distanceDelta;
      return a.id - b.id;
    })[0];

  if (!candidate) return 'no eligible worker';
  return assignResidentToBuilding(state, candidate.id, building.id);
}
