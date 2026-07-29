import { CONFIG } from './config';
import { cropIdForBuilding, CROP_DEFS } from './crops';
import { addLog } from './events';
import { withJosa } from './josa';
import type { Building, CropId, DisasterId, GameState, PendingDisaster, WeatherId } from './types';

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

export function lateFrostRecoveryCropId(building: Pick<Building, 'type'>): CropId | null {
  if (building.type === 'field') return 'buckwheat';
  if (building.type === 'paddy') return 'rice';
  return null;
}

export function startLateFrostObservation(state: GameState, targetBuildingId: number): boolean {
  if (hasPendingDisaster(state, 'lateFrost')) return false;
  state.pendingDisasters.push({
    id: 'lateFrost',
    choiceId: 'wait-replant',
    startedDay: state.day,
    resolveDay: state.day + CONFIG.disasters.lateFrost.observationDays,
    targetBuildingIds: [targetBuildingId],
    progress: 0,
  });
  addLog(
    state,
    `갈아엎지 않고 ${CONFIG.disasters.lateFrost.observationDays}일 동안 새싹이 버티는지 지켜봅니다.`,
    'info',
    true,
  );
  return true;
}

export function startLocustInfestation(
  state: GameState,
  targetBuildingIds: number[],
  durationDays: number,
): boolean {
  if (hasPendingDisaster(state, 'locust')) return false;
  const [minimumDuration, maximumDuration] = CONFIG.disasters.locust.durationDays;
  const requestedDuration = Math.floor(durationDays);
  const duration = Number.isFinite(requestedDuration)
    ? Math.max(minimumDuration, Math.min(maximumDuration, requestedDuration))
    : minimumDuration;
  const targets = [...new Set(targetBuildingIds.filter(id => Number.isInteger(id) && id >= 1))];
  if (targets.length === 0) return false;
  state.pendingDisasters.push({
    id: 'locust',
    choiceId: 'endure',
    startedDay: state.day,
    resolveDay: state.day + duration,
    targetBuildingIds: targets,
    progress: 0,
  });
  addLog(state, '황충 떼가 경작지에 내려앉아 잎과 이삭을 갉아먹기 시작했습니다.', 'bad', true);
  return true;
}

export function startDrought(state: GameState, durationDays: number): boolean {
  if (hasPendingDisaster(state, 'drought')) return false;
  const [minimumDuration, maximumDuration] = CONFIG.disasters.drought.durationDays;
  const requestedDuration = Math.floor(durationDays);
  const duration = Number.isFinite(requestedDuration)
    ? Math.max(minimumDuration, Math.min(maximumDuration, requestedDuration))
    : minimumDuration;
  state.pendingDisasters.push({
    id: 'drought',
    choiceId: 'declared',
    startedDay: state.day,
    resolveDay: state.day + duration,
    progress: 0,
  });
  addLog(state, '며칠째 비가 끊기고 강물이 줄어 가뭄이 들었습니다.', 'bad', true);
  return true;
}

export function isDroughtActive(state: Pick<GameState, 'pendingDisasters'>): boolean {
  return state.pendingDisasters.some(disaster => disaster.id === 'drought');
}

export function isFarmIrrigatedByWeir(
  state: Pick<GameState, 'buildings'>,
  farm: Pick<Building, 'type' | 'x' | 'y' | 'w' | 'h'>,
): boolean {
  if (farm.type !== 'field' && farm.type !== 'paddy') return false;
  const width = Math.max(1, Math.floor(farm.w ?? 1));
  const height = Math.max(1, Math.floor(farm.h ?? 1));
  const right = farm.x + width - 1;
  const bottom = farm.y + height - 1;
  return state.buildings.some(building => {
    if (building.type !== 'weir' || !building.built) return false;
    const dx = building.x < farm.x ? farm.x - building.x : building.x > right ? building.x - right : 0;
    const dy = building.y < farm.y ? farm.y - building.y : building.y > bottom ? building.y - bottom : 0;
    return Math.max(dx, dy) <= CONFIG.disasters.drought.weirRadius;
  });
}

export function droughtFarmGrowthMultiplier(state: GameState, farm: Building): number {
  if (!isDroughtActive(state)) return 1;
  return isFarmIrrigatedByWeir(state, farm)
    ? CONFIG.disasters.drought.irrigatedFarmGrowthMultiplier
    : CONFIG.disasters.drought.farmGrowthMultiplier;
}

