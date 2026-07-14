import { CONFIG } from './config';
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

type TargetingAttacker = Pick<TacticalDefenderGroup, 'weapon' | 'role' | 'readyMuskets' | 'line'> | Pick<
  TacticalRaiderGroup,
  'unitType' | 'line'
>;

const RANGED_RAIDER_TYPES = new Set<RaiderUnitType>([
  'nimacha-hunter', 'holaon-horse-archer', 'bandit-rider', 'court-gunner', 'court-archer',
]);

export function defaultRaiderFormationLine(
  unitType?: RaiderUnitType,
  leader = false,
): TacticalFormationLine {
  if (leader || unitType === 'court-artillery') return 'rear';
  return unitType && RANGED_RAIDER_TYPES.has(unitType) ? 'middle' : 'front';
}

function targetingWeapon(attacker: TargetingAttacker): 'melee' | 'musket' | 'bow' {
  if ('weapon' in attacker) {
    const weapon: CombatWeaponId | null = attacker.weapon;
    if (weapon === 'musket' && (attacker.readyMuskets ?? 0) > 0) return 'musket';
    if (weapon === 'hornBow' || (weapon == null && attacker.role === 'hunter')) return 'bow';
    return 'melee';
  }
  if (attacker.unitType === 'court-gunner' || attacker.unitType === 'court-artillery') return 'musket';
  return attacker.unitType && RANGED_RAIDER_TYPES.has(attacker.unitType) ? 'bow' : 'melee';
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
  attacker: TargetingAttacker,
  targetLine: TacticalFormationLine,
  context: TacticalTargetingContext,
): TacticalTargetingResult {
  const weapon = targetingWeapon(attacker);
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
