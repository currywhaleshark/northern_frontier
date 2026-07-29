// 연대기(年代記) — 영구 보존되는 굵직한 사건 기록.
//
// 원칙 (docs/DESIGN-2026-07-29-chronicle-screen.md):
// - 기록은 발생 시점에, 화면은 읽기만 한다.
// - 로그와 별개다. 로그는 잘리고, 연대기는 남는다.
// - dedupeKey가 있는 사건(이정표·최초 완공)은 저장 전체에서 1회만.
import { addLog } from './events';
import { withJosa } from './josa';
import { getYear } from './seasons';
import type { AnnalsEntry, AnnalsKind, GameState } from './types';

export function recordAnnals(
  state: GameState,
  kind: AnnalsKind,
  text: string,
  dedupeKey?: string,
): void {
  if (!text) return;
  if (dedupeKey && state.annals.some(entry => entry.dedupeKey === dedupeKey)) return;
  const entry: AnnalsEntry = { day: state.day, kind, text };
  if (dedupeKey) entry.dedupeKey = dedupeKey;
  state.annals.push(entry);
}

/**
 * 게임 종료의 단일 관문 — gameOver 설정과 'ending' 연대기를 함께 남긴다.
 * 이미 끝난 게임에는 아무 일도 하지 않으므로 매일 도는 판정에서 불러도 안전하다.
 */
export function endGame(state: GameState, won: boolean, reason: string): void {
  if (state.gameOver) return;
  state.gameOver = { won, reason };
  recordAnnals(state, 'ending', reason, won ? undefined : 'ending:lost');
}

// ── 인구 이정표 ──

const POPULATION_MILESTONES = [10, 25, 50, 75, 100, 150, 200, 300, 400, 500];

/** 매일 한 번, 살아 있는 인구가 이정표를 넘어서면 기록한다 (dedupe라 재통과는 무시). */
export function recordPopulationMilestones(state: GameState, alive: number): void {
  for (const milestone of POPULATION_MILESTONES) {
    if (alive < milestone) break;
    recordAnnals(
      state,
      'population',
      `마을 인구가 ${milestone}명을 넘어섰습니다.`,
      `population:${milestone}`,
    );
  }
}

// ── 혹독한 월동 ──

/** 겨울이 풀릴 때 사망률이 문턱을 넘었으면 그 겨울을 연대기에 남긴다. */
export function recordHarshWinter(state: GameState): void {
  if (state.winterDeaths < 2 || state.lastWinterDeathRate < 0.15) return;
  // 봄 첫날에 불리므로 지나간 겨울은 전날이 속한 해의 것이다.
  recordAnnals(
    state,
    'winter',
    `${getYear(state.day - 1)}년차 겨울, 주민 ${state.winterDeaths}명이 혹한을 넘기지 못했습니다` +
      ` (사망률 ${(state.lastWinterDeathRate * 100).toFixed(0)}%).`,
  );
}

// ── 주요 건물 최초 완공 ──

// 연대기감 건물 — 마을의 단계가 바뀌는 것들만. 성벽 3종은 "첫 성벽" 하나로 묶는다.
const NOTABLE_BUILDINGS: Partial<Record<string, string>> = {
  bridge: '다리',
  smithy: '대장간',
  clinic: '의원',
  watermill: '물레방아',
  market: '장터',
  office: '관청',
  school: '서당',
  shrine: '당집',
  hermitage: '암자',
  garrison: '군영',
  dock: '부두',
  beacon: '봉수대',
  cannonEmplacement: '포대',
};

const WALL_TYPES = new Set(['palisade', 'earthFort', 'stoneWall']);

export function recordNotableBuildingCompletion(state: GameState, type: string): void {
  if (WALL_TYPES.has(type)) {
    recordAnnals(state, 'building', '마을에 첫 성벽이 올라갔습니다.', 'building:wall');
    return;
  }
  const name = NOTABLE_BUILDINGS[type];
  if (!name) return;
  recordAnnals(
    state,
    'building',
    `마을 최초의 ${withJosa(name, '이/가')} 완공되었습니다.`,
    `building:${type}`,
  );
}

/** 연대기와 중요 로그를 함께 남긴다 — 대부분의 기록 지점이 쓰는 짝. */
export function recordAnnalsWithLog(
  state: GameState,
  kind: AnnalsKind,
  text: string,
  logKind: Parameters<typeof addLog>[2] = 'info',
  dedupeKey?: string,
): void {
  recordAnnals(state, kind, text, dedupeKey);
  addLog(state, text, logKind, true);
}
