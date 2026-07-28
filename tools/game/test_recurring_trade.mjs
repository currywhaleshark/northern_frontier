// 정기거래 계약 — 체결 검증, 연간 자동 실행(이행·유예·불이행·파기), 계약고 격리, 부분 이행.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function transpile(source) {
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return output.replace(/(from\s+['"])(\.{1,2}\/[^'"]+)(['"])/g, (_match, start, spec, end) => {
    if (/\.[cm]?js$/.test(spec)) return `${start}${spec}${end}`;
    return `${start}${spec}.mjs${end}`;
  });
}

const saveStore = new Map();
globalThis.localStorage = {
  getItem: key => (saveStore.has(key) ? saveStore.get(key) : null),
  setItem: (key, value) => saveStore.set(key, value),
  removeItem: key => saveStore.delete(key),
};

const rootDir = mkdtempSync(join(tmpdir(), 'northern-recurring-trade-'));
const gameDir = join(rootDir, 'game');
mkdirSync(gameDir, { recursive: true });
for (const file of readdirSync(new URL('../../src/game/', import.meta.url)).filter(f => f.endsWith('.ts'))) {
  const source = readFileSync(new URL(`../../src/game/${file}`, import.meta.url), 'utf8');
  writeFileSync(join(gameDir, file.replace(/\.ts$/, '.mjs')), transpile(source), 'utf8');
}

const simulation = await import(pathToFileURL(join(gameDir, 'simulation.mjs')).href);
const contracts = await import(pathToFileURL(join(gameDir, 'tradeContracts.mjs')).href);
const reserve = await import(pathToFileURL(join(gameDir, 'tradeContractReserve.mjs')).href);
const tradeValues = await import(pathToFileURL(join(gameDir, 'tradeValues.mjs')).href);
const saveLoad = await import(pathToFileURL(join(gameDir, 'saveLoad.mjs')).href);
const { CURRENT_SCHEMA_VERSION } = await import(pathToFileURL(join(gameDir, 'saveSchema.mjs')).href);
const { CONFIG } = await import(pathToFileURL(join(gameDir, 'config.mjs')).href);

const FACTION = '오도리 씨족';
const C = CONFIG.trade.contract;
const { seasonDays, yearDays } = CONFIG.time;

function freshState(relation = 80) {
  const state = simulation.newGame(20260728);
  for (const resource of Object.keys(state.resources)) {
    if (resource === 'reputation' || resource === 'defense') continue;
    state.resources[resource] = 500;
  }
  state.relations[FACTION] = relation;
  return state;
}

// 그 계절 계약 상한에 맞춘 협상 성사 조건 하나
function acceptedNegotiation(state, { get = 'grain', give = 'tools', giveAmt = 3, getAmt } = {}) {
  const cap = contracts.maxContractGetAmt(state, FACTION, get);
  return {
    faction: FACTION,
    initiatedBy: 'player',
    phase: 'accepted',
    give, giveAmt,
    get, getAmt: getAmt ?? cap,
    round: 0,
    margin: 1,
    message: '',
  };
}

function signed(state, options) {
  const negotiation = acceptedNegotiation(state, options);
  const error = contracts.signTradeContract(state, negotiation);
  assert.equal(error, null, `계약이 체결되어야 한다: ${error}`);
  return state.tradeContracts[state.tradeContracts.length - 1];
}

