import type { Season } from '../game/types';

export interface RiverBanks {
  n: boolean;
  e: boolean;
  s: boolean;
  w: boolean;
}

export const RIVER_AUTOTILE_SIZE = 28;

const SEASON_ROWS: Record<Season, number> = {
  spring: 0,
  summer: 1,
  autumn: 2,
  winter: 3,
};

export function riverSeasonRow(season: Season, frozenRiver: boolean): number {
  if (season === 'winter' && !frozenRiver) return SEASON_ROWS.spring;
  return SEASON_ROWS[season];
}

export function riverConnectorColumnFromBanks(banks?: RiverBanks): number {
  const n = !banks?.n;
  const e = !banks?.e;
  const s = !banks?.s;
  const w = !banks?.w;
  const key = `${n ? 'n' : ''}${e ? 'e' : ''}${s ? 's' : ''}${w ? 'w' : ''}`;

  switch (key) {
    case 'ns': return 0;
    case 'ew': return 1;
    case 'es': return 2;
    case 'sw': return 3;
    case 'nw': return 4;
    case 'ne': return 5;
    case 'n': return 6;
    case 'e': return 7;
    case 's': return 8;
    case 'w': return 9;
    case 'nes': return 10;
    case 'esw': return 11;
    case 'nsw': return 12;
    case 'new': return 13;
    case 'nesw': return 14;
    case '': return 15;
    default: return 14;
  }
}

export function riverSourceRect(season: Season, frozenRiver: boolean, banks?: RiverBanks) {
  return {
    sx: riverConnectorColumnFromBanks(banks) * RIVER_AUTOTILE_SIZE,
    sy: riverSeasonRow(season, frozenRiver) * RIVER_AUTOTILE_SIZE,
    sw: RIVER_AUTOTILE_SIZE,
    sh: RIVER_AUTOTILE_SIZE,
  };
}
