// 생애 주기 — 성장·소비 몫·혼인·출산·노화·자연사·장례 검증
// 계획: docs/superpowers/plans/2026-07-17-marriage-birth-growth.md
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
    output = output.replace(/(from\s+['"])(\.{1,2}\/[^'"]+)(['"])/g, (_m, start, spec, end) =>
      /\.[cm]?js$/.test(spec) ? `${start}${spec}${end}` : `${start}${spec}.mjs${end}`);
    writeFileSync(join(outDir, file.replace(/\.ts$/, '.mjs')), output, 'utf8');
  }
  return outDir;
}

const compiledDir = compileGameModules();
const load = name => import(pathToFileURL(join(compiledDir, `${name}.mjs`)).href);
const simulation = await load('simulation');
const lifecycle = await load('lifecycle');
const residents = await load('residents');
const { CONFIG } = await load('config');

const L = CONFIG.lifecycle;
const seqRng = values => {
  let index = 0;
  return () => (index < values.length ? values[index++] : 0.999);
};

function healthyState(seed) {
  const state = simulation.newGame(seed);
  state.resources.grain = 500;
  for (const r of state.residents) {
    r.hunger = 90;
    r.warmth = 90;
  }
  return state;
}

// ── 표시 나이: 성장기만 0~15세로 가속하고 성인은 실제 나이를 쓴다 ──
{
  const state = healthyState(2026071731);
  const kid = state.residents[0];
  lifecycle.applyLifeStage(kid, 'infant');
  assert.equal(lifecycle.residentDisplayAge(kid), 0);
  kid.stageProgress = L.stageDays.infant - 1;
  assert.equal(lifecycle.residentDisplayAge(kid), 3);

  lifecycle.applyLifeStage(kid, 'child');
  assert.equal(lifecycle.residentDisplayAge(kid), 3);
  lifecycle.applyLifeStage(kid, 'youth');
  assert.equal(lifecycle.residentDisplayAge(kid), 9);
  kid.stageProgress = L.stageDays.youth - 1;
  assert.equal(lifecycle.residentDisplayAge(kid), 15);

  kid.stage = null;
  kid.age = 23;
  assert.equal(lifecycle.residentDisplayAge(kid), 23);
}

// ── 소비 몫: 아이는 성인보다 적게 먹는다 ──
{
  const state = healthyState(2026071720);
  const adults = state.residents.filter(r => r.alive).length;
  assert.equal(lifecycle.consumptionWeight(state), adults, 'adults weigh 1.0 each');
  lifecycle.applyLifeStage(state.residents[0], 'infant');
  lifecycle.applyLifeStage(state.residents[1], 'child');
  lifecycle.applyLifeStage(state.residents[2], 'youth');
  const expected = adults - 3
    + L.consumptionShare.infant + L.consumptionShare.child + L.consumptionShare.youth;
  assert.ok(Math.abs(lifecycle.consumptionWeight(state) - expected) < 1e-9);
  assert.equal(lifecycle.bedShare(state.residents[0]), L.childBedShare, 'children take half a bed');
}

// ── 성장: 게이지가 차면 다음 단계로, 굶으면 멈춘다 ──
{
  const state = healthyState(2026071721);
  const kid = state.residents[0];
  lifecycle.applyLifeStage(kid, 'infant');
  for (let i = 0; i < L.stageDays.infant; i++) lifecycle.lifecycleDailyTick(state, () => 0.999);
  assert.equal(kid.stage, 'child', 'a fed, warm infant grows into a child');

  kid.hunger = L.growthPauseHungerBelow - 1;
  const progress = kid.stageProgress;
  lifecycle.lifecycleDailyTick(state, () => 0.999);
  assert.equal(kid.stageProgress, progress, 'hunger pauses growth');
  kid.hunger = 90;

  // 소년까지 다 자라면 성인이 된다
  for (let i = 0; i < L.stageDays.child + L.stageDays.youth; i++) {
    lifecycle.lifecycleDailyTick(state, () => 0.999);
  }
  assert.equal(kid.stage, null, 'the youth becomes an adult');
  assert.equal(kid.age, L.adultAge);
}

// ── 어린이는 일을 맡길 수 없다 (소년은 별도 제한 직무 정책) ──
{
  const state = healthyState(2026071722);
  const kid = state.residents[0];
  lifecycle.applyLifeStage(kid, 'child');
  simulation.setResidentJob(state, kid.id, 'farmer');
  assert.equal(kid.job, 'idle', 'children cannot take jobs');
}

