import type { Gender } from '../game/types';

export const FOREIGN_RESIDENT_SHEET = {
  spriteWidth: 28,
  spriteHeight: 40,
  columns: 4,
  rows: 2,
  src: '/assets/foreign-residents-v1.png',
} as const;

export const FOREIGN_SITE_CORE_SHEET = {
  spriteWidth: 56,
  spriteHeight: 80,
  columns: 5,
  rows: 1,
  src: '/assets/foreign-site-cores-v1.png',
} as const;

export const FOREIGN_SITE_PROP_SHEET = {
  spriteWidth: 28,
  spriteHeight: 40,
  columns: 5,
  rows: 1,
  src: '/assets/foreign-site-props-v1.png',
} as const;

const RESIDENT_COLUMNS: Record<string, number> = {
  '오도리 씨족': 0,
  '올량합 부락': 1,
  '골간 우디캐': 2,
  '니마차 우디캐': 3,
};

const STRUCTURE_COLUMNS: Record<string, number> = {
  ...RESIDENT_COLUMNS,
  '변경 마적': 4,
};

export function foreignResidentSourceRect(factionName: string | undefined, gender: Gender) {
  const column = factionName == null ? undefined : RESIDENT_COLUMNS[factionName];
  if (column == null) return null;
  return {
    sx: column * FOREIGN_RESIDENT_SHEET.spriteWidth,
    sy: (gender === 'female' ? 1 : 0) * FOREIGN_RESIDENT_SHEET.spriteHeight,
    sw: FOREIGN_RESIDENT_SHEET.spriteWidth,
    sh: FOREIGN_RESIDENT_SHEET.spriteHeight,
  };
}

export function foreignStructureSourceRect(factionName: string | null, variant: 'core' | 'prop') {
  const column = factionName == null ? undefined : STRUCTURE_COLUMNS[factionName];
  if (column == null) return null;
  const sheet = variant === 'core' ? FOREIGN_SITE_CORE_SHEET : FOREIGN_SITE_PROP_SHEET;
  return {
    sx: column * sheet.spriteWidth,
    sy: 0,
    sw: sheet.spriteWidth,
    sh: sheet.spriteHeight,
  };
}
