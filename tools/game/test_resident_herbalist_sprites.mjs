import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const assetSource = readFileSync(
  new URL('../../src/render/residentHerbalistAssets.ts', import.meta.url),
  'utf8',
);
const assetOutput = ts.transpileModule(assetSource, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const assetModuleUrl = `data:text/javascript;base64,${Buffer.from(assetOutput).toString('base64')}`;
const {
  RESIDENT_HERBALIST_GATHER_SHEET,
  RESIDENT_HERBALIST_LOCOMOTION_SHEET,
  herbalistGatherFrameIndex,
  herbalistGatherSourceRect,
  herbalistLocomotionFrameIndex,
  herbalistLocomotionSourceRect,
} = await import(assetModuleUrl);

assert.deepEqual(RESIDENT_HERBALIST_LOCOMOTION_SHEET, {
  frameSize: 40,
  columns: 3,
  rows: 2,
  frameDurationMs: 200,
  src: '/assets/resident-herbalist-locomotion-v1.png',
});
assert.deepEqual(RESIDENT_HERBALIST_GATHER_SHEET, {
  frameSize: 40,
  columns: 4,
  rows: 2,
  frameDurationMs: 200,
  src: '/assets/resident-herbalist-gather-v1.png',
});

assert.equal(herbalistLocomotionFrameIndex(false, 600), 0, 'stationary herbalists use idle');
assert.deepEqual(
  [0, 200, 400, 600, 800].map(elapsed => herbalistLocomotionFrameIndex(true, elapsed)),
  [0, 1, 0, 2, 0],
  'walk alternates both step poses through the repeated neutral frame',
);
assert.deepEqual(
  [0, 200, 400, 600, 800].map(herbalistGatherFrameIndex),
  [0, 1, 2, 3, 0],
  'gathering preserves all four curated crouching frames at 5fps',
);
assert.deepEqual(
  herbalistLocomotionSourceRect('female', true, 600),
  { sx: 80, sy: 40, sw: 40, sh: 40 },
);
assert.deepEqual(
  herbalistGatherSourceRect('male', 400),
  { sx: 80, sy: 0, sw: 40, sh: 40 },
);

const locomotionPng = readFileSync(
  new URL('../../public/assets/resident-herbalist-locomotion-v1.png', import.meta.url),
);
assert.equal(locomotionPng.readUInt32BE(16), 120, 'locomotion sheet has three 40px columns');
assert.equal(locomotionPng.readUInt32BE(20), 80, 'locomotion sheet has two gender rows');
const gatherPng = readFileSync(
  new URL('../../public/assets/resident-herbalist-gather-v1.png', import.meta.url),
);
assert.equal(gatherPng.readUInt32BE(16), 160, 'gather sheet has four 40px columns');
assert.equal(gatherPng.readUInt32BE(20), 80, 'gather sheet has two gender rows');

const atlasSource = readFileSync(new URL('../../src/render/atlas.ts', import.meta.url), 'utf8');
assert.match(
  atlasSource,
  /case ['"]herbalist['"]:\s*if \(p\.working && !p\.moving\)/,
  'stationary working herbalists use the crouched gathering sheet',
);
assert.match(
  atlasSource,
  /return draw\(residentHerbalistLocomotionSheet/,
  'herbalists otherwise use the herb-carrying locomotion sheet',
);
assert.match(
  atlasSource,
  /herbalistLocomotionSourceRect\(p\.gender, Boolean\(p\.moving\), animationTimeMs\)/,
  'herbalist locomotion advances only while moving',
);
assert.match(atlasSource, /RESIDENT_HERBALIST_GATHER_SHEET\.src, false/,
  'herbalist sheets are optional resident presentation assets');

const youthBranch = atlasSource.indexOf('newContentResidentSheet && newContentRect');
const herbalistBranch = atlasSource.indexOf('drawOptionalResidentPresentation(ctx, p');
assert.ok(
  youthBranch >= 0 && herbalistBranch > youthBranch,
  'special and youth rendering remains ahead of adult herbalist rendering',
);

console.log('resident herbalist sprite tests passed');
