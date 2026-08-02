import type { Terrain } from './types';

export type NaturalWaterTerrain = Extract<Terrain, 'river' | 'lake'>;
export type OpenWaterTerrain = Extract<Terrain, 'river' | 'lake' | 'sea'>;
export type SaltWaterTerrain = Extract<Terrain, 'sea'>;

/** 땅 위에 드러난 자연수. 급수·관개·소방과 물가 연결에 사용한다. */
export function isNaturalWaterTerrain(terrain: Terrain): terrain is NaturalWaterTerrain {
  return terrain === 'river' || terrain === 'lake';
}

/** 육상 이동·일반 건설·지형 돌출부를 막는 모든 열린 수면. 담수 공급 판정에는 쓰지 않는다. */
export function isOpenWaterTerrain(terrain: Terrain): terrain is OpenWaterTerrain {
  return terrain === 'river' || terrain === 'lake' || terrain === 'sea';
}

export function isSaltWaterTerrain(terrain: Terrain): terrain is SaltWaterTerrain {
  return terrain === 'sea';
}

/** 흐름·보·제방·물레방아·봄 홍수처럼 유수가 필요한 규칙에만 사용한다. */
export function isFlowingRiverTerrain(terrain: Terrain): terrain is 'river' {
  return terrain === 'river';
}
