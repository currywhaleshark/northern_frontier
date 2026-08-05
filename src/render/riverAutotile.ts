import type { Season } from '../game/types';

// 강 타일의 이웃 정보 — true면 그 방향이 뭍(강이 아님)
// 렌더러는 이 정보로 물 영역을 계산해 강 폭이 지도 그대로 드러나게 그린다.
interface RiverNeighbors {
  n: boolean;
  e: boolean;
  s: boolean;
  w: boolean;
  ne: boolean;
  se: boolean;
  sw: boolean;
  nw: boolean;
}

export const RIVER_AUTOTILE_SIZE = 28;
export const RIVER_FILL_COLUMN = 16; // 시트 17번째 칸: 타일 전체 물 텍스처
export const RIVER_BANK_INSET = 6;   // 뭍 방향으로 물이 물러나는 여백 (28px 기준)
export const RIVER_BANK_STRIP = 2;   // 물과 뭍 사이 둑 띠 두께 (28px 기준)

const SEASON_ROWS: Record<Season, number> = {
  spring: 0,
  summer: 1,
  autumn: 2,
  winter: 3,
};

// 계절별 둑 색 — 빌더(build_river_mask_tiles.py)의 SEASON_TINTS.bank와 같은 값
export const RIVER_BANK_COLORS: Record<Season, string> = {
  spring: 'rgb(82,84,56)',
  summer: 'rgb(63,73,42)',
  autumn: 'rgb(95,74,42)',
  winter: 'rgb(142,145,143)',
};

export function riverSeasonRow(season: Season, frozenRiver: boolean): number {
  if (season === 'winter' && !frozenRiver) return SEASON_ROWS.spring;
  return SEASON_ROWS[season];
}

// 물 전면 텍스처 칸의 시트 좌표
export function riverFillSourceRect(season: Season, frozenRiver: boolean) {
  return {
    sx: RIVER_FILL_COLUMN * RIVER_AUTOTILE_SIZE,
    sy: riverSeasonRow(season, frozenRiver) * RIVER_AUTOTILE_SIZE,
    sw: RIVER_AUTOTILE_SIZE,
    sh: RIVER_AUTOTILE_SIZE,
  };
}

interface RiverWaterBox {
  x0: number;
  y0: number;
  x1: number; // exclusive
  y1: number; // exclusive
}

// 물 영역 (28px 기준 좌표): 뭍인 방향만 둑 여백만큼 안으로 들어온다.
// 이웃이 강이면 타일 가장자리까지 물이 닿아, 붙어 있는 강 타일끼리 한 물줄기로 이어진다.
export function riverWaterBox(nb: RiverNeighbors): RiverWaterBox {
  return {
    x0: nb.w ? RIVER_BANK_INSET : 0,
    y0: nb.n ? RIVER_BANK_INSET : 0,
    x1: nb.e ? RIVER_AUTOTILE_SIZE - RIVER_BANK_INSET : RIVER_AUTOTILE_SIZE,
    y1: nb.s ? RIVER_AUTOTILE_SIZE - RIVER_BANK_INSET : RIVER_AUTOTILE_SIZE,
  };
}

type RiverCorner = 'ne' | 'se' | 'sw' | 'nw';

// 대각선만 뭍인 모서리: 양옆이 모두 강이라 물이 타일 모서리까지 닿지만,
// 대각선의 뭍 모퉁이를 침범하면 안 되므로 그 모서리를 뭍으로 되메운다.
export function riverLandCorners(nb: RiverNeighbors): RiverCorner[] {
  const out: RiverCorner[] = [];
  if (!nb.n && !nb.e && nb.ne) out.push('ne');
  if (!nb.s && !nb.e && nb.se) out.push('se');
  if (!nb.s && !nb.w && nb.sw) out.push('sw');
  if (!nb.n && !nb.w && nb.nw) out.push('nw');
  return out;
}

// 양옆이 모두 뭍인 바깥 굽이 모서리: 물 상자 모서리를 계단식으로 둥글린다.
export function riverRoundedCorners(nb: RiverNeighbors): RiverCorner[] {
  const out: RiverCorner[] = [];
  if (nb.n && nb.e) out.push('ne');
  if (nb.s && nb.e) out.push('se');
  if (nb.s && nb.w) out.push('sw');
  if (nb.n && nb.w) out.push('nw');
  return out;
}
