import { CONFIG } from './config';
import { addLog } from './events';
import { addBuildingStock } from './inventory';
import { getSeason } from './seasons';
import type { Building, GameState, LivestockId, LivestockState, ResourceId, Season } from './types';

export const LIVESTOCK_IDS = ['chicken', 'goat', 'sheep', 'cattle', 'horse'] as const satisfies readonly LivestockId[];
export const IMPLEMENTED_LIVESTOCK_IDS = ['chicken', 'goat', 'sheep', 'cattle'] as const satisfies readonly LivestockId[];

export const LIVESTOCK_DEFS = {
  chicken: { name: '닭', icon: '🐔' },
  goat: { name: '염소', icon: '🐐' },
  sheep: { name: '양', icon: '🐑' },
  cattle: { name: '소', icon: '🐄' },
  horse: { name: '군마', icon: '🐎' },
} as const satisfies Record<LivestockId, { name: string; icon: string }>;

export interface LivestockDailyReport {
  grainConsumed: number;
  hayConsumed: number;
  births: number;
  deaths: number;
}

export interface LivestockProduct {
  resource: ResourceId;
  amount: number;
  task: string;
}

export interface LivestockLootReport {
  lost: number;
  bySpecies: Partial<Record<LivestockId, number>>;
}

interface LivestockSpeciesConfig {
  capacity: number;
  initialHeadcount: number;
  feedResource: ResourceId;
  feedPerHeadPerDay: number;
  grazesOutsideWinter: boolean;
  breedingPerHeadPerDay: number;
  productResource: ResourceId | null;
  productPerHeadPerHerderDay: number;
  productSeasonMult: Record<Season, number>;
  shortageGraceDays: number;
  starvationLossIntervalDays: number;
  slaughterMeatPerHead: number;
  slaughterHidePerHead: number;
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

function speciesConfig(species: LivestockId): LivestockSpeciesConfig {
  return CONFIG.livestock[species] as LivestockSpeciesConfig;
}

export function createLivestockState(species: LivestockId, headcount = 0): LivestockState {
  return {
    species,
    headcount: Math.min(speciesConfig(species).capacity, Math.floor(finiteNonNegative(headcount))),
    growth: 0,
    feedShortageDays: 0,
  };
}

export function createDefaultLivestockState(headcount: number = CONFIG.livestock.chicken.initialHeadcount): LivestockState {
  return createLivestockState('chicken', headcount);
}

export function normalizeLivestockState(raw: unknown, legacyHeadcount = CONFIG.livestock.chicken.initialHeadcount): LivestockState {
  if (!raw || typeof raw !== 'object') return createDefaultLivestockState(legacyHeadcount);
  const candidate = raw as Partial<LivestockState>;
  const species = isImplementedLivestockId(candidate.species) ? candidate.species : 'chicken';
  const capacity = livestockCapacity(species);
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
  return speciesConfig(_species).capacity;
}

export function livestockDailyFeedNeed(livestock: LivestockState, season?: Season): number {
  const config = speciesConfig(livestock.species);
  if (config.grazesOutsideWinter && season !== 'winter') return 0;
  return Math.max(0, livestock.headcount) * config.feedPerHeadPerDay;
}

export function settlementLivestockDailyFeedNeed(state: GameState): number {
  return state.buildings
    .filter(building => building.type === 'stable' && building.built)
    .reduce((total, building) => {
      const livestock = normalizeLivestockState(building.livestock);
      return speciesConfig(livestock.species).feedResource === 'grain'
        ? total + livestockDailyFeedNeed(livestock)
        : total;
    }, 0);
}

export function settlementLivestockWinterHayNeed(
  state: GameState,
  days: number = CONFIG.time.seasonDays,
): number {
  return state.buildings
    .filter(building => building.type === 'stable' && building.built)
    .reduce((total, building) => {
      const livestock = normalizeLivestockState(building.livestock);
      return speciesConfig(livestock.species).feedResource === 'hay'
        ? total + livestockDailyFeedNeed(livestock, 'winter') * Math.max(0, days)
        : total;
    }, 0);
}

export function updateLivestock(state: GameState): LivestockDailyReport {
  const report: LivestockDailyReport = { grainConsumed: 0, hayConsumed: 0, births: 0, deaths: 0 };
  const season = getSeason(state.day);
  for (const stable of state.buildings.filter(building => building.type === 'stable' && building.built)) {
    const livestock = ensureLivestockState(stable);
    if (livestock.headcount <= 0) {
      livestock.growth = 0;
      livestock.feedShortageDays = 0;
      continue;
    }

    const config = speciesConfig(livestock.species);
    const need = livestockDailyFeedNeed(livestock, season);
    const available = finiteNonNegative(state.resources[config.feedResource]);
    const consumed = Math.min(need, available);
    state.resources[config.feedResource] = Math.max(0, available - consumed);
    if (config.feedResource === 'grain') report.grainConsumed += consumed;
    if (config.feedResource === 'hay') report.hayConsumed += consumed;

    if (consumed + 1e-9 >= need) {
      livestock.feedShortageDays = 0;
      if (livestock.headcount >= 2 && livestock.headcount < config.capacity) {
        livestock.growth += livestock.headcount * config.breedingPerHeadPerDay;
        while (livestock.growth >= 1 && livestock.headcount < config.capacity) {
          livestock.growth -= 1;
          livestock.headcount += 1;
          report.births += 1;
        }
      }
      if (livestock.headcount >= config.capacity) livestock.growth = 0;
      continue;
    }

    livestock.growth = 0;
    livestock.feedShortageDays += 1;
    const daysPastGrace = livestock.feedShortageDays - config.shortageGraceDays;
    if (daysPastGrace > 0 && daysPastGrace % config.starvationLossIntervalDays === 0) {
      livestock.headcount = Math.max(0, livestock.headcount - 1);
      report.deaths += 1;
    }
  }

  if (report.births > 0) addLog(state, `축사에서 새끼 가축 ${report.births}마리가 태어났습니다.`, 'good');
  if (report.deaths > 0) addLog(state, `먹이가 모자라 가축 ${report.deaths}마리를 잃었습니다.`, 'bad', true);
  return report;
}

export function livestockProductForHerder(
  livestock: LivestockState,
  season: Season,
  efficiency = 1,
): LivestockProduct | null {
  const config = speciesConfig(livestock.species);
  if (!config.productResource || livestock.headcount <= 0) return null;
  const shortageMult = livestock.feedShortageDays > 0 ? 0.25 : 1;
  const amount = config.productPerHeadPerHerderDay
    * livestock.headcount
    * config.productSeasonMult[season]
    * Math.max(0, efficiency)
    * shortageMult;
  const task = livestock.species === 'chicken'
    ? '달걀 거두기'
    : livestock.species === 'sheep'
      ? '양털 깎기'
      : '젖 짜기';
  return { resource: config.productResource, amount, task };
}

export function cattleFarmWorkMultiplier(state: GameState): number {
  const cattleStables = state.buildings.filter(building => {
    if (building.type !== 'stable' || !building.built) return false;
    const livestock = normalizeLivestockState(building.livestock);
    return livestock.species === 'cattle' && livestock.headcount > 0;
  }).length;
  const bonus = Math.min(
    CONFIG.livestock.cattleFarmWorkMaxBonus,
    cattleStables * CONFIG.livestock.cattleFarmWorkBonusPerStable,
  );
  return 1 + bonus;
}

export function hayFromHarvestProgress(progress: number): number {
  return finiteNonNegative(progress) * CONFIG.livestock.hayPerHarvestProgress;
}

export function lootLivestock(state: GameState, ratio: number): LivestockLootReport {
  const occupied = state.buildings
    .filter(building => building.type === 'stable' && building.built)
    .map(building => ({ building, livestock: ensureLivestockState(building) }))
    .filter(entry => entry.livestock.headcount > 0)
    .sort((left, right) => right.livestock.headcount - left.livestock.headcount || left.building.id - right.building.id);
  const total = occupied.reduce((sum, entry) => sum + entry.livestock.headcount, 0);
  const boundedRatio = Math.min(1, finiteNonNegative(ratio));
  let remaining = total > 0 && boundedRatio > 0
    ? Math.min(total, Math.max(1, Math.floor(total * boundedRatio)))
    : 0;
  const report: LivestockLootReport = { lost: remaining, bySpecies: {} };

  for (const entry of occupied) {
    if (remaining <= 0) break;
    const taken = Math.min(remaining, entry.livestock.headcount);
    entry.livestock.headcount -= taken;
    entry.livestock.growth = Math.min(entry.livestock.growth, entry.livestock.headcount > 0 ? 0.999999 : 0);
    report.bySpecies[entry.livestock.species] = (report.bySpecies[entry.livestock.species] ?? 0) + taken;
    remaining -= taken;
  }
  if (report.lost > 0) {
    const details = Object.entries(report.bySpecies)
      .map(([species, amount]) => `${LIVESTOCK_DEFS[species as LivestockId].name} ${amount}마리`)
      .join(', ');
    addLog(state, `습격대가 축사를 털어 ${details}를 끌고 갔습니다.`, 'bad', true);
  }
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
  stable.livestock = createLivestockState(species, 0);
  return null;
}

export function acquireLivestock(
  state: GameState,
  species: LivestockId,
  amount = 1,
  preferredStableId?: number,
): string | null {
  if (!isImplementedLivestockId(species)) return '아직 들일 수 없는 가축입니다.';
  const requested = Math.max(1, Math.floor(finiteNonNegative(amount)));
  const stables = state.buildings
    .filter(building => building.type === 'stable' && building.built)
    .filter(building => {
      const livestock = ensureLivestockState(building);
      return livestock.species === species || livestock.headcount <= 0;
    })
    .sort((left, right) => Number(right.id === preferredStableId) - Number(left.id === preferredStableId));
  const freeCapacity = stables.reduce((total, stable) => {
    const livestock = ensureLivestockState(stable);
    return total + livestockCapacity(species) - (livestock.species === species ? livestock.headcount : 0);
  }, 0);
  if (freeCapacity < requested) return '가축을 들일 빈 축사가 부족합니다.';

  if (!state.unlockedLivestock.includes(species)) state.unlockedLivestock.push(species);
  let remaining = requested;
  for (const stable of stables) {
    if (remaining <= 0) break;
    let livestock = ensureLivestockState(stable);
    if (livestock.species !== species) {
      stable.livestock = createLivestockState(species, 0);
      livestock = stable.livestock;
    }
    const received = Math.min(remaining, livestockCapacity(species) - livestock.headcount);
    livestock.headcount += received;
    remaining -= received;
  }
  addLog(state, `${LIVESTOCK_DEFS[species].name} ${requested}마리를 들였습니다.`, 'good');
  return null;
}

const TRADE_LIVESTOCK_BY_FACTION: Readonly<Record<string, typeof IMPLEMENTED_LIVESTOCK_IDS[number]>> = {
  '니마차 우디캐': 'goat',
  '올량합 부락': 'sheep',
  '만상': 'cattle',
  '송상': 'cattle',
};

export function acquireFirstLivestockFromTrade(state: GameState, factionName: string): boolean {
  const species = TRADE_LIVESTOCK_BY_FACTION[factionName];
  if (!species || state.unlockedLivestock.includes(species)) return false;
  const error = acquireLivestock(state, species, 2);
  if (error) return false;
  addLog(
    state,
    `${factionName}과(와)의 거래로 ${LIVESTOCK_DEFS[species].name} 사육법이 열렸습니다.`,
    'trade',
  );
  return true;
}

export function slaughterStableLivestock(state: GameState, buildingId: number, amount = 1): string | null {
  const stable = state.buildings.find(building => building.id === buildingId);
  if (!stable || stable.type !== 'stable' || !stable.built) return '완성된 축사를 선택해야 합니다.';
  const livestock = ensureLivestockState(stable);
  const requested = Math.max(1, Math.floor(finiteNonNegative(amount)));
  if (livestock.headcount < requested) return '도축할 가축이 부족합니다.';

  livestock.headcount -= requested;
  livestock.growth = Math.min(livestock.growth, livestock.headcount > 0 ? 0.999999 : 0);
  const config = speciesConfig(livestock.species);
  const meat = requested * config.slaughterMeatPerHead;
  const hide = requested * config.slaughterHidePerHead;
  addBuildingStock(stable, 'meat', meat);
  if (hide > 0) addBuildingStock(stable, 'hide', hide);
  const hideText = hide > 0 ? `, 가죽 ${hide.toFixed(1)}` : '';
  addLog(
    state,
    `${LIVESTOCK_DEFS[livestock.species].name} ${requested}마리를 도축해 고기 ${meat.toFixed(1)}${hideText}을(를) 축사에 쌓았습니다.`,
    'info',
  );
  return null;
}
