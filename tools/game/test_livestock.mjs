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

function addStable(
  state,
  headcount = CONFIG.livestock.chicken.initialHeadcount,
  species = 'chicken',
) {
  const stable = {
    id: state.nextBuildingId++, type: 'stable', x: 4, y: 4,
    progress: 9, built: true, fieldGrowth: 0,
    livestock: livestock.createLivestockState(species, headcount),
  };
  state.buildings.push(stable);
  return stable;
}

{
  const state = simulation.newGame(2026071701);
  assert.deepEqual(state.unlockedLivestock, ['chicken'], 'new settlements begin with chickens unlocked');
  assert.equal(state.resources.eggs, 0, 'eggs are initialized as a first-class stock resource');
  assert.equal(state.resources.milk, 0, 'milk is initialized as a first-class food resource');
  assert.equal(state.resources.wool, 0, 'wool is initialized as a first-class material resource');
  assert.equal(state.resources.hay, 0, 'hay is initialized as a first-class winter-feed resource');
  assert.deepEqual(livestock.IMPLEMENTED_LIVESTOCK_IDS, ['chicken', 'goat', 'sheep', 'cattle']);
  assert.deepEqual(livestock.createDefaultLivestockState(), {
    species: 'chicken', headcount: 4, growth: 0, feedShortageDays: 0,
  });
}

{
  assert.deepEqual(livestock.createLivestockState('goat', 99), {
    species: 'goat', headcount: CONFIG.livestock.goat.capacity, growth: 0, feedShortageDays: 0,
  }, 'species-specific stable capacity is enforced');
  assert.equal(livestock.livestockCapacity('sheep'), CONFIG.livestock.sheep.capacity);
  assert.equal(livestock.livestockCapacity('cattle'), CONFIG.livestock.cattle.capacity);
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
  const state = simulation.newGame(2026071710);
  state.resources.hay = 0;
  const stable = addStable(state, 2, 'goat');
  const report = livestock.updateLivestock(state);
  assert.equal(report.hayConsumed, 0, 'herbivores graze without consuming hay outside winter');
  assert.equal(stable.livestock.feedShortageDays, 0);
  assert.equal(stable.livestock.growth, 2 * CONFIG.livestock.goat.breedingPerHeadPerDay);
}

{
  const state = simulation.newGame(2026071711);
  state.day = CONFIG.time.seasonDays * 3 + 1;
  state.resources.hay = 10;
  const stable = addStable(state, 2, 'sheep');
  const report = livestock.updateLivestock(state);
  const expected = 2 * CONFIG.livestock.sheep.feedPerHeadPerDay;
  assert.equal(report.hayConsumed, expected, 'herbivores consume hay in winter');
  assert.equal(state.resources.hay, 10 - expected);
  assert.equal(stable.livestock.feedShortageDays, 0);
}

{
  const state = simulation.newGame(2026071712);
  state.day = CONFIG.time.seasonDays * 3 + 1;
  state.resources.hay = 0;
  const stable = addStable(state, 3, 'cattle');
  stable.livestock.growth = 0.8;
  for (let day = 0; day < CONFIG.livestock.cattle.shortageGraceDays +
      CONFIG.livestock.cattle.starvationLossIntervalDays; day++) {
    livestock.updateLivestock(state);
  }
  assert.equal(stable.livestock.headcount, 2, 'winter hay shortages eventually kill herbivores');
  assert.equal(stable.livestock.growth, 0);
}

{
  const goat = livestock.livestockProductForHerder(
    livestock.createLivestockState('goat', 3), 'spring', 1,
  );
  const sheepSpring = livestock.livestockProductForHerder(
    livestock.createLivestockState('sheep', 3), 'spring', 1,
  );
  const sheepWinter = livestock.livestockProductForHerder(
    livestock.createLivestockState('sheep', 3), 'winter', 1,
  );
  const cattle = livestock.livestockProductForHerder(
    livestock.createLivestockState('cattle', 2), 'summer', 1,
  );
  assert.equal(goat?.resource, 'milk');
  assert.ok(goat.amount > 0);
  assert.equal(sheepSpring?.resource, 'wool');
  assert.ok(sheepSpring.amount > sheepWinter.amount, 'winter shearing produces less wool than spring');
  assert.equal(cattle?.resource, 'milk');
}

{
  const state = simulation.newGame(2026071713);
  const emptyStable = addStable(state, 0);
  state.unlockedLivestock.push('goat');
  assert.equal(livestock.setStableLivestock(state, emptyStable.id, 'goat'), null);
  assert.equal(emptyStable.livestock.species, 'goat', 'empty unlocked stables can switch species');

  const result = livestock.acquireLivestock(state, 'goat', 2, emptyStable.id);
  assert.equal(result, null);
  assert.equal(emptyStable.livestock.headcount, 2);
}

{
  const state = simulation.newGame(2026071714);
  const stable = addStable(state, 2, 'sheep');
  assert.equal(livestock.slaughterStableLivestock(state, stable.id, 1), null);
  assert.equal(stable.inventory.meat, CONFIG.livestock.sheep.slaughterMeatPerHead);
  assert.equal(stable.inventory.hide, CONFIG.livestock.sheep.slaughterHidePerHead);
}

{
  const state = simulation.newGame(2026071715);
  assert.equal(livestock.cattleFarmWorkMultiplier(state), 1);
  for (let index = 0; index < 6; index++) addStable(state, 1, 'cattle');
  assert.equal(
    livestock.cattleFarmWorkMultiplier(state),
    1 + CONFIG.livestock.cattleFarmWorkMaxBonus,
    'the cattle draft-work bonus is capped',
  );
  assert.equal(
    livestock.hayFromHarvestProgress(100),
    100 * CONFIG.livestock.hayPerHarvestProgress,
    'an autumn grain harvest converts stubble progress into hay',
  );
  assert.ok(Math.abs(
    livestock.settlementLivestockWinterHayNeed(state) -
    6 * CONFIG.livestock.cattle.feedPerHeadPerDay * CONFIG.time.seasonDays,
  ) < 1e-9);
}

{
  const state = simulation.newGame(2026071717);
  const goats = addStable(state, 4, 'goat');
  const sheep = addStable(state, 4, 'sheep');
  const report = livestock.lootLivestock(state, 0.25);
  assert.equal(report.lost, 2);
  assert.equal(goats.livestock.headcount + sheep.livestock.headcount, 6);
  assert.ok(state.log.some(entry => entry.text.includes('축사를 털어')));
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
