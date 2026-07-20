import { CONFIG } from './config';
import {
  chooseTacticalCompositionTemplate, tacticalCompositionTemplate, tacticalEnemyFactionId,
} from './tacticalCompositions';
import { tacticalDoctrineStateSignal } from './tacticalDoctrine';
import { tacticalUnitProfileOrUndefined } from './tacticalUnits';
import type {
  BanditLairDefensePlan, BanditLairDoctrineId, EnemyDoctrineId, EnemyObjectiveId, EnemyPlan, EnemyStratagemId,
  EnemyCounterBreakdown, EnemyStratagemState, ForeignSite, GameState, PreparationActionId, TacticalFlankPlan,
  TacticalBattle, TacticalEnemyFactionId, TacticalRouteSide,
} from './types';

type EnemyPlanCreationInput = {
  factionName: string;
  power?: number;
  relation?: number;
  objectiveRoll?: number;
  flankRoll: number;
  stratagemRoll?: number;
  intelLevel?: number;
  intelRoll?: number;
  doctrineRoll?: number;
  compositionRoll?: number;
  forcedDoctrine?: EnemyDoctrineId;
  forcedCompositionTemplateId?: string;
  forcedStratagem?: EnemyStratagemId | 'none';
  forcedFlankRoute?: TacticalRouteSide | 'none';
  maximumCompositionPhase?: 1 | 2 | 8;
  revealed: boolean;
};

type LegacyFlankPlan = {
  flankPlan?: TacticalFlankPlan;
  revealed?: boolean;
};

const OBJECTIVES: readonly EnemyObjectiveId[] = ['breakthrough', 'plunder', 'arson'];
const STRATAGEMS: readonly EnemyStratagemId[] = [
  'rearManeuver', 'wallBreakers', 'fireArrows', 'feint', 'nightApproach',
];
const BANDIT_LAIR_DOCTRINES: readonly BanditLairDoctrineId[] = [
  'trailAttrition', 'wallHold', 'leaderEscape',
];

const ENEMY_DOCTRINES: readonly EnemyDoctrineId[] = [
  'mountedSkirmish', 'shockBreakthrough', 'shieldedAdvance', 'breachAndStorm',
  'missileSuppression', 'fireSupport', 'reserveCounterattack', 'feignedRetreat',
];

const OBJECTIVE_DETAILS: Record<EnemyObjectiveId, { label: string }> = {
  breakthrough: { label: '방어선 돌파' },
  plunder: { label: '비축 약탈' },
  arson: { label: '방책·창고 방화' },
};

const DOCTRINE_DETAILS: Record<EnemyDoctrineId, {
  label: string;
  strength: string;
  weakness: string;
  counter: string;
  factions: readonly TacticalEnemyFactionId[];
  implementationPhase: 1 | 2 | 8;
  enabled: boolean;
}> = {
  mountedSkirmish: {
    label: '기마 견제',
    strength: '이동 사격과 후퇴를 반복해 느린 전열을 접근 전에 소모시킵니다.',
    weakness: '접촉이 고정되면 전투력이 떨어지고 창벽과 집중 사격에 취약합니다.',
    counter: '진형을 유지하고 궁·총포를 한 표적에 집중하십시오.',
    factions: ['holaon', 'bandit', 'court'], implementationPhase: 1, enabled: true,
  },
  shockBreakthrough: {
    label: '충격 돌파',
    strength: '한 구역과 한 열에 충격 전력을 집중해 얇은 전열을 무너뜨립니다.',
    weakness: '준비된 창벽과 목책에 돌격이 멈추면 손실이 커집니다.',
    counter: '창보병을 전열에 두고 목책과 준비 사격을 유지하십시오.',
    factions: ['nimacha', 'holaon', 'bandit', 'court'], implementationPhase: 1, enabled: true,
  },
  shieldedAdvance: {
    label: '방패 전진',
    strength: '방패 전열이 뒤따르는 사격대와 파책조의 화살 피해를 줄입니다.',
    weakness: '총포·화포와 측후방 공격에는 차폐 효과가 크게 줄어듭니다.',
    counter: '총포·화포를 집중하거나 우회해 방패 뒤 지원대를 치십시오.',
    factions: ['nimacha', 'bandit', 'court'], implementationPhase: 2, enabled: true,
  },
  breachAndStorm: {
    label: '파책 돌입',
    strength: '파책조를 호위해 목책 압박을 빠르게 쌓습니다.',
    weakness: '파책조 자체는 사격과 근접전 모두 약하고 잃으면 교리가 무너집니다.',
    counter: '파책조를 우선 표적으로 삼고 방책을 응급 수리하십시오.',
    factions: ['nimacha', 'bandit'], implementationPhase: 2, enabled: true,
  },
  missileSuppression: {
    label: '원거리 제압',
    strength: '궁·총포가 노출된 열을 집중 사격해 접근 전에 전력을 깎습니다.',
    weakness: '우회 급습과 악천후, 방패 전열에 효율이 떨어집니다.',
    counter: '방패로 접근하거나 우회대를 보내 원거리 대열을 압박하십시오.',
    factions: ['nimacha', 'bandit', 'court'], implementationPhase: 1, enabled: true,
  },
  fireSupport: {
    label: '화력 지원',
    strength: '화차 사격 뒤 보병이 전진해 후열과 밀집대를 함께 위협합니다.',
    weakness: '재장전 중 기동 급습에 취약하고 산개한 대열에는 효율이 낮습니다.',
    counter: '대열을 산개하고 재장전 시점에 기동 부대로 급습하십시오.',
    factions: ['court'], implementationPhase: 8, enabled: true,
  },
  reserveCounterattack: {
    label: '예비대 역습',
    strength: '주력이 전선을 고정한 뒤 정예 예비대를 투입해 재배치를 처벌합니다.',
    weakness: '예비대 위치가 드러나거나 주력이 먼저 무너지면 투입 효과가 사라집니다.',
    counter: '아군 예비대를 남기고 정찰로 적의 투입 징후를 확인하십시오.',
    factions: ['nimacha', 'holaon', 'bandit', 'court'], implementationPhase: 1, enabled: true,
  },
  feignedRetreat: {
    label: '거짓 후퇴',
    strength: '일부 부대가 물러나 추격을 유도한 뒤 측후방에서 역습합니다.',
    weakness: '추격하지 않고 위치를 지키면 실제 정면 전력만 얇아집니다.',
    counter: '퇴각을 즉시 추격하지 말고 정찰과 진형 유지를 우선하십시오.',
    factions: ['holaon', 'bandit'], implementationPhase: 8, enabled: false,
  },
};

