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
const tidalFlats = await load('tidalFlats');
const fishingGrounds = await load('fishingGrounds');
const constants = await load('constants');
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
    const mudflatTiles = coast.map.flat().filter(tile => tile.terrain === 'mudflat');
    assert.ok(mudflatTiles.length >= CONFIG.tidalFlats.minimumPlacementTiles,
      `${mapSize}/${seed} 해안에는 어살터를 쓸 만큼 갯벌이 있다`);
    const mudflatGrounds = coast.fishingGrounds.filter(ground => ground.kind === 'mudflat');
    assert.ok(mudflatGrounds.length > 0 && mudflatGrounds.every(ground =>
      ground.radius === 1 && ground.stock === ground.capacity),
    `${mapSize}/${seed} 신규 갯벌은 반경 1 어장이 가득 찬 상태로 시작한다`);
    assert.ok(coast.foreignSites.every(site => {
      for (let y = site.y; y < site.y + site.height; y++) for (let x = site.x; x < site.x + site.width; x++) {
        if (coast.map[y]?.[x]?.terrain === 'mudflat') return false;
      }
      return true;
    }), `${mapSize}/${seed} 외부 세력 거점은 갯벌을 점유하지 않는다`);
    const coastalGroundKinds = new Set(coast.map.flat().map(tile =>
      tidalFlats.coastalGroundAt(coast.map, tile.x, tile.y)).filter(Boolean));
    assert.ok(coastalGroundKinds.has('mudflat') && coastalGroundKinds.has('sand'),
      `${mapSize}/${seed} 해안 바닥에는 갯벌과 모래 전이가 함께 있다`);
    assert.ok(coast.map.flat().every(tile => {
      const kind = tidalFlats.coastalGroundAt(coast.map, tile.x, tile.y);
      return kind == null || tile.terrain === 'mountain' ||
        (tile.terrain !== 'forest' && tile.terrain !== 'rock' && tile.mineralRemaining == null);
    }), `${mapSize}/${seed} 해안 전이대에는 나무와 노두가 배치되지 않는다`);
    assert.ok(coast.map.flat().some(tile => buildings.canPlaceBuildingAt(coast, 'saltworks', tile.x, tile.y)),
      `${mapSize}/${seed} 전이대 뒤 첫 평지에 자염막 입지가 최소 한 곳 있다`);

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
      assert.equal(other.map.flat().some(tile => tile.terrain === 'mudflat'), false,
        `${mapSize}/${seed} ${region} 지도에는 갯벌이 생기지 않는다`);
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

// 자염막은 모래·갯벌을 비우고 그 뒤 바다에서 가장 가까운 2×2 평지에만 선다.
{
  const coast = simulation.newGameFromOptions({
    ...options.optionsForDifficulty('normal', '', 20260870), region: 'coast', seed: 20260870,
  });
  clearForPlacement(coast);
  for (let x = 10; x <= 11; x++) coast.map[12][x].terrain = 'sea';
  assert.equal(buildings.canPlaceBuildingAt(coast, 'saltworks', 10, 10), false,
    '해수 바로 옆의 모래 바닥에는 자염막을 세우지 않는다');
  assert.equal(buildings.canPlaceBuildingAt(coast, 'hut', 10, 10), false,
    '모래·자갈 해안 전이대에는 일반 건물도 세우지 않는다');
  coast.map[12][10].terrain = 'plain';
  coast.map[12][11].terrain = 'plain';
  for (let x = 10; x <= 11; x++) coast.map[14][x].terrain = 'sea';
  assert.equal(buildings.canPlaceBuildingAt(coast, 'saltworks', 10, 10), true);
  coast.map[14][10].terrain = 'lake';
  coast.map[14][11].terrain = 'lake';
  assert.equal(buildings.canPlaceBuildingAt(coast, 'saltworks', 10, 10), false, '호수는 자염 입지가 아니다');
  coast.map[14][10].terrain = 'river';
  coast.map[14][11].terrain = 'river';
  assert.equal(buildings.canPlaceBuildingAt(coast, 'saltworks', 10, 10), false, '강은 자염 입지가 아니다');

  const plains = simulation.newGame(20260871);
  clearForPlacement(plains);
  plains.map[14][10].terrain = 'sea';
  assert.equal(buildings.canPlaceBuildingAt(plains, 'saltworks', 10, 10), false, '평원에서는 자염막이 잠긴다');
  assert.equal(simulation.tryPlaceBuilding(plains, 'saltworks', 10, 10), '해안 지역에서만 지을 수 있습니다.');
}

