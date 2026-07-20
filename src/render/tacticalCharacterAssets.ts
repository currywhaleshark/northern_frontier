export const TACTICAL_CHARACTER_SHEET = {
  residentWidth: 84,
  mountedWidth: 168,
  spriteHeight: 120,
  residentColumns: 10,
  rows: 2,
  src: '/assets/tactical/folk-characters-tactical-v1.png',
} as const;

export const TACTICAL_MILITIA_SHEET = {
  residentWidth: 84,
  spriteHeight: 120,
  columns: 3,
  rows: 2,
  src: '/assets/tactical/militia-weapons-tactical-v1.png',
} as const;

export const TACTICAL_RAIDER_SHEET = {
  spriteWidth: 168,
  spriteHeight: 120,
  columns: 6,
  src: '/assets/tactical/faction-raiders-tactical-v1.png',
} as const;

export const TACTICAL_COURT_ARMY_SHEET = {
  spriteWidth: 168,
  spriteHeight: 120,
  columns: 5,
  src: '/assets/tactical/court-army-tactical-v1.png',
} as const;

export type TacticalSpritePose = 'idle' | 'attack' | 'hurt' | 'wounded';

export interface TacticalMuzzleAnchor {
  x: number;
  y: number;
  size: 'musket' | 'cannon';
}

export const TACTICAL_POSE_ROWS: Readonly<Record<TacticalSpritePose, number>> = {
  idle: 0,
  attack: 1,
  hurt: 2,
  wounded: 3,
};

export const TACTICAL_DEFENDER_ROLE_POSE_SHEET = {
  spriteWidth: 84,
  spriteHeight: 120,
  columns: 8,
  rows: 4,
  src: '/assets/tactical/defender-roles-poses-v2.png',
} as const;

export const TACTICAL_DEFENDER_WEAPON_POSE_SHEET = {
  spriteWidth: 84,
  spriteHeight: 120,
  columns: 6,
  rows: 4,
  src: '/assets/tactical/defender-weapons-poses-v2.png',
} as const;

export const TACTICAL_HEALER_POSE_SHEET = {
  spriteWidth: 84,
  spriteHeight: 120,
  columns: 2,
  rows: 4,
  src: '/assets/tactical/defender-healers-poses-v1.png',
} as const;

export const TACTICAL_SPECIAL_RESIDENT_POSE_SHEET = {
  spriteWidth: 84,
  spriteHeight: 120,
  columns: 4,
  rows: 4,
  src: '/assets/tactical/special-resident-combat-poses-v1.png',
} as const;

export const TACTICAL_DEFENDER_DEFAULT_WEAPON_POSE_SHEET = {
  spriteWidth: 84,
  spriteHeight: 120,
  columns: 6,
  rows: 4,
  src: '/assets/tactical/defender-default-weapons-poses-v1.png',
} as const;

export const TACTICAL_RAIDER_POSE_SHEET = {
  spriteWidth: 168,
  spriteHeight: 120,
  columns: 6,
  rows: 4,
  src: '/assets/tactical/faction-raiders-poses-v2.png',
} as const;

export const TACTICAL_COURT_POSE_SHEET = {
  spriteWidth: 168,
  spriteHeight: 120,
  columns: 5,
  rows: 4,
  src: '/assets/tactical/court-army-poses-v2.png',
} as const;

export const TACTICAL_COURT_SUPPORT_POSE_SHEET = {
  spriteWidth: 168,
  spriteHeight: 120,
  columns: 2,
  rows: 4,
  src: '/assets/tactical/court-support-poses-v1.png',
} as const;

export const TACTICAL_MOUNTED_DEFENDER_POSE_SHEET = {
  spriteWidth: 168,
  spriteHeight: 120,
  columns: 16,
  rows: 4,
  src: '/assets/tactical/defender-mounted-poses-v1.png',
} as const;

export const TACTICAL_NIMACHA_UNIT_POSE_SHEET = {
  spriteWidth: 168,
  spriteHeight: 120,
  columns: 5,
  rows: 4,
  src: '/assets/tactical/nimacha-unit-poses-v1.png',
} as const;

