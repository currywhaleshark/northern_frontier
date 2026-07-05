// 자원 증감 헬퍼 — 음수 방지와 소수점 정리를 한 곳에서 처리
import type { GameState, ResourceId } from './types';

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
