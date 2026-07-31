// 평시 화재의 발화·급수원 순수 규칙. 실제 연소와 주민 왕복은 다음 단계에서 연결한다.
import { buildingFootprintDims, isPlotBuildingType } from './buildings';
import { annualClimate } from './climate';
import { CONFIG } from './config';
import { addLog } from './events';
import { openGuideOnce } from './guides';
import { buildingStock, takeBuildingStock } from './inventory';
import { damageBuildingTargets } from './raidDamage';
import { recordAnnals } from './annals';
import { getSeason, getYear } from './seasons';
import { wellWaterStatus } from './waterSupply';
import { weatherForDay } from './weatherSchedule';
import type { Building, FireSite, FireWaterSourceKind, GameState, PendingDisaster, WeatherId } from './types';

export interface FireWaterSource {
  kind: FireWaterSourceKind;
  x: number;
  y: number;
  distance: number;
  buildingId?: number;
}

export function activeFireDisaster(state: Pick<GameState, 'pendingDisasters'>): PendingDisaster | undefined {
  return state.pendingDisasters.find(disaster => disaster.id === 'fire');
}

const DRY_WEATHERS = new Set<WeatherId>(['clear', 'frost', 'coldSnap']);

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function footprintDistance(
  from: Pick<Building, 'type' | 'x' | 'y' | 'w' | 'h'>,
  x: number,
  y: number,
): number {
  const { w, h } = buildingFootprintDims(from);
  const nearestX = Math.max(from.x, Math.min(x, from.x + w - 1));
  const nearestY = Math.max(from.y, Math.min(y, from.y + h - 1));
  return Math.abs(nearestX - x) + Math.abs(nearestY - y);
}

export function canIgniteFireInWeather(weather: WeatherId): boolean {
  return !CONFIG.disasters.fire.noIgnitionWeather.includes(weather);
}

export function consecutiveDryDays(state: Pick<GameState, 'seed' | 'day' | 'weather'>): number {
  let days = 0;
  for (let day = Math.max(1, state.day); day >= 1; day--) {
    const weather = day === state.day ? state.weather : weatherForDay(state.seed, day);
    if (!DRY_WEATHERS.has(weather)) break;
    days++;
  }
  return days;
}

export function fireDailyIgnitionChance(state: Pick<GameState, 'seed' | 'day' | 'weather'>): number {
  if (!canIgniteFireInWeather(state.weather)) return 0;
  const climate = annualClimate(state.seed, getYear(state.day));
  const annualMultiplier = clamp(
    1 + climate.precipitationAnomaly * CONFIG.disasters.fire.precipitationCoefficient,
    CONFIG.disasters.fire.annualMinMultiplier,
    CONFIG.disasters.fire.annualMaxMultiplier,
  );
  const dryDays = Math.min(CONFIG.disasters.fire.dryDayCap, consecutiveDryDays(state));
  return CONFIG.disasters.fire.dailyIgnitionChance * annualMultiplier *
    (1 + dryDays * CONFIG.disasters.fire.dryDayBonus);
}

export function fireIgnitionWeight(state: Pick<GameState, 'day'>, building: Building): number {
  if (!building.built || building.repairing || isPlotBuildingType(building.type) ||
      building.type === 'center' || building.type === 'levee' || building.type === 'well') return 0;
  const base = CONFIG.disasters.fire.sourceWeights[building.type] ?? CONFIG.disasters.fire.sourceWeights.default;
  const winterHousingMultiplier = building.type === 'hut' || building.type === 'ondol' || building.type === 'tileHouse'
    ? (getSeason(state.day) === 'winter' ? 1.35 : 1)
    : 1;
  return Math.max(0, base * winterHousingMultiplier);
}

export function chooseFireIgnitionBuilding(
  state: Pick<GameState, 'day' | 'buildings'>,
  rng: () => number,
): Building | null {
  const candidates = state.buildings
    .map(building => ({ building, weight: fireIgnitionWeight(state, building) }))
    .filter((candidate): candidate is { building: Building; weight: number } => candidate.weight > 0);
  const total = candidates.reduce((sum, candidate) => sum + candidate.weight, 0);
  if (total <= 0) return null;
  let roll = rng() * total;
  for (const candidate of candidates) {
    roll -= candidate.weight;
    if (roll <= 0) return candidate.building;
  }
  return candidates[candidates.length - 1]?.building ?? null;
}

