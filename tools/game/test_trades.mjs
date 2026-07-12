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
const raids = await import(pathToFileURL(join(compiledDir, 'raids.mjs')).href);
const simulation = await import(pathToFileURL(join(compiledDir, 'simulation.mjs')).href);
const tradeValues = await import(pathToFileURL(join(compiledDir, 'tradeValues.mjs')).href);
const { CONFIG } = await import(pathToFileURL(join(compiledDir, 'config.mjs')).href);
const { FACTIONS } = await import(pathToFileURL(join(compiledDir, 'constants.mjs')).href);

const TRADER = FACTIONS.find(f => f.trades.length > 0).name;       // 오도리 씨족
const NON_TRADER = FACTIONS.find(f => f.trades.length === 0).name; // 홀라온 야인
const TRADE_FACTION = FACTIONS.find(f => f.name === TRADER);
const PLAYER_GET = TRADE_FACTION.exports[0];
const EXTORTION_FACTION = FACTIONS.find(f => f.name === '홀라온 야인');
const BANDIT_FACTION = FACTIONS.find(f => f.name === '변경 마적');
const DOMESTIC_MERCHANT = FACTIONS.find(f => f.name === '만상');

function withMarket(state) {
  state.buildings.push({
    id: 9001, type: 'market', x: 1, y: 1, progress: 7, built: true, fieldGrowth: 0,
  });
  return state;
}

function withDock(state) {
  state.buildings.push({
    id: 9002, type: 'dock', x: 2, y: 2, progress: 12, built: true, fieldGrowth: 0,
  });
  return state;
}

