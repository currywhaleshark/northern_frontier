import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const source = readFileSync(new URL('../../src/ui/gameClock.ts', import.meta.url), 'utf8');
const outDir = mkdtempSync(join(tmpdir(), 'northern-game-clock-'));
const output = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const outputPath = join(outDir, 'gameClock.mjs');
writeFileSync(outputPath, output, 'utf8');

const { advanceGameClock } = await import(pathToFileURL(outputPath).href);

{
  let accumulator = 0;
  let ticks = 0;
  for (let i = 0; i < 100; i++) {
    const step = advanceGameClock(accumulator, 5, 1000, 24);
    accumulator = step.accumulator;
    ticks += step.ticksToAdvance;
  }
  assert.equal(ticks, 0, 'sub-tick elapsed does not advance the simulation');
  assert.equal(accumulator, 500, 'sub-tick elapsed remains accumulated');
}

{
  const step = advanceGameClock(250, 2950, 1000, 24);
  assert.equal(step.ticksToAdvance, 3, 'elapsed time advances the expected whole ticks');
  assert.equal(step.accumulator, 200, 'elapsed time preserves the remainder');
}

{
  const step = advanceGameClock(0, 100_000, 1000, 24);
  assert.equal(step.ticksToAdvance, 24, 'catch-up is capped at the configured tick count');
  assert.equal(step.accumulator, 0, 'capped catch-up consumes the capped accumulator');
}

{
  assert.deepEqual(
    advanceGameClock(Number.NaN, -5, 0, Number.POSITIVE_INFINITY),
    { accumulator: 0, ticksToAdvance: 0 },
    'invalid clock inputs fail closed',
  );
}

console.log('game clock tests passed');