const BANDIT_LAIR_DOCTRINE_DETAILS: Record<BanditLairDoctrineId, { label: string; effect: string }> = {
  trailAttrition: {
    label: '길목 소모전',
    effect: '숲길 초병과 매복대를 보강해 목책에 닿기 전부터 토벌대를 소모시킵니다.',
  },
  wallHold: {
    label: '목책 고수',
    effect: '사격대를 목책에 집중하는 대신 산채 안쪽 방어가 얇아집니다.',
  },
  leaderEscape: {
    label: '두목 탈출 우선',
    effect: '가짜 움막과 우회 퇴로를 준비하고 노획물을 미리 빼돌립니다.',
  },
};

const STRATAGEM_DETAILS: Record<EnemyStratagemId, {
  label: string;
  effect: string;
  warning: string;
  counter: string;
  drawback: string;
}> = {
  rearManeuver: {
    label: '후방 우회',
    effect: '우회대가 방어선 후열에 별도 교전선을 엽니다.',
    warning: '주력과 떨어진 말발굽과 발자국이 방책 뒤편으로 갈라집니다.',
    counter: '후열 근접 경비 또는 중열 예비대의 후방 증원',
    drawback: '우회대는 본대 지원에서 떨어져 후열 경비에 막히면 전투력이 낮아집니다.',
  },
  wallBreakers: {
    label: '방책 파괴조',
    effect: '주력이 방책 압박을 빠르게 쌓습니다.',
    warning: '도끼와 갈고리, 굵은 밧줄을 든 무리가 선봉 뒤에 모입니다.',
    counter: '방책 응급 수리 또는 망루·사격 준비',
    drawback: '무거운 파괴 도구 때문에 사격 피해에 더 취약합니다.',
  },
  fireArrows: {
    label: '불화살',
    effect: '방책과 창고에 추가 압박과 화재 피해를 가합니다.',
    warning: '기름 먹인 천을 감은 화살촉과 화로가 행렬 사이로 보입니다.',
    counter: '화재 대비',
    drawback: '불길이 번지면 빼앗을 물자도 함께 손상됩니다.',
  },
  feint: {
    label: '정면 기만',
    effect: '표시상 주력을 부풀리고 실제 전력을 약탈·우회조로 돌립니다.',
    warning: '같은 깃발이 여러 대열을 오가며 주력의 규모를 부풀립니다.',
    counter: '중열 근접 예비대 유지와 심층 정찰',
    drawback: '기만이 드러나면 실제 정면 주력이 얇아집니다.',
  },
  nightApproach: {
    label: '야간 접근',
    effect: '준비점수를 줄이고 첫 교전 기세를 높이는 대신 양측 사격을 흐트러뜨립니다.',
    warning: '횃불을 가린 적이 해가 진 뒤 소리 없이 거리를 좁힙니다.',
    counter: '횃불 경계',
    drawback: '어둠 때문에 적 사격대의 명중과 지휘도 함께 나빠집니다.',
  },
};

