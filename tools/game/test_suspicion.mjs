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

const store = new Map();
globalThis.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, v),
  removeItem: k => store.delete(k),
};

const compiledDir = compileGameModules();
const susp = await import(pathToFileURL(join(compiledDir, 'suspicion.mjs')).href);
const simulation = await import(pathToFileURL(join(compiledDir, 'simulation.mjs')).href);
const tributeMod = await import(pathToFileURL(join(compiledDir, 'courtTribute.mjs')).href);
const petition = await import(pathToFileURL(join(compiledDir, 'petition.mjs')).href);
const promotion = await import(pathToFileURL(join(compiledDir, 'promotion.mjs')).href);
const saveLoad = await import(pathToFileURL(join(compiledDir, 'saveLoad.mjs')).href);
const { CONFIG } = await import(pathToFileURL(join(compiledDir, 'config.mjs')).href);

const S = CONFIG.suspicion;
const {
  nitreYardsActive, openCrackdown, openInspection, resolveCrackdown,
  resolveInspection, suspicionBreakdown, toggleNitreYards, updateSuspicion,
} = susp;

function addBuilt(state, type, n = 1) {
  for (let i = 0; i < n; i++) {
    state.buildings.push({
      id: 9000 + state.buildings.length, type, x: 0, y: 0,
      progress: 99, built: true, fieldGrowth: 0,
    });
  }
}
const factorOf = (state, id) => suspicionBreakdown(state).find(f => f.id === id);

// ── 상승 요인 내역 ──
{
  const state = simulation.newGame(11);
  assert.equal(factorOf(state, 'nitre'), undefined);
  assert.ok(factorOf(state, 'decay').delta < 0, '자연 감소는 항상 있다');

  addBuilt(state, 'nitreYard', 2);
  assert.equal(factorOf(state, 'nitre').delta, 2 * S.perNitreYard);
  assert.equal(nitreYardsActive(state), 2);

  // 토글로 세우면 요인이 사라진다
  toggleNitreYards(state);
  assert.equal(nitreYardsActive(state), 0);
  assert.equal(factorOf(state, 'nitre'), undefined);
  toggleNitreYards(state);

  // 은닉 중에도 멈춘다
  state.nitreHiddenUntil = state.day + 3;
  assert.equal(nitreYardsActive(state), 0);
  state.nitreHiddenUntil = 0;

  // 화기 비축 초과
  state.resources.gunpowder = S.stockThreshold + 5;
  assert.equal(factorOf(state, 'stock').delta, S.stockExtra);

  // 먼저 청한 교역
  state.initiatedTradeDays = [state.day - 1, state.day - 2, state.day - 100];
  assert.equal(factorOf(state, 'trade').delta, 2 * S.perInitiatedTrade, '오래된 거래는 잊힌다');

  // 북방 유착 (적대 세력은 2배)
  const hostileName = '니마차 우디캐';
  state.relations[hostileName] = 80;
  assert.equal(factorOf(state, 'cozy').delta, 2 * S.perCozyFaction);
}

// ── 일일 갱신: 누적과 상하한 ──
{
  const state = simulation.newGame(11);
  addBuilt(state, 'nitreYard', 2);
  state.suspicion = 10;
  updateSuspicion(state, () => 1); // 감찰 롤 실패(발생 안 함)
  const expected = 10 + 2 * S.perNitreYard - S.baseDecay;
  assert.ok(Math.abs(state.suspicion - expected) < 1e-9);

  state.suspicion = 0.05;
  state.buildings = state.buildings.filter(b => b.type !== 'nitreYard');
  updateSuspicion(state, () => 1);
  assert.equal(state.suspicion, 0, '0 밑으로 내려가지 않는다');
}

// ── 세공 납부·청원이 의심을 낮춘다 ──
{
  const state = simulation.newGame(11);
  state.suspicion = 30;
  const reserveMod = await import(pathToFileURL(join(compiledDir, 'tributeReserve.mjs')).href);
  for (const [res, amt] of Object.entries(state.courtTribute.items)) {
    state.resources[res] = amt;
    reserveMod.setTributeReserve(state, res, amt);
  }
  tributeMod.openCourtTributeChoice(state);
  tributeMod.resolveCourtTribute(state, 'pay-full');
  assert.equal(state.suspicion, 30 - S.tributeDecay);

  state.rank = 'bo';
  state.resources.reputation = 60;
  petition.requestPetition(state);
  petition.resolvePetition(state, 'grain');
  assert.equal(state.suspicion, 30 - S.tributeDecay - S.petitionDecay);
}