// ── canRequestTrade 거부 사유들 ──
{
  const state = simulation.newGame(11);
  assert.equal(events.canRequestTrade(state, TRADER), '장터나 부두가 필요합니다');
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

// ── 만상·송상은 부두가 열린 뒤에만 나타나며 국내 거래는 월경 의심을 남기지 않는다 ──
{
  const locked = withMarket(simulation.newGame(12));
  assert.equal(events.canRequestTrade(locked, DOMESTIC_MERCHANT.name), DOMESTIC_MERCHANT.tradeUnlockLabel);

  const state = withDock(simulation.newGame(13));
  state.relations[DOMESTIC_MERCHANT.name] = 60;
  for (const resource of DOMESTIC_MERCHANT.imports) state.resources[resource] = 100;
  assert.equal(events.canRequestTrade(state, DOMESTIC_MERCHANT.name), null);
  assert.equal(events.requestTrade(state, DOMESTIC_MERCHANT.name), null);
  assert.equal(events.negotiateTrade(state, 'cotton', 5), null);
  const negotiation = events.tradeNegotiationOf(state.pendingChoice);
  assert.equal(negotiation.faction, DOMESTIC_MERCHANT.name);
  assert.equal(negotiation.get, 'cotton');
  const suspicionTradeCount = state.initiatedTradeDays.length;
  simulation.resolveChoice(state, 'confirm');
  assert.equal(state.pendingChoice, null);
  assert.equal(state.initiatedTradeDays.length, suspicionTradeCount);
  assert.equal(state.lastTradeByFaction[DOMESTIC_MERCHANT.name], state.day);
}

// ── 부두가 없으면 국내 상단의 선제 제안이 오지 않고, 부두 뒤에는 제안 대상이 된다 ──
{
  const marketOnly = withMarket(simulation.newGame(14));
  let rolls = [0, 0.999, 0];
  assert.equal(events.maybeOfferTrade(marketOnly, () => rolls.shift() ?? 0, 999), true);
  assert.equal(FACTIONS.find(f => f.name === events.tradeNegotiationOf(marketOnly.pendingChoice).faction).foreignTrade, undefined);

  const dockOpen = withDock(simulation.newGame(15));
  rolls = [0, 0.999, 0];
  assert.equal(events.maybeOfferTrade(dockOpen, () => rolls.shift() ?? 0, 999), true);
  assert.equal(events.tradeNegotiationOf(dockOpen.pendingChoice).faction, '송상');
}

// ── 플레이어가 먼저 찾아가 원하는 물품을 고르면 상대 요구가 생긴다 ──
{
  const state = withMarket(simulation.newGame(22));
  state.relations[TRADER] = 60;
  for (const resource of TRADE_FACTION.imports) state.resources[resource] = 100;
  assert.equal(events.requestTrade(state, TRADER), null);

  const c = state.pendingChoice;
  const faction = FACTIONS.find(f => f.name === TRADER);
  assert.equal(c.kind, 'trade');
  assert.equal(events.tradeNegotiationOf(c).initiatedBy, 'player');
  assert.equal(events.tradeNegotiationOf(c).phase, 'selecting');
  assert.ok(c.body.includes(TRADER));
  assert.equal(c.body.includes(`(${faction.desc})`), false);
  assert.equal(c.options.length, 0);

  assert.equal(events.negotiateTrade(state, PLAYER_GET, 10), null);
  const negotiation = events.tradeNegotiationOf(state.pendingChoice);
  assert.equal(negotiation.phase, 'countered');
  assert.ok(TRADE_FACTION.imports.includes(negotiation.give));
  assert.equal(negotiation.get, PLAYER_GET);
  assert.equal(negotiation.getAmt, 10);
  assert.ok(negotiation.giveAmt > 0);

  // 수락: 자원 이동 + 명성 +1 + 관계 상승 + 쿨다운 기록
  const before = {
    give: state.resources[negotiation.give],
    get: state.resources[negotiation.get],
    rep: state.resources.reputation,
    rel: state.relations[TRADER],
  };
  simulation.resolveChoice(state, 'confirm');
  assert.equal(state.pendingChoice, null);
  assert.equal(state.resources[negotiation.give], before.give - negotiation.giveAmt);
  assert.equal(state.resources[negotiation.get], before.get + negotiation.getAmt);
  assert.equal(state.resources.reputation, before.rep + 1);
  assert.ok(state.relations[TRADER] > before.rel);
  assert.equal(state.lastTradeByFaction[TRADER], state.day);
  assert.ok(state.initiatedTradeDays.includes(state.day));
}

// ── 같은 조건을 다시 흥정하면 요구량이 줄거나 최종 조건을 고수한다 ──
{
  const state = withMarket(simulation.newGame(23));
  state.relations[TRADER] = 60;
  for (const resource of TRADE_FACTION.imports) state.resources[resource] = 100;
  events.requestTrade(state, TRADER);
  events.negotiateTrade(state, PLAYER_GET, 12);
  const first = { ...events.tradeNegotiationOf(state.pendingChoice) };
  events.negotiateTrade(state, PLAYER_GET, 12);
  const second = events.tradeNegotiationOf(state.pendingChoice);
  assert.equal(second.phase, 'countered');
  assert.equal(second.round, 1);
  assert.ok(second.giveAmt <= first.giveAmt);
  assert.ok(second.margin <= first.margin);
}

// ── 성사된 출고량은 같은 계절의 다음 거래에도 남고 새 계절에 초기화된다 ──
{
  const state = withMarket(simulation.newGame(24));
  state.relations[TRADER] = 60;
  for (const resource of TRADE_FACTION.imports) state.resources[resource] = 1000;
  const before = tradeValues.factionTradeCapacitySummary(state, TRADER, PLAYER_GET);

  assert.equal(events.requestTrade(state, TRADER), null);
  assert.equal(events.negotiateTrade(state, PLAYER_GET, 4), null);
  simulation.resolveChoice(state, 'confirm');
  const after = tradeValues.factionTradeCapacitySummary(state, TRADER, PLAYER_GET);
  assert.equal(after.total, before.total);
  assert.equal(after.used, 4);
  assert.equal(after.remaining, before.remaining - 4);

  state.day += CONFIG.trade.playerCooldownDays;
  assert.equal(events.requestTrade(state, TRADER), null);
  assert.equal(tradeValues.factionTradeCapacitySummary(state, TRADER, PLAYER_GET).remaining, after.remaining);
  simulation.resolveChoice(state, 'break');

  state.day = CONFIG.time.seasonDays + 1;
  const nextSeason = tradeValues.factionTradeCapacitySummary(state, TRADER, PLAYER_GET);
  assert.equal(nextSeason.used, 0);
  assert.equal(nextSeason.remaining, nextSeason.total);
}

// ── 플레이어가 먼저 찾아간 협상 결렬은 무벌칙 ──
{
  const state = withMarket(simulation.newGame(33));
  state.relations[TRADER] = 60;
  assert.equal(events.requestTrade(state, TRADER), null);

  const before = {
    rep: state.resources.reputation,
    refused: state.tradeRefusedDays,
    rel: state.relations[TRADER],
    grain: state.resources.grain,
  };
  simulation.resolveChoice(state, 'break');
  assert.equal(state.pendingChoice, null);
  assert.equal(state.resources.reputation, before.rep);
  assert.equal(state.tradeRefusedDays, before.refused);
  assert.equal(state.relations[TRADER], before.rel);
  assert.equal(state.resources.grain, before.grain);
  assert.equal(state.lastTradeByFaction[TRADER], undefined); // 쿨다운도 안 걸린다
}

// ── 요구품이 부족하면 협상은 보이지만 확정되지 않는다 ──
{
  const state = withMarket(simulation.newGame(44));
  state.relations[TRADER] = 60;
  for (const resource of TRADE_FACTION.imports) state.resources[resource] = 0;
  assert.equal(events.requestTrade(state, TRADER), null);
  assert.equal(events.negotiateTrade(state, PLAYER_GET, 20), null);
  simulation.resolveChoice(state, 'confirm');
  assert.ok(state.pendingChoice);
  assert.ok(events.tradeNegotiationOf(state.pendingChoice).message.includes('부족'));
}

// ── 상대가 찾아오면 요구품이 먼저 올라가고, 받을 물품을 제시해 수락받는다 ──
{
  const state = withMarket(simulation.newGame(66));
  const faction = FACTIONS.find(f => f.name === TRADER);
  state.lastTradeDay = -999;
  state.resources[faction.trades[0].give] = faction.trades[0].giveAmt + 5;
  assert.equal(events.maybeOfferTrade(state, () => 0, 999), true);
  assert.ok(state.pendingChoice.body.includes(TRADER));
  assert.ok(state.pendingChoice.body.includes('후하게'));
  assert.equal(state.pendingChoice.body.includes(`(${faction.desc})`), false);
  let negotiation = events.tradeNegotiationOf(state.pendingChoice);
  assert.equal(negotiation.initiatedBy, 'faction');
  assert.equal(negotiation.phase, 'selecting');
  assert.equal(negotiation.give, faction.trades[0].give);
  assert.equal(negotiation.giveAmt, faction.trades[0].giveAmt);

  assert.equal(events.negotiateTrade(state, faction.exports[0], 1), null);
  negotiation = events.tradeNegotiationOf(state.pendingChoice);
  assert.equal(negotiation.phase, 'accepted');
  const beforeGet = state.resources[negotiation.get];
  const beforeRep = state.resources.reputation;
  simulation.resolveChoice(state, 'confirm');
  assert.equal(state.pendingChoice, null);
  assert.equal(state.resources[negotiation.get], beforeGet + negotiation.getAmt);
  assert.equal(state.resources.reputation, beforeRep + 2);
}

// ── 상대가 찾아왔을 때 과도한 요구는 거절되고 낮추면 다시 협상할 수 있다 ──
{
  const state = withMarket(simulation.newGame(67));
  const faction = TRADE_FACTION;
  state.resources[faction.trades[0].give] = 100;
  assert.equal(events.maybeOfferTrade(state, () => 0, 999), true);
  assert.ok(events.negotiateTrade(state, faction.exports[0], 999)?.includes('최대'));
  assert.equal(events.tradeNegotiationOf(state.pendingChoice).phase, 'rejected');
  assert.equal(events.negotiateTrade(state, faction.exports[0], 1), null);
  assert.equal(events.tradeNegotiationOf(state.pendingChoice).phase, 'accepted');
}

// ── 상대 요구량보다 재고가 적으면 보유량 안에서 줄 수량을 역제안할 수 있다 ──
{
  const state = withMarket(simulation.newGame(671));
  const faction = TRADE_FACTION;
  const demand = faction.trades[0];
  state.resources[demand.give] = demand.giveAmt - 1;
  assert.equal(events.maybeOfferTrade(state, () => 0, 999), true);
  let negotiation = events.tradeNegotiationOf(state.pendingChoice);
  assert.equal(negotiation.originalGiveAmt, demand.giveAmt);

  const receive = faction.exports.find(resource => resource !== demand.give);
  assert.ok(receive);
  assert.equal(events.negotiateTrade(state, receive, 1, undefined, demand.giveAmt - 1), null);
  negotiation = events.tradeNegotiationOf(state.pendingChoice);
  assert.equal(negotiation.giveAmt, demand.giveAmt - 1);
  assert.equal(negotiation.phase, 'accepted');
  simulation.resolveChoice(state, 'confirm');
  assert.equal(state.pendingChoice, null);
  assert.equal(state.resources[demand.give], 0);
}

// ── 같은 물품끼리의 교환은 가치와 무관하게 거절한다 ──
{
  const state = withMarket(simulation.newGame(672));
  const faction = TRADE_FACTION;
  const resource = faction.trades[0].give;
  const result = tradeValues.evaluateFactionProposal(state, faction.name, {
    give: resource, giveAmt: 2, get: resource, getAmt: 1,
  });
  assert.equal(result.outcome, 'rejected');
  assert.ok(result.message.includes('같은 물품'));
}

// ── 상대가 먼저 찾아온 협상 결렬은 기존 거절 벌칙을 유지한다 ──
{
  const state = withMarket(simulation.newGame(68));
  assert.equal(events.maybeOfferTrade(state, () => 0, 999), true);
  const faction = events.tradeNegotiationOf(state.pendingChoice).faction;
  const repBefore = state.resources.reputation;
  const relBefore = state.relations[faction];
  simulation.resolveChoice(state, 'break');
  assert.equal(state.resources.reputation, repBefore - 1);
  assert.equal(state.tradeRefusedDays, 10);
  assert.ok(state.relations[faction] < relBefore);
}

// ── 구버전 저장에 남은 단발 제안도 계속 처리한다 ──
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

// ── 홀라온·마적이 습격 세력으로 뽑히면 침입 전에 최후통첩을 보낸다 ──
{
  const state = simulation.newGame(77);
  state.threat = 100;
  const rolls = [0, 0, 0.55, 0]; // 발생, 세력 규모, 홀라온 선택, 요구품 선택
  raids.checkRaidTrigger(state, () => rolls.shift() ?? 0);
  const negotiation = events.tradeNegotiationOf(state.pendingChoice);
  assert.equal(state.pendingChoice.kind, 'extortion');
  assert.equal(negotiation.mode, 'extortion');
  assert.equal(negotiation.faction, EXTORTION_FACTION.name);
  assert.ok(negotiation.giveAmt > 0);
  assert.equal(negotiation.get, null);
  assert.equal(state.raiders, null);
}

// ── 요구를 들어주면 자원만 빠지고 이번 습격은 철회된다 ──
{
  const state = simulation.newGame(78);
  state.threat = 85;
  state.resources.grain = 100;
  state.resources.hide = 100;
  state.resources.tools = 100;
  assert.equal(raids.openExtortionDemand(state, () => 0, false, 44, EXTORTION_FACTION.name), true);
  const negotiation = events.tradeNegotiationOf(state.pendingChoice);
  const stockBefore = state.resources[negotiation.give];
  const repBefore = state.resources.reputation;
  const relationBefore = state.relations[EXTORTION_FACTION.name];
  simulation.resolveChoice(state, 'pay');
  assert.equal(state.pendingChoice, null);
  assert.equal(state.raiders, null);
  assert.equal(state.resources[negotiation.give], stockBefore - negotiation.giveAmt);
  assert.equal(state.resources.reputation, repBefore - CONFIG.extortion.payReputationLoss);
  assert.ok(state.relations[EXTORTION_FACTION.name] > relationBefore);
  assert.equal(state.raidCooldown, CONFIG.threat.raidCooldownDays);
}

// ── 요구품이 부족하면 지급은 막히고 거절 선택은 남는다 ──
{
  const state = simulation.newGame(79);
  assert.equal(raids.openExtortionDemand(state, () => 0, false, 44, EXTORTION_FACTION.name), true);
  const negotiation = events.tradeNegotiationOf(state.pendingChoice);
  state.resources[negotiation.give] = 0;
  simulation.resolveChoice(state, 'pay');
  assert.equal(state.pendingChoice.kind, 'extortion');
  assert.ok(events.tradeNegotiationOf(state.pendingChoice).message.includes('부족'));
  assert.equal(state.raiders, null);
}

// ── 요구를 거절하면 같은 세력·같은 규모의 습격이 즉시 시작된다 ──
{
  const state = simulation.newGame(80);
  const power = 52;
  assert.equal(raids.openExtortionDemand(state, () => 0, true, power, BANDIT_FACTION.name), true);
  simulation.resolveChoice(state, 'refuse');
  const raidFaction = state.raiders?.faction ?? state.pendingChoice?.data?.faction;
  const raidPower = state.raiders?.power ?? state.pendingChoice?.data?.power;
  assert.equal(raidFaction, BANDIT_FACTION.name);
  assert.equal(raidPower, power);
  assert.ok(state.raiders || state.pendingChoice?.kind === 'raid');
}

console.log('trade tests passed');
