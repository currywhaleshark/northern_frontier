// 자원 증감 헬퍼 — 음수 방지와 소수점 정리를 한 곳에서 처리
import { consumeFoodByDiet, foodTotal } from './consumption';
import type { GameState } from './types';

export function edibleFoodTotal(state: GameState): number {
  return foodTotal(state);
}

// 먹을 수 있는 식량 풀에서 차례대로 소비하고 실제 소비량을 반환한다.
export function consumeEdibleFood(state: GameState, amount: number): number {
  return consumeFoodByDiet(state, amount).totalConsumed;
}

export { foodTotal } from './consumption';