function prepareSaltProduction(workerCount) {
  const state = simulation.newGameFromOptions({
    ...options.optionsForDifficulty('normal', '', 20260872),
    region: 'coast', seed: 20260872,
  });
  clearForPlacement(state);
  addBuilt(state, 'center', 2, 2);
  for (let x = 10; x <= 11; x++) state.map[14][x].terrain = 'sea';
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
  let sawSeaIntake = false;
  let sawReturnWithSeaWater = false;
  for (let tick = 0; tick < 24; tick++) {
    simulation.advanceTick(one.state);
    sawSeaIntake ||= one.state.residents.some(resident => resident.task === '바닷물 긷는 중');
    sawReturnWithSeaWater ||= one.state.residents.some(
      resident => resident.task === '바닷물 지고 자염막으로 이동',
    );
  }
  const oneSalt = one.saltworks.inventory.salt ?? 0;
  const oneFirewood = 10 - one.saltworks.inventory.firewood;
  assert.equal(sawSeaIntake, true, '염부가 바다 인접 육지에서 취수한다');
  assert.equal(sawReturnWithSeaWater, true, '취수한 염부가 자염막으로 귀환한다');
  assert.ok(oneSalt > 0, '배정 염부가 소금을 만든다');
  assert.ok(Math.abs(oneFirewood / oneSalt - CONFIG.production.firewoodPerSalt) < 1e-6,
    '소금 1당 장작 1.25를 쓴다');

  const two = prepareSaltProduction(2);
  for (let tick = 0; tick < 24; tick++) simulation.advanceTick(two.state);
  const twoSalt = two.saltworks.inventory.salt ?? 0;
  assert.ok(twoSalt >= oneSalt * 1.75,
    `염부 두 명은 취수 왕복의 위상 차이에도 병렬 생산량을 크게 늘린다 (${oneSalt} -> ${twoSalt})`);
  assert.equal(inventory.isHaulSourceBuilding(two.saltworks), true, '자염막 소금은 운반꾼 회수 대상이다');
}

