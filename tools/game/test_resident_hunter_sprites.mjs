import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const assetSource = readFileSync(new URL('../../src/render/residentHunterAssets.ts', import.meta.url), 'utf8');
const assetOutput = ts.transpileModule(assetSource, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const assetModuleUrl = `data:text/javascript;base64,${Buffer.from(assetOutput).toString('base64')}`;
const {
  RESIDENT_HUNTER_HUNT_SHEET,
  RESIDENT_HUNTER_LOAD_SHEET,
  RESIDENT_HUNTER_LOCOMOTION_SHEET,
  hunterHuntPoseIndex,
  hunterHuntSourceRect,
  hunterLoadSourceRect,
  hunterLocomotionFrameIndex,
  hunterLocomotionSourceRect,
} = await import(assetModuleUrl);

assert.deepEqual(RESIDENT_HUNTER_HUNT_SHEET, {
  frameSize: 40,
  columns: 2,
  rows: 2,
  frameDurationMs: 240,
  src: '/assets/resident-hunter-hunt-v1.png',
});
assert.deepEqual(RESIDENT_HUNTER_LOCOMOTION_SHEET, {
  frameSize: 40,
  columns: 4,
  rows: 2,
  frameDurationMs: 140,
  src: '/assets/resident-hunter-locomotion-v1.png',
});
assert.deepEqual(RESIDENT_HUNTER_LOAD_SHEET, {
  frameSize: 40,
  columns: 4,
  rows: 2,
  frameDurationMs: 140,
  src: '/assets/resident-hunter-load-v1.png',
});

assert.deepEqual([0, 240, 480, 720, 960].map(hunterHuntPoseIndex), [0, 1, 1, 0, 0]);
assert.deepEqual(hunterHuntSourceRect('male', 240), { sx: 0, sy: 40, sw: 40, sh: 40 });
assert.deepEqual(hunterHuntSourceRect('female', 0), { sx: 40, sy: 0, sw: 40, sh: 40 });
assert.equal(hunterLocomotionFrameIndex(false, 280), 0);
assert.deepEqual(
  [0, 140, 280, 420, 560].map(elapsed => hunterLocomotionFrameIndex(true, elapsed)),
  [0, 1, 0, 3, 0],
);
assert.deepEqual(hunterLocomotionSourceRect('female', true, 280), { sx: 0, sy: 40, sw: 40, sh: 40 });
assert.deepEqual(hunterLoadSourceRect('male', false, 280), { sx: 0, sy: 0, sw: 40, sh: 40 });

const dimensions = [
  ['resident-hunter-hunt-v1.png', 80, 80],
  ['resident-hunter-locomotion-v1.png', 160, 80],
  ['resident-hunter-load-v1.png', 160, 80],
];
for (const [filename, width, height] of dimensions) {
  const png = readFileSync(new URL(`../../public/assets/${filename}`, import.meta.url));
  assert.equal(png.readUInt32BE(16), width, `${filename} width`);
  assert.equal(png.readUInt32BE(20), height, `${filename} height`);
}

const rendererSource = readFileSync(new URL('../../src/render/renderer.ts', import.meta.url), 'utf8');
assert.match(rendererSource, /carryingGame:\s*\(r\.carrying\.meat\s*\?\?\s*0\)\s*>\s*0\s*\|\|\s*\(r\.carrying\.hide\s*\?\?\s*0\)\s*>\s*0/,
  'renderer distinguishes game loads from other cargo');

const atlasSource = readFileSync(new URL('../../src/render/atlas.ts', import.meta.url), 'utf8');
assert.match(atlasSource, /p\.job\s*===\s*['"]hunter['"]\s*&&\s*p\.working\s*&&\s*!p\.moving/,
  'only stationary working hunters draw the bow');
assert.match(atlasSource, /p\.job\s*===\s*['"]hunter['"]\s*&&\s*p\.carryingGame/,
  'hunters carrying meat or hide use the prey sheet');
assert.match(atlasSource, /hunterLocomotionSourceRect\(p\.gender,\s*Boolean\(p\.moving\),\s*performance\.now\(\)\)/,
  'ordinary hunters use bow-carrying idle and walking frames');

const specialBranch = atlasSource.indexOf('if (specialResidentSheet && specialRect)');
const hunterBranch = atlasSource.indexOf("p.job === 'hunter'");
assert.ok(specialBranch >= 0 && hunterBranch > specialBranch,
  'special resident rendering remains ahead of ordinary hunter rendering');

console.log('resident hunter sprite tests passed');
