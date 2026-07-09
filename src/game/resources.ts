// 자원 증감 헬퍼 — 음수 방지와 소수점 정리를 한 곳에서 처리
import type { GameState, ResourceId } from './types';

export const EDIBLE_FOOD_RESOURCES = ['food', 'meat', 'fish', 'grain'] as const satisfies readonly ResourceId[];

export function addRes(state: GameState, id: ResourceId, amount: number): void {
  state.resources[id] = Math.max(0, state.resources[id] + amount);
}

// 요청량만큼 소비하고 실제로 소비한 양을 반환
export function spendRes(state: GameState, id: ResourceId, amount: number): number {
  const spent = Math.min(state.resources[id], amount);
  state.resources[id] -= spent;
  return spent;
}

export function hasRes(state: GameState, id: ResourceId, amount: number): boolean {
  return state.resources[id] >= amount;
}

export function edibleFoodTotal(state: GameState): number {
  return EDIBLE_FOOD_RESOURCES.reduce((sum, id) => {
    if (id === 'grain') return sum + Math.max(0, (state.resources.grain ?? 0) - (state.processingReserves?.grain ?? 0));
    return sum + (state.resources[id] ?? 0);
  }, 0);
}

// 먹을 수 있는 식량 풀에서 차례대로 소비하고 실제 소비량을 반환한다.
export function consumeEdibleFood(state: GameState, amount: number): number {
  let remaining = Math.max(0, amount);
  let consumed = 0;
  for (const id of EDIBLE_FOOD_RESOURCES) {
    if (remaining <= 0) break;
    const available = id === 'grain'
      ? Math.max(0, (state.resources.grain ?? 0) - (state.processingReserves?.grain ?? 0))
      : (state.resources[id] ?? 0);
    const taken = Math.min(available, remaining);
    state.resources[id] = Math.max(0, (state.resources[id] ?? 0) - taken);
    remaining -= taken;
    consumed += taken;
  }
  return consumed;
}
