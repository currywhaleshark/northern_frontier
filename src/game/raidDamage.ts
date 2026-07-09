// 습격 피해 처리 공용 헬퍼 — 즉시 판정(raids.ts)과 지도 전투(battles.ts)가 함께 쓴다
import { clearBuildingTiles, countBuilt } from './buildings';
import { livingResidents } from './residents';
import type { GameState, ResourceId } from './types';

// 창고 자원 약탈 처리
export function loot(state: GameState, ratio: number): string {
  const storeBonus = Math.min(0.3, countBuilt(state, 'storehouse') * 0.1);
  const r = Math.max(0.05, ratio - storeBonus);
  const targets: ResourceId[] = ['food', 'meat', 'fish', 'grain', 'hide', 'tools', 'clothes', 'firewood'];
  const names: Partial<Record<ResourceId, string>> = {
    food: '곡식', meat: '고기', fish: '생선', grain: '곡물', hide: '가죽', tools: '도구', clothes: '옷', firewood: '장작',
  };
  const parts: string[] = [];
  for (const res of targets) {
    const taken = Math.floor(state.resources[res] * r);
    if (taken > 0) {
      state.resources[res] -= taken;
      parts.push(`${names[res]} ${taken}`);
    }
  }
  return parts.length > 0 ? `${parts.join(', ')} 약탈당함` : '약탈 피해 없음';
}

// 부상자 발생: 주민의 건강을 깎는다 (학살이 아니라 부상 중심).
// preferredIds를 주면 그 주민들(전투 참가자 등)이 우선 다친다.
export function injure(
  state: GameState,
  rng: () => number,
  count: number,
  severity: number,
  preferredIds: number[] = [],
): number {
  const preferred = new Set(preferredIds);
  const living = livingResidents(state)
    .sort((a, b) => Number(preferred.has(b.id)) - Number(preferred.has(a.id)));
  let injured = 0;
  for (let i = 0; i < count && living.length > 0; i++) {
    const pool = living.slice(0, Math.max(1, preferredIds.length || living.length));
    const r = pool[Math.floor(rng() * pool.length)];
    r.health = Math.max(5, r.health - (severity + rng() * severity));
    r.task = '부상 회복 중';
    injured++;
  }
  return injured;
}

export function damageBuildings(state: GameState, rng: () => number, count: number): string[] {
  // 중심지는 파괴 대상에서 제외 (중심지 파괴 패배는 연속 실패 시에만)
  const candidates = state.buildings.filter(b => b.type !== 'center' && b.built);
  const destroyed: string[] = [];
  for (let i = 0; i < count && candidates.length > 0; i++) {
    const idx = Math.floor(rng() * candidates.length);
    const b = candidates.splice(idx, 1)[0];
    // 절반 확률로 완파, 아니면 반파(재건 필요)
    if (rng() < 0.5) {
      state.buildings = state.buildings.filter(x => x.id !== b.id);
      clearBuildingTiles(state, b.id);
      destroyed.push(b.type);
    } else {
      b.built = false;
      b.progress = Math.floor(b.progress / 2);
      destroyed.push(b.type);
    }
  }
  return destroyed;
}

export function moraleShock(state: GameState, amount: number): void {
  for (const r of livingResidents(state)) {
    r.morale = Math.max(0, Math.min(100, r.morale - amount));
  }
}
