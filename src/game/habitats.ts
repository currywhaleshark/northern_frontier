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
