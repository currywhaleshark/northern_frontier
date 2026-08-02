// 새 게임 설정 S3 — 산지 지역의 결정론, 자원 정체성, 시작 보장과 저장 왕복.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-map-region-s3-'));
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
const mapModule = await load('map');
const options = await load('newGameOptions');
const simulation = await load('simulation');
const subsurface = await load('subsurfaceVeins');
const buildings = await load('buildings');
const saveLoad = await load('saveLoad');
const { CONFIG } = await load('config');

const CASES = [
  ['small', 56, 56],
  ['medium', 72, 72],
  ['large', 96, 96],
];
const SEEDS = [20260821, 20260822, 20260823, 20260824];

function reachableTiles(tiles, centerX, centerY) {
  const reached = new Set([`${centerX},${centerY}`]);
  const queue = [{ x: centerX, y: centerY }];
  for (let index = 0; index < queue.length; index++) {
    const tile = queue[index];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const next = tiles[tile.y + dy]?.[tile.x + dx];
      if (!next || next.terrain === 'river' || next.terrain === 'mountain') continue;
      const key = `${next.x},${next.y}`;
      if (reached.has(key)) continue;
      reached.add(key);
      queue.push(next);
    }
  }
  return reached;
}

function summarize(state, width, height) {
  const interiorMargin = Math.max(8, Math.floor(Math.min(width, height) * 0.14));
  const result = {
    plain: 0,
    waterAndFertile: 0,
    interiorMountain: 0,
    forest: 0,
    surfaceMineral: 0,
    ordinaryAquiferCapacity: 0,
    undergroundOreCapacity: 0,
    habitatCapacity: state.habitats.reduce((sum, habitat) => sum + habitat.capacity, 0),
  };
  for (const row of state.map) {
    for (const tile of row) {
      if (tile.terrain === 'plain') result.plain++;
      if (tile.terrain === 'river' || tile.terrain === 'fertile') result.waterAndFertile++;
      if (tile.terrain === 'forest') result.forest++;
      if (tile.mineralRemaining != null) result.surfaceMineral += tile.mineralRemaining;
      if (tile.terrain === 'mountain' &&
          tile.x >= interiorMargin && tile.x < width - interiorMargin &&
          tile.y >= interiorMargin && tile.y < height - interiorMargin) result.interiorMountain++;
    }
  }
  const aquifers = subsurface.aquiferVeins(state.seed, width, height, state.worldSetup.region);
  result.ordinaryAquiferCapacity = aquifers.slice(0, -1).reduce((sum, vein) => sum + vein.capacity, 0);
  result.undergroundOreCapacity = subsurface.oreVeins(state.seed, width, height, state.worldSetup.region)
    .reduce((sum, vein) => sum + vein.capacity, 0);
  return result;
}

const plainsTotal = Object.fromEntries(Object.keys(summarize(
  simulation.newGame(1), 72, 72,
)).map(key => [key, 0]));
const mountainsTotal = { ...plainsTotal };

for (const [mapSize, width, height] of CASES) {
  for (const seed of SEEDS) {
    const plains = simulation.newGameFromOptions({
      ...options.optionsForDifficulty('normal', '', seed), mapSize, region: 'plains', seed,
    });
    const mountain = simulation.newGameFromOptions({
      ...options.optionsForDifficulty('normal', '', seed), mapSize, region: 'mountain', seed,
    });
    const mountainRepeat = simulation.newGameFromOptions({
      ...options.optionsForDifficulty('normal', '', seed), mapSize, region: 'mountain', seed,
    });
    assert.deepEqual(mountain.map, mountainRepeat.map,
      `${mapSize}/${seed} 산지 지도는 같은 시드에서 결정적이다`);
    assert.deepEqual(mountain.habitats, mountainRepeat.habitats,
      `${mapSize}/${seed} 산지 서식지는 같은 시드에서 결정적이다`);
    assert.equal(mountain.worldSetup.region, 'mountain');
    assert.notDeepEqual(mountain.map, plains.map,
      `${mapSize}/${seed} 산지는 평원과 다른 지형을 만든다`);

    const center = mountain.buildings.find(building => building.type === 'center');
    assert.ok(center, `${mapSize}/${seed} 산지에도 정착 중심지가 있다`);
    assert.equal(mountain.map[center.y]?.[center.x]?.terrain, 'center');
    const startVein = subsurface.aquiferVeins(seed, width, height, 'mountain').at(-1);
    assert.deepEqual([startVein?.cx, startVein?.cy],
      [Math.min(width - 1, center.x + 1), Math.min(height - 1, center.y + 1)],
      `${mapSize}/${seed} 산지의 시작 수맥은 생성된 중심지를 따른다`);
    const immediatelyBuildableWell = mountain.map.flat().some(tile =>
      Math.abs(tile.x - startVein.cx) + Math.abs(tile.y - startVein.cy) <= CONFIG.water.startingAquiferRadius &&
      buildings.canPlaceBuildingAt(mountain, 'well', tile.x, tile.y));
    assert.equal(immediatelyBuildableWell, true,
      `${mapSize}/${seed} 산지에도 즉시 배치 가능한 시작 우물 자리가 있다`);

    const reachable = reachableTiles(mountain.map, center.x, center.y);
    const nearbyDeposits = mountain.map.flat().filter(tile =>
      tile.mineralRemaining != null &&
      Math.abs(tile.x - center.x) + Math.abs(tile.y - center.y) <= CONFIG.minerals.nearbyMaxDistance + 5 &&
      reachable.has(`${tile.x},${tile.y}`));
    assert.ok(nearbyDeposits.some(tile => tile.hasIron),
      `${mapSize}/${seed} 산지는 도달 가능한 근거리 철 노두를 보장한다`);
    assert.ok(nearbyDeposits.some(tile => !tile.hasIron),
      `${mapSize}/${seed} 산지는 도달 가능한 근거리 돌 노두를 보장한다`);
    assert.ok(mountain.habitats.some(habitat => habitat.active),
      `${mapSize}/${seed} 산지에도 활성 서식지를 하나 보장한다`);

    for (const [key, value] of Object.entries(summarize(plains, width, height))) plainsTotal[key] += value;
    for (const [key, value] of Object.entries(summarize(mountain, width, height))) mountainsTotal[key] += value;
  }
}

