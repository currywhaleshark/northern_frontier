import { withJosa } from './josa';
import { CONFIG } from './config';
import { addLog } from './events';
import { openGuideOnce } from './guides';
import { addBuildingStock } from './inventory';
import { getSeason } from './seasons';
import { reconcileMountAssignments } from './weapons';
import { pastureRequiredHerders, stableLivestockCapacity } from './pastures';
import type { Building, GameState, LivestockId, LivestockState, ResourceId, Season } from './types';

export const IMPLEMENTED_LIVESTOCK_IDS = ['chicken', 'goat', 'sheep', 'pig', 'cattle', 'horse'] as const satisfies readonly LivestockId[];

export const LIVESTOCK_DEFS = {
  chicken: { name: '닭' },
  goat: { name: '염소' },
  sheep: { name: '양' },
  pig: { name: '돼지' },
  cattle: { name: '소' },
  horse: { name: '군마' },
} as const satisfies Record<LivestockId, { name: string }>;

interface LivestockDailyReport {
  grainConsumed: number;
  hayConsumed: number;
  births: number;
  deaths: number;
}

interface LivestockProduct {
  resource: ResourceId;
  amount: number;
  task: string;
}

interface LivestockLootReport {
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

export function livestockCapacityForStable(
  stable: Pick<Building, 'type' | 'pasture'>,
  species: LivestockId,
): number {
  return stableLivestockCapacity(stable, species);
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
    const capacity = stableLivestockCapacity(stable, livestock.species);
    const need = livestockDailyFeedNeed(livestock, season);
    const available = finiteNonNegative(state.resources[config.feedResource]);
    const consumed = Math.min(need, available);
    state.resources[config.feedResource] = Math.max(0, available - consumed);
    if (config.feedResource === 'grain') report.grainConsumed += consumed;
    if (config.feedResource === 'hay') report.hayConsumed += consumed;

    if (consumed + 1e-9 >= need) {
      livestock.feedShortageDays = 0;
      const requiredHerders = pastureRequiredHerders(stable);
      const activeHerders = stable.pasture
        ? state.residents.filter(resident =>
          resident.alive &&
          !resident.sick &&
          resident.job === 'herder' &&
          resident.assignedBuildingId === stable.id).length
        : requiredHerders;
      const careMultiplier = requiredHerders > 0
        ? Math.min(1, activeHerders / requiredHerders)
        : 1;
      if (livestock.headcount >= 2 && livestock.headcount < capacity) {
        livestock.growth += livestock.headcount * config.breedingPerHeadPerDay * careMultiplier;
        while (livestock.growth >= 1 && livestock.headcount < capacity) {
          livestock.growth -= 1;
          livestock.headcount += 1;
          report.births += 1;
        }
      }
      if (livestock.headcount >= capacity) livestock.growth = 0;
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
  reconcileMountAssignments(state);
  reconcilePlowOxen(state);
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

// ── 농우(農牛) — 축사의 소를 경작지에 내주어 우경(牛耕) 효율을 얻는다 ──

// 농우로 내줄 수 있는 소 마릿수 (완공된 소 축사의 마릿수 합)
export function plowOxenPool(state: GameState): number {
  return state.buildings.reduce((sum, building) => {
    if (building.type !== 'stable' || !building.built) return sum;
    const livestock = normalizeLivestockState(building.livestock);
    return livestock.species === 'cattle' ? sum + Math.floor(livestock.headcount) : sum;
  }, 0);
}

export function plowOxenOf(building: Pick<Building, 'plowOxen'>): number {
  const raw = building.plowOxen;
  return typeof raw === 'number' && Number.isFinite(raw) ? Math.max(0, Math.floor(raw)) : 0;
}

// 경작지들에 이미 배정된 농우 마릿수 합
export function plowOxenAssigned(state: GameState): number {
  return state.buildings.reduce((sum, building) =>
    (building.type === 'field' || building.type === 'paddy') ? sum + plowOxenOf(building) : sum, 0);
}

// 경작지 하나가 받을 수 있는 농우 상한 — 대형(largePlotOxThreshold칸 이상)은 +1
// (buildings.ts와의 순환 의존을 피하려고 면적을 여기서 직접 센다)
function plotAreaOf(building: Pick<Building, 'w' | 'h'>): number {
  const clampSide = (value: number | undefined): number =>
    typeof value === 'number' && Number.isFinite(value)
      ? Math.min(CONFIG.farming.maxPlotSide, Math.max(1, Math.floor(value)))
      : 1;
  return clampSide(building.w) * clampSide(building.h);
}

export function plotPlowOxenMax(building: Pick<Building, 'type' | 'w' | 'h'>): number {
  if (building.type !== 'field' && building.type !== 'paddy') return 0;
  const extra = plotAreaOf(building) >= CONFIG.farming.largePlotOxThreshold ? 1 : 0;
  return CONFIG.farming.plowOxenPerPlotMax + extra;
}

// 농우 배정 경작지의 파종·생육·수확 작업 배수
export function plotWorkMultiplier(_state: GameState, building: Pick<Building, 'type' | 'plowOxen'>): number {
  const oxen = plowOxenOf(building);
  return 1 + oxen * (CONFIG.farming.plowOxWorkMultiplier - 1);
}

// 경작지 농우 배정/해제 (양수: 배정, 0: 전부 해제)
export function setPlotPlowOxen(state: GameState, buildingId: number, count: number): string | null {
  const building = state.buildings.find(candidate => candidate.id === buildingId);
  if (!building || (building.type !== 'field' && building.type !== 'paddy')) return '경작지가 아닙니다.';
  if (!building.built) return '완공된 경작지에만 농우를 내줄 수 있습니다.';
  const requested = Math.max(0, Math.floor(finiteNonNegative(count)));
  const max = plotPlowOxenMax(building);
  if (requested > max) return `이 경작지에는 농우를 ${max}마리까지만 부릴 수 있습니다.`;
  const others = plowOxenAssigned(state) - plowOxenOf(building);
  if (others + requested > plowOxenPool(state)) return '내줄 수 있는 소가 부족합니다. (소 축사 확인)';
  building.plowOxen = requested;
  return null;
}

// 소가 죽거나 도축되어 풀이 줄면 초과 배정을 해제한다 (나중에 지은 경작지부터)
function reconcilePlowOxen(state: GameState): void {
  let excess = plowOxenAssigned(state) - plowOxenPool(state);
  if (excess <= 0) return;
  const plots = state.buildings
    .filter(building => (building.type === 'field' || building.type === 'paddy') && plowOxenOf(building) > 0)
    .sort((a, b) => b.id - a.id);
  let released = 0;
  for (const plot of plots) {
    if (excess <= 0) break;
    const take = Math.min(excess, plowOxenOf(plot));
    plot.plowOxen = plowOxenOf(plot) - take;
    excess -= take;
    released += take;
  }
  if (released > 0) {
    addLog(state, `소가 줄어 경작지의 농우 ${released}마리 배정이 풀렸습니다.`, 'bad', true);
  }
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
    addLog(state, `습격대가 축사를 털어 ${withJosa(details, '을/를')} 끌고 갔습니다.`, 'bad', true);
  }
  reconcileMountAssignments(state);
  reconcilePlowOxen(state);
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
  reconcileMountAssignments(state);
  reconcilePlowOxen(state);
  return null;
}

interface LivestockAcquisitionPreflight {
  requested: number;
  freeCapacity: number;
  eligibleStableIds: number[];
  allocations: Array<{ stableId: number; amount: number }>;
  canAcquire: boolean;
}

/**
 * `acquireLivestock`가 쓸 축사와 수용량을 바꾸지 않고 미리 계산한다.
 * 같은 축종이거나 비어 있는 완공 축사만 대상이며, 하사품 후보 판정도 이 규칙을 쓴다.
 */
export function preflightLivestockAcquisition(
  state: Pick<GameState, 'buildings'>,
  species: LivestockId,
  amount = 1,
  preferredStableId?: number,
): LivestockAcquisitionPreflight {
  const requested = Math.max(1, Math.floor(finiteNonNegative(amount)));
  const eligible = state.buildings
    .filter(building => building.type === 'stable' && building.built)
    .map(building => ({ building, livestock: normalizeLivestockState(building.livestock) }))
    .filter(({ livestock }) => livestock.species === species || livestock.headcount <= 0)
    .sort((left, right) => Number(right.building.id === preferredStableId) - Number(left.building.id === preferredStableId));
  const freeCapacity = eligible.reduce((total, { building, livestock }) => {
    const occupied = livestock.species === species ? livestock.headcount : 0;
    return total + Math.max(0, livestockCapacityForStable(building, species) - occupied);
  }, 0);
  let remaining = requested;
  const allocations: Array<{ stableId: number; amount: number }> = [];
  for (const { building, livestock } of eligible) {
    if (remaining <= 0) break;
    const occupied = livestock.species === species ? livestock.headcount : 0;
    const received = Math.min(remaining, Math.max(0, livestockCapacityForStable(building, species) - occupied));
    if (received > 0) allocations.push({ stableId: building.id, amount: received });
    remaining -= received;
  }
  return {
    requested,
    freeCapacity,
    eligibleStableIds: eligible.map(({ building }) => building.id),
    allocations,
    canAcquire: remaining === 0,
  };
}

export function acquireLivestock(
  state: GameState,
  species: LivestockId,
  amount = 1,
  preferredStableId?: number,
): string | null {
  if (!isImplementedLivestockId(species)) return '아직 들일 수 없는 가축입니다.';
  const preflight = preflightLivestockAcquisition(state, species, amount, preferredStableId);
  if (!preflight.canAcquire) return '가축을 들일 빈 축사가 부족합니다.';

  if (!state.unlockedLivestock.includes(species)) state.unlockedLivestock.push(species);
  for (const allocation of preflight.allocations) {
    const stable = state.buildings.find(building => building.id === allocation.stableId);
    if (!stable || stable.type !== 'stable' || !stable.built) {
      addLog(state, '가축 지급 중 축사 상태가 바뀌어 하사품을 들이지 못했습니다.', 'bad', true);
      return '가축 지급 중 축사 상태가 바뀌었습니다.';
    }
    let livestock = ensureLivestockState(stable);
    if (livestock.species !== species) {
      stable.livestock = createLivestockState(species, 0);
      livestock = stable.livestock;
    }
    livestock.headcount += allocation.amount;
  }
  addLog(state, `${LIVESTOCK_DEFS[species].name} ${preflight.requested}마리를 들였습니다.`, 'good');
  // 첫 가축 / 첫 농우 — 초회 길잡이(카드)
  openGuideOnce(state, 'livestock');
  if (species === 'cattle') openGuideOnce(state, 'oxen');
  return null;
}

const TRADE_LIVESTOCK_BY_FACTION: Readonly<Record<string, typeof IMPLEMENTED_LIVESTOCK_IDS[number]>> = {
  '니마차 우디캐': 'goat',
  '올량합 부락': 'sheep',
  '만상': 'cattle',
  '송상': 'pig',
};

export function acquireFirstLivestockFromTrade(state: GameState, factionName: string): boolean {
  const species = TRADE_LIVESTOCK_BY_FACTION[factionName];
  if (!species || state.unlockedLivestock.includes(species)) return false;
  const error = acquireLivestock(state, species, 2);
  if (error) return false;
  addLog(
    state,
    `${withJosa(factionName, '과/와')}의 거래로 ${LIVESTOCK_DEFS[species].name} 사육법이 열렸습니다.`,
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
  reconcileMountAssignments(state);
  reconcilePlowOxen(state);
  livestock.growth = Math.min(livestock.growth, livestock.headcount > 0 ? 0.999999 : 0);
  const config = speciesConfig(livestock.species);
  const meat = requested * config.slaughterMeatPerHead;
  const hide = requested * config.slaughterHidePerHead;
  addBuildingStock(stable, 'meat', meat);
  if (hide > 0) addBuildingStock(stable, 'hide', hide);
  const hideText = hide > 0 ? `, 가죽 ${hide.toFixed(1)}` : '';
  addLog(
    state,
    `${LIVESTOCK_DEFS[livestock.species].name} ${requested}마리를 도축해 고기 ${meat.toFixed(1)}${withJosa(hideText, '을/를')} 축사에 쌓았습니다.`,
    'info',
  );
  return null;
}

/** 질병·습격처럼 산출물 없이 가축 수만 줄어드는 경로의 단일 정합성 처리다. */
export function loseStableLivestock(state: GameState, buildingId: number, amount: number): number {
  const stable = state.buildings.find(building => building.id === buildingId);
  if (!stable || stable.type !== 'stable' || !stable.built) return 0;
  const livestock = ensureLivestockState(stable);
  const lost = Math.min(livestock.headcount, Math.max(0, Math.floor(finiteNonNegative(amount))));
  if (lost <= 0) return 0;
  livestock.headcount -= lost;
  livestock.growth = Math.min(livestock.growth, livestock.headcount > 0 ? 0.999999 : 0);
  reconcileMountAssignments(state);
  reconcilePlowOxen(state);
  return lost;
}
