import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import ts from 'typescript';

const source = readFileSync(new URL('../../src/render/terrainVisuals.ts', import.meta.url), 'utf8');
const output = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const moduleUrl = `data:text/javascript;base64,${Buffer.from(output).toString('base64')}`;
const {
  terrainCanopyLayer,
  terrainShowsStandaloneGameTrail,
} = await import(moduleUrl);

assert.equal(terrainCanopyLayer('forest'), 'forest');
assert.equal(terrainCanopyLayer('hunting'), 'forest');
assert.equal(terrainCanopyLayer('plain'), null);
assert.equal(terrainCanopyLayer('fertile'), null);
assert.equal(terrainCanopyLayer('mountain'), null);
assert.equal(terrainShowsStandaloneGameTrail('hunting'), false);
assert.equal(terrainShowsStandaloneGameTrail('forest'), false);

console.log('terrain visuals tests passed');
