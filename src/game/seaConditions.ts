import { annualClimate, climateSeverityForState } from './climate';
import { CONFIG } from './config';
import { makeRng } from './map';
import { getYear } from './seasons';
import { weatherForDay } from './weatherSchedule';
import type { GameState, WeatherId } from './types';

type SeaCondition = 'calm' | 'rough' | 'storm';

function clampChance(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function seaConditionForDay(
  seed: number,
  day: number,
  weather?: WeatherId,
  climateSeverityMultiplier = 1,
): SeaCondition {
  const resolvedWeather = weather ?? weatherForDay(seed, day, climateSeverityMultiplier);
  const climate = annualClimate(seed, getYear(day), climateSeverityMultiplier);
  const storminess = Number.isFinite(climate.storminess)
    ? Math.max(-1, Math.min(1, climate.storminess))
    : 0;
  const base = CONFIG.fishingBoats.seaConditionWeatherChance[resolvedWeather];
  const stormChance = clampChance(base.storm + storminess * CONFIG.fishingBoats.storminessStormChance);
  const roughChance = clampChance(base.rough + storminess * CONFIG.fishingBoats.storminessRoughChance);
  const rng = makeRng(seed + day * 0x9e3779b1 + CONFIG.fishingBoats.seaConditionSalt);
  const roll = rng();
  if (roll < stormChance) return 'storm';
  if (roll < stormChance + roughChance) return 'rough';
  return 'calm';
}

export function seaConditionAt(
  state: Pick<GameState, 'seed' | 'day' | 'weather'> & Partial<Pick<GameState, 'worldSetup'>>,
): SeaCondition {
  return seaConditionForDay(
    state.seed, state.day, state.weather, climateSeverityForState(state),
  );
}

export function forecastSeaCondition(
  state: Pick<GameState, 'seed' | 'day'> & Partial<Pick<GameState, 'worldSetup'>>,
  daysAhead = 1,
): { day: number; weather: WeatherId; condition: SeaCondition } {
  const day = Math.max(1, state.day + Math.max(0, Math.floor(daysAhead)));
  const severity = climateSeverityForState(state);
  const weather = weatherForDay(state.seed, day, severity);
  return { day, weather, condition: seaConditionForDay(state.seed, day, weather, severity) };
}

export const SEA_CONDITION_NAMES: Record<SeaCondition, string> = {
  calm: '잔잔함',
  rough: '거친 물결',
  storm: '풍랑',
};