// ── 1. 우호도가 기간과 계약 할인을 정한다 ──
{
  for (const [relation, minYears, maxYears] of [[45, 2, 3], [59, 2, 3], [60, 4, 5], [74, 4, 5], [75, 6, 7], [90, 6, 7]]) {
    const state = freshState(relation);
    const terms = contracts.previewTradeContract(state, acceptedNegotiation(state));
    assert.ok(
      terms.durationYears >= minYears && terms.durationYears <= maxYears,
      `우호도 ${relation}의 기간은 ${minYears}~${maxYears}년이어야 한다 (실제 ${terms.durationYears})`,
    );
    assert.equal(terms.discounted, relation >= C.discountMinRelation, `우호도 ${relation}의 계약 할인 적용 여부`);
  }

  // 같은 시드·같은 조건이면 기간이 결정적이다
  const a = contracts.previewTradeContract(freshState(80), acceptedNegotiation(freshState(80)));
  const b = contracts.previewTradeContract(freshState(80), acceptedNegotiation(freshState(80)));
  assert.equal(a.durationYears, b.durationYears, '기간 결정은 시드+연차로 결정적이어야 한다');

  // 계약 할인은 내주는 몫을 줄이는 쪽으로 붙는다
  const plain = freshState(50);
  const favored = freshState(80);
  assert.equal(contracts.contractGiveAmt(20, 50), 20, '우호도 60 미만은 할인이 없다');
  assert.ok(contracts.contractGiveAmt(20, 80) < 20, '우호도 60 이상은 내주는 몫이 줄어든다');
  assert.ok(
    contracts.contractMargin(80) < contracts.contractMargin(50),
    '우호도가 높을수록 계약 교환비가 유리하다',
  );
  void plain; void favored;
}

// ── 2. 체결 조건 검증 ──
{
  // 우호도 45 미만은 연 계약 자체가 불가
  const cold = freshState(C.minRelation - 1);
  assert.match(
    contracts.signTradeContract(cold, acceptedNegotiation(cold)) ?? '',
    /우호도/,
    '우호도가 낮으면 계약을 거절한다',
  );
  assert.equal(cold.tradeContracts.length, 0, '거절된 계약은 등록되지 않는다');

  // 물량 상한 = 그 계절 교역량 총량의 절반
  const state = freshState(80);
  const cap = contracts.maxContractGetAmt(state, FACTION, 'grain');
  const total = tradeValues.factionTradeCapacitySummary(state, FACTION, 'grain').total;
  assert.equal(cap, Math.floor(total * C.maxCapacityShare), '상한은 교역량 총량의 절반이다');
  assert.ok(cap >= 1, '검증에 쓸 만한 상한이 나와야 한다');
  assert.match(
    contracts.signTradeContract(state, acceptedNegotiation(state, { getAmt: cap + 1 })) ?? '',
    /절반/,
    '상한을 넘는 물량은 계약할 수 없다',
  );

  // 같은 get 품목 중복 불가
  signed(state, { get: 'grain' });
  assert.match(
    contracts.signTradeContract(state, acceptedNegotiation(state, { get: 'grain' })) ?? '',
    /이미 있습니다/,
    '같은 품목 계약은 중복될 수 없다',
  );

  // 같은 세력 계약 수 상한
  signed(state, { get: 'hide', give: 'stone', giveAmt: 8 });
  assert.equal(state.tradeContracts.length, C.maxPerFaction, '세력당 계약은 상한까지만 쌓인다');
  assert.match(
    contracts.signTradeContract(state, acceptedNegotiation(state, { get: 'wood', give: 'stone', giveAmt: 8 })) ?? '',
    /건까지/,
    '세력당 계약 수 상한을 넘길 수 없다',
  );

  // 기물 거래는 계약 대상이 아니다
  const withItem = { ...acceptedNegotiation(freshState(80)), specialItem: 'tigerPelt' };
  assert.match(
    contracts.tradeContractBlockReason(
      state, FACTION, withItem.give, withItem.giveAmt, withItem.get, withItem.getAmt, withItem.specialItem,
    ) ?? '',
    /기물/,
    '기물 거래는 정기 계약이 될 수 없다',
  );
}

