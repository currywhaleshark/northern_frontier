import type {
  EnemyDoctrineId, EnemyObjectiveId, RaiderGroupKind, RaiderUnitType,
  TacticalCompositionCandidate, TacticalCompositionSlot, TacticalCompositionTemplate,
  TacticalEnemyFactionId,
} from './types';

const ALL_OBJECTIVES: readonly EnemyObjectiveId[] = ['breakthrough', 'plunder', 'arson'];

function slot(
  role: RaiderGroupKind,
  unitType: RaiderUnitType,
  powerShare: readonly [number, number],
  required = true,
): TacticalCompositionSlot {
  return { role, candidates: [{ unitType, weight: 1 }], powerShare, required };
}

const TEMPLATES: readonly TacticalCompositionTemplate[] = [
  {
    id: 'nimacha-forest-screen', label: '산림 견제대', faction: 'nimacha',
    doctrines: ['missileSuppression', 'reserveCounterattack'], objectives: ALL_OBJECTIVES, weight: 1,
    implementationPhase: 1,
    slots: [slot('main', 'nimacha-hunter', [0.36, 0.5]), slot('flankers', 'nimacha-spearman', [0.25, 0.36]), slot('looters', 'nimacha-looter', [0.18, 0.3])],
  },
  {
    id: 'nimacha-spear-ambush', label: '창잡이 매복대', faction: 'nimacha',
    doctrines: ['reserveCounterattack', 'shockBreakthrough'], objectives: ALL_OBJECTIVES, weight: 1,
    implementationPhase: 1,
    slots: [slot('main', 'nimacha-spearman', [0.42, 0.58]), slot('flankers', 'nimacha-hunter', [0.22, 0.34]), slot('looters', 'nimacha-looter', [0.14, 0.26])],
  },
  {
    id: 'nimacha-plunder-column', label: '산림 노획대', faction: 'nimacha',
    doctrines: ['missileSuppression', 'reserveCounterattack'], objectives: ALL_OBJECTIVES, weight: 1,
    implementationPhase: 1,
    slots: [slot('main', 'nimacha-hunter', [0.28, 0.4]), slot('looters', 'nimacha-looter', [0.34, 0.48]), slot('flankers', 'nimacha-spearman', [0.18, 0.3])],
  },
  {
    id: 'nimacha-balanced-warband', label: '니마차 혼성대', faction: 'nimacha',
    doctrines: ['missileSuppression', 'reserveCounterattack', 'shockBreakthrough'], objectives: ALL_OBJECTIVES, weight: 1,
    implementationPhase: 1,
    slots: [slot('main', 'nimacha-spearman', [0.32, 0.44]), slot('flankers', 'nimacha-hunter', [0.26, 0.38]), slot('looters', 'nimacha-looter', [0.18, 0.28])],
  },
  {
    id: 'nimacha-breach-party', label: '니마차 산림 침투대', faction: 'nimacha',
    doctrines: ['breachAndStorm', 'shieldedAdvance'], objectives: ['breakthrough', 'arson'], weight: 1,
    implementationPhase: 2,
    slots: [slot('main', 'shield-infantry', [0.28, 0.38]), slot('main', 'nimacha-hunter', [0.24, 0.34]), slot('main', 'wall-breaker', [0.24, 0.34])],
  },

  {
    id: 'holaon-mounted-skirmish', label: '기마 견제대', faction: 'holaon',
    doctrines: ['mountedSkirmish'], objectives: ALL_OBJECTIVES, weight: 1,
    implementationPhase: 1,
    slots: [slot('main', 'holaon-horse-archer', [0.42, 0.56]), slot('looters', 'holaon-raider', [0.24, 0.36]), slot('flankers', 'holaon-lancer', [0.14, 0.26])],
  },
  {
    id: 'holaon-shock-column', label: '홀라온 충격 돌파대', faction: 'holaon',
    doctrines: ['shockBreakthrough'], objectives: ALL_OBJECTIVES, weight: 1,
    implementationPhase: 1,
    slots: [slot('main', 'holaon-lancer', [0.48, 0.62]), slot('looters', 'holaon-raider', [0.2, 0.3]), slot('flankers', 'holaon-horse-archer', [0.14, 0.24])],
  },
  {
    id: 'holaon-raiding-wings', label: '약탈 우회대', faction: 'holaon',
    doctrines: ['mountedSkirmish', 'reserveCounterattack'], objectives: ALL_OBJECTIVES, weight: 1,
    implementationPhase: 1,
    slots: [slot('flankers', 'holaon-raider', [0.36, 0.5]), slot('looters', 'holaon-raider', [0.22, 0.34]), slot('main', 'holaon-horse-archer', [0.2, 0.32])],
  },
  {
    id: 'holaon-balanced-host', label: '홀라온 혼성 기병대', faction: 'holaon',
    doctrines: ['mountedSkirmish', 'shockBreakthrough', 'reserveCounterattack'], objectives: ALL_OBJECTIVES, weight: 1,
    implementationPhase: 1,
    slots: [slot('main', 'holaon-lancer', [0.3, 0.42]), slot('flankers', 'holaon-horse-archer', [0.28, 0.4]), slot('looters', 'holaon-raider', [0.2, 0.3])],
  },

  {
    id: 'bandit-hit-and-run', label: '치고 빠지는 약탈대', faction: 'bandit',
    doctrines: ['mountedSkirmish', 'reserveCounterattack'], objectives: ALL_OBJECTIVES, weight: 1,
    implementationPhase: 1,
    slots: [slot('flankers', 'bandit-rider', [0.34, 0.48]), slot('looters', 'bandit-looter', [0.28, 0.42]), slot('main', 'bandit-vanguard', [0.18, 0.3])],
  },
  {
    id: 'bandit-chief-column', label: '두목 돌격대', faction: 'bandit',
    doctrines: ['shockBreakthrough', 'reserveCounterattack'], objectives: ALL_OBJECTIVES, weight: 1,
    implementationPhase: 1,
    slots: [slot('main', 'bandit-vanguard', [0.46, 0.6]), slot('flankers', 'bandit-rider', [0.22, 0.34]), slot('looters', 'bandit-looter', [0.14, 0.26])],
  },
  {
    id: 'bandit-looting-column', label: '마적 약탈 종대', faction: 'bandit',
    doctrines: ['mountedSkirmish', 'missileSuppression'], objectives: ALL_OBJECTIVES, weight: 1,
    implementationPhase: 1,
    slots: [slot('looters', 'bandit-looter', [0.4, 0.54]), slot('main', 'bandit-vanguard', [0.22, 0.34]), slot('flankers', 'bandit-rider', [0.18, 0.3])],
  },
  {
    id: 'bandit-balanced-warband', label: '마적 혼성대', faction: 'bandit',
    doctrines: ['mountedSkirmish', 'shockBreakthrough', 'reserveCounterattack', 'missileSuppression'], objectives: ALL_OBJECTIVES, weight: 1,
    implementationPhase: 1,
    slots: [slot('main', 'bandit-vanguard', [0.3, 0.42]), slot('flankers', 'bandit-rider', [0.26, 0.38]), slot('looters', 'bandit-looter', [0.2, 0.3])],
  },
  {
    id: 'bandit-deserter-mixed', label: '혼성 탈영병대', faction: 'bandit',
    doctrines: ['missileSuppression', 'reserveCounterattack'], objectives: ALL_OBJECTIVES, weight: 1,
    implementationPhase: 2,
    slots: [slot('main', 'bandit-vanguard', [0.3, 0.42]), slot('main', 'deserter-musketeer', [0.24, 0.34]), slot('flankers', 'bandit-rider', [0.18, 0.28])],
  },
  {
    id: 'bandit-night-breach', label: '야간 파책대', faction: 'bandit',
    doctrines: ['breachAndStorm', 'shieldedAdvance'], objectives: ['breakthrough', 'arson'], weight: 1,
    implementationPhase: 2,
    slots: [slot('main', 'shield-infantry', [0.3, 0.42]), slot('main', 'wall-breaker', [0.28, 0.4]), slot('flankers', 'bandit-rider', [0.16, 0.26])],
  },

  {
    id: 'court-three-armies', label: '삼수진', faction: 'court',
    doctrines: ['missileSuppression', 'reserveCounterattack'], objectives: ALL_OBJECTIVES, weight: 1,
    implementationPhase: 1,
    slots: [slot('main', 'court-gunner', [0.28, 0.38]), slot('main', 'court-archer', [0.22, 0.32]), slot('main', 'court-melee', [0.3, 0.42])],
  },
  {
    id: 'court-cavalry-wing', label: '관군 기병익대', faction: 'court',
    doctrines: ['mountedSkirmish', 'shockBreakthrough', 'reserveCounterattack'], objectives: ALL_OBJECTIVES, weight: 1,
    implementationPhase: 1,
    slots: [slot('main', 'court-melee', [0.3, 0.42]), slot('flankers', 'court-cavalry', [0.32, 0.46]), slot('main', 'court-archer', [0.18, 0.28])],
  },
  {
    id: 'court-firearm-column', label: '포수 전진대', faction: 'court',
    doctrines: ['missileSuppression', 'reserveCounterattack'], objectives: ALL_OBJECTIVES, weight: 1,
    implementationPhase: 1,
    slots: [slot('main', 'court-gunner', [0.4, 0.54]), slot('main', 'court-melee', [0.26, 0.38]), slot('flankers', 'court-cavalry', [0.14, 0.24])],
  },
  {
    id: 'court-siege-battery', label: '정규 공성대', faction: 'court',
    doctrines: ['shockBreakthrough', 'missileSuppression'], objectives: ALL_OBJECTIVES, weight: 1,
    implementationPhase: 1,
    slots: [slot('main', 'court-artillery', [0.16, 0.24]), slot('main', 'court-melee', [0.32, 0.44]), slot('main', 'court-gunner', [0.24, 0.36])],
  },
  {
    id: 'court-shielded-advance', label: '방패 전진대', faction: 'court',
    doctrines: ['shieldedAdvance'], objectives: ALL_OBJECTIVES, weight: 1,
    implementationPhase: 2,
    slots: [slot('main', 'court-shield', [0.3, 0.42]), slot('main', 'court-gunner', [0.26, 0.38]), slot('main', 'court-melee', [0.2, 0.32])],
  },
  {
    id: 'court-mobile-wing', label: '관군 기동익대', faction: 'court',
    doctrines: ['mountedSkirmish', 'reserveCounterattack'], objectives: ALL_OBJECTIVES, weight: 1,
    implementationPhase: 2,
    slots: [slot('flankers', 'court-horse-archer', [0.3, 0.44]), slot('main', 'court-cavalry', [0.26, 0.38]), slot('main', 'court-archer', [0.18, 0.28])],
  },
  {
    id: 'court-fire-support', label: '화력 압박대', faction: 'court',
    doctrines: ['fireSupport'], objectives: ALL_OBJECTIVES, weight: 1,
    implementationPhase: 8,
    slots: [slot('main', 'court-hwacha', [0.14, 0.2]), slot('main', 'court-gunner', [0.3, 0.42]), slot('main', 'court-melee', [0.3, 0.42])],
  },
  {
    id: 'court-long-campaign', label: '장기 토벌대', faction: 'court',
    doctrines: ['reserveCounterattack'], objectives: ALL_OBJECTIVES, weight: 0.7,
    implementationPhase: 8,
    slots: [slot('main', 'court-gunner', [0.28, 0.38]), slot('main', 'court-melee', [0.3, 0.42]), slot('main', 'court-medic', [0.08, 0.14])],
  },
  // Weight-zero templates describe already-started battles from saves created before
  // composition IDs existed. They are valid metadata targets but never random picks.
  {
    id: 'nimacha-legacy-warband', label: '기존 니마차 혼성대', faction: 'nimacha',
    doctrines: ['missileSuppression'], objectives: ALL_OBJECTIVES, weight: 0,
    implementationPhase: 1,
    slots: [slot('main', 'nimacha-hunter', [0.34, 0.46]), slot('looters', 'nimacha-looter', [0.2, 0.32]), slot('flankers', 'nimacha-spearman', [0.22, 0.34])],
  },
  {
    id: 'holaon-legacy-host', label: '기존 홀라온 기병대', faction: 'holaon',
    doctrines: ['mountedSkirmish'], objectives: ALL_OBJECTIVES, weight: 0,
    implementationPhase: 1,
    slots: [slot('main', 'holaon-lancer', [0.34, 0.46]), slot('looters', 'holaon-raider', [0.2, 0.32]), slot('flankers', 'holaon-horse-archer', [0.22, 0.34])],
  },
  {
    id: 'bandit-legacy-warband', label: '기존 마적 혼성대', faction: 'bandit',
    doctrines: ['reserveCounterattack'], objectives: ALL_OBJECTIVES, weight: 0,
    implementationPhase: 1,
    slots: [slot('main', 'bandit-vanguard', [0.34, 0.46]), slot('looters', 'bandit-looter', [0.2, 0.32]), slot('flankers', 'bandit-rider', [0.22, 0.34])],
  },
  {
    id: 'court-legacy-punitive-force', label: '기존 조정 토벌군', faction: 'court',
    doctrines: ['missileSuppression'], objectives: ALL_OBJECTIVES, weight: 0,
    implementationPhase: 1,
    slots: [
      slot('main', 'court-gunner', [0.25, 0.31]), slot('main', 'court-archer', [0.11, 0.17]),
      slot('main', 'court-melee', [0.21, 0.27]), slot('flankers', 'court-cavalry', [0.16, 0.22]),
      slot('main', 'court-artillery', [0.12, 0.18]),
    ],
  },
];

