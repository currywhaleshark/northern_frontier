import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-livestock-tests-'));
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
const livestock = await load('livestock');
const { CONFIG } = await load('config');

function addStable(state, headcount = CONFIG.livestock.chicken.initialHeadcount) {
  const stable = {
    id: state.nextBuildingId++, type: 'stable', x: 4, y: 4,
    progress: 9, built: true, fieldGrowth: 0,
    livestock: livestock.createDefaultLivestockState(headcount),
  };
  state.buildings.push(stable);
  return stable;
}

{
  const state = simulation.newGame(2026071701);
  assert.deepEqual(state.unlockedLivestock, ['chicken'], 'new settlements begin with chickens unlocked');
  assert.equal(state.resources.eggs, 0, 'eggs are initialized as a first-class stock resource');
  assert.deepEqual(livestock.createDefaultLivestockState(), {
    species: 'chicken', headcount: 4, growth: 0, feedShortageDays: 0,
  });
}

{
  const state = simulation.newGame(2026071702);
  state.resources.grain = 10;
  const stable = addStable(state, 4);
  const before = state.resources.grain;
  const report = livestock.updateLivestock(state);
  assert.equal(report.grainConsumed, 4 * CONFIG.livestock.chicken.grainPerHeadPerDay);
  assert.equal(state.resources.grain, before - report.grainConsumed);
  assert.equal(stable.livestock.growth, 4 * CONFIG.livestock.chicken.breedingPerHeadPerDay);
  assert.equal(stable.livestock.feedShortageDays, 0);
}

{
  const state = simulation.newGame(2026071703);
  state.resources.grain = 100;
  const stable = addStable(state, 4);
  stable.livestock.growth = 0.95;
  const report = livestock.updateLivestock(state);
  assert.equal(report.births, 1);
  assert.equal(stable.livestock.headcount, 5);
  assert.ok(Math.abs(stable.livestock.growth - 0.05) < 1e-9);

  for (let day = 0; day < 80; day++) livestock.updateLivestock(state);
  assert.equal(stable.livestock.headcount, CONFIG.livestock.chicken.capacity,
    'a fully fed flock reaches but never exceeds stable capacity');
  assert.equal(stable.livestock.growth, 0, 'breeding progress stops at capacity');
}

{
  const state = simulation.newGame(2026071704);
  state.resources.grain = 0;
  const stable = addStable(state, 4);
  stable.livestock.growth = 0.7;
  for (let day = 0; day < CONFIG.livestock.chicken.shortageGraceDays + 1; day++) {
    livestock.updateLivestock(state);
  }
  assert.equal(stable.livestock.headcount, 4, 'three grace days and the first overdue day cause no loss');
  assert.equal(stable.livestock.growth, 0, 'breeding stops immediately when feed is short');
  livestock.updateLivestock(state);
  assert.equal(stable.livestock.headcount, 3, 'one chicken dies every two days after the grace period');
  assert.ok(state.log.some(entry => entry.text.includes('먹이가 모자라')));
}

{
  const state = simulation.newGame(2026071705);
  const stable = addStable(state, 4);
  assert.equal(simulation.slaughterLivestock(state, stable.id, 1), null);
  assert.equal(stable.livestock.headcount, 3);
  assert.equal(stable.inventory.meat, CONFIG.livestock.chicken.slaughterMeatPerHead);
  assert.match(simulation.slaughterLivestock(state, stable.id, 9), /부족/);
  assert.equal(stable.livestock.headcount, 3, 'failed slaughter requests do not mutate the flock');
}

assert.ok(CONFIG.livestock.chicken.eggSeasonMult.winter < CONFIG.livestock.chicken.eggSeasonMult.spring,
  'winter lowers egg production');

console.log('livestock tests passed');