// ── 3. 체결은 첫 해분을 그 자리에서 이행한다 ──
{
  const state = freshState(80);
  const toolsBefore = state.resources.tools;
  const grainBefore = state.resources.grain;
  const contract = signed(state);

  assert.equal(state.resources.tools, toolsBefore - contract.giveAmt, '체결 즉시 내줄 몫이 빠진다');
  assert.equal(state.resources.grain, grainBefore + contract.getAmt, '체결 즉시 받을 몫이 들어온다');
  assert.equal(contract.yearsExecuted, 1, '체결분이 1년차 이행으로 잡힌다');
  assert.equal(contract.executeSeason, 'spring', '실행 계절은 체결한 계절이다');
  assert.equal(contract.signedYear, 1, '1년차에 체결했다');
  assert.ok(
    tradeValues.factionTradeCapacitySummary(state, FACTION, 'grain').used >= contract.getAmt,
    '체결 실행이 그 계절 교역량을 소모한다',
  );
}

// ── 4. 연간 자동 실행 — 이행 ──
{
  const state = freshState(80);
  const contract = signed(state);
  const grainBefore = state.resources.grain;
  const relationBefore = state.relations[FACTION];

  // 이듬해 봄 첫날
  state.day = yearDays + 1;
  tradeValues.resetFactionTradeCapacityUsage(state);
  contracts.maybeRunTradeContracts(state);

  assert.equal(contract.yearsExecuted, 2, '이듬해 같은 계절 첫날에 자동 실행된다');
  assert.equal(state.resources.grain, grainBefore + contract.getAmt, '받을 몫이 들어온다');
  assert.ok(state.relations[FACTION] > relationBefore, '이행하면 우호도가 소폭 오른다');
  assert.equal(state.pendingChoice, null, '평시 이행에는 모달이 뜨지 않는다');

  // 같은 해에 두 번 실행되지 않는다
  const executedOnce = contract.yearsExecuted;
  state.day = yearDays + 2;
  contracts.maybeRunTradeContracts(state);
  assert.equal(contract.yearsExecuted, executedOnce, '같은 해에 두 번 실행되지 않는다');
}

// ── 5. 물량 부족 — 유예 안에 채우면 이행 ──
{
  const state = freshState(80);
  const contract = signed(state);
  state.resources.tools = 0;
  state.day = yearDays + 1;
  tradeValues.resetFactionTradeCapacityUsage(state);
  contracts.maybeRunTradeContracts(state);

  assert.equal(contract.yearsExecuted, 1, '물량이 없으면 실행되지 않는다');
  assert.equal(contract.missedStreak, 0, '유예 중에는 아직 불이행이 아니다');
  const grace = contracts.contractsInGrace(state);
  assert.equal(grace.length, 1, '유예 중인 계약이 잡힌다');
  assert.equal(grace[0].daysLeft, C.graceDays, '첫날에는 유예 일수가 그대로 남는다');
  assert.equal(grace[0].shortfall, contract.giveAmt, '모자란 수량이 보고된다');

  // 유예 둘째 날 물량을 채우면 실행된다
  state.day = yearDays + 2;
  state.resources.tools = 100;
  contracts.maybeRunTradeContracts(state);
  assert.equal(contract.yearsExecuted, 2, '유예 안에 채우면 이행된다');
  assert.equal(contracts.contractsInGrace(state).length, 0, '이행 뒤에는 유예가 풀린다');
}

// ── 6. 유예가 지나면 불이행, 연속 2회면 파기 ──
{
  const state = freshState(80);
  const contract = signed(state);
  assert.ok(contract.durationYears >= 4, '파기 검증에는 넉넉한 기간이 필요하다');
  state.resources.tools = 0;

  // 이듬해: 유예 내내 못 채운다
  for (let day = 1; day <= C.graceDays; day++) {
    state.day = yearDays + day;
    contracts.maybeRunTradeContracts(state);
  }
  assert.equal(contract.missedStreak, 0, '유예 안에는 불이행이 아니다');

  const relationBefore = state.relations[FACTION];
  state.day = yearDays + C.graceDays + 1;
  contracts.maybeRunTradeContracts(state);
  assert.equal(contract.missedStreak, 1, '유예가 지나면 불이행으로 잡힌다');
  assert.ok(state.relations[FACTION] < relationBefore, '불이행은 우호도를 떨어뜨린다');
  assert.equal(state.tradeContracts.length, 1, '1회 불이행으로는 파기되지 않는다');

  // 그 이듬해: 두 번째 불이행 → 파기
  state.day = 2 * yearDays + C.graceDays + 1;
  contracts.maybeRunTradeContracts(state);
  assert.equal(state.tradeContracts.length, 0, '연속 2회 불이행이면 계약이 파기된다');
}

