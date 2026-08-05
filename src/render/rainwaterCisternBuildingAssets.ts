import type { Season } from '../game/types';
import rainwaterCisternBuildingManifest from './rainwaterCisternBuildingManifest.json';

interface FrameRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

const frames = rainwaterCisternBuildingManifest.frame_layout.rows.seasonal as FrameRect[];
const hdFrames = rainwaterCisternBuildingManifest.hd_frame_layout.rows.seasonal as FrameRect[];

export const RAINWATER_CISTERN_BUILDING_SHEET = {
  src: rainwaterCisternBuildingManifest.game_input,
  width: rainwaterCisternBuildingManifest.display.width,
  height: rainwaterCisternBuildingManifest.display.height,
  sourceScale: rainwaterCisternBuildingManifest.display.sourceScale as 2,
  anchor: rainwaterCisternBuildingManifest.display.anchor,
} as const;

export const RAINWATER_CISTERN_BUILDING_HD_SHEET = {
  src: rainwaterCisternBuildingManifest.hd_game_input,
  width: rainwaterCisternBuildingManifest.display.width,
  height: rainwaterCisternBuildingManifest.display.height,
  sourceScale: rainwaterCisternBuildingManifest.display.hdSourceScale as 8,
  anchor: rainwaterCisternBuildingManifest.display.anchor,
} as const;

export function rainwaterCisternBuildingSourceRect(season: Season, highDefinition = false): FrameRect {
  const frameIndex = season === 'winter'
    ? rainwaterCisternBuildingManifest.seasonFrames.winter
    : rainwaterCisternBuildingManifest.seasonFrames.normal;
  const rect = (highDefinition ? hdFrames : frames)[frameIndex];
  if (!rect) throw new Error(`Missing rainwater cistern building frame: ${season}`);
  return rect;
}
