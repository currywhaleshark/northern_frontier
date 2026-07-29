import { CONFIG } from './config';
import { residentOriginProfile } from './defectors';
import type { CombatCapability, CombatRole } from './combatRoster';
import type { ArtifactWeaponId, CombatWeaponId, MountId, SpecialResidentId } from './types';

// Hunters keep a weak hunting-bow volley even without an inventory weapon.
// This is the single policy switch for that legacy gameplay rule.
export const HUNTER_DEFAULT_RANGED = true;

export function combatCapabilities(
  role: CombatRole,
  weapon: CombatWeaponId | null,
  origin?: string,
  mount?: MountId | null,
  special?: SpecialResidentId,
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
  const originProfile = residentOriginProfile(origin);
  if (originProfile === 'nimacha') {
    result.add('ambush');
    result.add('scout');
  } else if (originProfile === 'holaon') {
    result.add('scout');
  }
  if (mount === 'horse') result.add('mounted');
  if (special === 'jurchenWarrior') result.add('ambush');
  return result;
}

export function combatBasePower(role: CombatRole, origin?: string, special?: SpecialResidentId): number {
  const rolePower = role === 'militia' ? CONFIG.raid.militiaDefense
    : role === 'watchman' ? CONFIG.raid.watchmanDefense
      : role === 'hunter' ? CONFIG.tacticalBattle.groupPower.hunter
        : role === 'healer' ? CONFIG.tacticalBattle.groupPower.healer
          : CONFIG.raid.levyDefensePerResident;
  const originProfile = residentOriginProfile(origin);
  const originBonus = originProfile === 'nimacha' ? CONFIG.defectors.nimachaBasePowerBonus
    : originProfile === 'holaon' ? CONFIG.defectors.holaonBasePowerBonus
      : 0;
  const specialBonus = special === 'jurchenWarrior'
    ? CONFIG.specialResidents.jurchenWarriorBasePowerBonus
    : special === 'tigerHunter'
      ? CONFIG.specialResidents.tigerHunterBasePowerBonus
      : 0;
  return rolePower + originBonus + specialBonus;
}

export function combatWeaponTotalPower(
  role: CombatRole,
  readyWeapon: CombatWeaponId | null,
  origin?: string,
  special?: SpecialResidentId,
): number {
  const base = combatBasePower(role, origin, special);
  if (readyWeapon === 'musket') {
    const musketPower = Math.max(base, CONFIG.raid.musketDefense)
      + (special === 'hangwae' ? CONFIG.specialResidents.hangwaeMusketPowerBonus : 0);
    return residentOriginProfile(origin) === 'courtDeserter'
      ? musketPower + CONFIG.defectors.courtMusketPowerBonus
      : musketPower;
  }
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
  special?: SpecialResidentId;
  origin?: string;
  mount?: MountId;
  weapon: CombatWeaponId | null;
  readyMuskets?: number;
}): ReadonlySet<CombatCapability> {
  const readyWeapon = group.weapon === 'musket' && (group.readyMuskets ?? 0) <= 0
    ? null
    : group.weapon;
  return combatCapabilities(group.role, readyWeapon, group.origin, group.mount, group.special);
}

export function tacticalGroupPower(group: {
  role: CombatRole;
  special?: SpecialResidentId;
  origin?: string;
  mount?: MountId;
  weapon: CombatWeaponId | null;
  artifactWeapon?: ArtifactWeaponId;
  readyMuskets?: number;
  featuredResidents?: ReadonlyArray<{ special: SpecialResidentId; origin?: string }>;
}, active: number): number {
  const count = Math.max(0, active);
  if (count > 0 && group.artifactWeapon &&
      (group.weapon !== 'musket' || (group.readyMuskets ?? 0) > 0)) {
    return tacticalGroupPower({ ...group, artifactWeapon: undefined }, active) +
      combatWeaponTotalPower(group.role, group.weapon, group.origin, group.special) *
      (CONFIG.courtGrants.artifactWeaponPowerMultiplier - 1);
  }
  const featuredResidents = group.featuredResidents?.slice(0, count) ?? [];
  if (featuredResidents.length > 0) {
    const ready = group.weapon === 'musket'
      ? Math.min(count, Math.max(0, group.readyMuskets ?? 0))
      : 0;
    let power = group.weapon === 'musket'
      ? count * combatBasePower(group.role, group.origin) + ready * (
        combatWeaponTotalPower(group.role, 'musket', group.origin) - combatBasePower(group.role, group.origin)
      )
      : count * combatWeaponTotalPower(group.role, group.weapon, group.origin);
    featuredResidents.forEach((featured, index) => {
      const readyWeapon = group.weapon === 'musket' ? (index < ready ? 'musket' : null) : group.weapon;
      const featuredOrigin = featured.origin ?? group.origin;
      power += combatWeaponTotalPower(group.role, readyWeapon, featuredOrigin, featured.special) -
        combatWeaponTotalPower(group.role, readyWeapon, group.origin);
    });
    return power;
  }
  const base = combatBasePower(group.role, group.origin, group.special);
  if (group.weapon === 'musket') {
    const ready = Math.min(count, Math.max(0, group.readyMuskets ?? 0));
    return count * base + ready * (
      combatWeaponTotalPower(group.role, 'musket', group.origin, group.special) - base
    );
  }
  return count * combatWeaponTotalPower(group.role, group.weapon, group.origin, group.special);
}

export function isHorseExperiencedOrigin(origin?: string): boolean {
  return residentOriginProfile(origin) === 'holaon';
}
