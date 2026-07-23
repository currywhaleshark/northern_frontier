import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const manifestUrl = new URL('../../src/render/residentCommonLocomotionManifest.json', import.meta.url);
const manifest = JSON.parse(readFileSync(manifestUrl, 'utf8'));
const assetSource = readFileSync(
  new URL('../../src/render/residentCommonLocomotionAssets.ts', import.meta.url),
  'utf8',
).replace(
  /import commonLocomotionManifest from ['"]\.\/residentCommonLocomotionManifest\.json['"];\r?\n/,
  `const commonLocomotionManifest = ${JSON.stringify(manifest)};\n`,
);
const assetOutput = ts.transpileModule(assetSource, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const assetModuleUrl = `data:text/javascript;base64,${Buffer.from(assetOutput).toString('base64')}`;
const {
  RESIDENT_COMMON_LOCOMOTION_SHEET,
  commonLocomotionSourceRect,
  isCommonLocomotionJob,
} = await import(assetModuleUrl);

assert.deepEqual(RESIDENT_COMMON_LOCOMOTION_SHEET, {
  frameSize: 64,
  displaySize: 40,
  columns: 3,
  rows: 40,
  src: '/assets/resident-common-locomotion-v1.png',
});

const expectedJobs = [
  'idle', 'farmer', 'woodSplitter', 'miller', 'physician', 'curer', 'potter', 'smith',
  'fisher', 'charcoalBurner', 'herder', 'tanner', 'weaver', 'powderMaker', 'clerk',
  'undertaker', 'teacher', 'watchman', 'militia',
];
for (const job of expectedJobs) {
  assert.equal(isCommonLocomotionJob(job), true, `${job} has common walking`);
}
for (const job of ['woodcutter', 'hunter', 'builder', 'hauler', 'herbalist', 'miner']) {
  assert.equal(isCommonLocomotionJob(job), false, `${job} keeps its dedicated walking sheet`);
}

assert.deepEqual(
  [0, 200, 400, 600, 800].map(elapsed =>
    commonLocomotionSourceRect('idle', 'male', undefined, true, elapsed)),
  [
    { sx: 0, sy: 0, sw: 64, sh: 64 },
    { sx: 64, sy: 0, sw: 64, sh: 64 },
    { sx: 0, sy: 0, sw: 64, sh: 64 },
    { sx: 128, sy: 0, sw: 64, sh: 64 },
    { sx: 0, sy: 0, sw: 64, sh: 64 },
  ],
  'walking uses neutral-left-neutral-right timing from the manifest',
);
assert.deepEqual(
  commonLocomotionSourceRect('farmer', 'female', undefined, false, 600),
  { sx: 0, sy: 192, sw: 64, sh: 64 },
  'stationary lookup stays on the neutral frame',
);
assert.deepEqual(
  commonLocomotionSourceRect('miller', 'male', undefined, true, 200),
  commonLocomotionSourceRect('curer', 'male', undefined, true, 200),
  'jobs with the same canonical source intentionally share one walking identity',
);
assert.notDeepEqual(
  commonLocomotionSourceRect('militia', 'male', 'spears', true, 200),
  commonLocomotionSourceRect('militia', 'male', 'muskets', true, 200),
  'militia weapon variants use distinct manifest rows',
);

assert.equal(manifest.degraded_static_fallback, false);
assert.equal(manifest.baked_flip_x, true, 'the atlas is baked to the existing left-facing source contract');
assert.equal(Object.keys(manifest.frame_layout.rows).length, 40);
for (const [row, rects] of Object.entries(manifest.frame_layout.rows)) {
  assert.equal(rects.length, 4, `${row} exposes four playback instances`);
  assert.deepEqual(rects.map(rect => rect.x), [0, 64, 0, 128], `${row} reuses neutral texture rect`);
}

const png = readFileSync(new URL('../../public/assets/resident-common-locomotion-v1.png', import.meta.url));
assert.equal(png.readUInt32BE(16), 192, 'bundle stores three unique 64px frames per row');
assert.equal(png.readUInt32BE(20), 2560, 'bundle stores forty validated rows');

const atlasSource = readFileSync(new URL('../../src/render/atlas.ts', import.meta.url), 'utf8');
assert.match(atlasSource, /loadAtlasAsset\(RESIDENT_COMMON_LOCOMOTION_SHEET\.src, false/,
  'the common walking atlas is optional and cannot block core rendering');
assert.match(atlasSource, /if \(!p\.moving \|\| p\.stage\) return false/,
  'common adult walking does not replace youth presentation');
assert.match(atlasSource, /commonLocomotionSourceRect\(\s*p\.job,\s*p\.gender,\s*p\.militiaWeapon/s,
  'the renderer selects job, gender, and militia weapon rows from the manifest');

console.log('resident common locomotion tests passed');
