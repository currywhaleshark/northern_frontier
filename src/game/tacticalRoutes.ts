import { CONFIG } from './config';
import { tacticalGroupCapabilities } from './combatCapabilities';
import { resolveEngagementExchange } from './tacticalEngagement';
import { tacticalUnitProfileOrUndefined } from './tacticalUnits';
import type {
  EnemyPlan,
  GameState,
  TacticalBattle,
  TacticalFlankRoute,
  TacticalRaiderGroup,
  TacticalRouteIntel,
  TacticalRouteSide,
  TacticalRouteTransit,
  TacticalRouteAdvance,
  TacticalRouteArrival,
  TacticalRouteEngagement,
  TacticalAnimationEvent,
  WeatherId,
} from './types';

export const TACTICAL_FLANK_ROUTE_IDS: Readonly<Record<TacticalRouteSide, string>> = Object.freeze({
  left: 'flank-left',
  right: 'flank-right',
});

function rearManeuver(plan: EnemyPlan | undefined) {
  return plan?.stratagems.find(stratagem => stratagem.id === 'rearManeuver');
}

function routeIntel(
  route: Pick<TacticalFlankRoute, 'side' | 'openedByDefender' | 'openedByRaider'>,
  plan: EnemyPlan | undefined,
): TacticalRouteIntel {
  if (route.openedByDefender) return 'revealed';
  if (!route.openedByRaider) return 'unknown';
  const maneuver = rearManeuver(plan);
  const nightApproach = plan?.stratagems.some(stratagem => stratagem.id === 'nightApproach') === true;
  if (maneuver?.revealed) return nightApproach ? 'suspected' : 'revealed';
  return (plan?.intelLevel ?? 0) >= 2 ? 'suspected' : 'unknown';
}

export function createTacticalFlankRoutes(plan?: EnemyPlan): TacticalFlankRoute[] {
  return (['left', 'right'] as const).map(side => {
    const definition = CONFIG.tacticalBattle.flankRoutes.sides[side];
    const openedByRaider = plan?.flankRouteSide === side && rearManeuver(plan) != null;
    const route: TacticalFlankRoute = {
      id: TACTICAL_FLANK_ROUTE_IDS[side],
      side,
      label: definition.label,
      terrain: definition.terrain,
      openedByDefender: false,
      openedByRaider,
      defenderIntel: 'unknown',
      control: 'neutral',
    };
    route.defenderIntel = routeIntel(route, plan);
    return route;
  });
}

export function tacticalRouteBySide(
  battle: Pick<TacticalBattle, 'flankRoutes'>,
  side: TacticalRouteSide,
): TacticalFlankRoute | undefined {
  return battle.flankRoutes?.find(route => route.side === side);
}

export function syncTacticalRouteControl(
  battle: Pick<TacticalBattle, 'flankRoutes' | 'defenderGroups' | 'raiderGroups'>,
  preserveEmpty = false,
): void {
  for (const route of battle.flankRoutes ?? []) {
    const defenderPresent = battle.defenderGroups.some(group => group.routeTransit?.routeId === route.id);
    const raiderPresent = battle.raiderGroups.some(group => group.routeTransit?.routeId === route.id);
    if (defenderPresent && raiderPresent) route.control = 'contested';
    else if (defenderPresent) route.control = 'defender';
    else if (raiderPresent) route.control = 'raider';
    else if (!preserveEmpty) route.control = 'neutral';
  }
}

export function syncTacticalRouteVisibility(
  battle: Pick<TacticalBattle, 'flankRoutes' | 'enemyPlan' | 'defenderGroups' | 'raiderGroups'>,
): void {
  for (const route of battle.flankRoutes ?? []) {
    route.defenderIntel = routeIntel(route, battle.enemyPlan);
  }
  const visibility = new Map((battle.flankRoutes ?? []).map(route => [route.id, route.defenderIntel === 'revealed']));
  for (const group of [...battle.defenderGroups, ...battle.raiderGroups]) {
    if (group.routeTransit) group.routeTransit.visibleToDefender = visibility.get(group.routeTransit.routeId) === true;
  }
}

