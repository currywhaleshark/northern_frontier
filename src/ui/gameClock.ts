interface GameClockStep {
  accumulator: number;
  ticksToAdvance: number;
}

export function advanceGameClock(
  accumulator: number,
  elapsed: number,
  msPerTick: number,
  maxCatchUpTicks: number,
): GameClockStep {
  if (!Number.isFinite(msPerTick) || msPerTick <= 0) {
    return { accumulator: 0, ticksToAdvance: 0 };
  }
  const safeAccumulator = Number.isFinite(accumulator) ? Math.max(0, accumulator) : 0;
  const safeElapsed = Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0;
  const safeMaxTicks = Number.isFinite(maxCatchUpTicks)
    ? Math.max(0, Math.floor(maxCatchUpTicks))
    : 0;
  const capped = Math.min(safeAccumulator + safeElapsed, msPerTick * safeMaxTicks);
  const ticksToAdvance = Math.floor(capped / msPerTick);
  return {
    accumulator: capped - ticksToAdvance * msPerTick,
    ticksToAdvance,
  };
}

