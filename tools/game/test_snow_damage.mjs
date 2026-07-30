import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-snow-damage-tests-'));
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
const disasters = await import(pathToFileURL(join(compiledDir, 'disasters.mjs')).href);
const raidDamage = await import(pathToFileURL(join(compiledDir, 'raidDamage.mjs')).href);
const simulation = await import(pathToFileURL(join(compiledDir, 'simulation.mjs')).href);
const weatherSchedule = await import(pathToFileURL(join(compiledDir, 'weatherSchedule.mjs')).href);
const { CONFIG } = await import(pathToFileURL(join(compiledDir, 'config.mjs')).href);

function snowRun() {
  for (let seed = 1; seed <= 2500; seed++) {
    const schedule = weatherSchedule.seasonWeatherSchedule(seed, 1, 'winter');
    for (let index = 1; index < schedule.length; index++) {
      const previous = schedule[index - 1];
      const current = schedule[index];
      if (['heavySnow', 'blizzard'].includes(previous) && ['heavySnow', 'blizzard'].includes(current)) {
        return { seed, day: 37 + index, weather: current };
      }
    }
  }
  return null;
}

function addResidence(state, type, x) {
  const building = {
    id: state.nextBuildingId++,
    type,
    x,
    y: 4,
    built: true,
    progress: 10,
    fieldGrowth: 0,
  };
  state.buildings.push(building);
  for (let dy = 0; dy < 2; dy++) {
    for (let dx = 0; dx < 2; dx++) state.map[building.y + dy][building.x + dx].buildingId = building.id;
  }
  return building;
}

const run = snowRun();
assert.ok(run, 'the deterministic winter weather table must contain a two-day snow run');

{
  const state = simulation.newGame(run.seed, 'normal', '설해촌');
  state.day = run.day;
  state.weather = run.weather;
  state.lastSnowDamageYear = 0;
  state.pendingDisasters = [];
  state.buildings = [];
  state.residents = [];
  state.nextBuildingId = 1;
  const hut = addResidence(state, 'hut', 2);
  const ondol = addResidence(state, 'ondol', 6);
  const tileHouse = addResidence(state, 'tileHouse', 10);

  const oldHutChance = CONFIG.disasters.snowDamage.hutCollapseChance;
  const oldOndolChance = CONFIG.disasters.snowDamage.ondolCollapseChance;
  CONFIG.disasters.snowDamage.hutCollapseChance = 1;
  CONFIG.disasters.snowDamage.ondolCollapseChance = 1;
  assert.equal(disasters.hasSnowDamageTriggerWeather(state), true);
  assert.equal(disasters.maybeStartSnowDamage(state), true);
  CONFIG.disasters.snowDamage.hutCollapseChance = oldHutChance;
  CONFIG.disasters.snowDamage.ondolCollapseChance = oldOndolChance;

  assert.equal(hut.repairing, true, 'huts must be vulnerable to snow damage');
  assert.equal(ondol.repairing, true, 'ondol homes must be damageable at their lower chance');
  assert.equal(hut.repairCause, 'snowDamage', 'snow damage repairs must retain their alert cause');
  assert.equal(ondol.repairCause, 'snowDamage', 'all damaged homes must retain the snow cause');
  assert.equal(raidDamage.buildingRepairCause(state, hut), 'snowDamage');
  assert.notEqual(tileHouse.repairing, true, 'tile houses must be immune to snow damage');
  assert.equal(state.pendingDisasters[0].id, 'snowDamage');
  assert.equal(state.pendingDisasters[0].targetBuildingIds.length, 2);
  assert.equal(state.lastSnowDamageYear, 1);
  assert.equal(disasters.maybeStartSnowDamage(state), false,
    'the same winter must not trigger snow damage twice');

  state.day += 1;
  disasters.advancePendingDisasters(state);
  assert.deepEqual(state.pendingDisasters, []);
}

{
  const state = simulation.newGame(992, 'normal', '구저장설해촌');
  const hut = state.buildings.find(building => building.type === 'hut');
  assert.ok(hut);
  hut.built = false;
  hut.repairing = true;
  delete hut.repairCause;
  state.pendingDisasters = [{
    id: 'snowDamage',
    choiceId: 'collapse',
    startedDay: state.day,
    resolveDay: state.day + 1,
    targetBuildingIds: [hut.id],
  }];
  assert.equal(raidDamage.buildingRepairCause(state, hut), 'snowDamage',
    'an active legacy snow disaster must not be mislabeled as raid damage');
}

{
  const state = simulation.newGame(991, 'normal', '맑은겨울');
  state.day = 38;
  state.weather = 'heavySnow';
  assert.equal(disasters.hasSnowDamageTriggerWeather(state), false,
    'a manually snowy day without a matching prior scheduled snow day must not trigger snow damage');
}

console.log('snow damage checks passed');
