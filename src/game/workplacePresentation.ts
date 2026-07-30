import type { Building, BuildingTypeId, Resident } from './types';

export type WorkplaceActivityStyle = 'fire' | 'craft' | 'service';
export type WorkplacePresentationMode = 'interior' | 'yard' | 'visible';

export interface WorkplacePresentation {
  mode: WorkplacePresentationMode;
  activity: WorkplaceActivityStyle | null;
}

const VISIBLE_WORKPLACE: WorkplacePresentation = { mode: 'visible', activity: null };

const WORKPLACE_PRESENTATIONS: Partial<Record<BuildingTypeId, WorkplacePresentation>> = {
  watermill: { mode: 'interior', activity: 'craft' },
  smithy: { mode: 'interior', activity: 'fire' },
  deepMine: { mode: 'interior', activity: 'craft' },
  clinic: { mode: 'interior', activity: 'service' },
  tannery: { mode: 'interior', activity: 'craft' },
  weavingHouse: { mode: 'interior', activity: 'craft' },
  smokehouse: { mode: 'interior', activity: 'fire' },
  school: { mode: 'interior', activity: 'service' },
  office: { mode: 'interior', activity: 'service' },
  shrine: { mode: 'interior', activity: 'service' },
  hermitage: { mode: 'interior', activity: 'service' },

  woodShed: { mode: 'yard', activity: 'craft' },
  charcoalKiln: { mode: 'yard', activity: 'fire' },
  stable: { mode: 'yard', activity: 'service' },
  nitreYard: { mode: 'yard', activity: 'craft' },
  dryingRack: { mode: 'yard', activity: 'craft' },
  onggiKiln: { mode: 'yard', activity: 'fire' },
};

export function workplacePresentation(type: BuildingTypeId): WorkplacePresentation {
  return WORKPLACE_PRESENTATIONS[type] ?? VISIBLE_WORKPLACE;
}

export function workplaceActivityStyle(type: BuildingTypeId): WorkplaceActivityStyle | null {
  return workplacePresentation(type).activity;
}

export function isInteriorWorkplace(type: BuildingTypeId): boolean {
  return workplacePresentation(type).mode === 'interior';
}

/** 화면 보간까지 끝내고 배정 작업장에서 실제 생산·업무 중인 주민을 찾는다. */
export function residentActiveWorkplace(
  resident: Resident,
  buildingById: ReadonlyMap<number, Building>,
): Building | null {
  if (!resident.alive || resident.phase !== 'working' || resident.px !== resident.x || resident.py !== resident.y ||
      resident.assignedBuildingId == null) return null;
  const building = buildingById.get(resident.assignedBuildingId);
  return building?.built ? building : null;
}

export function residentInteriorWorkplace(
  resident: Resident,
  buildingById: ReadonlyMap<number, Building>,
): Building | null {
  const building = residentActiveWorkplace(resident, buildingById);
  return building && isInteriorWorkplace(building.type) ? building : null;
}
