import type {
  RaiderUnitType, TacticalEnemyFactionId, TacticalUnitArchetype, TacticalUnitProfile,
} from './types';

type TacticalUnitIdentity = Omit<TacticalUnitProfile,
  'rangedMultiplier' | 'meleeMultiplier' | 'chargeMultiplier' | 'protectionMultiplier' |
  'mobility' | 'wallPressure' | 'routeSpeed' | 'targetPriorities'>;

const ARCHETYPE_COMBAT: Record<TacticalUnitArchetype, Pick<TacticalUnitProfile,
  'rangedMultiplier' | 'meleeMultiplier' | 'chargeMultiplier' | 'protectionMultiplier' |
  'mobility' | 'wallPressure' | 'routeSpeed' | 'targetPriorities'>> = {
  lightCavalry: {
    rangedMultiplier: 1.02, meleeMultiplier: 0.86, chargeMultiplier: 1.08,
    protectionMultiplier: 0.92, mobility: 3, wallPressure: 0, routeSpeed: 2,
    targetPriorities: ['ranged', 'support'],
  },
  horseArcher: {
    rangedMultiplier: 1.16, meleeMultiplier: 0.7, chargeMultiplier: 0.82,
    protectionMultiplier: 0.9, mobility: 3, wallPressure: 0, routeSpeed: 2,
    targetPriorities: ['ranged', 'support'],
  },
  lancerCavalry: {
    rangedMultiplier: 0.62, meleeMultiplier: 1.08, chargeMultiplier: 1.35,
    protectionMultiplier: 0.92, mobility: 3, wallPressure: 0, routeSpeed: 2,
    targetPriorities: ['infantry', 'ranged'],
  },
  spearInfantry: {
    rangedMultiplier: 0.55, meleeMultiplier: 1.05, chargeMultiplier: 0.85,
    protectionMultiplier: 1.05, mobility: 1, wallPressure: 1, routeSpeed: 1,
    targetPriorities: ['mounted'],
  },
  shieldInfantry: {
    rangedMultiplier: 0.45, meleeMultiplier: 0.82, chargeMultiplier: 0.75,
    protectionMultiplier: 1.28, mobility: 1, wallPressure: 1, routeSpeed: 1,
    targetPriorities: ['ranged'],
  },
  footArcher: {
    rangedMultiplier: 1.12, meleeMultiplier: 0.65, chargeMultiplier: 0.65,
    protectionMultiplier: 0.88, mobility: 1, wallPressure: 0, routeSpeed: 1,
    targetPriorities: ['mounted', 'infantry'],
  },
  musketeer: {
    rangedMultiplier: 1.22, meleeMultiplier: 0.62, chargeMultiplier: 0.6,
    protectionMultiplier: 0.86, mobility: 1, wallPressure: 0, routeSpeed: 1,
    targetPriorities: ['shielded', 'artillery'],
  },
  meleeInfantry: {
    rangedMultiplier: 0.55, meleeMultiplier: 1.12, chargeMultiplier: 1.08,
    protectionMultiplier: 1, mobility: 1, wallPressure: 2, routeSpeed: 1,
    targetPriorities: ['infantry', 'siege'],
  },
  looterInfantry: {
    rangedMultiplier: 0.5, meleeMultiplier: 0.85, chargeMultiplier: 0.9,
    protectionMultiplier: 0.84, mobility: 2, wallPressure: 1, routeSpeed: 2,
    targetPriorities: ['support'],
  },
  wallBreaker: {
    rangedMultiplier: 0.35, meleeMultiplier: 0.72, chargeMultiplier: 0.6,
    protectionMultiplier: 0.68, mobility: 1, wallPressure: 10, routeSpeed: 1,
    targetPriorities: ['siege'],
  },
  directArtillery: {
    rangedMultiplier: 1.15, meleeMultiplier: 0.3, chargeMultiplier: 0.3,
    protectionMultiplier: 0.72, mobility: 1, wallPressure: 8, routeSpeed: 1,
    targetPriorities: ['siege', 'shielded'],
  },
  indirectArtillery: {
    rangedMultiplier: 1.2, meleeMultiplier: 0.25, chargeMultiplier: 0.25,
    protectionMultiplier: 0.68, mobility: 1, wallPressure: 2, routeSpeed: 1,
    targetPriorities: ['ranged', 'mounted', 'support'],
  },
  medic: {
    rangedMultiplier: 0.2, meleeMultiplier: 0.25, chargeMultiplier: 0.2,
    protectionMultiplier: 0.7, mobility: 1, wallPressure: 0, routeSpeed: 1,
    targetPriorities: [],
  },
};

