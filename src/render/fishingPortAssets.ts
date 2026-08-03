import type { FishingPortPierDirection } from '../game/types';
import fishingPortManifest from './fishingPortManifest.json';

interface FrameRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export type FishingPortPierPart =
  | 'middle_horizontal'
  | 'middle_vertical'
  | `terminal_${FishingPortPierDirection}`;

const house = fishingPortManifest.sheets.house;
const pier = fishingPortManifest.sheets.pier;
const houseRows = house.frame_layout.rows as Record<string, FrameRect[]>;
const pierRows = pier.frame_layout.rows as Record<string, FrameRect[]>;

export const FISHING_PORT_HOUSE_SHEET = {
  src: house.game_input,
  width: house.display.width,
  height: house.display.height,
  anchor: house.display.anchor,
} as const;

export const FISHING_PORT_PIER_SHEET = {
  src: pier.game_input,
  width: pier.display.width,
  height: pier.display.height,
  anchor: pier.display.anchor,
} as const;

export const FISHING_PORT_TERMINAL_DIRECTIONS: readonly FishingPortPierDirection[] = [
  'n', 'e', 's', 'w',
];

export function fishingPortHouseSourceRect(): FrameRect {
  const rect = houseRows.normal?.[0];
  if (!rect) throw new Error('Missing fishing port house atlas row: normal');
  return rect;
}

export function fishingPortPierPart(
  direction: FishingPortPierDirection,
  terminal: boolean,
): FishingPortPierPart {
  if (terminal) return `terminal_${direction}`;
  return direction === 'e' || direction === 'w' ? 'middle_horizontal' : 'middle_vertical';
}

export function fishingPortPierSourceRect(part: FishingPortPierPart): FrameRect {
  const rect = pierRows[part]?.[0];
  if (!rect) throw new Error(`Missing fishing port pier atlas row: ${part}`);
  return rect;
}
