import { resetAgent } from './agents';
import { countBuilt } from './buildings';
import { combatGroupLabel, tacticalGroupCapabilities } from './combatCapabilities';
import { createCombatRoster, isCombatReadyResident, type CombatantSnapshot, type CombatRole } from './combatRoster';
import { CONFIG } from './config';
import { RESOURCE_NAMES } from './constants';
import {
  applyEnemyPlanPreparationCounter, createEnemyPlan, enemyObjectiveProfile,
  enemyStratagemCounterStrength, enemyStratagemCounterStrengthForEngagement,
  enemyIntelLevel,
  enemyPlanFirstRoundMoraleBonus, enemyPlanPreparationPenalty, enemyPlanRangedEfficiency,
  enemyPlanStratagemScale, enemyPlanStratagemScaleForEngagement, enemyPlanWarningLines,
  enemyDoctrineDefinition,
  flankPlanFromEnemyPlan, flankPlanRevealedFromEnemyPlan,
} from './enemyPlan';
import { addLog } from './events';
import { withJosa } from './josa';
import { makeRng } from './map';
import {
  applyLootLosses, damageBuildings, describeLootLosses, injure, killResidents, moraleShock,
} from './raidDamage';
import { changeRelation } from './relations';
import { livingResidents } from './residents';
import { getDayOfSeason, getSeason, getYear } from './seasons';
import { activePredatorScoutIds } from './expeditionIntel';
import { allocateMusketReadiness, consumeMusketVolleys } from './weapons';
import {
  captureTacticalResources, gradeTacticalBattle, TACTICAL_BATTLE_GRADE_LABELS,
  raidDefenseObjectiveResult, tacticalClosingSummary, tacticalPeopleReport, tacticalResourceDelta,
} from './tacticalCore';
import {
  applyDefenseZoneConsequences, resolveEngagementExchange, splitTacticalEngagementDefenders,
  tacticalFacingMatchesDirection, tacticalMovementCommandPowerMultiplier,
} from './tacticalEngagement';
import { applyTacticalDoctrineAi } from './tacticalDoctrine';
import {
  acknowledgeAssaultReport, advanceAssaultPhase, applyAssaultReportPositions, assaultCommandPowerMultiplier,
  assaultCommandUnavailableReason,
  assaultPreparationUnavailableReason, assignAssaultGroup, chooseDefaultAssaultCommands,
  finishBanditLairTacticalAssault, resolveAssaultRound, setAssaultCommand,
  spendAssaultPreparationAction,
} from './tacticalAssault';
import {
  acknowledgeHuntReport, advanceHuntPhase, applyHuntReportPositions, assignHuntGroup, chooseDefaultHuntCommands,
  finishPredatorTacticalHunt, huntCommandUnavailableReason, huntPreparationUnavailableReason,
  resolveHuntRound, setHuntCommand, spendHuntPreparationAction,
} from './tacticalHunt';
import {
  canTargetLine, defaultRaiderFormationLine, tacticalContactLine, tacticalTargetingRole,
} from './tacticalTargeting';
import { tacticalCompositionTemplate } from './tacticalCompositions';
import { tacticalUnitProfile } from './tacticalUnits';
import {
  applyTacticalRaiderSupportTreatment,
  createTacticalRaiderSupportState,
  prepareTacticalRaiderSupportRound,
} from './tacticalSupport';
export { tacticalSupportUnitView } from './tacticalSupport';
import {
  advanceTacticalRouteTransits,
  createTacticalFlankRoutes,
  initializeEnemyTacticalRouteTransit,
  orderTacticalRouteRaid,
  resolveTacticalRouteRound,
  syncTacticalRouteVisibility,
  tacticalFlankRoutePreparationUnavailableReason,
  tacticalRouteOrderUnavailableReason,
  toggleTacticalFlankRoutePreparation,
} from './tacticalRoutes';
import {
  applyAutoDeployTacticalGroups,
  attachFeaturedResidentsToTacticalGroups,
  initializeTacticalDeployment,
  placeTacticalDeploymentGroup,
  registerTacticalDeploymentGroup,
  resolveTacticalDeploymentGroupId,
  tacticalDeploymentUnavailableReason,
  tacticalFeaturedResidentsFromSnapshots,
} from './tacticalDeployment';
import type {
  DefenderGroupKind,
  EnemyDoctrineId,
  EnemyPlan,
  GameState,
  PreparationActionId,
  ResourceId,
  TacticalAnimationEvent,
  TacticalBattle,
  TacticalBattleZone,
  TacticalCommandId,
  TacticalDefenderGroup,
  TacticalFacing,
  TacticalFormationLine,
  TacticalRaiderGroup,
  TacticalBattleFlankOutcome,
  TacticalBattleTacticsReport,
  RaiderUnitType,
  TacticalRouteSide,
  TacticalRoundReport,
} from './types';

export {
  applyAutoDeployTacticalGroups,
  autoDeployTacticalGroups,
  mergeTacticalGroups,
  placeTacticalDeploymentGroup,
  removeTacticalDeploymentGroup,
  resetTacticalDeployment,
  resolveTacticalDeploymentGroupId,
  splitFeaturedTacticalGroup,
  splitTacticalGroup,
  tacticalDeploymentPlacementUnavailableReason,
  tacticalDeploymentUnavailableReason,
  tacticalDeploymentView,
} from './tacticalDeployment';

const PREPARATION_ACTIONS: Array<{ id: PreparationActionId; label: string; cost: number }> = [
  { id: 'evacuateCivilians', label: '주민 대피', cost: 1 },
  { id: 'hideSupplies', label: '창고 물자 은닉', cost: 1 },
  { id: 'repairWall', label: '목책 응급 수리', cost: 1 },
  { id: 'setAmbush', label: '사냥꾼 매복 배치', cost: 2 },
  { id: 'prepareVolley', label: '망루·사격 준비', cost: 2 },
  { id: 'firePrevention', label: '화재 대비', cost: 1 },
  { id: 'torchWatch', label: '횃불 경계', cost: 1 },
  { id: 'preliminaryBombardment', label: '사전포격', cost: 3 },
  { id: 'musterMilitia', label: '민병 소집', cost: 1 },
  { id: 'openFlankRoute', label: '우회로 개방', cost: CONFIG.tacticalBattle.flankRoutes.preparationCost },
];

export {
  TACTICAL_FLANK_ROUTE_IDS,
  tacticalFlankRoutePreparationView,
  tacticalFlankRoutePreparationUnavailableReason,
  tacticalFlankRouteView,
  tacticalGroupIsInRouteTransit,
  tacticalRouteBySide,
  tacticalRouteRoundsRequired,
  tacticalRouteOrderUnavailableReason,
  tacticalRoutePlacementUnavailableReason,
  placeTacticalRouteBlocker,
  orderTacticalRouteRaid,
  toggleTacticalFlankRoutePreparation,
} from './tacticalRoutes';

const DEFENSE_SUPPORTED_COMMANDS: readonly TacticalCommandId[] = [
  'hold', 'charge', 'volley', 'ambush', 'guardStorehouse', 'protectCivilians',
  'reinforceRear', 'fallback', 'advance', 'flankRoute',
];
const ASSAULT_SUPPORTED_COMMANDS: readonly TacticalCommandId[] = [
  'hold', 'charge', 'volley', 'ambush', 'fallback', 'advance', 'arson', 'blockEscape', 'openRetreat',
];
const HUNT_SUPPORTED_COMMANDS: readonly TacticalCommandId[] = [
  'hold', 'charge', 'volley', 'ambush', 'advance', 'openRetreat',
];
const IMPLEMENTED_COMMANDS = new Set<TacticalCommandId>([...DEFENSE_SUPPORTED_COMMANDS, 'redeploy']);

export function tacticalSupportedCommands(
  battle: Pick<TacticalBattle, 'orientation' | 'assaultKind'>,
): readonly TacticalCommandId[] {
  if (battle.assaultKind === 'predatorHunt') return HUNT_SUPPORTED_COMMANDS;
  if (battle.orientation === 'assault') return ASSAULT_SUPPORTED_COMMANDS;
  return DEFENSE_SUPPORTED_COMMANDS;
}

const FORMATION_LINE_ORDER: readonly TacticalFormationLine[] = ['front', 'middle', 'rear'];

const GROUP_LABELS: Record<DefenderGroupKind, string> = {
  'militia-musket': '조총 수비대',
  'militia-bow': '각궁 수비대',
  'militia-spear': '창 수비대',
  'militia-unarmed': '소집 민병',
  watchman: '파수꾼',
  hunter: '사냥꾼',
  healer: '전술 치료반',
  civilian: '피난 주민',
};

const GROUP_POWER: Record<DefenderGroupKind, number> = {
  'militia-musket': CONFIG.tacticalBattle.groupPower.militiaMusket,
  'militia-bow': CONFIG.tacticalBattle.groupPower.militiaBow,
  'militia-spear': CONFIG.tacticalBattle.groupPower.militiaSpear,
  'militia-unarmed': CONFIG.tacticalBattle.groupPower.militiaUnarmed,
  watchman: CONFIG.tacticalBattle.groupPower.watchman,
  hunter: CONFIG.tacticalBattle.groupPower.hunter,
  healer: CONFIG.tacticalBattle.groupPower.healer,
  civilian: CONFIG.tacticalBattle.groupPower.civilian,
};

const ROUTES: Record<TacticalRaiderGroup['kind'], string[]> = {
  main: ['approach', 'wall', 'center'],
  looters: ['approach', 'wall', 'storehouse'],
  flankers: ['approach', 'storehouse', 'center'],
};

function routeForRaider(attacker: TacticalRaiderGroup): string[] {
  if (attacker.kind === 'flankers' && attacker.flankPlan === 'rearAssault') return ['approach', 'wall'];
  return ROUTES[attacker.kind];
}

function nextRearZoneId(battle: TacticalBattle, zoneId: string): string | null {
  const currentOrder = battle.zones.find(zone => zone.id === zoneId)?.order;
  if (currentOrder == null) return null;
  return [...battle.zones]
    .sort((a, b) => a.order - b.order)
    .find(zone => zone.order > currentOrder)?.id ?? null;
}

function nextForwardZoneId(battle: TacticalBattle, zoneId: string): string | null {
  const currentOrder = battle.zones.find(zone => zone.id === zoneId)?.order;
  if (currentOrder == null) return null;
  return [...battle.zones]
    .sort((a, b) => b.order - a.order)
    .find(zone => zone.order < currentOrder)?.id ?? null;
}

