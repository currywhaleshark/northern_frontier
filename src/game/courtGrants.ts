// 조정 하사품의 자원 보상표. 추첨 결과는 세계 시드와 연차만으로 결정된다.
import { CONFIG } from './config';
import { createLivestockState, normalizeLivestockState, preflightLivestockAcquisition } from './livestock';
import { makeRng } from './map';
import { borderCommanderEffects } from './diplomaticFigures';
import type { SpecialItemId } from './specialItems';
import type { GameState, LivestockId, Rank, ResourceId } from './types';

type CourtGrantResourceCategory = 'practical' | 'advanced';

interface CourtGrantResourceCandidate {
  resource: ResourceId;
  baseAmount: number;
  weight: number;
  minRank: Rank;
  /** 선행 물자는 해당 단계에서 막 열리는 품목만 보인다. */
  maxRank?: Rank;
  category: CourtGrantResourceCategory;
}

interface CourtGrantResourceReward {
  resource: ResourceId;
  amount: number;
  category: CourtGrantResourceCategory;
}

interface CourtGrantLivestockReward {
  kind: 'livestock';
  grantType: 'livestock' | 'warhorse';
  species: LivestockId;
  amount: number;
  category: 'practical';
}

type CourtGrantReward = CourtGrantResourceReward | CourtGrantLivestockReward;

/** 이번 하사품 범위의 전용 기물. 이후 기물은 이 목록에 명시적으로 추가한다. */
export const COURT_GRANT_ARTIFACT_IDS = [
  'reliefGrainVoucher',
  'tributeWaiverDecree',
  'recruitmentNotice',
  'rainGauge',
  'agriculturalEdict',
  'medicalBook',
  'militaryTreatise',
  'telescope',
  'royalPlaque',
  'jijaChongtong',
  'royalSpear',
  'royalHornBow',
  'royalMusket',
] as const satisfies readonly SpecialItemId[];

interface CourtGrantArtifactRoll {
  item: SpecialItemId | null;
  eligible: boolean;
  guaranteedByPity: boolean;
}

interface CourtGrantLivestockCandidate {
  kind: 'livestock';
  grantType: 'livestock' | 'warhorse';
  species: readonly LivestockId[];
  baseAmount: number;
  weight: number;
  minRank: Rank;
}

const RANK_ORDER: Record<Rank, number> = {
  settlement: 0,
  bo: 1,
  jin: 2,
  bu: 3,
};

const GRANT_RANKS: readonly Rank[] = ['settlement', 'bo', 'jin', 'bu'];

export function courtGrantEffectiveRank(
  state: Pick<GameState, 'rank'> & Partial<Pick<GameState, 'borderCommander'>>,
): Rank {
  const shift = state.borderCommander ? borderCommanderEffects(state as Pick<GameState, 'borderCommander'>).courtGrantRankShift : 0;
  const index = Math.max(0, Math.min(GRANT_RANKS.length - 1, RANK_ORDER[state.rank] + shift));
  return GRANT_RANKS[index];
}

