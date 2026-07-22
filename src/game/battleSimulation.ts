// 전투 시뮬레이션 모드 — 메인 메뉴에서 전술 전투만 따로 테스트한다.
// 격리된 샌드박스 GameState를 만들어 지정/랜덤 조건으로 createTacticalBattle을 연다.
// 결과는 저장되지 않고, 전투가 끝나면 메뉴로 돌아간다.
import { CONFIG } from './config';
import { addLog } from './events';
import { materializePredatorThreat } from './expeditionIntel';
import { makeRng } from './map';
import { createResident } from './residents';
import { newGame } from './simulation';
import { specialResidentDefinition } from './specialResidents';
import { createBanditLairTacticalAssault } from './tacticalAssault';
import { createTacticalBattle } from './tacticalBattle';
import { createPredatorTacticalHunt } from './tacticalHunt';
import { clearWeaponAssignments, setResidentMount, setResidentWeapon } from './weapons';
import type {
  BattleMode, EnemyDoctrineId, EnemyStratagemId, Expedition, GameState, JobId, PredatorKind, Season,
  SpecialResidentId, TacticalRouteSide, TigerTier, WeatherId,
} from './types';

// 각 항목은 구체값 또는 'random' (시작할 때마다 새로 굴린다)
export type SimSetting<T> = T | 'random';
export type BattleSimulationScenario = 'defense' | 'banditLair' | 'tigerHunt' | 'wolfHunt';

export interface BattleSimDefenderCounts {
  muskets: number;        // 조총 수비대
  bows: number;           // 각궁 수비대
  spears: number;         // 창 수비대
  unarmedMilitia: number; // 기본 장비 수비병
  watchmen: number;       // 파수꾼
  hunters: number;        // 사냥꾼
  physicians: number;     // 전술 치료반
  civilians: number;      // 피난 주민
}

export type BattleSimMountableDefenderKey = Exclude<
  keyof BattleSimDefenderCounts,
  'physicians' | 'civilians'
>;
export type BattleSimDefenderMountCounts = Record<BattleSimMountableDefenderKey, number>;

export interface BattleSimulationOptions {
  scenario?: BattleSimulationScenario;
  mode: SimSetting<BattleMode>;
  factionName: SimSetting<string>;
  power: SimSetting<number>;          // 적 전력 (일반 15~180, 토벌군 최소 120)
  warned: SimSetting<boolean>;        // 경보 여부
  siege: SimSetting<boolean>;         // 방책 공성 여부
  season: SimSetting<Season>;
  weather: SimSetting<WeatherId>;
  prepPoints: SimSetting<number> | 'auto'; // 'auto'면 기존 규칙대로 계산
  defenders: SimSetting<BattleSimDefenderCounts>;
  cannonEmplacements: SimSetting<number>; // 완성된 불랑기포대 수
  tigerTier?: SimSetting<TigerTier>;
  wolfCount?: SimSetting<number>;
  enemyDoctrine?: EnemyDoctrineId | 'auto';
  enemyCompositionTemplateId?: string | 'auto';
  enemyStratagem?: EnemyStratagemId | 'none' | 'auto';
  enemyFlankRoute?: TacticalRouteSide | 'none' | 'auto';
  combatSpecialResidents?: SimSetting<SpecialResidentId[]>;
  mountedDefenders?: SimSetting<Partial<BattleSimDefenderMountCounts>>;
  mountedSpecialResidents?: SimSetting<SpecialResidentId[]>;
  /** 이전 시뮬레이터 프리셋과 테스트 저장값을 위한 호환 옵션. */
  includeCombatSpecialResidents?: boolean;
  /** 개발 측정용 적대 관계. 생략하면 새 게임의 기본 관계를 유지한다. */
  enemyRelation?: number;
  seed?: number;
}

const SEASONS: Season[] = ['spring', 'summer', 'autumn', 'winter'];
const WEATHERS: WeatherId[] = ['clear', 'rain', 'frost', 'heavySnow', 'blizzard', 'coldSnap', 'thawFlood'];
export const BATTLE_SIMULATION_COMBAT_SPECIAL_RESIDENTS: readonly SpecialResidentId[] = [
  'jurchenWarrior', 'tigerHunter', 'uinyeo', 'hangwae',
];
const MOUNTABLE_DEFENDER_KEYS: readonly BattleSimMountableDefenderKey[] = [
  'muskets', 'bows', 'spears', 'unarmedMilitia', 'watchmen', 'hunters',
];

