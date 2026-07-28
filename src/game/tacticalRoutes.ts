import { CONFIG } from './config';
import { tacticalGroupCapabilities } from './combatCapabilities';
import { withJosa } from './josa';
import { resolveEngagementExchange } from './tacticalEngagement';
import { tacticalUnitProfileOrUndefined } from './tacticalUnits';
import type {
  EnemyPlan,
  GameState,
  TacticalBattle,
  TacticalFlankRoute,
  TacticalRaiderGroup,
  TacticalRouteIntel,
  TacticalRouteNode,
  TacticalRouteSide,
  TacticalStageDestination,
  TacticalStageMovePreview,
  TacticalStageId,
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
      approachZoneId: 'approach',
      interiorZoneId: 'storehouse',
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

export const TACTICAL_ROUTE_NODES: readonly TacticalRouteNode[] = Object.freeze([
  'approachGate', 'middle', 'storehouseGate',
]);

function tacticalRouteNode(value: unknown): value is TacticalRouteNode {
  return value === 'approachGate' || value === 'middle' || value === 'storehouseGate';
}

export function tacticalRouteNodeFromLegacyStep(
  step: 0 | 1 | 2,
  originZoneId: string,
): TacticalRouteNode {
  if (step === 1) return 'middle';
  const reverse = originZoneId === 'storehouse';
  if (step === 0) return reverse ? 'storehouseGate' : 'approachGate';
  return reverse ? 'approachGate' : 'storehouseGate';
}

function tacticalRouteLegacyStepFromNode(node: TacticalRouteNode, originZoneId: string): 0 | 1 | 2 {
  if (node === 'middle') return 1;
  const reverse = originZoneId === 'storehouse';
  if (node === 'approachGate') return reverse ? 2 : 0;
  return reverse ? 0 : 2;
}

function setTacticalRouteTransitStep(
  transit: TacticalRouteTransit,
  step: 0 | 1 | 2,
): void {
  transit.step = step;
  transit.node = tacticalRouteNodeFromLegacyStep(step, transit.originZoneId);
}

function setTacticalRouteTransitNode(
  transit: TacticalRouteTransit,
  node: TacticalRouteNode,
): void {
  transit.node = node;
  transit.step = tacticalRouteLegacyStepFromNode(node, transit.originZoneId);
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

const TACTICAL_ROUTE_NODE_INDEX: Readonly<Record<TacticalRouteNode, number>> = Object.freeze({
  approachGate: 0,
  middle: 1,
  storehouseGate: 2,
});

function routeNodeForZone(route: TacticalFlankRoute, zoneId: string): TacticalRouteNode | null {
  if (zoneId === route.approachZoneId) return 'approachGate';
  if (zoneId === route.interiorZoneId) return 'storehouseGate';
  return null;
}

function zoneForRouteGate(route: TacticalFlankRoute, node: TacticalRouteNode): string | null {
  if (node === 'approachGate') return route.approachZoneId;
  if (node === 'storehouseGate') return route.interiorZoneId;
  return null;
}

/** 우회대는 반대편 출구를 빠져나온 뒤 목책 방어선의 상대 후열에 합류한다. */
function rearRaidZoneId(battle: TacticalBattle, route: TacticalFlankRoute): string {
  return battle.zones.some(zone => zone.id === 'wall') ? 'wall' : route.approachZoneId;
}

function oppositeRouteGate(node: TacticalRouteNode): Extract<TacticalRouteNode, 'approachGate' | 'storehouseGate'> {
  return node === 'approachGate' ? 'storehouseGate' : 'approachGate';
}

function defenderRouteMoveRoundsRequired(
  group: TacticalBattle['defenderGroups'][number],
  route: TacticalFlankRoute,
  weather: WeatherId,
  from: TacticalRouteNode,
  to: TacticalRouteNode,
): number {
  const distance = Math.abs(TACTICAL_ROUTE_NODE_INDEX[from] - TACTICAL_ROUTE_NODE_INDEX[to]);
  if (distance === 0) return 1;
  const mounted = tacticalGroupCapabilities(group).has('mounted');
  const weatherDelayed = weather === 'blizzard' || (weather === 'thawFlood' && route.terrain === 'riverBank');
  if (distance === 2 && mounted) {
    return 1 + (weatherDelayed ? CONFIG.tacticalBattle.flankRoutes.weatherDelayRounds : 0);
  }
  const fullRouteRounds = defenderRouteRoundsRequired(group, route, weather);
  return distance === 2 ? fullRouteRounds : Math.max(1, Math.ceil(fullRouteRounds / 2));
}

function activeDefenderCount(group: TacticalBattle['defenderGroups'][number]): number {
  return Math.max(0, group.count - group.wounded - group.killed);
}

function activeRearRaidTargets(battle: TacticalBattle, zoneId: string) {
  return battle.raiderGroups.filter(candidate => !candidate.routeTransit && candidate.zoneId === zoneId &&
    candidate.intent !== 'withdraw' && candidate.power > 0 && candidate.count - candidate.killed > 0);
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
  if (battle.deploymentPlacements?.[group.id]?.fixed) return '고정된 보호·지원 조는 우회로에 배치할 수 없습니다.';
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
  const current = battle.deploymentPlacements?.[group.id] ?? null;
  const placementLine = current?.line ?? group.line;
  // 강제 퇴각은 실제 배치 구역으로 돌아가야 하므로 origin은 배치 위치를 보존한다.
  // 명시적 복귀의 물리 출입구는 tacticalRouteReturnDestination에서 별도로 해석한다.
  const originZoneId = current?.zoneId || route.approachZoneId;
  group.routeTransit = {
    routeId: route.id,
    purpose: 'block',
    node: 'middle',
    destinationNode: 'middle',
    step: 1,
    destinationZoneId: route.interiorZoneId,
    destinationLine: placementLine,
    originZoneId,
    returnZoneId: route.interiorZoneId,
    visibleToDefender: true,
    startedRound: battle.round,
    elapsedRounds: 0,
    roundsRequired: defenderRouteRoundsRequired(group, route, state.weather),
    engagements: 0,
  };
  group.zoneId = '';
  group.command = 'hold';
  group.commandSource = 'player';
  battle.deploymentPlacements ??= {};
  battle.deploymentPlacements[group.id] = { zoneId: '', line: placementLine, routeId: route.id };
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
  const route = battle.flankRoutes?.find(candidate => candidate.id === group.routeTransit?.routeId);
  if (!route) return '우회로 정보를 찾을 수 없습니다.';
  if (activeRearRaidTargets(battle, rearRaidZoneId(battle, route)).length === 0) {
    return '방책에 급습할 생존한 적이 없습니다.';
  }
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
  transit.purpose = 'flank';
  transit.destinationZoneId = rearRaidZoneId(battle, route);
  transit.destinationNode = 'approachGate';
  transit.destinationLine = 'rear';
  transit.elapsedRounds = 0;
  transit.startedRound = battle.round;
  transit.roundsRequired = defenderRouteMoveRoundsRequired(
    group, route, state.weather, transit.node, transit.destinationNode,
  );
  group.command = 'flankRoute';
  group.commandSource = 'player';
  return null;
}

interface TacticalRouteStageMoveResolution {
  group: TacticalBattle['defenderGroups'][number];
  route: TacticalFlankRoute;
  origin: TacticalStageDestination;
  destination: TacticalStageDestination;
  purpose: TacticalRouteTransit['purpose'] | null;
  effect: TacticalStageMovePreview['effect'];
  travelRounds: number;
  destinationNode: TacticalRouteNode;
  destinationZoneId: string;
  destinationLine: TacticalBattle['defenderGroups'][number]['line'];
  leavesFrontalBattle: boolean;
  warning?: string;
  reason: string | null;
}

function tacticalRouteStageMoveResolution(
  state: Pick<GameState, 'tacticalBattle' | 'weather'>,
  groupId: string,
  destination: TacticalStageDestination,
): TacticalRouteStageMoveResolution | null {
  const battle = state.tacticalBattle;
  if (!battle) return null;
  const group = battle.defenderGroups.find(candidate => candidate.id === groupId);
  if (!group) return null;
  const currentTransit = group.routeTransit;
  const currentRoute = currentTransit
    ? battle.flankRoutes?.find(candidate => candidate.id === currentTransit.routeId)
    : undefined;
  const destinationRoute = destination.kind === 'routeNode'
    ? battle.flankRoutes?.find(candidate => candidate.id === destination.routeId)
    : currentRoute;
  const route = destinationRoute ?? currentRoute;
  const origin: TacticalStageDestination = currentTransit
    ? { kind: 'routeNode', routeId: currentTransit.routeId, node: currentTransit.node }
    : { kind: 'zoneLane', zoneId: group.zoneId, line: group.line };
  const base = {
    group,
    route: route ?? ({ id: '', side: 'left', label: '', terrain: 'woodedRidge', approachZoneId: 'approach',
      interiorZoneId: 'storehouse', openedByDefender: false, openedByRaider: false,
      defenderIntel: 'unknown', control: 'neutral' } satisfies TacticalFlankRoute),
    origin,
    destination,
    purpose: null,
    effect: 'none' as const,
    travelRounds: 0,
    destinationNode: currentTransit?.node ?? 'middle' as TacticalRouteNode,
    destinationZoneId: currentTransit?.destinationZoneId ?? group.zoneId,
    destinationLine: group.line,
    leavesFrontalBattle: false,
  };
  const reject = (reason: string): TacticalRouteStageMoveResolution => ({ ...base, reason });
  if (battle.phase !== 'command') return reject('지휘 단계에서만 우회로 이동을 명령할 수 있습니다.');
  if (battle.encounterKind !== 'raidDefense' || battle.orientation === 'assault') {
    return reject('방어전에서만 우회로 무대 이동을 명령할 수 있습니다.');
  }
  if (group.commandable === false) return reject(group.kind === 'healer'
    ? '전술 치료반은 우회로 이동 대상이 아닙니다.'
    : '피난 주민은 우회로 이동 대상이 아닙니다.');
  if (activeDefenderCount(group) <= 0 || !combatRouteGroup(group)) {
    return reject('전투 가능한 부대만 우회로에서 이동할 수 있습니다.');
  }
  if (destination.kind === 'routeNode' && !destinationRoute) {
    return reject('알 수 없는 우회로입니다.');
  }
  if (!route?.id) return reject('우회로 정보를 찾을 수 없습니다.');

  if (destination.kind === 'routeNode') {
    if (!route.openedByDefender && route.defenderIntel !== 'revealed') {
      return reject('확인되지 않은 우회로에는 진입할 수 없습니다.');
    }
    if (!currentTransit) {
      const entryNode = routeNodeForZone(route, group.zoneId);
      if (!entryNode || destination.node !== entryNode) {
        return reject('현재 전투 구역에 연결된 우회로 입구로만 진입할 수 있습니다.');
      }
      return {
        ...base,
        route,
        purpose: 'block',
        effect: 'routeEntry',
        destinationNode: entryNode,
        destinationZoneId: group.zoneId,
        destinationLine: group.line,
        leavesFrontalBattle: true,
        warning: '명령 즉시 정면 전투에서 빠지고 우회로 입구에서 다음 이동 명령을 기다립니다.',
        reason: null,
      };
    }
    if (currentTransit.routeId !== route.id) return reject('한 우회로에서 다른 우회로로 직접 이동할 수 없습니다.');
    const distance = Math.abs(
      TACTICAL_ROUTE_NODE_INDEX[currentTransit.node] - TACTICAL_ROUTE_NODE_INDEX[destination.node],
    );
    if (distance === 0) return { ...base, route, reason: null };
    const mounted = tacticalGroupCapabilities(group).has('mounted');
    if (distance !== 1 && !(distance === 2 && mounted)) {
      return reject('보병은 우회로에서 인접한 물리 노드로만 이동할 수 있습니다. 기마 부대는 맞은편 출구까지 직행할 수 있습니다.');
    }
    const gateZoneId = zoneForRouteGate(route, destination.node) ?? currentTransit.destinationZoneId;
    return {
      ...base,
      route,
      purpose: 'move',
      effect: 'block',
      travelRounds: defenderRouteMoveRoundsRequired(group, route, state.weather, currentTransit.node, destination.node),
      destinationNode: destination.node,
      destinationZoneId: gateZoneId,
      destinationLine: group.line,
      warning: destination.node === 'middle'
        ? '중간 지점에 적이 있으면 이동이 즉시 경로 교전으로 전환됩니다.'
        : `${route.label} 출구로 이동합니다. 도착 목적은 진입로 합류·방책 급습·창고지대 합류 중 별도로 선택할 수 있습니다.`,
      reason: null,
    };
  }

  if (!currentTransit || !currentRoute) return reject('일반 전장 이동은 기존 무대 이동 명령을 사용하십시오.');
  if (destination.line !== 'front' && destination.line !== 'middle' && destination.line !== 'rear') {
    return reject('알 수 없는 전열입니다.');
  }
  const rearRaid = destination.zoneId === 'wall' && battle.zones.some(zone => zone.id === 'wall');
  const connectedNode = routeNodeForZone(currentRoute, destination.zoneId);
  if (!rearRaid && !connectedNode) {
    return reject('우회로에서는 진입로·방책 급습·창고지대 중 하나를 목적지로 선택해야 합니다.');
  }
  const returnNode = routeNodeForZone(
    currentRoute,
    currentTransit.returnZoneId ?? currentTransit.originZoneId,
  ) ?? 'storehouseGate';
  const destinationNode = rearRaid ? oppositeRouteGate(returnNode) : connectedNode!;
  const distance = Math.abs(
    TACTICAL_ROUTE_NODE_INDEX[currentTransit.node] - TACTICAL_ROUTE_NODE_INDEX[destinationNode],
  );
  const mounted = tacticalGroupCapabilities(group).has('mounted');
  if (distance > 1 && !mounted) {
    return reject('보병은 반대편 목적지로 가려면 우회로 중간 지점을 거쳐야 합니다.');
  }
  if (rearRaid && activeRearRaidTargets(battle, destination.zoneId).length === 0) {
    return reject('방책에 급습할 생존한 적이 없습니다.');
  }
  const returning = !rearRaid && destination.zoneId === (currentTransit.returnZoneId ?? currentTransit.originZoneId);
  return {
    ...base,
    route: currentRoute,
    purpose: rearRaid ? 'flank' : returning ? 'return' : 'transfer',
    effect: rearRaid ? 'rearRaid' : returning ? 'return' : 'zoneTransfer',
    travelRounds: distance === 0 ? 1 : defenderRouteMoveRoundsRequired(
      group, currentRoute, state.weather, currentTransit.node, destinationNode,
    ),
    destinationNode,
    destinationZoneId: destination.zoneId,
    destinationLine: rearRaid ? 'rear' : destination.line,
    warning: rearRaid
      ? `${withJosa(currentRoute.label, '을/를')} 빠져나가 방책 방어선의 적 후열을 급습합니다.`
      : `${battle.zones.find(zone => zone.id === destination.zoneId)?.name ?? (destination.zoneId === 'approach' ? '진입로' : '창고지대')} ${withJosa(destination.line === 'rear' ? '후열' : destination.line === 'middle' ? '중열' : '전열', '으로/로')} 합류합니다.`,
    reason: null,
  };
}

export function tacticalRouteStageMoveUnavailableReason(
  state: Pick<GameState, 'tacticalBattle' | 'weather'>,
  groupId: string,
  destination: TacticalStageDestination,
): string | null {
  const resolution = tacticalRouteStageMoveResolution(state, groupId, destination);
  return resolution?.reason ?? (resolution ? null : '전술 부대를 찾을 수 없습니다.');
}

/** 현재 우회로 위치에서 출발 구역 쪽으로 한 물리 단계 되돌아갈 목적지. */
export function tacticalRouteReturnDestination(
  battle: TacticalBattle,
  groupId: string,
): TacticalStageDestination | null {
  const group = battle.defenderGroups.find(candidate => candidate.id === groupId);
  const transit = group?.routeTransit;
  if (!group || !transit) return null;
  const route = battle.flankRoutes?.find(candidate => candidate.id === transit.routeId);
  if (!route) return null;
  const storedReturnZoneId = transit.returnZoneId ?? transit.originZoneId;
  const storedOriginNode = routeNodeForZone(route, storedReturnZoneId);
  // 구버전 전투는 wall 같은 비출입구를 origin으로 저장했다. 아군측 창고 입구로 복구한다.
  const originNode = storedOriginNode ?? 'storehouseGate';
  const originZoneId = storedOriginNode ? storedReturnZoneId : route.interiorZoneId;
  if (transit.node === originNode) {
    return { kind: 'zoneLane', zoneId: originZoneId, line: group.line };
  }
  const currentIndex = TACTICAL_ROUTE_NODE_INDEX[transit.node];
  const originIndex = TACTICAL_ROUTE_NODE_INDEX[originNode];
  const nextIndex = currentIndex + (originIndex < currentIndex ? -1 : 1);
  const node = (Object.keys(TACTICAL_ROUTE_NODE_INDEX) as TacticalRouteNode[])
    .find(candidate => TACTICAL_ROUTE_NODE_INDEX[candidate] === nextIndex);
  return node ? { kind: 'routeNode', routeId: route.id, node } : null;
}

/** 우회로 무대의 출입구 화살표 드롭을 실제 이동 목적지로 바꾼다. */
export function tacticalRouteGateDestination(
  battle: TacticalBattle,
  groupId: string,
  routeId: string,
  node: Extract<TacticalRouteNode, 'approachGate' | 'storehouseGate'>,
): TacticalStageDestination | null {
  const group = battle.defenderGroups.find(candidate => candidate.id === groupId);
  const route = battle.flankRoutes?.find(candidate => candidate.id === routeId);
  if (!group || !route) return null;
  if (group.routeTransit?.routeId === routeId && group.routeTransit.node === node) {
    const zoneId = zoneForRouteGate(route, node);
    return zoneId ? { kind: 'zoneLane', zoneId, line: group.line } : null;
  }
  return { kind: 'routeNode', routeId, node };
}

export type TacticalRouteExitTarget = 'approach' | 'wall' | 'storehouse';

/** 우회로 안의 아군이 선택할 수 있는 명시적 출구 목적을 전장 목적지로 변환한다. */
export function tacticalRouteExitDestination(
  battle: TacticalBattle,
  groupId: string,
  routeId: string,
  target: TacticalRouteExitTarget,
): TacticalStageDestination | null {
  const group = battle.defenderGroups.find(candidate => candidate.id === groupId);
  const route = battle.flankRoutes?.find(candidate => candidate.id === routeId);
  if (!group?.routeTransit || group.routeTransit.routeId !== routeId || !route) return null;
  const zoneId = target === 'approach' ? route.approachZoneId
    : target === 'storehouse' ? route.interiorZoneId
      : battle.zones.some(zone => zone.id === 'wall') ? 'wall' : null;
  if (!zoneId) return null;
  return { kind: 'zoneLane', zoneId, line: target === 'wall' ? 'rear' : group.line };
}

export function tacticalRouteStageMovePreview(
  state: Pick<GameState, 'tacticalBattle' | 'weather'>,
  groupId: string,
  destination: TacticalStageDestination,
): TacticalStageMovePreview | null {
  const resolution = tacticalRouteStageMoveResolution(state, groupId, destination);
  if (!resolution || resolution.reason) return null;
  return {
    groupId: resolution.group.id,
    origin: resolution.origin,
    destination: { ...destination },
    command: resolution.effect === 'none' ? null
      : resolution.effect === 'block' ? 'hold' : 'flankRoute',
    purpose: resolution.purpose,
    effect: resolution.effect,
    powerPenalty: resolution.leavesFrontalBattle ? 1 : 0,
    travelRounds: resolution.travelRounds,
    leavesFrontalBattle: resolution.leavesFrontalBattle,
    ...(resolution.warning ? { warning: resolution.warning } : {}),
  };
}

export function applyTacticalRouteStageMove(
  state: Pick<GameState, 'tacticalBattle' | 'weather'>,
  groupId: string,
  destination: TacticalStageDestination,
): string | null {
  const resolution = tacticalRouteStageMoveResolution(state, groupId, destination);
  if (!resolution || resolution.reason) {
    return resolution?.reason ?? '전술 부대를 찾을 수 없습니다.';
  }
  if (resolution.effect === 'none') return null;
  const { group, route } = resolution;
  if (!group.routeTransit) {
    group.rearRaidRound = undefined;
    group.routeTransit = {
      routeId: route.id,
      purpose: 'block',
      node: resolution.destinationNode,
      destinationNode: resolution.destinationNode,
      step: tacticalRouteLegacyStepFromNode(resolution.destinationNode, group.zoneId),
      destinationZoneId: resolution.destinationZoneId,
      destinationLine: resolution.destinationLine,
      originZoneId: group.zoneId,
      returnZoneId: group.zoneId,
      visibleToDefender: true,
      startedRound: state.tacticalBattle!.round,
      elapsedRounds: 0,
      roundsRequired: 1,
      engagements: 0,
    };
    group.zoneId = '';
  } else {
    group.routeTransit.purpose = resolution.purpose ?? group.routeTransit.purpose;
    group.routeTransit.destinationNode = resolution.destinationNode;
    group.routeTransit.destinationZoneId = resolution.destinationZoneId;
    group.routeTransit.destinationLine = resolution.destinationLine;
    group.routeTransit.startedRound = state.tacticalBattle!.round;
    group.routeTransit.elapsedRounds = 0;
    group.routeTransit.roundsRequired = Math.max(1, resolution.travelRounds);
  }
  group.command = resolution.effect === 'block' || resolution.effect === 'routeEntry' ? 'hold' : 'flankRoute';
  group.commandSource = 'player';
  syncTacticalRouteControl(state.tacticalBattle!);
  return null;
}

export function initializeEnemyTacticalRouteTransit(battle: TacticalBattle, weather: WeatherId): void {
  const route = battle.flankRoutes?.find(candidate => candidate.openedByRaider);
  if (!route) return;
  for (const group of battle.raiderGroups) {
    if (group.kind !== 'flankers' || group.flankPlan !== 'rearAssault' || group.routeTransit ||
        (group.rearAssault === true && group.engagementsInZone > 0)) continue;
    group.zoneId = battle.zones.some(zone => zone.id === 'approach') ? 'approach' : group.zoneId;
    const wall = battle.zones.find(zone => zone.id === 'wall');
    const objective = battle.enemyPlan?.objective ?? 'breakthrough';
    const rearAssault = objective === 'breakthrough' || (objective === 'arson' && wall?.breached !== true);
    group.targetZoneId = rearAssault ? rearRaidZoneId(battle, route) : route.interiorZoneId;
    group.rearAssault = false;
    group.aiState = 'routeTransit';
    group.routeTransit = {
      routeId: route.id,
      purpose: rearAssault ? 'flank' : 'transfer',
      node: 'approachGate',
      destinationNode: 'storehouseGate',
      step: 0,
      destinationZoneId: group.targetZoneId,
      destinationLine: 'rear',
      originZoneId: group.zoneId,
      returnZoneId: group.zoneId,
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
    if (!transit || transit.purpose === 'block') continue;
    const route = routes.get(transit.routeId);
    if (!route) continue;
    const groupIsDefender = battle.defenderGroups.some(candidate => candidate.id === group.id);
    const opposedAtMiddle = transit.node === 'middle' && (groupIsDefender
      ? battle.raiderGroups.some(candidate => candidate.routeTransit?.routeId === transit.routeId &&
        candidate.routeTransit.node === 'middle' && candidate.power > 0)
      : battle.defenderGroups.some(candidate => candidate.routeTransit?.routeId === transit.routeId &&
        candidate.routeTransit.node === 'middle' && activeDefenderCount(candidate) > 0));
    if (opposedAtMiddle) continue;
    const fromStep = transit.step;
    const fromNode = transit.node;
    transit.elapsedRounds = Math.min(transit.roundsRequired, transit.elapsedRounds + 1);
    const completed = transit.elapsedRounds >= transit.roundsRequired;
    const crossesWholeRoute = Math.abs(
      TACTICAL_ROUTE_NODE_INDEX[fromNode] - TACTICAL_ROUTE_NODE_INDEX[transit.destinationNode],
    ) === 2;
    const toNode = completed
      ? transit.destinationNode
      : crossesWholeRoute ? 'middle' : fromNode;
    setTacticalRouteTransitNode(transit, toNode);
    if (completed && (transit.destinationNode === 'middle' || transit.purpose === 'move')) {
      transit.purpose = 'block';
      const defender = battle.defenderGroups.find(candidate => candidate.id === group.id);
      if (defender) defender.command = 'hold';
    }
    transit.visibleToDefender = route.defenderIntel === 'revealed';
    if ('aiState' in group) group.aiState = 'routeTransit';
    advances.push({
      groupId: group.id,
      routeId: route.id,
      fromStep,
      toStep: transit.step,
      visibleToDefender: transit.visibleToDefender,
      arrivedAtExit: completed && transit.destinationNode !== 'middle',
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
        setTacticalRouteTransitStep(group.routeTransit, 1);
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
      (group.routeTransit.purpose === 'flank' || group.routeTransit.purpose === 'transfer') &&
      (crossingIds.has(group.id) || group.routeTransit.step === 1) &&
      group.power > 0);
    if (blockers.length === 0 || raiders.length === 0) continue;
    raiders.forEach(group => {
      engagedRaiderIds.add(group.id);
      if (group.routeTransit) setTacticalRouteTransitStep(group.routeTransit, 1);
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
          setTacticalRouteTransitStep(raider.routeTransit, 0);
          raider.routeTransit.elapsedRounds = 0;
        }
      }
    } else if (raiderBrokeThrough) {
      outcome = 'raiderBreakthrough';
      route.control = 'raider';
      blockers.forEach(group => applyDefenderRetreat(battle, group));
    } else {
      route.control = 'contested';
      blockers.forEach(group => { if (group.routeTransit) setTacticalRouteTransitStep(group.routeTransit, 1); });
      raiders.forEach(group => { if (group.routeTransit) setTacticalRouteTransitStep(group.routeTransit, 1); });
    }
    const engagementLines = [
      `${route.label} 중간 지점에서 ${withJosa(blockers.map(group => group.label).join(', '), '과/와')} ${withJosa(raiders.map(group => group.label).join(', '), '이/가')} 교전했습니다.`,
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
    result.events.push(
      ...[...exchange.preDefenseEvents, ...exchange.postDefenseEvents].map(event => ({
        ...event,
        routeId: route.id,
        routeNode: 'middle' as const,
      })),
    );
    result.lines.push(...engagementLines);
    result.villageMoraleDelta += exchange.villageMoraleDelta;
    result.raiderMoraleDelta += exchange.raiderMoraleDelta;
  }

  for (const group of battle.raiderGroups) {
    const transit = group.routeTransit;
    if (!transit || (transit.purpose !== 'flank' && transit.purpose !== 'transfer') ||
        transit.node !== transit.destinationNode ||
        transit.destinationNode === 'middle' || transit.elapsedRounds < transit.roundsRequired ||
        engagedRaiderIds.has(group.id)) continue;
    const route = battle.flankRoutes?.find(candidate => candidate.id === transit.routeId);
    if (!route) continue;
    group.zoneId = transit.destinationZoneId;
    group.targetZoneId = transit.destinationZoneId;
    group.routeTransit = undefined;
    const rearAssault = transit.purpose === 'flank';
    group.rearAssault = rearAssault;
    group.engagementsInZone = 0;
    group.aiState = 'engaging';
    group.intent = rearAssault ? 'flank'
      : battle.enemyPlan?.objective === 'plunder' ? 'loot'
        : battle.enemyPlan?.objective === 'arson' ? 'breakWall' : 'advance';
    route.control = 'raider';
    result.arrivals.push({ routeId: route.id, groupId: group.id, side: 'raider',
      destinationZoneId: group.zoneId, rearAssault });
    result.lines.push(rearAssault
      ? `${withJosa(group.label, '이/가')} ${withJosa(route.label, '을/를')} 통과해 방책 후열을 급습합니다.`
      : `${withJosa(group.label, '이/가')} ${withJosa(route.label, '을/를')} 통과해 창고지대로 침투합니다.`);
  }
  for (const group of battle.defenderGroups) {
    const transit = group.routeTransit;
    if (!transit || transit.purpose === 'block' || transit.node !== transit.destinationNode ||
        transit.destinationNode === 'middle' || transit.elapsedRounds < transit.roundsRequired) continue;
    const route = battle.flankRoutes?.find(candidate => candidate.id === transit.routeId);
    if (!route) continue;
    const intendedRearAssault = transit.purpose === 'flank';
    const rearTargets = intendedRearAssault ? activeRearRaidTargets(battle, transit.destinationZoneId) : [];
    const rearAssault = intendedRearAssault && rearTargets.length > 0;
    group.zoneId = rearAssault ? transit.destinationZoneId : intendedRearAssault ? route.approachZoneId : transit.destinationZoneId;
    group.line = rearAssault ? transit.destinationLine : intendedRearAssault ? group.line : transit.destinationLine;
    group.routeTransit = undefined;
    group.command = rearAssault ? 'charge' : 'hold';
    group.commandSource = undefined;
    group.rearRaidRound = rearAssault ? battle.round : undefined;
    const targets = battle.raiderGroups.filter(candidate => !candidate.routeTransit && candidate.zoneId === group.zoneId &&
      candidate.intent !== 'withdraw' && candidate.power > 0).sort((left, right) => rearPriority(right) - rearPriority(left));
    group.targetGroupId = rearAssault ? targets[0]?.id : undefined;
    group.targetSource = rearAssault ? 'auto' : undefined;
    route.control = 'defender';
    const placement = battle.deploymentPlacements?.[group.id];
    if (placement) battle.deploymentPlacements![group.id] = { ...placement, zoneId: group.zoneId, routeId: undefined };
    result.arrivals.push({ routeId: route.id, groupId: group.id, side: 'defender',
      destinationZoneId: group.zoneId, rearAssault });
    result.lines.push(rearAssault
      ? `${withJosa(group.label, '이/가')} ${withJosa(route.label, '을/를')} 통과해 적 후열을 급습합니다.`
      : intendedRearAssault
        ? `${withJosa(group.label, '이/가')} ${withJosa(route.label, '을/를')} 통과했지만 목책에 적이 없어 진입로로 합류합니다.`
      : `${withJosa(group.label, '이/가')} ${route.label}에서 ${withJosa(group.zoneId === route.approachZoneId ? '진입로' : '창고지대', '으로/로')} 합류합니다.`);
  }
  return result;
}

export interface TacticalFlankRouteView {
  route: TacticalFlankRoute;
  display: 'hidden' | 'suspected' | 'revealed';
  transits: Array<{ groupId: string; side: 'defender' | 'raider'; step: 0 | 1 | 2 }>;
  expectedArrivalRounds?: readonly [number, number];
}

export type TacticalRouteStageDisplay = 'hidden' | 'suspected' | 'revealed';

export interface TacticalRouteNodeView {
  node: TacticalRouteNode;
  label: string;
}

export interface TacticalRouteStageGroupView {
  groupId: string;
  side: 'defender' | 'raider';
  node: TacticalRouteNode;
  destinationNode: TacticalRouteNode;
  movementReserved: boolean;
  label: string;
  count: number;
  line: TacticalBattle['defenderGroups'][number]['line'];
  statusLabel: string;
  commandable: boolean;
  sprite: {
    defenderGroupId?: string;
    defenderKind?: TacticalBattle['defenderGroups'][number]['kind'];
    role?: TacticalBattle['defenderGroups'][number]['role'];
    raiderUnitType?: TacticalBattle['raiderGroups'][number]['unitType'];
    weapon?: TacticalBattle['defenderGroups'][number]['weapon'];
    mount?: TacticalBattle['defenderGroups'][number]['mount'];
    special?: TacticalBattle['defenderGroups'][number]['special'];
  };
}

export interface TacticalRouteStageView {
  kind: 'route';
  stageId: Extract<TacticalStageId, { kind: 'route' }>;
  routeId: string;
  side: TacticalRouteSide;
  label: string;
  terrain: TacticalFlankRoute['terrain'];
  display: TacticalRouteStageDisplay;
  control: TacticalFlankRoute['control'];
  accessible: boolean;
  nodes: TacticalRouteNodeView[];
  groups: TacticalRouteStageGroupView[];
  expectedArrivalRounds?: readonly [number, number];
}

export interface TacticalZoneStageView {
  kind: 'zone';
  stageId: Extract<TacticalStageId, { kind: 'zone' }>;
  label: string;
  order: number;
}

export interface TacticalStageLinkView {
  routeId: string;
  side: TacticalRouteSide;
  zoneStageId: Extract<TacticalStageId, { kind: 'zone' }>;
  routeStageId: Extract<TacticalStageId, { kind: 'route' }>;
  routeNode: Extract<TacticalRouteNode, 'approachGate' | 'storehouseGate'>;
  accessible: boolean;
}

export interface TacticalStageTopologyView {
  stages: Array<TacticalZoneStageView | TacticalRouteStageView>;
  links: TacticalStageLinkView[];
  selectedFallback: TacticalStageId;
}

const TACTICAL_ROUTE_NODE_LABELS: Readonly<Record<TacticalRouteNode, string>> = Object.freeze({
  approachGate: '진입로 측 입구',
  middle: '중간 차단 지점',
  storehouseGate: '창고지대 측 입구',
});

function tacticalRouteStageDisplay(route: TacticalFlankRoute): TacticalRouteStageDisplay {
  return route.defenderIntel === 'revealed'
    ? 'revealed'
    : route.defenderIntel === 'suspected' ? 'suspected' : 'hidden';
}

/** 숨은 경로의 실제 부대 ID·노드·수치는 이 selector 밖으로 나오지 않는다. */
export function tacticalRouteStageView(battle: TacticalBattle): TacticalRouteStageView[] {
  const playbackOccupancy = new Map<string, { routeId: string; node: TacticalRouteNode }>();
  if (battle.phase === 'simulating') {
    for (const engagement of battle.pendingReport?.routeEngagements ?? []) {
      for (const groupId of [...engagement.defenderGroupIds, ...engagement.raiderGroupIds]) {
        playbackOccupancy.set(groupId, { routeId: engagement.routeId, node: 'middle' });
      }
    }
  }
  return (battle.flankRoutes ?? []).map(route => {
    const display = tacticalRouteStageDisplay(route);
    const groups: TacticalRouteStageGroupView[] = display === 'revealed'
      ? [
        ...battle.defenderGroups.flatMap(group => {
          const playback = playbackOccupancy.get(group.id);
          const node = playback?.routeId === route.id
            ? playback.node
            : group.routeTransit?.routeId === route.id ? group.routeTransit.node : null;
          return node ? [{
            groupId: group.id,
            side: 'defender' as const,
            node,
            destinationNode: group.routeTransit?.destinationNode ?? node,
            movementReserved: !playback && group.routeTransit != null && group.routeTransit.purpose !== 'block',
            label: group.label,
            count: activeDefenderCount(group),
            line: group.line,
            statusLabel: playback ? '우회로 교전'
              : group.routeTransit?.purpose === 'block' ? '경로 차단' : '우회 이동',
            commandable: group.commandable !== false && activeDefenderCount(group) > 0,
            sprite: {
              defenderGroupId: group.id,
              defenderKind: group.kind,
              role: group.role,
              weapon: group.weapon,
              ...(group.mount ? { mount: group.mount } : {}),
              ...(group.special ? { special: group.special } : {}),
            },
          }] : [];
        }),
        ...battle.raiderGroups.flatMap(group => {
          const playback = playbackOccupancy.get(group.id);
          const node = playback?.routeId === route.id
            ? playback.node
            : group.routeTransit?.routeId === route.id ? group.routeTransit.node : null;
          return node ? [{
            groupId: group.id,
            side: 'raider' as const,
            node,
            destinationNode: group.routeTransit?.destinationNode ?? node,
            movementReserved: false,
            label: group.label,
            count: Math.max(0, group.count - group.killed),
            line: group.line,
            statusLabel: playback ? '우회로 교전'
              : group.routeTransit?.purpose === 'block' ? '경로 차단' : '우회 이동',
            commandable: false,
            sprite: { ...(group.unitType ? { raiderUnitType: group.unitType } : {}) },
          }] : [];
        }),
      ]
      : [];
    return {
      kind: 'route',
      stageId: { kind: 'route', routeId: route.id },
      routeId: route.id,
      side: route.side,
      label: route.label,
      terrain: route.terrain,
      display,
      control: display === 'revealed' ? route.control : 'neutral',
      accessible: display === 'revealed',
      nodes: TACTICAL_ROUTE_NODES.map(node => ({ node, label: TACTICAL_ROUTE_NODE_LABELS[node] })),
      groups,
      ...(display === 'suspected' ? { expectedArrivalRounds: [1, 3] as const } : {}),
    };
  });
}

/** 정면 zone과 좌·우 경로 무대를 하나의 표시 그래프로 제공한다. 전투 판정 자료구조는 합치지 않는다. */
export function tacticalStageTopology(battle: TacticalBattle): TacticalStageTopologyView {
  const zoneStages: TacticalZoneStageView[] = battle.zones.map(zone => ({
    kind: 'zone',
    stageId: { kind: 'zone', zoneId: zone.id },
    label: zone.name,
    order: zone.order,
  }));
  const routeStages = tacticalRouteStageView(battle);
  const links = routeStages.flatMap(stage => {
    const route = battle.flankRoutes?.find(candidate => candidate.id === stage.routeId);
    if (!route) return [];
    return ([
      [route.approachZoneId, 'approachGate'],
      [route.interiorZoneId, 'storehouseGate'],
    ] as const).map(([zoneId, routeNode]) => ({
      routeId: route.id,
      side: route.side,
      zoneStageId: { kind: 'zone' as const, zoneId },
      routeStageId: { kind: 'route' as const, routeId: route.id },
      routeNode,
      accessible: stage.accessible,
    }));
  });
  const fallbackZoneId = battle.zones.some(zone => zone.id === battle.currentZoneId)
    ? battle.currentZoneId
    : battle.zones[0]?.id ?? 'approach';
  return {
    stages: [...zoneStages, ...routeStages],
    links,
    selectedFallback: { kind: 'zone', zoneId: fallbackZoneId },
  };
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
      route: { ...route, control: display === 'revealed' ? route.control : 'neutral' },
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
  side: 'defender' | 'raider' = 'defender',
): TacticalRouteTransit | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const source = raw as Record<string, unknown>;
  if (!routeIds.has(String(source.routeId))) return undefined;
  const originZoneId = typeof source.originZoneId === 'string' ? source.originZoneId : 'approach';
  const storedNode = tacticalRouteNode(source.node) ? source.node : undefined;
  const storedStep = source.step === 0 || source.step === 1 || source.step === 2 ? source.step : undefined;
  if (!storedNode && storedStep == null) return undefined;
  const node = storedNode ?? tacticalRouteNodeFromLegacyStep(storedStep!, originZoneId);
  const step = tacticalRouteLegacyStepFromNode(node, originZoneId);
  const roundsRequired = Math.max(1, Math.min(3, Math.floor(Number(source.roundsRequired) || 2)));
  const elapsedRounds = Math.max(0, Math.min(roundsRequired, Math.floor(Number(source.elapsedRounds) || 0)));
  const legacyDestination = typeof source.destinationZoneId === 'string' ? source.destinationZoneId : 'storehouse';
  const storedReturnZoneId = typeof source.returnZoneId === 'string' ? source.returnZoneId : undefined;
  const destinationZoneId = side === 'defender' && storedReturnZoneId == null && originZoneId === 'approach' && legacyDestination === 'wall'
    ? 'storehouse'
    : legacyDestination;
  const purpose: TacticalRouteTransit['purpose'] = source.purpose === 'block' || source.purpose === 'move' ||
    source.purpose === 'return' || source.purpose === 'transfer'
    ? source.purpose
    : 'flank';
  const destinationNode = tacticalRouteNode(source.destinationNode)
    ? source.destinationNode
    : purpose === 'block' ? node
      : destinationZoneId === 'approach' ? 'approachGate' : 'storehouseGate';
  const returnZoneId = storedReturnZoneId ?? (
    (purpose === 'block' && node === 'middle') || (side === 'defender' && legacyDestination === 'wall')
      ? 'storehouse'
      : originZoneId
  );
  return {
    routeId: String(source.routeId),
    purpose,
    node,
    destinationNode,
    step,
    destinationZoneId,
    destinationLine: source.destinationLine === 'front' || source.destinationLine === 'middle' || source.destinationLine === 'rear'
      ? source.destinationLine
      : 'rear',
    originZoneId,
    returnZoneId,
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
