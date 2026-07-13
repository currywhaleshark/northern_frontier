import { CONFIG } from './config';
import type {
  CombatWeaponId, GameState, JobId, Resident, ResourceId, WeaponAllocationMode,
} from './types';

export const COMBAT_WEAPON_IDS: readonly CombatWeaponId[] = ['musket', 'hornBow', 'spear'];
export const COMBAT_WEAPON_NAMES: Record<CombatWeaponId, string> = {
  musket: '조총',
  hornBow: '각궁',
  spear: '창',
};
export const COMBAT_WEAPON_RESOURCES: Record<CombatWeaponId, ResourceId> = {
  musket: 'muskets',
  hornBow: 'hornBows',
  spear: 'spears',
};

const COMBAT_JOBS = new Set<JobId>(['militia', 'watchman', 'hunter']);

export interface WeaponCounts {
  muskets: number;
  hornBows: number;
  spears: number;
  unarmed: number;
  readyMuskets: number;
}

export function isCombatWeaponId(value: unknown): value is CombatWeaponId {
  return value === 'musket' || value === 'hornBow' || value === 'spear';
}

export function isCombatResident(resident: Pick<Resident, 'alive' | 'job'>): boolean {
  return resident.alive && COMBAT_JOBS.has(resident.job);
}

export function weaponStock(state: GameState, weapon: CombatWeaponId): number {
  return Math.max(0, Math.floor(state.resources[COMBAT_WEAPON_RESOURCES[weapon]] ?? 0));
}

export function residentDefenseContribution(
  state: GameState,
  resident: Pick<Resident, 'job'>,
  weapon: CombatWeaponId | null,
): number {
  const base = resident.job === 'militia'
    ? CONFIG.raid.militiaDefense
    : resident.job === 'watchman'
      ? CONFIG.raid.watchmanDefense
      : 0;
  if (weapon === 'musket' && state.resources.gunpowder > 0) {
    return Math.max(base, CONFIG.raid.musketDefense);
  }
  if (weapon === 'hornBow') return Math.max(base, CONFIG.raid.hornBowDefense);
  if (weapon === 'spear') return Math.max(base, CONFIG.raid.spearDefense);
  return base;
}

function eligibleResidents(state: GameState): Resident[] {
  return state.residents
    .filter(isCombatResident)
    .sort((a, b) => a.id - b.id);
}

function assignFirstAvailable(
  assignments: Partial<Record<number, CombatWeaponId>>,
  residents: Resident[],
  weapon: CombatWeaponId,
  amount: number,
): number {
  let remaining = amount;
  for (const resident of residents) {
    if (remaining <= 0) break;
    if (assignments[resident.id]) continue;
    assignments[resident.id] = weapon;
    remaining -= 1;
  }
  return remaining;
}

// 기존 수비병 우선순위(조총→각궁→창)를 보존하고, 남는 무기만
// 사냥꾼·파수꾼의 역할 적성에 맞춰 나눈다.
export function automaticWeaponAssignments(state: GameState): Partial<Record<number, CombatWeaponId>> {
  const assignments: Partial<Record<number, CombatWeaponId>> = {};
  const residents = eligibleResidents(state);
  const militia = residents.filter(resident => resident.job === 'militia');
  const hunters = residents.filter(resident => resident.job === 'hunter');
  const watchmen = residents.filter(resident => resident.job === 'watchman');
  const stock: Record<CombatWeaponId, number> = {
    musket: weaponStock(state, 'musket'),
    hornBow: weaponStock(state, 'hornBow'),
    spear: weaponStock(state, 'spear'),
  };

  stock.musket = assignFirstAvailable(assignments, militia, 'musket', stock.musket);
  stock.hornBow = assignFirstAvailable(assignments, militia, 'hornBow', stock.hornBow);
  stock.spear = assignFirstAvailable(assignments, militia, 'spear', stock.spear);

  stock.hornBow = assignFirstAvailable(assignments, hunters, 'hornBow', stock.hornBow);
  stock.hornBow = assignFirstAvailable(assignments, watchmen, 'hornBow', stock.hornBow);
  stock.musket = assignFirstAvailable(assignments, watchmen, 'musket', stock.musket);
  stock.musket = assignFirstAvailable(assignments, hunters, 'musket', stock.musket);
  stock.spear = assignFirstAvailable(assignments, watchmen, 'spear', stock.spear);
  assignFirstAvailable(assignments, hunters, 'spear', stock.spear);
  return assignments;
}