const PREPARATION_COUNTERS: Partial<Record<PreparationActionId, readonly EnemyStratagemId[]>> = {
  repairWall: ['wallBreakers'],
  prepareVolley: ['wallBreakers'],
  firePrevention: ['fireArrows'],
  torchWatch: ['nightApproach'],
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

type BanditLairPlanInput = {
  alarm: number;
  scoutFailures: number;
  assaultDefeats: number;
  militaryPower: number;
};

export function banditLairStratagemPoints(input: BanditLairPlanInput): number {
  const config = CONFIG.foreignSites.banditLairDefense;
  const alarmPoints = Math.min(config.maxAlarmPoints, Math.floor(Math.max(0, input.alarm) / config.alarmPerPoint));
  const scoutFailurePoints = Math.min(
    config.maxScoutFailurePoints,
    Math.max(0, Math.floor(input.scoutFailures)) * config.scoutFailurePoints,
  );
  const assaultDefeatPoints = Math.min(
    config.maxAssaultDefeatPoints,
    Math.max(0, Math.floor(input.assaultDefeats)) * config.assaultDefeatPoints,
  );
  const militaryPowerPoints = Math.min(
    config.maxMilitaryPowerPoints,
    Math.floor(Math.max(0, input.militaryPower) / config.militaryPowerPerPoint),
  );
  return clamp(
    config.baseStratagemPoints + alarmPoints + scoutFailurePoints + assaultDefeatPoints + militaryPowerPoints,
    config.baseStratagemPoints,
    config.maxStratagemPoints,
  );
}

export function chooseBanditLairDoctrine(
  input: BanditLairPlanInput,
  roll: number,
): BanditLairDoctrineId {
  const weights: Record<BanditLairDoctrineId, number> = {
    trailAttrition: 1 + clamp(input.alarm / 100, 0, 1) + Math.max(0, input.scoutFailures) * 0.5,
    wallHold: 1 + clamp(input.militaryPower / 50, 0, 2) + Math.max(0, input.assaultDefeats) * 0.25,
    leaderEscape: 1 + clamp((50 - input.militaryPower) / 50, 0, 1) +
      Math.max(0, input.assaultDefeats) * 1.2 + clamp(input.alarm / 200, 0, 0.5),
  };
  const total = BANDIT_LAIR_DOCTRINES.reduce((sum, doctrine) => sum + weights[doctrine], 0);
  let cursor = clamp(roll, 0, 0.999999999) * total;
  for (const doctrine of BANDIT_LAIR_DOCTRINES) {
    cursor -= weights[doctrine];
    if (cursor < 0) return doctrine;
  }
  return 'leaderEscape';
}

function deterministicUnit(...values: number[]): number {
  let hash = 0x811c9dc5;
  for (const value of values) {
    const normalized = Math.floor(Number.isFinite(value) ? value * 1000 : 0);
    hash ^= normalized;
    hash = Math.imul(hash, 0x01000193);
    hash ^= hash >>> 13;
  }
  return (hash >>> 0) / 0x100000000;
}

function chooseDifferentBanditLairDoctrine(
  current: BanditLairDoctrineId,
  input: BanditLairPlanInput,
  roll: number,
): BanditLairDoctrineId {
  for (let attempt = 0; attempt < BANDIT_LAIR_DOCTRINES.length; attempt += 1) {
    const selected = chooseBanditLairDoctrine(input, (roll + attempt / BANDIT_LAIR_DOCTRINES.length) % 1);
    if (selected !== current) return selected;
  }
  return BANDIT_LAIR_DOCTRINES[(BANDIT_LAIR_DOCTRINES.indexOf(current) + 1) % BANDIT_LAIR_DOCTRINES.length];
}

export function refreshBanditLairDoctrine(state: GameState, site: ForeignSite): void {
  if (site.type !== 'banditLair') return;
  const config = CONFIG.foreignSites.banditLairDefense;
  const revision = Number.isFinite(site.lairDoctrineRevision)
    ? Math.max(0, Math.floor(site.lairDoctrineRevision!))
    : 0;
  const input: BanditLairPlanInput = {
    alarm: site.alarm,
    scoutFailures: site.lairScoutFailures ?? 0,
    assaultDefeats: site.lairAssaultDefeats ?? 0,
    militaryPower: site.militaryPower,
  };
  if (!site.lairDoctrine) {
    site.lairDoctrine = chooseBanditLairDoctrine(input, deterministicUnit(
      state.seed, site.id, revision, state.day, site.alarm, site.militaryPower,
    ));
    site.lairDoctrineRevision = revision;
    site.lairDoctrineChosenDay = state.day;
    site.lairDoctrineNextReviewDay = Math.max(
      state.day + config.doctrineReviewIntervalDays,
      (site.scoutedUntilDay ?? -1) + 1,
    );
    site.lairDoctrineRevealed ??= false;
    return;
  }
  site.lairDoctrineRevision = revision;
  site.lairDoctrineChosenDay = Number.isFinite(site.lairDoctrineChosenDay)
    ? Math.floor(site.lairDoctrineChosenDay!)
    : state.day;
  site.lairDoctrineNextReviewDay = Number.isFinite(site.lairDoctrineNextReviewDay)
    ? Math.floor(site.lairDoctrineNextReviewDay!)
    : Math.max(state.day + config.doctrineReviewIntervalDays, (site.scoutedUntilDay ?? -1) + 1);
  if (site.status === 'burned' || site.status === 'abandoned') return;
  if (state.tacticalBattle?.encounterKind === 'banditLair' &&
      state.tacticalBattle.assaultTargetSiteId === site.id) return;
  if (state.day <= (site.scoutedUntilDay ?? -1)) return;
  if (state.day < site.lairDoctrineNextReviewDay) return;

  const reviewDay = site.lairDoctrineNextReviewDay;
  const changeRoll = deterministicUnit(
    state.seed, site.id, revision, reviewDay, site.alarm,
    site.lairScoutFailures ?? 0, site.lairAssaultDefeats ?? 0, site.militaryPower,
  );
  if (changeRoll < config.doctrineChangeChance) {
    const selectionRoll = deterministicUnit(
      state.seed, site.id, revision, reviewDay, site.militaryPower,
      site.lairAssaultDefeats ?? 0, site.lairScoutFailures ?? 0, 97,
    );
    site.lairDoctrine = chooseDifferentBanditLairDoctrine(site.lairDoctrine, input, selectionRoll);
    site.lairDoctrineRevision = revision + 1;
    site.lairDoctrineChosenDay = state.day;
    site.lairDoctrineRevealed = false;
  }
  site.lairDoctrineNextReviewDay = state.day + config.doctrineReviewIntervalDays;
}

export function banditLairDoctrineDefinition(doctrine: BanditLairDoctrineId) {
  return { id: doctrine, ...BANDIT_LAIR_DOCTRINE_DETAILS[doctrine] };
}

function banditLairDoctrineRoll(site: ForeignSite): number {
  let hash = Math.imul(site.id + 17, 0x45d9f3b);
  hash ^= Math.imul(site.x + 101, 0x119de1f3);
  hash ^= Math.imul(site.y + 211, 0x3449f5);
  return (hash >>> 0) / 0x100000000;
}

export function ensureBanditLairDefensePlan(site: ForeignSite): BanditLairDefensePlan {
  const input: BanditLairPlanInput = {
    alarm: site.alarm,
    scoutFailures: site.lairScoutFailures ?? 0,
    assaultDefeats: site.lairAssaultDefeats ?? 0,
    militaryPower: site.militaryPower,
  };
  site.lairDoctrine ??= chooseBanditLairDoctrine(input, banditLairDoctrineRoll(site));
  return {
    doctrine: site.lairDoctrine,
    doctrineRevealed: site.lairDoctrineRevealed === true,
    stratagemPoints: banditLairStratagemPoints(input),
  };
}

export function migrateBanditLairDefensePlan(raw: unknown): BanditLairDefensePlan | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const source = raw as Record<string, unknown>;
  if (!BANDIT_LAIR_DOCTRINES.includes(source.doctrine as BanditLairDoctrineId)) return undefined;
  return {
    doctrine: source.doctrine as BanditLairDoctrineId,
    doctrineRevealed: source.doctrineRevealed === true,
    stratagemPoints: Number.isFinite(source.stratagemPoints)
      ? clamp(Math.floor(Number(source.stratagemPoints)), 0, CONFIG.foreignSites.banditLairDefense.maxStratagemPoints)
      : 0,
  };
}

export function enemyObjectiveDefinition(objective: EnemyObjectiveId) {
  return { id: objective, ...OBJECTIVE_DETAILS[objective], ...enemyObjectiveProfile(objective) };
}

