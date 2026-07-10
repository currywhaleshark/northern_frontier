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
const promotion = await import(pathToFileURL(join(compiledDir, 'promotion.mjs')).href);
const simulation = await import(pathToFileURL(join(compiledDir, 'simulation.mjs')).href);
const tributeMod = await import(pathToFileURL(join(compiledDir, 'courtTribute.mjs')).href);
const raids = await import(pathToFileURL(join(compiledDir, 'raids.mjs')).href);
const saveLoad = await import(pathToFileURL(join(compiledDir, 'saveLoad.mjs')).href);
const { CONFIG } = await import(pathToFileURL(join(compiledDir, 'config.mjs')).href);

const { checkPromotion, nextRank, promotionConditions, rankEffects, RANK_ORDER } = promotion;

// ── 사다리 순서 ──
assert.deepEqual(RANK_ORDER, ['settlement', 'bo', 'jin', 'bu']);
assert.equal(nextRank('settlement'), 'bo');
assert.equal(nextRank('bo'), 'jin');
assert.equal(nextRank('jin'), 'bu');
assert.equal(nextRank('bu'), null);

// ── 새 게임 초기값 ──
{
  const state = simulation.newGame(11);
  assert.equal(state.rank, 'settlement');
  assert.equal(state.tributePaidStreak, 0);
}

// ── 테스트 헬퍼: 인구/건물 채우기 ──
function fillResidents(state, n) {
  const proto = state.residents[0];
  let id = 1000;
  while (state.residents.filter(r => r.alive).length < n) {
    state.residents.push({ ...proto, id: id++, carrying: {}, skills: {}, path: [] });
  }
}
function addBuilt(state, type, n = 1) {
  for (let i = 0; i < n; i++) {
    state.buildings.push({
      id: 9000 + state.buildings.length, type, x: 0, y: 0,
      progress: 99, built: true, fieldGrowth: 0,
    });
  }
}

// ── 조건 미충족이면 승격하지 않고 미충족 목록을 남긴다 ──
{
  const state = simulation.newGame(11);
  checkPromotion(state);
  assert.equal(state.rank, 'settlement');
  assert.ok(state.victoryProgressNote.length > 0);
  assert.ok(state.victoryProgressNote.includes('생존'));
}

// ── 보 승격: 옛 승리 조건 충족 = 게임오버 대신 승격 + 계속 플레이 ──
{
  const state = simulation.newGame(11);
  const v = CONFIG.victory;
  state.day = v.years * CONFIG.time.yearDays + 1;
  fillResidents(state, v.population);
  state.lastWinterDeathRate = 0;
  state.resources.defense = v.defense;
  state.resources.grain = v.food;
  state.resources.firewood = v.firewood;
  addBuilt(state, 'beacon');
  addBuilt(state, 'garrison');
  const rep0 = state.resources.reputation;

  checkPromotion(state);
  assert.equal(state.rank, 'bo');
  assert.equal(state.gameOver, null, '보 승격은 게임을 끝내지 않는다');
  assert.equal(state.resources.reputation, Math.min(100, rep0 + CONFIG.ranks.promotionReputation));
  assert.ok(state.log.some(e => e.text.includes('보(堡)로 승격')));

  // 다음 점검에선 진 승격 조건이 목록에 뜬다
  checkPromotion(state);
  assert.equal(state.rank, 'bo');
  assert.ok(state.victoryProgressNote.includes('세공'));

  // ── 진 승격 ──
  const jin = CONFIG.ranks.jin;
  fillResidents(state, jin.population);
  state.resources.defense = jin.defense;
  state.tributePaidStreak = jin.tributeYears;
  addBuilt(state, 'watchtower', 2);
  checkPromotion(state);
  assert.equal(state.rank, 'jin');
  assert.equal(state.gameOver, null);
  assert.ok(state.log.some(e => e.text.includes('진(鎭)으로 승격')));

  // ── 부 승격 = 최종 승리 ──
  const bu = CONFIG.ranks.bu;
  fillResidents(state, bu.population);
  state.resources.defense = bu.defense;
  state.tributePaidStreak = bu.tributeYears;
  addBuilt(state, 'watchtower', 1); // 총 3개
  addBuilt(state, 'market');
  checkPromotion(state);
  assert.equal(state.rank, 'bu');
  assert.ok(state.gameOver?.won, '부 승격이 최종 승리');
  assert.ok(state.gameOver.reason.includes('부(府)'));
}

// ── 승격 조건 표시 문구에 건물 개수가 든다 ──
{
  const state = simulation.newGame(11);
  state.rank = 'bo';
  const conds = promotionConditions(state, 'jin');
  assert.ok(conds.some(([, txt]) => txt.includes('망루 2개')));
}

// ── 승격 효과: 세공 요구량이 커진다 ──
{
  assert.ok(tributeMod.tributeScale(1, 12, 'bo') > tributeMod.tributeScale(1, 12, 'settlement'));
  const base = tributeMod.rollCourtTribute(7, 3, 20, 'settlement');
  const atJin = tributeMod.rollCourtTribute(7, 3, 20, 'jin');
  assert.deepEqual(Object.keys(base.items), Object.keys(atJin.items), '품목은 시드+연차로만 결정');
  for (const key of Object.keys(base.items)) {
    assert.ok(atJin.items[key] > base.items[key], '진 승격 후 요구량 증가');
  }
}

// ── 승격 효과: 위협도가 더 빨리 오른다 ──
{
  const a = simulation.newGame(11);
  const b = simulation.newGame(11);
  a.threat = 50;
  b.threat = 50;
  b.rank = 'bu';
  raids.updateThreat(a);
  raids.updateThreat(b);
  assert.ok(b.threat > a.threat, `승격 후 위협 증가 가속 (${a.threat} vs ${b.threat})`);
}

// ── 세공 납부/미납이 성실도(연속 납부)를 갱신한다 ──
{
  const state = simulation.newGame(11);
  const reserveMod = await import(pathToFileURL(join(compiledDir, 'tributeReserve.mjs')).href);
  for (const [res, amt] of Object.entries(state.courtTribute.items)) {
    state.resources[res] = amt;
    reserveMod.setTributeReserve(state, res, amt);
  }
  tributeMod.openCourtTributeChoice(state);
  tributeMod.resolveCourtTribute(state, 'pay-full');
  assert.equal(state.tributePaidStreak, 1);

  state.courtTribute = tributeMod.rollCourtTribute(state.seed, 2, 12);
  tributeMod.openCourtTributeChoice(state);
  tributeMod.resolveCourtTribute(state, 'refuse');
  assert.equal(state.tributePaidStreak, 0, '미납 시 성실도 초기화');
}

// ── 이주민 배율이 rankEffects에서 나온다 ──
assert.ok(rankEffects('bo').immigration > rankEffects('settlement').immigration);
assert.equal(rankEffects(undefined).immigration, 1, '구 저장 안전망');

// ── 저장 마이그레이션 ──
{
  const state = simulation.newGame(5);
  delete state.rank;
  delete state.tributePaidStreak;
  saveLoad.saveGame(state);
  const loaded = saveLoad.loadGame();
  assert.equal(loaded.rank, 'settlement');
  assert.equal(loaded.tributePaidStreak, 0);

  // 옛 승리(진보 승격)를 이룬 저장은 보에서 이어간다
  const won = simulation.newGame(5);
  won.gameOver = { won: true, reason: 'test' };
  delete won.rank;
  saveLoad.saveGame(won);
  const loadedWon = saveLoad.loadGame();
  assert.equal(loadedWon.rank, 'bo');
}

console.log('promotion tests passed');