// 짚신은 가내수공업으로 자급되므로 하사 대상에서 제외한다.
// 실용 물자는 누적되고, 선행 물자는 그 단계에서 새로 의미가 생기는 품목으로 교체된다.
export const COURT_GRANT_RESOURCE_CANDIDATES: readonly CourtGrantResourceCandidate[] = [
  { resource: 'firewood', baseAmount: 24, weight: 12, minRank: 'settlement', category: 'practical' },
  { resource: 'grain', baseAmount: 30, weight: 12, minRank: 'settlement', category: 'practical' },
  { resource: 'tools', baseAmount: 6, weight: 9, minRank: 'settlement', category: 'practical' },
  { resource: 'iron', baseAmount: 6, weight: 8, minRank: 'settlement', category: 'practical' },
  { resource: 'hideClothes', baseAmount: 6, weight: 7, minRank: 'settlement', category: 'practical' },
  { resource: 'leatherShoes', baseAmount: 5, weight: 7, minRank: 'settlement', category: 'practical' },
  { resource: 'spears', baseAmount: 6, weight: 6, minRank: 'bo', category: 'practical' },
  { resource: 'cottonClothes', baseAmount: 7, weight: 7, minRank: 'bo', category: 'practical' },
  { resource: 'jang', baseAmount: 8, weight: 9, minRank: 'bo', category: 'practical' },
  { resource: 'kimchi', baseAmount: 12, weight: 10, minRank: 'bo', category: 'practical' },
  { resource: 'curedMeat', baseAmount: 10, weight: 10, minRank: 'bo', category: 'practical' },
  { resource: 'saltedFish', baseAmount: 10, weight: 10, minRank: 'bo', category: 'practical' },
  { resource: 'driedFish', baseAmount: 10, weight: 10, minRank: 'bo', category: 'practical' },
  { resource: 'charcoal', baseAmount: 14, weight: 8, minRank: 'jin', category: 'practical' },
  { resource: 'hornBows', baseAmount: 4, weight: 6, minRank: 'jin', category: 'practical' },
  { resource: 'salt', baseAmount: 10, weight: 8, minRank: 'jin', category: 'practical' },
  { resource: 'muskets', baseAmount: 3, weight: 6, minRank: 'bu', category: 'practical' },
  { resource: 'gunpowder', baseAmount: 12, weight: 7, minRank: 'bu', category: 'practical' },

  { resource: 'spears', baseAmount: 4, weight: 6, minRank: 'settlement', maxRank: 'settlement', category: 'advanced' },
  { resource: 'cottonClothes', baseAmount: 5, weight: 7, minRank: 'settlement', maxRank: 'settlement', category: 'advanced' },
  { resource: 'salt', baseAmount: 8, weight: 8, minRank: 'settlement', maxRank: 'settlement', category: 'advanced' },
  { resource: 'charcoal', baseAmount: 8, weight: 3, minRank: 'settlement', maxRank: 'settlement', category: 'advanced' },
  { resource: 'hornBows', baseAmount: 3, weight: 5, minRank: 'bo', maxRank: 'bo', category: 'advanced' },
  { resource: 'silver', baseAmount: 6, weight: 4, minRank: 'bo', maxRank: 'bo', category: 'advanced' },
  { resource: 'charcoal', baseAmount: 10, weight: 6, minRank: 'bo', maxRank: 'bo', category: 'advanced' },
  { resource: 'gunpowder', baseAmount: 8, weight: 5, minRank: 'jin', maxRank: 'jin', category: 'advanced' },
  { resource: 'muskets', baseAmount: 2, weight: 4, minRank: 'jin', maxRank: 'jin', category: 'advanced' },
  { resource: 'porcelain', baseAmount: 2, weight: 3, minRank: 'jin', maxRank: 'jin', category: 'advanced' },
  { resource: 'brassware', baseAmount: 2, weight: 3, minRank: 'jin', maxRank: 'jin', category: 'advanced' },
  { resource: 'lacquerware', baseAmount: 2, weight: 3, minRank: 'jin', maxRank: 'jin', category: 'advanced' },
  { resource: 'silk', baseAmount: 2, weight: 3, minRank: 'jin', maxRank: 'jin', category: 'advanced' },
  { resource: 'preciousMetal', baseAmount: 2, weight: 3, minRank: 'jin', maxRank: 'jin', category: 'advanced' },
  { resource: 'silver', baseAmount: 10, weight: 6, minRank: 'bu', category: 'advanced' },
  { resource: 'porcelain', baseAmount: 3, weight: 5, minRank: 'bu', category: 'advanced' },
  { resource: 'brassware', baseAmount: 3, weight: 5, minRank: 'bu', category: 'advanced' },
  { resource: 'lacquerware', baseAmount: 3, weight: 5, minRank: 'bu', category: 'advanced' },
  { resource: 'silk', baseAmount: 3, weight: 5, minRank: 'bu', category: 'advanced' },
  { resource: 'preciousMetal', baseAmount: 3, weight: 5, minRank: 'bu', category: 'advanced' },
];

const CHONGTONG_POWDER_SUPPORT: CourtGrantResourceCandidate = {
  resource: 'gunpowder',
  baseAmount: 6,
  weight: CONFIG.courtGrants.chongtongPowderSupportWeight,
  minRank: 'settlement',
  category: 'practical',
};

