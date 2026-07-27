export interface CorpseCoffinSprite {
  readonly src: string;
  readonly cellSize: number;
}

export const CORPSE_COFFIN_SPRITES = {
  standard: {
    src: '/assets/corpse-coffin-v1.png',
    cellSize: 28,
  },
  highDefinition: {
    src: '/assets/corpse-coffin-v1-hd.png',
    cellSize: 56,
  },
} as const satisfies Record<'standard' | 'highDefinition', CorpseCoffinSprite>;
