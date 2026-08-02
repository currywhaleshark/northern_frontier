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
const { COURT_GRANT_ARTIFACT_IDS, rollCourtGrantResources, rollCourtGrantRewards } = grantsMod;

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

// R4: 세공은 둘째 해부터다. 세공 경로를 보는 블록은 이 헬퍼로 그해 봄에 세워 둔다.
// (길잡이 모듈은 여기 관심사가 아니므로 꺼 둔다 — 발화 순서는 튜토리얼 회귀 테스트가 본다)
function newGameInTributeYear(seed, year = 2, keepAnnouncement = false) {
  const state = simulation.newGame(seed);
  state.guides = { enabled: false, seen: {} };
  state.day = (year - 1) * CONFIG.time.yearDays + 1;
  tributeMod.announceCourtTribute(state);
  if (!keepAnnouncement && state.pendingChoice?.kind === 'tributeAnnouncement') {
    simulation.resolveChoice(state, 'acknowledge');
  }
  return state;
}

// ── 새 게임: 첫 해에는 세공이 없다 (R4) ──
{
  const state = simulation.newGame(11);
  assert.equal(state.courtTribute, null, '첫 해에는 조정이 거두지 않는다');
  assert.equal(state.tributeFailStreak, 0);
  assert.deepEqual(state.tributeReserve, {});
  assert.ok(state.log.some(e => e.text.includes('이듬해부터는 소출의 일부를 세공으로')), '첫 해 예고 로그');
}

// ── 둘째 해 봄: 파발로 그해 세공이 공지된다 ──
{
  const state = newGameInTributeYear(11, 2, true);
  assert.ok(state.courtTribute, '둘째 해에 세공이 공지된다');
  assert.equal(state.courtTribute.year, 2);
  assert.equal(state.courtTribute.resolved, false);
  assert.ok(state.log.some(e => e.text.includes('파발이 왔습니다')), '공지 로그');
  assert.equal(state.pendingChoice?.kind, 'tributeAnnouncement', '파발 도착은 연례 삽화 창으로 알린다');
  assert.equal(state.pendingChoice?.illustration?.src, '/assets/events/court-tribute-dispatch-v1.png');
  assert.ok(state.pendingChoice?.body.includes(tributeMod.tributeItemsLabel(state.courtTribute.items)));
  simulation.resolveChoice(state, 'acknowledge');
  assert.equal(state.pendingChoice, null, '파발 공지는 확인 후 닫힌다');
}

// 다른 사건 창이 열려 있어도 세공 파발은 그 뒤에 이어서 반드시 뜬다.
{
  const state = simulation.newGame(12);
  state.guides = { enabled: false, seen: {} };
  state.day = CONFIG.time.yearDays + 1;
  state.pendingChoice = {
    kind: 'guide',
    title: '먼저 온 안내',
    body: '세공 파발을 잠시 기다리게 한다.',
    options: [{ id: 'ok', label: '확인', desc: '닫는다.' }],
    data: { guideId: '' },
  };
  tributeMod.announceCourtTribute(state);
  assert.equal(state.pendingChoice.kind, 'guide', '기존 사건을 덮어쓰지 않는다');
  assert.equal(state.tributeAnnouncementPendingYear, 2, '못 띄운 파발 연차를 기억한다');
  simulation.resolveChoice(state, 'ok');
  assert.equal(state.pendingChoice?.kind, 'tributeAnnouncement', '기존 사건 해소 직후 파발 창을 잇는다');
}

// ── 겨울 수거 모달: 매일 검사 가드 (모달/전투 충돌 시 미룬다) ──
{
  const state = newGameInTributeYear(11);
  state.day = CONFIG.time.yearDays + CONFIG.time.seasonDays * 3 + 1; // 둘째 해 겨울 첫날

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
  const state2 = newGameInTributeYear(11);
  state2.day = CONFIG.time.yearDays + 5;
  maybeCollectTribute(state2);
  assert.equal(state2.pendingChoice, null);

  // 첫 해 겨울에는 요구 자체가 없어 사자가 오지 않는다 (R4)
  const firstYear = simulation.newGame(11);
  firstYear.day = CONFIG.time.seasonDays * 3 + 1;
  maybeCollectTribute(firstYear);
  assert.equal(firstYear.pendingChoice, null, '첫 해 겨울에는 수거 모달이 없다');
}

// ── 시뮬레이션 통합: 가을 마지막 날 → 겨울 첫날에 모달이 열린다 ──
{
  const state = newGameInTributeYear(11);
  state.day = CONFIG.time.yearDays + CONFIG.time.seasonDays * 3; // 둘째 해 가을 마지막 날
  state.threat = 0; // 습격 변수 제거
  simulation.advanceDay(state);
  // 둘째 해에는 다른 결정론·랜덤 사건이 먼저 떠 있을 수 있다 — 그러면 수거는 다음 날로 미뤄진다
  let guard = 0;
  while (state.pendingChoice && state.pendingChoice.kind !== 'tribute') {
    assert.ok(guard++ < 5, '세공 수거 모달이 며칠 안에 열린다');
    const option = state.pendingChoice.options.find(candidate => !candidate.disabled);
    assert.ok(option);
    simulation.resolveChoice(state, option.id);
    if (!state.pendingChoice) simulation.advanceDay(state);
  }
  assert.equal(state.pendingChoice?.kind, 'tribute');
}

