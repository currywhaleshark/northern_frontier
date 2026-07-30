import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const srcDir = new URL('../../src/game/', import.meta.url);
const outDir = mkdtempSync(join(tmpdir(), 'northern-water-coverage-'));
for (const file of readdirSync(srcDir).filter(file => file.endsWith('.ts'))) {
  const source = readFileSync(new URL(file, srcDir), 'utf8');
  let output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  output = output.replace(/(from\s+['"])(\.{1,2}\/[^'"]+)(['"])/g, (_m, start, spec, end) =>
    /\.[cm]?js$/.test(spec) ? `${start}${spec}${end}` : `${start}${spec}.mjs${end}`);
  writeFileSync(join(outDir, file.replace(/\.ts$/, '.mjs')), output, 'utf8');
}

const { nearestRiverDistance, buildingHasRiverWaterAccess } =
  await import(pathToFileURL(join(outDir, 'waterCoverage.mjs')).href);
const {
  buildingWaterSupply,
  dailyAquiferTick,
  PREVIEW_WATER_BUILDING_ID,
  waterDemandForBuildingPlacement,
  waterDependentProductionMultiplier,
  waterSupplySnapshot,
} = await import(pathToFileURL(join(outDir, 'waterSupply.mjs')).href);
const { aquiferSampleAt, aquiferVeins, initialAquiferLevels } =
  await import(pathToFileURL(join(outDir, 'subsurfaceVeins.mjs')).href);

const map = Array.from({ length: 9 }, (_, y) =>
  Array.from({ length: 9 }, (_, x) => ({
    x,
    y,
    terrain: x === 4 ? 'river' : 'plain',
  })));
const state = { map };

assert.equal(nearestRiverDistance(state, 4, 4), 0);
assert.equal(nearestRiverDistance(state, 1, 4), 3);
assert.equal(nearestRiverDistance(state, 0, 4), null,
  'default river coverage must end beyond three Manhattan tiles');
assert.equal(buildingHasRiverWaterAccess(state, {
  type: 'hut', x: 1, y: 4, w: 2, h: 2,
}), true, 'any footprint tile inside the river radius supplies the building');
assert.equal(buildingHasRiverWaterAccess(state, {
  type: 'hut', x: 8, y: 0, w: 2, h: 2,
}), false);

const seed = 20260729;
const size = 30;
const supplyMap = Array.from({ length: size }, (_, y) =>
  Array.from({ length: size }, (_, x) => ({ x, y, terrain: 'plain', buildingId: null })));
const aquifers = aquiferVeins(seed, size, size);
const aquifer = aquifers[0];
const well = { id: 1, type: 'well', x: aquifer.cx, y: aquifer.cy, w: 1, h: 1, built: true };
const house = {
  id: 2,
  type: 'hut',
  x: Math.min(size - 2, aquifer.cx + 2),
  y: aquifer.cy,
  w: 2,
  h: 2,
  built: true,
};
const supplyState = {
  seed,
  day: 8,
  weather: 'clear',
  map: supplyMap,
  buildings: [well, house],
  residents: [{ id: 1, alive: true, stage: null, homeBuildingId: house.id }],
  aquiferLevels: initialAquiferLevels(seed, size, size),
  pendingDisasters: [],
};

let supply = buildingWaterSupply(supplyState, house);
assert.equal(supply.source, 'well');
assert.equal(supply.ratio, 1, 'a nearby live well fully supplies a small household');
assert.ok(waterSupplySnapshot(supplyState).aquiferConsumption[aquifer.id] > 0,
  'well-served demand consumes its shared aquifer');

const riverX = Math.max(0, house.x - 3);
supplyMap[house.y][riverX].terrain = 'river';
supply = buildingWaterSupply(supplyState, house);
assert.equal(supply.source, 'river');
assert.equal(supply.ratio, 1);
assert.equal(waterSupplySnapshot(supplyState).aquiferConsumption.reduce((sum, value) => sum + value, 0), 0,
  'river coverage never consumes aquifer water');

supplyMap[house.y][riverX].terrain = 'plain';
supplyState.buildings = [house];
assert.equal(buildingWaterSupply(supplyState, house).ratio, 0);
assert.equal(waterDependentProductionMultiplier(supplyState, house), 0.5,
  'a water-dependent building bottoms out at half efficiency rather than stopping');
const levelsBeforePreview = [...supplyState.aquiferLevels];
const previewSupply = waterSupplySnapshot(supplyState, { x: aquifer.cx, y: aquifer.cy });
assert.equal(previewSupply.buildings.get(house.id)?.source, 'well');
assert.equal(previewSupply.buildings.get(house.id)?.ratio, 1,
  'a hovered preview well shows the completed supply effect before placement');
