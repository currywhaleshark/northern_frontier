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

// saveLoad가 쓰는 localStorage 스텁 (마이그레이션 테스트용)
const store = new Map();
globalThis.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, v),
  removeItem: k => store.delete(k),
};

const compiledDir = compileGameModules();
const tributeMod = await import(pathToFileURL(join(compiledDir, 'courtTribute.mjs')).href);
const grantsMod = await import(pathToFileURL(join(compiledDir, 'courtGrants.mjs')).href);
const livestockMod = await import(pathToFileURL(join(compiledDir, 'livestock.mjs')).href);
const simulation = await import(pathToFileURL(join(compiledDir, 'simulation.mjs')).href);
const saveLoad = await import(pathToFileURL(join(compiledDir, 'saveLoad.mjs')).href);
const reserveMod = await import(pathToFileURL(join(compiledDir, 'tributeReserve.mjs')).href);
const { CONFIG } = await import(pathToFileURL(join(compiledDir, 'config.mjs')).href);
const { rollCourtGrantResources, rollCourtGrantRewards } = grantsMod;

const {
  canPayTribute,
  maybeCollectTribute,
  openCourtTributeChoice,
  resolveCourtTribute,
  rollCourtTribute,
  tributeScale,
} = tributeMod;
const {
  setTributeReserve,
  tributeReserved,
  tributeReserveRatio,
} = reserveMod;

const POOL = Object.keys(CONFIG.tribute.baseAmounts);

// ── 결정성: 같은 시드+연차 → 같은 요구 ──
assert.deepEqual(rollCourtTribute(7, 2, 20), rollCourtTribute(7, 2, 20));
assert.deepEqual(rollCourtTribute(123, 5, 33), rollCourtTribute(123, 5, 33));

// ── 품목 풀 준수 (식량·장작 미포함) / 1년차는 한 품목 / 수량 ≥ 1 ──
for (const seed of [1, 42, 999]) {
  for (let year = 1; year <= 5; year++) {
    const t = rollCourtTribute(seed, year, 15);
    const keys = Object.keys(t.items);
    assert.ok(keys.length >= 1 && keys.length <= 2, `품목 수 1~2 (${keys.length})`);
    if (year === 1) assert.equal(keys.length, 1, '1년차는 한 품목');
    for (const key of keys) {
      assert.ok(POOL.includes(key), `풀에 없는 품목: ${key}`);
      assert.notEqual(key, 'food');
      assert.notEqual(key, 'firewood');
      assert.ok(t.items[key] >= 1);
    }
    assert.equal(t.dueDay, (year - 1) * CONFIG.time.yearDays + CONFIG.time.seasonDays * 3 + 1);
    assert.equal(t.resolved, false);
    assert.equal(t.paid, false);
  }
}

// ── 연차·인구 스케일링 ──
assert.ok(tributeScale(2, 12) > tributeScale(1, 12));
assert.ok(tributeScale(1, 40) > tributeScale(1, 12));
{
  // 같은 시드+연차면 품목이 같으므로 인구가 많을 때 수량이 커야 한다
  const small = rollCourtTribute(7, 3, 10);
  const big = rollCourtTribute(7, 3, 40);
  assert.deepEqual(Object.keys(small.items), Object.keys(big.items));
  for (const key of Object.keys(small.items)) {
    assert.ok(big.items[key] > small.items[key]);
  }
}

// ── 새 게임: 1년차 세공이 공지되어 있다 ──
{
  const state = simulation.newGame(11);
  assert.ok(state.courtTribute, '새 게임에 세공이 설정된다');
  assert.equal(state.courtTribute.year, 1);
  assert.equal(state.courtTribute.resolved, false);
  assert.equal(state.tributeFailStreak, 0);
  assert.deepEqual(state.tributeReserve, {});
  assert.ok(state.log.some(e => e.text.includes('세공')), '공지 로그');
}

// ── 겨울 수거 모달: 매일 검사 가드 (모달/전투 충돌 시 미룬다) ──
{
  const state = simulation.newGame(11);
  state.day = CONFIG.time.seasonDays * 3 + 1; // 겨울 첫날

  state.pendingChoice = { kind: 'raid', title: '', body: '', options: [], data: {} };
  maybeCollectTribute(state);
  assert.equal(state.pendingChoice.kind, 'raid', '습격 모달이 떠 있으면 열지 않는다');

  state.pendingChoice = null;
  state.battle = { phase: 'clash' };
  maybeCollectTribute(state);
  assert.equal(state.pendingChoice, null, '전투 중이면 열지 않는다');

  state.battle = null;
  maybeCollectTribute(state);
  assert.equal(state.pendingChoice?.kind, 'tribute', '충돌이 없으면 연다');

  // 겨울이 아니면 열지 않는다
  const state2 = simulation.newGame(11);
  state2.day = 5;
  maybeCollectTribute(state2);
  assert.equal(state2.pendingChoice, null);
}

