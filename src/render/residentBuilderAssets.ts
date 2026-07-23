import type { Gender } from '../game/types';

export const RESIDENT_BUILDER_WORK_SHEET = {
  frameSize: 40,
  columns: 4,
  rows: 2,
  frameDurationMsByGender: {
    male: 167,
    female: 200,
  },
  src: '/assets/resident-builder-work-v1.png',
} as const;

export const RESIDENT_BUILDER_LOCOMOTION_SHEET = {
  frameSize: 40,
  columns: 3,
  rows: 2,
  frameDurationMs: 200,
  src: '/assets/resident-builder-locomotion-v1.png',
} as const;

const BUILDER_WORK_SEQUENCE = [0, 1, 2, 3] as const;
const BUILDER_WALK_SEQUENCE = [0, 1, 0, 2] as const;

export function builderWorkFrameIndex(gender: Gender, elapsedMs: number): number {
  const duration = RESIDENT_BUILDER_WORK_SHEET.frameDurationMsByGender[gender];
  const step = Math.floor(Math.max(0, elapsedMs) / duration);
  return BUILDER_WORK_SEQUENCE[step % BUILDER_WORK_SEQUENCE.length];
}

export function builderLocomotionFrameIndex(moving: boolean, elapsedMs: number): number {
  if (!moving) return 0;
  const step = Math.floor(
    Math.max(0, elapsedMs) / RESIDENT_BUILDER_LOCOMOTION_SHEET.frameDurationMs,
  );
  return BUILDER_WALK_SEQUENCE[step % BUILDER_WALK_SEQUENCE.length];
}

function sourceRect(frameSize: number, gender: Gender, frame: number) {
  return {
    sx: frame * frameSize,
    sy: (gender === 'female' ? 1 : 0) * frameSize,
    sw: frameSize,
    sh: frameSize,
  };
}

export function builderWorkSourceRect(gender: Gender, elapsedMs: number) {
  return sourceRect(
    RESIDENT_BUILDER_WORK_SHEET.frameSize,
    gender,
    builderWorkFrameIndex(gender, elapsedMs),
  );
}

export function builderLocomotionSourceRect(gender: Gender, moving: boolean, elapsedMs: number) {
  return sourceRect(
    RESIDENT_BUILDER_LOCOMOTION_SHEET.frameSize,
    gender,
    builderLocomotionFrameIndex(moving, elapsedMs),
  );
}
