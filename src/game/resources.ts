// 자원 증감 헬퍼 — 음수 방지와 소수점 정리를 한 곳에서 처리
import { consumeFoodByDiet, foodTotal } from './consumption';
import type { GameState, ResourceId } from './types';

export function addRes(state: GameState, id: ResourceId, amount: number): void {
  if (!Number.isFinite(amount)) return;
  state.resources[id] = Math.max(0, (state.resources[id] ?? 0) + amount);
}

// 요청량만큼 소비하고 실제로 소비한 양을 반환
export function spendRes(state: GameState, id: ResourceId, amount: number): number {
  const requested = Number.isFinite(amount) ? Math.max(0, amount) : 0;
  const spent = Math.min(state.resources[id] ?? 0, requested);
  state.resources[id] -= spent;
  return spent;
}

export function hasRes(state: GameState, id: ResourceId, amount: number): boolean {
  return state.resources[id] >= amount;
}

export function edibleFoodTotal(state: GameState): number {
  return foodTotal(state);
}

// 먹을 수 있는 식량 풀에서 차례대로 소비하고 실제 소비량을 반환한다.
export function consumeEdibleFood(state: GameState, amount: number): number {
  return consumeFoodByDiet(state, amount).totalConsumed;
}

export { foodTotal } from './consumption';
