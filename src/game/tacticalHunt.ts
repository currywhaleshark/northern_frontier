import { addLog } from './events';
import { CONFIG } from './config';
import { combatGroupLabel, tacticalGroupCapabilities, tacticalGroupPower } from './combatCapabilities';
import { beginExpeditionReturn, expeditionResidentsForIds } from './expedition';
import { predatorThreatProfile, tigerTierDangerMultiplier, tigerTierLabel } from './expeditionIntel';
import { makeRng } from './map';
import { injure, killResidents } from './raidDamage';
import { applyWildlifeHuntOutcome, type WildlifeHuntOutcome } from './specialEvents';
import { createExpeditionTacticalGroups } from './tacticalAssault';
import { allocateMusketReadiness, consumeMusketVolleys } from './weapons';
import { defaultRaiderFormationLine } from './tacticalTargeting';
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
  { id: 'splitDrivers', label: '몰이꾼 나누기', cost: 2 },
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
      id: 'huntTracks', name: '자취 지대', kind: 'forest', order: 0,
      pressure: 0, breached: false, defenseBonus: 0, ambushBonus: 0, lootRisk: 0, civilianRisk: 0,
      description: '발자국과 털, 꺾인 가지를 더듬어 숨어 있는 짐승의 위치를 좁힙니다.',
    },
    {
      id: 'huntDrive', name: '몰이 숲', kind: 'forest', order: 1,
      pressure: 0, breached: false, defenseBonus: 0, ambushBonus: 0, lootRisk: 0, civilianRisk: 0,
      description: '몰이꾼이 소리를 내며 짐승을 막다른 지형으로 밀어붙입니다.',
    },
    {
      id: 'huntDen', name: '막다른 굴·덤불', kind: 'center', order: 2,
      pressure: 0, breached: false, defenseBonus: 0, ambushBonus: 0, lootRisk: 0, civilianRisk: 0,
      description: '포위망을 닫고 짐승과 결착을 내는 마지막 사냥터입니다.',
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
    zoneId: 'huntTracks',
    line: defaultRaiderFormationLine(undefined, leader),
    targetZoneId: 'huntTracks',
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
    group.zoneId = 'huntTracks';
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
    currentZoneId: 'huntTracks',
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
    resourceSnapshot: captureTacticalResources(state),
  };
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
    return `미끼로 쓸 고기 ${HUNT_CONFIG.baitMeatCost}이 필요합니다.`;
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

function prepEvent(
  events: TacticalAnimationEvent[], zoneId: string, kind: TacticalAnimationEvent['kind'], text: string,
): void {
  events.push({ zoneId, kind, text, durationMs: 720, side: 'defender' });
}

export function advanceHuntPhase(state: GameState): string | null {
  const battle = state.tacticalBattle;
  if (!battle || battle.assaultKind !== 'predatorHunt') return '진행 중인 맹수 사냥이 없습니다.';
  if (battle.phase === 'preparation') {
    const events: TacticalAnimationEvent[] = [];
    for (const action of battle.prepActions.filter(candidate => candidate.selected && !candidate.applied)) {
      if (action.id === 'setHuntTraps') {
        battle.huntTrapSet = true;
        prepEvent(events, 'huntDrive', 'prepareAmbush', '짐승이 지날 만한 좁은 길목에 덫과 올가미를 숨깁니다.');
      } else if (action.id === 'placeBait') {
        state.resources.meat = Math.max(0, state.resources.meat - HUNT_CONFIG.baitMeatCost);
        battle.huntBaitPlaced = true;
        battle.huntPredatorState = 'revealed';
        battle.raiderGroups.forEach(group => { group.revealed = true; });
        prepEvent(events, 'huntTracks', 'beastReveal', '피 냄새를 맡은 짐승이 미끼 앞에 모습을 드러냅니다.');
      } else if (action.id === 'splitDrivers') {
        battle.huntDriversSplit = true;
        battle.huntEncirclement = clamp((battle.huntEncirclement ?? 0) + 12, 0, 100);
        prepEvent(events, 'huntDrive', 'advance', '몰이꾼을 여러 갈래로 나눠 달아날 틈을 미리 좁힙니다.');
      }
      action.applied = true;
    }
    battle.preparationEvents = events;
    battle.phase = events.length > 0 ? 'preparationExecution' : 'deployment';
    return null;
  }
  if (battle.phase === 'preparationExecution') {
    battle.phase = 'deployment';
    return null;
  }
  if (battle.phase === 'deployment') {
    chooseDefaultHuntCommands(battle);
    battle.phase = 'command';
    return null;
  }
  return '지금은 다음 단계로 넘어갈 수 없습니다.';
}

