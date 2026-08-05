import type { Tile } from './types';

interface GoalPoint {
  x: number;
  y: number;
}

interface GoalField {
  width: number;
  height: number;
  goals: GoalPoint[];
  mask: Uint8Array;
  heuristic: Int32Array;
}

export interface DescribedGoal {
  (tile: Tile): boolean;
  goalPoints?: readonly GoalPoint[];
  goalHeuristic?: Int32Array;
  goalWidth?: number;
  goalHeight?: number;
}

const DIRS = [
  [1, 0, 10], [-1, 0, 10], [0, 1, 10], [0, -1, 10],
  [1, 1, 14], [1, -1, 14], [-1, 1, 14], [-1, -1, 14],
] as const;

export function describeGoal(
  predicate: (tile: Tile) => boolean,
  points: readonly GoalPoint[],
  field?: Pick<GoalField, 'width' | 'height' | 'heuristic'>,
): DescribedGoal {
  const described = predicate as DescribedGoal;
  described.goalPoints = points;
  described.goalHeuristic = field?.heuristic;
  described.goalWidth = field?.width;
  described.goalHeight = field?.height;
  return described;
}

export function buildGoalField(
  map: readonly (readonly Tile[])[],
  predicate: (tile: Tile) => boolean,
): GoalField {
  const height = map.length;
  const width = map[0]?.length ?? 0;
  const size = width * height;
  const mask = new Uint8Array(size);
  const heuristic = new Int32Array(size);
  heuristic.fill(0x3fffffff);
  const goals: GoalPoint[] = [];
  const heapNode: number[] = [];
  const heapScore: number[] = [];

  const heapPush = (node: number, score: number): void => {
    let index = heapNode.length;
    heapNode.push(node);
    heapScore.push(score);
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (heapScore[parent] < score || (heapScore[parent] === score && heapNode[parent] <= node)) break;
      heapNode[index] = heapNode[parent];
      heapScore[index] = heapScore[parent];
      index = parent;
    }
    heapNode[index] = node;
    heapScore[index] = score;
  };

  const heapPop = (): [number, number] | null => {
    if (heapNode.length === 0) return null;
    const node = heapNode[0];
    const score = heapScore[0];
    const tailNode = heapNode.pop()!;
    const tailScore = heapScore.pop()!;
    if (heapNode.length > 0) {
      let index = 0;
      while (true) {
        const left = index * 2 + 1;
        if (left >= heapNode.length) break;
        const right = left + 1;
        let child = left;
        if (right < heapNode.length &&
          (heapScore[right] < heapScore[left] ||
            (heapScore[right] === heapScore[left] && heapNode[right] < heapNode[left]))) child = right;
        if (heapScore[child] > tailScore ||
          (heapScore[child] === tailScore && heapNode[child] >= tailNode)) break;
        heapNode[index] = heapNode[child];
        heapScore[index] = heapScore[child];
        index = child;
      }
      heapNode[index] = tailNode;
      heapScore[index] = tailScore;
    }
    return [node, score];
  };

  for (let y = 0; y < height; y++) {
    const row = map[y];
    for (let x = 0; x < Math.min(width, row.length); x++) {
      const tile = row[x];
      if (!predicate(tile)) continue;
      const index = y * width + x;
      mask[index] = 1;
      heuristic[index] = 0;
      goals.push({ x, y });
      heapPush(index, 0);
    }
  }

  while (heapNode.length > 0) {
    const entry = heapPop();
    if (!entry) break;
    const [node, score] = entry;
    if (score !== heuristic[node]) continue;
    const x = node % width;
    const y = (node - x) / width;
    for (const [dx, dy, step] of DIRS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const next = ny * width + nx;
      const nextScore = score + step;
      if (nextScore >= heuristic[next]) continue;
      heuristic[next] = nextScore;
      heapPush(next, nextScore);
    }
  }

  return { width, height, goals, mask, heuristic };
}

export function goalFromField(field: GoalField): DescribedGoal {
  return describeGoal(
    tile => field.mask[tile.y * field.width + tile.x] === 1,
    field.goals,
    field,
  );
}
