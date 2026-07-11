import type { Gender, JobId } from '../game/types';

export const SPECIALIZED_CHARACTER_SHEET = {
  residentWidth: 28,
  spriteHeight: 40,
  columns: 3,
  rows: 2,
  src: '/assets/specialized-workers-v1.png',
} as const;

const COLUMNS: Partial<Record<JobId, number>> = {
  woodSplitter: 0,
  tanner: 1,
  weaver: 2,
};

export function isSpecializedCharacterJob(job: JobId): boolean {
  return COLUMNS[job] != null;
}

export function specializedResidentSourceRect(job: JobId, gender: Gender) {
  const column = COLUMNS[job];
  if (column == null) return null;
  return {
    sx: column * SPECIALIZED_CHARACTER_SHEET.residentWidth,
    sy: (gender === 'female' ? 1 : 0) * SPECIALIZED_CHARACTER_SHEET.spriteHeight,
    sw: SPECIALIZED_CHARACTER_SHEET.residentWidth,
    sh: SPECIALIZED_CHARACTER_SHEET.spriteHeight,
  };
}
