import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const root = new URL('../../', import.meta.url);
const srcRoot = new URL('../../src/render/', import.meta.url);
const outDir = mkdtempSync(join(tmpdir(), 'northern-woodcutter-video-work-'));

const source = readFileSync(new URL('residentWoodcutterVideoWorkAssets.ts', srcRoot), 'utf8');
let output = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
    resolveJsonModule: true,
  },
}).outputText;
output = output.replace(
  './residentWoodcutterVideoWorkManifest.json',
  './residentWoodcutterVideoWorkManifest.json.mjs',
);
writeFileSync(join(outDir, 'residentWoodcutterVideoWorkAssets.mjs'), output, 'utf8');

const manifestSource = readFileSync(
  new URL('residentWoodcutterVideoWorkManifest.json', srcRoot),
  'utf8',
).trim();
writeFileSync(
  join(outDir, 'residentWoodcutterVideoWorkManifest.json.mjs'),
  `export default ${manifestSource};\n`,
  'utf8',
);

const assets = await import(pathToFileURL(join(outDir, 'residentWoodcutterVideoWorkAssets.mjs')).href);
const manifest = JSON.parse(manifestSource);

assert.equal(manifest.engine, 'component-row');
assert.equal(manifest.degraded_static_fallback, false);
assert.deepEqual(manifest.animation.rows.male_chop.durations_ms, [140, 140, 140]);
assert.deepEqual(
  manifest.frame_layout.rows.male_chop.map(rect => rect.x),
  [0, 28, 56],
);
assert.deepEqual(
  manifest.high_definition_frame_layout.rows.female_chop.map(rect => rect.x),
  [0, 56, 112],
);

assert.deepEqual(
  assets.woodcutterVideoWorkSourceRect('male', 0, false),
  { sx: 0, sy: 0, sw: 28, sh: 40 },
);
assert.deepEqual(
  assets.woodcutterVideoWorkSourceRect('male', 140, false),
  { sx: 28, sy: 0, sw: 28, sh: 40 },
);
assert.deepEqual(
  assets.woodcutterVideoWorkSourceRect('female', 280, false),
  { sx: 56, sy: 40, sw: 28, sh: 40 },
);
assert.deepEqual(
  assets.woodcutterVideoWorkSourceRect('female', 420, true),
  { sx: 0, sy: 80, sw: 56, sh: 80 },
);

function pngSize(relativePath) {
  const bytes = readFileSync(new URL(relativePath, root));
  assert.equal(bytes.toString('ascii', 1, 4), 'PNG');
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

assert.deepEqual(
  pngSize('public/assets/resident-woodcutter-video-work-v2.png'),
  { width: 84, height: 80 },
);
assert.deepEqual(
  pngSize('public/assets/resident-woodcutter-video-work-hd-v2.png'),
  { width: 168, height: 160 },
);

console.log('resident woodcutter video work tests passed');
