// 새 게임 설정 S5 — 해안 생성, 해수 경계, 자염막 입지·생산·저장 왕복.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-map-region-s5-coast-'));
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

const store = new Map();
globalThis.localStorage = {
  getItem: key => store.get(key) ?? null,
  setItem: (key, value) => store.set(key, value),
  removeItem: key => store.delete(key),
};

const compiledDir = compileGameModules();
const load = name => import(pathToFileURL(join(compiledDir, `${name}.mjs`)).href);
const options = await load('newGameOptions');
const simulation = await load('simulation');
const subsurface = await load('subsurfaceVeins');
const buildings = await load('buildings');
const saveLoad = await load('saveLoad');
const waterCoverage = await load('waterCoverage');
const irrigation = await load('irrigation');
const fire = await load('fire');
const agents = await load('agents');
const raidRoutes = await load('raidRoutes');
const workerSlots = await load('workerSlots');
const inventory = await load('inventory');
const { CONFIG } = await load('config');

const CASES = [
  ['small', 56, 56],
  ['medium', 72, 72],
  ['large', 96, 96],
];
const SEEDS = [20260861, 20260862, 20260863, 20260864];

function seaIsConnectedToSouth(tiles) {
  const sea = tiles.flat().filter(tile => tile.terrain === 'sea');
  if (sea.length === 0) return false;
  const starts = tiles.at(-1).filter(tile => tile.terrain === 'sea');
  const reached = new Set(starts.map(tile => `${tile.x},${tile.y}`));
  const queue = [...starts];
  for (let index = 0; index < queue.length; index++) {
    const tile = queue[index];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const next = tiles[tile.y + dy]?.[tile.x + dx];
      if (!next || next.terrain !== 'sea') continue;
      const key = `${next.x},${next.y}`;
      if (reached.has(key)) continue;
      reached.add(key);
      queue.push(next);
    }
  }
  return reached.size === sea.length;
}

assert.equal(options.normalizeNewGameOptions({ region: 'coast' }).region, 'coast');

for (const [mapSize, width, height] of CASES) {
  for (const seed of SEEDS) {
    const base = options.optionsForDifficulty('normal', '', seed);
    const coast = simulation.newGameFromOptions({ ...base, mapSize, region: 'coast', seed });
    const repeat = simulation.newGameFromOptions({ ...base, mapSize, region: 'coast', seed });
    assert.deepEqual(coast.map, repeat.map, `${mapSize}/${seed} 해안 지도는 결정적이다`);
    assert.equal(coast.worldSetup.region, 'coast');
    const seaTiles = coast.map.flat().filter(tile => tile.terrain === 'sea');
    const seaRatio = seaTiles.length / (width * height);
    assert.ok(seaRatio >= 0.18 && seaRatio <= 0.24,
      `${mapSize}/${seed} 바다 면적 ${seaRatio.toFixed(3)}은 18~24% 안이다`);
    assert.ok(coast.map.at(-1).every(tile => tile.terrain === 'sea'),
      `${mapSize}/${seed} 남쪽 경계 전체가 바다다`);
    assert.equal(seaIsConnectedToSouth(coast.map), true,
      `${mapSize}/${seed} 모든 바다는 남쪽 경계와 4방향으로 이어진다`);

    const center = coast.buildings.find(building => building.type === 'center');
    assert.ok(center, `${mapSize}/${seed} 해안에도 정착 중심지가 있다`);
    for (let y = center.y - 1; y <= center.y + 2; y++) {
      for (let x = center.x - 1; x <= center.x + 3; x++) {
        assert.notEqual(coast.map[y]?.[x]?.terrain, 'sea', `${mapSize}/${seed} 중심지 안전 여백은 육지다`);
      }
    }
    const startVein = subsurface.aquiferVeins(seed, width, height, 'coast').at(-1);
    assert.ok(startVein, `${mapSize}/${seed} 해안에도 시작 수맥이 있다`);
    assert.ok(coast.map.flat().some(tile =>
      Math.abs(tile.x - startVein.cx) + Math.abs(tile.y - startVein.cy) <= CONFIG.water.startingAquiferRadius &&
      buildings.canPlaceBuildingAt(coast, 'well', tile.x, tile.y)),
    `${mapSize}/${seed} 해안에도 즉시 지을 수 있는 시작 우물 자리가 있다`);
    assert.ok(coast.map.flat().some(tile => tile.terrain === 'forest'), `${mapSize}/${seed} 해안에도 숲이 있다`);
    assert.ok(coast.map.flat().some(tile => tile.mineralRemaining != null), `${mapSize}/${seed} 해안에도 노두가 있다`);
    assert.ok(coast.habitats.some(habitat => habitat.active), `${mapSize}/${seed} 해안에도 활성 서식지가 있다`);

    for (const region of ['plains', 'mountain', 'lake']) {
      const other = simulation.newGameFromOptions({ ...base, mapSize, region, seed });
      assert.equal(other.map.flat().some(tile => tile.terrain === 'sea'), false,
        `${mapSize}/${seed} ${region} 지도에는 바다가 생기지 않는다`);
    }
  }
}