export function tacticalEnemyFactionId(factionName: string): TacticalEnemyFactionId {
  if (factionName === '니마차 우디캐') return 'nimacha';
  if (factionName === '홀라온 야인') return 'holaon';
  if (factionName === '변경 마적') return 'bandit';
  if (factionName === '조정 토벌군') return 'court';
  return 'default';
}

const LEGACY_PLAN_METADATA: Partial<Record<TacticalEnemyFactionId, {
  doctrine: EnemyDoctrineId;
  compositionTemplateId: string;
}>> = {
  nimacha: { doctrine: 'missileSuppression', compositionTemplateId: 'nimacha-legacy-warband' },
  holaon: { doctrine: 'mountedSkirmish', compositionTemplateId: 'holaon-legacy-host' },
  bandit: { doctrine: 'reserveCounterattack', compositionTemplateId: 'bandit-legacy-warband' },
  court: { doctrine: 'missileSuppression', compositionTemplateId: 'court-legacy-punitive-force' },
};

export function legacyTacticalPlanMetadata(factionName: string) {
  return LEGACY_PLAN_METADATA[tacticalEnemyFactionId(factionName)];
}

export function tacticalCompositionTemplates(): readonly TacticalCompositionTemplate[] {
  return TEMPLATES;
}

export function tacticalCompositionTemplate(id: string | undefined): TacticalCompositionTemplate | undefined {
  return id ? TEMPLATES.find(template => template.id === id) : undefined;
}

