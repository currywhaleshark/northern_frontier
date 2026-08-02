import type { Terrain } from './types';

export type NaturalWaterTerrain = Extract<Terrain, 'river' | 'lake'>;

/** 땅 위에 드러난 자연수. 급수·관개·소방과 물가 연결에 사용한다. */
export function isNaturalWaterTerrain(terrain: Terrain): terrain is NaturalWaterTerrain {
  return terrain === 'river' || terrain === 'lake';
}

/** 흐름·보·제방·물레방아·봄 홍수처럼 유수가 필요한 규칙에만 사용한다. */
export function isFlowingRiverTerrain(terrain: Terrain): terrain is 'river' {
  return terrain === 'river';
}