export function tacticalFlankRoutePreparationUnavailableReason(
  state: Pick<GameState, 'tacticalBattle'>,
  side: TacticalRouteSide,
): string | null {
  const battle = state.tacticalBattle;
  if (!battle) return '진행 중인 직접 지휘 전투가 없습니다.';
  if (battle.encounterKind !== 'raidDefense' || battle.orientation === 'assault') {
    return '방어전에서만 우회로를 준비할 수 있습니다.';
  }
  if (battle.phase !== 'preparation') return '준비 단계가 이미 끝났습니다.';
  const route = tacticalRouteBySide(battle, side);
  if (!route) return '우회로 정보를 찾을 수 없습니다.';
  if (!route.openedByDefender && battle.prepPoints < CONFIG.tacticalBattle.flankRoutes.preparationCost) {
    return '남은 준비점수가 부족합니다.';
  }
  return null;
}

export interface TacticalFlankRoutePreparationOption {
  side: TacticalRouteSide;
  routeId: string;
  label: string;
  terrain: TacticalFlankRoute['terrain'];
  cost: number;
  selected: boolean;
  defenderIntel: TacticalRouteIntel;
  unavailableReason: string | null;
}

export function tacticalFlankRoutePreparationView(
  state: Pick<GameState, 'tacticalBattle'>,
): TacticalFlankRoutePreparationOption[] {
  const battle = state.tacticalBattle;
  if (!battle) return [];
  return (battle.flankRoutes ?? []).map(route => ({
    side: route.side,
    routeId: route.id,
    label: route.label,
    terrain: route.terrain,
    cost: CONFIG.tacticalBattle.flankRoutes.preparationCost,
    selected: route.openedByDefender,
    defenderIntel: route.defenderIntel,
    unavailableReason: tacticalFlankRoutePreparationUnavailableReason(state, route.side),
  }));
}

/** 준비 단계에서 좌·우 경로를 각각 토글한다. 열린 경로는 배치 전부터 공개된다. */
export function toggleTacticalFlankRoutePreparation(
  state: Pick<GameState, 'tacticalBattle'>,
  side: TacticalRouteSide,
): string | null {
  const unavailable = tacticalFlankRoutePreparationUnavailableReason(state, side);
  if (unavailable) return unavailable;
  const battle = state.tacticalBattle!;
  const route = tacticalRouteBySide(battle, side)!;
  const cost = CONFIG.tacticalBattle.flankRoutes.preparationCost;
  route.openedByDefender = !route.openedByDefender;
  battle.prepPoints += route.openedByDefender ? -cost : cost;
  const action = battle.prepActions.find(candidate => candidate.id === 'openFlankRoute');
  if (action) {
    action.selected = battle.flankRoutes?.some(candidate => candidate.openedByDefender) === true;
    action.applied = false;
  }
  syncTacticalRouteVisibility(battle);
  return null;
}

export function tacticalRouteRoundsRequired(
  group: Pick<TacticalRaiderGroup, 'unitType'>,
  route: Pick<TacticalFlankRoute, 'terrain'>,
  weather: WeatherId,
): number {
  const profile = tacticalUnitProfileOrUndefined(group.unitType);
  let rounds = profile?.routeSpeed === 2 ? 1 : 2;
  if (route.terrain === 'woodedRidge' && profile?.tags.includes('mounted')) rounds = Math.max(rounds, 2);
  const weatherDelayed = weather === 'blizzard' || (weather === 'thawFlood' && route.terrain === 'riverBank');
  return rounds + (weatherDelayed ? CONFIG.tacticalBattle.flankRoutes.weatherDelayRounds : 0);
}

function defenderRouteRoundsRequired(
  group: TacticalBattle['defenderGroups'][number],
  route: Pick<TacticalFlankRoute, 'terrain'>,
  weather: WeatherId,
): number {
  const mounted = tacticalGroupCapabilities(group).has('mounted');
  let rounds = mounted ? 1 : 2;
  if (route.terrain === 'woodedRidge' && mounted) rounds = 2;
  const weatherDelayed = weather === 'blizzard' || (weather === 'thawFlood' && route.terrain === 'riverBank');
  return rounds + (weatherDelayed ? CONFIG.tacticalBattle.flankRoutes.weatherDelayRounds : 0);
}

function activeDefenderCount(group: TacticalBattle['defenderGroups'][number]): number {
  return Math.max(0, group.count - group.wounded - group.killed);
}

function combatRouteGroup(group: TacticalBattle['defenderGroups'][number]): boolean {
  if (group.commandable === false || group.kind === 'civilian' || group.kind === 'healer') return false;
  const capabilities = tacticalGroupCapabilities(group);
  return capabilities.has('melee') || capabilities.has('volley') || capabilities.has('charge');
}

