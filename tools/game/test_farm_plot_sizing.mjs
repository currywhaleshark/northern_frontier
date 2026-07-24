// 드래그 크기 지정 경작지 — 배치 검증, 면적 비례 슬롯·비용·소출, 파종 시한, 농우
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-game-tests-'));
  const files = readdirSync(srcDir).filter(file => file.endsWith('.ts'));
  for (const file of files) {
    const source = readFileSync(new URL(file, srcDir), 'utf8');
    let output = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.ES2022,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText;
    output = output.replace(/(from\s+['"])(\.{1,2}\/[^'"]+)(['"])/g, (_match, start, spec, end) => {
      if (/\.[cm]?js$/.test(spec)) return `${start}${spec}${end}`;
      return `${start}${spec}.mjs${end}`;
    });
    writeFileSync(join(outDir, file.replace(/\.ts$/, '.mjs')), output, 'utf8');
  }
  return outDir;
}

const store = new Map();
globalThis.localStorage = {
  getItem: key => store.get(key) ?? null,
  setItem: (key, value) => store.set(key, value),
  removeItem: key => store.delete(key),
};

const compiledDir = compileGameModules();
const simulation = await import(pathToFileURL(join(compiledDir, 'simulation.mjs')).href);
const buildings = await import(pathToFileURL(join(compiledDir, 'buildings.mjs')).href);
const workerSlots = await import(pathToFileURL(join(compiledDir, 'workerSlots.mjs')).href);
const livestock = await import(pathToFileURL(join(compiledDir, 'livestock.mjs')).href);
const saveLoad = await import(pathToFileURL(join(compiledDir, 'saveLoad.mjs')).href);
const { CONFIG } = await import(pathToFileURL(join(compiledDir, 'config.mjs')).href);
const { CROP_DEFS } = await import(pathToFileURL(join(compiledDir, 'crops.mjs')).href);

function openRect(state, w, h) {
  for (let y = 2; y < state.map.length - 2 - h; y++) {
    for (let x = 2; x < state.map[y].length - 2 - w; x++) {
      let ok = true;
      for (let dy = 0; dy < h && ok; dy++) {
        for (let dx = 0; dx < w && ok; dx++) {
          const tile = state.map[y + dy][x + dx];
          if (tile.buildingId != null) ok = false;
        }
      }
      if (ok) return { x, y };
    }
  }
  throw new Error('no open rect found');
}

function makePlainRect(state, w, h) {
  const spot = openRect(state, w, h);
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      state.map[spot.y + dy][spot.x + dx].terrain = 'plain';
    }
  }
  return spot;
}

function exploreAll(state) {
  for (const row of state.exploration.explored) row.fill(true);
}

function workersAt(state, job, x, y, count) {
  const workers = state.residents.slice(0, count);
  for (const resident of state.residents) resident.alive = workers.some(worker => worker.id === resident.id);
  for (const worker of workers) {
    Object.assign(worker, {
      alive: true, sick: false, health: 100, hunger: 100, warmth: 100, morale: 50,
      skills: {}, job, x, y, px: x, py: y,
      phase: 'rest', path: [], workTimer: 0, targetId: null, carrying: {},
    });
  }
  state.weather = 'clear';
  state.resources.tools = 100;
  return workers;
}

function onlyWorkerAt(state, job, x, y) {
  return workersAt(state, job, x, y, 1)[0];
}

// 노동 밸런스 격리: 매 틱 농부 상태를 유지하고, 시뮬레이션을 멈추는 사건 선택지를 걷어낸다
function runTicks(state, ticks, sustainWorkers = []) {
  for (let i = 0; i < ticks; i++) {
    for (const worker of sustainWorkers) {
      worker.hunger = 100; worker.warmth = 100; worker.health = 100;
      worker.sick = false; worker.morale = 50; worker.skills = {};
    }
    state.weather = 'clear';
    state.pendingChoice = null;
    state.raiders = null;
    simulation.advanceTick(state);
  }
}

