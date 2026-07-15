import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const sourceUrl = new URL('../../src/components/tactical/minimapGeometry.ts', import.meta.url);
const source = readFileSync(sourceUrl, 'utf8');
const outDir = mkdtempSync(join(tmpdir(), 'northern-tactical-minimap-'));
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
const outputPath = join(outDir, 'minimapGeometry.mjs');
writeFileSync(outputPath, output, 'utf8');
const {
  annularSectorPath,
  encirclementDash,
  huntDotPosition,
  polarPoint,
} = await import(pathToFileURL(outputPath).href);

function closeTo(actual, expected, message) {
  assert.ok(Math.abs(actual - expected) < 0.001, `${message}: ${actual} != ${expected}`);
}

{
  const [x, y] = polarPoint(64, 64, 52, -90);
  closeTo(x, 64, 'north point x');
  closeTo(y, 12, 'north point y');
}

{
  const path = annularSectorPath(64, 64, 52, 22, -150, -30);
  assert.match(path, /^M 18\.967 38 A 52 52 0 0 1 109\.033 38 L 83\.053 53 A 22 22 0 0 0 44\.947 53 Z$/,
    'the first hunt sector must trace the specified outer and inner arc endpoints');
}

{
  const [singleX, singleY] = huntDotPosition(0, 0, 1);
  closeTo(singleX, 64, 'single north slot x');
  closeTo(singleY, 27, 'single north slot y');
  const left = huntDotPosition(0, 0, 3);
  const middle = huntDotPosition(0, 1, 3);
  const right = huntDotPosition(0, 2, 3);
  closeTo(left[0] + right[0], middle[0] * 2, 'multi-slot x positions are symmetric');
  closeTo(left[1], right[1], 'multi-slot y positions are symmetric');
}

assert.equal(encirclementDash(0), '0 364.425');
assert.equal(encirclementDash(50), '182.212 182.212');
assert.equal(encirclementDash(100), '364.425 0');
assert.equal(encirclementDash(140), '364.425 0', 'encirclement display clamps above 100%');

console.log('tactical minimap geometry tests passed');
