import { isNaturalWaterTerrain } from './terrain';
import type { BuildingTypeId, GameState } from './types';

export interface CanalConnections {
  n: boolean;
  e: boolean;
  s: boolean;
  w: boolean;
}

const CARDINAL_STEPS = [
  ['n', 0, -1],
  ['e', 1, 0],
  ['s', 0, 1],
  ['w', -1, 0],
] as const satisfies readonly (readonly [keyof CanalConnections, number, number])[];

function key(x: number, y: number): string {
  return `${x},${y}`;
}

/** 완공된 농수로만 물길 계산과 논 자격에 쓴다. */
export function builtCanalTileSet(state: Pick<GameState, 'buildings'>): Set<string> {
  return new Set(state.buildings
    .filter(building => building.type === 'canal' && building.built)
    .map(building => key(building.x, building.y)));
}

function isAdjacentNaturalWater(state: Pick<GameState, 'map'>, x: number, y: number): boolean {
  return CARDINAL_STEPS.some(([, dx, dy]) => {
    const terrain = state.map[y + dy]?.[x + dx]?.terrain;
    return terrain != null && isNaturalWaterTerrain(terrain);
  });
}

export function canalRiverEdgesAt(
  state: Pick<GameState, 'map'>,
  x: number,
  y: number,
): CanalConnections {
  const naturalWaterAt = (dx: number, dy: number): boolean => {
    const terrain = state.map[y + dy]?.[x + dx]?.terrain;
    return terrain != null && isNaturalWaterTerrain(terrain);
  };
  return {
    n: naturalWaterAt(0, -1),
    e: naturalWaterAt(1, 0),
    s: naturalWaterAt(0, 1),
    w: naturalWaterAt(-1, 0),
  };
}

/**
 * 강·호수에 바로 닿는 완공 수로에서 시작해 같은 수로 구간을 BFS한다.
 * 끊긴 군집은 결과에 들어가지 않아 마른 도랑으로 남는다.
 */
export function flowingCanalTileSet(state: Pick<GameState, 'map' | 'buildings'>): Set<string> {
  const canals = builtCanalTileSet(state);
  const flowing = new Set<string>();
  const queue: Array<readonly [number, number]> = [];
  for (const building of state.buildings) {
    if (building.type !== 'canal' || !building.built || !isAdjacentNaturalWater(state, building.x, building.y)) continue;
    const tileKey = key(building.x, building.y);
    if (canals.has(tileKey)) {
      flowing.add(tileKey);
      queue.push([building.x, building.y]);
    }
  }
  for (let index = 0; index < queue.length; index++) {
    const [x, y] = queue[index];
    for (const [, dx, dy] of CARDINAL_STEPS) {
      const nextKey = key(x + dx, y + dy);
      if (!canals.has(nextKey) || flowing.has(nextKey)) continue;
      flowing.add(nextKey);
      queue.push([x + dx, y + dy]);
    }
  }
  return flowing;
}

export function hasAdjacentFlowingCanal(
  state: Pick<GameState, 'map' | 'buildings'> | undefined,
  x: number,
  y: number,
): boolean {
  if (!state) return false;
  const flowing = flowingCanalTileSet(state);
  return CARDINAL_STEPS.some(([, dx, dy]) => flowing.has(key(x + dx, y + dy)));
}

/** 배치 고스트 한 칸이 완공되었을 때 바로 물길에 들어오는지 가볍게 예측한다. */
export function wouldCanalFlowAt(
  state: Pick<GameState, 'map' | 'buildings'>,
  x: number,
  y: number,
): boolean {
  if (isAdjacentNaturalWater(state, x, y)) return true;
  const flowing = flowingCanalTileSet(state);
  return CARDINAL_STEPS.some(([, dx, dy]) => flowing.has(key(x + dx, y + dy)));
}

export function canalConnectionsAt(
  state: Pick<GameState, 'map' | 'buildings'>,
  x: number,
  y: number,
  builtOnly = false,
): CanalConnections {
  const river = canalRiverEdgesAt(state, x, y);
  const tiles = builtOnly
    ? builtCanalTileSet(state)
    : new Set(state.buildings
      .filter(building => building.type === 'canal')
      .map(building => key(building.x, building.y)));
  return {
    n: tiles.has(key(x, y - 1)) || river.n,
    e: tiles.has(key(x + 1, y)) || river.e,
    s: tiles.has(key(x, y + 1)) || river.s,
    w: tiles.has(key(x - 1, y)) || river.w,
  };
}

/** Typescript의 BuildingTypeId 확장 시 import가 실제 사용 중임을 명시한다. */
export function isCanalBuildingType(type: BuildingTypeId): type is 'canal' {
  return type === 'canal';
}