// ── 7. 적대 전환은 그해를 건너뛸 뿐 불이행이 아니다 ──
{
  const state = freshState(80);
  const contract = signed(state);
  state.relations[FACTION] = CONFIG.trade.minRelationToTrade - 1;
  state.day = yearDays + 1;
  tradeValues.resetFactionTradeCapacityUsage(state);
  contracts.maybeRunTradeContracts(state);

  assert.equal(contract.yearsExecuted, 1, '적대 전환 중에는 실행되지 않는다');
  assert.equal(contract.missedStreak, 0, '적대 전환은 불이행으로 치지 않는다');
  assert.equal(state.tradeContracts.length, 1, '계약은 살아 있다');

  // 우호도가 회복되면 이듬해에 다시 실행된다
  state.relations[FACTION] = 80;
  state.day = 2 * yearDays + 1;
  tradeValues.resetFactionTradeCapacityUsage(state);
  contracts.maybeRunTradeContracts(state);
  assert.equal(contract.yearsExecuted, 2, '우호도가 회복되면 정기거래가 재개된다');
}

// ── 8. 교역량이 줄면 비례 부분 이행 (불이행 아님) ──
{
  const state = freshState(80);
  const contract = signed(state);
  const grainBefore = state.resources.grain;
  const toolsBefore = state.resources.tools;

  state.day = yearDays + 1;
  tradeValues.resetFactionTradeCapacityUsage(state);
  // 그해 교역량의 대부분을 미리 써 버려 계약 몫이 다 안 나오게 만든다
  const total = tradeValues.factionTradeCapacitySummary(state, FACTION, 'grain').total;
  const leave = Math.max(1, Math.floor(contract.getAmt / 2));
  tradeValues.useFactionTradeCapacity(state, FACTION, 'grain', total - leave);
  contracts.maybeRunTradeContracts(state);

  assert.equal(contract.yearsExecuted, 2, '부분 이행도 이행으로 잡힌다');
  assert.equal(contract.missedStreak, 0, '부분 이행은 불이행이 아니다');
  assert.equal(state.resources.grain, grainBefore + leave, '들어오는 몫이 교역량만큼 줄어든다');
  const gave = toolsBefore - state.resources.tools;
  assert.ok(gave > 0 && gave < contract.giveAmt, `내주는 몫도 비례해 줄어든다 (실제 ${gave}/${contract.giveAmt})`);
}

