// 튜토리얼 시나리오 완주 회귀 테스트.
// 목적: 게임이 계속 바뀌어도 튜토리얼이 살아 있는지 헤드리스로 검증한다.
//  - 고정 시드 생성이 결정론적인지
//  - 각 스텝이 "모범 답안" 상태에서 제한 일수 안에 넘어가는지
//  - 시나리오 중 스크립트되지 않은 랜덤 모달이 뜨지 않는지 (허용: scenario, tribute)
//  - 코드의 튜토리얼 버전이 바뀌면 저장이 일반 모드로 해제되는지
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

const compiledDir = compileGameModules();
const simulation = await import(pathToFileURL(join(compiledDir, 'simulation.mjs')).href);
const scenario = await import(pathToFileURL(join(compiledDir, 'scenario.mjs')).href);
const tutorialStart = await import(pathToFileURL(join(compiledDir, 'tutorialStart.mjs')).href);
const crops = await import(pathToFileURL(join(compiledDir, 'crops.mjs')).href);
const saveLoad = await import(pathToFileURL(join(compiledDir, 'saveLoad.mjs')).href);
const seasons = await import(pathToFileURL(join(compiledDir, 'seasons.mjs')).href);
const coachSource = readFileSync(new URL('../../src/components/TutorialCoach.tsx', import.meta.url), 'utf8');

// 시나리오 중 허용되는 모달 — scenario(길잡이), tribute(결정론적 세공 수거)
const ALLOWED_MODAL_KINDS = new Set(['scenario', 'tribute']);

function closeModals(state) {
  let guard = 0;
  while (state.pendingChoice) {
    assert.ok(guard++ < 10, 'modal resolution loop stuck');
    const kind = state.pendingChoice.kind;
    assert.ok(
      ALLOWED_MODAL_KINDS.has(kind),
      `unscripted modal during tutorial: ${kind} (${state.pendingChoice.title})`,
    );
    const option = state.pendingChoice.options.find(candidate => !candidate.disabled);
    assert.ok(option, `no selectable option in ${kind} modal`);
    simulation.resolveChoice(state, option.id);
  }
}

// 테스트는 시나리오 엔진을 검증한다 — 생존 자체는 검증 대상이 아니므로 곳간을 받쳐 준다
function keepAlive(state) {
  state.resources.grain = Math.max(state.resources.grain, 150);
  state.resources.firewood = Math.max(state.resources.firewood, 60);
}

function pushBuilt(state, type, extra = {}) {
  state.buildings.push({
    id: state.nextBuildingId++,
    type, x: 1, y: 1, progress: 99, built: true, fieldGrowth: 0,
    ...extra,
  });
}

{
  // 결정론: 같은 시드에서 같은 시작 상태가 나온다
  const a = tutorialStart.createTutorialGame();
  const b = tutorialStart.createTutorialGame();
  assert.equal(a.seed, b.seed);
  assert.equal(a.seed, tutorialStart.TUTORIAL_SEED);
  assert.deepEqual(a.resources, b.resources);
  assert.equal(
    a.map.map(row => row.map(tile => tile.terrain).join('')).join('|'),
    b.map.map(row => row.map(tile => tile.terrain).join('')).join('|'),
  );
  // 시작 불변식: 사냥 스텝에 필요한 활성 서식지
  assert.ok(a.habitats.some(habitat => habitat.active), 'tutorial map has an active habitat');
  assert.equal(a.buildings.some(building => building.type === 'woodShed'), false, 'tutorial starts before the wood yard lesson');
  assert.equal(a.scenario.flags.woodShedGoal, 1, 'firewood lesson requires one newly completed wood yard');
  // 첫 안내가 게임 시작과 동시에 열려 있다
  assert.equal(a.pendingChoice?.kind, 'scenario');
}

{
  // 파종은 장작·주거보다 먼저 열려 정상 진행에서 봄 파종창을 놓치지 않는다.
  assert.deepEqual(
    scenario.TUTORIAL_STEPS.slice(0, 4).map(step => step.id),
    ['wake', 'sowing', 'firewood', 'housing'],
  );
  const state = tutorialStart.createTutorialGame();
  closeModals(state);
  scenario.markScenarioFlag(state, 'residentSelected');
  keepAlive(state);
  simulation.advanceDay(state);
  assert.equal(scenario.currentScenarioStep(state)?.id, 'sowing');
  assert.equal(seasons.getSeason(state.day), 'spring', 'the natural second tutorial step opens during planting season');
}

