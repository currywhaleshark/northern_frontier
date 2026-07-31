// 시나리오 진행 표식 — 플래그(0/1)와 누계(생산량 등)를 만지는 두 함수만 모아 둔 잎 모듈.
// scenario.ts에 두지 않은 이유는 순환 import 하나뿐이다:
// agents.ts(생산 훅)가 누계를 올려야 하는데, scenario.ts는 R5에서 raids.ts를 부르고
// raids.ts는 agents.ts를 부른다 — agents → scenario → raids → agents가 된다.
// 상태만 만지고 아무것도 import하지 않는 이 두 함수를 떼어 놓으면 고리가 끊긴다.
// scenario.ts가 그대로 다시 내보내므로 부르는 쪽의 관례(markScenarioFlag)는 그대로다.
import type { GameState } from './types';

/** UI 상호작용·사건 표식 (예: 주민 선택, 광맥 탭 열람) — 0/1 이진 */
export function markScenarioFlag(state: GameState, key: string): void {
  if (!state.scenario || state.scenario.completed) return;
  state.scenario.flags[key] = 1;
}

/** 누계 표식 (예: 대장간이 지은 도구 수) — 시나리오가 도는 동안에만 쌓인다 */
export function countScenarioProgress(state: GameState, key: string, amount: number): void {
  if (!state.scenario || state.scenario.completed) return;
  if (!Number.isFinite(amount) || amount <= 0) return;
  state.scenario.flags[key] = (state.scenario.flags[key] ?? 0) + amount;
}