function applyNextEngagementStates(battle: TacticalBattle): void {
  for (const defender of battle.defenderGroups) {
    if (defender.command === 'redeploy' && defender.pendingLine &&
        tacticalFormationLinesAdjacent(defender.line, defender.pendingLine)) {
      defender.line = defender.pendingLine;
      defender.pendingLine = undefined;
      defender.command = 'hold';
    } else if (defender.command === 'fallback') {
      const rearZoneId = nextRearZoneId(battle, defender.zoneId);
      if (rearZoneId) defender.zoneId = rearZoneId;
      defender.pendingLine = undefined;
      defender.command = 'hold';
    } else if (defender.command === 'advance') {
      const forwardZoneId = nextForwardZoneId(battle, defender.zoneId);
      if (forwardZoneId) defender.zoneId = forwardZoneId;
      defender.pendingLine = undefined;
      defender.command = 'hold';
    } else if (defender.command === 'ambush' && !defender.ambushed) {
      defender.ambushed = true;
    }
  }
  battle.raiderGroups.forEach(attacker => {
    if (attacker.pendingZoneId) {
      attacker.zoneId = attacker.pendingZoneId;
      attacker.pendingZoneId = undefined;
      attacker.engagementsInZone = 0;
      attacker.rearAssault = attacker.kind === 'flankers' &&
        attacker.flankPlan === 'rearAssault' && attacker.zoneId === 'wall';
    }
    attacker.confused = false;
  });
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function applied(battle: TacticalBattle, id: PreparationActionId): boolean {
  return battle.prepActions.some(action => action.id === id && action.applied);
}

function kindForCombatant(role: CombatRole, weapon: TacticalDefenderGroup['weapon']): DefenderGroupKind {
  if (role === 'healer') return 'healer';
  if (weapon === 'musket') return 'militia-musket';
  if (weapon === 'hornBow') return 'militia-bow';
  if (weapon === 'spear') return 'militia-spear';
  if (role === 'watchman') return 'watchman';
  if (role === 'hunter') return 'hunter';
  if (role === 'civilian') return 'civilian';
  return 'militia-unarmed';
}

function defaultFormationLine(role: CombatRole, weapon: TacticalDefenderGroup['weapon']): TacticalFormationLine {
  if (role === 'civilian' || role === 'healer') return 'rear';
  if (weapon === 'musket') return 'middle';
  return weapon === 'spear' || (weapon == null && (role === 'militia' || role === 'watchman')) ? 'front' : 'rear';
}

export function tacticalFormationLinesAdjacent(
  from: TacticalFormationLine,
  to: TacticalFormationLine,
): boolean {
  return Math.abs(FORMATION_LINE_ORDER.indexOf(from) - FORMATION_LINE_ORDER.indexOf(to)) === 1;
}

export type TacticalRearResponseOptionId = 'reinforceRear' | 'redeployRear' | 'rangedRear' | 'unopposed';

export interface TacticalRearResponseOption {
  id: TacticalRearResponseOptionId;
  label: string;
  description: string;
  groupIds: string[];
}

export function tacticalRearResponseOptions(
  battle: TacticalBattle,
  zoneId: string,
): TacticalRearResponseOption[] {
  if (battle.orientation === 'assault' || battle.assaultKind === 'predatorHunt') return [];
  const rearAssaultActive = battle.raiderGroups.some(group =>
    group.zoneId === zoneId && tacticalRearAssaultIsEngaged(group) && activeRaider(group));
  if (!rearAssaultActive) return [];
  const defenders = battle.defenderGroups.filter(group =>
    group.zoneId === zoneId && group.commandable !== false && activeCount(group) > 0);
  const middleReserve = defenders.filter(group => {
    const capabilities = tacticalGroupCapabilities(group);
    return group.line === 'middle' && (capabilities.has('melee') || capabilities.has('mounted'));
  });
  const rearwardRedeploy = defenders.filter(group => group.line === 'front' || group.line === 'middle');
  const rearRanged = defenders.filter(group =>
    tacticalFacingMatchesDirection(group, 'rear') && tacticalGroupCapabilities(group).has('volley'));
  const options: TacticalRearResponseOption[] = [];
  if (middleReserve.length > 0) {
    options.push({
      id: 'reinforceRear',
      label: '중열 예비대',
      description: '중열 근접대나 기마 예비대에 후방 증원을 내려 이번 라운드 후방 교전에 투입합니다.',
      groupIds: middleReserve.map(group => group.id),
    });
  }
  if (rearwardRedeploy.length > 0) {
    options.push({
      id: 'redeployRear',
      label: '후열 쪽 재배치',
      description: '인접 열로 후퇴 배치합니다. 재배치 중 전력이 줄어 정면 압박이 커질 수 있습니다.',
      groupIds: rearwardRedeploy.map(group => group.id),
    });
  }
  if (rearRanged.length > 0) {
    options.push({
      id: 'rangedRear',
      label: '후열 원거리 대응',
      description: '후방을 향한 원거리대는 맞서 사격하지만 근접전에 노출되어 피해 위험이 큽니다.',
      groupIds: rearRanged.map(group => group.id),
    });
  }
  options.push({
    id: 'unopposed',
    label: '무대응',
    description: '후방 대응 부대를 두지 않으면 피난 주민이 급습 피해에 직접 노출됩니다.',
    groupIds: [],
  });
  return options;
}

function activeRaider(group: TacticalRaiderGroup): boolean {
  return group.intent !== 'withdraw' && group.power > 0 && group.count - group.killed > 0;
}

export function tacticalRearAssaultIsEngaged(group: TacticalRaiderGroup): boolean {
  return group.rearAssault === true && (group.engagementsInZone ?? 0) > 0;
}

function applyDefenseReportPositions(battle: TacticalBattle): void {
  const report = battle.pendingReport;
  if (!report || report.positionsApplied) return;
  applyNextEngagementStates(battle);
  normalizeTacticalGroupTargets(battle);
  battle.currentZoneId = report.nextFocusZoneId;
  report.positionsApplied = true;
}

function defenderEngagementDirection(
  battle: TacticalBattle,
  defender: TacticalDefenderGroup,
): 'frontal' | 'rear' {
  const rearActive = battle.raiderGroups.some(group =>
    group.zoneId === defender.zoneId && tacticalRearAssaultIsEngaged(group) && activeRaider(group));
  const frontalActive = battle.raiderGroups.some(group =>
    group.zoneId === defender.zoneId && !group.rearAssault && activeRaider(group));
  if (rearActive && (!frontalActive || tacticalFacingMatchesDirection(defender, 'rear'))) return 'rear';
  return 'frontal';
}

function defendersForDirection(
  battle: TacticalBattle,
  zoneId: string,
  direction: 'frontal' | 'rear',
): TacticalDefenderGroup[] {
  const assigned = battle.defenderGroups.filter(group => group.zoneId === zoneId && activeCount(group) > 0);
  const rearActive = battle.raiderGroups.some(group =>
    group.zoneId === zoneId && tacticalRearAssaultIsEngaged(group) && activeRaider(group));
  const frontalActive = battle.raiderGroups.some(group =>
    group.zoneId === zoneId && !group.rearAssault && activeRaider(group));
  const split = splitTacticalEngagementDefenders(assigned, rearActive, frontalActive);
  return direction === 'rear'
    ? [...split.rear, ...split.protectedTargets]
    : rearActive ? split.frontal : [...split.frontal, ...split.protectedTargets];
}

function targetContextForDefender(
  battle: TacticalBattle,
  defender: TacticalDefenderGroup,
  direction: 'frontal' | 'rear',
) {
  const attackers = battle.raiderGroups.filter(group =>
    group.zoneId === defender.zoneId &&
    (direction === 'rear' ? tacticalRearAssaultIsEngaged(group) : !group.rearAssault) && activeRaider(group));
  const defenders = defendersForDirection(battle, defender.zoneId, direction);
  const defenderOrder: readonly TacticalFormationLine[] = direction === 'rear'
    ? ['rear', 'middle', 'front']
    : ['front', 'middle', 'rear'];
  const defenderContactLine = defenderOrder.find(line => defenders.some(group =>
    group.line === line && group.commandable !== false && activeCount(group) > 0)) ?? null;
  return {
    direction,
    contactLine: tacticalContactLine(attackers, direction),
    meleeContact: defenderContactLine != null && defenders.some(group =>
      group.line === defenderContactLine && group.commandable !== false && activeCount(group) > 0 &&
      tacticalGroupCapabilities(group).has('melee')),
    prepareVolleyApplied: battle.orientation !== 'assault' && applied(battle, 'prepareVolley'),
  } as const;
}

export function tacticalGroupTargetUnavailableReason(
  battle: TacticalBattle,
  defenderGroupId: string,
  enemyGroupId: string,
): string | null {
  if (battle.assaultKind === 'predatorHunt') return '맹수 사냥에서는 개별 표적을 지정할 수 없습니다.';
  const defender = battle.defenderGroups.find(group => group.id === defenderGroupId);
  if (!defender || defender.commandable === false || activeCount(defender) <= 0) {
    return '표적 명령을 내릴 수 있는 아군 부대가 아닙니다.';
  }
  if (defender.command === 'fallback' || defender.command === 'openRetreat') {
    return '퇴각 중인 부대는 표적을 지정할 수 없습니다.';
  }
  const target = battle.raiderGroups.find(group => group.id === enemyGroupId);
  if (!target || target.zoneId !== defender.zoneId || !activeRaider(target)) {
    return '같은 전장 구역에 생존한 적 표적이 없습니다.';
  }
  if (!target.revealed) return '아직 드러나지 않은 적은 표적으로 지정할 수 없습니다.';
  if (target.rearAssault && !tacticalRearAssaultIsEngaged(target)) {
    return '아직 실제 후방 교전이 시작되지 않은 급습대는 표적으로 지정할 수 없습니다.';
  }
  const defenderDirection = defenderEngagementDirection(battle, defender);
  const targetDirection = tacticalRearAssaultIsEngaged(target) ? 'rear' : 'frontal';
  if (defenderDirection !== targetDirection) {
    return defenderDirection === 'frontal'
      ? '이 부대는 정면 교전에 배정되어 후방 급습대를 공격할 수 없습니다.'
      : '이 부대는 후방 교전에 배정되어 정면의 적을 공격할 수 없습니다.';
  }
  const targeting = canTargetLine(defender, target.line,
    targetContextForDefender(battle, defender, defenderDirection));
  return targeting.allowed ? null : targeting.reason;
}

function strongest<T extends { power: number }>(groups: T[]): T | undefined {
  return [...groups].sort((a, b) => b.power - a.power)[0];
}

export function chooseAutomaticDefenderTarget(
  battle: TacticalBattle,
  defender: TacticalDefenderGroup,
): string | undefined {
  const candidates = battle.raiderGroups.filter(group =>
    tacticalGroupTargetUnavailableReason(battle, defender.id, group.id) == null);
  if (candidates.length === 0) return undefined;
  const pick = (predicate: (group: TacticalRaiderGroup) => boolean): TacticalRaiderGroup | undefined =>
    strongest(candidates.filter(predicate));
  const role = tacticalTargetingRole(defender);
  if (defender.command === 'reinforceRear') {
    return (pick(group => group.rearAssault === true) ?? strongest(candidates))?.id;
  }
  if (role === 'melee') {
    return (pick(group => tacticalTargetingRole(group) === 'melee')
      ?? pick(group => group.intent === 'breakWall' || group.intent === 'loot')
      ?? strongest(candidates))?.id;
  }
  if (role === 'musket') {
    return (pick(group => tacticalTargetingRole(group) !== 'melee')
      ?? pick(group => group.intent === 'breakWall')
      ?? pick(group => group.line === 'middle')
      ?? pick(group => group.line === 'front')
      ?? strongest(candidates))?.id;
  }
  return (pick(group => group.line === 'rear' && (group.leader || group.unitType === 'court-artillery'))
    ?? pick(group => tacticalTargetingRole(group) !== 'melee')
    ?? pick(group => group.kind === 'flankers')
    ?? strongest(candidates))?.id;
}

function raiderTargetingResult(
  battle: TacticalBattle,
  attacker: TacticalRaiderGroup,
  target: TacticalDefenderGroup,
) {
  const direction = attacker.rearAssault ? 'rear' : 'frontal';
  const assigned = battle.defenderGroups.filter(group =>
    group.zoneId === attacker.zoneId && activeCount(group) > 0);
  const rearAssaultActive = battle.raiderGroups.some(group =>
    group.zoneId === attacker.zoneId && group.rearAssault && activeRaider(group));
  const frontalAssaultActive = battle.raiderGroups.some(group =>
    group.zoneId === attacker.zoneId && !group.rearAssault && activeRaider(group));
  const split = splitTacticalEngagementDefenders(assigned, rearAssaultActive, frontalAssaultActive);
  const defenders = direction === 'rear'
    ? [...split.rear, ...split.protectedTargets]
    : rearAssaultActive ? split.frontal : [...split.frontal, ...split.protectedTargets];
  if (!defenders.some(group => group.id === target.id)) {
    return { allowed: false, efficiency: 0, reason: direction === 'rear'
      ? '후방 급습대는 후방 교전에 배정된 표적만 공격할 수 있습니다.'
      : '정면 공격대는 정면 교전에 배정된 표적만 공격할 수 있습니다.' };
  }
  const order: readonly TacticalFormationLine[] = direction === 'rear'
    ? ['rear', 'middle', 'front']
    : ['front', 'middle', 'rear'];
  const contactLine = order.find(line => defenders.some(group => group.line === line && activeCount(group) > 0)) ?? null;
  return canTargetLine(attacker, target.line, {
    direction,
    contactLine,
    meleeContact: contactLine != null && defenders.some(group => group.line === contactLine &&
      activeCount(group) > 0 && tacticalGroupCapabilities(group).has('melee')),
    prepareVolleyApplied: false,
  });
}

export function applyTacticalPlaybackEvent(
  battle: TacticalBattle,
  playbackEvent: TacticalAnimationEvent,
): void {
  if (playbackEvent.kind !== 'advance' || playbackEvent.side !== 'raider') return;
  const actorGroupIds = playbackEvent.actorGroupIds;
  if (!actorGroupIds || actorGroupIds.length === 0) return;
  const movingGroupIds = new Set(actorGroupIds);
  let moved = false;
  for (const attacker of battle.raiderGroups) {
    if (!movingGroupIds.has(attacker.id) || !attacker.pendingZoneId) continue;
    attacker.zoneId = attacker.pendingZoneId;
    attacker.pendingZoneId = undefined;
    attacker.engagementsInZone = 0;
    attacker.rearAssault = attacker.kind === 'flankers' &&
      attacker.flankPlan === 'rearAssault' && attacker.zoneId === 'wall';
    moved = true;
  }
  if (moved) normalizeTacticalGroupTargets(battle);
}

export function tacticalRaiderVisibleDuringPlayback(
  battle: TacticalBattle,
  attacker: TacticalRaiderGroup,
  eventIndex: number,
): boolean {
  if (attacker.rearAssault) {
    if (battle.phase !== 'simulating') {
      if (attacker.engagementsInZone <= 0) return false;
    } else {
      const revealIndex = battle.pendingReport?.events.findIndex(playbackEvent =>
        playbackEvent.kind === 'rearAssault' && playbackEvent.groupId === attacker.id) ?? -1;
      if (revealIndex >= 0) {
        if (eventIndex < revealIndex) return false;
      } else if (attacker.engagementsInZone <= 0) return false;
    }
  }
  if (attacker.intent !== 'withdraw') return true;
  if (battle.phase !== 'simulating' || !battle.pendingReport) return false;
  const departureIndex = battle.pendingReport.events.findIndex(playbackEvent =>
    playbackEvent.groupId === attacker.id &&
    (playbackEvent.kind === 'retreat' || playbackEvent.kind === 'moraleBreak' ||
      playbackEvent.kind === 'leaderEscape'));
  return departureIndex >= 0 && eventIndex <= departureIndex;
}

export function chooseAutomaticRaiderTarget(
  battle: TacticalBattle,
  attacker: TacticalRaiderGroup,
): string | undefined {
  if (!activeRaider(attacker)) return undefined;
  const candidates = battle.defenderGroups.filter(group =>
    group.zoneId === attacker.zoneId && activeCount(group) > 0 &&
    raiderTargetingResult(battle, attacker, group).allowed);
  if (candidates.length === 0) return undefined;
  const pick = (predicate: (group: TacticalDefenderGroup) => boolean): TacticalDefenderGroup | undefined =>
    [...candidates.filter(predicate)].sort((a, b) => a.power - b.power)[0];
  const ranged = (group: TacticalDefenderGroup) => tacticalGroupCapabilities(group).has('volley');
  const melee = (group: TacticalDefenderGroup) => tacticalGroupCapabilities(group).has('melee');
  if (attacker.rearAssault) {
    return (pick(group => group.line === 'rear' && group.kind === 'healer')
      ?? pick(group => group.line === 'rear' && ranged(group))
      ?? pick(group => group.line === 'rear' && group.commandable === false)
      ?? pick(group => group.command === 'reinforceRear')
      ?? pick(group => group.line === 'rear')
      ?? candidates[0])?.id;
  }
  if (attacker.kind === 'looters' || attacker.intent === 'loot') {
    return (pick(group => group.command === 'guardStorehouse') ?? pick(() => true))?.id;
  }
  if (tacticalTargetingRole(attacker) !== 'melee') {
    return (pick(group => group.weapon === 'musket')
      ?? pick(ranged)
      ?? pick(group => group.commandable === false)
      ?? pick(() => true))?.id;
  }
  return (pick(group => melee(group)) ?? pick(() => true))?.id;
}

export function normalizeTacticalGroupTargets(battle: TacticalBattle): void {
  for (const defender of battle.defenderGroups) {
    if (defender.targetSource === 'player' && defender.targetGroupId &&
        tacticalGroupTargetUnavailableReason(battle, defender.id, defender.targetGroupId) == null) continue;
    defender.targetSource = 'auto';
    defender.targetGroupId = chooseAutomaticDefenderTarget(battle, defender);
  }
  for (const attacker of battle.raiderGroups) {
    attacker.targetSource = 'ai';
    attacker.targetGroupId = chooseAutomaticRaiderTarget(battle, attacker);
  }
  for (const zone of battle.zones) {
    zone.focusTargetGroupId = undefined;
    zone.focusTargetSource = undefined;
  }
}

/** @deprecated v8 zone focus is read only during save migration. */
export const normalizeTacticalFocusTargets = normalizeTacticalGroupTargets;

function snapshotGroup(
  state: GameState,
  snapshots: CombatantSnapshot[],
  role: CombatRole,
  weapon: TacticalDefenderGroup['weapon'],
  zoneId: string,
): TacticalDefenderGroup {
  const kind = kindForCombatant(role, weapon);
  const special = snapshots[0]?.special;
  const origin = snapshots[0]?.origin;
  const mount = snapshots[0]?.mount;
  const featuredResidents = tacticalFeaturedResidentsFromSnapshots(state, snapshots);
  const originKey = origin ? `-${origin}` : '';
  const mountKey = mount ? `-${mount}` : '';
  const specialKey = special ? `-${special}` : '';
  return {
    id: `${role}-${weapon ?? 'unarmed'}${originKey}${mountKey}${specialKey}`,
    kind,
    role,
    ...(special ? { special } : {}),
    ...(origin ? { origin } : {}),
    ...(mount ? { mount } : {}),
    weapon,
    readyMuskets: snapshots.filter(snapshot => snapshot.readyWeapon === 'musket').length,
    label: special === 'jurchenWarrior'
      ? `귀순 무사 ${combatGroupLabel(role, weapon)}`
      : `${mount ? '기마 ' : ''}${origin ? `${origin} 출신 ` : ''}${combatGroupLabel(role, weapon)}`,
    baseLabel: `${mount ? '기마 ' : ''}${origin ? `${origin} 출신 ` : ''}${combatGroupLabel(role, weapon)}`,
    ...(featuredResidents.length > 0 ? { featuredResidents } : {}),
    residentIds: snapshots.map(snapshot => snapshot.residentId),
    count: snapshots.length,
    zoneId,
    command: null,
    power: snapshots.reduce((sum, snapshot) => sum + snapshot.basePower + snapshot.weaponPower, 0),
    wounded: 0,
    killed: 0,
    line: defaultFormationLine(role, weapon),
    facing: 'towardEnemy',
    ambushed: false,
    commandable: role === 'healer' ? false : undefined,
  };
}

function groupsFromSnapshots(state: GameState, snapshots: CombatantSnapshot[], assault = false): TacticalDefenderGroup[] {
  const grouped = new Map<string, CombatantSnapshot[]>();
  for (const snapshot of snapshots) {
    const key = `${snapshot.role}:${snapshot.assignedWeapon ?? 'unarmed'}:${snapshot.origin ?? 'local'}:${snapshot.mount ?? 'foot'}:${snapshot.special ?? 'common'}`;
    const list = grouped.get(key) ?? [];
    list.push(snapshot);
    grouped.set(key, list);
  }
  return [...grouped.values()].map(items => {
    const { role, assignedWeapon } = items[0];
    const zoneId = assault ? 'lairTrail' : role === 'hunter' ? 'approach' : 'wall';
    return snapshotGroup(state, items, role, assignedWeapon, zoneId);
  });
}

function defenderGroups(state: GameState, mode: TacticalBattle['mode']): TacticalDefenderGroup[] {
  const roster = createCombatRoster(state, { context: 'villageDefense', includeCivilians: true });
  const result = groupsFromSnapshots(state, roster.combatants);
  if (countBuilt(state, 'garrison') > 0) {
    for (const group of result) group.power *= 1.3;
  }
  const levyCount = mode === 'levy' ? Math.ceil(roster.civilians.length * 0.65) : 0;
  const levyIds = roster.civilians.slice(0, levyCount);
  if (levyIds.length > 0) {
    result.push({
      id: 'militia-unarmed-levy', kind: 'militia-unarmed', role: 'militia', weapon: null,
      readyMuskets: 0, label: '소집 민병', residentIds: levyIds, count: levyIds.length,
      zoneId: 'storehouse', command: null,
      power: levyIds.length * GROUP_POWER['militia-unarmed'], wounded: 0, killed: 0,
      line: 'front', facing: 'towardEnemy', ambushed: false,
    });
  }

  const used = new Set([...roster.combatants.map(item => item.residentId), ...levyIds]);
  const away = new Set([...(state.expedition?.memberIds ?? []), ...activePredatorScoutIds(state)]);
  const civilianIds = state.residents
    .filter(resident => resident.alive && !away.has(resident.id) && !used.has(resident.id))
    .map(resident => resident.id);
  if (civilianIds.length > 0) {
    result.push({
      id: 'civilian-unarmed', kind: 'civilian', role: 'civilian', weapon: null,
      readyMuskets: 0, label: GROUP_LABELS.civilian, residentIds: civilianIds, count: civilianIds.length,
      zoneId: 'center', command: null, power: 0,
      wounded: 0, killed: 0, line: 'rear', facing: 'towardEnemy', ambushed: false,
      commandable: false, lockedZoneId: 'center',
    });
  }
  return attachFeaturedResidentsToTacticalGroups(result);
}

function preparationPoints(state: GameState, warned: boolean): number {
  const prep = CONFIG.tacticalBattle.prep;
  let points = warned ? prep.warned : prep.surpriseBase;
  points += countBuilt(state, 'beacon') > 0 ? prep.beacon : 0;
  points += Math.min(prep.watchtowerMax, countBuilt(state, 'watchtower'));
  const watchmen = createCombatRoster(state, { context: 'villageDefense' }).combatants
    .filter(combatant => combatant.role === 'watchman').length;
  points += Math.min(prep.watchmenMax, Math.floor(watchmen / prep.watchmenPerPoint));
  if (state.weather === 'blizzard' || state.weather === 'coldSnap') points -= prep.severeWeatherPenalty;
  return clamp(points, 0, prep.max);
}

function createZones(state: GameState, siege: boolean, groups: TacticalDefenderGroup[]): TacticalBattleZone[] {
  const hasHunters = groups.some(candidate => candidate.role === 'hunter');
  const wallStrength =
    countBuilt(state, 'palisade') * 4 +
    countBuilt(state, 'earthFort') * 7 +
    countBuilt(state, 'stoneWall') * 10 +
    countBuilt(state, 'gate') * 8 +
    countBuilt(state, 'watchtower') * 3;
  const wallName = countBuilt(state, 'gate') > 0
    ? '성문 방어선'
    : wallStrength > 0 ? '목책 방어선' : '마을 방어선';
  const stores = countBuilt(state, 'storehouse');
  return [
    {
      id: 'approach', name: hasHunters ? '북쪽 숲길' : '접근로', kind: 'approach', order: 0,
      pressure: 0, breached: false, defenseBonus: 0, ambushBonus: hasHunters ? 5 : 0,
      lootRisk: 0, civilianRisk: 5,
      description: hasHunters
        ? '숲과 낮은 구릉이 이어져 사냥꾼의 매복에 알맞습니다.'
        : '적의 선두가 마을 방어선을 향해 밀려오는 길입니다.',
    },
    {
      id: 'wall', name: wallName, kind: 'wall', order: 1,
      pressure: siege ? 12 : 0, breached: false,
      defenseBonus: Math.min(35, wallStrength + (siege ? 5 : 0)), ambushBonus: 0,
      lootRisk: 5, civilianRisk: 10,
      description: wallStrength > 0
        ? '방책과 성문을 사이에 두고 적의 주력을 받아내는 구역입니다.'
        : '수비병이 급히 장애물을 세우고 마을 어귀를 지키는 구역입니다.',
    },
    {
      id: 'storehouse', name: '창고 주변', kind: 'storehouse', order: 2,
      pressure: 0, breached: false, defenseBonus: Math.min(10, stores * 2), ambushBonus: 0,
      lootRisk: Math.min(70, 35 + stores * 7), civilianRisk: 30,
      description: stores > 1
        ? '여러 창고와 작업장 비축분이 몰려 있어 약탈조가 노리는 곳입니다.'
        : '식량과 땔감 비축을 지켜야 하는 안쪽 방어 구역입니다.',
    },
    {
      id: 'center', name: '마을 중심지', kind: 'center', order: 3,
      pressure: 0, breached: false, defenseBonus: countBuilt(state, 'office') > 0 ? 6 : 2,
      ambushBonus: 0, lootRisk: 20, civilianRisk: 55,
      description: '대피한 주민이 모인 최후 방어선입니다. 이곳이 뚫리면 마을이 무너집니다.',
    },
  ];
}

function raiderGroups(
  factionName: string,
  power: number,
  visibility: { scoutsReady: boolean; deepScouted: boolean },
  enemyPlan: EnemyPlan,
): TacticalRaiderGroup[] {
  const flankPlan = flankPlanFromEnemyPlan(enemyPlan);
  const flankPlanRevealed = flankPlanRevealedFromEnemyPlan(enemyPlan);
  type Visibility = 'open' | 'scouts' | 'deep';
  type Composition = {
    id: string;
    kind: TacticalRaiderGroup['kind'];
    unitType?: RaiderUnitType;
    label: string;
    weight: number;
    morale: number;
    intent: TacticalRaiderGroup['intent'];
    visibility: Visibility;
    combatMultiplier?: number;
    lossResistance?: number;
    wallPressureBonus?: number;
  };
  const split = enemyObjectiveProfile(enemyPlan.objective).raiderSplit;
  let composition: Composition[];
  const template = tacticalCompositionTemplate(enemyPlan.compositionTemplateId);
  if (template) {
    const traits = (unitType: RaiderUnitType) => {
      switch (unitType) {
        case 'nimacha-hunter': return { morale: 77 };
        case 'nimacha-spearman': return { morale: 74, combatMultiplier: 1.05 };
        case 'nimacha-looter': return { morale: 69 };
        case 'holaon-lancer': return { morale: 82, combatMultiplier: 1.08, lossResistance: 0.94 };
        case 'holaon-horse-archer': return { morale: 80, combatMultiplier: 1.1, lossResistance: 0.92 };
        case 'holaon-raider': return { morale: 74, combatMultiplier: 1.05 };
        case 'bandit-vanguard': return { morale: 76 };
        case 'bandit-rider': return { morale: 72, combatMultiplier: 1.04 };
        case 'bandit-looter': return { morale: 67 };
        case 'court-gunner': return { morale: 94, combatMultiplier: 1.18, lossResistance: 0.76 };
        case 'court-archer': return { morale: 90, combatMultiplier: 1.07, lossResistance: 0.84 };
        case 'court-melee': return { morale: 93, combatMultiplier: 1.12, lossResistance: 0.78 };
        case 'court-cavalry': return { morale: 95, combatMultiplier: 1.2, lossResistance: 0.72 };
        case 'court-artillery': return { morale: 88, combatMultiplier: 1.24, lossResistance: 0.8 };
        case 'court-hwacha': return { morale: 89, combatMultiplier: 1.1, lossResistance: 0.82 };
        case 'court-medic': return { morale: 91, combatMultiplier: 1, lossResistance: 0.88 };
        default: return { morale: factionName === '조정 토벌군' ? 90 : 74 };
      }
    };
    composition = template.slots.map((templateSlot, index) => {
      const unitType = templateSlot.candidates[0].unitType;
      const profile = tacticalUnitProfile(unitType);
      const intent: TacticalRaiderGroup['intent'] = profile.tags.includes('siege')
        ? 'breakWall'
        : templateSlot.role === 'looters' ? 'loot' : templateSlot.role === 'flankers' ? 'flank' : 'advance';
      const visibility: Visibility = factionName === '조정 토벌군' || templateSlot.role === 'main'
        ? 'open'
        : templateSlot.role === 'looters' ? 'scouts' : 'deep';
      return {
        id: `${template.id}-${index + 1}`,
        kind: templateSlot.role,
        unitType,
        label: profile.label,
        weight: (templateSlot.powerShare[0] + templateSlot.powerShare[1]) / 2,
        intent,
        visibility,
        ...traits(unitType),
      };
    });
  } else if (factionName === '니마차 우디캐') {
    composition = [
      { id: 'nimacha-hunters', kind: 'main', unitType: 'nimacha-hunter', label: '숲 사냥꾼 선봉', weight: split.main, morale: 77, intent: 'advance', visibility: 'open' },
      { id: 'nimacha-looters', kind: 'looters', unitType: 'nimacha-looter', label: '니마차 노획조', weight: split.looters, morale: 69, intent: 'loot', visibility: 'scouts' },
      { id: 'nimacha-spears', kind: 'flankers', unitType: 'nimacha-spearman', label: '창잡이 우회대', weight: split.flankers, morale: 74, intent: 'flank', visibility: 'deep', combatMultiplier: 1.05 },
    ];
  } else if (factionName === '홀라온 야인') {
    composition = [
      { id: 'holaon-lancers', kind: 'main', unitType: 'holaon-lancer', label: '기마 선봉', weight: split.main, morale: 82, intent: 'advance', visibility: 'open', combatMultiplier: 1.08, lossResistance: 0.94 },
      { id: 'holaon-raiders', kind: 'looters', unitType: 'holaon-raider', label: '약탈 기병', weight: split.looters, morale: 74, intent: 'loot', visibility: 'scouts', combatMultiplier: 1.05 },
      { id: 'holaon-archers', kind: 'flankers', unitType: 'holaon-horse-archer', label: '기마 궁수', weight: split.flankers, morale: 80, intent: 'flank', visibility: 'deep', combatMultiplier: 1.1, lossResistance: 0.92 },
    ];
  } else if (factionName === '변경 마적') {
    composition = [
      { id: 'bandit-vanguard', kind: 'main', unitType: 'bandit-vanguard', label: '두목 친위대', weight: split.main, morale: 76, intent: 'advance', visibility: 'open' },
      { id: 'bandit-looters', kind: 'looters', unitType: 'bandit-looter', label: '약탈패', weight: split.looters, morale: 67, intent: 'loot', visibility: 'scouts' },
      { id: 'bandit-riders', kind: 'flankers', unitType: 'bandit-rider', label: '기마 마적', weight: split.flankers, morale: 72, intent: 'flank', visibility: 'deep', combatMultiplier: 1.04 },
    ];
  } else if (factionName === '조정 토벌군') {
    composition = [
      { id: 'court-gunners', kind: 'main', unitType: 'court-gunner', label: '훈련도감 포수', weight: 0.28, morale: 94, intent: 'advance', visibility: 'open', combatMultiplier: 1.18, lossResistance: 0.76 },
      { id: 'court-archers', kind: 'main', unitType: 'court-archer', label: '훈련도감 사수', weight: 0.14, morale: 90, intent: 'advance', visibility: 'open', combatMultiplier: 1.07, lossResistance: 0.84 },
      { id: 'court-melee', kind: 'main', unitType: 'court-melee', label: '훈련도감 살수', weight: 0.24, morale: 93, intent: 'advance', visibility: 'open', combatMultiplier: 1.12, lossResistance: 0.78 },
      { id: 'court-cavalry', kind: 'flankers', unitType: 'court-cavalry', label: '관군 기병', weight: 0.19, morale: 95, intent: 'flank', visibility: 'open', combatMultiplier: 1.2, lossResistance: 0.72 },
      { id: 'court-artillery', kind: 'main', unitType: 'court-artillery', label: '화포대', weight: 0.15, morale: 88, intent: 'breakWall', visibility: 'open', combatMultiplier: 1.24, lossResistance: 0.8 },
    ];
  } else {
    composition = [
      { id: 'raider-main', kind: 'main', label: '적 주력', weight: split.main, morale: 75, intent: 'advance', visibility: 'open' },
      { id: 'raider-looters', kind: 'looters', label: '약탈조', weight: split.looters, morale: 68, intent: 'loot', visibility: 'scouts' },
      { id: 'raider-flankers', kind: 'flankers', label: '우회조', weight: split.flankers, morale: 70, intent: 'flank', visibility: 'deep' },
    ];
  }

  const preserveNorthernMissionBudget = factionName === '니마차 우디캐' ||
    factionName === '홀라온 야인' || factionName === '변경 마적';
  if (preserveNorthernMissionBudget || enemyPlan.objective !== 'breakthrough') {
    const kinds: readonly TacticalRaiderGroup['kind'][] = ['main', 'looters', 'flankers'];
    const baseTotals = Object.fromEntries(kinds.map(kind => [
      kind,
      composition.reduce((sum, entry) => sum + (entry.kind === kind ? entry.weight : 0), 0),
    ])) as Record<TacticalRaiderGroup['kind'], number>;
    const availableTargetTotal = kinds.reduce(
      (sum, kind) => sum + (baseTotals[kind] > 0 ? split[kind] : 0),
      0,
    );
    composition = composition.map(entry => ({
      ...entry,
      weight: baseTotals[entry.kind] > 0 && availableTargetTotal > 0
        ? entry.weight / baseTotals[entry.kind] * split[entry.kind] / availableTargetTotal
        : entry.weight,
    }));
  }

  const distribute = (total: number): number[] => {
    const minimumTotal = Math.max(composition.length, total);
    const remaining = minimumTotal - composition.length;
    const weightTotal = composition.reduce((sum, entry) => sum + entry.weight, 0);
    const raw = composition.map(entry => remaining * entry.weight / weightTotal);
    const values = raw.map(value => 1 + Math.floor(value));
    let leftover = minimumTotal - values.reduce((sum, value) => sum + value, 0);
    raw.map((value, index) => ({ index, fraction: value - Math.floor(value) }))
      .sort((a, b) => b.fraction - a.fraction)
      .forEach(entry => {
        if (leftover <= 0) return;
        values[entry.index] += 1;
        leftover -= 1;
      });
    return values;
  };
  const powers = distribute(power);
  const totalCount = Math.max(composition.length, Math.round(power / CONFIG.tacticalBattle.raiderPowerPerFighter));
  const counts = distribute(totalCount);
  const visible = (requiredVisibility: Visibility) => requiredVisibility === 'open' ||
    (requiredVisibility === 'scouts' ? visibility.scoutsReady : visibility.deepScouted);

  return composition.map((entry, index) => ({
    id: entry.id,
    kind: entry.kind,
    unitType: entry.unitType,
    label: entry.label,
    zoneId: 'approach',
    line: defaultRaiderFormationLine(entry.unitType),
    targetZoneId: entry.kind === 'looters'
      ? 'storehouse'
      : entry.kind === 'flankers' ? (flankPlan === 'rearAssault' ? 'wall' : 'center') : 'wall',
    power: powers[index],
    maximumPower: powers[index],
    estimatedPower: enemyPlanStratagemScale(enemyPlan, 'feint') > 0 && entry.kind === 'main'
      ? powers[index] * CONFIG.tacticalBattle.enemyPlan.effects.feint.estimatedMainMultiplier
      : undefined,
    count: counts[index],
    killed: 0,
    morale: entry.morale,
    intent: entry.intent,
    revealed: visible(entry.visibility),
    combatMultiplier: entry.combatMultiplier,
    lossResistance: entry.lossResistance,
    wallPressureBonus: entry.wallPressureBonus,
    engagementsInZone: 0,
    flankPlan: entry.kind === 'flankers' ? flankPlan : undefined,
    flankPlanRevealed: entry.kind === 'flankers' ? flankPlanRevealed : undefined,
    rearAssault: false,
    supportState: createTacticalRaiderSupportState(entry.unitType, 'approach'),
  }));
}

export function createTacticalBattle(
  state: GameState,
  params: {
    factionName: string;
    power: number;
    warned: boolean;
    siege: boolean;
    mode: 'garrison' | 'levy';
    forcedDoctrine?: EnemyDoctrineId;
    forcedCompositionTemplateId?: string;
    forcedFlankRoute?: TacticalRouteSide | 'none';
    maximumCompositionPhase?: 1 | 2 | 8;
  },
): TacticalBattle {
  const groups = defenderGroups(state, params.mode);
  const watchmen = groups.filter(candidate => candidate.role === 'watchman').reduce((sum, group) => sum + group.count, 0);
  const hunters = groups.filter(candidate => candidate.role === 'hunter').reduce((sum, group) => sum + group.count, 0);
  const originalPower = params.factionName === '조정 토벌군'
    ? Math.max(120, Math.round(params.power))
    : Math.max(3, Math.round(params.power));
  const watchtowers = countBuilt(state, 'watchtower');
  const intelLevel = enemyIntelLevel({ watchtowers, watchmen, hunters });
  const scoutsReady = intelLevel >= 2;
  const deepScouted = intelLevel >= 3;
  const planRng = makeRng(state.seed + state.day * 4099 + state.subTick * 131 + originalPower);
  const flankRoll = planRng();
  const objectiveRoll = planRng();
  const stratagemRoll = planRng();
  const intelRoll = planRng();
  const doctrineRoll = planRng();
  const compositionRoll = planRng();
  const enemyPlan = createEnemyPlan({
    factionName: params.factionName,
    power: originalPower,
    relation: state.relations[params.factionName] ?? 50,
    flankRoll,
    objectiveRoll,
    stratagemRoll,
    intelLevel,
    intelRoll,
    doctrineRoll,
    compositionRoll,
    forcedDoctrine: params.forcedDoctrine,
    forcedCompositionTemplateId: params.forcedCompositionTemplateId,
    forcedFlankRoute: params.forcedFlankRoute,
    maximumCompositionPhase: params.maximumCompositionPhase ?? 8,
    revealed: false,
  });
  const enemies = raiderGroups(params.factionName, originalPower, { scoutsReady, deepScouted }, enemyPlan);
  const flankRoutes = createTacticalFlankRoutes(enemyPlan);
  const battle: TacticalBattle = {
    encounterKind: 'raidDefense',
    id: state.day * 1000 + state.subTick * 10 + (params.mode === 'levy' ? 2 : 1),
    factionName: params.factionName,
    warned: params.warned,
    siege: params.siege,
    originalPower,
    initialFriendlyPower: groups.reduce((sum, group) => sum + group.power, 0),
    initialEnemyPower: enemies.reduce((sum, group) => sum + group.power, 0),
    phase: 'preparation',
    round: 1,
    prepPoints: Math.max(0, preparationPoints(state, params.warned) - enemyPlanPreparationPenalty(enemyPlan)),
    prepActions: PREPARATION_ACTIONS.map(action => ({ ...action, selected: false, applied: false })),
    preparationEvents: [],
    zones: createZones(state, params.siege, groups),
    flankRoutes,
    defenderGroups: groups,
    raiderGroups: enemies,
    enemyPlan,
    currentZoneId: 'approach',
    villageMorale: clamp(
      CONFIG.tacticalBattle.morale.village +
      (params.warned ? CONFIG.tacticalBattle.morale.warnedBonus : 0) +
      (params.siege ? CONFIG.tacticalBattle.morale.siegeBonus : 0),
      0,
      100,
    ),
    raiderMorale: params.factionName === '조정 토벌군'
      ? 92
      : CONFIG.tacticalBattle.morale.raiders,
    reports: [],
    pendingReport: null,
    mode: params.mode,
    resourceSnapshot: captureTacticalResources(state),
  };
  initializeEnemyTacticalRouteTransit(battle, state.weather);
  syncTacticalRouteVisibility(battle);
  initializeTacticalDeployment(battle);
  state.tacticalBattle = battle;
  state.battle = null;
  state.pendingChoice = null;
  addLog(state, `${params.factionName}의 습격에 맞서 직접 방어 지휘를 시작합니다.`, 'raid', true);
  for (const warning of enemyPlanWarningLines(enemyPlan)) addLog(state, `적의 계책 징후: ${warning}`, 'raid');
  return battle;
}

export function spendPreparationAction(state: GameState, actionId: PreparationActionId): string | null {
  const battle = state.tacticalBattle;
  if (!battle) return '진행 중인 직접 지휘 전투가 없습니다.';
  if (battle.assaultKind === 'predatorHunt') return spendHuntPreparationAction(state, actionId);
  if (battle.orientation === 'assault') return spendAssaultPreparationAction(state, actionId);
  if (battle.phase !== 'preparation') return '준비 단계가 이미 끝났습니다.';
  if (actionId === 'openFlankRoute') return '열 우회로의 좌·우 방향을 먼저 선택하십시오.';
  const action = battle.prepActions.find(candidate => candidate.id === actionId);
  if (!action) return '알 수 없는 준비 행동입니다.';
  if (action.applied) return '이미 마친 준비입니다.';
  if (action.selected) {
    action.selected = false;
    battle.prepPoints += action.cost;
    return null;
  }
  const unavailableReason = tacticalPreparationUnavailableReason(state, actionId);
  if (unavailableReason) return unavailableReason;
  if (battle.prepPoints < action.cost) return '남은 준비점수가 부족합니다.';

  action.selected = true;
  battle.prepPoints -= action.cost;
  return null;
}

export function tacticalPreparationUnavailableReason(
  state: GameState,
  actionId: PreparationActionId,
): string | null {
  const battle = state.tacticalBattle;
  if (!battle) return '진행 중인 직접 지휘 전투가 없습니다.';
  if (battle.assaultKind === 'predatorHunt') return huntPreparationUnavailableReason(state, actionId);
  if (battle.orientation === 'assault') return assaultPreparationUnavailableReason(state, actionId);
  if (actionId === 'setAmbush' && !battle.defenderGroups.some(group => tacticalGroupCapabilities(group).has('ambush') && group.count > 0)) {
    return '매복시킬 사냥꾼이 없습니다.';
  }
  if (actionId === 'musterMilitia') {
    const civilians = battle.defenderGroups.find(group => group.kind === 'civilian');
    const hasEligibleCivilian = civilians?.residentIds.some(id => {
      const resident = state.residents.find(candidate => candidate.id === id);
      return resident != null && isCombatReadyResident(state, resident, 'villageDefense');
    });
    if (!hasEligibleCivilian) return '추가로 소집할 전투 가능한 주민이 없습니다.';
  }
  if (actionId === 'preliminaryBombardment') {
    if (countBuilt(state, 'cannonEmplacement') <= 0) return '완성된 불랑기포대가 없습니다.';
    if (state.resources.gunpowder < CONFIG.raid.powderPerCannon) return '포격에 쓸 화약이 부족합니다.';
  }
  if (actionId === 'openFlankRoute') return '열 우회로의 좌·우 방향을 먼저 선택하십시오.';
  return null;
}

function applyPreliminaryBombardment(
  state: GameState,
  battle: TacticalBattle,
): Array<{ groupId: string; casualties: number }> {
  const builtCannons = countBuilt(state, 'cannonEmplacement');
  const powderPerCannon = CONFIG.raid.powderPerCannon;
  const firingCannons = Math.min(builtCannons, Math.floor(state.resources.gunpowder / powderPerCannon));
  if (firingCannons <= 0) return [];

  state.resources.gunpowder -= firingCannons * powderPerCannon;
  const activeRaiders = battle.raiderGroups.reduce(
    (sum, group) => sum + Math.max(0, group.count - group.killed), 0,
  );
  // 포대마다 남은 적의 6%를 추가로 제압한다. 수가 늘수록 계속 강해지되 완만하게 누적된다.
  const lossRate = 1 - Math.pow(0.94, firingCannons);
  let casualtiesLeft = Math.min(activeRaiders, Math.max(1, Math.round(activeRaiders * lossRate)));
  let raidersLeft = activeRaiders;
  const casualtyGroups: Array<{ groupId: string; casualties: number }> = [];
  for (const group of battle.raiderGroups) {
    const active = Math.max(0, group.count - group.killed);
    const casualties = raidersLeft <= 0
      ? 0
      : Math.min(active, Math.round(casualtiesLeft * active / raidersLeft));
    group.killed += casualties;
    group.revealed = true;
    if (casualties > 0) casualtyGroups.push({ groupId: group.id, casualties });
    group.power = Math.max(0, group.power * (1 - lossRate));
    group.morale = Math.max(0, group.morale - (4 + firingCannons * 2));
    casualtiesLeft -= casualties;
    raidersLeft -= active;
  }
  const casualties = activeRaiders - battle.raiderGroups.reduce(
    (sum, group) => sum + Math.max(0, group.count - group.killed), 0,
  );
  battle.preliminaryBombardmentCannons = firingCannons;
  battle.preliminaryBombardmentCasualties = casualties;
  battle.raiderMorale = Math.max(0, battle.raiderMorale - (4 + firingCannons * 2));
  addLog(
    state,
    `불랑기포 ${firingCannons}문이 사전포격을 가해 적 ${casualties}명을 쓰러뜨렸습니다.`,
    'raid',
  );
  return casualtyGroups;
}

function preparationEvent(
  events: TacticalAnimationEvent[],
  zoneId: string,
  kind: TacticalAnimationEvent['kind'],
  text: string,
  durationMs: number,
  extra?: Pick<TacticalAnimationEvent, 'side' | 'groupId' | 'actorGroupIds' | 'casualties' | 'float' | 'shots' | 'meleeParticipants'>,
): void {
  events.push({ zoneId, kind, text, durationMs, ...extra });
}

function applyEnemyPlanPreparationEffects(battle: TacticalBattle): void {
  const scale = enemyPlanStratagemScale(battle.enemyPlan, 'wallBreakers');
  if (scale <= 0) return;
  if (battle.raiderGroups.some(group => group.unitType === 'wall-breaker')) return;
  const main = battle.raiderGroups
    .filter(group => group.kind === 'main' && group.unitType !== 'court-artillery' && group.count > 1)
    .sort((left, right) => right.power - left.power || left.id.localeCompare(right.id))[0];
  if (!main) return;
  const effect = CONFIG.tacticalBattle.enemyPlan.effects.wallBreakers;
  const movedCount = Math.max(1, Math.min(main.count - 1, Math.round(main.count * effect.powerShare)));
  const movedPower = main.power * effect.powerShare;
  main.count -= movedCount;
  main.power -= movedPower;
  const stratagem = battle.enemyPlan?.stratagems.find(candidate => candidate.id === 'wallBreakers');
  battle.raiderGroups.push({
    id: `${main.id}-wall-breakers`,
    kind: 'main',
    unitType: 'wall-breaker',
    label: battle.factionName === '조정 토벌군' ? '파책 살수조' : '방책 파괴조',
    zoneId: main.zoneId,
    line: 'front',
    targetZoneId: 'wall',
    power: movedPower,
    count: movedCount,
    killed: 0,
    morale: main.morale,
    intent: 'breakWall',
    revealed: stratagem?.revealed === true,
    combatMultiplier: 0.82,
    lossResistance: 1,
    engagementsInZone: 0,
    rearAssault: false,
  });
}

function applySelectedPreparationActions(state: GameState, battle: TacticalBattle): TacticalAnimationEvent[] {
  const zone = (id: string) => battle.zones.find(candidate => candidate.id === id)!;
  const events: TacticalAnimationEvent[] = [];
  for (const action of battle.prepActions) {
    if (!action.selected || action.applied) continue;
    const actionId = action.id;

    if (actionId === 'evacuateCivilians') {
      zone('storehouse').civilianRisk = Math.max(0, zone('storehouse').civilianRisk - 18);
      zone('center').civilianRisk = Math.max(0, zone('center').civilianRisk - 25);
      battle.villageMorale = Math.min(100, battle.villageMorale + 5);
      const civilians = battle.defenderGroups.find(group => group.kind === 'civilian');
      preparationEvent(
        events, 'center', 'evacuate',
        '피난 주민들이 전선 뒤편의 안전한 곳으로 몸을 피합니다.', 1050,
        { side: 'defender', groupId: civilians?.id, float: '주민 대피' },
      );
    } else if (actionId === 'hideSupplies') {
      zone('storehouse').lootRisk = Math.max(5, zone('storehouse').lootRisk - 28);
      preparationEvent(
        events, 'storehouse', 'conceal',
        '창고의 곡물과 땔감을 눈에 띄지 않는 곳으로 나누어 숨깁니다.', 950,
        { side: 'defender', float: '물자 은닉' },
      );
    } else if (actionId === 'repairWall') {
      zone('wall').defenseBonus += battle.siege ? 18 : 12;
      zone('wall').pressure = Math.max(0, zone('wall').pressure - 12);
      preparationEvent(
        events, 'wall', 'fortify',
        '수비병들이 통나무와 밧줄을 덧대어 방책의 약한 곳을 보강합니다.', 1200,
        { side: 'defender', float: '방책 강화' },
      );
    } else if (actionId === 'setAmbush') {
      const hunterGroups = battle.defenderGroups.filter(candidate => tacticalGroupCapabilities(candidate).has('ambush'));
      const hunters = hunterGroups.reduce((sum, candidate) => sum + candidate.count, 0);
      zone('approach').ambushBonus += hunters > 0 ? 28 : 14;
      hunterGroups.forEach(candidate => {
        if (candidate.zoneId === 'approach') candidate.ambushed = true;
      });
      battle.raiderGroups.forEach(candidate => { candidate.revealed = true; });
      preparationEvent(
        events, 'approach', 'prepareAmbush',
        '사냥꾼들이 숲길의 수풀과 바위 뒤로 흩어져 숨습니다.', 1150,
        { side: 'defender', groupId: hunterGroups[0]?.id, float: '매복중' },
      );
    } else if (actionId === 'prepareVolley') {
      const rangedGroup = battle.defenderGroups.find(candidate =>
        candidate.zoneId === 'wall' && tacticalGroupCapabilities(candidate).has('volley'));
      preparationEvent(
        events, 'wall', 'readyVolley',
        '사수들이 시위를 걸고 화승을 살피며 첫 일제사격을 준비합니다.', 1050,
        { side: 'defender', groupId: rangedGroup?.id, float: '사격 준비' },
      );
    } else if (actionId === 'firePrevention') {
      preparationEvent(
        events, 'wall', 'fortify',
        '물통과 젖은 가죽을 방책과 창고 곁에 배치해 불화살에 대비합니다.', 900,
        { side: 'defender', float: '화재 대비' },
      );
    } else if (actionId === 'torchWatch') {
      preparationEvent(
        events, 'approach', 'fortify',
        '횃불 경계조가 어둠 속 접근로를 번갈아 비추며 야습을 감시합니다.', 900,
        { side: 'defender', float: '횃불 경계' },
      );
    } else if (actionId === 'preliminaryBombardment') {
      const casualtyGroups = applyPreliminaryBombardment(state, battle);
      const cannons = battle.preliminaryBombardmentCannons ?? 0;
      preparationEvent(
        events, 'approach', 'bombardment',
        `불랑기포 ${cannons}문이 불을 뿜고 포탄이 적의 대열 한복판에 떨어집니다.`, 1350,
        { side: 'raider', float: '사전포격!', shots: { cannons } },
      );
      for (const casualty of casualtyGroups) {
        preparationEvent(
          events, 'approach', 'casualty',
          `포격에 휘말린 적 ${casualty.casualties}명이 쓰러집니다.`, 720,
          { side: 'raider', groupId: casualty.groupId, casualties: casualty.casualties, float: `-${casualty.casualties}명` },
        );
      }
    } else if (actionId === 'musterMilitia') {
      const civilians = battle.defenderGroups.find(candidate => candidate.kind === 'civilian');
      if (!civilians || civilians.residentIds.length === 0) continue;
      const eligibleIds = civilians.residentIds.filter(id => {
        const resident = state.residents.find(candidate => candidate.id === id);
        return resident != null && isCombatReadyResident(state, resident, 'villageDefense');
      });
      if (eligibleIds.length === 0) continue;
      const musterCount = Math.max(1, Math.ceil(eligibleIds.length / 2));
      const musteredIds = eligibleIds.slice(0, musterCount);
      const musteredSet = new Set(musteredIds);
      civilians.residentIds = civilians.residentIds.filter(id => !musteredSet.has(id));
      civilians.count = civilians.residentIds.length;
      civilians.power = 0;
      let militia = battle.defenderGroups.find(candidate => candidate.id === 'militia-unarmed-mustered');
      let createdMilitia = false;
      if (!militia) {
        militia = {
          id: 'militia-unarmed-mustered', kind: 'militia-unarmed', label: '긴급 소집 민병',
          role: 'militia', weapon: null, readyMuskets: 0,
          residentIds: [], count: 0, zoneId: 'wall', command: null, power: 0, wounded: 0, killed: 0,
          line: 'front', facing: 'towardEnemy',
        };
        battle.defenderGroups.push(militia);
        createdMilitia = true;
      }
      militia.residentIds.push(...musteredIds);
      militia.count = militia.residentIds.length;
      militia.power = militia.count * GROUP_POWER['militia-unarmed'];
      if (createdMilitia) registerTacticalDeploymentGroup(battle, militia);
      battle.villageMorale = Math.max(0, battle.villageMorale - 3);
      preparationEvent(
        events, 'wall', 'muster',
        `주민 ${musterCount}명이 급히 무기를 들어 긴급 소집 민병 카드로 합류합니다.`, 1200,
        { side: 'defender', float: `${musterCount}명 소집` },
      );
    } else if (actionId === 'openFlankRoute') {
      // 경로는 방향별 토글 시 즉시 열려 배치 UI에 노출된다.
      // 준비 확정은 선택을 잠그고 일반 준비 대응만 적용한다.
      syncTacticalRouteVisibility(battle);
    }

    applyEnemyPlanPreparationCounter(battle.enemyPlan, actionId);
    action.applied = true;
  }
  applyEnemyPlanPreparationEffects(battle);
  const zoneOrder = new Map(battle.zones.map(zone => [zone.id, zone.order]));
  return events
    .map((item, index) => ({ item, index }))
    .sort((a, b) =>
      (zoneOrder.get(a.item.zoneId) ?? 99) - (zoneOrder.get(b.item.zoneId) ?? 99) || a.index - b.index)
    .map(entry => entry.item);
}

export function assignDefenderGroup(state: GameState, groupId: string, zoneId: string): string | null {
  const battle = state.tacticalBattle;
  if (!battle) return '진행 중인 직접 지휘 전투가 없습니다.';
  const defender = battle.defenderGroups.find(candidate => candidate.id === groupId);
  if (!defender) return '수비 그룹을 찾을 수 없습니다.';
  if (battle.phase === 'deployment') {
    const currentLine = battle.deploymentPlacements?.[groupId]?.line ?? defender.line;
    return placeTacticalDeploymentGroup(state, groupId, { zoneId, line: currentLine });
  }
  if (battle.assaultKind === 'predatorHunt' && battle.phase === 'command') {
    return assignHuntGroup(state, groupId, zoneId);
  }
  if (defender.lockedZoneId) return '피난 주민은 마을 중심지에서 이동할 수 없습니다.';
  if (defender.commandable === false && defender.kind !== 'healer') return '이 보호 대상은 다른 구역으로 이동할 수 없습니다.';
  return '배치 단계에서만 병력을 옮길 수 있습니다.';
}

export function tacticalFormationLineUnavailableReason(
  battle: TacticalBattle,
  defender: TacticalDefenderGroup,
  line: TacticalFormationLine,
): string | null {
  if (battle.phase !== 'deployment' && battle.phase !== 'command') {
    return '배치 또는 지휘 단계에서만 전열을 바꿀 수 있습니다.';
  }
  if (defender.kind === 'healer') return line === 'rear' ? null : '전술 치료반은 후열에만 배치할 수 있습니다.';
  if (defender.commandable === false) return '피난 주민은 전열을 바꿀 수 없습니다.';
  const deferredRedeploy = battle.phase === 'command' && battle.assaultKind !== 'predatorHunt';
  if (deferredRedeploy && line !== defender.line &&
      !tacticalFormationLinesAdjacent(defender.line, line)) {
    return '한 라운드에는 인접한 전열로만 재배치할 수 있습니다.';
  }
  return null;
}

export function setDefenderFormationLine(
  state: GameState,
  groupId: string,
  line: TacticalFormationLine,
): string | null {
  const battle = state.tacticalBattle;
  if (!battle) return '진행 중인 직접 지휘 전투가 없습니다.';
  if (line !== 'front' && line !== 'middle' && line !== 'rear') return '알 수 없는 전열입니다.';
  if (battle.phase !== 'deployment' && battle.phase !== 'command') {
    return '배치 또는 지휘 단계에서만 전열을 바꿀 수 있습니다.';
  }
  const defender = battle.defenderGroups.find(candidate => candidate.id === groupId);
  if (!defender) return '수비 그룹을 찾을 수 없습니다.';
  const unavailableReason = tacticalFormationLineUnavailableReason(battle, defender, line);
  if (unavailableReason) return unavailableReason;
  if (battle.phase === 'deployment') {
    const placement = battle.deploymentPlacements?.[groupId];
    if (!placement) {
      defender.line = line;
      return null;
    }
    return placeTacticalDeploymentGroup(state, groupId, { zoneId: placement.zoneId, line });
  }
  const deferredRedeploy = battle.phase === 'command' && battle.assaultKind !== 'predatorHunt';
  if (!deferredRedeploy) {
    defender.line = line;
    defender.pendingLine = undefined;
    return null;
  }
  if (line === defender.line) {
    defender.pendingLine = undefined;
    if (defender.command === 'redeploy') {
      defender.command = 'hold';
      defender.commandSource = 'player';
    }
    return null;
  }
  defender.pendingLine = line;
  defender.command = 'redeploy';
  defender.commandSource = 'player';
  return null;
}

export interface TacticalFacingPreview {
  groupId: string;
  origin: TacticalFacing;
  destination: TacticalFacing;
  /** 방향전환을 해도 유지되는 현재 주 명령. */
  command: TacticalCommandId | null;
  /** 이번 판정에 곱하는 유효 전투력 배율. 배치 단계는 1이다. */
  powerMultiplier: number;
  /** 현재 교전 전력에서 빠지는 비율. 지휘 단계 방향전환은 0.25다. */
  powerPenalty: number;
  currentRoundOnly: boolean;
}

function applyTacticalFacingChange(
  battle: TacticalBattle,
  defender: TacticalDefenderGroup,
  facing: TacticalFacing,
): void {
  if (defender.facing === facing) return;
  defender.facing = facing;
  defender.pendingFacing = battle.phase === 'command' ? facing : undefined;
}

export function tacticalFacingUnavailableReason(
  battle: TacticalBattle,
  groupId: string,
  facing: TacticalFacing,
): string | null {
  if (facing !== 'towardEnemy' && facing !== 'towardRear') return '알 수 없는 부대 방향입니다.';
  if (battle.phase !== 'deployment' && battle.phase !== 'command') {
    return '배치 또는 지휘 단계에서만 부대 방향을 바꿀 수 있습니다.';
  }
  const defender = battle.defenderGroups.find(group => group.id === groupId);
  if (!defender) return '방향을 바꿀 아군 부대를 찾을 수 없습니다.';
  if (defender.commandable === false) return defender.kind === 'healer'
    ? '전술 치료반은 방향전환 명령 대상이 아닙니다.'
    : '피난 주민은 적을 향한 고정 방향을 유지합니다.';
  if (activeCount(defender) <= 0) return '전투 가능한 인원이 남은 부대만 방향을 바꿀 수 있습니다.';
  if (battle.phase === 'deployment' && battle.deploymentPlacements?.[groupId] == null) {
    return '먼저 부대를 전장에 배치하십시오.';
  }
  if (defender.facing === facing) return '이미 이 방향을 향하고 있습니다.';
  return null;
}

export function tacticalFacingPreview(
  battle: TacticalBattle,
  groupId: string,
  facing: TacticalFacing,
): TacticalFacingPreview | null {
  if (tacticalFacingUnavailableReason(battle, groupId, facing)) return null;
  const defender = battle.defenderGroups.find(group => group.id === groupId)!;
  const powerMultiplier = battle.phase === 'command'
    ? CONFIG.tacticalBattle.formationExposure.facing.turnPowerMultiplier
    : 1;
  return {
    groupId,
    origin: defender.facing,
    destination: facing,
    command: defender.command,
    powerMultiplier,
    powerPenalty: 1 - powerMultiplier,
    currentRoundOnly: battle.phase === 'command',
  };
}

export function setTacticalGroupFacing(
  state: GameState,
  groupId: string,
  facing: TacticalFacing,
): string | null {
  const battle = state.tacticalBattle;
  if (!battle) return '진행 중인 직접 지휘 전투가 없습니다.';
  const unavailableReason = tacticalFacingUnavailableReason(battle, groupId, facing);
  if (unavailableReason) return unavailableReason;
  const defender = battle.defenderGroups.find(group => group.id === groupId)!;
  applyTacticalFacingChange(battle, defender, facing);
  normalizeTacticalGroupTargets(battle);
  return null;
}

export interface TacticalStageAnchor {
  zoneId: string;
  line: TacticalFormationLine;
}

export interface TacticalStageOrderPreview {
  groupId: string;
  origin: TacticalStageAnchor;
  destination: TacticalStageAnchor;
  command: Extract<TacticalCommandId, 'redeploy' | 'fallback' | 'advance'> | null;
  /** 현재 교전 전력에서 빠지는 비율. 0.65면 현재 교전에는 전력 35%만 기여한다. */
  powerPenalty: number;
  /** 명령 확정 뒤 목적지가 실제 위치가 되기까지 필요한 교전 수. */
  travelRounds: 0 | 1;
  warning?: string;
}

interface TacticalStageOrderResolution {
  group: TacticalDefenderGroup;
  origin: TacticalStageAnchor;
  command: TacticalStageOrderPreview['command'];
  reason: string | null;
}

function tacticalStageOrderResolution(
  battle: TacticalBattle,
  groupId: string,
  destination: TacticalStageAnchor,
): TacticalStageOrderResolution | null {
  const resolvedGroupId = resolveTacticalDeploymentGroupId(battle, groupId);
  const group = battle.defenderGroups.find(candidate => candidate.id === resolvedGroupId);
  if (!group) return null;
  const origin = { zoneId: group.zoneId, line: group.line };
  if (battle.phase !== 'command') {
    return { group, origin, command: null, reason: '지휘 단계에서만 무대 명령을 내릴 수 있습니다.' };
  }
  if (battle.assaultKind === 'predatorHunt') {
    return { group, origin, command: null, reason: '몰이사냥 길목 이동은 기존 길목 이동 명령을 사용하십시오.' };
  }
  if (group.commandable === false) {
    return { group, origin, command: null, reason: group.kind === 'healer'
      ? '전술 치료반은 무대 명령 대상이 아닙니다.'
      : '피난 주민은 무대 명령 대상이 아닙니다.' };
  }
  if (activeCount(group) <= 0) {
    return { group, origin, command: null, reason: '전투 가능한 부대만 무대에서 이동할 수 있습니다.' };
  }
  if (!battle.zones.some(zone => zone.id === destination.zoneId)) {
    return { group, origin, command: null, reason: '알 수 없는 전투 구역입니다.' };
  }
  if (!FORMATION_LINE_ORDER.includes(destination.line)) {
    return { group, origin, command: null, reason: '알 수 없는 전열입니다.' };
  }
  const zoneChanged = origin.zoneId !== destination.zoneId;
  const lineChanged = origin.line !== destination.line;
  if (!zoneChanged && !lineChanged) return { group, origin, command: null, reason: null };
  if (zoneChanged && lineChanged) {
    return { group, origin, command: null, reason: '한 번의 무대 명령으로 구역과 전열을 함께 바꿀 수 없습니다.' };
  }
  if (lineChanged) {
    const reason = tacticalFormationLineUnavailableReason(battle, group, destination.line);
    return { group, origin, command: 'redeploy', reason };
  }

  const orderedZones = [...battle.zones].sort((left, right) => left.order - right.order);
  const originIndex = orderedZones.findIndex(zone => zone.id === origin.zoneId);
  const destinationIndex = orderedZones.findIndex(zone => zone.id === destination.zoneId);
  if (originIndex < 0 || Math.abs(originIndex - destinationIndex) !== 1) {
    return { group, origin, command: null, reason: '한 라운드에는 인접한 전투 구역으로만 이동할 수 있습니다.' };
  }
  const towardHigherOrder = destinationIndex > originIndex;
  const command = battle.orientation === 'assault'
    ? towardHigherOrder ? 'advance' : 'fallback'
    : towardHigherOrder ? 'fallback' : 'advance';
  return { group, origin, command, reason: tacticalCommandUnavailableReason(battle, group, command) };
}

export function tacticalStageOrderUnavailableReason(
  battle: TacticalBattle,
  groupId: string,
  destination: TacticalStageAnchor,
): string | null {
  const resolution = tacticalStageOrderResolution(battle, groupId, destination);
  return resolution?.reason ?? (resolution ? null : '전술 부대를 찾을 수 없습니다.');
}

export function tacticalStageOrderPreview(
  battle: TacticalBattle,
  groupId: string,
  destination: TacticalStageAnchor,
): TacticalStageOrderPreview | null {
  const resolution = tacticalStageOrderResolution(battle, groupId, destination);
  if (!resolution || resolution.reason) return null;
  const { group, origin, command } = resolution;
  const powerMultiplier = command == null
    ? 1
    : battle.orientation === 'assault'
      ? assaultCommandPowerMultiplier({ ...group, command })
      : tacticalMovementCommandPowerMultiplier(group, command);
  const destinationName = battle.zones.find(zone => zone.id === destination.zoneId)?.name ?? destination.zoneId;
  const warning = command === 'advance' && battle.orientation === 'assault'
    ? `${destinationName} 돌파에 성공하면 이동합니다.`
    : command === 'fallback'
      ? `${withJosa(destinationName, '으로/로')} 물러납니다.`
      : command === 'advance'
        ? `${withJosa(destinationName, '으로/로')} 전진합니다.`
        : command === 'redeploy'
          ? '이번 교전이 끝난 뒤 새 전열을 적용합니다.'
          : undefined;
  return {
    groupId: group.id,
    origin,
    destination: { ...destination },
    command,
    powerPenalty: Math.max(0, Math.min(1, 1 - powerMultiplier)),
    travelRounds: command == null ? 0 : 1,
    ...(warning ? { warning } : {}),
  };
}

export function applyTacticalStageOrder(
  state: GameState,
  groupId: string,
  destination: TacticalStageAnchor,
): string | null {
  const battle = state.tacticalBattle;
  if (!battle) return '진행 중인 직접 지휘 전투가 없습니다.';
  const preview = tacticalStageOrderPreview(battle, groupId, destination);
  if (!preview) return tacticalStageOrderUnavailableReason(battle, groupId, destination);
  if (preview.command == null) return null;
  if (preview.command === 'redeploy') {
    return setDefenderFormationLine(state, preview.groupId, destination.line);
  }
  return setTacticalCommand(state, preview.groupId, preview.command);
}

export function setTacticalCommand(
  state: GameState,
  groupId: string,
  command: TacticalCommandId,
): string | null {
  const battle = state.tacticalBattle;
  if (!battle) return '진행 중인 직접 지휘 전투가 없습니다.';
  const defender = battle.defenderGroups.find(candidate => candidate.id === groupId);
  if (!defender) return '수비 그룹을 찾을 수 없습니다.';
  if (defender.commandable === false) return defender.kind === 'healer'
    ? '전술 치료반은 라운드 종료에 자동으로 부상자를 돌봅니다.'
    : '피난 주민은 전투 명령 대상이 아닙니다.';
  if (battle.assaultKind === 'predatorHunt') return setHuntCommand(state, groupId, command);
  if (battle.orientation === 'assault') {
    const result = setAssaultCommand(state, groupId, command);
    if (!result) normalizeTacticalGroupTargets(battle);
    return result;
  }
  if (battle.phase !== 'command') return '지휘 단계에서만 명령을 내릴 수 있습니다.';
  if (!IMPLEMENTED_COMMANDS.has(command)) return '이 명령은 아직 사용할 수 없습니다.';
  const unavailableReason = tacticalCommandUnavailableReason(battle, defender, command);
  if (unavailableReason) return unavailableReason;
  if (command === 'flankRoute') {
    const result = orderTacticalRouteRaid(state, groupId);
    if (!result) normalizeTacticalGroupTargets(battle);
    return result;
  }
  defender.command = command;
  if (command === 'reinforceRear') applyTacticalFacingChange(battle, defender, 'towardRear');
  if (command !== 'redeploy') defender.pendingLine = undefined;
  defender.commandSource = 'player';
  normalizeTacticalGroupTargets(battle);
  return null;
}

/**
 * @deprecated Runtime command UI uses per-group targets through
 * tacticalGroupTargetUnavailableReason and setTacticalGroupTarget.
 */
export function tacticalFocusTargetUnavailableReason(
  battle: TacticalBattle,
  zoneId: string,
  groupId: string,
): string | null {
  if (battle.assaultKind === 'predatorHunt') return '맹수 사냥에서는 집중 표적을 지정할 수 없습니다.';
  const target = battle.raiderGroups.find(group => group.id === groupId);
  if (!target || target.zoneId !== zoneId || target.intent === 'withdraw' || target.power <= 0 ||
      target.count - target.killed <= 0) return '해당 구역에 유효한 적 표적이 없습니다.';
  if (!target.revealed) return '아직 드러나지 않은 적은 집중 표적으로 지정할 수 없습니다.';
  if (target.rearAssault && !tacticalRearAssaultIsEngaged(target)) {
    return '아직 실제 후방 교전이 시작되지 않은 급습대는 집중 표적으로 지정할 수 없습니다.';
  }
  const direction = tacticalRearAssaultIsEngaged(target) ? 'rear' : 'frontal';
  const attackers = battle.raiderGroups.filter(group =>
    group.zoneId === zoneId &&
    (direction === 'rear' ? tacticalRearAssaultIsEngaged(group) : !group.rearAssault) &&
    group.intent !== 'withdraw' && group.power > 0 && group.count - group.killed > 0);
  const contactLine = tacticalContactLine(attackers, direction);
  const assignedDefenders = battle.defenderGroups.filter(group =>
    group.zoneId === zoneId && group.commandable !== false && activeCount(group) > 0);
  const rearAssaultActive = battle.raiderGroups.some(group =>
    group.zoneId === zoneId && tacticalRearAssaultIsEngaged(group) && activeRaider(group));
  const frontalAssaultActive = battle.raiderGroups.some(group =>
    group.zoneId === zoneId && !group.rearAssault && activeRaider(group));
  const split = splitTacticalEngagementDefenders(assignedDefenders, rearAssaultActive, frontalAssaultActive);
  const defenders = direction === 'rear' ? split.rear : split.frontal;
  if (defenders.length === 0) return '이 교전 방향에 집중 사격할 아군 부대가 없습니다.';
  const defenderOrder: readonly TacticalFormationLine[] = direction === 'rear'
    ? ['rear', 'middle', 'front']
    : ['front', 'middle', 'rear'];
  const defenderContactLine = defenderOrder.find(line => defenders.some(group => group.line === line)) ?? null;
  const meleeContact = defenderContactLine != null && defenders.some(group =>
    group.line === defenderContactLine && tacticalGroupCapabilities(group).has('melee'));
  const context = {
    direction,
    contactLine,
    meleeContact,
    prepareVolleyApplied: battle.orientation !== 'assault' && applied(battle, 'prepareVolley'),
  } as const;
  const results = defenders.map(group => canTargetLine(group, target.line, context));
  if (results.some(result => result.allowed)) return null;
  const reasons = [...new Set(results.map(result => result.reason).filter((reason): reason is string => reason != null))];
  return reasons[0] ?? '현재 아군 병과로 해당 열을 집중 공격할 수 없습니다.';
}

export function setTacticalGroupTarget(
  state: GameState,
  defenderGroupId: string,
  enemyGroupId: string | null,
): string | null {
  const battle = state.tacticalBattle;
  if (!battle) return '진행 중인 직접 지휘 전투가 없습니다.';
  if (battle.assaultKind === 'predatorHunt') return '맹수 사냥에서는 개별 표적을 지정할 수 없습니다.';
  if (battle.phase !== 'command') return '지휘 단계에서만 표적을 지정할 수 있습니다.';
  const defender = battle.defenderGroups.find(group => group.id === defenderGroupId);
  if (!defender) return '표적 명령을 내릴 아군 부대를 찾을 수 없습니다.';
  if (enemyGroupId == null) {
    defender.targetSource = 'auto';
    defender.targetGroupId = chooseAutomaticDefenderTarget(battle, defender);
    return null;
  }
  const unavailableReason = tacticalGroupTargetUnavailableReason(battle, defenderGroupId, enemyGroupId);
  if (unavailableReason) return unavailableReason;
  defender.targetGroupId = enemyGroupId;
  defender.targetSource = 'player';
  return null;
}

/**
 * @deprecated Kept as a compatibility shim for legacy callers. New runtime
 * code must use setTacticalGroupTarget; save migration owns zone focus data.
 */
export function setTacticalFocusTarget(
  state: GameState,
  zoneId: string,
  groupId: string | null,
): string | null {
  const battle = state.tacticalBattle;
  if (!battle) return '진행 중인 직접 지휘 전투가 없습니다.';
  if (battle.assaultKind === 'predatorHunt') return '맹수 사냥에서는 집중 표적을 지정할 수 없습니다.';
  if (battle.phase !== 'command') return '지휘 단계에서만 집중 표적을 지정할 수 있습니다.';
  const zone = battle.zones.find(candidate => candidate.id === zoneId);
  if (!zone) return '표적을 지정할 전투 구역을 찾을 수 없습니다.';
  if (groupId == null) {
    for (const defender of battle.defenderGroups.filter(group =>
      group.zoneId === zoneId && group.commandable !== false && activeCount(group) > 0)) {
      defender.targetSource = 'auto';
      defender.targetGroupId = chooseAutomaticDefenderTarget(battle, defender);
    }
    return null;
  }
  const unavailableReason = tacticalFocusTargetUnavailableReason(battle, zoneId, groupId);
  if (unavailableReason) return unavailableReason;
  for (const defender of battle.defenderGroups.filter(group =>
    group.zoneId === zoneId && group.commandable !== false && activeCount(group) > 0 &&
    tacticalGroupTargetUnavailableReason(battle, group.id, groupId) == null)) {
    defender.targetGroupId = groupId;
    defender.targetSource = 'player';
  }
  return null;
}

export function tacticalCommandUnavailableReason(
  battle: TacticalBattle,
  defender: TacticalDefenderGroup,
  command: TacticalCommandId,
): string | null {
  if (defender.commandable === false) return defender.kind === 'healer'
    ? '전술 치료반은 라운드 종료에 자동으로 부상자를 돌봅니다.'
    : '피난 주민은 전투 명령 대상이 아닙니다.';
  if (battle.assaultKind === 'predatorHunt') return huntCommandUnavailableReason(battle, defender, command);
  if (battle.orientation === 'assault') return assaultCommandUnavailableReason(battle, defender, command);
  if (!IMPLEMENTED_COMMANDS.has(command)) return '이 명령은 아직 사용할 수 없습니다.';
  if (command === 'flankRoute') return tacticalRouteOrderUnavailableReason(battle, defender.id);
  if (command === 'redeploy') {
    if (!defender.pendingLine) return '먼저 인접한 목표 전열을 선택하십시오.';
    return tacticalFormationLinesAdjacent(defender.line, defender.pendingLine)
      ? null
      : '한 라운드에는 인접한 전열로만 재배치할 수 있습니다.';
  }
  if (command === 'reinforceRear') {
    if (defender.line !== 'middle') return '후방 증원은 중열 부대만 수행할 수 있습니다.';
    const capabilities = tacticalGroupCapabilities(defender);
    if (!capabilities.has('melee') && !capabilities.has('mounted')) {
      return '후방 증원은 근접 전투대나 기마 예비대가 필요합니다.';
    }
    const rearAttackHere = battle.raiderGroups.some(group =>
      group.zoneId === defender.zoneId && tacticalRearAssaultIsEngaged(group) && activeRaider(group));
    return rearAttackHere ? null : '같은 구역에 대응할 후방 급습대가 없습니다.';
  }
  if (command === 'hold') return null;
  if (command === 'volley') {
    return tacticalGroupCapabilities(defender).has('volley')
      ? null : '각궁 또는 화약이 준비된 조총이 필요합니다.';
  }
  if (command === 'ambush') {
    if (!tacticalGroupCapabilities(defender).has('ambush')) return '매복은 사냥꾼 역할이 필요합니다.';
    const enemyHere = battle.raiderGroups.some(group =>
      group.zoneId === defender.zoneId && group.intent !== 'withdraw' && group.power > 0);
    if (defender.ambushed && !enemyHere) return '기습할 적이 같은 구역에 없습니다.';
    if (!defender.ambushed && enemyHere) return '적과 맞붙은 구역에서는 새로 매복할 수 없습니다.';
    return null;
  }
  if (command === 'charge') {
    if (!tacticalGroupCapabilities(defender).has('charge')) return '돌격은 창을 갖춘 부대만 수행할 수 있습니다.';
    const enemyHere = battle.raiderGroups.some(group =>
      group.zoneId === defender.zoneId && group.intent !== 'withdraw' && group.power > 0);
    return enemyHere ? null : '돌격할 적이 같은 구역에 없습니다.';
  }
  if (command === 'guardStorehouse') {
    return defender.zoneId === 'storehouse' ? null : '창고 주변에 배치된 부대만 창고를 사수할 수 있습니다.';
  }
  if (command === 'protectCivilians') {
    const civiliansHere = battle.defenderGroups.some(group =>
      group.kind === 'civilian' && group.zoneId === defender.zoneId && activeCount(group) > 0);
    return civiliansHere ? null : '같은 구역에 피난 주민이 있어야 주민을 보호할 수 있습니다.';
  }
  if (command === 'fallback') {
    return nextRearZoneId(battle, defender.zoneId) ? null : '최후 방어선에서는 더 물러날 수 없습니다.';
  }
  if (command === 'advance') {
    if (defender.kind === 'civilian') return '피난 주민은 전방으로 전진할 수 없습니다.';
    return nextForwardZoneId(battle, defender.zoneId) ? null : '가장 앞선 방어선에서는 더 전진할 수 없습니다.';
  }
  return '이 명령은 아직 사용할 수 없습니다.';
}

export function chooseDefaultTacticalCommands(battle: TacticalBattle): void {
  if (battle.assaultKind === 'predatorHunt') {
    chooseDefaultHuntCommands(battle);
    return;
  }
  if (battle.orientation === 'assault') {
    chooseDefaultAssaultCommands(battle);
    return;
  }
  for (const defender of battle.defenderGroups) {
    if (defender.commandable === false) {
      defender.command = null;
      defender.commandSource = undefined;
      continue;
    }
    if (activeCount(defender) <= 0) continue;
    const reserveCapabilities = tacticalGroupCapabilities(defender);
    const shouldReinforceRear = defender.line === 'middle' &&
      (reserveCapabilities.has('melee') || reserveCapabilities.has('mounted')) &&
      battle.raiderGroups.some(group =>
        group.zoneId === defender.zoneId && tacticalRearAssaultIsEngaged(group) && activeRaider(group));
    if (shouldReinforceRear && defender.commandSource !== 'player') {
      defender.command = 'reinforceRear';
      defender.commandSource = 'recommended';
      applyTacticalFacingChange(battle, defender, 'towardRear');
      continue;
    }
    if (defender.command) {
      defender.commandSource ??= 'recommended';
      continue;
    }
    if (tacticalGroupCapabilities(defender).has('ambush')) {
      const enemyHere = battle.raiderGroups.some(group =>
        group.zoneId === defender.zoneId && group.intent !== 'withdraw' && group.power > 0);
      defender.command = (defender.ambushed && enemyHere) || (!defender.ambushed && !enemyHere) ? 'ambush' : 'hold';
    }
    else if (tacticalGroupCapabilities(defender).has('volley')) defender.command = 'volley';
    else if (defender.zoneId === 'storehouse') defender.command = 'guardStorehouse';
    else defender.command = 'hold';
    defender.commandSource = 'recommended';
  }
}

function defenderSurvivingPower(group: TacticalDefenderGroup): number {
  const active = activeCount(group);
  return group.count > 0 ? group.power * active / group.count : 0;
}

function raiderSurvivingPower(group: TacticalRaiderGroup): number {
  if (!activeRaider(group) || group.confused) return 0;
  return group.power * clamp(group.morale / 100, 0, 1) * (group.combatMultiplier ?? 1);
}

function formationPowerRatio(guardPower: number, assaultPower: number): number {
  if (guardPower <= 0) return 0;
  if (assaultPower <= 0) return 1;
  const raw = guardPower / (guardPower + assaultPower);
  return clamp(Math.pow(raw, CONFIG.tacticalBattle.enemyPlan.counterStrength.formationCurveExponent), 0, 1);
}

export function tacticalRearManeuverFormationCounterForEngagement(
  battle: TacticalBattle,
  zoneId: string,
  rearAttackers: readonly TacticalRaiderGroup[],
  rearDefenders: readonly TacticalDefenderGroup[],
): number {
  const rearAttackerIds = new Set(rearAttackers.map(group => group.id));
  const currentRearAttackers = battle.raiderGroups.filter(group =>
    rearAttackerIds.has(group.id) && group.zoneId === zoneId && group.rearAssault === true);
  if (currentRearAttackers.length === 0) return 0;

  const rearDefenderIds = new Set(rearDefenders.map(group => group.id));
  const guardPower = battle.defenderGroups.reduce((sum, group) => {
    const capabilities = tacticalGroupCapabilities(group);
    if (!rearDefenderIds.has(group.id) || group.zoneId !== zoneId || group.commandable === false ||
        activeCount(group) <= 0 || group.command === 'redeploy' || group.command === 'fallback' ||
        group.command === 'advance' || group.command === 'openRetreat' ||
        (!capabilities.has('melee') && !capabilities.has('mounted'))) return sum;
    if (tacticalFacingMatchesDirection(group, 'rear')) {
      return sum + defenderSurvivingPower(group);
    }
    return sum;
  }, 0);
  const assaultPower = currentRearAttackers.reduce((sum, group) => sum + raiderSurvivingPower(group), 0);
  return formationPowerRatio(guardPower, assaultPower);
}

export function tacticalRearManeuverEffectiveCounterStrengthForZone(
  battle: TacticalBattle,
  zoneId: string,
): number | undefined {
  const stratagem = battle.enemyPlan?.stratagems.find(candidate => candidate.id === 'rearManeuver');
  if (!stratagem) return undefined;
  const rearAttackers = battle.raiderGroups.filter(group =>
    group.zoneId === zoneId && tacticalRearAssaultIsEngaged(group) && activeRaider(group));
  if (rearAttackers.length === 0) return undefined;
  const defenders = battle.defenderGroups.filter(group => group.zoneId === zoneId && activeCount(group) > 0);
  const split = splitTacticalEngagementDefenders(defenders, true);
  const rearDefenders = [...split.rear, ...split.protectedTargets];
  const formationCounter = tacticalRearManeuverFormationCounterForEngagement(
    battle,
    zoneId,
    rearAttackers,
    rearDefenders,
  );
  return enemyStratagemCounterStrengthForEngagement(stratagem, formationCounter);
}

export function tacticalFeintFormationCounter(battle: TacticalBattle): number {
  const reservePower = battle.defenderGroups.reduce((sum, group) => {
    const capabilities = tacticalGroupCapabilities(group);
    if (group.line !== 'middle' || group.commandable === false || activeCount(group) <= 0 ||
        group.command === 'redeploy' || group.command === 'fallback' || group.command === 'advance' ||
        group.command === 'openRetreat' ||
        (!capabilities.has('melee') && !capabilities.has('mounted'))) return sum;
    return sum + defenderSurvivingPower(group);
  }, 0);
  const divertedPower = battle.raiderGroups.reduce((sum, group) =>
    sum + (group.kind === 'looters' || group.kind === 'flankers' ? raiderSurvivingPower(group) : 0), 0);
  return formationPowerRatio(reservePower, divertedPower);
}

export function applyTacticalEnemyPlanDeployment(battle: TacticalBattle): void {
  if (battle.enemyPlanDeploymentApplied) return;
  const feint = battle.enemyPlan?.stratagems.find(stratagem => stratagem.id === 'feint');
  if (!feint) {
    battle.enemyPlanDeploymentApplied = true;
    return;
  }
  feint.counter = {
    ...feint.counter,
    formation: tacticalFeintFormationCounter(battle),
  };
  const feintCounterStrength = enemyStratagemCounterStrength(feint);
  feint.counterLevel = feintCounterStrength >= 1 ? 2 : feintCounterStrength > 0 ? 1 : 0;
  const scale = enemyPlanStratagemScale(battle.enemyPlan, 'feint');
  const main = battle.raiderGroups.filter(group => group.kind === 'main');
  const diverted = battle.raiderGroups.filter(group => group.kind === 'looters' || group.kind === 'flankers');
  const mainPower = main.reduce((sum, group) => sum + group.power, 0);
  const divertedPower = diverted.reduce((sum, group) => sum + group.power, 0);
  const shift = Math.min(mainPower * 0.45, battle.originalPower * CONFIG.tacticalBattle.enemyPlan.effects.feint.powerShift * scale);
  if (shift > 0 && mainPower > 0 && divertedPower > 0) {
    for (const group of main) group.power -= shift * group.power / mainPower;
    for (const group of diverted) group.power += shift * group.power / divertedPower;
  }
  for (const group of battle.raiderGroups) {
    group.estimatedPower = feintCounterStrength > 0
      ? undefined
      : group.kind === 'main'
        ? group.power * CONFIG.tacticalBattle.enemyPlan.effects.feint.estimatedMainMultiplier
        : undefined;
  }
  battle.enemyPlanDeploymentApplied = true;
}

export function advanceTacticalPhase(state: GameState): string | null {
  const battle = state.tacticalBattle;
  if (!battle) return '진행 중인 직접 지휘 전투가 없습니다.';
  if (battle.assaultKind === 'predatorHunt') return advanceHuntPhase(state);
  if (battle.orientation === 'assault') {
    const result = advanceAssaultPhase(state);
    if (!result && battle.phase === 'command') normalizeTacticalGroupTargets(battle);
    return result;
  }
  if (battle.phase === 'preparation') {
    battle.preparationEvents = applySelectedPreparationActions(state, battle);
    const nightAmbush = enemyPlanStratagemScale(battle.enemyPlan, 'nightApproach') >
      CONFIG.tacticalBattle.enemyPlan.effects.nightApproach.forcedAutoDeployThreshold;
    if (nightAmbush) {
      applyAutoDeployTacticalGroups(battle, 'nightAmbush');
      battle.preparationEvents.push({
        zoneId: 'approach', kind: 'ambush', side: 'raider', durationMs: 900,
        text: '적의 야습으로 배치할 틈을 잃고 기존 방어 진형에서 곧바로 맞섭니다.',
        float: '야습! 자동배치',
      });
    }
    if (battle.preparationEvents.length > 0) battle.phase = 'preparationExecution';
    else if (nightAmbush) {
      applyTacticalEnemyPlanDeployment(battle);
      chooseDefaultTacticalCommands(battle);
      normalizeTacticalGroupTargets(battle);
      battle.phase = 'command';
    } else battle.phase = 'deployment';
    return null;
  }
  if (battle.phase === 'preparationExecution') {
    if (battle.deploymentForced === 'nightAmbush') {
      applyTacticalEnemyPlanDeployment(battle);
      chooseDefaultTacticalCommands(battle);
      normalizeTacticalGroupTargets(battle);
      battle.phase = 'command';
    } else battle.phase = 'deployment';
    return null;
  }
  if (battle.phase === 'deployment') {
    const unavailableReason = tacticalDeploymentUnavailableReason(battle);
    if (unavailableReason) return unavailableReason;
    applyTacticalEnemyPlanDeployment(battle);
    chooseDefaultTacticalCommands(battle);
    normalizeTacticalGroupTargets(battle);
    battle.phase = 'command';
    return null;
  }
  return '지금은 다음 단계로 넘어갈 수 없습니다.';
}

function activeCount(group: TacticalDefenderGroup): number {
  return Math.max(0, group.count - group.wounded - group.killed);
}

export interface TacticalFieldTreatmentResult {
  treated: number;
  herbsSpent: number;
  byZone: Record<string, number>;
}

export function applyTacticalFieldTreatment(
  state: GameState,
  battle: TacticalBattle,
  events: TacticalAnimationEvent[] = [],
  lines: string[] = [],
  rng: () => number = () => 0,
): TacticalFieldTreatmentResult {
  const returnsPerPhysician = Math.max(0, Math.floor(CONFIG.medicine.tacticalReturnsPerPhysicianPerRound));
  const returnChance = clamp(CONFIG.medicine.tacticalReturnChance, 0, 1);
  const herbsPerReturn = Math.max(0, CONFIG.medicine.tacticalHerbsPerReturn);
  const herbCapacity = herbsPerReturn > 0
    ? Math.floor(((state.resources.herbs ?? 0) + 1e-9) / herbsPerReturn)
    : Number.MAX_SAFE_INTEGER;
  if (returnsPerPhysician <= 0 || returnChance <= 0 || herbCapacity <= 0) {
    return { treated: 0, herbsSpent: 0, byZone: {} };
  }

  const healers = battle.defenderGroups
    .filter(group => group.kind === 'healer' && activeCount(group) > 0)
    .map(group => ({ group, capacity: activeCount(group) * returnsPerPhysician }))
    .sort((left, right) => left.group.zoneId.localeCompare(right.group.zoneId) || left.group.id.localeCompare(right.group.id));
  let remainingHerbCapacity = herbCapacity;
  let treated = 0;
  const byZone: Record<string, number> = {};

  for (const { group: healer, capacity } of healers) {
    const candidates = battle.defenderGroups
      .filter(group => group.zoneId === healer.zoneId && group.wounded > 0)
      .sort((left, right) => {
        const priority = (group: TacticalDefenderGroup) => group.kind === 'civilian' ? 2 : group.kind === 'healer' ? 1 : 0;
        return priority(left) - priority(right) || right.wounded - left.wounded || right.power - left.power ||
          left.id.localeCompare(right.id);
      });
    const woundedInZone = candidates.reduce((sum, candidate) => sum + candidate.wounded, 0);
    const attempts = Math.min(capacity, remainingHerbCapacity, woundedInZone);
    let remaining = 0;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      if (rng() < returnChance) remaining += 1;
    }
    if (remaining <= 0) continue;
    let healerTreated = 0;
    for (const candidate of candidates) {
      if (remaining <= 0) break;
      const returned = Math.min(candidate.wounded, remaining);
      candidate.wounded -= returned;
      remaining -= returned;
      remainingHerbCapacity -= returned;
      treated += returned;
      healerTreated += returned;
      byZone[healer.zoneId] = (byZone[healer.zoneId] ?? 0) + returned;
    }
    if (healerTreated > 0) {
      event(events, healer.zoneId, 'report', `${healer.label}이 약초로 응급 처치를 마쳐 부상자 ${healerTreated}명을 전열에 복귀시킵니다.`, 620, {
        side: 'defender', groupId: healer.id, float: `응급치료 +${healerTreated}`,
      });
      lines.push(`${healer.label}: 약초를 써 부상자 ${healerTreated}명이 전열에 복귀했습니다.`);
    }
  }

  const herbsSpent = treated * herbsPerReturn;
  if (herbsSpent > 0) state.resources.herbs = Math.max(0, state.resources.herbs - herbsSpent);
  return { treated, herbsSpent, byZone };
}

