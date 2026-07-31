// 튜토리얼 시나리오 완주 회귀 테스트.
// 목적: 게임이 계속 바뀌어도 튜토리얼이 살아 있는지 헤드리스로 검증한다.
//  - 고정 시드 생성이 결정론적인지, 시작 불변식(서식지·물 자리)이 서는지
//  - 각 스텝이 "모범 답안" 상태에서 제한 일수 안에 넘어가는지
//  - 파종은 배치만으로 끝나고, 집·장작 스텝이 끝날 때 파종이 병행 완료되는지
//  - 시나리오 중 스크립트되지 않은 랜덤 모달이 뜨지 않는지 (허용: scenario, tribute)
//  - 통제 사건(첫 병자·혹한 경고)이 스텝 훅으로만 일어나는지
//  - 코드의 튜토리얼 버전이 바뀌면 저장이 일반 모드로 해제되는지
//  - 초회 도움말(guides)이 새 게임에서 켜지고 구버전 저장에서는 꺼지는지
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
const guides = await import(pathToFileURL(join(compiledDir, 'guides.mjs')).href);
const saveLoad = await import(pathToFileURL(join(compiledDir, 'saveLoad.mjs')).href);
const saveSchema = await import(pathToFileURL(join(compiledDir, 'saveSchema.mjs')).href);
const seasons = await import(pathToFileURL(join(compiledDir, 'seasons.mjs')).href);
const winter = await import(pathToFileURL(join(compiledDir, 'winterReadiness.mjs')).href);
const coachSource = readFileSync(new URL('../../src/components/TutorialCoach.tsx', import.meta.url), 'utf8');

// 시나리오 중 허용되는 모달 — scenario(길잡이), tribute(결정론적 세공 수거)
const ALLOWED_MODAL_KINDS = new Set(['scenario', 'tribute']);

// 11스텝의 id — 계획서 §3 단계표. 순서가 바뀌면 코치·문구도 함께 손봐야 한다.
const EXPECTED_STEP_IDS = [
  'naming', 'working', 'sowing', 'hearth', 'water', 'hunting',
  'patient', 'tribute', 'defense', 'stocktake', 'winter',
];

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

// UI 훅 플래그는 컴포넌트가 연결한다(M2) — 여기서는 테스트가 직접 주입한다
function markFlags(state, ...keys) {
  for (const key of keys) scenario.markScenarioFlag(state, key);
}

function stepById(id) {
  const step = scenario.TUTORIAL_STEPS.find(candidate => candidate.id === id);
  assert.ok(step, `step ${id} missing`);
  return step;
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
  // 시작 불변식(신규): 물 스텝에 필요한 수맥 또는 강 급수권이 마을 곁에 있다
  const water = tutorialStart.tutorialWaterAccess(a);
  assert.ok(
    water.wellSpots > 0 || water.naturalWaterTiles > 0,
    `tutorial seed lacks water for the well lesson (${JSON.stringify(water)}) — pick a new seed`,
  );
  assert.equal(
    a.log.some(entry => entry.text.includes('물 자리가 없습니다')), false,
    'the water invariant does not fire on the chosen seed',
  );
  assert.equal(a.buildings.some(building => building.type === 'woodShed'), false, 'tutorial starts before the wood yard lesson');
  assert.equal(a.scenario.flags.woodShedGoal, 1, 'the hearth lesson requires one newly completed wood yard');
  assert.equal(a.scenario.flags.sownAreaGoal > 0, true, 'the sowing goal is injected as a flag');
  // 첫 안내가 게임 시작과 동시에 열려 있다
  assert.equal(a.pendingChoice?.kind, 'scenario');
  // 초회 도움말은 새 게임에서 켜진 채로 시작한다 (일반 게임 포함)
  assert.equal(a.guides?.enabled, true);
  assert.deepEqual(a.guides.seen, {});
}

{
  // 11스텝 구성과 버전
  assert.deepEqual(scenario.TUTORIAL_STEPS.map(step => step.id), EXPECTED_STEP_IDS);
  assert.equal(scenario.TUTORIAL_SCENARIO_VERSION, 3);
}

