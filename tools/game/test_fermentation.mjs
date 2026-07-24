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
const buildings = await import(pathToFileURL(join(compiledDir, 'buildings.mjs')).href);
const fermentation = await import(pathToFileURL(join(compiledDir, 'fermentation.mjs')).href);
const kimjang = await import(pathToFileURL(join(compiledDir, 'kimjang.mjs')).href);
const catalog = await import(pathToFileURL(join(compiledDir, 'resourceCatalog.mjs')).href);
const spoilage = await import(pathToFileURL(join(compiledDir, 'spoilage.mjs')).href);
const { CONFIG } = await import(pathToFileURL(join(compiledDir, 'config.mjs')).href);

function prepare(seed) {
  const state = simulation.newGame(seed);
  for (const row of state.map) {
    for (const tile of row) {
      tile.terrain = 'plain';
      tile.hasIron = false;
      tile.buildingId = null;
    }
  }
  state.buildings = [];
  state.foreignSites = [];
  state.claimZones = [];
  state.exploration = { explored: state.map.map(row => row.map(() => true)) };
  for (const resource of catalog.RESOURCE_IDS) state.resources[resource] = 0;
  for (const resident of state.residents) resident.alive = false;
  state.rank = 'bo';
  state.weather = 'clear';
  state.pendingChoice = null;
  state.gameOver = null;
  addBuilt(state, 'center', 2, 2);
  addBuilt(state, 'storehouse', 7, 2);
  return state;
}

function addBuilt(state, type, x, y, inventory = {}) {
  const building = {
    id: state.nextBuildingId++, type, x, y,
    progress: buildings.BUILDING_DEFS[type].buildDays,
    built: true, fieldGrowth: 0, inventory,
  };
  if (type === 'jangdokdae') building.fermentBatches = [];
  state.buildings.push(building);
  buildings.occupyBuildingTiles(state, building);
  return building;
}

function worker(state, index, job, x, y) {
  const resident = state.residents[index];
  Object.assign(resident, {
    alive: true, sick: false, health: 100, hunger: 100, warmth: 100, morale: 70,
    job, assignedBuildingId: null, x, y, px: x, py: y, phase: 'rest', path: [],
    workTimer: 0, targetId: null, carrying: {}, haulTask: null, manualOrder: null, skills: {},
  });
  return resident;
}

function runUntil(
  state,
  predicate,
  maxTicks = Math.ceil(100 * CONFIG.agents.subticksPerDay / 8),
) {
  for (let tick = 0; tick < maxTicks && !predicate(); tick++) {
    simulation.advanceTick(state);
  }
  const workerState = state.residents.find(resident => resident.alive);
  assert.ok(predicate(), `condition was not reached within ${maxTicks} ticks: ${JSON.stringify({
    day: state.day,
    subTick: state.subTick,
    pendingChoice: state.pendingChoice?.kind ?? null,
    gameOver: state.gameOver,
    jang: state.resources.jang,
    onggi: state.resources.onggi,
    yard: state.buildings.find(building => building.type === 'jangdokdae')?.inventory,
    worker: workerState && {
      x: workerState.x,
      y: workerState.y,
      phase: workerState.phase,
      task: workerState.task,
      carrying: workerState.carrying,
      haulTask: workerState.haulTask,
    },
  })}`);
}

{
  assert.equal(buildings.BUILDING_DEFS.jangdokdae.placement, 'land');
  assert.equal(buildings.BUILDING_DEFS.jangdokdae.slots, 0);
  assert.equal(buildings.BUILDING_DEFS.jangdokdae.minRank, 'bo');
  assert.equal(buildings.buildingFootprintSize('jangdokdae'), 2, 'the jar yard uses a 2x2 courtyard footprint');
  assert.equal(catalog.RESOURCE_DEFS.jang.category, 'food');
  assert.equal(catalog.RESOURCE_DEFS.kimchi.category, 'food');
  assert.ok(catalog.RESOURCE_DEFS.jang.tradeBaseValue > catalog.RESOURCE_DEFS.beans.tradeBaseValue);
  assert.equal(fermentation.isJangBrewingWindow(30), false, 'autumn day 6 is too early');
  assert.equal(fermentation.isJangBrewingWindow(31), true, 'autumn day 7 opens the brewing window');
  assert.equal(fermentation.isJangBrewingWindow(40), true, 'winter day 4 remains in the brewing window');
  assert.equal(fermentation.isJangBrewingWindow(41), false, 'winter day 5 closes the brewing window');
  assert.equal(kimjang.isKimjangWindow(33), false, 'autumn day 9 is before kimjang');
  assert.equal(kimjang.isKimjangWindow(34), true, 'autumn day 10 opens kimjang');
  assert.equal(kimjang.isKimjangWindow(38), true, 'winter day 2 remains near ipdong');
  assert.equal(kimjang.isKimjangWindow(39), false, 'winter day 3 closes kimjang');
}