export function droughtFishYieldMultiplier(state: GameState): number {
  return isDroughtActive(state) ? CONFIG.disasters.drought.fishYieldMultiplier : 1;
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

function resolveLateFrost(state: GameState, disaster: PendingDisaster): void {
  const targetId = disaster.targetBuildingIds?.[0];
  const farm = targetId == null
    ? undefined
    : state.buildings.find(building => building.id === targetId);
  const cropId = farm ? cropIdForBuilding(farm) : null;
  if (!farm || !cropId || farm.fieldGrowth <= 0) {
    addLog(state, '늦서리를 지켜보던 경작지에 더는 살필 새싹이 없어 관찰을 마쳤습니다.', 'info', true);
    return;
  }
  const frostDays = Math.max(0, Math.floor(disaster.progress ?? 0));
  if (frostDays < CONFIG.disasters.lateFrost.failureFrostDays) {
    addLog(
      state,
      `늦서리가 오래 이어지지 않았습니다. ${withJosa(CROP_DEFS[cropId].name, '이/가')} 다시 기운을 차렸습니다.`,
      'good',
      true,
    );
    return;
  }
  farm.fieldGrowth = 0;
  farm.sownArea = 0;
  farm.cropId = null;
  farm.queuedCropId = null;
  addLog(
    state,
    `${CONFIG.disasters.lateFrost.observationDays}일 중 ${frostDays}일이나 찬 기운이 이어져 ` +
      `${withJosa(CROP_DEFS[cropId].name, '이/가')} 고사했습니다. 여름 작물을 다시 심을 수 있습니다.`,
    'bad',
    true,
  );
}

function damageLocustFarms(state: GameState, disaster: PendingDisaster): void {
  let lostGrowth = 0;
  for (const id of disaster.targetBuildingIds ?? []) {
    const farm = state.buildings.find(building => building.id === id);
    if (!farm || (farm.type !== 'field' && farm.type !== 'paddy') || farm.fieldGrowth <= 0) continue;
    const loss = Math.min(farm.fieldGrowth, CONFIG.disasters.locust.dailyGrowthLoss);
    farm.fieldGrowth -= loss;
    if (farm.fieldGrowth <= 0.5) {
      farm.fieldGrowth = 0;
      farm.sownArea = 0;
    }
    lostGrowth += loss;
  }
  disaster.progress = Math.max(0, disaster.progress ?? 0) + lostGrowth;
}

function resolveLocust(state: GameState, disaster: PendingDisaster): void {
  const lostGrowth = Math.round(Math.max(0, disaster.progress ?? 0));
  addLog(
    state,
    lostGrowth > 0
      ? `황충 떼가 다른 들판으로 떠났습니다. 경작지 성장도를 모두 합쳐 ${lostGrowth}%p 갉아먹었습니다.`
      : '황충 떼가 떠났지만 이미 남아 있던 작물이 없었습니다.',
    lostGrowth > 0 ? 'bad' : 'info',
    true,
  );
}

function resolveDrought(state: GameState, endedByRain: boolean): void {
  addLog(
    state,
    endedByRain
      ? '마침내 비가 내려 메마른 땅을 적셨습니다. 가뭄이 풀렸습니다.'
      : '강물이 차츰 돌아오고 메마른 기운이 누그러져 가뭄이 끝났습니다.',
    'good',
    true,
  );
}

export function advancePendingDisasters(state: GameState): void {
  if (state.pendingDisasters.length === 0) return;
  const remaining: PendingDisaster[] = [];
  for (const disaster of state.pendingDisasters) {
    if (disaster.id === 'drought' && state.day > disaster.startedDay && state.weather === 'rain') {
      resolveDrought(state, true);
      continue;
    }
    if (state.day > disaster.startedDay && state.day <= disaster.resolveDay &&
        (disaster.id === 'earlyFrost' || disaster.id === 'lateFrost') && FROST_WEATHERS.has(state.weather)) {
      disaster.progress = Math.max(0, disaster.progress ?? 0) + 1;
    }
    if (state.day > disaster.startedDay && state.day <= disaster.resolveDay && disaster.id === 'locust') {
      damageLocustFarms(state, disaster);
    }
    if (state.day < disaster.resolveDay) {
      remaining.push(disaster);
      continue;
    }
    if (disaster.id === 'earlyFrost') resolveEarlyFrost(state, disaster);
    else if (disaster.id === 'lateFrost') resolveLateFrost(state, disaster);
    else if (disaster.id === 'locust') resolveLocust(state, disaster);
    else if (disaster.id === 'drought') resolveDrought(state, false);
  }
  state.pendingDisasters = remaining;
}

export function pendingDisasterDaysRemaining(state: GameState, disaster: PendingDisaster): number {
  return Math.max(0, disaster.resolveDay - state.day);
}
