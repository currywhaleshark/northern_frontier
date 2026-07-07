import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import ts from 'typescript';

async function importTsModule(relativePath) {
  const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(output).toString('base64')}`;
  return import(moduleUrl);
}

const buildingAssets = await importTsModule('../../src/render/promotionBuildingAssets.ts');
const characterAssets = await importTsModule('../../src/render/promotionCharacterAssets.ts');

const PROMOTION_BUILDINGS = [
  'tileHouse', 'bridge', 'mine', 'ferry',
  'charcoalKiln', 'stable', 'nitreYard', 'dock',
  'earthFort', 'stoneWall', 'office', 'cannonEmplacement',
];
const PROMOTION_JOBS = ['miner', 'fisher', 'charcoalBurner', 'herder', 'powderMaker', 'clerk'];

assert.equal(buildingAssets.PROMOTION_BUILDING_SHEET.tileSize, 28);
assert.equal(buildingAssets.PROMOTION_BUILDING_SHEET.spriteHeight, 40);
assert.equal(buildingAssets.PROMOTION_BUILDING_SHEET.columns, PROMOTION_BUILDINGS.length);
assert.equal(buildingAssets.PROMOTION_BUILDING_SHEET.rows, 2);
assert.equal(buildingAssets.PROMOTION_BUILDING_SHEET.src, '/assets/promotion-buildings-generated-v1.png');
assert.deepEqual(buildingAssets.PROMOTION_BUILDING_TYPES, PROMOTION_BUILDINGS);

for (const [col, type] of PROMOTION_BUILDINGS.entries()) {
  assert.equal(buildingAssets.isPromotionBuildingType(type), true, `${type} uses the promotion building sheet`);
  assert.deepEqual(
    buildingAssets.promotionBuildingSourceRect(type, 'summer'),
    { sx: col * 28, sy: 0, sw: 28, sh: 40 },
    `${type} summer source rect`,
  );
  assert.deepEqual(
    buildingAssets.promotionBuildingSourceRect(type, 'winter'),
    { sx: col * 28, sy: 40, sw: 28, sh: 40 },
    `${type} winter source rect`,
  );
}
assert.equal(buildingAssets.isPromotionBuildingType('hut'), false);

assert.equal(characterAssets.PROMOTION_CHARACTER_SHEET.residentWidth, 28);
assert.equal(characterAssets.PROMOTION_CHARACTER_SHEET.spriteHeight, 40);
assert.equal(characterAssets.PROMOTION_CHARACTER_SHEET.columns, PROMOTION_JOBS.length);
assert.equal(characterAssets.PROMOTION_CHARACTER_SHEET.rows, 2);
assert.equal(characterAssets.PROMOTION_CHARACTER_SHEET.src, '/assets/promotion-characters-generated-v1.png');
assert.deepEqual(characterAssets.PROMOTION_CHARACTER_JOBS, PROMOTION_JOBS);

for (const [col, job] of PROMOTION_JOBS.entries()) {
  assert.equal(characterAssets.isPromotionCharacterJob(job), true, `${job} uses the promotion character sheet`);
  assert.deepEqual(
    characterAssets.promotionResidentSourceRect(job, 'male'),
    { sx: col * 28, sy: 0, sw: 28, sh: 40 },
    `${job} male source rect`,
  );
  assert.deepEqual(
    characterAssets.promotionResidentSourceRect(job, 'female'),
    { sx: col * 28, sy: 40, sw: 28, sh: 40 },
    `${job} female source rect`,
  );
}
assert.equal(characterAssets.isPromotionCharacterJob('smith'), false);

console.log('promotion asset routing tests passed');