// 축사 수용량은 상태에 따라 달라지므로 자원 후보표와 분리한다.
// 일반 가축에는 말을 넣지 않고, 군마는 별도 후보로만 지급한다.
export const COURT_GRANT_LIVESTOCK_CANDIDATES: readonly CourtGrantLivestockCandidate[] = [
  { kind: 'livestock', grantType: 'livestock', species: ['chicken', 'goat', 'sheep', 'pig', 'cattle'], baseAmount: 2, weight: 6, minRank: 'jin' },
  { kind: 'livestock', grantType: 'warhorse', species: ['horse'], baseAmount: 1, weight: 4, minRank: 'jin' },
];

export function grantYearScale(year: number): number {
  return Math.min(CONFIG.courtGrants.yearScaleMax, 1 + CONFIG.courtGrants.yearScalePerYear * (year - 1));
}

function candidatePool(rank: Rank, category: CourtGrantResourceCategory, excluded: ReadonlySet<ResourceId>): CourtGrantResourceCandidate[] {
  const rankOrder = RANK_ORDER[rank];
  return COURT_GRANT_RESOURCE_CANDIDATES.filter(candidate =>
    candidate.category === category
    && RANK_ORDER[candidate.minRank] <= rankOrder
    && (candidate.maxRank === undefined || rankOrder <= RANK_ORDER[candidate.maxRank])
    && !excluded.has(candidate.resource),
  );
}

function hasCompletedChongtongEmplacement(state: Pick<GameState, 'buildings'>): boolean {
  return state.buildings.some(building => building.type === 'chongtongEmplacement' && building.built);
}

function practicalCandidatePoolForState(
  state: Pick<GameState, 'buildings' | 'rank'>,
  excluded: ReadonlySet<ResourceId>,
): CourtGrantResourceCandidate[] {
  const candidates = candidatePool(state.rank, 'practical', excluded);
  if (!hasCompletedChongtongEmplacement(state) || excluded.has('gunpowder')) return candidates;
  const existingGunpowder = candidates.find(candidate => candidate.resource === 'gunpowder');
  if (!existingGunpowder) return [...candidates, CHONGTONG_POWDER_SUPPORT];
  // 부에서는 원래 화약 12 후보가 이미 있다. 작은 지원 묶음으로 보상량을 낮추지 않고
  // 기존 후보의 가중치만 높여 포대 보유에 따른 후속 지원 확률을 반영한다.
  return candidates.map(candidate => candidate.resource === 'gunpowder'
    ? { ...candidate, weight: candidate.weight + CHONGTONG_POWDER_SUPPORT.weight }
    : candidate);
}

function weightedPick(candidates: readonly CourtGrantResourceCandidate[], random: () => number): CourtGrantResourceCandidate | null {
  const totalWeight = candidates.reduce((sum, candidate) => sum + candidate.weight, 0);
  if (totalWeight <= 0) return null;
  let roll = random() * totalWeight;
  for (const candidate of candidates) {
    roll -= candidate.weight;
    if (roll < 0) return candidate;
  }
  return candidates[candidates.length - 1] ?? null;
}

function weightedGrantPick<T extends { weight: number }>(candidates: readonly T[], random: () => number): T | null {
  const totalWeight = candidates.reduce((sum, candidate) => sum + candidate.weight, 0);
  if (totalWeight <= 0) return null;
  let roll = random() * totalWeight;
  for (const candidate of candidates) {
    roll -= candidate.weight;
    if (roll < 0) return candidate;
  }
  return candidates[candidates.length - 1] ?? null;
}

function pickReward(
  rank: Rank,
  category: CourtGrantResourceCategory,
  excluded: Set<ResourceId>,
  random: () => number,
  year: number,
): CourtGrantResourceReward | null {
  const candidate = weightedPick(candidatePool(rank, category, excluded), random);
  if (!candidate) return null;
  excluded.add(candidate.resource);
  return {
    resource: candidate.resource,
    amount: Math.max(1, Math.round(candidate.baseAmount * grantYearScale(year))),
    category,
  };
}

