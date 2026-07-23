import type { Gender } from '../game/types';

export const RESIDENT_WOODCUTTER_WORK_SHEET = {
  frameSize: 40,
  columns: 3,
  rows: 2,
  frameDurationMs: 140,
  src: '/assets/resident-woodcutter-work-v1.png',
} as const;

export const RESIDENT_WOODCUTTER_LOCOMOTION_SHEET = {
  frameSize: 40,
  columns: 4,
  rows: 2,
  frameDurationMs: 140,
  src: '/assets/resident-woodcutter-locomotion-v1.png',
} as const;

export const RESIDENT_WOODCUTTER_LOAD_SHEET = {
  frameSize: 40,
  columns: 4,
  rows: 2,
  frameDurationMs: 140,
  src: '/assets/resident-woodcutter-load-v1.png',
} as const;

const WOODCUTTER_FRAME_SEQUENCE = [0, 1, 2, 1] as const;
const WOODCUTTER_WALK_SEQUENCE = [0, 1, 0, 3] as const;

export function woodcutterWorkFrameIndex(elapsedMs: number): number {
  const step = Math.floor(Math.max(0, elapsedMs) / RESIDENT_WOODCUTTER_WORK_SHEET.frameDurationMs);
  return WOODCUTTER_FRAME_SEQUENCE[step % WOODCUTTER_FRAME_SEQUENCE.length];
}

export function woodcutterWorkSourceRect(gender: Gender, elapsedMs: number) {
  const frameSize = RESIDENT_WOODCUTTER_WORK_SHEET.frameSize;
  return {
    sx: woodcutterWorkFrameIndex(elapsedMs) * frameSize,
    sy: (gender === 'female' ? 1 : 0) * frameSize,
    sw: frameSize,
    sh: frameSize,
  };
}

export function woodcutterLocomotionFrameIndex(moving: boolean, elapsedMs: number): number {
  if (!moving) return 0;
  const step = Math.floor(Math.max(0, elapsedMs) / RESIDENT_WOODCUTTER_LOCOMOTION_SHEET.frameDurationMs);
  return WOODCUTTER_WALK_SEQUENCE[step % WOODCUTTER_WALK_SEQUENCE.length];
}

function locomotionSourceRect(gender: Gender, moving: boolean, elapsedMs: number) {
  const frameSize = RESIDENT_WOODCUTTER_LOCOMOTION_SHEET.frameSize;
  return {
    sx: woodcutterLocomotionFrameIndex(moving, elapsedMs) * frameSize,
    sy: (gender === 'female' ? 1 : 0) * frameSize,
    sw: frameSize,
    sh: frameSize,
  };
}

export function woodcutterLocomotionSourceRect(gender: Gender, moving: boolean, elapsedMs: number) {
  return locomotionSourceRect(gender, moving, elapsedMs);
}

export function woodcutterLoadSourceRect(gender: Gender, moving: boolean, elapsedMs: number) {
  return locomotionSourceRect(gender, moving, elapsedMs);
}