export function tacticalRoutePlacementUnavailableReason(
  battle: TacticalBattle,
  groupId: string,
  side: TacticalRouteSide,
): string | null {
  if (battle.phase !== 'deployment') return '배치 단계에서만 우회로에 부대를 배치할 수 있습니다.';
  if (battle.orientation === 'assault' || battle.encounterKind !== 'raidDefense') {
    return '방어전에서만 우회로 차단대를 배치할 수 있습니다.';
  }
  const route = tacticalRouteBySide(battle, side);
  if (!route?.openedByDefender) return '먼저 이 우회로를 개방해야 합니다.';
  const group = battle.defenderGroups.find(candidate => candidate.id === groupId);
  if (!group || activeDefenderCount(group) <= 0) return '배치할 수 있는 아군 부대를 찾지 못했습니다.';
  if (!combatRouteGroup(group)) return '전투 가능한 부대만 우회로를 차단할 수 있습니다.';
  if (battle.deploymentPlacements?.[group.id] == null) return '먼저 부대를 일반 전장에 배치해야 합니다.';
  return null;
}

/** Places a combat group at the route middle as a prepared blocker. */
export function placeTacticalRouteBlocker(
  state: Pick<GameState, 'tacticalBattle' | 'weather'>,
  groupId: string,
  side: TacticalRouteSide,
): string | null {
  const battle = state.tacticalBattle;
  if (!battle) return '진행 중인 전투가 없습니다.';
  const reason = tacticalRoutePlacementUnavailableReason(battle, groupId, side);
  if (reason) return reason;
  const route = tacticalRouteBySide(battle, side)!;
  const group = battle.defenderGroups.find(candidate => candidate.id === groupId)!;
  const current = battle.deploymentPlacements?.[group.id]!;
  group.routeTransit = {
    routeId: route.id,
    purpose: 'block',
    step: 1,
    destinationZoneId: battle.zones.some(zone => zone.id === 'wall') ? 'wall' : current.zoneId,
    originZoneId: current.zoneId,
    visibleToDefender: true,
    startedRound: battle.round,
    elapsedRounds: 0,
    roundsRequired: defenderRouteRoundsRequired(group, route, state.weather),
    engagements: 0,
  };
  group.zoneId = '';
  group.command = 'hold';
  group.commandSource = 'player';
  battle.deploymentPlacements![group.id] = { ...current, routeId: route.id };
  syncTacticalRouteControl(battle);
  return null;
}

export function tacticalRouteOrderUnavailableReason(
  battle: TacticalBattle,
  groupId: string,
): string | null {
  if (battle.phase !== 'command') return '지휘 단계에서만 우회 기동을 명령할 수 있습니다.';
  const group = battle.defenderGroups.find(candidate => candidate.id === groupId);
  if (!group?.routeTransit || group.routeTransit.purpose !== 'block') {
    return '개방된 우회로에 배치된 차단대만 우회 기동할 수 있습니다.';
  }
  if (activeDefenderCount(group) <= 0 || !combatRouteGroup(group)) return '우회 기동할 전투 병력이 없습니다.';
  return null;
}

/** Converts a prepared blocker into a raid transit. It remains out of frontal combat. */
export function orderTacticalRouteRaid(
  state: Pick<GameState, 'tacticalBattle' | 'weather'>,
  groupId: string,
): string | null {
  const battle = state.tacticalBattle;
  if (!battle) return '진행 중인 전투가 없습니다.';
  const reason = tacticalRouteOrderUnavailableReason(battle, groupId);
  if (reason) return reason;
  const group = battle.defenderGroups.find(candidate => candidate.id === groupId)!;
  const transit = group.routeTransit!;
  const route = battle.flankRoutes!.find(candidate => candidate.id === transit.routeId)!;
  transit.purpose = 'raid';
  transit.step = 0;
  transit.elapsedRounds = 0;
  transit.startedRound = battle.round;
  transit.roundsRequired = defenderRouteRoundsRequired(group, route, state.weather);
  group.command = 'flankRoute';
  group.commandSource = 'player';
  return null;
}

