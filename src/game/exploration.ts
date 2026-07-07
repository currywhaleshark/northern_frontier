import { buildingFootprintSize, buildingFootprintTiles } from './buildings';
import type { Building, BuildingTypeId, ExplorationState, GameState } from './types';

const RESIDENT_REVEAL_RADIUS = 5;
const BUILDING_REVEAL_RADIUS = 8;

export function createExploration(state: Pick<GameState, 'map'>): ExplorationState {
  return {
    explored: state.map.map(row => row.map(() => false)),
  };
}

function matchesMapSize(state: GameState): boolean {
  const explored = state.exploration?.explored;
  return !!explored &&
    explored.length === state.map.length &&
    state.map.every((row, y) => explored[y]?.length === row.length);
}

export function ensureExploration(state: GameState): ExplorationState {
  if (!matchesMapSize(state)) state.exploration = createExploration(state);
  return state.exploration;
}

export function isExplored(state: GameState, x: number, y: number): boolean {
  return ensureExploration(state).explored[y]?.[x] === true;
}

export function revealAround(state: GameState, cx: number, cy: number, radius: number): void {
  const exploration = ensureExploration(state);
  const r2 = radius * radius;
  for (let y = cy - radius; y <= cy + radius; y++) {
    const row = state.map[y];
    if (!row) continue;
    for (let x = cx - radius; x <= cx + radius; x++) {
      if (!row[x]) continue;
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= r2) exploration.explored[y][x] = true;
    }
  }
}

function revealBuilding(state: GameState, building: Building): void {
  const size = buildingFootprintSize(building.type);
  const cx = building.x + Math.floor((size - 1) / 2);
  const cy = building.y + Math.floor((size - 1) / 2);
  revealAround(state, cx, cy, BUILDING_REVEAL_RADIUS);
}

export function refreshExploration(state: GameState): void {
  ensureExploration(state);
  for (const building of state.buildings) revealBuilding(state, building);
  for (const resident of state.residents) {
    if (!resident.alive) continue;
    revealAround(state, resident.x, resident.y, RESIDENT_REVEAL_RADIUS);
  }
}

export function isBuildingFootprintExplored(
  state: GameState,
  type: BuildingTypeId,
  x: number,
  y: number,
): boolean {
  const tiles = buildingFootprintTiles(state, type, x, y);
  return !!tiles && tiles.every(tile => isExplored(state, tile.x, tile.y));
}