export const TACTICAL_HOLAON_UNIT_POSE_SHEET = {
  spriteWidth: 168,
  spriteHeight: 120,
  columns: 3,
  rows: 4,
  src: '/assets/tactical/holaon-unit-poses-v1.png',
} as const;

export const TACTICAL_BANDIT_UNIT_POSE_SHEET = {
  spriteWidth: 168,
  spriteHeight: 120,
  columns: 6,
  rows: 4,
  src: '/assets/tactical/bandit-unit-poses-v1.png',
} as const;

export const TACTICAL_COURT_EXPANDED_POSE_SHEET = {
  spriteWidth: 168,
  spriteHeight: 120,
  columns: 3,
  rows: 4,
  src: '/assets/tactical/court-expanded-poses-v1.png',
} as const;

const ROLE_COLUMNS = {
  civilian: 0,
  militia: 2,
  watchman: 4,
  hunter: 6,
  healer: 0,
} as const;

const WEAPON_COLUMNS = {
  spear: 0,
  hornBow: 2,
  musket: 4,
} as const;

const SPECIAL_RESIDENT_COLUMNS: Partial<Record<SpecialResidentId, number>> = {
  jurchenWarrior: 0,
  tigerHunter: 1,
  uinyeo: 2,
  hangwae: 3,
};

function tacticalSpecialResidentColumn(
  role: import('../game/combatRoster').CombatRole,
  weapon: import('../game/types').CombatWeaponId | null,
  special?: SpecialResidentId,
): number | null {
  if (!special) return null;
  const column = SPECIAL_RESIDENT_COLUMNS[special];
  if (column == null) return null;
  if (special === 'jurchenWarrior') return role === 'militia' && weapon === 'spear' ? column : null;
  if (special === 'tigerHunter') return role === 'hunter' && weapon == null ? column : null;
  if (special === 'uinyeo') return role === 'healer' ? column : null;
  if (special === 'hangwae') return role === 'militia' && weapon === 'musket' ? column : null;
  return null;
}

export type TacticalDefaultWeaponPose = 'bambooSpear' | 'farmTools' | 'watchmanBaton';

const DEFAULT_WEAPON_COLUMNS: Readonly<Record<TacticalDefaultWeaponPose, number>> = {
  bambooSpear: 0,
  farmTools: 2,
  watchmanBaton: 4,
};

export function tacticalDefaultWeaponPose(group: Pick<
  import('../game/types').TacticalDefenderGroup,
  'id' | 'role' | 'weapon'
>): TacticalDefaultWeaponPose | null {
  if (group.weapon != null) return null;
  if (group.role === 'watchman') return 'watchmanBaton';
  if (group.role !== 'militia') return null;
  return group.id.includes('levy') || group.id.includes('mustered') ? 'farmTools' : 'bambooSpear';
}

export function tacticalDefenderPoseCell(
  role: import('../game/combatRoster').CombatRole,
  weapon: import('../game/types').CombatWeaponId | null,
  gender: 'male' | 'female',
  pose: TacticalSpritePose,
  defaultWeapon: TacticalDefaultWeaponPose | null = null,
  special?: SpecialResidentId,
): {
  sheet: 'roles' | 'weapons' | 'defaultWeapons' | 'healers' | 'specialResidents';
  column: number;
  row: number;
} {
  const genderOffset = gender === 'female' ? 1 : 0;
  const specialColumn = tacticalSpecialResidentColumn(role, weapon, special);
  if (specialColumn != null) {
    return { sheet: 'specialResidents', column: specialColumn, row: TACTICAL_POSE_ROWS[pose] };
  }
  if (weapon) {
    return { sheet: 'weapons', column: WEAPON_COLUMNS[weapon] + genderOffset, row: TACTICAL_POSE_ROWS[pose] };
  }
  if (defaultWeapon) {
    return {
      sheet: 'defaultWeapons',
      column: DEFAULT_WEAPON_COLUMNS[defaultWeapon] + genderOffset,
      row: TACTICAL_POSE_ROWS[pose],
    };
  }
  if (role === 'healer') {
    return { sheet: 'healers', column: genderOffset, row: TACTICAL_POSE_ROWS[pose] };
  }
  return { sheet: 'roles', column: ROLE_COLUMNS[role] + genderOffset, row: TACTICAL_POSE_ROWS[pose] };
}