{
  // 장작 재고만 미리 쌓아도 장작마당과 장작꾼 안내를 건너뛸 수 없다.
  const state = tutorialStart.createTutorialGame();
  const firewoodStep = scenario.TUTORIAL_STEPS.find(step => step.id === 'firewood');
  assert.ok(firewoodStep);
  state.resources.firewood = (state.scenario.flags.firewoodGoal ?? 0) + 5;
  assert.equal(firewoodStep.isDone(state), false, 'stockpile alone does not skip the wood yard lesson');
  pushBuilt(state, 'woodShed');
  assert.equal(firewoodStep.isDone(state), false, 'a completed yard still needs an assigned wood splitter');
  const worker = state.residents.find(resident => resident.alive && !resident.special);
  assert.ok(worker);
  worker.job = 'woodSplitter';
  assert.equal(firewoodStep.isDone(state), true, 'yard, worker, and stockpile complete the lesson together');

  const buildHint = coachSource.indexOf("{ tut: 'build-item-woodShed'");
  const workerHint = coachSource.indexOf("{ tut: 'job-detail-woodSplitter'");
  assert.ok(buildHint >= 0 && workerHint > buildHint, 'coach points to wood yard construction before staffing');
  assert.match(coachSource, /coachHorizontalPlacement\(rect\.left \+ rect\.width \/ 2, window\.innerWidth\)/,
    'coach bubble placement follows the actual center of its target');
  assert.match(coachSource, /'--coach-arrow-offset': `\$\{arrowOffset\}px`/,
    'coach bubble exposes an independent arrow offset when its body is clamped to the viewport');
}

{
  // 완주: 각 스텝의 모범 답안 → 제한 일수 안에 다음 스텝
  const state = tutorialStart.createTutorialGame();
  const solvers = {
    wake: s => scenario.markScenarioFlag(s, 'residentSelected'),
    firewood: s => {
      pushBuilt(s, 'woodShed');
      const worker = s.residents.find(resident => resident.alive && !resident.special && resident.job !== 'woodSplitter');
      if (worker) worker.job = 'woodSplitter';
      s.resources.firewood = (s.scenario.flags.firewoodGoal ?? 0) + 5;
    },
    housing: s => pushBuilt(s, 'hut'),
    sowing: s => pushBuilt(s, 'field', {
      w: 2, h: 2, sownArea: 4, cropId: crops.defaultCropForBuildingType('field'), queuedCropId: null,
    }),
    hunting: s => {
      const candidates = s.residents.filter(r => r.alive && !r.special && r.job !== 'hunter');
      for (const resident of candidates.slice(0, 2)) resident.job = 'hunter';
      s.resources.meat = (s.scenario.flags.meatGoal ?? 0) + 10;
    },
    defense: s => {
      pushBuilt(s, 'palisade');
      const guard = s.residents.find(r => r.alive && !r.special && r.job !== 'militia');
      if (guard) guard.job = 'militia';
    },
    tribute: s => { s.tributeReserve.grain = (s.tributeReserve.grain ?? 0) + 3; },
    winter: () => {},
  };

  for (let index = 0; index < scenario.TUTORIAL_STEPS.length; index++) {
    const step = scenario.TUTORIAL_STEPS[index];
    assert.equal(state.scenario.stepIndex, index, `at step ${step.id}`);
    closeModals(state);
    assert.ok(solvers[step.id], `solver missing for step ${step.id} — add one when adding steps`);
    solvers[step.id](state);
    let guard = 0;
    while (state.scenario && !state.scenario.completed && state.scenario.stepIndex === index) {
      assert.ok(guard++ < 40, `step ${step.id} did not complete within 40 days`);
      // 스텝 조건을 소비가 되돌리지 않게 유지
      if (step.id === 'hunting') state.resources.meat = Math.max(state.resources.meat, (state.scenario.flags.meatGoal ?? 0) + 5);
      keepAlive(state);
      simulation.advanceDay(state);
      assert.equal(state.gameOver, null, `game over during step ${step.id}`);
      closeModals(state);
    }
    if (state.scenario == null || state.scenario.completed) break;
  }

  // 완료 모달의 '계속하기'까지 닫으면 시나리오가 해제되고 일반 모드가 된다
  closeModals(state);
  if (state.scenario?.completed) {
    // 완료 모달이 다음 날 열리는 경로
    keepAlive(state);
    simulation.advanceDay(state);
    closeModals(state);
  }
  assert.equal(state.scenario, null, 'tutorial hands off to normal play');
  assert.ok(state.log.some(entry => entry.text.includes('길잡이를 마쳤습니다')));
}

{
  // 버전 해제: 코드의 튜토리얼 버전이 바뀌면 저장은 일반 모드로 이어진다
  globalThis.localStorage = {
    store: {},
    getItem(key) { return this.store[key] ?? null; },
    setItem(key, value) { this.store[key] = String(value); },
    removeItem(key) { delete this.store[key]; },
  };
  const state = tutorialStart.createTutorialGame();
  state.pendingChoice = null; // 모달은 저장 대상이지만 여기선 진행 위치만 본다
  assert.equal(saveLoad.saveGame(state, 1), true);
  const raw = JSON.parse(globalThis.localStorage.getItem('buksae-save-v3'));
  raw.scenario.version += 1; // 미래의 튜토리얼 개정을 흉내낸다
  globalThis.localStorage.setItem('buksae-save-v3', JSON.stringify(raw));
  const loaded = saveLoad.loadGame(1);
  assert.ok(loaded, 'outdated tutorial save still loads');
  assert.equal(loaded.scenario, null, 'outdated tutorial is detached to normal mode');
  assert.ok(loaded.log.some(entry => entry.text.includes('길잡이 시나리오가 갱신')));
  delete globalThis.localStorage;
}

console.log('tutorial scenario tests passed');
