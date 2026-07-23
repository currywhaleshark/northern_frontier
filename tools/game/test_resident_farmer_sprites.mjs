import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const assetSource = readFileSync(new URL('../../src/render/residentFarmerAssets.ts', import.meta.url), 'utf8');
const assetOutput = ts.transpileModule(assetSource, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const assetModuleUrl = `data:text/javascript;base64,${Buffer.from(assetOutput).toString('base64')}`;
const {
  RESIDENT_FARMER_HARVEST_SHEET,
  RESIDENT_FARMER_OX_PLOW_SHEET,
  RESIDENT_FARMER_TILL_SHEET,
  farmerHarvestFrameIndex,
  farmerHarvestSourceRect,
  farmerOxPlowFrameIndex,
  farmerOxPlowSourceRect,
  farmerSpriteActionFor,
  farmerTillFrameIndex,
  farmerTillSourceRect,
  selectOxPlowFarmerIds,
} = await import(assetModuleUrl);

assert.deepEqual(RESIDENT_FARMER_TILL_SHEET, {
  frameSize: 40, columns: 3, rows: 2, frameDurationMs: 180,
  src: '/assets/resident-farmer-till-v1.png',
});
assert.deepEqual(RESIDENT_FARMER_HARVEST_SHEET, {
  frameSize: 40, columns: 3, rows: 2, frameDurationMs: 220,
  src: '/assets/resident-farmer-harvest-v1.png',
});
assert.deepEqual(RESIDENT_FARMER_OX_PLOW_SHEET, {
  frameSize: 72, columns: 3, rows: 2, frameDurationMs: 160,
  src: '/assets/resident-farmer-ox-plow-v1.png',
});

assert.deepEqual([0, 180, 360, 540, 720].map(farmerTillFrameIndex), [0, 1, 2, 1, 0]);
assert.deepEqual([0, 220, 440, 660, 880].map(farmerHarvestFrameIndex), [0, 1, 2, 1, 0]);
assert.deepEqual([0, 160, 320, 480, 640].map(farmerOxPlowFrameIndex), [0, 1, 0, 2, 0]);
assert.deepEqual(farmerTillSourceRect('female', 360), { sx: 80, sy: 40, sw: 40, sh: 40 });
assert.deepEqual(farmerHarvestSourceRect('male', 220), { sx: 40, sy: 0, sw: 40, sh: 40 });
assert.deepEqual(farmerOxPlowSourceRect('female', 480), { sx: 144, sy: 72, sw: 72, sh: 72 });

const farmer = (id, assignedBuildingId, task, overrides = {}) => ({
  id, alive: true, job: 'farmer', stage: null, special: undefined, sick: false,
  assignedBuildingId, task, x: 5, y: 5, px: 5, py: 5, ...overrides,
});
const plots = [
  { id: 10, type: 'field', plowOxen: 1 },
  { id: 20, type: 'paddy', plowOxen: 2 },
  { id: 30, type: 'stable', plowOxen: 9 },
];
const residents = [
  farmer(3, 10, '조 파종 중'),
  farmer(1, 10, '콩 재배 중'),
  farmer(7, 20, '벼 재배 중'),
  farmer(6, 20, '벼 파종 중'),
  farmer(5, 20, '수확 중'),
  farmer(4, 20, '벼 재배 중', { stage: 'youth' }),
];
const oxIds = selectOxPlowFarmerIds(plots, residents);
assert.deepEqual([...oxIds].sort((a, b) => a - b), [1, 6, 7],
  'each plot selects at most its assigned ox count, using stable resident ID order');
assert.equal(farmerSpriteActionFor(residents[0], oxIds), 'till');
assert.equal(farmerSpriteActionFor(residents[1], oxIds), 'oxPlow');
assert.equal(farmerSpriteActionFor(residents[4], oxIds), 'harvest');
assert.equal(farmerSpriteActionFor(residents[5], oxIds), undefined, 'youth farmer remains on youth sprite');
assert.equal(farmerSpriteActionFor(farmer(8, 10, '보리 재배 중', { px: 4 }), oxIds), undefined,
  'walking farmers do not begin the work animation early');

const dimensions = [
  ['resident-farmer-till-v1.png', 120, 80],
  ['resident-farmer-harvest-v1.png', 120, 80],
  ['resident-farmer-ox-plow-v1.png', 216, 144],
];
for (const [filename, width, height] of dimensions) {
  const png = readFileSync(new URL(`../../public/assets/${filename}`, import.meta.url));
  assert.equal(png.readUInt32BE(16), width, `${filename} width`);
  assert.equal(png.readUInt32BE(20), height, `${filename} height`);
}

const rendererSource = readFileSync(new URL('../../src/render/renderer.ts', import.meta.url), 'utf8');
assert.match(rendererSource, /selectOxPlowFarmerIds\(state\.buildings, state\.residents\)/,
  'renderer caps ox-plow units to plot assignments');
assert.match(rendererSource, /farmerAction:\s*farmerSpriteActionFor\(r, oxPlowFarmerIds\)/,
  'renderer passes the derived farmer work action');

const atlasSource = readFileSync(new URL('../../src/render/atlas.ts', import.meta.url), 'utf8');
assert.match(atlasSource, /case 'farmer':/);
for (const action of ['oxPlow', 'harvest', 'till']) {
  assert.match(atlasSource, new RegExp(`p\\.farmerAction === '${action}'`),
    `${action} farmer sheet is connected to the atlas`);
}
const youthBranch = atlasSource.indexOf('newContentResidentSheet && newContentRect');
const farmerBranch = atlasSource.indexOf('drawOptionalResidentPresentation(ctx, p');
assert.ok(youthBranch >= 0 && farmerBranch > youthBranch,
  'special/youth resident rendering remains ahead of adult farmer work rendering');

console.log('resident farmer sprite tests passed');
