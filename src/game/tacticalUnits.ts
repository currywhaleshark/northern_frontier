import type {
  RaiderUnitType, TacticalEnemyFactionId, TacticalUnitProfile,
} from './types';

const PROFILES: Record<RaiderUnitType, TacticalUnitProfile> = {
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
    defaultLine: 'front', implementationPhase: 2, enabled: false,
  },
  'deserter-musketeer': {
    id: 'deserter-musketeer', label: '탈영 총포수', archetype: 'musketeer',
    tags: ['infantry', 'ranged', 'firearm'], factions: ['bandit'], intelCategory: '총포수',
    defaultLine: 'middle', implementationPhase: 2, enabled: false,
  },
  'wall-breaker': {
    id: 'wall-breaker', label: '파책조', archetype: 'wallBreaker',
    tags: ['infantry', 'siege'], factions: ['nimacha', 'bandit'], intelCategory: '파책 도구',
    defaultLine: 'front', implementationPhase: 2, enabled: false,
  },
  'court-shield': {
    id: 'court-shield', label: '방패수', archetype: 'shieldInfantry',
    tags: ['infantry', 'shielded'], factions: ['court'], intelCategory: '방패보병',
    defaultLine: 'front', implementationPhase: 2, enabled: false,
  },
  'court-horse-archer': {
    id: 'court-horse-archer', label: '관군 궁기병', archetype: 'horseArcher',
    tags: ['mounted', 'ranged'], factions: ['court'], intelCategory: '궁기병',
    defaultLine: 'middle', implementationPhase: 2, enabled: false,
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
  return PROFILES[id];
}

export function tacticalUnitProfiles(): readonly TacticalUnitProfile[] {
  return TACTICAL_UNIT_PROFILE_IDS.map(id => PROFILES[id]);
}

export function tacticalUnitProfilesForFaction(
  faction: TacticalEnemyFactionId,
  maximumPhase: 1 | 2 | 8 = 8,
): readonly TacticalUnitProfile[] {
  return tacticalUnitProfiles().filter(profile =>
    profile.factions.includes(faction) && profile.implementationPhase <= maximumPhase);
}

