import type { EnemyPlan, EnemyStratagemState, TacticalFlankPlan } from './types';

type EnemyPlanCreationInput = {
  factionName: string;
  flankRoll: number;
  revealed: boolean;
};

type LegacyFlankPlan = {
  flankPlan?: TacticalFlankPlan;
  revealed?: boolean;
};

function rearManeuverChance(factionName: string): number {
  if (factionName === '홀라온 야인' || factionName === '변경 마적' || factionName === '조정 토벌군') return 0.6;
  if (factionName === '니마차 우디캐') return 0.3;
  return 0.5;
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
  return planFromLegacyFlank({
    flankPlan: input.flankRoll < rearManeuverChance(input.factionName) ? 'rearAssault' : 'breakthrough',
    revealed: input.revealed,
  });
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
    if (!rawStratagem || typeof rawStratagem !== 'object') continue;
    const stratagem = rawStratagem as Record<string, unknown>;
    if (stratagem.id !== 'rearManeuver' || stratagems.some(entry => entry.id === 'rearManeuver')) continue;
    stratagems.push({
      id: 'rearManeuver',
      revealed: typeof stratagem.revealed === 'boolean' ? stratagem.revealed : false,
      counterLevel: stratagem.counterLevel === 1 || stratagem.counterLevel === 2 ? stratagem.counterLevel : 0,
    });
  }

  if (source.stratagems.length > 0 && stratagems.length === 0) return planFromLegacyFlank(legacy);
  return {
    objective: source.objective === 'breakthrough' ? source.objective : 'breakthrough',
    objectiveRevealed: typeof source.objectiveRevealed === 'boolean' ? source.objectiveRevealed : false,
    stratagemPoints: Number.isFinite(source.stratagemPoints) && Number(source.stratagemPoints) >= 0
      ? Math.floor(Number(source.stratagemPoints))
      : 0,
    stratagems,
  };
}
