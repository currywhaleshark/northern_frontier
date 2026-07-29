// 정기거래 계약(定期去來) — 세력·상단과 연 1회 자동 실행되는 장기 거래.
// 협상이 성사된 조건을 그대로 연 단위로 잠그며, 체결한 계절의 첫날마다 스스로 굴러간다.
// 평시에는 모달이 뜨지 않는다 — 손으로 매번 거래하는 피로를 줄이는 것이 목적이다.
// 여진 씨족의 물물교환과 상단의 은 거래는 give/get에 은이 들어가느냐의 차이일 뿐,
// 계약 모델은 하나다.
import { withJosa } from './josa';
import { recordAnnals } from './annals';
import { CONFIG } from './config';
import { FACTIONS, RESOURCE_NAMES, SEASON_NAMES, SEASON_ORDER } from './constants';
import { addLog } from './events';
import { makeRng } from './map';
import { changeRelation, getRelation } from './relations';
import { getDayOfSeason, getSeason, getYear } from './seasons';
import {
  factionTradeCapacitySummary, factionValue, relationMargin, silverAdjustedMargin, useFactionTradeCapacity,
} from './tradeValues';
import {
  canCoverContract, contractReserved, drawForContract,
  reconcileTradeContractReserve, releaseTradeContractReserve,
} from './tradeContractReserve';
import type { GameState, ResourceId, Season, TradeContract, TradeNegotiation } from './types';

const ABSTRACT_RESOURCES = new Set<ResourceId>(['reputation', 'defense']);

