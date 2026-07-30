// 공사터 개간 — 나무를 낀 자리에 건물을 지정하면, 벌목꾼이 먼저 그 나무를 베어
// 자리를 비운 뒤에야 건축가·농부가 공사를 시작한다.
//
// 예전에는 배치하는 순간 나무가 사라지고 목재가 즉시 들어왔다. 지금은 나무가 그대로
// 서 있고, 벌목꾼이 실제로 베어 옮겨야 한다 — 그래서 밭도 숲을 끼고 지정할 수 있다.
import { BUILDING_DEFS, buildingFootprintTiles, isAreaBuildingType } from './buildings';
import { CONFIG } from './config';
import type { Building, BuildingDef, BuildingTypeId, GameState, Resident, Tile } from './types';

/** 벌목한 자리는 평지가 된다 — 평지에 지을 수 있는 건물은 나무를 끼고 지정할 수 있다.
 *  논도 강·유효 수로 인접 조건을 만족하면 숲을 포함해 지정하고 먼저 개간할 수 있다. */
export function acceptsClearedLand(def: BuildingDef): boolean {
  return def.placement === 'land' || def.placement === 'field' || def.placement === 'paddy';
}

export function isClearableForestTile(tile: Tile | undefined): boolean {
  return !!tile && tile.terrain === 'forest';
}

/** 배치·확장 미리보기용 — 아직 건물이 없는 사각형 안에서 베어야 할 나무 칸 */
export function forestTilesInFootprint(
  state: GameState,
  type: BuildingTypeId,
  x: number,
  y: number,
  w?: number,
  h?: number,
): Tile[] {
  if (!acceptsClearedLand(BUILDING_DEFS[type])) return [];
  const tiles = buildingFootprintTiles(state, type, x, y, w, h);
  if (!tiles) return [];
  return tiles.filter(isClearableForestTile);
}

/** 확장 목표 사각형 안에서 베어야 할 나무 칸 (기존 영역은 이미 비어 있다) */
export function forestTilesInArea(
  state: GameState,
  type: BuildingTypeId,
  area: { x: number; y: number; w: number; h: number },
): Tile[] {
  if (!acceptsClearedLand(BUILDING_DEFS[type])) return [];
  const tiles: Tile[] = [];
  for (let ty = area.y; ty < area.y + area.h; ty++) {
    for (let tx = area.x; tx < area.x + area.w; tx++) {
      const tile = state.map[ty]?.[tx];
      if (isClearableForestTile(tile)) tiles.push(tile!);
    }
  }
  return tiles;
}

/**
 * 이 건물의 공사 자리에 아직 서 있는 나무 — 공사는 이게 빌 때까지 기다린다.
 * 이전 중이면 옛 자리가 아니라 옮겨 갈 자리를 본다. 그래야 해체하는 동안
 * 벌목꾼이 새 자리를 미리 치워 두고, 해체가 끝나면 바로 재건축으로 넘어간다.
 */
export function pendingClearingTiles(state: GameState, building: Building): Tile[] {
  const def = BUILDING_DEFS[building.type];
  if (!acceptsClearedLand(def)) return [];
  const relocation = building.workOrder?.kind === 'relocate'
    ? building.workOrder.destination
    : undefined;
  if (relocation) return forestTilesInArea(state, building.type, relocation);
  const w = isAreaBuildingType(building.type) ? building.w : undefined;
  const h = isAreaBuildingType(building.type) ? building.h : undefined;
  const tiles = buildingFootprintTiles(state, building.type, building.x, building.y, w, h);
  if (!tiles) return [];
  return tiles.filter(isClearableForestTile);
}

/** 이 건물이 벌목을 기다리는 일감인가 (신축·영역 확장·이전 목적지) */
export function awaitsClearing(state: GameState, building: Building): boolean {
  if (building.repairing) return false;
  if (building.workOrder) {
    if (building.workOrder.kind !== 'relocate') return false;
  } else if (building.built && !building.expansion) {
    return false;
  }
  return pendingClearingTiles(state, building).length > 0;
}

/**
 * 나무 때문에 지금 당장 공사를 못 하는 상태인가.
 * 이전의 '해체'는 옛 자리에서 하는 일이라 새 자리 나무와 무관하다 — 그 사이에도
 * 건축가는 계속 해체하고, 벌목꾼은 새 자리를 친다. 막히는 건 '재건축'부터다.
 */
export function clearingBlocksWork(state: GameState, building: Building): boolean {
  if (building.workOrder?.kind === 'relocate' && building.workOrder.phase === 'dismantling') {
    return false;
  }
  return awaitsClearing(state, building);
}

export interface ClearingSite {
  building: Building;
  tiles: Tile[];
}

/** 벌목이 필요한 공사터 목록. 순서는 건설 우선도와 같다 —
 *  우선 지정 건물이 맨 앞, 나머지는 건물 id 순으로 안정적으로 정렬한다. */
export function clearingSites(state: GameState): ClearingSite[] {
  const sites: ClearingSite[] = [];
  for (const building of state.buildings) {
    if (!awaitsClearing(state, building)) continue;
    sites.push({ building, tiles: pendingClearingTiles(state, building) });
  }
  sites.sort((a, b) => {
    const priority = state.priorityBuildingId;
    if (priority != null) {
      if (a.building.id === priority) return -1;
      if (b.building.id === priority) return 1;
    }
    return a.building.id - b.building.id;
  });
  return sites;
}

/**
 * 이번 서브틱에 각 벌목꾼이 맡을 공사터를 정한다 (주민 id → 건물 id).
 *
 * 한 공사터에 벌목꾼이 우르르 몰리지 않도록 현장당 인원을 제한하고, 남은 벌목꾼은
 * 다음 공사터로 넘어간다 — 그래서 벌목꾼이 많으면 여러 공사터를 동시에 열 수 있다.
 * 현장마다 가장 가까운 사람부터 배정하므로 배정이 프레임마다 흔들리지 않는다.
 */
export function assignClearingCrews(
  state: GameState,
  woodcutters: readonly Resident[],
): Map<number, number> {
  const assignment = new Map<number, number>();
  if (woodcutters.length === 0) return assignment;
  const sites = clearingSites(state);
  if (sites.length === 0) return assignment;

  const maxPerSite = Math.max(1, CONFIG.agents.clearingCuttersPerSite);
  const available = [...woodcutters];
  for (const site of sites) {
    if (available.length === 0) break;
    // 나무 한 그루에 두 사람을 보낼 이유는 없다
    const crewSize = Math.min(maxPerSite, site.tiles.length, available.length);
    for (let picked = 0; picked < crewSize; picked++) {
      let bestIndex = 0;
      let bestDistance = Infinity;
      for (let index = 0; index < available.length; index++) {
        const worker = available[index];
        let nearest = Infinity;
        for (const tile of site.tiles) {
          const distance = Math.abs(tile.x - worker.x) + Math.abs(tile.y - worker.y);
          if (distance < nearest) nearest = distance;
        }
        // 거리가 같으면 id 순 — 같은 배정이 반복되도록 고정한다
        if (nearest < bestDistance || (nearest === bestDistance && worker.id < available[bestIndex].id)) {
          bestDistance = nearest;
          bestIndex = index;
        }
      }
      const [chosen] = available.splice(bestIndex, 1);
      assignment.set(chosen.id, site.building.id);
    }
  }
  return assignment;
}