// 장은 숙성을 마친 보존식이라 계절과 관계없이 부패하지 않는다.
{
  const state = prepare(2026071615);
  state.resources.jang = 10;
  spoilage.applyDailySpoilage(state);
  assert.equal(state.resources.jang, 10);
  state.resources.kimchi = 10;
  spoilage.applyDailySpoilage(state);
  assert.equal(state.resources.kimchi, 10);
}

// 김장 결정 전에는 장 생산이 장독대마다 두 칸을 남긴다.
{
  const state = prepare(2026071702);
  state.day = 31;
  const yard = addBuilt(state, 'jangdokdae', 10, 2, { beans: 16, salt: 4, onggi: 4 });

  fermentation.updateFermentation(state);

  assert.deepEqual(yard.fermentBatches, [{ kind: 'jang', amount: 8, readyOnDay: 55 }]);
  assert.equal(fermentation.freeJangBrewingOnggiCapacity(state, yard), 0);
  assert.equal(fermentation.freeJangdokdaeOnggiCapacity(yard), 2, 'two shared slots remain available for kimjang');
}

// 재료와 장독대가 없으면 모든 규모가 잠기고 정확한 부족 사유가 보인다.
{
  const state = prepare(2026071703);
  state.day = 34;

  assert.equal(kimjang.maybeOpenKimjangEvent(state), true);
  const small = state.pendingChoice.options.find(option => option.id === 'kimjang-small');
  assert.equal(small.disabled, true);
  assert.match(small.disabledReason, /채소 0\/6/);
  assert.match(small.disabledReason, /소금 0\/1/);
  assert.match(small.disabledReason, /옹기 0\/1/);
  assert.match(small.disabledReason, /장독대 빈자리 0\/1/);
  assert.equal(state.pendingChoice.options.find(option => option.id === 'kimjang-skip').disabled, false);
}

// 큰 김장은 여러 장독대의 빈자리에 나뉘어 들어가며 해마다 한 번만 열린다.
{
  const state = prepare(2026071704);
  state.day = 34;
  Object.assign(state.resources, { vegetables: 24, salt: 4, onggi: 4 });
  const first = addBuilt(state, 'jangdokdae', 10, 2);
  first.fermentBatches = [{ kind: 'jang', amount: 8, readyOnDay: 55 }];
  const second = addBuilt(state, 'jangdokdae', 13, 2);

  assert.equal(kimjang.maybeOpenKimjangEvent(state), true);
  assert.equal(state.pendingChoice.options.find(option => option.id === 'kimjang-large').disabled, false);
  kimjang.resolveKimjangChoice(state, 'kimjang-large');

  assert.deepEqual(first.fermentBatches.at(-1), { kind: 'kimchi', amount: 12, readyOnDay: 38 });
  assert.deepEqual(second.fermentBatches, [{ kind: 'kimchi', amount: 12, readyOnDay: 38 }]);
  assert.equal(state.resources.vegetables, 0);
  assert.equal(state.resources.salt, 0);
  assert.equal(state.resources.onggi, 0);
  assert.equal(kimjang.maybeOpenKimjangEvent(state), false, 'the same year never opens a second kimjang event');
}

// 김치가 익으면 완성품·재사용 옹기가 생기고 규모 비례 공동 작업 사기가 오른다.
{
  const state = prepare(2026071705);
  state.day = 38;
  const resident = worker(state, 0, 'idle', 10, 2);
  resident.morale = 50;
  const yard = addBuilt(state, 'jangdokdae', 10, 2);
  yard.fermentBatches = [{ kind: 'kimchi', amount: 12, readyOnDay: 38 }];

  const report = fermentation.updateFermentation(state);

  assert.equal(report.completedKimchi, 12);
  assert.equal(yard.inventory.kimchi, 12);
  assert.equal(yard.inventory.onggi, 1.8);
  assert.equal(resident.morale, 53);
}