{
  // 파종은 집·장작보다 먼저 열려 정상 진행에서 봄 파종창을 놓치지 않는다.
  const state = tutorialStart.createTutorialGame();
  closeModals(state);
  markFlags(state, 'residentSelected', 'minimapClicked', 'speedChanged');
  keepAlive(state);
  simulation.advanceDay(state);
  assert.equal(scenario.currentScenarioStep(state)?.id, 'working');
  markFlags(state, 'jobPanelOpened');
  closeModals(state);
  keepAlive(state);
  simulation.advanceDay(state);
  assert.equal(scenario.currentScenarioStep(state)?.id, 'sowing');
  assert.equal(seasons.getSeason(state.day), 'spring', 'the sowing step opens during planting season');
}

{
  // 2단계는 "배치"에서 끝난다 — 공사도 파종도 기다리지 않는다 (계획 §2-가)
  const state = tutorialStart.createTutorialGame();
  const sowingStep = stepById('sowing');
  const goal = state.scenario.flags.sownAreaGoal;
  assert.equal(sowingStep.isDone(state), false, 'an empty settlement has not placed any plots yet');
  state.buildings.push({
    id: state.nextBuildingId++, type: 'field', x: 1, y: 1, progress: 0, built: false,
    fieldGrowth: 0, w: 2, h: 2, sownArea: 0,
    cropId: crops.defaultCropForBuildingType('field'), queuedCropId: null,
  });
  assert.equal(sowingStep.isDone(state), true, 'placing four tiles completes the sowing step before any plowing');

  // 3단계는 그 파종이 실제로 끝나야 넘어간다 — 병행 구조의 잠금장치
  const hearthStep = stepById('hearth');
  state.resources.firewood = (state.scenario.flags.firewoodGoal ?? 0) + 5;
  pushBuilt(state, 'woodShed');
  pushBuilt(state, 'hut');
  const splitter = state.residents.find(resident => resident.alive && !resident.special);
  splitter.job = 'woodSplitter';
  assert.equal(hearthStep.isDone(state), false, 'houses and firewood alone do not finish the hearth step');
  state.buildings.find(building => building.type === 'field').sownArea = goal;
  assert.equal(hearthStep.isDone(state), true, 'the farmer finishing the sowing closes the hearth step');
}

{
  // 장작 재고만 미리 쌓아도 장작마당과 장작꾼 안내를 건너뛸 수 없다.
  const state = tutorialStart.createTutorialGame();
  const hearthStep = stepById('hearth');
  state.resources.firewood = (state.scenario.flags.firewoodGoal ?? 0) + 5;
  assert.equal(hearthStep.isDone(state), false, 'stockpile alone does not skip the wood yard lesson');
  pushBuilt(state, 'woodShed');
  pushBuilt(state, 'hut');
  pushBuilt(state, 'field', { w: 2, h: 2, sownArea: state.scenario.flags.sownAreaGoal });
  assert.equal(hearthStep.isDone(state), false, 'a completed yard still needs an assigned wood splitter');
  const worker = state.residents.find(resident => resident.alive && !resident.special);
  assert.ok(worker);
  worker.job = 'woodSplitter';
  assert.equal(hearthStep.isDone(state), true, 'yard, worker, stockpile and sowing complete the lesson together');

  const buildHint = coachSource.indexOf("{ tut: 'build-item-woodShed'");
  const workerHint = coachSource.indexOf("{ tut: 'job-detail-woodSplitter'");
  assert.ok(buildHint >= 0 && workerHint > buildHint, 'coach points to wood yard construction before staffing');
  assert.match(coachSource, /coachHorizontalPlacement\(rect\.left \+ rect\.width \/ 2, window\.innerWidth\)/,
    'coach bubble placement follows the actual center of its target');
  assert.match(coachSource, /'--coach-arrow-offset': `\$\{arrowOffset\}px`/,
    'coach bubble exposes an independent arrow offset when its body is clamped to the viewport');
}

