import { resetAgent } from './agents';
import { countBuilt } from './buildings';
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
import { assignedWeapon, synchronizeWeaponAssignments } from './weapons';
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
  TacticalFormationLine,
  TacticalRaiderGroup,
  RaiderUnitType,
  TacticalRoundReport,
} from './types';

const PREPARATION_ACTIONS: Array<{ id: PreparationActionId; label: string; cost: number }> = [
  { id: 'evacuateCivilians', label: '주민 대피', cost: 1 },
  { id: 'hideSupplies', label: '창고 물자 은닉', cost: 1 },
  { id: 'repairWall', label: '목책 응급 수리', cost: 1 },
  { id: 'setAmbush', label: '사냥꾼 매복 배치', cost: 2 },
  { id: 'prepareVolley', label: '망루·사격 준비', cost: 2 },
  { id: 'preliminaryBombardment', label: '사전포격', cost: 3 },
  { id: 'musterMilitia', label: '민병 소집', cost: 1 },
];

const IMPLEMENTED_COMMANDS = new Set<TacticalCommandId>([
  'hold', 'volley', 'ambush', 'guardStorehouse', 'protectCivilians', 'fallback', 'advance', 'charge',
]);

const MELEE_DEFENDER_KINDS = new Set<DefenderGroupKind>([
  'militia-spear', 'militia-unarmed', 'watchman',
]);

