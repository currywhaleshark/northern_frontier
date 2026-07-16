import { CONFIG } from './config';
import { addLog } from './events';
import { addBuildingStock } from './inventory';
import type { Building, GameState, LivestockId, LivestockState } from './types';

export const LIVESTOCK_IDS = ['chicken', 'goat', 'sheep', 'cattle', 'horse'] as const satisfies readonly LivestockId[];
export const IMPLEMENTED_LIVESTOCK_IDS = ['chicken'] as const satisfies readonly LivestockId[];

export const LIVESTOCK_DEFS = {
  chicken: { name: '닭', icon: '🐔' },
} as const;

export interface LivestockDailyReport {
  grainConsumed: number;
  births: number;
  deaths: number;
}

function finiteNonNegative(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function isLivestockId(value: unknown): value is LivestockId {
  return typeof value === 'string' && (LIVESTOCK_IDS as readonly string[]).includes(value);
}

export function isImplementedLivestockId(value: unknown): value is typeof IMPLEMENTED_LIVESTOCK_IDS[number] {
  return typeof value === 'string' && (IMPLEMENTED_LIVESTOCK_IDS as readonly string[]).includes(value);
}

export function createDefaultLivestockState(headcount: number = CONFIG.livestock.chicken.initialHeadcount): LivestockState {
  return {
    species: 'chicken',
    headcount: Math.min(CONFIG.livestock.chicken.capacity, Math.floor(finiteNonNegative(headcount))),
    growth: 0,
    feedShortageDays: 0,
  };
}

export function normalizeLivestockState(raw: unknown, legacyHeadcount = CONFIG.livestock.chicken.initialHeadcount): LivestockState {
  if (!raw || typeof raw !== 'object') return createDefaultLivestockState(legacyHeadcount);
  const candidate = raw as Partial<LivestockState>;
  const species = isImplementedLivestockId(candidate.species) ? candidate.species : 'chicken';
  const capacity = CONFIG.livestock.chicken.capacity;
  return {
    species,
    headcount: Math.min(capacity, Math.floor(finiteNonNegative(candidate.headcount))),
    growth: Math.min(0.999999, finiteNonNegative(candidate.growth)),
    feedShortageDays: Math.floor(finiteNonNegative(candidate.feedShortageDays)),
  };
}

export function ensureLivestockState(building: Building): LivestockState {
  building.livestock = normalizeLivestockState(building.livestock);
  return building.livestock;
}

export function livestockCapacity(_species: LivestockId): number {
  return CONFIG.livestock.chicken.capacity;
}

export function livestockDailyFeedNeed(livestock: LivestockState): number {
  if (livestock.species !== 'chicken') return 0;
  return Math.max(0, livestock.headcount) * CONFIG.livestock.chicken.grainPerHeadPerDay;
}

export function settlementLivestockDailyFeedNeed(state: GameState): number {
  return state.buildings
    .filter(building => building.type === 'stable' && building.built)
    .reduce((total, building) => total + livestockDailyFeedNeed(normalizeLivestockState(building.livestock)), 0);
}

export function updateLivestock(state: GameState): LivestockDailyReport {
  const report: LivestockDailyReport = { grainConsumed: 0, births: 0, deaths: 0 };
  for (const stable of state.buildings.filter(building => building.type === 'stable' && building.built)) {
    const livestock = ensureLivestockState(stable);
    if (livestock.species !== 'chicken' || livestock.headcount <= 0) {
      livestock.growth = 0;
      livestock.feedShortageDays = 0;
      continue;
    }

    const need = livestockDailyFeedNeed(livestock);
    const available = finiteNonNegative(state.resources.grain);
    const consumed = Math.min(need, available);
    state.resources.grain = Math.max(0, available - consumed);
    report.grainConsumed += consumed;

    if (consumed + 1e-9 >= need) {
      livestock.feedShortageDays = 0;
      if (livestock.headcount >= 2 && livestock.headcount < CONFIG.livestock.chicken.capacity) {
        livestock.growth += livestock.headcount * CONFIG.livestock.chicken.breedingPerHeadPerDay;
        while (livestock.growth >= 1 && livestock.headcount < CONFIG.livestock.chicken.capacity) {
          livestock.growth -= 1;
          livestock.headcount += 1;
          report.births += 1;
        }
      }
      if (livestock.headcount >= CONFIG.livestock.chicken.capacity) livestock.growth = 0;
      continue;
    }

    livestock.growth = 0;
    livestock.feedShortageDays += 1;
    const daysPastGrace = livestock.feedShortageDays - CONFIG.livestock.chicken.shortageGraceDays;
    if (daysPastGrace > 0 && daysPastGrace % CONFIG.livestock.chicken.starvationLossIntervalDays === 0) {
      livestock.headcount = Math.max(0, livestock.headcount - 1);
      report.deaths += 1;
    }
  }

  if (report.births > 0) addLog(state, `축사에서 병아리 ${report.births}마리가 태어났습니다.`, 'good');
  if (report.deaths > 0) addLog(state, `먹이가 모자라 닭 ${report.deaths}마리를 잃었습니다.`, 'bad', true);
  return report;
}

export function setStableLivestock(state: GameState, buildingId: number, species: LivestockId): string | null {
  const stable = state.buildings.find(building => building.id === buildingId);
  if (!stable || stable.type !== 'stable' || !stable.built) return '완성된 축사를 선택해야 합니다.';
  if (!isImplementedLivestockId(species)) return '아직 들일 수 없는 가축입니다.';
  if (!state.unlockedLivestock.includes(species)) return '아직 해금되지 않은 가축입니다.';
  const livestock = ensureLivestockState(stable);
  if (livestock.species === species) return null;
  if (livestock.headcount > 0) return '축사에 가축이 남아 있어 축종을 바꿀 수 없습니다.';
  stable.livestock = createDefaultLivestockState(0);
  return null;
}

export function slaughterStableLivestock(state: GameState, buildingId: number, amount = 1): string | null {
  const stable = state.buildings.find(building => building.id === buildingId);
  if (!stable || stable.type !== 'stable' || !stable.built) return '완성된 축사를 선택해야 합니다.';
  const livestock = ensureLivestockState(stable);
  const requested = Math.max(1, Math.floor(finiteNonNegative(amount)));
  if (livestock.headcount < requested) return '도축할 가축이 부족합니다.';

  livestock.headcount -= requested;
  livestock.growth = Math.min(livestock.growth, livestock.headcount > 0 ? 0.999999 : 0);
  const meat = requested * CONFIG.livestock.chicken.slaughterMeatPerHead;
  addBuildingStock(stable, 'meat', meat);
  addLog(state, `닭 ${requested}마리를 도축해 고기 ${meat.toFixed(1)}을(를) 축사에 쌓았습니다.`, 'info');
  return null;
}