/**
 * 자원 하사 결과를 재고·연속 납부 상태와 무관하게 재현한다.
 * 후속 단계의 가축·고유기물은 이 함수에 섞지 않는다.
 */
export function rollCourtGrantResources(seed: number, year: number, rank: Rank): CourtGrantResourceReward[] {
  const random = makeRng(seed + year * CONFIG.courtGrants.rngYearSalt + CONFIG.courtGrants.rngSeedOffset);
  const excluded = new Set<ResourceId>();
  const rewards: CourtGrantResourceReward[] = [];

  const guaranteed = pickReward(rank, 'practical', excluded, random, year);
  if (guaranteed) rewards.push(guaranteed);

  if (random() < CONFIG.courtGrants.extraPracticalChance) {
    const extra = pickReward(rank, 'practical', excluded, random, year);
    if (extra) rewards.push(extra);
  }

  if (random() < CONFIG.courtGrants.advancedChance) {
    const advanced = pickReward(rank, 'advanced', excluded, random, year);
    if (advanced) rewards.push(advanced);
  }

  return rewards;
}

function livestockCandidatePool(
  state: Pick<GameState, 'buildings' | 'rank'>,
  year: number,
  excludedGrantTypes: ReadonlySet<CourtGrantLivestockReward['grantType']>,
): CourtGrantLivestockCandidate[] {
  const rankOrder = RANK_ORDER[state.rank];
  return COURT_GRANT_LIVESTOCK_CANDIDATES.filter(candidate => {
    if (RANK_ORDER[candidate.minRank] > rankOrder) return false;
    if (excludedGrantTypes.has(candidate.grantType)) return false;
    const amount = Math.max(1, Math.round(candidate.baseAmount * grantYearScale(year)));
    return candidate.species.some(species => preflightLivestockAcquisition(state, species, amount).canAcquire);
  });
}

function pickStateReward(
  state: Pick<GameState, 'buildings' | 'rank'>,
  category: CourtGrantResourceCategory,
  excludedResources: Set<ResourceId>,
  excludedLivestockGrantTypes: Set<CourtGrantLivestockReward['grantType']>,
  random: () => number,
  year: number,
): CourtGrantReward | null {
  const resources = category === 'practical'
    ? practicalCandidatePoolForState(state, excludedResources)
    : candidatePool(state.rank, category, excludedResources);
  const candidates: Array<CourtGrantResourceCandidate | CourtGrantLivestockCandidate> = category === 'practical'
    ? [...resources, ...livestockCandidatePool(state, year, excludedLivestockGrantTypes)]
    : resources;
  const candidate = weightedGrantPick(candidates, random);
  if (!candidate) return null;
  if ('resource' in candidate) {
    excludedResources.add(candidate.resource);
    return {
      resource: candidate.resource,
      amount: Math.max(1, Math.round(candidate.baseAmount * grantYearScale(year))),
      category,
    };
  }

  const amount = Math.max(1, Math.round(candidate.baseAmount * grantYearScale(year)));
  const eligibleSpecies = candidate.species.filter(species =>
    preflightLivestockAcquisition(state, species, amount).canAcquire);
  const species = eligibleSpecies[Math.floor(random() * eligibleSpecies.length)];
  if (!species) return null;
  excludedLivestockGrantTypes.add(candidate.grantType);
  return { kind: 'livestock', grantType: candidate.grantType, species, amount, category: 'practical' };
}

function cloneGrantState(state: Pick<GameState, 'seed' | 'rank' | 'buildings'>): Pick<GameState, 'seed' | 'rank' | 'buildings'> {
  return {
    ...state,
    buildings: state.buildings.map(building => ({
      ...building,
      livestock: building.livestock ? { ...building.livestock } : building.livestock,
    })),
  };
}

