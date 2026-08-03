import type { FishingBoatFacing, FishingBoatState, Season, Terrain } from '../game/types';
import fishingBoatManifest from './fishingBoatManifest.json';

export type FishingBoatVisualState =
  | 'sailing'
  | 'moored'
  | 'fishing'
  | 'lake_winter_moored'
  | 'sea_winter_sailing'
  | 'sea_winter_fishing';

interface FrameRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const rows = fishingBoatManifest.frame_layout.rows as Record<string, FrameRect[]>;

export const FISHING_BOAT_SHEET = {
  src: fishingBoatManifest.game_input,
  width: fishingBoatManifest.display.width,
  height: fishingBoatManifest.display.height,
  anchor: fishingBoatManifest.display.anchor,
} as const;

export const FISHING_BOAT_VISUAL_STATES: readonly FishingBoatVisualState[] = [
  'sailing',
  'moored',
  'fishing',
  'lake_winter_moored',
  'sea_winter_sailing',
  'sea_winter_fishing',
];

export function fishingBoatAuthoredFacing(facing: FishingBoatFacing): {
  direction: 'ne' | 'sw';
  mirrorX: boolean;
} {
  if (facing === 'nw') return { direction: 'ne', mirrorX: true };
  if (facing === 'se') return { direction: 'sw', mirrorX: true };
  return { direction: facing, mirrorX: false };
}

export function fishingBoatVisualState(
  status: FishingBoatState['status'],
  terrain: Terrain | undefined,
  season: Season,
  frozenLake: boolean,
): FishingBoatVisualState {
  if (terrain === 'lake' && (season === 'winter' || frozenLake)) return 'lake_winter_moored';
  if (terrain === 'sea' && season === 'winter') {
    if (status === 'fishing') return 'sea_winter_fishing';
    if (status === 'underway' || status === 'returning') return 'sea_winter_sailing';
  }
  if (status === 'fishing') return 'fishing';
  if (status === 'underway' || status === 'returning') return 'sailing';
  return 'moored';
}

export function fishingBoatSourceRect(
  facing: FishingBoatFacing,
  state: FishingBoatVisualState,
): FrameRect & { mirrorX: boolean; row: string } {
  const authored = fishingBoatAuthoredFacing(facing);
  const row = `${authored.direction}_${state}`;
  const rect = rows[row]?.[0];
  if (!rect) throw new Error(`Missing fishing boat atlas row: ${row}`);
  return { ...rect, mirrorX: authored.mirrorX, row };
}
