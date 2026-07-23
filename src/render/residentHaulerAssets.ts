import type { Gender } from '../game/types';

export const RESIDENT_HAULER_LOCOMOTION_SHEET = {
  frameSize: 40,
  columns: 3,
  rows: 2,
  frameDurationMs: 140,
  src: '/assets/resident-hauler-locomotion-v1.png',
} as const;

export const RESIDENT_HAULER_CART_LOCOMOTION_SHEET = {
  frameSize: 64,
  columns: 3,
  rows: 2,
  frameDurationMs: 140,
  src: '/assets/resident-hauler-cart-locomotion-v1.png',
} as const;

const HAULER_WALK_SEQUENCE = [0, 1, 0, 2] as const;

export function haulerLocomotionFrameIndex(moving: boolean, elapsedMs: number): number {
  if (!moving) return 0;
  const step = Math.floor(Math.max(0, elapsedMs) / RESIDENT_HAULER_LOCOMOTION_SHEET.frameDurationMs);
  return HAULER_WALK_SEQUENCE[step % HAULER_WALK_SEQUENCE.length];
}

function sourceRect(frameSize: number, gender: Gender, moving: boolean, elapsedMs: number) {
  return {
    sx: haulerLocomotionFrameIndex(moving, elapsedMs) * frameSize,
    sy: (gender === 'female' ? 1 : 0) * frameSize,
    sw: frameSize,
    sh: frameSize,
  };
}

export function haulerLocomotionSourceRect(gender: Gender, moving: boolean, elapsedMs: number) {
  return sourceRect(RESIDENT_HAULER_LOCOMOTION_SHEET.frameSize, gender, moving, elapsedMs);
}

export function haulerCartLocomotionSourceRect(gender: Gender, moving: boolean, elapsedMs: number) {
  return sourceRect(RESIDENT_HAULER_CART_LOCOMOTION_SHEET.frameSize, gender, moving, elapsedMs);
}