export function assignHuntGroup(state: GameState, groupId: string, zoneId: string): string | null {
  const battle = state.tacticalBattle;
  if (!battle || battle.assaultKind !== 'predatorHunt') return '진행 중인 맹수 사냥이 없습니다.';
  if (battle.phase !== 'deployment') return '배치 단계에서만 사냥대를 옮길 수 있습니다.';
  const group = battle.defenderGroups.find(candidate => candidate.id === groupId);
  const zone = battle.zones.find(candidate => candidate.id === zoneId);
  const currentOrder = battle.zones.find(candidate => candidate.id === battle.currentZoneId)?.order ?? 0;
  if (!group) return '사냥대 그룹을 찾을 수 없습니다.';
  if (!zone) return '사냥 구역을 찾을 수 없습니다.';
  if (zone.order > currentOrder) return '아직 몰아넣지 못한 안쪽 구역에는 배치할 수 없습니다.';
  group.zoneId = zoneId;
  return null;
}

function huntGroupBaseLabel(group: TacticalDefenderGroup): string {
  return group.label.replace(/ [A-Z]조$/u, '');
}

function relabelHuntOriginGroups(battle: TacticalBattle, originGroupId: string): void {
  const siblings = battle.defenderGroups
    .filter(group => group.huntOriginGroupId === originGroupId)
    .sort((left, right) => left.id.localeCompare(right.id));
  if (siblings.length === 0) return;
  const baseLabel = huntGroupBaseLabel(siblings[0]);
  siblings.forEach((group, index) => {
    const suffix = index < 26 ? String.fromCharCode(65 + index) : String(index + 1);
    group.label = siblings.length === 1 ? baseLabel : `${baseLabel} ${suffix}조`;
  });
}

function reallocateHuntMusketReadiness(state: GameState, battle: TacticalBattle): void {
  const musketGroups = battle.defenderGroups.filter(group => group.weapon === 'musket' && activeCount(group) > 0);
  const readiness = allocateMusketReadiness(
    state,
    musketGroups.map(group => ({ id: group.id, residentIds: group.residentIds })),
    CONFIG.raid.powderPerMusket,
  );
  for (const group of battle.defenderGroups) {
    if (group.weapon === 'musket') group.readyMuskets = readiness.byGroup[group.id] ?? 0;
  }
}

export function splitHuntGroup(state: GameState, groupId: string, detachCount: number): string | null {
  const battle = state.tacticalBattle;
  if (!battle || battle.assaultKind !== 'predatorHunt') return '맹수 사냥 전투에서만 분견대를 나눌 수 있습니다.';
  if (battle.phase !== 'deployment' || battle.round !== 1 || battle.reports.length > 0) {
    return '첫 교전 전 배치 단계에서만 분견대를 나눌 수 있습니다.';
  }
  const group = battle.defenderGroups.find(candidate => candidate.id === groupId);
  if (!group) return '나눌 사냥대 조를 찾을 수 없습니다.';
  if (group.commandable === false || activeCount(group) <= 0) return '전투 가능한 사냥대 조만 나눌 수 있습니다.';
  if (group.wounded > 0 || group.killed > 0) return '사상자가 생긴 조는 분견대로 나눌 수 없습니다.';
  if (!Number.isInteger(detachCount) || detachCount < 1) return '분리할 인원은 1명 이상이어야 합니다.';
  if (group.count < 2 || detachCount >= group.count) return '최소 2명인 조에서 원대에 1명 이상 남도록 나누어야 합니다.';

  const orderedIds = [...group.residentIds].sort((left, right) => left - right);
  const retainedIds = orderedIds.slice(0, orderedIds.length - detachCount);
  const detachedIds = orderedIds.slice(orderedIds.length - detachCount);
  const originalCount = group.count;
  const detachedPower = group.power * detachCount / originalCount;
  const originGroupId = group.huntOriginGroupId ?? group.id;
  group.huntOriginGroupId = originGroupId;
  group.residentIds = retainedIds;
  group.count = retainedIds.length;
  group.power -= detachedPower;

  const serial = (battle.huntDetachmentSerial ?? 0) + 1;
  battle.huntDetachmentSerial = serial;
  battle.defenderGroups.push({
    ...group,
    id: `${originGroupId}-detachment-${serial}`,
    label: huntGroupBaseLabel(group),
    residentIds: detachedIds,
    count: detachedIds.length,
    power: detachedPower,
    readyMuskets: 0,
    wounded: 0,
    killed: 0,
    command: null,
    commandSource: undefined,
    targetGroupId: undefined,
    targetSource: 'auto',
    huntOriginGroupId: originGroupId,
  });
  relabelHuntOriginGroups(battle, originGroupId);
  reallocateHuntMusketReadiness(state, battle);
  return null;
}

