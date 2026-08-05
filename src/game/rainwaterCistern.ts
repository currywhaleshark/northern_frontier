import { CONFIG } from './config';
import { isDroughtActive } from './disasters';
import { addLog } from './events';
import { getSeason } from './seasons';
import type { Building, GameState } from './types';

const EPSILON = 1e-6;

export interface CisternStatus {
  stored: number;
  frozen: number;
  capacity: number;
  levelRatio: number;
  dailyOutput: number;
  radius: number;
  estimatedDays: number;
}

function finiteAmount(value: unknown): number {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.max(0, amount) : 0;
}

export function normalizeCisternState(building: Building): void {
  if (building.type !== 'rainwaterCistern') {
    delete building.cisternStored;
    delete building.cisternSnowStored;
    delete building.cisternDryWarningDay;
    return;
  }
  const capacity = CONFIG.water.cisternCapacity;
  const stored = Math.min(capacity, finiteAmount(building.cisternStored));
  const frozen = Math.min(capacity - stored, finiteAmount(building.cisternSnowStored));
  building.cisternStored = stored;
  building.cisternSnowStored = frozen;
  if (!Number.isFinite(building.cisternDryWarningDay)) delete building.cisternDryWarningDay;
  else building.cisternDryWarningDay = Math.floor(building.cisternDryWarningDay!);
}

export function initializeCisternState(building: Building): void {
  if (building.type !== 'rainwaterCistern') return;
  building.cisternStored = 0;
  building.cisternSnowStored = 0;
}

export function cisternStatus(state: GameState, building: Building): CisternStatus | null {
  if (!building.built || building.type !== 'rainwaterCistern') return null;
  const capacity = CONFIG.water.cisternCapacity;
  const stored = Math.min(capacity, finiteAmount(building.cisternStored));
  const frozen = Math.min(capacity - stored, finiteAmount(building.cisternSnowStored));
  const winterMultiplier = getSeason(state.day) === 'winter'
    ? CONFIG.water.cisternWinterOutputMultiplier
    : 1;
  const dailyOutput = Math.min(stored, CONFIG.water.cisternDailyOutput * winterMultiplier);
  return {
    stored,
    frozen,
    capacity,
    levelRatio: (stored + frozen) / Math.max(1, capacity),
    dailyOutput,
    radius: CONFIG.water.cisternRadius,
    estimatedDays: dailyOutput > EPSILON ? stored / dailyOutput : 0,
  };
}

export function dailyCisternTick(
  state: GameState,
  consumptionByBuilding: ReadonlyMap<number, number>,
): void {
  const drought = isDroughtActive(state);
  const winter = getSeason(state.day) === 'winter';
  for (const building of state.buildings) {
    if (!building.built || building.type !== 'rainwaterCistern') continue;
    normalizeCisternState(building);
    const capacity = CONFIG.water.cisternCapacity;
    const before = building.cisternStored ?? 0;
    building.cisternStored = Math.max(
      0,
      before - Math.max(0, consumptionByBuilding.get(building.id) ?? 0),
    );

    if (!winter && (building.cisternSnowStored ?? 0) > EPSILON) {
      const room = Math.max(0, capacity - building.cisternStored);
      const thawed = Math.min(room, building.cisternSnowStored ?? 0);
      building.cisternStored += thawed;
      building.cisternSnowStored = Math.max(0, (building.cisternSnowStored ?? 0) - thawed);
    }

    if (state.weather === 'rain' || state.weather === 'thawFlood') {
      const room = Math.max(0, capacity - building.cisternStored - (building.cisternSnowStored ?? 0));
      building.cisternStored += Math.min(room, CONFIG.water.cisternRainFillPerDay);
    } else if (state.weather === 'heavySnow' || state.weather === 'blizzard') {
      const room = Math.max(0, capacity - building.cisternStored - (building.cisternSnowStored ?? 0));
      building.cisternSnowStored = (building.cisternSnowStored ?? 0) +
        Math.min(room, CONFIG.water.cisternSnowFillPerDay);
    }

    if (drought && building.cisternStored > EPSILON) {
      building.cisternStored = Math.max(0, building.cisternStored - CONFIG.water.cisternDroughtEvaporationPerDay);
    }

    if (before > EPSILON && building.cisternStored <= EPSILON &&
        state.day - (building.cisternDryWarningDay ?? -9999) >= CONFIG.water.cisternDryWarningCooldownDays) {
      building.cisternDryWarningDay = state.day;
      addLog(state, '빗물 저수조가 말랐습니다. 비가 오기 전까지 생활용수를 공급하지 못합니다.', 'bad', true);
    }
  }
}
