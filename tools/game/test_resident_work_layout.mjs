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
const stances = residentWorkStances([
  resident(10), resident(20), resident(30),
  resident(41, { x: 7, px: 7 }),
  resident(50, { px: 3 }),
  resident(60, { phase: 'rest' }),
], 32);

assert.ok(stances.get(10).offsetX < 0 && stances.get(10).facing === 1,
  'left-offset worker faces right toward the work point');
assert.ok(stances.get(20).offsetX > 0 && stances.get(20).facing === -1,
  'right-offset worker faces left toward the work point');
assert.notEqual(stances.get(30).offsetX, stances.get(10).offsetX,
  'additional workers use another depth slot instead of fully overlapping');
assert.ok(stances.has(41), 'a lone stationary worker still gets a side-facing work stance');
assert.equal(stances.has(50), false, 'moving workers are not offset from their interpolated path');
assert.equal(stances.has(60), false, 'resting residents keep their normal position');

const rendererSource = readFileSync(new URL('../../src/render/renderer.ts', import.meta.url), 'utf8');
assert.match(rendererSource, /residentWorkStances\(state\.residents, TILE\)/,
  'renderer builds work stances once for the resident pass');
assert.match(rendererSource, /facing:\s*workStance\?\.facing\s*\?\?/,
  'workers use the inward-facing direction supplied by their work stance');

console.log('resident work layout tests passed');
