import type { Building, BuildingTypeId, GameState, Resident } from './types';

export type WorkplaceActivityStyle = 'fire' | 'craft' | 'service';

const INTERIOR_WORKPLACE_STYLES: Partial<Record<BuildingTypeId, WorkplaceActivityStyle>> = {
  watermill: 'craft',
  woodShed: 'craft',
  charcoalKiln: 'fire',
  smithy: 'fire',
  stable: 'service',
  clinic: 'service',
  nitreYard: 'craft',
  tannery: 'craft',
  weavingHouse: 'craft',
  smokehouse: 'fire',
  dryingRack: 'craft',
  onggiKiln: 'fire',
  school: 'service',
  shrine: 'service',
  hermitage: 'service',
};

export function workplaceActivityStyle(type: BuildingTypeId): WorkplaceActivityStyle | null {
  return INTERIOR_WORKPLACE_STYLES[type] ?? null;
}

export function isInteriorWorkplace(type: BuildingTypeId): boolean {
  return workplaceActivityStyle(type) != null;
}

/** 화면 보간까지 끝내고 배정 작업장에서 실제 생산·업무 중인 주민만 실내로 표시한다. */
export function residentInteriorWorkplace(state: GameState, resident: Resident): Building | null {
  if (!resident.alive || resident.phase !== 'working' || resident.px !== resident.x || resident.py !== resident.y ||
      resident.assignedBuildingId == null) return null;
  const building = state.buildings.find(candidate =>
    candidate.id === resident.assignedBuildingId && candidate.built && isInteriorWorkplace(candidate.type));
  return building ?? null;
}

export function activeInteriorWorkers(state: GameState): {
  residentIds: Set<number>;
  countByBuilding: Map<number, number>;
} {
  const residentIds = new Set<number>();
  const countByBuilding = new Map<number, number>();
  for (const resident of state.residents) {
    const building = residentInteriorWorkplace(state, resident);
    if (!building) continue;
    residentIds.add(resident.id);
    countByBuilding.set(building.id, (countByBuilding.get(building.id) ?? 0) + 1);
  }
  return { residentIds, countByBuilding };
}