// ── 노화·자연사: 새해에 한 살 먹고, 노년은 세상을 떠난다 ──
{
  const state = healthyState(2026071723);
  for (const r of state.residents) r.spouseId = null;
  const elder = state.residents[0];
  elder.age = 72;
  const other = state.residents[1];
  other.spouseId = elder.id;
  elder.spouseId = other.id;
  const before = state.residents[2].age;
  state.day = CONFIG.time.yearDays + 1; // 2년차 첫날
  lifecycle.lifecycleDailyTick(state, seqRng([0, 0.9])); // 노년 사망 성공, 혼인 롤은 실패
  assert.equal(elder.alive, false, 'elders can die of old age at new year');
  assert.equal(state.residents[2].age, before + 1, 'adults age one year per new year');
  assert.equal(other.spouseId, null, 'the widow is single again');
  assert.ok((state.corpses ?? []).some(corpse => corpse.name === elder.name), 'death leaves a corpse');
  assert.equal(lifecycle.elderLaborMult({ age: 65 }), L.elderLaborMult);
  assert.equal(lifecycle.elderLaborMult({ age: 30 }), 1);
}

// ── 혼인: 성사되면 혼례 사건이 열리고, 잔치는 민심을 올린다 ──
{
  const state = healthyState(2026071724);
  for (const r of state.residents) { r.spouseId = null; r.age = 25; }
  lifecycle.lifecycleDailyTick(state, () => 0); // 혼인 롤 성공
  const married = state.residents.filter(r => r.spouseId != null);
  assert.ok(married.length >= 2, 'a couple forms');
  assert.equal(state.pendingChoice?.kind, 'wedding', 'the wedding choice opens');
  const moraleBefore = state.residents.filter(r => r.alive).map(r => r.morale);
  lifecycle.resolveWeddingChoice(state, 'feast');
  assert.equal(state.pendingChoice, null);
  assert.ok(state.residents.filter(r => r.alive)
    .every((r, i) => r.morale >= moraleBefore[i]), 'the feast lifts everyone');
}

// ── 종교인 혼인: 무당은 가능하지만 승려·동자승은 독신이다 ──
{
  const state = healthyState(2026071730);
  for (const resident of state.residents) {
    resident.spouseId = null;
    resident.age = CONFIG.lifecycle.maxMarriageAge;
    resident.stage = null;
    delete resident.religiousVocation;
  }
  const male = state.residents.find(resident => resident.gender === 'male');
  const female = state.residents.find(resident => resident.gender === 'female');
  assert.ok(male && female);
  male.age = 25;
  male.job = 'monk';
  male.religiousVocation = 'monk';
  female.age = 25;
  lifecycle.lifecycleDailyTick(state, () => 0);
  assert.equal(male.spouseId, null, 'a monk is excluded from marriage candidates');
  assert.equal(female.spouseId, null);

  male.job = 'shaman';
  male.religiousVocation = 'shaman';
  lifecycle.lifecycleDailyTick(state, () => 0);
  assert.equal(male.spouseId, female.id, 'a shaman remains eligible to marry');
  assert.equal(female.spouseId, male.id);
}

// ── 출산: 같은 집 부부에게서 아기가 태어나고 산모는 몸을 추스른다 ──
{
  const state = healthyState(2026071725);
  for (const r of state.residents) { r.spouseId = null; r.morale = 80; }
  const mother = state.residents.find(r => r.gender === 'female');
  const father = state.residents.find(r => r.gender === 'male');
  mother.age = 24;
  father.age = 26;
  mother.spouseId = father.id;
  father.spouseId = mother.id;
  mother.homeBuildingId = 4242; // 같은 집 (건물 조회 실패 시 정원 보정만 생략된다)
  father.homeBuildingId = 4242;
  const popBefore = state.residents.length;
  // 첫 rng는 혼인 롤 — 실패시키고, 출산 롤만 성공시킨다
  lifecycle.lifecycleDailyTick(state, seqRng([0.9, 0]));
  assert.equal(state.residents.length, popBefore + 1, 'a baby is born');
  const baby = state.residents[state.residents.length - 1];
  assert.equal(baby.stage, 'infant');
  assert.equal(baby.motherId, mother.id);
  assert.equal(baby.motherName, mother.name);
  assert.equal(baby.fatherId, father.id);
  assert.equal(baby.fatherName, father.name);
  assert.ok((mother.birthRecoveryUntil ?? 0) > state.day, 'the mother recovers after birth');

  // 굶는 마을엔 아기가 안 생긴다
  state.resources.grain = 0;
  const popAfter = state.residents.length;
  lifecycle.lifecycleDailyTick(state, seqRng([0.9, 0]));
  assert.equal(state.residents.length, popAfter, 'no births while starving');
}

