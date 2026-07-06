import type { Terrain, Tile } from './types';

export interface ForestHabitat {
  id: string;
  x: number;
  y: number;
  radius: number;
  forestTiles: number;
}

export interface ForestHabitatOptions {
  minTiles: number;
  radius: number;
}

const DEFAULT_OPTIONS: ForestHabitatOptions = {
  minTiles: 8,
  radius: 4,
};

export function isForestHabitatCover(terrain: Terrain): boolean {
  return terrain === 'forest' || terrain === 'hunting';
}

export function findForestHabitats(
  map: Tile[][],
  options: Partial<ForestHabitatOptions> = {},
): ForestHabitat[] {
  const resolved = { ...DEFAULT_OPTIONS, ...options };
  const height = map.length;
  const width = map[0]?.length ?? 0;
  const visited = new Set<string>();
  const habitats: ForestHabitat[] = [];

  const keyOf = (x: number, y: number) => `${x},${y}`;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const start = map[y]?.[x];
      const startKey = keyOf(x, y);
      if (!start || visited.has(startKey) || !isForestHabitatCover(start.terrain)) continue;

      const component: Tile[] = [];
      const stack: Array<[number, number]> = [[x, y]];
      visited.add(startKey);

      while (stack.length > 0) {
        const [cx, cy] = stack.pop()!;
        const tile = map[cy]?.[cx];
        if (!tile || !isForestHabitatCover(tile.terrain)) continue;
        component.push(tile);

        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx;
          const ny = cy + dy;
          const next = map[ny]?.[nx];
          const nextKey = keyOf(nx, ny);
          if (!next || visited.has(nextKey) || !isForestHabitatCover(next.terrain)) continue;
          visited.add(nextKey);
          stack.push([nx, ny]);
        }
      }

      if (component.length < resolved.minTiles) continue;
      const center = pickCenterTile(component);
      habitats.push({
        id: `forest-habitat-${center.x}-${center.y}`,
        x: center.x,
        y: center.y,
        radius: resolved.radius,
        forestTiles: component.length,
      });
    }
  }

  return habitats;
}

// 사냥 수확 배율 규칙 — config 값을 호출자가 넘긴다 (이 모듈은 의존성 없이 단독 테스트된다)
export interface HuntableYieldOptions {
  strayYield: number;        // 서식지 밖 명시적 사냥터 지형의 배율
  habitatYieldBase: number;  // 서식지 기본 배율
  habitatYieldPerTile: number; // 서식지 숲 1타일당 가산
  habitatYieldMax: number;
}

export function habitatYieldMult(habitat: ForestHabitat, opts: HuntableYieldOptions): number {
  return Math.min(opts.habitatYieldMax, opts.habitatYieldBase + opts.habitatYieldPerTile * habitat.forestTiles);
}

// 사냥꾼이 일할 수 있는 타일 → 수확 배율 ("x,y" 키).
// 서식지 반경 안의 숲/사냥터 덮개는 서식지 크기에 비례한 배율,
// 명시적 사냥터 지형은 서식지가 없어도 최소 배율을 보장한다(고립 조각 보호).
// 여러 서식지가 겹치면 높은 배율을 따른다.
export function collectHuntableTiles(
  map: Tile[][],
  habitats: ForestHabitat[],
  opts: HuntableYieldOptions,
): Map<string, number> {
  const tiles = new Map<string, number>();
  for (const row of map) {
    for (const tile of row) {
      if (tile.terrain === 'hunting') tiles.set(`${tile.x},${tile.y}`, opts.strayYield);
    }
  }
  for (const habitat of habitats) {
    const mult = habitatYieldMult(habitat, opts);
    const r = habitat.radius;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r) continue; // 렌더러의 범위 원과 같은 원형 판정
        const tile = map[habitat.y + dy]?.[habitat.x + dx];
        if (!tile || !isForestHabitatCover(tile.terrain)) continue;
        const key = `${tile.x},${tile.y}`;
        tiles.set(key, Math.max(tiles.get(key) ?? 0, mult));
      }
    }
  }
  return tiles;
}

export function findForestHabitatIconAtTile(
  habitats: ForestHabitat[],
  x: number,
  y: number,
): ForestHabitat | null {
  return habitats.find(habitat => habitat.x === x && habitat.y === y) ?? null;
}

function pickCenterTile(component: Tile[]): Tile {
  const cx = component.reduce((sum, tile) => sum + tile.x, 0) / component.length;
  const cy = component.reduce((sum, tile) => sum + tile.y, 0) / component.length;
  return [...component].sort((a, b) => {
    const da = (a.x - cx) ** 2 + (a.y - cy) ** 2;
    const db = (b.x - cx) ** 2 + (b.y - cy) ** 2;
    if (da !== db) return da - db;
    if (a.y !== b.y) return a.y - b.y;
    return a.x - b.x;
  })[0];
}
