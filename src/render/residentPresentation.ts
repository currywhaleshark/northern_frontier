import { CONFIG } from '../game/config';
import { isIndoors } from '../game/dayCycle';
import { buildingWorkerSlots } from '../game/buildingWorkerSlots';
import { assignedSlotResidents } from '../game/workerSlots';
import { mineralRemaining } from '../game/minerals';
import { isTileInMineWorkArea } from '../game/miningSites';
import { isVeinSealedTile } from '../game/silver';
import {
  residentActiveWorkplace,
  workplacePresentation,
} from '../game/workplacePresentation';
import type { Building, GameState, Resident } from '../game/types';
import { selectOxPlowFarmerIds } from './residentFarmerAssets';
import {
  residentWorkStances,
  type ResidentWorkStance,
  type WorkLayoutTarget,
  type WorkLayoutResident,
} from './residentWorkLayout';
import { workAnchor } from './spriteStudioRegistries';

const CARDINAL_DIRECTIONS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;

function adjacentMinerWorkTarget(
  state: GameState,
  resident: WorkLayoutResident,
  buildingById: ReadonlyMap<number, Building>,
) {
  if (resident.job !== 'miner' || resident.phase !== 'working' ||
      resident.x !== resident.px || resident.y !== resident.py) return null;
  const mine = resident.assignedBuildingId == null ? null : buildingById.get(resident.assignedBuildingId);
  if (!mine || mine.type !== 'mine') return null;
  for (const [dx, dy] of CARDINAL_DIRECTIONS) {
    const tile = state.map[resident.y + dy]?.[resident.x + dx];
    if (tile && isTileInMineWorkArea(mine, tile) && tile.terrain === 'rock' &&
        mineralRemaining(tile) > 0 && !isVeinSealedTile(state, tile)) {
      return { x: tile.x, y: tile.y, terrain: tile.terrain };
    }
  }
  return null;
}

/**
 * 등록된 자리에 실제로 서 있는 근무자의 자세. 자리 밖이면 null이라
 * 이동 중이거나 폴백으로 다른 칸에 선 근무자는 평소대로 벌려 세운다.
 */
function workerSlotStance(
  resident: Resident,
  building: Building,
  slotWorkersOf: (building: Building) => readonly Resident[],
): ResidentWorkStance | null {
  const slots = buildingWorkerSlots(building.type);
  if (slots.length === 0) return null;
  const index = slotWorkersOf(building).findIndex(worker => worker.id === resident.id);
  if (index < 0) return null;
  const slot = slots[index % slots.length];
  if (resident.x !== building.x + slot.tileDX || resident.y !== building.y + slot.tileDY) return null;
  return {
    offsetX: slot.offsetX,
    offsetY: slot.offsetY,
    // facing 0 = 기존 계산 유지. 이 자리 근무자는 정지 상태라 렌더러 기본값과 같다.
    facing: slot.facing !== 0 ? slot.facing : (resident.x < resident.px ? -1 : 1),
  };
}

export interface ResidentPresentationSnapshot {
  buildingById: ReadonlyMap<number, Building>;
  indoorResidentIds: ReadonlySet<number>;
  workplaceActiveCountByBuilding: ReadonlyMap<number, number>;
  workStances: ReadonlyMap<number, ResidentWorkStance>;
  workTargets: ReadonlyMap<number, WorkLayoutTarget>;
  oxPlowFarmerIds: ReadonlySet<number>;
}

export function buildResidentPresentationSnapshot(state: GameState): ResidentPresentationSnapshot {
  const buildingById = new Map<number, Building>();
  for (const building of state.buildings) buildingById.set(building.id, building);

  const indoorResidentIds = new Set<number>();
  const workplaceActiveCountByBuilding = new Map<number, number>();
  const slotStances = new Map<number, ResidentWorkStance>();
  // 배정 순번 조회는 건물마다 한 번만 — 근무자마다 부르면 주민 수의 제곱이 된다.
  const slotWorkerCache = new Map<number, readonly Resident[]>();
  const slotWorkersOf = (building: Building): readonly Resident[] => {
    let workers = slotWorkerCache.get(building.id);
    if (!workers) {
      workers = assignedSlotResidents(state, building);
      slotWorkerCache.set(building.id, workers);
    }
    return workers;
  };

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
    if (presentation.mode !== 'interior') {
      const stance = workerSlotStance(resident, building, slotWorkersOf);
      if (stance) slotStances.set(resident.id, stance);
    }
  }

  // 자리에 선 근무자는 벌리기에서 빼고 자리 값을 그대로 쓴다 — 정해진 칸에 고정하는 것이
  // 목적인데 같은 칸의 다른 사람 때문에 다시 밀리면 의미가 없다.
  const spreadExcluded = slotStances.size === 0
    ? indoorResidentIds
    : new Set([...indoorResidentIds, ...slotStances.keys()]);
  const workTargets = new Map<number, WorkLayoutTarget>();
  for (const resident of state.residents) {
    const target = adjacentMinerWorkTarget(state, resident, buildingById);
    if (target) workTargets.set(resident.id, target);
  }
  const workStances = residentWorkStances(
    state.residents,
    CONFIG.ui.tileSize,
    spreadExcluded,
    (x, y) => state.map?.[y]?.[x]?.terrain,
    workAnchor,
    resident => workTargets.get(resident.id) ?? null,
  );
  for (const [id, stance] of slotStances) workStances.set(id, stance);

  return {
    buildingById,
    indoorResidentIds,
    workplaceActiveCountByBuilding,
    workStances,
    workTargets,
    oxPlowFarmerIds: selectOxPlowFarmerIds(state.buildings, state.residents),
  };
}

interface ResidentPresentationSnapshotCache {
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
