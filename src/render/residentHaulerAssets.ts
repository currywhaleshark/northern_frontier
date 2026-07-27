import type { Gender } from '../game/types';

export const RESIDENT_HAULER_LOCOMOTION_SHEET = {
  frameSize: 40,
  columns: 3,
  rows: 2,
  frameDurationMs: 140,
  src: '/assets/resident-hauler-locomotion-v1.png',
} as const;

export const RESIDENT_HAULER_CART_LOCOMOTION_SHEET = {
  frameSize: 128,
  displayFrameSize: 80,
  columns: 4,
  rows: 2,
  frameDurationMs: 200,
  src: '/assets/resident-hauler-cart-walk-v2.png',
} as const;

export const RESIDENT_HAULER_CART_LOCOMOTION_HD_SHEET = {
  frameSize: 256,
  displayFrameSize: 80,
  columns: 4,
  rows: 2,
  frameDurationMs: 200,
  src: '/assets/resident-hauler-cart-walk-hd-v2.png',
} as const;

export const RESIDENT_HAULER_CART_LOAD_LOCOMOTION_SHEET = {
  frameSize: 128,
  displayFrameSize: 80,
  columns: 4,
  rows: 2,
  frameDurationMs: 200,
  src: '/assets/resident-hauler-cart-load-walk-v2.png',
} as const;

export const RESIDENT_HAULER_CART_LOAD_LOCOMOTION_HD_SHEET = {
  frameSize: 256,
  displayFrameSize: 80,
  columns: 4,
  rows: 2,
  frameDurationMs: 200,
  src: '/assets/resident-hauler-cart-load-walk-hd-v2.png',
} as const;

const HAULER_WALK_SEQUENCE = [0, 1, 0, 2] as const;
const HAULER_CART_WALK_SEQUENCE = [0, 1, 2, 3] as const;

export function haulerLocomotionFrameIndex(moving: boolean, elapsedMs: number): number {
  if (!moving) return 0;
  const step = Math.floor(Math.max(0, elapsedMs) / RESIDENT_HAULER_LOCOMOTION_SHEET.frameDurationMs);
  return HAULER_WALK_SEQUENCE[step % HAULER_WALK_SEQUENCE.length];
}

export function haulerCartLocomotionFrameIndex(moving: boolean, elapsedMs: number): number {
  if (!moving) return 0;
  const step = Math.floor(
    Math.max(0, elapsedMs) / RESIDENT_HAULER_CART_LOCOMOTION_SHEET.frameDurationMs,
  );
  return HAULER_CART_WALK_SEQUENCE[step % HAULER_CART_WALK_SEQUENCE.length];
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

export function haulerCartLocomotionSourceRect(
  gender: Gender,
  moving: boolean,
  elapsedMs: number,
  loaded = false,
  highDefinition = false,
) {
  const sheet = loaded
    ? (highDefinition
        ? RESIDENT_HAULER_CART_LOAD_LOCOMOTION_HD_SHEET
        : RESIDENT_HAULER_CART_LOAD_LOCOMOTION_SHEET)
    : (highDefinition
        ? RESIDENT_HAULER_CART_LOCOMOTION_HD_SHEET
        : RESIDENT_HAULER_CART_LOCOMOTION_SHEET);
  const frame = haulerCartLocomotionFrameIndex(moving, elapsedMs);
  return {
    sx: frame * sheet.frameSize,
    sy: (gender === 'female' ? 1 : 0) * sheet.frameSize,
    sw: sheet.frameSize,
    sh: sheet.frameSize,
  };
}
