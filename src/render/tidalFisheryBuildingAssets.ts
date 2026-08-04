import type { Season } from '../game/types';
import tidalFisheryBuildingManifest from './tidalFisheryBuildingManifest.json';

interface FrameRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

const frames = tidalFisheryBuildingManifest.frame_layout.rows.seasonal as FrameRect[];

export const TIDAL_FISHERY_BUILDING_SHEET = {
  src: tidalFisheryBuildingManifest.game_input,
  width: tidalFisheryBuildingManifest.display.width,
  height: tidalFisheryBuildingManifest.display.height,
  sourceScale: tidalFisheryBuildingManifest.display.sourceScale as 2,
  anchor: tidalFisheryBuildingManifest.display.anchor,
} as const;

export function tidalFisheryBuildingSourceRect(season: Season): FrameRect {
  const frameIndex = season === 'winter'
    ? tidalFisheryBuildingManifest.seasonFrames.winter
    : tidalFisheryBuildingManifest.seasonFrames.normal;
  const rect = frames[frameIndex];
  if (!rect) throw new Error(`Missing tidal fishery building frame: ${season}`);
  return rect;
}
