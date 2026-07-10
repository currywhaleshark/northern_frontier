import { CONFIG } from './config';
import type { Tile } from './types';

export type MineralResource = 'stone' | 'iron';

export interface MineralExtraction {
  resource: MineralResource;
  amount: number;
  remaining: number;
  depleted: boolean;
}

function defaultDepositAmount(tile: Pick<Tile, 'hasIron'>): number {
  return tile.hasIron ? CONFIG.minerals.legacyIron : CONFIG.minerals.legacyStone;
}

export function mineralRemaining(tile: Tile): number {
  if (tile.terrain !== 'rock') return 0;
  const amount = tile.mineralRemaining;
  return Number.isFinite(amount) ? Math.max(0, amount ?? 0) : defaultDepositAmount(tile);
}

export function setMineralDeposit(tile: Tile, hasIron: boolean, amount: number): void {
  tile.terrain = 'rock';
  tile.hasIron = hasIron;
  tile.mineralRemaining = Math.max(0, amount);
}

export function rollMineralDepositAmount(hasIron: boolean, rng: () => number): number {
  const min = hasIron ? CONFIG.minerals.ironMin : CONFIG.minerals.stoneMin;
  const max = hasIron ? CONFIG.minerals.ironMax : CONFIG.minerals.stoneMax;
  return min + Math.floor(rng() * (max - min + 1));
}

export function extractMineralDeposit(tile: Tile, requested: number): MineralExtraction {
  const resource: MineralResource = tile.hasIron ? 'iron' : 'stone';
  const available = mineralRemaining(tile);
  const amount = Math.min(available, Number.isFinite(requested) ? Math.max(0, requested) : 0);
  const remaining = Math.max(0, available - amount);
  const depleted = tile.terrain === 'rock' && remaining <= 0.0001;
  tile.mineralRemaining = remaining;
  if (depleted) {
    tile.terrain = 'plain';
    tile.hasIron = false;
  }
  return { resource, amount, remaining, depleted };
}

export function ensureMineralDeposits(tiles: Tile[][]): void {
  for (const row of tiles) {
    for (const tile of row) {
      if (tile.terrain !== 'rock') {
        tile.hasIron = false;
        continue;
      }
      if (!Number.isFinite(tile.mineralRemaining)) {
        tile.mineralRemaining = defaultDepositAmount(tile);
      }
      if ((tile.mineralRemaining ?? 0) <= 0) {
        tile.mineralRemaining = 0;
        tile.terrain = 'plain';
        tile.hasIron = false;
      }
    }
  }
}
