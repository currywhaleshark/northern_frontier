import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

function pngSize(path) {
  const png = readFileSync(new URL(path, import.meta.url));
  assert.equal(png.toString('ascii', 1, 4), 'PNG', `${path} is a PNG`);
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

const source = readFileSync(
  new URL('../../src/render/obliqueBuildingAssets.ts', import.meta.url),
  'utf8',
);
const output = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const moduleUrl = `data:text/javascript;base64,${Buffer.from(output).toString('base64')}`;
const assets = await import(moduleUrl);

assert.deepEqual(pngSize('../../public/assets/oblique-buildings-1x1-v1.png'), {
  width: 252,
  height: 80,
});
assert.deepEqual(pngSize('../../public/assets/oblique-buildings-1x1-v1-hd.png'), {
  width: 504,
  height: 160,
});
assert.deepEqual(pngSize('../../public/assets/oblique-buildings-2x2-v1.png'), {
  width: 1344,
  height: 160,
});
assert.deepEqual(pngSize('../../public/assets/oblique-buildings-2x2-v1-hd.png'), {
  width: 2688,
  height: 320,
});
assert.deepEqual(pngSize('../../public/assets/oblique-centers-v1.png'), {
  width: 336,
  height: 160,
});
assert.deepEqual(pngSize('../../public/assets/oblique-centers-v1-hd.png'), {
  width: 672,
  height: 320,
});

assert.equal(assets.OBLIQUE_BUILDING_1X1_TYPES.length, 9);
assert.equal(assets.OBLIQUE_BUILDING_2X2_TYPES.length, 24);
assert.deepEqual(assets.obliqueBuildingFrame('hut'), { group: 'twoTile', column: 0 });
assert.deepEqual(assets.obliqueBuildingFrame('watchtower'), { group: 'oneTile', column: 8 });
assert.deepEqual(assets.obliqueBuildingFrame('center', 'bu'), { group: 'center', column: 3 });
assert.equal(assets.obliqueBuildingFrame('bridge'), null);
assert.equal(assets.obliqueBuildingFrame('field'), null);
assert.equal(assets.obliqueBuildingFrame('stoneWall'), null);

const normal = assets.obliqueBuildingSourceRect(
  assets.OBLIQUE_BUILDING_SHEETS.oneTile.standard,
  2,
  'spring',
);
assert.deepEqual(normal, { sx: 56, sy: 0, sw: 28, sh: 40 });
const winter = assets.obliqueBuildingSourceRect(
  assets.OBLIQUE_BUILDING_SHEETS.twoTile.highDefinition,
  23,
  'winter',
);
assert.deepEqual(winter, { sx: 2576, sy: 160, sw: 112, sh: 160 });

const manifest = JSON.parse(readFileSync(
  new URL('../../docs/assets/buildings/oblique-buildings-v1-manifest.json', import.meta.url),
  'utf8',
));
assert.equal(manifest.version, 2);
assert.deepEqual(Object.keys(manifest.groups).sort(), ['center', 'oneTile', 'twoTile']);
for (const group of Object.values(manifest.groups)) {
  assert.equal(group.frames.length, group.frameOrder.length * 2);
  assert.ok(group.frames.every(frame => frame.touchesCellEdge === false));
}
for (const id of ['beacon', 'shrine', 'hermitage', 'cannonEmplacement']) {
  const frames = manifest.groups.twoTile.frames.filter(frame => frame.id === id);
  assert.equal(frames.length, 2);
  assert.ok(frames.every(frame => frame.source.includes('building-redesign-v2')));
}

console.log('oblique building asset tests passed');
