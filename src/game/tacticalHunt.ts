import { withJosa } from './josa';
import { addLog } from './events';
import { CONFIG } from './config';
import { combatGroupLabel, tacticalGroupCapabilities, tacticalGroupPower } from './combatCapabilities';
import { beginExpeditionReturn, expeditionResidentsForIds } from './expedition';
import { predatorThreatProfile, tigerTierDangerMultiplier, tigerTierLabel } from './expeditionIntel';
import { makeRng } from './map';
import { chooseBeastAction, chooseWolfPackActions, type BeastAction, type ChooseBeastActionInput } from './huntBeastAI';
import { injure, killResidents } from './raidDamage';
import { applyWildlifeHuntOutcome, type WildlifeHuntOutcome } from './specialEvents';
import { createExpeditionTacticalGroups } from './tacticalAssault';
import { allocateMusketReadiness, consumeMusketVolleys } from './weapons';
import { defaultRaiderFormationLine } from './tacticalTargeting';
import {
  initializeTacticalDeployment,
  mergeTacticalGroups,
  placeTacticalDeploymentGroup,
  splitTacticalGroup,
  tacticalDeploymentUnavailableReason,
} from './tacticalDeployment';
import {
  captureTacticalResources, gradeTacticalBattle, tacticalClosingSummary, tacticalDateLabel,
  tacticalDefenderShotCounts, tacticalOutcomeResult, tacticalPeopleReport, tacticalResourceDelta,
} from './tacticalCore';
import type {
  GameState, PreparationActionId, TacticalAnimationEvent, TacticalBattle,
  TacticalBattleZone, TacticalCommandId, TacticalDefenderGroup, TacticalRaiderGroup, TacticalRoundReport, TigerTier,
} from './types';

const HUNT_CONFIG = CONFIG.tacticalBattle.hunt;
const HUNT_PREPARATIONS: Array<{ id: PreparationActionId; label: string; cost: number }> = [
  { id: 'setHuntTraps', label: '함정 설치', cost: 2 },
  { id: 'placeBait', label: '미끼 놓기', cost: 1 },
];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function activeCount(group: TacticalDefenderGroup): number {
  return Math.max(0, group.count - group.wounded - group.killed);
}

function activeBeasts(group: TacticalRaiderGroup): number {
  return Math.max(0, group.count - group.killed);
}

function huntZones(): TacticalBattleZone[] {
  return [
    {
      id: 'huntSectorRidge', name: '능선길', kind: 'forest', order: 0,
      pressure: 0, breached: false, defenseBonus: 0, ambushBonus: 0, lootRisk: 0, civilianRisk: 0,
      description: '바람이 세고 시야가 트인 능선입니다. 봉쇄가 약하면 짐승이 산등성이로 빠져나갑니다.',
    },
    {
      id: 'huntSectorRavine', name: '골짜기', kind: 'forest', order: 0,
      pressure: 0, breached: false, defenseBonus: 0, ambushBonus: 0, lootRisk: 0, civilianRisk: 0,
      description: '수풀이 빽빽한 골짜기입니다. 숨기 좋지만 얇은 조는 가까운 급습에 취약합니다.',
    },
    {
      id: 'huntSectorBrook', name: '개울가', kind: 'forest', order: 0,
      pressure: 0, breached: false, defenseBonus: 0, ambushBonus: 0, lootRisk: 0, civilianRisk: 0,
      description: '물소리가 발소리를 덮는 개울가입니다. 흔적을 놓치면 열린 물길이 도주로가 됩니다.',
    },
    {
      id: 'huntDen', name: '덤불 심처', kind: 'center', order: 1,
      pressure: 0, breached: false, defenseBonus: 0, ambushBonus: 0, lootRisk: 0, civilianRisk: 0,
      description: '포위망이 완성된 뒤 짐승과 결착을 내는 심처입니다. 결착 전에는 사냥대를 배치할 수 없습니다.',
    },
  ];
}

function beastGroup(
  id: string,
  label: string,
  kind: 'wolf' | 'tiger',
  power: number,
  count: number,
  leader = false,
  tigerTier?: TigerTier,
): TacticalRaiderGroup {
  return {
    id,
    kind: leader ? 'main' : 'flankers',
    label,
    zoneId: 'huntDen',
    line: defaultRaiderFormationLine(undefined, leader),
    targetZoneId: 'huntDen',
    power,
    count,
    killed: 0,
    morale: leader ? 92 : 76,
    intent: 'defend',
    revealed: false,
    engagementsInZone: 0,
    beastKind: kind,
    tigerTier,
    leader,
  };
}

function beastGroups(
  kind: 'wolf' | 'tiger',
  strength: number,
  size: number,
  tigerTier?: TigerTier,
): TacticalRaiderGroup[] {
  if (kind === 'tiger') {
    const tier = tigerTier ?? 'tiger';
    return [beastGroup(`hunt-${tier}`, tigerTierLabel(tier), kind, strength, 1, true, tier)];
  }
  return [
    beastGroup('hunt-wolf-leader', '늑대 우두머리', kind, strength * 0.3, 1, true),
    beastGroup('hunt-wolf-pack', '늑대 무리', kind, strength * 0.7, Math.max(1, size - 1)),
  ];
}

function renameHuntGroups(groups: TacticalDefenderGroup[]): void {
  groups.forEach(group => {
    group.label = combatGroupLabel(group.role, group.weapon);
    group.zoneId = 'huntSectorRidge';
    group.command = null;
    group.huntOriginGroupId = group.id;
  });
}

function huntPrepPoints(state: GameState, memberIds: number[], exactIntel: boolean): number {
  const hunters = expeditionResidentsForIds(state, memberIds).filter(resident => resident.job === 'hunter');
  const skill = hunters.reduce((sum, resident) => sum + (resident.skills.hunter ?? 0), 0);
  return clamp(2 + Math.min(2, hunters.length) + Math.floor(skill) + (exactIntel ? 1 : 0), 2, 6);
}