// ── 민심: 높으면 출산이 늘고, 25 미만에서는 주민이 가족 단위로 이탈할 수 있다 ──
{
  const prepareCouple = seed => {
    const state = healthyState(seed);
    state.scenario = {}; // 이탈을 끄고 출산 배율만 격리한다
    for (const resident of state.residents) resident.spouseId = null;
    const mother = state.residents.find(resident => resident.gender === 'female');
    const father = state.residents.find(resident => resident.gender === 'male');
    mother.age = 24;
    father.age = 26;
    mother.spouseId = father.id;
    father.spouseId = mother.id;
    mother.homeBuildingId = 4242;
    father.homeBuildingId = 4242;
    return { state, mother, father };
  };

  const high = prepareCouple(2026080507);
  for (const resident of high.state.residents) resident.morale = 100;
  const highBefore = high.state.residents.length;
  lifecycle.lifecycleDailyTick(high.state, seqRng([0.9, 0.03]));
  assert.equal(high.state.residents.length, highBefore + 1,
    'high morale raises the birth roll above the same random value');

  const low = prepareCouple(2026080508);
  for (const resident of low.state.residents) resident.morale = 0;
  const lowBefore = low.state.residents.length;
  lifecycle.lifecycleDailyTick(low.state, seqRng([0.9, 0.03]));
  assert.equal(low.state.residents.length, lowBefore,
    'low morale lowers the birth roll below the same random value');

  const departure = healthyState(2026080509);
  departure.scenario = null;
  for (const resident of departure.residents) {
    resident.morale = 0;
    resident.stage = null;
    resident.spouseId = null;
    delete resident.special;
  }
  const departureBefore = residents.livingResidents(departure).length;
  lifecycle.lifecycleDailyTick(departure, seqRng([0, 0]));
  assert.equal(residents.livingResidents(departure).length, departureBefore - 1);
  assert.ok(departure.log.some(entry => entry.text.includes('민심') && entry.text.includes('떠났습니다')),
    'a low-morale departure is reported with the unified 민심 term');
}

// ── 장례: 시신은 묘지에 묻히고, 방치하면 민심이 상한다 ──
{
  const state = healthyState(2026071726);
  const victim = state.residents[0];
  residents.killResident(state, victim, '병');
  assert.equal((state.corpses ?? []).length, 1, 'death leaves a corpse');

  const cemetery = {
    id: state.nextBuildingId++, type: 'cemetery', x: 6, y: 6,
    progress: 9, built: true, fieldGrowth: 0, w: 1, h: 1,
  };
  state.buildings.push(cemetery);
  assert.equal(lifecycle.cemeteryFreePlots(state), CONFIG.funeral.plotsPerTile,
    'one cemetery tile has four quarter-tile grave plots');

  const corpse = lifecycle.nextCorpseToCollect(state);
  const moraleBefore = state.residents.filter(r => r.alive).map(r => r.morale);
  assert.equal(lifecycle.buryCorpse(state, corpse.id, cemetery), true);
  assert.equal(cemetery.graves, 1);
  assert.deepEqual(cemetery.burialRecords, [{
    corpseId: corpse.id,
    name: corpse.name,
    cause: corpse.cause,
    deathDay: corpse.deathDay,
    burialDay: state.day,
  }], 'burial preserves the identity, cause, and date after the corpse is removed');
  assert.equal((state.corpses ?? []).length, 0);
  assert.equal(lifecycle.cemeteryFreePlots(state), 3);
  assert.ok(state.residents.filter(r => r.alive)
    .every((r, i) => r.morale >= moraleBefore[i]), 'burial comforts the village');

  // 방치 페널티
  residents.killResident(state, state.residents[1], '병');
  state.corpses[0].deathDay = state.day - CONFIG.funeral.unburiedGraceDays - 1;
  const moraleBefore2 = state.residents.find(r => r.alive).morale;
  lifecycle.lifecycleDailyTick(state, () => 0.999);
  assert.ok(state.residents.find(r => r.alive).morale < moraleBefore2,
    'an unburied corpse hurts morale');
}