{
  // UI 훅 플래그가 없으면 해당 스텝은 절대 넘어가지 않는다 (M2에서 컴포넌트가 연결한다)
  const state = tutorialStart.createTutorialGame();
  pushBuilt(state, 'well');
  assert.equal(stepById('water').isDone(state), false, 'the water step waits for the aquifer layer to be opened');
  markFlags(state, 'aquiferToggled');
  assert.equal(stepById('water').isDone(state), true, 'an opened aquifer tab plus a finished well closes the water step');

  state.tributeReserve.grain = 3;
  assert.equal(stepById('tribute').isDone(state), false, 'the tribute step waits for the court window');
  markFlags(state, 'courtWindowOpened');
  assert.equal(stepById('tribute').isDone(state), true);
}

{
  // 혹한 통제 사건: 겨울 n일째에 한 번만 발화하고 그날 땔감을 더 태운다 (기후 시스템은 건드리지 않는다)
  const state = tutorialStart.createTutorialGame();
  state.pendingChoice = null;
  let winterDay = state.day;
  while (!(seasons.getSeason(winterDay) === 'winter' && seasons.getDayOfSeason(winterDay) === 4)) winterDay++;
  state.day = winterDay;
  state.scenario.stepIndex = EXPECTED_STEP_IDS.indexOf('winter');
  state.scenario.introShown = true;
  state.resources.firewood = 200;
  const before = winter.winterReadiness(state).fuelHeatStock;
  scenario.dailyScenarioTick(state);
  assert.equal(state.scenario.flags.coldSnapWarned, 1, 'the cold snap fires on the scripted winter day');
  const afterFirst = winter.winterReadiness(state).fuelHeatStock;
  assert.ok(before - afterFirst > 0, 'the cold snap burns extra fuel the day it fires');
  scenario.dailyScenarioTick(state);
  assert.equal(winter.winterReadiness(state).fuelHeatStock, afterFirst, 'the cold snap never fires twice');
  assert.equal(
    state.log.filter(entry => entry.text.includes('아궁이가 쉬지 못했습니다')).length, 1,
    'the cold snap warning is logged once',
  );
}

{
  // 겨울 점검: 일분 계산이 인구와 겨울 배율을 함께 본다
  const state = tutorialStart.createTutorialGame();
  const readiness = winter.winterReadiness(state);
  assert.ok(readiness.weight > 0, 'consumption weight counts the living');
  assert.ok(readiness.foodPerDay > 0 && readiness.fuelHeatPerDay > 0);
  const stocktakeStep = stepById('stocktake');
  markFlags(state, 'checklistOpened');
  state.resources.grain = readiness.foodPerDay * (state.scenario.flags.foodDaysGoal - 1);
  state.resources.firewood = readiness.fuelHeatPerDay * (state.scenario.flags.firewoodDaysGoal + 2);
  assert.equal(stocktakeStep.isDone(state), false, 'short of the food target the checklist stays open');
  state.resources.grain = readiness.foodPerDay * (state.scenario.flags.foodDaysGoal + 2);
  assert.equal(stocktakeStep.isDone(state), true, 'both stores at target close the checklist step');
}

