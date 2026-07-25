import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

function pngSize(path) {
  const png = readFileSync(new URL(path, import.meta.url));
  assert.equal(png.toString('ascii', 1, 4), 'PNG', `${path} is a PNG`);
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

const source = readFileSync(new URL('../../src/render/livestockAssets.ts', import.meta.url), 'utf8');
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
const moduleUrl = `data:text/javascript;base64,${Buffer.from(output).toString('base64')}`;
const { LIVESTOCK_SHEETS, livestockSourceRect } = await import(moduleUrl);

assert.deepEqual(pngSize('../../public/assets/livestock-overworld-v1.png'), { width: 168, height: 28 });
assert.deepEqual(pngSize('../../public/assets/livestock-overworld-v1-hd.png'), { width: 336, height: 56 });
assert.deepEqual(livestockSourceRect(LIVESTOCK_SHEETS.standard, 'chicken'), {
  sx: 0, sy: 0, sw: 28, sh: 28,
});
assert.deepEqual(livestockSourceRect(LIVESTOCK_SHEETS.highDefinition, 'horse'), {
  sx: 224, sy: 0, sw: 56, sh: 56,
});
assert.deepEqual(livestockSourceRect(LIVESTOCK_SHEETS.highDefinition, 'pig'), {
  sx: 280, sy: 0, sw: 56, sh: 56,
});

const manifest = JSON.parse(readFileSync(
  new URL('../../docs/assets/livestock/livestock-overworld-v1-manifest.json', import.meta.url),
  'utf8',
));
assert.equal(manifest.version, 2);
assert.deepEqual(manifest.speciesOrder, ['chicken', 'goat', 'sheep', 'cattle', 'horse', 'pig']);
assert.ok(manifest.frames.every(frame => frame.touchesCellEdge === false));

console.log('livestock asset tests passed');
