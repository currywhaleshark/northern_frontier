import { addLog } from './events';
import { CONFIG } from './config';
import { beginExpeditionReturn, expeditionResidentsForIds } from './expedition';
import { makeRng } from './map';
import { injure, killResidents } from './raidDamage';
import { applyBanditLairOutcome, type BanditLairOutcome } from './siteDiplomacy';
import {
  assignedWeapon, synchronizeWeaponAssignments,
} from './weapons';
import type {
  DefenderGroupKind, GameState, PreparationActionId, ResourceId, TacticalAnimationEvent,
  TacticalBattle, TacticalBattleZone, TacticalCommandId, TacticalDefenderGroup,
  TacticalRaiderGroup, TacticalRoundReport,
} from './types';

const ASSAULT_MAX_ROUNDS = 7;
// 산채 병력은 구역별로 나뉘어 원정대 전원에게 각개격파되므로, 직접 지휘에서만 진지 방어 전투력을 보정한다.
const LAIR_POSITION_POWER_MULTIPLIER = 3.2;
const ASSAULT_PREPARATIONS: Array<{ id: PreparationActionId; label: string; cost: number }> = [
  { id: 'nightAssault', label: '야습 대기', cost: 2 },
  { id: 'prepareFireArrows', label: '불화살 준비', cost: 2 },
  { id: 'blockLeaderEscape', label: '퇴로 매복', cost: 2 },
  { id: 'lureGuards', label: '초병 유인', cost: 1 },
];