export function tacticalInjurySeverityForGroup(
  battle: TacticalBattle,
  group: TacticalDefenderGroup,
): number {
  const base = battle.mode === 'levy' ? 24 : 18;
  const stabilized = battle.defenderGroups.some(candidate =>
    candidate.kind === 'healer' && candidate.zoneId === group.zoneId && activeCount(candidate) > 0);
  return base * (stabilized ? CONFIG.medicine.tacticalInjurySeverityMult : 1);
}

export function tacticalDefenderReadiness(
  groups: ReadonlyArray<Pick<TacticalDefenderGroup, 'count' | 'wounded' | 'killed' | 'commandable'>>,
): number {
  const combatGroups = groups.filter(group => group.commandable !== false);
  const assignedCount = combatGroups.reduce((sum, group) => sum + group.count, 0);
  if (assignedCount <= 0) return 0;
  const readyCount = combatGroups.reduce(
    (sum, group) => sum + Math.max(0, group.count - group.wounded - group.killed),
    0,
  );
  return readyCount / assignedCount;
}

function shouldRaiderAdvance(
  attacker: TacticalRaiderGroup,
  battle: TacticalBattle,
  zone: TacticalBattleZone | undefined,
  enemyShare: number,
  defenderReadiness: number,
): boolean {
  if (!zone) return false;
  if (attacker.intent === 'defend') return false;
  const defendersBroken = defenderReadiness <= 0.55;
  const undefended = defenderReadiness <= 0;
  if (attacker.kind === 'main') {
    // 주력은 방책이 남아 있거나 수비대가 건재한 상태로 마을 중심부까지 통과할 수 없다.
    if (zone.id === 'wall') return zone.breached && (defendersBroken || enemyShare >= 0.7);
    return zone.breached || undefended || enemyShare >= 0.62;
  }
  if (attacker.kind === 'looters' && zone.id === 'wall') {
    return zone.breached || undefended || enemyShare >= 0.55 || attacker.engagementsInZone >= 2;
  }
  if (attacker.kind === 'flankers') {
    // 창고에 수비대가 있으면 도착한 교전에서 곧바로 통과하지 못하고 최소 한 차례 맞붙는다.
    if (zone.id === 'storehouse' && !undefended && attacker.engagementsInZone < 1) return false;
    return zone.breached || enemyShare > 0.52 || battle.round >= 3;
  }
  return zone.breached || enemyShare > 0.52 ||
    (attacker.kind === 'looters' && battle.round >= 3);
}