// ── 납부: 자원 차감 + 명성 + paid + streak 초기화 ──
{
  const state = newGameInTributeYear(11);
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
  const state = newGameInTributeYear(11);
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

// ── 기물 하사: 네 번의 적격 하사 실패 뒤 다섯 번째는 반드시 지급하며, 실제 완납만 천장을 진행시킨다 ──
{
  const state = simulation.newGame(9090);
  const originalChance = CONFIG.courtGrants.artifactChance;
  CONFIG.courtGrants.artifactChance = 0;
  try {
    for (const year of [2, 4, 6, 8]) {
      state.courtTribute = { year, items: { grain: 1 }, dueDay: year * 48 - 11, resolved: false, paid: false };
      state.resources.grain = 1;
      assert.equal(setTributeReserve(state, 'grain', 1), null);
      openCourtTributeChoice(state);
      resolveCourtTribute(state, 'pay-full');
    }
    assert.equal(state.courtGrantArtifactMisses, 4, 'each eligible actual full payment records one artifact miss');

    state.courtTribute = { year: 10, items: { grain: 1 }, dueDay: 469, resolved: false, paid: false };
    state.resources.grain = 1;
    assert.equal(setTributeReserve(state, 'grain', 1), null);
    openCourtTributeChoice(state);
    resolveCourtTribute(state, 'pay-full');
    assert.equal(state.courtGrantArtifactMisses, 0, 'a pity award resets the miss counter');
    assert.ok(COURT_GRANT_ARTIFACT_IDS
      .some(item => state.specialItems[item] === 1), 'the fifth eligible grant gives one court artifact');
    assert.ok(state.discoveredSpecialItems.some(item => state.specialItems[item] > 0), 'artifact inventory and discovery update together');
  } finally {
    CONFIG.courtGrants.artifactChance = originalChance;
  }
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
  const state = newGameInTributeYear(11);
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
  state.courtTribute = rollCourtTribute(state.seed, 3, 12);
  const rep1 = state.resources.reputation;
  openCourtTributeChoice(state);
  resolveCourtTribute(state, 'refuse');
  assert.equal(state.resources.reputation, Math.max(0, rep1 - t.repFail - t.repFailStreakExtra));
  assert.equal(state.tributeFailStreak, 2);
}

// ── R4: 길잡이 출신 게임의 첫 세공은 가죽옷 고정, 이후 해와 일반 게임은 랜덤 롤 ──
{
  const graduate = simulation.newGame(11);
  graduate.guides = { enabled: false, seen: {} };
  graduate.tutorialGraduate = true;
  graduate.day = CONFIG.time.yearDays + 1; // 둘째 해 봄 — 이 게임의 첫 세공
  tributeMod.announceCourtTribute(graduate);
  const pop = graduate.residents.filter(r => r.alive).length;
  assert.deepEqual(Object.keys(graduate.courtTribute.items), ['hideClothes'], '첫 세공은 가죽옷 한 품목');
  assert.equal(
    graduate.courtTribute.items.hideClothes,
    Math.max(1, Math.round(CONFIG.tribute.baseAmounts.hideClothes * tributeScale(2, pop, graduate.rank))),
    '고정 품목의 수량도 기준량 × 연차·인구·승격 배율을 따른다',
  );

  // 셋째 해부터는 일반 롤로 돌아간다
  graduate.day = CONFIG.time.yearDays * 2 + 1;
  tributeMod.announceCourtTribute(graduate);
  assert.deepEqual(
    graduate.courtTribute.items,
    rollCourtTribute(graduate.seed, 3, graduate.residents.filter(r => r.alive).length, graduate.rank).items,
    '고정은 첫 세공 한 번뿐이다',
  );

  // 일반 게임(표식 없음)은 첫 세공부터 랜덤이다
  const plain = newGameInTributeYear(11);
  assert.deepEqual(
    plain.courtTribute.items,
    rollCourtTribute(plain.seed, 2, plain.residents.filter(r => r.alive).length, plain.rank).items,
    '일반 게임의 품목은 추첨 그대로',
  );
}

// ── 저장 마이그레이션: 구버전 저장은 세공을 재생성, 겨울 로드면 올해분 면제 ──
{
  // 첫 해 저장은 재생성하지 않는다 — 조정이 거두지 않는 해다 (R4)
  const first = simulation.newGame(5);
  delete first.courtTribute;
  delete first.tributeFailStreak;
  assert.equal(saveLoad.saveGame(first), true);
  const loadedFirst = saveLoad.loadGame();
  assert.equal(loadedFirst.courtTribute, null, '첫 해 저장은 세공 없이 이어진다');
  assert.equal(loadedFirst.tributeFailStreak, 0);

  const state = simulation.newGame(5);
  state.day = CONFIG.time.yearDays + 3; // 둘째 해 봄
  delete state.courtTribute;
  delete state.tributeFailStreak;
  assert.equal(saveLoad.saveGame(state), true);
  const loaded = saveLoad.loadGame();
  assert.ok(loaded.courtTribute, '세공 재생성');
  assert.equal(loaded.courtTribute.year, 2);
  assert.equal(loaded.courtTribute.resolved, false);
  assert.equal(loaded.tributeFailStreak, 0);

  const winter = simulation.newGame(5);
  winter.day = CONFIG.time.yearDays + CONFIG.time.seasonDays * 3 + 2; // 둘째 해 겨울
  delete winter.courtTribute;
  delete winter.tributeFailStreak;
  saveLoad.saveGame(winter);
  const loadedWinter = saveLoad.loadGame();
  assert.equal(loadedWinter.courtTribute.resolved, true, '겨울 로드는 올해분 면제');
  assert.equal(loadedWinter.courtTribute.paid, true);
}

console.log('court tribute tests passed');