export function eligibleTacticalCompositionTemplates(input: {
  faction: TacticalEnemyFactionId;
  doctrine: EnemyDoctrineId;
  objective: EnemyObjectiveId;
  power: number;
  maximumPhase?: 1 | 2 | 8;
  requiresFlankers?: boolean;
}): readonly TacticalCompositionTemplate[] {
  const maximumPhase = input.maximumPhase ?? 8;
  return TEMPLATES.filter(template =>
    template.faction === input.faction &&
    template.implementationPhase <= maximumPhase &&
    template.doctrines.includes(input.doctrine) &&
    template.objectives.includes(input.objective) &&
    (!input.requiresFlankers || template.slots.some(slot => slot.role === 'flankers')) &&
    template.slots.every(candidate => !candidate.minThreat || input.power >= candidate.minThreat));
}

export function chooseTacticalCompositionTemplate(input: {
  faction: TacticalEnemyFactionId;
  doctrine: EnemyDoctrineId;
  objective: EnemyObjectiveId;
  power: number;
  roll: number;
  maximumPhase?: 1 | 2 | 8;
  forcedTemplateId?: string;
  requiresFlankers?: boolean;
}): TacticalCompositionTemplate | undefined {
  const eligible = eligibleTacticalCompositionTemplates(input);
  if (input.forcedTemplateId) {
    return eligible.find(template => template.id === input.forcedTemplateId);
  }
  const total = eligible.reduce((sum, template) => sum + Math.max(0, template.weight), 0);
  if (total <= 0) return undefined;
  let cursor = Math.max(0, Math.min(0.999999999, input.roll)) * total;
  for (const template of eligible) {
    cursor -= Math.max(0, template.weight);
    if (cursor < 0) return template;
  }
  return eligible[eligible.length - 1];
}

export function chooseTacticalCompositionCandidate(
  candidates: readonly TacticalCompositionCandidate[],
  roll: number,
): RaiderUnitType | undefined {
  const total = candidates.reduce((sum, candidate) => sum + Math.max(0, candidate.weight), 0);
  if (total <= 0) return undefined;
  let cursor = Math.max(0, Math.min(0.999999999, roll)) * total;
  for (const candidate of candidates) {
    cursor -= Math.max(0, candidate.weight);
    if (cursor < 0) return candidate.unitType;
  }
  return candidates[candidates.length - 1]?.unitType;
}
