// S2 지도 크기 — 생성·보장 지물·저장 호환 계약.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-map-size-s2-'));
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
const mapModule = await load('map');
const simulation = await load('simulation');
const saveLoad = await load('saveLoad');
const subsurface = await load('subsurfaceVeins');
const { CONFIG } = await load('config');

const CASES = [
  ['small', 56, 56],
  ['medium', 72, 72],
  ['large', 96, 96],
];
const SEEDS = [20260802, 20260803, 20260804];

function reachableTiles(map, startX, startY) {
  const reached = new Set([`${startX},${startY}`]);
  const queue = [{ x: startX, y: startY }];
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const { x, y } = queue[cursor];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const tile = map[y + dy]?.[x + dx];
      if (!tile || tile.terrain === 'river' || tile.terrain === 'mountain') continue;
      const key = `${tile.x},${tile.y}`;
      if (reached.has(key)) continue;
      reached.add(key);
      queue.push(tile);
    }
  }
  return reached;
}

for (const [mapSize, width, height] of CASES) {
  assert.deepEqual(options.mapDimensionsForSize(mapSize), { width, height }, `${mapSize} has fixed dimensions`);
  assert.equal(options.mapSizeForDimensions(width, height), mapSize, `${mapSize} dimensions round-trip`);

  for (const seed of SEEDS) {
    const dimensions = options.mapDimensionsForSize(mapSize);
    const first = mapModule.generateMap(seed, dimensions);
    const second = mapModule.generateMap(seed, dimensions);
    assert.deepEqual(first, second, `${mapSize}/${seed} map generation is deterministic`);
    assert.equal(first.tiles.length, height, `${mapSize}/${seed} uses exact height`);
    assert.ok(first.tiles.every(row => row.length === width), `${mapSize}/${seed} uses exact width`);

    for (const [y, row] of first.tiles.entries()) {
      for (const [x, tile] of row.entries()) {
        assert.deepEqual([tile.x, tile.y], [x, y], `${mapSize}/${seed} tile coordinates stay in bounds`);
      }
    }

    assert.equal(first.tiles[first.centerY]?.[first.centerX]?.terrain, 'center',
      `${mapSize}/${seed} has a center at its returned coordinates`);
    const reachable = reachableTiles(first.tiles, first.centerX, first.centerY);
    assert.ok(reachable.size > 1, `${mapSize}/${seed} center has a reachable exit`);
    const nearbyDeposits = first.tiles.flat().filter(tile => tile.mineralRemaining != null &&
      Math.abs(tile.x - first.centerX) + Math.abs(tile.y - first.centerY) <= CONFIG.minerals.nearbyMaxDistance + 5 &&
      reachable.has(`${tile.x},${tile.y}`));
    assert.ok(nearbyDeposits.some(tile => tile.hasIron), `${mapSize}/${seed} guarantees reachable nearby iron`);
    assert.ok(nearbyDeposits.some(tile => !tile.hasIron), `${mapSize}/${seed} guarantees reachable nearby stone`);

    const state = simulation.newGameFromOptions({
      ...options.optionsForDifficulty('normal', '', seed), mapSize, seed,
    });
    assert.equal(state.worldSetup.mapSize, mapSize, `${mapSize}/${seed} persists chosen map size`);
    assert.equal(state.map.length, height, `${mapSize}/${seed} new game uses exact height`);
    assert.ok(state.map.every(row => row.length === width), `${mapSize}/${seed} new game uses exact width`);
    assert.ok(state.residents.every(resident => resident.x >= 0 && resident.x < width && resident.y >= 0 && resident.y < height),
      `${mapSize}/${seed} residents begin in bounds`);
    assert.ok(state.buildings.every(building => building.x >= 0 && building.x < width && building.y >= 0 && building.y < height),
      `${mapSize}/${seed} buildings begin in bounds`);

    const center = state.buildings.find(building => building.type === 'center');
    assert.ok(center, `${mapSize}/${seed} has a settlement center`);
    const startingAquifer = subsurface.aquiferVeins(seed, width, height).at(-1);
    assert.deepEqual(
      [startingAquifer?.cx, startingAquifer?.cy], [Math.min(width - 1, center.x + 1), Math.min(height - 1, center.y + 1)],
      `${mapSize}/${seed} starting aquifer follows the generated center`,
    );
  }
}

// 72×72의 기존 newGame 진입점은 S2 뒤에도 중형과 동일한 생성 결과를 유지한다.
{
  const seed = 20260810;
  const legacy = simulation.newGame(seed);
  const medium = simulation.newGameFromOptions({ ...options.optionsForDifficulty('normal', '', seed), mapSize: 'medium', seed });
  assert.deepEqual(legacy.map, medium.map, 'legacy newGame remains medium-map compatible');
}

// 저장된 선언값이 실제 지도 행렬과 다르면 로드 시 실제 크기를 신뢰한다.
for (const [caseIndex, [mapSize, width, height]] of CASES.entries()) {
  const seed = 20260820 + width;
  const state = simulation.newGameFromOptions({ ...options.optionsForDifficulty('easy', '', seed), mapSize, seed });
  const slot = caseIndex + 1;
  assert.equal(saveLoad.saveGame(state, slot), true, `${mapSize} saves`);
  const storageKey = slot === 1 ? 'buksae-save-v3' : `buksae-save-v3-slot${slot}`;
  const raw = JSON.parse(store.get(storageKey));
  raw.worldSetup.mapSize = mapSize === 'small' ? 'large' : 'small';
  store.set(storageKey, JSON.stringify(raw));
  const loaded = saveLoad.loadGame(slot);
  assert.ok(loaded, `${mapSize} loads`);
  assert.equal(loaded.worldSetup.mapSize, mapSize, `${mapSize} load repairs mismatched saved map size`);
  assert.equal(loaded.map.length, height);
  assert.ok(loaded.map.every(row => row.length === width));
  const summary = saveLoad.readSaveSlotSummary(slot);
  assert.equal(summary.mapSize, mapSize, `${mapSize} slot summary uses the repaired map size`);
}

console.log('map size S2 tests passed');
