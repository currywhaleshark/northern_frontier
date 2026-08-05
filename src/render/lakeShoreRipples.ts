interface LakeBanks {
  n: boolean;
  e: boolean;
  s: boolean;
  w: boolean;
}

interface LakeShoreRipple {
  edge: keyof LakeBanks;
  offset: number;
  phase: number;
}

function hash(x: number, y: number, band: number): number {
  const value = Math.sin(x * 127.1 + y * 311.7 + band * 74.7) * 43758.5453;
  return value - Math.floor(value);
}

/**
 * 물가 변에서 호수 안쪽으로 진행하는 파문 띠. Canvas drawing과 분리해 결정론을 테스트한다.
 */
export function lakeShoreRipples(
  banks: LakeBanks,
  tileX: number,
  tileY: number,
  timeMs: number,
  tileSize: number,
): LakeShoreRipple[] {
  const ripples: LakeShoreRipple[] = [];
  (['n', 'e', 's', 'w'] as const).forEach((edge, edgeIndex) => {
    if (!banks[edge]) return;
    for (let band = 0; band < 2; band++) {
      const phase = (timeMs / 2400 + hash(tileX, tileY, edgeIndex * 3 + band)) % 1;
      ripples.push({
        edge,
        offset: tileSize * (0.13 + phase * 0.48 + band * 0.09),
        phase,
      });
    }
  });
  return ripples;
}