// 바다는 담수 급수권·농수로 취수·소방 수원에 들어가지 않는다.
{
  const map = Array.from({ length: 5 }, (_row, y) => Array.from({ length: 5 }, (_cell, x) => ({
    x, y, terrain: x === 2 && y === 2 ? 'sea' : 'plain', hasIron: false, buildingId: null,
  })));
  const canal = { id: 1, type: 'canal', x: 2, y: 1, built: true, progress: 1, fieldGrowth: 0 };
  const target = { id: 2, type: 'hut', x: 1, y: 2, built: true, progress: 1, fieldGrowth: 0 };
  const state = { map, buildings: [canal], aquiferLevels: [], seed: 1 };
  const coverage = waterCoverage.naturalWaterCoverageTileSets(state);
  assert.equal(coverage.river.size, 0);
  assert.equal(coverage.lake.size, 0);
  assert.equal(waterCoverage.nearestNaturalWaterDistance(state, 2, 1), null);
  assert.deepEqual(irrigation.canalRiverEdgesAt(state, 2, 1), { n: false, e: false, s: false, w: false });
  assert.equal(fire.nearestFireWaterSource(state, target), null);
}

// 바다는 계절·날씨와 무관하게 주민과 습격자를 막는다.
{
  const map = Array.from({ length: 3 }, (_row, y) => Array.from({ length: 3 }, (_cell, x) => ({
    x, y, terrain: x === 1 && y === 1 ? 'sea' : 'plain', hasIron: false, buildingId: null,
  })));
  const state = { map, buildings: [], pendingDisasters: [], day: 1, weather: 'clear', siegeState: null };
  for (const [day, weather] of [[1, 'clear'], [18, 'rain'], [37, 'snow'], [42, 'blizzard'], [66, 'clear']]) {
    state.day = day;
    state.weather = weather;
    assert.equal(agents.isTerrainPassable(state, 1, 1), false, `${day}일 바다는 주민 통행 불가다`);
    assert.equal(raidRoutes.isRaidTileTraversable(state, 1, 1, false), false, `${day}일 바다는 습격 경로가 아니다`);
  }
}

function clearForPlacement(state) {
  for (const row of state.map) for (const tile of row) {
    tile.terrain = 'plain';
    tile.hasIron = false;
    tile.buildingId = null;
    delete tile.mineralRemaining;
  }
  state.buildings = [];
  state.exploration = { explored: state.map.map(row => row.map(() => true)) };
}

function addBuilt(state, type, x, y, overrides = {}) {
  const building = {
    id: 9800 + state.buildings.length, type, x, y,
    progress: buildings.BUILDING_DEFS[type].buildDays, built: true, fieldGrowth: 0,
    ...overrides,
  };
  state.buildings.push(building);
  buildings.occupyBuildingTiles(state, building);
  return building;
}

// 자염막은 해안 지역의 2x2 육지에서 바다와 직교 인접할 때만 선다.
{
  const coast = simulation.newGameFromOptions({
    ...options.optionsForDifficulty('normal', '', 20260870), region: 'coast', seed: 20260870,
  });
  clearForPlacement(coast);
  for (let x = 10; x <= 11; x++) coast.map[12][x].terrain = 'sea';
  assert.equal(buildings.canPlaceBuildingAt(coast, 'saltworks', 10, 10), true);
  coast.map[12][10].terrain = 'lake';
  coast.map[12][11].terrain = 'lake';
  assert.equal(buildings.canPlaceBuildingAt(coast, 'saltworks', 10, 10), false, '호수는 자염 입지가 아니다');
  coast.map[12][10].terrain = 'river';
  coast.map[12][11].terrain = 'river';
  assert.equal(buildings.canPlaceBuildingAt(coast, 'saltworks', 10, 10), false, '강은 자염 입지가 아니다');

  const plains = simulation.newGame(20260871);
  clearForPlacement(plains);
  plains.map[12][10].terrain = 'sea';
  assert.equal(buildings.canPlaceBuildingAt(plains, 'saltworks', 10, 10), false, '평원에서는 자염막이 잠긴다');
  assert.equal(simulation.tryPlaceBuilding(plains, 'saltworks', 10, 10), '해안 지역에서만 지을 수 있습니다.');
}

