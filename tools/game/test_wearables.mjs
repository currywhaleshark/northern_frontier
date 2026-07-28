import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-wearables-'));
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
const saveLoad = await import(pathToFileURL(join(compiledDir, 'saveLoad.mjs')).href);
const wearables = await import(pathToFileURL(join(compiledDir, 'wearables.mjs')).href);

{
  const state = simulation.newGame(2026072801);
  const resident = state.residents[0];
  state.day = 4;
  resident.worn = undefined;
  Object.assign(state.resources, {
    hideClothes: 1,
    cottonClothes: 1,
    leatherShoes: 1,
    strawShoes: 1,
  });
  assert.equal(wearables.equipMissingWearables(state, resident), true);
  assert.equal(resident.worn.clothing.resource, 'hideClothes', 'the warmer clothing tier is taken first');
  assert.equal(resident.worn.footwear.resource, 'leatherShoes', 'the longer-lived shoe tier is taken first');
  assert.equal(state.resources.hideClothes, 0);
  assert.equal(state.resources.leatherShoes, 0);
  assert.equal(wearables.equipMissingWearables(state, resident), false, 'pickup runs at most once per resident and day');
  assert.equal(state.resources.cottonClothes, 1);
  assert.equal(state.resources.strawShoes, 1);
}

{
  const state = simulation.newGame(2026072802);
  const adult = state.residents[0];
  const child = state.residents[1];
  state.day = 13;
  state.weather = 'clear';
  adult.job = child.job = 'farmer';
  child.stage = 'child';
  adult.worn = { footwear: { resource: 'strawShoes', wear: 0 } };
  child.worn = { footwear: { resource: 'strawShoes', wear: 0 } };
  wearables.wearablesDailyTick(state);
  assert.ok(adult.worn.footwear.wear > child.worn.footwear.wear);
  assert.equal(
    child.worn.footwear.wear,
    adult.worn.footwear.wear * 0.5,
    'children apply half daily wear',
  );
  assert.equal(wearables.residentFootwearMoveMultiplier({ ...adult, worn: undefined }), 0.85);
  assert.equal(wearables.residentFootwearMoveMultiplier(adult), 1);
}

{
  const state = simulation.newGame(2026072803);
  const resident = state.residents[0];
  state.buildings = state.buildings.filter(building => building.type !== 'stable');
  state.day = 6;
  state.resources.hay = 5;
  state.resources.strawShoes = Number.NaN;
  state.resources.leatherShoes = Number.NaN;
  for (const other of state.residents) other.worn = undefined;
  const crafted = wearables.craftStrawShoesAtHome(state, resident);
  assert.equal(crafted, 0.3);
  assert.equal(state.resources.hay, 4.4);
  assert.equal(state.resources.strawShoes, 0.3);
  assert.equal(state.resources.leatherShoes, 0, 'invalid legacy footwear stock is repaired');
  assert.equal(wearables.craftStrawShoesAtHome(state, resident), 0, 'evening crafting cannot repeat in one day');
}

{
  const state = simulation.newGame(2026072804);
  const tannery = { tanneryProduct: 'auto' };
  for (const resident of state.residents) resident.worn = {
    clothing: { resource: 'hideClothes', wear: 0 },
  };
  state.resources.hideClothes = 0;
  state.resources.cottonClothes = 0;
  state.resources.strawShoes = 0;
  state.resources.leatherShoes = 0;
  assert.equal(wearables.resolvedTanneryProduct(state, tannery), 'leatherShoes');
  delete state.residents[0].worn.clothing;
  state.residents[0].worn.footwear = { resource: 'strawShoes', wear: 0 };
  for (const resident of state.residents.slice(1)) {
    resident.worn.footwear = { resource: 'strawShoes', wear: 0 };
  }
  assert.equal(wearables.resolvedTanneryProduct(state, tannery), 'hideClothes');
  assert.equal(wearables.TANNERY_PRODUCT_DEFS.leatherShoes.hidePerUnit, 1.5);
}

{
  const migrated = saveLoad.migrateV38ToV39({
    schemaVersion: 38,
    resources: { hideClothes: 1, cottonClothes: 1 },
    residents: [
      { id: 3, alive: false },
      { id: 2, alive: true },
      { id: 1, alive: true },
    ],
  });
  assert.equal(migrated.schemaVersion, 39);
  assert.equal(migrated.resources.hideClothes, 0);
  assert.equal(migrated.resources.cottonClothes, 0);
  assert.equal(migrated.resources.strawShoes, 0);
  assert.equal(migrated.resources.leatherShoes, 0);
  assert.equal(migrated.residents[2].worn.clothing.resource, 'hideClothes',
    'migration allocates the better tier by resident id without reordering the resident list');
  assert.equal(migrated.residents[1].worn.clothing.resource, 'cottonClothes');
  assert.equal(migrated.residents[0].worn, undefined, 'dead residents receive no migrated clothing');
}

console.log('wearables tests passed');
