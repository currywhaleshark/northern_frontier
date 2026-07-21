import type { Rank, Season } from '../game/types';

export const CENTER_PROMOTION_SHEET = {
  src: '/assets/center-promotions-generated-v1.png',
  tileSize: 56,
  spriteHeight: 80,
  columns: 3,
  rows: 2,
} as const;

const CENTER_RANK_COLUMN: Record<Exclude<Rank, 'settlement'>, number> = {
  bo: 0,
  jin: 1,
  bu: 2,
};

export function centerPromotionSourceRect(rank: Rank, season: Season) {
  if (rank === 'settlement') return null;
  return {
    sx: CENTER_RANK_COLUMN[rank] * CENTER_PROMOTION_SHEET.tileSize,
    sy: (season === 'winter' ? 1 : 0) * CENTER_PROMOTION_SHEET.spriteHeight,
    sw: CENTER_PROMOTION_SHEET.tileSize,
    sh: CENTER_PROMOTION_SHEET.spriteHeight,
  };
}
