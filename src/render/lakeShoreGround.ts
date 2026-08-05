import type { CoastalGroundKind } from '../game/tidalFlats';

type LakeShoreGroundKind = Exclude<CoastalGroundKind, 'mudflat'>;

interface LakeShoreEdges {
  readonly n: boolean;
  readonly e: boolean;
  readonly s: boolean;
  readonly w: boolean;
}

function hash2(x: number, y: number): number {
  let value = Math.imul(x ^ 0x6d2b79f5, 0x45d9f3b);
  value ^= Math.imul(y ^ 0x27d4eb2d, 0x119de1f3);
  value ^= value >>> 16;
  value = Math.imul(value, 0x45d9f3b);
  return (value ^ (value >>> 16)) >>> 0;
}

/**
 * 짧은 호반 구간에만 해변 재질을 배정한다. 3×3 묶음으로 판정해 한 칸 체크무늬를 피하고,
 * 생태적으로 다른 갯벌은 후보에 넣지 않는다.
 */
export function lakeShoreGroundAt(
  edges: LakeShoreEdges,
  tileX: number,
  tileY: number,
): LakeShoreGroundKind | null {
  if (!edges.n && !edges.e && !edges.s && !edges.w) return null;
  const blockX = Math.floor(tileX / 3);
  const blockY = Math.floor(tileY / 3);
  if (hash2(blockX, blockY) % 100 >= 38) return null;
  const materialRoll = hash2(blockX + 193, blockY - 317) % 100;
  if (materialRoll < 55) return 'sand';
  if (materialRoll < 87) return 'shingle';
  return 'rocky';
}
