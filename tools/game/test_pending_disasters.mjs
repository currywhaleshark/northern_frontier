import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-pending-disaster-tests-'));
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
const saveLoad = await import(pathToFileURL(join(compiledDir, 'saveLoad.mjs')).href);
const simulation = await import(pathToFileURL(join(compiledDir, 'simulation.mjs')).href);
const { CURRENT_SCHEMA_VERSION } = await import(pathToFileURL(join(compiledDir, 'saveSchema.mjs')).href);

function addStandingFarm(state, id = state.nextBuildingId++) {
  const farm = {
    id,
    type: 'field',
    x: 4,
    y: 4,
    built: true,
    progress: 1,
    fieldGrowth: 80,
    sownArea: 1,
    cropId: 'millet',
    inventory: {},
  };
  state.buildings.push(farm);
  return farm;
}

function advanceWeather(state, weather) {
  state.day += 1;
  state.weather = weather;
  disasters.advancePendingDisasters(state);
}

assert.equal(CURRENT_SCHEMA_VERSION, 44);
{
  const state = simulation.newGame(72001);
  assert.deepEqual(state.pendingDisasters, []);
  const migrated = saveLoad.migrateV43ToV44({ schemaVersion: 43, seed: 72001, day: 12 });
  assert.equal(migrated.schemaVersion, 44);
  assert.deepEqual(migrated.pendingDisasters, []);
}

{
  const normalized = disasters.normalizePendingDisasters([
    {
      id: 'earlyFrost',
      choiceId: 'wait-harvest',
      startedDay: 25,
      resolveDay: 29,
      targetBuildingIds: [4, 4, -1, 'bad'],
      progress: 1,
      data: { useful: 2, broken: 'nope' },
    },
    { id: 'unknown', choiceId: 'wait', startedDay: 1, resolveDay: 2 },
    { id: 'drought', choiceId: 'none', startedDay: 4, resolveDay: 3 },
  ]);
  assert.deepEqual(normalized, [{
    id: 'earlyFrost',
    choiceId: 'wait-harvest',
    startedDay: 25,
    resolveDay: 29,
    targetBuildingIds: [4],
    progress: 1,
    data: { useful: 2 },
  }]);
}

// 나흘 중 찬 날이 하루뿐이면 마지막 날까지 작물은 그대로이고 정상 수확으로 끝난다.
{
  const state = simulation.newGame(72002);
  state.day = 25;
  const farm = addStandingFarm(state);
  assert.equal(disasters.startEarlyFrostObservation(state, farm.id), true);
  assert.equal(disasters.startEarlyFrostObservation(state, farm.id), false, 'same disaster cannot be queued twice');
  advanceWeather(state, 'clear');
  advanceWeather(state, 'frost');
  advanceWeather(state, 'rain');
  assert.equal(state.pendingDisasters.length, 1);
  assert.equal(farm.fieldGrowth, 80, 'no outcome is applied before the fourth observed day');
  advanceWeather(state, 'clear');
  assert.equal(state.pendingDisasters.length, 0);
  assert.equal(farm.fieldGrowth, 80);
  assert.ok(state.log.some(entry => entry.text.includes('정상 수확')));
}

// 나흘 중 서리·혹한이 이틀 이상이면 네 번째 날에만 성장도의 25%를 남긴다.
{
  const state = simulation.newGame(72003);
  state.day = 25;
  const farm = addStandingFarm(state);
  disasters.startEarlyFrostObservation(state, farm.id);
  advanceWeather(state, 'frost');
  advanceWeather(state, 'clear');
  advanceWeather(state, 'coldSnap');
  assert.equal(farm.fieldGrowth, 80);
  advanceWeather(state, 'rain');
  assert.equal(farm.fieldGrowth, 20);
  assert.equal(state.pendingDisasters.length, 0);
  assert.ok(state.log.some(entry => entry.text.includes('2일이나 찬 기운')));
}

// 판정 전에 경작지를 철거해도 대기열이 고착되지 않는다.
{
  const state = simulation.newGame(72004);
  state.day = 25;
  const farm = addStandingFarm(state);
  disasters.startEarlyFrostObservation(state, farm.id);
  state.buildings = state.buildings.filter(building => building.id !== farm.id);
  for (const weather of ['frost', 'frost', 'frost', 'frost']) advanceWeather(state, weather);
  assert.deepEqual(state.pendingDisasters, []);
  assert.ok(state.log.some(entry => entry.text.includes('더는 거둘 작물이 없어')));
}

const simulationSource = readFileSync(new URL('../../src/game/simulation.ts', import.meta.url), 'utf8');
assert.match(
  simulationSource,
  /state\.weather = weatherForDay\(state\.seed, state\.day\);[\s\S]*advancePendingDisasters\(state\);/,
  'pending disasters advance after the deterministic weather for that day is known',
);

const rendererSource = readFileSync(new URL('../../src/render/renderer.ts', import.meta.url), 'utf8');
assert.ok(rendererSource.includes('drawEarlyFrostCropOverlay'));
assert.ok(rendererSource.includes("disaster.id === 'earlyFrost'"));

console.log('pending disaster tests passed');
