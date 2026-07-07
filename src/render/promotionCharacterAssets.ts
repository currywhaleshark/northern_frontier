import type { Gender, JobId } from '../game/types';

export const PROMOTION_CHARACTER_JOBS = [
  'miner',
  'fisher',
  'charcoalBurner',
  'herder',
  'powderMaker',
  'clerk',
] as const satisfies readonly JobId[];

export const PROMOTION_CHARACTER_SHEET = {
  residentWidth: 28,
  spriteHeight: 40,
  columns: PROMOTION_CHARACTER_JOBS.length,
  rows: 2,
  src: '/assets/promotion-characters-generated-v1.png',
} as const;

const PROMOTION_CHARACTER_COLUMNS: Partial<Record<JobId, number>> = Object.fromEntries(
  PROMOTION_CHARACTER_JOBS.map((job, index) => [job, index]),
) as Partial<Record<JobId, number>>;

const GENDER_ROWS: Record<Gender, number> = {
  male: 0,
  female: 1,
};

export function isPromotionCharacterJob(job: JobId): boolean {
  return PROMOTION_CHARACTER_COLUMNS[job] != null;
}

export function promotionResidentSourceRect(job: JobId, gender: Gender) {
  const col = PROMOTION_CHARACTER_COLUMNS[job];
  if (col == null) return null;
  const width = PROMOTION_CHARACTER_SHEET.residentWidth;
  const height = PROMOTION_CHARACTER_SHEET.spriteHeight;
  return {
    sx: col * width,
    sy: GENDER_ROWS[gender] * height,
    sw: width,
    sh: height,
  };
}
