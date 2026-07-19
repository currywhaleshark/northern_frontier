// 만족도 성분화 + 서당 + 종교(사람이 먼저) 검증
// 계획: docs/superpowers/plans/2026-07-17-satisfaction-religion.md
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
const morale = await load('morale');
const religion = await load('religion');
const residents = await load('residents');
const { CONFIG } = await load('config');

const S = CONFIG.satisfaction;
const GOOD_INPUTS = { foodOk: true, warmthAvg: 80, dietVarietyScore: 1, clothesCoverage: 1 };

function addBuilt(state, type) {
  const building = {
    id: state.nextBuildingId++, type, x: 8, y: 8,
    progress: 9, built: true, fieldGrowth: 0,
  };
  state.buildings.push(building);
  return building;
}

// ── 티어 게이트: 정착지는 생존 항목만, 티어가 오르면 기대가 늘어난다 ──
{
  const state = simulation.newGame(2026071730);
  const factors = morale.moraleBreakdown(state, GOOD_INPUTS);
  const unlockedIds = factors.filter(factor => factor.unlocked).map(factor => factor.id);
  assert.ok(unlockedIds.includes('meal') && unlockedIds.includes('warmth'));
  assert.ok(!unlockedIds.includes('ferment') && !unlockedIds.includes('religion'),
    'settlement folk do not yet expect fermented food or faith');

  const target0 = morale.moraleTarget(state, GOOD_INPUTS);
  state.rank = 'jin';
  const targetJin = morale.moraleTarget(state, GOOD_INPUTS);
  assert.ok(targetJin < target0,
    'promotion adds unmet expectations — same behavior now yields lower morale');

  // 진 티어 기대를 채우면 회복된다
  state.lastFermentMealDay = state.day;
  const school = addBuilt(state, 'school');
  const teacher = state.residents[0];
  teacher.job = 'teacher';
  teacher.assignedBuildingId = school.id;
  assert.ok(morale.schoolActive(state), 'a staffed school satisfies education');
  const targetFilled = morale.moraleTarget(state, GOOD_INPUTS);
  assert.ok(targetFilled > targetJin, 'meeting new expectations restores the target');
}

// ── 승격 완충: 직후 며칠은 잔치 분위기가 받쳐 준다 ──
{
  const state = simulation.newGame(2026071731);
  state.promotionCheerUntil = state.day + 5;
  const factors = morale.moraleBreakdown(state, GOOD_INPUTS);
  assert.ok(factors.some(factor => factor.id === 'promotion' && factor.delta === S.promotionCheer));
}

// ── 종교: 사람이 먼저 — 네임드가 와야 시설이 열린다 ──
{
  const state = simulation.newGame(2026071732);
  state.rank = 'jin';
  religion.dailyReligionTick(state, () => 0); // 확률 통과, 첫 후보
  assert.equal(state.pendingChoice?.kind, 'religion', 'a wandering holy person knocks');
  const popBefore = state.residents.length;
  religion.resolveReligionChoice(state, 'accept');
  assert.equal(state.residents.length, popBefore + 1, 'the named resident joins');
  const named = state.residents[state.residents.length - 1];
  assert.ok(named.special, 'they carry a special id');
  assert.ok(['shaman', 'monk'].includes(named.job), 'their job is fixed to their calling');
  assert.equal((state.unlockedReligions ?? []).length, 1, 'their faith branch unlocks');

  // 직업 고정 — 다른 일을 맡지 않는다
  simulation.setResidentJob(state, named.id, 'farmer');
  assert.ok(['shaman', 'monk'].includes(named.job), 'named residents keep their calling');

  // 일반 주민은 무당/승려가 될 수 없다
  const commoner = state.residents[0];
  simulation.setResidentJob(state, commoner.id, 'shaman');
  assert.notEqual(commoner.job, 'shaman');

  // 같은 인물은 다시 오지 않는다 (다른 갈래만 남는다)
  state.religionOfferCooldownUntil = 0;
  religion.dailyReligionTick(state, () => 0);
  assert.equal(state.pendingChoice?.kind, 'religion');
  assert.notEqual(state.pendingChoice.data.special, named.special, 'each person appears once per game');
  religion.resolveReligionChoice(state, 'decline');
  assert.ok((state.religionOfferCooldownUntil ?? 0) > state.day, 'declining sets a retry cooldown');
}

// ── 종교 성분: 시설이 있으면 충족, 노승 상주는 상례를 돕는다 ──
{
  const state = simulation.newGame(2026071733);
  state.rank = 'bu';
  const before = morale.moraleBreakdown(state, GOOD_INPUTS).find(factor => factor.id === 'religion');
  assert.equal(before.delta, S.religionMissing, 'bu-rank folk miss a place of faith');
  const hermitage = addBuilt(state, 'hermitage');
  const after = morale.moraleBreakdown(state, GOOD_INPUTS).find(factor => factor.id === 'religion');
  assert.equal(after.delta, S.religionGood, 'a built hermitage satisfies faith without a resident monk');

  // 노승 상주 → 사망 슬픔 완화
  const monk = state.residents[0];
  monk.job = 'monk';
  monk.assignedBuildingId = hermitage.id;
  assert.ok(morale.hasResidentMonk(state));
  const mourner = state.residents[1];
  mourner.morale = 50;
  residents.killResident(state, state.residents[2], '병');
  assert.equal(mourner.morale, 50 - S.monkGriefRelief, 'the monk softens the village grief');
}

console.log('satisfaction tests passed');
