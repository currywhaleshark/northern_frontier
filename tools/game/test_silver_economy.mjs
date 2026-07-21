// 은 경제 — G1(은 자원·상단 결제) + G2(은맥 딜레마) 검증
// 계획: docs/superpowers/plans/2026-07-17-silver-currency.md
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
const { CONFIG } = await load('config');
const { RESOURCE_DEFS, LUXURY_RESOURCES } = await load('resourceCatalog');
const { SPOILABLE_RESOURCE_IDS } = await load('spoilage');
const { FACTIONS } = await load('constants');
const tradeValues = await load('tradeValues');
const minerals = await load('minerals');
const silver = await load('silver');
const suspicion = await load('suspicion');
const courtTribute = await load('courtTribute');
const buildings = await load('buildings');
const selectionActions = await load('selectionActions');
const rendererSource = readFileSync(new URL('../../src/render/renderer.ts', import.meta.url), 'utf8');
const selectionContextSource = readFileSync(new URL('../../src/components/SelectionContextBar.tsx', import.meta.url), 'utf8');

const MANSANG = '만상';
const SONGSANG = '송상';

// ── G1: 자원 정의 ──
{
  const def = RESOURCE_DEFS.silver;
  assert.equal(def.category, 'currency', 'silver is a currency, not a luxury');
  assert.ok(def.tradeBaseValue > 0);
  assert.ok(!LUXURY_RESOURCES.includes('silver'), 'silver never enters luxury satisfaction totals');
  assert.ok(!SPOILABLE_RESOURCE_IDS.includes('silver'), 'silver does not spoil');
  const state = simulation.newGame(2026071710);
  assert.equal(state.resources.silver, 0, 'new games start without silver');
}

// ── G1: 만상·송상만 은을 받고 내놓는다 ──
{
  for (const name of [MANSANG, SONGSANG]) {
    const faction = FACTIONS.find(f => f.name === name);
    assert.ok(faction.exports.includes('silver'), `${name} pays silver for goods`);
    assert.ok(faction.imports.includes('silver'), `${name} accepts silver as payment`);
    assert.ok(faction.tradeValues.silver > 0, `${name} prices silver`);
  }
  for (const faction of FACTIONS) {
    if (faction.name === MANSANG || faction.name === SONGSANG) continue;
    assert.ok(!faction.exports.includes('silver') && !faction.imports.includes('silver'),
      `${faction.name} stays on barter — no silver`);
  }
}

// ── G1: 은이 낀 거래는 마진이 줄어 물물교환보다 이득이다 ──
{
  assert.equal(tradeValues.silverAdjustedMargin(1.25, 'hide', 'silk'), 1.25, 'barter margin untouched');
  const softened = tradeValues.silverAdjustedMargin(1.25, 'hide', 'silver');
  assert.ok(softened < 1.25 && softened > 1, 'silver softens the relation margin');
  // 왕복 손실: 은 경유(축소 마진 2회) < 직교환(마진 1회)
  assert.ok(softened * softened < 1.25, 'silver round trip beats direct barter at margin 1.25');

  const state = simulation.newGame(2026071711);
  state.resources.hide = 100;
  state.resources.silver = 100;
  const sellQuote = tradeValues.quoteTrade(state, MANSANG, { give: 'hide', giveAmt: 40, get: 'silver' });
  assert.ok(sellQuote.ok, `selling hides for silver works: ${sellQuote.reason ?? ''}`);
  assert.ok(sellQuote.getAmt >= 1);
  const buyQuote = tradeValues.quoteTrade(state, MANSANG, { give: 'silver', giveAmt: 20, get: 'silk' });
  assert.ok(buyQuote.ok, `buying silk with silver works: ${buyQuote.reason ?? ''}`);
  const jurchenQuote = tradeValues.quoteTrade(state, '오도리 씨족', { give: 'silver', giveAmt: 20, get: 'grain' });
  assert.ok(!jurchenQuote.ok, 'Jurchen villages refuse silver');
}