// ── 방치 경고: 묘지 자리와 장의사 부족을 실제 원인대로 구분한다 ──
{
  const state = healthyState(2026071732);
  assert.match(lifecycle.unburiedDelayMessage(state), /묘지가 필요/,
    'a settlement without a cemetery is told to build one');

  const fullCemetery = {
    id: state.nextBuildingId++, type: 'cemetery', x: 6, y: 6,
    progress: 9, built: true, fieldGrowth: 0, w: 1, h: 1,
    graves: CONFIG.funeral.plotsPerTile,
  };
  state.buildings.push(fullCemetery);
  assert.match(lifecycle.unburiedDelayMessage(state), /묘 자리가 모두 찼습니다/,
    'full grave plots are not misreported as an undertaker shortage');

  fullCemetery.graves = 0;
  assert.match(lifecycle.unburiedDelayMessage(state), /장의사가 없습니다/,
    'free plots without an available assigned undertaker report a labor shortage');

  const freeCemetery = {
    id: state.nextBuildingId++, type: 'cemetery', x: 8, y: 6,
    progress: 9, built: true, fieldGrowth: 0, w: 1, h: 1,
    graves: 0,
  };
  state.buildings.push(freeCemetery);
  const undertaker = state.residents.find(resident => resident.alive);
  undertaker.job = 'undertaker';
  undertaker.assignedBuildingId = fullCemetery.id;
  fullCemetery.graves = CONFIG.funeral.plotsPerTile;
  assert.match(lifecycle.unburiedDelayMessage(state), /배정된 묘지의 자리가 찼습니다/,
    'an undertaker assigned to a full cemetery is told to move to the cemetery with free plots');

  undertaker.assignedBuildingId = freeCemetery.id;
  assert.match(lifecycle.unburiedDelayMessage(state), /수습하고 있으나/,
    'an available undertaker with free assigned plots reports an actual processing delay');
}

// ── 원정 전사자: 시신을 수습해 돌아오고, 전멸하면 잃는다 ──
{
  const state = healthyState(2026071728);
  const fallen = state.residents[0];
  state.expedition = { memberIds: [fallen.id, state.residents[1].id] };
  fallen.x = 60; fallen.y = 60; // 원정지에서 전사
  residents.killResident(state, fallen, '토벌 교전', false, true);
  const corpse = state.corpses[state.corpses.length - 1];
  assert.equal(corpse.withExpedition, true, 'expedition corpses travel with the party');
  assert.equal(lifecycle.nextCorpseToCollect(state)?.id !== corpse.id, true,
    'the undertaker cannot chase an expedition corpse');

  lifecycle.deliverExpeditionCorpses(state, 5, 5);
  assert.equal(corpse.withExpedition, false, 'the corpse comes home on return');
  assert.equal(corpse.x, 5);
  assert.equal(corpse.deathDay, state.day, 'the unburied grace restarts at delivery');

  // 전멸 — 시신을 잃는다
  const fallen2 = state.residents[1];
  state.expedition = { memberIds: [fallen2.id] };
  residents.killResident(state, fallen2, '토벌 교전', false, true);
  const before = state.corpses.length;
  lifecycle.loseExpeditionCorpses(state);
  assert.equal(state.corpses.length, before - 1, 'a wiped expedition leaves no corpses to recover');
  state.expedition = null;
}

// ── 이주 가족 구성: 아이·노부모가 섞여 온다 ──
{
  const state = healthyState(2026071727);
  state.lastImmigrationDay = -999;
  state.pendingChoice = null;
  const opened = (await load('immigration')).maybeOfferImmigration(
    state,
    seqRng([0, 0.99, 0, 0, 0]), // 확률 통과, 최대 인원, 아이 포함, 노부모 포함, 사연 첫 번째
  );
  assert.equal(opened, true);
  assert.equal(state.pendingChoice?.kind, 'immigration');
  assert.equal(state.pendingChoice.data.children, 1, 'the group includes a child');
  assert.equal(state.pendingChoice.data.elders, 1, 'the group includes an elder');
  const popBefore = state.residents.length;
  simulation.resolveChoice(state, 'accept');
  const newcomers = state.residents.slice(popBefore);
  assert.ok(newcomers.some(r => r.stage === 'child' || r.stage === 'youth'), 'a child arrived');
  assert.ok(newcomers.some(r => !r.stage && r.age >= 55), 'an elder arrived');
}

console.log('lifecycle tests passed');
