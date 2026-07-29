import { CONFIG } from './config';
import { cropIdForBuilding, CROP_DEFS } from './crops';
import { addLog } from './events';
import { withJosa } from './josa';
import type { DisasterId, GameState, PendingDisaster, WeatherId } from './types';

const DISASTER_IDS = new Set<DisasterId>([
  'earlyFrost',
  'lateFrost',
  'locust',
  'drought',
  'springFlood',
  'snowDamage',
  'epidemic',
  'livestockEpidemic',
  'mineCollapse',
  'fire',
]);

const FROST_WEATHERS = new Set<WeatherId>(['frost', 'coldSnap']);

function finiteDay(value: unknown): number | null {
  const day = Math.floor(Number(value));
  return Number.isFinite(day) && day >= 1 ? day : null;
}

export function normalizePendingDisasters(value: unknown): PendingDisaster[] {
  if (!Array.isArray(value)) return [];
  const normalized: PendingDisaster[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue;
    const candidate = raw as Partial<PendingDisaster>;
    if (!DISASTER_IDS.has(candidate.id as DisasterId) || typeof candidate.choiceId !== 'string') continue;
    const startedDay = finiteDay(candidate.startedDay);
    const resolveDay = finiteDay(candidate.resolveDay);
    if (startedDay == null || resolveDay == null || resolveDay < startedDay) continue;
    const targetBuildingIds = Array.isArray(candidate.targetBuildingIds)
      ? [...new Set(candidate.targetBuildingIds
        .map(id => Math.floor(Number(id)))
        .filter(id => Number.isFinite(id) && id >= 1))]
      : undefined;
    const progress = Number.isFinite(Number(candidate.progress))
      ? Math.max(0, Number(candidate.progress))
      : undefined;
    const data = candidate.data && typeof candidate.data === 'object'
      ? Object.fromEntries(Object.entries(candidate.data)
        .filter((entry): entry is [string, number] => Number.isFinite(Number(entry[1])))
        .map(([key, entryValue]) => [key, Number(entryValue)]))
      : undefined;
    normalized.push({
      id: candidate.id as DisasterId,
      choiceId: candidate.choiceId,
      startedDay,
      resolveDay,
      ...(targetBuildingIds && targetBuildingIds.length > 0 ? { targetBuildingIds } : {}),
      ...(progress != null ? { progress } : {}),
      ...(data && Object.keys(data).length > 0 ? { data } : {}),
    });
  }
  return normalized;
}

export function hasPendingDisaster(state: GameState, id: DisasterId): boolean {
  return state.pendingDisasters.some(disaster => disaster.id === id);
}

export function startEarlyFrostObservation(state: GameState, targetBuildingId: number): boolean {
  if (hasPendingDisaster(state, 'earlyFrost')) return false;
  state.pendingDisasters.push({
    id: 'earlyFrost',
    choiceId: 'wait-harvest',
    startedDay: state.day,
    resolveDay: state.day + CONFIG.disasters.earlyFrost.observationDays,
    targetBuildingIds: [targetBuildingId],
    progress: 0,
  });
  addLog(
    state,
    `수확을 미루고 ${CONFIG.disasters.earlyFrost.observationDays}일 동안 서리의 추이를 지켜봅니다.`,
    'info',
    true,
  );
  return true;
}

function resolveEarlyFrost(state: GameState, disaster: PendingDisaster): void {
  const targetId = disaster.targetBuildingIds?.[0];
  const farm = targetId == null
    ? undefined
    : state.buildings.find(building => building.id === targetId);
  const cropId = farm ? cropIdForBuilding(farm) : null;
  if (!farm || !cropId || farm.fieldGrowth <= 0) {
    addLog(state, '서리의 경과를 살피던 경작지에 더는 거둘 작물이 없어 관찰을 마쳤습니다.', 'info', true);
    return;
  }
  const frostDays = Math.max(0, Math.floor(disaster.progress ?? 0));
  if (frostDays < CONFIG.disasters.earlyFrost.failureFrostDays) {
    addLog(
      state,
      `서리가 오래 이어지지 않았습니다. ${withJosa(CROP_DEFS[cropId].name, '이/가')} 버텨 정상 수확을 기대할 수 있습니다.`,
      'good',
      true,
    );
    return;
  }
  const before = farm.fieldGrowth;
  farm.fieldGrowth *= CONFIG.disasters.earlyFrost.failureGrowthMultiplier;
  addLog(
    state,
    `${CONFIG.disasters.earlyFrost.observationDays}일 중 ${frostDays}일이나 찬 기운이 이어져 ` +
      `${withJosa(CROP_DEFS[cropId].name, '이/가')} 예상 소출의 ${Math.round(before - farm.fieldGrowth)}%를 잃었습니다.`,
    'bad',
    true,
  );
}

export function advancePendingDisasters(state: GameState): void {
  if (state.pendingDisasters.length === 0) return;
  const remaining: PendingDisaster[] = [];
  for (const disaster of state.pendingDisasters) {
    if (state.day > disaster.startedDay && state.day <= disaster.resolveDay &&
        disaster.id === 'earlyFrost' && FROST_WEATHERS.has(state.weather)) {
      disaster.progress = Math.max(0, disaster.progress ?? 0) + 1;
    }
    if (state.day < disaster.resolveDay) {
      remaining.push(disaster);
      continue;
    }
    if (disaster.id === 'earlyFrost') resolveEarlyFrost(state, disaster);
  }
  state.pendingDisasters = remaining;
}

export function pendingDisasterDaysRemaining(state: GameState, disaster: PendingDisaster): number {
  return Math.max(0, disaster.resolveDay - state.day);
}
