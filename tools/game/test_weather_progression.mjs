import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

class MemoryStorage {
  #values = new Map();
  getItem(key) { return this.#values.get(key) ?? null; }
  setItem(key, value) { this.#values.set(key, String(value)); }
  removeItem(key) { this.#values.delete(key); }
  clear() { this.#values.clear(); }
}

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-weather-progression-'));
  for (const file of readdirSync(srcDir).filter(file => file.endsWith('.ts'))) {
    const source = readFileSync(new URL(file, srcDir), 'utf8');
    let output = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    output = output.replace(/(from\s+['"])(\.{1,2}\/[^'"]+)(['"])/g, (_match, start, specifier, end) =>
      /\.[cm]?js$/.test(specifier) ? `${start}${specifier}${end}` : `${start}${specifier}.mjs${end}`);
    writeFileSync(join(outDir, file.replace(/\.ts$/, '.mjs')), output, 'utf8');
  }
  return outDir;
}

const simulationSource = readFileSync(new URL('../../src/game/simulation.ts', import.meta.url), 'utf8');
assert.match(simulationSource,
  /\/\/ 기존 날씨 추첨[\s\S]*?rng\(\);\s*state\.weather = weatherForDay\(s, 1\);/,
  'new-game weather must retain the one historical shared RNG draw before using the schedule');
assert.match(simulationSource,
  /\/\/ 날씨는 순수한 연간 표[\s\S]*?rng\(\);\s*state\.weather = weatherForDay\(state\.seed, state\.day\);/,
  'daily weather must retain the one historical shared RNG draw before using the schedule');

function sourceBetween(startMarker, endMarker) {
  const start = simulationSource.indexOf(startMarker);
  const end = simulationSource.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0 && end > start, `missing source boundary: ${startMarker} .. ${endMarker}`);
  return simulationSource.slice(start + startMarker.length, end);
}

assert.equal(
  (sourceBetween('reconcileResidentHomes(state, rng);', 'state.resources.defense =')
    .match(/\brng\(\)/g) ?? []).length,
  1,
  'new-game weather block must consume the shared RNG exactly once',
);
assert.equal(
  (sourceBetween('const prevWeather = state.weather;', 'regrowForest(state, rng, season);')
    .match(/\brng\(\)/g) ?? []).length,
  1,
  'daily weather block must consume the shared RNG exactly once before later daily systems',
);

globalThis.localStorage = new MemoryStorage();
const compiledDir = compileGameModules();
try {
  const load = name => import(pathToFileURL(join(compiledDir, `${name}.mjs`)).href);
  const simulation = await load('simulation');
  const weather = await load('weather');
  const saveLoad = await load('saveLoad');
  const advanceNextCompletedDay = state => {
    const targetDay = state.day + 1;
    // 이 테스트는 날씨 교체 시점만 본다. 일일 사건 모달은 실제 게임처럼
    // 시간을 멈추므로, 다음 날 진행 전에는 닫아 둔다.
    for (let attempts = 0; state.day < targetDay && attempts < 3; attempts++) {
      state.pendingChoice = null;
      simulation.advanceDay(state);
    }
    assert.equal(state.day, targetDay, 'a completed day must advance exactly once');
  };

  const seed = 2026072803;
  const state = simulation.newGame(seed);
  assert.equal(state.day, 1);
  assert.equal(state.weather, weather.weatherForDay(seed, 1),
    'a new game starts with the scheduled first-day weather');

  for (let day = 2; day <= 8; day++) {
    advanceNextCompletedDay(state);
    assert.equal(state.day, day);
    assert.equal(state.weather, weather.weatherForDay(seed, day),
      `day ${day} applies the deterministic annual weather schedule`);
  }

  const persisted = simulation.newGame(2026072804);
  persisted.weather = 'blizzard';
  saveLoad.saveGame(persisted, 1);
  const loaded = saveLoad.loadGame(1);
  assert.ok(loaded, 'saved game must load');
  assert.equal(loaded.weather, 'blizzard',
    'loading must leave the saved current-day weather untouched');
  advanceNextCompletedDay(loaded);
  assert.equal(loaded.day, 2);
  assert.equal(loaded.weather, weather.weatherForDay(loaded.seed, 2),
    'the next completed day replaces a loaded weather value with the schedule');
} finally {
  rmSync(compiledDir, { recursive: true, force: true });
  delete globalThis.localStorage;
}

console.log('weather progression tests passed');
