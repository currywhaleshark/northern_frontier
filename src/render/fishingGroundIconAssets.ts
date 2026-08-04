import type { FishingGroundKind } from '../game/types';
import fishingGroundIconManifest from './fishingGroundIconManifest.json';

export type FishingGroundIconKind = 'water' | 'mudflat';

interface FrameRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const rows = fishingGroundIconManifest.frame_layout.rows as Record<FishingGroundIconKind, FrameRect[]>;

export const FISHING_GROUND_ICON_SHEET = {
  src: fishingGroundIconManifest.game_input,
  width: fishingGroundIconManifest.display.width,
  height: fishingGroundIconManifest.display.height,
  anchor: fishingGroundIconManifest.display.anchor,
} as const;

export function fishingGroundIconKind(kind: FishingGroundKind): FishingGroundIconKind {
  return kind === 'mudflat' ? 'mudflat' : 'water';
}

export function fishingGroundIconSourceRect(kind: FishingGroundIconKind): FrameRect {
  const rect = rows[kind]?.[0];
  if (!rect) throw new Error(`Missing fishing ground icon atlas row: ${kind}`);
  return rect;
}