export function createPredatorTacticalHunt(state: GameState): TacticalBattle | string {
  const expedition = state.expedition;
  if (!expedition || expedition.kind !== 'predatorHunt' || expedition.phase !== 'engage') {
    return '사냥터에 도착한 토벌대가 없습니다.';
  }
  const predatorKind = expedition.predatorKind ?? 'wolf';
  const threat = state.incidents.predatorThreats[predatorKind];
  if (!threat) return '추적 중인 맹수 위협이 없습니다.';
  const groups = createExpeditionTacticalGroups(state, expedition.memberIds);
  if (groups.reduce((sum, group) => sum + group.count, 0) < 2) return '직접 지휘할 사냥대원이 부족합니다.';
  renameHuntGroups(groups);
  const profile = predatorThreatProfile(state, predatorKind);
  const tigerTier = predatorKind === 'tiger' ? profile.tigerTier ?? 'tiger' : undefined;
  const predatorLabel = predatorKind === 'tiger' ? tigerTierLabel(tigerTier) : '늑대 떼';
  const exactIntel = threat.intel?.precision === 'exact';
  const enemies = beastGroups(predatorKind, profile.strength, profile.size, tigerTier);
  const battle: TacticalBattle = {
    encounterKind: 'predatorHunt',
    id: state.day * 1000 + state.subTick * 10 + 9,
    factionName: exactIntel ? predatorLabel : predatorKind === 'tiger' ? '호랑이' : predatorLabel,
    warned: exactIntel,
    siege: false,
    originalPower: profile.strength,
    initialFriendlyPower: groups.reduce((sum, group) => sum + group.power, 0),
    initialEnemyPower: enemies.reduce((sum, group) => sum + group.power, 0),
    phase: 'preparation',
    round: 1,
    prepPoints: huntPrepPoints(state, expedition.memberIds, exactIntel),
    prepActions: HUNT_PREPARATIONS.map(action => ({ ...action, selected: false, applied: false })),
    preparationEvents: [],
    zones: huntZones(),
    defenderGroups: groups,
    raiderGroups: enemies,
    currentZoneId: 'huntSectorRidge',
    villageMorale: clamp(66 + groups.length * 2 + (exactIntel ? 6 : 0), 0, 100),
    raiderMorale: predatorKind === 'tiger'
      ? tigerTier === 'mountainLord' ? 98 : tigerTier === 'greatTiger' ? 93 : 86
      : 80,
    reports: [],
    pendingReport: null,
    mode: 'garrison',
    orientation: 'assault',
    assaultKind: 'predatorHunt',
    huntPredatorKind: predatorKind,
    huntTigerTier: tigerTier,
    huntPredatorState: 'hidden',
    huntEncirclement: exactIntel ? 10 : 0,
    huntEngagements: 0,
    huntDriversSplit: false,
    huntTrapSet: false,
    huntBaitPlaced: false,
    huntLeaderKilled: false,
    huntDetachmentSerial: 0,
    huntOpenSectorRounds: {
      huntSectorRidge: 0,
      huntSectorRavine: 0,
      huntSectorBrook: 0,
    },
    huntBlockadeHistory: [],
    huntCornered: false,
    huntCounterattackCount: 0,
    resourceSnapshot: captureTacticalResources(state),
  };
  initializeTacticalDeployment(battle);
  state.tacticalBattle = battle;
  state.pendingChoice = null;
  addLog(state, `${battle.factionName}의 흔적 앞에서 몰이사냥 직접 지휘를 시작합니다.`, 'raid', true);
  return battle;
}

export function huntPreparationUnavailableReason(state: GameState, actionId: PreparationActionId): string | null {
  const battle = state.tacticalBattle;
  if (!battle || battle.assaultKind !== 'predatorHunt') return '진행 중인 맹수 사냥이 없습니다.';
  if (!HUNT_PREPARATIONS.some(action => action.id === actionId)) return '이 준비는 몰이사냥에서 사용할 수 없습니다.';
  if (actionId === 'placeBait' && state.resources.meat < HUNT_CONFIG.baitMeatCost) {
    return `미끼로 쓸 고기 ${withJosa(HUNT_CONFIG.baitMeatCost, '이/가')} 필요합니다.`;
  }
  if (actionId === 'setHuntTraps' && !battle.defenderGroups.some(group => group.role === 'hunter' || group.role === 'watchman')) {
    return '함정을 놓을 사냥꾼이나 파수꾼이 없습니다.';
  }
  if (actionId === 'splitDrivers' && battle.defenderGroups.filter(group => activeCount(group) > 0).length < 2) {
    return '몰이꾼을 나눌 만큼 조가 많지 않습니다.';
  }
  return null;
}

export function spendHuntPreparationAction(state: GameState, actionId: PreparationActionId): string | null {
  const battle = state.tacticalBattle;
  if (!battle || battle.assaultKind !== 'predatorHunt') return '진행 중인 맹수 사냥이 없습니다.';
  if (battle.phase !== 'preparation') return '준비 단계가 이미 끝났습니다.';
  const action = battle.prepActions.find(candidate => candidate.id === actionId);
  if (!action) return '알 수 없는 사냥 준비입니다.';
  if (action.selected) {
    action.selected = false;
    battle.prepPoints += action.cost;
    return null;
  }
  const reason = huntPreparationUnavailableReason(state, actionId);
  if (reason) return reason;
  if (battle.prepPoints < action.cost) return '남은 준비점수가 부족합니다.';
  action.selected = true;
  battle.prepPoints -= action.cost;
  return null;
}

export function advanceHuntPhase(state: GameState): string | null {
  const battle = state.tacticalBattle;
  if (!battle || battle.assaultKind !== 'predatorHunt') return '진행 중인 맹수 사냥이 없습니다.';
  if (battle.phase === 'preparation') {
    battle.prepActions = battle.prepActions.filter(action => action.id !== 'splitDrivers');
    battle.huntDriversSplit = false;
    battle.preparationEvents = [];
    battle.phase = 'deployment';
    return null;
  }
  if (battle.phase === 'preparationExecution') {
    battle.phase = 'deployment';
    return null;
  }
  if (battle.phase === 'deployment') {
    const unavailableReason = huntDeploymentUnavailableReason(state);
    if (unavailableReason) return unavailableReason;
    chooseDefaultHuntCommands(battle);
    battle.phase = 'command';
    return null;
  }
  return '지금은 다음 단계로 넘어갈 수 없습니다.';
}

export function assignHuntGroup(state: GameState, groupId: string, zoneId: string): string | null {
  const battle = state.tacticalBattle;
  if (!battle || battle.assaultKind !== 'predatorHunt') return '진행 중인 맹수 사냥이 없습니다.';
  if (battle.phase !== 'deployment' && battle.phase !== 'command') {
    return '배치 또는 지휘 단계에서만 사냥대를 옮길 수 있습니다.';
  }
  const group = battle.defenderGroups.find(candidate => candidate.id === groupId);
  const zone = battle.zones.find(candidate => candidate.id === zoneId);
  if (!group) return '사냥대 그룹을 찾을 수 없습니다.';
  if (!zone) return '사냥 구역을 찾을 수 없습니다.';
  if (group.commandable === false || activeCount(group) <= 0) return '전투 가능한 사냥대 조만 옮길 수 있습니다.';
  if (battle.phase === 'deployment') {
    const line = battle.deploymentPlacements?.[group.id]?.line ?? group.line;
    return placeTacticalDeploymentGroup(state, groupId, { zoneId, line });
  }
  if (zone.id === 'huntDen') return '결착 전에는 덤불 심처에 사냥대를 배치할 수 없습니다.';
  if (group.zoneId === zoneId) return null;
  group.zoneId = zoneId;
  if (battle.phase === 'command') group.huntMovedRound = battle.round;
  return null;
}

export function huntDeploymentUnavailableReason(state: GameState): string | null {
  const battle = state.tacticalBattle;
  if (!battle || battle.assaultKind !== 'predatorHunt') return '진행 중인 맹수 사냥이 없습니다.';
  const bait = battle.prepActions.find(action => action.id === 'placeBait' && action.selected);
  if (bait && (!bait.applied || !battle.huntBaitZoneId)) return '미끼를 놓을 길목을 먼저 지정해야 합니다.';
  const trap = battle.prepActions.find(action => action.id === 'setHuntTraps' && action.selected);
  if (trap && (!trap.applied || !battle.huntTrapZoneId)) return '함정을 설치할 길목을 먼저 지정해야 합니다.';
  return tacticalDeploymentUnavailableReason(battle);
}