function stableHash(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function seasonFirstDay(year: number, season: Season): number {
  const index = Math.max(0, SEASON_ORDER.indexOf(season));
  return (year - 1) * CONFIG.time.yearDays + index * CONFIG.time.seasonDays + 1;
}

// 체결 시 우호도가 정하는 기간 — 시드+연차로 결정적 (불러오기 시 재생성 가능)
export function contractDurationYears(
  seed: number, factionName: string, get: ResourceId, year: number, relation: number,
): number {
  const tier = CONFIG.trade.contract.durations.find(entry => relation >= entry.minRelation);
  if (!tier) return 0;
  const span = tier.maxYears - tier.minYears + 1;
  const rng = makeRng(seed + stableHash(`${factionName}:${get}`) + year * 7919);
  return tier.minYears + Math.floor(rng() * span);
}

// 계약 교환비에 얹는 배율 — 우호도 60부터 스팟 거래보다 소폭 유리해진다
export function contractDiscount(relation: number): number {
  return relation >= CONFIG.trade.contract.discountMinRelation ? CONFIG.trade.contract.discount : 1;
}

export function contractMargin(relation: number): number {
  return relationMargin(relation) * contractDiscount(relation);
}

// 계약으로 잠글 때 실제로 내주게 되는 수량 — 협상 성사 수치에 계약 할인을 적용한다
export function contractGiveAmt(negotiatedGiveAmt: number, relation: number): number {
  return Math.max(1, Math.ceil(negotiatedGiveAmt * contractDiscount(relation)));
}

export function activeContracts(state: GameState): TradeContract[] {
  return state.tradeContracts ?? [];
}

export function contractsForFaction(state: GameState, factionName: string): TradeContract[] {
  return activeContracts(state).filter(contract => contract.factionName === factionName);
}

// 계약 1건의 상한 — 체결 시점 그 계절 교역량 총량의 절반.
// 계약이 수동 교역을 다 밀어내지 않게 하는 장치다.
export function maxContractGetAmt(state: GameState, factionName: string, get: ResourceId): number {
  const total = factionTradeCapacitySummary(state, factionName, get).total;
  return Math.floor(total * CONFIG.trade.contract.maxCapacityShare);
}

// 체결 불가 사유 — UI 버튼의 disabled 사유와 공유한다
export function tradeContractBlockReason(
  state: GameState,
  factionName: string,
  give: ResourceId | null,
  giveAmt: number,
  get: ResourceId | null,
  getAmt: number,
  specialItem?: unknown,
): string | null {
  if (specialItem) return '기물 거래는 정기 계약으로 맺을 수 없습니다';
  if (!FACTIONS.some(faction => faction.name === factionName)) return '세력을 찾을 수 없습니다';
  if (!give || !get) return '거래 조건이 정해지지 않았습니다';
  if (give === get) return '같은 물품끼리는 계약할 수 없습니다';
  if (ABSTRACT_RESOURCES.has(give) || ABSTRACT_RESOURCES.has(get)) return '명성과 방어도는 교역할 수 없습니다';
  if (!Number.isInteger(giveAmt) || giveAmt <= 0 || !Number.isInteger(getAmt) || getAmt <= 0) {
    return '수량이 정해지지 않았습니다';
  }
  const relation = getRelation(state, factionName);
  if (relation < CONFIG.trade.contract.minRelation) {
    return `우호도 ${CONFIG.trade.contract.minRelation} 이상이라야 연 계약을 맺습니다`;
  }
  const existing = contractsForFaction(state, factionName);
  if (existing.length >= CONFIG.trade.contract.maxPerFaction) {
    return `${factionName}와의 계약은 ${CONFIG.trade.contract.maxPerFaction}건까지입니다`;
  }
  if (existing.some(contract => contract.get === get)) {
    return `${RESOURCE_NAMES[get]} 계약이 이미 있습니다`;
  }
  const cap = maxContractGetAmt(state, factionName, get);
  if (cap < 1) return `${SEASON_NAMES[getSeason(state.day)]}에는 계약으로 묶을 물량이 없습니다`;
  if (getAmt > cap) return `계약 물량은 이번 철 교역량의 절반(${RESOURCE_NAMES[get]} ${cap})까지입니다`;
  return null;
}

export interface TradeContractTerms {
  factionName: string;
  give: ResourceId; giveAmt: number;
  get: ResourceId; getAmt: number;
  executeSeason: Season;
  durationYears: number;
  margin: number;
  discounted: boolean;
}

// 협상 성사 조건을 계약 조건으로 환산한 미리보기 (버튼 옆 요약용)
export function previewTradeContract(
  state: GameState, negotiation: TradeNegotiation,
): TradeContractTerms | null {
  if (!negotiation.give || !negotiation.get) return null;
  const relation = getRelation(state, negotiation.faction);
  const duration = contractDurationYears(
    state.seed, negotiation.faction, negotiation.get, getYear(state.day), relation,
  );
  if (duration <= 0) return null;
  return {
    factionName: negotiation.faction,
    give: negotiation.give,
    giveAmt: contractGiveAmt(negotiation.giveAmt, relation),
    get: negotiation.get,
    getAmt: negotiation.getAmt,
    executeSeason: getSeason(state.day),
    durationYears: duration,
    margin: contractMargin(relation),
    discounted: contractDiscount(relation) < 1,
  };
}

export function contractTermsLabel(terms: TradeContractTerms): string {
  return `${SEASON_NAMES[terms.executeSeason]}마다 ${RESOURCE_NAMES[terms.give]} ${terms.giveAmt}을 내주고 ` +
    `${RESOURCE_NAMES[terms.get]} ${terms.getAmt}을 받습니다 — 연 1회, ${terms.durationYears}년.`;
}

// 다음 실행일 (절대 일수). 만료된 계약은 null
export function nextContractDueDay(state: GameState, contract: TradeContract): number | null {
  if (contract.yearsExecuted >= contract.durationYears) return null;
  const year = getYear(state.day);
  const dueThisYear = seasonFirstDay(year, contract.executeSeason);
  const graceEnd = dueThisYear + CONFIG.trade.contract.graceDays - 1;
  const settledOrPassed = contract.lastSettledYear >= year || state.day > graceEnd;
  return settledOrPassed ? seasonFirstDay(year + 1, contract.executeSeason) : dueThisYear;
}

export function daysUntilNextContract(state: GameState): number | null {
  let soonest: number | null = null;
  for (const contract of activeContracts(state)) {
    const due = nextContractDueDay(state, contract);
    if (due == null) continue;
    const days = Math.max(0, due - state.day);
    if (soonest == null || days < soonest) soonest = days;
  }
  return soonest;
}

export interface ContractGraceInfo {
  contract: TradeContract;
  daysLeft: number;   // 오늘 포함 남은 유예 일수
  shortfall: number;  // 아직 모자란 수량
}

// 유예 중인 계약 — 실행일이 지났는데 물량을 못 채운 것들
export function contractsInGrace(state: GameState): ContractGraceInfo[] {
  const season = getSeason(state.day);
  const year = getYear(state.day);
  const dayOfSeason = getDayOfSeason(state.day);
  const grace = CONFIG.trade.contract.graceDays;
  const result: ContractGraceInfo[] = [];
  for (const contract of activeContracts(state)) {
    if (contract.executeSeason !== season) continue;
    if (contract.lastSettledYear >= year) continue;
    if (contract.yearsExecuted >= contract.durationYears) continue;
    if (dayOfSeason > grace) continue;
    if (getRelation(state, contract.factionName) < CONFIG.trade.minRelationToTrade) continue;
    const due = dueAmounts(state, contract);
    if (!due || canCoverContract(state, contract.give, due.giveAmt)) continue;
    const available = contractReserved(state, contract.give) + Math.max(0, state.resources[contract.give] ?? 0);
    result.push({
      contract,
      daysLeft: grace - dayOfSeason + 1,
      shortfall: Math.max(0, due.giveAmt - available),
    });
  }
  return result;
}

interface DueAmounts { giveAmt: number; getAmt: number; ratio: number }

// 그해 실제로 오갈 수량 — 교역량이 줄어 있으면 비례해서 부분 이행한다
function dueAmounts(state: GameState, contract: TradeContract): DueAmounts | null {
  const remaining = factionTradeCapacitySummary(state, contract.factionName, contract.get).remaining;
  const getAmt = Math.min(contract.getAmt, remaining);
  if (getAmt < 1) return null;
  const ratio = getAmt / contract.getAmt;
  const giveAmt = Math.max(1, Math.min(contract.giveAmt, Math.ceil(contract.giveAmt * ratio)));
  return { giveAmt, getAmt, ratio };
}

function removeContract(state: GameState, contract: TradeContract): void {
  state.tradeContracts = activeContracts(state).filter(entry => entry !== contract);
  if (state.tradeContracts.length === 0) releaseTradeContractReserve(state);
  else reconcileTradeContractReserve(state);
}

function contractLabel(contract: TradeContract): string {
  return `${RESOURCE_NAMES[contract.give]}↔${RESOURCE_NAMES[contract.get]}`;
}

function executeContract(state: GameState, contract: TradeContract, due: DueAmounts, year: number): void {
  const drawn = drawForContract(state, contract.give, due.giveAmt);
  state.resources[contract.get] = (state.resources[contract.get] ?? 0) + due.getAmt;
  useFactionTradeCapacity(state, contract.factionName, contract.get, due.getAmt);
  changeRelation(state, contract.factionName, CONFIG.trade.contract.relationFulfill);
  contract.yearsExecuted += 1;
  contract.missedStreak = 0;
  contract.lastSettledYear = year;
  const partial = due.ratio < 1;
  addLog(
    state,
    `${withJosa(contract.factionName, '과/와')}의 정기거래: ${RESOURCE_NAMES[contract.give]} ${drawn}을 내주고 ` +
      `${withJosa(`${RESOURCE_NAMES[contract.get]} ${due.getAmt}`, '을/를')} 받았습니다. ` +
      `(${contract.yearsExecuted}/${contract.durationYears}년차)` +
      (partial ? ' 이번 철 교역량이 모자라 몫을 줄여 이행했습니다.' : ''),
    'trade',
    partial,
  );
  state.lifetimeStats.tradesCompleted++; // 계약 이행분 1회 (계약 생성은 세지 않는다)
  reconcileTradeContractReserve(state);
}

function missContract(state: GameState, contract: TradeContract, year: number): void {
  const c = CONFIG.trade.contract;
  contract.missedStreak += 1;
  contract.lastSettledYear = year;
  changeRelation(state, contract.factionName, -c.relationMiss);
  if (contract.missedStreak >= c.breakStreak) {
    changeRelation(state, contract.factionName, -c.relationBreak);
    removeContract(state, contract);
    addLog(
      state,
      `${withJosa(contract.factionName, '과/와')}의 정기거래(${contractLabel(contract)})가 파기되었습니다. ` +
        '두 해 연속 약속한 물량을 대지 못했습니다.',
      'bad',
      true,
    );
    recordAnnals(state, 'trade',
      `${withJosa(contract.factionName, '과/와')}의 정기거래(${contractLabel(contract)})가 불이행 끝에 파기되었습니다.`);
    return;
  }
  addLog(
    state,
    `${withJosa(contract.factionName, '과/와')}의 정기거래 ${RESOURCE_NAMES[contract.give]} ${contract.giveAmt}을 ` +
      '대지 못해 올해분이 불이행되었습니다. 한 번 더 어기면 계약이 파기됩니다.',
    'bad',
    true,
  );
}

function expireContract(state: GameState, contract: TradeContract): void {
  removeContract(state, contract);
  addLog(
    state,
    `${withJosa(contract.factionName, '과/와')}의 정기거래(${contractLabel(contract)}) ` +
      `${contract.durationYears}년 기한이 끝났습니다.`,
    'info',
    true,
  );
}

// 받을 물량을 고정한 채 현재 우호도로 내줄 몫을 다시 계산한다 (갱신용).
// quoteFactionDemand와 같은 식이되 내주는 품목은 기존 계약 그대로 둔다.
export function contractGiveForTerms(
  factionName: string, give: ResourceId, get: ResourceId, getAmt: number, relation: number,
): number {
  const giveUnitValue = factionValue(factionName, give);
  const getUnitValue = factionValue(factionName, get);
  if (!(giveUnitValue > 0) || !(getUnitValue > 0)) return 0;
  const margin = silverAdjustedMargin(contractMargin(relation), give, get);
  return Math.max(1, Math.ceil((getAmt * getUnitValue * margin) / giveUnitValue));
}

// 만료 계약의 갱신 조건 — 현재 우호도로 기간과 교환비를 다시 매긴다.
// 관계를 키워 두었으면 더 긴 기간·나은 값이 자연스럽게 따라온다.
export function renewalTerms(state: GameState, contract: TradeContract): TradeContractTerms | null {
  const relation = getRelation(state, contract.factionName);
  if (relation < CONFIG.trade.contract.minRelation) return null;
  const year = getYear(state.day);
  const duration = contractDurationYears(state.seed, contract.factionName, contract.get, year, relation);
  const giveAmt = contractGiveForTerms(contract.factionName, contract.give, contract.get, contract.getAmt, relation);
  if (duration <= 0 || giveAmt <= 0) return null;
  return {
    factionName: contract.factionName,
    give: contract.give, giveAmt,
    get: contract.get, getAmt: contract.getAmt,
    executeSeason: contract.executeSeason,
    durationYears: duration,
    margin: contractMargin(relation),
    discounted: contractDiscount(relation) < 1,
  };
}

// 만료 계절에 실행 대신 뜨는 갱신 제안 — 정기거래에서 모달이 뜨는 유일한 자리다
export function openTradeContractRenewal(state: GameState, contract: TradeContract): void {
  const terms = renewalTerms(state, contract);
  const relation = Math.round(getRelation(state, contract.factionName));
  state.pendingChoice = {
    kind: 'tradeContract',
    title: `정기거래 만료 — ${contract.factionName}`,
    body:
      `${withJosa(contract.factionName, '과/와')} 맺은 ${contract.durationYears}년 정기거래가 이번 철로 끝납니다.\n` +
      `지금까지 ${SEASON_NAMES[contract.executeSeason]}마다 ${RESOURCE_NAMES[contract.give]} ${contract.giveAmt}을 내주고 ` +
      `${RESOURCE_NAMES[contract.get]} ${contract.getAmt}을 받아 왔습니다. (현재 우호도 ${relation})`,
    options: [
      {
        id: 'renew',
        label: '계약을 잇는다',
        desc: terms
          ? `${contractTermsLabel(terms)}${terms.giveAmt < contract.giveAmt ? ' 관계가 깊어져 내주는 몫이 줄었습니다.' : ''}`
          : '지금 우호도로는 새 조건을 맺을 수 없습니다.',
        disabled: !terms,
        disabledReason: terms ? undefined : `우호도 ${CONFIG.trade.contract.minRelation} 이상이라야 연 계약을 잇습니다`,
      },
      {
        id: 'end',
        label: '여기서 끝낸다',
        desc: '계약을 종료합니다. 계약고에 남은 물자는 일반 재고로 돌아옵니다.',
      },
    ],
    data: { factionName: contract.factionName, get: contract.get },
  };
}

// 갱신 모달 처리 — 이어 가면 새 기간이 시작되고, 그해분은 다음 일일 처리에서 오간다
export function resolveTradeContractChoice(state: GameState, optionId: string): void {
  const choice = state.pendingChoice;
  if (!choice || choice.kind !== 'tradeContract') return;
  state.pendingChoice = null;
  const factionName = choice.data.factionName as string;
  const get = choice.data.get as ResourceId;
  const contract = activeContracts(state).find(
    entry => entry.factionName === factionName && entry.get === get,
  );
  if (!contract) return;

  const terms = optionId === 'renew' ? renewalTerms(state, contract) : null;
  if (!terms) {
    expireContract(state, contract);
    return;
  }
  contract.giveAmt = terms.giveAmt;
  contract.durationYears = terms.durationYears;
  contract.signedYear = getYear(state.day);
  contract.yearsExecuted = 0;
  contract.missedStreak = 0;
  contract.lastSettledYear = getYear(state.day) - 1; // 그해분은 곧바로 이어서 이행된다
  reconcileTradeContractReserve(state);
  addLog(
    state,
    `${withJosa(factionName, '과/와')}의 정기거래를 이었습니다. ${contractTermsLabel(terms)}`,
    'trade',
    true,
  );
}

// 매일 검사 — 세공 수거(maybeCollectTribute)와 같은 캐던스.
// 실행 계절 첫날에 이행하고, 물량이 모자라면 유예 안에서 매일 다시 시도한다.
export function maybeRunTradeContracts(state: GameState): void {
  if (activeContracts(state).length === 0) return;
  const season = getSeason(state.day);
  const year = getYear(state.day);
  const dayOfSeason = getDayOfSeason(state.day);
  const c = CONFIG.trade.contract;

  for (const contract of [...activeContracts(state)]) {
    if (contract.executeSeason !== season) continue;
    // 그해 몫을 이미 매듭지었으면 건너뛴다.
    // (체결 연도분은 체결 시 1회 실행으로 끝났고 lastSettledYear가 그해로 찍혀 있다)
    if (contract.lastSettledYear >= year) continue;
    if (contract.yearsExecuted >= contract.durationYears) {
      // 만료 — 이때만 모달이 뜬다. 다른 모달·전투와 겹치면 다음 날 다시 시도한다
      if (!state.pendingChoice && !state.battle) openTradeContractRenewal(state, contract);
      else if (dayOfSeason > c.graceDays) expireContract(state, contract);
      continue;
    }
    if (dayOfSeason > c.graceDays) {
      // 유예까지 지나도록 못 채운 계약 — 불이행.
      // (계절 중간에 불러온 저장도 여기서 한 번에 매듭지어진다)
      missContract(state, contract, year);
      continue;
    }
    // 적대 전환: 그해는 건너뛰되 불이행으로 치지 않는다
    if (getRelation(state, contract.factionName) < CONFIG.trade.minRelationToTrade) {
      contract.lastSettledYear = year;
      addLog(
        state,
        `${withJosa(contract.factionName, '과/와')}의 사이가 틀어져 올해 정기거래(${contractLabel(contract)})가 멈췄습니다.`,
        'bad',
        true,
      );
      continue;
    }
    const due = dueAmounts(state, contract);
    if (!due) {
      // 그해 교역량이 아예 없다 — 부분 이행조차 불가하지만 불이행은 아니다
      contract.lastSettledYear = year;
      addLog(
        state,
        `${withJosa(contract.factionName, '이/가')} 올해는 ${withJosa(RESOURCE_NAMES[contract.get], '을/를')} ` +
          '내놓지 못해 정기거래를 건너뜁니다.',
        'info',
        true,
      );
      continue;
    }
    if (canCoverContract(state, contract.give, due.giveAmt)) {
      executeContract(state, contract, due, year);
      continue;
    }
    if (dayOfSeason === 1) {
      addLog(
        state,
        `${withJosa(contract.factionName, '과/와')}의 정기거래 몫 ${RESOURCE_NAMES[contract.give]} ${due.giveAmt}이 ` +
          `모자랍니다. ${c.graceDays}일 안에 채우지 못하면 불이행됩니다.`,
        'bad',
        true,
      );
    }
  }
}

// 협상 성사 조건을 그대로 연 단위로 잠근다 — 1회 즉시 실행 + 계약 등록.
// 반환값은 거절 사유 (성사되면 null)
export function signTradeContract(state: GameState, negotiation: TradeNegotiation): string | null {
  const blocked = tradeContractBlockReason(
    state, negotiation.faction, negotiation.give, negotiation.giveAmt,
    negotiation.get, negotiation.getAmt, negotiation.specialItem,
  );
  if (blocked) return blocked;
  const terms = previewTradeContract(state, negotiation);
  if (!terms) return '계약 조건을 만들지 못했습니다';
  if ((state.resources[terms.give] ?? 0) < terms.giveAmt) {
    return `${withJosa(RESOURCE_NAMES[terms.give], '이/가')} 부족해 첫 해분을 이행할 수 없습니다`;
  }
  if (factionTradeCapacitySummary(state, terms.factionName, terms.get).remaining < terms.getAmt) {
    return `${SEASON_NAMES[terms.executeSeason]} 교역량이 남아 있지 않습니다`;
  }

  // 첫 해분 즉시 이행
  state.resources[terms.give] -= terms.giveAmt;
  state.resources[terms.get] = (state.resources[terms.get] ?? 0) + terms.getAmt;
  useFactionTradeCapacity(state, terms.factionName, terms.get, terms.getAmt);
  changeRelation(state, terms.factionName, CONFIG.relations.tradeAccept);
  state.lastTradeByFaction[terms.factionName] = state.day;

  const contract: TradeContract = {
    factionName: terms.factionName,
    give: terms.give, giveAmt: terms.giveAmt,
    get: terms.get, getAmt: terms.getAmt,
    executeSeason: terms.executeSeason,
    signedYear: getYear(state.day),
    durationYears: terms.durationYears,
    yearsExecuted: 1,
    missedStreak: 0,
    lastSettledYear: getYear(state.day),
  };
  state.tradeContracts = [...activeContracts(state), contract];
  addLog(
    state,
    `${withJosa(terms.factionName, '과/와')} 정기거래를 맺었습니다. ${contractTermsLabel(terms)} ` +
      '첫 해분은 그 자리에서 오갔습니다.',
    'trade',
    true,
  );
  recordAnnals(state, 'trade',
    `${withJosa(terms.factionName, '과/와')} ${terms.durationYears}년 정기거래를 맺었습니다 (${contractTermsLabel(terms)}).`);
  state.lifetimeStats.tradesCompleted++; // 체결 즉시 오간 첫 해분 — 계약 생성 자체는 따로 세지 않는다
  return null;
}

// 플레이어 중도 해지 — 위약으로 우호도가 떨어진다
export function cancelTradeContract(state: GameState, contract: TradeContract): void {
  if (!activeContracts(state).includes(contract)) return;
  changeRelation(state, contract.factionName, -CONFIG.trade.contract.relationCancel);
  removeContract(state, contract);
  addLog(
    state,
    `${withJosa(contract.factionName, '과/와')}의 정기거래(${contractLabel(contract)})를 중도 해지했습니다. ` +
      '약속을 먼저 깬 쪽이 되어 우호도가 떨어집니다.',
    'bad',
    true,
  );
}
