// 연간 기후를 재해 발생 가중치와 선택 결과 확률로 변환하는 단일 원본.
import { annualClimate, annualClimateSummary, type AnnualClimate } from './climate';
import { CONFIG } from './config';
import { makeRng } from './map';
import { getYear } from './seasons';
import type { GameState } from './types';

export type ClimateDisasterEventId =
  'earlyFrost' | 'lateFrost' | 'locust' | 'drought' | 'plagueSuspicion' | 'livestockEpidemic';

type DisasterState = Pick<GameState, 'seed' | 'day' | 'specialItems'>;
type ClimateState = Pick<GameState, 'seed' | 'day'>;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function currentClimate(state: ClimateState): AnnualClimate {
  return annualClimate(state.seed, getYear(state.day));
}

function earlyFrostOccurrenceWeight(climate: AnnualClimate): number {
  const config = CONFIG.disasters.earlyFrost;
  const multiplier = clamp(
    1 + climate.temperatureAnomaly * config.occurrenceTemperatureCoefficient,
    config.occurrenceMinMultiplier,
    config.occurrenceMaxMultiplier,
  );
  return config.occurrenceBaseWeight * multiplier;
}

function lateFrostOccurrenceWeight(climate: AnnualClimate): number {
  const config = CONFIG.disasters.lateFrost;
  const multiplier = clamp(
    1 + climate.temperatureAnomaly * config.occurrenceTemperatureCoefficient,
    config.occurrenceMinMultiplier,
    config.occurrenceMaxMultiplier,
  );
  return config.occurrenceBaseWeight * multiplier;
}

function locustOccurrenceWeight(climate: AnnualClimate): number {
  const config = CONFIG.disasters.locust;
  const multiplier = clamp(
    1 +
      climate.temperatureAnomaly * config.occurrenceTemperatureCoefficient +
      climate.precipitationAnomaly * config.occurrencePrecipitationCoefficient,
    config.occurrenceMinMultiplier,
    config.occurrenceMaxMultiplier,
  );
  return config.occurrenceBaseWeight * multiplier;
}

function droughtOccurrenceWeight(climate: AnnualClimate): number {
  const config = CONFIG.disasters.drought;
  const multiplier = clamp(
    1 +
      climate.temperatureAnomaly * config.occurrenceTemperatureCoefficient +
      climate.precipitationAnomaly * config.occurrencePrecipitationCoefficient,
    config.occurrenceMinMultiplier,
    config.occurrenceMaxMultiplier,
  );
  return config.occurrenceBaseWeight * multiplier;
}

function plagueOccurrenceWeight(climate: AnnualClimate): number {
  const config = CONFIG.disasters.plagueSuspicion;
  const multiplier = clamp(
    1 +
      climate.temperatureAnomaly * config.occurrenceTemperatureCoefficient +
      climate.precipitationAnomaly * config.occurrencePrecipitationCoefficient +
      climate.storminess * config.occurrenceStorminessCoefficient,
    config.occurrenceMinMultiplier,
    config.occurrenceMaxMultiplier,
  );
  return config.occurrenceBaseWeight * multiplier;
}

function livestockEpidemicOccurrenceWeight(_climate: AnnualClimate): number {
  // 축종군과 사육 두수는 사건 쪽에서 판정한다. 기후는 이 재해의 발생 요인이 아니다.
  return CONFIG.disasters.livestockEpidemic.occurrenceBaseWeight;
}

/**
 * 현재 연도의 재해 후보 가중치다. 연간 기후는 시드와 연차에서 재생성하므로
 * 이 계산은 시뮬레이션 RNG를 소비하지 않는다.
 */
export function disasterOccurrenceWeightForClimate(
  climate: AnnualClimate,
  eventId: ClimateDisasterEventId,
): number {
  if (eventId === 'earlyFrost') return earlyFrostOccurrenceWeight(climate);
  if (eventId === 'lateFrost') return lateFrostOccurrenceWeight(climate);
  if (eventId === 'locust') return locustOccurrenceWeight(climate);
  if (eventId === 'drought') return droughtOccurrenceWeight(climate);
  if (eventId === 'livestockEpidemic') return livestockEpidemicOccurrenceWeight(climate);
  return plagueOccurrenceWeight(climate);
}

