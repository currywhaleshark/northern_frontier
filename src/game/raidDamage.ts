// 습격 피해 처리 공용 헬퍼 — 즉시 판정(raids.ts)과 지도 전투(battles.ts)가 함께 쓴다
import { BUILDING_DEFS, countBuilt } from './buildings';
import { CONFIG } from './config';
import { RESOURCE_NAMES } from './constants';
import { killResident, livingResidents, reconcileResidentHomes } from './residents';
import type { BuildingTypeId, GameState, ResourceId } from './types';

// 창고 자원 약탈 처리
export function loot(state: GameState, ratio: number): string {
  const storeBonus = Math.min(0.3, countBuilt(state, 'storehouse') * 0.1);
  const r = Math.max(0.05, ratio - storeBonus);
  const targets: ResourceId[] = [
    'grain', 'rice', 'meat', 'fish', 'vegetables', 'hide', 'tools',
    'hideClothes', 'cottonClothes', 'brushwood', 'firewood', 'charcoal',
  ];
  const parts: string[] = [];
  for (const res of targets) {
    const taken = Math.floor(state.resources[res] * r);
    if (taken > 0) {
      state.resources[res] -= taken;
      parts.push(`${RESOURCE_NAMES[res]} ${taken}`);
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

// 패배 전사 판정. eligibleIds가 주어지면 실제 전투 참가자만 후보가 된다.
export function killResidents(
  state: GameState,
  rng: () => number,
  attempts: number,
  chance: number,
  eligibleIds?: number[],
): number {
  const eligible = eligibleIds ? new Set(eligibleIds) : null;
  const candidates = livingResidents(state).filter(resident => !eligible || eligible.has(resident.id));
  let killed = 0;
  for (let i = 0; i < attempts && candidates.length > 0; i++) {
    const index = Math.floor(rng() * candidates.length);
    const resident = candidates.splice(index, 1)[0];
    if (rng() >= chance) continue;
    killResident(state, resident, '습격대와 싸우다 입은 상처', false, true);
    killed++;
  }
  return killed;
}

export function damageBuildings(state: GameState, rng: () => number, count: number): BuildingTypeId[] {
  // 중심지는 파괴 대상에서 제외한다. 파손 건물은 철거하지 않고 건설담당이 복구한다.
  const candidates = state.buildings.filter(b => b.type !== 'center' && b.built);
  const damaged: BuildingTypeId[] = [];
  for (let i = 0; i < count && candidates.length > 0; i++) {
    const idx = Math.floor(rng() * candidates.length);
    const b = candidates.splice(idx, 1)[0];
    const def = BUILDING_DEFS[b.type];
    const min = CONFIG.raid.repairProgressMin;
    const max = CONFIG.raid.repairProgressMax;
    b.built = false;
    b.repairing = true;
    b.progress = def.buildDays * (min + rng() * Math.max(0, max - min));
    damaged.push(b.type);
  }
  reconcileResidentHomes(state, rng);
  return damaged;
}

export function moraleShock(state: GameState, amount: number): void {
  for (const r of livingResidents(state)) {
    r.morale = Math.max(0, Math.min(100, r.morale - amount));
  }
}
