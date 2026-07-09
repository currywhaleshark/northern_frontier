import type { Gender, JobId } from '../game/types';

export const GENERATED_CHARACTER_SHEET = {
  residentWidth: 28,
  mountedWidth: 56,
  spriteHeight: 40,
  residentColumns: 10,
  rows: 2,
  src: '/assets/folk-characters-generated-v1.png',
} as const;

const RESIDENT_COLUMNS: Record<JobId, number> = {
  idle: 0,
  woodcutter: 1,
  hunter: 2,
  farmer: 3,
  builder: 4,
  hauler: 5,
  herbalist: 6,
  smith: 7,
  miner: 7,
  fisher: 2,
  charcoalBurner: 7,
  herder: 5,
  tanner: 5,
  powderMaker: 7,
  clerk: 5,
  watchman: 8,
  militia: 9,
};

const GENDER_ROWS: Record<Gender, number> = {
  male: 0,
  female: 1,
};

export function generatedCharacterFacingScale(facing: 1 | -1 | undefined): 1 | -1 {
  return facing === 1 ? -1 : 1;
}
export function generatedResidentSourceRect(job: JobId, gender: Gender) {
  const col = RESIDENT_COLUMNS[job];
  const row = GENDER_ROWS[gender];
  return {
    sx: col * GENERATED_CHARACTER_SHEET.residentWidth,
    sy: row * GENERATED_CHARACTER_SHEET.spriteHeight,
    sw: GENERATED_CHARACTER_SHEET.residentWidth,
    sh: GENERATED_CHARACTER_SHEET.spriteHeight,
  };
}

export function generatedMountedRaiderSourceRect(index: number) {
  const row = Math.abs(Math.trunc(index)) % GENERATED_CHARACTER_SHEET.rows;
  return {
    sx: GENERATED_CHARACTER_SHEET.residentColumns * GENERATED_CHARACTER_SHEET.residentWidth,
    sy: row * GENERATED_CHARACTER_SHEET.spriteHeight,
    sw: GENERATED_CHARACTER_SHEET.mountedWidth,
    sh: GENERATED_CHARACTER_SHEET.spriteHeight,
  };
}
