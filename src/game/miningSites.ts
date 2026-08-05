import { CONFIG } from './config';
import { mineralRemaining } from './minerals';
import type { Building, GameState, Tile } from './types';

type MineAnchor = Pick<Building, 'x' | 'y'>;
type TilePoint = Pick<Tile, 'x' | 'y'>;

interface MineMineralSummary {
  deposits: number;
  stone: number;
  iron: number;
  silver: number;
}

function distanceSquared(anchor: MineAnchor, tile: TilePoint): number {
  const dx = tile.x - anchor.x;
  const dy = tile.y - anchor.y;
  return dx * dx + dy * dy;
}

export function isTileInMineWorkArea(anchor: MineAnchor, tile: TilePoint): boolean {
  return distanceSquared(anchor, tile) <= CONFIG.minerals.mineWorkRadius ** 2;
}

export function isMineralDeposit(tile: Tile): boolean {
  return tile.terrain === 'rock' && mineralRemaining(tile) > 0;
}

function isKnown(state: GameState, tile: Tile): boolean {
  return state.exploration?.explored[tile.y]?.[tile.x] === true;
}

export function mineralDepositsInMineRange(
  state: GameState,
  anchor: MineAnchor,
  knownOnly = true,
): Tile[] {
  const radius = CONFIG.minerals.mineWorkRadius;
  const deposits: Tile[] = [];
  for (let y = anchor.y - radius; y <= anchor.y + radius; y++) {
    const row = state.map[y];
    if (!row) continue;
    for (let x = anchor.x - radius; x <= anchor.x + radius; x++) {
      const tile = row[x];
      if (!tile || !isTileInMineWorkArea(anchor, tile) || !isMineralDeposit(tile)) continue;
      if (knownOnly && !isKnown(state, tile)) continue;
      deposits.push(tile);
    }
  }
  return deposits;
}

export function hasKnownMineralDepositNear(state: GameState, x: number, y: number): boolean {
  return mineralDepositsInMineRange(state, { x, y }, true).length > 0;
}

export function servingMineForTile(state: GameState, tile: TilePoint): Building | null {
  const candidates = state.buildings
    .filter(building => building.built && building.type === 'mine' && isTileInMineWorkArea(building, tile))
    .sort((a, b) => distanceSquared(a, tile) - distanceSquared(b, tile) || a.id - b.id);
  return candidates[0] ?? null;
}

export function mineMineralSummary(state: GameState, mine: MineAnchor): MineMineralSummary {
  const summary: MineMineralSummary = { deposits: 0, stone: 0, iron: 0, silver: 0 };
  for (const tile of mineralDepositsInMineRange(state, mine, true)) {
    const remaining = mineralRemaining(tile);
    summary.deposits++;
    if (tile.hasSilver) summary.silver += remaining;
    else if (tile.hasIron) summary.iron += remaining;
    else summary.stone += remaining;
  }
  return summary;
}
