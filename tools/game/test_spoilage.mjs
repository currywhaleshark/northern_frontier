import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-spoilage-tests-'));
  for (const file of readdirSync(srcDir).filter(file => file.endsWith('.ts'))) {
    const source = readFileSync(new URL(file, srcDir), 'utf8');
    let output = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    output = output.replace(/(from\s+['"])(\.{1,2}\/[^'"]+)(['"])/g, (_match, start, spec, end) =>
      /\.[cm]?js$/.test(spec) ? `${start}${spec}${end}` : `${start}${spec}.mjs${end}`);
    writeFileSync(join(outDir, file.replace(/\.ts$/, '.mjs')), output, 'utf8');
  }
  return outDir;
}

const compiledDir = compileGameModules();
const load = name => import(pathToFileURL(join(compiledDir, `${name}.mjs`)).href);
const simulation = await load('simulation');
const spoilage = await load('spoilage');
const { CONFIG } = await load('config');
const { SUBTICKS } = await load('agents');

function rawFoodState(seed = 2026071601) {
  const state = simulation.newGame(seed);
  state.resources.fish = 20;
  state.resources.meat = 30;
  state.resources.eggs = 10;
  state.resources.milk = 10;
  state.resources.vegetables = 40;
  return state;
}

assert.ok(CONFIG.spoilage.dailyRate.fish > CONFIG.spoilage.dailyRate.meat);
assert.ok(CONFIG.spoilage.dailyRate.milk > CONFIG.spoilage.dailyRate.meat);
assert.ok(CONFIG.spoilage.dailyRate.meat > CONFIG.spoilage.dailyRate.eggs);
assert.ok(CONFIG.spoilage.dailyRate.eggs > CONFIG.spoilage.dailyRate.vegetables);
assert.ok(CONFIG.spoilage.dailyRate.meat > CONFIG.spoilage.dailyRate.vegetables);
assert.ok(CONFIG.spoilage.seasonMult.summer > CONFIG.spoilage.seasonMult.spring);
assert.ok(CONFIG.spoilage.seasonMult.winter < CONFIG.spoilage.seasonMult.autumn);

{
  const state = rawFoodState();
  state.day = CONFIG.time.seasonDays + 1;
  const report = spoilage.spoilagePreview(state);
  assert.equal(report.season, 'summer');
  assert.equal(report.capacity, 0);
  assert.equal(report.protectedTotal, 0);
  assert.equal(report.rawFoodTotal, 110);
  assert.ok(report.items.fish.loss / report.items.fish.stock > report.items.meat.loss / report.items.meat.stock);
  assert.ok(report.items.milk.loss / report.items.milk.stock > report.items.meat.loss / report.items.meat.stock);
  assert.ok(report.items.meat.loss / report.items.meat.stock > report.items.vegetables.loss / report.items.vegetables.stock);
  assert.ok(report.items.eggs.loss / report.items.eggs.stock > report.items.vegetables.loss / report.items.vegetables.stock);
}

{
  const state = rawFoodState();
  state.day = CONFIG.time.seasonDays + 1;
  const exposed = spoilage.spoilagePreview(state);
  state.buildings.push({
    id: 9001, type: 'cellar', x: 1, y: 1,
    progress: 4, built: true, fieldGrowth: 0,
  });
  const protectedReport = spoilage.spoilagePreview(state);
  assert.equal(protectedReport.capacity, CONFIG.spoilage.cellarCapacity);
  assert.equal(protectedReport.protectedTotal, CONFIG.spoilage.cellarCapacity);
  assert.equal(protectedReport.items.fish.protectedAmount, 20, 'fish receives protection first');
  assert.equal(protectedReport.items.milk.protectedAmount, 10, 'fast-spoiling milk receives protection second');
  assert.equal(protectedReport.items.meat.protectedAmount, 6, 'remaining capacity protects meat third');
  assert.equal(protectedReport.items.eggs.protectedAmount, 0, 'eggs wait behind faster-spoiling fish and meat');
  assert.equal(protectedReport.items.vegetables.protectedAmount, 0, 'vegetables receive the final remainder');
  assert.ok(protectedReport.totalLoss < exposed.totalLoss, 'a completed cellar reduces daily losses');

  state.buildings.push({
    id: 9002, type: 'cellar', x: 3, y: 1,
    progress: 2, built: false, fieldGrowth: 0,
  });
  assert.equal(spoilage.spoilagePreview(state).capacity, CONFIG.spoilage.cellarCapacity,
    'unfinished cellars provide no protection');
}

{
  const summer = rawFoodState();
  summer.day = CONFIG.time.seasonDays + 1;
  const winter = rawFoodState();
  winter.day = CONFIG.time.seasonDays * 3 + 1;
  assert.ok(spoilage.spoilagePreview(winter).totalLoss < spoilage.spoilagePreview(summer).totalLoss,
    'winter cold slows natural spoilage');
}

{
  const state = rawFoodState();
  state.resources.grain = 77;
  state.resources.rice = 33;
  state.resources.salt = 12;
  const before = { fish: state.resources.fish, milk: state.resources.milk, meat: state.resources.meat, eggs: state.resources.eggs, vegetables: state.resources.vegetables };
  const report = spoilage.applyDailySpoilage(state);
  assert.equal(state.resources.fish, before.fish - report.items.fish.loss);
  assert.equal(state.resources.milk, before.milk - report.items.milk.loss);
  assert.equal(state.resources.meat, before.meat - report.items.meat.loss);
  assert.equal(state.resources.eggs, before.eggs - report.items.eggs.loss);
  assert.equal(state.resources.vegetables, before.vegetables - report.items.vegetables.loss);
  assert.equal(state.resources.grain, 77, 'dry grain does not spoil');
  assert.equal(state.resources.rice, 33, 'unmilled rice does not spoil');
  assert.equal(state.resources.salt, 12, 'salt does not spoil');
}

{
  const state = rawFoodState();
  const fishBefore = state.resources.fish;
  for (let i = 0; i < SUBTICKS - 1; i++) simulation.advanceTick(state);
  assert.equal(state.resources.fish, fishBefore, 'spoilage does not run on subticks');
  simulation.advanceTick(state);
  assert.ok(state.resources.fish < fishBefore, 'spoilage runs once at the daily boundary');
}

console.log('spoilage tests passed');
