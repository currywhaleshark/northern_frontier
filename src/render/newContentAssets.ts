import type { BuildingTypeId, Gender, JobId, LifeStage, Season } from '../game/types';

export const NEW_CONTENT_BUILDING_SHEET = {
  tileSize: 28,
  spriteHeight: 40,
  columns: 8,
  rows: 2,
  src: '/assets/new-content-buildings-v2.png',
} as const;

export const NEW_CONTENT_LARGE_BUILDING_SHEET = {
  tileSize: 56,
  spriteHeight: 80,
  columns: 8,
  rows: 2,
  src: '/assets/new-content-buildings-large-v2.png',
} as const;

export const NEW_CONTENT_RESIDENT_SHEET = {
  residentWidth: 28,
  spriteHeight: 40,
  columns: 2,
  rows: 9,
  src: '/assets/new-content-residents-v2.png',
} as const;

const BUILDING_COLUMNS: Partial<Record<BuildingTypeId, number>> = {
  cellar: 0,
  smokehouse: 1,
  dryingRack: 2,
  onggiKiln: 3,
  jangdokdae: 4,
  clinic: 5,
  cemetery: 6,
  school: 7,
};

const YOUTH_JOB_ROWS: Partial<Record<JobId, number>> = {
  idle: 4,
  hauler: 5,
  farmer: 6,
  woodSplitter: 7,
  herder: 8,
};

export function isNewContentBuildingType(type: BuildingTypeId): boolean {
  return BUILDING_COLUMNS[type] != null;
}

export function newContentBuildingSourceRect(type: BuildingTypeId, season: Season, large = false) {
  const column = BUILDING_COLUMNS[type];
  if (column == null) return null;
  const sheet = large ? NEW_CONTENT_LARGE_BUILDING_SHEET : NEW_CONTENT_BUILDING_SHEET;
  return {
    sx: column * sheet.tileSize,
    sy: (season === 'winter' ? 1 : 0) * sheet.spriteHeight,
    sw: sheet.tileSize,
    sh: sheet.spriteHeight,
  };
}

export function newContentResidentSourceRect(job: JobId, gender: Gender, stage?: LifeStage | null) {
  const row = stage === 'infant'
    ? 0
    : stage === 'child'
      ? 1
      : stage === 'youth'
        ? YOUTH_JOB_ROWS[job] ?? null
        : job === 'undertaker'
          ? 2
          : job === 'teacher'
            ? 3
            : null;
  if (row == null) return null;
  return {
    sx: (gender === 'female' ? 1 : 0) * NEW_CONTENT_RESIDENT_SHEET.residentWidth,
    sy: row * NEW_CONTENT_RESIDENT_SHEET.spriteHeight,
    sw: NEW_CONTENT_RESIDENT_SHEET.residentWidth,
    sh: NEW_CONTENT_RESIDENT_SHEET.spriteHeight,
  };
}
