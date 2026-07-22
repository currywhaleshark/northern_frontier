import type { Gender } from '../game/types';

export const RESIDENT_HERBALIST_LOCOMOTION_SHEET = {
  frameSize: 40,
  columns: 3,
  rows: 2,
  frameDurationMs: 200,
  src: '/assets/resident-herbalist-locomotion-v1.png',
} as const;

export const RESIDENT_HERBALIST_GATHER_SHEET = {
  frameSize: 40,
  columns: 4,
  rows: 2,
  frameDurationMs: 200,
  src: '/assets/resident-herbalist-gather-v1.png',
} as const;

const HERBALIST_WALK_SEQUENCE = [0, 1, 0, 2] as const;
const HERBALIST_GATHER_SEQUENCE = [0, 1, 2, 3] as const;

export function herbalistLocomotionFrameIndex(moving: boolean, elapsedMs: number): number {
  if (!moving) return 0;
  const step = Math.floor(
    Math.max(0, elapsedMs) / RESIDENT_HERBALIST_LOCOMOTION_SHEET.frameDurationMs,
  );
  return HERBALIST_WALK_SEQUENCE[step % HERBALIST_WALK_SEQUENCE.length];
}

export function herbalistGatherFrameIndex(elapsedMs: number): number {
  const step = Math.floor(
    Math.max(0, elapsedMs) / RESIDENT_HERBALIST_GATHER_SHEET.frameDurationMs,
  );
  return HERBALIST_GATHER_SEQUENCE[step % HERBALIST_GATHER_SEQUENCE.length];
}

function sourceRect(frameSize: number, gender: Gender, frame: number) {
  return {
    sx: frame * frameSize,
    sy: (gender === 'female' ? 1 : 0) * frameSize,
    sw: frameSize,
    sh: frameSize,
  };
}

export function herbalistLocomotionSourceRect(
  gender: Gender,
  moving: boolean,
  elapsedMs: number,
) {
  return sourceRect(
    RESIDENT_HERBALIST_LOCOMOTION_SHEET.frameSize,
    gender,
    herbalistLocomotionFrameIndex(moving, elapsedMs),
  );
}

export function herbalistGatherSourceRect(gender: Gender, elapsedMs: number) {
  return sourceRect(
    RESIDENT_HERBALIST_GATHER_SHEET.frameSize,
    gender,
    herbalistGatherFrameIndex(elapsedMs),
  );
}
