import type { Building, BuildingTypeId, GameState } from './types';

/**
 * 사액 현판이 실제 작업 산출을 높일 수 있는 건물의 단일 목록.
 *
 * 채집 거점(벌목장·사냥막·약초막·채광장·낚시터), 경작지, 주거,
 * 방어·행정·의료·교통 시설은 의도적으로 포함하지 않는다.
 */
export const ROYAL_PLAQUE_PRODUCTION_BUILDING_TYPES = [
  'smokehouse',
  'dryingRack',
  'onggiKiln',
  'saltworks',
  'jangdokdae',
  'woodShed',
  'watermill',
  'smithy',
  'charcoalKiln',
  'stable',
  'nitreYard',
  'tannery',
  'weavingHouse',
] as const satisfies readonly BuildingTypeId[];

export type RoyalPlaqueProductionBuildingType =
  typeof ROYAL_PLAQUE_PRODUCTION_BUILDING_TYPES[number];

const ROYAL_PLAQUE_PRODUCTION_BUILDING_SET: ReadonlySet<BuildingTypeId> =
  new Set<BuildingTypeId>(ROYAL_PLAQUE_PRODUCTION_BUILDING_TYPES);

export function isRoyalPlaqueProductionBuildingType(
  type: BuildingTypeId,
): type is RoyalPlaqueProductionBuildingType {
  return ROYAL_PLAQUE_PRODUCTION_BUILDING_SET.has(type);
}

export function isRoyalPlaqueProductionBuilding(
  building: Building | null | undefined,
): building is Building & { type: RoyalPlaqueProductionBuildingType } {
  return !!building && isRoyalPlaqueProductionBuildingType(building.type);
}

export function royalPlaqueInstallError(state: GameState, buildingId: number): string | null {
  if ((state.specialItems.royalPlaque ?? 0) < 1) return '보유한 사액 현판이 없습니다.';
  if (state.royalPlaqueBuildingId != null) return '사액 현판은 이미 다른 생산 건물에 영구 귀속되어 있습니다.';
  const building = state.buildings.find(candidate => candidate.id === buildingId);
  if (!building) return '사액 현판을 걸 건물을 찾을 수 없습니다.';
  if (!building.built || building.repairing || building.expansion || building.workOrder) {
    return '작업이 없는 완공된 생산 건물에만 사액 현판을 걸 수 있습니다.';
  }
  if (!isRoyalPlaqueProductionBuilding(building)) {
    return '사액 현판은 완공된 실제 생산 건물에만 걸 수 있습니다.';
  }
  return null;
}

/**
 * 확인 모달의 최종 확정 시점에만 호출한다. 모달을 연 뒤 상태가 바뀌었더라도
 * 계약을 다시 검사하므로 설치는 원자적으로 성공하거나 아무것도 바꾸지 않는다.
 */
export function installRoyalPlaque(state: GameState, buildingId: number): string | null {
  const error = royalPlaqueInstallError(state, buildingId);
  if (error) return error;
  state.royalPlaqueBuildingId = buildingId;
  // 설치는 소비가 아니다. 기물함의 1개가 건물에 귀속된 상태로 남는다.
  state.specialItems.royalPlaque = 1;
  if (!state.discoveredSpecialItems.includes('royalPlaque')) {
    state.discoveredSpecialItems.push('royalPlaque');
  }
  return null;
}

export function plaqueProductionMultiplier(state: GameState, buildingId: number): number {
  return state.royalPlaqueBuildingId === buildingId && (state.specialItems.royalPlaque ?? 0) > 0
    ? 1.25
    : 1;
}

/**
 * 습격의 수리 상태 전환처럼 건물이 남는 경로에서는 호출하지 않는다.
 * 외부 원인이나 완료된 해체로 건물이 실제 배열에서 삭제된 직후 호출한다.
 */
export function cleanupRoyalPlaqueAfterBuildingRemoval(
  state: GameState,
  removedBuildingId: number,
): boolean {
  if (state.royalPlaqueBuildingId !== removedBuildingId) return false;
  if (state.buildings.some(building => building.id === removedBuildingId)) return false;
  state.royalPlaqueBuildingId = null;
  state.specialItems.royalPlaque = 0;
  return true;
}

/**
 * 건물 배열을 모두 읽어들인 뒤 호출하는 저장 정규화.
 * 수리 중인 대상은 여전히 같은 건물이므로 유지하고, 사라졌거나 비생산 건물을
 * 가리키는 깨진 참조만 소실 처리한다.
 */
export function normalizeRoyalPlaqueBinding(state: GameState): void {
  const buildingId = state.royalPlaqueBuildingId;
  if (!Number.isInteger(buildingId) || Number(buildingId) <= 0) {
    state.royalPlaqueBuildingId = null;
    return;
  }
  const building = state.buildings.find(candidate => candidate.id === buildingId);
  if (!isRoyalPlaqueProductionBuilding(building)) {
    state.royalPlaqueBuildingId = null;
    state.specialItems.royalPlaque = 0;
    return;
  }
  state.royalPlaqueBuildingId = building.id;
  state.specialItems.royalPlaque = 1;
  if (!state.discoveredSpecialItems.includes('royalPlaque')) {
    state.discoveredSpecialItems.push('royalPlaque');
  }
}
