import type { Gender, LifeStage, ReligiousVocation } from '../game/types';

export const RELIGIOUS_SUCCESSOR_SHEETS = {
  standard: {
    residentWidth: 28,
    spriteHeight: 40,
    src: '/assets/religious-successors-static-v1.png',
  },
  highDefinition: {
    residentWidth: 56,
    spriteHeight: 80,
    src: '/assets/religious-successors-static-hd-v1.png',
  },
  columns: 3,
  rows: 2,
} as const;

export function religiousSuccessorSourceRect(
  vocation: ReligiousVocation | undefined,
  gender: Gender,
  stage: LifeStage | null | undefined,
  highDefinition: boolean,
) {
  if (!vocation) return null;
  const novice = vocation === 'monk' && stage != null;
  const column = vocation === 'shaman' ? 0 : novice ? 2 : 1;
  const row = gender === 'female' ? 1 : 0;
  const sheet = highDefinition
    ? RELIGIOUS_SUCCESSOR_SHEETS.highDefinition
    : RELIGIOUS_SUCCESSOR_SHEETS.standard;
  return {
    sx: column * sheet.residentWidth,
    sy: row * sheet.spriteHeight,
    sw: sheet.residentWidth,
    sh: sheet.spriteHeight,
  };
}