/** 같은 시드·연도에서 재현되는 황충 전용의 작은 발생 변동이다. */
export function locustAnnualMultiplier(state: ClimateState): number {
  const config = CONFIG.disasters.locust;
  const rng = makeRng(state.seed + getYear(state.day) * 32452843 + 293);
  return config.annualVarianceMinMultiplier + rng() *
    (config.annualVarianceMaxMultiplier - config.annualVarianceMinMultiplier);
}

export function disasterOccurrenceWeight(
  state: ClimateState,
  eventId: ClimateDisasterEventId,
): number {
  const weight = disasterOccurrenceWeightForClimate(currentClimate(state), eventId);
  return eventId === 'locust' ? weight * locustAnnualMultiplier(state) : weight;
}

function earlyFrostWaitHarvestChance(climate: AnnualClimate): number {
  const config = CONFIG.disasters.earlyFrost;
  return clamp(
    config.waitHarvestBaseClearChance +
      climate.temperatureAnomaly * config.waitHarvestTemperatureCoefficient,
    config.waitHarvestMinClearChance,
    config.waitHarvestMaxClearChance,
  );
}

function lateFrostWaitReplantChance(climate: AnnualClimate): number {
  const config = CONFIG.disasters.lateFrost;
  return clamp(
    config.waitReplantBaseClearChance +
      climate.temperatureAnomaly * config.waitReplantTemperatureCoefficient,
    config.waitReplantMinClearChance,
    config.waitReplantMaxClearChance,
  );
}

function plagueRealChance(climate: AnnualClimate): number {
  const config = CONFIG.disasters.plagueSuspicion;
  return clamp(
    config.realBaseChance +
      climate.temperatureAnomaly * config.realTemperatureCoefficient +
      climate.precipitationAnomaly * config.realPrecipitationCoefficient +
      climate.storminess * config.realStorminessCoefficient,
    config.realMinChance,
    config.realMaxChance,
  );
}

/**
 * 기후에서 계산한 재해 선택 결과의 근사 확률이다.
 *
 * `plagueSuspicion/real-case`는 플레이어 선택지는 아니지만 의심 환자가 실제
 * 역병인지 결정하는 실제 확률이다. 이른 서리의 기다리기는 D1부터 실제 날씨표를
 * 추적하므로 이 값은 측우기 예보에만 쓴다.
 */
export function disasterChoiceChanceForClimate(
  climate: AnnualClimate,
  eventId: ClimateDisasterEventId,
  optionId: string,
): number {
  if (eventId === 'earlyFrost' && optionId === 'wait-harvest') {
    return earlyFrostWaitHarvestChance(climate);
  }
  if (eventId === 'lateFrost' && optionId === 'wait-replant') {
    return lateFrostWaitReplantChance(climate);
  }
  if (eventId === 'plagueSuspicion' && optionId === 'real-case') {
    return plagueRealChance(climate);
  }
  return 0;
}

export function disasterChoiceChance(
  state: ClimateState,
  eventId: ClimateDisasterEventId,
  optionId: string,
): number {
  return disasterChoiceChanceForClimate(currentClimate(state), eventId, optionId);
}

/**
 * 측우기 보유자에게만 공개하는 선택지 관측 문구다.
 * 이른 서리는 연간 기후에서 계산한 근사 예보이며 실제 판정은 이후 날씨표를 센다.
 */
export function disasterChoiceForecast(
  state: DisasterState,
  eventId: ClimateDisasterEventId,
  optionId: string,
): string | null {
  if ((state.specialItems?.rainGauge ?? 0) <= 0) return null;
  if (eventId === 'earlyFrost' && optionId === 'wait-harvest') {
    const percent = Math.round(disasterChoiceChance(state, eventId, optionId) * 100);
    return `올해 기후로 미루어 서리가 걷힐 가능성은 약 ${percent}%입니다. 이후 나흘의 실제 날씨로 판정합니다.`;
  }
  if (eventId === 'lateFrost' && optionId === 'wait-replant') {
    const percent = Math.round(disasterChoiceChance(state, eventId, optionId) * 100);
    return `올해 기후로 미루어 새싹이 버틸 가능성은 약 ${percent}%입니다. 이후 사흘의 실제 날씨로 판정합니다.`;
  }
  return null;
}

/** 측우기 보유자에게만 보이는 현재 연도 관측 요약이다. */
export function rainGaugeClimateSummary(state: DisasterState): string | null {
  if ((state.specialItems?.rainGauge ?? 0) <= 0) return null;
  return annualClimateSummary(currentClimate(state));
}
