import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const root = new URL('../../', import.meta.url);
const srcRoot = new URL('../../src/render/', import.meta.url);
const outDir = mkdtempSync(join(tmpdir(), 'northern-woodcutter-video-walk-'));

const source = readFileSync(new URL('residentWoodcutterVideoWalkAssets.ts', srcRoot), 'utf8');
let output = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
    resolveJsonModule: true,
  },
}).outputText;
output = output.replace(
  './residentWoodcutterVideoWalkManifest.json',
  './residentWoodcutterVideoWalkManifest.json.mjs',
);
writeFileSync(join(outDir, 'residentWoodcutterVideoWalkAssets.mjs'), output, 'utf8');

const manifestSource = readFileSync(
  new URL('residentWoodcutterVideoWalkManifest.json', srcRoot),
  'utf8',
).trim();
writeFileSync(
  join(outDir, 'residentWoodcutterVideoWalkManifest.json.mjs'),
  `export default ${manifestSource};\n`,
  'utf8',
);

const assets = await import(pathToFileURL(join(outDir, 'residentWoodcutterVideoWalkAssets.mjs')).href);
const manifest = JSON.parse(manifestSource);

assert.equal(manifest.engine, 'component-row');
assert.equal(manifest.degraded_static_fallback, false);
for (const row of Object.values(manifest.animation.rows)) {
  assert.deepEqual(row.durations_ms, [200, 200, 200, 200]);
}
assert.deepEqual(
  manifest.frame_layout.rows.male_axe_walk.map(rect => rect.x),
  [0, 28, 0, 56],
);
assert.deepEqual(
  manifest.high_definition_frame_layout.rows.female_jige_walk.map(rect => rect.x),
  [0, 56, 0, 112],
);

assert.deepEqual(
  assets.woodcutterVideoWalkSourceRect('male', 'axe', 0, false),
  { sx: 0, sy: 0, sw: 28, sh: 40 },
);
assert.deepEqual(
  assets.woodcutterVideoWalkSourceRect('male', 'axe', 200, false),
  { sx: 28, sy: 0, sw: 28, sh: 40 },
);
assert.deepEqual(
  assets.woodcutterVideoWalkSourceRect('female', 'axe', 400, false),
  { sx: 0, sy: 40, sw: 28, sh: 40 },
);
assert.deepEqual(
  assets.woodcutterVideoWalkSourceRect('female', 'jige', 600, true),
  { sx: 112, sy: 240, sw: 56, sh: 80 },
);

function pngSize(relativePath) {
  const bytes = readFileSync(new URL(relativePath, root));
  assert.equal(bytes.toString('ascii', 1, 4), 'PNG');
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

assert.deepEqual(
  pngSize('public/assets/resident-woodcutter-video-walk-v2.png'),
  { width: 84, height: 160 },
);
assert.deepEqual(
  pngSize('public/assets/resident-woodcutter-video-walk-hd-v2.png'),
  { width: 168, height: 320 },
);

console.log('resident woodcutter video walk tests passed');
