import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import ts from 'typescript';

const source = readFileSync(new URL('../../src/render/wallFamilyAssets.ts', import.meta.url), 'utf8');
const output = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const moduleUrl = `data:text/javascript;base64,${Buffer.from(output).toString('base64')}`;
const assets = await import(moduleUrl);

assert.deepEqual(assets.WALL_FAMILY_SHEET, {
  tileSize: 28,
  spriteHeight: 40,
  columns: 16,
  rows: 12,
  src: '/assets/wall-family-generated-v1.png',
});

assert.equal(assets.wallConnectionMask({ n: false, e: false, s: false, w: false }), 0);
assert.equal(assets.wallConnectionMask({ n: true, e: false, s: false, w: false }), 1);
assert.equal(assets.wallConnectionMask({ n: false, e: true, s: false, w: false }), 2);
assert.equal(assets.wallConnectionMask({ n: false, e: false, s: true, w: false }), 4);
assert.equal(assets.wallConnectionMask({ n: false, e: false, s: false, w: true }), 8);
assert.equal(assets.wallConnectionMask({ n: true, e: true, s: true, w: true }), 15);

assert.deepEqual(
  assets.wallFamilySourceRect('palisade', { n: true, e: false, s: true, w: false }, 'summer'),
  { sx: 5 * 28, sy: 0, sw: 28, sh: 40 },
);
assert.deepEqual(
  assets.wallFamilySourceRect('earthFort', { n: false, e: true, s: false, w: true }, 'summer'),
  { sx: 10 * 28, sy: 40, sw: 28, sh: 40 },
);
assert.deepEqual(
  assets.wallFamilySourceRect('stoneWall', { n: true, e: true, s: true, w: true }, 'winter'),
  { sx: 15 * 28, sy: 8 * 40, sw: 28, sh: 40 },
);

assert.equal(assets.gateVisualMaterial({ n: 'palisade' }), 'wood');
assert.equal(assets.gateVisualMaterial({ n: 'earthFort', s: 'palisade' }), 'earth');
assert.equal(assets.gateVisualMaterial({ e: 'stoneWall', w: 'earthFort' }), 'stone');
assert.equal(assets.gateVisualMaterial({ n: 'gate', s: 'gate' }), 'wood');

assert.deepEqual(
  assets.wallFamilySourceRect('gate', { n: false, e: true, s: false, w: true }, 'summer', { e: 'earthFort' }),
  { sx: 10 * 28, sy: 4 * 40, sw: 28, sh: 40 },
);
assert.deepEqual(
  assets.wallFamilySourceRect('gate', { n: false, e: true, s: false, w: true }, 'winter', { w: 'stoneWall' }),
  { sx: 10 * 28, sy: 11 * 40, sw: 28, sh: 40 },
);

console.log('wall family asset tests passed');
