import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-kimjang-balance-'));
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
const fermentation = await load('fermentation');
const consumption = await load('consumption');
const residents = await load('residents');
const catalog = await load('resourceCatalog');
const buildings = await load('buildings');
const { CONFIG } = await load('config');

function prepare(seed, withKimchi) {
  const state = simulation.newGame(seed);
  state.day = 37;
  state.weather = 'clear';
  state.pendingChoice = null;
  state.gameOver = null;
  for (const resource of catalog.RESOURCE_IDS) state.resources[resource] = 0;
  state.resources.grain = withKimchi ? 72 : 84;
  state.resources.herbs = 100;
  for (const resident of state.residents) {
    Object.assign(resident, {
      alive: true,
      sick: false,
      health: 70,
      morale: 50,
      hunger: 100,
      warmth: 60,
      job: 'idle',
      quarantinedUntil: 0,
    });
  }

  if (withKimchi) {
    const yard = {
      id: state.nextBuildingId++,
      type: 'jangdokdae',
      x: 0,
      y: 0,
      progress: buildings.BUILDING_DEFS.jangdokdae.buildDays,
      built: true,
      fieldGrowth: 0,
      inventory: {},
      fermentBatches: [{ kind: 'kimchi', amount: 12, readyOnDay: 37 }],
    };
    state.buildings.push(yard);
    fermentation.updateFermentation(state);
    state.resources.kimchi = yard.inventory.kimchi;
    yard.inventory.kimchi = 0;
  }
  return state;
}

function runWinter(seed, withKimchi) {
  const state = prepare(seed, withKimchi);
  const completionMorale = residents.avg(state, 'morale');
  let healthTotal = 0;
  let moraleTotal = 0;
  const vegetableRatios = [];
  for (let day = 0; day < CONFIG.time.seasonDays; day++) {
    const population = residents.livingResidents(state).length;
    const foodNeed = population * CONFIG.needs.foodPerDay;
    const meal = consumption.consumeFoodByDiet(state, foodNeed);
    vegetableRatios.push(meal.vegetableRatio);
    residents.updateResidentNeeds(
      state,
      () => 0.5,
      meal.shortageRatio,
      1,
      1,
      meal.varietyScore,
      meal.vegetableRatio,
    );
    residents.updateMorale(state, {
      foodOk: consumption.foodTotal(state) > population * CONFIG.needs.foodPerDay * 6,
      warmthAvg: residents.avg(state, 'warmth'),
      dietVarietyScore: meal.varietyScore,
      clothesCoverage: 1,
    });
    healthTotal += residents.avg(state, 'health');
    moraleTotal += residents.avg(state, 'morale');
    state.day++;
  }
  return {
    completionMorale,
    meanHealth: healthTotal / CONFIG.time.seasonDays,
    meanMorale: moraleTotal / CONFIG.time.seasonDays,
    finalHealth: residents.avg(state, 'health'),
    finalMorale: residents.avg(state, 'morale'),
    living: residents.livingResidents(state).length,
    vegetableDays: vegetableRatios.filter(ratio => ratio >= 0.5).length,
  };
}

const pairs = Array.from({ length: 8 }, (_, index) => {
  const seed = 2026071700 + index;
  return { seed, withKimchi: runWinter(seed, true), withoutKimchi: runWinter(seed, false) };
});
const average = (selector) => pairs.reduce((sum, pair) => sum + selector(pair), 0) / pairs.length;
const report = {
  runs: pairs.length,
  withKimchi: {
    meanHealth: average(pair => pair.withKimchi.meanHealth),
    finalHealth: average(pair => pair.withKimchi.finalHealth),
    meanMorale: average(pair => pair.withKimchi.meanMorale),
    completionMorale: average(pair => pair.withKimchi.completionMorale),
    vegetableDays: average(pair => pair.withKimchi.vegetableDays),
    survivalRate: average(pair => pair.withKimchi.living === 12 ? 1 : 0),
  },
  withoutKimchi: {
    meanHealth: average(pair => pair.withoutKimchi.meanHealth),
    finalHealth: average(pair => pair.withoutKimchi.finalHealth),
    meanMorale: average(pair => pair.withoutKimchi.meanMorale),
    completionMorale: average(pair => pair.withoutKimchi.completionMorale),
    vegetableDays: average(pair => pair.withoutKimchi.vegetableDays),
    survivalRate: average(pair => pair.withoutKimchi.living === 12 ? 1 : 0),
  },
};

assert.equal(report.withKimchi.survivalRate, 1);
assert.equal(report.withoutKimchi.survivalRate, 1, 'no-kimchi winter remains survivable');
assert.ok(report.withKimchi.vegetableDays >= 10, 'medium kimjang covers most winter vegetable days');
assert.equal(report.withoutKimchi.vegetableDays, 0);
assert.ok(report.withKimchi.meanHealth - report.withoutKimchi.meanHealth >= 4,
  'kimchi creates a noticeable winter health gap at equal calories');
assert.equal(
  report.withKimchi.completionMorale - report.withoutKimchi.completionMorale,
  CONFIG.fermentation.kimjangMoralePerOnggi * 2,
  'medium kimjang grants its configured community-work morale boost',
);

console.log(JSON.stringify(report, null, 2));
console.log('kimjang balance tests passed');
