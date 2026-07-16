import { CONFIG } from './config';
import type { CombatCapability, CombatRole } from './combatRoster';
import type { CombatWeaponId } from './types';

// Hunters keep a weak hunting-bow volley even without an inventory weapon.
// This is the single policy switch for that legacy gameplay rule.
export const HUNTER_DEFAULT_RANGED = true;

export function combatCapabilities(
  role: CombatRole,
  weapon: CombatWeaponId | null,
): ReadonlySet<CombatCapability> {
  const result = new Set<CombatCapability>(['hold']);
  if (role === 'militia') {
    if (weapon == null) result.add('melee');
    result.add('protect');
  } else if (role === 'watchman') {
    if (weapon == null) result.add('melee');
    result.add('scout');
    result.add('guard');
  } else if (role === 'hunter') {
    result.add('ambush');
    result.add('scout');
    if (weapon == null && HUNTER_DEFAULT_RANGED) result.add('volley');
  } else if (role === 'civilian') {
    result.add('protect');
  }

  if (weapon === 'spear') {
    result.add('melee');
    result.add('charge');
  } else if (weapon === 'hornBow' || weapon === 'musket') {
    result.add('volley');
  }
  return result;
}

export function combatBasePower(role: CombatRole): number {
  if (role === 'militia') return CONFIG.raid.militiaDefense;
  if (role === 'watchman') return CONFIG.raid.watchmanDefense;
  if (role === 'hunter') return CONFIG.tacticalBattle.groupPower.hunter;
  if (role === 'healer') return CONFIG.tacticalBattle.groupPower.healer;
  return CONFIG.raid.levyDefensePerResident;
}

export function combatWeaponTotalPower(
  role: CombatRole,
  readyWeapon: CombatWeaponId | null,
): number {
  const base = combatBasePower(role);
  if (readyWeapon === 'musket') return Math.max(base, CONFIG.raid.musketDefense);
  if (readyWeapon === 'hornBow') return Math.max(base, CONFIG.raid.hornBowDefense);
  if (readyWeapon === 'spear') return Math.max(base, CONFIG.raid.spearDefense);
  return base;
}

export function combatSpriteDescriptor(
  role: CombatRole,
  weapon: CombatWeaponId | null,
): { source: 'weapon'; id: CombatWeaponId } | { source: 'role'; id: CombatRole } {
  return weapon ? { source: 'weapon', id: weapon } : { source: 'role', id: role };
}

export function combatDefaultWeaponName(role: CombatRole): string {
  if (role === 'militia') return '죽창';
  if (role === 'watchman') return '육모방망이';
  if (role === 'hunter') return '사냥활';
  if (role === 'healer') return '의료 도구';
  return '생활 도구';
}

export function combatGroupLabel(role: CombatRole, weapon: CombatWeaponId | null): string {
  const roleName: Record<CombatRole, string> = {
    militia: '수비병', watchman: '파수꾼', hunter: '사냥꾼', healer: '치료반', civilian: '민간인',
  };
  const weaponName: Record<CombatWeaponId, string> = {
    musket: '조총', hornBow: '각궁', spear: '창',
  };
  if (weapon) return `${weaponName[weapon]} ${roleName[role]}`;
  if (role === 'healer') return '전술 치료반';
  if (role === 'civilian') return roleName.civilian;
  return `${combatDefaultWeaponName(role)} ${roleName[role]}`;
}

export function tacticalGroupCapabilities(group: {
  role: CombatRole;
  weapon: CombatWeaponId | null;
  readyMuskets?: number;
}): ReadonlySet<CombatCapability> {
  const readyWeapon = group.weapon === 'musket' && (group.readyMuskets ?? 0) <= 0
    ? null
    : group.weapon;
  return combatCapabilities(group.role, readyWeapon);
}

export function tacticalGroupPower(group: {
  role: CombatRole;
  weapon: CombatWeaponId | null;
  readyMuskets?: number;
}, active: number): number {
  const count = Math.max(0, active);
  const base = combatBasePower(group.role);
  if (group.weapon === 'musket') {
    const ready = Math.min(count, Math.max(0, group.readyMuskets ?? 0));
    return count * base + ready * (combatWeaponTotalPower(group.role, 'musket') - base);
  }
  return count * combatWeaponTotalPower(group.role, group.weapon);
}
