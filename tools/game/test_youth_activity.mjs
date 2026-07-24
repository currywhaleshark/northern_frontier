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
const lifecycle = await load('lifecycle');
const education = await load('education');
const workerSlots = await load('workerSlots');
const combatRoster = await load('combatRoster');
const expedition = await load('expedition');
const saveLoad = await load('saveLoad');
const { CONFIG } = await load('config');

const selectionSource = readFileSync(new URL('../../src/components/SelectionContextBar.tsx', import.meta.url), 'utf8');
const SAVE_KEY = 'buksae-save-v3';

function openTile(state) {
  for (let y = 2; y < state.map.length - 2; y++) {
    for (let x = 2; x < state.map[y].length - 2; x++) {
      const tile = state.map[y][x];
      if (tile.buildingId == null && tile.terrain !== 'mountain' && tile.terrain !== 'water') {
        tile.terrain = 'plain';
        return tile;
      }
    }
  }
  throw new Error('no open tile');
}

function addBuilt(state, type, tile, extra = {}) {
  const building = {
    id: state.nextBuildingId++,
    type,
    x: tile.x,
    y: tile.y,
    progress: 99,
    built: true,
    fieldGrowth: 0,
    ...extra,
  };
  state.buildings.push(building);
  tile.buildingId = building.id;
  return building;
}

function makeOnlyWorker(state, stage = null) {
  const worker = state.residents[0];
  for (const resident of state.residents) resident.alive = resident.id === worker.id;
  Object.assign(worker, {
    alive: true,
    sick: false,
    health: 100,
    hunger: 100,
    warmth: 100,
    morale: 50,
    stage,
    stageProgress: 0,
    youthActivity: stage === 'youth' ? 'work' : undefined,
    education: stage === 'youth' ? 0 : undefined,
    job: 'idle',
    assignedBuildingId: null,
    phase: 'rest',
    path: [],
    workTimer: 0,
    targetId: null,
    carrying: {},
    cartEquipped: false,
    haulTask: null,
    manualOrder: null,
    skills: {},
  });
  return worker;
}

// 어린이는 배정 불가, 소년은 안전 직무만 가능하며 금지 시 기존 직업을 유지한다.
{
  const state = simulation.newGame(2026071810);
  state.rank = 'bu';
  const child = makeOnlyWorker(state, 'child');
  simulation.setResidentJob(state, child.id, 'farmer');
  assert.equal(child.job, 'idle');

  lifecycle.applyLifeStage(child, 'youth');
  assert.equal(child.youthActivity, 'work', 'new youths default to helping with work');
  for (const job of CONFIG.lifecycle.youthAllowedJobs) {
    simulation.setResidentJob(state, child.id, job);
    assert.equal(child.job, job, `youth can take ${job}`);
  }
  simulation.setResidentJob(state, child.id, 'militia');
  assert.equal(child.job, CONFIG.lifecycle.youthAllowedJobs.at(-1), 'forbidden work keeps the previous job');
  assert.ok(state.log.at(-1).text.includes('소년'));
}

// 실제 농사 산출은 같은 조건의 성인 정확히 절반이다.
function oneTickHarvest(seed, stage) {
  const state = simulation.newGame(seed);
  state.day = 25;
  state.subTick = 1;
  state.weather = 'clear';
  state.resources.tools = 100;
  const tile = openTile(state);
  const field = addBuilt(state, 'field', tile, { fieldGrowth: 100, sownArea: 1, w: 1, h: 1 });
  const farmer = makeOnlyWorker(state, stage);
  Object.assign(farmer, { job: 'farmer', x: tile.x, y: tile.y, px: tile.x, py: tile.y });
  assert.equal(workerSlots.assignResidentToBuilding(state, farmer.id, field.id), null);
  simulation.advanceTick(state);
  return 100 - field.fieldGrowth;
}

{
  const adultHarvest = oneTickHarvest(2026071811, null);
  const youthHarvest = oneTickHarvest(2026071811, 'youth');
  assert.ok(adultHarvest > 0);
  assert.ok(Math.abs(youthHarvest - adultHarvest * CONFIG.lifecycle.youthWorkEfficiency) < 1e-9,
    'youth production applies the half-share multiplier exactly once');
  assert.equal(lifecycle.laborEfficiencyMult({ age: 16, stage: 'youth', youthActivity: 'work' }), 0.5);
}

