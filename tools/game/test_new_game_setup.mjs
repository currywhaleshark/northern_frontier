// 새 게임 설정 S0+S1 — 옵션 계약, 시작 경로, 저장 문맥 회귀.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-new-game-setup-'));
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
const saveLoad = await load('saveLoad');
const tutorialStart = await load('tutorialStart');
const { CONFIG } = await load('config');

// P0/S3: 기본 입력, 프리셋 실효값, 지역 잠금과 지도 크기 정규화 결정론.
{
  const defaults = options.defaultNewGameOptions();
  assert.deepEqual(
    [defaults.difficultyPreset, defaults.baseDifficulty, defaults.region, defaults.mapSize],
    ['normal', 'normal', 'plains', 'medium'],
    '기본 시작 설정은 normal 평원 중형이다',
  );
  assert.deepEqual(defaults.tuning, {
    startingResources: 'normal', resourceDensity: 'normal', climateSeverity: 'normal', threat: 'normal',
  });

  for (const difficulty of ['easy', 'normal', 'hard']) {
    const setup = options.worldSetupSnapshot(options.optionsForDifficulty(difficulty), 'manual');
    const expected = CONFIG.difficulty[difficulty];
    assert.deepEqual(
      [setup.effective.startResourceMultiplier, setup.effective.threatGainMultiplier,
        setup.effective.raidPowerMultiplier, setup.effective.habitatChance],
      [expected.startRes, expected.threatGain, expected.raidPower, expected.habitatChance],
      `${difficulty} 프리셋은 기존 난이도 실효값을 그대로 쓴다`,
    );
    assert.equal(setup.effective.resourceDensityMultiplier,
      difficulty === 'easy' ? 1.25 : difficulty === 'hard' ? 0.75 : 1);
    assert.equal(setup.effective.climateSeverityMultiplier,
      difficulty === 'easy' ? 0.85 : difficulty === 'hard' ? 1.2 : 1);
  }

  const custom = options.normalizeNewGameOptions({
    ...options.optionsForDifficulty('hard'),
    difficultyPreset: 'custom',
    tuning: { startingResources: 'high', resourceDensity: 'low', climateSeverity: 'low', threat: 'normal' },
  });
  assert.equal(custom.baseDifficulty, 'hard', '개별 노브는 바탕 난이도를 보존한다');
  assert.equal(custom.difficultyPreset, 'custom');
  assert.deepEqual(options.worldSetupSnapshot(custom, 'manual').effective, {
    startResourceMultiplier: 1.5,
    threatGainMultiplier: 1,
    raidPowerMultiplier: 1,
    habitatChance: 0.45,
    resourceDensityMultiplier: 0.75,
    climateSeverityMultiplier: 0.85,
  });

  const mountain = {
    settlementName: '  설한촌  ', difficultyPreset: 'hard', baseDifficulty: 'hard',
    region: 'mountain', mapSize: 'large', seed: 123.9,
  };
  const normalized = options.normalizeNewGameOptions(mountain);
  assert.equal(normalized.settlementName, '설한');
  assert.equal(normalized.region, 'mountain', 'S3부터 산지는 선택값을 보존한다');
  assert.equal(normalized.mapSize, 'large', 'S2부터 유효한 지도 크기는 보존한다');
  assert.equal(normalized.seed, 123, '시드는 안전한 정수로 정규화한다');
  assert.deepEqual(options.normalizeNewGameOptions(mountain), normalized,
    '같은 수동 시드와 옵션 정규화는 결정적이다');
  assert.equal(options.worldSetupLabel(normalized), '산지의 대형 개척지');

  const lake = options.normalizeNewGameOptions({ ...mountain, region: 'lake' });
  assert.equal(lake.region, 'lake', 'S4부터 호수는 선택값을 보존한다');
  assert.equal(options.worldSetupLabel(lake), '호수의 대형 개척지');

  const coast = options.normalizeNewGameOptions({ ...mountain, region: 'coast' });
  assert.equal(coast.region, 'coast', 'S5부터 해안은 선택값을 보존한다');
  assert.equal(options.worldSetupLabel(coast), '해안의 대형 개척지');

  assert.deepEqual(options.mapDimensionsForSize('small'), { width: 56, height: 56 });
  assert.deepEqual(options.mapDimensionsForSize('medium'), { width: 72, height: 72 });
  assert.deepEqual(options.mapDimensionsForSize('large'), { width: 96, height: 96 });
  assert.equal(options.mapSizeForDimensions(56, 56), 'small');
  assert.equal(options.mapSizeForDimensions(72, 72), 'medium');
  assert.equal(options.mapSizeForDimensions(96, 96), 'large');
  assert.equal(options.mapSizeForDimensions(64, 64), null);
}

