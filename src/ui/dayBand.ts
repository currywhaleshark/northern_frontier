// 하루 대역의 UI 표기 — 라벨·아이콘과 안전한 조회.
// 대역 정의의 단일 진실은 src/game/dayCycle.ts (M0 계약). 여기는 표기 계층만 둔다.
import { DAY_CYCLE_SUBTICKS, dayBandOf } from '../game/dayCycle';
import type { DayBand } from '../game/types';

export const DAY_BAND_NAMES: Readonly<Record<DayBand, string>> = {
  dawn: '새벽',
  work: '낮',
  evening: '저녁',
  night: '밤',
};

// dayBandOf는 범위 밖에서 throw하는 계약 — UI는 어떤 subTick이 와도 그리긴 해야 하므로
// 정수화·클램프 후 조회한다 (런타임이 아직 8서브틱인 M1-BE 이전 구간 포함).
export function uiDayBand(subTick: number): DayBand {
  const clamped = Math.min(DAY_CYCLE_SUBTICKS - 1, Math.max(0, Math.floor(subTick)));
  return dayBandOf(clamped);
}
