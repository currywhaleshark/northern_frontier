// 튜토리얼 시나리오 완주 회귀 테스트.
// 목적: 게임이 계속 바뀌어도 튜토리얼이 살아 있는지 헤드리스로 검증한다.
//  - 고정 시드 생성이 결정론적인지, 시작 불변식(서식지·물 자리)이 서는지
//  - 각 스텝이 "모범 답안" 상태에서 제한 일수 안에 넘어가는지
//  - 파종은 배치만으로 끝나고, 집·장작 스텝이 끝날 때 파종이 병행 완료되는지
//  - 시나리오 중 스크립트되지 않은 랜덤 모달이 뜨지 않는지 (허용: scenario, tribute)
//  - 통제 사건(첫 병자·혹한 경고)이 스텝 훅으로만 일어나는지
//  - 코드의 튜토리얼 버전이 바뀌면(구판 버전 2 포함) 저장이 일반 모드로 해제되는지
//  - 초회 도움말(guides)이 새 게임에서 켜지고 구버전 저장에서는 꺼지는지
//  - 완료 선택 뒤에 랜덤 사건 게이트가 술어만이 아니라 endOfDay에서도 실제로 열리는지
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
const buildings = await import(pathToFileURL(join(compiledDir, 'buildings.mjs')).href);
const config = await import(pathToFileURL(join(compiledDir, 'config.mjs')).href);
const courtTribute = await import(pathToFileURL(join(compiledDir, 'courtTribute.mjs')).href);
const crops = await import(pathToFileURL(join(compiledDir, 'crops.mjs')).href);
const guides = await import(pathToFileURL(join(compiledDir, 'guides.mjs')).href);
const militaryAid = await import(pathToFileURL(join(compiledDir, 'militaryAid.mjs')).href);
const saveLoad = await import(pathToFileURL(join(compiledDir, 'saveLoad.mjs')).href);
const saveSchema = await import(pathToFileURL(join(compiledDir, 'saveSchema.mjs')).href);
const seasons = await import(pathToFileURL(join(compiledDir, 'seasons.mjs')).href);
const winter = await import(pathToFileURL(join(compiledDir, 'winterReadiness.mjs')).href);
const tributeReserve = await import(pathToFileURL(join(compiledDir, 'tributeReserve.mjs')).href);
const coachSource = readFileSync(new URL('../../src/components/TutorialCoach.tsx', import.meta.url), 'utf8');
const sessionSource = readFileSync(new URL('../../src/GameSession.tsx', import.meta.url), 'utf8');
const agentsSource = readFileSync(new URL('../../src/game/agents.ts', import.meta.url), 'utf8');

// 시나리오 중 허용되는 모달 — 길잡이 스텝과 그 스텝이 직접 불러 세운 통제 사건뿐이다.
// R5로 둘째 해가 붙으면서 셋이 늘었다: 통제 유민(immigration)·통제 습격(raid)과
// 둘째 해 겨울의 세공 수거(tribute). 어느 것도 랜덤 게이트를 거치지 않는다 —
// 유민·습격은 스텝 훅이 직접 열고, 세공 수거는 본디 게이트 밖의 결정론 사건이다.
const ALLOWED_MODAL_KINDS = new Set(['scenario', 'immigration', 'raid', 'tribute']);

// 17스텝의 id — 첫 해 10스텝(R4)에 둘째 해 7스텝(R5)을 이어 붙인 판.
// 순서가 바뀌면 코치·문구도 함께 손봐야 한다.
const FIRST_YEAR_STEP_IDS = [
  'naming', 'working', 'sowing', 'hearth', 'water', 'hunting',
  'patient', 'defense', 'stocktake', 'winter',
];
const SECOND_YEAR_STEP_IDS = [
  'tribute', 'tanning', 'immigrants', 'minerals', 'smithy', 'market', 'battle',
];
const EXPECTED_STEP_IDS = [...FIRST_YEAR_STEP_IDS, ...SECOND_YEAR_STEP_IDS];

// 습격 선택지가 뜨면 수비병 요격을 고른다 — 통제 습격이 실제 전투 경로까지 지나가는지 보려는 것이다
function preferredOption(choice) {
  if (choice.kind === 'raid') {
    const militia = choice.options.find(option => option.id === 'militia' && !option.disabled);
    if (militia) return militia;
  }
  return choice.options.find(candidate => !candidate.disabled);
}

function closeModals(state) {
  let guard = 0;
  while (state.pendingChoice) {
    assert.ok(guard++ < 10, 'modal resolution loop stuck');
    const kind = state.pendingChoice.kind;
    assert.ok(
      ALLOWED_MODAL_KINDS.has(kind),
      `unscripted modal during tutorial: ${kind} (${state.pendingChoice.title})`,
    );
    const option = preferredOption(state.pendingChoice);
    assert.ok(option, `no selectable option in ${kind} modal`);
    simulation.resolveChoice(state, option.id);
  }
}

