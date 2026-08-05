import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const outDir = mkdtempSync(join(tmpdir(), 'northern-special-resident-icons-'));
const source = readFileSync(new URL('../../src/ui/uiIconAssets.ts', import.meta.url), 'utf8');
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
const modulePath = join(outDir, 'uiIconAssets.mjs');
writeFileSync(modulePath, output, 'utf8');
const icons = await import(pathToFileURL(modulePath).href);

assert.deepEqual(icons.UI_ICON_FRAMES.yeoni, {
  atlas: '/assets/ui/special-yeoni-icon-v1.png',
  column: 0,
  row: 0,
  columns: 1,
  rows: 1,
});
assert.deepEqual(icons.uiIconAtlasStyle(icons.UI_ICON_FRAMES.yeoni), {
  backgroundSize: '100% 100%',
  backgroundPosition: '0% 0%',
});
assert.deepEqual(icons.uiIconAtlasStyle(icons.UI_ICON_FRAMES.tracking), {
  backgroundSize: '400% 400%',
  backgroundPosition: `${100 / 3}% 100%`,
}, 'legacy 4x4 atlas coordinates remain unchanged');

const png = readFileSync(new URL('../../public/assets/ui/special-yeoni-icon-v1.png', import.meta.url));
assert.equal(png.subarray(1, 4).toString('ascii'), 'PNG');
assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [64, 64]);

console.log('special resident icon tests passed');
