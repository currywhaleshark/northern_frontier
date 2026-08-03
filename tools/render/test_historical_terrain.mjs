import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import ts from 'typescript';

const source = readFileSync(new URL('../../src/render/historicalTerrain.ts', import.meta.url), 'utf8');
const atlasSource = readFileSync(new URL('../../src/render/atlas.ts', import.meta.url), 'utf8');
const rendererSource = readFileSync(new URL('../../src/render/renderer.ts', import.meta.url), 'utf8');
const spriteContractSource = readFileSync(new URL('../../src/render/sprites.ts', import.meta.url), 'utf8');

function pngSize(path) {
  const png = readFileSync(new URL(path, import.meta.url));
  assert.equal(png.toString('ascii', 1, 4), 'PNG', `${path} is a PNG`);
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

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
  historicalTerrainVariantFor,
  historicalTerrainVariantFromHash,
} = await import(moduleUrl);

const columnCases = [
  ['plain', 0],
  ['center', 0],
  ['forest', 5],
  ['river', null],
  ['lake', null],
  ['mountain', 3],
  ['rock', 3],
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
  sx: 143,
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
assert.deepEqual(historicalTerrainSourceRect('plain', 'winter', 2), {
  sx: 6,
  sy: 174,
  sw: 40,
  sh: 40,
});
assert.equal(historicalTerrainSourceRect('river', 'summer'), null);
assert.deepEqual(historicalTerrainSampleOffsetFromHash(0), { dx: 0, dy: 0 });
assert.deepEqual(historicalTerrainSampleOffsetFromHash(4), { dx: 1, dy: 0 });
assert.deepEqual(historicalTerrainSampleOffsetFromHash(8), { dx: 2, dy: 0 });
assert.deepEqual(historicalTerrainSampleOffsetFromHash(16), { dx: 1, dy: 1 });
assert.deepEqual(historicalTerrainSampleOffsetFromHash(32), { dx: 2, dy: 2 });
assert.deepEqual(historicalTerrainSampleOffsetFromHash(32, 2), { dx: 4, dy: 4 });
assert.deepEqual(historicalTerrainVariantFromHash(0), { flipX: false, flipY: false });
assert.deepEqual(historicalTerrainVariantFromHash(1), { flipX: true, flipY: false });
assert.deepEqual(historicalTerrainVariantFromHash(2), { flipX: false, flipY: true });
assert.deepEqual(historicalTerrainVariantFromHash(3), { flipX: true, flipY: true });
assert.deepEqual(historicalTerrainVariantFor('plain', 3), { flipX: true, flipY: true });
assert.deepEqual(historicalTerrainVariantFor('forest', 3), { flipX: false, flipY: false });
assert.deepEqual(historicalTerrainVariantFor('mountain', 3), { flipX: false, flipY: false });
assert.deepEqual(historicalTerrainVariantFor('rock', 3), { flipX: false, flipY: false });

for (const [family, version] of [
  ['plain', 'v3'],
  ['forest', 'v1'],
  ['rock', 'v1'],
]) {
  for (const season of ['spring', 'summer', 'autumn', 'winter']) {
    const standardPath =
      `../../public/assets/folk-warm-${family}-${season}-seamless-${version}-standard-448px.png`;
    const hdPath =
      `../../public/assets/folk-warm-${family}-${season}-seamless-${version}-hd-896px.png`;
    assert.deepEqual(pngSize(standardPath), { width: 448, height: 448 });
    assert.deepEqual(pngSize(hdPath), { width: 896, height: 896 });
  }
}

assert.match(atlasSource, /SEAMLESS_GROUND_VERSIONS/);
assert.match(atlasSource, /activeSeamlessGroundTerrain/);
assert.match(atlasSource, /GROUND_EDGE_BAYER_4/);
assert.match(atlasSource, /samplesPerLogicalPixel = p\.highDefinition \? 2 : 1/);
assert.match(atlasSource, /drawGroundBlendKind\(ctx, neighborGround, p\)/);
assert.match(atlasSource, /drawCoastalGround\(ctx, p, 'mudflat'\);\s*blendGroundEdges\(ctx, p\)/);
assert.match(rendererSource, /sand:\s*1/);
assert.match(rendererSource, /mudflat:\s*2/);
assert.match(rendererSource, /shingle:\s*3/);
assert.match(rendererSource, /rocky:\s*4/);
assert.match(rendererSource, /forest:\s*5/);
assert.match(spriteContractSource, /export type GroundBlendKind = Terrain \| CoastalGroundKind/);

console.log('historical terrain tests passed');
