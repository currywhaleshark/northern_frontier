import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const assetSource = readFileSync(new URL('../../src/render/residentMinerAssets.ts', import.meta.url), 'utf8');
const assetOutput = ts.transpileModule(assetSource, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const assetModuleUrl = `data:text/javascript;base64,${Buffer.from(assetOutput).toString('base64')}`;
const {
  RESIDENT_MINER_LOAD_SHEET,
  RESIDENT_MINER_LOCOMOTION_SHEET,
  RESIDENT_MINER_WORK_SHEET,
  minerLoadSourceRect,
  minerLocomotionFrameIndex,
  minerLocomotionSourceRect,
  minerWorkFrameIndex,
  minerWorkSourceRect,
} = await import(assetModuleUrl);

assert.deepEqual(RESIDENT_MINER_LOCOMOTION_SHEET, {
  frameSize: 40, columns: 3, rows: 2, frameDurationMs: 140,
  src: '/assets/resident-miner-locomotion-v1.png',
});
assert.deepEqual(RESIDENT_MINER_WORK_SHEET, {
  frameSize: 40, columns: 3, rows: 2, frameDurationMs: 160,
  src: '/assets/resident-miner-work-v1.png',
});
assert.deepEqual(RESIDENT_MINER_LOAD_SHEET, {
  frameSize: 40, columns: 3, rows: 2, frameDurationMs: 140,
  src: '/assets/resident-miner-load-v1.png',
});

assert.equal(minerLocomotionFrameIndex(false, 420), 0);
assert.deepEqual(
  [0, 140, 280, 420, 560].map(elapsed => minerLocomotionFrameIndex(true, elapsed)),
  [0, 1, 0, 2, 0],
  'miner walk alternates idle, left step, idle, right step',
);
assert.deepEqual([0, 160, 320, 480, 640].map(minerWorkFrameIndex), [0, 1, 2, 1, 0]);
assert.deepEqual(minerLocomotionSourceRect('female', true, 420), { sx: 80, sy: 40, sw: 40, sh: 40 });
assert.deepEqual(minerWorkSourceRect('male', 320), { sx: 80, sy: 0, sw: 40, sh: 40 });
assert.deepEqual(minerLoadSourceRect('female', false, 420), { sx: 0, sy: 40, sw: 40, sh: 40 });

for (const filename of [
  'resident-miner-locomotion-v1.png',
  'resident-miner-work-v1.png',
  'resident-miner-load-v1.png',
]) {
  const png = readFileSync(new URL(`../../public/assets/${filename}`, import.meta.url));
  assert.equal(png.readUInt32BE(16), 120, `${filename} is three 40px columns wide`);
  assert.equal(png.readUInt32BE(20), 80, `${filename} is two 40px gender rows tall`);
}

const rendererSource = readFileSync(new URL('../../src/render/renderer.ts', import.meta.url), 'utf8');
assert.match(rendererSource, /carryingMinerals:\s*\(r\.carrying\.stone\s*\?\?\s*0\)\s*>\s*0/,
  'renderer identifies a stone load');
assert.match(rendererSource, /\(r\.carrying\.iron\s*\?\?\s*0\)\s*>\s*0/,
  'renderer identifies an iron load');
assert.match(rendererSource, /\(r\.carrying\.silver\s*\?\?\s*0\)\s*>\s*0/,
  'renderer identifies a silver load');

const atlasSource = readFileSync(new URL('../../src/render/atlas.ts', import.meta.url), 'utf8');
assert.match(atlasSource, /case ['"]miner['"]:\s*if \(p\.working && !p\.moving\)/,
  'stationary working miners use the pickaxe work sheet');
assert.match(atlasSource, /if \(p\.carryingMinerals\)/,
  'ore-carrying miners use the loaded jige sheet');
assert.match(atlasSource, /return draw\(residentMinerLocomotionSheet/,
  'unladen adult miners use the pickaxe locomotion sheet');
assert.match(atlasSource, /if \(p\.carrying && !integratedCargo\)/,
  'generic cargo remains for fallbacks but does not overlap an integrated ore jige');

const youthBranch = atlasSource.indexOf('newContentResidentSheet && newContentRect');
const minerBranch = atlasSource.indexOf('drawOptionalResidentPresentation(ctx, p');
assert.ok(youthBranch >= 0 && minerBranch > youthBranch,
  'special/youth resident rendering remains ahead of adult miner rendering');

console.log('resident miner sprite tests passed');