export function tacticalMountedDefenderPoseCell(
  role: import('../game/combatRoster').CombatRole,
  weapon: import('../game/types').CombatWeaponId | null,
  gender: 'male' | 'female',
  pose: TacticalSpritePose,
  defaultWeapon: TacticalDefaultWeaponPose | null = null,
  special?: SpecialResidentId,
): { column: number; row: number } {
  const specialColumn = special == null ? null : SPECIAL_MOUNTED_COLUMNS[special];
  if (specialColumn != null) {
    return { column: specialColumn, row: TACTICAL_POSE_ROWS[pose] };
  }
  const genderOffset = gender === 'female' ? 1 : 0;
  const loadoutColumn = weapon === 'spear'
    ? 6
    : weapon === 'hornBow'
      ? 8
      : weapon === 'musket'
        ? 10
        : defaultWeapon === 'watchmanBaton' || role === 'watchman'
          ? 2
          : role === 'hunter'
            ? 4
            : 0;
  return { column: loadoutColumn + genderOffset, row: TACTICAL_POSE_ROWS[pose] };
}

export function tacticalMountedDefenderMuzzleAnchor(
  weapon: import('../game/types').CombatWeaponId | null,
  gender: 'male' | 'female',
  special?: SpecialResidentId,
): TacticalMuzzleAnchor | null {
  if (weapon !== 'musket') return null;
  if (special === 'hangwae') return { x: 8, y: 46, size: 'musket' };
  return { x: gender === 'female' ? 15 : 13, y: 47, size: 'musket' };
}

export function tacticalDefenderMuzzleAnchor(
  weapon: import('../game/types').CombatWeaponId | null,
  gender: 'male' | 'female',
  special?: SpecialResidentId,
): TacticalMuzzleAnchor | null {
  if (weapon !== 'musket') return null;
  if (special === 'hangwae') return { x: 4, y: 60, size: 'musket' };
  return { x: gender === 'female' ? 19 : 17, y: 47, size: 'musket' };
}

export const TACTICAL_BEAST_SHEETS = {
  wolf: '/assets/tactical/beasts/wolf/sheet-transparent.png',
  tiger: '/assets/tactical/beasts/tiger/sheet-transparent.png',
  greatTiger: '/assets/tactical/beasts/great-tiger/sheet-transparent.png',
  mountainLord: '/assets/tactical/beasts/mountain-lord/sheet-transparent.png',
} as const;

export function tacticalBeastSheet(kind: PredatorKind, tigerTier?: TigerTier): string {
  return kind === 'wolf' ? TACTICAL_BEAST_SHEETS.wolf : TACTICAL_BEAST_SHEETS[tigerTier ?? 'tiger'];
}

const RAIDER_COLUMNS: Record<string, number> = {
  '오도리 씨족': 0,
  '올량합 부락': 1,
  '골간 우디캐': 2,
  '니마차 우디캐': 3,
  '홀라온 야인': 4,
  '변경 마적': 5,
};

export function tacticalRaiderColumn(faction: string): number | null {
  return RAIDER_COLUMNS[faction] ?? null;
}

export function tacticalRaiderPoseCell(
  faction: string,
  pose: TacticalSpritePose,
): { column: number; row: number } | null {
  const column = tacticalRaiderColumn(faction);
  return column == null ? null : { column, row: TACTICAL_POSE_ROWS[pose] };
}

type TacticalExpandedRaiderSheet = 'nimachaUnits' | 'holaonUnits' | 'banditUnits' | 'courtExpanded';