export function mergeHuntGroups(
  state: GameState,
  destinationGroupId: string,
  sourceGroupId: string,
): string | null {
  const battle = state.tacticalBattle;
  if (!battle || battle.assaultKind !== 'predatorHunt') return '맹수 사냥 전투에서만 분견대를 합칠 수 있습니다.';
  if (battle.phase !== 'deployment' || battle.round !== 1 || battle.reports.length > 0) {
    return '첫 교전 전 배치 단계에서만 분견대를 합칠 수 있습니다.';
  }
  if (destinationGroupId === sourceGroupId) return '서로 다른 분견대 두 조를 선택해야 합니다.';
  const destination = battle.defenderGroups.find(group => group.id === destinationGroupId);
  const source = battle.defenderGroups.find(group => group.id === sourceGroupId);
  if (!destination || !source) return '합칠 사냥대 분견대를 찾을 수 없습니다.';
  const destinationOrigin = destination.huntOriginGroupId ?? destination.id;
  const sourceOrigin = source.huntOriginGroupId ?? source.id;
  if (destinationOrigin !== sourceOrigin) return '같은 원래 조에서 나뉜 분견대끼리만 합칠 수 있습니다.';
  if (destination.role !== source.role || destination.weapon !== source.weapon) {
    return '역할과 무기가 같은 분견대끼리만 합칠 수 있습니다.';
  }
  if (destination.zoneId !== source.zoneId) return '같은 사냥 구역에 있는 분견대끼리만 합칠 수 있습니다.';
  if (destination.wounded > 0 || destination.killed > 0 || source.wounded > 0 || source.killed > 0) {
    return '사상자가 생긴 분견대는 합칠 수 없습니다.';
  }
  const mergedIds = [...new Set([...destination.residentIds, ...source.residentIds])].sort((left, right) => left - right);
  if (mergedIds.length !== destination.count + source.count) return '주민이 중복된 분견대는 합칠 수 없습니다.';
  destination.residentIds = mergedIds;
  destination.count += source.count;
  destination.power += source.power;
  destination.huntOriginGroupId = destinationOrigin;
  destination.command = null;
  destination.commandSource = undefined;
  destination.targetGroupId = undefined;
  destination.targetSource = 'auto';
  battle.defenderGroups = battle.defenderGroups.filter(group => group.id !== source.id);
  relabelHuntOriginGroups(battle, destinationOrigin);
  reallocateHuntMusketReadiness(state, battle);
  return null;
}

export function huntCommandUnavailableReason(
  battle: TacticalBattle,
  group: TacticalDefenderGroup,
  command: TacticalCommandId,
): string | null {
  if (battle.assaultKind !== 'predatorHunt') return '몰이사냥 명령이 아닙니다.';
  if (command === 'hold' || command === 'advance' || command === 'fallback' || command === 'openRetreat') return null;
  if (command === 'volley') return tacticalGroupCapabilities(group).has('volley') ? null : '각궁 또는 화약이 준비된 조총이 필요합니다.';
  if (command === 'ambush') return tacticalGroupCapabilities(group).has('ambush') ? null : '사냥꾼만 숨은 길목을 지킬 수 있습니다.';
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
    if (group.command) {
      group.commandSource ??= 'recommended';
      continue;
    }
    if (tacticalGroupCapabilities(group).has('ambush')) group.command = 'advance';
    else if (tacticalGroupCapabilities(group).has('volley')) group.command = 'volley';
    else group.command = 'hold';
    group.commandSource = 'recommended';
  }
}