export function enemyDoctrineDefinition(doctrine: EnemyDoctrineId) {
  return { id: doctrine, ...DOCTRINE_DETAILS[doctrine] };
}

export function enemyDoctrineDefinitions(): readonly ReturnType<typeof enemyDoctrineDefinition>[] {
  return ENEMY_DOCTRINES.map(enemyDoctrineDefinition);
}

export function eligibleEnemyDoctrines(
  factionName: string,
  maximumPhase: 1 | 2 | 8 = 2,
): readonly EnemyDoctrineId[] {
  const faction = tacticalEnemyFactionId(factionName);
  return ENEMY_DOCTRINES.filter(doctrine => {
    const definition = DOCTRINE_DETAILS[doctrine];
    return definition.enabled && definition.implementationPhase <= maximumPhase &&
      definition.factions.includes(faction);
  });
}

export function chooseEnemyDoctrine(
  factionName: string,
  roll: number,
  maximumPhase: 1 | 2 | 8 = 2,
): EnemyDoctrineId {
  const candidates = eligibleEnemyDoctrines(factionName, maximumPhase);
  if (candidates.length === 0) return 'reserveCounterattack';
  const index = Math.floor(clamp(roll, 0, 0.999999999) * candidates.length);
  return candidates[index];
}

function factionKey(factionName: string): TacticalEnemyFactionId {
  return tacticalEnemyFactionId(factionName);
}

function rearManeuverChance(factionName: string): number {
  if (factionName === '홀라온 야인' || factionName === '변경 마적' || factionName === '조정 토벌군') return 0.6;
  if (factionName === '니마차 우디캐') return 0.3;
  return 0.5;
}

export function enemyObjectiveWeights(
  factionName: string,
  power: number,
  relation: number,
): Record<EnemyObjectiveId, number> {
  const config = CONFIG.tacticalBattle.enemyPlan;
  const activationRelation = config.objectiveActivationRelation[factionKey(factionName)];
  if (relation >= activationRelation) {
    return { breakthrough: 1, plunder: 0, arson: 0 };
  }
  const base = config.objectiveWeights[factionKey(factionName)];
  const powerPressure = clamp((power - 40) / 180, 0, 1);
  const hostility = clamp((activationRelation - relation) / Math.max(1, activationRelation), 0, 1);
  return {
    breakthrough: base.breakthrough * (1 + powerPressure * config.objectivePowerBreakthroughBonus),
    plunder: base.plunder * (1 + (1 - powerPressure) * config.objectiveLowPowerPlunderBonus),
    arson: base.arson * (1 + hostility * config.objectiveHostilityArsonBonus),
  };
}

export function chooseEnemyObjective(
  factionName: string,
  power: number,
  relation: number,
  roll: number,
): EnemyObjectiveId {
  const weights = enemyObjectiveWeights(factionName, power, relation);
  const total = OBJECTIVES.reduce((sum, objective) => sum + weights[objective], 0);
  let cursor = clamp(roll, 0, 0.999999999) * total;
  for (const objective of OBJECTIVES) {
    cursor -= weights[objective];
    if (cursor < 0) return objective;
  }
  return 'breakthrough';
}

export function enemyObjectiveProfile(objective: EnemyObjectiveId) {
  return CONFIG.tacticalBattle.enemyPlan.objectiveProfiles[objective];
}

export function enemyStratagemCost(stratagem: EnemyStratagemId): number {
  return CONFIG.tacticalBattle.enemyPlan.stratagemCosts[stratagem];
}

export function enemyStratagemDefinition(stratagem: EnemyStratagemId) {
  return { id: stratagem, cost: enemyStratagemCost(stratagem), ...STRATAGEM_DETAILS[stratagem] };
}

export function enemyStratagemDefinitions() {
  return STRATAGEMS.map(enemyStratagemDefinition);
}

export function enemyCombinedCounterStrength(counter: Partial<EnemyCounterBreakdown> = {}): number {
  const intelligence = clamp(counter.intelligence ?? 0, 0, 1);
  const preparation = clamp(counter.preparation ?? 0, 0, 1);
  const formation = clamp(counter.formation ?? 0, 0, 1);
  return clamp(1 - (1 - intelligence) * (1 - preparation) * (1 - formation), 0, 1);
}

export function enemyStratagemCounterStrength(
  stratagem: Pick<EnemyStratagemState, 'counterLevel' | 'counter'>,
): number {
  if (stratagem.counter && Object.keys(stratagem.counter).length > 0) {
    return enemyCombinedCounterStrength(stratagem.counter);
  }
  if (stratagem.counterLevel === 2) return 1;
  return stratagem.counterLevel === 1 ? CONFIG.tacticalBattle.enemyPlan.counterStrength.preparation : 0;
}

export function enemyStratagemEffectScale(
  stratagem: Pick<EnemyStratagemState, 'counterLevel' | 'counter'>,
): number {
  return 1 - enemyStratagemCounterStrength(stratagem);
}

export function enemyStratagemCounterStrengthForEngagement(
  stratagem: Pick<EnemyStratagemState, 'counterLevel' | 'counter'>,
  formationCounter: number,
): number {
  if (stratagem.counter && Object.keys(stratagem.counter).length > 0) {
    return enemyCombinedCounterStrength({
      ...stratagem.counter,
      formation: formationCounter,
    });
  }
  if (stratagem.counterLevel === 2) return 1;
  return enemyCombinedCounterStrength({
    preparation: stratagem.counterLevel === 1
      ? CONFIG.tacticalBattle.enemyPlan.counterStrength.preparation
      : 0,
    formation: formationCounter,
  });
}

export function enemyStratagemEffectScaleForEngagement(
  stratagem: Pick<EnemyStratagemState, 'counterLevel' | 'counter'>,
  formationCounter: number,
): number {
  return 1 - enemyStratagemCounterStrengthForEngagement(stratagem, formationCounter);
}

