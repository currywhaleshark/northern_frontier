import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import ts from 'typescript';

const source = readFileSync(new URL('../../src/render/generatedTerrainObjects.ts', import.meta.url), 'utf8');
const output = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const moduleUrl = `data:text/javascript;base64,${Buffer.from(output).toString('base64')}`;
const {
  GENERATED_TERRAIN_OBJECT_SHEET,
  generatedTerrainObjectSourceRect,
  terrainObjectFor,
  fertileGroundWash,
} = await import(moduleUrl);

assert.equal(GENERATED_TERRAIN_OBJECT_SHEET.tileSize, 28);
assert.equal(GENERATED_TERRAIN_OBJECT_SHEET.columns, 5);
assert.equal(GENERATED_TERRAIN_OBJECT_SHEET.rows, 2);
assert.equal(GENERATED_TERRAIN_OBJECT_SHEET.src, '/assets/folk-terrain-objects-generated-v3.png');

assert.equal(terrainObjectFor('forest', 'spring', false), 'broadleaf');
assert.equal(terrainObjectFor('forest', 'summer', false), 'broadleaf');
assert.equal(terrainObjectFor('forest', 'autumn', false), 'autumnTree');
assert.equal(terrainObjectFor('forest', 'winter', false), 'winterTree');
assert.equal(terrainObjectFor('mountain', 'summer', false), 'mountainCrag');
assert.equal(terrainObjectFor('rock', 'summer', false), 'lowRock');
assert.equal(terrainObjectFor('rock', 'summer', true), 'ironOre');
assert.equal(terrainObjectFor('plain', 'summer', false), null);

assert.deepEqual(generatedTerrainObjectSourceRect('broadleaf'), { sx: 0, sy: 0, sw: 28, sh: 28 });
assert.deepEqual(generatedTerrainObjectSourceRect('pine'), { sx: 28, sy: 0, sw: 28, sh: 28 });
assert.deepEqual(generatedTerrainObjectSourceRect('winterTree'), { sx: 84, sy: 0, sw: 28, sh: 28 });
assert.deepEqual(generatedTerrainObjectSourceRect('snowPine'), { sx: 112, sy: 0, sw: 28, sh: 28 });
assert.deepEqual(generatedTerrainObjectSourceRect('mountainCrag'), { sx: 0, sy: 28, sw: 28, sh: 28 });
assert.deepEqual(generatedTerrainObjectSourceRect('fieldstone'), { sx: 56, sy: 28, sw: 28, sh: 28 });
assert.deepEqual(generatedTerrainObjectSourceRect('ironOre'), { sx: 84, sy: 28, sw: 28, sh: 28 });

assert.equal(fertileGroundWash('spring'), 'rgba(195,205,120,0.16)');
assert.equal(fertileGroundWash('summer'), 'rgba(214,204,120,0.18)');
assert.equal(fertileGroundWash('autumn'), 'rgba(213,181,91,0.14)');
assert.equal(fertileGroundWash('winter'), 'rgba(236,239,214,0.16)');

console.log('generated terrain object tests passed');