function addEvent(
  events: TacticalAnimationEvent[], zoneId: string, kind: TacticalAnimationEvent['kind'], text: string,
  extra: Partial<Pick<TacticalAnimationEvent, 'side' | 'groupId' | 'casualties' | 'float' | 'shots' | 'meleeParticipants'>> = {},
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
): { wounded: number; killed: number } {
  const kind = battle.huntPredatorKind ?? 'wolf';
  const tigerTier = battle.huntTigerTier ?? 'tiger';
  const danger = kind === 'tiger' ? tigerTierDangerMultiplier(tigerTier) : 1;
  const beastName = kind === 'tiger' ? tigerTierLabel(tigerTier) : '늑대 떼';
  const packSize = battle.raiderGroups.reduce((sum, group) => sum + activeBeasts(group), 0);
  const living = players.filter(group => activeCount(group) > 0);
  if (living.length === 0) return { wounded: 0, killed: 0 };
  const target = kind === 'tiger'
    ? living[Math.floor(rng() * living.length)]
    : weakestGroup(living);
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
  if (battle.huntDriversSplit) hitChance *= HUNT_CONFIG.ambush.splitDriversHitMultiplier;
  addEvent(events, zoneId, 'beastAmbush', `${beastName}가 ${target.label} 한 곳을 노려 덮칩니다.`, {
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
    side: 'defender', groupId: target.id, casualties: losses,
    float: killed > 0 ? `전사 ${killed}·부상 ${wounded}` : `부상 ${wounded}`,
  });
  return { wounded, killed };
}

