// 초회 도움말(길잡이 모듈) — "처음 보는 것"에 한 번만 붙는 안내.
// 원칙:
//  - 시나리오와 분리한다. 시나리오는 랜덤 사건을 잠그므로 안내를 위해 붙들어 둘 수 없다.
//  - 저장에는 켬/끔과 본 날짜만 남긴다. 문구·형식은 코드에 있으니 모듈을 고쳐도 마이그레이션이 없다.
//  - 여기서는 "한 번만"과 "켜져 있는가"만 판정한다. 트리거 연결과 카드 UI는 후속 마일스톤이다.
import type { GameState, GuideState } from './types';

function ensureGuideState(state: GameState): GuideState {
  if (!state.guides || typeof state.guides !== 'object' || state.guides.seen == null) {
    // 구버전 저장 보정과 같은 규칙 — 이미 굴러가는 마을에 뒤늦은 안내를 쏟지 않는다
    state.guides = { enabled: false, seen: {} };
  }
  return state.guides;
}

export function guidesEnabled(state: GameState): boolean {
  return state.guides?.enabled === true;
}

export function setGuidesEnabled(state: GameState, enabled: boolean): void {
  ensureGuideState(state).enabled = enabled;
}

export function hasSeenGuide(state: GameState, moduleId: string): boolean {
  return state.guides?.seen?.[moduleId] != null;
}

/**
 * 이 모듈을 처음 여는 경우에만 true를 돌려주고 본 날짜를 기록한다.
 * 호출부는 true일 때만 카드·모달을 띄우면 된다 (표시 자체는 후속 마일스톤).
 */
export function openGuideOnce(state: GameState, moduleId: string): boolean {
  const guides = ensureGuideState(state);
  if (!guides.enabled) return false;
  if (guides.seen[moduleId] != null) return false;
  guides.seen[moduleId] = state.day;
  return true;
}