// 서당 선택은 일반 작업 슬롯을 비우고, 건강한 훈장과 자리가 있을 때만 진행한다.
{
  const state = simulation.newGame(2026071812);
  state.rank = 'jin';
  const field = addBuilt(state, 'field', openTile(state), { fieldGrowth: 10, sownArea: 1, w: 1, h: 1 });
  const school = addBuilt(state, 'school', openTile(state));
  const youth = state.residents[0];
  lifecycle.applyLifeStage(youth, 'youth');
  simulation.setResidentJob(state, youth.id, 'farmer');
  assert.equal(workerSlots.assignResidentToBuilding(state, youth.id, field.id), null);

  const teacher = state.residents[1];
  Object.assign(teacher, {
    alive: true, stage: null, sick: false, health: 100, job: 'teacher', literate: true,
    assignedBuildingId: school.id,
  });
  assert.equal(simulation.setYouthActivity(state, youth.id, 'school'), null);
  assert.equal(youth.job, 'idle');
  assert.equal(youth.assignedBuildingId, null, 'school releases the normal worker slot');

  education.dailyEducationTick(state);
  assert.equal(youth.education, CONFIG.education.schoolProgressPerDay);
  teacher.sick = true;
  education.dailyEducationTick(state);
  assert.equal(youth.education, CONFIG.education.schoolProgressPerDay, 'no healthy teacher pauses progress');
  teacher.sick = false;
  assert.equal(simulation.setYouthActivity(state, youth.id, 'work'), null);
  education.dailyEducationTick(state);
  assert.equal(youth.education, CONFIG.education.schoolProgressPerDay, 'work pauses progress without erasing it');
}

// 교육을 마친 성인은 아전·훈장 초기 숙련을 한 번만 받고 소년 활동 상태를 벗어난다.
{
  const state = simulation.newGame(2026071813);
  const youth = state.residents[0];
  lifecycle.applyLifeStage(youth, 'youth');
  youth.youthActivity = 'school';
  youth.education = CONFIG.education.schoolDaysForAdultBonus;
  youth.stageProgress = CONFIG.lifecycle.stageDays.youth - 1;
  youth.hunger = 100;
  youth.warmth = 100;
  lifecycle.lifecycleDailyTick(state, () => 0.999);
  assert.equal(youth.stage, null);
  assert.equal(youth.youthActivity, undefined);
  assert.equal(youth.skills.clerk, CONFIG.education.schoolAdultSkillBonus);
  assert.equal(youth.skills.teacher, CONFIG.education.schoolAdultSkillBonus);
  const bonus = youth.skills.clerk;
  education.settleEducationOnAdulthood(youth);
  assert.equal(youth.skills.clerk, bonus, 'adult education bonus cannot apply twice');
  assert.ok(state.log.some(entry => entry.text.includes('아전') && entry.text.includes('훈장')));
}

// 소년은 직접 직업을 오염시킨 상태에서도 전투·원정 편성에 들어가지 않는다.
{
  const state = simulation.newGame(2026071814);
  const youth = state.residents[0];
  Object.assign(youth, {
    stage: 'youth', youthActivity: 'work', job: 'militia', alive: true, sick: false, health: 100,
  });
  const defense = combatRoster.createCombatRoster(state, { context: 'villageDefense' });
  assert.equal(defense.combatants.some(entry => entry.residentId === youth.id), false);
  assert.equal(expedition.availableExpeditionResidents(state).some(entry => entry.id === youth.id), false);
}

// v23 소년은 안전한 기본값으로 복원되고, 활동·진행도는 v24 round-trip에서 유지된다.
{
  const legacy = simulation.newGame(2026071815);
  const youth = legacy.residents[0];
  Object.assign(youth, { stage: 'youth', job: 'miner', assignedBuildingId: 999, education: undefined });
  delete youth.youthActivity;
  store.set(SAVE_KEY, JSON.stringify({ ...legacy, schemaVersion: 23 }));
  const loaded = saveLoad.loadGame();
  assert.ok(loaded);
  const restored = loaded.residents.find(entry => entry.id === youth.id);
  assert.equal(restored.youthActivity, 'work');
  assert.equal(restored.education, 0);
  assert.equal(restored.job, 'idle');
  assert.equal(restored.assignedBuildingId, null);

  restored.youthActivity = 'school';
  restored.education = 7;
  assert.equal(saveLoad.saveGame(loaded), true);
  const roundTrip = saveLoad.loadGame();
  const persisted = roundTrip.residents.find(entry => entry.id === youth.id);
  assert.equal(persisted.youthActivity, 'school');
  assert.equal(persisted.education, 7);
}

// 선택 UI는 소년에게만 활동 토글·효율·진행 정지 사유·성인 보너스를 제시한다.
assert.match(selectionSource, /resident\.stage === 'youth'/);
assert.match(selectionSource, /소년기 활동/);
assert.match(selectionSource, /일 돕기/);
assert.match(selectionSource, /서당 다니기/);
assert.match(selectionSource, /성인 노동력의.*50%/);
assert.match(selectionSource, /진행 정지/);
assert.match(selectionSource, /아전.*훈장.*초기 숙련/);

console.log('youth activity tests passed');
