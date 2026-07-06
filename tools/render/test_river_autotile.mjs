import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import ts from 'typescript';

const source = readFileSync(new URL('../../src/render/riverAutotile.ts', import.meta.url), 'utf8');
const output = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const moduleUrl = `data:text/javascript;base64,${Buffer.from(output).toString('base64')}`;
const {
  riverConnectorColumnFromBanks,
  riverSeasonRow,
  riverSourceRect,
} = await import(moduleUrl);

const banksForOpenings = (open) => ({
  n: !open.includes('n'),
  e: !open.includes('e'),
  s: !open.includes('s'),
  w: !open.includes('w'),
});

const cases = [
  ['ns', 0],
  ['ew', 1],
  ['es', 2],
  ['sw', 3],
  ['nw', 4],
  ['ne', 5],
  ['n', 6],
  ['e', 7],
  ['s', 8],
  ['w', 9],
  ['nes', 10],
  ['esw', 11],
  ['nsw', 12],
  ['new', 13],
  ['nesw', 14],
  ['', 15],
];

for (const [openings, expectedColumn] of cases) {
  assert.equal(
    riverConnectorColumnFromBanks(banksForOpenings(openings)),
    expectedColumn,
    `openings "${openings}" should use column ${expectedColumn}`,
  );
}

assert.equal(riverConnectorColumnFromBanks(undefined), 14);
assert.equal(riverSeasonRow('spring', false), 0);
assert.equal(riverSeasonRow('summer', false), 1);
assert.equal(riverSeasonRow('autumn', false), 2);
assert.equal(riverSeasonRow('winter', true), 3);
assert.equal(riverSeasonRow('winter', false), 0);
assert.deepEqual(riverSourceRect('autumn', false, banksForOpenings('es')), {
  sx: 56,
  sy: 56,
  sw: 28,
  sh: 28,
});

console.log('river autotile tests passed');