{
  // 완주: 각 스텝의 모범 답안 → 제한 일수 안에 다음 스텝
  const state = tutorialStart.createTutorialGame();
  const plots = () => state.buildings.filter(building => building.type === 'field' || building.type === 'paddy');
  const solvers = {
    naming: s => markFlags(s, 'residentSelected', 'minimapClicked', 'speedChanged'),
    working: s => {
      markFlags(s, 'jobPanelOpened');
      const idle = s.residents.filter(r => r.alive && !r.special && r.job !== 'woodcutter' && r.job !== 'hauler');
      if (!s.residents.some(r => r.alive && r.job === 'woodcutter') && idle[0]) idle[0].job = 'woodcutter';
      if (!s.residents.some(r => r.alive && r.job === 'hauler') && idle[1]) idle[1].job = 'hauler';
    },
    // 밭을 네 칸 배치한다 — 갈이·파종은 아직이다
    sowing: s => pushBuilt(s, 'field', {
      w: 2, h: 2, sownArea: 0, cropId: crops.defaultCropForBuildingType('field'), queuedCropId: null,
    }),
    hearth: s => {
      pushBuilt(s, 'woodShed');
      pushBuilt(s, 'hut');
      const worker = s.residents.find(r => r.alive && !r.special && r.job !== 'woodSplitter');
      if (worker) worker.job = 'woodSplitter';
      s.resources.firewood = (s.scenario.flags.firewoodGoal ?? 0) + 5;
      // 그동안 농부가 갈고 뿌렸다 — 병행 구조의 결과를 흉내낸다
      for (const plot of plots()) plot.sownArea = s.scenario.flags.sownAreaGoal;
    },
    water: s => {
      markFlags(s, 'aquiferToggled');
      pushBuilt(s, 'well');
    },
    hunting: s => {
      const candidates = s.residents.filter(r => r.alive && !r.special && r.job !== 'hunter');
      for (const resident of candidates.slice(0, 2)) resident.job = 'hunter';
      s.resources.meat = (s.scenario.flags.meatGoal ?? 0) + 10;
    },
    // 첫 병자는 스텝 훅이 붙인다 — 모범 답안은 약초를 대는 것뿐이다
    patient: s => { s.resources.herbs = Math.max(s.resources.herbs, 20); },
    tribute: s => {
      markFlags(s, 'courtWindowOpened');
      s.tributeReserve.grain = (s.tributeReserve.grain ?? 0) + 3;
    },
    defense: s => {
      pushBuilt(s, 'palisade');
      const pool = s.residents.filter(r => r.alive && !r.special && r.job !== 'militia' && r.job !== 'watchman');
      if (pool[0]) pool[0].job = 'militia';
      if (!s.residents.some(r => r.alive && r.job === 'watchman') && pool[1]) pool[1].job = 'watchman';
    },
    stocktake: s => markFlags(s, 'checklistOpened'),
    winter: () => {},
  };

  // 스텝 조건을 하루치 소비가 되돌리지 않게 유지한다 (모범 답안을 계속 성립시킨다)
  const holdGoals = (s, stepId) => {
    if (stepId === 'hearth') s.resources.firewood = Math.max(s.resources.firewood, (s.scenario.flags.firewoodGoal ?? 0) + 5);
    if (stepId === 'hunting') s.resources.meat = Math.max(s.resources.meat, (s.scenario.flags.meatGoal ?? 0) + 5);
    if (stepId === 'patient') s.resources.herbs = Math.max(s.resources.herbs, 10);
    if (stepId === 'stocktake' || stepId === 'winter') {
      const readiness = winter.winterReadiness(s);
      s.resources.grain = Math.max(s.resources.grain, readiness.foodPerDay * (s.scenario.flags.foodDaysGoal + 4));
      s.resources.firewood = Math.max(
        s.resources.firewood, readiness.fuelHeatPerDay * (s.scenario.flags.firewoodDaysGoal + 6));
    }
  };

  let patientId = null;
  let sownAtHearthExit = 0;
  let coldSnapWarned = 0;
  let fuelBeforeColdSnap = null;
  let fuelAfterColdSnap = null;
  let completionModal = null;

  for (let index = 0; index < scenario.TUTORIAL_STEPS.length; index++) {
    const step = scenario.TUTORIAL_STEPS[index];
    assert.equal(state.scenario.stepIndex, index, `at step ${step.id}`);
    assert.equal(step.id, EXPECTED_STEP_IDS[index]);
    closeModals(state);
    if (step.id === 'patient') {
      patientId = state.scenario.flags.patientResidentId ?? null;
      assert.ok(patientId != null, 'the patient step plants a scripted patient in onStart');
      const patient = state.residents.find(resident => resident.id === patientId);
      assert.equal(patient?.sick, true, 'the scripted patient is actually sick');
      assert.equal(state.incidents.plagueCase, null, 'the scripted patient does not use the plague system');
    }
    assert.ok(solvers[step.id], `solver missing for step ${step.id} — add one when adding steps`);
    solvers[step.id](state);
    let guard = 0;
    while (state.scenario && !state.scenario.completed && state.scenario.stepIndex === index) {
      assert.ok(guard++ < 60, `step ${step.id} did not complete within 60 days`);
      holdGoals(state, step.id);
      keepAlive(state);
      if (step.id === 'winter' && fuelBeforeColdSnap == null &&
        seasons.getSeason(state.day + 1) === 'winter' && seasons.getDayOfSeason(state.day + 1) === 4) {
        fuelBeforeColdSnap = winter.winterReadiness(state).fuelHeatStock;
      }
      simulation.advanceDay(state);
      if (state.scenario?.flags.coldSnapWarned === 1 && coldSnapWarned === 0) {
        coldSnapWarned = 1;
        if (fuelBeforeColdSnap != null) fuelAfterColdSnap = winter.winterReadiness(state).fuelHeatStock;
      }
      assert.equal(state.gameOver, null, `game over during step ${step.id}`);
      // 완료 모달은 시나리오를 해제하며 닫히므로 닫기 전에 내용을 붙잡아 둔다
      if (state.pendingChoice?.kind === 'scenario' && state.pendingChoice.data.phase === 'complete') {
        completionModal = state.pendingChoice;
      }
      closeModals(state);
    }
    if (step.id === 'hearth') {
      sownAtHearthExit = plots().reduce((sum, plot) => sum + (plot.sownArea ?? 0), 0);
    }
    if (state.scenario == null || state.scenario.completed) break;
  }

  // 병행 구조: 집·장작 스텝이 끝나는 시점에 파종이 함께 끝나 있다
  assert.ok(sownAtHearthExit >= 4, `sowing completes alongside the hearth step (got ${sownAtHearthExit})`);
  // 통제 사건: 병자는 회복해서 스텝을 닫는다
  const patient = state.residents.find(resident => resident.id === patientId);
  assert.equal(patient?.sick, false, 'the scripted patient recovered');
  // 통제 사건: 혹한 경고는 겨울 중 한 번만, 그날 장작을 더 태운다
  assert.equal(coldSnapWarned, 1, 'the cold snap warning fired exactly once');
  assert.equal(
    state.log.filter(entry => entry.text.includes('아궁이가 쉬지 못했습니다')).length, 1,
    'the cold snap warning is logged once',
  );
  assert.ok(fuelBeforeColdSnap != null && fuelAfterColdSnap != null, 'the cold snap day was observed');
  assert.ok(fuelAfterColdSnap < fuelBeforeColdSnap, 'the cold snap day burns extra firewood');

  // 완료 모달의 선택지 2개 — 첫 번째('계속해서 안내받는다')를 고르면 초회 도움말이 켜진 채로 이어진다
  if (!completionModal) {
    keepAlive(state);
    simulation.advanceDay(state);
    completionModal = state.pendingChoice;
    closeModals(state);
  }
  assert.equal(completionModal?.kind, 'scenario');
  assert.equal(completionModal.data.phase, 'complete');
  assert.deepEqual(completionModal.options.map(option => option.id), ['guided', 'solo']);
  assert.match(completionModal.body, /첫 겨울은 끝났지만 북방은 이제부터입니다/);
  assert.equal(state.scenario, null, 'tutorial hands off to normal play');
  assert.equal(state.guides.enabled, true, 'the guided choice keeps the first-time help on');
  assert.ok(state.log.some(entry => entry.text.includes('길잡이를 마쳤습니다')));
  // 완료 후에는 랜덤 사건 게이트가 열린다
  assert.equal(scenario.scenarioSuppressesRandomEvents(state), false);
}