// ── 9. 계약고 — 격리·상한·인출 순서·반환 ──
{
  const state = freshState(80);
  const contract = signed(state);

  // 채움 상한 = 활성 계약들의 다음 1회분 giveAmt 합
  assert.equal(reserve.contractReserveNeed(state, contract.give), contract.giveAmt, '상한은 다음 1회분이다');

  const stockBefore = state.resources[contract.give];
  assert.equal(reserve.setTradeContractReserve(state, contract.give, contract.giveAmt), null, '계약고로 옮길 수 있다');
  assert.equal(reserve.contractReserved(state, contract.give), contract.giveAmt, '계약고에 잠긴다');
  assert.equal(state.resources[contract.give], stockBefore - contract.giveAmt, '일반 재고에서 빠져 격리된다');

  // 상한을 넘겨 담을 수 없다
  reserve.setTradeContractReserve(state, contract.give, contract.giveAmt + 50);
  assert.equal(reserve.contractReserved(state, contract.give), contract.giveAmt, '상한을 넘겨 담기지 않는다');

  // 계약 품목이 아니면 거절
  assert.match(
    reserve.setTradeContractReserve(state, 'salt', 5) ?? '',
    /품목이 아닙니다/,
    '계약으로 내주지 않는 품목은 계약고에 담을 수 없다',
  );

  // 실행 시 계약고를 먼저 비운다
  state.resources[contract.give] = 0; // 일반 재고가 없어도 계약고만으로 이행된다
  state.day = yearDays + 1;
  tradeValues.resetFactionTradeCapacityUsage(state);
  contracts.maybeRunTradeContracts(state);
  assert.equal(contract.yearsExecuted, 2, '계약고만으로도 이행된다');
  assert.equal(reserve.contractReserved(state, contract.give), 0, '계약고가 먼저 쓰인다');

  // 계약이 사라지면 잔여 계약고는 일반 재고로 돌아온다
  state.resources[contract.give] = 100;
  reserve.setTradeContractReserve(state, contract.give, contract.giveAmt);
  const heldBack = reserve.contractReserved(state, contract.give);
  const stockAtCancel = state.resources[contract.give];
  contracts.cancelTradeContract(state, contract);
  assert.equal(state.tradeContracts.length, 0, '중도 해지로 계약이 사라진다');
  assert.equal(reserve.contractReserved(state, contract.give), 0, '잔여 계약고가 비워진다');
  assert.equal(state.resources[contract.give], stockAtCancel + heldBack, '잔여분은 일반 재고로 반환된다');
}

// ── 10. 중도 해지는 위약으로 우호도가 떨어진다 ──
{
  const state = freshState(80);
  const contract = signed(state);
  const relationBefore = state.relations[FACTION];
  contracts.cancelTradeContract(state, contract);
  assert.ok(state.relations[FACTION] < relationBefore, '중도 해지는 우호도를 떨어뜨린다');
}

// ── 11. 기간이 끝나면 갱신 제안 모달이 뜬다 (정기거래에서 모달이 뜨는 유일한 자리) ──
{
  // 종료를 고르면 계약이 사라진다
  const state = freshState(80);
  const contract = signed(state);
  const duration = contract.durationYears;
  contract.yearsExecuted = duration;

  state.day = duration * yearDays + 1;
  tradeValues.resetFactionTradeCapacityUsage(state);
  contracts.maybeRunTradeContracts(state);
  assert.ok(state.pendingChoice, '만료 계절에 갱신 제안이 열린다');
  assert.equal(state.pendingChoice.kind, 'tradeContract', '갱신 모달의 종류');
  assert.equal(state.tradeContracts.length, 1, '선택 전에는 계약이 남아 있다');

  simulation.resolveChoice(state, 'end');
  assert.equal(state.tradeContracts.length, 0, '종료를 고르면 계약이 끝난다');
  assert.equal(state.pendingChoice, null, '모달이 닫힌다');
}
{
  // 갱신을 고르면 현재 우호도로 조건이 다시 매겨지고 새 기간이 시작된다
  const state = freshState(80);
  const contract = signed(state);
  const duration = contract.durationYears;
  contract.yearsExecuted = duration;

  state.day = duration * yearDays + 1;
  tradeValues.resetFactionTradeCapacityUsage(state);
  contracts.maybeRunTradeContracts(state);
  simulation.resolveChoice(state, 'renew');

  assert.equal(state.tradeContracts.length, 1, '갱신하면 계약이 이어진다');
  const renewed = state.tradeContracts[0];
  assert.equal(renewed.yearsExecuted, 0, '새 기간은 처음부터 센다');
  assert.ok(renewed.durationYears >= 2, '새 기간이 매겨진다');
  assert.equal(renewed.get, contract.get, '받는 품목은 그대로다');

  // 갱신한 해의 몫은 곧바로 이어서 이행된다
  const grainBefore = state.resources.grain;
  state.day = duration * yearDays + 2;
  contracts.maybeRunTradeContracts(state);
  assert.equal(renewed.yearsExecuted, 1, '갱신 직후 그해분이 이행된다');
  assert.equal(state.resources.grain, grainBefore + renewed.getAmt, '갱신한 조건대로 받는다');

  // 우호도가 낮으면 갱신을 고를 수 없다
  const cold = freshState(80);
  const coldContract = signed(cold);
  coldContract.yearsExecuted = coldContract.durationYears;
  cold.relations[FACTION] = C.minRelation - 1;
  cold.day = coldContract.durationYears * yearDays + 1;
  tradeValues.resetFactionTradeCapacityUsage(cold);
  contracts.maybeRunTradeContracts(cold);
  assert.ok(cold.pendingChoice, '우호도가 낮아도 만료 안내는 뜬다');
  const renewOption = cold.pendingChoice.options.find(option => option.id === 'renew');
  assert.equal(renewOption.disabled, true, '우호도가 낮으면 갱신을 고를 수 없다');
}