export const BATTLE_SIMULATION_ENEMIES = [
  {
    name: '니마차 우디캐',
    description: '숲 사냥꾼과 창잡이 우회대가 매복과 측면 공격을 노립니다.',
  },
  {
    name: '홀라온 야인',
    description: '기마 선봉과 기마 궁수가 빠르게 방어선의 빈틈을 파고듭니다.',
  },
  {
    name: '변경 마적',
    description: '두목 친위대와 기마 마적, 약탈패가 창고와 주민을 노립니다.',
  },
  {
    name: '조정 토벌군',
    description: '훈련도감식 포수·사수·살수에 관군 기병과 화포대가 합류한 최고 난도 편제입니다.',
  },
] as const;

// 계절 중간 날짜 — getSeason이 해당 계절을 돌려주는 day 값
function dayForSeason(season: Season): number {
  const index = SEASONS.indexOf(season);
  return index * CONFIG.time.seasonDays + Math.ceil(CONFIG.time.seasonDays / 2);
}

function pick<T>(setting: SimSetting<T>, roll: () => T): T {
  return setting === 'random' ? roll() : setting;
}

export function randomDefenderCounts(rng: () => number): BattleSimDefenderCounts {
  const counts: BattleSimDefenderCounts = {
    muskets: Math.floor(rng() * 4),
    bows: Math.floor(rng() * 5),
    spears: Math.floor(rng() * 5),
    unarmedMilitia: Math.floor(rng() * 4),
    watchmen: Math.floor(rng() * 4),
    hunters: Math.floor(rng() * 5),
    physicians: Math.floor(rng() * 3),
    civilians: 4 + Math.floor(rng() * 7),
  };
  // 전투원이 하나도 없으면 최소한의 수비대는 세운다
  if (counts.muskets + counts.bows + counts.spears + counts.unarmedMilitia + counts.watchmen + counts.hunters === 0) {
    counts.spears = 2;
    counts.watchmen = 1;
  }
  return counts;
}

function combatantCount(counts: BattleSimDefenderCounts): number {
  return counts.muskets + counts.bows + counts.spears + counts.unarmedMilitia + counts.watchmen + counts.hunters;
}

function randomMountedDefenderCounts(
  counts: BattleSimDefenderCounts,
  rng: () => number,
): BattleSimDefenderMountCounts {
  return Object.fromEntries(MOUNTABLE_DEFENDER_KEYS.map(key => {
    let mounted = 0;
    for (let index = 0; index < counts[key]; index++) {
      if (rng() < 0.32) mounted += 1;
    }
    return [key, mounted];
  })) as BattleSimDefenderMountCounts;
}

function selectedSpecialResidents(options: BattleSimulationOptions, rng: () => number): SpecialResidentId[] {
  const requested = options.combatSpecialResidents === 'random'
    ? BATTLE_SIMULATION_COMBAT_SPECIAL_RESIDENTS.filter(() => rng() < 0.38)
    : options.combatSpecialResidents ?? (options.includeCombatSpecialResidents
      ? [...BATTLE_SIMULATION_COMBAT_SPECIAL_RESIDENTS]
      : []);
  return [...new Set(requested)].filter(id => BATTLE_SIMULATION_COMBAT_SPECIAL_RESIDENTS.includes(id));
}

function expeditionCounts(counts: BattleSimDefenderCounts): BattleSimDefenderCounts {
  const next = { ...counts, civilians: 0 };
  const missing = Math.max(0, 2 - combatantCount(next));
  next.unarmedMilitia += missing;
  return next;
}

function simulationTarget(state: GameState): { x: number; y: number } {
  const habitat = state.habitats.find(candidate => candidate.active);
  if (habitat) return { x: habitat.x, y: habitat.y };
  const center = state.buildings.find(building => building.type === 'center' && building.built);
  if (center) return { x: center.x, y: center.y };
  return {
    x: Math.floor((state.map[0]?.length ?? 1) / 2),
    y: Math.floor(state.map.length / 2),
  };
}

