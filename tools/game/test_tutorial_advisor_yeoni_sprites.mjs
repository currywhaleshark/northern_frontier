import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const root = new URL('../../', import.meta.url);
const srcRoot = new URL('../../src/render/', import.meta.url);
const outDir = mkdtempSync(join(tmpdir(), 'northern-tutorial-advisor-yeoni-'));

const source = readFileSync(new URL('tutorialAdvisorYeoniAssets.ts', srcRoot), 'utf8');
let output = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
    resolveJsonModule: true,
  },
}).outputText;
output = output.replace(
  './tutorialAdvisorYeoniSpriteManifest.json',
  './tutorialAdvisorYeoniSpriteManifest.json.mjs',
);
writeFileSync(join(outDir, 'tutorialAdvisorYeoniAssets.mjs'), output, 'utf8');

const manifestSource = readFileSync(
  new URL('tutorialAdvisorYeoniSpriteManifest.json', srcRoot),
  'utf8',
).trim();
writeFileSync(
  join(outDir, 'tutorialAdvisorYeoniSpriteManifest.json.mjs'),
  `export default ${manifestSource};\n`,
  'utf8',
);

const assets = await import(pathToFileURL(join(outDir, 'tutorialAdvisorYeoniAssets.mjs')).href);
const manifest = JSON.parse(manifestSource);

assert.deepEqual(manifest.states, ['idle', 'walk', 'jige_walk', 'work']);
for (const state of manifest.states) {
  assert.equal(manifest.animation.rows[state].frames, 4);
  assert.equal(manifest.animation.rows[state].fps, 5);
  assert.deepEqual(manifest.animation.rows[state].durations_ms, [200, 200, 200, 200]);
  assert.deepEqual(
    manifest.high_definition_frame_layout.rows[state],
    manifest.frame_layout.rows[state].map(rect => ({
      x: rect.x * 2, y: rect.y * 2, w: rect.w * 2, h: rect.h * 2,
    })),
    `${state} keeps the exact 2x HD layout`,
  );
}

assert.deepEqual(
  assets.tutorialAdvisorYeoniSourceRect('idle', 600, false),
  { sx: 84, sy: 0, sw: 28, sh: 42 },
);
assert.deepEqual(
  assets.tutorialAdvisorYeoniSourceRect('walk', 200, false),
  { sx: 28, sy: 42, sw: 28, sh: 42 },
);
assert.deepEqual(
  assets.tutorialAdvisorYeoniSourceRect('jige_walk', 400, false),
  { sx: 56, sy: 84, sw: 28, sh: 42 },
);
assert.deepEqual(
  assets.tutorialAdvisorYeoniSourceRect('work', 600, true),
  { sx: 168, sy: 252, sw: 56, sh: 84 },
);

function pngSize(relativePath) {
  const bytes = readFileSync(new URL(relativePath, root));
  assert.equal(bytes.toString('ascii', 1, 4), 'PNG');
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

assert.deepEqual(pngSize('public/assets/tutorial-advisor-yeoni-i2v-v1.png'), { width: 112, height: 168 });
assert.deepEqual(pngSize('public/assets/tutorial-advisor-yeoni-i2v-hd-v1.png'), { width: 224, height: 336 });

console.log('tutorial advisor Yeoni sprite tests passed');
