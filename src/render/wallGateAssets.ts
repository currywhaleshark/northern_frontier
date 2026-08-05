import type { Season } from '../game/types';
import type { WallConnections } from '../game/walls';

export const WALL_GATE_ORIENTATIONS = [
  'horizontal',
  'vertical',
] as const;

type WallGateOrientation = typeof WALL_GATE_ORIENTATIONS[number];

export const WALL_GATE_SHEET = {
  tileSize: 28,
  spriteHeight: 40,
  columns: 2,
  rows: 2,
  src: '/assets/wall-gate-v1.png',
} as const;

const ORIENTATION_COLUMNS: Record<WallGateOrientation, number> = {
  horizontal: 0,
  vertical: 1,
};

export function wallGateOrientation(connections?: WallConnections): WallGateOrientation {
  if (!connections) return 'horizontal';

  const vertical = connections.n || connections.s;
  const horizontal = connections.e || connections.w;
  if (vertical && !horizontal) return 'vertical';
  return 'horizontal';
}

export function wallGateSourceRect(
  connections: WallConnections | undefined,
  season: Season,
) {
  const col = ORIENTATION_COLUMNS[wallGateOrientation(connections)];
  const row = season === 'winter' ? 1 : 0;
  return {
    sx: col * WALL_GATE_SHEET.tileSize,
    sy: row * WALL_GATE_SHEET.spriteHeight,
    sw: WALL_GATE_SHEET.tileSize,
    sh: WALL_GATE_SHEET.spriteHeight,
  };
}
