import { CONFIG } from './config';
import type { Tile } from './types';

export type MineralResource = 'stone' | 'iron' | 'silver';
export type MineralVisualTier = 'trace' | 'small' | 'medium' | 'large' | 'huge';

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

export function mineralVisualTier(remaining: number): MineralVisualTier {
  const amount = Number.isFinite(remaining) ? Math.max(0, remaining) : 0;
  if (amount < 20) return 'trace';
  if (amount < 40) return 'small';
  if (amount < 65) return 'medium';
  if (amount < 90) return 'large';
  return 'huge';
}

export function setMineralDeposit(tile: Tile, hasIron: boolean, amount: number): void {
  tile.terrain = 'rock';
  tile.hasIron = hasIron;
  tile.hasSilver = false;
  tile.mineralRemaining = Math.max(0, amount);
}

export function rollSilverDepositAmount(rng: () => number): number {
  return CONFIG.minerals.silverMin
    + Math.floor(rng() * (CONFIG.minerals.silverMax - CONFIG.minerals.silverMin + 1));
}

// 잠채/설점 — 광상을 은맥으로 전환한다. 발견 당시 확정한 매장량이 있으면 재추첨하지 않는다.
export function convertToSilverDeposit(tile: Tile, rng: () => number, discoveredAmount?: number): number {
  const amount = Number.isFinite(discoveredAmount)
    ? Math.max(0, discoveredAmount ?? 0)
    : rollSilverDepositAmount(rng);
  tile.terrain = 'rock';
  tile.hasIron = false;
  tile.hasSilver = true;
  tile.mineralRemaining = amount;
  return amount;
}

export function tileMineralResource(tile: Pick<Tile, 'hasIron' | 'hasSilver'>): MineralResource {
  return tile.hasSilver ? 'silver' : tile.hasIron ? 'iron' : 'stone';
}

export function rollMineralDepositAmount(hasIron: boolean, rng: () => number): number {
  const min = hasIron ? CONFIG.minerals.ironMin : CONFIG.minerals.stoneMin;
  const max = hasIron ? CONFIG.minerals.ironMax : CONFIG.minerals.stoneMax;
  return min + Math.floor(rng() * (max - min + 1));
}

export function extractMineralDeposit(tile: Tile, requested: number): MineralExtraction {
  const resource = tileMineralResource(tile);
  const available = mineralRemaining(tile);
  const amount = Math.min(available, Number.isFinite(requested) ? Math.max(0, requested) : 0);
  const remaining = Math.max(0, available - amount);
  const depleted = tile.terrain === 'rock' && remaining <= 0.0001;
  tile.mineralRemaining = remaining;
  if (depleted) {
    tile.terrain = 'plain';
    tile.hasIron = false;
    tile.hasSilver = false;
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
