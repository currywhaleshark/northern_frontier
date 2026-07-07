import type { Gender } from '../game/types';

export const MILITIA_WEAPON_TYPES = ['spears', 'hornBows', 'muskets'] as const;
export type MilitiaWeaponSpriteId = (typeof MILITIA_WEAPON_TYPES)[number];

export const MILITIA_WEAPON_SHEET = {
  residentWidth: 28,
  spriteHeight: 40,
  columns: MILITIA_WEAPON_TYPES.length,
  rows: 2,
  src: '/assets/militia-weapons-generated-v1.png',
} as const;

const MILITIA_WEAPON_COLUMNS: Record<MilitiaWeaponSpriteId, number> = {
  spears: 0,
  hornBows: 1,
  muskets: 2,
};

const GENDER_ROWS: Record<Gender, number> = {
  male: 0,
  female: 1,
};

export function militiaWeaponSourceRect(weapon: MilitiaWeaponSpriteId, gender: Gender) {
  const width = MILITIA_WEAPON_SHEET.residentWidth;
  const height = MILITIA_WEAPON_SHEET.spriteHeight;
  return {
    sx: MILITIA_WEAPON_COLUMNS[weapon] * width,
    sy: GENDER_ROWS[gender] * height,
    sw: width,
    sh: height,
  };
}