{
  // '이제 스스로 운영한다'를 고르면 초회 도움말이 꺼진 채로 이어진다
  const state = tutorialStart.createTutorialGame();
  state.scenario.stepIndex = scenario.TUTORIAL_STEPS.length;
  state.scenario.completed = true;
  state.scenario.introShown = true;
  state.pendingChoice = null;
  scenario.dailyScenarioTick(state);
  assert.equal(state.pendingChoice?.data.phase, 'complete');
  simulation.resolveChoice(state, 'solo');
  assert.equal(state.scenario, null);
  assert.equal(state.guides.enabled, false, 'the solo choice turns the first-time help off');
}

{
  // 초회 도움말: 켜져 있을 때 1회만, 꺼져 있으면 전부 미표시
  const state = tutorialStart.createTutorialGame();
  assert.equal(guides.openGuideOnce(state, 'fire'), true);
  assert.equal(guides.openGuideOnce(state, 'fire'), false, 'the same module never opens twice');
  assert.equal(guides.hasSeenGuide(state, 'fire'), true);
  assert.equal(state.guides.seen.fire, state.day);
  guides.setGuidesEnabled(state, false);
  assert.equal(guides.openGuideOnce(state, 'livestock'), false, 'nothing opens while the help is off');
  assert.equal(guides.hasSeenGuide(state, 'livestock'), false);
}