export function enemyPlanStratagemScale(plan: EnemyPlan | undefined, id: EnemyStratagemId): number {
  const stratagem = plan?.stratagems.find(candidate => candidate.id === id);
  return stratagem ? enemyStratagemEffectScale(stratagem) : 0;
}

export function enemyPlanStratagemScaleForEngagement(
  plan: EnemyPlan | undefined,
  id: EnemyStratagemId,
  formationCounter: number,
): number {
  const stratagem = plan?.stratagems.find(candidate => candidate.id === id);
  return stratagem ? enemyStratagemEffectScaleForEngagement(stratagem, formationCounter) : 0;
}

export function enemyPlanPreparationPenalty(plan: EnemyPlan | undefined): number {
  return Math.round(CONFIG.tacticalBattle.enemyPlan.effects.nightApproach.prepPointPenalty *
    enemyPlanStratagemScale(plan, 'nightApproach'));
}

export function enemyPlanRangedEfficiency(plan: EnemyPlan | undefined): number {
  return 1 - CONFIG.tacticalBattle.enemyPlan.effects.nightApproach.rangedEfficiencyPenalty *
    enemyPlanStratagemScale(plan, 'nightApproach');
}

export function enemyPlanFirstRoundMoraleBonus(plan: EnemyPlan | undefined): number {
  return Math.round(CONFIG.tacticalBattle.enemyPlan.effects.nightApproach.firstRoundMoraleBonus *
    enemyPlanStratagemScale(plan, 'nightApproach'));
}

export function applyEnemyPlanPreparationCounter(plan: EnemyPlan | undefined, actionId: PreparationActionId): void {
  if (!plan) return;
  const ids = PREPARATION_COUNTERS[actionId] ?? [];
  for (const stratagem of plan.stratagems) {
    if (!ids.includes(stratagem.id)) continue;
    stratagem.counter = {
      ...stratagem.counter,
      preparation: Math.max(
        stratagem.counter?.preparation ?? 0,
        CONFIG.tacticalBattle.enemyPlan.counterStrength.preparation,
      ),
    };
    stratagem.counterLevel = enemyStratagemCounterStrength(stratagem) >= 1 ? 2 : 1;
  }
}

export function enemyPlanCounterLabelsForAction(
  plan: EnemyPlan | undefined,
  actionId: PreparationActionId,
): string[] {
  const ids = PREPARATION_COUNTERS[actionId] ?? [];
  return plan?.stratagems
    .filter(stratagem => stratagem.revealed && ids.includes(stratagem.id))
    .map(stratagem => STRATAGEM_DETAILS[stratagem.id].label) ?? [];
}

export function enemyPlanWarningLines(plan: EnemyPlan | undefined): string[] {
  if (!plan) return [];
  const intelLevel = plan.intelLevel ?? (plan.objectiveRevealed || plan.stratagems.some(stratagem => stratagem.revealed)
    ? 2
    : 0);
  if (intelLevel <= 0) return ['적의 접근 방식은 알 수 없습니다.'];
  const lines: string[] = [];
  if (intelLevel === 1) {
    return plan.objectiveRevealed
      ? [`확인된 적의 주된 목적: ${OBJECTIVE_DETAILS[plan.objective].label}`]
      : ['적의 움직임에서 뚜렷한 의도를 읽기 어렵습니다.'];
  }
  if (plan.compositionRevealed) {
    const composition = tacticalCompositionTemplate(plan.compositionTemplateId);
    lines.push(composition ? `적 편제는 ${composition.label}입니다.` : '적 편제의 윤곽이 확인되었습니다.');
  }
  if (plan.doctrineRevealed && plan.doctrine) {
    lines.push(`적은 ${DOCTRINE_DETAILS[plan.doctrine].label} 교리로 움직입니다.`);
  }
  const revealed = plan.stratagems.filter(stratagem => stratagem.revealed);
  lines.push(...revealed.map(stratagem => STRATAGEM_DETAILS[stratagem.id].warning));
  if (plan.stratagems.length > revealed.length) lines.push('아직 확인되지 않은 다른 움직임도 있습니다.');
  return lines.length > 0 ? lines : ['적의 대열에서 별도의 계책 징후는 보이지 않습니다.'];
}

export interface EnemyCompositionIntelGroupView {
  groupId: string;
  unitType?: import('./types').RaiderUnitType;
  label: string;
  category: string;
  count?: number;
  exact: boolean;
  support: boolean;
}

export interface EnemyCompositionIntelView {
  revealed: boolean;
  templateId?: string;
  templateLabel: string;
  groups: EnemyCompositionIntelGroupView[];
  hiddenGroupCount: number;
}

export function enemyCompositionIntelView(
  battle: Pick<TacticalBattle, 'enemyPlan' | 'raiderGroups'>,
): EnemyCompositionIntelView {
  const plan = battle.enemyPlan;
  const compositionRevealed = plan?.compositionRevealed === true;
  const template = tacticalCompositionTemplate(plan?.compositionTemplateId);
  const visibleGroups = battle.raiderGroups.filter(group => compositionRevealed || group.revealed);
  const groups = visibleGroups.map(group => {
    const profile = tacticalUnitProfileOrUndefined(group.unitType);
    const exact = compositionRevealed && group.revealed && profile != null;
    return {
      groupId: group.id,
      ...(exact && group.unitType ? { unitType: group.unitType } : {}),
      label: exact ? profile!.label : (profile?.intelCategory ?? '미확인 부대'),
      category: profile?.intelCategory ?? '미확인 부대',
      ...(exact ? { count: Math.max(0, group.count - group.killed) } : {}),
      exact,
      support: profile?.tags.includes('support') === true || profile?.tags.includes('artillery') === true,
    };
  });
  return {
    revealed: compositionRevealed,
    ...(compositionRevealed && template ? { templateId: template.id } : {}),
    templateLabel: compositionRevealed ? (template?.label ?? '확인된 혼성 편제') : '미확인 편제',
    groups,
    hiddenGroupCount: Math.max(0, battle.raiderGroups.length - visibleGroups.length),
  };
}

