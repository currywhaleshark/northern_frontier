import type { Gender } from '../game/types';
import woodcutterVideoWorkManifest from './residentWoodcutterVideoWorkManifest.json';

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

export interface WoodcutterVideoWorkSourceRect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

type AnimationKey = `${Gender}_chop`;

const animationRows = woodcutterVideoWorkManifest.animation.rows as Record<AnimationKey, AnimationRow>;
const standardRows = woodcutterVideoWorkManifest.frame_layout.rows as Record<AnimationKey, FrameRect[]>;
const highDefinitionRows = woodcutterVideoWorkManifest.high_definition_frame_layout.rows as Record<
  AnimationKey,
  FrameRect[]
>;

export const RESIDENT_WOODCUTTER_VIDEO_WORK_SHEETS = {
  standard: {
    src: woodcutterVideoWorkManifest.game_input,
    cellWidth: woodcutterVideoWorkManifest.frame_layout.cellWidth,
    cellHeight: woodcutterVideoWorkManifest.frame_layout.cellHeight,
  },
  highDefinition: {
    src: woodcutterVideoWorkManifest.high_definition_game_input,
    cellWidth: woodcutterVideoWorkManifest.high_definition_frame_layout.cellWidth,
    cellHeight: woodcutterVideoWorkManifest.high_definition_frame_layout.cellHeight,
  },
  displayWidth: woodcutterVideoWorkManifest.display.width,
  displayHeight: woodcutterVideoWorkManifest.display.height,
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

export function woodcutterVideoWorkSourceRect(
  gender: Gender,
  elapsedMs: number,
  highDefinition: boolean,
): WoodcutterVideoWorkSourceRect {
  const key: AnimationKey = `${gender}_chop`;
  const layout = highDefinition ? highDefinitionRows[key] : standardRows[key];
  const frame = frameAtElapsed(animationRows[key], elapsedMs);
  const rect = layout[frame % layout.length] ?? layout[0];
  return { sx: rect.x, sy: rect.y, sw: rect.w, sh: rect.h };
}
