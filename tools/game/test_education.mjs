// 교육·문해 시스템 테스트 — 취학 파이프라인, 관직 게이트, 문해 혜택, 유민 공급, 마이그레이션.
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
const education = await import(pathToFileURL(join(compiledDir, 'education.mjs')).href);
const lifecycle = await import(pathToFileURL(join(compiledDir, 'lifecycle.mjs')).href);
const residents = await import(pathToFileURL(join(compiledDir, 'residents.mjs')).href);
const immigration = await import(pathToFileURL(join(compiledDir, 'immigration.mjs')).href);
const saveLoad = await import(pathToFileURL(join(compiledDir, 'saveLoad.mjs')).href);
const equipment = await import(pathToFileURL(join(compiledDir, 'equipment.mjs')).href);
const { CONFIG } = await import(pathToFileURL(join(compiledDir, 'config.mjs')).href);

function addSchoolWithTeacher(state) {
  const school = {
    id: 9200 + state.buildings.length,
    type: 'school', x: 2, y: 2, progress: 99, built: true, fieldGrowth: 0,
  };
  state.buildings.push(school);
  const teacher = state.residents.find(r => r.alive && !r.stage && !r.special);
  teacher.literate = true;
  teacher.job = 'teacher';
  teacher.sick = false;
  teacher.health = 100;
  teacher.assignedBuildingId = school.id;
  return { school, teacher };
}

function addChild(state, stage) {
  const rng = () => 0.42;
  const child = residents.createResident(state, rng, 'idle');
  lifecycle.applyLifeStage(child, stage);
  child.hunger = 100;
  child.warmth = 100;
  state.residents.push(child);
  return child;
}

{
  // 시작 개척민 문해 시드
  const state = simulation.newGame(2026071830);
  assert.equal(
    education.literateAdults(state).length,
    CONFIG.education.startLiterateAdults,
    'new settlements start with seeded literate adults',
  );
}

{
  // 취학 → 글공부 누적 → 성인 전환 시 문해
  const state = simulation.newGame(2026071831);
  state.rank = 'jin'; // 서당·훈장 해금
  addSchoolWithTeacher(state);
  const child = addChild(state, 'youth');
  assert.ok(education.enrolledStudentIds(state).has(child.id), 'child takes a school seat');
  for (let day = 0; day < CONFIG.education.schoolingDays; day++) education.dailyEducationTick(state);
  assert.equal(child.education, CONFIG.education.schoolingDays);

  child.stageProgress = CONFIG.lifecycle.stageDays.youth - 1;
  lifecycle.lifecycleDailyTick(state, () => 0.99);
  assert.equal(child.stage, null, 'child grew up');
  assert.equal(child.literate, true, 'schooled child becomes literate');
  assert.equal(child.education, undefined, 'education gauge is cleared on adulthood');
}

{
  // 취학 없이 자란 아이는 문해자가 아니다 + 반몫 심부름 적재
  const state = simulation.newGame(2026071832);
  const child = addChild(state, 'youth');
  child.stageProgress = CONFIG.lifecycle.stageDays.youth - 1;
  lifecycle.lifecycleDailyTick(state, () => 0.99);
  assert.equal(child.literate, false);
  assert.equal(
    equipment.haulerCarryCapacity({ job: 'idle', cartEquipped: false, stage: 'child' }),
    CONFIG.agents.haulerCarryCap * CONFIG.education.childLaborMult,
    'unschooled children haul at half share',
  );
}

{
  // 정원 — 훈장 1명당 seatsPerTeacher, 소년(졸업 임박) 우선
  const state = simulation.newGame(2026071833);
  state.rank = 'jin'; // 서당·훈장 해금
  addSchoolWithTeacher(state);
  const youths = [addChild(state, 'youth'), addChild(state, 'youth')];
  const children = [];
  for (let i = 0; i < CONFIG.education.seatsPerTeacher; i++) children.push(addChild(state, 'child'));
  const enrolled = education.enrolledStudentIds(state);
  assert.equal(enrolled.size, CONFIG.education.seatsPerTeacher);
  for (const youth of youths) assert.ok(enrolled.has(youth.id), 'youths get seats first');
  assert.ok(!enrolled.has(children[children.length - 1].id), 'overflow child is not enrolled');
}

{
  // 관직 게이트 — 비문해자는 의원·아전·훈장을 맡을 수 없다
  const state = simulation.newGame(2026071834);
  state.rank = 'bu';
  for (const resident of state.residents) resident.literate = false;
  const commoner = state.residents.find(r => r.alive && !r.special);
  simulation.setResidentJob(state, commoner.id, 'physician');
  assert.notEqual(commoner.job, 'physician', 'illiterate resident cannot become physician');
  assert.equal(simulation.reassignJob(state, commoner.job, 'clerk'), false, 'no literate candidate — reassign fails');

  commoner.literate = true;
  simulation.setResidentJob(state, commoner.id, 'physician');
  assert.equal(commoner.job, 'physician', 'literate resident takes the office');
}

{
  // 문해 혜택 — 전직 이월과 숙련 가속 배율
  const state = simulation.newGame(2026071835);
  state.rank = 'bu';
  const scholar = state.residents.find(r => r.alive && !r.special);
  scholar.literate = true;
  scholar.skills.farmer = 0.8;
  simulation.setResidentJob(state, scholar.id, 'clerk');
  assert.ok(
    (scholar.skills.clerk ?? 0) >= 0.8 * CONFIG.education.literateCarryover - 1e-9,
    'literate job change carries skill over',
  );
  assert.equal(education.skillGainMult({ literate: true }), CONFIG.education.literateSkillGainMult);
  assert.equal(education.skillGainMult({ literate: false }), 1);
}

{
  // 유민 문해 공급 — 마을에 문해 성인이 없으면 첫 성인은 보장 문해자
  const state = simulation.newGame(2026071836);
  for (const resident of state.residents) resident.literate = false;
  const before = state.residents.length;
  state.pendingChoice = {
    kind: 'immigration',
    title: '', body: '',
    options: [{ id: 'accept', label: '', desc: '' }, { id: 'reject', label: '', desc: '' }],
    data: { count: 3 },
  };
  immigration.resolveImmigration(state, 'accept');
  const newcomers = state.residents.slice(before);
  assert.equal(newcomers.length, 3);
  assert.ok(
    newcomers.some(resident => !resident.stage && resident.literate === true),
    'pity guarantees a literate adult when the village has none',
  );
}

{
  // v23 마이그레이션 — 현직 관직자와 특수 주민은 문해자로 인정
  const migrated = saveLoad.migrateV22ToV23({
    schemaVersion: 22,
    residents: [
      { job: 'clerk' },
      { job: 'farmer' },
      { job: 'militia', special: 'jurchenWarrior' },
    ],
  });
  assert.equal(migrated.schemaVersion, 23);
  assert.equal(migrated.residents[0].literate, true, 'incumbent clerk is grandfathered');
  assert.equal(migrated.residents[1].literate, undefined, 'farmer stays as-is');
  assert.equal(migrated.residents[2].literate, true, 'special residents are literate');
}

console.log('education tests passed');
