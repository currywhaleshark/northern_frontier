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
): { sheet: 'roles' | 'weapons' | 'defaultWeapons'; column: number; row: number } {
  const genderOffset = gender === 'female' ? 1 : 0;
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
  return { sheet: 'roles', column: ROLE_COLUMNS[role] + genderOffset, row: TACTICAL_POSE_ROWS[pose] };
}

export function tacticalDefenderMuzzleAnchor(
  weapon: import('../game/types').CombatWeaponId | null,
  gender: 'male' | 'female',
): TacticalMuzzleAnchor | null {
  if (weapon !== 'musket') return null;
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
): { column: number; row: number } {
  return { column: COURT_COLUMNS[unitType] ?? 0, row: TACTICAL_POSE_ROWS[pose] };
}

export function tacticalCourtMuzzleAnchor(
  unitType: import('../game/types').RaiderUnitType,
): TacticalMuzzleAnchor | null {
  if (unitType === 'court-gunner') return { x: 50, y: 57, size: 'musket' };
  if (unitType === 'court-artillery') return { x: 58, y: 72, size: 'cannon' };
  return null;
}

import type { PredatorKind, TigerTier } from '../game/types';
