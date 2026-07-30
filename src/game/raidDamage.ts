// 건물 파손 및 습격 피해 처리 공용 헬퍼
import { BUILDING_DEFS, countBuilt } from './buildings';
import { CONFIG } from './config';
import { RESOURCE_NAMES } from './constants';
import { lootLivestock } from './livestock';
import { killResident, livingResidents, reconcileResidentHomes } from './residents';
import type {
  Building, BuildingRepairCause, BuildingTypeId, GameState, ResourceId,
} from './types';

export function applyLootLosses(
  state: GameState,
  requested: Partial<Record<ResourceId, number>>,
): Partial<Record<ResourceId, number>> {
  const applied: Partial<Record<ResourceId, number>> = {};
  let largestLossRatio = 0;
  for (const [resource, rawAmount] of Object.entries(requested)) {
    const id = resource as ResourceId;
    const before = state.resources[id] ?? 0;
    const amount = Math.min(before, Math.max(0, Math.floor(rawAmount ?? 0)));
    if (amount <= 0) continue;
    state.resources[id] -= amount;
    applied[id] = amount;
    largestLossRatio = Math.max(largestLossRatio, amount / Math.max(1, before));
  }
  if (largestLossRatio > 0) lootLivestock(state, Math.min(0.35, largestLossRatio));
  return applied;
}

export function describeLootLosses(losses: Partial<Record<ResourceId, number>>): string {
  const parts = Object.entries(losses)
    .filter(([, amount]) => (amount ?? 0) > 0)
    .map(([resource, amount]) => `${RESOURCE_NAMES[resource as ResourceId]} ${amount}`);
  return parts.length > 0 ? parts.join(', ') : '없음';
}

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
  const livestockLoss = lootLivestock(state, r);
  if (livestockLoss.lost > 0) parts.push(`가축 ${livestockLoss.lost}마리`);
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
  restrictToPreferred = false,
): number {
  const preferred = new Set(preferredIds);
  const candidates = livingResidents(state).filter(resident => !restrictToPreferred || preferred.has(resident.id));
  let injured = 0;
  for (let i = 0; i < count && candidates.length > 0; i++) {
    const preferredPool = candidates.filter(resident => preferred.has(resident.id));
    const pool = preferredPool.length > 0 ? preferredPool : candidates;
    const r = pool[Math.floor(rng() * pool.length)];
    r.health = Math.max(5, r.health - (severity + rng() * severity));
    r.task = '부상 회복 중';
    candidates.splice(candidates.indexOf(r), 1);
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
    b.repairCause = 'raid';
    b.progress = def.buildDays * (min + rng() * Math.max(0, max - min));
    damaged.push(b.type);
  }
  reconcileResidentHomes(state, rng);
  return damaged;
}

export function damageBuildingTargets(
  state: GameState,
  rng: () => number,
  targets: readonly Building[],
  repairCause: BuildingRepairCause,
  repairProgress?: { min: number; max: number },
): BuildingTypeId[] {
  const damaged: BuildingTypeId[] = [];
  const seen = new Set<number>();
  for (const building of targets) {
    if (seen.has(building.id) || building.type === 'center' || !building.built) continue;
    seen.add(building.id);
    const def = BUILDING_DEFS[building.type];
    const min = repairProgress?.min ?? CONFIG.raid.repairProgressMin;
    const max = repairProgress?.max ?? CONFIG.raid.repairProgressMax;
    building.built = false;
    building.repairing = true;
    building.repairCause = repairCause;
    building.progress = def.buildDays * (min + rng() * Math.max(0, max - min));
    damaged.push(building.type);
  }
  if (damaged.length > 0) reconcileResidentHomes(state, rng);
  return damaged;
}

export function buildingRepairCause(
  state: Pick<GameState, 'pendingDisasters'>,
  building: Pick<Building, 'id' | 'repairCause'>,
): BuildingRepairCause {
  if (building.repairCause) return building.repairCause;
  for (const disaster of state.pendingDisasters) {
    if (!disaster.targetBuildingIds?.includes(building.id)) continue;
    if (disaster.id === 'snowDamage' || disaster.id === 'springFlood' || disaster.id === 'mineCollapse') return disaster.id;
  }
  // 원인 필드가 없던 구 저장의 파손 상태는 기존 의미였던 습격 피해로 이어 간다.
  return 'raid';
}

export function moraleShock(state: GameState, amount: number): void {
  for (const r of livingResidents(state)) {
    r.morale = Math.max(0, Math.min(100, r.morale - amount));
  }
}
