import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-game-tests-'));
  for (const file of readdirSync(srcDir).filter(file => file.endsWith('.ts'))) {
    const source = readFileSync(new URL(file, srcDir), 'utf8');
    let output = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    output = output.replace(/(from\s+['"])(\.{1,2}\/[^'"]+)(['"])/g, (_m, start, spec, end) =>
      /\.[cm]?js$/.test(spec) ? `${start}${spec}${end}` : `${start}${spec}.mjs${end}`);
    writeFileSync(join(outDir, file.replace(/\.ts$/, '.mjs')), output, 'utf8');
  }
  return outDir;
}

const compiledDir = compileGameModules();
const simulation = await import(pathToFileURL(join(compiledDir, 'simulation.mjs')).href);
const catalog = await import(pathToFileURL(join(compiledDir, 'resourceCatalog.mjs')).href);
const consumption = await import(pathToFileURL(join(compiledDir, 'consumption.mjs')).href);
const constants = await import(pathToFileURL(join(compiledDir, 'constants.mjs')).href);

{
  assert.deepEqual(catalog.FOOD_RESOURCES, [
    'grain', 'meat', 'eggs', 'fish', 'vegetables', 'kimchi', 'beans', 'jang', 'curedMeat', 'saltedFish', 'driedFish',
  ]);
  assert.deepEqual(catalog.FUEL_RESOURCES, ['brushwood', 'firewood', 'charcoal']);
  assert.deepEqual(catalog.CLOTHING_RESOURCES, ['hideClothes', 'cottonClothes']);
  assert.equal(catalog.RESOURCE_DEFS.rice.category, 'material');
  assert.equal(catalog.FOOD_RESOURCES.includes('rice'), false);
  assert.equal(constants.RESOURCE_NAMES.rice, '벼');
  assert.deepEqual(
    consumption.FOOD_VARIETY_GROUPS.find(group => group.id === 'meat')?.resources,
    ['meat', 'eggs', 'curedMeat'],
    'eggs contribute to the animal-protein group without creating a sixth variety group',
  );
  assert.deepEqual(
    consumption.FOOD_VARIETY_GROUPS.find(group => group.id === 'vegetables')?.resources,
    ['vegetables', 'kimchi'],
    'kimchi fulfills the vegetable share without adding a new variety group',
  );
  assert.deepEqual(
    consumption.FOOD_VARIETY_GROUPS.find(group => group.id === 'beans')?.resources,
    ['beans', 'jang'],
    'jang contributes to its source bean group instead of adding a new variety group',
  );
}

{
  const state = simulation.newGame(2026071701);
  for (const id of catalog.RESOURCE_IDS) state.resources[id] = 0;
  state.resources.kimchi = 2;
  const result = consumption.consumeFoodByDiet(state, 1);
  assert.equal(result.totalConsumed, 1);
  assert.equal(result.byResource.kimchi, 1);
  assert.equal(result.vegetableRatio, 1, 'kimchi alone satisfies the recommended vegetable share');
  assert.equal(result.varietyScore, 0.2, 'kimchi remains in the single vegetable variety group');
}

{
  const state = simulation.newGame(2026071601);
  for (const id of catalog.RESOURCE_IDS) state.resources[id] = 0;
  Object.assign(state.resources, { meat: 1, curedMeat: 10, fish: 1, saltedFish: 10, driedFish: 10 });
  const result = consumption.consumeFoodByDiet(state, 2);
  assert.ok((result.byResource.meat ?? 0) > 0, 'fresh meat is eaten before cured meat');
  assert.equal(result.byResource.curedMeat ?? 0, 0);
  assert.ok((result.byResource.fish ?? 0) > 0, 'fresh fish is eaten before preserved fish');
  assert.equal(result.byResource.saltedFish ?? 0, 0);
  assert.equal(result.byResource.driedFish ?? 0, 0);
  assert.equal(result.varietyScore, 0.4, 'preserved variants share their meat or fish variety group');
}

{
  const state = simulation.newGame(2026071001);
  for (const id of catalog.RESOURCE_IDS) {
    assert.equal(typeof state.resources[id], 'number', `${id} is initialized`);
  }
  assert.equal(Object.hasOwn(state.resources, 'food'), false);
  assert.equal(Object.hasOwn(state.resources, 'clothes'), false);
  assert.equal(Object.hasOwn(state.resources, 'game'), false);
}

{
  const state = simulation.newGame(2026071004);
  for (const id of catalog.RESOURCE_IDS) state.resources[id] = 0;
  Object.assign(state.resources, { grain: 20, rice: 10, meat: 10, fish: 10, vegetables: 10, beans: 10 });
  const result = consumption.consumeFoodByDiet(state, 5);
  assert.equal(result.totalConsumed, 5);
  assert.ok(result.byResource.grain > result.byResource.meat);
  assert.ok((result.byResource.beans ?? 0) < (result.byResource.vegetables ?? 0), 'beans have a lower diet weight');
  assert.equal(consumption.foodTotal(state), 55, 'unmilled rice is not edible');
}

{
  const state = simulation.newGame(2026071006);
  Object.assign(state.resources, { brushwood: 10, firewood: 10, charcoal: 10 });
  assert.equal(consumption.fuelHeatTotal(state), 31);
  const supplied = consumption.consumeFuelHeat(state, 3.6);
  assert.equal(supplied, 3.6);
  assert.equal(state.resources.brushwood, 4);
}

{
  const state = simulation.newGame(2026071007);
  state.resources.hideClothes = 2;
  state.resources.cottonClothes = 2;
  assert.equal(consumption.clothingCoverageTotal(state), 4.2);
  consumption.consumeClothingWear(state, 1);
  assert.equal(state.resources.cottonClothes, 1);
  assert.equal(state.resources.hideClothes, 2);
}

console.log('resource category and consumption tests passed');
