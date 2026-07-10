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
  assert.deepEqual(catalog.FOOD_RESOURCES, ['grain', 'meat', 'fish', 'vegetables']);
  assert.deepEqual(catalog.FUEL_RESOURCES, ['brushwood', 'firewood', 'charcoal']);
  assert.deepEqual(catalog.CLOTHING_RESOURCES, ['hideClothes', 'cottonClothes']);
  assert.equal(catalog.RESOURCE_DEFS.rice.category, 'material');
  assert.equal(catalog.FOOD_RESOURCES.includes('rice'), false);
  assert.equal(constants.RESOURCE_NAMES.rice, '벼');
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
  Object.assign(state.resources, { grain: 20, rice: 10, meat: 10, fish: 10, vegetables: 10 });
  const result = consumption.consumeFoodByDiet(state, 5);
  assert.equal(result.totalConsumed, 5);
  assert.ok(result.byResource.grain > result.byResource.meat);
  assert.equal(consumption.foodTotal(state), 45, 'unmilled rice is not edible');
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
