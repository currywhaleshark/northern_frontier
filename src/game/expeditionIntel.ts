import type { GameState, PredatorKind, PredatorThreat, TigerTier, WildlifeKind } from './types';

export type EnemyIntelPrecision = 'exact' | 'rough' | 'unknown';

export type ExpeditionIntelTarget =
  | { kind: 'lairAssault'; siteId: number }
  | { kind: 'predatorHunt'; predatorKind: PredatorKind };

export interface EnemyIntel {
  precision: EnemyIntelPrecision;
  precisionLabel: string;
  sizeText: string;
  powerText: string;
  detail: string;
}

export interface PredatorThreatProfile {
  size: number;
  strength: number;
  tigerTier?: TigerTier;
}

const TIGER_TIER_LABELS: Record<TigerTier, string> = {
  tiger: '호랑이',
  greatTiger: '대호',
  mountainLord: '산군',
};

const TIGER_TIER_DANGER: Record<TigerTier, number> = {
  tiger: 0.86,
  greatTiger: 1.16,
  mountainLord: 1.55,
};

export function tigerTierFromStrength(strength: number): TigerTier {
  if (strength >= 88) return 'mountainLord';
  if (strength >= 68) return 'greatTiger';
  return 'tiger';
}

export function tigerTierLabel(tier: TigerTier = 'tiger'): string {
  return TIGER_TIER_LABELS[tier];
}

export function tigerTierDangerMultiplier(tier: TigerTier = 'tiger'): number {
  return TIGER_TIER_DANGER[tier];
}

const KIND_SALT: Record<WildlifeKind, number> = {
  wolf: 0x71a3,
  tiger: 0x9e37,
  boar: 0x4f1b,
};

function threatHash(seed: number, kind: WildlifeKind, untilDay: number): number {
  let value = (seed ^ KIND_SALT[kind] ^ Math.imul(untilDay + 17, 0x45d9f3b)) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b) >>> 0;
  return (value ^ (value >>> 16)) >>> 0;
}

export function generatedPredatorThreatProfile(
  seed: number,
  kind: WildlifeKind,
  untilDay: number,
): PredatorThreatProfile {
  const hash = threatHash(seed, kind, untilDay);
  if (kind === 'wolf') {
    const size = 3 + (hash % 10);
    return { size, strength: 28 + size * 4 + ((hash >>> 8) % 7) };
  }
  if (kind === 'tiger') {
    const roll = hash % 100;
    const tigerTier: TigerTier = roll < 55 ? 'tiger' : roll < 88 ? 'greatTiger' : 'mountainLord';
    const tierHash = hash >>> 8;
    const strength = tigerTier === 'tiger'
      ? 56 + (tierHash % 9)
      : tigerTier === 'greatTiger'
        ? 70 + (tierHash % 12)
        : 90 + (tierHash % 15);
    return { size: 1, strength, tigerTier };
  }
  const size = 5 + (hash % 8);
  return { size, strength: 31 + size * 2 + ((hash >>> 8) % 5) };
}

export function predatorThreatProfile(state: GameState, kind: WildlifeKind): PredatorThreatProfile {
  const threat = state.incidents.predatorThreats[kind];
  const generated = generatedPredatorThreatProfile(state.seed, kind, threat?.untilDay ?? state.day);
  const strength = threat?.strength ?? generated.strength;
  return {
    size: threat?.size ?? generated.size,
    strength,
    tigerTier: kind === 'tiger'
      ? threat?.tigerTier ?? (threat?.strength != null
        ? tigerTierFromStrength(strength)
        : generated.tigerTier ?? tigerTierFromStrength(strength))
      : undefined,
  };
}

export function materializePredatorThreat(
  state: GameState,
  kind: WildlifeKind,
  untilDay: number,
  existing?: PredatorThreat,
): PredatorThreat {
  const generated = generatedPredatorThreatProfile(state.seed, kind, untilDay);
  return {
    kind,
    untilDay,
    size: existing?.size ?? generated.size,
    strength: existing?.strength ?? generated.strength,
    tigerTier: kind === 'tiger'
      ? existing?.tigerTier ?? (existing?.strength != null
        ? tigerTierFromStrength(existing.strength)
        : generated.tigerTier ?? tigerTierFromStrength(generated.strength))
      : undefined,
    scouting: existing?.scouting,
    intel: existing?.intel,
  };
}

export function activePredatorScoutIds(state: GameState): Set<number> {
  const ids = new Set<number>();
  for (const kind of ['wolf', 'tiger'] as const) {
    const residentId = state.incidents.predatorThreats[kind]?.scouting?.residentId;
    if (residentId != null) ids.add(residentId);
  }
  return ids;
}

export function availablePredatorScouts(state: GameState) {
  const busy = activePredatorScoutIds(state);
  const expedition = new Set(state.expedition?.memberIds ?? []);
  return state.residents
    .filter(resident => resident.alive && resident.job === 'hunter' && !resident.sick && resident.health >= 20 &&
      state.day >= (resident.quarantinedUntil ?? 0) && !busy.has(resident.id) && !expedition.has(resident.id) &&
      !state.battle?.defenderIds.includes(resident.id))
    .sort((a, b) => (b.skills.hunter ?? 0) - (a.skills.hunter ?? 0) || a.id - b.id);
}

