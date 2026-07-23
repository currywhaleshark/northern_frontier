/** Stable visual-only phase. It never enters GameState or simulation decisions. */
export function stableResidentAnimationOffset(residentId: number): number {
  const normalizedId = Math.abs(Math.trunc(residentId));
  return (normalizedId * 97) % 1000;
}
