import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const assetSource = readFileSync(new URL('../../src/render/residentBuilderAssets.ts', import.meta.url), 'utf8');
const assetOutput = ts.transpileModule(assetSource, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const assetModuleUrl = `data:text/javascript;base64,${Buffer.from(assetOutput).toString('base64')}`;
const {
  RESIDENT_BUILDER_LOCOMOTION_SHEET,
  RESIDENT_BUILDER_WORK_SHEET,
  builderLocomotionFrameIndex,
  builderLocomotionSourceRect,
  builderWorkFrameIndex,
  builderWorkSourceRect,
} = await import(assetModuleUrl);

assert.deepEqual(RESIDENT_BUILDER_LOCOMOTION_SHEET, {
  frameSize: 40,
  columns: 3,
  rows: 2,
  frameDurationMs: 200,
  src: '/assets/resident-builder-locomotion-v1.png',
});
assert.deepEqual(RESIDENT_BUILDER_WORK_SHEET, {
  frameSize: 40,
  columns: 4,
  rows: 2,
  frameDurationMsByGender: { male: 167, female: 200 },
  src: '/assets/resident-builder-work-v1.png',
});

assert.equal(builderLocomotionFrameIndex(false, 600), 0, 'stationary builders use the idle frame');
assert.deepEqual(
  [0, 200, 400, 600, 800].map(elapsed => builderLocomotionFrameIndex(true, elapsed)),
  [0, 1, 0, 2, 0],
  'builder walk reuses neutral between the two distinct step poses',
);
assert.deepEqual(
  [0, 167, 334, 501, 668].map(elapsed => builderWorkFrameIndex('male', elapsed)),
  [0, 1, 2, 3, 0],
  'male builder preserves the curated 6fps work timing',
);
assert.deepEqual(
  [0, 200, 400, 600, 800].map(elapsed => builderWorkFrameIndex('female', elapsed)),
  [0, 1, 2, 3, 0],
  'female builder preserves the curated 5fps work timing',
);
assert.deepEqual(
  builderLocomotionSourceRect('female', true, 600),
  { sx: 80, sy: 40, sw: 40, sh: 40 },
);
assert.deepEqual(builderWorkSourceRect('male', 334), { sx: 80, sy: 0, sw: 40, sh: 40 });

const locomotionPng = readFileSync(new URL('../../public/assets/resident-builder-locomotion-v1.png', import.meta.url));
assert.equal(locomotionPng.readUInt32BE(16), 120, 'locomotion sheet has three 40px columns');
assert.equal(locomotionPng.readUInt32BE(20), 80, 'locomotion sheet has two gender rows');
const workPng = readFileSync(new URL('../../public/assets/resident-builder-work-v1.png', import.meta.url));
assert.equal(workPng.readUInt32BE(16), 160, 'work sheet has four 40px columns');
assert.equal(workPng.readUInt32BE(20), 80, 'work sheet has two gender rows');

const atlasSource = readFileSync(new URL('../../src/render/atlas.ts', import.meta.url), 'utf8');
assert.match(atlasSource, /p\.job\s*===\s*['"]builder['"]\s*&&\s*p\.working\s*&&\s*!p\.moving/,
  'stationary working builders use the hammering sheet');
assert.match(atlasSource, /residentBuilderLocomotionSheet\s*&&\s*p\.job\s*===\s*['"]builder['"]/,
  'builders otherwise use the hammer-carrying locomotion sheet');
assert.match(atlasSource, /builderLocomotionSourceRect\(p\.gender,\s*Boolean\(p\.moving\),\s*performance\.now\(\)\)/,
  'builder locomotion advances only while moving');
assert.match(atlasSource, /return loaded >= 42;/, 'atlas readiness includes both builder sheets');

const youthBranch = atlasSource.indexOf('newContentResidentSheet && newContentRect');
const builderBranch = atlasSource.indexOf("p.job === 'builder'");
assert.ok(youthBranch >= 0 && builderBranch > youthBranch,
  'special and youth rendering remains ahead of adult builder rendering');

console.log('resident builder sprite tests passed');
