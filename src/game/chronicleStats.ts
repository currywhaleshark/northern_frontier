// 연대기 통계 — 현재값 공용 산식과 누적/연도별 기록.
//
// 화면이 임의로 다시 세지 않도록 산식을 게임 계층 한 곳에 둔다.
// 계획: docs/DESIGN-2026-07-29-chronicle-screen.md §3
import { isPlotBuildingType, plotArea } from './buildings';
import { createCombatRoster } from './combatRoster';
import { foodTotal, fuelHeatTotal } from './consumption';
import { getYear } from './seasons';
import type {
  BuildingTypeId, DeathCauseId, GameState, LifetimeStats, YearlySnapshot,
} from './types';

export interface CultivatedArea {
  fieldTiles: number;
  paddyTiles: number;
  totalTiles: number;
}

export interface FortificationStats {
  palisadeSegments: number;
  earthFortSegments: number;
  stoneWallSegments: number;
  gates: number;
  watchtowers: number;
  beacons: number;
}

const WALL_SEGMENT_TYPES = new Set<BuildingTypeId>(['palisade', 'earthFort', 'stoneWall']);
const NON_GENERAL_TYPES = new Set<BuildingTypeId>([
  'field', 'paddy', 'palisade', 'earthFort', 'stoneWall', 'gate',
]);

/** 완공된 밭·논의 확장 포함 면적(칸). 묘역·성벽·공사 중은 넣지 않는다. */
export function cultivatedArea(state: GameState): CultivatedArea {
  let fieldTiles = 0;
  let paddyTiles = 0;
  for (const building of state.buildings) {
    if (!building.built || !isPlotBuildingType(building.type)) continue;
    const area = plotArea(building);
    if (building.type === 'field') fieldTiles += area;
    else paddyTiles += area;
  }
  return { fieldTiles, paddyTiles, totalTiles: fieldTiles + paddyTiles };
}

/** 완공된 일반 건물 수 — 경작지·성벽 계열은 농업·방어 통계로 따로 보낸다. */
export function generalBuildingCounts(state: GameState): Partial<Record<BuildingTypeId, number>> {
  const counts: Partial<Record<BuildingTypeId, number>> = {};
  for (const building of state.buildings) {
    if (!building.built || NON_GENERAL_TYPES.has(building.type)) continue;
    counts[building.type] = (counts[building.type] ?? 0) + 1;
  }
  return counts;
}

export function generalBuildingTotal(state: GameState): number {
  let total = 0;
  for (const count of Object.values(generalBuildingCounts(state))) total += count ?? 0;
  return total;
}

/** 방어시설 — 성벽 1건물 = 1구간. 성문·망루·봉수는 길이에 섞지 않고 개수로 따로. */
export function fortificationStats(state: GameState): FortificationStats {
  const stats: FortificationStats = {
    palisadeSegments: 0, earthFortSegments: 0, stoneWallSegments: 0,
    gates: 0, watchtowers: 0, beacons: 0,
  };
  for (const building of state.buildings) {
    if (!building.built) continue;
    if (building.type === 'palisade') stats.palisadeSegments++;
    else if (building.type === 'earthFort') stats.earthFortSegments++;
    else if (building.type === 'stoneWall') stats.stoneWallSegments++;
    else if (building.type === 'gate') stats.gates++;
    else if (building.type === 'watchtower') stats.watchtowers++;
    else if (building.type === 'beacon') stats.beacons++;
  }
  return stats;
}

export function wallSegmentTotal(state: GameState): number {
  let total = 0;
  for (const building of state.buildings) {
    if (building.built && WALL_SEGMENT_TYPES.has(building.type)) total++;
  }
  return total;
}

/** 실제 전투 가능 주민 수 — 직업명·무기 수량으로 추정하지 않고 로스터 판정을 그대로 쓴다. */
export function combatReadyResidentCount(state: GameState): number {
  return createCombatRoster(state, { context: 'villageDefense' }).combatants.length;
}

// ── 누적/연도별 기록 ──

export function createLifetimeStats(trackingSinceDay: number): LifetimeStats {
  return {
    trackingSinceDay,
    births: 0,
    deathsByCause: { combat: 0, starvation: 0, cold: 0, disease: 0, other: 0 },
    raidsRepelled: 0,
    raidsSuffered: 0,
    tradesCompleted: 0,
    grantsReceived: 0,
  };
}

export function countDeath(state: GameState, cause: DeathCauseId): void {
  state.lifetimeStats.deathsByCause[cause] = (state.lifetimeStats.deathsByCause[cause] ?? 0) + 1;
}

/** 연초 스냅샷 1건 — 같은 연도가 이미 있으면 아무 일도 하지 않는다 (저장·로드 안전). */
export function recordYearlySnapshot(state: GameState): void {
  const year = getYear(state.day);
  if (state.yearlySnapshots.some(snapshot => snapshot.year === year)) return;
  const area = cultivatedArea(state);
  const snapshot: YearlySnapshot = {
    year,
    population: state.residents.filter(resident => resident.alive).length,
    food: Math.round(foodTotal(state)),
    fuelHeat: Math.round(fuelHeatTotal(state)),
    combatReadyResidents: combatReadyResidentCount(state),
    buildings: generalBuildingTotal(state),
    fieldTiles: area.fieldTiles,
    paddyTiles: area.paddyTiles,
    wallSegments: wallSegmentTotal(state),
    silver: Math.round(state.resources.silver ?? 0),
  };
  state.yearlySnapshots.push(snapshot);
}
