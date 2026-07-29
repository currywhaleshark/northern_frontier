// 정착지 이름 — 자동 생성과 개칭 청원.
//
// 생성은 시드를 별도 salt로 해시하는 순수 함수라 시뮬레이션 공용 RNG를 소비하지
// 않는다 (기존 결정성 불변). 개칭은 파발이 한양을 왕복하는 행정 절차다 —
// 즉시 적용되지 않고, 허가일에 난수 없이 내려온다.
// 계획: docs/DESIGN-2026-07-29-chronicle-screen.md §1-1
import { recordAnnals } from './annals';
import { CONFIG } from './config';
import { addLog } from './events';
import { withJosa } from './josa';
import type { GameState } from './types';

export const SETTLEMENT_NAME_MAX_LENGTH = 12;

// 두 글자 지명 — 북방 변경의 실제 지명 어감(회령·온성·경원…)을 따르되 실명과 겹치지 않게 조합한다.
const NAME_HEADS = [
  '무', '안', '장', '온', '명', '청', '자', '신', '풍', '회',
  '덕', '강', '운', '삼', '영', '백', '낙', '두', '설', '한',
];
const NAME_TAILS = [
  '산', '천', '성', '원', '흥', '계', '곡', '릉', '포', '암',
  '정', '파', '하', '창', '림', '평', '주', '화', '변', '령',
];

/** 시드가 같으면 항상 같은 이름 — 구세이브 마이그레이션이 재실행돼도 흔들리지 않는다. */
export function generateSettlementName(seed: number): string {
  // xorshift 한 줌 — 공용 RNG(makeRng)와 무관한 지역 해시
  let h = (Math.floor(seed) ^ 0x5eed) >>> 0;
  h ^= h << 13; h >>>= 0;
  h ^= h >> 17;
  h ^= h << 5; h >>>= 0;
  const head = NAME_HEADS[h % NAME_HEADS.length];
  const tail = NAME_TAILS[Math.floor(h / NAME_HEADS.length) % NAME_TAILS.length];
  return `${head}${tail}`;
}

/** 입력 정규화 — 앞뒤 공백 제거, 최대 길이 절단. 빈 문자열이면 빈 문자열 그대로 (호출부가 거부). */
export function normalizeSettlementNameInput(raw: string): string {
  return raw.trim().slice(0, SETTLEMENT_NAME_MAX_LENGTH);
}

/** 개칭 청원이 가능한 상태인지 — 불가하면 사유 문자열, 가능하면 null. */
export function canRequestSettlementRename(state: GameState): string | null {
  if (state.pendingSettlementRename) {
    const remaining = state.pendingSettlementRename.dueDay - state.day;
    return `개칭 청원 파발이 아직 한양에서 돌아오지 않았습니다 (${Math.max(1, remaining)}일 뒤)`;
  }
  if (state.day < state.settlementRenameCooldownUntil) {
    return `개칭 허가 후 한 해가 지나야 다시 청원할 수 있습니다 (${state.settlementRenameCooldownUntil - state.day}일 뒤)`;
  }
  return null;
}

/** 개칭 청원 발송 — 성공 시 null, 실패 시 사유. 발송 뒤에는 취소·수정할 수 없다. */
export function requestSettlementRename(state: GameState, rawName: string): string | null {
  const blocked = canRequestSettlementRename(state);
  if (blocked) return blocked;
  const name = normalizeSettlementNameInput(rawName);
  if (!name) return '이름을 비워 둘 수 없습니다';
  if (name === state.settlementName) return '지금 이름과 같습니다';
  state.pendingSettlementRename = {
    requestedName: name,
    sentDay: state.day,
    dueDay: state.day + CONFIG.settlementNaming.renameTravelDays,
  };
  // 발송은 일반 로그만 — 연대기는 실제 개칭이 적용될 때 한 건 남긴다.
  addLog(state, `${withJosa(name, '으로/로')}의 개칭 청원 파발이 한양으로 떠났습니다.`, 'info');
  return null;
}

/** 일일 처리 — 파발이 돌아오는 날, 난수나 추가 승인 없이 허가가 내려온다. */
export function processSettlementRename(state: GameState): void {
  const pending = state.pendingSettlementRename;
  if (!pending || state.day < pending.dueDay) return;
  const oldName = state.settlementName;
  state.settlementName = pending.requestedName;
  state.pendingSettlementRename = null;
  state.settlementRenameCooldownUntil = state.day + CONFIG.time.yearDays;
  const text = `조정의 허가가 내려와 ${withJosa(oldName, '이/가')} ${withJosa(state.settlementName, '으로/로')} 개칭되었습니다.`;
  recordAnnals(state, 'court', text);
  addLog(state, text, 'good', true);
}
