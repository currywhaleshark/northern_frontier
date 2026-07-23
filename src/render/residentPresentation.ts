import { CONFIG } from '../game/config';
import { isIndoors } from '../game/dayCycle';
import {
  residentActiveWorkplace,
  workplacePresentation,
} from '../game/workplacePresentation';
import type { Building, GameState } from '../game/types';
import { selectOxPlowFarmerIds } from './residentFarmerAssets';
import { residentWorkStances, type ResidentWorkStance } from './residentWorkLayout';

export interface ResidentPresentationSnapshot {
  buildingById: ReadonlyMap<number, Building>;
  indoorResidentIds: ReadonlySet<number>;
  workplaceActiveCountByBuilding: ReadonlyMap<number, number>;
  workStances: ReadonlyMap<number, ResidentWorkStance>;
  oxPlowFarmerIds: ReadonlySet<number>;
}

export function buildResidentPresentationSnapshot(state: GameState): ResidentPresentationSnapshot {
  const buildingById = new Map<number, Building>();
  for (const building of state.buildings) buildingById.set(building.id, building);

  const indoorResidentIds = new Set<number>();
  const workplaceActiveCountByBuilding = new Map<number, number>();
  for (const resident of state.residents) {
    // 취침(집 도착 후)·실내 여가(당집·암자) 재실자는 그리지 않는다 — M0 계약 isIndoors
    if (isIndoors(state, resident)) {
      indoorResidentIds.add(resident.id);
      continue;
    }
    const building = residentActiveWorkplace(resident, buildingById);
    if (!building) continue;
    const presentation = workplacePresentation(building.type);
    if (presentation.mode === 'interior') indoorResidentIds.add(resident.id);
    if (presentation.activity) {
      workplaceActiveCountByBuilding.set(
        building.id,
        (workplaceActiveCountByBuilding.get(building.id) ?? 0) + 1,
      );
    }
  }

  return {
    buildingById,
    indoorResidentIds,
    workplaceActiveCountByBuilding,
    workStances: residentWorkStances(state.residents, CONFIG.ui.tileSize, indoorResidentIds),
    oxPlowFarmerIds: selectOxPlowFarmerIds(state.buildings, state.residents),
  };
}

export interface ResidentPresentationSnapshotCache {
  get(state: GameState, simulationVersion: number): ResidentPresentationSnapshot;
  clear(): void;
}

/** Mutable GameState is cached only behind the caller's explicit simulation revision. */
export function createResidentPresentationSnapshotCache(): ResidentPresentationSnapshotCache {
  let cachedState: GameState | null = null;
  let cachedVersion = Number.NaN;
  let cachedSnapshot: ResidentPresentationSnapshot | null = null;
  return {
    get(state, simulationVersion) {
      if (cachedSnapshot && cachedState === state && cachedVersion === simulationVersion) return cachedSnapshot;
      cachedState = state;
      cachedVersion = simulationVersion;
      cachedSnapshot = buildResidentPresentationSnapshot(state);
      return cachedSnapshot;
    },
    clear() {
      cachedState = null;
      cachedVersion = Number.NaN;
      cachedSnapshot = null;
    },
  };
}