const RANGED_DEFENDER_KINDS = new Set<DefenderGroupKind>([
  'militia-bow', 'militia-musket', 'hunter',
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
    if (defender.command === 'fallback') {
      const rearZoneId = nextRearZoneId(battle, defender.zoneId);
      if (rearZoneId) defender.zoneId = rearZoneId;
      defender.command = 'hold';
    } else if (defender.command === 'advance') {
      const forwardZoneId = nextForwardZoneId(battle, defender.zoneId);
      if (forwardZoneId) defender.zoneId = forwardZoneId;
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

function healthy(resident: GameState['residents'][number]): boolean {
  return resident.alive && !resident.sick && resident.health >= 20;
}

function defaultFormationLine(kind: DefenderGroupKind): TacticalFormationLine {
  return MELEE_DEFENDER_KINDS.has(kind) ? 'front' : 'rear';
}

function group(
  kind: DefenderGroupKind,
  residentIds: number[],
  zoneId: string,
  suffix = '',
  powerOverride?: number,
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
    power: powerOverride ?? residentIds.length * GROUP_POWER[kind],
    wounded: 0,
    killed: 0,
    line: defaultFormationLine(kind),
    ambushed: false,
  };
}

function defenderGroups(state: GameState, mode: TacticalBattle['mode']): TacticalDefenderGroup[] {
  synchronizeWeaponAssignments(state);
  const away = new Set(state.expedition?.memberIds ?? []);
  const combatReady = state.residents.filter(resident => healthy(resident) && !away.has(resident.id));
  const militia = combatReady.filter(resident => resident.job === 'militia').sort((a, b) => a.id - b.id);
  const muskets = militia
    .filter(resident => assignedWeapon(state, resident.id) === 'musket' && state.resources.gunpowder > 0)
    .map(resident => resident.id);
  const bows = militia.filter(resident => assignedWeapon(state, resident.id) === 'hornBow').map(resident => resident.id);
  const spears = militia.filter(resident => assignedWeapon(state, resident.id) === 'spear').map(resident => resident.id);
  const armedMilitia = new Set([...muskets, ...bows, ...spears]);
  const unarmedMilitia = militia.filter(resident => !armedMilitia.has(resident.id)).map(resident => resident.id);
  const used = new Set(militia.map(resident => resident.id));

  const watchmanResidents = combatReady.filter(resident => resident.job === 'watchman');
  const hunterResidents = combatReady.filter(resident => resident.job === 'hunter');
  const watchmen = watchmanResidents.map(resident => resident.id);
  const hunters = hunterResidents.map(resident => resident.id);
  for (const id of [...watchmen, ...hunters]) used.add(id);

  const others = state.residents.filter(resident => resident.alive && !away.has(resident.id) && !used.has(resident.id));
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
    group('watchman', watchmen, 'wall', '', watchmanResidents.reduce((sum, resident) => {
      const weapon = assignedWeapon(state, resident.id);
      const power = weapon === 'musket' && state.resources.gunpowder > 0
        ? GROUP_POWER['militia-musket']
        : weapon === 'hornBow'
          ? GROUP_POWER['militia-bow']
          : weapon === 'spear'
            ? GROUP_POWER['militia-spear']
            : GROUP_POWER.watchman;
      return sum + power;
    }, 0)),
    group('hunter', hunters, 'approach', '', hunterResidents.reduce((sum, resident) => {
      const weapon = assignedWeapon(state, resident.id);
      const power = weapon === 'musket' && state.resources.gunpowder > 0
        ? GROUP_POWER['militia-musket']
        : weapon === 'hornBow'
          ? GROUP_POWER['militia-bow']
          : weapon === 'spear'
            ? GROUP_POWER['militia-spear']
            : GROUP_POWER.hunter;
      return sum + power;
    }, 0)),
    group('civilian', civilianIds, 'center'),
  ].filter((candidate): candidate is TacticalDefenderGroup => candidate != null);
}

function preparationPoints(state: GameState, warned: boolean): number {
  const prep = CONFIG.tacticalBattle.prep;
  let points = warned ? prep.warned : prep.surpriseBase;
  points += countBuilt(state, 'beacon') > 0 ? prep.beacon : 0;
  points += Math.min(prep.watchtowerMax, countBuilt(state, 'watchtower'));
  const away = new Set(state.expedition?.memberIds ?? []);
  const watchmen = state.residents.filter(resident =>
    resident.alive && resident.job === 'watchman' && !away.has(resident.id)).length;
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
  factionName: string,
  power: number,
  warned: boolean,
  scouting: { watchmen: number; watchtowers: number; hunters: number; flankRoll: number },
): TacticalRaiderGroup[] {
  const scoutsReady = warned || scouting.watchtowers > 0 || scouting.watchmen >= 2;
  const deepScouted = warned || (scouting.watchtowers > 0 && scouting.hunters > 0);
  const rearAssaultChance = factionName === '홀라온 야인' || factionName === '변경 마적' || factionName === '조정 토벌군'
    ? 0.6
    : factionName === '니마차 우디캐' ? 0.3 : 0.5;
  const flankPlan = scouting.flankRoll < rearAssaultChance ? 'rearAssault' : 'breakthrough';
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
  const split = CONFIG.tacticalBattle.raiderSplit;
  let composition: Composition[];
  if (factionName === '니마차 우디캐') {
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
      { id: 'court-artillery', kind: 'main', unitType: 'court-artillery', label: '화포대', weight: 0.15, morale: 88, intent: 'breakWall', visibility: 'open', combatMultiplier: 1.24, lossResistance: 0.8, wallPressureBonus: 12 },
    ];
  } else {
    composition = [
      { id: 'raider-main', kind: 'main', label: '적 주력', weight: split.main, morale: 75, intent: 'advance', visibility: 'open' },
      { id: 'raider-looters', kind: 'looters', label: '약탈조', weight: split.looters, morale: 68, intent: 'loot', visibility: 'scouts' },
      { id: 'raider-flankers', kind: 'flankers', label: '우회조', weight: split.flankers, morale: 70, intent: 'flank', visibility: 'deep' },
    ];
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
  const visible = (visibility: Visibility) => visibility === 'open' ||
    (visibility === 'scouts' ? scoutsReady : deepScouted);

  return composition.map((entry, index) => ({
    id: entry.id,
    kind: entry.kind,
    unitType: entry.unitType,
    label: entry.label,
    zoneId: 'approach',
    targetZoneId: entry.kind === 'looters'
      ? 'storehouse'
      : entry.kind === 'flankers' ? (flankPlan === 'rearAssault' ? 'wall' : 'center') : 'wall',
    power: powers[index],
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
    flankPlanRevealed: entry.kind === 'flankers' ? deepScouted : undefined,
    rearAssault: false,
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
  },
): TacticalBattle {
  const groups = defenderGroups(state, params.mode);
  const watchmen = groups.find(candidate => candidate.kind === 'watchman')?.count ?? 0;
  const hunters = groups.find(candidate => candidate.kind === 'hunter')?.count ?? 0;
  const originalPower = params.factionName === '조정 토벌군'
    ? Math.max(120, Math.round(params.power))
    : Math.max(3, Math.round(params.power));
  const battle: TacticalBattle = {
    id: state.day * 1000 + state.subTick * 10 + (params.mode === 'levy' ? 2 : 1),
    factionName: params.factionName,
    warned: params.warned,
    siege: params.siege,
    originalPower,
    phase: 'preparation',
    round: 1,
    prepPoints: preparationPoints(state, params.warned),
    prepActions: PREPARATION_ACTIONS.map(action => ({ ...action, selected: false, applied: false })),
    preparationEvents: [],
    zones: createZones(state, params.siege, groups),
    defenderGroups: groups,
    raiderGroups: raiderGroups(params.factionName, originalPower, params.warned, {
      watchmen,
      watchtowers: countBuilt(state, 'watchtower'),
      hunters,
      flankRoll: makeRng(state.seed + state.day * 4099 + state.subTick * 131 + originalPower)(),
    }),
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
  if (actionId === 'setAmbush' && !battle.defenderGroups.some(group => group.kind === 'hunter' && group.count > 0)) {
    return '매복시킬 사냥꾼이 없습니다.';
  }
  if (actionId === 'musterMilitia') {
    const civilians = battle.defenderGroups.find(group => group.kind === 'civilian');
    if (!civilians || civilians.residentIds.length === 0) return '추가로 소집할 주민이 없습니다.';
  }
  if (actionId === 'preliminaryBombardment') {
    if (countBuilt(state, 'cannonEmplacement') <= 0) return '완성된 불랑기포대가 없습니다.';
    if (state.resources.gunpowder < CONFIG.raid.powderPerCannon) return '포격에 쓸 화약이 부족합니다.';
  }
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
  extra?: Pick<TacticalAnimationEvent, 'side' | 'groupId' | 'casualties' | 'float'>,
): void {
  events.push({ zoneId, kind, text, durationMs, ...extra });
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
      const hunterGroups = battle.defenderGroups.filter(candidate => candidate.kind === 'hunter');
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
        candidate.zoneId === 'wall' &&
        (candidate.kind === 'militia-bow' || candidate.kind === 'militia-musket' || candidate.kind === 'watchman'));
      preparationEvent(
        events, 'wall', 'readyVolley',
        '사수들이 시위를 걸고 화승을 살피며 첫 일제사격을 준비합니다.', 1050,
        { side: 'defender', groupId: rangedGroup?.id, float: '사격 준비' },
      );
    } else if (actionId === 'preliminaryBombardment') {
      const casualtyGroups = applyPreliminaryBombardment(state, battle);
      const cannons = battle.preliminaryBombardmentCannons ?? 0;
      preparationEvent(
        events, 'approach', 'bombardment',
        `불랑기포 ${cannons}문이 불을 뿜고 포탄이 적의 대열 한복판에 떨어집니다.`, 1350,
        { side: 'raider', float: '사전포격!' },
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
      const musterCount = Math.max(1, Math.ceil(civilians.residentIds.length / 2));
      const musteredIds = civilians.residentIds.splice(0, musterCount);
      civilians.count = civilians.residentIds.length;
      civilians.power = civilians.count * GROUP_POWER.civilian;
      let militia = battle.defenderGroups.find(candidate => candidate.id === 'militia-unarmed-mustered');
      if (!militia) {
        militia = {
          id: 'militia-unarmed-mustered', kind: 'militia-unarmed', label: '긴급 소집 민병',
          residentIds: [], count: 0, zoneId: 'wall', command: null, power: 0, wounded: 0, killed: 0,
          line: 'front',
        };
        battle.defenderGroups.push(militia);
      }
      militia.residentIds.push(...musteredIds);
      militia.count = militia.residentIds.length;
      militia.power = militia.count * GROUP_POWER['militia-unarmed'];
      battle.villageMorale = Math.max(0, battle.villageMorale - 3);
      preparationEvent(
        events, militia.zoneId, 'muster',
        `주민 ${musterCount}명이 급히 무기를 들고 방책 전선의 민병 대열에 합류합니다.`, 1200,
        { side: 'defender', groupId: militia.id, float: `${musterCount}명 합류` },
      );
    }

    action.applied = true;
  }
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
  if (battle.phase !== 'deployment') return '배치 단계에서만 병력을 옮길 수 있습니다.';
  const defender = battle.defenderGroups.find(candidate => candidate.id === groupId);
  if (!defender) return '수비 그룹을 찾을 수 없습니다.';
  if (!battle.zones.some(zone => zone.id === zoneId)) return '전투 구역을 찾을 수 없습니다.';
  defender.zoneId = zoneId;
  if (defender.kind === 'hunter') {
    defender.ambushed = zoneId === 'approach' && applied(battle, 'setAmbush');
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
  if (battle.phase !== 'deployment' && battle.phase !== 'command') {
    return '배치 또는 지휘 단계에서만 전열을 바꿀 수 있습니다.';
  }
  const defender = battle.defenderGroups.find(candidate => candidate.id === groupId);
  if (!defender) return '수비 그룹을 찾을 수 없습니다.';
  defender.line = line;
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
  const unavailableReason = tacticalCommandUnavailableReason(battle, defender, command);
  if (unavailableReason) return unavailableReason;
  defender.command = command;
  return null;
}

export function tacticalCommandUnavailableReason(
  battle: TacticalBattle,
  defender: TacticalDefenderGroup,
  command: TacticalCommandId,
): string | null {
  if (!IMPLEMENTED_COMMANDS.has(command)) return '이 명령은 아직 사용할 수 없습니다.';
  if (command === 'hold') return null;
  if (command === 'charge') {
    if (!MELEE_DEFENDER_KINDS.has(defender.kind)) return '돌격은 근접 병종만 수행할 수 있습니다.';
    const enemyHere = battle.raiderGroups.some(group =>
      group.zoneId === defender.zoneId && group.intent !== 'withdraw' && group.power > 0);
    return enemyHere ? null : '돌격할 적이 같은 구역에 없습니다.';
  }
  if (command === 'volley') {
    return defender.kind === 'militia-bow' || defender.kind === 'militia-musket'
      ? null : '일제 사격은 각궁·조총 수비대만 수행할 수 있습니다.';
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
  if (command === 'ambush') {
    if (defender.kind !== 'hunter') return '매복과 급습은 사냥꾼만 수행할 수 있습니다.';
    const enemyHere = battle.raiderGroups.some(group =>
      group.zoneId === defender.zoneId && group.intent !== 'withdraw' && group.power > 0);
    if (defender.ambushed && !enemyHere) return '급습할 적이 같은 구역에 없습니다.';
    if (!defender.ambushed && enemyHere) return '적과 맞붙은 구역에서는 새로 매복할 수 없습니다.';
    return null;
  }
  return '이 명령은 아직 사용할 수 없습니다.';
}

export function chooseDefaultTacticalCommands(battle: TacticalBattle): void {
  for (const defender of battle.defenderGroups) {
    if (defender.command) continue;
    if (defender.kind === 'civilian') defender.command = 'protectCivilians';
    else if (defender.kind === 'hunter') {
      const enemyHere = battle.raiderGroups.some(group =>
        group.zoneId === defender.zoneId && group.intent !== 'withdraw' && group.power > 0);
      defender.command = (defender.ambushed && enemyHere) || (!defender.ambushed && !enemyHere) ? 'ambush' : 'hold';
    }
    else if (defender.kind === 'militia-bow' || defender.kind === 'militia-musket') defender.command = 'volley';
    else if (defender.zoneId === 'storehouse') defender.command = 'guardStorehouse';
    else defender.command = 'hold';
  }
}

export function advanceTacticalPhase(state: GameState): string | null {
  const battle = state.tacticalBattle;
  if (!battle) return '진행 중인 직접 지휘 전투가 없습니다.';
  if (battle.phase === 'preparation') {
    battle.preparationEvents = applySelectedPreparationActions(state, battle);
    battle.phase = battle.preparationEvents.length > 0 ? 'preparationExecution' : 'deployment';
    return null;
  }
  if (battle.phase === 'preparationExecution') {
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
  if (command === 'hold') return 0.82;
  if (command === 'charge') return 1.72;
  if (command === 'fallback') return 0.22;
  if (command === 'advance') return 0.45;
  if (command === 'guardStorehouse') return zone.id === 'storehouse' ? 1.42 : 0.78;
  if (command === 'protectCivilians') return zone.id === 'center' || zone.id === 'storehouse' ? 1.05 : 0.72;
  if (command === 'ambush') {
    const surpriseAttack = defender.kind === 'hunter' && defender.ambushed;
    return surpriseAttack ? 1.48 + zone.ambushBonus / 100 : 0.18;
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
  let mult = defender.command === 'hold' ? 0.55
    : defender.command === 'charge' ? 1.38
    : defender.command === 'fallback' ? 0.38
      : defender.command === 'advance' ? 0.78 : 1;
  if (defender.command === 'guardStorehouse') mult *= 1.18;
  if (defender.command === 'protectCivilians' && defender.kind === 'civilian') mult *= 0.42;
  if (defender.kind === 'civilian' && applied(battle, 'evacuateCivilians')) mult *= 0.42;
  if (defender.command === 'ambush' && defender.kind === 'hunter') mult *= 1.08;
  return mult;
}

function formationExposureMultiplier(
  defender: TacticalDefenderGroup,
  defenders: TacticalDefenderGroup[],
): number {
  if (defender.kind === 'hunter' && defender.ambushed) return 0.55;
  const chargingMelee = defenders.some(group =>
    group.line === 'front' && MELEE_DEFENDER_KINDS.has(group.kind) &&
    group.command === 'charge' && activeCount(group) > 0);
  const screeningMelee = defenders.some(group =>
    group.line === 'front' && MELEE_DEFENDER_KINDS.has(group.kind) &&
    group.command !== 'charge' && group.command !== 'fallback' && group.command !== 'advance' &&
    activeCount(group) > 0);
  if (RANGED_DEFENDER_KINDS.has(defender.kind)) {
    if (chargingMelee) return 1.7;
    if (screeningMelee) return 0.42;
    return 1.45;
  }
  if (MELEE_DEFENDER_KINDS.has(defender.kind) && screeningMelee) return 1.25;
  return 1;
}

function rearAssaultExposureMultiplier(
  defender: TacticalDefenderGroup,
  defenders: TacticalDefenderGroup[],
): number {
  const rearMeleeGuard = defenders.some(group =>
    group.line === 'rear' && MELEE_DEFENDER_KINDS.has(group.kind) &&
    group.command !== 'fallback' && group.command !== 'advance' && activeCount(group) > 0);
  if (defender.line === 'front') return 0.5;
  if (rearMeleeGuard) return MELEE_DEFENDER_KINDS.has(defender.kind) ? 1.65 : 0.48;
  if (RANGED_DEFENDER_KINDS.has(defender.kind)) return 2.2;
  if (defender.kind === 'civilian') return 1.8;
  return 1.45;
}

function surpriseConfusionChance(zone: TacticalBattleZone, defenders: TacticalDefenderGroup[]): number {
  const hunters = defenders.reduce((sum, defender) => sum + activeCount(defender), 0);
  return clamp(0.35 + zone.ambushBonus / 100 + Math.min(0.2, hunters * 0.025), 0.35, 1);
}

function shouldRaiderAdvance(
  attacker: TacticalRaiderGroup,
  battle: TacticalBattle,
  zone: TacticalBattleZone | undefined,
  enemyShare: number,
  defenderReadiness: number,
): boolean {
  if (!zone) return false;
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
  extra?: Pick<TacticalAnimationEvent, 'side' | 'groupId' | 'casualties' | 'float'>,
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

export function resolveTacticalRound(state: GameState): string | null {
  const battle = state.tacticalBattle;
  if (!battle) return '진행 중인 직접 지휘 전투가 없습니다.';
  if (battle.phase !== 'command') return '교전을 진행할 지휘 단계가 아닙니다.';
  chooseDefaultTacticalCommands(battle);
  const rng = makeRng(state.seed + battle.id * 8191 + battle.round * 131071);
  const events: TacticalAnimationEvent[] = [];
  const lines: string[] = [];
  const lootBag: Partial<Record<ResourceId, number>> = {};
  const dominance = new Map<string, number>();
  const defenderReadiness = new Map<string, number>();
  let roundWounded = 0;
  let roundKilled = 0;
  let roundRaidersKilled = 0;
  let buildingsDamaged = 0;
  let villageMoraleDelta = 0;
  let raiderMoraleDelta = 0;
  const focusZoneId = battle.currentZoneId;
  const roundStartingRaiderPower = Math.max(1, battle.raiderGroups.reduce((sum, group) =>
    sum + (group.intent === 'withdraw' ? 0 : group.power), 0));

  event(events, focusZoneId, 'camera', `${battle.zones.find(zone => zone.id === focusZoneId)?.name ?? '전선'}으로 시선을 옮깁니다.`, 450);
  for (const defender of battle.defenderGroups.filter(group => group.command === 'ambush' && !group.ambushed)) {
    event(events, defender.zoneId, 'camera', `${defender.label}이(가) 숨을 죽이고 매복 자리를 잡습니다.`, 420);
    lines.push(`${defender.label}이(가) 다음 교전을 위해 매복합니다.`);
  }
  for (const defender of battle.defenderGroups.filter(group => group.command === 'advance')) {
    const enemyHere = battle.raiderGroups.some(attacker =>
      attacker.zoneId === defender.zoneId && attacker.intent !== 'withdraw' && attacker.power > 0);
    if (!enemyHere) event(events, defender.zoneId, 'advance', `${defender.label}이(가) 앞선 방어선으로 전진할 채비를 합니다.`, 520, {
      side: 'defender', float: '전진 준비',
    });
  }

  for (const zone of battle.zones) {
    const attackers = battle.raiderGroups.filter(group => group.zoneId === zone.id && group.intent !== 'withdraw' && group.power > 0);
    if (attackers.length === 0) {
      zone.pressure = Math.max(0, zone.pressure - 5);
      continue;
    }
    const assignedDefenders = battle.defenderGroups.filter(group => group.zoneId === zone.id);
    const defenders = assignedDefenders.filter(group => activeCount(group) > 0);
    const rearAttackers = attackers.filter(attacker => attacker.rearAssault);
    for (const attacker of rearAttackers.filter(group => group.engagementsInZone === 0)) {
      attacker.revealed = true;
      event(events, zone.id, 'rearAssault', `${attacker.label}이(가) 수비대 후열에 갑자기 모습을 드러냅니다.`, 760, {
        side: 'defender', groupId: attacker.id, float: '후방 급습!',
      });
      lines.push(`${attacker.label}이(가) ${zone.name} 후열을 급습했습니다.`);
    }
    const assignedCount = assignedDefenders.reduce((sum, defender) => sum + defender.count, 0);
    const readyCount = assignedDefenders.reduce((sum, defender) => sum + activeCount(defender), 0);
    defenderReadiness.set(zone.id, assignedCount > 0 ? readyCount / assignedCount : 0);
    const surpriseDefenders = defenders.filter(defender => defender.command === 'ambush' && defender.ambushed);
    const surpriseAttack = surpriseDefenders.length > 0;
    if (surpriseAttack) {
      event(events, zone.id, 'ambush', '매복중이던 사냥꾼이 적의 측면을 급습합니다.');
      const confusionChance = surpriseConfusionChance(zone, surpriseDefenders);
      for (const attacker of attackers) {
        if (attacker.confused || rng() >= confusionChance) continue;
        attacker.confused = true;
        event(events, zone.id, 'ambush', `${attacker.label}이(가) 급습에 주저앉아 이번 교전에서 행동하지 못합니다.`, 560, {
          side: 'raider', groupId: attacker.id, float: '혼란!',
        });
      }
    }
    const rawEnemyPower = attackers.reduce(
      (sum, group) => sum + (group.confused
        ? 0
        : group.power * (group.morale / 100) * (group.combatMultiplier ?? 1)),
      0,
    );
    const rawRearEnemyPower = rearAttackers.reduce(
      (sum, group) => sum + (group.confused
        ? 0
        : group.power * (group.morale / 100) * (group.combatMultiplier ?? 1)),
      0,
    );
    const enemyPower = rawEnemyPower * (0.88 + rng() * 0.24);
    const rearEnemyShare = rawEnemyPower > 0 ? rawRearEnemyPower / rawEnemyPower : 0;
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
    const chargingMelee = defenders.filter(defender =>
      MELEE_DEFENDER_KINDS.has(defender.kind) && defender.command === 'charge');
    const exposedRanged = defenders.filter(defender => RANGED_DEFENDER_KINDS.has(defender.kind));
    const chargeOpensFlank = chargingMelee.length > 0 && exposedRanged.length > 0 &&
      attackers.some(attacker => !attacker.confused);
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
    if (commands.has('fallback')) event(events, zone.id, 'retreat', '수비대가 병력을 보존하며 다음 구역으로 물러납니다.');
    if (commands.has('advance')) event(events, zone.id, 'advance', '수비대가 교전을 마친 뒤 앞선 방어선으로 전진할 채비를 합니다.', 520, {
      side: 'defender', float: '전진 준비',
    });
    if (commands.has('charge')) event(events, zone.id, 'melee', '근접 수비대가 대열을 깨고 적진으로 돌격합니다.', 620, {
      side: 'defender', float: '돌격!',
    });
    if (chargeOpensFlank) {
      event(events, zone.id, 'melee', '돌격대가 비운 전열의 틈으로 적이 파고들어 후열 원거리 병종을 우회 타격합니다.', 580, {
        side: 'defender', float: '후열 노출!',
      });
      lines.push(`${zone.name}에서 근접대의 돌격으로 후열 원거리 병종이 우회 타격에 노출됐습니다.`);
    }
    if (!commands.has('volley') && !surpriseAttack && !commands.has('charge')) {
      if (defenders.length === 0) {
        event(events, zone.id, 'advance', `적이 저항 없이 ${zone.name}을(를) 휩쓸고 지나갑니다.`, 560);
      } else if (defenders.every(defender => defender.kind === 'civilian')) {
        event(events, zone.id, 'advance', '무장하지 못한 주민들이 비명을 지르며 전선 뒤로 흩어집니다.', 620, {
          side: 'defender', float: '주민 피난',
        });
      } else {
        event(events, zone.id, 'melee', '방어선에서 짧고 거친 백병전이 벌어집니다.');
      }
    }
    if (zone.id === 'wall' && attackers.some(attacker =>
      attacker.unitType === 'court-artillery' && !attacker.confused)) {
      event(events, zone.id, 'artilleryHit', '토벌군 화포대의 포탄이 방책을 뒤흔듭니다.', 720, {
        side: 'defender', float: '적 화포 사격!',
      });
    }

    let rearAssaultCasualties = 0;
    for (const defender of defenders) {
      const active = activeCount(defender);
      if (active <= 0) continue;
      const normalExposure = formationExposureMultiplier(defender, defenders);
      const rearExposure = rearAssaultExposureMultiplier(defender, defenders);
      const exposure = normalExposure * (1 - rearEnemyShare) + rearExposure * rearEnemyShare;
      let risk = enemyShare * (0.16 + zone.pressure / 650) *
        casualtyMultiplier(battle, defender) * exposure;
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
      if (rearAttackers.length > 0 && defender.line === 'rear') rearAssaultCasualties += wounded + killed;
      if (wounded + killed > 0) {
        const parts = [killed > 0 ? `전사 ${killed}` : '', wounded > 0 ? `부상 ${wounded}` : ''].filter(Boolean);
        event(events, zone.id, 'casualty', `${defender.label}에서 전사 ${killed}, 부상 ${wounded}명이 발생했습니다.`, 520, {
          side: 'defender', groupId: defender.id, casualties: wounded + killed, float: parts.join('·'),
        });
      }
    }
    if (rearAssaultCasualties > 0) {
      villageMoraleDelta -= 3;
      lines.push(`후방 급습으로 후열에서 ${rearAssaultCasualties}명의 사상자가 발생해 마을 기세가 흔들렸습니다.`);
    }

    const activeDefenders = Math.max(1, defenders.reduce((sum, defender) => sum + activeCount(defender), 0));
    const commandShare = (command: TacticalCommandId): number => defenders.reduce((sum, defender) =>
      sum + (defender.command === command ? activeCount(defender) : 0), 0) / activeDefenders;
    const pressureEnemyPower = enemyPower * (1 - rearEnemyShare * 0.6);
    const pressureTotal = Math.max(1, pressureEnemyPower + defensePower);
    const pressureEnemyShare = pressureEnemyPower / pressureTotal;
    const pressureDefenseShare = defensePower / pressureTotal;
    let pressureDelta = 15 + pressureEnemyShare * 32 - pressureDefenseShare * 12;
    if (zone.id === 'wall') {
      pressureDelta += attackers.reduce((sum, attacker) =>
        sum + (attacker.confused ? 0 : attacker.wallPressureBonus ?? 0), 0);
    }
    pressureDelta -= commandShare('hold') * 8;
    pressureDelta -= commandShare('charge') * 6;
    pressureDelta += commandShare('fallback') * 28;
    pressureDelta += commandShare('advance') * 10;
    pressureDelta *= 1 - rearEnemyShare * 0.55;
    if (zone.id === 'wall' && attackers.some(attacker => attacker.kind === 'main' && !attacker.confused)) {
      pressureDelta = Math.max(6, pressureDelta);
    }
    if (zone.id === 'storehouse' || zone.id === 'center') pressureDelta = Math.min(34, pressureDelta);
    zone.pressure = clamp(zone.pressure + pressureDelta, 0, 100);
    const breachAt = zone.id === 'approach' ? 62 : 100;
    if (!zone.breached && zone.pressure >= breachAt) {
      zone.breached = true;
      const wallBroken = zone.id === 'wall';
      const innerLineFallen = zone.id === 'storehouse' || zone.id === 'center';
      const breachText = wallBroken
        ? `${zone.name}의 방책이 부서져 길이 열립니다.`
        : zone.id === 'center'
          ? '적이 마을 중심지로 쏟아져 들어옵니다 — 최후 방어선이 무너졌습니다.'
          : zone.id === 'storehouse'
            ? '적이 창고 구역으로 밀려들어 비축 방어선이 무너집니다.'
            : `${zone.name}이(가) 뚫렸습니다.`;
      event(events, zone.id, wallBroken ? 'wallHit' : innerLineFallen ? 'zoneFall' : 'advance', breachText,
        innerLineFallen ? 980 : 720, {
        side: 'defender', float: wallBroken ? '방책 파괴!' : innerLineFallen ? '방어선 붕괴!' : '돌파!',
      });
      if (wallBroken) {
        buildingsDamaged += 1;
        lines.push(`${zone.name}의 방책이 파괴되어 적 주력의 진입로가 열렸습니다.`);
      }
    }

    const commandEdge = Math.max(
      surpriseAttack ? 0.08 : 0,
      commands.has('volley') ? 0.06 : 0,
      commands.has('charge') ? 0.12 : 0,
    );
    const raiderLossRate = clamp(defenseShare * (0.08 + commandEdge), 0.01, 0.24);
    const rearMeleeGuard = defenders.some(defender =>
      defender.line === 'rear' && MELEE_DEFENDER_KINDS.has(defender.kind) &&
      activeCount(defender) > 0 && defender.command !== 'fallback' && defender.command !== 'advance');
    for (const attacker of attackers) {
      const activeRaiders = Math.max(0, attacker.count - attacker.killed);
      const rearAssaultResistance = attacker.rearAssault && !rearMeleeGuard ? 0.55 : 1;
      const groupLossRate = clamp(
        raiderLossRate * (attacker.lossResistance ?? 1) * rearAssaultResistance,
        0.005,
        0.24,
      );
      const expectedKilled = activeRaiders * groupLossRate * (0.55 + defenseShare * 0.7);
      let killed = Math.floor(expectedKilled);
      if (killed < activeRaiders && rng() < expectedKilled - killed) killed += 1;
      killed = Math.min(activeRaiders, killed);
      attacker.killed += killed;
      roundRaidersKilled += killed;
      attacker.power = Math.max(0, attacker.power * (1 - groupLossRate));
      if (killed > 0) {
        event(events, zone.id, 'casualty', `${attacker.label}에서 ${killed}명이 쓰러졌습니다.`, 480, {
          side: 'raider', groupId: attacker.id, casualties: killed, float: `-${killed}`,
        });
      }
    }

    const zoneRaiderWeight = attackers.reduce((sum, attacker) => sum + attacker.power, 0) /
      roundStartingRaiderPower;
    raiderMoraleDelta -= (defenseShare * 10 + (surpriseAttack ? 3 : 0) +
      (commands.has('volley') ? 2 : 0) + (commands.has('charge') ? 4 : 0)) * zoneRaiderWeight;
    villageMoraleDelta += enemyShare > 0.5 ? -(2 + enemyShare * 7) : 1;

    const lootersPresent = attackers.some(attacker => attacker.kind === 'looters' && !attacker.confused);
    if (zone.id === 'storehouse' && lootersPresent && (enemyShare > 0.5 || zone.breached || zone.pressure >= 65)) {
      const guarded = commands.has('guardStorehouse');
      if (!guarded || enemyShare > 0.68) {
        addLoot(state, battle, lootBag, zone.pressure + zone.lootRisk);
        event(events, zone.id, 'loot', '약탈조가 창고 문을 부수고 비축을 빼냅니다.', 760, {
          side: 'raider', float: '약탈!',
        });
        if (rng() < 0.35 + enemyShare * 0.25) buildingsDamaged += 1;
      } else {
        lines.push('창고 수비대가 약탈조를 물자 더미 앞에서 막아냈습니다.');
      }
    }
    if (surpriseAttack) {
      surpriseDefenders.forEach(defender => {
        defender.ambushed = false;
        defender.command = 'fallback';
      });
      event(events, zone.id, 'retreat', '급습을 마친 사냥꾼들이 추격을 피해 다음 방어선으로 빠집니다.', 620, {
        side: 'defender', float: '이탈!',
      });
    }
  }

  villageMoraleDelta = Math.round(clamp(villageMoraleDelta, -18, 5));
  raiderMoraleDelta = Math.round(clamp(raiderMoraleDelta, -22, 0));
  battle.villageMorale = clamp(battle.villageMorale + villageMoraleDelta, 0, 100);
  battle.raiderMorale = clamp(battle.raiderMorale + raiderMoraleDelta, 0, 100);
  const scheduledAdvances = new Map<string, {
    fromZoneId: string;
    destinationName: string;
    groupLabels: string[];
  }>();
  for (const attacker of battle.raiderGroups) {
    attacker.morale = clamp(attacker.morale + raiderMoraleDelta, 0, 100);
    const route = routeForRaider(attacker);
    const index = route.indexOf(attacker.zoneId);
    const zone = battle.zones.find(candidate => candidate.id === attacker.zoneId);
    const share = dominance.get(attacker.zoneId) ?? 0;
    if (attacker.morale <= 18 || attacker.power <= battle.originalPower * 0.035) {
      attacker.intent = 'withdraw';
      attacker.pendingZoneId = undefined;
      event(events, attacker.zoneId, 'moraleBreak', `${attacker.label}의 대열이 흩어집니다.`, 650, {
        side: 'raider', groupId: attacker.id, float: '궤주!',
      });
    } else if (!attacker.confused && index >= 0 && index < route.length - 1 &&
      shouldRaiderAdvance(attacker, battle, zone, share, defenderReadiness.get(attacker.zoneId) ?? 0)) {
      const fromZoneId = attacker.zoneId;
      attacker.pendingZoneId = route[index + 1];
      attacker.targetZoneId = route[Math.min(route.length - 1, index + 2)];
      const destinationName = battle.zones.find(candidate => candidate.id === attacker.pendingZoneId)?.name;
      const advanceKey = `${fromZoneId}->${attacker.pendingZoneId}`;
      const scheduled = scheduledAdvances.get(advanceKey) ?? {
        fromZoneId,
        destinationName: destinationName ?? '다음 방어선',
        groupLabels: [],
      };
      scheduled.groupLabels.push(attacker.label);
      scheduledAdvances.set(advanceKey, scheduled);
      if (attacker.kind === 'flankers') {
        lines.push(attacker.flankPlan === 'rearAssault'
          ? `${attacker.label}이(가) 주 방어선의 뒤편을 노리며 ${destinationName}(으)로 우회합니다.`
          : `${attacker.label}이(가) 방책을 우회해 ${destinationName}(으)로 접근합니다.`);
      } else if (attacker.kind === 'looters' && fromZoneId === 'wall' && !zone?.breached) {
        lines.push(`${attacker.label}이(가) 방책의 틈으로 새어 나가 ${destinationName}(으)로 침투합니다.`);
      }
    }
    attacker.engagementsInZone = (attacker.engagementsInZone ?? 0) + 1;
    if (!attacker.revealed && (battle.round >= 2 || applied(battle, 'setAmbush'))) attacker.revealed = true;
  }
  for (const advance of scheduledAdvances.values()) {
    const subject = advance.groupLabels.join('·');
    event(events, advance.fromZoneId, 'advance', `${subject}이(가) 교전을 마치고 ${advance.destinationName}(으)로 밀려듭니다.`, 620);
  }

  const activeRaiders = battle.raiderGroups.filter(group => group.intent !== 'withdraw' && group.power > 0);
  const nextFocusZoneId = activeRaiders
    .map(group => {
      const zoneId = group.pendingZoneId ?? group.zoneId;
      return { zoneId, score: group.power + (battle.zones.find(zone => zone.id === zoneId)?.pressure ?? 0) };
    })
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
  if (battle.phase !== 'simulating') return '재생 중인 교전이 없습니다.';
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
  // 후퇴 연출은 원래 구역에서 보여준 뒤, 다음 교전을 준비할 때 실제 배치를 후방으로 옮긴다.
  applyNextEngagementStates(battle);
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
    fallback: '병력을 보존하며 구역을 내주고 다음 방어선으로 물러납니다.',
    advance: '이번 교전을 마친 뒤 한 단계 앞선 방어선으로 이동합니다.',
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
