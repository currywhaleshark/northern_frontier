import type { Season, Tile } from './types';

export type TreeStage = 'stump' | 'young' | 'mature';

export function treeStageFor(tile: Pick<Tile, 'terrain' | 'treeStage'>): TreeStage | null {
  if (tile.terrain !== 'forest') return null;
  return tile.treeStage === 'stump' || tile.treeStage === 'young' ? tile.treeStage : 'mature';
}

export function setTreeStage(tile: Tile, stage: TreeStage): void {
  tile.terrain = 'forest';
  tile.treeStage = stage;
}

export function clearTreeStage(tile: Tile): void {
  delete tile.treeStage;
}

export function markForestHarvest(
  tile: Tile,
  rng: () => number,
  stumpChance: number,
): boolean {
  if (treeStageFor(tile) !== 'mature') return false;
  if (rng() >= stumpChance) return false;
  tile.treeStage = 'stump';
  return true;
}

export function advanceForestGrowth(
  tile: Tile,
  season: Season,
  rng: () => number,
  stumpSproutChance: number,
  youngMatureChance: number,
): boolean {
  if (season !== 'spring' && season !== 'summer') return false;
  const stage = treeStageFor(tile);
  if (stage === 'stump' && rng() < stumpSproutChance) {
    tile.treeStage = 'young';
    return true;
  }
  if (stage === 'young' && rng() < youngMatureChance) {
    tile.treeStage = 'mature';
    return true;
  }
  return false;
}

export function ensureForestGrowth(tiles: Tile[][]): void {
  for (const row of tiles) {
    for (const tile of row) {
      if (tile.terrain === 'forest') {
        tile.treeStage = treeStageFor(tile) ?? 'mature';
      } else {
        clearTreeStage(tile);
      }
    }
  }
}