export function setHuntPreparationZone(
  state: GameState,
  actionId: 'placeBait' | 'setHuntTraps',
  zoneId: string,
): string | null {
  const battle = state.tacticalBattle;
  if (!battle || battle.assaultKind !== 'predatorHunt') return '진행 중인 맹수 사냥이 없습니다.';
  if (battle.phase !== 'deployment') return '배치 단계에서만 준비 위치를 확정할 수 있습니다.';
  const action = battle.prepActions.find(candidate => candidate.id === actionId);
  if (!action?.selected) return '먼저 준비 단계에서 해당 행동을 예약해야 합니다.';
  const zone = battle.zones.find(candidate => candidate.id === zoneId);
  if (!zone) return '사냥 길목을 찾을 수 없습니다.';
  if (zone.id === 'huntDen') return '덤불 심처에는 미끼나 함정을 미리 놓을 수 없습니다.';
  if (actionId === 'placeBait') {
    if (!action.applied) {
      if (state.resources.meat < HUNT_CONFIG.baitMeatCost) return `미끼로 쓸 고기 ${withJosa(HUNT_CONFIG.baitMeatCost, '이/가')} 필요합니다.`;
      state.resources.meat = Math.max(0, state.resources.meat - HUNT_CONFIG.baitMeatCost);
      action.applied = true;
      battle.huntBaitPlaced = true;
    }
    battle.huntBaitZoneId = zone.id;
  } else {
    action.applied = true;
    battle.huntTrapSet = true;
    battle.huntTrapZoneId = zone.id;
  }
  return null;
}

export function splitHuntGroup(state: GameState, groupId: string, detachCount: number): string | null {
  if (!state.tacticalBattle || state.tacticalBattle.assaultKind !== 'predatorHunt') {
    return '진행 중인 맹수 사냥이 없습니다.';
  }
  return splitTacticalGroup(state, groupId, detachCount);
}

export function mergeHuntGroups(
  state: GameState,
  destinationGroupId: string,
  sourceGroupId: string,
): string | null {
  if (!state.tacticalBattle || state.tacticalBattle.assaultKind !== 'predatorHunt') {
    return '진행 중인 맹수 사냥이 없습니다.';
  }
  return mergeTacticalGroups(state, destinationGroupId, sourceGroupId);
}

export function huntCommandUnavailableReason(
  battle: TacticalBattle,
  group: TacticalDefenderGroup,
  command: TacticalCommandId,
): string | null {
  if (battle.assaultKind !== 'predatorHunt') return '몰이사냥 명령이 아닙니다.';
  if (command === 'advance' || command === 'openRetreat') return null;
  if (command === 'fallback') return '포위 유지 명령은 새 몰이사냥에서 사용할 수 없습니다.';
  if (command === 'hold') return tacticalGroupCapabilities(group).has('melee')
    ? null : '창벽은 근접 무장을 갖춘 조만 세울 수 있습니다.';
  if (command === 'attack') return tacticalGroupCapabilities(group).has('melee')
    ? null : '일반 공격은 근접 무장을 갖춘 조만 수행할 수 있습니다.';
  if (command === 'volley') return tacticalGroupCapabilities(group).has('volley') ? null : '각궁 또는 화약이 준비된 조총이 필요합니다.';
  if (command === 'ambush') return activeCount(group) > 0 ? null : '전투 가능한 조만 반격을 준비할 수 있습니다.';
  if (command === 'charge') {
    if (!tacticalGroupCapabilities(group).has('charge')) return '창 돌입은 창을 갖춘 조만 수행할 수 있습니다.';
    return battle.huntPredatorState === 'hidden' ? '짐승의 위치를 먼저 밝혀야 합니다.' : null;
  }
  return '이 명령은 몰이사냥에서 사용할 수 없습니다.';
}

export function setHuntCommand(state: GameState, groupId: string, command: TacticalCommandId): string | null {
  const battle = state.tacticalBattle;
  if (!battle || battle.assaultKind !== 'predatorHunt') return '진행 중인 맹수 사냥이 없습니다.';
  if (battle.phase !== 'command') return '지휘 단계에서만 명령을 내릴 수 있습니다.';
  const group = battle.defenderGroups.find(candidate => candidate.id === groupId);
  if (!group) return '사냥대 그룹을 찾을 수 없습니다.';
  const reason = huntCommandUnavailableReason(battle, group, command);
  if (reason) return reason;
  group.command = command;
  group.commandSource = 'player';
  return null;
}

export function chooseDefaultHuntCommands(battle: TacticalBattle): void {
  for (const group of battle.defenderGroups) {
    if (activeCount(group) <= 0) continue;
    if (group.commandSource === 'player' && group.command && !huntCommandUnavailableReason(battle, group, group.command)) {
      continue;
    }
    const hidden = battle.huntPredatorState === 'hidden';
    if (group.role === 'hunter') group.command = 'ambush';
    else if (hidden) group.command = 'advance';
    else if (tacticalGroupCapabilities(group).has('volley')) group.command = 'volley';
    else if (tacticalGroupCapabilities(group).has('melee')) group.command = 'hold';
    else group.command = 'ambush';
    group.commandSource = 'recommended';
  }
}

function addEvent(
  events: TacticalAnimationEvent[], zoneId: string, kind: TacticalAnimationEvent['kind'], text: string,
  extra: Partial<Pick<TacticalAnimationEvent, 'side' | 'groupId' | 'actorGroupIds' | 'casualties' | 'wounded' | 'killed' | 'float' | 'shots' | 'meleeParticipants'>> = {},
): void {
  events.push({ zoneId, kind, text, durationMs: 650, ...extra });
}

function hunterSkill(state: GameState, groups: TacticalDefenderGroup[]): number {
  const ids = new Set(groups.filter(group => group.role === 'hunter').flatMap(group => group.residentIds));
  const hunters = state.residents.filter(resident => ids.has(resident.id));
  return hunters.length > 0
    ? hunters.reduce((sum, resident) => sum + (resident.skills.hunter ?? 0), 0) / hunters.length
    : 0;
}

function weatherTrackingModifier(weather: GameState['weather']): number {
  if (weather === 'heavySnow' || weather === 'frost' || weather === 'coldSnap') return 0.16;
  if (weather === 'blizzard') return -0.22;
  if (weather === 'rain') return -0.08;
  return 0;
}

function weakestGroup(groups: TacticalDefenderGroup[]): TacticalDefenderGroup | undefined {
  return [...groups].sort((a, b) => {
    const aScore = (a.power / Math.max(1, a.count)) * activeCount(a) * (a.kind === 'militia-unarmed' ? 0.72 : 1);
    const bScore = (b.power / Math.max(1, b.count)) * activeCount(b) * (b.kind === 'militia-unarmed' ? 0.72 : 1);
    return aScore - bScore;
  })[0];
}