// ── 12. 다음 실행일과 요약 지표 ──
{
  const state = freshState(80);
  const contract = signed(state);
  assert.equal(
    contracts.nextContractDueDay(state, contract), yearDays + 1,
    '체결한 해에는 다음 실행일이 이듬해 같은 계절 첫날이다',
  );
  assert.equal(contracts.daysUntilNextContract(state), yearDays, '다음 실행까지 남은 일수');

  // 충당률: 계약고 + 일반 재고 기준
  state.resources[contract.give] = 0;
  assert.equal(reserve.contractReadinessRatio(state), 0, '아무것도 없으면 미충당이다');
  state.resources[contract.give] = contract.giveAmt;
  assert.equal(reserve.contractReadinessRatio(state), 1, '일반 재고로도 충당된다');
}

// ── 13. 세이브 — 구버전은 빈 계약, 왕복 보존 ──
{
  const legacy = { schemaVersion: 39, resources: {}, residents: [] };
  const migrated = saveLoad.migrateV39ToV40(legacy);
  assert.equal(migrated.schemaVersion, 40, '세이브 버전이 40으로 오른다');
  assert.deepEqual(migrated.tradeContracts, [], '구세이브는 빈 계약 배열로 시작한다');
  assert.deepEqual(migrated.tradeContractReserve, {}, '구세이브는 빈 계약고로 시작한다');
  assert.equal(CURRENT_SCHEMA_VERSION, 40, '현재 세이브 버전이 40이다');

  const state = freshState(80);
  const contract = signed(state);
  reserve.setTradeContractReserve(state, contract.give, contract.giveAmt);
  saveLoad.saveGame(state);
  const restored = saveLoad.loadGame();
  assert.ok(restored, '저장한 판을 다시 불러올 수 있다');
  assert.equal(restored.tradeContracts.length, 1, '계약이 저장·복원된다');
  assert.equal(restored.tradeContracts[0].get, contract.get, '계약 품목이 보존된다');
  assert.equal(restored.tradeContracts[0].durationYears, contract.durationYears, '계약 기간이 보존된다');
  assert.equal(
    reserve.contractReserved(restored, contract.give), contract.giveAmt,
    '계약고가 저장·복원된다',
  );
}

// ── 14. 일일 처리에 연결되어 있다 ──
{
  const state = freshState(80);
  const contract = signed(state);
  state.day = yearDays;           // 4년차 직전 — 이듬해 봄 첫날 하루 전
  state.subTick = 0;
  state.resources[contract.give] = 200;
  const executedBefore = contract.yearsExecuted;
  simulation.advanceDay(state);
  assert.equal(state.day, yearDays + 1, '하루가 지났다');
  assert.equal(
    state.tradeContracts[0].yearsExecuted, executedBefore + 1,
    '정기거래가 일일 처리에서 자동 실행된다',
  );
}

console.log('recurring trade contract tests passed');
