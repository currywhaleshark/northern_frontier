import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import ts from 'typescript';

const source = readFileSync(new URL('../../src/render/generatedCharacterAssets.ts', import.meta.url), 'utf8');
const output = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const moduleUrl = `data:text/javascript;base64,${Buffer.from(output).toString('base64')}`;
const {
  GENERATED_CHARACTER_SHEET,
  generatedCharacterFacingScale,
  generatedMountedRaiderSourceRect,
  generatedResidentSourceRect,
} = await import(moduleUrl);

assert.equal(GENERATED_CHARACTER_SHEET.residentWidth, 28);
assert.equal(GENERATED_CHARACTER_SHEET.mountedWidth, 56);
assert.equal(GENERATED_CHARACTER_SHEET.spriteHeight, 40);
assert.equal(GENERATED_CHARACTER_SHEET.residentColumns, 10);
assert.equal(GENERATED_CHARACTER_SHEET.rows, 2);
assert.equal(GENERATED_CHARACTER_SHEET.src, '/assets/folk-characters-generated-v1.png');

assert.deepEqual(generatedResidentSourceRect('idle', 'male'), { sx: 0, sy: 0, sw: 28, sh: 40 });
assert.deepEqual(generatedResidentSourceRect('woodcutter', 'male'), { sx: 28, sy: 0, sw: 28, sh: 40 });
assert.deepEqual(generatedResidentSourceRect('militia', 'female'), { sx: 252, sy: 40, sw: 28, sh: 40 });

assert.deepEqual(generatedMountedRaiderSourceRect(0), { sx: 280, sy: 0, sw: 56, sh: 40 });
assert.deepEqual(generatedMountedRaiderSourceRect(1), { sx: 280, sy: 40, sw: 56, sh: 40 });
assert.deepEqual(generatedMountedRaiderSourceRect(2), { sx: 280, sy: 0, sw: 56, sh: 40 });

assert.equal(typeof generatedCharacterFacingScale, 'function');
assert.equal(generatedCharacterFacingScale(1), -1);
assert.equal(generatedCharacterFacingScale(-1), 1);
assert.equal(generatedCharacterFacingScale(undefined), 1);

console.log('generated character asset tests passed');
