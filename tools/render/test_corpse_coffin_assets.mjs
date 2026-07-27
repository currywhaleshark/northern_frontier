import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

function pngSize(path) {
  const png = readFileSync(new URL(path, import.meta.url));
  assert.equal(png.toString('ascii', 1, 4), 'PNG', `${path} is a PNG`);
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

const source = readFileSync(new URL('../../src/render/corpseCoffinAssets.ts', import.meta.url), 'utf8');
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
const moduleUrl = `data:text/javascript;base64,${Buffer.from(output).toString('base64')}`;
const { CORPSE_COFFIN_SPRITES } = await import(moduleUrl);

assert.deepEqual(pngSize('../../public/assets/corpse-coffin-v1.png'), { width: 28, height: 28 });
assert.deepEqual(pngSize('../../public/assets/corpse-coffin-v1-hd.png'), { width: 56, height: 56 });
assert.equal(CORPSE_COFFIN_SPRITES.standard.cellSize, 28);
assert.equal(CORPSE_COFFIN_SPRITES.highDefinition.cellSize, 56);

console.log('corpse coffin asset tests passed');