function beastAttack(
  battle: TacticalBattle,
  players: TacticalDefenderGroup[],
  rng: () => number,
  events: TacticalAnimationEvent[],
  zoneId: string,
  targetGroupId?: string,
  hitChanceMultiplier = 1,
): { wounded: number; killed: number } {
  const kind = battle.huntPredatorKind ?? 'wolf';
  const tigerTier = battle.huntTigerTier ?? 'tiger';
  const danger = kind === 'tiger' ? tigerTierDangerMultiplier(tigerTier) : 1;
  const beastName = kind === 'tiger' ? tigerTierLabel(tigerTier) : '늑대 떼';
  const packSize = battle.raiderGroups.reduce((sum, group) => sum + activeBeasts(group), 0);
  const living = players.filter(group => activeCount(group) > 0);
  if (living.length === 0) return { wounded: 0, killed: 0 };
  const target = living.find(group => group.id === targetGroupId) ?? weakestGroup(living);
  if (!target) return { wounded: 0, killed: 0 };
  const spearWall = target.command === 'hold' && tacticalGroupCapabilities(target).has('melee');
  const tigerHitChance = HUNT_CONFIG.ambush.tigerHitChance;
  const wolfHitChance = HUNT_CONFIG.ambush.wolfHitChance;
  let hitChance = kind === 'tiger'
    ? clamp(tigerHitChance.base * danger, tigerHitChance.min, tigerHitChance.max)
    : clamp(
      wolfHitChance.base + Math.max(0, packSize - wolfHitChance.packThreshold) * wolfHitChance.perExtraBeast,
      wolfHitChance.min,
      wolfHitChance.max,
    );
  if (spearWall) hitChance *= HUNT_CONFIG.ambush.spearWallMultiplier[kind];
  hitChance *= hitChanceMultiplier;
  addEvent(events, zoneId, 'beastAmbush', `${withJosa(beastName, '이/가')} ${target.label} 한 곳을 노려 덮칩니다.`, {
    side: 'raider', groupId: target.id, float: '급습!',
  });
  if (rng() >= hitChance) return { wounded: 0, killed: 0 };
  const multipleLoss = HUNT_CONFIG.ambush.multipleLossChance;
  const multipleLossChance = kind === 'tiger'
    ? multipleLoss[tigerTier]
    : packSize >= multipleLoss.wolfLargePackThreshold
      ? multipleLoss.wolfLargePack
      : packSize >= multipleLoss.wolfMediumPackThreshold ? multipleLoss.wolfMediumPack : 0;
  const losses = Math.min(activeCount(target), rng() < multipleLossChance ? 2 : 1);
  const death = HUNT_CONFIG.ambush.deathChance;
  const deathChance = kind === 'tiger'
    ? clamp(death.tigerBase * danger, death.tigerMin, death.tigerMax)
    : clamp(death.wolfBase + packSize * death.wolfPerBeast, death.wolfMin, death.wolfMax);
  let killed = losses > 0 && rng() < deathChance ? 1 : 0;
  killed = Math.min(killed, losses);
  const wounded = losses - killed;
  target.killed += killed;
  target.wounded += wounded;
  addEvent(events, zoneId, 'casualty', `${target.label}에서 전사 ${killed}, 부상 ${wounded}명이 발생합니다.`, {
    side: 'defender', groupId: target.id, casualties: losses, wounded, killed,
    float: killed > 0 ? `전사 ${killed}·부상 ${wounded}` : `부상 ${wounded}`,
  });
  return { wounded, killed };
}

function applyWolfDamage(
  battle: TacticalBattle,
  damage: number,
  events: TacticalAnimationEvent[],
): number {
  const leader = battle.raiderGroups.find(group => group.leader);
  const pack = battle.raiderGroups.find(group => !group.leader);
  if (!leader || !pack) return 0;
  const hunterFocus = battle.defenderGroups.some(group => tacticalGroupCapabilities(group).has('ambush') && group.command === 'ambush');
  const leaderShare = hunterFocus ? 0.55 : 0.28;
  const leaderDamage = damage * leaderShare;
  const packDamage = damage - leaderDamage;
  let killed = 0;
  if (activeBeasts(leader) > 0) {
    leader.power = Math.max(0, leader.power - leaderDamage);
    if (leader.power <= 0.8) {
      leader.killed = 1;
      killed += 1;
      battle.huntLeaderKilled = true;
      battle.raiderMorale = clamp(battle.raiderMorale - 55, 0, 100);
      addEvent(events, leader.zoneId, 'casualty', '늑대 우두머리가 치명상을 입고 쓰러집니다.', {
        side: 'raider', groupId: leader.id, casualties: 1, killed: 1, float: '우두머리 처치!',
      });
      addEvent(events, pack.zoneId, 'beastRout', '우두머리가 쓰러지자 남은 늑대들이 싸울 뜻을 잃고 흩어집니다.', {
        side: 'raider', groupId: pack.id, float: '도주!',
      });
    }
  }
  if (activeBeasts(pack) > 0 && packDamage > 0) {
    const perWolf = Math.max(4, battle.originalPower / Math.max(1, battle.raiderGroups.reduce((sum, group) => sum + group.count, 0)));
    pack.power = Math.max(0, pack.power - packDamage);
    const aliveAfter = Math.min(activeBeasts(pack), Math.ceil(pack.power / perWolf));
    const packKilled = activeBeasts(pack) - aliveAfter;
    pack.killed += packKilled;
    killed += packKilled;
    if (packKilled > 0) addEvent(events, pack.zoneId, 'casualty', `늑대 ${packKilled}마리가 쓰러집니다.`, {
      side: 'raider', groupId: pack.id, casualties: packKilled, killed: packKilled, float: `-${packKilled}`,
    });
  }
  return killed;
}

function triggerHuntTrap(
  battle: TacticalBattle,
  zone: TacticalBattleZone,
  events: TacticalAnimationEvent[],
): number {
  if (!battle.huntTrapSet || battle.huntTrapZoneId !== zone.id) return 0;
  battle.huntTrapSet = false;
  const damage = battle.originalPower * 0.13;
  addEvent(events, zone.id, 'ambush', `${zone.name}에 숨겨 둔 함정이 닫히며 맹수의 돌파를 꺾습니다.`, {
    side: 'raider', float: '함정 적중!',
  });
  if (battle.huntPredatorKind === 'tiger') {
    const tiger = battle.raiderGroups.find(group => activeBeasts(group) > 0);
    if (!tiger) return 0;
    tiger.power = Math.max(0, tiger.power - damage);
    if (tiger.power <= 0.8) {
      tiger.killed = Math.max(tiger.killed, 1);
      addEvent(events, zone.id, 'casualty', `${withJosa(tiger.label, '이/가')} 함정의 치명상을 입고 쓰러집니다.`, {
        side: 'raider', groupId: tiger.id, casualties: 1, killed: 1, float: '사살!',
      });
      return 1;
    }
    if (tiger.power < battle.originalPower * 0.55) battle.huntPredatorState = 'wounded';
    return 0;
  }
  return applyWolfDamage(battle, damage, events);
}

function huntEscapeText(battle: TacticalBattle): string {
  const zoneName = battle.zones.find(zone => zone.id === battle.huntEscapeZoneId)?.name ?? '봉쇄선';
  if (battle.huntEscapeCause === 'openSector') {
    return `${zoneName}의 봉쇄 구멍이 오래 열려 맹수가 소리 없이 포위망을 빠져나갔습니다.`;
  }
  if (battle.huntEscapeCause === 'breakout') {
    return `${zoneName}의 얇은 봉쇄를 맹수가 정면으로 돌파해 숲 밖으로 빠져나갔습니다.`;
  }
  if (battle.huntEscapeCause === 'timeout') {
    return '제한된 교전 시간이 끝날 때까지 포위망을 닫지 못해 맹수가 깊은 숲으로 빠져나갔습니다.';
  }
  if (battle.huntEscapeCause === 'withdrawn') {
    return '사냥대가 맹수 위협을 남긴 채 질서 있게 사냥을 중지하고 철수했습니다.';
  }
  return '포위망이 닫히기 전에 맹수가 깊은 숲으로 빠져나갔습니다.';
}

