import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import ts from 'typescript';

const source = readFileSync(new URL('../../src/render/generatedBuildingAssets.ts', import.meta.url), 'utf8');
const output = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const moduleUrl = `data:text/javascript;base64,${Buffer.from(output).toString('base64')}`;
const {
  GENERATED_BUILDING_SHEET,
  GENERATED_LARGE_BUILDING_SHEET,
  generatedBuildingSourceRect,
  generatedLargeBuildingSourceRect,
} = await import(moduleUrl);

assert.equal(GENERATED_BUILDING_SHEET.tileSize, 28);
assert.equal(GENERATED_BUILDING_SHEET.spriteHeight, 40);
assert.equal(GENERATED_BUILDING_SHEET.columns, 15);
assert.equal(GENERATED_BUILDING_SHEET.rows, 3);
assert.equal(GENERATED_BUILDING_SHEET.src, '/assets/folk-buildings-generated-v1.png');

assert.equal(GENERATED_LARGE_BUILDING_SHEET.tileSize, 56);
assert.equal(GENERATED_LARGE_BUILDING_SHEET.spriteHeight, 80);
assert.equal(GENERATED_LARGE_BUILDING_SHEET.columns, 15);
assert.equal(GENERATED_LARGE_BUILDING_SHEET.rows, 2);
assert.equal(GENERATED_LARGE_BUILDING_SHEET.src, '/assets/folk-buildings-generated-large-v1.png');

assert.deepEqual(generatedBuildingSourceRect('center', 'summer'), { sx: 0, sy: 0, sw: 28, sh: 40 });
assert.deepEqual(generatedBuildingSourceRect('hut', 'summer'), { sx: 28, sy: 0, sw: 28, sh: 40 });
assert.deepEqual(generatedBuildingSourceRect('market', 'summer'), { sx: 392, sy: 0, sw: 28, sh: 40 });

assert.deepEqual(generatedBuildingSourceRect('center', 'winter'), { sx: 0, sy: 40, sw: 28, sh: 40 });
assert.deepEqual(generatedBuildingSourceRect('hut', 'winter'), { sx: 28, sy: 40, sw: 28, sh: 40 });
assert.deepEqual(generatedBuildingSourceRect('market', 'winter'), { sx: 392, sy: 40, sw: 28, sh: 40 });

assert.deepEqual(generatedBuildingSourceRect('field', 'spring'), { sx: 0, sy: 80, sw: 28, sh: 40 });
assert.deepEqual(generatedBuildingSourceRect('field', 'summer'), { sx: 28, sy: 80, sw: 28, sh: 40 });
assert.deepEqual(generatedBuildingSourceRect('field', 'autumn'), { sx: 56, sy: 80, sw: 28, sh: 40 });
assert.deepEqual(generatedBuildingSourceRect('field', 'winter'), { sx: 84, sy: 80, sw: 28, sh: 40 });

assert.deepEqual(generatedLargeBuildingSourceRect('center', 'summer'), { sx: 0, sy: 0, sw: 56, sh: 80 });
assert.deepEqual(generatedLargeBuildingSourceRect('hut', 'summer'), { sx: 56, sy: 0, sw: 56, sh: 80 });
assert.deepEqual(generatedLargeBuildingSourceRect('market', 'summer'), { sx: 784, sy: 0, sw: 56, sh: 80 });
assert.deepEqual(generatedLargeBuildingSourceRect('center', 'winter'), { sx: 0, sy: 80, sw: 56, sh: 80 });
assert.deepEqual(generatedLargeBuildingSourceRect('hut', 'winter'), { sx: 56, sy: 80, sw: 56, sh: 80 });
assert.deepEqual(generatedLargeBuildingSourceRect('market', 'winter'), { sx: 784, sy: 80, sw: 56, sh: 80 });

console.log('generated building asset tests passed');
