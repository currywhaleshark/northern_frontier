import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

function pngSize(path) {
  const png = readFileSync(new URL(path, import.meta.url));
  assert.equal(png.toString('ascii', 1, 4), 'PNG', `${path} is a PNG`);
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

const source = readFileSync(new URL('../../src/render/cemeteryAssets.ts', import.meta.url), 'utf8');
const output = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const moduleUrl = `data:text/javascript;base64,${Buffer.from(output).toString('base64')}`;
const { CEMETERY_SHEETS, cemeterySourceRect } = await import(moduleUrl);

assert.deepEqual(pngSize('../../public/assets/cemetery-progression-v1.png'), {
  width: 140,
  height: 80,
});
assert.deepEqual(pngSize('../../public/assets/cemetery-progression-v1-hd.png'), {
  width: 280,
  height: 160,
});
assert.deepEqual(cemeterySourceRect(CEMETERY_SHEETS.standard, 0, false), {
  sx: 0, sy: 0, sw: 28, sh: 40,
});
assert.deepEqual(cemeterySourceRect(CEMETERY_SHEETS.highDefinition, 4, true), {
  sx: 224, sy: 80, sw: 56, sh: 80,
});
assert.equal(cemeterySourceRect(CEMETERY_SHEETS.standard, 99, false).sx, 112);

const manifest = JSON.parse(readFileSync(
  new URL('../../docs/assets/buildings/cemetery-progression-v1-manifest.json', import.meta.url),
  'utf8',
));
assert.equal(manifest.frames.length, 10);
assert.deepEqual(manifest.frames.slice(0, 5).map(frame => frame.graveCount), [0, 1, 2, 3, 4]);
assert.deepEqual(manifest.frames.slice(5).map(frame => frame.season), Array(5).fill('winter'));
assert.ok(manifest.frames.every(frame => frame.touchesCellEdge === false));

console.log('cemetery asset tests passed');
