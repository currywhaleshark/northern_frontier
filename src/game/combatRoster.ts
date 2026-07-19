import { combatBasePower, combatCapabilities, combatWeaponTotalPower } from './combatCapabilities';
import { activePredatorScoutIds } from './expeditionIntel';
import { musketReadiness, resolvedMountAssignments, resolvedWeaponAssignments } from './weapons';
import { CONFIG } from './config';
import type { CombatWeaponId, GameState, MountId, Resident, SpecialResidentId } from './types';

export type CombatContext = 'villageDefense' | 'expedition';

export type CombatRole = 'militia' | 'watchman' | 'hunter' | 'healer' | 'civilian';

export type CombatCapability =
  | 'hold'
  | 'melee'
  | 'charge'
  | 'volley'
  | 'ambush'
  | 'scout'
  | 'guard'
  | 'protect'
  | 'mounted';

export interface CombatantSnapshot {
  residentId: number;
  role: CombatRole;
  special?: SpecialResidentId;
  origin?: string;
  mount?: MountId;
  assignedWeapon: CombatWeaponId | null;
  readyWeapon: CombatWeaponId | null;
  capabilities: CombatCapability[];
  basePower: number;
  weaponPower: number;
}

export function combatRoleForResident(resident: Pick<Resident, 'job'>): CombatRole {
  if (resident.job === 'physician') return 'healer';
  if (resident.job === 'militia' || resident.job === 'watchman' || resident.job === 'hunter') {
    return resident.job;
  }
  return 'civilian';
}

function physicallyReady(state: GameState, resident: Resident): boolean {
  return resident.alive && !resident.stage && !resident.sick && resident.health >= 20 &&
    state.day >= (resident.quarantinedUntil ?? 0);
}

export function isCombatReadyResident(
  state: GameState,
  resident: Resident,
  context: CombatContext,
  allowedMemberIds?: ReadonlySet<number>,
): boolean {
  if (!physicallyReady(state, resident)) return false;
  const scouts = activePredatorScoutIds(state);
  if (scouts.has(resident.id)) return false;

  if (context === 'villageDefense') {
    if (state.expedition?.memberIds.includes(resident.id)) return false;
  } else {
    if (!allowedMemberIds?.has(resident.id)) return false;
    if (state.battle?.defenderIds.includes(resident.id)) return false;
  }
  return true;
}

export function createCombatRoster(
  state: GameState,
  options: {
    context: CombatContext;
    memberIds?: Iterable<number>;
    includeCivilians?: boolean;
    excludedResidentIds?: Iterable<number>;
    gunpowderAvailable?: number;
  },
): { combatants: CombatantSnapshot[]; civilians: number[] } {
  const allowed = options.context === 'expedition'
    ? new Set(options.memberIds ?? [])
    : undefined;
  const excluded = new Set(options.excludedResidentIds ?? []);
  const eligible = state.residents
    .filter(resident => !excluded.has(resident.id) && isCombatReadyResident(state, resident, options.context, allowed))
    .sort((a, b) => a.id - b.id);
  const fighters = eligible.filter(resident => combatRoleForResident(resident) !== 'civilian');
  const assignments = resolvedWeaponAssignments(state);
  const mountAssignments = resolvedMountAssignments(state);
  const musketIds = fighters
    .filter(resident => assignments[resident.id] === 'musket')
    .map(resident => resident.id);
  const readiness = musketReadiness(
    state, musketIds, CONFIG.raid.powderPerMusket, options.gunpowderAvailable,
  );
  const readyMusketIds = new Set(musketIds.slice(0, readiness.ready));

  const combatants = fighters.map(resident => {
    const role = combatRoleForResident(resident);
    const assignedWeapon = role === 'healer'
      ? null
      : assignments[resident.id] ?? (resident.special === 'jurchenWarrior'
        ? 'spear'
        : resident.special === 'hangwae' ? 'musket' : null);
    const readyWeapon = assignedWeapon === 'musket' && !readyMusketIds.has(resident.id)
      ? null
      : assignedWeapon;
    const basePower = combatBasePower(role, resident.origin, resident.special);
    const mount = role === 'healer' ? null : mountAssignments[resident.id] ?? null;
    const snapshot: CombatantSnapshot = {
      residentId: resident.id,
      role,
      ...(resident.special ? { special: resident.special } : {}),
      ...(resident.origin ? { origin: resident.origin } : {}),
      ...(mount ? { mount } : {}),
      assignedWeapon,
      readyWeapon,
      capabilities: [...combatCapabilities(role, readyWeapon, resident.origin, mount, resident.special)],
      basePower,
      weaponPower: combatWeaponTotalPower(role, readyWeapon, resident.origin, resident.special) - basePower,
    };
    return snapshot;
  });

  return {
    combatants,
    civilians: options.includeCivilians
      ? eligible.filter(resident => combatRoleForResident(resident) === 'civilian').map(resident => resident.id)
      : [],
  };
}