// ── G1: 세공 은 대납 ──
{
  const state = simulation.newGame(2026071712);
  state.courtTribute = { year: 1, items: { grain: 20, hide: 5 }, dueDay: 37, resolved: false, paid: false };
  const cost = courtTribute.tributeSilverCost(state.courtTribute);
  assert.ok(cost >= 1, 'silver cost derives from tribute trade value');
  state.resources.silver = cost;
  state.suspicion = 30;
  courtTribute.openCourtTributeChoice(state);
  assert.ok(state.pendingChoice.options.some(option => option.id === 'pay-silver' && !option.disabled),
    'silver payment option is offered when affordable');
  courtTribute.resolveCourtTribute(state, 'pay-silver');
  assert.equal(state.resources.silver, 0, 'silver is spent');
  assert.equal(state.courtTribute.paid, true, 'silver payment counts as full payment');
  assert.equal(state.tributePaidStreak, 1);
  assert.ok(state.suspicion < 30 - CONFIG.suspicion.tributeDecay, 'silver payment washes suspicion deeper');
}

// ── G2 헬퍼: 채광장 딸린 광상 타일을 준비한다 ──
function stateWithMine(seed) {
  const state = simulation.newGame(seed);
  const tile = state.map[10][10];
  minerals.setMineralDeposit(tile, false, 120);
  const mine = {
    id: state.nextBuildingId++, type: 'mine', x: 10, y: 10,
    progress: 9, built: true, fieldGrowth: 0,
  };
  state.buildings.push(mine);
  tile.buildingId = mine.id;
  return { state, tile, mine };
}

function recordMiningToday(state, tile) {
  state.lastRockMiningDay = state.day;
  state.lastRockMiningTile = { x: tile.x, y: tile.y };
}

// ── G2: 발견 — 확률 성공 시 3지선다가 열린다 ──
{
  const { state, tile } = stateWithMine(2026071713);
  recordMiningToday(state, tile);
  silver.dailySilverTick(state, () => 0); // 확률 성공
  assert.equal(state.pendingChoice?.kind, 'silverVein', 'discovery opens the dilemma choice');
  assert.equal(state.silverVein.status, 'offered');
  assert.equal(state.silverVein.x, 10);

  // 잠채: 광상이 은맥으로 바뀌고 채광이 은을 낸다
  silver.resolveSilverVeinChoice(state, 'secret', () => 0.5);
  assert.equal(state.silverVein.status, 'secret');
  assert.equal(tile.hasSilver, true);
  assert.ok(minerals.mineralRemaining(tile) >= CONFIG.minerals.silverMin);
  const extraction = minerals.extractMineralDeposit(tile, 2);
  assert.equal(extraction.resource, 'silver');

  // 의심 내역에 익명 라벨로만 나타난다
  const factors = suspicion.suspicionBreakdown(state);
  const rumor = factors.find(factor => factor.id === 'silverRumor');
  assert.ok(rumor && rumor.delta > 0, 'secret mining adds a daily suspicion factor');
  assert.ok(!rumor.label.includes('은'), 'the factor label never names silver — 짐작만 가능');

  // 발각: 스파이크는 1회
  state.suspicion = 10;
  silver.recordSilverMined(state, 30);
  silver.dailySilverTick(state, () => 0);
  assert.equal(state.silverVein.exposed, true);
  assert.equal(state.suspicion, 10 + CONFIG.silver.exposeSpike, 'exposure spikes suspicion once');
  const spiked = state.suspicion;
  silver.dailySilverTick(state, () => 0);
  assert.equal(state.suspicion, spiked, 'no repeat spikes');
}

// ── G2: 보고 → 봉인(광상 자체 폐쇄) → 봉인 어기기 ──
{
  const { state, tile } = stateWithMine(2026071714);
  recordMiningToday(state, tile);
  silver.dailySilverTick(state, () => 0);
  state.resources.reputation = 50;
  silver.resolveSilverVeinChoice(state, 'report', () => 0.9); // sanctionChance(0.25)를 넘겨 봉인
  assert.equal(state.silverVein.status, 'sealed');
  assert.equal(state.resources.reputation, 50 + CONFIG.silver.reportReputation);
  assert.ok(silver.isVeinSealedTile(state, tile), 'sealed deposit blocks all mining, stone included');
  assert.ok(!tile.hasSilver, 'sealed deposit is never converted');

  const error = silver.breakSilverSeal(state, () => 0.5);
  assert.equal(error, null);
  assert.equal(state.silverVein.status, 'secret');
  assert.equal(state.silverVein.sealBroken, true);
  assert.equal(tile.hasSilver, true);
  const factors = suspicion.suspicionBreakdown(state);
  const rumor = factors.find(factor => factor.id === 'silverRumor');
  assert.equal(rumor.delta, CONFIG.suspicion.perSealBrokenSilver, 'seal-broken mining weighs heavier');
}