// ── 시뮬레이션 통합: 가을 마지막 날 → 겨울 첫날에 모달이 열린다 ──
{
  const state = simulation.newGame(11);
  state.day = CONFIG.time.seasonDays * 3; // 가을 마지막 날
  state.threat = 0; // 습격 변수 제거
  simulation.advanceDay(state);
  assert.equal(state.pendingChoice?.kind, 'tribute');
}

// ── 납부: 자원 차감 + 명성 + paid + streak 초기화 ──
{
  const state = simulation.newGame(11);
  const tribute = state.courtTribute;
  for (const [res, amt] of Object.entries(tribute.items)) {
    state.resources[res] = amt + 5;
    assert.equal(setTributeReserve(state, res, amt), null);
  }
  assert.equal(canPayTribute(state, tribute), true);
  state.tributeFailStreak = 1;
  state.day = tribute.dueDay;
  openCourtTributeChoice(state);
  assert.equal(state.pendingChoice.options[0].disabled, false);
  const repBefore = state.resources.reputation;
  resolveCourtTribute(state, 'pay-full');
  assert.equal(state.pendingChoice, null);
  assert.equal(tribute.paid, true);
  assert.equal(tribute.resolved, true);
  assert.equal(state.tributeFailStreak, 0);
  assert.equal(state.resources.reputation, Math.min(100, repBefore + CONFIG.tribute.repPaid));
  for (const [res] of Object.entries(tribute.items)) assert.equal(state.resources[res], 5);
  assert.deepEqual(state.tributeReserve, {});
}

// ── 자원 부족이면 납부 선택지가 비활성화된다 ──
{
  const state = simulation.newGame(11);
  for (const res of Object.keys(state.courtTribute.items)) state.resources[res] = 0;
  openCourtTributeChoice(state);
  assert.equal(state.pendingChoice.options[0].disabled, true);
  assert.ok(state.pendingChoice.options[0].disabledReason.includes('부족'));
  assert.equal(state.pendingChoice.options[1].disabled, true);
  state.pendingChoice = null;
}

// ── 세공고는 정수 단위만 보관하고, 구버전 소수 잔량은 일반 재고로 돌린다 ──
{
  const state = simulation.newGame(12);
  state.courtTribute = { year: 1, items: { hide: 8 }, dueDay: 37, resolved: false, paid: false };
  state.tributeReserve.hide = 6.64;
  state.resources.hide = 0.36;
  assert.equal(setTributeReserve(state, 'hide', tributeReserved(state, 'hide') + 1), null);
  assert.equal(state.tributeReserve.hide, 7);
  assert.equal(tributeReserved(state, 'hide'), 7);
  assert.ok(Math.abs(state.resources.hide) < 1e-9);

  state.resources.hide = 10.5;
  assert.equal(setTributeReserve(state, 'hide', 8), null);
  assert.equal(state.tributeReserve.hide, 8, '최대 채우기는 요구량을 넘지 않는다');
  assert.equal(state.resources.hide, 9.5);
}

// ── 격년(짝수 연차) 납부 하사품 ──
{
  const state = simulation.newGame(11);
  state.courtTribute = rollCourtTribute(state.seed, 2, 12);
  const rewards = rollCourtGrantResources(state.seed, state.courtTribute.year, state.rank);
  const before = Object.fromEntries(rewards.map(reward => [reward.resource, state.resources[reward.resource] ?? 0]));
  for (const [res, amt] of Object.entries(state.courtTribute.items)) {
    state.resources[res] = amt;
    setTributeReserve(state, res, amt);
  }
  for (const reward of rewards) before[reward.resource] = state.resources[reward.resource] ?? 0;
  openCourtTributeChoice(state);
  resolveCourtTribute(state, 'pay-full');
  assert.ok(rewards.length >= 1, '짝수 연차는 실용 하사품이 보장된다');
  for (const reward of rewards) {
    const paidAmount = state.courtTribute.items[reward.resource] ?? 0;
    assert.equal(state.resources[reward.resource], before[reward.resource] - paidAmount + reward.amount, `하사품 지급: ${reward.resource}`);
  }
}

// ── 진 이상 가축 하사: 기존 acquireLivestock 경로로 축사에 들어가며 축종을 해금한다 ──
{
  let scenario = null;
  for (let seed = 1; seed <= 500 && !scenario; seed++) {
    const state = simulation.newGame(seed);
    state.rank = 'jin';
    const stable = {
      id: state.nextBuildingId++, type: 'stable', x: 4, y: 4,
      progress: 9, built: true, fieldGrowth: 0,
      livestock: livestockMod.createLivestockState('chicken', 0),
    };
    state.buildings.push(stable);
    const rewards = rollCourtGrantRewards(state, 2);
    const livestockReward = rewards.find(reward => reward.kind === 'livestock');
    if (livestockReward) scenario = { state, stable, livestockReward };
  }
  assert.ok(scenario, 'an eligible livestock grant scenario exists');
  const { state, stable, livestockReward } = scenario;
  state.courtTribute = rollCourtTribute(state.seed, 2, 12, state.rank);
  for (const [res, amount] of Object.entries(state.courtTribute.items)) {
    state.resources[res] = amount;
    assert.equal(setTributeReserve(state, res, amount), null);
  }
  openCourtTributeChoice(state);
  resolveCourtTribute(state, 'pay-full');
  assert.equal(stable.livestock.species, livestockReward.species);
  assert.equal(stable.livestock.headcount, livestockReward.amount);
  assert.ok(state.unlockedLivestock.includes(livestockReward.species));
  assert.ok(state.log.some(entry => entry.text.includes('하사품이 내려왔습니다')));
}