function pendingLootAvailable(state: GameState, battle: TacticalBattle, resource: ResourceId): number {
  const alreadyTaken = battle.reports.reduce((sum, report) => sum + (report.loot[resource] ?? 0), 0);
  return Math.max(0, Math.floor((state.resources[resource] ?? 0) - alreadyTaken));
}

function event(
  events: TacticalAnimationEvent[],
  zoneId: string,
  kind: TacticalAnimationEvent['kind'],
  text: string,
  durationMs = 650,
  extra?: Pick<TacticalAnimationEvent, 'side' | 'groupId' | 'actorGroupIds' | 'casualties' | 'float' | 'shots' | 'meleeParticipants'>,
): void {
  events.push({ zoneId, kind, text, durationMs, ...extra });
}

function summaryForOutcome(outcome: TacticalRoundReport['outcome']): string {
  if (outcome === 'defenseSuccess') return '적의 기세가 꺾여 습격대가 물러납니다.';
  if (outcome === 'villageRouted') return '마을 중심 방어선이 무너졌습니다.';
  if (outcome === 'raidersLooted') return '약탈대가 노획물을 챙겨 퇴각합니다.';
  if (outcome === 'partialLoss') return '마을은 버텼지만 일부 방어선과 비축을 잃었습니다.';
  return '전선의 압박이 다음 구역으로 옮겨갑니다.';
}

