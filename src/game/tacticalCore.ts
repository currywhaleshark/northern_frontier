import { RESOURCE_IDS } from './resourceCatalog';
import { getDayOfSeason, getSeason, getYear } from './seasons';
import { tacticalGroupCapabilities } from './combatCapabilities';
import { enemyObjectiveProfile } from './enemyPlan';
import type {
  EnemyObjectiveId, GameState, ResourceId, TacticalBattle, TacticalBattlePersonReport, TacticalBattleReport,
  TacticalBattleGrade, TacticalDefenderGroup, TacticalRaiderGroup, TacticalRoundReport,
} from './types';

type TacticalOutcome = NonNullable<TacticalRoundReport['outcome']>;

export interface TacticalShotCounts {
  arrows?: number;
  muskets?: number;
  cannons?: number;
}

export function tacticalDefenderShotCounts(groups: TacticalDefenderGroup[]): TacticalShotCounts {
  let arrows = 0;
  let muskets = 0;
  for (const group of groups) {
    const active = Math.max(0, group.count - (group.wounded ?? 0) - group.killed);
    if (active <= 0 || !tacticalGroupCapabilities(group).has('volley')) continue;
    if (group.weapon === 'musket') muskets += Math.min(active, group.readyMuskets ?? 0);
    else arrows += active;
  }
  return { ...(arrows > 0 ? { arrows } : {}), ...(muskets > 0 ? { muskets } : {}) };
}

export function tacticalRaiderShotCounts(groups: TacticalRaiderGroup[]): TacticalShotCounts {
  let arrows = 0;
  let muskets = 0;
  let cannons = 0;
  for (const group of groups) {
    const active = Math.max(0, group.count - group.killed);
    if (group.unitType === 'court-gunner') muskets += active;
    else if (group.unitType === 'court-artillery') cannons += active;
    else if (group.unitType === 'nimacha-hunter' || group.unitType === 'holaon-horse-archer' ||
      group.unitType === 'bandit-rider' || group.unitType === 'court-archer') arrows += active;
  }
  return {
    ...(arrows > 0 ? { arrows } : {}),
    ...(muskets > 0 ? { muskets } : {}),
    ...(cannons > 0 ? { cannons } : {}),
  };
}

export const TACTICAL_BATTLE_GRADE_LABELS: Record<TacticalBattleGrade, string> = {
  greatVictory: '대승',
  victory: '승리',
  narrowVictory: '아쉬운 승리',
  narrowDefeat: '아쉬운 패배',
  defeat: '패배',
  crushingDefeat: '대패',
};

interface TacticalGradeInput {
  encounterKind: TacticalBattleReport['encounterKind'];
  result: TacticalBattleReport['result'];
  friendlyPower: number;
  enemyPower: number;
  defendersCommitted: number;
  defendersKilled: number;
  defendersWounded: number;
  enemiesCommitted: number;
  enemiesKilled: number;
  loot: Partial<Record<ResourceId, number>>;
}

const TACTICAL_LOOT_WEIGHTS: Partial<Record<ResourceId, number>> = {
  grain: 1,
  rice: 1,
  meat: 1,
  firewood: 0.5,
  hide: 1.5,
  tools: 3,
  gunpowder: 2,
  spears: 4,
  hornBows: 5,
  muskets: 8,
  preciousMetal: 6,
};