const PROFILES: Record<RaiderUnitType, TacticalUnitIdentity> = {
  'nimacha-hunter': {
    id: 'nimacha-hunter', label: '숲 사냥꾼', archetype: 'footArcher',
    tags: ['infantry', 'ranged', 'scout'], factions: ['nimacha'], intelCategory: '보병 궁수',
    defaultLine: 'middle', implementationPhase: 1, enabled: true,
  },
  'nimacha-spearman': {
    id: 'nimacha-spearman', label: '창잡이', archetype: 'spearInfantry',
    tags: ['infantry', 'antiMounted'], factions: ['nimacha'], intelCategory: '창보병',
    defaultLine: 'front', implementationPhase: 1, enabled: true,
  },
  'nimacha-looter': {
    id: 'nimacha-looter', label: '니마차 노획조', archetype: 'looterInfantry',
    tags: ['infantry'], factions: ['nimacha'], intelCategory: '약탈 보병',
    defaultLine: 'front', implementationPhase: 1, enabled: true,
  },
  'holaon-lancer': {
    id: 'holaon-lancer', label: '기마 선봉', archetype: 'lancerCavalry',
    tags: ['mounted', 'shock'], factions: ['holaon'], intelCategory: '창기병',
    defaultLine: 'front', implementationPhase: 1, enabled: true,
  },
  'holaon-horse-archer': {
    id: 'holaon-horse-archer', label: '기마 궁수', archetype: 'horseArcher',
    tags: ['mounted', 'ranged'], factions: ['holaon'], intelCategory: '궁기병',
    defaultLine: 'middle', implementationPhase: 1, enabled: true,
  },
  'holaon-raider': {
    id: 'holaon-raider', label: '약탈 기병', archetype: 'lightCavalry',
    tags: ['mounted', 'scout'], factions: ['holaon'], intelCategory: '경기병',
    defaultLine: 'front', implementationPhase: 1, enabled: true,
  },
  'bandit-vanguard': {
    id: 'bandit-vanguard', label: '두목 친위대', archetype: 'meleeInfantry',
    tags: ['infantry', 'shock'], factions: ['bandit'], intelCategory: '근접 보병',
    defaultLine: 'front', implementationPhase: 1, enabled: true,
  },
  'bandit-rider': {
    id: 'bandit-rider', label: '기마 마적', archetype: 'lightCavalry',
    tags: ['mounted', 'ranged', 'scout'], factions: ['bandit'], intelCategory: '경기병',
    defaultLine: 'middle', implementationPhase: 1, enabled: true,
  },
  'bandit-looter': {
    id: 'bandit-looter', label: '약탈패', archetype: 'looterInfantry',
    tags: ['infantry'], factions: ['bandit'], intelCategory: '약탈 보병',
    defaultLine: 'front', implementationPhase: 1, enabled: true,
  },
  'court-gunner': {
    id: 'court-gunner', label: '훈련도감 포수', archetype: 'musketeer',
    tags: ['infantry', 'ranged', 'firearm'], factions: ['court'], intelCategory: '총포수',
    defaultLine: 'middle', implementationPhase: 1, enabled: true,
  },
  'court-archer': {
    id: 'court-archer', label: '훈련도감 사수', archetype: 'footArcher',
    tags: ['infantry', 'ranged'], factions: ['court'], intelCategory: '궁병',
    defaultLine: 'middle', implementationPhase: 1, enabled: true,
  },
  'court-melee': {
    id: 'court-melee', label: '훈련도감 살수', archetype: 'meleeInfantry',
    tags: ['infantry', 'shock'], factions: ['court'], intelCategory: '근접 보병',
    defaultLine: 'front', implementationPhase: 1, enabled: true,
  },
  'court-cavalry': {
    id: 'court-cavalry', label: '기창 기병', archetype: 'lancerCavalry',
    tags: ['mounted', 'shock'], factions: ['court'], intelCategory: '창기병',
    defaultLine: 'front', implementationPhase: 1, enabled: true,
  },
  'court-artillery': {
    id: 'court-artillery', label: '불랑기 화포', archetype: 'directArtillery',
    tags: ['artillery', 'firearm', 'siege'], factions: ['court'], intelCategory: '직사 화포',
    defaultLine: 'rear', implementationPhase: 1, enabled: true,
  },
  'shield-infantry': {
    id: 'shield-infantry', label: '방패꾼', archetype: 'shieldInfantry',
    tags: ['infantry', 'shielded'], factions: ['nimacha', 'bandit'], intelCategory: '방패보병',
    defaultLine: 'front', implementationPhase: 2, enabled: true,
  },
  'deserter-musketeer': {
    id: 'deserter-musketeer', label: '탈영 총포수', archetype: 'musketeer',
    tags: ['infantry', 'ranged', 'firearm'], factions: ['bandit'], intelCategory: '총포수',
    defaultLine: 'middle', implementationPhase: 2, enabled: true,
  },
  'wall-breaker': {
    id: 'wall-breaker', label: '파책조', archetype: 'wallBreaker',
    tags: ['infantry', 'siege'], factions: ['nimacha', 'bandit', 'court'], intelCategory: '파책 도구',
    defaultLine: 'front', implementationPhase: 2, enabled: true,
  },
  'court-shield': {
    id: 'court-shield', label: '방패수', archetype: 'shieldInfantry',
    tags: ['infantry', 'shielded'], factions: ['court'], intelCategory: '방패보병',
    defaultLine: 'front', implementationPhase: 2, enabled: true,
  },
  'court-horse-archer': {
    id: 'court-horse-archer', label: '관군 궁기병', archetype: 'horseArcher',
    tags: ['mounted', 'ranged'], factions: ['court'], intelCategory: '궁기병',
    defaultLine: 'middle', implementationPhase: 2, enabled: true,
  },
  'court-medic': {
    id: 'court-medic', label: '의원대', archetype: 'medic',
    tags: ['infantry', 'support'], factions: ['court'], intelCategory: '의료 지원',
    defaultLine: 'rear', implementationPhase: 8, enabled: false,
  },
  'court-hwacha': {
    id: 'court-hwacha', label: '화차', archetype: 'indirectArtillery',
    tags: ['artillery', 'ranged', 'firearm', 'indirectFire', 'support'], factions: ['court'],
    intelCategory: '중화기 징후', defaultLine: 'rear', implementationPhase: 8, enabled: false,
  },
};

export const TACTICAL_UNIT_PROFILE_IDS = Object.freeze(Object.keys(PROFILES) as RaiderUnitType[]);

export function tacticalUnitProfile(id: RaiderUnitType): TacticalUnitProfile {
  const identity = PROFILES[id];
  return { ...identity, ...ARCHETYPE_COMBAT[identity.archetype] };
}

export function tacticalUnitProfileOrUndefined(
  id: RaiderUnitType | string | undefined,
): TacticalUnitProfile | undefined {
  return id && Object.prototype.hasOwnProperty.call(PROFILES, id)
    ? tacticalUnitProfile(id as RaiderUnitType)
    : undefined;
}

export function tacticalUnitProfiles(): readonly TacticalUnitProfile[] {
  return TACTICAL_UNIT_PROFILE_IDS.map(tacticalUnitProfile);
}

export function tacticalUnitProfilesForFaction(
  faction: TacticalEnemyFactionId,
  maximumPhase: 1 | 2 | 8 = 8,
): readonly TacticalUnitProfile[] {
  return tacticalUnitProfiles().filter(profile =>
    profile.factions.includes(faction) && profile.implementationPhase <= maximumPhase);
}