assert.ok(mountainsTotal.plain < plainsTotal.plain, '산지는 표본 합계에서 평지가 더 적다');
assert.ok(mountainsTotal.waterAndFertile < plainsTotal.waterAndFertile,
  '산지는 표본 합계에서 강·비옥지가 더 적다');
assert.ok(mountainsTotal.ordinaryAquiferCapacity < plainsTotal.ordinaryAquiferCapacity,
  '시작 보장을 제외한 산지 수맥은 더 적고 얕다');
assert.ok(mountainsTotal.interiorMountain > plainsTotal.interiorMountain,
  '산지는 표본 합계에서 지도 내부 능선이 더 많다');
assert.ok(mountainsTotal.forest > plainsTotal.forest, '산지는 표본 합계에서 숲이 더 많다');
assert.ok(mountainsTotal.surfaceMineral > plainsTotal.surfaceMineral,
  '산지는 표본 합계에서 표면 광상이 더 풍부하다');
assert.ok(mountainsTotal.undergroundOreCapacity > plainsTotal.undergroundOreCapacity,
  '산지는 표본 합계에서 지하 광맥이 더 풍부하다');
assert.ok(mountainsTotal.habitatCapacity > plainsTotal.habitatCapacity,
  '산지는 표본 합계에서 사냥 서식지 수용력이 더 크다');

// 같은 시드·크기라도 지역은 수맥/광맥 캐시를 공유하지 않는다.
{
  const seed = 20260831;
  const { width, height } = options.mapDimensionsForSize('medium');
  assert.notDeepEqual(subsurface.aquiferVeins(seed, width, height, 'plains'),
    subsurface.aquiferVeins(seed, width, height, 'mountain'),
  '지역별 수맥 캐시가 분리된다');
  assert.notDeepEqual(subsurface.oreVeins(seed, width, height, 'plains'),
    subsurface.oreVeins(seed, width, height, 'mountain'),
  '지역별 광맥 캐시가 분리된다');
}

// 저장·로드와 슬롯/연대기는 산지 문맥과 지역별 지하자원 배열을 유지한다.
{
  const seed = 20260832;
  const state = simulation.newGameFromOptions({
    ...options.optionsForDifficulty('easy', '바위골', seed), region: 'mountain', seed,
  });
  assert.equal(saveLoad.saveGame(state, 3), true);
  const loaded = saveLoad.loadGame(3);
  assert.ok(loaded);
  assert.equal(loaded.worldSetup.region, 'mountain');
  assert.deepEqual(loaded.aquiferLevels, state.aquiferLevels, '산지 수맥 수위 배열을 보존한다');
  assert.deepEqual(loaded.oreVeinRemaining, state.oreVeinRemaining, '산지 광맥 잔량 배열을 보존한다');
  assert.equal(saveLoad.readSaveSlotSummary(3).region, 'mountain');
  assert.match(loaded.annals.find(entry => entry.kind === 'founding')?.text ?? '', /산지의 중형 개척지/);
}

console.log('map region S3 tests passed');
