import { CONFIG } from './config';
import type {
  EnemyObjectiveId, EnemyPlan, EnemyStratagemId, EnemyStratagemState, TacticalFlankPlan,
} from './types';

type EnemyPlanCreationInput = {
  factionName: string;
  power?: number;
  relation?: number;
  objectiveRoll?: number;
  flankRoll: number;
  stratagemRoll?: number;
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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
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
  const objective = chooseEnemyObjective(
    input.factionName,
    power,
    relation,
    input.objectiveRoll ?? 0,
  );
  const stratagemPoints = enemyStratagemPoints(input.factionName, power, relation);
  return {
    objective,
    objectiveRevealed: input.revealed,
    stratagemPoints,
    stratagems: purchaseStratagems(
      objective,
      stratagemPoints,
      input.flankRoll < rearManeuverChance(input.factionName),
      input.stratagemRoll ?? 0,
      input.revealed,
    ),
  };
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
