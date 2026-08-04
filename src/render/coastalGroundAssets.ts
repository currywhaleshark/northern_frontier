import type { CoastalGroundKind } from '../game/tidalFlats';
import coastalGroundManifest from './coastalGroundManifest.json';

interface FrameRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

const materials = coastalGroundManifest.materials as CoastalGroundKind[];
const frames = coastalGroundManifest.frame_layout.rows.coastal_materials as FrameRect[];

export const COASTAL_GROUND_SHEET = {
  src: coastalGroundManifest.game_input,
  width: coastalGroundManifest.display.width,
  height: coastalGroundManifest.display.height,
  sourceScale: coastalGroundManifest.display.sourceScale as 2,
  anchor: coastalGroundManifest.display.anchor,
} as const;

export const COASTAL_GROUND_KINDS: readonly CoastalGroundKind[] = materials;

export function coastalGroundSourceRect(kind: CoastalGroundKind): FrameRect {
  const index = materials.indexOf(kind);
  const rect = frames[index];
  if (!rect) throw new Error(`Missing coastal ground atlas frame: ${kind}`);
  return rect;
}
