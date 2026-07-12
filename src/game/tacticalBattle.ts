import { resetAgent } from './agents';
import { countBuilt, militiaWeaponAllocation } from './buildings';
import { CONFIG } from './config';
import { RESOURCE_NAMES } from './constants';
import { addLog } from './events';
import { makeRng } from './map';
import {
  applyLootLosses, damageBuildings, describeLootLosses, injure, killResidents, moraleShock,
} from './raidDamage';
import { changeRelation } from './relations';
import { livingResidents } from './residents';
import { getDayOfSeason, getSeason, getYear } from './seasons';
import type {
  DefenderGroupKind,
  GameState,
  PreparationActionId,
  ResourceId,
  TacticalAnimationEvent,
  TacticalBattle,
  TacticalBattleZone,
  TacticalCommandId,
  TacticalDefenderGroup,
  TacticalRaiderGroup,
  TacticalRoundReport,
} from './types';

const PREPARATION_ACTIONS: Array<{ id: PreparationActionId; label: string; cost: number }> = [
  { id: 'evacuateCivilians', label: '주민 대피', cost: 1 },
  { id: 'hideSupplies', label: '창고 물자 은닉', cost: 1 },
  { id: 'repairWall', label: '목책 응급 수리', cost: 1 },
  { id: 'setAmbush', label: '사냥꾼 매복 배치', cost: 1 },
  { id: 'prepareVolley', label: '망루·사격 준비', cost: 1 },
  { id: 'musterMilitia', label: '민병 소집', cost: 1 },
];

const IMPLEMENTED_COMMANDS = new Set<TacticalCommandId>([
  'hold', 'volley', 'ambush', 'guardStorehouse', 'protectCivilians', 'fallback',
]);

const GROUP_LABELS: Record<DefenderGroupKind, string> = {
  'militia-musket': '조총 수비대',
  'militia-bow': '각궁 수비대',
  'militia-spear': '창 수비대',
  'militia-unarmed': '소집 민병',
  watchman: '파수꾼',
  hunter: '사냥꾼',
  civilian: '피난 주민',
};

const GROUP_POWER: Record<DefenderGroupKind, number> = {
  'militia-musket': CONFIG.tacticalBattle.groupPower.militiaMusket,
  'militia-bow': CONFIG.tacticalBattle.groupPower.militiaBow,
  'militia-spear': CONFIG.tacticalBattle.groupPower.militiaSpear,
  'militia-unarmed': CONFIG.tacticalBattle.groupPower.militiaUnarmed,
  watchman: CONFIG.tacticalBattle.groupPower.watchman,
  hunter: CONFIG.tacticalBattle.groupPower.hunter,
  civilian: CONFIG.tacticalBattle.groupPower.civilian,
};

