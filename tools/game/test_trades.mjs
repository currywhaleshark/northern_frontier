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
const events = await import(pathToFileURL(join(compiledDir, 'events.mjs')).href);
const simulation = await import(pathToFileURL(join(compiledDir, 'simulation.mjs')).href);
const { CONFIG } = await import(pathToFileURL(join(compiledDir, 'config.mjs')).href);
const { FACTIONS } = await import(pathToFileURL(join(compiledDir, 'constants.mjs')).href);

const TRADER = FACTIONS.find(f => f.trades.length > 0).name;       // 오도리 씨족
const NON_TRADER = FACTIONS.find(f => f.trades.length === 0).name; // 홀라온 야인
const TRADE_FACTION = FACTIONS.find(f => f.name === TRADER);
const PLAYER_REQUEST = { give: TRADE_FACTION.imports[0], giveAmt: 3, get: TRADE_FACTION.exports[0] };

function withMarket(state) {
  state.buildings.push({
    id: 9001, type: 'market', x: 1, y: 1, progress: 7, built: true, fieldGrowth: 0,
  });
  return state;
}

// ── canRequestTrade 거부 사유들 ──
{
  const state = simulation.newGame(11);
  assert.equal(events.canRequestTrade(state, TRADER), '장터가 필요합니다');
  assert.equal(events.canRequestTrade(state, NON_TRADER), '교역 품목이 없는 세력입니다');

  withMarket(state);
  state.relations[TRADER] = CONFIG.trade.minRelationToTrade + 20;
  assert.equal(events.canRequestTrade(state, TRADER), null);

  // 관계 게이트
  state.relations[TRADER] = CONFIG.trade.minRelationToTrade - 1;
  assert.equal(events.canRequestTrade(state, TRADER), '관계가 나빠 상대해 주지 않습니다');
  state.relations[TRADER] = 60;

  // 전투 중 금지
  state.battle = { phase: 'muster' };
  assert.equal(events.canRequestTrade(state, TRADER), '지금은 거래할 수 없습니다');
  state.battle = null;

  // 세력별 쿨다운
  state.lastTradeByFaction[TRADER] = state.day;
  assert.ok(events.canRequestTrade(state, TRADER).includes('상단이 아직'));
  state.day += CONFIG.trade.playerCooldownDays;
  assert.equal(events.canRequestTrade(state, TRADER), null);
}

// ── requestTrade: 계산된 견적 + 돌려보내기 옵션이 모달로 열린다 ──
{
  const state = withMarket(simulation.newGame(22));
  state.relations[TRADER] = 60;
  state.resources[PLAYER_REQUEST.give] = 10;
  assert.equal(events.requestTrade(state, TRADER, PLAYER_REQUEST), null);

  const c = state.pendingChoice;
  const faction = FACTIONS.find(f => f.name === TRADER);
  assert.equal(c.kind, 'trade');
  assert.equal(c.data.initiated, true);
  assert.ok(c.body.includes(TRADER));
  assert.equal(c.body.includes(`(${faction.desc})`), false);
  assert.equal(c.options.length, 2);
  assert.equal(c.options.at(-1).id, 'cancel');

  // 수락: 자원 이동 + 명성 +1 + 관계 상승 + 쿨다운 기록
  const quote = c.data.quote;
  const before = {
    give: state.resources[quote.give],
    get: state.resources[quote.get],
    rep: state.resources.reputation,
    rel: state.relations[TRADER],
  };
  simulation.resolveChoice(state, 'accept-quote');
  assert.equal(state.pendingChoice, null);
  assert.equal(state.resources[quote.give], before.give - quote.giveAmt);
  assert.equal(state.resources[quote.get], before.get + quote.getAmt);
  assert.equal(state.resources.reputation, before.rep + 1);
  assert.ok(state.relations[TRADER] > before.rel);
  assert.equal(state.lastTradeByFaction[TRADER], state.day);
}

// ── 돌려보내기: 아무 벌칙도 없어야 한다 (거절 벌칙은 상대 제안 전용 — 회귀 고정) ──
{
  const state = withMarket(simulation.newGame(33));
  state.relations[TRADER] = 60;
  state.resources[PLAYER_REQUEST.give] = 10;
  assert.equal(events.requestTrade(state, TRADER, PLAYER_REQUEST), null);

  const before = {
    rep: state.resources.reputation,
    refused: state.tradeRefusedDays,
    rel: state.relations[TRADER],
    grain: state.resources.grain,
  };
  simulation.resolveChoice(state, 'cancel');
  assert.equal(state.pendingChoice, null);
  assert.equal(state.resources.reputation, before.rep);
  assert.equal(state.tradeRefusedDays, before.refused);
  assert.equal(state.relations[TRADER], before.rel);
  assert.equal(state.resources.grain, before.grain);
  assert.equal(state.lastTradeByFaction[TRADER], undefined); // 쿨다운도 안 걸린다
}

// ── 자원 부족 견적은 모달을 열지 않는다 ──
{
  const state = withMarket(simulation.newGame(44));
  state.relations[TRADER] = 60;
  state.resources[PLAYER_REQUEST.give] = 0;
  assert.ok(events.requestTrade(state, TRADER, PLAYER_REQUEST).includes('부족'));
  assert.equal(state.pendingChoice, null);
}

// ── 상대가 찾아온 제안도 세력 설명을 괄호로 붙이지 않는다 ──
{
  const state = withMarket(simulation.newGame(66));
  const faction = FACTIONS.find(f => f.name === TRADER);
  state.lastTradeDay = -999;
  state.resources[faction.trades[0].give] = faction.trades[0].giveAmt + 5;
  assert.equal(events.maybeOfferTrade(state, () => 0, 999), true);
  assert.ok(state.pendingChoice.body.includes(TRADER));
  assert.equal(state.pendingChoice.body.includes(`(${faction.desc})`), false);
}

// ── 상대가 찾아온 제안 경로는 기존 동작 그대로 (거절 벌칙 유지) ──
{
  const state = withMarket(simulation.newGame(55));
  state.pendingChoice = {
    kind: 'trade', title: 't', body: 'b', options: [],
    data: { give: 'tools', giveAmt: 3, get: 'grain', getAmt: 16, faction: TRADER },
  };
  const repBefore = state.resources.reputation;
  simulation.resolveChoice(state, 'decline');
  assert.equal(state.resources.reputation, repBefore - 1);
  assert.equal(state.tradeRefusedDays, 10);
}

console.log('trade tests passed');