function outcomeText(battle: TacticalBattle, outcome: NonNullable<TacticalRoundReport['outcome']>): string {
  if (outcome === 'huntKill') return '포위망 안의 맹수를 사살해 위협을 끝냈습니다.';
  if (outcome === 'huntRepelled') return '우두머리를 잃은 늑대 떼가 영역 밖으로 달아났습니다.';
  if (outcome === 'huntEscaped') return huntEscapeText(battle);
  if (outcome === 'huntDefeat') return '사냥대의 기세가 무너져 부상자를 데리고 강제 철수합니다.';
  return '몰이사냥 교전이 끝났습니다.';
}

function roundBeastActionInput(battle: TacticalBattle, decisionRoll: number): ChooseBeastActionInput {
  return {
    sectors: battle.zones.filter(zone => zone.id !== 'huntDen').map(zone => ({
      id: zone.id,
      blockade: zone.sectorBlockade ?? 0,
      groups: battle.defenderGroups
        .filter(group => group.zoneId === zone.id && activeCount(group) > 0)
        .map(group => ({
          id: group.id,
          count: activeCount(group),
          effectivePower: group.power * activeCount(group) / Math.max(1, group.count),
          meleeCapable: tacticalGroupCapabilities(group).has('melee'),
          spearWall: group.command === 'hold' && tacticalGroupCapabilities(group).has('melee'),
        })),
    })),
    encirclement: battle.huntEncirclement ?? 0,
    predatorState: battle.huntPredatorState === 'wounded'
      ? 'wounded'
      : battle.huntPredatorState === 'revealed' ? 'revealed' : 'hidden',
    predatorKind: battle.huntPredatorKind ?? 'wolf',
    tigerTier: battle.huntTigerTier,
    remainingPowerShare: battle.raiderGroups.reduce((sum, group) => sum + Math.max(0, group.power), 0) /
      Math.max(1, battle.initialEnemyPower),
    baitSectorId: battle.huntBaitZoneId,
    trapSectorId: battle.huntTrapZoneId,
    decisionRoll,
  };
}

function chooseRoundBeastActions(
  battle: TacticalBattle,
  decisionRoll: number,
  secondaryDecisionRoll: number,
): BeastAction[] {
  const input = roundBeastActionInput(battle, decisionRoll);
  return battle.huntPredatorKind === 'wolf'
    ? chooseWolfPackActions(input, secondaryDecisionRoll)
    : [chooseBeastAction(input)];
}

function breakoutSuccessChance(blockade: number): number {
  const breakout = HUNT_CONFIG.breakout;
  if (breakout.baseSuccessChance <= 0) return 0;
  if (breakout.baseSuccessChance >= 1) return 1;
  return clamp(
    breakout.baseSuccessChance - blockade * breakout.blockadePenaltyPerPower,
    breakout.minSuccessChance,
    breakout.maxSuccessChance,
  );
}

export function huntOpenSectorEscapeChance(openSectorCount: number): number {
  const baseChance = clamp(HUNT_CONFIG.sectors.openEscapeChance, 0, 1);
  const opportunities = Math.max(0, Math.floor(openSectorCount));
  if (opportunities <= 0) return 0;
  if (opportunities === 1) return baseChance;
  return clamp(1 - Math.pow(1 - baseChance, opportunities), 0, 1);
}

