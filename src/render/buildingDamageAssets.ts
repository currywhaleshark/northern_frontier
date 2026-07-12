import type { Season } from '../game/types';

export const BUILDING_DAMAGE_SHEET = {
  spriteWidth: 56,
  spriteHeight: 80,
  columns: 2,
  rows: 1,
  src: '/assets/building-damage-v1.png',
} as const;

export function buildingDamageSourceRect(season: Season) {
  return {
    sx: (season === 'winter' ? 1 : 0) * BUILDING_DAMAGE_SHEET.spriteWidth,
    sy: 0,
    sw: BUILDING_DAMAGE_SHEET.spriteWidth,
    sh: BUILDING_DAMAGE_SHEET.spriteHeight,
  };
}