export function tacticalMaximumRoundOutcome(
  sufferedLoss: boolean,
): Extract<TacticalRoundReport['outcome'], 'defenseSuccess' | 'partialLoss'> {
  return sufferedLoss ? 'partialLoss' : 'defenseSuccess';
}

export function tacticalEnemyObjectiveOutcome(
  objective: EnemyPlan['objective'],
  priorLootRounds: number,
  thisRoundLooted: boolean,
  priorBuildingDamage: number,
  thisRoundBuildingDamage: number,
): TacticalRoundReport['outcome'] {
  const profile = enemyObjectiveProfile(objective);
  if (priorLootRounds + Number(thisRoundLooted) >= profile.lootRoundsToExit) return 'raidersLooted';
  if (priorBuildingDamage + thisRoundBuildingDamage >= profile.damageToExit) return 'partialLoss';
  return undefined;
}

export function resolveTacticalRound(state: GameState): string | null {
  const battle = state.tacticalBattle;
  if (!battle) return '진행 중인 직접 지휘 전투가 없습니다.';
  if (battle.assaultKind === 'predatorHunt') return resolveHuntRound(state);
  if (battle.orientation === 'assault') {
    normalizeTacticalGroupTargets(battle);
    return resolveAssaultRound(state);
  }
  if (battle.phase !== 'command') return '교전을 진행할 지휘 단계가 아닙니다.';
  const rng = makeRng(state.seed + battle.id * 8191 + battle.round * 131071);
  const routeAdvances = advanceTacticalRouteTransits(battle);
  const routeResolution = resolveTacticalRouteRound(battle, routeAdvances, state.weather, rng);
  chooseDefaultTacticalCommands(battle);
  normalizeTacticalGroupTargets(battle);
  const routeEngagedDefenderIds = new Set(routeResolution.engagements.flatMap(engagement =>
    engagement.defenderGroupIds));
  const firingMusketGroups = battle.defenderGroups.filter(group =>
    group.weapon === 'musket' && group.command === 'volley' && activeCount(group) > 0 &&
    (routeEngagedDefenderIds.has(group.id) || battle.raiderGroups.some(enemy =>
      !enemy.routeTransit && enemy.zoneId === group.zoneId && enemy.intent !== 'withdraw' && enemy.power > 0)));
  const musketAllocation = consumeMusketVolleys(
    state,
    firingMusketGroups.map(group => ({
      id: group.id,
      residentIds: group.residentIds.slice(0, activeCount(group)),
    })),
    CONFIG.raid.powderPerMusket,
  );
  for (const group of battle.defenderGroups.filter(group => group.weapon === 'musket')) {
    group.readyMuskets = musketAllocation.byGroup[group.id] ?? 0;
  }
  const events: TacticalAnimationEvent[] = [...routeResolution.events];
  const lines: string[] = [...routeResolution.lines];
  prepareTacticalRaiderSupportRound(battle, events, lines);
  for (const advance of routeAdvances) {
    const route = battle.flankRoutes?.find(candidate => candidate.id === advance.routeId);
    const group = battle.raiderGroups.find(candidate => candidate.id === advance.groupId) ??
      battle.defenderGroups.find(candidate => candidate.id === advance.groupId);
    if (!route || !group) continue;
    if (advance.visibleToDefender) {
      lines.push(`${group.label}: ${route.label} ${advance.toStep === 2 ? '후방 출구에 도달' : '중간 구간으로 이동'}.`);
    } else if (route.defenderIntel === 'suspected') {
      lines.push(`${route.label} 방면에서 우회 징후가 감지됩니다.`);
    }
  }
  const doctrineTransitions = applyTacticalDoctrineAi(battle);
  const rangedEfficiency = enemyPlanRangedEfficiency(battle.enemyPlan);
  if (battle.round === 1) {
    const moraleBonus = enemyPlanFirstRoundMoraleBonus(battle.enemyPlan);
    if (moraleBonus > 0) {
      battle.raiderMorale = clamp(battle.raiderMorale + moraleBonus, 0, 100);
      battle.raiderGroups.forEach(group => { group.morale = clamp(group.morale + moraleBonus, 0, 100); });
      lines.push(`야간 접근으로 적이 첫 교전 기세 +${moraleBonus}을 얻었습니다.`);
    }
  }
  const lootBag: Partial<Record<ResourceId, number>> = {};
  const dominance = new Map<string, number>();
  const rearDominance = new Map<string, number>();
  const defenderReadiness = new Map<string, number>();
  const undefendedFrontalZones = new Set<string>();
  const moraleBrokenAttackerIds = new Set<string>();
  let roundWounded = routeResolution.wounded;
  let roundKilled = routeResolution.killed;
  let roundRaidersKilled = routeResolution.raidersKilled;
  let buildingsDamaged = 0;
  let villageMoraleDelta = routeResolution.villageMoraleDelta;
  let raiderMoraleDelta = routeResolution.raiderMoraleDelta;
  const focusZoneId = battle.currentZoneId;
  const roundStartingRaiderPower = Math.max(1, battle.raiderGroups.reduce((sum, group) =>
    sum + (group.intent === 'withdraw' || group.routeTransit ? 0 : group.power), 0));

  const focusZoneName = battle.zones.find(zone => zone.id === focusZoneId)?.name ?? '전선';
  event(events, focusZoneId, 'camera', `${withJosa(focusZoneName, '으로/로')} 시선을 옮깁니다.`, 450);
  for (const transition of doctrineTransitions) {
    const group = battle.raiderGroups.find(candidate => candidate.id === transition.groupId);
    const zoneId = group?.zoneId ?? focusZoneId;
    event(events, zoneId, 'doctrineShift', `${transition.groupLabel}: ${transition.signal}`, 560, {
      side: 'raider', groupId: transition.groupId, actorGroupIds: [transition.groupId],
      float: transition.toState === 'committingReserve' ? '예비대 투입!' : '행동 전환',
    });
    lines.push(`${transition.groupLabel}: ${transition.signal}`);
  }
  for (const defender of battle.defenderGroups.filter(group => group.command === 'ambush' && !group.ambushed)) {
    event(events, defender.zoneId, 'camera', `${withJosa(defender.label, '이/가')} 숨을 죽이고 매복 자리를 잡습니다.`, 420);
    lines.push(`${withJosa(defender.label, '이/가')} 다음 교전을 위해 매복합니다.`);
  }
  for (const defender of battle.defenderGroups.filter(group => group.command === 'advance')) {
    const enemyHere = battle.raiderGroups.some(attacker =>
      !attacker.routeTransit && attacker.zoneId === defender.zoneId && attacker.intent !== 'withdraw' && attacker.power > 0);
    if (!enemyHere) event(events, defender.zoneId, 'advance', `${withJosa(defender.label, '이/가')} 앞선 방어선으로 전진할 채비를 합니다.`, 520, {
      side: 'defender', float: '전진 준비',
    });
  }

  for (const zone of battle.zones) {
    const attackers = battle.raiderGroups.filter(group => !group.routeTransit && group.zoneId === zone.id &&
      group.intent !== 'withdraw' && group.power > 0);
    if (attackers.length === 0) {
      zone.pressure = Math.max(0, zone.pressure - 5);
      continue;
    }
    const assignedDefenders = battle.defenderGroups.filter(group => group.zoneId === zone.id);
    const defenders = assignedDefenders.filter(group => activeCount(group) > 0);
    const rearAttackers = attackers.filter(attacker => attacker.rearAssault);
    const frontalAttackers = attackers.filter(attacker => !attacker.rearAssault);
    const newlyRevealedRearAttackerIds = new Set<string>();
    for (const attacker of rearAttackers.filter(group => group.engagementsInZone === 0)) {
      attacker.revealed = true;
      newlyRevealedRearAttackerIds.add(attacker.id);
      lines.push(`${withJosa(attacker.label, '이/가')} ${zone.name} 후열을 급습했습니다.`);
    }
    const assignedEngagements = splitTacticalEngagementDefenders(
      assignedDefenders,
      rearAttackers.length > 0,
      frontalAttackers.length > 0,
    );
    const engagementDefenders = splitTacticalEngagementDefenders(
      defenders,
      rearAttackers.length > 0,
      frontalAttackers.length > 0,
    );
    defenderReadiness.set(zone.id, tacticalDefenderReadiness(assignedEngagements.frontal));
    if (frontalAttackers.length === 0) {
      zone.pressure = Math.max(0, zone.pressure - 5);
      dominance.set(zone.id, 0);
    }
    const engagements: Array<{
      direction: 'frontal' | 'rear';
      defenders: TacticalDefenderGroup[];
      attackers: TacticalRaiderGroup[];
    }> = [];
    if (frontalAttackers.length > 0) {
      const frontalDefenders = rearAttackers.length > 0
        ? engagementDefenders.frontal
        : [...engagementDefenders.frontal, ...engagementDefenders.protectedTargets];
      if (frontalDefenders.length === 0) undefendedFrontalZones.add(zone.id);
      engagements.push({
        direction: 'frontal',
        defenders: frontalDefenders,
        attackers: frontalAttackers,
      });
    }
    if (rearAttackers.length > 0) {
      engagements.push({
        direction: 'rear',
        defenders: [...engagementDefenders.rear, ...engagementDefenders.protectedTargets],
        attackers: rearAttackers,
      });
    }
    for (const engagement of engagements) {
      const rearFormationCounter = engagement.direction === 'rear'
        ? tacticalRearManeuverFormationCounterForEngagement(
          battle,
          zone.id,
          engagement.attackers,
          engagement.defenders,
        )
        : 0;
      const rearCounterPenalty = engagement.direction === 'rear'
        ? CONFIG.tacticalBattle.enemyPlan.effects.rearManeuver.counteredCombatPenalty *
          (1 - enemyPlanStratagemScaleForEngagement(
            battle.enemyPlan,
            'rearManeuver',
            rearFormationCounter,
          ))
        : 0;
      const effectiveAttackers = rearCounterPenalty > 0
        ? engagement.attackers.map(group => ({
          ...group,
          combatMultiplier: (group.combatMultiplier ?? 1) * (1 - rearCounterPenalty),
        }))
        : engagement.attackers;
      const exchange = resolveEngagementExchange({
        zone,
        defenders: engagement.defenders,
        attackers: effectiveAttackers,
        direction: engagement.direction,
        weather: state.weather,
        prepareVolleyApplied: applied(battle, 'prepareVolley'),
        evacuateCiviliansApplied: applied(battle, 'evacuateCivilians'),
        roundStartingRaiderPower,
        rangedEfficiency,
        defenderPowerMultiplier: defender => (
          defender.command === 'redeploy' || defender.command === 'fallback' || defender.command === 'advance'
            ? tacticalMovementCommandPowerMultiplier(defender, defender.command) : 1
        ) * (defender.rearRaidRound === battle.round
          ? CONFIG.tacticalBattle.flankRoutes.engagement.rearRaidPowerMultiplier : 1),
        priorRaiderMoraleDelta: raiderMoraleDelta,
        retreatPowerThreshold: battle.originalPower * 0.035,
        rng,
      });
      for (const loss of exchange.raiderLosses) {
        const attacker = engagement.attackers.find(group => group.id === loss.groupId);
        if (attacker) attacker.confused = loss.confused;
      }
      for (const attackerId of exchange.retreatingAttackerIds) {
        const attacker = engagement.attackers.find(group => group.id === attackerId);
        if (!attacker) continue;
        attacker.intent = 'withdraw';
        attacker.pendingZoneId = undefined;
        moraleBrokenAttackerIds.add(attacker.id);
      }
      if (engagement.direction === 'rear' && newlyRevealedRearAttackerIds.size > 0) {
        const revealEvents: TacticalAnimationEvent[] = [];
        for (const attacker of engagement.attackers.filter(group => newlyRevealedRearAttackerIds.has(group.id))) {
          event(revealEvents, zone.id, 'rearAssault', `${withJosa(attacker.label, '이/가')} 수비대 후열에 갑자기 모습을 드러냅니다.`, 760, {
            side: 'defender', groupId: attacker.id, float: '후방 급습!',
          });
        }
        const preemptiveEventCount = exchange.surpriseAttack ? 1 : 0;
        events.push(
          ...exchange.preDefenseEvents.slice(0, preemptiveEventCount),
          ...revealEvents,
          ...exchange.preDefenseEvents.slice(preemptiveEventCount),
        );
      } else events.push(...exchange.preDefenseEvents);
      lines.push(...exchange.preDefenseLines);
      for (const loss of exchange.defenderLosses) {
        const defender = engagement.defenders.find(group => group.id === loss.groupId);
        if (!defender) continue;
        defender.wounded += loss.wounded;
        defender.killed += loss.killed;
        roundWounded += loss.wounded;
        roundKilled += loss.killed;
      }
      if (engagement.direction === 'frontal') {
        const consequenceAttackers = engagement.attackers.filter(attacker => attacker.intent !== 'withdraw');
        const consequences = consequenceAttackers.length > 0 && exchange.enemyPower > 0
          ? applyDefenseZoneConsequences({
            zone,
            defenders: engagement.defenders,
            attackers: consequenceAttackers,
            commands: exchange.commands,
            enemyPower: exchange.enemyPower,
            defensePower: exchange.defensePower,
            enemyShare: exchange.enemyShare,
            originalPower: battle.originalPower,
            availableLoot: {
              grain: pendingLootAvailable(state, battle, 'grain'),
              firewood: pendingLootAvailable(state, battle, 'firewood'),
              hide: pendingLootAvailable(state, battle, 'hide'),
            },
            fireArrowEffectScale: enemyPlanStratagemScale(battle.enemyPlan, 'fireArrows'),
            doctrine: battle.enemyPlan?.doctrine,
            wallBreakerEffectScale: battle.enemyPlan?.stratagems.some(stratagem => stratagem.id === 'wallBreakers')
              ? enemyPlanStratagemScale(battle.enemyPlan, 'wallBreakers')
              : undefined,
            rng,
          })
          : {
            pressure: zone.pressure,
            breached: zone.breached,
            buildingsDamaged: 0,
            loot: {},
            breachEvents: [],
            breachLines: [],
            lootEvents: [],
            lootLines: [],
          };
        zone.pressure = consequences.pressure;
        zone.breached = consequences.breached;
        events.push(...consequences.breachEvents);
        lines.push(...consequences.breachLines);
        buildingsDamaged += consequences.buildingsDamaged;
        for (const [key, amount] of Object.entries(consequences.loot)) {
          const resource = key as ResourceId;
          lootBag[resource] = (lootBag[resource] ?? 0) + (amount ?? 0);
        }
        events.push(...consequences.lootEvents);
        lines.push(...consequences.lootLines);
        dominance.set(zone.id, exchange.enemyShare);
      } else {
        rearDominance.set(zone.id, exchange.enemyShare);
      }
      for (const loss of exchange.raiderLosses) {
        const attacker = engagement.attackers.find(group => group.id === loss.groupId);
        if (!attacker) continue;
        attacker.killed += loss.killed;
        attacker.power = loss.powerAfter;
        roundRaidersKilled += loss.killed;
      }
      events.push(...exchange.postDefenseEvents);
      villageMoraleDelta += exchange.villageMoraleDelta;
      raiderMoraleDelta += exchange.raiderMoraleDelta;
      if (exchange.surpriseAttack) {
        for (const defenderId of exchange.surpriseDefenderIds) {
          const defender = engagement.defenders.find(group => group.id === defenderId);
          if (!defender) continue;
          defender.ambushed = false;
          defender.command = 'fallback';
        }
        events.push(...exchange.afterConsequencesEvents);
      }
    }
  }

  const treatment = applyTacticalFieldTreatment(state, battle, events, lines, rng);
  const raiderPowerRestored = applyTacticalRaiderSupportTreatment(battle, events, lines);
  villageMoraleDelta = Math.round(clamp(villageMoraleDelta, -18, 5));
  raiderMoraleDelta = Math.round(clamp(raiderMoraleDelta, -22, 0));
  battle.villageMorale = clamp(battle.villageMorale + villageMoraleDelta, 0, 100);
  battle.raiderMorale = clamp(battle.raiderMorale + raiderMoraleDelta, 0, 100);
  const scheduledAdvances = new Map<string, {
    fromZoneId: string;
    fromZoneName: string;
    destinationName: string;
    groupLabels: string[];
    groupIds: string[];
    undefended: boolean;
  }>();
  for (const attacker of battle.raiderGroups) {
    attacker.morale = clamp(attacker.morale + raiderMoraleDelta, 0, 100);
    if (attacker.routeTransit) {
      attacker.confused = false;
      continue;
    }
    const route = routeForRaider(attacker);
    const index = route.indexOf(attacker.zoneId);
    const zone = battle.zones.find(candidate => candidate.id === attacker.zoneId);
    const share = dominance.get(attacker.zoneId) ?? 0;
    if (moraleBrokenAttackerIds.has(attacker.id)) {
      attacker.intent = 'withdraw';
      attacker.pendingZoneId = undefined;
    } else if (attacker.morale <= 18 || attacker.power <= battle.originalPower * 0.035) {
      attacker.intent = 'withdraw';
      attacker.pendingZoneId = undefined;
      event(events, attacker.zoneId, 'moraleBreak', `${attacker.label}의 대열이 흩어집니다.`, 650, {
        side: 'raider', groupId: attacker.id, float: '궤주!',
      });
    } else if (attacker.rearAssault && attacker.engagementsInZone >= 1 &&
      (rearDominance.get(attacker.zoneId) ?? 0) >= 0.6) {
      attacker.intent = 'withdraw';
      attacker.pendingZoneId = undefined;
      event(events, attacker.zoneId, 'retreat', `${withJosa(attacker.label, '이/가')} 후열을 휘저은 뒤 추격을 피해 이탈합니다.`, 650, {
        side: 'raider', groupId: attacker.id, float: '급습 이탈!',
      });
      lines.push(`${withJosa(attacker.label, '이/가')} 후방 급습 목표를 달성하고 전장에서 이탈했습니다.`);
    } else if (!attacker.confused && index >= 0 && index < route.length - 1 &&
      shouldRaiderAdvance(attacker, battle, zone, share, defenderReadiness.get(attacker.zoneId) ?? 0)) {
      const fromZoneId = attacker.zoneId;
      if (attacker.kind === 'main' && !attacker.rearAssault && zone && zone.id !== 'wall') {
        zone.breached = true;
      }
      attacker.pendingZoneId = route[index + 1];
      attacker.targetZoneId = route[Math.min(route.length - 1, index + 2)];
      const destinationName = battle.zones.find(candidate => candidate.id === attacker.pendingZoneId)?.name;
      const advanceKey = `${fromZoneId}->${attacker.pendingZoneId}`;
      const scheduled = scheduledAdvances.get(advanceKey) ?? {
        fromZoneId,
        fromZoneName: zone?.name ?? '무방비 전선',
        destinationName: destinationName ?? '다음 방어선',
        groupLabels: [],
        groupIds: [],
        undefended: undefendedFrontalZones.has(fromZoneId),
      };
      scheduled.groupLabels.push(attacker.label);
      scheduled.groupIds.push(attacker.id);
      scheduledAdvances.set(advanceKey, scheduled);
      const destinationWithJosa = withJosa(destinationName ?? '다음 방어선', '으로/로');
      if (attacker.kind === 'flankers') {
        lines.push(attacker.flankPlan === 'rearAssault'
          ? `${withJosa(attacker.label, '이/가')} 주 방어선의 뒤편을 노리며 ${destinationWithJosa} 우회합니다.`
          : `${withJosa(attacker.label, '이/가')} 방책을 우회해 ${destinationWithJosa} 접근합니다.`);
      } else if (attacker.kind === 'looters' && fromZoneId === 'wall' && !zone?.breached) {
        lines.push(`${withJosa(attacker.label, '이/가')} 방책의 틈으로 새어 나가 ${destinationWithJosa} 침투합니다.`);
      }
    }
    attacker.engagementsInZone = (attacker.engagementsInZone ?? 0) + 1;
    if (!attacker.revealed && (battle.round >= 2 || applied(battle, 'setAmbush'))) attacker.revealed = true;
  }
  for (const advance of scheduledAdvances.values()) {
    const subject = advance.groupLabels.join('·');
    const movementEvents: TacticalAnimationEvent[] = [];
    event(
      movementEvents,
      advance.fromZoneId,
      'advance',
      advance.undefended
        ? `${withJosa(subject, '이/가')} 저항 없이 ${withJosa(advance.fromZoneName, '을/를')} 휩쓸고 ${withJosa(advance.destinationName, '으로/로')} 진입합니다.`
        : `${withJosa(subject, '이/가')} 교전을 마치고 ${withJosa(advance.destinationName, '으로/로')} 밀려듭니다.`,
      620,
      { side: 'raider', actorGroupIds: advance.groupIds },
    );
    let insertionIndex = events.length;
    for (let index = events.length - 1; index >= 0; index -= 1) {
      if (events[index].zoneId !== advance.fromZoneId) continue;
      insertionIndex = index + 1;
      break;
    }
    events.splice(insertionIndex, 0, ...movementEvents);
  }

  normalizeTacticalGroupTargets(battle);

  const activeRaiders = battle.raiderGroups.filter(group => group.intent !== 'withdraw' && group.power > 0);
  const nextFocusZoneId = activeRaiders
    .map(group => {
      const zoneId = group.pendingZoneId ?? group.zoneId;
      return { zoneId, score: group.power + (battle.zones.find(zone => zone.id === zoneId)?.pressure ?? 0) };
    })
    .sort((a, b) => b.score - a.score)[0]?.zoneId ?? focusZoneId;

  const priorLootRounds = battle.reports.filter(report => Object.values(report.loot).some(amount => (amount ?? 0) > 0)).length;
  const thisRoundLooted = Object.values(lootBag).some(amount => (amount ?? 0) > 0);
  const priorBuildingDamage = battle.reports.reduce((sum, report) => sum + report.buildingsDamaged, 0);
  const objectiveOutcome = tacticalEnemyObjectiveOutcome(
    battle.enemyPlan?.objective ?? 'breakthrough',
    priorLootRounds,
    thisRoundLooted,
    priorBuildingDamage,
    buildingsDamaged,
  );
  const totalRaiderPower = battle.raiderGroups.reduce((sum, group) => sum + group.power, 0);
  const center = battle.zones.find(zone => zone.id === 'center')!;
  let outcome: TacticalRoundReport['outcome'];
  if (battle.raiderMorale <= 0 || totalRaiderPower <= battle.originalPower * 0.18 || activeRaiders.length === 0) {
    outcome = 'defenseSuccess';
  } else if (battle.villageMorale <= 0 || center.breached) {
    outcome = 'villageRouted';
  } else if (objectiveOutcome) {
    outcome = objectiveOutcome;
  } else if (battle.round >= CONFIG.tacticalBattle.maxRounds) {
    const sufferedLoss = battle.zones.some(zone => zone.breached) || priorLootRounds > 0 || thisRoundLooted;
    outcome = tacticalMaximumRoundOutcome(sufferedLoss);
  }

  if (roundWounded > 0 || roundKilled > 0) lines.push(`이번 교전 수비 피해: 전사 ${roundKilled}명, 부상 ${roundWounded}명.`);
  if (roundRaidersKilled > 0) lines.push(`이번 교전 적 피해: ${roundRaidersKilled}명 처치.`);
  if (thisRoundLooted) lines.push(`창고 피해 예상: ${describeLootLosses(lootBag)}.`);
  if (buildingsDamaged > 0) lines.push(`방어 시설과 건물 ${buildingsDamaged}곳이 파손될 위험에 놓였습니다.`);
  lines.push(`마을 기세 ${villageMoraleDelta >= 0 ? '+' : ''}${villageMoraleDelta}, 적 기세 ${raiderMoraleDelta}.`);
  if (outcome) event(events, nextFocusZoneId, outcome === 'defenseSuccess' ? 'moraleBreak' : 'report', summaryForOutcome(outcome), 900);
  else event(events, nextFocusZoneId, 'camera', '다음으로 위급한 전선이 드러납니다.', 500);

  const report: TacticalRoundReport = {
    round: battle.round,
    focusZoneId,
    nextFocusZoneId,
    summary: outcome ? summaryForOutcome(outcome) : `제${battle.round}차 교전이 끝났습니다. 다음 전선을 지휘하십시오.`,
    lines,
    events,
    routeAdvances,
    routeEngagements: routeResolution.engagements,
    routeArrivals: routeResolution.arrivals,
    wounded: roundWounded,
    treated: treatment.treated,
    raiderPowerRestored,
    killed: roundKilled,
    raidersKilled: roundRaidersKilled,
    loot: lootBag,
    buildingsDamaged,
    villageMoraleDelta,
    raiderMoraleDelta,
    ended: outcome != null,
    outcome,
  };
  battle.reports.push(report);
  battle.pendingReport = report;
  battle.round += 1;
  const remainingMusketReadiness = allocateMusketReadiness(
    state,
    battle.defenderGroups.filter(group => group.weapon === 'musket' && activeCount(group) > 0)
      .map(group => ({ id: group.id, residentIds: group.residentIds.slice(0, activeCount(group)) })),
    CONFIG.raid.powderPerMusket,
  );
  for (const group of battle.defenderGroups.filter(group => group.weapon === 'musket')) {
    group.readyMuskets = remainingMusketReadiness.byGroup[group.id] ?? 0;
  }
  battle.phase = 'simulating';
  return null;
}

