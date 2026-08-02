import { getDayOfSeason, getSeason } from './seasons';
import { isOpenWaterTerrain } from './terrain';
import type { Tile } from './types';

const CARDINAL_STEPS = [[0, -1], [1, 0], [0, 1], [-1, 0]] as const;
const TRANSITION_DAYS = 6;

interface LakeIceField {
  distances: Map<string, number>;
  maxDistance: number;
}

const iceFields = new WeakMap<Tile[][], LakeIceField>();

function key(x: number, y: number): string {
  return `${x},${y}`;
}

function isLake(map: readonly Tile[][], x: number, y: number): boolean {
  return map[y]?.[x]?.terrain === 'lake';
}

function lakeIceField(map: Tile[][]): LakeIceField {
  const cached = iceFields.get(map);
  if (cached) return cached;

  const distances = new Map<string, number>();
  const queue: Array<readonly [number, number]> = [];
  for (let y = 0; y < map.length; y++) {
    for (let x = 0; x < map[y].length; x++) {
      if (!isLake(map, x, y)) continue;
      const shore = CARDINAL_STEPS.some(([dx, dy]) => {
        const neighbor = map[y + dy]?.[x + dx];
        return neighbor != null && !isOpenWaterTerrain(neighbor.terrain);
      });
      if (!shore) continue;
      distances.set(key(x, y), 0);
      queue.push([x, y]);
    }
  }

  let maxDistance = 0;
  for (let index = 0; index < queue.length; index++) {
    const [x, y] = queue[index];
    const distance = distances.get(key(x, y)) ?? 0;
    maxDistance = Math.max(maxDistance, distance);
    for (const [dx, dy] of CARDINAL_STEPS) {
      const nx = x + dx;
      const ny = y + dy;
      const nextKey = key(nx, ny);
      if (!isLake(map, nx, ny) || distances.has(nextKey)) continue;
      distances.set(nextKey, distance + 1);
      queue.push([nx, ny]);
    }
  }

  const field = { distances, maxDistance };
  iceFields.set(map, field);
  return field;
}

/** 겨울·봄 첫 엿새만 호숫가에서 중앙으로 결빙/해빙한다. */
export function lakeIcePhase(day: number): 'liquid' | 'freezing' | 'frozen' | 'thawing' {
  const season = getSeason(day);
  const seasonDay = getDayOfSeason(day);
  if (season === 'winter') return seasonDay <= TRANSITION_DAYS ? 'freezing' : 'frozen';
  if (season === 'spring') return seasonDay <= TRANSITION_DAYS ? 'thawing' : 'liquid';
  return 'liquid';
}

export function isLakeIceAt(map: Tile[][], day: number, x: number, y: number): boolean {
  if (!isLake(map, x, y)) return false;
  const phase = lakeIcePhase(day);
  if (phase === 'liquid') return false;
  if (phase === 'frozen') return true;

  const field = lakeIceField(map);
  const distance = field.distances.get(key(x, y));
  // 폐쇄된 물 성분처럼 물가를 찾지 못한 경우에는 보수적으로 전면 결빙한다.
  const normalizedDistance = distance == null || field.maxDistance === 0
    ? 0
    : distance / field.maxDistance;
  const progress = Math.min(1, getDayOfSeason(day) / TRANSITION_DAYS);
  return phase === 'freezing'
    ? normalizedDistance <= progress
    : normalizedDistance > progress;
}
