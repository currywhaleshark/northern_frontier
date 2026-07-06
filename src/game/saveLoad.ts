// localStorage 저장/불러오기
import { CONFIG } from './config';
import { rollCourtTribute } from './courtTribute';
import { spawnAnimalHabitats } from './habitats';
import { makeRng } from './map';
import { initRelations } from './relations';
import { getSeason, getYear } from './seasons';
import type { GameState, Gender, Resident } from './types';

const SAVE_KEY = 'buksae-save-v3'; // v3: 이동 보간(px/py)과 지도 위 습격 무리 추가

function isGender(value: unknown): value is Gender {
  return value === 'male' || value === 'female';
}

function stableGenderForResident(resident: Pick<Resident, 'id' | 'name'>): Gender {
  let hash = (resident.id * 2166136261) >>> 0;
  for (let i = 0; i < resident.name.length; i++) {
    hash ^= resident.name.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return (hash & 1) === 0 ? 'female' : 'male';
}

function migrateResidentGender(state: GameState): void {
  for (const resident of state.residents as Array<Resident & { gender?: unknown }>) {
    if (!isGender(resident.gender)) {
      resident.gender = stableGenderForResident(resident);
    }
  }
}

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
    if (parsed.battle && !parsed.battle.mode) parsed.battle.mode = 'garrison';
    if (!parsed.lastTradeByFaction) parsed.lastTradeByFaction = {};
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
    // 세공 없는 구버전: 시드로 올해분을 재생성. 이미 겨울이면 올해분은 면제 (다음 봄부터 정상 진행)
    if (!Object.prototype.hasOwnProperty.call(parsed, 'courtTribute')) {
      const pop = parsed.residents.filter(r => r.alive).length;
      const tribute = rollCourtTribute(parsed.seed ?? 1, getYear(parsed.day), pop);
      if (getSeason(parsed.day) === 'winter') {
        tribute.resolved = true;
        tribute.paid = true;
      }
      parsed.courtTribute = tribute;
    }
    if (parsed.tributeFailStreak == null) parsed.tributeFailStreak = 0;
    migrateResidentGender(parsed);
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
