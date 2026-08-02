// 새 게임 설정 S4 — 호수 지역의 결정론, 수자원 정체성, 시작 보장과 저장 왕복.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-map-region-s4-lake-'));
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
const agents = await load('agents');
const raidRoutes = await load('raidRoutes');
const { CONFIG } = await load('config');

const CASES = [
  ['small', 56, 56],
  ['medium', 72, 72],
  ['large', 96, 96],
];
const SEEDS = [20260841, 20260842, 20260843, 20260844];

function isLandPassable(tile) {
  return tile != null && tile.terrain !== 'river' && tile.terrain !== 'lake' &&
    tile.terrain !== 'mountain' && tile.terrain !== 'rock';
}

function reachableTiles(tiles, centerX, centerY) {
  const reached = new Set([`${centerX},${centerY}`]);
  const queue = [{ x: centerX, y: centerY }];
  for (let index = 0; index < queue.length; index++) {
    const tile = queue[index];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const next = tiles[tile.y + dy]?.[tile.x + dx];
      if (!isLandPassable(next)) continue;
      const key = `${next.x},${next.y}`;
      if (reached.has(key)) continue;
      reached.add(key);
      queue.push(next);
    }
  }
  return reached;
}

function lakeIsFourWayConnected(tiles) {
  const lakes = tiles.flat().filter(tile => tile.terrain === 'lake');
  if (lakes.length === 0) return false;
  const reached = new Set([`${lakes[0].x},${lakes[0].y}`]);
  const queue = [lakes[0]];
  for (let index = 0; index < queue.length; index++) {
    const tile = queue[index];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const next = tiles[tile.y + dy]?.[tile.x + dx];
      if (!next || next.terrain !== 'lake') continue;
      const key = `${next.x},${next.y}`;
      if (reached.has(key)) continue;
      reached.add(key);
      queue.push(next);
    }
  }
  return reached.size === lakes.length;
}

function summarize(state, width, height) {
  const result = {
    plain: 0,
    forest: 0,
    lake: 0,
    naturalWaterFertile: 0,
    ordinaryAquiferCapacity: 0,
    surfaceMineral: 0,
    undergroundOreCapacity: 0,
  };
  const coverage = waterCoverage.naturalWaterCoverageTileSets(state);
  const naturalWater = new Set([...coverage.river, ...coverage.lake]);
  for (const row of state.map) {
    for (const tile of row) {
      if (tile.terrain === 'plain') result.plain++;
      if (tile.terrain === 'forest') result.forest++;
      if (tile.terrain === 'lake') result.lake++;
      if (tile.terrain === 'fertile' && naturalWater.has(`${tile.x},${tile.y}`)) {
        result.naturalWaterFertile++;
      }
      if (tile.mineralRemaining != null) result.surfaceMineral += tile.mineralRemaining;
    }
  }
  const aquifers = subsurface.aquiferVeins(state.seed, width, height, state.worldSetup.region);
  result.ordinaryAquiferCapacity = aquifers.slice(0, -1).reduce((sum, vein) => sum + vein.capacity, 0);
  result.undergroundOreCapacity = subsurface.oreVeins(
    state.seed, width, height, state.worldSetup.region,
  ).reduce((sum, vein) => sum + vein.capacity, 0);
  return result;
}

const sample = summarize(simulation.newGame(1), 72, 72);
const plainsTotal = Object.fromEntries(Object.keys(sample).map(key => [key, 0]));
const lakesTotal = { ...plainsTotal };

