import { BUILDING_DEFS } from '../game/buildings';
import type { Building, BuildingTypeId } from '../game/types';

export type BuildingFinderStatus = 'all' | 'operational' | 'construction' | 'repairing';

interface BuildingFinderFilters {
  query: string;
  type: BuildingTypeId | null;
  status: BuildingFinderStatus;
}

function buildingFinderStatus(building: Building): Exclude<BuildingFinderStatus, 'all'> {
  if (building.repairing || building.structureRepair) return 'repairing';
  if (!building.built || building.expansion || building.workOrder || building.gateConversion) return 'construction';
  return 'operational';
}

export function buildingFinderStatusLabel(building: Building): string {
  if (building.repairing) return '수리 중';
  if (building.structureRepair) return '돌파 수리 중';
  if (building.gateConversion) return '성문 전환 중';
  if (building.workOrder?.kind === 'demolish') return '해체 중';
  if (building.workOrder?.kind === 'relocate') return building.workOrder.phase === 'rebuilding' ? '이전 재건 중' : '이전 해체 중';
  if (building.expansion) return '확장 중';
  if (!building.built) return '건설 중';
  return '가동 가능';
}

function normalizedSearch(value: string): string {
  return value.trim().toLocaleLowerCase('ko-KR');
}

export function filteredBuildingResults(
  buildings: readonly Building[],
  filters: BuildingFinderFilters,
): Building[] {
  const query = normalizedSearch(filters.query);
  return buildings
    .filter(building => {
      if (filters.type && building.type !== filters.type) return false;
      if (filters.status !== 'all' && buildingFinderStatus(building) !== filters.status) return false;
      if (!query) return true;
      const def = BUILDING_DEFS[building.type];
      return normalizedSearch(def.name).includes(query) || normalizedSearch(building.type).includes(query);
    })
    .sort((left, right) => {
      const nameOrder = BUILDING_DEFS[left.type].name.localeCompare(BUILDING_DEFS[right.type].name, 'ko-KR');
      return nameOrder || left.y - right.y || left.x - right.x || left.id - right.id;
    });
}

export function nextBuildingResult(
  results: readonly Building[],
  currentBuildingId: number | null,
  direction: 1 | -1,
): Building | null {
  if (results.length === 0) return null;
  const currentIndex = currentBuildingId == null
    ? -1
    : results.findIndex(building => building.id === currentBuildingId);
  if (currentIndex < 0) return direction === 1 ? results[0] : results[results.length - 1];
  return results[(currentIndex + direction + results.length) % results.length];
}

export function buildingTypesInUse(buildings: readonly Building[]): Array<{ type: BuildingTypeId; count: number }> {
  const counts = new Map<BuildingTypeId, number>();
  for (const building of buildings) counts.set(building.type, (counts.get(building.type) ?? 0) + 1);
  return [...counts.entries()]
    .map(([type, count]) => ({ type, count }))
    .sort((left, right) => BUILDING_DEFS[left.type].name.localeCompare(BUILDING_DEFS[right.type].name, 'ko-KR'));
}
