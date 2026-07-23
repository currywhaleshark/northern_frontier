import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../../src/game/dayCycle.ts', import.meta.url), 'utf8');
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
const moduleUrl = `data:text/javascript;base64,${Buffer.from(output).toString('base64')}`;
const { DAY_CYCLE_SUBTICKS, DAY_BANDS, dayBandOf, isIndoors } = await import(moduleUrl);

assert.equal(DAY_CYCLE_SUBTICKS, 12);
assert.deepEqual(DAY_BANDS, {
  dawn: { start: 0, end: 0 },
  work: { start: 1, end: 8 },
  evening: { start: 9, end: 9 },
  night: { start: 10, end: 11 },
});
assert.equal(DAY_BANDS.work.end - DAY_BANDS.work.start + 1, 8,
  'the target day cycle preserves exactly eight work subticks');

const expectedBands = [
  'dawn',
  'work', 'work', 'work', 'work', 'work', 'work', 'work', 'work',
  'evening',
  'night', 'night',
];
assert.deepEqual(
  Array.from({ length: DAY_CYCLE_SUBTICKS }, (_, subTick) => dayBandOf(subTick)),
  expectedBands,
);
for (const invalid of [-1, 12, 0.5, Number.NaN, Number.POSITIVE_INFINITY]) {
  assert.throws(() => dayBandOf(invalid), RangeError);
}

const state = {
  buildings: [
    { id: 1, type: 'hut', built: true },
    { id: 2, type: 'shrine', built: true },
    { id: 3, type: 'hermitage', built: true },
    { id: 4, type: 'market', built: true },
    { id: 5, type: 'hut', built: false },
  ],
};
const resident = (overrides) => ({
  phase: 'rest',
  homeBuildingId: 1,
  targetId: null,
  ...overrides,
});

assert.equal(isIndoors(state, resident({ phase: 'sleeping' })), true);
assert.equal(isIndoors(state, resident({ phase: 'sleeping', homeBuildingId: null })), false);
assert.equal(isIndoors(state, resident({ phase: 'sleeping', homeBuildingId: 5 })), false);
assert.equal(isIndoors(state, resident({ phase: 'toHome' })), false);
assert.equal(isIndoors(state, resident({ phase: 'toLeisure', targetId: 2 })), false);
assert.equal(isIndoors(state, resident({ phase: 'leisure', targetId: 2 })), true);
assert.equal(isIndoors(state, resident({ phase: 'leisure', targetId: 3 })), true);
assert.equal(isIndoors(state, resident({ phase: 'leisure', targetId: 4 })), false);
assert.equal(isIndoors(state, resident({ phase: 'leisure', targetId: null })), false);

const configSource = readFileSync(new URL('../../src/game/config.ts', import.meta.url), 'utf8');
assert.match(configSource, /subticksPerDay:\s*8\b/,
  'M0 exposes the target contract without changing the runtime day length');

console.log('daily cycle contract tests passed');