// ── 부분 납부: 품목별 충족률 평균 + 비례 불이익 ──
{
  const state = simulation.newGame(2026071020);
  state.courtTribute = {
    year: 1, items: { grain: 20, iron: 2 }, dueDay: 37, resolved: false, paid: false,
  };
  state.resources.grain = 10;
  state.resources.iron = 2;
  setTributeReserve(state, 'grain', 10);
  setTributeReserve(state, 'iron', 2);
  assert.equal(tributeReserveRatio(state, state.courtTribute), 0.75, 'each tribute line has equal weight');

  const repBefore = state.resources.reputation;
  const threatBefore = state.threat;
  state.tributeFailStreak = 1;
  openCourtTributeChoice(state);
  assert.equal(state.pendingChoice.options[1].disabled, false);
  resolveCourtTribute(state, 'pay-partial');

  assert.equal(state.courtTribute.paid, false);
  assert.equal(state.tributePaidStreak, 0);
  assert.equal(state.tributeFailStreak, 0, 'at least half payment breaks failure streak');
  assert.ok(state.resources.reputation < repBefore);
  assert.ok(state.threat > threatBefore);
  assert.deepEqual(state.tributeReserve, {});
}

// ── 거절/연도 갱신: 잠근 자원이 usable stock으로 돌아온다 ──
{
  const state = simulation.newGame(2026071021);
  state.courtTribute = { year: 1, items: { grain: 10 }, dueDay: 37, resolved: false, paid: false };
  state.resources.grain = 10;
  setTributeReserve(state, 'grain', 10);
  openCourtTributeChoice(state);
  resolveCourtTribute(state, 'refuse');
  assert.equal(state.resources.grain, 10);
  assert.deepEqual(state.tributeReserve, {});

  state.courtTribute = { year: 2, items: { grain: 10 }, dueDay: 85, resolved: false, paid: false };
  setTributeReserve(state, 'grain', 6);
  state.day = 49;
  tributeMod.announceCourtTribute(state);
  assert.equal(state.resources.grain, 10, 'new tribute announcement releases the previous reserve');
}

// ── 미납: 명성 하락 + 위협 상승 + streak, 2년 연속이면 가중 ──
{
  const state = simulation.newGame(11);
  const t = CONFIG.tribute;
  const rep0 = state.resources.reputation;
  const threat0 = state.threat;
  openCourtTributeChoice(state);
  resolveCourtTribute(state, 'refuse');
  assert.equal(state.resources.reputation, Math.max(0, rep0 - t.repFail));
  assert.equal(state.threat, Math.min(100, threat0 + t.threatFail));
  assert.equal(state.tributeFailStreak, 1);
  assert.equal(state.courtTribute.paid, false);
  assert.equal(state.courtTribute.resolved, true);

  // 이듬해에도 미납 → 가중 하락
  state.courtTribute = rollCourtTribute(state.seed, 2, 12);
  const rep1 = state.resources.reputation;
  openCourtTributeChoice(state);
  resolveCourtTribute(state, 'refuse');
  assert.equal(state.resources.reputation, Math.max(0, rep1 - t.repFail - t.repFailStreakExtra));
  assert.equal(state.tributeFailStreak, 2);
}

// ── 저장 마이그레이션: 구버전 저장은 세공을 재생성, 겨울 로드면 올해분 면제 ──
{
  const state = simulation.newGame(5);
  delete state.courtTribute;
  delete state.tributeFailStreak;
  assert.equal(saveLoad.saveGame(state), true);
  const loaded = saveLoad.loadGame();
  assert.ok(loaded.courtTribute, '세공 재생성');
  assert.equal(loaded.courtTribute.year, 1);
  assert.equal(loaded.courtTribute.resolved, false);
  assert.equal(loaded.tributeFailStreak, 0);

  const winter = simulation.newGame(5);
  winter.day = CONFIG.time.seasonDays * 3 + 2; // 겨울
  delete winter.courtTribute;
  delete winter.tributeFailStreak;
  saveLoad.saveGame(winter);
  const loadedWinter = saveLoad.loadGame();
  assert.equal(loadedWinter.courtTribute.resolved, true, '겨울 로드는 올해분 면제');
  assert.equal(loadedWinter.courtTribute.paid, true);
}

console.log('court tribute tests passed');
