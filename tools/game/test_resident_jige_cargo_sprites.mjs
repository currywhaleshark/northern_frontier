import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const assetSource = readFileSync(
  new URL('../../src/render/residentJigeCargoAssets.ts', import.meta.url),
  'utf8',
);
const assetOutput = ts.transpileModule(assetSource, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const assetModuleUrl = `data:text/javascript;base64,${Buffer.from(assetOutput).toString('base64')}`;
const assets = await import(assetModuleUrl);

const jobs = [
  ['hauler', 'hauler'],
  ['fisher', 'fisher'],
  ['herbalist', 'herbalist'],
  ['miller', 'miller'],
  ['woodSplitter', 'wood-splitter'],
  ['smith', 'smith'],
  ['curer', 'curer'],
  ['potter', 'potter'],
  ['charcoalBurner', 'charcoal-burner'],
  ['powderMaker', 'powder-maker'],
  ['tanner', 'tanner'],
  ['weaver', 'weaver'],
];

assert.equal(assets.RESIDENT_JIGE_CARGO_DISPLAY_FRAME_SIZE, 40);
assert.equal(assets.RESIDENT_JIGE_CARGO_FRAME_DURATION_MS, 200);

for (const [job, slug] of jobs) {
  assert.equal(assets.isResidentJigeCargoJob(job), true, `${job} has integrated jige cargo`);
  const pair = assets.RESIDENT_JIGE_CARGO_SHEETS[job];
  assert.equal(pair.standard.frameSize, 64);
  assert.equal(pair.highDefinition.frameSize, 128);
  assert.equal(pair.standard.src, `/assets/resident-${slug}-jige-walk-v1.png`);
  assert.equal(pair.highDefinition.src, `/assets/resident-${slug}-jige-walk-hd-v1.png`);

  for (const [filename, width, height] of [
    [`resident-${slug}-jige-walk-v1.png`, 256, 128],
    [`resident-${slug}-jige-walk-hd-v1.png`, 512, 256],
  ]) {
    const png = readFileSync(new URL(`../../public/assets/${filename}`, import.meta.url));
    assert.equal(png.readUInt32BE(16), width, `${filename} width`);
    assert.equal(png.readUInt32BE(20), height, `${filename} height`);
  }
}

assert.equal(assets.isResidentJigeCargoJob('farmer'), false);
assert.deepEqual(
  assets.residentJigeCargoSourceRect('fisher', 'female', true, 400, false),
  { sx: 128, sy: 64, sw: 64, sh: 64 },
);
assert.deepEqual(
  assets.residentJigeCargoSourceRect('weaver', 'male', true, 600, true),
  { sx: 384, sy: 0, sw: 128, sh: 128 },
);
assert.deepEqual(
  assets.residentJigeCargoSourceRect('hauler', 'female', false, 600, false),
  { sx: 0, sy: 64, sw: 64, sh: 64 },
);

const atlasSource = readFileSync(new URL('../../src/render/atlas.ts', import.meta.url), 'utf8');
assert.match(atlasSource, /p\.carrying && !p\.stage && isResidentJigeCargoJob\(p\.job\)/,
  'cargo jige rendering is gated by real cargo');
assert.match(atlasSource, /p\.job === ['"]hauler['"] && p\.cartEquipped/,
  'equipped carts stay ahead of the hauler jige');
assert.match(atlasSource, /RESIDENT_JIGE_CARGO_DISPLAY_FRAME_SIZE \/ pair\.standard\.frameSize/,
  'wide cargo frames retain ordinary resident display scale');

const rendererSource = readFileSync(new URL('../../src/render/renderer.ts', import.meta.url), 'utf8');
assert.match(rendererSource, /Object\.values\(r\.carrying\)\.some\(amount => amount > 0\)/,
  'generic cargo state requires a positive carried amount');

console.log('resident jige cargo sprite tests passed');