{
  globalThis.localStorage = {
    store: {},
    getItem(key) { return this.store[key] ?? null; },
    setItem(key, value) { this.store[key] = String(value); },
    removeItem(key) { delete this.store[key]; },
  };

  // 통제 사건의 1회성 플래그는 진행 위치와 함께 저장을 건너 살아남는다 —
  // 불러온 겨울에서 혹한이 두 번 오면 안 된다
  {
    const incident = tutorialStart.createTutorialGame();
    incident.pendingChoice = null;
    let winterDay = incident.day;
    while (!(seasons.getSeason(winterDay) === 'winter' &&
      seasons.getDayOfSeason(winterDay) === 4)) winterDay++;
    incident.day = winterDay;
    incident.scenario.stepIndex = EXPECTED_STEP_IDS.indexOf('winter');
    incident.scenario.introShown = true;
    incident.resources.firewood = 200;
    const patient = incident.residents.find(resident => resident.alive && !resident.special);
    scenario.dailyScenarioTick(incident); // 혹한 1회 발화
    incident.scenario.flags.patientResidentId = patient.id;
    assert.equal(incident.scenario.flags.coldSnapWarned, 1);
    assert.equal(saveLoad.saveGame(incident, 2), true);
    const reloaded = saveLoad.loadGame(2);
    assert.ok(reloaded?.scenario, 'the tutorial save reloads with its scenario intact');
    assert.equal(reloaded.scenario.flags.coldSnapWarned, 1, 'the cold snap stays fired across a save');
    assert.equal(
      reloaded.scenario.flags.patientResidentId, patient.id,
      'the scripted patient is remembered across a save',
    );
    const fuelBefore = winter.winterReadiness(reloaded).fuelHeatStock;
    reloaded.pendingChoice = null;
    scenario.dailyScenarioTick(reloaded);
    assert.equal(winter.winterReadiness(reloaded).fuelHeatStock, fuelBefore,
      'a reloaded winter never re-fires the cold snap');
    assert.equal(
      reloaded.log.filter(entry => entry.text.includes('아궁이가 쉬지 못했습니다')).length, 1,
      'the reloaded log still carries exactly one cold snap warning',
    );
  }

  // 버전 해제: 코드의 튜토리얼 버전이 바뀌면 저장은 일반 모드로 이어진다
  const state = tutorialStart.createTutorialGame();
  state.pendingChoice = null; // 모달은 저장 대상이지만 여기선 진행 위치만 본다
  assert.equal(saveLoad.saveGame(state, 1), true);
  const raw = JSON.parse(globalThis.localStorage.getItem('buksae-save-v3'));
  assert.equal(raw.schemaVersion, saveSchema.CURRENT_SCHEMA_VERSION);
  raw.scenario.version += 1; // 미래의 튜토리얼 개정을 흉내낸다
  globalThis.localStorage.setItem('buksae-save-v3', JSON.stringify(raw));
  const loaded = saveLoad.loadGame(1);
  assert.ok(loaded, 'outdated tutorial save still loads');
  assert.equal(loaded.scenario, null, 'outdated tutorial is detached to normal mode');
  assert.ok(loaded.log.some(entry => entry.text.includes('길잡이 시나리오가 갱신')));

  // 스키마 v52 저장(초회 도움말 이전)은 안내가 꺼진 채로 이어진다
  const legacy = JSON.parse(globalThis.localStorage.getItem('buksae-save-v3'));
  legacy.schemaVersion = 52;
  delete legacy.guides;
  globalThis.localStorage.setItem('buksae-save-v3', JSON.stringify(legacy));
  const migrated = saveLoad.loadGame(1);
  assert.ok(migrated, 'a pre-guides save still loads');
  assert.equal(migrated.guides.enabled, false, 'an ongoing settlement is not flooded with late guidance');
  assert.deepEqual(migrated.guides.seen, {});
  delete globalThis.localStorage;
}

console.log('tutorial scenario tests passed');