// ── G2: 보고 → 설점 (낮은 확률) — 캘 수 있으나 조정 몫이 빠진다 ──
{
  const { state, tile } = stateWithMine(2026071715);
  recordMiningToday(state, tile);
  silver.dailySilverTick(state, () => 0);
  silver.resolveSilverVeinChoice(state, 'report', () => 0); // sanction 성공
  assert.equal(state.silverVein.status, 'sanctioned');
  assert.equal(tile.hasSilver, true);
  const factors = suspicion.suspicionBreakdown(state);
  assert.ok(!factors.some(factor => factor.id === 'silverRumor'), 'sanctioned mining is legal — no rumor');
}

// ── G2: 묻어둔다 → 자동 재제안 없이 고정 매장량으로 직접 다시 열기 ──
{
  const { state, tile } = stateWithMine(2026071716);
  recordMiningToday(state, tile);
  silver.dailySilverTick(state, () => 0);
  const discoveredAmount = state.silverVein.discoveredAmount;
  assert.ok(discoveredAmount >= CONFIG.minerals.silverMin && discoveredAmount <= CONFIG.minerals.silverMax);
  silver.resolveSilverVeinChoice(state, 'bury', () => 0.5);
  assert.equal(state.silverVein.status, 'buried');
  assert.ok(!tile.hasSilver, 'buried vein keeps the original deposit');

  tile.mineralRemaining = 1;
  const depletion = minerals.extractMineralDeposit(tile, 1);
  assert.equal(depletion.depleted, true);
  assert.equal(tile.terrain, 'plain', 'the original outcrop may be exhausted');
  assert.equal(silver.isBuriedSilverVeinTile(state, tile), true,
    'the buried vein remains discoverable independently of the depleted outcrop');
  assert.ok(selectionActions.getBuildingActions(state, state.buildings.find(building => building.type === 'mine'))
    .some(action => action.id === 'silver-reopen'), 'the serving mine can still reopen a buried vein after depletion');

  state.day += 30;
  recordMiningToday(state, tile);
  silver.dailySilverTick(state, () => 0.99);
  assert.equal(state.pendingChoice, null, 'continued mining never re-opens the buried-vein event');
  assert.equal(state.silverVein.discoveredAmount, discoveredAmount, 'the hidden silver reserve remains fixed');

  assert.equal(silver.reopenBuriedVein(state), null);
  assert.equal(state.pendingChoice?.kind, 'silverVein', 'the player can explicitly reopen it from the mine');
  silver.resolveSilverVeinChoice(state, 'secret', () => 0.99);
  assert.equal(minerals.mineralRemaining(tile), discoveredAmount,
    'opening the vein uses the amount fixed at first discovery instead of rerolling');
}

assert.match(rendererSource, /status === 'buried'[\s\S]*drawBuriedSilverVeinMarker/,
  'the explored map keeps a marker for a buried vein');
assert.match(selectionContextSource, /buriedSilverVeinHere[\s\S]*은 매장량[\s\S]*고정[\s\S]*원광 고갈/,
  'tile details distinguish the fixed hidden reserve from changing original ore');

// ── G2: 보장 — 자연 확률이 없어도 누적 채광일이 차면 반드시 등장 ──
{
  const { state, tile } = stateWithMine(2026071717);
  for (let i = 0; i < CONFIG.silver.pityMiningDays; i++) {
    recordMiningToday(state, tile);
    silver.dailySilverTick(state, () => 0.999);
    state.day += 1;
  }
  assert.ok(state.silverVein, 'the vein is guaranteed at least once per game');
}

// ── G2: 대장간 은세공 — 은을 귀금속으로 바꾸는 싱크 ──
{
  const def = buildings.SMITHY_PRODUCT_DEFS.silverwork;
  assert.equal(def.output, 'preciousMetal');
  assert.ok(def.inputPerUnit.silver >= 1, 'silverwork consumes silver');
  assert.ok(buildings.SMITHY_PRODUCT_ORDER.includes('silverwork'));
  assert.ok(!buildings.isSmithyProductUnlocked('settlement', 'silverwork'), 'silverwork needs rank');
  assert.ok(buildings.isSmithyProductUnlocked('jin', 'silverwork'));
}

console.log('silver economy tests passed');
