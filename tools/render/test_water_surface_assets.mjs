import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ROOT = new URL('../../', import.meta.url);
const surfaces = ['river', 'lake', 'sea', 'river-ice', 'lake-ice'];

for (const surface of surfaces) {
  for (const [variant, size] of [['standard-448px', 448], ['hd-896px', 896]]) {
    const png = readFileSync(new URL(
      `public/assets/water-${surface}-seamless-v1-${variant}.png`, ROOT,
    ));
    assert.equal(png.toString('ascii', 1, 4), 'PNG', `${surface} ${variant}`);
    assert.equal(png.readUInt32BE(16), size, `${surface} ${variant} width`);
    assert.equal(png.readUInt32BE(20), size, `${surface} ${variant} height`);
  }
}

const assetsSource = readFileSync(new URL('src/render/waterSurfaceAssets.ts', ROOT), 'utf8');
const atlasSource = readFileSync(new URL('src/render/atlas.ts', ROOT), 'utf8');
const buildSource = readFileSync(new URL('tools/render/build_water_seamless_textures_v1.py', ROOT), 'utf8');

for (const kind of ['river', 'lake', 'sea', 'riverIce', 'lakeIce']) {
  assert.match(assetsSource, new RegExp(`${kind}:`), `missing ${kind} water surface pair`);
}
assert.match(atlasSource, /activeWaterSurface/,
  'runtime should prefer large seamless water surfaces');
assert.match(atlasSource, /p\.terrain === 'lake' \? 'lakeIce' : 'riverIce'/,
  'frozen river and lake should select distinct textures');
assert.doesNotMatch(atlasSource, /언 강 표시 — 얼음 텍스처 위에 옅은 균열 한 줄/,
  'the old forced one-line ice crack should be removed');
assert.match(buildSource, /"--output-hd"[\s\S]+"--output-standard"/,
  'water textures should build HD before deriving standard');

console.log('water surface asset tests passed');