function applyWolfDamage(
  battle: TacticalBattle,
  damage: number,
  events: TacticalAnimationEvent[],
  zoneId: string,
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
      addEvent(events, zoneId, 'beastRout', '우두머리가 쓰러지자 남은 늑대들이 싸울 뜻을 잃고 흩어집니다.', {
        side: 'raider', groupId: leader.id, float: '우두머리 처치!',
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
    if (packKilled > 0) addEvent(events, zoneId, 'casualty', `늑대 ${packKilled}마리가 쓰러집니다.`, {
      side: 'raider', groupId: pack.id, casualties: packKilled, float: `-${packKilled}`,
    });
  }
  return killed;
}

function outcomeText(outcome: NonNullable<TacticalRoundReport['outcome']>): string {
  if (outcome === 'huntKill') return '포위망 안의 맹수를 사살해 위협을 끝냈습니다.';
  if (outcome === 'huntRepelled') return '우두머리를 잃은 늑대 떼가 영역 밖으로 달아났습니다.';
  if (outcome === 'huntEscaped') return '포위망이 닫히기 전에 맹수가 깊은 숲으로 빠져나갔습니다.';
  if (outcome === 'huntDefeat') return '사냥대의 기세가 무너져 부상자를 데리고 강제 철수합니다.';
  return '몰이사냥 교전이 끝났습니다.';
}

export function resolveHuntRound(state: GameState): string | null {
  const battle = state.tacticalBattle;
  if (!battle || battle.assaultKind !== 'predatorHunt') return '진행 중인 맹수 사냥이 없습니다.';
  if (battle.phase !== 'command') return '교전을 진행할 지휘 단계가 아닙니다.';
  chooseDefaultHuntCommands(battle);
  const rng = makeRng(state.seed + battle.id * 65537 + battle.round * 131071);
  const zone = battle.zones.find(candidate => candidate.id === battle.currentZoneId)!;
  const players = battle.defenderGroups.filter(group => group.zoneId === zone.id && activeCount(group) > 0);
  const beasts = battle.raiderGroups.filter(group => group.zoneId === zone.id && activeBeasts(group) > 0);
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
  const driveGroups = players.filter(group => group.command === 'advance' || group.command === 'ambush');
  const skill = hunterSkill(state, players);
  const encirclement = HUNT_CONFIG.encirclement;
  let encirclementGain = encirclement.baseGain + driveGroups.reduce(
    (sum, group) => sum + Math.max(1, activeCount(group) * encirclement.perDriver),
    0,
  ) + skill * encirclement.hunterSkillMultiplier;
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
  if (battle.huntDriversSplit) encirclementGain *= encirclement.splitDriversMultiplier;
  if (players.some(group => group.command === 'fallback')) encirclementGain *= encirclement.fallbackMultiplier;
  battle.huntEncirclement = clamp(
    (battle.huntEncirclement ?? 0) + Math.max(encirclement.minimumGain, encirclementGain),
    0,
    100,
  );
  battle.zones.forEach(candidate => { candidate.pressure = battle.huntEncirclement ?? 0; });

  let revealedThisRound = false;
  if (battle.huntPredatorState === 'hidden') {
    const revealChance = clamp(
      0.16 + driveGroups.length * 0.08 + players.filter(group => group.role === 'hunter').length * 0.12 +
      skill * 0.24 + weatherTrackingModifier(state.weather),
      0.08,
      0.92,
    );
    if (rng() < revealChance) {
      battle.huntPredatorState = 'revealed';
      beasts.forEach(group => { group.revealed = true; });
      revealedThisRound = true;
      addEvent(events, zone.id, 'beastReveal', '움직이는 수풀 사이로 짐승의 모습이 드러납니다.', {
        side: 'raider', float: '발각!',
      });
    }
  }

  if (!retreatOrdered && beasts.length > 0) {
    if (battle.huntPredatorState === 'hidden') {
      battle.huntPredatorState = 'revealed';
      beasts.forEach(group => { group.revealed = true; });
      revealedThisRound = true;
    }
    const casualty = beastAttack(battle, players, rng, events, zone.id);
    wounded += casualty.wounded;
    killed += casualty.killed;
    villageMoraleDelta -= casualty.wounded * 6 + casualty.killed * 14;
  }

  if (!retreatOrdered && battle.huntPredatorState !== 'hidden') {
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
            ? 1.18
            : group.command === 'advance'
              ? 0.72
              : 0.28;
      if (group.weapon === 'musket' && (group.readyMuskets ?? 0) > 0) {
        musketeers += Math.min(active, group.readyMuskets ?? 0);
        if (battle.huntPredatorKind === 'tiger') multiplier *= 1.45;
      }
      const readyPower = group.weapon === 'musket' ? tacticalGroupPower(group, active) : group.power * share;
      attackPower += readyPower * multiplier;
    }
    const volleyShots = tacticalDefenderShotCounts(players.filter(group => group.command === 'volley'));
    if (musketeers > 0) {
      lines.push(`조총 사격에 화약 ${musketAllocation.powderRequired.toFixed(1)}을 소모했습니다.`);
    }
    if ((volleyShots.arrows ?? 0) + (volleyShots.muskets ?? 0) > 0) {
      addEvent(events, zone.id, 'volley', '발각된 짐승을 향해 조총과 각궁을 일제히 쏩니다.', {
        side: 'defender', shots: volleyShots,
      });
    }
    const meleeParticipants = players
      .filter(group => tacticalGroupCapabilities(group).has('melee') && group.command !== 'fallback')
      .reduce((sum, group) => sum + activeCount(group), 0) +
      beasts.reduce((sum, group) => sum + activeBeasts(group), 0);
    if (meleeParticipants > 0) {
      addEvent(events, zone.id, 'melee', '창과 사냥칼을 든 사냥대가 짐승과 뒤엉켜 근접전을 벌입니다.', {
        side: 'defender', meleeParticipants: meleeParticipants,
      });
    }
    let damage = attackPower * (0.17 + rng() * 0.06) * (0.65 + (battle.huntEncirclement ?? 0) / 190);
    if (battle.huntTrapSet && zone.id === 'huntDrive') {
      damage += battle.originalPower * 0.13;
      battle.huntTrapSet = false;
      addEvent(events, zone.id, 'ambush', '몰이 숲의 함정이 닫히며 짐승의 움직임을 꺾습니다.', {
        side: 'raider', float: '함정 적중!',
      });
    }
    if (battle.huntPredatorKind === 'tiger') {
      const tiger = beasts[0];
      tiger.power = Math.max(0, tiger.power - damage);
      if (tiger.power <= 0.8) {
        tiger.killed = 1;
        beastsKilled = 1;
      } else if (tiger.power < battle.originalPower * 0.55) battle.huntPredatorState = 'wounded';
    } else {
      beastsKilled = applyWolfDamage(battle, damage, events, zone.id);
    }
  }

  if (retreatOrdered) {
    battle.huntWithdrawn = true;
    outcome = 'huntEscaped';
  }
  else if (battle.defenderGroups.every(group => activeCount(group) <= 0) || battle.villageMorale + villageMoraleDelta <= 0) {
    outcome = 'huntDefeat';
  } else if (battle.raiderGroups.every(group => activeBeasts(group) <= 0)) outcome = 'huntKill';
  else if (battle.huntPredatorKind === 'wolf' && battle.huntLeaderKilled) outcome = 'huntRepelled';
  else if ((battle.huntEngagements ?? 0) >= HUNT_CONFIG.maxEngagements) outcome = 'huntEscaped';

  const rehidingChance = HUNT_CONFIG.rehideChance[battle.huntTigerTier ?? 'tiger'];
  if (!outcome && battle.huntPredatorKind === 'tiger' && battle.huntPredatorState !== 'hidden' &&
    (battle.huntEncirclement ?? 0) < HUNT_CONFIG.rehideEncirclementMax && rng() < rehidingChance) {
    battle.huntPredatorState = 'hidden';
    battle.raiderGroups.forEach(group => { group.revealed = false; });
    addEvent(events, zone.id, 'conceal', `${tigerTierLabel(battle.huntTigerTier ?? 'tiger')}가 우거진 덤불 속으로 몸을 감춰 다시 위치를 잃습니다.`, {
      side: 'raider', float: '재은닉',
    });
  }

  villageMoraleDelta += Math.round(clamp(2 + (battle.huntEncirclement ?? 0) / 28 - wounded * 3 - killed * 7, -18, 8));
  raiderMoraleDelta = Math.round(clamp(-4 - beastsKilled * 9 - encirclementGain / 12, -28, 0));
  battle.villageMorale = clamp(battle.villageMorale + villageMoraleDelta, 0, 100);
  battle.raiderMorale = clamp(battle.raiderMorale + raiderMoraleDelta, 0, 100);
  battle.raiderGroups.forEach(group => {
    group.morale = clamp(group.morale + raiderMoraleDelta, 0, 100);
    group.engagementsInZone += 1;
  });

  let nextZoneId = zone.id;
  if (!outcome && zone.id === 'huntTracks' && battle.huntPredatorState !== 'hidden' && (battle.huntEncirclement ?? 0) >= 20) {
    zone.breached = true;
    nextZoneId = 'huntDrive';
    addEvent(events, zone.id, 'advance', '짐승의 퇴로를 확인해 몰이 숲으로 포위망을 전진시킵니다.', { side: 'defender', float: '몰이 전진' });
  } else if (!outcome && zone.id === 'huntDrive' && (battle.huntEncirclement ?? 0) >= 70) {
    zone.breached = true;
    nextZoneId = 'huntDen';
    addEvent(events, zone.id, 'advance', '달아날 길을 막아 짐승을 막다른 굴과 덤불로 몰아넣습니다.', { side: 'defender', float: '포위 완성' });
  }
  if (wounded + killed > 0) lines.push(`사냥대 피해: 전사 ${killed}명, 부상 ${wounded}명.`);
  lines.push(`포위망 ${Math.round(battle.huntEncirclement ?? 0)}% · 사냥대 기세 ${villageMoraleDelta >= 0 ? '+' : ''}${villageMoraleDelta}.`);
  if (outcome) addEvent(events, zone.id, outcome === 'huntRepelled' ? 'beastRout' : outcome === 'huntEscaped' ? 'retreat' : outcome === 'huntKill' ? 'moraleBreak' : 'report', outcomeText(outcome));

  const report: TacticalRoundReport = {
    round: battle.round,
    focusZoneId: zone.id,
    nextFocusZoneId: nextZoneId,
    summary: outcome ? outcomeText(outcome) : `${zone.name} 교전이 끝났습니다.`,
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

export function acknowledgeHuntReport(state: GameState): string | null {
  const battle = state.tacticalBattle;
  if (!battle || battle.assaultKind !== 'predatorHunt' || !battle.pendingReport) return '확인할 사냥 보고가 없습니다.';
  if (battle.phase !== 'report') return '아직 사냥 연출이 끝나지 않았습니다.';
  if (battle.pendingReport.ended) {
    battle.phase = 'finished';
    return null;
  }
  const nextZoneId = battle.pendingReport.nextFocusZoneId;
  if (nextZoneId !== battle.currentZoneId) {
    battle.defenderGroups.forEach(group => { if (activeCount(group) > 0) group.zoneId = nextZoneId; });
    battle.raiderGroups.forEach(group => { if (activeBeasts(group) > 0) group.zoneId = nextZoneId; });
  }
  battle.currentZoneId = nextZoneId;
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
    closingSummary: withdrawn
      ? '사냥대가 사냥을 중지하고 질서 있게 철수합니다.'
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
    highlights: [predatorDetail, ...battle.reports.flatMap(report => report.lines)]
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
