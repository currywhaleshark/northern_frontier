// localStorage 저장/불러오기
import { initRelations } from './relations';
import type { GameState } from './types';

const SAVE_KEY = 'buksae-save-v3'; // v3: 이동 보간(px/py)과 지도 위 습격 무리 추가

export function saveGame(state: GameState): boolean {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function loadGame(): GameState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GameState;
    // 최소한의 유효성 검사 (구버전 저장은 무시)
    if (!parsed.map || !parsed.residents || !parsed.resources) return null;
    if (parsed.subTick == null || parsed.residents.some(r => r.x == null || r.px == null)) return null;
    if (!('raiders' in parsed)) return null;
    // 구버전 저장 마이그레이션: 없는 필드는 기본값으로 채운다
    if (!parsed.relations) parsed.relations = initRelations();
    if (!parsed.difficulty) parsed.difficulty = 'normal';
    return parsed;
  } catch {
    return null;
  }
}

export function hasSave(): boolean {
  return localStorage.getItem(SAVE_KEY) != null;
}

export function clearSave(): void {
  localStorage.removeItem(SAVE_KEY);
}