const EXPANDED_RAIDER_COLUMNS: Readonly<Record<string, {
  sheet: TacticalExpandedRaiderSheet;
  faction: string;
  columns: Partial<Record<import('../game/types').RaiderUnitType, number>>;
}>> = {
  nimacha: {
    sheet: 'nimachaUnits',
    faction: '니마차 우디캐',
    columns: {
      'nimacha-hunter': 0,
      'nimacha-spearman': 1,
      'nimacha-looter': 2,
      'shield-infantry': 3,
      'wall-breaker': 4,
    },
  },
  holaon: {
    sheet: 'holaonUnits',
    faction: '홀라온 야인',
    columns: {
      'holaon-lancer': 0,
      'holaon-horse-archer': 1,
      'holaon-raider': 2,
    },
  },
  bandit: {
    sheet: 'banditUnits',
    faction: '변경 마적',
    columns: {
      'bandit-vanguard': 0,
      'bandit-rider': 1,
      'bandit-looter': 2,
      'shield-infantry': 3,
      'deserter-musketeer': 4,
      'wall-breaker': 5,
    },
  },
  court: {
    sheet: 'courtExpanded',
    faction: '조정 토벌군',
    columns: {
      'court-shield': 0,
      'court-horse-archer': 1,
      'wall-breaker': 2,
    },
  },
};

const SPECIAL_MOUNTED_COLUMNS: Readonly<Partial<Record<SpecialResidentId, number>>> = {
  jurchenWarrior: 12,
  tigerHunter: 13,
  uinyeo: 14,
  hangwae: 15,
};

export function tacticalExpandedRaiderPoseCell(
  faction: string,
  unitType: import('../game/types').RaiderUnitType,
  pose: TacticalSpritePose,
): { sheet: TacticalExpandedRaiderSheet; column: number; row: number } | null {
  for (const definition of Object.values(EXPANDED_RAIDER_COLUMNS)) {
    if (definition.faction !== faction) continue;
    const column = definition.columns[unitType];
    if (column == null) return null;
    return { sheet: definition.sheet, column, row: TACTICAL_POSE_ROWS[pose] };
  }
  return null;
}

export function tacticalExpandedRaiderMuzzleAnchor(
  faction: string,
  unitType: import('../game/types').RaiderUnitType,
): TacticalMuzzleAnchor | null {
  if (faction === '변경 마적' && unitType === 'deserter-musketeer') {
    return { x: 14, y: 48, size: 'musket' };
  }
  return null;
}

const COURT_COLUMNS: Partial<Record<import('../game/types').RaiderUnitType, number>> = {
  'court-gunner': 0,
  'court-archer': 1,
  'court-melee': 2,
  'court-cavalry': 3,
  'court-artillery': 4,
};

export function tacticalCourtPoseCell(
  unitType: import('../game/types').RaiderUnitType,
  pose: TacticalSpritePose,
): { column: number; row: number } | null {
  const column = COURT_COLUMNS[unitType];
  return column == null ? null : { column, row: TACTICAL_POSE_ROWS[pose] };
}

const COURT_SUPPORT_COLUMNS: Partial<Record<import('../game/types').RaiderUnitType, number>> = {
  'court-medic': 0,
  'court-hwacha': 1,
};

export function tacticalCourtSupportPoseCell(
  unitType: import('../game/types').RaiderUnitType,
  pose: TacticalSpritePose,
): { column: number; row: number } | null {
  const column = COURT_SUPPORT_COLUMNS[unitType];
  return column == null ? null : { column, row: TACTICAL_POSE_ROWS[pose] };
}

export function tacticalCourtMuzzleAnchor(
  unitType: import('../game/types').RaiderUnitType,
): TacticalMuzzleAnchor | null {
  if (unitType === 'court-gunner') return { x: 50, y: 57, size: 'musket' };
  if (unitType === 'court-artillery') return { x: 58, y: 72, size: 'cannon' };
  if (unitType === 'court-hwacha') return { x: 34, y: 64, size: 'cannon' };
  return null;
}

import type { PredatorKind, SpecialResidentId, TigerTier } from '../game/types';
