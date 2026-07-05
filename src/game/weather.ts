// 날씨 결정과 날씨 배율
import { CONFIG } from './config';
import { pickWeighted } from './map';
import { getSeason } from './seasons';
import type { WeatherId } from './types';

export function rollWeather(day: number, rng: () => number): WeatherId {
  const season = getSeason(day);
  const table = CONFIG.weather.table[season] as Record<WeatherId, number>;
  return pickWeighted(rng, table);
}

export function outdoorMult(weather: WeatherId): number {
  return CONFIG.weather.outdoorMult[weather];
}

export function firewoodWeatherMult(weather: WeatherId): number {
  return CONFIG.weather.firewoodMult[weather];
}

export function warmthLossWeatherMult(weather: WeatherId): number {
  return CONFIG.weather.warmthLossMult[weather];
}

export function isSevereWeather(weather: WeatherId): boolean {
  return weather === 'blizzard' || weather === 'coldSnap' || weather === 'heavySnow';
}