export function initializeEnemyTacticalRouteTransit(battle: TacticalBattle, weather: WeatherId): void {
  const route = battle.flankRoutes?.find(candidate => candidate.openedByRaider);
  if (!route) return;
  for (const group of battle.raiderGroups) {
    if (group.kind !== 'flankers' || group.flankPlan !== 'rearAssault' || group.routeTransit ||
        (group.rearAssault === true && group.engagementsInZone > 0)) continue;
    group.zoneId = battle.zones.some(zone => zone.id === 'approach') ? 'approach' : group.zoneId;
    group.targetZoneId = battle.zones.some(zone => zone.id === 'wall') ? 'wall' : group.targetZoneId;
    group.rearAssault = false;
    group.aiState = 'routeTransit';
    group.routeTransit = {
      routeId: route.id,
      purpose: 'raid',
      step: 0,
      destinationZoneId: group.targetZoneId,
      originZoneId: group.zoneId,
      visibleToDefender: route.defenderIntel === 'revealed',
      startedRound: battle.round,
      elapsedRounds: 0,
      roundsRequired: tacticalRouteRoundsRequired(group, route, weather),
      engagements: 0,
    };
  }
}

/** Advances route movement only; contact and exit effects are resolved separately for replay stability. */
export function advanceTacticalRouteTransits(
  battle: Pick<TacticalBattle, 'flankRoutes' | 'defenderGroups' | 'raiderGroups'>,
): TacticalRouteAdvance[] {
  const routes = new Map((battle.flankRoutes ?? []).map(route => [route.id, route]));
  const advances: TacticalRouteAdvance[] = [];
  for (const group of [...battle.defenderGroups, ...battle.raiderGroups]) {
    const transit = group.routeTransit;
    if (!transit || transit.step === 2 || transit.purpose === 'block') continue;
    const route = routes.get(transit.routeId);
    if (!route) continue;
    const groupIsDefender = battle.defenderGroups.some(candidate => candidate.id === group.id);
    const opposedAtMiddle = transit.step === 1 && (groupIsDefender
      ? battle.raiderGroups.some(candidate => candidate.routeTransit?.routeId === transit.routeId &&
        candidate.routeTransit.step === 1 && candidate.power > 0)
      : battle.defenderGroups.some(candidate => candidate.routeTransit?.routeId === transit.routeId &&
        candidate.routeTransit.step === 1 && activeDefenderCount(candidate) > 0));
    if (opposedAtMiddle) continue;
    const fromStep = transit.step;
    transit.elapsedRounds = Math.min(transit.roundsRequired, transit.elapsedRounds + 1);
    transit.step = transit.elapsedRounds >= transit.roundsRequired ? 2 : 1;
    transit.visibleToDefender = route.defenderIntel === 'revealed';
    if ('aiState' in group) group.aiState = 'routeTransit';
    advances.push({
      groupId: group.id,
      routeId: route.id,
      fromStep,
      toStep: transit.step,
      visibleToDefender: transit.visibleToDefender,
      arrivedAtExit: transit.step === 2,
    });
  }
  syncTacticalRouteControl(battle, true);
  return advances;
}

export interface TacticalRouteRoundResolution {
  engagements: TacticalRouteEngagement[];
  arrivals: TacticalRouteArrival[];
  events: TacticalAnimationEvent[];
  lines: string[];
  wounded: number;
  killed: number;
  raidersKilled: number;
  villageMoraleDelta: number;
  raiderMoraleDelta: number;
}

function routeZone(route: TacticalFlankRoute): TacticalBattle['zones'][number] {
  return {
    id: 'approach',
    name: route.label,
    kind: route.terrain === 'woodedRidge' ? 'forest' : 'ford',
    order: 0,
    pressure: 0,
    breached: false,
    defenseBonus: 0,
    ambushBonus: 0,
    lootRisk: 0,
    civilianRisk: 0,
    description: route.label,
  };
}

function isolatedRanged(group: TacticalBattle['defenderGroups'][number]): boolean {
  const capabilities = tacticalGroupCapabilities(group);
  return capabilities.has('volley') && !capabilities.has('melee');
}

function applyDefenderRetreat(battle: TacticalBattle, group: TacticalBattle['defenderGroups'][number]): void {
  const transit = group.routeTransit;
  if (!transit) return;
  group.zoneId = transit.originZoneId;
  group.routeTransit = undefined;
  group.command = 'fallback';
  group.commandSource = undefined;
  const placement = battle.deploymentPlacements?.[group.id];
  if (placement) battle.deploymentPlacements![group.id] = { ...placement, routeId: undefined };
}

