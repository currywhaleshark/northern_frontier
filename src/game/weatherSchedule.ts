// 연간 기후를 계절별 총일수와 1~3일 날씨 구간으로 변환한다.
import { annualClimate, type AnnualClimate } from './climate';
import { CONFIG } from './config';
import { makeRng } from './map';
import { getDayOfSeason, getSeason, getYear } from './seasons';
import type { Season, WeatherId } from './types';

const ALL_WEATHER: readonly WeatherId[] = [
  'clear',
  'rain',
  'frost',
  'heavySnow',
  'blizzard',
  'coldSnap',
  'thawFlood',
];
const PRECIPITATION_WEATHER: readonly WeatherId[] = ['rain', 'heavySnow', 'blizzard'];
const REGULAR_NON_PRECIPITATION_WEATHER: readonly WeatherId[] = ['clear', 'frost', 'coldSnap'];

type WeatherCounts = Record<WeatherId, number>;
type ScheduleStream = keyof typeof CONFIG.weather.schedule.streamSalts;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function finiteAnomaly(value: number): number {
  return Number.isFinite(value) ? clamp(value, -1, 1) : 0;
}

function emptyWeatherCounts(): WeatherCounts {
  return {
    clear: 0,
    rain: 0,
    frost: 0,
    heavySnow: 0,
    blizzard: 0,
    coldSnap: 0,
    thawFlood: 0,
  };
}

function baseTable(season: Season): Record<WeatherId, number> {
  return CONFIG.weather.table[season] as Record<WeatherId, number>;
}