export function resolveHuntRound(state: GameState): string | null {
  const battle = state.tacticalBattle;
  if (!battle || battle.assaultKind !== 'predatorHunt') return '진행 중인 맹수 사냥이 없습니다.';
  if (battle.phase !== 'command') return '교전을 진행할 지휘 단계가 아닙니다.';
  chooseDefaultHuntCommands(battle);
  const rng = makeRng(state.seed + battle.id * 65537 + battle.round * 131071);
  const zone = battle.zones.find(candidate => candidate.id === battle.currentZoneId)!;
  const sectorIds = new Set(battle.zones.filter(candidate => candidate.id !== 'huntDen').map(candidate => candidate.id));
  const players = battle.defenderGroups.filter(group =>
    (battle.huntCornered || sectorIds.has(group.zoneId)) && activeCount(group) > 0);
  const beasts = battle.raiderGroups.filter(group => activeBeasts(group) > 0);
  const events: TacticalAnimationEvent[] = [];
  const lines: string[] = [];
  const retreatOrdered = players.some(group => group.command === 'openRetreat');
  let wounded = 0;
  let killed = 0;
  let beastsKilled = 0;
  let villageMoraleDelta = 0;
  let raiderMoraleDelta = 0;
  let outcome: TacticalRoundReport['outcome'];
  addEvent(events, zone.id, 'camera', `${zone.name}에서 포위망을 좁히기 시작합니다.`);

  battle.huntEngagements = (battle.huntEngagements ?? 0) + 1;
  const sectorZones = battle.zones.filter(candidate => candidate.id !== 'huntDen');
  const sectorConfig = HUNT_CONFIG.sectors;
  battle.huntOpenSectorRounds ??= {};
  for (const sector of sectorZones) {
    const blockade = battle.defenderGroups
      .filter(group => group.zoneId === sector.id && activeCount(group) > 0)
      .reduce((sum, group) => sum + group.power * activeCount(group) / Math.max(1, group.count), 0);
    sector.sectorBlockade = blockade;
    battle.huntOpenSectorRounds[sector.id] = blockade < sectorConfig.blockadeThreshold
      ? (battle.huntOpenSectorRounds[sector.id] ?? 0) + 1
      : 0;
  }
  battle.huntBlockadeHistory ??= [];
  battle.huntBlockadeHistory.push({
    round: battle.round,
    sectors: Object.fromEntries(sectorZones.map(sector => [sector.id, sector.sectorBlockade ?? 0])),
  });
  const driveGroups = players.filter(group => group.command === 'advance');
  const skill = hunterSkill(state, players);
  const encirclement = HUNT_CONFIG.encirclement;
  const driveGain = sectorZones.reduce((total, sector) => total + driveGroups
    .filter(group => group.zoneId === sector.id)
    .reduce((sum, group) => sum + Math.max(1, activeCount(group) * encirclement.perDriver) *
      (group.huntMovedRound === battle.round ? encirclement.movedDriveMultiplier : 1), 0), 0);
  const openSectorCount = sectorZones.filter(sector =>
    (sector.sectorBlockade ?? 0) < sectorConfig.blockadeThreshold).length;
  let encirclementGain = (encirclement.baseGain + driveGain + skill * encirclement.hunterSkillMultiplier) *
    Math.pow(sectorConfig.holeGainMultiplier, openSectorCount);
  if (battle.huntPredatorKind === 'tiger') {
    encirclementGain /= tigerTierDangerMultiplier(battle.huntTigerTier ?? 'tiger');
  } else {
    const wolfCount = battle.raiderGroups.reduce((sum, group) => sum + group.count, 0);
    encirclementGain *= clamp(
      encirclement.wolfBaseMultiplier -
      Math.max(0, wolfCount - encirclement.wolfPackThreshold) * encirclement.wolfPenaltyPerExtraBeast,
      encirclement.wolfMinMultiplier,
      encirclement.wolfMaxMultiplier,
    );
  }
  encirclementGain *= 1 + weatherTrackingModifier(state.weather);
  battle.huntEncirclement = clamp(
    (battle.huntEncirclement ?? 0) + Math.max(encirclement.minimumGain, encirclementGain),
    0,
    100,
  );

  const escapeSectors = sectorZones
    .filter(sector => (battle.huntOpenSectorRounds?.[sector.id] ?? 0) >= sectorConfig.openEscapeRounds)
    .sort((left, right) =>
      (battle.huntOpenSectorRounds?.[right.id] ?? 0) - (battle.huntOpenSectorRounds?.[left.id] ?? 0) ||
      (left.sectorBlockade ?? 0) - (right.sectorBlockade ?? 0) || left.id.localeCompare(right.id));
  const escapeSector = escapeSectors[0];
  if (escapeSector && (battle.huntEncirclement ?? 0) >= sectorConfig.openEscapeEncirclementMin) {
    const trapStopsEscape = battle.huntTrapSet && battle.huntTrapZoneId === escapeSector.id;
    if (trapStopsEscape) {
      beastsKilled += triggerHuntTrap(battle, escapeSector, events);
      lines.push(`${escapeSector.name}의 함정이 열린 길로 빠져나가려던 맹수를 붙잡았습니다.`);
    } else {
      const escapeRng = makeRng(state.seed + battle.id * 104729 + battle.round * 15485863 + 911);
      if (escapeRng() < huntOpenSectorEscapeChance(escapeSectors.length)) {
        outcome = 'huntEscaped';
        battle.huntEscapeCause = 'openSector';
        battle.huntEscapeZoneId = escapeSector.id;
        const escapeText = `포위가 비어 있던 ${escapeSector.name} 쪽으로 맹수가 소리 없이 빠져나갔습니다.`;
        lines.push(escapeText);
        addEvent(events, escapeSector.id, 'retreat', escapeText, { side: 'raider', float: '포위 이탈' });
      }
    }
  }

  let actions: BeastAction[] = [{ kind: 'lurk' }];
  let action: BeastAction = actions[0];
  let actionZone = zone;
  let revealedThisRound = false;
  if (!outcome) {
    actions = chooseRoundBeastActions(battle, rng(), rng());
    action = actions[0];
    battle.huntLastBeastAction = { ...action };
    battle.huntLastBeastActions = actions.map(candidate => ({ ...candidate }));
    if (action.kind === 'lurk') {
      battle.huntPredatorState = 'hidden';
      beasts.forEach(group => {
        group.revealed = false;
        group.zoneId = 'huntDen';
      });
      addEvent(events, zone.id, 'conceal', '산이 조용합니다. 짐승은 강한 포위선을 피해 모습을 감추고 있습니다.', {
        side: 'raider', float: '정적',
      });
      const searchGroups = players.filter(group => group.role === 'hunter');
      if (searchGroups.length > 0) {
        const search = HUNT_CONFIG.search;
        const revealChance = clamp(
          search.baseChance + driveGroups.length * search.perDriveGroup +
          searchGroups.length * search.perHunterGroup + skill * search.hunterSkillMultiplier +
          weatherTrackingModifier(state.weather),
          search.minChance,
          search.maxChance,
        );
        if (rng() < revealChance) {
          actionZone = battle.zones.find(candidate => candidate.id === searchGroups[0].zoneId) ?? zone;
          battle.huntPredatorState = 'revealed';
          beasts.forEach(group => {
            group.revealed = true;
            group.zoneId = actionZone.id;
          });
          revealedThisRound = true;
          addEvent(events, actionZone.id, 'beastReveal', '사냥꾼이 수색으로 흔들리는 가지를 짚어 숨어 있던 짐승을 찾아냅니다.', {
            side: 'raider', float: '수색 발각!',
          });
        }
      }
    } else {
      const requestedZoneId = action.kind === 'cornered' ? 'huntDen' : action.sectorId;
      actionZone = battle.zones.find(candidate => candidate.id === requestedZoneId) ?? zone;
      battle.huntPredatorState = battle.huntPredatorState === 'wounded' ? 'wounded' : 'revealed';
      const attackActions = actions.filter(candidate => candidate.kind === 'ambush');
      beasts.forEach((group, index) => {
        group.revealed = true;
        group.zoneId = attackActions.length > 0
          ? attackActions[index % attackActions.length].sectorId
          : actionZone.id;
      });
      revealedThisRound = true;
      if (action.kind === 'breakout') {
        const blockade = actionZone.sectorBlockade ?? 0;
        const trapStopsBreakout = battle.huntTrapSet && battle.huntTrapZoneId === actionZone.id;
        if (trapStopsBreakout) {
          beastsKilled += triggerHuntTrap(battle, actionZone, events);
          addEvent(events, actionZone.id, 'advance', `${actionZone.name}의 함정에 걸린 맹수를 사냥대가 다시 포위합니다.`, {
            side: 'defender', float: '돌파 저지!',
          });
        } else if (rng() < breakoutSuccessChance(blockade)) {
          outcome = 'huntEscaped';
          battle.huntEscapeCause = 'breakout';
          battle.huntEscapeZoneId = actionZone.id;
          const text = `${actionZone.name}의 얇은 봉쇄를 맹수가 정면으로 돌파해 숲 밖으로 빠져나갔습니다.`;
          lines.push(text);
          addEvent(events, actionZone.id, 'retreat', text, { side: 'raider', float: '돌파 성공!' });
        } else {
          addEvent(events, actionZone.id, 'advance', `${withJosa(actionZone.name, '으로/로')} 뛰쳐나온 맹수의 돌파를 사냥대가 막아 세웁니다.`, {
            side: 'defender', float: '돌파 저지!',
          });
        }
      } else if (action.kind === 'cornered') {
        battle.huntCornered = true;
        battle.currentZoneId = 'huntDen';
        players.forEach(group => { group.zoneId = 'huntDen'; });
        beasts.forEach(group => { group.zoneId = 'huntDen'; });
        addEvent(events, 'huntDen', 'beastReveal', '세 갈래 포위망이 닫히며 덤불 심처에서 마지막 결착이 시작됩니다.', {
          side: 'raider', float: '포위 완성!',
        });
      }
    }
  }

  if (!outcome && !retreatOrdered && beasts.length > 0) {
    const attackActions = action.kind === 'cornered'
      ? [action]
      : actions.filter(candidate => candidate.kind === 'ambush');
    for (const attackAction of attackActions) {
      const attackZone = attackAction.kind === 'ambush'
        ? battle.zones.find(candidate => candidate.id === attackAction.sectorId) ?? actionZone
        : actionZone;
      const targetGroupId = attackAction.kind === 'ambush'
        ? attackAction.targetGroupId
        : weakestGroup(players)?.id;
      const casualty = beastAttack(
        battle,
        players,
        rng,
        events,
        attackZone.id,
        targetGroupId,
        attackActions.length > 1 ? HUNT_CONFIG.wolfMultiAmbushHitMultiplier : 1,
      );
      wounded += casualty.wounded;
      killed += casualty.killed;
      villageMoraleDelta -= casualty.wounded * 6 + casualty.killed * 14;
    }
  }

  if (!outcome && !retreatOrdered && revealedThisRound) {
    const musketAllocation = consumeMusketVolleys(
      state,
      players
        .filter(group => group.weapon === 'musket' && group.command === 'volley')
        .map(group => ({ id: group.id, residentIds: group.residentIds.slice(0, activeCount(group)) })),
      CONFIG.raid.powderPerMusket,
    );
    for (const group of players.filter(group => group.weapon === 'musket')) {
      group.readyMuskets = musketAllocation.byGroup[group.id] ?? 0;
    }
    let attackPower = 0;
    let counterattackContributed = false;
    const actionSectorIds = new Set(actions.flatMap(candidate =>
      candidate.kind === 'ambush' || candidate.kind === 'breakout' ? [candidate.sectorId] : []));
    let musketeers = 0;
    for (const group of players) {
      const active = activeCount(group);
      if (active <= 0) continue;
      const share = active / Math.max(1, group.count);
      let multiplier = group.command === 'volley'
        ? (revealedThisRound ? 1.55 : 1.25)
        : group.command === 'charge'
          ? 1.35
          : group.command === 'ambush'
            ? action.kind === 'lurk'
              ? HUNT_CONFIG.counterAttack.searchRevealMultiplier
              : actionSectorIds.has(group.zoneId) || group.zoneId === actionZone.id
                ? HUNT_CONFIG.counterAttack.sameSectorMultiplier
                : HUNT_CONFIG.counterAttack.adjacentSectorMultiplier
            : group.command === 'attack'
              ? 1
            : group.command === 'advance'
              ? 0.72
              : 0.28;
      if (group.command === 'ambush') {
        counterattackContributed = true;
        if (group.role === 'hunter' || group.role === 'watchman') {
          multiplier *= HUNT_CONFIG.counterAttack.specialistMultiplier;
        }
      }
      if (group.weapon === 'musket' && (group.readyMuskets ?? 0) > 0) {
        musketeers += Math.min(active, group.readyMuskets ?? 0);
        if (battle.huntPredatorKind === 'tiger') multiplier *= 1.45;
      }
      const readyPower = group.weapon === 'musket' ? tacticalGroupPower(group, active) : group.power * share;
      attackPower += readyPower * multiplier;
    }
    if (counterattackContributed) battle.huntCounterattackCount = (battle.huntCounterattackCount ?? 0) + 1;
    const volleyShots = tacticalDefenderShotCounts(players.filter(group => group.command === 'volley'));
    if (musketeers > 0) {
      lines.push(`조총 사격에 화약 ${withJosa(musketAllocation.powderRequired.toFixed(1), '을/를')} 소모했습니다.`);
    }
    if ((volleyShots.arrows ?? 0) + (volleyShots.muskets ?? 0) > 0) {
      addEvent(events, actionZone.id, 'volley', '발각된 짐승을 향해 조총과 각궁을 일제히 쏩니다.', {
        side: 'defender', shots: volleyShots,
      });
    }
    const meleeActors = players
      .filter(group => tacticalGroupCapabilities(group).has('melee') && group.command !== 'fallback');
    const meleeParticipants = meleeActors
      .reduce((sum, group) => sum + activeCount(group), 0) +
      beasts.reduce((sum, group) => sum + activeBeasts(group), 0);
    if (meleeParticipants > 0) {
      addEvent(events, actionZone.id, 'melee', '창과 사냥칼을 든 사냥대가 짐승과 뒤엉켜 근접전을 벌입니다.', {
        side: 'defender', actorGroupIds: meleeActors.map(group => group.id), meleeParticipants: meleeParticipants,
      });
    }
    let damage = attackPower * (0.17 + rng() * 0.06) * (0.65 + (battle.huntEncirclement ?? 0) / 190);
    if (battle.huntPredatorKind === 'tiger') {
      const tiger = beasts[0];
      tiger.power = Math.max(0, tiger.power - damage);
      if (tiger.power <= 0.8) {
        tiger.killed = 1;
        beastsKilled = 1;
        addEvent(events, tiger.zoneId, 'casualty', `${withJosa(tiger.label, '이/가')} 치명상을 입고 쓰러집니다.`, {
          side: 'raider', groupId: tiger.id, casualties: 1, killed: 1, float: '사살!',
        });
      } else if (tiger.power < battle.originalPower * 0.55) battle.huntPredatorState = 'wounded';
    } else {
      beastsKilled = applyWolfDamage(battle, damage, events);
    }
  }

  if (!outcome) {
    if (retreatOrdered) {
      battle.huntWithdrawn = true;
      battle.huntEscapeCause = 'withdrawn';
      outcome = 'huntEscaped';
    }
    else if (battle.defenderGroups.every(group => activeCount(group) <= 0) || battle.villageMorale + villageMoraleDelta <= 0) {
      outcome = 'huntDefeat';
    } else if (battle.raiderGroups.every(group => activeBeasts(group) <= 0)) outcome = 'huntKill';
    else if (battle.huntPredatorKind === 'wolf' && battle.huntLeaderKilled) outcome = 'huntRepelled';
    else if ((battle.huntEngagements ?? 0) >= HUNT_CONFIG.maxEngagements) {
      battle.huntEscapeCause = 'timeout';
      outcome = 'huntEscaped';
    }
  }

  villageMoraleDelta += Math.round(clamp(2 + (battle.huntEncirclement ?? 0) / 28 - wounded * 3 - killed * 7, -18, 8));
  raiderMoraleDelta = Math.round(clamp(-4 - beastsKilled * 9 - encirclementGain / 12, -28, 0));
  battle.villageMorale = clamp(battle.villageMorale + villageMoraleDelta, 0, 100);
  battle.raiderMorale = clamp(battle.raiderMorale + raiderMoraleDelta, 0, 100);
  battle.raiderGroups.forEach(group => {
    group.morale = clamp(group.morale + raiderMoraleDelta, 0, 100);
    group.engagementsInZone += 1;
  });

  const nextZoneId = actionZone.id;
  if (wounded + killed > 0) lines.push(`사냥대 피해: 전사 ${killed}명, 부상 ${wounded}명.`);
  lines.push(`포위망 ${Math.round(battle.huntEncirclement ?? 0)}% · 사냥대 기세 ${villageMoraleDelta >= 0 ? '+' : ''}${villageMoraleDelta}.`);
  const outcomeAlreadyAnimated = outcome === 'huntRepelled'
    ? events.some(event => event.kind === 'beastRout')
    : outcome === 'huntEscaped'
      ? events.some(event => event.kind === 'retreat')
      : outcome === 'huntKill'
        ? events.some(event => event.kind === 'casualty' && event.side === 'raider')
        : false;
  if (outcome && !outcomeAlreadyAnimated) {
    const visibleBeastZoneId = battle.raiderGroups.find(group =>
      group.revealed && activeBeasts(group) > 0)?.zoneId;
    addEvent(events, visibleBeastZoneId ?? actionZone.id, outcome === 'huntRepelled' ? 'beastRout' : outcome === 'huntEscaped' ? 'retreat' : outcome === 'huntKill' ? 'moraleBreak' : 'report', outcomeText(battle, outcome));
  }

  const report: TacticalRoundReport = {
    round: battle.round,
    focusZoneId: actionZone.id,
    nextFocusZoneId: nextZoneId,
    summary: outcome ? outcomeText(battle, outcome) : `${actionZone.name} 교전이 끝났습니다.`,
    lines,
    events,
    wounded,
    killed,
    raidersKilled: beastsKilled,
    loot: {},
    buildingsDamaged: 0,
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

export function applyHuntReportPositions(battle: TacticalBattle): void {
  const report = battle.pendingReport;
  if (!report || report.positionsApplied) return;
  battle.currentZoneId = report.nextFocusZoneId;
  report.positionsApplied = true;
}

export function acknowledgeHuntReport(state: GameState): string | null {
  const battle = state.tacticalBattle;
  if (!battle || battle.assaultKind !== 'predatorHunt' || !battle.pendingReport) return '확인할 사냥 보고가 없습니다.';
  if (battle.phase !== 'report') return '아직 사냥 연출이 끝나지 않았습니다.';
  applyHuntReportPositions(battle);
  if (battle.pendingReport.ended) {
    battle.phase = 'finished';
    return null;
  }
  battle.defenderGroups.forEach(group => {
    if (group.command && huntCommandUnavailableReason(battle, group, group.command)) {
      group.command = null;
      group.commandSource = undefined;
    } else if (group.command) group.commandSource = 'recommended';
  });
  chooseDefaultHuntCommands(battle);
  battle.pendingReport = null;
  battle.phase = 'command';
  return null;
}

export function finishPredatorTacticalHunt(state: GameState): void {
  const battle = state.tacticalBattle;
  if (!battle || battle.assaultKind !== 'predatorHunt') return;
  const finalReport = [...battle.reports].reverse().find(report => report.ended) ?? battle.reports[battle.reports.length - 1];
  const outcome = finalReport?.outcome ?? 'huntDefeat';
  const rng = makeRng(state.seed + battle.id * 524287 + 307);
  const reputationBefore = state.resources.reputation;
  const beforeHealth = new Map(state.residents.map(resident => [resident.id, resident.health]));
  let casualties = 0;
  for (const group of battle.defenderGroups) {
    if (group.killed > 0) killResidents(state, rng, group.killed, 1, group.residentIds);
    if (group.wounded > 0) injure(state, rng, group.wounded, 24, group.residentIds, true);
    casualties += group.killed + group.wounded;
  }
  const strategicOutcome: WildlifeHuntOutcome = outcome === 'huntKill'
    ? 'victory'
    : outcome === 'huntRepelled'
      ? 'repelled'
      : outcome === 'huntEscaped'
        ? 'escaped'
        : 'defeat';
  const result = applyWildlifeHuntOutcome(state, battle.huntPredatorKind ?? 'wolf', strategicOutcome, rng);
  if (state.expedition) {
    state.expedition.carriedLoot = { ...result.loot };
    if (casualties > 0) state.expedition.speed = Math.max(0.25, state.expedition.speed * 0.7);
    if (outcome === 'huntKill' || outcome === 'huntRepelled') {
      state.battleScars = [
        ...(state.battleScars ?? []).filter(scar => scar.until >= state.day),
        { x: state.expedition.targetX, y: state.expedition.targetY, until: state.day + 4 },
      ];
    }
  }
  const people = tacticalPeopleReport(state, battle, beforeHealth);
  const raidersCommitted = battle.raiderGroups.reduce((sum, group) => sum + group.count, 0);
  const raidersKilled = Math.min(raidersCommitted, battle.raiderGroups.reduce((sum, group) => sum + group.killed, 0));
  const battleDefendersKilled = battle.defenderGroups.reduce((sum, group) => sum + group.killed, 0);
  const battleDefendersWounded = battle.defenderGroups.reduce((sum, group) => sum + group.wounded, 0);
  const reportResult = tacticalOutcomeResult(outcome);
  const grade = gradeTacticalBattle({
    encounterKind: 'predatorHunt',
    result: reportResult,
    friendlyPower: battle.initialFriendlyPower,
    enemyPower: battle.initialEnemyPower,
    defendersCommitted: people.committed,
    defendersKilled: battleDefendersKilled,
    defendersWounded: battleDefendersWounded,
    enemiesCommitted: raidersCommitted,
    enemiesKilled: raidersKilled,
    loot: result.loot,
  });
  const outcomeLabels: Partial<Record<NonNullable<TacticalRoundReport['outcome']>, string>> = {
    huntKill: '맹수 사살', huntRepelled: '맹수 격퇴', huntEscaped: '맹수 도주', huntDefeat: '사냥대 패퇴',
  };
  const withdrawn = outcome === 'huntEscaped' && battle.huntWithdrawn === true;
  const predatorDetail = battle.huntPredatorKind === 'tiger'
    ? `${tigerTierLabel(battle.huntTigerTier)} 1마리`
    : `늑대 ${raidersCommitted}마리`;
  const escapeDetail = outcome === 'huntEscaped' ? huntEscapeText(battle) : null;
  const blockadeDetail = battle.huntBlockadeHistory && battle.huntBlockadeHistory.length > 0
    ? `봉쇄 기록: ${battle.huntBlockadeHistory.map(entry => {
      const sectors = battle.zones.filter(zone => zone.id !== 'huntDen').map(zone =>
        `${zone.name} ${(entry.sectors[zone.id] ?? 0).toFixed(1)}`).join(' · ');
      return `${entry.round}R ${sectors}`;
    }).join(' / ')}`
    : null;
  const counterDetail = `반격 대기 가동 ${battle.huntCounterattackCount ?? 0}회`;
  state.tacticalBattleReport = {
    encounterKind: 'predatorHunt',
    title: '사냥 장계',
    friendlyLabel: '사냥대',
    enemyLabel: battle.factionName,
    battleId: battle.id,
    date: tacticalDateLabel(state),
    factionName: battle.factionName,
    mode: battle.mode,
    warned: battle.warned,
    outcome,
    outcomeLabel: withdrawn ? '사냥대 철수' : outcomeLabels[outcome] ?? '사냥 종료',
    result: reportResult,
    grade: grade.grade,
    gradeScore: grade.score,
    closingSummary: outcome === 'huntEscaped'
      ? huntEscapeText(battle)
      : tacticalClosingSummary('predatorHunt', outcome, battle.factionName),
    initialFriendlyPower: battle.initialFriendlyPower,
    initialEnemyPower: battle.initialEnemyPower,
    rounds: battle.reports.length,
    villageMorale: Math.round(battle.villageMorale),
    raiderMorale: Math.round(battle.raiderMorale),
    defendersCommitted: people.committed,
    defendersSurvived: people.survived,
    killed: people.killed,
    wounded: people.wounded,
    raidersCommitted,
    raidersKilled,
    raidersEscaped: Math.max(0, raidersCommitted - raidersKilled),
    damagedBuildings: [],
    loot: result.loot,
    recoveredLoot: {},
    reputationDelta: state.resources.reputation - reputationBefore,
    relationDelta: 0,
    threatAfter: state.threat,
    highlights: [predatorDetail, escapeDetail, blockadeDetail, counterDetail,
      ...battle.reports.flatMap(report => report.lines)]
      .filter((line): line is string => line != null)
      .filter((line, index, all) => all.indexOf(line) === index).slice(0, 10),
    resourceDelta: tacticalResourceDelta(state, battle),
    predatorOutcome: outcome === 'huntKill'
      ? 'killed'
      : outcome === 'huntRepelled'
        ? 'repelled'
        : outcome === 'huntDefeat'
          ? 'huntersDefeated'
          : withdrawn ? 'withdrawn' : 'escaped',
  };
  state.tacticalBattle = null;
  const error = beginExpeditionReturn(state, '사냥대가 맹수 직접 지휘전을 마치고 귀환길에 올랐습니다.');
  if (error) addLog(state, error, 'bad', true);
}

export function huntMaxRounds(): number {
  return HUNT_CONFIG.maxEngagements;
}