function rearPriority(group: TacticalBattle['raiderGroups'][number]): number {
  const tags = tacticalUnitProfileOrUndefined(group.unitType)?.tags ?? [];
  if (tags.includes('artillery')) return 5;
  if (tags.includes('support')) return 4;
  if (tags.includes('firearm')) return 3;
  if (tags.includes('ranged')) return 2;
  return group.line === 'rear' ? 1 : 0;
}

/** Resolves route-only contact, then releases exit arrivals into the normal rear-engagement path. */
export function resolveTacticalRouteRound(
  battle: TacticalBattle,
  advances: ReadonlyArray<TacticalRouteAdvance>,
  weather: WeatherId,
  rng: () => number,
): TacticalRouteRoundResolution {
  const result: TacticalRouteRoundResolution = {
    engagements: [], arrivals: [], events: [], lines: [], wounded: 0, killed: 0,
    raidersKilled: 0, villageMoraleDelta: 0, raiderMoraleDelta: 0,
  };
  const engagedRaiderIds = new Set<string>();
  for (const route of battle.flankRoutes ?? []) {
    const crossingIds = new Set(advances.filter(advance => advance.routeId === route.id && advance.fromStep === 0)
      .map(advance => advance.groupId));
    const defenderCrossing = battle.defenderGroups.some(group => crossingIds.has(group.id));
    const raiderCrossing = battle.raiderGroups.some(group => crossingIds.has(group.id));
    if (defenderCrossing && raiderCrossing) {
      for (const group of [...battle.defenderGroups, ...battle.raiderGroups]) {
        if (!crossingIds.has(group.id) || group.routeTransit?.routeId !== route.id) continue;
        group.routeTransit.step = 1;
        const advance = advances.find(candidate => candidate.groupId === group.id && candidate.routeId === route.id);
        if (advance) {
          advance.toStep = 1;
          advance.arrivedAtExit = false;
        }
      }
    }
    const blockers = battle.defenderGroups.filter(group => group.routeTransit?.routeId === route.id &&
      group.routeTransit.step === 1 && activeDefenderCount(group) > 0);
    const raiders = battle.raiderGroups.filter(group => group.routeTransit?.routeId === route.id &&
      group.routeTransit.purpose === 'raid' && (crossingIds.has(group.id) || group.routeTransit.step === 1) &&
      group.power > 0);
    if (blockers.length === 0 || raiders.length === 0) continue;
    raiders.forEach(group => {
      engagedRaiderIds.add(group.id);
      if (group.routeTransit) group.routeTransit.step = 1;
    });
    const exchange = resolveEngagementExchange({
      zone: routeZone(route),
      defenders: blockers,
      attackers: raiders.map(group => ({
        ...group,
        engagementsInZone: group.routeTransit?.engagements ?? 0,
      })),
      direction: 'frontal',
      weather,
      prepareVolleyApplied: false,
      evacuateCiviliansApplied: false,
      roundStartingRaiderPower: Math.max(1, raiders.reduce((sum, group) => sum + group.power, 0)),
      defenderPowerMultiplier: defender => defender.routeTransit?.purpose === 'block'
        ? CONFIG.tacticalBattle.flankRoutes.engagement.preparedBlockPowerMultiplier : 1,
      defenderCasualtyMultiplier: defender => isolatedRanged(defender)
        ? CONFIG.tacticalBattle.flankRoutes.engagement.isolatedRangedCasualtyMultiplier : 1,
      retreatPowerThreshold: 0,
      rng,
    });
    let defenderLosses = 0;
    let raiderLosses = 0;
    for (const loss of exchange.defenderLosses) {
      const group = blockers.find(candidate => candidate.id === loss.groupId);
      if (!group) continue;
      group.wounded += loss.wounded;
      group.killed += loss.killed;
      defenderLosses += loss.wounded + loss.killed;
      result.wounded += loss.wounded;
      result.killed += loss.killed;
    }
    for (const loss of exchange.raiderLosses) {
      const group = raiders.find(candidate => candidate.id === loss.groupId);
      if (!group) continue;
      group.killed += loss.killed;
      group.power = loss.powerAfter;
      raiderLosses += loss.killed;
      result.raidersKilled += loss.killed;
    }
    raiders.forEach(group => {
      if (group.routeTransit) group.routeTransit.engagements += 1;
    });
    let anyRaiderWithdrew = false;
    const defenderHeld = exchange.defenseShare >= CONFIG.tacticalBattle.flankRoutes.engagement.defenderWinShare;
    const raiderBrokeThrough = exchange.enemyShare >= CONFIG.tacticalBattle.flankRoutes.engagement.raiderWinShare;
    let outcome: TacticalRouteEngagement['outcome'] = 'contested';
    if (defenderHeld) {
      outcome = 'defenderHeld';
      route.control = 'defender';
      for (const raider of raiders) {
        const withdraw = raider.morale + exchange.raiderMoraleDelta <=
          CONFIG.tacticalBattle.flankRoutes.engagement.withdrawMoraleThreshold ||
          exchange.retreatingAttackerIds.includes(raider.id) || raider.power <= 0;
        if (withdraw) {
          anyRaiderWithdrew = true;
          raider.zoneId = raider.routeTransit?.originZoneId ?? 'approach';
          raider.routeTransit = undefined;
          raider.intent = 'withdraw';
          raider.aiState = 'withdrawing';
        } else if (raider.routeTransit) {
          raider.routeTransit.step = 0;
          raider.routeTransit.elapsedRounds = 0;
        }
      }
    } else if (raiderBrokeThrough) {
      outcome = 'raiderBreakthrough';
      route.control = 'raider';
      blockers.forEach(group => applyDefenderRetreat(battle, group));
    } else {
      route.control = 'contested';
      blockers.forEach(group => { if (group.routeTransit) group.routeTransit.step = 1; });
      raiders.forEach(group => { if (group.routeTransit) group.routeTransit.step = 1; });
    }
    const engagementLines = [
      `${route.label} 중간 지점에서 ${blockers.map(group => group.label).join(', ')}와 ${raiders.map(group => group.label).join(', ')}가 교전했습니다.`,
      outcome === 'defenderHeld' ? '차단대가 우회로를 지켜 적을 입구로 밀어냈습니다.'
        : outcome === 'raiderBreakthrough' ? '적이 차단대를 밀어내고 후방 출구를 향합니다.'
          : '양측이 우회로 중간 지점에서 대치합니다.',
    ];
    result.engagements.push({
      routeId: route.id,
      defenderGroupIds: blockers.map(group => group.id),
      raiderGroupIds: raiders.map(group => group.id),
      outcome,
      defenderLosses,
      raiderLosses,
      defenderRetreated: outcome === 'raiderBreakthrough',
      raiderRetreated: anyRaiderWithdrew,
      lines: engagementLines,
    });
    result.events.push(...exchange.preDefenseEvents, ...exchange.postDefenseEvents);
    result.lines.push(...engagementLines);
    result.villageMoraleDelta += exchange.villageMoraleDelta;
    result.raiderMoraleDelta += exchange.raiderMoraleDelta;
  }

  for (const group of battle.raiderGroups) {
    const transit = group.routeTransit;
    if (!transit || transit.purpose !== 'raid' || transit.step !== 2 || engagedRaiderIds.has(group.id)) continue;
    const route = battle.flankRoutes?.find(candidate => candidate.id === transit.routeId);
    if (!route) continue;
    group.zoneId = transit.destinationZoneId;
    group.targetZoneId = transit.destinationZoneId;
    group.routeTransit = undefined;
    group.rearAssault = true;
    group.engagementsInZone = 0;
    group.aiState = 'engaging';
    route.control = 'raider';
    result.arrivals.push({ routeId: route.id, groupId: group.id, side: 'raider',
      destinationZoneId: group.zoneId, rearAssault: true });
    result.lines.push(`${group.label}이 ${route.label} 후방 출구에 도달했습니다.`);
  }
  for (const group of battle.defenderGroups) {
    const transit = group.routeTransit;
    if (!transit || transit.purpose !== 'raid' || transit.step !== 2) continue;
    const route = battle.flankRoutes?.find(candidate => candidate.id === transit.routeId);
    if (!route) continue;
    group.zoneId = transit.destinationZoneId;
    group.routeTransit = undefined;
    group.command = 'charge';
    group.rearRaidRound = battle.round;
    const targets = battle.raiderGroups.filter(candidate => !candidate.routeTransit && candidate.zoneId === group.zoneId &&
      candidate.intent !== 'withdraw' && candidate.power > 0).sort((left, right) => rearPriority(right) - rearPriority(left));
    group.targetGroupId = targets[0]?.id;
    group.targetSource = 'auto';
    route.control = 'defender';
    const placement = battle.deploymentPlacements?.[group.id];
    if (placement) battle.deploymentPlacements![group.id] = { ...placement, zoneId: group.zoneId, routeId: undefined };
    result.arrivals.push({ routeId: route.id, groupId: group.id, side: 'defender',
      destinationZoneId: group.zoneId, rearAssault: true });
    result.lines.push(`${group.label}이 ${route.label}을 통과해 적 후열을 급습합니다.`);
  }
  return result;
}

