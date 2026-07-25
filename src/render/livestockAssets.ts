import type { LivestockId } from '../game/types';

export interface LivestockSheet {
  readonly src: string;
  readonly cellSize: number;
  readonly columns: 6;
}

export const LIVESTOCK_SHEETS = {
  standard: {
    src: '/assets/livestock-overworld-v1.png',
    cellSize: 28,
    columns: 6,
  },
  highDefinition: {
    src: '/assets/livestock-overworld-v1-hd.png',
    cellSize: 56,
    columns: 6,
  },
} as const satisfies Record<'standard' | 'highDefinition', LivestockSheet>;

const LIVESTOCK_COLUMN: Record<LivestockId, number> = {
  chicken: 0,
  goat: 1,
  sheep: 2,
  cattle: 3,
  horse: 4,
  pig: 5,
};

export function livestockSourceRect(sheet: LivestockSheet, species: LivestockId) {
  return {
    sx: LIVESTOCK_COLUMN[species] * sheet.cellSize,
    sy: 0,
    sw: sheet.cellSize,
    sh: sheet.cellSize,
  };
}