// ── 감찰 어사 (40+): 발생과 세 갈래 처리 ──
{
  const state = simulation.newGame(11);
  state.suspicion = 50;
  updateSuspicion(state, () => 0); // 롤 성공 → 감찰
  assert.equal(state.pendingChoice?.kind, 'inspection');
  assert.ok(state.inspectionCooldownUntil > state.day, '쿨다운 시작');

  // 뇌물
  state.resources.grain = 100;
  state.resources.hide = 20;
  const s0 = state.suspicion;
  resolveInspection(state, 'bribe', () => 0.5);
  assert.equal(state.suspicion, s0 - S.bribeDecay);
  assert.equal(state.resources.grain, 100 - S.bribeCost.food);

  // 은닉
  openInspection(state);
  const s1 = state.suspicion;
  resolveInspection(state, 'hide', () => 0.5);
  assert.equal(state.nitreHiddenUntil, state.day + S.hideDays);
  assert.equal(state.suspicion, s1 - S.hideDecay);

  // 정직 — 성공/실패
  openInspection(state);
  const s2 = state.suspicion;
  resolveInspection(state, 'honest', () => 0); // 무조건 성공
  assert.equal(state.suspicion, Math.max(0, s2 - S.honestSuccessDecay));
  state.suspicion = 50;
  openInspection(state);
  resolveInspection(state, 'honest', () => 0.999); // 무조건 실패
  assert.equal(state.suspicion, 50 + S.honestFailRise);

  // 쿨다운 중엔 다시 오지 않는다
  state.pendingChoice = null;
  state.suspicion = 50;
  const cooldown = state.inspectionCooldownUntil;
  updateSuspicion(state, () => 0);
  assert.equal(state.pendingChoice, null);
  assert.equal(state.inspectionCooldownUntil, cooldown);
}

// ── 조정 견책 (70+): 명성 하락 + 화기 몰수, 구간당 한 번 ──
{
  const state = simulation.newGame(11);
  state.suspicion = 72;
  state.resources.gunpowder = 10;
  state.resources.muskets = 4;
  const rep0 = state.resources.reputation;
  updateSuspicion(state, () => 1);
  assert.equal(state.censured, true);
  assert.equal(state.resources.reputation, Math.max(0, rep0 - S.censureRep));
  assert.equal(state.resources.gunpowder, 5);
  assert.equal(state.resources.muskets, 2);

  // 같은 구간에선 반복되지 않는다
  const rep1 = state.resources.reputation;
  updateSuspicion(state, () => 1);
  assert.equal(state.resources.reputation, rep1);

  // 구간 아래로 내려가면 리셋된다
  state.suspicion = 30;
  updateSuspicion(state, () => 1);
  assert.equal(state.censured, false);
}

// ── 100: 강등 + 성실도 리셋 + 토벌 유예 ──
{
  const state = simulation.newGame(11);
  state.rank = 'jin';
  state.tributePaidStreak = 4;
  state.suspicion = 100;
  addBuilt(state, 'nitreYard', 2); // 상승 요인이 자연 감소를 이겨 100이 유지된다
  updateSuspicion(state, () => 1);
  assert.equal(state.rank, 'bo', '한 단계 강등');
  assert.equal(state.tributePaidStreak, 0, '조정의 신뢰 상실');
  assert.equal(state.suspicion, S.crackdownStartSuspicion);
  assert.ok(state.crackdownDeadline > state.day);

  // 의심이 짙은 동안 승격은 없다
  promotion.checkPromotion(state);
  assert.ok(state.victoryProgressNote.includes('의심'));

  // 유예 중 의심을 내리면 토벌 취소
  state.suspicion = S.crackdownClearBelow - 1;
  updateSuspicion(state, () => 1);
  assert.equal(state.crackdownDeadline, 0);
}

// ── 유예 만료 → 토벌군: 항복과 항전 ──
{
  const state = simulation.newGame(11);
  state.suspicion = 80;
  state.crackdownDeadline = state.day; // 오늘이 마감
  updateSuspicion(state, () => 1);
  assert.equal(state.pendingChoice?.kind, 'crackdown');

  // 항복: 화기 전량 몰수, 의심 완화, 유예 해제
  state.resources.gunpowder = 8;
  state.resources.muskets = 3;
  resolveCrackdown(state, 'surrender', () => 0.5);
  assert.equal(state.resources.gunpowder, 0);
  assert.equal(state.resources.muskets, 0);
  assert.equal(state.crackdownDeadline, 0);
  assert.ok(state.suspicion <= 40);
  assert.equal(state.gameOver, null);

  // 항전 승리: 조정과 결별 (명성 바닥)
  const winState = simulation.newGame(11);
  winState.suspicion = 80;
  winState.crackdownDeadline = winState.day;
  openCrackdown(winState);
  resolveCrackdown(winState, 'fight', () => 0); // 무조건 승리
  assert.equal(winState.gameOver, null);
  assert.equal(winState.resources.reputation, 5);
  assert.equal(winState.suspicion, 0);

  // 항전 패배: 함락
  const loseState = simulation.newGame(11);
  loseState.suspicion = 80;
  loseState.crackdownDeadline = loseState.day;
  openCrackdown(loseState);
  resolveCrackdown(loseState, 'fight', () => 0.999); // 무조건 패배
  assert.ok(loseState.gameOver && !loseState.gameOver.won);
}

// ── 저장 마이그레이션 ──
{
  const state = simulation.newGame(5);
  delete state.suspicion;
  delete state.nitrePaused;
  delete state.nitreHiddenUntil;
  delete state.initiatedTradeDays;
  delete state.inspectionCooldownUntil;
  delete state.censured;
  delete state.crackdownDeadline;
  saveLoad.saveGame(state);
  const loaded = saveLoad.loadGame();
  assert.equal(loaded.suspicion, 0);
  assert.equal(loaded.nitrePaused, false);
  assert.equal(loaded.nitreHiddenUntil, 0);
  assert.deepEqual(loaded.initiatedTradeDays, []);
  assert.equal(loaded.inspectionCooldownUntil, 0);
  assert.equal(loaded.censured, false);
  assert.equal(loaded.crackdownDeadline, 0);
}

console.log('suspicion tests passed');
