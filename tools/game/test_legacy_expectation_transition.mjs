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
const simulation = await load('simulation');
const saveLoad = await load('saveLoad');
const morale = await load('morale');
const { CONFIG } = await load('config');

const SAVE_KEY = 'buksae-save-v3';
const TRANSITION_LOG = '마을의 규모가 커지며 주민들이 바라는 살림의 기준도 달라졌습니다.';
const GOOD_INPUTS = {
  foodOk: true,
  warmthAvg: 80,
  dietVarietyScore: 1,
  clothesCoverage: 1,
};

function putRaw(state, schemaVersion) {
  store.set(SAVE_KEY, JSON.stringify({ ...state, schemaVersion }));
}

function transitionLogs(state) {
  return state.log.filter(entry => entry.text.includes(TRANSITION_LOG));
}

assert.equal(saveLoad.CURRENT_SCHEMA_VERSION, 29,
  'legacy expectation transition remains compatible through the facing schema migration');
assert.ok(CONFIG.satisfaction.legacyTransitionDays > 0);
assert.ok(CONFIG.satisfaction.legacyTransitionCheer > 0);

// 만족도 도입 이전의 보·진·부 저장은 현재 일자부터 한 번의 적응 기간을 받는다.
for (const [rank, seed] of [['bo', 2026071801], ['jin', 2026071802], ['bu', 2026071803]]) {
  const legacy = simulation.newGame(seed);
  legacy.rank = rank;
  legacy.day = 137;
  delete legacy.expectationTransitionUntil;
  delete legacy.expectationTransitionNotified;
  putRaw(legacy, 21);

  const loaded = saveLoad.loadGame();
  assert.ok(loaded, `${rank} legacy save loads`);
  assert.equal(
    loaded.expectationTransitionUntil,
    legacy.day + CONFIG.satisfaction.legacyTransitionDays,
    `${rank} receives the full transition window`,
  );
  assert.equal(loaded.expectationTransitionNotified, true);
  assert.equal(transitionLogs(loaded).length, 1, `${rank} receives one important transition log`);
  assert.equal(transitionLogs(loaded)[0].important, true);
}

// 정착지·새 게임·현재 스키마 저장에는 적응 완충을 만들지 않는다.
{
  const legacySettlement = simulation.newGame(2026071804);
  legacySettlement.rank = 'settlement';
  legacySettlement.day = 75;
  putRaw(legacySettlement, 21);
  const loaded = saveLoad.loadGame();
  assert.ok(loaded);
  assert.equal(loaded.expectationTransitionUntil, undefined);
  assert.equal(transitionLogs(loaded).length, 0);

  const fresh = simulation.newGame(2026071805);
  assert.equal(fresh.expectationTransitionUntil, undefined);
  assert.equal(morale.moraleBreakdown(fresh, GOOD_INPUTS)
    .some(factor => factor.id === 'legacy-expectation-transition'), false);

  const current = simulation.newGame(2026071806);
  current.rank = 'bu';
  current.day = 91;
  assert.equal(saveLoad.saveGame(current), true);
  const currentLoaded = saveLoad.loadGame();
  assert.ok(currentLoaded);
  assert.equal(currentLoaded.expectationTransitionUntil, undefined);
  assert.equal(transitionLogs(currentLoaded).length, 0);
}

// 기간과 로그는 저장 후 재로드해도 재연장·중복되지 않으며 더 긴 기존 기간을 줄이지 않는다.
{
  const legacy = simulation.newGame(2026071807);
  legacy.rank = 'jin';
  legacy.day = 211;
  putRaw(legacy, 21);
  const first = saveLoad.loadGame();
  assert.ok(first);
  const firstUntil = first.expectationTransitionUntil;
  assert.equal(saveLoad.saveGame(first), true);
  const reloaded = saveLoad.loadGame();
  assert.ok(reloaded);
  assert.equal(reloaded.expectationTransitionUntil, firstUntil);
  assert.equal(transitionLogs(reloaded).length, 1);

  const longer = simulation.newGame(2026071808);
  longer.rank = 'bo';
  longer.day = 40;
  longer.expectationTransitionUntil = 999;
  longer.expectationTransitionNotified = true;
  putRaw(longer, 21);
  const longerLoaded = saveLoad.loadGame();
  assert.ok(longerLoaded);
  assert.equal(longerLoaded.expectationTransitionUntil, 999);
  assert.equal(transitionLogs(longerLoaded).length, 0, 'an already-notified transition does not log again');
}

// 적응 기간의 민심 목표는 정확히 설정값만큼 완충되고 실제 승격 버프와는 별도다.
{
  const legacy = simulation.newGame(2026071809);
  legacy.rank = 'bu';
  legacy.day = 120;
  legacy.promotionCheerUntil = 0;
  putRaw(legacy, 21);
  const loaded = saveLoad.loadGame();
  assert.ok(loaded);
  const activeTarget = morale.moraleTarget(loaded, GOOD_INPUTS);
  const transitionFactor = morale.moraleBreakdown(loaded, GOOD_INPUTS)
    .find(factor => factor.id === 'legacy-expectation-transition');
  assert.equal(transitionFactor?.delta, CONFIG.satisfaction.legacyTransitionCheer);

  loaded.day = loaded.expectationTransitionUntil;
  const expiredTarget = morale.moraleTarget(loaded, GOOD_INPUTS);
  assert.equal(activeTarget - expiredTarget, CONFIG.satisfaction.legacyTransitionCheer);
  assert.equal(loaded.promotionCheerUntil, 0, 'legacy adaptation never reuses the promotion timer');
}

console.log('legacy expectation transition tests passed');
