export interface CemeterySheet {
  readonly src: string;
  readonly cellWidth: number;
  readonly cellHeight: number;
  readonly columns: 5;
  readonly rows: 2;
}

export const CEMETERY_SHEETS = {
  standard: {
    src: '/assets/cemetery-progression-v1.png',
    cellWidth: 28,
    cellHeight: 40,
    columns: 5,
    rows: 2,
  },
  highDefinition: {
    src: '/assets/cemetery-progression-v1-hd.png',
    cellWidth: 56,
    cellHeight: 80,
    columns: 5,
    rows: 2,
  },
} as const satisfies Record<'standard' | 'highDefinition', CemeterySheet>;

export function cemeterySourceRect(
  sheet: CemeterySheet,
  graveCount: number,
  winter: boolean,
) {
  const column = Math.min(4, Math.max(0, Math.floor(graveCount)));
  return {
    sx: column * sheet.cellWidth,
    sy: (winter ? 1 : 0) * sheet.cellHeight,
    sw: sheet.cellWidth,
    sh: sheet.cellHeight,
  };
}