const MELEE_KINDS = new Set<DefenderGroupKind>(['militia-spear', 'militia-unarmed', 'watchman']);
const RANGED_KINDS = new Set<DefenderGroupKind>(['militia-bow', 'militia-musket', 'hunter']);
const GROUP_POWER: Record<DefenderGroupKind, number> = {
  'militia-musket': CONFIG.tacticalBattle.groupPower.militiaMusket,
  'militia-bow': CONFIG.tacticalBattle.groupPower.militiaBow,
  'militia-spear': CONFIG.tacticalBattle.groupPower.militiaSpear,
  'militia-unarmed': CONFIG.tacticalBattle.groupPower.militiaUnarmed,
  watchman: CONFIG.tacticalBattle.groupPower.watchman,
  hunter: CONFIG.tacticalBattle.groupPower.hunter,
  civilian: CONFIG.tacticalBattle.groupPower.civilian,
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function activeCount(group: TacticalDefenderGroup): number {
  return Math.max(0, group.count - group.wounded - group.killed);
}

function preparationApplied(battle: TacticalBattle, id: PreparationActionId): boolean {
  return battle.prepActions.some(action => action.id === id && action.applied);
}

function makePlayerGroup(
  state: GameState,
  kind: DefenderGroupKind,
  residentIds: number[],
  label: string,
): TacticalDefenderGroup | null {
  if (residentIds.length === 0) return null;
  const residents = state.residents.filter(resident => residentIds.includes(resident.id));
  return {
    id: `assault-${kind}`,
    kind,
    label,
    residentIds,
    count: residentIds.length,
    zoneId: 'lairTrail',
    command: null,
    power: residents.reduce((sum, resident) => {
      const skillMultiplier = kind === 'hunter'
        ? 0.75 + (resident.skills.hunter ?? 0) * 0.5
        : 1;
      return sum + GROUP_POWER[kind] * skillMultiplier;
    }, 0),
    wounded: 0,
    killed: 0,
    line: MELEE_KINDS.has(kind) ? 'front' : 'rear',
    ambushed: false,
  };
}

export function createExpeditionTacticalGroups(state: GameState, memberIds: number[]): TacticalDefenderGroup[] {
  synchronizeWeaponAssignments(state);
  const members = expeditionResidentsForIds(state, memberIds).filter(resident =>
    !resident.sick && resident.health >= 20 &&
    (resident.job === 'militia' || resident.job === 'watchman' || resident.job === 'hunter'));
  const militia = members.filter(resident => resident.job === 'militia');
  const hunters = members.filter(resident => resident.job === 'hunter');
  const watchmen = members.filter(resident => resident.job === 'watchman');
  const idsWith = (weapon: ReturnType<typeof assignedWeapon>) => militia
    .filter(resident => assignedWeapon(state, resident.id) === weapon)
    .map(resident => resident.id);
  const armed = new Set([
    ...idsWith('musket'), ...idsWith('hornBow'), ...idsWith('spear'),
  ]);
  return [
    makePlayerGroup(state, 'militia-musket', idsWith('musket'), '조총 돌격대'),
    makePlayerGroup(state, 'militia-bow', idsWith('hornBow'), '각궁 사격대'),
    makePlayerGroup(state, 'militia-spear', idsWith('spear'), '창 돌격대'),
    makePlayerGroup(state, 'militia-unarmed', militia.filter(resident => !armed.has(resident.id)).map(resident => resident.id), '경무장 토벌대'),
    makePlayerGroup(state, 'watchman', watchmen.map(resident => resident.id), '파수꾼 선도대'),
    makePlayerGroup(state, 'hunter', hunters.map(resident => resident.id), '사냥꾼 척후대'),
  ].filter((group): group is TacticalDefenderGroup => group != null);
}

function assaultZones(scouted: boolean, alarm: number): TacticalBattleZone[] {
  return [
    {
      id: 'lairTrail', name: '숲길 잠입로', kind: 'forest', order: 0,
      pressure: scouted ? 12 : 0, breached: false, defenseBonus: scouted ? 0 : 8,
      ambushBonus: scouted ? 12 : 0, lootRisk: 0, civilianRisk: 0,
      description: scouted
        ? '정찰로 초병의 교대와 사각을 파악했습니다. 산채 목책까지 조용히 접근할 수 있습니다.'
        : '초병과 매복을 경계하며 산채로 이어지는 좁은 숲길을 뚫어야 합니다.',
    },
    {
      id: 'lairWall', name: '산채 목책', kind: 'wall', order: 1,
      pressure: 0, breached: false, defenseBonus: 18 + Math.round(alarm / 8),
      ambushBonus: 0, lootRisk: 5, civilianRisk: 0,
      description: '높은 목책과 사격 구멍을 돌파해야 산채 안으로 진입할 수 있습니다.',
    },
    {
      id: 'lairYard', name: '산채 마당', kind: 'storehouse', order: 2,
      pressure: 0, breached: false, defenseBonus: 10,
      ambushBonus: 0, lootRisk: 55, civilianRisk: 0,
      description: '마적 주력과 맞붙는 마당입니다. 이곳을 장악하면 창고를 털고 이탈할 수 있습니다.',
    },
    {
      id: 'lairKeep', name: '두목 움막·노획 창고', kind: 'center', order: 3,
      pressure: 0, breached: false, defenseBonus: 16,
      ambushBonus: 0, lootRisk: 80, civilianRisk: 0,
      description: '두목 친위대가 지키는 최종 목표입니다. 두목을 놓치지 않아야 산채를 완전히 소탕합니다.',
    },
  ];
}

function banditGroup(
  id: string,
  label: string,
  zoneId: string,
  power: number,
  count: number,
  unitType: TacticalRaiderGroup['unitType'],
  revealed: boolean,
  morale: number,
): TacticalRaiderGroup {
  return {
    id, kind: id.includes('leader') ? 'main' : id.includes('archer') ? 'flankers' : 'looters',
    unitType, label, zoneId, targetZoneId: zoneId, power: Math.max(1, power), count: Math.max(1, count),
    killed: 0, morale, intent: 'defend', revealed, engagementsInZone: 0,
  };
}

function banditDefenders(power: number, scouted: boolean): TacticalRaiderGroup[] {
  const totalCount = Math.max(4, Math.round(power / 9));
  return [
    banditGroup('lair-sentries', '산채 초병', 'lairTrail', power * 0.16, totalCount * 0.18, 'bandit-vanguard', true, 68),
    banditGroup('lair-archers', '목책 궁수', 'lairWall', power * 0.27, totalCount * 0.27, 'bandit-rider', scouted, 74),
    banditGroup('lair-yard', '마적 주력', 'lairYard', power * 0.31, totalCount * 0.31, 'bandit-vanguard', scouted, 78),
    banditGroup('lair-leader', '두목 친위대', 'lairKeep', power * 0.26, totalCount * 0.24, 'bandit-looter', scouted, 86),
  ].map(group => ({ ...group, count: Math.max(1, Math.round(group.count)) }));
}

function preparationPoints(groups: TacticalDefenderGroup[], scouted: boolean): number {
  const hunters = groups.find(group => group.kind === 'hunter')?.count ?? 0;
  return clamp(2 + Math.min(2, hunters) + (scouted ? 2 : 0), 2, 6);
}

export function createBanditLairTacticalAssault(state: GameState): TacticalBattle | string {
  const expedition = state.expedition;
  if (!expedition || expedition.kind !== 'lairAssault' || expedition.phase !== 'engage') {
    return '산채 앞에 도착한 토벌대가 없습니다.';
  }
  const site = state.foreignSites.find(candidate => candidate.id === expedition.targetSiteId && candidate.type === 'banditLair');
  if (!site || !site.discovered || site.status === 'burned' || site.status === 'abandoned') {
    return '공격할 수 있는 산채가 없습니다.';
  }
  const groups = createExpeditionTacticalGroups(state, expedition.memberIds);
  if (groups.reduce((sum, group) => sum + group.count, 0) < 2) return '직접 지휘할 토벌대원이 부족합니다.';
  const scouted = (site.scoutedUntilDay ?? 0) >= state.day;
  const battle: TacticalBattle = {
    id: state.day * 1000 + state.subTick * 10 + 7,
    factionName: site.name,
    warned: scouted,
    siege: true,
    originalPower: Math.max(10, Math.round(site.militaryPower)),
    phase: 'preparation',
    round: 1,
    prepPoints: preparationPoints(groups, scouted),
    prepActions: ASSAULT_PREPARATIONS.map(action => ({ ...action, selected: false, applied: false })),
    preparationEvents: [],
    zones: assaultZones(scouted, site.alarm),
    defenderGroups: groups,
    raiderGroups: banditDefenders(site.militaryPower * LAIR_POSITION_POWER_MULTIPLIER, scouted),
    currentZoneId: 'lairTrail',
    villageMorale: clamp(64 + groups.length * 2 + (scouted ? 8 : 0), 0, 100),
    raiderMorale: clamp(68 + site.alarm * 0.18, 0, 100),
    reports: [],
    pendingReport: null,
    mode: 'garrison',
    orientation: 'assault',
    assaultKind: 'banditLair',
    assaultTargetSiteId: site.id,
    leaderEscapeBlocked: false,
    leaderEscaped: false,
    assaultFireDamage: 0,
  };
  state.tacticalBattle = battle;
  state.pendingChoice = null;
  addLog(state, `${site.name} 앞에서 토벌대 직접 지휘를 시작합니다.`, 'raid', true);
  return battle;
}

export function assaultPreparationUnavailableReason(
  state: GameState,
  actionId: PreparationActionId,
): string | null {
  const battle = state.tacticalBattle;
  if (!battle || battle.orientation !== 'assault') return '진행 중인 산채 공격전이 없습니다.';
  if (!ASSAULT_PREPARATIONS.some(action => action.id === actionId)) return '이 준비는 산채 공격에서 사용할 수 없습니다.';
  if (actionId === 'prepareFireArrows' && !battle.defenderGroups.some(group =>
    (group.kind === 'militia-bow' || group.kind === 'militia-musket') && activeCount(group) > 0)) {
    return '불화살이나 화공 사격을 맡을 원거리 부대가 없습니다.';
  }
  if (actionId === 'blockLeaderEscape' && !battle.defenderGroups.some(group =>
    group.kind === 'hunter' && activeCount(group) > 0)) return '퇴로에 보낼 사냥꾼이 없습니다.';
  if (actionId === 'lureGuards' && !battle.defenderGroups.some(group =>
    (group.kind === 'hunter' || group.kind === 'watchman') && activeCount(group) > 0)) return '초병을 유인할 척후가 없습니다.';
  return null;
}

export function spendAssaultPreparationAction(state: GameState, actionId: PreparationActionId): string | null {
  const battle = state.tacticalBattle;
  if (!battle || battle.orientation !== 'assault') return '진행 중인 산채 공격전이 없습니다.';
  if (battle.phase !== 'preparation') return '준비 단계가 이미 끝났습니다.';
  const action = battle.prepActions.find(candidate => candidate.id === actionId);
  if (!action) return '알 수 없는 공격 준비입니다.';
  if (action.selected) {
    action.selected = false;
    battle.prepPoints += action.cost;
    return null;
  }
  const unavailable = assaultPreparationUnavailableReason(state, actionId);
  if (unavailable) return unavailable;
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

export function advanceAssaultPhase(state: GameState): string | null {
  const battle = state.tacticalBattle;
  if (!battle || battle.orientation !== 'assault') return '진행 중인 산채 공격전이 없습니다.';
  if (battle.phase === 'preparation') {
    const events: TacticalAnimationEvent[] = [];
    for (const action of battle.prepActions.filter(candidate => candidate.selected && !candidate.applied)) {
      if (action.id === 'nightAssault') {
        battle.zones[0].pressure = clamp(battle.zones[0].pressure + 18, 0, 100);
        battle.raiderMorale = clamp(battle.raiderMorale - 6, 0, 100);
        prepEvent(events, 'lairTrail', 'ambush', '밤이 깊기를 기다렸다가 초병의 시야 밖으로 접근합니다.');
      } else if (action.id === 'prepareFireArrows') {
        prepEvent(events, 'lairWall', 'readyVolley', '기름 먹인 화살과 불씨를 원거리 부대에 나눠 줍니다.');
      } else if (action.id === 'blockLeaderEscape') {
        battle.leaderEscapeBlocked = true;
        const hunters = battle.defenderGroups.find(group => group.kind === 'hunter');
        if (hunters) hunters.power *= 0.72;
        prepEvent(events, 'lairKeep', 'prepareAmbush', '사냥꾼 일부가 두목의 산길 퇴로를 막으러 우회합니다.');
      } else if (action.id === 'lureGuards') {
        const sentries = battle.raiderGroups.find(group => group.zoneId === 'lairTrail');
        if (sentries) {
          sentries.power *= 0.65;
          sentries.morale = clamp(sentries.morale - 8, 0, 100);
          sentries.revealed = true;
        }
        prepEvent(events, 'lairTrail', 'advance', '소리와 흔적으로 초병 일부를 숲길 아래로 유인합니다.');
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
    chooseDefaultAssaultCommands(battle);
    battle.phase = 'command';
    return null;
  }
  return '지금은 다음 단계로 넘어갈 수 없습니다.';
}

export function assignAssaultGroup(state: GameState, groupId: string, zoneId: string): string | null {
  const battle = state.tacticalBattle;
  if (!battle || battle.orientation !== 'assault') return '진행 중인 산채 공격전이 없습니다.';
  if (battle.phase !== 'deployment') return '배치 단계에서만 병력을 옮길 수 있습니다.';
  const group = battle.defenderGroups.find(candidate => candidate.id === groupId);
  const zone = battle.zones.find(candidate => candidate.id === zoneId);
  const currentOrder = battle.zones.find(candidate => candidate.id === battle.currentZoneId)?.order ?? 0;
  if (!group) return '토벌대 그룹을 찾을 수 없습니다.';
  if (!zone) return '공격 구역을 찾을 수 없습니다.';
  if (zone.order > currentOrder) return '아직 돌파하지 못한 산채 안쪽에는 배치할 수 없습니다.';
  group.zoneId = zoneId;
  return null;
}

export function assaultCommandUnavailableReason(
  battle: TacticalBattle,
  group: TacticalDefenderGroup,
  command: TacticalCommandId,
): string | null {
  if (battle.orientation !== 'assault') return '산채 공격전 명령이 아닙니다.';
  if (command === 'hold' || command === 'fallback' || command === 'advance' || command === 'openRetreat') return null;
  if (command === 'charge') return MELEE_KINDS.has(group.kind) ? null : '돌격은 근접 부대만 수행할 수 있습니다.';
  if (command === 'volley') return RANGED_KINDS.has(group.kind) ? null : '일제 사격은 원거리 부대만 수행할 수 있습니다.';
  if (command === 'ambush') {
    return group.kind === 'hunter' && group.zoneId === 'lairTrail' ? null : '숲길의 사냥꾼만 급습할 수 있습니다.';
  }
  if (command === 'arson') {
    if (!preparationApplied(battle, 'prepareFireArrows')) return '먼저 불화살을 준비해야 합니다.';
    if (!RANGED_KINDS.has(group.kind)) return '원거리 부대만 화공을 실행할 수 있습니다.';
    return group.zoneId === 'lairWall' || group.zoneId === 'lairKeep' ? null : '목책이나 두목 움막에서만 불을 지를 수 있습니다.';
  }
  if (command === 'blockEscape') return group.kind === 'hunter' ? null : '사냥꾼만 두목의 퇴로를 차단할 수 있습니다.';
  return '이 명령은 산채 공격에서 사용할 수 없습니다.';
}

export function setAssaultCommand(state: GameState, groupId: string, command: TacticalCommandId): string | null {
  const battle = state.tacticalBattle;
  if (!battle || battle.orientation !== 'assault') return '진행 중인 산채 공격전이 없습니다.';
  if (battle.phase !== 'command') return '지휘 단계에서만 명령을 내릴 수 있습니다.';
  const group = battle.defenderGroups.find(candidate => candidate.id === groupId);
  if (!group) return '토벌대 그룹을 찾을 수 없습니다.';
  const unavailable = assaultCommandUnavailableReason(battle, group, command);
  if (unavailable) return unavailable;
  group.command = command;
  return null;
}

export function chooseDefaultAssaultCommands(battle: TacticalBattle): void {
  for (const group of battle.defenderGroups) {
    if (group.command || activeCount(group) <= 0) continue;
    if (group.kind === 'hunter' && group.zoneId === 'lairTrail') group.command = 'ambush';
    else if (RANGED_KINDS.has(group.kind)) group.command = 'volley';
    else group.command = 'advance';
  }
}

function commandPower(group: TacticalDefenderGroup): number {
  if (group.command === 'charge') return 1.5;
  if (group.command === 'volley') return 1.32;
  if (group.command === 'ambush') return 1.48;
  if (group.command === 'advance') return 1.14;
  if (group.command === 'hold') return 0.92;
  if (group.command === 'fallback') return 0.45;
  if (group.command === 'arson') return 0.9;
  if (group.command === 'blockEscape') return 0.32;
  if (group.command === 'openRetreat') return 0;
  return 0.8;
}

function casualtyExposure(group: TacticalDefenderGroup, hasMeleeScreen: boolean): number {
  let exposure = group.command === 'charge' ? 1.38 : group.command === 'fallback' ? 0.38 : group.command === 'hold' ? 0.68 : 1;
  if (RANGED_KINDS.has(group.kind) && hasMeleeScreen) exposure *= 0.48;
  else if (RANGED_KINDS.has(group.kind)) exposure *= 1.35;
  if (group.command === 'blockEscape') exposure *= 0.25;
  return exposure;
}

function addEvent(
  events: TacticalAnimationEvent[], zoneId: string, kind: TacticalAnimationEvent['kind'], text: string,
  extra: Partial<Pick<TacticalAnimationEvent, 'side' | 'groupId' | 'casualties' | 'float'>> = {},
): void {
  events.push({ zoneId, kind, text, durationMs: 620, ...extra });
}

function breachThreshold(zoneId: string): number {
  if (zoneId === 'lairTrail') return 50;
  if (zoneId === 'lairWall') return 95;
  if (zoneId === 'lairYard') return 90;
  return 95;
}

function outcomeSummary(outcome: NonNullable<TacticalRoundReport['outcome']>): string {
  if (outcome === 'assaultVictory') return '두목 친위대가 무너져 산채를 완전히 소탕했습니다.';
  if (outcome === 'assaultAbandoned') return '두목과 잔당이 달아나 산채가 버려졌습니다.';
  if (outcome === 'assaultRaid') return '산채 마당과 창고를 턴 뒤 병력을 보존해 이탈합니다.';
  if (outcome === 'assaultDefeat') return '토벌대의 기세가 무너져 강제로 퇴각합니다.';
  if (outcome === 'assaultWithdrawal') return '공격을 중지하고 질서 있게 철수합니다.';
  return '산채 공격 교전이 끝났습니다.';
}

export function resolveAssaultRound(state: GameState): string | null {
  const battle = state.tacticalBattle;
  if (!battle || battle.orientation !== 'assault') return '진행 중인 산채 공격전이 없습니다.';
  if (battle.phase !== 'command') return '교전을 진행할 지휘 단계가 아닙니다.';
  chooseDefaultAssaultCommands(battle);
  const rng = makeRng(state.seed + battle.id * 8191 + battle.round * 131071);
  const zone = battle.zones.find(candidate => candidate.id === battle.currentZoneId)!;
  const players = battle.defenderGroups.filter(group => group.zoneId === zone.id && activeCount(group) > 0);
  const enemies = battle.raiderGroups.filter(group => group.zoneId === zone.id && group.intent !== 'withdraw' && group.power > 0);
  const events: TacticalAnimationEvent[] = [];
  const lines: string[] = [];
  let wounded = 0;
  let killed = 0;
  let raidersKilled = 0;
  let villageMoraleDelta = 0;
  let raiderMoraleDelta = 0;
  const retreatOrdered = players.some(group => group.command === 'openRetreat');
  addEvent(events, zone.id, 'camera', `${zone.name} 공략을 시작합니다.`);

  const activePlayers = Math.max(1, players.reduce((sum, group) => sum + activeCount(group), 0));
  let playerPower = players.reduce((sum, group) => {
    const share = group.count > 0 ? activeCount(group) / group.count : 0;
    return sum + group.power * share * commandPower(group);
  }, 0);
  const enemyPower = enemies.reduce((sum, group) => sum + group.power * (Math.max(30, group.morale) / 100), 0) *
    (1 + zone.defenseBonus / 100);
  playerPower *= 0.9 + rng() * 0.2;
  const totalPower = Math.max(1, playerPower + enemyPower);
  const playerShare = playerPower / totalPower;
  const enemyShare = enemyPower / totalPower;
  const commands = new Set(players.map(group => group.command));

  if (commands.has('ambush')) addEvent(events, zone.id, 'ambush', '사냥꾼 척후대가 숲길 초병의 측면을 덮칩니다.', { side: 'raider', float: '기습!' });
  if (commands.has('volley')) {
    const musketeers = players.filter(group => group.kind === 'militia-musket' && group.command === 'volley')
      .reduce((sum, group) => sum + activeCount(group), 0);
    if (musketeers > 0 && state.resources.gunpowder > 0) {
      const powder = Math.min(state.resources.gunpowder, musketeers * 0.15);
      state.resources.gunpowder -= powder;
      lines.push(`조총 사격에 화약 ${powder.toFixed(1)}을 소모했습니다.`);
    }
    addEvent(events, zone.id, 'volley', '목책과 적 대열을 향해 활과 조총을 일제히 쏩니다.', { side: 'defender' });
  }
  if (commands.has('charge') || commands.has('advance')) addEvent(events, zone.id, 'melee', '토벌대 전열이 방어선을 밀어붙입니다.', { side: 'defender', float: '공세!' });
  if (commands.has('arson')) {
    battle.assaultFireDamage = (battle.assaultFireDamage ?? 0) + 1;
    addEvent(events, zone.id, 'fire', '불화살이 목책과 움막에 꽂혀 불길이 번집니다.', { side: 'raider', float: '화공!' });
    lines.push('화공으로 돌파가 빨라지지만 회수할 노획 일부가 불탑니다.');
  }
  if (commands.has('blockEscape')) lines.push('사냥꾼이 본대 화력에서 빠져 두목의 퇴로를 감시합니다.');

  const activeEnemyCount = Math.max(0, enemies.reduce((sum, group) => sum + Math.max(0, group.count - group.killed), 0));
  const enemyLossRate = clamp(0.04 + playerShare * 0.2 + (commands.has('charge') ? 0.05 : 0) + (commands.has('ambush') ? 0.06 : 0), 0.03, 0.32);
  for (const enemy of enemies) {
    const active = Math.max(0, enemy.count - enemy.killed);
    const expected = active * enemyLossRate;
    let losses = Math.min(active, Math.floor(expected) + (rng() < expected % 1 ? 1 : 0));
    if (activeEnemyCount > 0 && playerShare > 0.72 && losses === 0) losses = 1;
    enemy.killed += losses;
    raidersKilled += losses;
    enemy.power = Math.max(0, enemy.power * (1 - enemyLossRate));
    if (losses > 0) addEvent(events, zone.id, 'casualty', `${enemy.label}에서 ${losses}명이 쓰러집니다.`, {
      side: 'raider', groupId: enemy.id, casualties: losses, float: `-${losses}`,
    });
  }

  const hasMeleeScreen = players.some(group => MELEE_KINDS.has(group.kind) && group.line === 'front' && activeCount(group) > 0);
  for (const group of players) {
    const active = activeCount(group);
    if (active <= 0) continue;
    const risk = clamp(enemyShare * (0.1 + zone.pressure / 900) * casualtyExposure(group, hasMeleeScreen), 0, 0.42);
    const expected = active * risk;
    let losses = Math.min(active, Math.floor(expected) + (rng() < expected % 1 ? 1 : 0));
    let dead = losses > 0 && enemyShare > 0.58 && rng() < risk * 0.28 ? 1 : 0;
    dead = Math.min(dead, losses);
    const hurt = losses - dead;
    group.killed += dead;
    group.wounded += hurt;
    killed += dead;
    wounded += hurt;
    if (losses > 0) addEvent(events, zone.id, 'casualty', `${group.label}에서 전사 ${dead}, 부상 ${hurt}명이 발생합니다.`, {
      side: 'defender', groupId: group.id, casualties: losses, float: dead > 0 ? `전사 ${dead}·부상 ${hurt}` : `부상 ${hurt}`,
    });
  }

  let pressureDelta = 22 + playerShare * 44 - enemyShare * 8 - zone.defenseBonus / 5;
  if (commands.has('charge')) pressureDelta += 9;
  if (commands.has('advance')) pressureDelta += 5;
  if (commands.has('ambush')) pressureDelta += 7;
  if (commands.has('arson')) pressureDelta += 18;
  if (commands.has('fallback')) pressureDelta -= 22;
  if (enemies.every(enemy => enemy.power <= battle.originalPower * 0.015 || enemy.killed >= enemy.count)) pressureDelta += 24;
  if (retreatOrdered) pressureDelta = 0;
  zone.pressure = clamp(zone.pressure + Math.max(0, pressureDelta), 0, 100);
  const breachedNow = !zone.breached && zone.pressure >= breachThreshold(zone.id);
  if (breachedNow) {
    zone.breached = true;
    enemies.forEach(enemy => { enemy.intent = 'withdraw'; });
    addEvent(events, zone.id, zone.id === 'lairWall' ? 'wallHit' : 'zoneFall', `${zone.name} 방어가 무너져 다음 구역으로 길이 열립니다.`, {
      side: 'raider', float: '돌파!',
    });
    villageMoraleDelta += 7;
    raiderMoraleDelta -= 12;
  }

  villageMoraleDelta += Math.round(clamp(2 + playerShare * 4 - (wounded + killed) * 4 - enemyShare * 5, -18, 8));
  raiderMoraleDelta += Math.round(clamp(-3 - raidersKilled * 3 - pressureDelta / 12, -24, 0));
  battle.villageMorale = clamp(battle.villageMorale + villageMoraleDelta, 0, 100);
  battle.raiderMorale = clamp(battle.raiderMorale + raiderMoraleDelta, 0, 100);
  enemies.forEach(enemy => { enemy.morale = clamp(enemy.morale + raiderMoraleDelta, 0, 100); enemy.revealed = true; enemy.engagementsInZone += 1; });

  const yardBreached = battle.zones.find(candidate => candidate.id === 'lairYard')?.breached ?? false;
  const keepBreached = battle.zones.find(candidate => candidate.id === 'lairKeep')?.breached ?? false;
  const allPlayersDown = battle.defenderGroups.every(group => activeCount(group) <= 0);
  const escapeBlockedThisRound = battle.leaderEscapeBlocked || players.some(group => group.command === 'blockEscape' && activeCount(group) > 0);
  let outcome: TacticalRoundReport['outcome'];
  if (retreatOrdered) outcome = yardBreached ? 'assaultRaid' : 'assaultWithdrawal';
  else if (allPlayersDown || battle.villageMorale <= 0) outcome = 'assaultDefeat';
  // 산채 기세가 먼저 무너져도 두목 움막을 돌파하기 전에는 완전 소탕할 수 없다.
  else if (keepBreached) {
    if (!escapeBlockedThisRound && rng() < 0.55) {
      battle.leaderEscaped = true;
      outcome = 'assaultAbandoned';
    } else outcome = 'assaultVictory';
  } else if (battle.raiderMorale <= 28 && !escapeBlockedThisRound && rng() < 0.38) {
    battle.leaderEscaped = true;
    outcome = 'assaultAbandoned';
  } else if (battle.round >= ASSAULT_MAX_ROUNDS) outcome = yardBreached ? 'assaultRaid' : 'assaultDefeat';

  const nextZone = zone.breached
    ? [...battle.zones].sort((a, b) => a.order - b.order).find(candidate => candidate.order > zone.order)
    : null;
  const nextFocusZoneId = nextZone?.id ?? zone.id;
  if (wounded + killed > 0) lines.push(`토벌대 피해: 전사 ${killed}명, 부상 ${wounded}명.`);
  if (raidersKilled > 0) lines.push(`산채 수비대 ${raidersKilled}명을 쓰러뜨렸습니다.`);
  lines.push(`토벌대 기세 ${villageMoraleDelta >= 0 ? '+' : ''}${villageMoraleDelta}, 산채 기세 ${raiderMoraleDelta}.`);
  if (outcome === 'assaultAbandoned') {
    addEvent(events, zone.id, 'leaderEscape', '두목과 잔당이 노획물을 챙겨 산길 퇴로로 달아납니다.', {
      side: 'raider', groupId: 'lair-leader', float: '두목 도주!',
    });
  } else if (outcome === 'assaultVictory' && escapeBlockedThisRound &&
    (keepBreached || battle.raiderMorale <= 0)) {
    addEvent(events, zone.id, 'escapeBlocked', '퇴로에 매복한 사냥꾼이 달아나는 두목을 막아 세웁니다.', {
      side: 'raider', groupId: 'lair-leader', float: '퇴로 봉쇄!',
    });
  }
  if (outcome) addEvent(
    events,
    zone.id,
    outcome === 'assaultVictory' || outcome === 'assaultAbandoned' ? 'moraleBreak' : 'report',
    outcomeSummary(outcome),
  );

  const report: TacticalRoundReport = {
    round: battle.round,
    focusZoneId: zone.id,
    nextFocusZoneId,
    summary: outcome ? outcomeSummary(outcome) : `${zone.name} 교전이 끝났습니다.`,
    lines,
    events,
    wounded,
    killed,
    raidersKilled,
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
  battle.phase = 'simulating';
  return null;
}

export function acknowledgeAssaultReport(state: GameState): string | null {
  const battle = state.tacticalBattle;
  if (!battle || battle.orientation !== 'assault' || !battle.pendingReport) return '확인할 산채 공격 보고가 없습니다.';
  if (battle.phase !== 'report') return '아직 전투 연출이 끝나지 않았습니다.';
  if (battle.pendingReport.ended) {
    battle.phase = 'finished';
    return null;
  }
  const nextZoneId = battle.pendingReport.nextFocusZoneId;
  if (nextZoneId !== battle.currentZoneId) {
    for (const group of battle.defenderGroups) {
      if (activeCount(group) > 0) group.zoneId = nextZoneId;
    }
  }
  battle.currentZoneId = nextZoneId;
  battle.defenderGroups.forEach(group => { group.command = null; });
  battle.pendingReport = null;
  battle.phase = 'command';
  return null;
}

function assaultLoot(outcome: TacticalRoundReport['outcome'], fireDamage: number): Partial<Record<ResourceId, number>> {
  const loss = Math.min(3, fireDamage);
  if (outcome === 'assaultVictory') return { grain: Math.max(2, 8 - loss * 2), hide: Math.max(2, 6 - loss), tools: Math.max(0, 2 - Math.floor(loss / 2)) };
  if (outcome === 'assaultRaid') return { grain: Math.max(1, 4 - loss), hide: Math.max(1, 3 - loss), tools: loss < 2 ? 1 : 0 };
  if (outcome === 'assaultAbandoned') return { grain: Math.max(1, 4 - loss), hide: Math.max(1, 3 - loss) };
  return {};
}

export function finishBanditLairTacticalAssault(state: GameState): void {
  const battle = state.tacticalBattle;
  if (!battle || battle.orientation !== 'assault') return;
  const finalReport = [...battle.reports].reverse().find(report => report.ended) ?? battle.reports[battle.reports.length - 1];
  const outcome = finalReport?.outcome ?? 'assaultDefeat';
  const rng = makeRng(state.seed + battle.id * 524287 + 211);
  let casualties = 0;
  for (const group of battle.defenderGroups) {
    if (group.killed > 0) killResidents(state, rng, group.killed, 1, group.residentIds);
    if (group.wounded > 0) injure(state, rng, group.wounded, 20, group.residentIds, true);
    casualties += group.killed + group.wounded;
  }
  const strategicOutcome: BanditLairOutcome = outcome === 'assaultVictory'
    ? 'victory'
    : outcome === 'assaultRaid'
      ? 'raid'
      : outcome === 'assaultAbandoned'
        ? 'abandoned'
        : outcome === 'assaultWithdrawal'
          ? 'withdrawal'
          : 'defeat';
  const error = applyBanditLairOutcome(
    state,
    battle.assaultTargetSiteId ?? -1,
    strategicOutcome,
    { lootDamage: battle.assaultFireDamage ?? 0 },
  );
  if (error) addLog(state, error, 'bad', true);
  const loot = assaultLoot(outcome, battle.assaultFireDamage ?? 0);
  if (state.expedition) {
    state.expedition.carriedLoot = loot;
    if (casualties > 0) state.expedition.speed = Math.max(0.25, state.expedition.speed * 0.7);
    state.battleScars = [
      ...(state.battleScars ?? []).filter(scar => scar.until >= state.day),
      { x: state.expedition.targetX, y: state.expedition.targetY, until: state.day + 4 },
    ];
  }
  state.tacticalBattle = null;
  state.tacticalBattleReport = null;
  const returnError = beginExpeditionReturn(state, '토벌대가 산채 직접 지휘전을 마치고 귀환길에 올랐습니다.');
  if (returnError) addLog(state, returnError, 'bad', true);
}

export function assaultMaxRounds(): number {
  return ASSAULT_MAX_ROUNDS;
}