export interface EnemyPlanSummaryView {
  objective: { revealed: boolean; id?: EnemyObjectiveId; label: string };
  doctrine: {
    revealed: boolean;
    id?: EnemyDoctrineId;
    label: string;
    strength?: string;
    weakness?: string;
    counter?: string;
  };
  composition: EnemyCompositionIntelView;
  intentSignals: EnemyDoctrineIntentView;
  revealedStratagems: ReturnType<typeof enemyStratagemDefinition>[];
  hiddenStratagemCount: number;
}

export interface EnemyDoctrineIntentGroupView {
  groupId: string;
  label: string;
  state: import('./types').TacticalAiState;
  intent: TacticalBattle['raiderGroups'][number]['intent'];
  signal: string;
}

export interface EnemyDoctrineIntentView {
  doctrineRevealed: boolean;
  doctrineId?: EnemyDoctrineId;
  doctrineLabel: string;
  groups: EnemyDoctrineIntentGroupView[];
}

export function enemyDoctrineIntentView(
  battle: Pick<TacticalBattle, 'enemyPlan' | 'raiderGroups'>,
): EnemyDoctrineIntentView {
  const doctrineRevealed = battle.enemyPlan?.doctrineRevealed === true && battle.enemyPlan.doctrine != null;
  const groups = battle.raiderGroups.filter(group => group.revealed).map(group => {
    const state = group.aiState ?? 'engaging';
    const intent = group.intent ?? 'advance';
    return {
      groupId: group.id,
      label: group.label,
      state,
      intent,
      signal: tacticalDoctrineStateSignal(state, intent),
    };
  });
  return {
    doctrineRevealed,
    ...(doctrineRevealed ? { doctrineId: battle.enemyPlan!.doctrine } : {}),
    doctrineLabel: doctrineRevealed
      ? DOCTRINE_DETAILS[battle.enemyPlan!.doctrine!].label
      : '미확인 교리',
    groups,
  };
}

export function enemyPlanSummaryView(
  battle: Pick<TacticalBattle, 'enemyPlan' | 'raiderGroups'>,
): EnemyPlanSummaryView {
  const plan = battle.enemyPlan;
  const objectiveRevealed = plan?.objectiveRevealed === true;
  const doctrineRevealed = plan?.doctrineRevealed === true && plan.doctrine != null;
  const doctrine = doctrineRevealed ? enemyDoctrineDefinition(plan!.doctrine!) : undefined;
  const revealedStratagems = plan?.stratagems
    .filter(stratagem => stratagem.revealed)
    .map(stratagem => enemyStratagemDefinition(stratagem.id)) ?? [];
  return {
    objective: {
      revealed: objectiveRevealed,
      ...(objectiveRevealed && plan ? { id: plan.objective } : {}),
      label: objectiveRevealed && plan ? OBJECTIVE_DETAILS[plan.objective].label : '미확인',
    },
    doctrine: {
      revealed: doctrineRevealed,
      ...(doctrine ? {
        id: doctrine.id,
        label: doctrine.label,
        strength: doctrine.strength,
        weakness: doctrine.weakness,
        counter: doctrine.counter,
      } : { label: '미확인' }),
    },
    composition: enemyCompositionIntelView(battle),
    intentSignals: enemyDoctrineIntentView(battle),
    revealedStratagems,
    hiddenStratagemCount: Math.max(0, (plan?.stratagems.length ?? 0) - revealedStratagems.length),
  };
}

export function enemyIntelLevel(input: {
  watchtowers: number;
  watchmen: number;
  hunters: number;
}): 0 | 1 | 2 | 3 | 4 {
  const score = Number(input.watchtowers > 0) + Number(input.watchmen >= 2) +
    Number(input.hunters >= 2) + Number(input.watchtowers > 0 && input.hunters > 0);
  return clamp(score, 0, 4) as 0 | 1 | 2 | 3 | 4;
}

export interface InitialEnemyPlanReveals {
  objective: boolean;
  composition: boolean;
  doctrine: boolean;
  stratagemCount: number;
}

export function initialEnemyPlanReveals(level: number): InitialEnemyPlanReveals {
  const intelLevel = clamp(Math.floor(level), 0, 4);
  return {
    objective: intelLevel >= 1,
    composition: intelLevel >= 2,
    doctrine: intelLevel >= 3,
    stratagemCount: intelLevel >= 4 ? 1 : 0,
  };
}

function applyEnemyPlanIntel(plan: EnemyPlan, level: number, roll: number): EnemyPlan {
  const intelLevel = clamp(Math.floor(level), 0, 4);
  const reveals = initialEnemyPlanReveals(intelLevel);
  plan.intelLevel = intelLevel as 0 | 1 | 2 | 3 | 4;
  plan.objectiveRevealed = reveals.objective;
  plan.compositionRevealed = reveals.composition;
  plan.doctrineRevealed = reveals.doctrine;
  plan.stratagems.forEach(stratagem => { stratagem.revealed = false; });
  if (reveals.stratagemCount > 0 && plan.stratagems.length > 0) {
    const counterIndex = Math.floor(clamp(roll, 0, 0.999999999) * plan.stratagems.length);
    plan.stratagems[counterIndex].revealed = true;
    plan.stratagems[counterIndex].counter = {
      ...plan.stratagems[counterIndex].counter,
      intelligence: CONFIG.tacticalBattle.enemyPlan.counterStrength.intelFull,
    };
    plan.stratagems[counterIndex].counterLevel = 2;
  }
  return plan;
}

export function enemyStratagemPoints(factionName: string, power: number, relation: number): number {
  const config = CONFIG.tacticalBattle.enemyPlan.stratagemPoints;
  const key = factionKey(factionName);
  const base = config.factionBase[key];
  const powerBonus = Math.min(config.maxPowerBonus, Math.floor(Math.max(0, power) / config.powerPerPoint));
  const relationDrop = CONFIG.tacticalBattle.enemyPlan.objectiveActivationRelation[key] - relation;
  const hostilityBonus = relationDrop >= config.grudgeBonusAt ? 2
    : relationDrop >= config.hostilityBonusAt ? 1 : 0;
  return clamp(base + powerBonus + hostilityBonus, 2, config.max);
}

