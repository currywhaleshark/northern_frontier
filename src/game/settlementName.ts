// 정착지 이름 — 자동 생성과 개칭 청원.
//
// 생성은 시드를 별도 salt로 해시하는 순수 함수라 시뮬레이션 공용 RNG를 소비하지
// 않는다 (기존 결정성 불변). 개칭은 파발이 한양을 왕복하는 행정 절차다 —
// 즉시 적용되지 않고, 허가일에 난수 없이 내려온다.
// 계획: docs/DESIGN-2026-07-29-chronicle-screen.md §1-1
import { recordAnnals } from './annals';
import { CONFIG } from './config';
import { addLog } from './events';
import { BORDER_COMMANDER_TITLE } from './diplomaticFigures';
import { withJosa } from './josa';
import type { GameState, Rank } from './types';

export const SETTLEMENT_NAME_MAX_LENGTH = 12;

// 행정단위 — 저장되는 이름은 밑이름(예: "설한")이고, 표기는 등급이 정한다.
// 정착지 설한촌 → 보 승격 후 설한보 → 설한진 → 설한부.
export const RANK_UNITS: Record<Rank, string> = { settlement: '촌', bo: '보', jin: '진', bu: '부' };

export function displaySettlementName(name: string, rank: Rank): string {
  return `${name}${RANK_UNITS[rank]}`;
}

export function settlementDisplayName(state: Pick<GameState, 'settlementName' | 'rank'>): string {
  return displaySettlementName(state.settlementName, state.rank);
}

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

/**
 * 입력 정규화 — 앞뒤 공백 제거, 최대 길이 절단. 빈 문자열이면 빈 문자열 그대로 (호출부가 거부).
 * 행정단위는 게임이 등급에 맞춰 붙이므로, 습관적으로 붙여 적은 꼬리 단위 한 글자
 * (촌·보·진·부)는 떼어 밑이름만 남긴다 — 남는 밑이름이 두 글자 이상일 때만.
 */
export function normalizeSettlementNameInput(raw: string): string {
  let name = raw.trim().slice(0, SETTLEMENT_NAME_MAX_LENGTH);
  if (name.length >= 3 && '촌보진부'.includes(name[name.length - 1])) {
    name = name.slice(0, -1);
  }
  return name;
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
  const oldDisplay = settlementDisplayName(state);
  state.settlementName = pending.requestedName;
  state.pendingSettlementRename = null;
  state.settlementRenameCooldownUntil = state.day + CONFIG.time.yearDays;
  const commander = `${BORDER_COMMANDER_TITLE} ${state.borderCommander.name}`;
  const text = `${withJosa(commander, '이/가')} 조정의 허가를 전해 ${withJosa(oldDisplay, '이/가')} ${withJosa(settlementDisplayName(state), '으로/로')} 개칭되었습니다.`;
  recordAnnals(state, 'court', text);
  addLog(state, text, 'good', true);
}
