// 저장 상태 없이 세계 시드와 연차에서 재생성하는 연간 기후.
import { CONFIG } from './config';
import { makeRng } from './map';
import { getYear } from './seasons';
import type { GameState } from './types';

export interface AnnualClimate {
  /** -1 한랭 ~ +1 온난 */
  temperatureAnomaly: number;
  /** -1 건조 ~ +1 다습 */
  precipitationAnomaly: number;
  /** -1 잔잔 ~ +1 거침 */
  storminess: number;
}

type AnnualClimateAxis = keyof typeof CONFIG.climate.annualSalts;

function climateAxisAnomaly(seed: number, year: number, axis: AnnualClimateAxis): number {
  const salt = CONFIG.climate.annualSalts[axis];
  // makeRng는 입력을 uint32로 정규화한다. 각 축은 독립한 RNG 두 번만 쓰므로
  // 다른 축의 salt나 난수 소비 변경이 이 축의 결과에 영향을 주지 않는다.
  const rng = makeRng(seed + year * CONFIG.climate.yearSeedMultiplier + salt);
  return rng() - rng();
}

/**
 * 해당 연도의 기후 편차를 결정적으로 생성한다.
 *
 * year는 게임의 1 기반 연차다. 각 축은 `rng() - rng()` 삼각분포를 사용해
 * 0 부근은 자주, -1·+1 부근은 드물게 만든다.
 */
function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function climateSeverity(value: number): number {
  return Number.isFinite(value) ? clamp(value, 0.5, 1.5) : 1;
}

/** -1(안전)~+1(위험) 축을 0~1 위험량으로 옮겨 혹독도 배율을 단조 적용한다. */
function scaledHazardAxis(value: number, severity: number): number {
  return clamp((clamp(value, -1, 1) + 1) * climateSeverity(severity) - 1, -1, 1);
}

export function annualClimate(seed: number, year: number, severity = 1): AnnualClimate {
  const base = {
    temperatureAnomaly: climateAxisAnomaly(seed, year, 'temperature'),
    precipitationAnomaly: climateAxisAnomaly(seed, year, 'precipitation'),
    storminess: climateAxisAnomaly(seed, year, 'storminess'),
  };
  if (Math.abs(severity - 1) < 1e-9) return base;
  return {
    temperatureAnomaly: -scaledHazardAxis(-base.temperatureAnomaly, severity),
    precipitationAnomaly: -scaledHazardAxis(-base.precipitationAnomaly, severity),
    storminess: scaledHazardAxis(base.storminess, severity),
  };
}

type ClimateState = Pick<GameState, 'seed' | 'day'> & Partial<Pick<GameState, 'worldSetup'>>;

export function climateSeverityForState(state: Partial<Pick<GameState, 'worldSetup'>>): number {
  return climateSeverity(state.worldSetup?.effective.climateSeverityMultiplier ?? 1);
}

export function annualClimateForState(state: ClimateState): AnnualClimate {
  return annualClimate(state.seed, getYear(state.day), climateSeverityForState(state));
}

function climateValueOrNormal(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

/** 연간 기온 편차를 플레이어용 구간으로 표현한다. */
export function climateTemperatureLabel(climate: AnnualClimate): string {
  const value = climateValueOrNormal(climate.temperatureAnomaly);
  if (value <= -0.6) return '매우 추움';
  if (value <= -0.2) return '추움';
  if (value < 0.2) return '평년';
  if (value < 0.6) return '온화함';
  return '매우 온화함';
}

/** 연간 강수 편차를 플레이어용 구간으로 표현한다. */
export function climatePrecipitationLabel(climate: AnnualClimate): string {
  const value = climateValueOrNormal(climate.precipitationAnomaly);
  if (value <= -0.6) return '매우 건조';
  if (value <= -0.2) return '건조';
  if (value < 0.2) return '예년과 비슷';
  if (value < 0.6) return '습윤';
  return '매우 습윤';
}

/** 연간 폭풍성 편차를 플레이어용 구간으로 표현한다. */
export function climateStorminessLabel(climate: AnnualClimate): string {
  const value = climateValueOrNormal(climate.storminess);
  if (value <= -0.2) return '잔잔함';
  if (value < 0.2) return '평년';
  return '궂은 날이 잦음';
}

/** 측우기 등의 UI가 사용할 연간 기후 요약이다. */
export function annualClimateSummary(climate: AnnualClimate): string {
  return `금년 관측: ${climatePrecipitationLabel(climate)} · ${climateTemperatureLabel(climate)} · ${climateStorminessLabel(climate)}`;
}