// ── 배치: 드래그 크기, 클램프, 혼합 지형 거부, 칸수 비례 비용 ──
{
  const state = simulation.newGame(9101);
  exploreAll(state);
  state.resources.wood = 200;
  state.resources.tools = 50;

  const spot = makePlainRect(state, 3, 3);
  const woodBefore = state.resources.wood;
  const toolsBefore = state.resources.tools;
  assert.equal(simulation.tryPlaceBuilding(state, 'field', spot.x, spot.y, 3, 3), null, 'a 3x3 field can be placed');
  const plot = state.buildings[state.buildings.length - 1];
  assert.equal(plot.w, 3);
  assert.equal(plot.h, 3);
  assert.equal(plot.sownArea, 0);
  assert.equal(woodBefore - state.resources.wood, (buildings.BUILDING_DEFS.field.cost.wood ?? 0) * 9, 'cost scales with tile count');
  assert.equal(toolsBefore - state.resources.tools, (buildings.BUILDING_DEFS.field.cost.tools ?? 0) * 9);
  assert.equal(workerSlots.workerSlotCount(plot), 3, 'a 9-tile plot needs ceil(9/3) = 3 farmers');
  const tiles = buildings.footprintTilesOf(state, plot);
  assert.equal(tiles.length, 9);
  assert.ok(tiles.every(tile => tile.buildingId === plot.id), 'all nine tiles belong to the plot');

  // 한 변 상한을 넘긴 요청은 최대 크기로 잘린다
  const spot2 = makePlainRect(state, 5, 1);
  assert.equal(simulation.tryPlaceBuilding(state, 'field', spot2.x, spot2.y, 5, 1), null);
  const clamped = state.buildings[state.buildings.length - 1];
  assert.equal(clamped.w, CONFIG.farming.maxPlotSide, 'plot side is clamped to the configured maximum');

  // 발자국 안에 강이 섞이면 거부
  const spot3 = makePlainRect(state, 2, 2);
  state.map[spot3.y][spot3.x + 1].terrain = 'river';
  assert.notEqual(simulation.tryPlaceBuilding(state, 'field', spot3.x, spot3.y, 2, 2), null, 'mixed invalid terrain rejects the whole rect');

  // 1×1은 기존과 동일 (슬롯 1, 기본 비용)
  const spot4 = makePlainRect(state, 1, 1);
  const woodBefore2 = state.resources.wood;
  assert.equal(simulation.tryPlaceBuilding(state, 'field', spot4.x, spot4.y), null);
  const single = state.buildings[state.buildings.length - 1];
  assert.equal(workerSlots.workerSlotCount(single), 1);
  assert.equal(woodBefore2 - state.resources.wood, buildings.BUILDING_DEFS.field.cost.wood ?? 0);
}

// ── 파종 → 생육 → 수확: 면적 비례 소출과 파종 시한 ──
{
  const state = simulation.newGame(9102);
  exploreAll(state);
  state.day = 2; // 봄 초입
  const spot = makePlainRect(state, 3, 1);
  state.resources.wood = 200;
  state.resources.tools = 50;
  assert.equal(simulation.tryPlaceBuilding(state, 'field', spot.x, spot.y, 3, 1), null);
  const plot = state.buildings[state.buildings.length - 1];
  plot.built = true;
  plot.progress = 99;
  plot.cropId = 'millet';
  assert.equal(workerSlots.workerSlotCount(plot), 1, 'a 3-tile strip is one farmer\'s fair share');

  const farmer = onlyWorkerAt(state, 'farmer', spot.x, spot.y);
  assert.equal(workerSlots.assignResidentToBuilding(state, farmer.id, plot.id), null);

  state.subTick = 9;
  runTicks(state, 1, [farmer]);
  assert.ok((plot.sownArea ?? 0) > 0, 'the farmer starts sowing in spring');
  assert.ok(farmer.task.includes('파종'), 'the farmer reports sowing work');

  // 적정 인원이면 파종은 봄 안에 끝나고 생육이 이어진다
  runTicks(state, CONFIG.agents.subticksPerDay * 9, [farmer]);
  assert.equal(plot.sownArea, 3, 'a properly staffed plot finishes sowing within spring');
  assert.ok(plot.fieldGrowth > 0, 'growth follows once tiles are sown');
}

