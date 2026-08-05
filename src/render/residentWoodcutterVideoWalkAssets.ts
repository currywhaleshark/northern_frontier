import type { Gender } from '../game/types';
import woodcutterVideoWalkManifest from './residentWoodcutterVideoWalkManifest.json';

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

export type WoodcutterVideoWalkKind = 'axe' | 'jige';

interface WoodcutterVideoWalkSourceRect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

type AnimationKey = `${Gender}_${WoodcutterVideoWalkKind}_walk`;

const animationRows = woodcutterVideoWalkManifest.animation.rows as Record<AnimationKey, AnimationRow>;
const standardRows = woodcutterVideoWalkManifest.frame_layout.rows as Record<AnimationKey, FrameRect[]>;
const highDefinitionRows = woodcutterVideoWalkManifest.high_definition_frame_layout.rows as Record<
  AnimationKey,
  FrameRect[]
>;

export const RESIDENT_WOODCUTTER_VIDEO_WALK_SHEETS = {
  standard: {
    src: woodcutterVideoWalkManifest.game_input,
    cellWidth: woodcutterVideoWalkManifest.frame_layout.cellWidth,
    cellHeight: woodcutterVideoWalkManifest.frame_layout.cellHeight,
  },
  highDefinition: {
    src: woodcutterVideoWalkManifest.high_definition_game_input,
    cellWidth: woodcutterVideoWalkManifest.high_definition_frame_layout.cellWidth,
    cellHeight: woodcutterVideoWalkManifest.high_definition_frame_layout.cellHeight,
  },
  displayWidth: woodcutterVideoWalkManifest.display.width,
  displayHeight: woodcutterVideoWalkManifest.display.height,
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

export function woodcutterVideoWalkSourceRect(
  gender: Gender,
  kind: WoodcutterVideoWalkKind,
  elapsedMs: number,
  highDefinition: boolean,
): WoodcutterVideoWalkSourceRect {
  const key: AnimationKey = `${gender}_${kind}_walk`;
  const layout = highDefinition ? highDefinitionRows[key] : standardRows[key];
  const frame = frameAtElapsed(animationRows[key], elapsedMs);
  const rect = layout[frame % layout.length] ?? layout[0];
  return { sx: rect.x, sy: rect.y, sw: rect.w, sh: rect.h };
}