export function predatorScoutDuration(hunterSkill: number, usedGyrfalcon: boolean): number {
  const base = hunterSkill >= 0.75 ? 2 : hunterSkill >= 0.35 ? 3 : 4;
  return Math.max(2, base - (usedGyrfalcon ? 1 : 0));
}

function roundedThreatRange(value: number): { low: number; high: number } {
  const low = Math.max(5, Math.floor(value * 0.78 / 5) * 5);
  const high = Math.max(low + 5, Math.ceil(value * 1.22 / 5) * 5);
  return { low, high };
}

function lairIntel(state: GameState, siteId: number): EnemyIntel {
  const site = state.foreignSites.find(candidate => candidate.id === siteId && candidate.type === 'banditLair');
  if (!site?.discovered) {
    return {
      precision: 'unknown',
      precisionLabel: '???',
      sizeText: '수비 규모 ???',
      powerText: '적 전력 ???',
      detail: '산채 위치와 정찰 정보가 부족합니다.',
    };
  }
  if ((site.scoutedUntilDay ?? 0) >= state.day) {
    return {
      precision: 'exact',
      precisionLabel: '정확',
      sizeText: `주둔 전력 ${site.militaryPower}`,
      powerText: `적 전력 ${site.militaryPower}`,
      detail: `최근 정찰이 유효합니다. 앞으로 ${Math.max(0, (site.scoutedUntilDay ?? state.day) - state.day)}일간 정확히 파악합니다.`,
    };
  }
  const range = roundedThreatRange(site.militaryPower);
  return {
    precision: 'rough',
    precisionLabel: '대략',
    sizeText: `주둔 규모 약 ${range.low}~${range.high}`,
    powerText: `적 전력 약 ${range.low}~${range.high}`,
    detail: '위치 정보로 추산한 값입니다. 다시 정찰하면 정확히 파악할 수 있습니다.',
  };
}

function predatorSizeText(
  kind: PredatorKind,
  size: number,
  tigerTier: TigerTier | undefined,
  exact: boolean,
): string {
  if (kind === 'wolf') {
    if (exact) return `늑대 ${size}마리`;
    return `늑대 약 ${Math.max(2, size - 2)}~${size + 2}마리`;
  }
  const tier = tigerTier ?? 'tiger';
  if (exact) return `${tigerTierLabel(tier)} 1마리`;
  if (tier === 'mountainLord') return '산을 울릴 만큼 거대한 호랑이 1마리 추정';
  if (tier === 'greatTiger') return '유난히 큰 호랑이 1마리 추정';
  return '호랑이 성체 1마리 추정';
}

function predatorIntel(state: GameState, kind: PredatorKind): EnemyIntel {
  const threat = state.incidents.predatorThreats[kind];
  const intel = threat?.intel;
  const profile = predatorThreatProfile(state, kind);
  if (!intel) {
    const scouting = threat?.scouting;
    return {
      precision: 'unknown',
      precisionLabel: '???',
      sizeText: '맹수 규모 ???',
      powerText: '위협 전력 ???',
      detail: scouting
        ? `사냥꾼이 흔적을 쫓는 중입니다. ${Math.max(0, scouting.completesOnDay - state.day)}일 뒤 보고가 옵니다.`
        : '흔적 추적을 마치기 전에는 규모를 알 수 없습니다.',
    };
  }
  const scoutName = state.residents.find(resident => resident.id === intel.scoutResidentId)?.name ?? '파견 사냥꾼';
  const source = intel.source === 'trade'
    ? `${intel.sourceFaction ?? '인근 세력'}에게서 산 현지 정보`
    : `${scoutName}의 보고 · 숙련 ${Math.round((intel.hunterSkill ?? 0) * 100)}% · 해동청 ${intel.usedGyrfalcon ? '동행' : '없음'}`;
  if (intel.precision === 'rough') {
    const range = roundedThreatRange(profile.strength);
    return {
      precision: 'rough',
      precisionLabel: '대략',
      sizeText: predatorSizeText(kind, profile.size, profile.tigerTier, false),
      powerText: `위협 전력 약 ${range.low}~${range.high}`,
      detail: `${source} · 더 숙련된 사냥꾼으로 다시 추적하면 정확도가 오를 수 있습니다.`,
    };
  }
  return {
    precision: 'exact',
    precisionLabel: '정확',
    sizeText: predatorSizeText(kind, profile.size, profile.tigerTier, true),
    powerText: `위협 전력 ${profile.strength}`,
    detail: `${source} · 흔적과 움직임을 정확히 판독했습니다.`,
  };
}

export function expeditionEnemyIntel(
  state: GameState,
  target: ExpeditionIntelTarget,
): EnemyIntel {
  return target.kind === 'lairAssault'
    ? lairIntel(state, target.siteId)
    : predatorIntel(state, target.predatorKind);
}
