import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import ts from 'typescript';

async function loadModule(path) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);
}

const buildings = await loadModule('../../src/render/specializedBuildingAssets.ts');
const workers = await loadModule('../../src/render/specializedCharacterAssets.ts');
const raiders = await loadModule('../../src/render/factionRaiderAssets.ts');
const damage = await loadModule('../../src/render/buildingDamageAssets.ts');

assert.equal(buildings.SPECIALIZED_BUILDING_SHEET.columns, 6);
assert.deepEqual(buildings.specializedBuildingSourceRect('lumberCamp', 'summer'), { sx: 0, sy: 0, sw: 28, sh: 40 });
assert.deepEqual(buildings.specializedBuildingSourceRect('paddy', 'winter'), { sx: 84, sy: 40, sw: 28, sh: 40 });
assert.deepEqual(buildings.specializedBuildingSourceRect('weavingHouse', 'winter', true), { sx: 280, sy: 80, sw: 56, sh: 80 });
assert.equal(buildings.specializedBuildingSourceRect('smithy', 'summer'), null);

assert.equal(workers.isSpecializedCharacterJob('woodSplitter'), true);
assert.equal(workers.isSpecializedCharacterJob('woodcutter'), false);
assert.deepEqual(workers.specializedResidentSourceRect('tanner', 'female'), { sx: 28, sy: 40, sw: 28, sh: 40 });

assert.deepEqual(raiders.factionRaiderSourceRect('오도리 씨족'), { sx: 0, sy: 0, sw: 56, sh: 40 });
assert.deepEqual(raiders.factionRaiderSourceRect('변경 마적'), { sx: 280, sy: 0, sw: 56, sh: 40 });
assert.equal(raiders.factionRaiderSourceRect('만상'), null);

assert.deepEqual(damage.buildingDamageSourceRect('summer'), { sx: 0, sy: 0, sw: 56, sh: 80 });
assert.deepEqual(damage.buildingDamageSourceRect('winter'), { sx: 56, sy: 0, sw: 56, sh: 80 });

console.log('specialized asset mapping tests passed');
