// 새 게임 설정 S6 — 사용자 노브의 실제 지도·지하 자원·저장 소비처 회귀.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-new-game-tuning-s6-'));
  for (const file of readdirSync(srcDir).filter(file => file.endsWith('.ts'))) {
    let output = ts.transpileModule(readFileSync(new URL(file, srcDir), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    output = output.replace(/(from\s+['"])(\.{1,2}\/[^'"]+)(['"])/g, (_match, start, spec, end) =>
      /\.[cm]?js$/.test(spec) ? `${start}${spec}${end}` : `${start}${spec}.mjs${end}`);
    writeFileSync(join(outDir, file.replace(/\.ts$/, '.mjs')), output, 'utf8');
  }
  return outDir;
}

const compiledDir = compileGameModules();
const load = name => import(pathToFileURL(join(compiledDir, `${name}.mjs`)).href);
const simulation = await load('simulation');
const subsurface = await load('subsurfaceVeins');
const saveLoad = await load('saveLoad');

const storage = new Map();
globalThis.localStorage = {
  get length() { return storage.size; },
  getItem: key => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: key => storage.delete(key),
  key: index => [...storage.keys()][index] ?? null,
};

function options(seed, resourceDensity) {
  return {
    settlementName: '밀도 시험',
    difficultyPreset: 'custom',
    baseDifficulty: 'normal',
    region: 'plains',
    mapSize: 'medium',
    tuning: {
      startingResources: 'normal', resourceDensity, climateSeverity: 'normal', threat: 'normal',
    },
    seed,
  };
}

function summary(state) {
  const width = state.map[0].length;
  const height = state.map.length;
  const density = state.worldSetup.effective.resourceDensityMultiplier;
  return {
    forest: state.map.flat().filter(tile => tile.terrain === 'forest').length,
    deposits: state.map.flat().filter(tile => tile.terrain === 'rock').length,
    habitats: state.habitats.length,
    fishingCapacity: state.fishingGrounds.reduce((sum, ground) => sum + ground.capacity, 0),
    aquiferCapacity: subsurface.aquiferVeins(state.seed, width, height, state.worldSetup.region, density)
      .slice(0, -1).reduce((sum, vein) => sum + vein.capacity, 0),
    oreCapacity: subsurface.oreVeins(state.seed, width, height, state.worldSetup.region, density)
      .reduce((sum, vein) => sum + vein.capacity, 0),
  };
}

const totals = {
  low: { forest: 0, deposits: 0, habitats: 0, fishingCapacity: 0, aquiferCapacity: 0, oreCapacity: 0 },
  normal: { forest: 0, deposits: 0, habitats: 0, fishingCapacity: 0, aquiferCapacity: 0, oreCapacity: 0 },
  high: { forest: 0, deposits: 0, habitats: 0, fishingCapacity: 0, aquiferCapacity: 0, oreCapacity: 0 },
};

for (const seed of [2026080501, 2026080502, 2026080503, 2026080504]) {
  const states = Object.fromEntries(['low', 'normal', 'high'].map(level => [
    level, simulation.newGameFromOptions(options(seed, level)),
  ]));
  const startAquiferCapacities = [];
  for (const level of ['low', 'normal', 'high']) {
    const measured = summary(states[level]);
    for (const key of Object.keys(measured)) totals[level][key] += measured[key];
  }

  assert.deepEqual(states.normal.map, simulation.newGame(seed, 'normal').map,
    '기준 밀도 1은 기존 normal 지도를 그대로 보존한다');
  assert.deepEqual(states.low.map, simulation.newGameFromOptions(options(seed, 'low')).map,
    '같은 시드와 밀도는 같은 지도를 만든다');

  for (const level of ['low', 'normal', 'high']) {
    const state = states[level];
    const nearby = state.map.flat().filter(tile => {
      const distance = Math.abs(tile.x - state.buildings[0].x) + Math.abs(tile.y - state.buildings[0].y);
      return tile.terrain === 'rock' && distance <= 12;
    });
    assert.ok(nearby.some(tile => tile.hasIron), `${level} 밀도에도 시작 철 광상이 있다`);
    assert.ok(nearby.some(tile => !tile.hasIron), `${level} 밀도에도 시작 돌 광상이 있다`);
    const startAquifer = subsurface.aquiferVeins(
      state.seed, state.map[0].length, state.map.length, state.worldSetup.region,
      state.worldSetup.effective.resourceDensityMultiplier,
    ).at(-1);
    startAquiferCapacities.push(startAquifer.capacity);
  }
  assert.deepEqual(startAquiferCapacities, [startAquiferCapacities[0], startAquiferCapacities[0], startAquiferCapacities[0]],
    '밀도 단계와 무관하게 시작 수맥 용량은 고정된다');
}

for (const key of Object.keys(totals.low)) {
  assert.ok(totals.low[key] < totals.normal[key], `${key}: 희소 < 기준이어야 한다`);
  assert.ok(totals.normal[key] < totals.high[key], `${key}: 기준 < 풍부여야 한다`);
}

const custom = simulation.newGameFromOptions({
  ...options(2026080599, 'high'),
  tuning: { startingResources: 'high', resourceDensity: 'high', climateSeverity: 'low', threat: 'low' },
});
assert.equal(saveLoad.saveGame(custom, 3), true);
const loaded = saveLoad.loadGame(3);
assert.equal(loaded.worldSetup.difficultyPreset, 'custom');
assert.deepEqual(loaded.worldSetup.tuning, custom.worldSetup.tuning);
assert.deepEqual(loaded.worldSetup.effective, custom.worldSetup.effective,
  '사용자 설정의 실효값은 저장 왕복 뒤에도 당시 스냅샷을 유지한다');

console.log('new-game tuning S6 resource tests passed');
