import type { Season } from '../game/types';
import boatyardBuildingManifest from './boatyardBuildingManifest.json';

interface FrameRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

const frames = boatyardBuildingManifest.frame_layout.rows.seasonal as FrameRect[];

export const BOATYARD_BUILDING_SHEET = {
  src: boatyardBuildingManifest.game_input,
  width: boatyardBuildingManifest.display.width,
  height: boatyardBuildingManifest.display.height,
  sourceScale: boatyardBuildingManifest.display.sourceScale as 2,
  anchor: boatyardBuildingManifest.display.anchor,
} as const;

export function boatyardBuildingSourceRect(season: Season): FrameRect {
  const frameIndex = season === 'winter'
    ? boatyardBuildingManifest.seasonFrames.winter
    : boatyardBuildingManifest.seasonFrames.normal;
  const rect = frames[frameIndex];
  if (!rect) throw new Error(`Missing boatyard building frame: ${season}`);
  return rect;
}