// P1: 새 게임은 옵션만 받아 worldSetup을 남기며, 이름 정규화는 시뮬레이션 RNG를 바꾸지 않는다.
{
  assert.equal(typeof simulation.newGameFromOptions, 'function',
    '새 UI의 시작 경로는 options 전용 생성기를 사용한다');
  const raw = {
    settlementName: '  설한촌 ', difficultyPreset: 'normal', baseDifficulty: 'normal',
    region: 'plains', mapSize: 'medium',
    tuning: { startingResources: 'normal', resourceDensity: 'normal', climateSeverity: 'normal', threat: 'normal' },
    seed: 20260802,
  };
  const first = simulation.newGameFromOptions(raw);
  const second = simulation.newGameFromOptions({ ...raw, settlementName: '다른골' });
  assert.equal(first.seed, raw.seed);
  assert.equal(first.worldSetup.seedSource, 'manual');
  assert.equal(first.worldSetup.region, 'plains');
  assert.equal(first.worldSetup.mapSize, 'medium');
  assert.deepEqual(first.worldSetup.effective, options.worldSetupSnapshot(raw, 'manual').effective);
  assert.deepEqual(first.map, second.map, '이름 정규화는 지도 RNG를 소비하지 않는다');
  assert.deepEqual(
    first.residents.map(resident => [resident.name, resident.x, resident.y]),
    second.residents.map(resident => [resident.name, resident.x, resident.y]),
    '이름 정규화는 주민 RNG를 소비하지 않는다',
  );
  assert.match(first.annals.find(entry => entry.kind === 'founding')?.text ?? '', /평원의 중형 개척지/,
    '창건 연대기는 시작 설정 문맥을 한 번 남긴다');
}

// P1: v56 저장은 기본 설정으로 v57 중간 단계에 이관되며 현재 스키마는 저수조 상태를 포함한 v62이다.
{
  assert.equal(saveLoad.CURRENT_SCHEMA_VERSION, 62, '빗물 저수조 상태 저장 스키마는 v62이다');
  assert.equal(typeof saveLoad.migrateV56ToV57, 'function');
  const migrated = saveLoad.migrateV56ToV57({ schemaVersion: 56, difficulty: 'hard' });
  assert.equal(migrated.schemaVersion, 57);
  assert.deepEqual(
    [migrated.worldSetup.region, migrated.worldSetup.mapSize, migrated.worldSetup.baseDifficulty,
      migrated.worldSetup.difficultyPreset, migrated.worldSetup.seedSource],
    ['plains', 'medium', 'hard', 'hard', 'legacy'],
    'v56 저장은 기존 난이도와 평원·중형 기본값을 보존한다',
  );
  const state = simulation.newGameFromOptions({
    ...options.optionsForDifficulty('easy', '솔바람', 17), seed: 17,
  });
  assert.equal(saveLoad.saveGame(state, 2), true);
  const summary = saveLoad.readSaveSlotSummary(2);
  assert.deepEqual([summary.region, summary.mapSize, summary.difficultyPreset], ['plains', 'medium', 'easy']);
}

// P1: 길잡이는 설정 화면을 거치지 않고도 고정 시드와 명시적 worldSetup을 유지한다.
{
  const tutorial = tutorialStart.createTutorialGame();
  assert.equal(tutorial.seed, tutorialStart.TUTORIAL_SEED);
  assert.deepEqual(
    [tutorial.worldSetup.region, tutorial.worldSetup.mapSize, tutorial.worldSetup.seedSource],
    ['plains', 'medium', 'tutorial'],
  );
  assert.deepEqual(
    [tutorial.worldSetup.effective.resourceDensityMultiplier,
      tutorial.worldSetup.effective.climateSeverityMultiplier],
    [1, 1],
    '길잡이는 설정 화면을 우회하며 기존 기준 지도·기후를 고정한다',
  );
}

// P3: 메뉴 → launch → session은 난이도/이름 개별 필드를 되살리지 않고 options 객체를 전달한다.
{
  const appSource = readFileSync(new URL('../../src/App.tsx', import.meta.url), 'utf8');
  const launchSource = readFileSync(new URL('../../src/sessionLaunch.ts', import.meta.url), 'utf8');
  const sessionSource = readFileSync(new URL('../../src/GameSession.tsx', import.meta.url), 'utf8');
  const menuSource = readFileSync(new URL('../../src/components/MainMenu.tsx', import.meta.url), 'utf8');
  assert.match(appSource, /menuView[^\n]*'newGameSetup'/);
  assert.match(appSource, /NewGameSetup/);
  assert.match(launchSource, /kind:\s*'new';\s*options:\s*NewGameOptions/);
  assert.match(sessionSource, /newGameFromOptions\(launch\.options\)/);
  assert.doesNotMatch(menuSource, /settlement-name-input|diff-card/,
    '메인 메뉴에는 시작 설정 입력을 두지 않는다');
  assert.match(menuSource, /시작/);
  assert.match(menuSource, /이어하기/);
  assert.match(menuSource, /튜토리얼/);
  const setupSource = readFileSync(new URL('../../src/components/NewGameSetup.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(setupSource, /세부 설정 <span>준비 중|<select disabled/,
    'S6 세부설정은 잠금이나 준비 중 표기를 남기지 않는다');
  assert.match(setupSource, /difficultyPreset: 'custom'/,
    '개별 노브 선택은 사용자 설정으로 전환한다');
  for (const label of ['시작 물자', '자원 밀도', '기후 혹독도', '위협']) {
    assert.match(setupSource, new RegExp(label));
  }
}

console.log('new-game setup tests passed');