// 시나리오가 끝난 뒤에는 허용 목록이 없다 — 뜬 모달을 그때그때 닫는다.
// 길잡이 모달만은 남겨 둔다 (R4의 발화 순서를 그 자리에서 확인해야 한다).
function resolveNonGuideModals(state) {
  let guard = 0;
  while (state.pendingChoice && state.pendingChoice.kind !== 'guide') {
    assert.ok(guard++ < 12, 'post-tutorial modal resolution loop stuck');
    const option = state.pendingChoice.options.find(candidate => !candidate.disabled);
    if (!option) {
      state.pendingChoice = null;
      break;
    }
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

// 개척민은 전원 무직으로 시작한다(R1-1) — 테스트가 필요한 직업을 그때그때 배분한다
function assignJobs(state, counts) {
  for (const [job, count] of Object.entries(counts)) {
    let remaining = count - state.residents.filter(r => r.alive && r.job === job).length;
    if (remaining <= 0) continue;
    for (const resident of state.residents) {
      if (remaining <= 0) break;
      if (!resident.alive || resident.special || resident.job !== 'idle') continue;
      resident.job = job;
      remaining--;
    }
    assert.equal(remaining, 0, `not enough idle settlers to staff ${job}`);
  }
}

function stepById(id) {
  const step = scenario.TUTORIAL_STEPS.find(candidate => candidate.id === id);
  assert.ok(step, `step ${id} missing`);
  return step;
}

// ── R3: 목표 칩의 소목표 진행 배열 ──
// isDone은 진행 배열에서 파생된다. 두 눈금이 갈라지면 칩이 "다 찼는데 안 넘어간다"고 거짓말한다.
function progressItems(step, state) {
  const items = step.progress(state);
  assert.ok(Array.isArray(items) && items.length > 0, `step ${step.id} exposes at least one sub-goal`);
  for (const item of items) {
    assert.equal(typeof item.label, 'string', `${step.id} sub-goal label is a string`);
    assert.ok(
      item.label.length > 0 && item.label.length <= 8 && !item.label.includes('십시오'),
      `${step.id} sub-goal label is a short noun, not a sentence (${item.label})`,
    );
    assert.equal(typeof item.current, 'number', `${step.id}/${item.label} current is numeric`);
    assert.equal(typeof item.target, 'number', `${step.id}/${item.label} target is numeric`);
    assert.ok(item.current >= 0, `${step.id}/${item.label} never goes negative`);
    assert.ok(item.target > 0, `${step.id}/${item.label} has a positive target`);
  }
  return items;
}

// 정합: (전 소목표 current ≥ target) ⇔ isDone
function assertProgressMatchesIsDone(step, state, where) {
  const items = progressItems(step, state);
  const allMet = items.every(item => item.current >= item.target);
  assert.equal(
    step.isDone(state), allMet,
    `step ${step.id} isDone disagrees with its sub-goals (${where}): ` +
      items.map(item => `${item.label} ${item.current}/${item.target}`).join(' · '),
  );
  assert.equal(scenario.scenarioProgressComplete(items), allMet);
}

function goalItem(step, state, label) {
  const item = step.progress(state).find(candidate => candidate.label === label);
  assert.ok(item, `step ${step.id} has a '${label}' sub-goal`);
  return item;
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
  // R1-1: 개척민은 전원 무직으로 도착한다 (일반 게임 공통) — 배분은 첫날부터 플레이어의 몫이다
  assert.equal(
    a.residents.every(resident => resident.job === 'idle'), true,
    'every founding settler starts unemployed',
  );
  assert.ok(a.residents.length > 0, 'the settlement starts with people');
  // R1-2: 첫 수확 전에도 짚신을 삼을 수 있게 건초를 실어 보낸다
  const barefoot = a.residents.filter(resident => resident.alive && resident.stage !== 'infant').length;
  assert.ok(
    a.resources.hay >= barefoot * 2,
    `starting hay covers a straw shoe for everyone (need ${barefoot * 2}, got ${a.resources.hay})`,
  );
}

{
  // R1-2: 일반 게임의 시작 건초도 짚신 수요 기준을 넘는다 (표준 난이도, 배율 1)
  const plain = simulation.newGame(20260731, 'normal');
  const hayPerShoe = config.CONFIG.wearables.strawShoeHayPerUnit;
  const buffer = config.CONFIG.wearables.strawShoeStockBuffer;
  const need = plain.residents.filter(resident => resident.alive).length + buffer;
  assert.ok(
    plain.resources.hay >= need * hayPerShoe,
    `a normal new game ships hay for ${need} pairs (need ${need * hayPerShoe}, got ${plain.resources.hay})`,
  );
  assert.equal(plain.residents.every(resident => resident.job === 'idle'), true,
    'a normal new game also starts everyone unemployed');
}

{
  // R1-4: 새 마을은 멈춘 채로 열리고, 길잡이 스텝 안내가 설 때마다 다시 멈춘다.
  // 배속은 UI 상태라 헤드리스로는 재지 못한다 — 연결이 살아 있는지를 소스로 못 박는다.
  assert.match(
    sessionSource, /useState\(launch\.kind === 'loaded' \? 1 : 0\)/,
    'a new settlement (normal or tutorial) opens paused; only a loaded save keeps 1x',
  );
  assert.match(
    sessionSource, /state\.pendingChoice\?\.kind === 'scenario' \? state\.pendingChoice : null/,
    'the session watches for scenario step modals',
  );
  assert.match(
    sessionSource, /if \(scenarioModalKey\) setSpeed\(0\)/,
    'every new scenario step modal drops the clock to a pause — closing it does not resume',
  );
}

{
  // 17스텝 구성과 버전 (R5: 둘째 해 7스텝을 이어 붙이며 버전을 올렸다)
  assert.deepEqual(scenario.TUTORIAL_STEPS.map(step => step.id), EXPECTED_STEP_IDS);
  assert.equal(scenario.TUTORIAL_STEPS.length, 17);
  assert.equal(scenario.TUTORIAL_SCENARIO_VERSION, 5);
  // 첫 겨울은 이제 완료 지점이 아니라 중간 스텝이다
  assert.equal(scenario.TUTORIAL_STEPS[9].id, 'winter');
  assert.ok(scenario.TUTORIAL_STEPS[10], 'the winter step is followed by the second year');
  assert.ok(
    !/버티면 길잡이가 끝납니다/.test(stepById('winter').body),
    'the winter step no longer claims to be the last (R5)',
  );
  assert.match(stepById('winter').body, /첫 고비를 넘기십시오/);
}

{
  // R5-0: 겨울 점검은 다섯 항목이다 — 세공고 항목은 걷었다
  const state = tutorialStart.createTutorialGame();
  const rows = winter.winterChecklist(state);
  assert.deepEqual(rows.map(row => row.id), ['food', 'firewood', 'housing', 'wearables', 'sick']);
  assert.equal(rows.length, 5);
  assert.equal(rows.some(row => row.id === 'tribute'), false, 'the tribute row is gone (R5)');
  const panelSource = readFileSync(new URL('../../src/components/WinterChecklistPanel.tsx', import.meta.url), 'utf8');
  assert.ok(!panelSource.includes('여섯 가지'), 'the panel headline counts five items');
  assert.match(panelSource, /다섯 가지 모두 갖추었습니다/);
}

{
  // R3: 소목표 진행 배열 — 10스텝 전부에서 진행 배열과 isDone이 한 술어에서 나온다
  const state = tutorialStart.createTutorialGame();
  for (const step of scenario.TUTORIAL_STEPS) {
    assertProgressMatchesIsDone(step, state, 'a fresh settlement');
    assert.equal(step.isDone(state), false, `nothing is achieved on the first morning (${step.id})`);
  }

  // 스텝별 소목표 라벨 — 순서까지 못 박는다 (칩과 코치가 같은 순서를 따른다)
  const labelsOf = id => stepById(id).progress(state).map(item => item.label);
  assert.deepEqual(labelsOf('naming'), ['주민 선택', '미니맵', '배속', '이튿날 아침']);
  assert.deepEqual(labelsOf('working'), ['직업 창', '벌목꾼', '운반꾼']);
  assert.deepEqual(labelsOf('sowing'), ['밭 배치', '농부']);
  assert.deepEqual(labelsOf('hearth'), ['초가집', '장작마당', '장작꾼', '장작', '파종']);
  assert.deepEqual(labelsOf('water'), ['수맥 탭', '물자리']);
  assert.deepEqual(labelsOf('hunting'), ['사냥꾼', '고기']);
  assert.deepEqual(labelsOf('patient'), ['약초막', '약초꾼', '병자 회복']);
  assert.deepEqual(labelsOf('defense'), ['목책', '수비병', '파수꾼']);
  assert.deepEqual(labelsOf('stocktake'), ['겨울 점검', '식량 일분', '장작 일분']);
  assert.deepEqual(labelsOf('winter'), ['겨울']);
  // 둘째 해 (R5)
  assert.deepEqual(labelsOf('tribute'), ['세공 공지', '조정 창', '세공고']);
  assert.deepEqual(labelsOf('tanning'), ['가죽공방', '무두장이', '가죽옷']);
  assert.deepEqual(labelsOf('immigrants'), ['유민 수용']);
  assert.deepEqual(labelsOf('minerals'), ['광맥 탭', '채광꾼', '돌·철']);
  assert.deepEqual(labelsOf('smithy'), ['대장간', '대장장이', '도구']);
  assert.deepEqual(labelsOf('market'), ['장터', '교역']);
  assert.deepEqual(labelsOf('battle'), ['습격 경보', '격퇴']);

  // 목표 한 줄은 진행 배열에서 조합된다 — 문장이 아니라 수치 요약이다
  const naming = stepById('naming');
  assert.equal(naming.goal(state), scenario.formatScenarioGoal(naming.progress(state)));
  assert.match(naming.goal(state), /미니맵 \(0\/1\)/);
  assert.ok(!naming.goal(state).includes('✅'), 'nothing is checked off on the first morning');
  markFlags(state, 'minimapClicked');
  assert.match(naming.goal(state), /✅미니맵 \(1\/1\)/, 'a met sub-goal is marked complete');
  assert.equal(goalItem(naming, state, '미니맵').current, 1);
  assert.equal(goalItem(naming, state, '이튿날 아침').current, state.day >= 2 ? 1 : 0);

  // 목표를 넘겨도 완료로 보되 수치는 그대로 보인다 (✅장작꾼 (2/1))
  const hearth = stepById('hearth');
  assignJobs(state, { woodSplitter: 2 });
  const splitterGoal = goalItem(hearth, state, '장작꾼');
  assert.deepEqual([splitterGoal.current, splitterGoal.target], [2, 1]);
  assert.match(scenario.formatScenarioGoalItem(splitterGoal), /^장작꾼 \(2\/1\)$/);
  assert.equal(scenario.scenarioGoalDone(splitterGoal), true, 'overshooting a target still counts as done');

  // 자원형은 내림해 보인다 — 반올림하면 92.6/93이 다 찬 것처럼 읽힌다
  state.resources.firewood = (state.scenario.flags.firewoodGoal ?? 0) - 0.4;
  const firewoodGoal = goalItem(hearth, state, '장작');
  assert.equal(
    scenario.formatScenarioGoalItem(firewoodGoal),
    `장작 (${state.scenario.flags.firewoodGoal - 1}/${state.scenario.flags.firewoodGoal})`,
    'a firewood stock just short of the target never displays as met',
  );
  assert.equal(scenario.scenarioGoalDone(firewoodGoal), false);

  // 손으로 적은 isDone은 남아 있지 않다 — 남으면 두 눈금이 다시 갈라진다
  const scenarioSource = readFileSync(new URL('../../src/game/scenario.ts', import.meta.url), 'utf8');
  assert.equal(
    (scenarioSource.match(/^\s{4}isDone:/gm) ?? []).length, 0,
    'no step declares isDone by hand — TUTORIAL_STEPS derives it from progress (R3)',
  );
  assert.match(
    scenarioSource, /isDone: state => scenarioProgressComplete\(spec\.progress\(state\)\)/,
    'isDone is derived from the sub-goal array in exactly one place',
  );

  // 상단 바 칩은 문장이 아니라 이 배열을 그린다
  const topBarSource = readFileSync(new URL('../../src/components/TopBar.tsx', import.meta.url), 'utf8');
  assert.match(topBarSource, /scenarioStep\.progress\(state\)\.map/, 'the objective chip renders the sub-goal array');
  assert.match(topBarSource, /scenarioGoalDone\(item\)/, 'the chip marks met items through the shared predicate');
  assert.ok(
    !topBarSource.includes('scenarioStep.goal(state)'),
    'the chip no longer renders the sentence form (it would duplicate the sub-goal array)',
  );
}

{
  // R3: 스텝 시작 모달 하단의 `목표: …`도 칩과 같은 형식이다
  const state = tutorialStart.createTutorialGame();
  const modal = state.pendingChoice;
  assert.equal(modal?.kind, 'scenario');
  assert.equal(modal.data.phase, 'step');
  const step = stepById(modal.data.stepId);
  assert.equal(modal.options[0].desc, `목표: ${scenario.formatScenarioGoal(step.progress(state))}`);
  assert.match(modal.options[0].desc, /주민 선택 \(0\/1\) · 미니맵 \(0\/1\)/);
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
  assignJobs(state, { woodcutter: 1, hauler: 1 }); // 전원 무직으로 시작하므로 여기서 직접 배분한다
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
  assert.equal(
    sowingStep.isDone(state), false,
    'placed plots without a farmer leave the land idle — the step waits for the assignment (R1-1)',
  );
  assignJobs(state, { farmer: 1 });
  assert.equal(sowingStep.isDone(state), true, 'placing four tiles completes the sowing step before any plowing');

  // 코치는 밭 배치를 먼저 가리키고, 그 뒤에 농부 배정(＋ 빠른 배정)을 가리킨다
  const fieldHint = coachSource.indexOf("{ tut: 'build-item-field'");
  const farmerHint = coachSource.indexOf("tut: 'job-plus-farmer'");
  assert.ok(fieldHint >= 0 && farmerHint > fieldHint, 'coach points to the plot before staffing the farmer');

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
  const workerHint = coachSource.indexOf("tut: 'job-plus-woodSplitter'");
  assert.ok(buildHint >= 0 && workerHint > buildHint, 'coach points to wood yard construction before staffing');
  // 전원 무직 시작이므로 공사를 올릴 건축가도 이 스텝에서 안내한다 (배치 → 건축가 → 장작꾼 순)
  const builderHint = coachSource.indexOf("tut: 'job-plus-builder'");
  assert.ok(
    builderHint > buildHint && builderHint < workerHint,
    'coach staffs the builder between placing the yard and staffing the splitter',
  );
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
}

{
  // R4: 첫 해에는 조정이 세공을 거두지 않는다 (본게임 공통) — 새 게임에 요구가 없고 예고만 남는다
  const plain = simulation.newGame(20260801, 'normal');
  assert.equal(plain.courtTribute, null, 'a first-year settlement has no tribute demand');
  assert.ok(
    plain.log.some(entry => entry.text.includes('세공은 이듬해 봄부터')),
    'the first spring foretells that tribute begins the following year',
  );
  // 길잡이 새 게임도 마찬가지 — 시나리오가 세공을 강제로 공지하던 훅이 사라졌다
  const tutorial = tutorialStart.createTutorialGame();
  assert.equal(tutorial.courtTribute, null, 'the tutorial no longer forces a first-year tribute');
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
  // R2-2: 첫 병자 스텝은 병자의 회복만으로 끝나지 않는다 — 약초막과 약초꾼을 함께 요구한다
  const state = tutorialStart.createTutorialGame();
  const patientStep = stepById('patient');
  const sufferer = state.residents.find(resident => resident.alive && !resident.special);
  sufferer.sick = true;
  state.scenario.flags.patientResidentId = sufferer.id;
  assert.equal(patientStep.isDone(state), false, 'a sick settler alone does not close the patient step');
  sufferer.sick = false;
  assert.equal(
    patientStep.isDone(state), false,
    'recovery without a herb hut leaves the herbalist lesson untaught (R2-2)',
  );
  pushBuilt(state, 'herbHut');
  assert.equal(patientStep.isDone(state), false, 'the herb hut still needs a herbalist working out of it');
  assignJobs(state, { herbalist: 1 });
  assert.equal(patientStep.isDone(state), true, 'hut, herbalist and a recovered patient close the step together');
  sufferer.sick = true;
  assert.equal(patientStep.isDone(state), false, 'a staffed herb hut does not close the step while the patient lies ill');

  // 코치는 약초막 배치를 먼저 가리키고 그다음 약초꾼 ＋를 가리킨다
  const hutHint = coachSource.indexOf("{ tut: 'build-item-herbHut'");
  const herbalistHint = coachSource.indexOf("tut: 'job-plus-herbalist'");
  assert.ok(hutHint >= 0 && herbalistHint > hutHint, 'coach places the herb hut before staffing the herbalist');
  // 건축가를 그새 물렸으면 약초막이 터만 잡힌 채 서고 스텝이 멎는다 — 구제 힌트가 그 사이에 있다
  const rescueHint = coachSource.indexOf('약초막은 터만 잡힌 채 오르지 않습니다');
  assert.ok(
    rescueHint > hutHint && rescueHint < herbalistHint,
    'coach recovers a builder-less settlement before the placed herb hut stalls the step',
  );
}

{
  // R2-1: 직업 배정 안내 이원화 — 상세 4단 경로는 1단계 벌목꾼 하나뿐이고 나머지는 전부 ＋ 경로다
  const detailAnchors = [...coachSource.matchAll(/tut: 'job-(?:detail|candidate|assign-selected)-(\w+)'/g)]
    .map(match => match[1]);
  assert.deepEqual(
    [...new Set(detailAnchors)], ['woodcutter'],
    'only the first job (woodcutter) is taught through the detail panel — every other job uses the ＋ path',
  );
  for (const job of ['hauler', 'farmer', 'builder', 'woodSplitter', 'hunter', 'herbalist', 'militia', 'watchman']) {
    assert.ok(
      coachSource.includes(`tut: 'job-plus-${job}'`),
      `coach staffs ${job} through the quick ＋ button (R2-1)`,
    );
  }
  // ＋ 경로도 얕은 앵커(dock-jobs)를 앞에 두어, 창이 접혀 있으면 코치가 그리로 물러난다
  for (const match of coachSource.matchAll(/tut: 'job-plus-(\w+)'/g)) {
    const before = coachSource.slice(0, match.index);
    assert.ok(
      before.lastIndexOf("tut: 'dock-jobs'") > before.lastIndexOf('path: ['),
      `the ${match[1]} ＋ hint keeps dock-jobs as its shallow fallback anchor`,
    );
  }
  // 상세 경로를 한 번 밟은 자리에서 ＋의 존재를 일러 준다
  assert.ok(
    /다음부터는 직업 옆의 ＋/.test(coachSource),
    'the woodcutter hint hands off to the quick ＋ button for later jobs',
  );
  const workingStep = stepById('working');
  assert.match(workingStep.body, /＋/, 'the working step body introduces the quick assignment button');
}

{
  // R2-3: "겨울에는 채울 수 없다"는 잘못된 설명이었다 — 세 곳 모두에서 사라졌는지 본다
  const checklistSource = readFileSync(new URL('../../src/components/WinterChecklistPanel.tsx', import.meta.url), 'utf8');
  const scenarioSource = readFileSync(new URL('../../src/game/scenario.ts', import.meta.url), 'utf8');
  for (const [label, source] of [
    ['WinterChecklistPanel', checklistSource],
    ['TutorialCoach', coachSource],
    ['scenario', scenarioSource],
  ]) {
    assert.ok(
      !/겨울에 채울 수 없/.test(source),
      `${label} no longer claims winter stores cannot be replenished (R2-3)`,
    );
  }
  assert.match(stepById('stocktake').body, /겨울에도 채울 수는 있으나/,
    'the stocktake step explains that winter work is merely interrupted, not impossible');
}

{
  // 완주: 각 스텝의 모범 답안 → 제한 일수 안에 다음 스텝
  const state = tutorialStart.createTutorialGame();
  const plots = () => state.buildings.filter(building => building.type === 'field' || building.type === 'paddy');
  const solvers = {
    naming: s => markFlags(s, 'residentSelected', 'minimapClicked', 'speedChanged'),
    working: s => {
      markFlags(s, 'jobPanelOpened');
      assignJobs(s, { woodcutter: 1, hauler: 1 });
    },
    // 밭을 네 칸 배치하고 농부를 둔다 — 갈이·파종은 아직이다
    sowing: s => {
      pushBuilt(s, 'field', {
        w: 2, h: 2, sownArea: 0, cropId: crops.defaultCropForBuildingType('field'), queuedCropId: null,
      });
      assignJobs(s, { farmer: 1 });
    },
    hearth: s => {
      pushBuilt(s, 'woodShed');
      pushBuilt(s, 'hut');
      assignJobs(s, { builder: 1, woodSplitter: 1 });
      s.resources.firewood = (s.scenario.flags.firewoodGoal ?? 0) + 5;
      // 그동안 농부가 갈고 뿌렸다 — 병행 구조의 결과를 흉내낸다
      for (const plot of plots()) plot.sownArea = s.scenario.flags.sownAreaGoal;
    },
    water: s => {
      markFlags(s, 'aquiferToggled');
      pushBuilt(s, 'well');
    },
    hunting: s => {
      assignJobs(s, { hunter: 2 });
      s.resources.meat = (s.scenario.flags.meatGoal ?? 0) + 10;
    },
    // 첫 병자는 스텝 훅이 붙인다 — 모범 답안은 약초막을 세우고 약초꾼을 두는 것이다 (R2-2)
    patient: s => {
      pushBuilt(s, 'herbHut');
      assignJobs(s, { herbalist: 1 });
      s.resources.herbs = Math.max(s.resources.herbs, 20);
    },
    defense: s => {
      pushBuilt(s, 'palisade');
      assignJobs(s, { militia: 1, watchman: 1 });
    },
    stocktake: s => markFlags(s, 'checklistOpened'),
    winter: () => {},
    // ── 둘째 해 (R5) ──
    // 파발은 봄 첫날에 온다 — 스텝은 첫 겨울 끝자락에 열리므로 세공고 채우기는 holdGoals가 맡는다
    tribute: s => markFlags(s, 'courtWindowOpened'),
    tanning: s => {
      pushBuilt(s, 'tannery');
      assignJobs(s, { tanner: 1 });
      // 실제 무두질은 agents.ts가 누계를 올린다 (아래 R5-2 블록이 그 연결을 따로 못 박는다).
      // 여기서는 모범 답안이 목표에 닿은 상태를 흉내낸다.
      s.scenario.flags.hideClothesMade = s.scenario.flags.hideClothesMadeGoal;
    },
    // 유민은 통제 사건이다 — 모범 답안은 없다. 스텝이 제안 모달을 열고 closeModals가 받아들인다
    immigrants: () => {},
    minerals: s => {
      markFlags(s, 'oreToggled');
      assignJobs(s, { miner: 1 }); // 채광장은 필요 없다 — 채광꾼이 마을 곁 노두를 직접 캔다
    },
    smithy: s => {
      pushBuilt(s, 'smithy');
      assignJobs(s, { smith: 1 });
      s.scenario.flags.toolsCrafted = s.scenario.flags.toolsCraftedGoal;
    },
    market: s => {
      pushBuilt(s, 'market');
      s.lifetimeStats.tradesCompleted += 1; // 세력 창에서 교역 한 번을 마친 셈
    },
    // 습격도 통제 사건이다 — 스텝이 무리를 불러 세우고 closeModals가 수비병 요격을 고른다
    battle: () => {},
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
    // 세공고 비축은 파발이 온 뒤에야 할 수 있다 — 매일 다시 시도한다
    if (stepId === 'tribute' && s.courtTribute && !s.courtTribute.resolved) {
      for (const [resource, required] of Object.entries(s.courtTribute.items)) {
        if ((required ?? 0) <= 0) continue;
        s.resources[resource] = Math.max(s.resources[resource] ?? 0, required);
        tributeReserve.setTributeReserve(s, resource, required);
      }
    }
  };

  let patientId = null;
  let sownAtHearthExit = 0;
  let coldSnapWarned = 0;
  let fuelBeforeColdSnap = null;
  let fuelAfterColdSnap = null;
  let completionModal = null;
  // R5 관측치 — 둘째 해의 통제 사건이 실제로 일어났는지 완주 중에 붙잡아 둔다
  let popBeforeImmigrants = null;
  let popAfterImmigrants = null;
  let mineralsMined = 0;
  let raidersSeen = false;
  let battleFought = false;
  let scenarioTributeItems = null;
  let repelledBefore = state.lifetimeStats.raidsRepelled;

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
    // R3: 모범 답안을 두기 전에도 진행 배열과 isDone은 같은 답을 낸다
    assertProgressMatchesIsDone(step, state, `before the model answer for ${step.id}`);
    solvers[step.id](state);
    // R3 표본: 진행 배열의 현재값이 실제 상태를 그대로 읽는다
    const jobs = job => state.residents.filter(r => r.alive && r.job === job).length;
    if (step.id === 'sowing') {
      const placed = plots().reduce((sum, plot) => sum + (plot.w ?? 1) * (plot.h ?? 1), 0);
      assert.deepEqual(
        [goalItem(step, state, '밭 배치').current, goalItem(step, state, '밭 배치').target],
        [placed, state.scenario.flags.sownAreaGoal],
      );
      assert.equal(goalItem(step, state, '농부').current, jobs('farmer'));
    }
    if (step.id === 'hearth') {
      assert.equal(goalItem(step, state, '장작').current, state.resources.firewood);
      assert.equal(goalItem(step, state, '장작꾼').current, jobs('woodSplitter'));
      assert.equal(
        goalItem(step, state, '파종').current,
        plots().reduce((sum, plot) => sum + (plot.sownArea ?? 0), 0),
      );
    }
    if (step.id === 'hunting') {
      assert.equal(goalItem(step, state, '고기').current, state.resources.meat);
      assert.equal(goalItem(step, state, '사냥꾼').target, 2);
    }
    if (step.id === 'stocktake') {
      assert.equal(goalItem(step, state, '식량 일분').current, winter.winterReadiness(state).foodDays);
      assert.equal(goalItem(step, state, '장작 일분').target, state.scenario.flags.firewoodDaysGoal);
    }
    if (step.id === 'patient') {
      assert.equal(goalItem(step, state, '병자 회복').current, 0, 'the scripted patient is still abed');
    }
    if (step.id === 'immigrants') {
      popBeforeImmigrants = state.residents.filter(resident => resident.alive).length;
      assert.equal(
        state.scenario.flags.immigrantBasePop, popBeforeImmigrants,
        'the immigrant step records the population it started from',
      );
    }
    if (step.id === 'battle') {
      repelledBefore = state.lifetimeStats.raidsRepelled;
      assert.equal(state.raiders, null, 'no band is on the map before the scripted raid');
    }
    let guard = 0;
    while (state.scenario && !state.scenario.completed && state.scenario.stepIndex === index) {
      assert.ok(guard++ < 60, `step ${step.id} did not complete within 60 days`);
      holdGoals(state, step.id);
      keepAlive(state);
      // R3: 완주 내내 매일 — 진행 배열이 다 찼는데 스텝이 안 넘어가는 일(또는 그 반대)은 없다
      assertProgressMatchesIsDone(step, state, `day ${state.day} of ${step.id}`);
      if (step.id === 'winter' && fuelBeforeColdSnap == null &&
        seasons.getSeason(state.day + 1) === 'winter' && seasons.getDayOfSeason(state.day + 1) === 4) {
        fuelBeforeColdSnap = winter.winterReadiness(state).fuelHeatStock;
      }
      simulation.advanceDay(state);
      if (state.raiders) raidersSeen = true;
      if (state.battle) battleFought = true;
      if (state.courtTribute && scenarioTributeItems == null) {
        scenarioTributeItems = { ...state.courtTribute.items };
      }
      if (state.scenario?.flags.coldSnapWarned === 1 && coldSnapWarned === 0) {
        coldSnapWarned = 1;
        if (fuelBeforeColdSnap != null) fuelAfterColdSnap = winter.winterReadiness(state).fuelHeatStock;
      }
      assert.equal(state.gameOver, null, `game over during step ${step.id}`);
      // R1-3: 길잡이 동안 병자는 6단계가 붙인 통제 병자 하나뿐이다 — 자연 발병은 잠겨 있다
      if (state.scenario && !state.scenario.completed) {
        const scriptedId = state.scenario.flags.patientResidentId ?? null;
        const strays = state.residents.filter(r => r.alive && r.sick && r.id !== scriptedId);
        assert.equal(
          strays.length, 0,
          `natural illness during the tutorial (step ${step.id}, day ${state.day}): ${strays.map(r => r.name).join(', ')}`,
        );
      }
      // 완료 모달은 시나리오를 해제하며 닫히므로 닫기 전에 내용을 붙잡아 둔다
      if (state.pendingChoice?.kind === 'scenario' && state.pendingChoice.data.phase === 'complete') {
        completionModal = state.pendingChoice;
      }
      closeModals(state);
      // 요격을 고르면 그 자리에서 전투가 열린다 — 다음 advanceDay가 결산해 버리므로 여기서도 본다
      if (state.battle) battleFought = true;
      if (state.raiders) raidersSeen = true;
    }
    if (step.id === 'hearth') {
      sownAtHearthExit = plots().reduce((sum, plot) => sum + (plot.sownArea ?? 0), 0);
    }
    if (step.id === 'immigrants') {
      popAfterImmigrants = state.residents.filter(resident => resident.alive).length;
    }
    if (step.id === 'minerals') {
      mineralsMined = state.scenario?.flags.mineralsMined ?? 0;
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
  assert.match(completionModal.body, /두 해를 넘겼습니다/);
  assert.match(completionModal.title, /두 해를 넘기다/);
  assert.equal(state.scenario, null, 'tutorial hands off to normal play');
  assert.equal(state.guides.enabled, true, 'the guided choice keeps the first-time help on');
  assert.ok(state.log.some(entry => entry.text.includes('길잡이를 마쳤습니다')));
  // 완료 후에는 랜덤 사건 게이트가 열린다
  assert.equal(scenario.scenarioSuppressesRandomEvents(state), false);
  // R4: 완주 표식이 남고, 첫 해에는 세공이 한 번도 요구되지 않았다
  assert.equal(state.tutorialGraduate, true, 'finishing the tutorial leaves a mark on the game');

  // ── R5 관측 ──
  // 완주에 두 해가 걸린다 (첫 겨울에서 끝나지 않는다)
  assert.ok(seasons.getYear(state.day) >= 2, `the tutorial now spans two years (ended in year ${seasons.getYear(state.day)})`);
  // 세공은 둘째 해 봄에 시나리오가 도는 동안 공지되었고, 품목은 가죽옷으로 고정되었다
  assert.ok(scenarioTributeItems, 'the tribute dispatch arrived while the tutorial was still running');
  assert.deepEqual(
    Object.keys(scenarioTributeItems), ['hideClothes'],
    "the guided first tribute is fixed to hide clothes even mid-scenario (R5)",
  );
  assert.ok(state.log.some(entry => entry.text.includes('파발이 왔습니다')), 'the dispatch is logged');
  // 통제 유민: 인구가 실제로 늘었다
  assert.ok(popBeforeImmigrants != null && popAfterImmigrants != null, 'the immigrant step was observed');
  assert.ok(
    popAfterImmigrants > popBeforeImmigrants,
    `accepting the scripted party grows the settlement (${popBeforeImmigrants} → ${popAfterImmigrants})`,
  );
  // 광물: 주입 없이 실제 채광꾼이 마을 곁 노두를 캐 목표에 닿았다 (모범 답안은 배정뿐이다)
  assert.ok(
    mineralsMined >= config.CONFIG.tutorial.mineralsMinedGoal,
    `an assigned miner actually reaches the haul target (got ${mineralsMined})`,
  );
  // 통제 습격: 무리가 지도에 서고, 전투를 거쳐 물러났다
  assert.equal(raidersSeen, true, 'the scripted raid put a band on the map');
  assert.equal(battleFought, true, 'the scripted raid went through the real battle path');
  assert.ok(
    state.lifetimeStats.raidsRepelled > repelledBefore,
    'the model answer (militia intercept) repels the scripted raid',
  );
  assert.ok(state.log.some(entry => entry.text.includes('무리가 물러갔습니다')), 'the raid step logs its close');
  // 10단계가 가르친 대로 세공고에 몫이 잠겨 있다 (수거는 그해 겨울, 길잡이가 끝난 뒤에 온다)
  assert.ok(
    tributeReserve.tributeReserved(state, 'hideClothes') >= 1,
    'the tribute step leaves the reserve stocked for the winter collector',
  );
  // 길잡이 모듈 중복 방지: 스텝이 가르친 두 모듈은 본 것으로 적혀 다시 뜨지 않는다
  assert.equal(guides.hasSeenGuide(state, 'tribute'), true, 'the tribute guide is marked seen by its step (R5)');
  assert.equal(guides.hasSeenGuide(state, 'tannery'), true, 'the tannery guide is marked seen by its step (R5)');
  assert.equal(
    state.log.some(entry => entry.text.includes('길잡이 — 세공(歲貢)과 파발')), false,
    'the tribute guide never fires on top of the step that teaches it',
  );
  assert.equal(
    state.log.some(entry => entry.text.includes('길잡이 — 무두장이와 가죽공방')), false,
    'the tannery guide never fires on top of the step that teaches it',
  );
  assert.deepEqual(guides.guideCards(state).map(card => card.moduleId).filter(id => id === 'tannery'), []);
}

{
  // R5-1 광물 스텝은 실습이다: 광맥 탭 → 채광꾼 배정 → 지표 노두에서 돌·철 캐기.
  // 채광장(mine)은 보(堡) 전용으로 그대로 두었다 — 채광꾼은 거점 없이도 노두를 캐기 때문이다
  // (agents.ts minerTick의 채집 경로). 본문은 채광장·채광갱을 뒷날의 확장으로만 소개한다.
  const state = tutorialStart.createTutorialGame();
  const step = stepById('minerals');
  const outcrops = tutorialStart.tutorialNearbyOutcrops(state);
  assert.ok(outcrops.stone >= 1 && outcrops.iron >= 1,
    `the settlement starts beside one stone and one iron outcrop (${JSON.stringify(outcrops)})`);
  assert.equal(
    state.log.some(entry => entry.text.includes('노두가 없습니다')), false,
    'the outcrop invariant does not fire on the chosen seed',
  );
  assert.equal(step.isDone(state), false);
  markFlags(state, 'oreToggled');
  assignJobs(state, { miner: 1 });
  assert.equal(step.isDone(state), false, 'a miner alone does not close the step — something must be mined');
  scenario.countScenarioProgress(state, 'mineralsMined', state.scenario.flags.mineralsMinedGoal);
  assert.equal(step.isDone(state), true, 'ore tab, miner and a first haul close the mineral step');
  assert.equal(
    goalItem(step, state, '돌·철').target, config.CONFIG.tutorial.mineralsMinedGoal,
    'the haul target comes from CONFIG',
  );
  // 채광장은 여전히 보(堡) 전용이고, 본문은 그것을 뒷날의 확장으로 소개한다
  assert.equal(buildings.BUILDING_DEFS.mine.minRank, 'bo', 'the mine stays a bo-rank building');
  assert.match(step.body, /채광장은 보\(堡\)로 오른 뒤의 확장/);
  assert.ok(!/채광장을 세우/.test(step.body), 'the step never asks for a mine it cannot build');
  // 노두 보장은 본게임 공통이다 — 아무 시드에서나 마을 곁에 돌·철이 하나씩 선다
  for (const seed of [20260718, 20260801, 12345, 999983]) {
    const plain = simulation.newGame(seed, 'normal');
    const nearby = tutorialStart.tutorialNearbyOutcrops(plain);
    assert.ok(
      nearby.stone >= 1 && nearby.iron >= 1,
      `seed ${seed} starts beside a stone and an iron outcrop (${JSON.stringify(nearby)})`,
    );
  }
  // 광맥 탭은 실제 UI에 연결되어 있다 (앵커 + 플래그)
  const layersSource = readFileSync(new URL('../../src/components/MapLayerTabs.tsx', import.meta.url), 'utf8');
  assert.match(layersSource, /data-tut="map-layer-ore"/, 'the ore tab carries a coach anchor');
  assert.match(sessionSource, /markScenarioFlag\(stateRef\.current, 'oreToggled'\)/, 'toggling the ore tab marks the flag');
  assert.match(coachSource, /tut: 'map-layer-ore'/, 'the coach points at the ore tab');
}

{
  // R5-2 누계 표식: '지어낸 양'은 시작 재고와 섞이지 않는다.
  // 표식 자체는 잎 모듈(scenarioFlags)에 있고, 생산 훅(agents.ts)이 그것을 올린다.
  const state = tutorialStart.createTutorialGame();
  const tanning = stepById('tanning');
  const smithy = stepById('smithy');
  assert.ok(state.resources.hideClothes > state.scenario.flags.hideClothesMadeGoal,
    'the settlement already ships more hide clothes than the goal — a stock check would teach nothing');
  assert.ok(state.resources.tools > state.scenario.flags.toolsCraftedGoal,
    'the settlement already ships more tools than the goal');
  assert.equal(goalItem(tanning, state, '가죽옷').current, 0, 'nothing has been tanned yet');
  assert.equal(goalItem(smithy, state, '도구').current, 0, 'nothing has been forged yet');
  scenario.countScenarioProgress(state, 'hideClothesMade', 1);
  assert.equal(goalItem(tanning, state, '가죽옷').current, 1);
  scenario.countScenarioProgress(state, 'toolsCrafted', 5);
  assert.equal(goalItem(smithy, state, '도구').current, 5);
  // 시나리오가 걷힌 뒤에는 쌓지 않는다
  const finished = tutorialStart.createTutorialGame();
  finished.scenario = null;
  scenario.countScenarioProgress(finished, 'toolsCrafted', 3);
  assert.equal(finished.scenario, null);
  // 생산 훅 연결 — 대장간은 도구를, 가죽공방은 가죽옷을 지을 때만 센다
  assert.match(agentsSource, /countScenarioProgress\(state, 'toolsCrafted', made\)/,
    'the smithy tick feeds the tools counter');
  assert.match(agentsSource, /countScenarioProgress\(state, 'hideClothesMade', tanned\)/,
    'the tannery tick feeds the hide clothes counter');
  assert.match(agentsSource, /countScenarioProgress\(state, 'mineralsMined', extraction\.amount\)/,
    'the miner tick feeds the mined minerals counter');
  assert.match(agentsSource, /from '\.\/scenarioFlags'/,
    'agents imports the leaf module, not scenario.ts (agents → scenario → raids → agents would cycle)');
}

{
  // R5-3 통제 유민: 랜덤 게이트를 우회해 스텝이 직접 제안하고,
  //      돌려보내도 며칠 뒤 다시 찾아온다 — 거절이 스텝을 잠그면 안 된다.
  const state = tutorialStart.createTutorialGame();
  state.scenario.stepIndex = EXPECTED_STEP_IDS.indexOf('immigrants');
  state.scenario.introShown = false;
  state.pendingChoice = null;
  scenario.dailyScenarioTick(state); // onStart + 스텝 모달
  assert.equal(state.pendingChoice?.kind, 'scenario');
  const basePop = state.residents.filter(resident => resident.alive).length;
  assert.equal(state.scenario.flags.immigrantBasePop, basePop);
  simulation.resolveChoice(state, 'ok');

  const step = stepById('immigrants');
  const offerDay = () => state.scenario.flags.immigrantOfferDay;
  state.day += 1;
  scenario.dailyScenarioTick(state);
  assert.equal(state.pendingChoice?.kind, 'immigration', 'the step opens the immigration modal itself');
  assert.equal(offerDay(), state.day);
  // 돌려보낸다 — 스텝은 아직 열려 있다
  simulation.resolveChoice(state, 'reject');
  assert.equal(step.isDone(state), false, 'rejecting the party leaves the step open');
  // 재제안 대기 중에는 다시 열지 않는다
  state.day += 1;
  scenario.dailyScenarioTick(state);
  assert.equal(state.pendingChoice, null, 'the re-offer waits out its cooldown');
  // 대기가 지나면 다시 찾아온다
  state.day += config.CONFIG.tutorial.immigrantRetryDays;
  scenario.dailyScenarioTick(state);
  assert.equal(state.pendingChoice?.kind, 'immigration', 'the party comes back a few days later');
  const accepted = Number(state.pendingChoice.data.count);
  simulation.resolveChoice(state, 'accept');
  assert.equal(
    state.residents.filter(resident => resident.alive).length, basePop + accepted,
    'accepting grows the settlement by the party size',
  );
  state.day += 1;
  scenario.dailyScenarioTick(state);
  assert.equal(state.scenario.flags.immigrantsJoined, 1, 'the population gain latches the sub-goal');
  assert.equal(goalItem(step, state, '유민 수용').current, 1);
}

{
  // R5-4 통제 습격: 스텝이 작은 무리 하나를 직접 불러 세우고,
  //      어떻게 물리든(피난까지 포함) 습격이 끝나고 마을이 남으면 스텝이 닫힌다.
  //      이기지 못한 개척지가 마지막 스텝에 갇히면 안 된다.
  const state = tutorialStart.createTutorialGame();
  state.scenario.stepIndex = EXPECTED_STEP_IDS.indexOf('battle');
  state.scenario.introShown = true;
  state.pendingChoice = null;
  const step = stepById('battle');
  assert.equal(step.isDone(state), false);
  scenario.dailyScenarioTick(state);
  assert.equal(state.scenario.flags.raidAlerted, 1, 'the scripted raid raises the alert');
  assert.equal(state.scenario.flags.raidSpawnDay, state.day);
  assert.ok(state.raiders || state.pendingChoice, 'a band is on the map (or already at the gate)');
  if (state.raiders) {
    assert.equal(state.raiders.faction, config.CONFIG.tutorial.scriptedRaidFaction);
    assert.equal(state.raiders.power, config.CONFIG.tutorial.scriptedRaidPower);
    assert.ok(state.raiders.size <= 3, `the scripted band stays small (got ${state.raiders.size})`);
    assert.equal(state.raiders.warned, true, 'the scripted raid always comes with a warning');
  }
  // 아직 진행 중인 동안에는 격퇴로 치지 않는다
  state.day += 1;
  scenario.dailyScenarioTick(state);
  assert.equal(step.isDone(state), false, 'the step waits while the band is still on the map');
  // 피난(가장 불리한 선택)으로 끝내도 스텝은 닫힌다
  state.raiders = null;
  state.pendingChoice = null;
  state.day += 1;
  scenario.dailyScenarioTick(state);
  assert.equal(state.scenario.flags.raidRepelled, 1, 'a finished raid with the village standing closes the step');
  assert.equal(state.scenario.stepIndex, EXPECTED_STEP_IDS.length, 'the last step hands off to completion');
}

{
  // R5-5 길잡이 모듈 중복 방지: 스텝이 가르친 모듈은 발화 없이 '본 것'으로만 적힌다.
  //      일반 게임의 R4 흐름(파발 모달 → 가죽공방 카드)은 그대로 남는다.
  const state = tutorialStart.createTutorialGame();
  state.scenario = null;
  state.pendingChoice = null;
  guides.markGuideSeen(state, 'tribute');
  assert.equal(guides.hasSeenGuide(state, 'tribute'), true);
  assert.equal(state.pendingChoice, null, 'marking seen never opens anything');
  assert.deepEqual(state.guideModalQueue ?? [], []);
  assert.equal(state.log.some(entry => entry.text.includes('길잡이 — 세공')), false, 'and never logs');
  assert.equal(guides.openGuideOnce(state, 'tribute'), false, 'the module can no longer fire');
  // 표식이 없는 모듈은 그대로 발화한다
  assert.equal(guides.openGuideOnce(state, 'tannery'), true);
  // 스텝의 onStart가 실제로 그 표식을 남긴다
  const running = tutorialStart.createTutorialGame();
  running.pendingChoice = null;
  for (const [stepId, moduleId] of [['tribute', 'tribute'], ['tanning', 'tannery']]) {
    running.scenario.stepIndex = EXPECTED_STEP_IDS.indexOf(stepId);
    running.scenario.introShown = false;
    running.pendingChoice = null;
    scenario.dailyScenarioTick(running);
    assert.equal(guides.hasSeenGuide(running, moduleId), true, `the ${stepId} step marks the ${moduleId} guide seen`);
    running.pendingChoice = null;
  }
}

{
  // R5-6 가죽옷 고정은 시나리오가 도는 동안에도 적용된다 (완주 표식은 아직 서지 않았다).
  //      이 판정이 없으면 둘째 해 봄 파발이 무작위 품목을 물어 와 무두장이 스텝과 어긋난다.
  const state = tutorialStart.createTutorialGame();
  assert.equal(state.tutorialGraduate, undefined, 'the mark only appears at completion');
  assert.equal(scenario.scenarioActive(state), true);
  state.day = config.CONFIG.time.yearDays + 1; // 둘째 해 봄 첫날
  courtTribute.announceCourtTribute(state);
  assert.deepEqual(
    Object.keys(state.courtTribute.items), ['hideClothes'],
    'a running tutorial gets the fixed first tribute (R5)',
  );
  // 일반 게임은 그대로 무작위 롤이다
  const plain = simulation.newGame(20260803, 'normal');
  plain.day = config.CONFIG.time.yearDays + 1;
  courtTribute.announceCourtTribute(plain);
  assert.deepEqual(
    plain.courtTribute.items,
    courtTribute.rollCourtTribute(plain.seed, 2, plain.residents.filter(r => r.alive).length, plain.rank).items,
    'a normal game is unaffected by the scenario-side fix',
  );
}

{
  // R5-7 둘째 해의 결정론 사건 하나가 게이트 밖에서 길잡이를 덮었다 — 참전 요청(연 1회, 2년차부터).
  // 수락하면 수비병이 마을을 비워 16단계의 통제 습격까지 어그러지므로 시나리오 중에는 미룬다.
  // 미루기만 한다 — 연차 표식을 남기지 않으므로 길잡이가 끝나면 같은 해에도 전령이 다시 온다.
  const running = tutorialStart.createTutorialGame();
  running.pendingChoice = null;
  running.day = config.CONFIG.time.yearDays + 30; // 둘째 해, 요청이 오는 날 구간
  running.lastWarParticipationOfferYear = 0;
  militaryAid.dailyMilitaryDiplomacyTick(running);
  assert.equal(running.pendingChoice, null, 'the war request never interrupts a running tutorial');
  assert.equal(running.lastWarParticipationOfferYear, 0, 'and it is only deferred, not consumed');
  // 시나리오가 걷히면 같은 날에 곧바로 온다
  running.scenario = null;
  militaryAid.dailyMilitaryDiplomacyTick(running);
  assert.equal(running.lastWarParticipationOfferYear, 2, 'the deferred request comes as soon as the tutorial hands off');
}

{
  // R5-8 코치: 둘째 해 7스텝에도 힌트가 있고, 새 직업은 ＋ 경로를 따른다
  for (const id of SECOND_YEAR_STEP_IDS) {
    assert.ok(
      new RegExp(`\\n  ${id}: \\[`).test(coachSource),
      `the coach has hints for the ${id} step`,
    );
  }
  for (const job of ['tanner', 'miner', 'smith']) {
    assert.ok(coachSource.includes(`tut: 'job-plus-${job}'`), `coach staffs ${job} through the quick ＋ button`);
  }
  for (const anchor of ['build-item-tannery', 'build-item-smithy', 'build-item-market', 'dock-court', 'tribute-reserve']) {
    assert.ok(coachSource.includes(`tut: '${anchor}'`), `coach uses the ${anchor} anchor`);
  }
  // 조정 창 열람은 다시 연결되었다 (R4에서 걷었던 플래그)
  assert.match(
    sessionSource, /markScenarioFlag\(runtimeState, 'courtWindowOpened'\)/,
    'opening the court window marks the tribute step flag again (R5)',
  );
}

{
  // R4: 길잡이를 마친 게임의 둘째 해 봄 — 파발이 오고, 첫 세공 품목은 가죽옷으로 고정된다.
  //     파발 모달(tribute)을 닫으면 곧바로 가죽공방 카드(tannery)가 이어 선다.
  const state = tutorialStart.createTutorialGame();
  state.scenario.stepIndex = scenario.TUTORIAL_STEPS.length;
  state.scenario.completed = true;
  state.scenario.introShown = true;
  state.pendingChoice = null;
  scenario.dailyScenarioTick(state);
  simulation.resolveChoice(state, 'guided');
  assert.equal(state.tutorialGraduate, true);
  assert.equal(state.guides.enabled, true);
  assert.equal(state.courtTribute, null, 'the first year carries no tribute demand');

  // 첫 해 마지막 날 → 둘째 해 봄 첫날. 세공 공지는 이 계절 전환에서 온다
  state.day = config.CONFIG.time.yearDays;
  state.threat = 0; // 습격 모달이 파발 안내를 가리지 않게 한다
  keepAlive(state);
  resolveNonGuideModals(state);
  simulation.advanceDay(state);
  assert.equal(state.gameOver, null);
  assert.equal(seasons.getSeason(state.day), 'spring');
  assert.equal(seasons.getYear(state.day), 2);

  assert.ok(state.courtTribute, 'the second spring brings the first tribute demand');
  assert.equal(state.courtTribute.year, 2);
  assert.deepEqual(
    Object.keys(state.courtTribute.items), ['hideClothes'],
    "a tutorial graduate's first tribute is fixed to hide clothes (R4)",
  );
  // 수량은 일반 롤과 같은 셈 — 품목 기준량 × 연차·인구·승격 배율
  const pop = state.residents.filter(resident => resident.alive).length;
  const expected = Math.max(1, Math.round(
    config.CONFIG.tribute.baseAmounts.hideClothes * courtTribute.tributeScale(2, pop, state.rank)));
  assert.equal(state.courtTribute.items.hideClothes, expected, 'the fixed item keeps the usual amount rule');
  assert.ok(state.log.some(entry => entry.text.includes('파발이 왔습니다')), 'the dispatch is logged');

  // 길잡이 모듈: 파발은 모달, 가죽공방은 그 뒤를 잇는 카드
  assert.equal(guides.hasSeenGuide(state, 'tribute'), true);
  assert.equal(guides.hasSeenGuide(state, 'tannery'), false, 'the tannery card waits for the dispatch to be read');
  let flushGuard = 0;
  while (state.pendingChoice?.kind !== 'guide') {
    assert.ok(flushGuard++ < 8, 'the tribute guide modal gets its turn');
    if (state.pendingChoice) resolveNonGuideModals(state);
    else guides.dailyGuideTick(state);
  }
  assert.equal(state.pendingChoice.data.guideId, 'tribute');
  const cardsBefore = guides.guideCards(state).map(card => card.moduleId);
  assert.ok(!cardsBefore.includes('tannery'));
  simulation.resolveChoice(state, 'ok');
  const cardsAfter = guides.guideCards(state).map(card => card.moduleId);
  assert.ok(cardsAfter.includes('tannery'), 'the tannery card follows the tribute modal (R4)');
  assert.equal(cardsAfter.length, cardsBefore.length + 1, 'exactly one card is added');
  assert.ok(state.log.some(entry => entry.text.includes('무두장이와 가죽공방')), 'the card is echoed in the log');
}

{
  // R4: 일반 게임(길잡이를 거치지 않은 새 마을)도 첫 해에는 세공이 없고,
  //     둘째 해 봄에 품목이 고정되지 않은 세공이 공지되며 파발 안내가 한 번 뜬다
  const state = simulation.newGame(20260802, 'normal');
  assert.equal(state.tutorialGraduate, undefined, 'a normal game carries no tutorial mark');
  assert.equal(state.courtTribute, null, 'a normal first year has no tribute either');
  assert.equal(state.guides.enabled, true);
  state.day = config.CONFIG.time.yearDays;
  state.threat = 0;
  keepAlive(state);
  resolveNonGuideModals(state);
  simulation.advanceDay(state);
  assert.ok(state.courtTribute, 'the normal game is asked from the second year on');
  assert.deepEqual(
    state.courtTribute.items,
    courtTribute.rollCourtTribute(state.seed, 2, state.residents.filter(r => r.alive).length, state.rank).items,
    'a normal game keeps the random roll — only tutorial graduates get a fixed first item',
  );
  assert.equal(guides.hasSeenGuide(state, 'tribute'), true, 'the dispatch guide fires in normal games too');

  // 셋째 해에는 다시 뜨지 않는다 (1회성)
  const seenDay = state.guides.seen.tribute;
  state.day = config.CONFIG.time.yearDays * 2;
  state.courtTribute.resolved = true;
  resolveNonGuideModals(state);
  guides.dailyGuideTick(state); // 대기 중이던 파발 모달을 열고
  if (state.pendingChoice?.kind === 'guide') simulation.resolveChoice(state, 'ok'); // 닫아 하루를 진행시킨다
  resolveNonGuideModals(state);
  keepAlive(state);
  simulation.advanceDay(state);
  assert.equal(state.courtTribute.year, 3, 'the third year is announced as usual');
  assert.equal(state.guides.seen.tribute, seenDay, 'the dispatch guide never fires twice');
}

{
  // R1-3: 자연 발병 잠금 — 병을 부르는 조건(추위·굶주림)을 극단으로 밀어도
  // 길잡이가 도는 동안에는 아무도 앓아눕지 않는다. 6단계의 통제 병자만이 유일한 병자다.
  const state = tutorialStart.createTutorialGame();
  closeModals(state);
  const inviteIllness = s => {
    for (const resident of s.residents) {
      if (!resident.alive) continue;
      resident.warmth = 5;   // sickColdChance
      resident.hunger = 5;   // sickHungryChance
      resident.health = 100; // 죽어서 표본이 사라지지 않게 받쳐 준다
      resident.sick = false;
    }
  };
  for (let day = 0; day < 40; day++) {
    inviteIllness(state);
    keepAlive(state);
    simulation.advanceDay(state);
    closeModals(state);
    const scriptedId = state.scenario?.flags.patientResidentId ?? null;
    const strays = state.residents.filter(resident =>
      resident.alive && resident.sick && resident.id !== scriptedId);
    assert.equal(strays.length, 0, `natural illness fired during the tutorial on day ${state.day}`);
  }

  // 길잡이가 끝나면 같은 조건에서 다시 병자가 난다 — 잠금은 시나리오 동안만이다
  state.scenario = null;
  state.guides = { enabled: false, seen: {} };
  let fellIll = false;
  for (let day = 0; day < 40 && !fellIll; day++) {
    inviteIllness(state);
    keepAlive(state);
    state.pendingChoice = null;
    simulation.advanceDay(state);
    fellIll = state.residents.some(resident => resident.alive && resident.sick);
  }
  assert.equal(fellIll, true, 'natural illness returns once the tutorial hands off');
}

{
  // 완료 후 개방 (계획 §9-7) — 게이트가 술어로만 열리는 게 아니라 endOfDay에서 실제로 풀리는지 본다.
  // 습격 판정(checkRaidTrigger)은 게이트 안에만 있으므로, 위협도를 매일 최대로 밀어 두고
  // 같은 날수를 돌려 "길잡이 중"과 "완료 후"를 맞대어 본다.
  const PROBE_DAYS = 30;
  // 습격이 실제로 섰다는 흔적 — 전부 게이트 안(checkRaidTrigger)에서만 생긴다
  const raidFired = s =>
    s.raiders != null || s.battle != null || s.tacticalBattle != null ||
    s.raidCooldown > 0 || s.guides?.seen?.battle != null;

  const probeRaids = (s, { strictModals }) => {
    for (let day = 0; day < PROBE_DAYS; day++) {
      keepAlive(s);
      s.threat = 100;      // 위협도 최대 — 게이트만 열려 있으면 습격이 온다
      s.raidCooldown = 0;
      simulation.advanceDay(s);
      assert.equal(s.gameOver, null, 'the raid probe never ends the game');
      if (raidFired(s)) return true;
      if (strictModals) {
        closeModals(s); // 길잡이 중에는 허용 목록 밖의 모달이 뜨면 그 자리에서 실패한다
      } else {
        let guard = 0;
        while (s.pendingChoice && guard++ < 10) {
          const option = s.pendingChoice.options.find(candidate => !candidate.disabled);
          if (!option) break;
          simulation.resolveChoice(s, option.id);
        }
      }
    }
    return raidFired(s);
  };

  // 잠금: 길잡이가 도는 동안에는 위협도가 꽉 차 있어도 습격이 오지 않는다
  const locked = tutorialStart.createTutorialGame();
  assert.equal(scenario.scenarioSuppressesRandomEvents(locked), true);
  assert.equal(
    probeRaids(locked, { strictModals: true }), false,
    'a running tutorial keeps the raid gate shut even at maximum threat',
  );
  assert.ok(scenario.currentScenarioStep(locked), 'the probe leaves the tutorial running');

  // 개방: 완료 선택을 마친 뒤 같은 조건에서는 습격이 실제로 온다
  const opened = tutorialStart.createTutorialGame();
  opened.scenario.stepIndex = scenario.TUTORIAL_STEPS.length;
  opened.scenario.completed = true;
  opened.scenario.introShown = true;
  opened.pendingChoice = null;
  scenario.dailyScenarioTick(opened);
  assert.equal(opened.pendingChoice?.data.phase, 'complete');
  simulation.resolveChoice(opened, 'guided');
  assert.equal(opened.scenario, null);
  assert.equal(scenario.scenarioSuppressesRandomEvents(opened), false);
  assert.equal(
    probeRaids(opened, { strictModals: false }), true,
    'the completion choice actually reopens the random event gate in endOfDay',
  );
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
  // 초회 도움말: 길잡이 시나리오가 도는 동안에는 절대 발화하지 않는다 (이중 안내 금지)
  const state = tutorialStart.createTutorialGame();
  assert.equal(state.guides.enabled, true);
  assert.equal(guides.openGuideOnce(state, 'fire'), false, 'guides stay silent while the tutorial runs');
  assert.equal(guides.hasSeenGuide(state, 'fire'), false, 'a suppressed guide is not marked as seen');
  assert.deepEqual(state.guides.seen, {});
  // 시나리오가 끝나면 같은 트리거가 열린다
  state.scenario = null;
  assert.equal(guides.openGuideOnce(state, 'fire'), true);
  assert.equal(guides.openGuideOnce(state, 'fire'), false, 'the same module never opens twice');
  assert.equal(guides.hasSeenGuide(state, 'fire'), true);
  assert.equal(state.guides.seen.fire, state.day);
}

{
  // 형식 구분: 습격·화재·재해와 세공 파발만 모달(대기열 → 자리 비면 pendingChoice), 나머지는 비차단 카드
  const modalIds = ['fire', 'battle', 'disaster', 'tribute'];
  for (const id of Object.keys(guides.GUIDE_MODULES)) {
    const module = guides.GUIDE_MODULES[id];
    assert.equal(module.id, id, `guide module ${id} carries its own id`);
    assert.ok(module.title && module.summary && module.body, `guide module ${id} has text`);
    assert.equal(
      module.format, modalIds.includes(id) ? 'modal' : 'card',
      `guide module ${id} uses the planned format`,
    );
  }
  // 계획서 §5 트리거 표의 12개 모듈 + R4의 세공 파발·가죽공방 2개
  assert.deepEqual(Object.keys(guides.GUIDE_MODULES).sort(), [
    'battle', 'beast', 'chronicle', 'diplomacy', 'disaster', 'expedition',
    'fire', 'livestock', 'mining', 'oxen', 'preservation', 'rename',
    'tannery', 'tribute',
  ]);

  const state = tutorialStart.createTutorialGame();
  state.scenario = null;
  state.pendingChoice = null;
  // 카드: 시간을 멈추지 않고 화면에 서고, 로그에도 한 줄 남는다
  assert.equal(guides.openGuideOnce(state, 'livestock'), true);
  assert.equal(state.pendingChoice, null, 'a card guide never blocks the clock');
  assert.equal(guides.guideCards(state).length, 1);
  assert.ok(state.log.some(entry => entry.text.includes('길잡이 — 가축과 축사')), 'the card is echoed in the log');
  guides.dismissGuideCard(state, 'livestock');
  assert.equal(guides.guideCards(state).length, 0);

  // 모달: 트리거 시점에는 대기열에만 들어가 다른 사건 모달을 덮지 않는다
  state.pendingChoice = { kind: 'incident', title: '다른 사건', body: '', options: [], data: {} };
  assert.equal(guides.openGuideOnce(state, 'battle'), true);
  assert.equal(state.pendingChoice.kind, 'incident', 'a queued guide never clobbers a live event modal');
  state.pendingChoice = null;
  guides.dailyGuideTick(state);
  assert.equal(state.pendingChoice?.kind, 'guide');
  assert.equal(state.pendingChoice.data.guideId, 'battle');
  simulation.resolveChoice(state, 'ok');
  assert.equal(state.pendingChoice, null, 'the guide modal closes on acknowledgement');
}

{
  // enabled=false: 어떤 트리거도 발화하지 않고 seen도 남지 않는다
  const state = tutorialStart.createTutorialGame();
  state.scenario = null;
  state.pendingChoice = null;
  guides.setGuidesEnabled(state, false);
  for (const id of Object.keys(guides.GUIDE_MODULES)) {
    assert.equal(guides.openGuideOnce(state, id), false, `${id} stays silent while the help is off`);
    assert.equal(guides.hasSeenGuide(state, id), false);
  }
  assert.equal(guides.guideCards(state).length, 0);
  assert.equal(state.pendingChoice, null);
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

  // 초회 도움말의 1회성은 저장·로드를 건너 살아남는다 — 불러온 마을에 같은 안내가 다시 오면 안 된다
  {
    const seenState = tutorialStart.createTutorialGame();
    seenState.scenario = null;
    seenState.pendingChoice = null;
    assert.equal(guides.openGuideOnce(seenState, 'mining'), true);
    assert.equal(guides.openGuideOnce(seenState, 'chronicle'), true);
    assert.equal(saveLoad.saveGame(seenState, 3), true);
    const reloaded = saveLoad.loadGame(3);
    assert.ok(reloaded, 'a save with seen guides reloads');
    assert.equal(reloaded.guides.enabled, true);
    assert.equal(reloaded.guides.seen.mining, seenState.day, 'the seen day survives the save');
    assert.equal(guides.hasSeenGuide(reloaded, 'chronicle'), true);
    assert.equal(guides.openGuideOnce(reloaded, 'mining'), false, 'a reloaded settlement never re-fires a guide');
    assert.equal(guides.openGuideOnce(reloaded, 'chronicle'), false);
  }

  // guideCards·guideModalQueue는 스키마를 올리지 않고 얹은 표시용 필드다.
  // 그래도 안전한 근거: 로드가 둘 다 형태만 보고 빈 목록으로 정규화하고,
  // 1회성 보장은 스키마 v53에 실린 guides.seen이 지킨다.
  {
    const shown = tutorialStart.createTutorialGame();
    shown.scenario = null;
    shown.pendingChoice = null;
    assert.equal(guides.openGuideOnce(shown, 'livestock'), true);  // 카드
    assert.equal(guides.openGuideOnce(shown, 'fire'), true);       // 모달 대기열
    assert.equal(shown.guideCards.length, 1);
    assert.equal(shown.guideModalQueue.length, 1);
    assert.equal(saveLoad.saveGame(shown, 4), true);
    const key = 'buksae-save-v3-slot4';
    const raw = JSON.parse(globalThis.localStorage.getItem(key));
    delete raw.guideCards;      // 두 필드가 없던 시절의 저장을 흉내낸다
    delete raw.guideModalQueue;
    globalThis.localStorage.setItem(key, JSON.stringify(raw));
    const bare = saveLoad.loadGame(4);
    assert.ok(bare, 'a save without the transient guide fields still loads');
    assert.deepEqual(bare.guideCards, [], 'missing guide cards normalize to an empty list');
    assert.deepEqual(bare.guideModalQueue, [], 'a missing guide queue normalizes to an empty list');
    // 잃어버린 것은 표시뿐 — 다시 뜨지 않는다는 약속은 seen이 지킨다
    assert.equal(guides.hasSeenGuide(bare, 'fire'), true);
    assert.equal(guides.openGuideOnce(bare, 'fire'), false);
  }

  // R4: 길잡이 완주 표식은 저장을 건너 살아남는다 — 둘째 해 첫 세공 품목 고정이 여기에 달렸다.
  // 표식이 없는 저장(일반 게임·구버전)은 아닌 것으로 정규화되므로 스키마를 올리지 않았다.
  {
    const graduate = tutorialStart.createTutorialGame();
    graduate.scenario.stepIndex = scenario.TUTORIAL_STEPS.length;
    graduate.scenario.completed = true;
    graduate.scenario.introShown = true;
    graduate.pendingChoice = null;
    scenario.dailyScenarioTick(graduate);
    simulation.resolveChoice(graduate, 'solo'); // 안내를 껐어도 표식은 남는다
    assert.equal(graduate.tutorialGraduate, true);
    assert.equal(saveLoad.saveGame(graduate, 4), true);
    const reloaded = saveLoad.loadGame(4);
    assert.equal(reloaded.tutorialGraduate, true, 'the tutorial mark survives a save');
    assert.equal(reloaded.guides.enabled, false, 'the mark is independent of the help toggle');

    const key = 'buksae-save-v3-slot4';
    const raw = JSON.parse(globalThis.localStorage.getItem(key));
    delete raw.tutorialGraduate; // 표식이 없던 시절의 저장(=일반 게임)을 흉내낸다
    globalThis.localStorage.setItem(key, JSON.stringify(raw));
    const bare = saveLoad.loadGame(4);
    assert.equal(bare.tutorialGraduate, false, 'a save without the mark is not treated as a graduate');
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

  // 실제로 남아 있을 구판은 버전 2(옛 8스텝)·3(R3까지의 11스텝)·4(R4의 10스텝)다 —
  // 셋 다 같은 경로로 해제되고 게이트도 함께 열린다
  for (const oldVersion of [2, 3, 4]) {
    const oldRaw = JSON.parse(globalThis.localStorage.getItem('buksae-save-v3'));
    oldRaw.scenario = {
      id: 'tutorial', version: oldVersion, stepIndex: 3, introShown: true, flags: { firewoodGoal: 40 },
    };
    globalThis.localStorage.setItem('buksae-save-v3', JSON.stringify(oldRaw));
    const fromOld = saveLoad.loadGame(1);
    assert.ok(fromOld, `a version ${oldVersion} tutorial save still loads`);
    assert.equal(fromOld.scenario, null, `the version ${oldVersion} tutorial is detached to normal mode`);
    assert.ok(fromOld.log.some(entry => entry.text.includes('길잡이 시나리오가 갱신')));
    assert.equal(
      scenario.scenarioSuppressesRandomEvents(fromOld), false,
      'a detached save plays with the random event gate open',
    );
  }

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