function placeExpeditionAtTarget(
  state: GameState,
  kind: Expedition['kind'],
  memberIds: number[],
  target: { x: number; y: number },
  details: Pick<Expedition, 'targetSiteId' | 'predatorKind'> = {},
): void {
  state.expedition = {
    kind,
    ...details,
    targetX: target.x,
    targetY: target.y,
    musterX: target.x,
    musterY: target.y,
    phase: 'engage',
    memberIds,
    x: target.x,
    y: target.y,
    px: target.x,
    py: target.y,
    path: [],
    trail: [],
    speed: 1,
    ticks: 0,
  };
}

function applyPreparationSetting(
  state: GameState,
  setting: BattleSimulationOptions['prepPoints'],
  rng: () => number,
): void {
  if (!state.tacticalBattle || setting === 'auto') return;
  const points = pick(setting, () => Math.floor(rng() * (CONFIG.tacticalBattle.prep.max + 1)));
  state.tacticalBattle.prepPoints = Math.max(0, Math.min(CONFIG.tacticalBattle.prep.max, Math.round(points)));
}

function tigerStrength(tier: TigerTier, rng: () => number): number {
  if (tier === 'mountainLord') return 90 + Math.floor(rng() * 15);
  if (tier === 'greatTiger') return 70 + Math.floor(rng() * 12);
  return 56 + Math.floor(rng() * 9);
}

function createOffensiveSimulation(
  state: GameState,
  scenario: Exclude<BattleSimulationScenario, 'defense'>,
  options: BattleSimulationOptions,
  memberIds: number[],
  rng: () => number,
): void {
  const target = simulationTarget(state);
  const exactIntel = pick(options.warned, () => rng() < 0.5);

  if (scenario === 'banditLair') {
    const power = Math.round(pick(options.power, () => 45 + rng() * 75));
    const siteId = state.nextForeignSiteId++;
    state.foreignSites.push({
      id: siteId,
      type: 'banditLair',
      name: '전투 시뮬레이션 산채',
      factionName: '변경 마적',
      x: target.x,
      y: target.y,
      width: 3,
      height: 3,
      discovered: true,
      status: 'fortified',
      population: Math.max(4, Math.round(power / 8)),
      militaryPower: Math.max(10, power),
      foodStock: 20,
      tradeStock: {},
      influenceRadius: 5,
      goodwill: -80,
      trust: 0,
      alarm: exactIntel ? 35 : 65,
      favors: 0,
      memories: [],
      lastInteractionDay: state.day,
      scoutedUntilDay: exactIntel ? state.day + 1 : undefined,
    });
    placeExpeditionAtTarget(state, 'lairAssault', memberIds, target, { targetSiteId: siteId });
    const result = createBanditLairTacticalAssault(state);
    if (typeof result === 'string') throw new Error(result);
    return;
  }

  const predatorKind: PredatorKind = scenario === 'tigerHunt' ? 'tiger' : 'wolf';
  const untilDay = state.day + 10;
  const generated = materializePredatorThreat(state, predatorKind, untilDay);
  if (predatorKind === 'tiger') {
    const tier = pick(options.tigerTier ?? 'random', () => generated.tigerTier ?? 'tiger');
    generated.size = 1;
    generated.tigerTier = tier;
    generated.strength = tigerStrength(tier, rng);
  } else {
    const size = Math.max(3, Math.min(12, Math.round(pick(options.wolfCount ?? 'random', () => generated.size ?? 6))));
    generated.size = size;
    generated.strength = 28 + size * 4 + Math.floor(rng() * 7);
  }
  if (exactIntel) {
    generated.intel = { precision: 'exact', revealedDay: state.day, source: 'scout' };
  }
  state.incidents.predatorThreats[predatorKind] = generated;
  placeExpeditionAtTarget(state, 'predatorHunt', memberIds, target, { predatorKind });
  const result = createPredatorTacticalHunt(state);
  if (typeof result === 'string') throw new Error(result);
}

