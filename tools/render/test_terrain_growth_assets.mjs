import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import ts from 'typescript';

function pngSize(path) {
  const png = readFileSync(new URL(path, import.meta.url));
  assert.equal(png.toString('ascii', 1, 4), 'PNG', `${path} is a PNG`);
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

const source = readFileSync(new URL('../../src/render/terrainGrowthAssets.ts', import.meta.url), 'utf8');
const output = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const moduleUrl = `data:text/javascript;base64,${Buffer.from(output).toString('base64')}`;
const {
  TERRAIN_GROWTH_DRAW_SIZE,
  TERRAIN_GROWTH_SHEETS,
  TERRAIN_GROWTH_TREE_DRAW_SCALE,
  mineralGrowthSourceRect,
  mountainGrowthSourceRect,
  treeGrowthSourceRect,
} = await import(moduleUrl);

assert.deepEqual(TERRAIN_GROWTH_DRAW_SIZE, { width: 98, height: 112 });
assert.equal(TERRAIN_GROWTH_TREE_DRAW_SCALE, 0.7);
assert.deepEqual(pngSize('../../public/assets/terrain/folk-warm-terrain-growth-v1.png'), {
  width: 588,
  height: 1008,
});
assert.deepEqual(pngSize('../../public/assets/terrain/folk-warm-terrain-growth-v1-hd.png'), {
  width: 1176,
  height: 2016,
});
assert.equal(
  TERRAIN_GROWTH_SHEETS.highDefinition.cellWidth,
  TERRAIN_GROWTH_SHEETS.standard.cellWidth * 2,
);
assert.equal(
  TERRAIN_GROWTH_SHEETS.highDefinition.cellHeight,
  TERRAIN_GROWTH_SHEETS.standard.cellHeight * 2,
);

assert.deepEqual(
  treeGrowthSourceRect(TERRAIN_GROWTH_SHEETS.standard, 'autumn', 'conifer', 'mature'),
  { sx: 490, sy: 224, sw: 98, sh: 112 },
);
assert.deepEqual(
  mineralGrowthSourceRect(TERRAIN_GROWTH_SHEETS.standard, 'iron', 'large'),
  { sx: 294, sy: 560, sw: 98, sh: 112 },
);
assert.deepEqual(
  mountainGrowthSourceRect(TERRAIN_GROWTH_SHEETS.highDefinition, true, 'cliff'),
  { sx: 784, sy: 1792, sw: 196, sh: 224 },
);

const manifest = JSON.parse(readFileSync(
  new URL('../../docs/assets/terrain/folk-warm-terrain-growth-v1-manifest.json', import.meta.url),
  'utf8',
));
assert.equal(manifest.groups.trees.frames.length, 24);
assert.equal(manifest.groups.minerals.frames.length, 15);
assert.equal(manifest.groups.mountains.frames.length, 10);
for (const group of Object.values(manifest.groups)) {
  for (const frame of group.frames) {
    assert.equal(frame.sourceTouchesImageEdge, false, `${group.source} ${frame.row},${frame.col} is cropped`);
    assert.ok(frame.packedSizeHd[0] > 0 && frame.packedSizeHd[1] > 0);
    assert.ok(frame.packedSizeHd[0] <= manifest.cellHd[0]);
    assert.ok(frame.packedSizeHd[1] <= manifest.cellHd[1]);
  }
}

console.log('terrain growth asset tests passed');