const ROUTES: Record<TacticalRaiderGroup['kind'], string[]> = {
  main: ['approach', 'wall', 'center'],
  looters: ['approach', 'wall', 'storehouse'],
  flankers: ['approach', 'storehouse', 'center'],
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function applied(battle: TacticalBattle, id: PreparationActionId): boolean {
  return battle.prepActions.some(action => action.id === id && action.applied);
}

function healthy(resident: GameState['residents'][number]): boolean {
  return resident.alive && !resident.sick && resident.health >= 20;
}

function group(
  kind: DefenderGroupKind,
  residentIds: number[],
  zoneId: string,
  suffix = '',
): TacticalDefenderGroup | null {
  if (residentIds.length === 0) return null;
  return {
    id: `${kind}${suffix}`,
    kind,
    label: GROUP_LABELS[kind],
    residentIds,
    count: residentIds.length,
    zoneId,
    command: null,
    power: residentIds.length * GROUP_POWER[kind],
    wounded: 0,
    killed: 0,
  };
}

function defenderGroups(state: GameState, mode: TacticalBattle['mode']): TacticalDefenderGroup[] {
  const combatReady = state.residents.filter(healthy);
  const militia = combatReady.filter(resident => resident.job === 'militia').sort((a, b) => a.id - b.id);
  const allocation = militiaWeaponAllocation(state);
  let cursor = 0;
  const muskets = militia.slice(cursor, cursor += allocation.muskets).map(resident => resident.id);
  const bows = militia.slice(cursor, cursor += allocation.hornBows).map(resident => resident.id);
  const spears = militia.slice(cursor, cursor += allocation.spears).map(resident => resident.id);
  const unarmedMilitia = militia.slice(cursor).map(resident => resident.id);
  const used = new Set(militia.map(resident => resident.id));

  const watchmen = combatReady.filter(resident => resident.job === 'watchman').map(resident => resident.id);
  const hunters = combatReady.filter(resident => resident.job === 'hunter').map(resident => resident.id);
  for (const id of [...watchmen, ...hunters]) used.add(id);

  const others = state.residents.filter(resident => resident.alive && !used.has(resident.id));
  const levyCandidates = others.filter(healthy);
  const levyCount = mode === 'levy' ? Math.ceil(levyCandidates.length * 0.65) : 0;
  const levyIds = levyCandidates.slice(0, levyCount).map(resident => resident.id);
  const levySet = new Set(levyIds);
  const civilianIds = others.filter(resident => !levySet.has(resident.id)).map(resident => resident.id);

  return [
    group('militia-musket', muskets, 'wall'),
    group('militia-bow', bows, 'wall'),
    group('militia-spear', spears, 'wall'),
    group('militia-unarmed', [...unarmedMilitia, ...levyIds], mode === 'levy' ? 'storehouse' : 'wall'),
    group('watchman', watchmen, 'wall'),
    group('hunter', hunters, 'approach'),
    group('civilian', civilianIds, 'center'),
  ].filter((candidate): candidate is TacticalDefenderGroup => candidate != null);
}

function preparationPoints(state: GameState, warned: boolean): number {
  const prep = CONFIG.tacticalBattle.prep;
  let points = warned ? prep.warned : prep.surpriseBase;
  points += countBuilt(state, 'beacon') > 0 ? prep.beacon : 0;
  points += Math.min(prep.watchtowerMax, countBuilt(state, 'watchtower'));
  const watchmen = state.residents.filter(resident => resident.alive && resident.job === 'watchman').length;
  points += Math.min(prep.watchmenMax, Math.floor(watchmen / prep.watchmenPerPoint));
  if (state.weather === 'blizzard' || state.weather === 'coldSnap') points -= prep.severeWeatherPenalty;
  return clamp(points, 0, prep.max);
}

function createZones(state: GameState, siege: boolean, groups: TacticalDefenderGroup[]): TacticalBattleZone[] {
  const hasHunters = groups.some(candidate => candidate.kind === 'hunter');
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
  power: number,
  warned: boolean,
  scouting: { watchmen: number; watchtowers: number; hunters: number },
): TacticalRaiderGroup[] {
  const split = CONFIG.tacticalBattle.raiderSplit;
  const mainPower = Math.max(1, Math.round(power * split.main));
  const looterPower = Math.max(1, Math.round(power * split.looters));
  const flankPower = Math.max(1, power - mainPower - looterPower);
  const totalCount = Math.max(3, Math.round(power / CONFIG.tacticalBattle.raiderPowerPerFighter));
  const remaining = totalCount - 3;
  let mainCount = 1 + Math.round(remaining * split.main);
  let looterCount = 1 + Math.round(remaining * split.looters);
  let flankerCount = totalCount - mainCount - looterCount;
  if (flankerCount < 1) {
    mainCount = Math.max(1, mainCount - (1 - flankerCount));
    flankerCount = 1;
  }
  const scoutsReady = warned || scouting.watchtowers > 0 || scouting.watchmen >= 2;
  return [
    {
      id: 'raider-main', kind: 'main', label: '적 주력', zoneId: 'approach', targetZoneId: 'wall',
      power: mainPower, count: mainCount, killed: 0, morale: 75, intent: 'advance', revealed: true,
    },
    {
      id: 'raider-looters', kind: 'looters', label: '약탈조', zoneId: 'approach', targetZoneId: 'storehouse',
      power: looterPower, count: looterCount, killed: 0, morale: 68, intent: 'loot', revealed: scoutsReady,
    },
    {
      id: 'raider-flankers', kind: 'flankers', label: '우회조', zoneId: 'approach', targetZoneId: 'center',
      power: flankPower, count: flankerCount, killed: 0, morale: 70, intent: 'flank',
      revealed: warned || (scouting.watchtowers > 0 && scouting.hunters > 0),
    },
  ];
}

export function createTacticalBattle(
  state: GameState,
  params: {
    factionName: string;
    power: number;
    warned: boolean;
    siege: boolean;
    mode: 'garrison' | 'levy';
  },
): TacticalBattle {
  const groups = defenderGroups(state, params.mode);
  const watchmen = groups.find(candidate => candidate.kind === 'watchman')?.count ?? 0;
  const hunters = groups.find(candidate => candidate.kind === 'hunter')?.count ?? 0;
  const originalPower = Math.max(3, Math.round(params.power));
  const battle: TacticalBattle = {
    id: state.day * 1000 + state.subTick * 10 + (params.mode === 'levy' ? 2 : 1),
    factionName: params.factionName,
    warned: params.warned,
    siege: params.siege,
    originalPower,
    phase: 'preparation',
    round: 1,
    prepPoints: preparationPoints(state, params.warned),
    prepActions: PREPARATION_ACTIONS.map(action => ({ ...action, applied: false })),
    zones: createZones(state, params.siege, groups),
    defenderGroups: groups,
    raiderGroups: raiderGroups(originalPower, params.warned, {
      watchmen,
      watchtowers: countBuilt(state, 'watchtower'),
      hunters,
    }),
    currentZoneId: 'approach',
    villageMorale: clamp(
      CONFIG.tacticalBattle.morale.village +
      (params.warned ? CONFIG.tacticalBattle.morale.warnedBonus : 0) +
      (params.siege ? CONFIG.tacticalBattle.morale.siegeBonus : 0),
      0,
      100,
    ),
    raiderMorale: CONFIG.tacticalBattle.morale.raiders,
    reports: [],
    pendingReport: null,
    mode: params.mode,
  };
  state.tacticalBattle = battle;
  state.battle = null;
  state.pendingChoice = null;
  addLog(state, `${params.factionName}의 습격에 맞서 직접 방어 지휘를 시작합니다.`, 'raid', true);
  return battle;
}

export function spendPreparationAction(state: GameState, actionId: PreparationActionId): string | null {
  const battle = state.tacticalBattle;
  if (!battle) return '진행 중인 직접 지휘 전투가 없습니다.';
  if (battle.phase !== 'preparation') return '준비 단계가 이미 끝났습니다.';
  const action = battle.prepActions.find(candidate => candidate.id === actionId);
  if (!action) return '알 수 없는 준비 행동입니다.';
  if (action.applied) return '이미 마친 준비입니다.';
  if (battle.prepPoints < action.cost) return '남은 준비점수가 부족합니다.';

  const zone = (id: string) => battle.zones.find(candidate => candidate.id === id)!;
  if (actionId === 'evacuateCivilians') {
    zone('storehouse').civilianRisk = Math.max(0, zone('storehouse').civilianRisk - 18);
    zone('center').civilianRisk = Math.max(0, zone('center').civilianRisk - 25);
    battle.villageMorale = Math.min(100, battle.villageMorale + 5);
  } else if (actionId === 'hideSupplies') {
    zone('storehouse').lootRisk = Math.max(5, zone('storehouse').lootRisk - 28);
  } else if (actionId === 'repairWall') {
    zone('wall').defenseBonus += battle.siege ? 18 : 12;
    zone('wall').pressure = Math.max(0, zone('wall').pressure - 12);
  } else if (actionId === 'setAmbush') {
    const hunters = battle.defenderGroups.find(candidate => candidate.kind === 'hunter')?.count ?? 0;
    zone('approach').ambushBonus += hunters > 0 ? 28 : 14;
    battle.raiderGroups.forEach(candidate => { candidate.revealed = true; });
  } else if (actionId === 'musterMilitia') {
    const civilians = battle.defenderGroups.find(candidate => candidate.kind === 'civilian');
    if (!civilians || civilians.residentIds.length === 0) return '추가로 소집할 주민이 없습니다.';
    const musterCount = Math.max(1, Math.ceil(civilians.residentIds.length / 2));
    const musteredIds = civilians.residentIds.splice(0, musterCount);
    civilians.count = civilians.residentIds.length;
    civilians.power = civilians.count * GROUP_POWER.civilian;
    let militia = battle.defenderGroups.find(candidate => candidate.kind === 'militia-unarmed');
    if (!militia) {
      militia = group('militia-unarmed', [], 'storehouse', '-mustered') ?? {
        id: 'militia-unarmed-mustered', kind: 'militia-unarmed', label: GROUP_LABELS['militia-unarmed'],
        residentIds: [], count: 0, zoneId: 'storehouse', command: null, power: 0, wounded: 0, killed: 0,
      };
      battle.defenderGroups.push(militia);
    }
    militia.residentIds.push(...musteredIds);
    militia.count = militia.residentIds.length;
    militia.power = militia.count * GROUP_POWER['militia-unarmed'];
    battle.villageMorale = Math.max(0, battle.villageMorale - 3);
  }

  action.applied = true;
  battle.prepPoints -= action.cost;
  return null;
}

export function assignDefenderGroup(state: GameState, groupId: string, zoneId: string): string | null {
  const battle = state.tacticalBattle;
  if (!battle) return '진행 중인 직접 지휘 전투가 없습니다.';
  if (battle.phase !== 'deployment') return '배치 단계에서만 병력을 옮길 수 있습니다.';
  const defender = battle.defenderGroups.find(candidate => candidate.id === groupId);
  if (!defender) return '수비 그룹을 찾을 수 없습니다.';
  if (!battle.zones.some(zone => zone.id === zoneId)) return '전투 구역을 찾을 수 없습니다.';
  defender.zoneId = zoneId;
  return null;
}

export function setTacticalCommand(
  state: GameState,
  groupId: string,
  command: TacticalCommandId,
): string | null {
  const battle = state.tacticalBattle;
  if (!battle) return '진행 중인 직접 지휘 전투가 없습니다.';
  if (battle.phase !== 'command') return '지휘 단계에서만 명령을 내릴 수 있습니다.';
  if (!IMPLEMENTED_COMMANDS.has(command)) return '이 명령은 아직 사용할 수 없습니다.';
  const defender = battle.defenderGroups.find(candidate => candidate.id === groupId);
  if (!defender) return '수비 그룹을 찾을 수 없습니다.';
  defender.command = command;
  return null;
}

export function chooseDefaultTacticalCommands(battle: TacticalBattle): void {
  for (const defender of battle.defenderGroups) {
    if (defender.command) continue;
    if (defender.kind === 'civilian') defender.command = 'protectCivilians';
    else if (defender.kind === 'hunter' && defender.zoneId === 'approach') defender.command = 'ambush';
    else if (defender.kind === 'militia-bow' || defender.kind === 'militia-musket') defender.command = 'volley';
    else if (defender.zoneId === 'storehouse') defender.command = 'guardStorehouse';
    else defender.command = 'hold';
  }
}

export function advanceTacticalPhase(state: GameState): string | null {
  const battle = state.tacticalBattle;
  if (!battle) return '진행 중인 직접 지휘 전투가 없습니다.';
  if (battle.phase === 'preparation') {
    battle.phase = 'deployment';
    return null;
  }
  if (battle.phase === 'deployment') {
    chooseDefaultTacticalCommands(battle);
    battle.phase = 'command';
    return null;
  }
  return '지금은 다음 단계로 넘어갈 수 없습니다.';
}

function activeCount(group: TacticalDefenderGroup): number {
  return Math.max(0, group.count - group.wounded - group.killed);
}

function commandPowerMultiplier(
  state: GameState,
  battle: TacticalBattle,
  zone: TacticalBattleZone,
  defender: TacticalDefenderGroup,
): number {
  const command = defender.command ?? 'hold';
  if (command === 'hold') return 1.22;
  if (command === 'fallback') return 0.22;
  if (command === 'guardStorehouse') return zone.id === 'storehouse' ? 1.42 : 0.78;
  if (command === 'protectCivilians') return zone.id === 'center' || zone.id === 'storehouse' ? 1.05 : 0.72;
  if (command === 'ambush') {
    const suited = defender.kind === 'hunter' && zone.id === 'approach';
    return suited ? 1.48 + zone.ambushBonus / 100 : 0.62;
  }
  if (command === 'volley') {
    const ranged = defender.kind === 'militia-bow' || defender.kind === 'militia-musket' || defender.kind === 'watchman';
    if (!ranged) return 0.68;
    let mult = 1.38 + (applied(battle, 'prepareVolley') ? 0.22 : 0);
    if (state.weather === 'blizzard') mult *= 0.62;
    else if (state.weather === 'heavySnow') mult *= 0.82;
    if (defender.kind === 'militia-musket' && state.resources.gunpowder <= 0) mult *= 0.68;
    return mult;
  }
  return 1;
}

function casualtyMultiplier(battle: TacticalBattle, defender: TacticalDefenderGroup): number {
  let mult = defender.command === 'hold' ? 0.72 : defender.command === 'fallback' ? 0.38 : 1;
  if (defender.command === 'guardStorehouse') mult *= 1.18;
  if (defender.command === 'protectCivilians' && defender.kind === 'civilian') mult *= 0.42;
  if (defender.kind === 'civilian' && applied(battle, 'evacuateCivilians')) mult *= 0.42;
  if (defender.command === 'ambush' && defender.kind === 'hunter') mult *= 1.08;
  return mult;
}

function pendingLootAvailable(state: GameState, battle: TacticalBattle, resource: ResourceId): number {
  const alreadyTaken = battle.reports.reduce((sum, report) => sum + (report.loot[resource] ?? 0), 0);
  return Math.max(0, Math.floor((state.resources[resource] ?? 0) - alreadyTaken));
}

function addLoot(
  state: GameState,
  battle: TacticalBattle,
  lootBag: Partial<Record<ResourceId, number>>,
  pressure: number,
): void {
  const factor = clamp(pressure / 100, 0.15, 1);
  const requests: Partial<Record<ResourceId, number>> = {
    grain: Math.max(1, Math.round((3 + battle.originalPower / 18) * factor)),
    firewood: Math.max(1, Math.round((2 + battle.originalPower / 24) * factor)),
    hide: Math.max(0, Math.round((battle.originalPower / 35) * factor)),
  };
  for (const [key, requested] of Object.entries(requests)) {
    const resource = key as ResourceId;
    const amount = Math.min(pendingLootAvailable(state, battle, resource), requested ?? 0);
    if (amount > 0) lootBag[resource] = (lootBag[resource] ?? 0) + amount;
  }
}

function event(
  events: TacticalAnimationEvent[],
  zoneId: string,
  kind: TacticalAnimationEvent['kind'],
  text: string,
  durationMs = 650,
): void {
  events.push({ zoneId, kind, text, durationMs });
}

function summaryForOutcome(outcome: TacticalRoundReport['outcome']): string {
  if (outcome === 'defenseSuccess') return '적의 기세가 꺾여 습격대가 물러납니다.';
  if (outcome === 'villageRouted') return '마을 중심 방어선이 무너졌습니다.';
  if (outcome === 'raidersLooted') return '약탈대가 노획물을 챙겨 퇴각합니다.';
  if (outcome === 'partialLoss') return '마을은 버텼지만 일부 방어선과 비축을 잃었습니다.';
  return '전선의 압박이 다음 구역으로 옮겨갑니다.';
}

export function resolveTacticalRound(state: GameState): string | null {
  const battle = state.tacticalBattle;
  if (!battle) return '진행 중인 직접 지휘 전투가 없습니다.';
  if (battle.phase !== 'command') return '라운드를 진행할 지휘 단계가 아닙니다.';
  chooseDefaultTacticalCommands(battle);
  const rng = makeRng(state.seed + battle.id * 8191 + battle.round * 131071);
  const events: TacticalAnimationEvent[] = [];
  const lines: string[] = [];
  const lootBag: Partial<Record<ResourceId, number>> = {};
  const dominance = new Map<string, number>();
  let roundWounded = 0;
  let roundKilled = 0;
  let roundRaidersKilled = 0;
  let buildingsDamaged = 0;
  let villageMoraleDelta = 0;
  let raiderMoraleDelta = 0;
  const focusZoneId = battle.currentZoneId;

  event(events, focusZoneId, 'camera', `${battle.zones.find(zone => zone.id === focusZoneId)?.name ?? '전선'}으로 시선을 옮깁니다.`, 450);

  for (const zone of battle.zones) {
    const attackers = battle.raiderGroups.filter(group => group.zoneId === zone.id && group.intent !== 'withdraw' && group.power > 0);
    if (attackers.length === 0) {
      zone.pressure = Math.max(0, zone.pressure - 5);
      continue;
    }
    const defenders = battle.defenderGroups.filter(group => group.zoneId === zone.id && activeCount(group) > 0);
    const rawEnemyPower = attackers.reduce((sum, group) => sum + group.power * (group.morale / 100), 0);
    const enemyPower = rawEnemyPower * (0.88 + rng() * 0.24);
    let defensePower = defenders.reduce((sum, defender) => {
      const active = activeCount(defender);
      const survivingShare = defender.count > 0 ? active / defender.count : 0;
      return sum + defender.power * survivingShare * commandPowerMultiplier(state, battle, zone, defender);
    }, 0);
    defensePower *= 1 + zone.defenseBonus / 100;
    const total = Math.max(1, enemyPower + defensePower);
    const enemyShare = enemyPower / total;
    const defenseShare = defensePower / total;
    dominance.set(zone.id, enemyShare);

    const commands = new Set(defenders.map(defender => defender.command));
    if (commands.has('volley')) {
      const musketeers = defenders
        .filter(defender => defender.kind === 'militia-musket' && defender.command === 'volley')
        .reduce((sum, defender) => sum + activeCount(defender), 0);
      if (musketeers > 0 && state.resources.gunpowder > 0) {
        const powder = Math.min(state.resources.gunpowder, musketeers * 0.15);
        state.resources.gunpowder = Math.max(0, state.resources.gunpowder - powder);
        lines.push(`조총 사격에 화약 ${powder.toFixed(1)}을 소모했습니다.`);
      }
      event(events, zone.id, 'volley', '활시위와 총성이 한꺼번에 터집니다.');
    }
    if (commands.has('ambush')) event(events, zone.id, 'ambush', '숲과 엄폐물에서 매복조가 튀어나옵니다.');
    if (commands.has('fallback')) event(events, zone.id, 'retreat', '수비대가 병력을 보존하며 다음 구역으로 물러납니다.');
    if (!commands.has('volley') && !commands.has('ambush')) event(events, zone.id, 'melee', '방어선에서 짧고 거친 백병전이 벌어집니다.');

    for (const defender of defenders) {
      const active = activeCount(defender);
      if (active <= 0) continue;
      let risk = enemyShare * (0.13 + zone.pressure / 700) * casualtyMultiplier(battle, defender);
      if (defender.kind === 'civilian') risk *= zone.civilianRisk / 50;
      risk = clamp(risk, 0, 0.48);
      const expected = active * risk;
      let wounded = Math.min(active, Math.floor(expected));
      const fractionalRisk = expected - Math.floor(expected);
      if (wounded < active && rng() < clamp(fractionalRisk + risk * 0.2, 0, 0.9)) wounded += 1;
      let killed = enemyShare > 0.55 && rng() < risk * 0.32 ? 1 : 0;
      killed = Math.min(killed, Math.max(0, active - wounded));
      if (killed > 0 && wounded > 0 && wounded + killed > active) wounded = active - killed;
      defender.wounded += wounded;
      defender.killed += killed;
      roundWounded += wounded;
      roundKilled += killed;
      if (wounded + killed > 0) {
        event(events, zone.id, 'casualty', `${defender.label}에서 전사 ${killed}, 부상 ${wounded}명이 발생했습니다.`, 520);
      }
    }

    let pressureDelta = 11 + enemyShare * 32 - defenseShare * 17;
    if (commands.has('hold')) pressureDelta -= 5;
    if (commands.has('fallback')) pressureDelta += 28;
    zone.pressure = clamp(zone.pressure + pressureDelta, 0, 100);
    const breachAt = zone.id === 'approach' ? 62 : 100;
    if (!zone.breached && zone.pressure >= breachAt) {
      zone.breached = true;
      event(events, zone.id, zone.id === 'wall' ? 'wallHit' : 'advance', `${zone.name}이(가) 뚫렸습니다.`, 720);
      if (zone.id === 'wall') buildingsDamaged += 1;
    }

    const commandEdge = commands.has('ambush') ? 0.08 : commands.has('volley') ? 0.06 : 0;
    const raiderLossRate = clamp(defenseShare * (0.08 + commandEdge), 0.01, 0.24);
    for (const attacker of attackers) {
      const activeRaiders = Math.max(0, attacker.count - attacker.killed);
      const expectedKilled = activeRaiders * raiderLossRate * (0.55 + defenseShare * 0.7);
      let killed = Math.floor(expectedKilled);
      if (killed < activeRaiders && rng() < expectedKilled - killed) killed += 1;
      killed = Math.min(activeRaiders, killed);
      attacker.killed += killed;
      roundRaidersKilled += killed;
      attacker.power = Math.max(0, attacker.power * (1 - raiderLossRate));
      if (killed > 0) {
        event(events, zone.id, 'casualty', `${attacker.label}에서 ${killed}명이 쓰러졌습니다.`, 480);
      }
    }

    raiderMoraleDelta -= defenseShare * 10 + (commands.has('ambush') ? 3 : 0) + (commands.has('volley') ? 2 : 0);
    villageMoraleDelta += enemyShare > 0.5 ? -(2 + enemyShare * 7) : 1;

    const lootersPresent = attackers.some(attacker => attacker.kind === 'looters');
    if (zone.id === 'storehouse' && lootersPresent && (enemyShare > 0.5 || zone.breached || zone.pressure >= 65)) {
      const guarded = commands.has('guardStorehouse');
      if (!guarded || enemyShare > 0.68) {
        addLoot(state, battle, lootBag, zone.pressure + zone.lootRisk);
        event(events, zone.id, 'loot', '약탈조가 창고 문을 부수고 비축을 빼냅니다.', 760);
        if (rng() < 0.35 + enemyShare * 0.25) buildingsDamaged += 1;
      } else {
        lines.push('창고 수비대가 약탈조를 물자 더미 앞에서 막아냈습니다.');
      }
    }
  }

  villageMoraleDelta = Math.round(clamp(villageMoraleDelta, -18, 5));
  raiderMoraleDelta = Math.round(clamp(raiderMoraleDelta, -22, 0));
  battle.villageMorale = clamp(battle.villageMorale + villageMoraleDelta, 0, 100);
  battle.raiderMorale = clamp(battle.raiderMorale + raiderMoraleDelta, 0, 100);
  for (const attacker of battle.raiderGroups) {
    attacker.morale = clamp(attacker.morale + raiderMoraleDelta, 0, 100);
    const route = ROUTES[attacker.kind];
    const index = route.indexOf(attacker.zoneId);
    const zone = battle.zones.find(candidate => candidate.id === attacker.zoneId);
    const share = dominance.get(attacker.zoneId) ?? 0;
    if (attacker.morale <= 18 || attacker.power <= battle.originalPower * 0.035) {
      attacker.intent = 'withdraw';
      event(events, attacker.zoneId, 'moraleBreak', `${attacker.label}의 대열이 흩어집니다.`, 650);
    } else if (index >= 0 && index < route.length - 1 && (zone?.breached || share > 0.52 || battle.round >= 2)) {
      attacker.zoneId = route[index + 1];
      attacker.targetZoneId = route[Math.min(route.length - 1, index + 2)];
      event(events, attacker.zoneId, 'advance', `${attacker.label}이(가) ${battle.zones.find(candidate => candidate.id === attacker.zoneId)?.name}(으)로 밀려듭니다.`, 620);
    }
    if (!attacker.revealed && (battle.round >= 2 || applied(battle, 'setAmbush'))) attacker.revealed = true;
  }

  const activeRaiders = battle.raiderGroups.filter(group => group.intent !== 'withdraw' && group.power > 0);
  const nextFocusZoneId = activeRaiders
    .map(group => ({ zoneId: group.zoneId, score: group.power + (battle.zones.find(zone => zone.id === group.zoneId)?.pressure ?? 0) }))
    .sort((a, b) => b.score - a.score)[0]?.zoneId ?? focusZoneId;

  const priorLootRounds = battle.reports.filter(report => Object.values(report.loot).some(amount => (amount ?? 0) > 0)).length;
  const thisRoundLooted = Object.values(lootBag).some(amount => (amount ?? 0) > 0);
  const totalRaiderPower = battle.raiderGroups.reduce((sum, group) => sum + group.power, 0);
  const center = battle.zones.find(zone => zone.id === 'center')!;
  let outcome: TacticalRoundReport['outcome'];
  if (battle.raiderMorale <= 0 || totalRaiderPower <= battle.originalPower * 0.18 || activeRaiders.length === 0) {
    outcome = 'defenseSuccess';
  } else if (battle.villageMorale <= 0 || center.breached) {
    outcome = 'villageRouted';
  } else if (priorLootRounds + Number(thisRoundLooted) >= 2) {
    outcome = 'raidersLooted';
  } else if (battle.round >= CONFIG.tacticalBattle.maxRounds) {
    const sufferedLoss = battle.zones.some(zone => zone.breached) || priorLootRounds > 0 || thisRoundLooted;
    outcome = !sufferedLoss && battle.raiderMorale < battle.villageMorale ? 'defenseSuccess' : 'partialLoss';
  }

  if (roundWounded > 0 || roundKilled > 0) lines.push(`이번 라운드 수비 피해: 전사 ${roundKilled}명, 부상 ${roundWounded}명.`);
  if (roundRaidersKilled > 0) lines.push(`이번 라운드 적 피해: ${roundRaidersKilled}명 처치.`);
  if (thisRoundLooted) lines.push(`창고 피해 예상: ${describeLootLosses(lootBag)}.`);
  if (buildingsDamaged > 0) lines.push(`방어 시설과 건물 ${buildingsDamaged}곳이 파손될 위험에 놓였습니다.`);
  lines.push(`마을 기세 ${villageMoraleDelta >= 0 ? '+' : ''}${villageMoraleDelta}, 적 기세 ${raiderMoraleDelta}.`);
  if (outcome) event(events, nextFocusZoneId, outcome === 'defenseSuccess' ? 'moraleBreak' : 'report', summaryForOutcome(outcome), 900);
  else event(events, nextFocusZoneId, 'camera', '다음으로 위급한 전선이 드러납니다.', 500);

  const report: TacticalRoundReport = {
    round: battle.round,
    focusZoneId,
    nextFocusZoneId,
    summary: outcome ? summaryForOutcome(outcome) : `${battle.round}라운드가 끝났습니다. 다음 전선을 지휘하십시오.`,
    lines,
    events,
    wounded: roundWounded,
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
  battle.phase = 'simulating';
  return null;
}

export function completeTacticalSimulation(state: GameState): string | null {
  const battle = state.tacticalBattle;
  if (!battle) return '진행 중인 직접 지휘 전투가 없습니다.';
  if (battle.phase !== 'simulating') return '재생 중인 라운드가 없습니다.';
  battle.phase = 'report';
  return null;
}

export function acknowledgeTacticalReport(state: GameState): string | null {
  const battle = state.tacticalBattle;
  if (!battle || !battle.pendingReport) return '확인할 전투 보고가 없습니다.';
  if (battle.phase !== 'report') return '아직 전투 연출이 끝나지 않았습니다.';
  if (battle.pendingReport.ended) {
    battle.phase = 'finished';
    return null;
  }
  battle.currentZoneId = battle.pendingReport.nextFocusZoneId;
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

function outcomeLabel(outcome: TacticalRoundReport['outcome']): string {
  if (outcome === 'defenseSuccess') return '습격을 막아냈습니다';
  if (outcome === 'partialLoss') return '마을을 지켰으나 일부 피해를 입었습니다';
  if (outcome === 'raidersLooted') return '습격대가 비축 일부를 약탈해 물러났습니다';
  if (outcome === 'villageRouted') return '마을 방어선이 무너졌습니다';
  return '교전이 끝났습니다';
}

export function finishTacticalBattle(state: GameState): void {
  const battle = state.tacticalBattle;
  if (!battle) return;
  const finalReport = [...battle.reports].reverse().find(report => report.ended) ?? battle.reports[battle.reports.length - 1];
  const outcome = finalReport?.outcome ?? 'partialLoss';
  const rng = makeRng(state.seed + battle.id * 524287 + 97);
  const beforeAlive = new Map(state.residents.filter(resident => resident.alive).map(resident => [resident.id, resident.name]));
  const beforeHealth = new Map(state.residents.map(resident => [resident.id, resident.health]));
  const participantIds = new Set<number>();
  const groupLabelByResident = new Map<number, string>();

  for (const defender of battle.defenderGroups) {
    defender.residentIds.forEach(id => {
      participantIds.add(id);
      groupLabelByResident.set(id, defender.label);
    });
    if (defender.killed > 0) {
      killResidents(state, rng, defender.killed, 1, defender.residentIds);
    }
    if (defender.wounded > 0) {
      injure(state, rng, defender.wounded, battle.mode === 'levy' ? 24 : 18, defender.residentIds, true);
    }
  }
  const killedPeople = [...participantIds]
    .map(id => state.residents.find(resident => resident.id === id))
    .filter((resident): resident is GameState['residents'][number] => resident != null && !resident.alive)
    .map(resident => ({
      residentId: resident.id,
      name: beforeAlive.get(resident.id) ?? resident.name,
      groupLabel: groupLabelByResident.get(resident.id) ?? '수비대',
      healthAfter: 0,
    }));
  const woundedPeople = [...participantIds]
    .map(id => state.residents.find(resident => resident.id === id))
    .filter((resident): resident is GameState['residents'][number] =>
      resident != null && resident.alive && resident.health < (beforeHealth.get(resident.id) ?? resident.health))
    .map(resident => ({
      residentId: resident.id,
      name: resident.name,
      groupLabel: groupLabelByResident.get(resident.id) ?? '수비대',
      healthAfter: Math.round(resident.health),
    }));
  const lootLosses = applyLootLosses(state, mergeLoot(battle.reports));
  const damageCount = battle.reports.reduce((sum, report) => sum + report.buildingsDamaged, 0);
  const damaged = damageBuildings(state, rng, damageCount);
  const moraleDelta = battle.reports.reduce((sum, report) => sum + report.villageMoraleDelta, 0);
  moraleShock(state, -moraleDelta);

  const success = outcome === 'defenseSuccess';
  const partial = outcome === 'partialLoss';
  const requestedReputationDelta = success ? 5 : partial ? 1 : outcome === 'raidersLooted' ? -3 : -6;
  const reputationBefore = state.resources.reputation;
  state.resources.reputation = clamp(state.resources.reputation + requestedReputationDelta, 0, 100);
  const relationBefore = state.relations[battle.factionName] ?? 50;
  changeRelation(state, battle.factionName, success || partial ? CONFIG.relations.militiaWin : CONFIG.relations.militiaLoss);
  const relationDelta = (state.relations[battle.factionName] ?? relationBefore) - relationBefore;
  state.threat = success
    ? CONFIG.threat.afterRaidThreat
    : Math.min(100, CONFIG.threat.afterRaidThreat + (partial ? 10 : 20));
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
  const raidersCommitted = battle.raiderGroups.reduce((sum, group) => sum + group.count, 0);
  const raidersKilled = Math.min(raidersCommitted, battle.raiderGroups.reduce((sum, group) => sum + group.killed, 0));
  const raidersEscaped = Math.max(0, raidersCommitted - raidersKilled);
  const highlights = battle.reports
    .flatMap(report => report.lines)
    .filter((line, index, all) => all.indexOf(line) === index)
    .slice(0, 10);
  state.tacticalBattleReport = {
    battleId: battle.id,
    date,
    factionName: battle.factionName,
    mode: battle.mode,
    warned: battle.warned,
    outcome,
    outcomeLabel: outcomeLabel(outcome),
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
    reputationDelta: state.resources.reputation - reputationBefore,
    relationDelta,
    threatAfter: state.threat,
    highlights,
  };
  addLog(
    state,
    `전투 장계: ${date}, ${battle.factionName} 습격 방어전. ${outcomeLabel(outcome)}. ${casualtyText}, 적 ${raidersKilled}명 처치·${raidersEscaped}명 도주, 건물 ${damaged.length}곳 파손, 자원 피해 ${lootText}.`,
    success ? 'good' : 'raid',
    true,
  );
  state.tacticalBattle = null;
}

export function dismissTacticalBattleReport(state: GameState): void {
  state.tacticalBattleReport = null;
}

export function tacticalCommandDescription(command: TacticalCommandId): string {
  const descriptions: Record<TacticalCommandId, string> = {
    hold: '대열을 유지해 돌파와 인명 피해를 줄입니다.',
    volley: '활과 조총 사격으로 적 기세를 꺾습니다. 악천후에는 약해집니다.',
    ambush: '접근로의 사냥꾼에게 강하지만 실패하면 부상 위험이 큽니다.',
    guardStorehouse: '약탈 피해를 줄이는 대신 수비대가 더 큰 위험을 집니다.',
    protectCivilians: '주민 피해를 줄이지만 건물과 물자를 포기할 수 있습니다.',
    fallback: '병력을 보존하며 구역을 내주고 다음 방어선으로 물러납니다.',
    counterattack: '후속 구현 예정입니다.',
    openRetreat: '후속 구현 예정입니다.',
  };
  return descriptions[command];
}

export function tacticalLootText(report: TacticalRoundReport): string {
  return Object.entries(report.loot)
    .filter(([, amount]) => (amount ?? 0) > 0)
    .map(([resource, amount]) => `${RESOURCE_NAMES[resource as ResourceId]} ${amount}`)
    .join(', ');
}