function prepareSaltProduction(workerCount) {
  const state = simulation.newGameFromOptions({
    ...options.optionsForDifficulty('normal', '', 20260872 + workerCount),
    region: 'coast', seed: 20260872 + workerCount,
  });
  clearForPlacement(state);
  addBuilt(state, 'center', 2, 2);
  for (let x = 10; x <= 11; x++) state.map[12][x].terrain = 'sea';
  const saltworks = addBuilt(state, 'saltworks', 10, 10, { inventory: { firewood: 10 } });
  state.day = 1;
  state.subTick = 9;
  state.weather = 'clear';
  state.pendingChoice = null;
  state.resources.tools = 100;
  for (const resident of state.residents) resident.alive = false;
  for (let index = 0; index < workerCount; index++) {
    const resident = state.residents[index];
    Object.assign(resident, {
      alive: true, sick: false, health: 100, hunger: 100, warmth: 100, morale: 70,
      job: 'idle', assignedBuildingId: null,
      x: index === 0 ? 9 : 12, y: 11, px: index === 0 ? 9 : 12, py: 11,
      phase: 'rest', path: [], workTimer: 0, targetId: null, carrying: {}, manualOrder: null, skills: {},
    });
    assert.equal(workerSlots.assignResidentToBuilding(state, resident.id, saltworks.id), null);
  }
  return { state, saltworks };
}

// 장작 1.25로 소금 1을 만들며 두 슬롯이 병렬로 생산하고 운반 대상이 된다.
{
  const one = prepareSaltProduction(1);
  simulation.advanceTick(one.state);
  const oneSalt = one.saltworks.inventory.salt ?? 0;
  const oneFirewood = 10 - one.saltworks.inventory.firewood;
  assert.ok(oneSalt > 0, '배정 염부가 소금을 만든다');
  assert.ok(Math.abs(oneFirewood / oneSalt - CONFIG.production.firewoodPerSalt) < 1e-6,
    '소금 1당 장작 1.25를 쓴다');

  const two = prepareSaltProduction(2);
  simulation.advanceTick(two.state);
  assert.ok(Math.abs((two.saltworks.inventory.salt ?? 0) - oneSalt * 2) < 1e-6,
    '염부 두 명은 한 명의 두 배를 병렬 생산한다');
  assert.equal(inventory.isHaulSourceBuilding(two.saltworks), true, '자염막 소금은 운반꾼 회수 대상이다');
}

// 자동 운반꾼은 자염막 재고에서 소금을 실제로 집어 정착지 재고에 넣는다.
{
  const state = simulation.newGameFromOptions({
    ...options.optionsForDifficulty('normal', '', 20260875), region: 'coast', seed: 20260875,
  });
  clearForPlacement(state);
  addBuilt(state, 'center', 2, 2);
  for (let x = 10; x <= 11; x++) state.map[12][x].terrain = 'sea';
  const saltworks = addBuilt(state, 'saltworks', 10, 10, { inventory: { salt: 6 } });
  for (const resident of state.residents) resident.alive = false;
  const hauler = state.residents[0];
  Object.assign(hauler, {
    alive: true, sick: false, health: 100, hunger: 100, warmth: 100, morale: 70,
    job: 'hauler', assignedBuildingId: null, x: 9, y: 11, px: 9, py: 11,
    phase: 'rest', path: [], workTimer: 0, targetId: null, carrying: {}, haulTask: null,
    manualOrder: null, skills: {},
  });
  state.subTick = 9;
  state.pendingChoice = null;
  state.resources.salt = 0;

  for (let index = 0; index < 12; index++) simulation.advanceTick(state);

  assert.equal(saltworks.inventory.salt, 0, '운반꾼이 자염막 소금 재고를 비운다');
  assert.equal(state.resources.salt, 6, '자염막 소금이 정착지 재고에 들어간다');
}

// 신규 지형·건물·직업은 저장 왕복에서 유지된다.
{
  const { state, saltworks } = prepareSaltProduction(1);
  assert.equal(saveLoad.saveGame(state, 5), true);
  const loaded = saveLoad.loadGame(5);
  assert.ok(loaded);
  assert.equal(loaded.worldSetup.region, 'coast');
  assert.ok(loaded.map.flat().some(tile => tile.terrain === 'sea'));
  assert.equal(loaded.buildings.find(building => building.id === saltworks.id)?.type, 'saltworks');
  assert.equal(loaded.residents.find(resident => resident.alive)?.job, 'saltMaker');
}

console.log('map region S5 coast tests passed');
