import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const root = new URL('../../', import.meta.url);
const srcRoot = new URL('../../src/render/', import.meta.url);
const outDir = mkdtempSync(join(tmpdir(), 'northern-approved-i2v-'));

const source = readFileSync(
  new URL('residentApprovedI2VLocomotionAssets.ts', srcRoot),
  'utf8',
);
let output = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
    resolveJsonModule: true,
  },
}).outputText;
output = output.replace(
  './residentApprovedI2VLocomotionManifest.json',
  './residentApprovedI2VLocomotionManifest.json.mjs',
);
writeFileSync(join(outDir, 'residentApprovedI2VLocomotionAssets.mjs'), output, 'utf8');

const manifestSource = readFileSync(
  new URL('residentApprovedI2VLocomotionManifest.json', srcRoot),
  'utf8',
).trim();
writeFileSync(
  join(outDir, 'residentApprovedI2VLocomotionManifest.json.mjs'),
  `export default ${manifestSource};\n`,
  'utf8',
);

const assets = await import(
  pathToFileURL(join(outDir, 'residentApprovedI2VLocomotionAssets.mjs')).href
);
const manifest = JSON.parse(manifestSource);
const rows = manifest.frame_layout.rows;
const hdRows = manifest.high_definition_frame_layout.rows;

assert.equal(manifest.engine, 'component-row');
assert.equal(manifest.degraded_static_fallback, false);
assert.equal(manifest.display.variableCells, true);
assert.equal(Object.keys(rows).length, 124, '62 approved identities expose idle and walk rows');

for (const [name, rects] of Object.entries(rows)) {
  assert.deepEqual(
    hdRows[name],
    rects.map(rect => ({
      x: rect.x * 2,
      y: rect.y * 2,
      w: rect.w * 2,
      h: rect.h * 2,
    })),
    `${name} keeps an exact 2x HD layout`,
  );
}

function expectedRect(row, index = 0) {
  const rect = rows[row][index];
  return { sx: rect.x, sy: rect.y, sw: rect.w, sh: rect.h };
}

assert.deepEqual(
  assets.approvedI2VSourceRect('farmer', 'male', undefined, false, 0, false),
  expectedRect('farmer_male_idle'),
);
assert.deepEqual(
  assets.approvedI2VSourceRect('farmer', 'male', undefined, true, 200, false),
  expectedRect('farmer_male_walk', 1),
);
assert.deepEqual(
  assets.approvedI2VSourceRect('militia', 'male', 'spears', true, 200, false),
  expectedRect('militia_spear_male_walk', 1),
);
assert.deepEqual(
  assets.approvedI2VSourceRect('militia', 'female', undefined, false, 200, false),
  expectedRect('militia_unarmed_female_idle', 1),
);
assert.deepEqual(
  assets.approvedI2VSourceRect('builder', 'female', undefined, true, 200, false),
  expectedRect('builder_female_walk', 1),
);
assert.deepEqual(
  assets.approvedI2VSourceRect(
    'militia', 'male', 'muskets', true, 200, false, 'hangwae',
  ),
  expectedRect('hangwae_sayaka_walk', 1),
  'a named special resident overrides the ordinary job identity',
);
assert.equal(
  assets.approvedI2VSourceRect('woodcutter', 'male', undefined, true, 0, false),
  null,
  'the separately completed woodcutter keeps its established fallback chain',
);

function pngSize(relativePath) {
  const bytes = readFileSync(new URL(relativePath, root));
  assert.equal(bytes.toString('ascii', 1, 4), 'PNG');
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

assert.deepEqual(
  pngSize('public/assets/resident-approved-i2v-locomotion-v1.png'),
  {
    width: manifest.frame_layout.sheetWidth,
    height: manifest.frame_layout.sheetHeight,
  },
);
assert.deepEqual(
  pngSize('public/assets/resident-approved-i2v-locomotion-hd-v1.png'),
  {
    width: manifest.high_definition_frame_layout.sheetWidth,
    height: manifest.high_definition_frame_layout.sheetHeight,
  },
);

console.log('resident approved I2V locomotion tests passed');