export function nearestFireWaterSource(
  state: Pick<GameState, 'buildings' | 'map' | 'aquiferLevels' | 'seed'>,
  building: Building,
): FireWaterSource | null {
  const maxDistance = CONFIG.disasters.fire.maxWaterSourceDistance;
  const candidates: FireWaterSource[] = [];
  for (const well of state.buildings) {
    const status = wellWaterStatus(state as GameState, well);
    if (!status || status.dailyOutput + 1e-6 < CONFIG.disasters.fire.bucketAmount) continue;
    const distance = footprintDistance(building, well.x, well.y);
    if (distance > maxDistance) continue;
    candidates.push({ kind: 'well', buildingId: well.id, x: well.x, y: well.y, distance });
  }
  for (const row of state.map) {
    for (const tile of row) {
      if (tile.terrain !== 'river') continue;
      const distance = footprintDistance(building, tile.x, tile.y);
      if (distance > maxDistance) continue;
      candidates.push({ kind: 'river', x: tile.x, y: tile.y, distance });
    }
  }
  candidates.sort((a, b) => a.distance - b.distance ||
    (a.kind === b.kind ? (a.buildingId ?? -1) - (b.buildingId ?? -1) : a.kind === 'well' ? -1 : 1));
  return candidates[0] ?? null;
}

function fireRng(state: GameState): () => number {
  // 이 모듈은 외부 난수 순서를 건드리지 않는다. 저장/재생 시에도 같은 서브틱 결과가 난다.
  let value = (state.seed + state.day * 7919 + state.subTick * 977 + 47) >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 2 ** 32;
  };
}

export function maybeStartFire(state: GameState, rng: () => number): boolean {
  if (activeFireDisaster(state) || rng() >= fireDailyIgnitionChance(state)) return false;
  const building = chooseFireIgnitionBuilding(state, rng);
  if (!building) return false;
  const site: FireSite = {
    buildingId: building.id,
    intensity: CONFIG.disasters.fire.initialIntensity,
    burnProgress: 0,
    suppressionProgress: 0,
    ignitedDay: state.day,
    ignitedSubTick: state.subTick,
  };
  state.pendingDisasters.push({
    id: 'fire',
    choiceId: 'settlementFire',
    startedDay: state.day,
    resolveDay: state.day + CONFIG.disasters.fire.maximumDurationDays,
    fireSites: [site],
    data: {},
  });
  addLog(state, `${building.type === 'nitreYard' ? '염초장' : '건물'}에서 불길이 일었습니다. 가까운 주민들이 물을 길어 불을 끕니다.`, 'bad', true);
  openGuideOnce(state, 'fire'); // 첫 발화 — 초회 길잡이(모달)
  return true;
}

export function applyFireWater(state: GameState, buildingId: number, amount: number): boolean {
  const disaster = activeFireDisaster(state);
  const site = disaster?.fireSites?.find(candidate => candidate.buildingId === buildingId);
  if (!site || amount <= 0) return false;
  site.suppressionProgress += amount * CONFIG.disasters.fire.waterSuppressionPerBucket;
  site.intensity = Math.max(0, site.intensity - amount * CONFIG.disasters.fire.waterSuppressionPerBucket * 0.6);
  return true;
}

export function drawFireWater(state: GameState, source: FireWaterSource): number {
  if (source.kind === 'river') return CONFIG.disasters.fire.bucketAmount;
  const well = state.buildings.find(building => building.id === source.buildingId);
  const status = well ? wellWaterStatus(state, well) : null;
  if (!status || status.dailyOutput <= 0) return 0;
  const amount = Math.min(CONFIG.disasters.fire.bucketAmount, status.dailyOutput, status.level);
  state.aquiferLevels[status.veinId] = Math.max(0, (state.aquiferLevels[status.veinId] ?? 0) - amount);
  return amount;
}

function nearbyFireTargets(state: GameState, source: Building, existing: Set<number>): Building[] {
  const { w, h } = buildingFootprintDims(source);
  const sourceLeft = source.x - CONFIG.disasters.fire.spreadRange;
  const sourceTop = source.y - CONFIG.disasters.fire.spreadRange;
  const sourceRight = source.x + w - 1 + CONFIG.disasters.fire.spreadRange;
  const sourceBottom = source.y + h - 1 + CONFIG.disasters.fire.spreadRange;
  return state.buildings.filter(building => {
    if (!building.built || existing.has(building.id) || fireIgnitionWeight(state, building) <= 0) return false;
    const dims = buildingFootprintDims(building);
    return building.x <= sourceRight && building.x + dims.w - 1 >= sourceLeft &&
      building.y <= sourceBottom && building.y + dims.h - 1 >= sourceTop;
  });
}