export interface TacticalFlankRouteView {
  route: TacticalFlankRoute;
  display: 'hidden' | 'suspected' | 'revealed';
  transits: Array<{ groupId: string; side: 'defender' | 'raider'; step: 0 | 1 | 2 }>;
  expectedArrivalRounds?: readonly [number, number];
}

/** UI에는 공개된 경로의 실제 step만 노출한다. suspected는 도착 범위만 제공한다. */
export function tacticalFlankRouteView(battle: TacticalBattle): TacticalFlankRouteView[] {
  return (battle.flankRoutes ?? []).map(route => {
    const display = route.defenderIntel === 'revealed'
      ? 'revealed'
      : route.defenderIntel === 'suspected' ? 'suspected' : 'hidden';
    const transits = display === 'revealed'
      ? [
        ...battle.defenderGroups.flatMap(group => group.routeTransit?.routeId === route.id
          ? [{ groupId: group.id, side: 'defender' as const, step: group.routeTransit.step }]
          : []),
        ...battle.raiderGroups.flatMap(group => group.routeTransit?.routeId === route.id
          ? [{ groupId: group.id, side: 'raider' as const, step: group.routeTransit.step }]
          : []),
      ]
      : [];
    return {
      route: { ...route },
      display,
      transits,
      ...(display === 'suspected' ? { expectedArrivalRounds: [1, 3] as const } : {}),
    };
  });
}