for (const [mapSize, width, height] of CASES) {
  for (const seed of SEEDS) {
    const base = options.optionsForDifficulty('normal', '', seed);
    const plains = simulation.newGameFromOptions({ ...base, mapSize, region: 'plains', seed });
    const mountain = simulation.newGameFromOptions({ ...base, mapSize, region: 'mountain', seed });
    const lake = simulation.newGameFromOptions({ ...base, mapSize, region: 'lake', seed });
    const lakeRepeat = simulation.newGameFromOptions({ ...base, mapSize, region: 'lake', seed });
    assert.deepEqual(lake.map, lakeRepeat.map, `${mapSize}/${seed} 호수 지도는 같은 시드에서 결정적이다`);
    assert.deepEqual(lake.habitats, lakeRepeat.habitats, `${mapSize}/${seed} 호수 서식지는 같은 시드에서 결정적이다`);
    assert.equal(lake.worldSetup.region, 'lake');
    assert.notDeepEqual(lake.map, plains.map, `${mapSize}/${seed} 호수는 평원과 다른 지형을 만든다`);
    assert.notDeepEqual(lake.map, mountain.map, `${mapSize}/${seed} 호수는 산지와 다른 지형을 만든다`);

    const lakeTiles = lake.map.flat().filter(tile => tile.terrain === 'lake');
    const lakeRatio = lakeTiles.length / (width * height);
    assert.ok(lakeRatio >= 0.12 && lakeRatio <= 0.26,
      `${mapSize}/${seed} 호수 면적 ${lakeRatio.toFixed(3)}은 초기 허용 범위 12~26% 안이다`);
    assert.equal(lakeIsFourWayConnected(lake.map), true, `${mapSize}/${seed} 호수는 하나의 4방향 연결 수역이다`);

    const center = lake.buildings.find(building => building.type === 'center');
    assert.ok(center, `${mapSize}/${seed} 호수에도 정착 중심지가 있다`);
    assert.equal(lake.map[center.y]?.[center.x]?.terrain, 'center');
    const startVein = subsurface.aquiferVeins(seed, width, height, 'lake').at(-1);
    assert.ok(startVein, `${mapSize}/${seed} 호수에도 시작 수맥이 있다`);
    const immediatelyBuildableWell = lake.map.flat().some(tile =>
      Math.abs(tile.x - startVein.cx) + Math.abs(tile.y - startVein.cy) <= CONFIG.water.startingAquiferRadius &&
      buildings.canPlaceBuildingAt(lake, 'well', tile.x, tile.y));
    assert.equal(immediatelyBuildableWell, true, `${mapSize}/${seed} 호수에도 즉시 배치 가능한 시작 우물 자리가 있다`);

    const reachable = reachableTiles(lake.map, center.x, center.y);
    const hasReachableApproach = tile => [[1, 0], [-1, 0], [0, 1], [0, -1]]
      .some(([dx, dy]) => reachable.has(`${tile.x + dx},${tile.y + dy}`));
    const nearbyDeposits = lake.map.flat().filter(tile =>
      tile.mineralRemaining != null &&
      Math.abs(tile.x - center.x) + Math.abs(tile.y - center.y) <= CONFIG.minerals.nearbyMaxDistance + 5 &&
      hasReachableApproach(tile));
    assert.ok(nearbyDeposits.some(tile => tile.hasIron), `${mapSize}/${seed} 호수는 도달 가능한 근거리 철 노두를 보장한다`);
    assert.ok(nearbyDeposits.some(tile => !tile.hasIron), `${mapSize}/${seed} 호수는 도달 가능한 근거리 돌 노두를 보장한다`);
    assert.ok(lake.habitats.some(habitat => habitat.active), `${mapSize}/${seed} 호수에도 활성 서식지를 하나 보장한다`);
    assert.ok(lake.map.flat().some(tile => tile.terrain === 'forest' && reachable.has(`${tile.x},${tile.y}`)),
      `${mapSize}/${seed} 호수에는 도달 가능한 숲이 하나 이상 있다`);

    for (const [key, value] of Object.entries(summarize(plains, width, height))) plainsTotal[key] += value;
    for (const [key, value] of Object.entries(summarize(lake, width, height))) lakesTotal[key] += value;
  }
}

assert.ok(lakesTotal.lake > 0, '호수 표본에는 실제 lake 수역이 있다');
assert.ok(lakesTotal.naturalWaterFertile > plainsTotal.naturalWaterFertile,
  '호수는 표본 합계에서 자연 급수권 비옥지가 더 많다');
assert.ok(lakesTotal.ordinaryAquiferCapacity > plainsTotal.ordinaryAquiferCapacity,
  '호수는 시작 보장을 제외한 일반 수맥 용량이 더 크다');
