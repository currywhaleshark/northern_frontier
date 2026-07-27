import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const assetSource = readFileSync(new URL('../../src/render/residentHaulerAssets.ts', import.meta.url), 'utf8');
const assetOutput = ts.transpileModule(assetSource, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const assetModuleUrl = `data:text/javascript;base64,${Buffer.from(assetOutput).toString('base64')}`;
const {
  RESIDENT_HAULER_CART_LOAD_LOCOMOTION_HD_SHEET,
  RESIDENT_HAULER_CART_LOAD_LOCOMOTION_SHEET,
  RESIDENT_HAULER_CART_LOCOMOTION_HD_SHEET,
  RESIDENT_HAULER_CART_LOCOMOTION_SHEET,
  RESIDENT_HAULER_LOCOMOTION_SHEET,
  haulerCartLocomotionFrameIndex,
  haulerCartLocomotionSourceRect,
  haulerLocomotionFrameIndex,
  haulerLocomotionSourceRect,
} = await import(assetModuleUrl);

assert.deepEqual(RESIDENT_HAULER_LOCOMOTION_SHEET, {
  frameSize: 40,
  columns: 3,
  rows: 2,
  frameDurationMs: 140,
  src: '/assets/resident-hauler-locomotion-v1.png',
});
assert.deepEqual(RESIDENT_HAULER_CART_LOCOMOTION_SHEET, {
  frameSize: 128,
  displayFrameSize: 80,
  columns: 4,
  rows: 2,
  frameDurationMs: 200,
  src: '/assets/resident-hauler-cart-walk-v2.png',
});
assert.equal(RESIDENT_HAULER_CART_LOCOMOTION_HD_SHEET.frameSize, 256);
assert.equal(RESIDENT_HAULER_CART_LOCOMOTION_HD_SHEET.src,
  '/assets/resident-hauler-cart-walk-hd-v2.png');
assert.equal(RESIDENT_HAULER_CART_LOAD_LOCOMOTION_SHEET.src,
  '/assets/resident-hauler-cart-load-walk-v2.png');
assert.equal(RESIDENT_HAULER_CART_LOAD_LOCOMOTION_HD_SHEET.src,
  '/assets/resident-hauler-cart-load-walk-hd-v2.png');

assert.equal(haulerLocomotionFrameIndex(false, 420), 0);
assert.deepEqual(
  [0, 140, 280, 420, 560].map(elapsed => haulerLocomotionFrameIndex(true, elapsed)),
  [0, 1, 0, 2, 0],
);
assert.deepEqual(haulerLocomotionSourceRect('female', true, 420), { sx: 80, sy: 40, sw: 40, sh: 40 });
assert.deepEqual(
  [0, 200, 400, 600, 800].map(elapsed => haulerCartLocomotionFrameIndex(true, elapsed)),
  [0, 1, 2, 3, 0],
);
assert.deepEqual(haulerCartLocomotionSourceRect('male', true, 200),
  { sx: 128, sy: 0, sw: 128, sh: 128 });
assert.deepEqual(haulerCartLocomotionSourceRect('female', true, 600, true, true),
  { sx: 768, sy: 256, sw: 256, sh: 256 });

const dimensions = [
  ['resident-hauler-locomotion-v1.png', 120, 80],
  ['resident-hauler-cart-walk-v2.png', 512, 256],
  ['resident-hauler-cart-walk-hd-v2.png', 1024, 512],
  ['resident-hauler-cart-load-walk-v2.png', 512, 256],
  ['resident-hauler-cart-load-walk-hd-v2.png', 1024, 512],
];
for (const [filename, width, height] of dimensions) {
  const png = readFileSync(new URL(`../../public/assets/${filename}`, import.meta.url));
  assert.equal(png.readUInt32BE(16), width, `${filename} width`);
  assert.equal(png.readUInt32BE(20), height, `${filename} height`);
}

const rendererSource = readFileSync(new URL('../../src/render/renderer.ts', import.meta.url), 'utf8');
assert.match(rendererSource, /cartEquipped:\s*r\.cartEquipped/,
  'renderer passes the equipped-cart state to resident sprites');

const atlasSource = readFileSync(new URL('../../src/render/atlas.ts', import.meta.url), 'utf8');
assert.match(atlasSource, /case ['"]hauler['"]:\s*if \(p\.cartEquipped\)/,
  'equipped haulers use the cart sheet');
assert.match(atlasSource, /p\.carrying \? residentHaulerCartLoadLocomotionSheet/,
  'a cart with positive cargo uses the visibly loaded sheet');
assert.match(atlasSource, /return draw\(residentHaulerLocomotionSheet/,
  'cartless adult haulers use the jige sheet');

const youthBranch = atlasSource.indexOf('newContentResidentSheet && newContentRect');
const haulerBranch = atlasSource.indexOf('drawOptionalResidentPresentation(ctx, p');
assert.ok(youthBranch >= 0 && haulerBranch > youthBranch,
  'youth and child resident rendering remains ahead of adult hauler rendering');

console.log('resident hauler sprite tests passed');
