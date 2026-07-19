import { CONFIG } from './config';
import { tacticalUnitProfile } from './tacticalUnits';
import type {
  CombatWeaponId, RaiderUnitType, TacticalDefenderGroup, TacticalFormationLine, TacticalRaiderGroup,
} from './types';

export type TacticalEngagementDirection = 'frontal' | 'rear';

export interface TacticalTargetingContext {
  direction: TacticalEngagementDirection;
  contactLine: TacticalFormationLine | null;
  meleeContact: boolean;
  prepareVolleyApplied: boolean;
}

export interface TacticalTargetingResult {
  allowed: boolean;
  efficiency: number;
  reason: string | null;
}

export type TacticalTargetingAttacker = Pick<TacticalDefenderGroup, 'weapon' | 'role' | 'readyMuskets' | 'line'> | Pick<
  TacticalRaiderGroup,
  'unitType' | 'line'
>;

export type TacticalTargetingRole = 'melee' | 'musket' | 'bow';

export function defaultRaiderFormationLine(
  unitType?: RaiderUnitType,
  leader = false,
): TacticalFormationLine {
  if (leader) return 'rear';
  return unitType ? tacticalUnitProfile(unitType).defaultLine : 'front';
}

export function tacticalTargetingRole(attacker: TacticalTargetingAttacker): TacticalTargetingRole {
  if ('weapon' in attacker) {
    const weapon: CombatWeaponId | null = attacker.weapon;
    if (weapon === 'musket' && (attacker.readyMuskets ?? 0) > 0) return 'musket';
    if (weapon === 'hornBow' || (weapon == null && attacker.role === 'hunter')) return 'bow';
    return 'melee';
  }
  if (!attacker.unitType) return 'melee';
  const profile = tacticalUnitProfile(attacker.unitType);
  if (profile.tags.includes('firearm') || profile.tags.includes('artillery')) return 'musket';
  return profile.tags.includes('ranged') ? 'bow' : 'melee';
}

export function tacticalTargetingConcentration(attacker: TacticalTargetingAttacker): number {
  return CONFIG.tacticalBattle.targeting.concentration[tacticalTargetingRole(attacker)];
}

export function tacticalContactLine(
  groups: ReadonlyArray<Pick<TacticalRaiderGroup, 'line' | 'count' | 'killed' | 'power' | 'intent'>>,
  direction: TacticalEngagementDirection,
): TacticalFormationLine | null {
  const order: readonly TacticalFormationLine[] = direction === 'rear'
    ? ['rear', 'middle', 'front']
    : ['front', 'middle', 'rear'];
  return order.find(line => groups.some(group =>
    group.line === line && group.intent !== 'withdraw' && group.power > 0 && group.count - group.killed > 0)) ?? null;
}

export function canTargetLine(
  attacker: TacticalTargetingAttacker,
  targetLine: TacticalFormationLine,
  context: TacticalTargetingContext,
): TacticalTargetingResult {
  const weapon = tacticalTargetingRole(attacker);
  if (weapon === 'melee') {
    if (context.contactLine === targetLine) return { allowed: true, efficiency: 1, reason: null };
    return { allowed: false, efficiency: 0, reason: '근접 부대는 첫 접촉 열만 공격할 수 있습니다.' };
  }
  if (weapon === 'musket') {
    const baseEfficiency = CONFIG.tacticalBattle.targeting.musketLineEfficiency[targetLine];
    if (baseEfficiency <= 0) {
      return { allowed: false, efficiency: 0, reason: '조총은 적 후열까지 직접 사격할 수 없습니다.' };
    }
    const order: readonly TacticalFormationLine[] = context.direction === 'rear'
      ? ['rear', 'middle', 'front']
      : ['front', 'middle', 'rear'];
    const beyondContact = context.contactLine != null &&
      order.indexOf(targetLine) > order.indexOf(context.contactLine);
    const screeningEfficiency = context.meleeContact && beyondContact
      ? context.prepareVolleyApplied
        ? CONFIG.tacticalBattle.targeting.musketPreparedScreenedEfficiency
        : CONFIG.tacticalBattle.targeting.musketScreenedEfficiency
      : 1;
    return { allowed: true, efficiency: baseEfficiency * screeningEfficiency, reason: null };
  }
  return {
    allowed: true,
    efficiency: CONFIG.tacticalBattle.targeting.bowLineEfficiency[targetLine],
    reason: null,
  };
}
