// 날짜 ↔ 계절 변환
import { CONFIG } from './config';
import { SEASON_ORDER } from './constants';
import type { Season } from './types';

export function getYear(day: number): number {
  return Math.floor((day - 1) / CONFIG.time.yearDays) + 1;
}

export function getDayOfYear(day: number): number {
  return ((day - 1) % CONFIG.time.yearDays) + 1;
}

export function getSeason(day: number): Season {
  const idx = Math.floor((getDayOfYear(day) - 1) / CONFIG.time.seasonDays);
  return SEASON_ORDER[idx];
}

export function getDayOfSeason(day: number): number {
  return ((getDayOfYear(day) - 1) % CONFIG.time.seasonDays) + 1;
}

export function isColdSeason(day: number): boolean {
  const s = getSeason(day);
  return s === 'autumn' || s === 'winter';
}