export function createBattleSimulation(options: BattleSimulationOptions): GameState {
  const seed = options.seed ?? Math.floor(Math.random() * 2 ** 31);
  const rng = makeRng(seed);
  const state = newGame(seed, 'normal');

  const season = pick(options.season, () => SEASONS[Math.floor(rng() * SEASONS.length)]);
  state.day = dayForSeason(season);
  state.weather = pick(options.weather, () => WEATHERS[Math.floor(rng() * WEATHERS.length)]);

  // 시작 주민을 걷어내고 지정 구성으로 다시 채운다
  const scenario = options.scenario ?? 'defense';
  const selectedCounts = pick(options.defenders, () => randomDefenderCounts(rng));
  const counts = scenario === 'defense' ? selectedCounts : expeditionCounts(selectedCounts);
  state.residents = [];
  state.nextResidentId = 1;
  const combatantIds: number[] = [];
  const add = (job: JobId, amount: number): number[] => {
    const ids: number[] = [];
    for (let i = 0; i < amount; i++) {
      const resident = createResident(state, rng, job);
      state.residents.push(resident);
      ids.push(resident.id);
      if (job === 'militia' || job === 'watchman' || job === 'hunter' || job === 'physician') {
        combatantIds.push(resident.id);
      }
    }
    return ids;
  };
  const militiaIds = add('militia', counts.muskets + counts.bows + counts.spears + counts.unarmedMilitia);
  const watchmanIds = add('watchman', counts.watchmen);
  const hunterIds = add('hunter', counts.hunters);
  add('physician', counts.physicians);
  add('idle', counts.civilians);
  const specialResidentIds = new Map<SpecialResidentId, number>();
  const selectedSpecialIds = selectedSpecialResidents(options, rng);
  if (selectedSpecialIds.length > 0) {
    for (const id of selectedSpecialIds) {
      const definition = specialResidentDefinition(id);
      const resident = createResident(state, rng, definition.job);
      resident.name = definition.name;
      resident.gender = definition.gender;
      resident.age = definition.age;
      resident.special = definition.id;
      state.residents.push(resident);
      specialResidentIds.set(definition.id, resident.id);
      if (definition.job === 'militia' || definition.job === 'watchman' ||
          definition.job === 'hunter' || definition.job === 'physician') {
        combatantIds.push(resident.id);
      }
    }
  }

  // 무기 배분(militiaWeaponAllocation)이 지정한 수와 정확히 일치하게 비축을 맞춘다
  state.resources.muskets = counts.muskets;
  state.resources.hornBows = counts.bows;
  state.resources.spears = counts.spears;
  clearWeaponAssignments(state);
  const militia = state.residents.filter(resident => resident.job === 'militia');
  let militiaIndex = 0;
  const assign = (weapon: 'musket' | 'hornBow' | 'spear', amount: number) => {
    for (let i = 0; i < amount; i++) {
      const resident = militia[militiaIndex++];
      if (resident) setResidentWeapon(state, resident.id, weapon);
    }
  };
  assign('musket', counts.muskets);
  assign('hornBow', counts.bows);
  assign('spear', counts.spears);

  // 지정/랜덤 군마 편성을 실제 주민 배정으로 변환한다. 치료반과 민간인은 승마 대상이 아니다.
  const regularIds: Record<BattleSimMountableDefenderKey, number[]> = {
    muskets: militiaIds.slice(0, counts.muskets),
    bows: militiaIds.slice(counts.muskets, counts.muskets + counts.bows),
    spears: militiaIds.slice(counts.muskets + counts.bows, counts.muskets + counts.bows + counts.spears),
    unarmedMilitia: militiaIds.slice(counts.muskets + counts.bows + counts.spears),
    watchmen: watchmanIds,
    hunters: hunterIds,
  };
  const requestedMounted = options.mountedDefenders === 'random' ||
      (options.defenders === 'random' && options.mountedDefenders == null)
    ? randomMountedDefenderCounts(counts, rng)
    : options.mountedDefenders ?? {};
  const mountedResidentIds: number[] = [];
  for (const key of MOUNTABLE_DEFENDER_KEYS) {
    const amount = Math.max(0, Math.min(
      regularIds[key].length,
      Math.round(Number(requestedMounted[key] ?? 0)) || 0,
    ));
    mountedResidentIds.push(...regularIds[key].slice(0, amount));
  }
  const requestedMountedSpecials = options.mountedSpecialResidents === 'random'
    ? selectedSpecialIds.filter(id => specialResidentDefinition(id).job !== 'physician' && rng() < 0.45)
    : options.mountedSpecialResidents ?? [];
  for (const id of [...new Set(requestedMountedSpecials)]) {
    if (!selectedSpecialIds.includes(id) || specialResidentDefinition(id).job === 'physician') continue;
    const residentId = specialResidentIds.get(id);
    if (residentId != null) mountedResidentIds.push(residentId);
  }
  if (mountedResidentIds.length > 0) {
    state.buildings.push({
      id: state.nextBuildingId++,
      type: 'stable',
      x: 0,
      y: 0,
      progress: 999,
      built: true,
      fieldGrowth: 0,
      livestock: {
        species: 'horse', headcount: mountedResidentIds.length, growth: 0, feedShortageDays: 0,
      },
    });
    for (const residentId of mountedResidentIds) setResidentMount(state, residentId, 'horse');
  }

  const cannonSetting = scenario === 'defense' ? options.cannonEmplacements ?? 0 : 0;
  const cannonCount = Math.max(0, Math.min(8, Math.round(
    pick(cannonSetting, () => Math.floor(rng() * 5)),
  )));
  state.cannonsGranted = Math.max(state.cannonsGranted, cannonCount);
  for (let i = 0; i < cannonCount; i++) {
    state.buildings.push({
      id: state.nextBuildingId++,
      type: 'cannonEmplacement',
      x: 0,
      y: 0,
      progress: 999,
      built: true,
      fieldGrowth: 0,
    });
  }
  state.resources.gunpowder = counts.muskets > 0 || cannonCount > 0
    ? Math.max(10, cannonCount * CONFIG.raid.powderPerCannon, state.resources.gunpowder)
    : 0;

  if (scenario === 'defense') {
    const factionName = pick(options.factionName, () =>
      BATTLE_SIMULATION_ENEMIES[Math.floor(rng() * BATTLE_SIMULATION_ENEMIES.length)].name);
    const mode = pick(options.mode, () => (rng() < 0.5 ? 'garrison' : 'levy'));
    const warned = pick(options.warned, () => rng() < 0.5);
    const siege = pick(options.siege, () => rng() < 0.35);
    const rolledPower = pick(options.power, () =>
      factionName === '조정 토벌군' ? 140 + rng() * 40 : 55 + rng() * 45);
    // 토벌군은 낮은 수치를 골라도 정예 상비군 편제 자체가 무너지지 않도록 최소 전력을 보장한다.
    const power = factionName === '조정 토벌군'
      ? Math.max(120, Math.round(rolledPower))
      : Math.round(rolledPower);
    if (Number.isFinite(options.enemyRelation)) {
      state.relations[factionName] = Math.max(0, Math.min(100, Number(options.enemyRelation)));
    }
    createTacticalBattle(state, {
      factionName, power, warned, siege, mode,
      forcedDoctrine: options.enemyDoctrine && options.enemyDoctrine !== 'auto'
        ? options.enemyDoctrine
        : undefined,
      forcedCompositionTemplateId: options.enemyCompositionTemplateId && options.enemyCompositionTemplateId !== 'auto'
        ? options.enemyCompositionTemplateId
        : undefined,
      forcedStratagem: options.enemyStratagem && options.enemyStratagem !== 'auto'
        ? options.enemyStratagem
        : undefined,
      forcedFlankRoute: options.enemyFlankRoute && options.enemyFlankRoute !== 'auto'
        ? options.enemyFlankRoute
        : undefined,
    });
  } else {
    createOffensiveSimulation(state, scenario, options, combatantIds, rng);
  }
  applyPreparationSetting(state, options.prepPoints, rng);
  addLog(state, '전투 시뮬레이션 — 이 전투의 결과는 저장되지 않습니다.', 'info');
  return state;
}
