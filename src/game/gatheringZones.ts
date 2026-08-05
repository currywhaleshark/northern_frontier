import { CONFIG } from './config';
import { treeStageFor } from './forestGrowth';
import { fishingBoatRoute, fishingWaterAccessForBuilding } from './fishingBoats';
import type { Building, BuildingTypeId, GameState, GatheringWorkArea, Tile } from './types';

export type GatheringBuildingType = Extract<BuildingTypeId, 'lumberCamp' | 'huntLodge' | 'herbHut' | 'tidalFishery' | 'fishingPort'>;
type GatheringAnchor = Pick<Building, 'type' | 'x' | 'y' | 'gatheringWorkArea'>;
type TilePoint = Pick<Tile, 'x' | 'y'>;

interface GatheringForestSummary {
  forestTiles: number;
  matureTrees: number;
}

function distanceSquared(anchor: Pick<GatheringWorkArea, 'x' | 'y'>, tile: TilePoint): number {
  const dx = tile.x - anchor.x;
  const dy = tile.y - anchor.y;
  return dx * dx + dy * dy;
}

function defaultRadius(type: GatheringBuildingType): number {
  if (type === 'huntLodge') return CONFIG.gatheringZones.huntLodgeRadius;
  if (type === 'herbHut') return CONFIG.gatheringZones.herbHutRadius;
  if (type === 'tidalFishery') return CONFIG.gatheringZones.tidalFisheryRadius;
  if (type === 'fishingPort') return CONFIG.gatheringZones.fishingPortRadius;
  return CONFIG.gatheringZones.lumberCampRadius;
}

export function isGatheringBuildingType(type: BuildingTypeId | null | undefined): type is GatheringBuildingType {
  return type === 'lumberCamp' || type === 'huntLodge' || type === 'herbHut' || type === 'tidalFishery' || type === 'fishingPort';
}

export function isTileInGatheringWorkArea(anchor: GatheringAnchor, tile: TilePoint): boolean {
  const area = gatheringWorkArea(anchor);
  return distanceSquared(area, tile) <= area.radius ** 2;
}

export function gatheringWorkArea(building: GatheringAnchor): GatheringWorkArea {
  const configured = building.gatheringWorkArea;
  const radius = configured?.radius;
  return {
    x: Number.isFinite(configured?.x) ? Math.round(configured!.x) : building.x,
    y: Number.isFinite(configured?.y) ? Math.round(configured!.y) : building.y,
    radius: Number.isFinite(radius)
      ? Math.max(CONFIG.gatheringZones.lumberCampMinRadius,
        Math.min(CONFIG.gatheringZones.lumberCampMaxRadius, Math.round(radius!)))
      : defaultRadius(building.type as GatheringBuildingType),
  };
}

export function adjustGatheringWorkArea(
  state: Pick<GameState, 'map' | 'buildings'>,
  buildingId: number,
  deltaX: number,
  deltaY: number,
  deltaRadius: number,
): string | null {
  const building = state.buildings.find(candidate =>
    candidate.id === buildingId && isGatheringBuildingType(candidate.type) && candidate.built);
  if (!building) return '완공된 채집 거점을 선택해야 합니다.';
  const current = gatheringWorkArea(building as GatheringAnchor);
  const mapWidth = state.map[0]?.length ?? 1;
  const mapHeight = state.map.length || 1;
  const nextX = Math.max(0, Math.min(mapWidth - 1, current.x + Math.trunc(deltaX)));
  const nextY = Math.max(0, Math.min(mapHeight - 1, current.y + Math.trunc(deltaY)));
  if (building.type === 'fishingPort' &&
      state.map[nextY]?.[nextX]?.terrain !== 'lake' && state.map[nextY]?.[nextX]?.terrain !== 'sea') {
    return '포구 작업영역의 중심은 같은 호수나 바다 위에 두어야 합니다.';
  }
  if (building.type === 'fishingPort' && !fishingWaterAccessForBuilding(state, building)
    .some(access => fishingBoatRoute(state.map, access, { x: nextX, y: nextY }).length > 0)) {
    return '포구와 물길이 이어진 같은 수역 안에서만 작업영역을 옮길 수 있습니다.';
  }
  building.gatheringWorkArea = {
    x: nextX,
    y: nextY,
    radius: Math.max(CONFIG.gatheringZones.lumberCampMinRadius,
      Math.min(CONFIG.gatheringZones.lumberCampMaxRadius, current.radius + Math.trunc(deltaRadius))),
  };
  return null;
}

export function gatheringForestSummary(
  state: Pick<GameState, 'map' | 'exploration'>,
  building: GatheringAnchor,
): GatheringForestSummary {
  const summary: GatheringForestSummary = { forestTiles: 0, matureTrees: 0 };
  const area = gatheringWorkArea(building);
  const radius = area.radius;
  for (let y = area.y - radius; y <= area.y + radius; y++) {
    const row = state.map[y];
    if (!row) continue;
    for (let x = area.x - radius; x <= area.x + radius; x++) {
      const tile = row[x];
      if (!tile || distanceSquared(area, tile) > radius ** 2) continue;
      if (state.exploration?.explored[y]?.[x] !== true || tile.terrain !== 'forest') continue;
      summary.forestTiles++;
      if (tile.buildingId == null && treeStageFor(tile) === 'mature') summary.matureTrees++;
    }
  }
  return summary;
}

// G1 공개 이름은 기존 호출부·저장 회귀 호환을 위해 유지한다.
export const lumberCampWorkArea = gatheringWorkArea;
export const isTileInLumberCampWorkArea = isTileInGatheringWorkArea;
export const adjustLumberCampWorkArea = adjustGatheringWorkArea;
export const lumberCampForestSummary = gatheringForestSummary;
