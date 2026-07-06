// localStorage 저장/불러오기
import { CONFIG } from './config';
import { spawnAnimalHabitats } from './habitats';
import { makeRng } from './map';
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
    if (!Object.prototype.hasOwnProperty.call(parsed, 'battle')) parsed.battle = null;
    // 구버전 저장 마이그레이션: 없는 필드는 기본값으로 채운다
    if (!parsed.relations) parsed.relations = initRelations();
    if (!parsed.difficulty) parsed.difficulty = 'normal';
    if (!parsed.habitats) {
      // 사냥터 지형이 있던 구버전: 사냥터를 숲으로 바꾸고 시드로 서식지를 새로 뽑는다
      let cx = Math.floor(parsed.map[0].length / 2);
      let cy = Math.floor(parsed.map.length / 2);
      for (const row of parsed.map) {
        for (const tile of row) {
          if ((tile.terrain as string) === 'hunting') tile.terrain = 'forest';
          if (tile.terrain === 'center') { cx = tile.x; cy = tile.y; }
        }
      }
      parsed.habitats = spawnAnimalHabitats(
        parsed.map, cx, cy, makeRng(parsed.seed ?? 1),
        CONFIG.difficulty[parsed.difficulty].habitatChance,
      );
    }
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
