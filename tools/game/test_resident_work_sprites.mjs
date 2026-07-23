import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const assetSource = readFileSync(new URL('../../src/render/residentWorkAssets.ts', import.meta.url), 'utf8');
const assetOutput = ts.transpileModule(assetSource, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const assetModuleUrl = `data:text/javascript;base64,${Buffer.from(assetOutput).toString('base64')}`;
const {
  RESIDENT_WOODCUTTER_LOAD_SHEET,
  RESIDENT_WOODCUTTER_LOCOMOTION_SHEET,
  RESIDENT_WOODCUTTER_WORK_SHEET,
  woodcutterLoadSourceRect,
  woodcutterLocomotionFrameIndex,
  woodcutterLocomotionSourceRect,
  woodcutterWorkFrameIndex,
  woodcutterWorkSourceRect,
} = await import(assetModuleUrl);

assert.deepEqual(RESIDENT_WOODCUTTER_WORK_SHEET, {
  frameSize: 40,
  columns: 3,
  rows: 2,
  frameDurationMs: 140,
  src: '/assets/resident-woodcutter-work-v1.png',
});
assert.deepEqual(RESIDENT_WOODCUTTER_LOCOMOTION_SHEET, {
  frameSize: 40,
  columns: 4,
  rows: 2,
  frameDurationMs: 140,
  src: '/assets/resident-woodcutter-locomotion-v1.png',
});
assert.deepEqual(RESIDENT_WOODCUTTER_LOAD_SHEET, {
  frameSize: 40,
  columns: 4,
  rows: 2,
  frameDurationMs: 140,
  src: '/assets/resident-woodcutter-load-v1.png',
});

assert.deepEqual(
  [0, 140, 280, 420, 560].map(woodcutterWorkFrameIndex),
  [0, 1, 2, 1, 0],
  'woodcutting loops through wind-up, swing, follow-through, swing',
);
assert.deepEqual(woodcutterWorkSourceRect('male', 280), { sx: 80, sy: 0, sw: 40, sh: 40 });
assert.deepEqual(woodcutterWorkSourceRect('female', 140), { sx: 40, sy: 40, sw: 40, sh: 40 });
assert.equal(woodcutterLocomotionFrameIndex(false, 420), 0, 'stationary woodcutters use the idle frame');
assert.deepEqual(
  [0, 140, 280, 420, 560].map(elapsed => woodcutterLocomotionFrameIndex(true, elapsed)),
  [0, 1, 0, 3, 0],
  'walking loops through contact, passing, opposite toe-off, passing',
);
assert.deepEqual(woodcutterLocomotionSourceRect('male', false, 280), { sx: 0, sy: 0, sw: 40, sh: 40 });
assert.deepEqual(woodcutterLocomotionSourceRect('female', true, 280), { sx: 0, sy: 40, sw: 40, sh: 40 });
assert.deepEqual(woodcutterLoadSourceRect('female', false, 280), { sx: 0, sy: 40, sw: 40, sh: 40 });

const spritePng = readFileSync(new URL('../../public/assets/resident-woodcutter-work-v1.png', import.meta.url));
assert.equal(spritePng.readUInt32BE(16), 120, 'work sheet is three 40px columns wide');
assert.equal(spritePng.readUInt32BE(20), 80, 'work sheet is two 40px gender rows tall');
for (const filename of ['resident-woodcutter-locomotion-v1.png', 'resident-woodcutter-load-v1.png']) {
  const png = readFileSync(new URL(`../../public/assets/${filename}`, import.meta.url));
  assert.equal(png.readUInt32BE(16), 160, `${filename} is four 40px columns wide`);
  assert.equal(png.readUInt32BE(20), 80, `${filename} is two 40px gender rows tall`);
}

const rendererSource = readFileSync(new URL('../../src/render/renderer.ts', import.meta.url), 'utf8');
assert.match(rendererSource, /working:\s*r\.phase\s*===\s*['"]working['"]\s*&&\s*r\.px\s*===\s*r\.x\s*&&\s*r\.py\s*===\s*r\.y/,
  'renderer waits for movement interpolation to finish before forwarding the working phase');
assert.match(rendererSource, /carryingWood:\s*\(r\.carrying\.wood\s*\?\?\s*0\)\s*>\s*0\s*\|\|\s*\(r\.carrying\.brushwood\s*\?\?\s*0\)\s*>\s*0/,
  'renderer distinguishes timber loads from other cargo');

const atlasSource = readFileSync(new URL('../../src/render/atlas.ts', import.meta.url), 'utf8');
assert.match(atlasSource, /case ['"]woodcutter['"]:\s*if \(p\.working && !p\.moving\)/,
  'atlas uses the work sheet only for a stationary working woodcutter');
assert.match(atlasSource, /woodcutterWorkSourceRect\(p\.gender, animationTimeMs\)/,
  'atlas advances the gender-specific woodcutting frames');
assert.match(atlasSource, /if \(p\.carryingWood\)/,
  'timber-carrying woodcutters use the jige sheet');
assert.match(atlasSource, /woodcutterLocomotionSourceRect\(p\.gender, Boolean\(p\.moving\), animationTimeMs\)/,
  'unladen woodcutters use idle or axe-carrying walk frames');
assert.match(atlasSource, /if\s*\(p\.carrying\)/, 'the existing cargo marker remains enabled');

console.log('resident work sprite tests passed');