function safeWeight(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function tableWeight(table: Record<WeatherId, number>, weather: WeatherId): number {
  return safeWeight(table[weather]);
}

function scheduleRng(seed: number, year: number, season: Season, stream: ScheduleStream): () => number {
  const schedule = CONFIG.weather.schedule;
  return makeRng(
    seed
      + year * schedule.yearSeedMultiplier
      + schedule.seasonSalts[season]
      + schedule.streamSalts[stream],
  );
}

function climateMultipliers(climate: AnnualClimate) {
  const schedule = CONFIG.weather.schedule;
  const temperature = finiteAnomaly(climate.temperatureAnomaly);
  const precipitation = finiteAnomaly(climate.precipitationAnomaly);
  const storminess = finiteAnomaly(climate.storminess);
  return {
    precipitation: clamp(
      1 + schedule.precipitationAnomalyFactor * precipitation,
      1 - schedule.precipitationAnomalyFactor,
      1 + schedule.precipitationAnomalyFactor,
    ),
    cold: clamp(
      1 - schedule.temperatureColdFactor * temperature,
      1 - schedule.temperatureColdFactor,
      1 + schedule.temperatureColdFactor,
    ),
    warm: clamp(
      1 + schedule.temperatureWarmFactor * temperature,
      1 - schedule.temperatureWarmFactor,
      1 + schedule.temperatureWarmFactor,
    ),
    storm: clamp(
      1 + schedule.storminessFactor * storminess,
      1 - schedule.storminessFactor,
      1 + schedule.storminessFactor,
    ),
  };
}

function stochasticRound(expected: number, rng: () => number): number {
  if (!Number.isFinite(expected) || expected <= 0) return 0;
  const base = Math.floor(expected);
  return base + (rng() < expected - base ? 1 : 0);
}

function seasonalJitter(rng: () => number): -1 | 0 | 1 {
  const weights = CONFIG.weather.schedule.seasonalJitterWeights;
  const roll = rng();
  if (roll < weights.minusOne) return -1;
  if (roll < weights.minusOne + weights.zero) return 0;
  return 1;
}

/**
 * 두 후보에 가장 큰 나머지 방식으로 정확히 total개를 배분한다.
 * firstWeight가 같은 RNG 표본에서 증가하면 first의 배정량도 감소하지 않는다.
 */
function allocatePair(
  total: number,
  firstWeight: number,
  secondWeight: number,
  rng: () => number,
): [number, number] {
  if (total <= 0) return [0, 0];
  const first = safeWeight(firstWeight);
  const second = safeWeight(secondWeight);
  if (first <= 0 && second <= 0) return [0, total];
  if (first <= 0) return [0, total];
  if (second <= 0) return [total, 0];

  const exactFirst = total * first / (first + second);
  const floorFirst = Math.floor(exactFirst);
  const remainder = exactFirst - floorFirst;
  const firstDays = floorFirst + (
    remainder > 0.5 || (Math.abs(remainder - 0.5) < 1e-12 && rng() < 0.5) ? 1 : 0
  );
  return [firstDays, total - firstDays];
}

function adjustedWeatherWeights(
  table: Record<WeatherId, number>,
  climate: AnnualClimate,
): WeatherCounts {
  const mult = climateMultipliers(climate);
  return {
    clear: tableWeight(table, 'clear'),
    rain: tableWeight(table, 'rain') * mult.warm,
    frost: tableWeight(table, 'frost') * mult.cold,
    heavySnow: tableWeight(table, 'heavySnow') * mult.cold,
    blizzard: tableWeight(table, 'blizzard') * mult.cold * mult.storm,
    coldSnap: tableWeight(table, 'coldSnap') * mult.cold * mult.storm,
    thawFlood: tableWeight(table, 'thawFlood'),
  };
}

function countSnowDays(schedule: readonly WeatherId[]): number {
  return schedule.filter(weather => weather === 'heavySnow' || weather === 'blizzard').length;
}

/**
 * 봄만 직전 겨울의 예정 적설을 참조한다. 겨울 일정은 다시 홍수를 참조하지 않으므로
 * year - 1 겨울을 재생성해도 순환 호출이 생기지 않는다.
 */
function previousWinterSnowDays(
  seed: number,
  year: number,
  override?: number,
): number {
  if (Number.isFinite(override)) return Math.max(0, Math.floor(override!));
  if (year <= 1) return CONFIG.weather.schedule.thawFlood.normalWinterSnowDays;
  return countSnowDays(seasonWeatherSchedule(seed, year - 1, 'winter'));
}

function thawFloodDays(
  seed: number,
  year: number,
  season: Season,
  climate: AnnualClimate,
  table: Record<WeatherId, number>,
  totalBaseWeight: number,
  priorWinterSnowDays?: number,
): number {
  if (season !== 'spring' || tableWeight(table, 'thawFlood') <= 0) return 0;

  const thaw = CONFIG.weather.schedule.thawFlood;
  const baselineDays = CONFIG.time.seasonDays * tableWeight(table, 'thawFlood') / totalBaseWeight;
  const snowDeviation = previousWinterSnowDays(seed, year, priorWinterSnowDays)
    - thaw.normalWinterSnowDays;
  const expected = baselineDays
    + snowDeviation * thaw.snowDayFactor
    + finiteAnomaly(climate.temperatureAnomaly) * thaw.temperatureAnomalyFactor;
  return clamp(
    stochasticRound(expected, scheduleRng(seed, year, season, 'thawFlood')),
    0,
    thaw.maxDays,
  );
}

/** 홍수는 강수일을 줄이지 않고, 먼저 맑음·그 다음 서리 날을 대체한다. */
function replaceNonPrecipitationWithThawFlood(counts: WeatherCounts, desiredDays: number): void {
  let remaining = desiredDays;
  const clearDays = Math.min(remaining, counts.clear);
  counts.clear -= clearDays;
  counts.thawFlood += clearDays;
  remaining -= clearDays;

  const frostDays = Math.min(remaining, counts.frost);
  counts.frost -= frostDays;
  counts.thawFlood += frostDays;
}

function allocatePrecipitation(
  total: number,
  weights: WeatherCounts,
  rng: () => number,
): Pick<WeatherCounts, 'rain' | 'heavySnow' | 'blizzard'> {
  const snowWeight = weights.heavySnow + weights.blizzard;
  const [rain, snow] = allocatePair(total, weights.rain, snowWeight, rng);
  const [heavySnow, blizzard] = allocatePair(snow, weights.heavySnow, weights.blizzard, rng);
  return { rain, heavySnow, blizzard };
}

function allocateNonPrecipitation(
  total: number,
  weights: WeatherCounts,
  rng: () => number,
): Pick<WeatherCounts, 'clear' | 'frost' | 'coldSnap'> {
  const coldWeatherWeight = weights.frost + weights.coldSnap;
  const [clear, coldWeather] = allocatePair(total, weights.clear, coldWeatherWeight, rng);
  const [frost, coldSnap] = allocatePair(coldWeather, weights.frost, weights.coldSnap, rng);
  return { clear, frost, coldSnap };
}

function sameAllocationGroup(weather: WeatherId): readonly WeatherId[] {
  if (PRECIPITATION_WEATHER.includes(weather)) return PRECIPITATION_WEATHER;
  if (REGULAR_NON_PRECIPITATION_WEATHER.includes(weather)) {
    return REGULAR_NON_PRECIPITATION_WEATHER;
  }
  return ['clear', 'frost', 'coldSnap', 'thawFlood'];
}

/**
 * 매우 건조한 여름처럼 맑은 날이 압도적이어도 실제 연속 구간 상한을 지킬 수 있게
 * 같은 강수/비강수 그룹 안의 허용 날씨로 최소한만 재배분한다.
 */
function makeRunCapsFeasible(
  counts: WeatherCounts,
  table: Record<WeatherId, number>,
  adjustedWeights: WeatherCounts,
): void {
  const seasonDays = CONFIG.time.seasonDays;
  for (let guard = 0; guard < seasonDays * ALL_WEATHER.length; guard++) {
    const dominant = ALL_WEATHER.find(weather => {
      const count = counts[weather];
      const others = seasonDays - count;
      return count > CONFIG.weather.schedule.runMax[weather] * (others + 1);
    });
    if (!dominant) return;

    const candidates = sameAllocationGroup(dominant)
      .filter(weather => weather !== dominant && tableWeight(table, weather) > 0)
      .sort((a, b) => adjustedWeights[b] - adjustedWeights[a]);
    if (candidates.length === 0) return;
    counts[dominant] -= 1;
    counts[candidates[0]] += 1;
  }
}

function weatherCountsForClimate(
  seed: number,
  year: number,
  season: Season,
  climate: AnnualClimate,
  priorWinterSnowDays?: number,
): WeatherCounts {
  const table = baseTable(season);
  const seasonDays = CONFIG.time.seasonDays;
  const totalBaseWeight = ALL_WEATHER.reduce(
    (sum, weather) => sum + tableWeight(table, weather),
    0,
  );
  const counts = emptyWeatherCounts();
  if (seasonDays <= 0 || totalBaseWeight <= 0) return counts;

  const basePrecipitationWeight = PRECIPITATION_WEATHER.reduce(
    (sum, weather) => sum + tableWeight(table, weather),
    0,
  );
  const precipitationRng = scheduleRng(seed, year, season, 'precipitationTotal');
  const expectedPrecipitationDays = clamp(
    seasonDays
      * basePrecipitationWeight
      / totalBaseWeight
      * climateMultipliers(climate).precipitation,
    0,
    seasonDays,
  );
  counts.rain = clamp(
    stochasticRound(expectedPrecipitationDays, precipitationRng)
      + seasonalJitter(precipitationRng),
    0,
    seasonDays,
  );
  const precipitationDays = counts.rain;
  counts.rain = 0;

  const adjustedWeights = adjustedWeatherWeights(table, climate);
  const precipCounts = allocatePrecipitation(
    precipitationDays,
    adjustedWeights,
    scheduleRng(seed, year, season, 'precipitationSplit'),
  );
  counts.rain = precipCounts.rain;
  counts.heavySnow = precipCounts.heavySnow;
  counts.blizzard = precipCounts.blizzard;

  const nonPrecipitationDays = seasonDays - precipitationDays;
  const nonPrecipCounts = allocateNonPrecipitation(
    nonPrecipitationDays,
    adjustedWeights,
    scheduleRng(seed, year, season, 'nonPrecipitationSplit'),
  );
  counts.clear = nonPrecipCounts.clear;
  counts.frost = nonPrecipCounts.frost;
  counts.coldSnap = nonPrecipCounts.coldSnap;

  replaceNonPrecipitationWithThawFlood(
    counts,
    thawFloodDays(seed, year, season, climate, table, totalBaseWeight, priorWinterSnowDays),
  );

  makeRunCapsFeasible(counts, table, adjustedWeights);
  return counts;
}

function minimumChunkCounts(counts: WeatherCounts): WeatherCounts {
  const chunks = emptyWeatherCounts();
  for (const weather of ALL_WEATHER) {
    const count = counts[weather];
    if (count > 0) chunks[weather] = Math.ceil(count / CONFIG.weather.schedule.runMax[weather]);
  }
  return chunks;
}

function makeChunkOrderFeasible(counts: WeatherCounts, chunkCounts: WeatherCounts): void {
  const seasonDays = CONFIG.time.seasonDays;
  for (let guard = 0; guard < seasonDays * ALL_WEATHER.length; guard++) {
    const totalChunks = ALL_WEATHER.reduce((sum, weather) => sum + chunkCounts[weather], 0);
    const dominant = ALL_WEATHER.find(
      weather => chunkCounts[weather] > totalChunks - chunkCounts[weather] + 1,
    );
    if (!dominant) return;

    const candidates = ALL_WEATHER
      .filter(weather => weather !== dominant && chunkCounts[weather] < counts[weather])
      .sort((a, b) => (counts[b] - chunkCounts[b]) - (counts[a] - chunkCounts[a]));
    if (candidates.length === 0) return;
    chunkCounts[candidates[0]] += 1;
  }
}

function splitIntoChunks(
  count: number,
  chunkCount: number,
  maxRun: number,
  rng: () => number,
): number[] {
  if (count <= 0 || chunkCount <= 0) return [];
  const chunks = Array.from({ length: chunkCount }, () => 1);
  let remaining = count - chunkCount;
  while (remaining > 0) {
    const candidates = chunks
      .map((length, index) => ({ length, index }))
      .filter(chunk => chunk.length < maxRun);
    const selected = candidates[Math.floor(rng() * candidates.length)];
    chunks[selected.index] += 1;
    remaining -= 1;
  }
  return chunks;
}

function canCompleteChunkOrder(remaining: WeatherCounts, previous: WeatherId | null): boolean {
  const total = ALL_WEATHER.reduce((sum, weather) => sum + remaining[weather], 0);
  return ALL_WEATHER.every(weather => {
    const otherChunks = total - remaining[weather];
    const availableSlots = otherChunks + (weather === previous ? 0 : 1);
    return remaining[weather] <= availableSlots;
  });
}

function arrangeWeatherRuns(
  counts: WeatherCounts,
  seed: number,
  year: number,
  season: Season,
): WeatherId[] {
  const rng = scheduleRng(seed, year, season, 'runs');
  const chunkCounts = minimumChunkCounts(counts);
  makeChunkOrderFeasible(counts, chunkCounts);

  const chunks = new Map<WeatherId, number[]>();
  for (const weather of ALL_WEATHER) {
    chunks.set(
      weather,
      splitIntoChunks(
        counts[weather],
        chunkCounts[weather],
        CONFIG.weather.schedule.runMax[weather],
        rng,
      ),
    );
  }

  const remaining = { ...chunkCounts };
  const result: WeatherId[] = [];
  let previous: WeatherId | null = null;
  while (ALL_WEATHER.some(weather => remaining[weather] > 0)) {
    const candidates = ALL_WEATHER.filter(weather => weather !== previous && remaining[weather] > 0);
    const viable = candidates.filter(weather => {
      remaining[weather] -= 1;
      const possible = canCompleteChunkOrder(remaining, weather);
      remaining[weather] += 1;
      return possible;
    });
    const pool = viable.length > 0 ? viable : candidates;
    const highestRemaining = Math.max(...pool.map(weather => remaining[weather]));
    const tied = pool.filter(weather => remaining[weather] === highestRemaining);
    const weather = tied[Math.floor(rng() * tied.length)];
    const weatherChunks = chunks.get(weather)!;
    const chunkIndex = Math.floor(rng() * weatherChunks.length);
    const [length] = weatherChunks.splice(chunkIndex, 1);
    for (let day = 0; day < length; day++) result.push(weather);
    remaining[weather] -= 1;
    previous = weather;
  }
  return result;
}

/**
 * 고정한 시험 기후나 후속 재해 계산에서 사용할 수 있는 순수 계절 날씨표 생성기.
 * 기본 가중치가 0인 날씨는 기후가 극단적이어도 생성하지 않는다.
 */
export function seasonWeatherScheduleForClimate(
  seed: number,
  year: number,
  season: Season,
  climate: AnnualClimate,
  priorWinterSnowDays?: number,
): readonly WeatherId[] {
  const counts = weatherCountsForClimate(seed, year, season, climate, priorWinterSnowDays);
  return arrangeWeatherRuns(counts, seed, year, season);
}

export function seasonWeatherSchedule(
  seed: number,
  year: number,
  season: Season,
): readonly WeatherId[] {
  return seasonWeatherScheduleForClimate(seed, year, season, annualClimate(seed, year));
}

export function weatherForDay(seed: number, day: number): WeatherId {
  const schedule = seasonWeatherSchedule(seed, getYear(day), getSeason(day));
  return schedule[getDayOfSeason(day) - 1];
}