function bounded(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function tacticalLootValue(loot: Partial<Record<ResourceId, number>>): number {
  return Object.entries(loot).reduce((sum, [resource, amount]) =>
    sum + Math.max(0, amount ?? 0) * (TACTICAL_LOOT_WEIGHTS[resource as ResourceId] ?? 1), 0);
}

export function gradeTacticalBattle(input: TacticalGradeInput): { grade: TacticalBattleGrade; score: number } {
  const friendlyPower = Math.max(1, input.friendlyPower);
  const enemyPower = Math.max(1, input.enemyPower);
  const powerChallenge = bounded((enemyPower / friendlyPower - 1) * 30, -20, 30);
  const enemyLossRate = bounded(input.enemiesKilled / Math.max(1, input.enemiesCommitted), 0, 1);
  const friendlyDeathRate = bounded(input.defendersKilled / Math.max(1, input.defendersCommitted), 0, 1);
  const friendlyWoundRate = bounded(input.defendersWounded / Math.max(1, input.defendersCommitted), 0, 1);
  const lootValue = tacticalLootValue(input.loot);
  const materialScore = input.encounterKind === 'raidDefense'
    ? -Math.min(24, lootValue * 1.25)
    : Math.min(15, lootValue * 0.75);
  const score = Math.round((
    50 + powerChallenge + enemyLossRate * 35 - friendlyDeathRate * 45 - friendlyWoundRate * 20 + materialScore
  ) * 10) / 10;
  const grade: TacticalBattleGrade = input.result === 'victory'
    ? score >= 72 ? 'greatVictory' : score >= 40 ? 'victory' : 'narrowVictory'
    : score >= 62 ? 'narrowDefeat' : score >= 28 ? 'defeat' : 'crushingDefeat';
  return { grade, score };
}

export function tacticalOutcomeResult(outcome: TacticalOutcome): TacticalBattleReport['result'] {
  return outcome === 'defenseSuccess' ||
    outcome === 'assaultVictory' || outcome === 'assaultRaid' || outcome === 'assaultAbandoned' ||
    outcome === 'huntKill' || outcome === 'huntRepelled'
    ? 'victory'
    : 'defeat';
}

interface RaidDefenseObjectiveInput {
  factionName: string;
  outcome: TacticalOutcome;
  objective?: EnemyObjectiveId;
  objectiveAchieved?: boolean;
  buildingsDamaged?: number;
  enemyRouted: boolean;
  looted: boolean;
  defendersCommitted: number;
  defendersKilled: number;
  defendersWounded: number;
}

export function raidDefenseObjectiveAchieved(
  objective: EnemyObjectiveId,
  outcome: TacticalOutcome,
  buildingsDamaged = 0,
): boolean {
  if (objective === 'breakthrough') return outcome === 'villageRouted';
  if (objective === 'plunder') return outcome === 'raidersLooted';
  return buildingsDamaged >= enemyObjectiveProfile(objective).damageToExit;
}

export function raidDefenseObjectiveResult(
  input: RaidDefenseObjectiveInput,
): { result: TacticalBattleReport['result']; forcedGrade?: TacticalBattleGrade } {
  if (!input.objective) {
    if (input.factionName === '조정 토벌군') return { result: tacticalOutcomeResult(input.outcome) };
    if (input.outcome === 'villageRouted') return { result: 'defeat' };
    const committed = Math.max(1, input.defendersCommitted);
    const deathRate = input.defendersKilled / committed;
    const casualtyRate = (input.defendersKilled + input.defendersWounded) / committed;
    if (!input.looted) {
      if (deathRate >= 0.35 || casualtyRate >= 0.65) {
        return { result: 'defeat', forcedGrade: 'narrowDefeat' };
      }
      return { result: 'victory' };
    }
    if (input.enemyRouted) return { result: 'victory' };
    return { result: 'defeat' };
  }

  if (input.enemyRouted) return { result: 'victory' };
  if (input.outcome === 'villageRouted') return { result: 'defeat' };
  const objectiveAchieved = input.objectiveAchieved ?? raidDefenseObjectiveAchieved(
    input.objective,
    input.outcome,
    input.buildingsDamaged,
  );
  if (objectiveAchieved) return { result: 'defeat' };
  const committed = Math.max(1, input.defendersCommitted);
  const deathRate = input.defendersKilled / committed;
  const casualtyRate = (input.defendersKilled + input.defendersWounded) / committed;
  if (deathRate >= 0.35 || casualtyRate >= 0.65) {
    return { result: 'defeat', forcedGrade: 'narrowDefeat' };
  }
  return { result: 'victory' };
}

export function tacticalClosingSummary(
  encounterKind: TacticalBattleReport['encounterKind'],
  outcome: TacticalOutcome,
  factionName: string,
  details: {
    looted?: boolean;
    enemyRouted?: boolean;
    objective?: EnemyObjectiveId;
    objectiveAchieved?: boolean;
    result?: TacticalBattleReport['result'];
  } = {},
): string {
  if (encounterKind === 'raidDefense') {
    if (details.enemyRouted) return factionName === '조정 토벌군'
      ? '토벌대의 기세가 꺾여 대열이 무너지고 도주합니다.'
      : '적의 기세가 꺾여 대열이 무너지고 도주합니다.';
    if (details.objective) {
      if (outcome === 'villageRouted') return '습격대가 마을 방어선을 무너뜨렸습니다.';
      if (details.result === 'victory') {
        if (details.objective === 'breakthrough') return '습격대의 돌파를 저지해 마을 방어선을 지켰습니다.';
        if (details.objective === 'plunder') return '습격대의 비축 약탈 목표를 좌절시켰습니다.';
        return '습격대의 방책·창고 방화 목표를 좌절시켰습니다.';
      }
      if (!details.objectiveAchieved) return '적의 작전 목표는 막았지만 수비대 피해가 극심합니다.';
      if (details.objective === 'plunder') return '습격대가 목표한 비축을 챙겨 물러납니다.';
      if (details.objective === 'arson') return '습격대가 방책과 창고에 목표한 피해를 남기고 물러납니다.';
      return '습격대가 마을 방어선을 돌파했습니다.';
    }
    if (factionName === '조정 토벌군') return '토벌대가 공격을 마치고 물러납니다.';
    return details.looted
      ? '습격대가 약탈을 마치고 물러납니다.'
      : '습격대가 약탈을 포기하고 물러납니다.';
  }
  if (encounterKind === 'banditLair') {
    if (outcome === 'assaultVictory') return '원정대가 산채를 완전히 제압했습니다.';
    if (outcome === 'assaultAbandoned') return '잔당이 산채를 버리고 물러났습니다.';
    if (outcome === 'assaultRaid') return '원정대가 노획을 마치고 철수합니다.';
    if (outcome === 'assaultWithdrawal') return '원정대가 공격을 중지하고 철수합니다.';
    return '원정대가 패퇴해 산채에서 물러납니다.';
  }
  if (outcome === 'huntKill') return '사냥대가 맹수를 사살해 위협을 끝냈습니다.';
  if (outcome === 'huntRepelled') return '사냥대가 맹수 무리를 영역 밖으로 몰아냈습니다.';
  if (outcome === 'huntEscaped') return '맹수가 포위망을 벗어나 물러났습니다.';
  return '사냥대가 패퇴해 부상자를 데리고 철수합니다.';
}

export function tacticalDateLabel(state: GameState): string {
  const season = getSeason(state.day);
  const seasonLabel = season === 'spring' ? '봄' : season === 'summer' ? '여름' : season === 'autumn' ? '가을' : '겨울';
  return `${getYear(state.day)}년차 ${seasonLabel} ${getDayOfSeason(state.day)}일`;
}

export function captureTacticalResources(state: GameState): Partial<Record<ResourceId, number>> {
  return Object.fromEntries(RESOURCE_IDS.map(id => [id, state.resources[id]])) as Partial<Record<ResourceId, number>>;
}

export function tacticalResourceDelta(
  state: GameState,
  battle: Pick<TacticalBattle, 'resourceSnapshot'>,
): Partial<Record<ResourceId, number>> {
  const before = battle.resourceSnapshot ?? {};
  const delta: Partial<Record<ResourceId, number>> = {};
  for (const id of RESOURCE_IDS) {
    if (id === 'defense' || id === 'reputation') continue;
    const change = (state.resources[id] ?? 0) - (before[id] ?? state.resources[id] ?? 0);
    if (Math.abs(change) > 1e-9) delta[id] = change;
  }
  return delta;
}

export function tacticalPeopleReport(
  state: GameState,
  battle: Pick<TacticalBattle, 'defenderGroups'>,
  beforeHealth: ReadonlyMap<number, number>,
): { committed: number; survived: number; killed: TacticalBattlePersonReport[]; wounded: TacticalBattlePersonReport[] } {
  const groupByResident = new Map<number, string>();
  for (const group of battle.defenderGroups) {
    for (const residentId of group.residentIds) groupByResident.set(residentId, group.label);
  }
  const residents = state.residents.filter(resident => groupByResident.has(resident.id));
  const person = (resident: GameState['residents'][number]): TacticalBattlePersonReport => ({
    residentId: resident.id,
    name: resident.name,
    groupLabel: groupByResident.get(resident.id) ?? '전투대',
    healthAfter: Math.round(resident.health),
  });
  return {
    committed: residents.length,
    survived: residents.filter(resident => resident.alive).length,
    killed: residents.filter(resident => !resident.alive).map(person),
    wounded: residents.filter(resident => {
      const healthBefore = beforeHealth.get(resident.id);
      return resident.alive && healthBefore != null && resident.health < healthBefore;
    }).map(person),
  };
}