// 자동 운반꾼은 자염막 재고에서 소금을 실제로 집어 정착지 재고에 넣는다.
{
  const state = simulation.newGameFromOptions({
    ...options.optionsForDifficulty('normal', '', 20260875), region: 'coast', seed: 20260875,
  });
  clearForPlacement(state);
  addBuilt(state, 'center', 2, 2);
  for (let x = 10; x <= 11; x++) state.map[14][x].terrain = 'sea';
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

// 갯벌은 해안 정착지의 어살터 전용 입지이며, 어부도 해안에서만 초기 해금된다.
{
  const coast = simulation.newGameFromOptions({
    ...options.optionsForDifficulty('normal', '', 20260876), region: 'coast', seed: 20260876,
  });
  clearForPlacement(coast);
  for (let y = 9; y <= 11; y++) for (let x = 9; x <= 11; x++) {
    Object.assign(coast.map[y][x], {
      terrain: 'mudflat',
      tidalCapacity: CONFIG.tidalFlats.capacityPerTile,
      tidalStock: CONFIG.tidalFlats.capacityPerTile,
    });
  }
  fishingGrounds.ensureFishingGrounds(coast);
  assert.equal(buildings.canPlaceBuildingAt(coast, 'tidalFishery', 10, 10), true);
  assert.equal(buildings.canPlaceBuildingAt(coast, 'hut', 10, 10), false, '일반 건물은 갯벌을 메우지 않는다');
  assert.equal(constants.isJobUnlocked('settlement', 'fisher', 'coast'), true);
  assert.equal(constants.isJobUnlocked('settlement', 'fisher', 'plains'), false);

  coast.worldSetup.region = 'plains';
  assert.equal(buildings.canPlaceBuildingAt(coast, 'tidalFishery', 10, 10), false,
    '갯벌 데이터가 있어도 해안 지역이 아니면 어살터를 지을 수 없다');
}

function prepareTidalFishery(workerCount, { day = 1, weather = 'clear' } = {}) {
  const state = simulation.newGameFromOptions({
    ...options.optionsForDifficulty('normal', '', 20260880 + workerCount),
    region: 'coast', seed: 20260880 + workerCount,
  });
  clearForPlacement(state);
  addBuilt(state, 'center', 2, 2);
  for (let y = 8; y <= 12; y++) for (let x = 8; x <= 12; x++) {
    Object.assign(state.map[y][x], {
      terrain: 'mudflat',
      tidalCapacity: CONFIG.tidalFlats.capacityPerTile,
      tidalStock: CONFIG.tidalFlats.capacityPerTile,
    });
  }
  fishingGrounds.ensureFishingGrounds(state);
  const fishery = addBuilt(state, 'tidalFishery', 10, 10, { inventory: {} });
  for (const resident of state.residents) resident.alive = false;
  for (let index = 0; index < workerCount; index++) {
    const resident = state.residents[index];
    Object.assign(resident, {
      alive: true, sick: false, health: 100, hunger: 100, warmth: 100, morale: 70,
      job: 'idle', assignedBuildingId: null,
      x: 9 + index * 2, y: 10, px: 9 + index * 2, py: 10,
      phase: 'rest', path: [], workTimer: 0, targetId: null, carrying: {}, manualOrder: null, skills: {},
    });
    assert.equal(workerSlots.assignResidentToBuilding(state, resident.id, fishery.id), null);
  }
  state.day = day;
  state.weather = weather;
  state.pendingChoice = null;
  for (let subTick = 9; subTick <= 44; subTick++) {
    state.subTick = subTick;
    agents.agentsTick(state);
  }
  return { state, fishery };
}

// 어부는 실제 갯벌 칸까지 걸어가 공동 비축을 줄이고 어살터에 생선을 하역한다.
{
  const one = prepareTidalFishery(1);
  const oneFish = one.fishery.inventory.fish ?? 0;
  assert.ok(oneFish >= 1 && oneFish <= 1.2,
    `봄 맑은 날 갯벌 어부 1인의 하루 산출 ${oneFish.toFixed(3)}은 목표 1.0~1.2다`);
  assert.ok(one.state.fishingGrounds.some(ground => ground.kind === 'mudflat' &&
    ground.stock < ground.capacity), '실제 작업한 갯벌 어장의 공동 비축이 줄어든다');

  const two = prepareTidalFishery(2);
  assert.ok((two.fishery.inventory.fish ?? 0) > oneFish * 1.5,
    '두 슬롯은 같은 어살터에서 한 명보다 충분히 많은 생선을 생산한다');
  assert.equal(inventory.isHaulSourceBuilding(two.fishery), true, '어살터 어획물은 운반꾼 회수 대상이다');

  const workedGround = two.state.fishingGrounds.find(ground => ground.kind === 'mudflat' &&
    ground.stock < ground.capacity);
  assert.ok(workedGround);
  const depleted = workedGround.stock;
  fishingGrounds.advanceFishingGrounds(two.state.fishingGrounds);
  assert.ok(workedGround.stock > depleted && workedGround.stock <= workedGround.capacity,
    '소모된 갯벌 어자원은 하루마다 상한까지 회복한다');

  const winter = prepareTidalFishery(1, { day: 37, weather: 'clear' });
  assert.ok((winter.fishery.inventory.fish ?? 0) > 0 && (winter.fishery.inventory.fish ?? 0) < oneFish,
    '겨울 갯벌 어획은 멈추지 않지만 정상 계절보다 줄어든다');
  const blizzard = prepareTidalFishery(1, { day: 1, weather: 'blizzard' });
  assert.equal(blizzard.fishery.inventory.fish ?? 0, 0, '눈보라에는 야외 갯벌 작업을 중단한다');

  const overlap = prepareTidalFishery(0);
  const secondFishery = addBuilt(overlap.state, 'tidalFishery', 12, 10, { inventory: {} });
  const sharedGround = overlap.state.fishingGrounds.find(ground => ground.kind === 'mudflat' &&
    ground.tiles.some(tile => tile.x === 9 && tile.y === 9));
  assert.ok(sharedGround);
  const sharedTile = sharedGround.tiles[0];
  const firstBefore = fishingGrounds.fishingGroundSummaryInArea(
    overlap.state.fishingGrounds, { x: overlap.fishery.x, y: overlap.fishery.y, radius: CONFIG.gatheringZones.tidalFisheryRadius }, 'mudflat',
  ).stock;
  const secondBefore = fishingGrounds.fishingGroundSummaryInArea(
    overlap.state.fishingGrounds, { x: secondFishery.x, y: secondFishery.y, radius: CONFIG.gatheringZones.tidalFisheryRadius }, 'mudflat',
  ).stock;
  fishingGrounds.takeFishingGroundStock(overlap.state.fishingGrounds, sharedTile.x, sharedTile.y, 1);
  const firstAfter = fishingGrounds.fishingGroundSummaryInArea(
    overlap.state.fishingGrounds, { x: overlap.fishery.x, y: overlap.fishery.y, radius: CONFIG.gatheringZones.tidalFisheryRadius }, 'mudflat',
  ).stock;
  const secondAfter = fishingGrounds.fishingGroundSummaryInArea(
    overlap.state.fishingGrounds, { x: secondFishery.x, y: secondFishery.y, radius: CONFIG.gatheringZones.tidalFisheryRadius }, 'mudflat',
  ).stock;
  assert.equal(firstBefore - firstAfter, 1);
  assert.equal(secondBefore - secondAfter, 1, '겹친 어살터는 같은 갯벌 타일 비축을 공유한다');
}

// 운반꾼은 어살터 현장 재고를 정착지 식량 재고로 옮긴다.
{
  const { state, fishery } = prepareTidalFishery(0);
  fishery.inventory.fish = 4;
  const hauler = state.residents[0];
  Object.assign(hauler, {
    alive: true, sick: false, health: 100, hunger: 100, warmth: 100, morale: 70,
    job: 'hauler', assignedBuildingId: null, x: 9, y: 10, px: 9, py: 10,
    phase: 'rest', path: [], workTimer: 0, targetId: null, carrying: {}, haulTask: null,
    manualOrder: null, skills: {},
  });
  state.resources.fish = 0;
  state.subTick = 9;
  for (let index = 0; index < 24; index++) simulation.advanceTick(state);
  assert.equal(fishery.inventory.fish, 0, '운반꾼이 어살터 어획물 재고를 비운다');
  assert.equal(state.resources.fish, 4, '어살터 어획물이 정착지 식량 재고에 들어간다');
}

// 갯벌·어살터·남은 공동 비축은 저장 왕복에서도 유지된다.
{
  const { state, fishery } = prepareTidalFishery(1);
  const workedGround = state.fishingGrounds.find(ground => ground.kind === 'mudflat' &&
    ground.stock < ground.capacity);
  assert.ok(workedGround);
  assert.equal(saveLoad.saveGame(state, 6), true);
  const loaded = saveLoad.loadGame(6);
  assert.ok(loaded);
  assert.equal(loaded.buildings.find(building => building.id === fishery.id)?.type, 'tidalFishery');
  const loadedGround = loaded.fishingGrounds.find(ground => ground.id === workedGround.id);
  assert.ok(loadedGround);
  assert.equal(loadedGround.stock, workedGround.stock);
}

console.log('map region S5 coast tests passed');
