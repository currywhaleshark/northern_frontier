import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import ts from 'typescript';

const source = readFileSync(new URL('../../src/render/historicalTerrain.ts', import.meta.url), 'utf8');
const output = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const moduleUrl = `data:text/javascript;base64,${Buffer.from(output).toString('base64')}`;
const {
  historicalTerrainColumn,
  historicalTerrainSeasonRow,
  historicalTerrainSampleOffsetFromHash,
  historicalTerrainSourceRect,
  historicalTerrainVariantFromHash,
} = await import(moduleUrl);

const columnCases = [
  ['plain', 0],
  ['center', 0],
  ['forest', 0],
  ['river', null],
  ['mountain', 0],
  ['rock', 0],
  ['fertile', 0],
];

for (const [terrain, expectedColumn] of columnCases) {
  assert.equal(historicalTerrainColumn(terrain), expectedColumn, `${terrain} column`);
}

assert.equal(historicalTerrainSeasonRow('spring'), 0);
assert.equal(historicalTerrainSeasonRow('summer'), 1);
assert.equal(historicalTerrainSeasonRow('autumn'), 2);
assert.equal(historicalTerrainSeasonRow('winter'), 3);
assert.deepEqual(historicalTerrainSourceRect('plain', 'spring'), {
  sx: 3,
  sy: 3,
  sw: 20,
  sh: 20,
});
assert.deepEqual(historicalTerrainSourceRect('forest', 'autumn'), {
  sx: 3,
  sy: 59,
  sw: 20,
  sh: 20,
});
assert.deepEqual(historicalTerrainSourceRect('fertile', 'summer'), {
  sx: 3,
  sy: 31,
  sw: 20,
  sh: 20,
});
assert.equal(historicalTerrainSourceRect('river', 'summer'), null);
assert.deepEqual(historicalTerrainSampleOffsetFromHash(0), { dx: 0, dy: 0 });
assert.deepEqual(historicalTerrainSampleOffsetFromHash(4), { dx: 1, dy: 0 });
assert.deepEqual(historicalTerrainSampleOffsetFromHash(8), { dx: 2, dy: 0 });
assert.deepEqual(historicalTerrainSampleOffsetFromHash(16), { dx: 1, dy: 1 });
assert.deepEqual(historicalTerrainSampleOffsetFromHash(32), { dx: 2, dy: 2 });
assert.deepEqual(historicalTerrainVariantFromHash(0), { flipX: false, flipY: false });
assert.deepEqual(historicalTerrainVariantFromHash(1), { flipX: true, flipY: false });
assert.deepEqual(historicalTerrainVariantFromHash(2), { flipX: false, flipY: true });
assert.deepEqual(historicalTerrainVariantFromHash(3), { flipX: true, flipY: true });

console.log('historical terrain tests passed');
