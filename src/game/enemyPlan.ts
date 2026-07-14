import { CONFIG } from './config';
import type {
  BanditLairDefensePlan, BanditLairDoctrineId, EnemyObjectiveId, EnemyPlan, EnemyStratagemId,
  EnemyStratagemState, ForeignSite, PreparationActionId, TacticalFlankPlan,
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

function factionKey(factionName: string): 'nimacha' | 'holaon' | 'bandit' | 'court' | 'default' {
  if (factionName === '니마차 우디캐') return 'nimacha';
  if (factionName === '홀라온 야인') return 'holaon';
  if (factionName === '변경 마적') return 'bandit';
  if (factionName === '조정 토벌군') return 'court';
  return 'default';
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

export function enemyStratagemEffectScale(stratagem: Pick<EnemyStratagemState, 'counterLevel'>): number {
  if (stratagem.counterLevel === 2) return 0;
  return stratagem.counterLevel === 1 ? CONFIG.tacticalBattle.enemyPlan.counteredEffectScale : 1;
}

export function enemyPlanStratagemScale(plan: EnemyPlan | undefined, id: EnemyStratagemId): number {
  const stratagem = plan?.stratagems.find(candidate => candidate.id === id);
  return stratagem ? enemyStratagemEffectScale(stratagem) : 0;
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
    if (ids.includes(stratagem.id) && stratagem.counterLevel < 1) stratagem.counterLevel = 1;
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
  return plan?.stratagems.map(stratagem => STRATAGEM_DETAILS[stratagem.id].warning) ?? [];
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

function applyEnemyPlanIntel(plan: EnemyPlan, level: number, roll: number): EnemyPlan {
  const intelLevel = clamp(Math.floor(level), 0, 4);
  plan.objectiveRevealed = false;
  plan.stratagems.forEach(stratagem => { stratagem.revealed = false; });
  if (intelLevel <= 1) return plan;
  if (intelLevel === 2) {
    const options = ['objective', ...plan.stratagems.map((_stratagem, index) => index)] as Array<'objective' | number>;
    const selected = options[Math.floor(clamp(roll, 0, 0.999999999) * options.length)];
    if (selected === 'objective') plan.objectiveRevealed = true;
    else if (selected != null) plan.stratagems[selected].revealed = true;
    return plan;
  }
  plan.objectiveRevealed = true;
  const revealCount = intelLevel === 3
    ? Math.max(1, Math.ceil(plan.stratagems.length * 0.67))
    : plan.stratagems.length;
  plan.stratagems.slice(0, revealCount).forEach(stratagem => { stratagem.revealed = true; });
  if (intelLevel === 4 && plan.stratagems.length > 0) {
    const counterIndex = Math.floor(clamp(roll, 0, 0.999999999) * plan.stratagems.length);
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

export function createEnemyPlan(input: EnemyPlanCreationInput): EnemyPlan {
  const power = Math.max(0, input.power ?? 0);
  const relation = clamp(input.relation ?? 50, 0, 100);
  const legacyFlankPlan = input.flankRoll < rearManeuverChance(input.factionName)
    ? 'rearAssault'
    : 'breakthrough';
  if (relation >= CONFIG.tacticalBattle.enemyPlan.objectiveActivationRelation[factionKey(input.factionName)]) {
    const plan = planFromLegacyFlank({ flankPlan: legacyFlankPlan, revealed: input.revealed });
    return input.intelLevel == null ? plan : applyEnemyPlanIntel(plan, input.intelLevel, input.intelRoll ?? 0);
  }
  const objective = chooseEnemyObjective(
    input.factionName,
    power,
    relation,
    input.objectiveRoll ?? 0,
  );
  const stratagemPoints = enemyStratagemPoints(input.factionName, power, relation);
  const plan: EnemyPlan = {
    objective,
    objectiveRevealed: input.revealed,
    stratagemPoints,
    stratagems: purchaseStratagems(
      objective,
      stratagemPoints,
      legacyFlankPlan === 'rearAssault',
      input.stratagemRoll ?? 0,
      input.revealed,
    ),
  };
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
    });
  }

  if (source.stratagems.length > 0 && stratagems.length === 0) return planFromLegacyFlank(legacy);
  return {
    objective: OBJECTIVES.includes(source.objective as EnemyObjectiveId)
      ? source.objective as EnemyObjectiveId
      : 'breakthrough',
    objectiveRevealed: typeof source.objectiveRevealed === 'boolean' ? source.objectiveRevealed : false,
    stratagemPoints: Number.isFinite(source.stratagemPoints) && Number(source.stratagemPoints) >= 0
      ? Math.floor(Number(source.stratagemPoints))
      : 0,
    stratagems,
  };
}
