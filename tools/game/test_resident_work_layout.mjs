import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../../src/render/residentWorkLayout.ts', import.meta.url), 'utf8');
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
const moduleUrl = `data:text/javascript;base64,${Buffer.from(output).toString('base64')}`;
const { residentWorkStances } = await import(moduleUrl);

const resident = (id, overrides = {}) => ({
  id, alive: true, phase: 'working', x: 4, y: 5, px: 4, py: 5, ...overrides,
});
const key = stance => `${stance.offsetX.toFixed(5)},${stance.offsetY.toFixed(5)}`;

for (const count of [1, 2, 4, 6, 8, 12]) {
  const residents = Array.from({ length: count }, (_unused, index) => resident(100 + index * 7));
  const stances = residentWorkStances(residents, 32);
  assert.equal(stances.size, count, `${count} workers all receive a stance`);
  assert.equal(new Set([...stances.values()].map(key)).size, count,
    `${count} workers receive unique offsets`);
  for (const stance of stances.values()) {
    assert.ok(Math.abs(stance.offsetX) <= 32 * 0.34, 'worker remains horizontally near the tile center');
    assert.ok(Math.abs(stance.offsetY) <= 32 * 0.14, 'worker remains vertically near the ground line');
  }

  const reversed = residentWorkStances([...residents].reverse(), 32);
  for (const worker of residents) {
    assert.deepEqual(reversed.get(worker.id), stances.get(worker.id),
      'resident input order does not change the ID-sorted stance');
  }
  const repeat = residentWorkStances(residents, 32);
  assert.deepEqual([...repeat], [...stances], 'the same input is deterministic');
}

const mixed = [resident(10), resident(20), resident(30), resident(40)];
const hidden = new Set([20, 30]);
const compact = residentWorkStances(mixed, 32, hidden);
const expectedTwo = residentWorkStances([mixed[0], mixed[3]], 32);
assert.deepEqual([...compact], [...expectedTwo], 'hidden interior workers do not consume visible stance slots');
assert.equal(compact.has(20), false);
assert.equal(compact.has(30), false);

const eligibility = residentWorkStances([
  resident(1),
  resident(2, { px: 3 }),
  resident(3, { phase: 'rest' }),
], 32);
assert.ok(eligibility.has(1));
assert.equal(eligibility.has(2), false, 'moving workers stay on their interpolated path');
assert.equal(eligibility.has(3), false, 'resting residents keep their normal position');

console.log('resident work layout tests passed');