assert.ok(lakesTotal.plain < plainsTotal.plain, '호수는 표본 합계에서 평지가 더 적다');
assert.ok(lakesTotal.forest < plainsTotal.forest, '호수는 표본 합계에서 숲이 더 적다');
assert.ok(lakesTotal.surfaceMineral < plainsTotal.surfaceMineral, '호수는 표본 합계에서 표면 광물이 더 적다');
assert.ok(lakesTotal.undergroundOreCapacity < plainsTotal.undergroundOreCapacity,
  '호수는 표본 합계에서 지하 광물 용량이 더 적다');

// 타일별 결빙 통행: 가장자리는 먼저 얼고 먼저 녹으며, 중앙은 한겨울에 마지막으로 언다.
{
  const map = Array.from({ length: 5 }, (_row, y) =>
    Array.from({ length: 5 }, (_cell, x) => ({
      x, y, terrain: x >= 1 && x <= 3 && y >= 1 && y <= 3 ? 'lake' : 'plain',
      hasIron: false, buildingId: null,
    })));
  const state = {
    map, buildings: [], pendingDisasters: [], day: 37, weather: 'clear', siegeState: null,
  };
  const residentPassable = (x, y) => agents.isTerrainPassable(state, x, y);
  const raiderPassable = (x, y) => raidRoutes.isRaidTileTraversable(state, x, y, false);

  assert.equal(residentPassable(1, 2), true, '초겨울 호숫가 얼음은 주민이 밟을 수 있다');
  assert.equal(residentPassable(2, 2), false, '초겨울 호수 중앙 물은 주민을 막는다');
  assert.equal(raiderPassable(1, 2), true, '초겨울 호숫가 얼음은 습격자도 밟을 수 있다');
  assert.equal(raiderPassable(2, 2), false, '초겨울 호수 중앙 물은 습격자를 막는다');

  state.day = 42; // 겨울 6일
  assert.equal(residentPassable(2, 2), true, '한겨울에는 호수 중앙까지 전면 결빙한다');
  assert.equal(raiderPassable(2, 2), true, '한겨울 전면 결빙은 습격 경로에도 같다');

  state.day = 1; // 봄 1일
  assert.equal(residentPassable(1, 2), false, '봄에는 호숫가부터 녹아 다시 막힌다');
  assert.equal(residentPassable(2, 2), true, '봄 초입의 깊은 중앙 얼음은 잠시 남는다');
  state.day = 6;
  assert.equal(residentPassable(2, 2), false, '봄 중순에는 호수 전체가 녹는다');
}

// 같은 시드·크기라도 세 지역은 수맥/광맥 캐시를 공유하지 않는다.
{
  const seed = 20260851;
  const { width, height } = options.mapDimensionsForSize('medium');
  for (const fn of [subsurface.aquiferVeins, subsurface.oreVeins]) {
    assert.notDeepEqual(fn(seed, width, height, 'lake'), fn(seed, width, height, 'plains'),
      '호수와 평원은 지역별 지하자원 캐시가 분리된다');
    assert.notDeepEqual(fn(seed, width, height, 'lake'), fn(seed, width, height, 'mountain'),
      '호수와 산지는 지역별 지하자원 캐시가 분리된다');
  }
}

// 저장·로드와 슬롯/연대기는 호수 문맥과 지역별 지하자원 배열을 유지한다.
{
  const seed = 20260852;
  const state = simulation.newGameFromOptions({
    ...options.optionsForDifficulty('easy', '호반촌', seed), region: 'lake', seed,
  });
  assert.equal(saveLoad.saveGame(state, 4), true);
  const loaded = saveLoad.loadGame(4);
  assert.ok(loaded);
  assert.equal(loaded.worldSetup.region, 'lake');
  assert.deepEqual(loaded.aquiferLevels, state.aquiferLevels, '호수 수맥 수위 배열을 보존한다');
  assert.deepEqual(loaded.oreVeinRemaining, state.oreVeinRemaining, '호수 광맥 잔량 배열을 보존한다');
  assert.equal(saveLoad.readSaveSlotSummary(4).region, 'lake');
  assert.match(loaded.annals.find(entry => entry.kind === 'founding')?.text ?? '', /호수의 중형 개척지/);
}

console.log('map region S4 lake tests passed');
