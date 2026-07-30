import { isJobUnlocked } from './constants';
import { CONFIG } from './config';
import { isBuildingUnlocked, isPlotBuildingType, plotArea } from './buildings';
import { pastureRequiredHerders } from './pastures';
import { canResidentTakeJob } from './youth';
import type { Building, BuildingTypeId, GameState, JobId, Resident } from './types';

export interface WorkerSlotConfig {
  job: JobId;
  slots: number;
}

export const AUTO_ASSIGN_BUILDING_TYPES = [
  'field', 'paddy', 'watermill', 'woodShed', 'charcoalKiln', 'smithy',
  'stable', 'clinic', 'nitreYard', 'ferry', 'tannery', 'weavingHouse', 'smokehouse', 'dryingRack', 'onggiKiln',
  'deepMine',
] as const satisfies readonly BuildingTypeId[];
export type AutoAssignBuildingType = typeof AUTO_ASSIGN_BUILDING_TYPES[number];

export const SLOTTED_BUILDING_CONFIG: Partial<Record<BuildingTypeId, WorkerSlotConfig>> = {
  field: { job: 'farmer', slots: 1 },
  paddy: { job: 'farmer', slots: 1 },
  watermill: { job: 'miller', slots: 2 },
  woodShed: { job: 'woodSplitter', slots: 2 },
  charcoalKiln: { job: 'charcoalBurner', slots: 3 },
  smithy: { job: 'smith', slots: 2 },
  stable: { job: 'herder', slots: 2 },
  clinic: { job: 'physician', slots: 2 },
  nitreYard: { job: 'powderMaker', slots: 2 },
  ferry: { job: 'fisher', slots: 2 },
  tannery: { job: 'tanner', slots: 2 },
  weavingHouse: { job: 'weaver', slots: 2 },
  smokehouse: { job: 'curer', slots: 2 },
  dryingRack: { job: 'curer', slots: 2 },
  onggiKiln: { job: 'potter', slots: 2 },
  deepMine: { job: 'miner', slots: 4 },
  cemetery: { job: 'undertaker', slots: 1 },
  school: { job: 'teacher', slots: 1 },
  shrine: { job: 'shaman', slots: 2 },
  hermitage: { job: 'monk', slots: 2 },
};

