import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ROOT = new URL('../../', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('src/render/rainwaterCisternBuildingManifest.json', ROOT), 'utf8'));
const png = readFileSync(new URL('public/assets/rainwater-cistern-building-v1.png', ROOT));
const hdPng = readFileSync(new URL('public/assets/rainwater-cistern-building-hd-v1.png', ROOT));

assert.equal(png.toString('ascii', 1, 4), 'PNG');
assert.equal(png.readUInt32BE(16), manifest.frame_layout.sheetWidth);
assert.equal(png.readUInt32BE(20), manifest.frame_layout.sheetHeight);
assert.equal(hdPng.toString('ascii', 1, 4), 'PNG');
assert.equal(hdPng.readUInt32BE(16), manifest.hd_frame_layout.sheetWidth);
assert.equal(hdPng.readUInt32BE(20), manifest.hd_frame_layout.sheetHeight);
assert.equal(manifest.engine, 'hd-first-seasonal');
assert.equal(manifest.degraded_static_fallback, false);
assert.deepEqual(manifest.display, {
  width: 28,
  height: 40,
  sourceScale: 2,
  hdSourceScale: 8,
  anchor: 'tile-bottom-left',
});
assert.deepEqual(manifest.seasonFrames, { normal: 0, winter: 1 });
assert.equal(manifest.frame_layout.rows.seasonal.length, 2);
assert.equal(manifest.hd_frame_layout.rows.seasonal.length, 2);

const buildScript = readFileSync(new URL('tools/render/build_rainwater_cistern_assets.py', ROOT), 'utf8');
const assetsSource = readFileSync(new URL('src/render/rainwaterCisternBuildingAssets.ts', ROOT), 'utf8');
const atlasSource = readFileSync(new URL('src/render/atlas.ts', ROOT), 'utf8');
assert.match(buildScript, /standard_cells = \[derive_standard_cell\(cell\) for cell in hd_cells\]/,
  '일반 시트는 완성된 HD 셀에서 파생되어야 한다');
assert.match(assetsSource, /hd_frame_layout\.rows\.seasonal/);
assert.match(assetsSource, /season === 'winter'/);
assert.match(atlasSource, /loadAtlasAsset\(RAINWATER_CISTERN_BUILDING_SHEET\.src/);
assert.match(atlasSource, /loadAtlasAsset\(RAINWATER_CISTERN_BUILDING_HD_SHEET\.src/);
assert.match(atlasSource, /p\.highDefinition && rainwaterCisternBuildingHdSheet/);
assert.match(atlasSource, /blitRainwaterCisternBuilding\(ctx, p\)/);

console.log('rainwater cistern building asset tests passed');
