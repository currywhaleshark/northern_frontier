// 민심 — 티어가 오를수록 채워야 할 기대 항목이 늘어나는 성분 기반 만족도.
// 개척 초기엔 배부름과 온기면 충분하지만, 고을이 커지면 옷·밥상의 격·글공부·제사까지 바란다.
// 조정 탭의 의심 내역과 같은 문법으로 내역(MoraleFactor[])을 노출한다.
// 계획: docs/superpowers/plans/2026-07-17-satisfaction-religion.md
import { countBuilt } from './buildings';
import { CONFIG } from './config';
import { rankAtLeast } from './constants';
import { luxuryStockTotal } from './consumption';
import { edictMoraleFactors } from './edicts';
import { assignedWorkers } from './workerSlots';
import type { GameState, MoraleFactor, Rank, Resident } from './types';

export interface MoraleInputs {
  foodOk: boolean;
  warmthAvg: number;
  dietVarietyScore: number;
  clothesCoverage: number; // 0~1
}

function activeReligiousWorker(
  state: GameState,
  buildingType: 'shrine' | 'hermitage',
  job: Resident['job'],
): Resident | null {
  for (const building of state.buildings) {
    if (building.type !== buildingType || !building.built) continue;
    const worker = assignedWorkers(state, building)
      .find(candidate => candidate.job === job && candidate.alive && !candidate.sick);
    if (worker) return worker;
  }
  return null;
}

function hasResidentShaman(state: GameState): boolean {
  return activeReligiousWorker(state, 'shrine', 'shaman') != null;
}

export function hasResidentMonk(state: GameState): boolean {
  return activeReligiousWorker(state, 'hermitage', 'monk') != null;
}

export function residentMonkGriefLoss(state: GameState): number {
  const monk = activeReligiousWorker(state, 'hermitage', 'monk');
  if (!monk) return 6;
  return monk.special === 'nosung'
    ? CONFIG.satisfaction.namedMonkGriefRelief
    : CONFIG.satisfaction.monkGriefRelief;
}

export function residentMonkBurialBonus(state: GameState): number {
  const monk = activeReligiousWorker(state, 'hermitage', 'monk');
  if (!monk) return 0;
  return monk.special === 'nosung'
    ? CONFIG.satisfaction.namedMonkBurialBonus
    : CONFIG.satisfaction.monkBurialBonus;
}

// 서당이 "가동" 중인가 — 건물 + 훈장 배정 (취학 아동이 없어도 글 배울 곳이 있다는 사실이 기대를 채운다)
export function schoolActive(state: GameState): boolean {
  return state.buildings.some(building =>
    building.type === 'school' && building.built &&
    assignedWorkers(state, building).some(worker => worker.job === 'teacher' && worker.alive && !worker.sick));
}