export function completeTacticalSimulation(state: GameState): string | null {
  const battle = state.tacticalBattle;
  if (!battle) return '진행 중인 직접 지휘 전투가 없습니다.';
  if (battle.phase !== 'simulating') return '재생 중인 교전이 없습니다.';
  if (battle.assaultKind === 'predatorHunt') applyHuntReportPositions(battle);
  else if (battle.orientation === 'assault') applyAssaultReportPositions(battle);
  else applyDefenseReportPositions(battle);
  for (const group of battle.defenderGroups) group.pendingFacing = undefined;
  battle.phase = 'report';
  return null;
}

export function acknowledgeTacticalReport(state: GameState): string | null {
  const battle = state.tacticalBattle;
  if (!battle || !battle.pendingReport) return '확인할 전투 보고가 없습니다.';
  if (battle.assaultKind === 'predatorHunt') return acknowledgeHuntReport(state);
  if (battle.orientation === 'assault') return acknowledgeAssaultReport(state);
  if (battle.phase !== 'report') return '아직 전투 연출이 끝나지 않았습니다.';
  applyDefenseReportPositions(battle);
  if (battle.pendingReport.ended) {
    battle.phase = 'finished';
    return null;
  }
  battle.defenderGroups.forEach(group => {
    if (group.command && tacticalCommandUnavailableReason(battle, group, group.command)) {
      group.command = null;
      group.commandSource = undefined;
    } else if (group.command) group.commandSource = 'recommended';
  });
  chooseDefaultTacticalCommands(battle);
  battle.pendingReport = null;
  battle.phase = 'command';
  return null;
}