function rotatedCandidates(objective: EnemyObjectiveId, roll: number): EnemyStratagemId[] {
  const configured = CONFIG.tacticalBattle.enemyPlan.objectiveCandidates[objective] as readonly EnemyStratagemId[];
  const offset = Math.floor(clamp(roll, 0, 0.999999999) * configured.length);
  return [...configured.slice(offset), ...configured.slice(0, offset)];
}

function purchaseStratagems(
  objective: EnemyObjectiveId,
  points: number,
  wantsRearManeuver: boolean,
  roll: number,
  revealed: boolean,
): EnemyStratagemState[] {
  const selected: EnemyStratagemState[] = [];
  let remaining = points;
  const candidates = wantsRearManeuver
    ? ['rearManeuver' as const, ...rotatedCandidates(objective, roll)]
    : rotatedCandidates(objective, roll);
  for (const id of candidates) {
    if (selected.length >= CONFIG.tacticalBattle.enemyPlan.maxStratagems) break;
    if (selected.some(entry => entry.id === id)) continue;
    const cost = enemyStratagemCost(id);
    if (cost > remaining) continue;
    selected.push({ id, revealed, counterLevel: 0 });
    remaining -= cost;
  }
  return selected;
}

function planFromLegacyFlank({ flankPlan = 'breakthrough', revealed = false }: LegacyFlankPlan = {}): EnemyPlan {
  return {
    objective: 'breakthrough',
    objectiveRevealed: revealed === true,
    stratagemPoints: 0,
    stratagems: flankPlan === 'rearAssault'
      ? [{ id: 'rearManeuver', revealed: revealed === true, counterLevel: 0 }]
      : [],
  };
}

function lockEnemyFlankRoute(
  plan: EnemyPlan,
  forcedRoute: TacticalRouteSide | 'none' | undefined,
  roll: number,
  revealed: boolean,
): void {
  if (forcedRoute === 'none') {
    plan.stratagems = plan.stratagems.filter(stratagem => stratagem.id !== 'rearManeuver');
    plan.flankRouteSide = undefined;
    return;
  }
  if (forcedRoute && !plan.stratagems.some(stratagem => stratagem.id === 'rearManeuver')) {
    plan.stratagems.unshift({ id: 'rearManeuver', revealed, counterLevel: 0 });
    plan.stratagems = plan.stratagems.slice(0, CONFIG.tacticalBattle.enemyPlan.maxStratagems);
  }
  plan.flankRouteSide = plan.stratagems.some(stratagem => stratagem.id === 'rearManeuver')
    ? forcedRoute ?? (clamp(roll, 0, 0.999999999) < 0.5 ? 'left' : 'right')
    : undefined;
}

function lockEnemyPlanOverrides(
  plan: EnemyPlan,
  forcedStratagem: EnemyStratagemId | 'none' | undefined,
  forcedRoute: TacticalRouteSide | 'none' | undefined,
  roll: number,
  revealed: boolean,
): void {
  if (forcedStratagem === 'none') {
    plan.stratagems = [];
    plan.flankRouteSide = undefined;
    return;
  }
  if (forcedStratagem) {
    const forcedState: EnemyStratagemState = { id: forcedStratagem, revealed, counterLevel: 0 };
    plan.stratagems = [
      forcedState,
      ...plan.stratagems.filter(stratagem => stratagem.id !== forcedStratagem),
    ].slice(0, CONFIG.tacticalBattle.enemyPlan.maxStratagems);
  }
  lockEnemyFlankRoute(plan, forcedRoute, roll, revealed);
}

export function createEnemyPlan(input: EnemyPlanCreationInput): EnemyPlan {
  const power = Math.max(0, input.power ?? 0);
  const relation = clamp(input.relation ?? 50, 0, 100);
  const legacyFlankPlan = input.flankRoll < rearManeuverChance(input.factionName)
    ? 'rearAssault'
    : 'breakthrough';
  const maximumPhase = input.maximumCompositionPhase ?? 1;
  const eligibleDoctrines = eligibleEnemyDoctrines(input.factionName, maximumPhase);
  const forcedTemplate = tacticalCompositionTemplate(input.forcedCompositionTemplateId);
  const forcedTemplateDoctrine = forcedTemplate?.faction === tacticalEnemyFactionId(input.factionName)
    ? forcedTemplate.doctrines.find(candidate => eligibleDoctrines.includes(candidate))
    : undefined;
  let doctrine = input.forcedDoctrine && eligibleDoctrines.includes(input.forcedDoctrine)
    ? input.forcedDoctrine
    : forcedTemplateDoctrine ??
      chooseEnemyDoctrine(input.factionName, input.doctrineRoll ?? input.stratagemRoll ?? 0, maximumPhase);
  const chooseComposition = (objective: EnemyObjectiveId) => {
    const selectionInput = (candidateDoctrine: EnemyDoctrineId) => ({
      faction: tacticalEnemyFactionId(input.factionName), doctrine: candidateDoctrine, objective, power,
      roll: input.compositionRoll ?? input.objectiveRoll ?? 0, maximumPhase,
      forcedTemplateId: input.forcedCompositionTemplateId,
      requiresFlankers: input.forcedFlankRoute === 'left' || input.forcedFlankRoute === 'right',
    });
    let composition = chooseTacticalCompositionTemplate(selectionInput(doctrine));
    if (composition || input.forcedDoctrine || input.forcedCompositionTemplateId) return composition;
    const start = Math.max(0, eligibleDoctrines.indexOf(doctrine));
    for (let offset = 1; offset < eligibleDoctrines.length; offset += 1) {
      const fallbackDoctrine = eligibleDoctrines[(start + offset) % eligibleDoctrines.length];
      composition = chooseTacticalCompositionTemplate(selectionInput(fallbackDoctrine));
      if (!composition) continue;
      doctrine = fallbackDoctrine;
      return composition;
    }
    return undefined;
  };
  if (relation >= CONFIG.tacticalBattle.enemyPlan.objectiveActivationRelation[factionKey(input.factionName)]) {
    const plan = planFromLegacyFlank({ flankPlan: legacyFlankPlan, revealed: input.revealed });
    const composition = chooseComposition(plan.objective);
    plan.doctrine = doctrine;
    plan.doctrineRevealed = input.revealed;
    plan.compositionTemplateId = composition?.id;
    plan.compositionRevealed = input.revealed;
    if (composition && !composition.slots.some(slot => slot.role === 'flankers')) {
      plan.stratagems = plan.stratagems.filter(stratagem => stratagem.id !== 'rearManeuver');
    }
    lockEnemyPlanOverrides(
      plan,
      input.forcedStratagem,
      input.forcedFlankRoute,
      input.compositionRoll ?? input.flankRoll,
      input.revealed,
    );
    return input.intelLevel == null ? plan : applyEnemyPlanIntel(plan, input.intelLevel, input.intelRoll ?? 0);
  }
  const objective = chooseEnemyObjective(
    input.factionName,
    power,
    relation,
    input.objectiveRoll ?? 0,
  );
  const stratagemPoints = enemyStratagemPoints(input.factionName, power, relation);
  const composition = chooseComposition(objective);
  const plan: EnemyPlan = {
    objective,
    objectiveRevealed: input.revealed,
    doctrine,
    doctrineRevealed: input.revealed,
    compositionTemplateId: composition?.id,
    compositionRevealed: input.revealed,
    stratagemPoints,
    stratagems: purchaseStratagems(
      objective,
      stratagemPoints,
      legacyFlankPlan === 'rearAssault' &&
        (!composition || composition.slots.some(slot => slot.role === 'flankers')),
      input.stratagemRoll ?? 0,
      input.revealed,
    ),
  };
  lockEnemyPlanOverrides(
    plan,
    input.forcedStratagem,
    input.forcedFlankRoute,
    input.compositionRoll ?? input.flankRoll,
    input.revealed,
  );
  return input.intelLevel == null ? plan : applyEnemyPlanIntel(plan, input.intelLevel, input.intelRoll ?? 0);
}

