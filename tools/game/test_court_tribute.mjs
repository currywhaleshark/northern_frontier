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
const simulation = await import(pathToFileURL(join(compiledDir, 'simulation.mjs')).href);
const saveLoad = await import(pathToFileURL(join(compiledDir, 'saveLoad.mjs')).href);
const { CONFIG } = await import(pathToFileURL(join(compiledDir, 'config.mjs')).href);

const {
  canPayTribute,
  maybeCollectTribute,
  openCourtTributeChoice,
  resolveCourtTribute,
  rollCourtTribute,
  tributeScale,
} = tributeMod;

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
  for (const [res, amt] of Object.entries(tribute.items)) state.resources[res] = amt + 5;
  assert.equal(canPayTribute(state, tribute), true);
  state.tributeFailStreak = 1;
  state.day = tribute.dueDay;
  openCourtTributeChoice(state);
  assert.equal(state.pendingChoice.options[0].disabled, false);
  const repBefore = state.resources.reputation;
  resolveCourtTribute(state, 'pay');
  assert.equal(state.pendingChoice, null);
  assert.equal(tribute.paid, true);
  assert.equal(tribute.resolved, true);
  assert.equal(state.tributeFailStreak, 0);
  assert.equal(state.resources.reputation, Math.min(100, repBefore + CONFIG.tribute.repPaid));
  for (const [res] of Object.entries(tribute.items)) assert.equal(state.resources[res], 5);
}

// ── 자원 부족이면 납부 선택지가 비활성화된다 ──
{
  const state = simulation.newGame(11);
  for (const res of Object.keys(state.courtTribute.items)) state.resources[res] = 0;
  openCourtTributeChoice(state);
  assert.equal(state.pendingChoice.options[0].disabled, true);
  assert.ok(state.pendingChoice.options[0].disabledReason.includes('부족'));
  state.pendingChoice = null;
}

// ── 격년(짝수 연차) 납부 하사품 ──
{
  const state = simulation.newGame(11);
  state.courtTribute = rollCourtTribute(state.seed, 2, 12);
  for (const [res, amt] of Object.entries(state.courtTribute.items)) state.resources[res] = amt;
  const before = state.resources.tools + state.resources.clothes;
  openCourtTributeChoice(state);
  resolveCourtTribute(state, 'pay');
  const gained = state.resources.tools + state.resources.clothes - before;
  assert.ok(
    gained === CONFIG.tribute.rewardTools || gained === CONFIG.tribute.rewardClothes,
    `하사품 지급 (${gained})`,
  );
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