// 한 하사에서 앞서 뽑힌 가축도 이미 축사를 차지한 것으로 계산한다.
// 실제 상태에는 건드리지 않고, 지급 시에는 반드시 acquireLivestock를 호출한다.
function reserveGrantLivestock(
  state: Pick<GameState, 'buildings'>,
  reward: CourtGrantLivestockReward,
): void {
  const preflight = preflightLivestockAcquisition(state, reward.species, reward.amount);
  if (!preflight.canAcquire) return;
  for (const allocation of preflight.allocations) {
    const stable = state.buildings.find(building => building.id === allocation.stableId);
    if (!stable) continue;
    const livestock = normalizeLivestockState(stable.livestock);
    if (livestock.species !== reward.species) {
      stable.livestock = createLivestockState(reward.species, allocation.amount);
    } else {
      stable.livestock = { ...livestock, headcount: livestock.headcount + allocation.amount };
    }
  }
}

/**
 * 실제 세공 하사에 쓰는 추첨. 자원 중복 제외는 유지하고, 축사가 받을 수 있을 때만 가축 후보를 넣는다.
 * 수용량과 현 북병사의 하사 등급 보정만 상태에서 읽으며 재고·연속 납부 상태는
 * 확률이나 가중치에 영향을 주지 않는다.
 */
export function rollCourtGrantRewards(
  state: Pick<GameState, 'seed' | 'rank' | 'buildings'> & Partial<Pick<GameState, 'borderCommander'>>,
  year: number,
): CourtGrantReward[] {
  const random = makeRng(state.seed + year * CONFIG.courtGrants.rngYearSalt + CONFIG.courtGrants.rngSeedOffset);
  const excludedResources = new Set<ResourceId>();
  const excludedLivestockGrantTypes = new Set<CourtGrantLivestockReward['grantType']>();
  const rewards: CourtGrantReward[] = [];
  const projectedState = cloneGrantState({ ...state, rank: courtGrantEffectiveRank(state) });

  const guaranteed = pickStateReward(projectedState, 'practical', excludedResources, excludedLivestockGrantTypes, random, year);
  if (guaranteed) {
    rewards.push(guaranteed);
    if ('kind' in guaranteed && guaranteed.kind === 'livestock') reserveGrantLivestock(projectedState, guaranteed);
  }
  if (random() < CONFIG.courtGrants.extraPracticalChance) {
    const extra = pickStateReward(projectedState, 'practical', excludedResources, excludedLivestockGrantTypes, random, year);
    if (extra) {
      rewards.push(extra);
      if ('kind' in extra && extra.kind === 'livestock') reserveGrantLivestock(projectedState, extra);
    }
  }
  if (random() < CONFIG.courtGrants.advancedChance) {
    const advanced = pickStateReward(projectedState, 'advanced', excludedResources, excludedLivestockGrantTypes, random, year);
    if (advanced) rewards.push(advanced);
  }
  return rewards;
}

/**
 * 하사 기물은 물자·가축 추첨과 RNG 흐름을 공유하지 않는다. 따라서 등급, 축사
 * 수용량, 앞선 하사 후보의 가지가 달라져도 같은 세계·연차의 당첨 여부는 같다.
 * 기물 보유 상태는 이미 가진 것을 후보에서 빼는 데에만 사용한다.
 */
export function rollCourtGrantArtifact(
  state: Pick<GameState, 'seed' | 'specialItems' | 'courtGrantArtifactMisses'>,
  year: number,
): CourtGrantArtifactRoll {
  const eligibleItems = COURT_GRANT_ARTIFACT_IDS.filter(item => (state.specialItems[item] ?? 0) < 1);
  if (eligibleItems.length === 0) {
    return { item: null, eligible: false, guaranteedByPity: false };
  }

  const guaranteedByPity = state.courtGrantArtifactMisses >= CONFIG.courtGrants.artifactPityMisses;
  const random = makeRng(
    state.seed + year * CONFIG.courtGrants.artifactRngYearSalt + CONFIG.courtGrants.artifactRngSeedOffset,
  );
  if (!guaranteedByPity && random() >= CONFIG.courtGrants.artifactChance) {
    return { item: null, eligible: true, guaranteedByPity: false };
  }
  const item = eligibleItems[Math.floor(random() * eligibleItems.length)] ?? null;
  return { item, eligible: true, guaranteedByPity };
}
