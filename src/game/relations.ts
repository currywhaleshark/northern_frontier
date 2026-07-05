// 세력별 우호도 — 교역/공물/협상/전투가 세력마다 누적되어
// 습격 대상 선정, 협상 성공률, 위협도 증가에 반영된다.
import { CONFIG } from './config';
import { FACTIONS } from './constants';
import type { GameState } from './types';

export function initRelations(): Record<string, number> {
  const r: Record<string, number> = {};
  for (const f of FACTIONS) r[f.name] = f.initialRelation;
  return r;
}

export function getRelation(state: GameState, name: string): number {
  return state.relations?.[name] ?? 50;
}

export function changeRelation(state: GameState, name: string, delta: number): void {
  if (!state.relations) state.relations = initRelations();
  const cur = state.relations[name] ?? 50;
  state.relations[name] = Math.max(0, Math.min(100, cur + delta));
}

// 하루: 각 세력의 기본 성향(initialRelation)을 향해 천천히 되돌아간다
export function driftRelations(state: GameState): void {
  if (!state.relations) {
    state.relations = initRelations();
    return;
  }
  for (const f of FACTIONS) {
    const cur = state.relations[f.name] ?? f.initialRelation;
    state.relations[f.name] = cur + (f.initialRelation - cur) * CONFIG.relations.driftFactor;
  }
}

// 적대 성향 세력들과의 평균 관계 (위협도 계산용)
export function hostileRelationsAvg(state: GameState): number {
  const hs = FACTIONS.filter(f => f.hostile);
  if (hs.length === 0) return 50;
  return hs.reduce((s, f) => s + getRelation(state, f.name), 0) / hs.length;
}