assert.deepEqual(supplyState.aquiferLevels, levelsBeforePreview,
  'preview supply calculation never mutates groundwater levels');
assert.equal(buildingWaterSupply(supplyState, house).ratio, 0,
  'preview supply never enters the actual settlement state');

supplyState.buildings = [well];
const previewHouse = {
  id: PREVIEW_WATER_BUILDING_ID,
  type: 'hut',
  x: house.x,
  y: house.y,
  w: 2,
  h: 2,
  demand: waterDemandForBuildingPlacement('hut'),
};
const buildingPreview = waterSupplySnapshot(supplyState, undefined, previewHouse);
assert.equal(buildingPreview.buildings.get(PREVIEW_WATER_BUILDING_ID)?.source, 'well');
assert.equal(buildingPreview.buildings.get(PREVIEW_WATER_BUILDING_ID)?.ratio, 1,
  'a water-dependent building placement previews its residual well supply');
assert.equal(waterDemandForBuildingPlacement('smithy'), 0,
  'buildings without water demand keep their ordinary placement preview');

const secondWellTile = [
  [aquifer.cx + 1, aquifer.cy],
  [aquifer.cx - 1, aquifer.cy],
  [aquifer.cx, aquifer.cy + 1],
  [aquifer.cx, aquifer.cy - 1],
].find(([x, y]) =>
  aquiferSampleAt(seed, size, size, x, y)?.vein.id === aquifer.id);
assert.ok(secondWellTile, 'the aquifer center must have an adjacent tile on the same vein');
const secondWell = {
  id: 3,
  type: 'well',
  x: secondWellTile[0],
  y: secondWellTile[1],
  w: 1,
  h: 1,
  built: true,
};
const crowdedHouses = Array.from({ length: 12 }, (_, index) => ({
  id: 10 + index,
  type: 'hut',
  x: Math.min(size - 2, aquifer.cx + 2),
  y: aquifer.cy,
  w: 2,
  h: 2,
  built: true,
}));
const crowdedResidents = crowdedHouses.flatMap(houseBuilding =>
  Array.from({ length: 4 }, (_, index) => ({
    id: houseBuilding.id * 10 + index,
    alive: true,
    stage: null,
    homeBuildingId: houseBuilding.id,
  })));
supplyState.buildings = [well, ...crowdedHouses];
supplyState.residents = crowdedResidents;
const oneWellCrowded = waterSupplySnapshot(supplyState);
const oneWellRatios = crowdedHouses.map(
  houseBuilding => oneWellCrowded.buildings.get(houseBuilding.id)?.ratio ?? 0);
assert.ok(oneWellRatios.every(ratio => ratio > 0 && ratio < 1),
  'a short well supply is shared across same-priority homes instead of stopping at building id order');
assert.ok(Math.max(...oneWellRatios) - Math.min(...oneWellRatios) < 1e-6,
  'same-priority homes in the same service area receive an equal supply ratio');

supplyState.buildings = [well, secondWell, ...crowdedHouses];
const twoWellCrowded = waterSupplySnapshot(supplyState);
assert.ok(crowdedHouses.every(
  houseBuilding => (twoWellCrowded.buildings.get(houseBuilding.id)?.ratio ?? 0) >= 0.999),
  'a second well on the same aquifer adds extraction capacity');
assert.ok(
  twoWellCrowded.aquiferConsumption[aquifer.id] >
    oneWellCrowded.aquiferConsumption[aquifer.id],
  'stacked wells drain their shared aquifer faster when the settlement uses the added water');

const fullAquiferLevel = supplyState.aquiferLevels[aquifer.id];
supplyState.aquiferLevels[aquifer.id] = 2;
const lowWaterCrowded = waterSupplySnapshot(supplyState);
assert.ok(lowWaterCrowded.aquiferConsumption[aquifer.id] <= 2 + 1e-6,
  'stacked well output never exceeds the water remaining in the shared aquifer');
supplyState.aquiferLevels[aquifer.id] = fullAquiferLevel;

supplyState.buildings = [];
supplyState.residents = [];
supplyState.aquiferLevels[aquifer.id] = aquifer.capacity / 2;
const beforeRecovery = supplyState.aquiferLevels[aquifer.id];
dailyAquiferTick(supplyState);
assert.ok(supplyState.aquiferLevels[aquifer.id] > beforeRecovery,
  'an unused aquifer recovers each non-drought day');
const beforeDrought = supplyState.aquiferLevels[aquifer.id];
supplyState.pendingDisasters = [{ id: 'drought' }];
dailyAquiferTick(supplyState);
assert.equal(supplyState.aquiferLevels[aquifer.id], beforeDrought,
  'drought completely stops aquifer recovery');

console.log('water coverage tests passed');
