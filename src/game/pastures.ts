import { CONFIG } from './config';
import { isExplored } from './exploration';
import { foreignSiteAt } from './foreignSites';
import type { Building, GameState, LivestockId, PastureArea } from './types';

function finiteInteger(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.floor(numeric) : null;
}

export function normalizePastureArea(raw: unknown): PastureArea | null {
  if (!raw || typeof raw !== 'object') return null;
  const candidate = raw as Partial<PastureArea>;
  const x = finiteInteger(candidate.x);
  const y = finiteInteger(candidate.y);
  const rawW = finiteInteger(candidate.w);
  const rawH = finiteInteger(candidate.h);
  if (x == null || y == null || rawW == null || rawH == null || x < 0 || y < 0 || rawW < 1 || rawH < 1) {
    return null;
  }
  return {
    x,
    y,
    w: Math.min(CONFIG.pasture.maxSide, rawW),
    h: Math.min(CONFIG.pasture.maxSide, rawH),
  };
}

type OperationalPastureBuilding = Pick<Building, 'pasture'> & Partial<Pick<Building, 'expansion'>>;

export function pastureTileCount(building: OperationalPastureBuilding): number {
  const expansion = building.expansion?.kind === 'pasture' ? building.expansion : null;
  const pasture = normalizePastureArea(expansion?.fromArea ?? building.pasture);
  return pasture ? pasture.w * pasture.h : 0;
}

export function pastureRequiredHerders(
  building: Pick<Building, 'type' | 'pasture'> & Partial<Pick<Building, 'expansion'>>,
): number {
  if (building.type !== 'stable') return 0;
  const area = pastureTileCount(building);
  return area > 0 ? Math.max(1, Math.ceil(area / CONFIG.pasture.tilesPerHerder)) : 2;
}

export function stableLivestockCapacity(
  building: Pick<Building, 'type' | 'pasture'> & Partial<Pick<Building, 'expansion'>>,
  species: LivestockId,
): number {
  if (building.type !== 'stable') return 0;
  const area = pastureTileCount(building);
  if (area <= 0) return CONFIG.livestock[species].capacity;
  return Math.max(1, Math.floor(area * CONFIG.pasture.capacityPerTile[species]));
}

export function pastureContains(area: PastureArea | undefined, x: number, y: number): boolean {
  return !!area && x >= area.x && y >= area.y && x < area.x + area.w && y < area.y + area.h;
}

function rectanglesOverlap(a: PastureArea, b: PastureArea): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function sharesStableEdge(stable: Pick<Building, 'x' | 'y'>, pasture: PastureArea): boolean {
  const stableRect: PastureArea = { x: stable.x, y: stable.y, w: 2, h: 2 };
  const overlapsVertically = pasture.y < stableRect.y + stableRect.h && pasture.y + pasture.h > stableRect.y;
  const overlapsHorizontally = pasture.x < stableRect.x + stableRect.w && pasture.x + pasture.w > stableRect.x;
  return (
    overlapsVertically &&
    (pasture.x + pasture.w === stableRect.x || stableRect.x + stableRect.w === pasture.x)
  ) || (
    overlapsHorizontally &&
    (pasture.y + pasture.h === stableRect.y || stableRect.y + stableRect.h === pasture.y)
  );
}

export function validateStablePasture(
  state: GameState,
  stableId: number,
  rawArea: PastureArea,
): string | null {
  const stable = state.buildings.find(building => building.id === stableId);
  if (!stable || stable.type !== 'stable' || !stable.built) return '완공된 축사를 선택해야 합니다.';
  const area = normalizePastureArea(rawArea);
  if (!area) return '방목지 크기가 올바르지 않습니다.';
  if (!sharesStableEdge(stable, area)) return '방목지는 축사의 한 변에 붙어 있어야 합니다.';

  const tiles = [];
  for (let y = area.y; y < area.y + area.h; y++) {
    for (let x = area.x; x < area.x + area.w; x++) {
      const tile = state.map[y]?.[x];
      if (!tile) return '지도 밖입니다.';
      tiles.push(tile);
    }
  }
  if (tiles.some(tile => !isExplored(state, tile.x, tile.y))) return '아직 답사하지 않은 곳입니다.';
  if (tiles.some(tile => tile.terrain !== 'plain' && tile.terrain !== 'fertile')) {
    return '방목지는 비어 있는 평지나 비옥지에만 지정할 수 있습니다.';
  }
  if (tiles.some(tile => tile.buildingId != null || foreignSiteAt(state, tile.x, tile.y))) {
    return '건물이나 현지 거점이 있는 칸은 방목지로 쓸 수 없습니다.';
  }
  if (state.buildings.some(building =>
    building.id !== stable.id &&
    building.pasture &&
    rectanglesOverlap(area, building.pasture))) {
    return '다른 축사의 방목지와 겹칩니다.';
  }
  const species = stable.livestock?.species ?? 'chicken';
  const capacity = stableLivestockCapacity({ ...stable, pasture: area }, species);
  if ((stable.livestock?.headcount ?? 0) > capacity) {
    const speciesName = species === 'chicken' ? '닭'
      : species === 'goat' ? '염소'
        : species === 'sheep' ? '양'
          : species === 'pig' ? '돼지'
            : species === 'cattle' ? '소'
              : '군마';
    return `현재 ${speciesName}를 수용하려면 더 넓은 방목지가 필요합니다.`;
  }
  return null;
}

export function setStablePasture(
  state: GameState,
  stableId: number,
  rawArea: PastureArea,
): string | null {
  const error = validateStablePasture(state, stableId, rawArea);
  if (error) return error;
  const stable = state.buildings.find(building => building.id === stableId)!;
  stable.pasture = normalizePastureArea(rawArea)!;
  return null;
}