function weightedBuilding(buildings: readonly Building[], state: GameState, rng: () => number): Building | null {
  const total = buildings.reduce((sum, building) => sum + fireIgnitionWeight(state, building), 0);
  if (total <= 0) return null;
  let roll = rng() * total;
  for (const building of buildings) {
    roll -= fireIgnitionWeight(state, building);
    if (roll <= 0) return building;
  }
  return buildings[buildings.length - 1] ?? null;
}

function fireRepairProgress(): { min: number; max: number } {
  return { min: 0.4, max: 0.72 };
}

function clearFireResponses(state: GameState): void {
  const activeIds = new Set(activeFireDisaster(state)?.fireSites?.map(site => site.buildingId) ?? []);
  for (const resident of state.residents) {
    if (resident.fireResponse && !activeIds.has(resident.fireResponse.buildingId)) delete resident.fireResponse;
  }
}

function endFire(state: GameState, damaged: number): void {
  state.pendingDisasters = state.pendingDisasters.filter(disaster => disaster.id !== 'fire');
  clearFireResponses(state);
  const text = damaged > 0
    ? `화재가 잦아들었지만 건물 ${damaged}채가 파손되었습니다. 건설담당이 복구를 시작합니다.`
    : '주민들이 물을 길어 화재를 큰 피해 없이 껐습니다.';
  addLog(state, text, damaged > 0 ? 'bad' : 'good', damaged > 0);
  if (damaged > 0) recordAnnals(state, 'disaster', `마을 화재로 건물 ${damaged}채가 파손되었습니다.`);
}

/** 주민 이동 뒤 매 서브틱 호출한다. 소화가 늦으면 번지고, 한계에 닿은 건물은 수리 상태가 된다. */
export function advanceFire(state: GameState): void {
  const disaster = activeFireDisaster(state);
  if (!disaster) return;
  const rng = fireRng(state);
  const sites = disaster.fireSites ?? [];
  const existing = new Set(sites.map(site => site.buildingId));
  const survivors: FireSite[] = [];
  const damaged: Building[] = [];

  for (const site of sites) {
    const building = state.buildings.find(candidate => candidate.id === site.buildingId);
    if (!building?.built) continue;
    const burnMultiplier = CONFIG.disasters.fire.burnProgressMultipliers[building.type] ??
      CONFIG.disasters.fire.burnProgressMultipliers.default;
    site.burnProgress += site.intensity * CONFIG.disasters.fire.burnProgressPerIntensity * burnMultiplier;
    site.intensity += CONFIG.disasters.fire.intensityGrowthPerTick;

    const explodedId = disaster.data?.nitreExplosionBuildingId;
    if (building.type === 'nitreYard' && explodedId !== building.id &&
        site.burnProgress >= CONFIG.disasters.fire.nitreExplosionBurnProgress &&
        buildingStock(building, 'gunpowder') >= CONFIG.disasters.fire.nitreExplosionGunpowder) {
      takeBuildingStock(building, 'gunpowder', CONFIG.disasters.fire.nitreExplosionGunpowder);
      site.intensity += CONFIG.disasters.fire.nitreExplosionIntensity;
      disaster.data = { ...(disaster.data ?? {}), nitreExplosionBuildingId: building.id };
      addLog(state, '염초장에 번진 불길이 화약을 건드려 폭발했습니다!', 'bad', true);
    }

    if (site.suppressionProgress >= site.intensity + 0.15) continue;
    if (site.burnProgress >= CONFIG.disasters.fire.damageBurnProgress || state.day > disaster.resolveDay) {
      damaged.push(building);
      continue;
    }

    const spreadChance = CONFIG.disasters.fire.spreadChancePerTick * Math.max(0.5, site.intensity);
    if (rng() < spreadChance) {
      const target = weightedBuilding(nearbyFireTargets(state, building, existing), state, rng);
      if (target) {
        existing.add(target.id);
        survivors.push({
          buildingId: target.id,
          intensity: CONFIG.disasters.fire.initialIntensity * 0.75,
          burnProgress: 0,
          suppressionProgress: 0,
          ignitedDay: state.day,
          ignitedSubTick: state.subTick,
        });
        addLog(state, '불길이 이웃 건물로 옮겨붙었습니다.', 'bad');
      }
    }
    survivors.push(site);
  }

  const damagedTypes = damageBuildingTargets(state, rng, damaged, 'fire', fireRepairProgress());
  if (survivors.length === 0) {
    endFire(state, damagedTypes.length);
    return;
  }
  disaster.fireSites = survivors;
  clearFireResponses(state);
}
