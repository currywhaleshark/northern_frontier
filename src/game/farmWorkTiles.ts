import { buildingFootprintDims } from './buildings';
import type { Building } from './types';

interface FarmWorkTile {
  x: number;
  y: number;
}

export const FARM_WORK_TILE_DWELL_SUBTICKS = 6;

type FarmPlot = Pick<Building, 'type' | 'x' | 'y' | 'w' | 'h'>;

/**
 * 경작지 안을 뱀 모양으로 잇는다. 연속 칸 사이가 항상 인접하므로 담당 구역을
 * 순회할 때 농부가 밭을 가로질러 순간적으로 크게 이동하지 않는다.
 */
export function farmWorkTilePath(plot: FarmPlot): FarmWorkTile[] {
  const { w, h } = buildingFootprintDims(plot);
  const tiles: FarmWorkTile[] = [];
  for (let row = 0; row < h; row++) {
    if (row % 2 === 0) {
      for (let column = 0; column < w; column++) {
        tiles.push({ x: plot.x + column, y: plot.y + row });
      }
    } else {
      for (let column = w - 1; column >= 0; column--) {
        tiles.push({ x: plot.x + column, y: plot.y + row });
      }
    }
  }
  return tiles;
}

/**
 * 활성 농부를 ID 순으로 놓고 뱀 모양 경로를 연속 구간으로 균등 분할한다.
 * 2×2 밭에 농부 둘이면 각자 인접한 두 칸을 맡고, 두 구역의 합은 네 칸 전체다.
 */
export function farmWorkTilesByResident(
  plot: FarmPlot,
  residentIds: readonly number[],
): Map<number, FarmWorkTile[]> {
  const tiles = farmWorkTilePath(plot);
  const ids = [...new Set(residentIds)].sort((a, b) => a - b);
  const result = new Map<number, FarmWorkTile[]>();
  if (ids.length === 0) return result;

  for (let index = 0; index < ids.length; index++) {
    const start = Math.floor(index * tiles.length / ids.length);
    const end = Math.floor((index + 1) * tiles.length / ids.length);
    result.set(ids[index], tiles.slice(start, Math.max(start + 1, end)));
  }
  return result;
}

export function farmWorkTileForTick(
  plot: FarmPlot,
  residentIds: readonly number[],
  residentId: number,
  absoluteTick: number,
): FarmWorkTile {
  const path = farmWorkTilePath(plot);
  const assigned = farmWorkTilesByResident(plot, residentIds).get(residentId) ?? path;
  const step = Math.floor(Math.max(0, absoluteTick) / FARM_WORK_TILE_DWELL_SUBTICKS);
  return assigned[step % assigned.length] ?? path[0] ?? { x: plot.x, y: plot.y };
}
