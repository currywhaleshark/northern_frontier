import { CONFIG } from './config';
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
      step: 0,
      destinationZoneId: group.targetZoneId,
      visibleToDefender: route.defenderIntel === 'revealed',
      startedRound: battle.round,
      elapsedRounds: 0,
      roundsRequired: tacticalRouteRoundsRequired(group, route, weather),
    };
  }
}

/** Phase 6에서는 출구(2) 도달까지만 진행한다. 후열 진입·교전은 Phase 7 계약이다. */
export function advanceTacticalRouteTransits(
  battle: Pick<TacticalBattle, 'flankRoutes' | 'defenderGroups' | 'raiderGroups'>,
): TacticalRouteAdvance[] {
  const routes = new Map((battle.flankRoutes ?? []).map(route => [route.id, route]));
  const advances: TacticalRouteAdvance[] = [];
  for (const group of [...battle.defenderGroups, ...battle.raiderGroups]) {
    const transit = group.routeTransit;
    if (!transit || transit.step === 2) continue;
    const route = routes.get(transit.routeId);
    if (!route) continue;
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
  for (const route of routes.values()) {
    const defenderPresent = battle.defenderGroups.some(group => group.routeTransit?.routeId === route.id);
    const raiderPresent = battle.raiderGroups.some(group => group.routeTransit?.routeId === route.id);
    route.control = defenderPresent && raiderPresent ? 'contested'
      : defenderPresent ? 'defender'
        : raiderPresent ? 'raider' : 'neutral';
  }
  return advances;
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
    step: source.step,
    destinationZoneId: typeof source.destinationZoneId === 'string' ? source.destinationZoneId : 'wall',
    visibleToDefender: source.visibleToDefender === true,
    startedRound: Math.max(1, Math.floor(Number(source.startedRound) || fallbackRound)),
    elapsedRounds,
    roundsRequired,
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