function mergeLoot(reports: TacticalRoundReport[]): Partial<Record<ResourceId, number>> {
  const total: Partial<Record<ResourceId, number>> = {};
  for (const report of reports) {
    for (const [key, amount] of Object.entries(report.loot)) {
      const resource = key as ResourceId;
      total[resource] = (total[resource] ?? 0) + (amount ?? 0);
    }
  }
  return total;
}

function hasLoot(loot: Partial<Record<ResourceId, number>>): boolean {
  return Object.values(loot).some(amount => (amount ?? 0) > 1e-9);
}

function activeMountedDefenderCount(battle: TacticalBattle): number {
  return battle.defenderGroups.reduce((sum, group) =>
    sum + (group.mount === 'horse' ? activeCount(group) : 0), 0);
}

export function routedLootRecoveryRate(mountedCount: number): number {
  return Math.min(
    CONFIG.mounted.routedLootRecoveryMax,
    CONFIG.mounted.routedLootRecoveryBase +
      Math.max(0, mountedCount) * CONFIG.mounted.routedLootRecoveryPerMounted,
  );
}

export function mountedPursuitKills(mountedCount: number, escapedCount: number): number {
  return Math.min(
    Math.max(0, Math.floor(escapedCount)),
    CONFIG.mounted.pursuitKillsMax,
    Math.round(Math.max(0, mountedCount) * CONFIG.mounted.pursuitKillsPerMounted),
  );
}