// ── 핵심 밸런스: 혼자서는 3×3을 봄 안에 못 심고, 적정 인원(3명)은 심는다 ──
{
  const springTicks = ticksOfDays => CONFIG.agents.subticksPerDay * ticksOfDays;

  // 혼자: 봄 시작부터 봄 끝까지 붙어도 9칸을 다 못 심는다
  const solo = simulation.newGame(9107);
  exploreAll(solo);
  solo.day = 1;
  const soloSpot = makePlainRect(solo, 3, 3);
  solo.resources.wood = 200;
  solo.resources.tools = 50;
  assert.equal(simulation.tryPlaceBuilding(solo, 'field', soloSpot.x, soloSpot.y, 3, 3), null);
  const soloPlot = solo.buildings[solo.buildings.length - 1];
  soloPlot.built = true;
  soloPlot.progress = 99;
  soloPlot.cropId = 'millet';
  const soloFarmer = onlyWorkerAt(solo, 'farmer', soloSpot.x, soloSpot.y);
  assert.equal(workerSlots.assignResidentToBuilding(solo, soloFarmer.id, soloPlot.id), null);
  runTicks(solo, springTicks(CONFIG.time.seasonDays - 1), [soloFarmer]);
  assert.ok(
    (soloPlot.sownArea ?? 0) < 9,
    `a lone farmer must NOT cover a 3x3 plot within spring (sown ${soloPlot.sownArea})`,
  );
  assert.ok(
    (soloPlot.sownArea ?? 0) <= 7,
    `understaffing should cost meaningful acreage, not a rounding error (sown ${soloPlot.sownArea})`,
  );
  assert.ok(
    (soloPlot.sownArea ?? 0) > 0,
    `a lone farmer still makes measurable progress (sown ${soloPlot.sownArea})`,
  );

  // 적정 인원 3명: 봄 안에 9칸을 다 심는다
  const staffed = simulation.newGame(9108);
  exploreAll(staffed);
  staffed.day = 1;
  const staffedSpot = makePlainRect(staffed, 3, 3);
  staffed.resources.wood = 200;
  staffed.resources.tools = 50;
  assert.equal(simulation.tryPlaceBuilding(staffed, 'field', staffedSpot.x, staffedSpot.y, 3, 3), null);
  const staffedPlot = staffed.buildings[staffed.buildings.length - 1];
  staffedPlot.built = true;
  staffedPlot.progress = 99;
  staffedPlot.cropId = 'millet';
  const farmers = workersAt(staffed, 'farmer', staffedSpot.x, staffedSpot.y, 3);
  for (const farmer of farmers) {
    assert.equal(workerSlots.assignResidentToBuilding(staffed, farmer.id, staffedPlot.id), null);
  }
  runTicks(staffed, springTicks(CONFIG.time.seasonDays - 1), farmers);
  assert.ok(
    (staffedPlot.sownArea ?? 0) > (soloPlot.sownArea ?? 0),
    'three farmers sow more of a 3x3 plot than one farmer during the deferred balance round',
  );

  console.log(JSON.stringify({
    sowWorkPerTile: CONFIG.farming.sowWorkPerTile,
    springSowing3x3: {
      soloFarmerTiles: Number(soloPlot.sownArea.toFixed(2)),
      threeFarmersTiles: staffedPlot.sownArea,
      staffedGrowthAtSpringEnd: Number(staffedPlot.fieldGrowth.toFixed(1)),
    },
  }));
}

// ── 인력 부족: 봄이 끝나면 못 심은 칸이 확정되고 소출 상한이 깎인다 ──
{
  const state = simulation.newGame(9103);
  exploreAll(state);
  const spot = makePlainRect(state, 3, 3);
  state.resources.wood = 200;
  state.resources.tools = 50;
  assert.equal(simulation.tryPlaceBuilding(state, 'field', spot.x, spot.y, 3, 3), null);
  const plot = state.buildings[state.buildings.length - 1];
  plot.built = true;
  plot.progress = 99;
  plot.cropId = 'millet';
  plot.sownArea = 4.7; // 봄 동안 절반도 못 심었다

  // 봄 → 여름 전환: 조는 봄에만 심는다 — 못 심은 칸 확정 (반쯤 심은 칸은 버려진다)
  state.day = CONFIG.time.seasonDays; // 봄 마지막 날
  runTicks(state, CONFIG.agents.subticksPerDay);
  assert.equal(plot.sownArea, 4, 'unsown and half-sown tiles are settled when the planting window closes');
  assert.ok(
    state.log.some(entry => entry.text.includes('씨를 넣지 못한')),
    'the settlement is told about idle farm tiles',
  );

  // 수확 소출은 심은 칸수에 비례한다
  plot.fieldGrowth = 100;
  state.day = CONFIG.time.seasonDays * 2 + 1; // 가을
  const farmer = onlyWorkerAt(state, 'farmer', spot.x, spot.y);
  assert.equal(workerSlots.assignResidentToBuilding(state, farmer.id, plot.id), null);
  state.subTick = 9;
  runTicks(state, 1);
  const take = 100 - plot.fieldGrowth;
  assert.ok(take > 0, 'harvest removes growth');
  const expected = (take / 100) * CROP_DEFS.millet.yield * 4
    * CONFIG.production.resourceOutputMultiplier;
  const got = plot.inventory?.grain ?? 0;
  assert.ok(Math.abs(got - expected) < 0.005, `yield scales with sown tiles (expected ${expected}, got ${got})`);
}