export function isResidentAvailableForWorkerSlot(
  state: GameState,
  resident: Resident | undefined,
): resident is Resident {
  return resident != null && resident.alive && !resident.sick && canResidentTakeJob(resident, resident.job) &&
    state.day >= (resident.quarantinedUntil ?? 0) && resident.health >= 20;
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

// 건물 인스턴스의 실제 슬롯 수 — 경작지는 면적에 비례한다 (ceil(칸수/tilesPerFarmer))
export function workerSlotCount(building: Pick<Building, 'type' | 'w' | 'h'>): number {
  const config = workerSlotConfig(building.type);
  if (!config) return 0;
  if (isPlotBuildingType(building.type)) {
    return Math.max(1, Math.ceil(plotArea(building) / CONFIG.farming.tilesPerFarmer));
  }
  if (building.type === 'stable') return pastureRequiredHerders(building);
  return config.slots;
}

export function isSlottedProductionBuilding(type: BuildingTypeId): boolean {
  return workerSlotConfig(type) != null;
}

export function isAutoAssignBuildingType(value: unknown): value is AutoAssignBuildingType {
  return typeof value === 'string' && (AUTO_ASSIGN_BUILDING_TYPES as readonly string[]).includes(value);
}

export function assignedSlotResidents(state: GameState, building: Building): Resident[] {
  const config = slottedConfigForBuilding(state, building);
  if (!config) return [];
  return state.residents
    .filter(resident =>
      resident.assignedBuildingId === building.id &&
      resident.alive &&
      resident.job === config.job)
    .sort((a, b) => a.id - b.id)
    .slice(0, workerSlotCount(building));
}

export function assignedWorkers(state: GameState, building: Building): Resident[] {
  return assignedSlotResidents(state, building)
    .filter(resident => isResidentAvailableForWorkerSlot(state, resident));
}

export function isResidentInAssignedSlot(state: GameState, resident: Resident, building: Building): boolean {
  return assignedSlotResidents(state, building).some(worker => worker.id === resident.id);
}

export function availableWorkerSlots(state: GameState, building: Building): number {
  const config = slottedConfigForBuilding(state, building);
  if (!config) return 0;
  return Math.max(0, workerSlotCount(building) - assignedSlotResidents(state, building).length);
}

export function autoAssignWorkersToBuilding(state: GameState, buildingId: number): Resident[] {
  const building = state.buildings.find(candidate => candidate.id === buildingId);
  const config = slottedConfigForBuilding(state, building);
  if (!building || !config) return [];

  const reservedSlots = assignedSlotResidents(state, building).length;
  const vacancies = Math.max(0, workerSlotCount(building) - reservedSlots);
  if (vacancies === 0) return [];

  const candidates = state.residents
    .filter(resident =>
      resident.assignedBuildingId == null &&
      resident.job === config.job &&
      isResidentAvailableForWorkerSlot(state, resident))
    .sort((a, b) => distance(a, building) - distance(b, building) || a.id - b.id)
    .slice(0, vacancies);

  const assigned: Resident[] = [];
  for (const resident of candidates) {
    if (assignResidentToBuilding(state, resident.id, building.id) == null) assigned.push(resident);
  }
  return assigned;
}

// 기존 건물 배정은 유지하고, 같은 직업의 미배정 주민만 빈 슬롯에 배치한다.
export function autoAssignWorkersToSelectedBuildingTypes(
  state: GameState,
  selectedTypes: readonly AutoAssignBuildingType[],
): Resident[] {
  const selected = new Set(selectedTypes);
  const targets = state.buildings
    .filter(building => selected.has(building.type as AutoAssignBuildingType))
    .sort((a, b) => a.id - b.id)
    .flatMap(building => {
      const config = slottedConfigForBuilding(state, building);
      if (!config) return [];
      const reservedSlots = assignedSlotResidents(state, building).length;
      const vacancies = Math.max(0, workerSlotCount(building) - reservedSlots);
      return vacancies > 0 ? [{ building, config, vacancies }] : [];
    });

  const assigned: Resident[] = [];
  while (true) {
    let best: {
      target: typeof targets[number]; resident: Resident; distance: number;
    } | null = null;
    for (const target of targets) {
      if (target.vacancies <= 0) continue;
      for (const resident of state.residents) {
        if (resident.job !== target.config.job || resident.assignedBuildingId != null ||
          !isResidentAvailableForWorkerSlot(state, resident)) continue;
        const candidate = { target, resident, distance: distance(resident, target.building) };
        if (!best || candidate.distance < best.distance
          || (candidate.distance === best.distance && candidate.target.building.id < best.target.building.id)
          || (candidate.distance === best.distance && candidate.target.building.id === best.target.building.id
            && candidate.resident.id < best.resident.id)) best = candidate;
      }
    }
    if (!best) break;
    if (assignResidentToBuilding(state, best.resident.id, best.target.building.id) != null) break;
    best.target.vacancies--;
    assigned.push(best.resident);
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
  if (state.day < (resident.quarantinedUntil ?? 0)) return 'resident is quarantined';
  if (resident.health < 20) return 'resident health is too low';

  const building = state.buildings.find(candidate => candidate.id === buildingId);
  if (!building) return 'building missing';
  if (!building.built) return 'building is not built';
  if (!workerSlotConfig(building.type)) return 'building has no worker slots';
  if (!isBuildingUnlocked(state.rank, building.type)) return 'building is locked by rank';

  const config = workerSlotConfig(building.type);
  if (!config) return 'building has no worker slots';
  if (!isJobUnlocked(state.rank, config.job)) return 'job is locked by rank';
  if ((config.job === 'shaman' || config.job === 'monk') && resident.job !== config.job) {
    return 'resident has no matching religious vocation';
  }
  if (!canResidentTakeJob(resident, config.job)) {
    return resident.stage === 'youth'
      ? '이 일은 소년에게 맡길 수 없습니다'
      : '아직 일을 맡길 수 없는 나이입니다';
  }

  const assigned = assignedSlotResidents(state, building);
  if (
    assigned.length >= workerSlotCount(building) &&
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
      ((config.job !== 'shaman' && config.job !== 'monk') || resident.job === config.job) &&
      isResidentAvailableForWorkerSlot(state, resident))
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
