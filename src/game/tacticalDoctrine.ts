import { CONFIG } from './config';
import { tacticalUnitProfileOrUndefined } from './tacticalUnits';
import type {
  EnemyDoctrineId,
  TacticalAiState,
  TacticalBattle,
  TacticalRaiderGroup,
} from './types';

interface TacticalDoctrineTransition {
  groupId: string;
  groupLabel: string;
  doctrine: EnemyDoctrineId;
  fromState?: TacticalAiState;
  toState: TacticalAiState;
  intent: TacticalRaiderGroup['intent'];
  signal: string;
}

function baselineIntent(group: TacticalRaiderGroup): TacticalRaiderGroup['intent'] {
  const profile = tacticalUnitProfileOrUndefined(group.unitType);
  if (profile?.tags.includes('siege')) return 'breakWall';
  if (group.kind === 'looters') return 'loot';
  if (group.kind === 'flankers') return 'flank';
  return 'advance';
}

function stateIntent(
  group: TacticalRaiderGroup,
  state: TacticalAiState,
): TacticalRaiderGroup['intent'] {
  if (state === 'exiting') return 'withdraw';
  if (state === 'forming' || state === 'probing' || state === 'withdrawing') return 'defend';
  if (state === 'routeTransit' || state === 'routeEngagement') return 'flank';
  if (state === 'committingReserve') return group.kind === 'flankers' ? 'flank' : 'advance';
  return baselineIntent(group);
}

function reserveGroupId(groups: readonly TacticalRaiderGroup[]): string | undefined {
  return groups
    .filter(group => group.intent !== 'withdraw' && group.power > 0)
    .map(group => {
      const tags = tacticalUnitProfileOrUndefined(group.unitType)?.tags ?? [];
      const priority = tags.includes('shock') ? 2 : tags.includes('mounted') ? 1 : 0;
      return { group, priority };
    })
    .sort((left, right) => right.priority - left.priority || right.group.power - left.group.power ||
      left.group.id.localeCompare(right.group.id))[0]?.group.id;
}

function desiredState(
  doctrine: EnemyDoctrineId,
  group: TacticalRaiderGroup,
  round: number,
  selectedReserveId: string | undefined,
): TacticalAiState {
  if (group.intent === 'withdraw' || group.power <= 0 || group.count - group.killed <= 0) return 'exiting';
  const tags = tacticalUnitProfileOrUndefined(group.unitType)?.tags ?? [];
  const ranged = tags.includes('ranged') || tags.includes('firearm') || tags.includes('artillery');
  const mounted = tags.includes('mounted');
  const siege = tags.includes('siege');

  if (doctrine === 'mountedSkirmish') {
    if (group.kind === 'looters' || group.kind === 'flankers') return 'engaging';
    if (ranged || mounted) return Math.floor((round - 1) / 2) % 2 === 0 ? 'probing' : 'withdrawing';
    return round <= 2 ? 'forming' : 'engaging';
  }
  if (doctrine === 'shockBreakthrough') return 'engaging';
  if (doctrine === 'shieldedAdvance') {
    if (tags.includes('shielded')) return 'engaging';
    return ranged && round <= 2 ? 'probing' : 'engaging';
  }
  if (doctrine === 'breachAndStorm') {
    if (siege || tags.includes('shielded')) return 'engaging';
    return round <= 2 ? 'forming' : 'engaging';
  }
  if (doctrine === 'missileSuppression') {
    if (ranged) return round <= 2 ? 'probing' : 'engaging';
    return round <= 2 ? 'forming' : 'engaging';
  }
  if (doctrine === 'reserveCounterattack') {
    if (group.id !== selectedReserveId) return 'engaging';
    if (round <= 2) return 'forming';
    if (round <= 4) return 'committingReserve';
    return 'engaging';
  }
  return 'engaging';
}

export function tacticalDoctrineStateSignal(
  state: TacticalAiState,
  intent: TacticalRaiderGroup['intent'],
): string {
  if (state === 'forming') return '전열을 고정하고 예비 전력을 숨깁니다.';
  if (state === 'probing') return '거리를 유지하며 견제 사격을 준비합니다.';
  if (state === 'withdrawing') return '사격 뒤 접촉을 끊고 거리를 벌립니다.';
  if (state === 'committingReserve') return '숨겨 둔 예비대를 전선에 투입합니다.';
  if (state === 'routeTransit') return '우회로를 따라 후방으로 기동합니다.';
  if (state === 'routeEngagement') return '우회로 차단 부대와 교전합니다.';
  if (state === 'exiting') return '대열이 무너져 전장에서 이탈합니다.';
  if (intent === 'breakWall') return '파책 전력을 방책 한 곳에 집중합니다.';
  if (intent === 'flank') return '주 방어선을 비껴 측후방을 압박합니다.';
  if (intent === 'loot') return '주력이 묶어 둔 틈으로 약탈조가 침투합니다.';
  return '한 구역에 전력을 모아 전진합니다.';
}

export function applyTacticalDoctrineAi(battle: TacticalBattle): TacticalDoctrineTransition[] {
  const doctrine = battle.enemyPlan?.doctrine;
  if (!doctrine || !battle.enemyPlan?.compositionTemplateId ||
      battle.orientation === 'assault' || battle.assaultKind) return [];
  const selectedReserveId = doctrine === 'reserveCounterattack'
    ? reserveGroupId(battle.raiderGroups)
    : undefined;
  const transitions: TacticalDoctrineTransition[] = [];
  const minIntentRounds = Math.max(1, CONFIG.tacticalBattle.doctrineAi.minIntentRounds);

  for (const group of battle.raiderGroups) {
    const targetState = desiredState(doctrine, group, battle.round, selectedReserveId);
    const currentState = group.aiState;
    if (currentState === targetState) continue;
    if (currentState != null && battle.round < (group.intentLockedUntilRound ?? 0)) continue;
    const intent = stateIntent(group, targetState);
    group.aiState = targetState;
    group.aiStateChangedRound = battle.round;
    group.intentLockedUntilRound = battle.round + minIntentRounds;
    group.intent = intent;
    transitions.push({
      groupId: group.id,
      groupLabel: group.label,
      doctrine,
      fromState: currentState,
      toState: targetState,
      intent,
      signal: tacticalDoctrineStateSignal(targetState, intent),
    });
  }
  return transitions;
}