export function tacticalGroupIsInRouteTransit(
  group: Pick<TacticalRaiderGroup, 'routeTransit'>,
): boolean {
  return group.routeTransit != null;
}

export function migrateTacticalRouteTransit(
  raw: unknown,
  routeIds: ReadonlySet<string>,
  fallbackRound: number,
): TacticalRouteTransit | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const source = raw as Record<string, unknown>;
  if (!routeIds.has(String(source.routeId))) return undefined;
  if (source.step !== 0 && source.step !== 1 && source.step !== 2) return undefined;
  const roundsRequired = Math.max(1, Math.min(3, Math.floor(Number(source.roundsRequired) || 2)));
  const elapsedRounds = Math.max(0, Math.min(roundsRequired, Math.floor(Number(source.elapsedRounds) || 0)));
  return {
    routeId: String(source.routeId),
    purpose: source.purpose === 'block' ? 'block' : 'raid',
    step: source.step,
    destinationZoneId: typeof source.destinationZoneId === 'string' ? source.destinationZoneId : 'wall',
    originZoneId: typeof source.originZoneId === 'string' ? source.originZoneId : 'approach',
    visibleToDefender: source.visibleToDefender === true,
    startedRound: Math.max(1, Math.floor(Number(source.startedRound) || fallbackRound)),
    elapsedRounds,
    roundsRequired,
    engagements: Math.max(0, Math.floor(Number(source.engagements) || 0)),
  };
}

export function migrateTacticalFlankRoutes(raw: unknown, plan?: EnemyPlan): TacticalFlankRoute[] {
  const defaults = createTacticalFlankRoutes(plan);
  if (!Array.isArray(raw)) return defaults;
  return defaults.map(fallback => {
    const source = raw.find(entry => entry && typeof entry === 'object' &&
      (entry as Record<string, unknown>).side === fallback.side) as Record<string, unknown> | undefined;
    if (!source) return fallback;
    const route: TacticalFlankRoute = {
      ...fallback,
      openedByDefender: source.openedByDefender === true,
      openedByRaider: fallback.openedByRaider,
      control: source.control === 'defender' || source.control === 'raider' || source.control === 'contested'
        ? source.control
        : 'neutral',
    };
    route.defenderIntel = routeIntel(route, plan);
    return route;
  });
}
