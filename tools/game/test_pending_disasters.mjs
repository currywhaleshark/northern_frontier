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
const agents = await import(pathToFileURL(join(compiledDir, 'agents.mjs')).href);
const buildings = await import(pathToFileURL(join(compiledDir, 'buildings.mjs')).href);
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

function addStandingPaddy(state, id = state.nextBuildingId++) {
  const farm = {
    id,
    type: 'paddy',
    x: 6,
    y: 4,
    built: true,
    progress: 1,
    fieldGrowth: 80,
    sownArea: 1,
    cropId: 'rice',
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

assert.equal(CURRENT_SCHEMA_VERSION, 55);
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

// 늦서리는 사흘을 관찰하며, 찬 날이 이틀에 못 미치면 봄 작물이 살아남는다.
{
  const state = simulation.newGame(72005);
  state.day = 8;
  const farm = addStandingFarm(state);
  assert.equal(disasters.lateFrostRecoveryCropId(farm), 'buckwheat');
  assert.equal(disasters.startLateFrostObservation(state, farm.id), true);
  assert.equal(disasters.startLateFrostObservation(state, farm.id), false, 'late frost cannot be queued twice');
  advanceWeather(state, 'frost');
  advanceWeather(state, 'clear');
  assert.equal(farm.fieldGrowth, 80);
  advanceWeather(state, 'rain');
  assert.equal(state.pendingDisasters.length, 0);
  assert.equal(farm.cropId, 'millet');
  assert.ok(state.log.some(entry => entry.text.includes('다시 기운을 차렸습니다')));
}

// 사흘 중 서리·혹한이 이틀이면 작물은 고사하고, 사용자가 여름 작물을 다시 고를 수 있게 비운다.
{
  const state = simulation.newGame(72006);
  state.day = 8;
  const farm = addStandingFarm(state);
  disasters.startLateFrostObservation(state, farm.id);
  advanceWeather(state, 'coldSnap');
  advanceWeather(state, 'clear');
  assert.equal(farm.fieldGrowth, 80);
  advanceWeather(state, 'frost');
  assert.equal(state.pendingDisasters.length, 0);
  assert.equal(farm.fieldGrowth, 0);
  assert.equal(farm.sownArea, 0);
  assert.equal(farm.cropId, null);
  assert.equal(farm.queuedCropId, null);
  assert.ok(state.log.some(entry => entry.text.includes('고사했습니다')));
}

{
  const state = simulation.newGame(72007);
  const paddy = addStandingPaddy(state);
  assert.equal(disasters.lateFrostRecoveryCropId(paddy), 'rice');
}

// 황충은 시작 다음 날부터 비공개 기간만큼 대상 경작지의 성장도를 매일 깎는다.
{
  const state = simulation.newGame(72008);
  state.day = 15;
  const field = addStandingFarm(state);
  const paddy = addStandingPaddy(state);
  assert.equal(disasters.startLocustInfestation(state, [field.id, paddy.id], 3), true);
  assert.equal(disasters.startLocustInfestation(state, [field.id], 3), false, 'only one locust swarm can persist');
  advanceWeather(state, 'clear');
  assert.equal(field.fieldGrowth, 68);
  assert.equal(paddy.fieldGrowth, 68);
  advanceWeather(state, 'rain');
  assert.equal(field.fieldGrowth, 56);
  advanceWeather(state, 'clear');
  assert.equal(state.pendingDisasters.length, 0);
  assert.equal(field.fieldGrowth, 44);
  assert.equal(paddy.fieldGrowth, 44);
  assert.ok(state.log.some(entry => entry.text.includes('황충 떼가 다른 들판으로 떠났습니다')));
}

// 성장도가 바닥난 경작지는 파종 칸을 비워 다음 작기를 준비한다.
{
  const state = simulation.newGame(72009);
  state.day = 15;
  const field = addStandingFarm(state);
  field.fieldGrowth = 15;
  assert.equal(disasters.startLocustInfestation(state, [field.id], 2), true);
  advanceWeather(state, 'clear');
  assert.equal(field.fieldGrowth, 3);
  advanceWeather(state, 'clear');
  assert.equal(field.fieldGrowth, 0);
  assert.equal(field.sownArea, 0);
  assert.equal(state.pendingDisasters.length, 0);
}

// 가뭄은 기간을 숨긴 채 생산 배율을 낮추고, 보 반경의 경작지만 피해가 완화된다.
{
  const state = simulation.newGame(72010);
  state.day = 15;
  const field = addStandingFarm(state);
  const paddy = addStandingPaddy(state);
  assert.equal(disasters.startDrought(state, 8), true);
  assert.equal(disasters.startDrought(state, 8), false, 'only one drought can persist');
  assert.equal(disasters.isDroughtActive(state), true);
  assert.equal(disasters.droughtFarmGrowthMultiplier(state, field), 0.45);
  assert.equal(disasters.droughtFishYieldMultiplier(state), 0.45);
  state.buildings.push({
    id: state.nextBuildingId++, type: 'weir', x: field.x + 6, y: field.y,
    built: true, progress: 6, fieldGrowth: 0,
  });
  assert.equal(disasters.isFarmIrrigatedByWeir(state, field), true);
  assert.equal(disasters.droughtFarmGrowthMultiplier(state, field), 0.72);
  assert.equal(disasters.isFarmIrrigatedByWeir(state, paddy), true);
}

// 비는 예정 종료일보다 먼저 가뭄을 풀며, 그날부터 생산 배율도 정상으로 돌아온다.
{
  const state = simulation.newGame(72011);
  state.day = 15;
  const field = addStandingFarm(state);
  disasters.startDrought(state, 12);
  advanceWeather(state, 'rain');
  assert.equal(disasters.isDroughtActive(state), false);
  assert.equal(disasters.droughtFarmGrowthMultiplier(state, field), 1);
  assert.equal(disasters.droughtFishYieldMultiplier(state), 1);
  assert.ok(state.log.some(entry => entry.text.includes('가뭄이 풀렸습니다')));
}

// 보는 강 위 단칸 시설이고 정착지 단계부터 건설할 수 있다.
{
  const state = simulation.newGame(72012);
  const river = state.map.flat().find(tile => tile.terrain === 'river' && tile.buildingId == null);
  const land = state.map.flat().find(tile => tile.terrain === 'plain' && tile.buildingId == null);
  assert.ok(river && land);
  assert.equal(buildings.BUILDING_DEFS.weir.minRank, undefined);
  assert.equal(buildings.buildingFootprintSize('weir'), 1);
  assert.equal(buildings.canPlaceBuildingAt(state, 'weir', river.x, river.y), true);
  assert.equal(buildings.canPlaceBuildingAt(state, 'weir', land.x, land.y), false);
  const weir = {
    id: state.nextBuildingId++, type: 'weir', x: river.x, y: river.y,
    built: true, progress: buildings.BUILDING_DEFS.weir.buildDays, fieldGrowth: 0,
  };
  state.buildings.push(weir);
  buildings.occupyBuildingTiles(state, weir);
  assert.equal(agents.isTerrainPassable(state, river.x, river.y), false, 'a weir is not a bridge');
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
assert.ok(rendererSource.includes("disaster.id === 'lateFrost'"));
assert.ok(rendererSource.includes('drawLocustCropOverlay'));
assert.ok(rendererSource.includes("disaster.id === 'locust'"));
assert.ok(rendererSource.includes('drawDroughtCropOverlay'));

const agentsSource = readFileSync(new URL('../../src/game/agents.ts', import.meta.url), 'utf8');
assert.ok(agentsSource.includes('droughtFarmGrowthMultiplier(state, target)'));
assert.ok(agentsSource.includes('droughtFishYieldMultiplier(state)'));

const buildPresentationSource = readFileSync(new URL('../../src/ui/buildPresentation.ts', import.meta.url), 'utf8');
assert.ok(buildPresentationSource.includes("weir: 'farming'"));

console.log('pending disaster tests passed');