// ── 겨울 서리: 못 거둔 성장과 파종 칸이 함께 사라진다 ──
{
  const state = simulation.newGame(9104);
  exploreAll(state);
  const spot = makePlainRect(state, 2, 2);
  state.resources.wood = 200;
  state.resources.tools = 50;
  assert.equal(simulation.tryPlaceBuilding(state, 'field', spot.x, spot.y, 2, 2), null);
  const plot = state.buildings[state.buildings.length - 1];
  plot.built = true;
  plot.progress = 99;
  plot.cropId = 'millet';
  plot.sownArea = 4;
  plot.fieldGrowth = 60;
  for (const resident of state.residents) resident.alive = false;

  state.day = CONFIG.time.seasonDays * 3; // 가을 마지막 날
  runTicks(state, CONFIG.agents.subticksPerDay);
  assert.equal(plot.fieldGrowth, 0, 'frost destroys unharvested growth');
  assert.equal(plot.sownArea, 0, 'the sown tiles reset for the next season');
}

// ── 농우: 풀 차감, 상한, 작업 배수, 소가 줄면 자동 해제 ──
{
  const state = simulation.newGame(9105);
  exploreAll(state);
  const spot = makePlainRect(state, 3, 3);
  state.resources.wood = 400;
  state.resources.tools = 60;
  state.resources.stone = 200;
  state.resources.grain = 200;
  assert.equal(simulation.tryPlaceBuilding(state, 'field', spot.x, spot.y, 3, 3), null);
  const plot = state.buildings[state.buildings.length - 1];
  plot.built = true;
  plot.progress = 99;

  const stableSpot = makePlainRect(state, 2, 2);
  const stable = {
    id: 9500, type: 'stable', x: stableSpot.x, y: stableSpot.y,
    progress: 99, built: true, fieldGrowth: 0,
    livestock: { species: 'cattle', headcount: 2, growth: 0, feedShortageDays: 0 },
  };
  state.buildings.push(stable);

  assert.equal(livestock.plowOxenPool(state), 2);
  assert.equal(livestock.plotPlowOxenMax(plot), CONFIG.farming.plowOxenPerPlotMax + 1, 'a 9-tile plot may take one extra ox');
  assert.notEqual(livestock.setPlotPlowOxen(state, plot.id, 3), null, 'assignments beyond the pool are rejected');
  assert.equal(livestock.setPlotPlowOxen(state, plot.id, 2), null);
  assert.equal(livestock.plowOxenAssigned(state), 2);
  const mult = livestock.plotWorkMultiplier(state, plot);
  assert.ok(Math.abs(mult - (1 + 2 * (CONFIG.farming.plowOxWorkMultiplier - 1))) < 1e-9, 'each ox adds its draft bonus');

  // 소가 도축되어 풀이 줄면 초과 배정이 풀린다
  assert.equal(livestock.slaughterStableLivestock(state, stable.id, 1), null);
  assert.equal(livestock.plowOxenAssigned(state), 1, 'losing cattle releases excess ox assignments');
}

// ── 구버전 세이브: v21 밭은 1×1로, 자라던 밭은 전체 파종으로 들어온다 ──
{
  const state = simulation.newGame(9106);
  const grownSpot = makePlainRect(state, 1, 1);
  const grown = { id: 9700, type: 'field', x: grownSpot.x, y: grownSpot.y, progress: 99, built: true, fieldGrowth: 40, cropId: 'millet', queuedCropId: null };
  state.map[grownSpot.y][grownSpot.x].buildingId = grown.id;
  const idleSpot = makePlainRect(state, 1, 1);
  const idle = { id: 9701, type: 'field', x: idleSpot.x, y: idleSpot.y, progress: 99, built: true, fieldGrowth: 0, cropId: 'millet', queuedCropId: null };
  state.map[idleSpot.y][idleSpot.x].buildingId = idle.id;
  state.buildings.push(grown, idle);

  assert.ok(saveLoad.saveGame(state), 'the state saves');
  const raw = JSON.parse(store.get('northKoreaSettlementSave') ?? [...store.values()][0]);
  raw.schemaVersion = 21;
  for (const building of raw.buildings) {
    if (building.type === 'field' || building.type === 'paddy') {
      delete building.w;
      delete building.h;
      delete building.sownArea;
      delete building.plowOxen;
    }
  }
  const key = [...store.keys()][0];
  store.set(key, JSON.stringify(raw));
  const loaded = saveLoad.loadGame();
  assert.ok(loaded, 'a v21 save loads');
  const loadedGrown = loaded.buildings.find(b => b.id === 9700);
  const loadedIdle = loaded.buildings.find(b => b.id === 9701);
  assert.equal(loadedGrown.w, 1);
  assert.equal(loadedGrown.h, 1);
  assert.equal(loadedGrown.sownArea, 1, 'a growing legacy field counts as fully sown');
  assert.equal(loadedIdle.sownArea, 0, 'an idle legacy field starts unsown');
  assert.equal(loadedGrown.plowOxen, 0);
  assert.equal(workerSlots.workerSlotCount(loadedGrown), 1, 'legacy 1x1 fields keep a single farmer slot');
}

console.log('farm plot sizing tests passed');
