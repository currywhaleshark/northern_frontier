import type { Gender } from '../game/types';
import idleVideoWalkManifest from './residentIdleVideoWalkManifest.json';

interface FrameRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface AnimationRow {
  frames: number;
  fps: number;
  durations_ms: number[];
  loop: boolean;
}

interface IdleVideoWalkSourceRect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

const animationRows = idleVideoWalkManifest.animation.rows as Record<Gender, AnimationRow>;
const standardRows = idleVideoWalkManifest.frame_layout.rows as Record<Gender, FrameRect[]>;
const highDefinitionRows = idleVideoWalkManifest.high_definition_frame_layout.rows as Record<Gender, FrameRect[]>;

export const RESIDENT_IDLE_VIDEO_WALK_SHEETS = {
  standard: {
    src: idleVideoWalkManifest.game_input,
    cellWidth: idleVideoWalkManifest.frame_layout.cellWidth,
    cellHeight: idleVideoWalkManifest.frame_layout.cellHeight,
  },
  highDefinition: {
    src: idleVideoWalkManifest.high_definition_game_input,
    cellWidth: idleVideoWalkManifest.high_definition_frame_layout.cellWidth,
    cellHeight: idleVideoWalkManifest.high_definition_frame_layout.cellHeight,
  },
  displayWidth: idleVideoWalkManifest.display.width,
  displayHeight: idleVideoWalkManifest.display.height,
} as const;

function frameAtElapsed(row: AnimationRow, elapsedMs: number): number {
  const cycleDuration = row.durations_ms.reduce((sum, duration) => sum + duration, 0);
  if (cycleDuration <= 0) return 0;
  let remaining = Math.max(0, elapsedMs) % cycleDuration;
  for (let index = 0; index < row.durations_ms.length; index++) {
    if (remaining < row.durations_ms[index]) return index;
    remaining -= row.durations_ms[index];
  }
  return 0;
}

export function idleVideoWalkSourceRect(
  gender: Gender,
  elapsedMs: number,
  highDefinition: boolean,
): IdleVideoWalkSourceRect {
  const layout = highDefinition ? highDefinitionRows[gender] : standardRows[gender];
  const frame = frameAtElapsed(animationRows[gender], elapsedMs);
  const rect = layout[frame % layout.length] ?? layout[0];
  return { sx: rect.x, sy: rect.y, sw: rect.w, sh: rect.h };
}
