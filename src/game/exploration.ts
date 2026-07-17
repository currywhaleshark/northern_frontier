import { buildingFootprintDims, buildingFootprintTiles } from './buildings';
import { CONFIG } from './config';
import type { Building, BuildingTypeId, ExplorationState, GameState } from './types';

function isNight(state: Pick<GameState, 'subTick'>): boolean {
  const dayFraction = state.subTick / CONFIG.agents.subticksPerDay;
  return dayFraction > 0.5;
}

function sightMultiplier(state: Pick<GameState, 'subTick' | 'weather'>): number {
  const weatherMult = CONFIG.exploration.weatherMult[state.weather] ?? 1;
  const nightMult = isNight(state) ? CONFIG.exploration.nightMult : 1;
  return weatherMult * nightMult;
}

export function residentRevealRadius(
  state: Pick<GameState, 'subTick' | 'weather'>,
): number {
  return Math.max(2, Math.round(CONFIG.exploration.residentRadius * sightMultiplier(state)));
}

export function buildingRevealRadius(
  state: Pick<GameState, 'subTick' | 'weather'>,
): number {
  return Math.max(3, Math.round(CONFIG.exploration.buildingRadius * sightMultiplier(state)));
}

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
  return state.exploration.explored[y]?.[x] === true;
}

export function revealAround(state: GameState, cx: number, cy: number, radius: number): number {
  const exploration = ensureExploration(state);
  const r2 = radius * radius;
  let revealed = 0;
  for (let y = cy - radius; y <= cy + radius; y++) {
    const row = state.map[y];
    if (!row) continue;
    for (let x = cx - radius; x <= cx + radius; x++) {
      if (!row[x]) continue;
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= r2 && !exploration.explored[y][x]) {
        exploration.explored[y][x] = true;
        revealed++;
      }
    }
  }
  return revealed;
}

function revealBuilding(state: GameState, building: Building): number {
  const { w, h } = buildingFootprintDims(building);
  const cx = building.x + Math.floor((w - 1) / 2);
  const cy = building.y + Math.floor((h - 1) / 2);
  return revealAround(state, cx, cy, buildingRevealRadius(state));
}

export function refreshExploration(state: GameState): number {
  ensureExploration(state);
  let revealed = 0;
  for (const building of state.buildings) revealed += revealBuilding(state, building);
  const radius = residentRevealRadius(state);
  for (const resident of state.residents) {
    if (!resident.alive) continue;
    revealed += revealAround(state, resident.x, resident.y, radius);
  }
  return revealed;
}

export function isBuildingFootprintExplored(
  state: GameState,
  type: BuildingTypeId,
  x: number,
  y: number,
  w?: number,
  h?: number,
): boolean {
  const tiles = buildingFootprintTiles(state, type, x, y, w, h);
  const explored = state.exploration.explored;
  return !!tiles && tiles.every(tile => explored[tile.y]?.[tile.x] === true);
}
