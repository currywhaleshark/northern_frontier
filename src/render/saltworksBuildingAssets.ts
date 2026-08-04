import type { Season } from '../game/types';
import saltworksBuildingManifest from './saltworksBuildingManifest.json';

interface FrameRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

const frames = saltworksBuildingManifest.frame_layout.rows.seasonal as FrameRect[];
const hdFrames = saltworksBuildingManifest.hd_frame_layout.rows.seasonal as FrameRect[];

export const SALTWORKS_BUILDING_SHEET = {
  src: saltworksBuildingManifest.game_input,
  width: saltworksBuildingManifest.display.width,
  height: saltworksBuildingManifest.display.height,
  sourceScale: saltworksBuildingManifest.display.sourceScale as 2,
  anchor: saltworksBuildingManifest.display.anchor,
} as const;

export const SALTWORKS_BUILDING_HD_SHEET = {
  src: saltworksBuildingManifest.hd_game_input,
  width: saltworksBuildingManifest.display.width,
  height: saltworksBuildingManifest.display.height,
  sourceScale: saltworksBuildingManifest.display.hdSourceScale as 8,
  anchor: saltworksBuildingManifest.display.anchor,
} as const;

export function saltworksBuildingSourceRect(season: Season, highDefinition = false): FrameRect {
  const frameIndex = season === 'winter'
    ? saltworksBuildingManifest.seasonFrames.winter
    : saltworksBuildingManifest.seasonFrames.normal;
  const rect = (highDefinition ? hdFrames : frames)[frameIndex];
  if (!rect) throw new Error(`Missing saltworks building frame: ${season}`);
  return rect;
}
