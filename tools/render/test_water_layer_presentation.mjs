import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(
  new URL('../../src/render/waterLayerPresentation.ts', import.meta.url),
  'utf8',
);
const output = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const moduleUrl = `data:text/javascript;base64,${Buffer.from(output).toString('base64')}`;
const presentation = await import(moduleUrl);

const tint = (type, built, supply, wellStatus) =>
  presentation.waterLayerTintForBuilding(type, built, supply, wellStatus)?.kind ?? null;

assert.equal(tint('well', false, undefined, null), 'well');
assert.equal(tint('well', true, undefined, null), 'unsupplied');
assert.equal(tint('well', true, undefined, {
  levelRatio: 0.2,
  dailyOutput: 2,
}), 'well-low');
assert.equal(tint('well', true, undefined, {
  levelRatio: 0.7,
  dailyOutput: 8,
}), 'well');

assert.equal(tint('hut', true, undefined, null), null);
assert.equal(tint('hut', true, {
  demand: 2,
  supplied: 2,
  ratio: 1,
  source: 'river',
}, null), 'river-supplied');
assert.equal(tint('hut', true, {
  demand: 2,
  supplied: 2,
  ratio: 1,
  source: 'well',
}, null), 'well-supplied');
assert.equal(tint('hut', true, {
  demand: 2,
  supplied: 0.8,
  ratio: 0.4,
  source: 'well',
}, null), 'partially-supplied');
assert.equal(tint('hut', true, {
  demand: 2,
  supplied: 0,
  ratio: 0,
  source: 'none',
}, null), 'unsupplied');

console.log('water layer presentation tests passed');
