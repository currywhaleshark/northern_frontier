import type { Gender } from '../game/types';

export const RESIDENT_MINER_LOCOMOTION_SHEET = {
  frameSize: 40,
  columns: 3,
  rows: 2,
  frameDurationMs: 140,
  src: '/assets/resident-miner-locomotion-v1.png',
} as const;

export const RESIDENT_MINER_WORK_SHEET = {
  frameSize: 40,
  columns: 3,
  rows: 2,
  frameDurationMs: 160,
  src: '/assets/resident-miner-work-v1.png',
} as const;

export const RESIDENT_MINER_LOAD_SHEET = {
  frameSize: 40,
  columns: 3,
  rows: 2,
  frameDurationMs: 140,
  src: '/assets/resident-miner-load-v1.png',
} as const;

const MINER_WALK_SEQUENCE = [0, 1, 0, 2] as const;
const MINER_WORK_SEQUENCE = [0, 1, 2, 1] as const;

export function minerLocomotionFrameIndex(moving: boolean, elapsedMs: number): number {
  if (!moving) return 0;
  const step = Math.floor(Math.max(0, elapsedMs) / RESIDENT_MINER_LOCOMOTION_SHEET.frameDurationMs);
  return MINER_WALK_SEQUENCE[step % MINER_WALK_SEQUENCE.length];
}

export function minerWorkFrameIndex(elapsedMs: number): number {
  const step = Math.floor(Math.max(0, elapsedMs) / RESIDENT_MINER_WORK_SHEET.frameDurationMs);
  return MINER_WORK_SEQUENCE[step % MINER_WORK_SEQUENCE.length];
}

function sourceRect(frameSize: number, gender: Gender, frame: number) {
  return {
    sx: frame * frameSize,
    sy: (gender === 'female' ? 1 : 0) * frameSize,
    sw: frameSize,
    sh: frameSize,
  };
}

export function minerLocomotionSourceRect(gender: Gender, moving: boolean, elapsedMs: number) {
  return sourceRect(
    RESIDENT_MINER_LOCOMOTION_SHEET.frameSize,
    gender,
    minerLocomotionFrameIndex(moving, elapsedMs),
  );
}

export function minerWorkSourceRect(gender: Gender, elapsedMs: number) {
  return sourceRect(RESIDENT_MINER_WORK_SHEET.frameSize, gender, minerWorkFrameIndex(elapsedMs));
}

export function minerLoadSourceRect(gender: Gender, moving: boolean, elapsedMs: number) {
  return sourceRect(
    RESIDENT_MINER_LOAD_SHEET.frameSize,
    gender,
    minerLocomotionFrameIndex(moving, elapsedMs),
  );
}