function reconciledManualAssignments(state: GameState): Partial<Record<number, CombatWeaponId>> {
  const source = state.weaponAssignments && typeof state.weaponAssignments === 'object'
    ? state.weaponAssignments
    : {};
  const residents = new Map(eligibleResidents(state).map(resident => [resident.id, resident]));
  const used: Record<CombatWeaponId, number> = { musket: 0, hornBow: 0, spear: 0 };
  const next: Partial<Record<number, CombatWeaponId>> = {};
  const entries = Object.entries(source)
    .map(([residentId, weapon]) => [Number(residentId), weapon] as const)
    .sort(([a], [b]) => a - b);

  for (const [residentId, weapon] of entries) {
    if (!Number.isInteger(residentId) || !residents.has(residentId) || !isCombatWeaponId(weapon)) continue;
    if (used[weapon] >= weaponStock(state, weapon)) continue;
    next[residentId] = weapon;
    used[weapon] += 1;
  }
  return next;
}

export function synchronizeWeaponAssignments(state: GameState): void {
  if (state.weaponAllocationMode !== 'manual') state.weaponAllocationMode = 'auto';
  state.weaponAssignments = state.weaponAllocationMode === 'auto'
    ? automaticWeaponAssignments(state)
    : reconciledManualAssignments(state);
}

export function setAutomaticWeaponAllocation(state: GameState): void {
  state.weaponAllocationMode = 'auto';
  synchronizeWeaponAssignments(state);
}

export function clearWeaponAssignments(state: GameState): void {
  state.weaponAllocationMode = 'manual';
  state.weaponAssignments = {};
}

export function setResidentWeapon(
  state: GameState,
  residentId: number,
  weapon: CombatWeaponId | null,
): string | null {
  synchronizeWeaponAssignments(state);
  const resident = state.residents.find(candidate => candidate.id === residentId);
  if (!resident) return '주민을 찾을 수 없습니다.';
  if (!isCombatResident(resident)) return '수비병·파수꾼·사냥꾼에게만 전투 무기를 배정할 수 있습니다.';
  if (weapon != null && !isCombatWeaponId(weapon)) return '알 수 없는 무기입니다.';

  const current = state.weaponAssignments[residentId] ?? null;
  if (current === weapon) {
    state.weaponAllocationMode = 'manual';
    return null;
  }
  if (weapon) {
    const used = Object.entries(state.weaponAssignments)
      .filter(([id, assigned]) => Number(id) !== residentId && assigned === weapon)
      .length;
    if (used >= weaponStock(state, weapon)) {
      return `${COMBAT_WEAPON_NAMES[weapon]} 재고가 모두 배정되어 있습니다.`;
    }
  }

  state.weaponAllocationMode = 'manual';
  if (weapon) state.weaponAssignments[residentId] = weapon;
  else delete state.weaponAssignments[residentId];
  return null;
}

export function assignedWeapon(state: GameState, residentId: number): CombatWeaponId | null {
  synchronizeWeaponAssignments(state);
  return state.weaponAssignments[residentId] ?? null;
}

export function weaponCountsForResidents(
  state: GameState,
  residents: Iterable<Pick<Resident, 'id'>>,
): WeaponCounts {
  synchronizeWeaponAssignments(state);
  let muskets = 0;
  let hornBows = 0;
  let spears = 0;
  let total = 0;
  for (const resident of residents) {
    total += 1;
    const weapon = state.weaponAssignments[resident.id];
    if (weapon === 'musket') muskets += 1;
    else if (weapon === 'hornBow') hornBows += 1;
    else if (weapon === 'spear') spears += 1;
  }
  return {
    muskets,
    hornBows,
    spears,
    unarmed: Math.max(0, total - muskets - hornBows - spears),
    readyMuskets: state.resources.gunpowder > 0 ? muskets : 0,
  };
}

export function weaponAssignmentMode(state: GameState): WeaponAllocationMode {
  return state.weaponAllocationMode === 'manual' ? 'manual' : 'auto';
}
