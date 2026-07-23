import type { Gender } from '../game/types';

export const RESIDENT_HUNTER_HUNT_SHEET = {
  frameSize: 40,
  columns: 2,
  rows: 2,
  frameDurationMs: 240,
  src: '/assets/resident-hunter-hunt-v1.png',
} as const;

export const RESIDENT_HUNTER_LOCOMOTION_SHEET = {
  frameSize: 40,
  columns: 4,
  rows: 2,
  frameDurationMs: 140,
  src: '/assets/resident-hunter-locomotion-v1.png',
} as const;

export const RESIDENT_HUNTER_LOAD_SHEET = {
  frameSize: 40,
  columns: 4,
  rows: 2,
  frameDurationMs: 140,
  src: '/assets/resident-hunter-load-v1.png',
} as const;

const HUNT_POSE_SEQUENCE = [0, 1, 1, 0] as const;
const HUNTER_WALK_SEQUENCE = [0, 1, 0, 3] as const;

export function hunterHuntPoseIndex(elapsedMs: number): number {
  const step = Math.floor(Math.max(0, elapsedMs) / RESIDENT_HUNTER_HUNT_SHEET.frameDurationMs);
  return HUNT_POSE_SEQUENCE[step % HUNT_POSE_SEQUENCE.length];
}

export function hunterHuntSourceRect(gender: Gender, elapsedMs: number) {
  const frameSize = RESIDENT_HUNTER_HUNT_SHEET.frameSize;
  return {
    sx: (gender === 'female' ? 1 : 0) * frameSize,
    sy: hunterHuntPoseIndex(elapsedMs) * frameSize,
    sw: frameSize,
    sh: frameSize,
  };
}

export function hunterLocomotionFrameIndex(moving: boolean, elapsedMs: number): number {
  if (!moving) return 0;
  const step = Math.floor(Math.max(0, elapsedMs) / RESIDENT_HUNTER_LOCOMOTION_SHEET.frameDurationMs);
  return HUNTER_WALK_SEQUENCE[step % HUNTER_WALK_SEQUENCE.length];
}

function locomotionSourceRect(gender: Gender, moving: boolean, elapsedMs: number) {
  const frameSize = RESIDENT_HUNTER_LOCOMOTION_SHEET.frameSize;
  return {
    sx: hunterLocomotionFrameIndex(moving, elapsedMs) * frameSize,
    sy: (gender === 'female' ? 1 : 0) * frameSize,
    sw: frameSize,
    sh: frameSize,
  };
}

export function hunterLocomotionSourceRect(gender: Gender, moving: boolean, elapsedMs: number) {
  return locomotionSourceRect(gender, moving, elapsedMs);
}

export function hunterLoadSourceRect(gender: Gender, moving: boolean, elapsedMs: number) {
  return locomotionSourceRect(gender, moving, elapsedMs);
}