export function moraleBreakdown(state: GameState, inputs: MoraleInputs): MoraleFactor[] {
  const s = CONFIG.satisfaction;
  const rank = state.rank ?? 'settlement';
  const at = (minRank: Rank) => rankAtLeast(rank, minRank);
  const living = state.residents.filter(r => r.alive).length;
  const factors: MoraleFactor[] = [];

  // ── 정착지: 살아남는 것 ──
  factors.push({
    id: 'meal', label: '끼니', unlocked: true,
    delta: inputs.foodOk ? s.mealOk : s.mealShort,
  });
  factors.push({
    id: 'warmth', label: '온기', unlocked: true,
    delta: inputs.warmthAvg > 60 ? s.warmthGood : inputs.warmthAvg < 35 ? s.warmthBad : 0,
  });
  factors.push({
    id: 'variety', label: '식단 다양성', unlocked: true,
    delta: inputs.dietVarietyScore < 0.5 ? s.varietyPenalty : 0,
  });

  // ── 보: 사람답게 입고 사고팔기 ──
  factors.push({
    id: 'clothing', label: '입성 (의복 보급)', unlocked: at('bo'),
    delta: inputs.clothesCoverage >= 0.8 ? s.clothingGood : inputs.clothesCoverage < 0.4 ? s.clothingBad : 0,
  });
  factors.push({
    id: 'market', label: '장터', unlocked: at('bo'),
    delta: countBuilt(state, 'market') > 0 ? s.marketGood : s.marketMissing,
  });

  // ── 진: 밥상의 격과 글공부 ──
  factors.push({
    id: 'ferment', label: '밥상의 격 (장·김치)', unlocked: at('jin'),
    delta: state.day - (state.lastFermentMealDay ?? -999) <= s.fermentWindowDays
      ? s.fermentGood : s.fermentMissing,
  });
  factors.push({
    id: 'education', label: '글공부 (서당)', unlocked: at('jin'),
    delta: schoolActive(state) ? s.educationGood : s.educationMissing,
  });

  // ── 부: 부와 신앙 ──
  factors.push({
    id: 'luxury', label: '사치품', unlocked: at('bu'),
    delta: living > 0 && luxuryStockTotal(state) / living >= s.luxuryPerCapita
      ? s.luxuryGood : s.luxuryMissing,
  });
  factors.push({
    id: 'religion', label: '신앙 (당집·암자)', unlocked: at('bu'),
    delta: countBuilt(state, 'shrine') > 0 || countBuilt(state, 'hermitage') > 0
      ? s.religionGood : s.religionMissing,
  });

  // ── 부가 ──
  if (hasResidentShaman(state)) {
    factors.push({ id: 'shaman', label: '당집의 굿 소리', unlocked: true, delta: s.shamanCheer });
    const shaman = activeReligiousWorker(state, 'shrine', 'shaman');
    if (shaman?.special === 'mudang') {
      factors.push({
        id: 'named-shaman',
        label: '월향의 큰굿',
        unlocked: true,
        delta: s.namedShamanCheerBonus,
      });
    }
  }
  if (state.day < (state.promotionCheerUntil ?? 0)) {
    factors.push({ id: 'promotion', label: '승격의 경사', unlocked: true, delta: s.promotionCheer });
  }
  if (state.day < (state.expectationTransitionUntil ?? 0)) {
    factors.push({
      id: 'legacy-expectation-transition',
      label: '새 기대에 적응 중',
      unlocked: true,
      delta: s.legacyTransitionCheer,
    });
  }

  // ── 절목 — 시행 중인 령과 조령모개의 대가 ──
  factors.push(...edictMoraleFactors(state));

  return factors;
}

// 목표 민심 — 잠긴(상위 티어) 항목은 계산에서 완전히 빠진다. 티어가 오르면
// 새 항목이 대개 미충족으로 들어와 민심이 한 계단 내려앉는다 (승격은 영광이자 숙제).
export function moraleTarget(state: GameState, inputs: MoraleInputs): number {
  return CONFIG.satisfaction.base + moraleBreakdown(state, inputs)
    .filter(factor => factor.unlocked)
    .reduce((sum, factor) => sum + factor.delta, 0);
}

function clampedMorale(value: number): number {
  return Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
}

export function settlementMoraleProductionMultiplier(averageMorale: number): number {
  const s = CONFIG.satisfaction;
  return s.productionMinMult + (clampedMorale(averageMorale) / 100) *
    (s.productionMaxMult - s.productionMinMult);
}

export function settlementMoraleBirthMultiplier(averageMorale: number): number {
  const s = CONFIG.satisfaction;
  return s.birthMinMult + (clampedMorale(averageMorale) / 100) *
    (s.birthMaxMult - s.birthMinMult);
}

export function settlementMoraleDepartureChance(averageMorale: number): number {
  const s = CONFIG.satisfaction;
  const morale = clampedMorale(averageMorale);
  if (morale >= s.departureThreshold) return 0;
  return s.departureDailyMaxChance * (s.departureThreshold - morale) / s.departureThreshold;
}

export function displayedMoraleTarget(state: Pick<GameState, 'moraleFactors'>): number {
  const target = CONFIG.satisfaction.base + (state.moraleFactors ?? [])
    .filter(factor => factor.unlocked)
    .reduce((sum, factor) => sum + factor.delta, 0);
  return clampedMorale(target);
}