export function flankPlanFromEnemyPlan(plan: EnemyPlan): TacticalFlankPlan {
  return plan.stratagems.some(stratagem => stratagem.id === 'rearManeuver')
    ? 'rearAssault'
    : 'breakthrough';
}

export function flankPlanRevealedFromEnemyPlan(plan: EnemyPlan): boolean {
  const rearManeuver = plan.stratagems.find(stratagem => stratagem.id === 'rearManeuver');
  return rearManeuver ? rearManeuver.revealed : plan.objectiveRevealed;
}

export function migrateEnemyPlan(raw: unknown, legacy: LegacyFlankPlan = {}): EnemyPlan {
  if (!raw || typeof raw !== 'object') return planFromLegacyFlank(legacy);
  const source = raw as Record<string, unknown>;
  if (!Array.isArray(source.stratagems)) return planFromLegacyFlank(legacy);

  const stratagems: EnemyStratagemState[] = [];
  for (const rawStratagem of source.stratagems) {
    if (stratagems.length >= CONFIG.tacticalBattle.enemyPlan.maxStratagems) break;
    if (!rawStratagem || typeof rawStratagem !== 'object') continue;
    const stratagem = rawStratagem as Record<string, unknown>;
    if (!STRATAGEMS.includes(stratagem.id as EnemyStratagemId) ||
        stratagems.some(entry => entry.id === stratagem.id)) continue;
    stratagems.push({
      id: stratagem.id as EnemyStratagemId,
      revealed: typeof stratagem.revealed === 'boolean' ? stratagem.revealed : false,
      counterLevel: stratagem.counterLevel === 1 || stratagem.counterLevel === 2 ? stratagem.counterLevel : 0,
      ...(() => {
        if (!stratagem.counter || typeof stratagem.counter !== 'object') return {};
        const sourceCounter = stratagem.counter as Record<string, unknown>;
        const counter: Partial<EnemyCounterBreakdown> = {};
        if (Number.isFinite(sourceCounter.intelligence)) counter.intelligence = clamp(Number(sourceCounter.intelligence), 0, 1);
        if (Number.isFinite(sourceCounter.preparation)) counter.preparation = clamp(Number(sourceCounter.preparation), 0, 1);
        if (Number.isFinite(sourceCounter.formation)) counter.formation = clamp(Number(sourceCounter.formation), 0, 1);
        return Object.keys(counter).length > 0 ? { counter } : {};
      })(),
    });
  }

  if (source.stratagems.length > 0 && stratagems.length === 0) return planFromLegacyFlank(legacy);
  const doctrine = ENEMY_DOCTRINES.includes(source.doctrine as EnemyDoctrineId)
    ? source.doctrine as EnemyDoctrineId
    : undefined;
  const composition = typeof source.compositionTemplateId === 'string'
    ? tacticalCompositionTemplate(source.compositionTemplateId)
    : undefined;
  const flankRouteSide = source.flankRouteSide === 'left' || source.flankRouteSide === 'right'
    ? source.flankRouteSide
    : undefined;
  return {
    objective: OBJECTIVES.includes(source.objective as EnemyObjectiveId)
      ? source.objective as EnemyObjectiveId
      : 'breakthrough',
    objectiveRevealed: typeof source.objectiveRevealed === 'boolean' ? source.objectiveRevealed : false,
    stratagemPoints: Number.isFinite(source.stratagemPoints) && Number(source.stratagemPoints) >= 0
      ? Math.floor(Number(source.stratagemPoints))
      : 0,
    ...(Number.isFinite(source.intelLevel) ? {
      intelLevel: clamp(Math.floor(Number(source.intelLevel)), 0, 4) as 0 | 1 | 2 | 3 | 4,
    } : {}),
    ...(doctrine ? {
      doctrine,
      doctrineRevealed: source.doctrineRevealed === true,
    } : {}),
    ...(composition ? {
      compositionTemplateId: composition.id,
      compositionRevealed: source.compositionRevealed === true,
    } : {}),
    ...(flankRouteSide && stratagems.some(stratagem => stratagem.id === 'rearManeuver')
      ? { flankRouteSide }
      : {}),
    stratagems,
  };
}