// 옹기가 없으면 콩과 소금이 있어도 배치를 만들지 않는다.
{
  const state = prepare(2026071611);
  state.day = 31;
  const yard = addBuilt(state, 'jangdokdae', 10, 2, { beans: 8, salt: 2 });

  fermentation.updateFermentation(state);

  assert.equal(yard.fermentBatches.length, 0);
  assert.equal(yard.inventory.beans, 8);
  assert.equal(yard.inventory.salt, 2);
}

// 장 배치는 절대일로 숙성하고 완성품과 파손분을 뺀 옹기를 현장 재고로 돌려놓는다.
{
  const state = prepare(2026071612);
  state.day = 31;
  const yard = addBuilt(state, 'jangdokdae', 10, 2, { beans: 8, salt: 2, onggi: 2 });

  fermentation.updateFermentation(state);

  assert.deepEqual(yard.fermentBatches, [{ kind: 'jang', amount: 8, readyOnDay: 55 }]);
  assert.equal(yard.inventory.beans, 0);
  assert.equal(yard.inventory.salt, 0);
  assert.equal(yard.inventory.onggi, 0);

  state.day = 54;
  fermentation.updateFermentation(state);
  assert.equal(yard.inventory.jang ?? 0, 0);

  state.day = 55;
  fermentation.updateFermentation(state);
  assert.equal(yard.fermentBatches.length, 0);
  assert.equal(yard.inventory.jang, 8);
  assert.equal(yard.inventory.onggi, 1.8);
}

// 늦가을에는 운반꾼이 창고의 콩·소금·옹기를 장독대에 채워 배치를 성립시킨다.
{
  const state = prepare(2026071613);
  state.day = 31;
  Object.assign(state.resources, { grain: 100, beans: 8, salt: 2, onggi: 2, stone: 40 });
  const yard = addBuilt(state, 'jangdokdae', 10, 2);
  worker(state, 0, 'hauler', 6, 2);

  runUntil(state, () => (yard.fermentBatches?.length ?? 0) > 0);

  assert.equal(yard.fermentBatches[0].kind, 'jang');
  assert.ok(state.resources.beans < 8);
  assert.ok(state.resources.salt < 2);
  assert.ok(state.resources.onggi < 2);
}

// 숙성철이 지나면 운반꾼은 완성된 장과 회수된 옹기를 창고로 가져간다.
{
  const state = prepare(2026071616);
  state.day = 55;
  Object.assign(state.resources, { grain: 100, stone: 40 });
  const yard = addBuilt(state, 'jangdokdae', 10, 2, { jang: 8, onggi: 1.8 });
  worker(state, 0, 'hauler', 9, 1);

  runUntil(state, () => state.resources.jang > 0 && state.resources.onggi > 0);

  assert.equal(yard.inventory.jang, 0);
  assert.equal(yard.inventory.onggi, 0);
}

// 익은 김치는 장 담그기 기간 중에도 운반되어 다음 식사부터 쓸 수 있다.
{
  const state = prepare(2026071706);
  state.day = 39;
  Object.assign(state.resources, { grain: 100, stone: 40 });
  const yard = addBuilt(state, 'jangdokdae', 10, 2, { kimchi: 12 });
  worker(state, 0, 'hauler', 9, 1);

  runUntil(state, () => state.resources.kimchi > 0, 200);

  assert.ok(yard.inventory.kimchi < 12, 'the first adjusted hauler load leaves the yard');
  assert.ok(yard.inventory.kimchi < CONFIG.agents.haulerBatchMin,
    'a sub-batch remainder may wait for the next finished batch');
  assert.ok(state.resources.kimchi > 0, 'transported kimchi reaches settlement meals');
}

// 장독대의 배치와 현장 재고는 전역 약탈 풀과 분리된다.
{
  const state = prepare(2026071614);
  const yard = addBuilt(state, 'jangdokdae', 10, 2, { jang: 5 });
  yard.fermentBatches = [{ kind: 'jang', amount: 4, readyOnDay: 80 }];
  assert.equal(fermentation.isRaidProtectedFermentationBuilding(yard), true);
  assert.equal(state.resources.jang, 0);
}

console.log('fermentation tests passed');
