import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(
  new URL('../../src/render/religiousSuccessorAssets.ts', import.meta.url),
  'utf8',
);
const output = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const moduleUrl = `data:text/javascript;base64,${Buffer.from(output).toString('base64')}`;
const {
  RELIGIOUS_SUCCESSOR_SHEETS,
  religiousSuccessorSourceRect,
} = await import(moduleUrl);

assert.deepEqual(RELIGIOUS_SUCCESSOR_SHEETS.standard, {
  residentWidth: 28,
  spriteHeight: 40,
  src: '/assets/religious-successors-static-v1.png',
});
assert.deepEqual(RELIGIOUS_SUCCESSOR_SHEETS.highDefinition, {
  residentWidth: 56,
  spriteHeight: 80,
  src: '/assets/religious-successors-static-hd-v1.png',
});
assert.deepEqual(religiousSuccessorSourceRect('shaman', 'male', null, false),
  { sx: 0, sy: 0, sw: 28, sh: 40 });
assert.deepEqual(religiousSuccessorSourceRect('monk', 'female', null, false),
  { sx: 28, sy: 40, sw: 28, sh: 40 });
assert.deepEqual(religiousSuccessorSourceRect('monk', 'male', 'youth', false),
  { sx: 56, sy: 0, sw: 28, sh: 40 });
assert.deepEqual(religiousSuccessorSourceRect('monk', 'female', 'youth', true),
  { sx: 112, sy: 80, sw: 56, sh: 80 });
assert.equal(religiousSuccessorSourceRect(undefined, 'male', null, false), null);

const approvedSource = readFileSync(
  new URL('../../src/render/residentApprovedI2VLocomotionAssets.ts', import.meta.url),
  'utf8',
);
assert.doesNotMatch(approvedSource, /^\s+(shaman|monk):/m,
  'ordinary religious jobs must not reuse named Wolhyang/Haeun animation rows');

const atlasSource = readFileSync(new URL('../../src/render/atlas.ts', import.meta.url), 'utf8');
assert.match(atlasSource, /drawReligiousSuccessorStatic\(ctx, p\)/,
  'ordinary religious residents must use the dedicated static rendering branch');

console.log('religious successor asset mapping tests passed');
