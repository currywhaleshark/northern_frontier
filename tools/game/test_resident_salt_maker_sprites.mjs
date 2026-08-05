import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(
  new URL('../../src/render/residentSaltMakerAssets.ts', import.meta.url),
  'utf8',
);
const output = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const moduleUrl = `data:text/javascript;base64,${Buffer.from(output).toString('base64')}`;
const assets = await import(moduleUrl);

assert.equal(assets.RESIDENT_SALT_MAKER_DISPLAY_FRAME_SIZE, 40);

for (const gender of ['male', 'female']) {
  const pair = assets.RESIDENT_SALT_MAKER_SHEETS[gender];
  assert.equal(pair.standard.frameSize, 64);
  assert.equal(pair.highDefinition.frameSize, 128);
  assert.equal(pair.standard.src, `/assets/resident-salt-maker-${gender}-v2.png`);
  assert.equal(pair.highDefinition.src, `/assets/resident-salt-maker-${gender}-hd-v2.png`);

  for (const [filename, size] of [
    [`resident-salt-maker-${gender}-v2.png`, 256],
    [`resident-salt-maker-${gender}-hd-v2.png`, 512],
  ]) {
    const png = readFileSync(new URL(`../../public/assets/${filename}`, import.meta.url));
    assert.equal(png.readUInt32BE(16), size, `${filename} width`);
    assert.equal(png.readUInt32BE(20), size, `${filename} height`);
  }
}

assert.deepEqual(
  assets.saltMakerSourceRect('male', 'idle', 199, false),
  { sx: 0, sy: 0, sw: 64, sh: 64 },
);
assert.deepEqual(
  assets.saltMakerSourceRect('male', 'walk', 200, false),
  { sx: 64, sy: 64, sw: 64, sh: 64 },
);
assert.deepEqual(
  assets.saltMakerSourceRect('female', 'seaIntake', 600, false),
  { sx: 192, sy: 128, sw: 64, sh: 64 },
);
assert.deepEqual(
  assets.saltMakerSourceRect('female', 'kilnWork', 800, true),
  { sx: 0, sy: 384, sw: 128, sh: 128 },
);

console.log('resident salt-maker sprite tests passed');