function recoverRoutedLoot(
  state: GameState,
  stolen: Partial<Record<ResourceId, number>>,
  recoveryRate: number,
): { netLoss: Partial<Record<ResourceId, number>>; recovered: Partial<Record<ResourceId, number>> } {
  const netLoss: Partial<Record<ResourceId, number>> = {};
  const recovered: Partial<Record<ResourceId, number>> = {};
  for (const [resourceKey, rawAmount] of Object.entries(stolen)) {
    const resource = resourceKey as ResourceId;
    const amount = Math.max(0, rawAmount ?? 0);
    const recoveredAmount = Math.round(amount * recoveryRate * 100) / 100;
    if (recoveredAmount > 0) {
      state.resources[resource] += recoveredAmount;
      recovered[resource] = recoveredAmount;
    }
    const lost = Math.max(0, amount - recoveredAmount);
    if (lost > 0) netLoss[resource] = lost;
  }
  return { netLoss, recovered };
}

function outcomeLabel(
  outcome: TacticalRoundReport['outcome'],
  factionName: string,
  result: 'victory' | 'defeat',
  looted: boolean,
  enemyRouted: boolean,
): string {
  if (enemyRouted) return '적을 궤주시켰습니다';
  if (factionName === '조정 토벌군') {
    if (outcome === 'defenseSuccess') return '토벌대의 공격을 막아냈습니다';
    if (outcome === 'villageRouted') return '마을 방어선이 무너졌습니다';
    return '토벌대의 공격을 막지 못했습니다';
  }
  if (!looted) return result === 'victory'
    ? '습격대의 약탈을 막아냈습니다'
    : '약탈은 막았지만 아군 피해가 극심합니다';
  if (outcome === 'villageRouted') return '마을 방어선이 무너졌습니다';
  return '습격대의 약탈을 막지 못했습니다';
}

function tacticalFlankOutcomeSummary(
  label: string,
  outcome: TacticalBattleFlankOutcome,
  defenderArrivals: number,
  raiderArrivals: number,
): string {
  if (outcome === 'raiderReachedRear') return `${label}에서 적 우회대 ${raiderArrivals}개 조가 아군 후열에 도달했습니다.`;
  if (outcome === 'defenderReachedRear') return `${label}에서 아군 우회대 ${defenderArrivals}개 조가 적 후열에 도달했습니다.`;
  if (outcome === 'defenderHeld') return `${label}의 차단대가 적 우회 시도를 저지했습니다.`;
  if (outcome === 'contested') return `${label}의 통제권을 두고 교전했으나 출구 돌파는 없었습니다.`;
  return `${label}이 열렸지만 경로 교전이나 후열 도달은 없었습니다.`;
}

export function tacticalBattleTacticsReport(battle: TacticalBattle): TacticalBattleTacticsReport {
  const doctrineId = battle.enemyPlan?.doctrine;
  const compositionTemplateId = battle.enemyPlan?.compositionTemplateId;
  const composition = tacticalCompositionTemplate(compositionTemplateId);
  const routeEngagements = battle.reports.flatMap(report => report.routeEngagements ?? []);
  const routeArrivals = battle.reports.flatMap(report => report.routeArrivals ?? []);
  const flankRoutes = (battle.flankRoutes ?? []).flatMap(route => {
    const engagements = routeEngagements.filter(entry => entry.routeId === route.id);
    const arrivals = routeArrivals.filter(entry => entry.routeId === route.id);
    if (!route.openedByDefender && !route.openedByRaider && engagements.length === 0 && arrivals.length === 0) return [];
    const defenderHolds = engagements.filter(entry => entry.outcome === 'defenderHeld').length;
    const raiderBreakthroughs = engagements.filter(entry => entry.outcome === 'raiderBreakthrough').length;
    const contestedEngagements = engagements.filter(entry => entry.outcome === 'contested').length;
    const defenderArrivals = arrivals.filter(entry => entry.side === 'defender').length;
    const raiderArrivals = arrivals.filter(entry => entry.side === 'raider').length;
    const outcome: TacticalBattleFlankOutcome = raiderArrivals > 0
      ? 'raiderReachedRear'
      : defenderArrivals > 0
        ? 'defenderReachedRear'
        : engagements.length === 0
          ? 'unused'
          : route.control === 'defender' && defenderHolds > 0
            ? 'defenderHeld'
            : 'contested';
    return [{
      routeId: route.id,
      side: route.side,
      label: route.label,
      finalControl: route.control,
      outcome,
      engagements: engagements.length,
      defenderHolds,
      raiderBreakthroughs,
      contestedEngagements,
      defenderArrivals,
      raiderArrivals,
      summary: tacticalFlankOutcomeSummary(route.label, outcome, defenderArrivals, raiderArrivals),
    }];
  });
  return {
    doctrineId,
    doctrineLabel: doctrineId ? enemyDoctrineDefinition(doctrineId).label : '미확인 교리',
    compositionTemplateId,
    compositionLabel: composition?.label ?? '미확인 편제',
    flankRoutes,
  };
}

export function finishTacticalBattle(state: GameState): void {
  const battle = state.tacticalBattle;
  if (!battle) return;
  if (battle.assaultKind === 'predatorHunt') {
    finishPredatorTacticalHunt(state);
    return;
  }
  if (battle.orientation === 'assault') {
    finishBanditLairTacticalAssault(state);
    return;
  }
  const finalReport = [...battle.reports].reverse().find(report => report.ended) ?? battle.reports[battle.reports.length - 1];
  const outcome = finalReport?.outcome ?? 'partialLoss';
  const rng = makeRng(state.seed + battle.id * 524287 + 97);
  const beforeHealth = new Map(state.residents.map(resident => [resident.id, resident.health]));
  const participantIds = new Set<number>();

  for (const defender of battle.defenderGroups) {
    defender.residentIds.forEach(id => participantIds.add(id));
    if (defender.killed > 0) {
      killResidents(state, rng, defender.killed, 1, defender.residentIds);
    }
    if (defender.wounded > 0) {
      injure(state, rng, defender.wounded, tacticalInjurySeverityForGroup(battle, defender), defender.residentIds, true);
    }
  }
  const people = tacticalPeopleReport(state, battle, beforeHealth);
  const killedPeople = people.killed;
  const woundedPeople = people.wounded;
  const remainingEnemyPower = battle.raiderGroups.reduce((sum, group) => sum + Math.max(0, group.power), 0);
  const enemyRouted = outcome === 'defenseSuccess' && (
    battle.raiderMorale <= 20 ||
    remainingEnemyPower <= battle.initialEnemyPower * 0.35 ||
    battle.raiderGroups.every(group => group.intent === 'withdraw' || group.power <= 0)
  );
  const mountedPursuers = activeMountedDefenderCount(battle);
  const grossLootLosses = applyLootLosses(state, mergeLoot(battle.reports));
  let lootLosses = grossLootLosses;
  let recoveredLoot: Partial<Record<ResourceId, number>> = {};
  if (battle.factionName !== '조정 토벌군' && enemyRouted && hasLoot(grossLootLosses)) {
    const recovery = recoverRoutedLoot(state, grossLootLosses, routedLootRecoveryRate(mountedPursuers));
    lootLosses = recovery.netLoss;
    recoveredLoot = recovery.recovered;
  }
  const looted = hasLoot(grossLootLosses);
  const damageCount = battle.reports.reduce((sum, report) => sum + report.buildingsDamaged, 0);
  const damaged = damageBuildings(state, rng, damageCount);
  const moraleDelta = battle.reports.reduce((sum, report) => sum + report.villageMoraleDelta, 0);
  moraleShock(state, -moraleDelta);

  const raidersCommitted = battle.raiderGroups.reduce((sum, group) => sum + group.count, 0);
  const combatKills = Math.min(raidersCommitted, battle.raiderGroups.reduce((sum, group) => sum + group.killed, 0));
  const pursuitKills = battle.factionName !== '조정 토벌군' && enemyRouted
    ? mountedPursuitKills(mountedPursuers, raidersCommitted - combatKills)
    : 0;
  const raidersKilled = Math.min(raidersCommitted, combatKills + pursuitKills);
  const raidersEscaped = Math.max(0, raidersCommitted - raidersKilled);
  const objective = raidDefenseObjectiveResult({
    factionName: battle.factionName,
    outcome,
    enemyRouted,
    looted,
    defendersCommitted: participantIds.size,
    defendersKilled: killedPeople.length,
    defendersWounded: woundedPeople.length,
  });
  const result = objective.result;
  const closingSummary = tacticalClosingSummary('raidDefense', outcome, battle.factionName, { looted, enemyRouted });
  const gradeEvaluation = gradeTacticalBattle({
    encounterKind: 'raidDefense',
    result,
    friendlyPower: battle.initialFriendlyPower,
    enemyPower: battle.initialEnemyPower,
    defendersCommitted: participantIds.size,
    defendersKilled: killedPeople.length,
    defendersWounded: woundedPeople.length,
    enemiesCommitted: raidersCommitted,
    enemiesKilled: raidersKilled,
    loot: lootLosses,
  });
  const battleGrade = objective.forcedGrade ?? gradeEvaluation.grade;
  const requestedReputationDelta = battleGrade === 'greatVictory' ? 6
    : battleGrade === 'victory' ? 5
      : battleGrade === 'narrowVictory' ? 2
        : battleGrade === 'narrowDefeat' ? -1
          : battleGrade === 'defeat' ? -3 : -6;
  const reputationBefore = state.resources.reputation;
  state.resources.reputation = clamp(state.resources.reputation + requestedReputationDelta, 0, 100);
  const relationBefore = state.relations[battle.factionName] ?? 50;
  changeRelation(state, battle.factionName, result === 'victory' ? CONFIG.relations.militiaWin : CONFIG.relations.militiaLoss);
  const relationDelta = (state.relations[battle.factionName] ?? relationBefore) - relationBefore;
  state.threat = result === 'victory'
    ? CONFIG.threat.afterRaidThreat
    : Math.min(100, CONFIG.threat.afterRaidThreat + (battleGrade === 'narrowDefeat' ? 10 : 20));
  state.raidCooldown = CONFIG.threat.raidCooldownDays;
  state.raiders = null;
  state.battle = null;

  for (const id of participantIds) {
    const resident = state.residents.find(candidate => candidate.id === id);
    if (resident?.alive) resetAgent(state, resident);
  }

  const date = `${getYear(state.day)}년차 ${getSeason(state.day) === 'spring' ? '봄' : getSeason(state.day) === 'summer' ? '여름' : getSeason(state.day) === 'autumn' ? '가을' : '겨울'} ${getDayOfSeason(state.day)}일`;
  const killedNames = killedPeople.map(person => person.name);
  const casualtyText = `전사 ${killedPeople.length}명${killedNames.length > 0 ? ` (${killedNames.join(', ')})` : ''}, 부상 ${woundedPeople.length}명`;
  const lootText = describeLootLosses(lootLosses);
  const highlights = [
    ...(pursuitKills > 0 ? [`기마 추격대가 달아나는 적 ${pursuitKills}명을 추가로 쓰러뜨렸습니다.`] : []),
    ...(hasLoot(recoveredLoot) ? [`적의 궤주 과정에서 회수한 물자: ${describeLootLosses(recoveredLoot)}.`] : []),
    ...battle.reports.flatMap(report => report.lines),
  ].filter((line, index, all) => all.indexOf(line) === index).slice(0, 10);
  state.tacticalBattleReport = {
    encounterKind: 'raidDefense',
    title: '전투 장계',
    friendlyLabel: battle.mode === 'levy' ? '민병' : '수비대',
    enemyLabel: battle.factionName,
    battleId: battle.id,
    date,
    factionName: battle.factionName,
    mode: battle.mode,
    warned: battle.warned,
    outcome,
    outcomeLabel: outcomeLabel(outcome, battle.factionName, result, looted, enemyRouted),
    result,
    grade: battleGrade,
    gradeScore: gradeEvaluation.score,
    closingSummary,
    initialFriendlyPower: battle.initialFriendlyPower,
    initialEnemyPower: battle.initialEnemyPower,
    rounds: battle.reports.length,
    villageMorale: Math.round(battle.villageMorale),
    raiderMorale: Math.round(battle.raiderMorale),
    defendersCommitted: participantIds.size,
    defendersSurvived: [...participantIds].filter(id => state.residents.find(resident => resident.id === id)?.alive).length,
    killed: killedPeople,
    wounded: woundedPeople,
    raidersCommitted,
    raidersKilled,
    raidersEscaped,
    damagedBuildings: damaged,
    loot: lootLosses,
    recoveredLoot,
    enemyRouted,
    reputationDelta: state.resources.reputation - reputationBefore,
    relationDelta,
    threatAfter: state.threat,
    highlights,
    resourceDelta: tacticalResourceDelta(state, battle),
    tactics: tacticalBattleTacticsReport(battle),
  };
  addLog(
    state,
    `전투 장계: ${date}, ${battle.factionName} 습격 방어전. ${TACTICAL_BATTLE_GRADE_LABELS[battleGrade]} — ${outcomeLabel(outcome, battle.factionName, result, looted, enemyRouted)}. ${closingSummary} ${casualtyText}, 적 ${raidersKilled}명 처치·${raidersEscaped}명 ${enemyRouted ? '도주' : '물러남'}, 건물 ${damaged.length}곳 파손, 자원 피해 ${lootText}.`,
    result === 'victory' ? 'good' : 'raid',
    true,
  );
  state.tacticalBattle = null;
}

export function dismissTacticalBattleReport(state: GameState): void {
  state.tacticalBattleReport = null;
}

export function tacticalCommandDescription(command: TacticalCommandId, ambushed = false): string {
  const descriptions: Record<TacticalCommandId, string> = {
    hold: '대열을 고수해 적게 피해를 주고받으며 전선을 안정시킵니다.',
    charge: '근접대가 강하게 돌격해 큰 피해를 주지만 자신과 후열 원거리 병종이 위험해집니다.',
    volley: '활과 조총 사격으로 적 기세를 꺾습니다. 악천후에는 약해집니다.',
    ambush: ambushed
      ? '같은 구역의 적을 급습해 확률적으로 혼란시키고 이번 교전 행동을 취소시킵니다.'
      : '적이 없는 현재 구역에 몸을 숨겨 다음 교전부터 매복중 상태가 됩니다.',
    guardStorehouse: '약탈 피해를 줄이는 대신 수비대가 더 큰 위험을 집니다.',
    protectCivilians: '주민 피해를 줄이지만 건물과 물자를 포기할 수 있습니다.',
    redeploy: '이번 교전 전력을 줄여 인접한 전열로 이동하고 다음 라운드부터 새 위치에서 싸웁니다.',
    reinforceRear: '중열 근접 예비대가 정면을 비우고 같은 구역의 후방 급습대를 막습니다.',
    fallback: '병력을 보존하며 구역을 내주고 다음 방어선으로 물러납니다.',
    advance: '이번 교전을 마친 뒤 한 단계 앞선 방어선으로 이동합니다.',
    arson: '준비한 불화살로 목책과 움막의 돌파를 앞당기지만 노획 일부가 불탑니다.',
    blockEscape: '사냥꾼을 본대에서 빼 두목의 산길 퇴로를 감시합니다.',
    openRetreat: '현재 성과를 포기하거나 챙긴 뒤 토벌대 전체가 질서 있게 철수합니다.',
    flankRoute: '열어 둔 우회로를 통과해 적 후열의 원거리·화포·지원 부대를 우선 급습합니다.',
  };
  return descriptions[command];
}

export function tacticalLootText(report: TacticalRoundReport): string {
  return Object.entries(report.loot)
    .filter(([, amount]) => (amount ?? 0) > 0)
    .map(([resource, amount]) => `${RESOURCE_NAMES[resource as ResourceId]} ${amount}`)
    .join(', ');
}
