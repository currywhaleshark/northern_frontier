import { CONFIG } from './config';
import type {
  CombatWeaponId, GameState, JobId, MountId, Resident, ResourceId,
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
export const MOUNT_NAMES: Record<MountId, string> = { horse: '군마' };

const COMBAT_JOBS = new Set<JobId>(['militia', 'watchman', 'hunter']);

export interface WeaponCounts {
  muskets: number;
  hornBows: number;
  spears: number;
  unarmed: number;
  readyMuskets: number;
}

export interface MusketReadiness {
  assigned: number;
  ready: number;
  dry: number;
  powderRequired: number;
}

export interface MusketGroupReadiness {
  byGroup: Readonly<Record<string, number>>;
  ready: number;
  powderRequired: number;
}

export function isCombatWeaponId(value: unknown): value is CombatWeaponId {
  return value === 'musket' || value === 'hornBow' || value === 'spear';
}

export function isMountId(value: unknown): value is MountId {
  return value === 'horse';
}

export function isCombatResident(resident: Pick<Resident, 'alive' | 'job'>): boolean {
  return resident.alive && COMBAT_JOBS.has(resident.job);
}

export function weaponStock(state: GameState, weapon: CombatWeaponId): number {
  return Math.max(0, Math.floor(state.resources[COMBAT_WEAPON_RESOURCES[weapon]] ?? 0));
}

// 항왜 사야카 '화약 아끼는 손' — 마을 전체 사수의 1인당 화약 소요를 줄인다
export function effectivePowderPerShooter(state: GameState, powderPerShooter: number): number {
  const thrifty = state.residents.some(resident => resident.alive && resident.special === 'hangwae');
  return Math.max(0, powderPerShooter) * (thrifty ? CONFIG.specialResidents.hangwaePowderMult : 1);
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
  if (weapon === 'musket' &&
      state.resources.gunpowder + 1e-9 >= effectivePowderPerShooter(state, CONFIG.raid.powderPerMusket)) {
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

export function horseStock(state: GameState): number {
  return state.buildings
    .filter(building => building.type === 'stable' && building.built && building.livestock?.species === 'horse')
    .reduce((sum, building) => {
      const count = Number(building.livestock?.headcount);
      return sum + (Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0);
    }, 0);
}

function reconciledMountAssignments(state: GameState): Partial<Record<number, MountId>> {
  const source = state.mountAssignments && typeof state.mountAssignments === 'object'
    ? state.mountAssignments
    : {};
  const residents = new Set(eligibleResidents(state).map(resident => resident.id));
  const capacity = horseStock(state);
  const next: Partial<Record<number, MountId>> = {};
  const entries = Object.entries(source)
    .map(([residentId, mount]) => [Number(residentId), mount] as const)
    .sort(([left], [right]) => left - right);
  let used = 0;
  for (const [residentId, mount] of entries) {
    if (used >= capacity) break;
    if (!Number.isInteger(residentId) || !residents.has(residentId) || !isMountId(mount)) continue;
    next[residentId] = mount;
    used += 1;
  }
  return next;
}

export function resolvedMountAssignments(state: GameState): Readonly<Partial<Record<number, MountId>>> {
  return reconciledMountAssignments(state);
}

export function reconcileMountAssignments(state: GameState): void {
  state.mountAssignments = reconciledMountAssignments(state);
}

export function clearMountAssignments(state: GameState): void {
  state.mountAssignments = {};
}

export function setResidentMount(
  state: GameState,
  residentId: number,
  mount: MountId | null,
): string | null {
  reconcileMountAssignments(state);
  const resident = state.residents.find(candidate => candidate.id === residentId);
  if (!resident) return '주민을 찾을 수 없습니다.';
  if (!isCombatResident(resident)) return '수비병·파수꾼·사냥꾼에게만 군마를 배정할 수 있습니다.';
  if (mount != null && !isMountId(mount)) return '알 수 없는 탈것입니다.';
  const current = state.mountAssignments[residentId] ?? null;
  if (current === mount) return null;
  if (mount === 'horse') {
    const used = Object.keys(state.mountAssignments)
      .filter(id => Number(id) !== residentId)
      .length;
    if (used >= horseStock(state)) return '군마가 모두 배정되어 있습니다.';
    state.mountAssignments[residentId] = mount;
  } else {
    delete state.mountAssignments[residentId];
  }
  return null;
}

export function assignedMount(state: GameState, residentId: number): MountId | null {
  return resolvedMountAssignments(state)[residentId] ?? null;
}

export function combatMountLossRoll(state: Pick<GameState, 'seed' | 'day'>, residentId: number): number {
  let value = (state.seed ^ Math.imul(state.day, 0x9e3779b1) ^ Math.imul(residentId, 0x85ebca6b)) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d) >>> 0;
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b) >>> 0;
  value ^= value >>> 16;
  return value / 0x100000000;
}

export function releaseResidentMount(state: GameState, residentId: number, combatDeath = false): boolean {
  if (state.mountAssignments?.[residentId] !== 'horse') return false;
  delete state.mountAssignments[residentId];
  if (!combatDeath || combatMountLossRoll(state, residentId) >= CONFIG.mounted.combatDeathHorseLossChance) {
    return false;
  }
  const stable = state.buildings
    .filter(building => building.type === 'stable' && building.built &&
      building.livestock?.species === 'horse' && (building.livestock.headcount ?? 0) > 0)
    .sort((left, right) => left.id - right.id)[0];
  if (!stable?.livestock) return false;
  stable.livestock.headcount = Math.max(0, stable.livestock.headcount - 1);
  reconcileMountAssignments(state);
  return true;
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

export function resolvedWeaponAssignments(
  state: GameState,
): Readonly<Partial<Record<number, CombatWeaponId>>> {
  return state.weaponAllocationMode === 'manual'
    ? reconciledManualAssignments(state)
    : automaticWeaponAssignments(state);
}

export function reconcileWeaponAssignments(state: GameState): void {
  if (state.weaponAllocationMode !== 'manual') state.weaponAllocationMode = 'auto';
  state.weaponAssignments = state.weaponAllocationMode === 'auto'
    ? automaticWeaponAssignments(state)
    : reconciledManualAssignments(state);
}

/** @deprecated Use reconcileWeaponAssignments at explicit mutation boundaries. */
export function synchronizeWeaponAssignments(state: GameState): void {
  reconcileWeaponAssignments(state);
}

export function setAutomaticWeaponAllocation(state: GameState): void {
  state.weaponAllocationMode = 'auto';
  reconcileWeaponAssignments(state);
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
  reconcileWeaponAssignments(state);
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
  return resolvedWeaponAssignments(state)[residentId] ?? null;
}

export function musketReadiness(
  state: GameState,
  musketUsers: Iterable<number>,
  powderPerShooter: number,
  availableGunpowder = state.resources.gunpowder,
): MusketReadiness {
  const assigned = new Set(musketUsers).size;
  const perShooter = effectivePowderPerShooter(state, powderPerShooter);
  const ready = perShooter === 0
    ? assigned
    : Math.min(assigned, Math.floor((Math.max(0, availableGunpowder) + 1e-9) / perShooter));
  return {
    assigned,
    ready,
    dry: assigned - ready,
    powderRequired: ready * perShooter,
  };
}
export function consumeMusketPowder(
  state: GameState,
  musketUsers: Iterable<number>,
  powderPerShooter: number,
): number {
  const readiness = musketReadiness(state, musketUsers, powderPerShooter);
  const used = Math.min(Math.max(0, state.resources.gunpowder), readiness.powderRequired);
  state.resources.gunpowder = Math.max(0, state.resources.gunpowder - used);
  return used;
}

export function allocateMusketReadiness(
  state: GameState,
  requests: Iterable<{ id: string; residentIds: Iterable<number> }>,
  powderPerShooter: number,
): MusketGroupReadiness {
  const groups = [...requests]
    .map(request => ({ id: request.id, count: new Set(request.residentIds).size }))
    .filter(request => request.count > 0)
    .sort((a, b) => a.id.localeCompare(b.id));
  const totalAssigned = groups.reduce((sum, group) => sum + group.count, 0);
  const ready = musketReadiness(
    state,
    Array.from({ length: totalAssigned }, (_, index) => index),
    powderPerShooter,
  ).ready;
  const byGroup: Record<string, number> = Object.fromEntries(groups.map(group => [group.id, 0]));
  let remaining = ready;
  while (remaining > 0) {
    let allocated = false;
    for (const group of groups) {
      if (remaining <= 0) break;
      if (byGroup[group.id] >= group.count) continue;
      byGroup[group.id] += 1;
      remaining -= 1;
      allocated = true;
    }
    if (!allocated) break;
  }
  return { byGroup, ready, powderRequired: ready * Math.max(0, powderPerShooter) };
}

export function consumeMusketVolleys(
  state: GameState,
  requests: Iterable<{ id: string; residentIds: Iterable<number> }>,
  powderPerShooter: number,
): MusketGroupReadiness {
  const allocation = allocateMusketReadiness(state, requests, powderPerShooter);
  state.resources.gunpowder = Math.max(0, state.resources.gunpowder - allocation.powderRequired);
  return allocation;
}

export function weaponCountsForResidents(
  state: GameState,
  residents: Iterable<Pick<Resident, 'id'>>,
): WeaponCounts {
  const assignments = resolvedWeaponAssignments(state);
  let muskets = 0;
  let hornBows = 0;
  let spears = 0;
  let total = 0;
  const musketUsers: number[] = [];
  for (const resident of residents) {
    total += 1;
    const weapon = assignments[resident.id];
    if (weapon === 'musket') { muskets += 1; musketUsers.push(resident.id); }
    else if (weapon === 'hornBow') hornBows += 1;
    else if (weapon === 'spear') spears += 1;
  }
  return {
    muskets,
    hornBows,
    spears,
    unarmed: Math.max(0, total - muskets - hornBows - spears),
    readyMuskets: musketReadiness(state, musketUsers, CONFIG.raid.powderPerMusket).ready,
  };
}
