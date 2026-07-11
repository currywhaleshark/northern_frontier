// 이벤트 로그, 교역 제안, 잡보(분위기) 이벤트
import { CONFIG } from './config';
import { FACTIONS, FLAVOR_LOGS_CALM, FLAVOR_LOGS_TENSE, RESOURCE_NAMES } from './constants';
import { countBuilt } from './buildings';
import { changeRelation, getRelation } from './relations';
import {
  applyQuotedTrade, evaluateFactionProposal, factionTradeCapacity, factionValue, quoteFactionDemand, quoteTrade,
  relationMargin, useFactionTradeCapacity, visitorTradeMultiplier,
} from './tradeValues';
import { SPECIAL_ITEM_DEFS } from './specialItems';
import type {
  GameState, LogEntry, PendingChoice, ResourceId, SpecialItemId, TradeNegotiation, TradeOffer, TradeQuote,
} from './types';

export function addLog(
  state: GameState,
  text: string,
  kind: LogEntry['kind'] = 'info',
  important = kind === 'raid',
): void {
  const entry: LogEntry = { day: state.day, text, kind };
  if (important) entry.important = true;
  state.log.push(entry);
  if (state.log.length > CONFIG.ui.logLimit) {
    state.log.splice(0, state.log.length - CONFIG.ui.logLimit);
  }
}

export function playerTradeCooldownDays(state: GameState): number {
  return countBuilt(state, 'dock') > 0
    ? CONFIG.trade.dockPlayerCooldownDays
    : CONFIG.trade.playerCooldownDays;
}

export function scaledTradeOffer(state: GameState, offer: TradeOffer): TradeOffer {
  if (countBuilt(state, 'dock') === 0) return offer;
  const scale = CONFIG.trade.dockOfferScale;
  return {
    ...offer,
    giveAmt: Math.ceil(offer.giveAmt * scale),
    getAmt: Math.ceil(offer.getAmt * scale),
  };
}

function makeTradeChoice(negotiation: TradeNegotiation): PendingChoice {
  return {
    kind: 'trade',
    title: `교역 협상 — ${negotiation.faction}`,
    body: negotiation.message,
    options: [],
    data: { faction: negotiation.faction, negotiation },
  };
}

export function tradeNegotiationOf(choice: PendingChoice | null): TradeNegotiation | null {
  if (!choice || (choice.kind !== 'trade' && choice.kind !== 'extortion')) return null;
  const negotiation = choice.data.negotiation;
  return negotiation && typeof negotiation === 'object' ? negotiation as TradeNegotiation : null;
}

function updateTradeNegotiation(state: GameState, negotiation: TradeNegotiation): void {
  const choice = state.pendingChoice;
  if (!choice || choice.kind !== 'trade') return;
  choice.title = `교역 협상 — ${negotiation.faction}`;
  choice.body = negotiation.message;
  choice.data = { faction: negotiation.faction, negotiation };
}

export function factionTradeUnlockReason(state: GameState, factionName: string): string | null {
  const faction = FACTIONS.find(candidate => candidate.name === factionName);
  if (!faction?.tradeUnlockBuilding) return null;
  if (countBuilt(state, faction.tradeUnlockBuilding) > 0) return null;
  return faction.tradeUnlockLabel ?? `${faction.tradeUnlockBuilding} 건설 후 교역할 수 있습니다`;
}

function isForeignTradeFaction(factionName: string): boolean {
  return FACTIONS.find(candidate => candidate.name === factionName)?.foreignTrade !== false;
}

// 장터가 있으면 주기적으로 교역 제안이 온다.
// 교역 상대와 품목은 세력 정의(FACTIONS.trades)를 따른다 — 습격 성향이 있어도
// 교역품이 있는 세력(니마차 등)은 평시엔 장사꾼으로 온다.
export function maybeOfferTrade(state: GameState, rng: () => number, daysSinceTrade: number): boolean {
  if (countBuilt(state, 'market') === 0 && countBuilt(state, 'dock') === 0) return false;
  if (state.pendingChoice || state.battle) return false;
  if (daysSinceTrade < CONFIG.trade.minIntervalDays) return false;
  if (rng() >= CONFIG.trade.dailyChance) return false;

  // 관계가 좋은 세력일수록 장터에 자주 온다
  const traders = FACTIONS.filter(f => f.trades.length > 0 && !factionTradeUnlockReason(state, f.name));
  if (traders.length === 0) return false;
  const weights = traders.map(f => 20 + getRelation(state, f.name));
  let pick = rng() * weights.reduce((s, w) => s + w, 0);
  let faction = traders[traders.length - 1];
  for (let i = 0; i < traders.length; i++) {
    pick -= weights[i];
    if (pick <= 0) { faction = traders[i]; break; }
  }
  const tpl = scaledTradeOffer(state, faction.trades[Math.floor(rng() * faction.trades.length)]);
  state.pendingChoice = makeTradeChoice({
    faction: faction.name,
    initiatedBy: 'faction',
    phase: 'selecting',
    give: tpl.give,
    giveAmt: tpl.giveAmt,
    get: null,
    getAmt: 0,
    round: 0,
    margin: relationMargin(getRelation(state, faction.name)),
    message: `${faction.name} 상단이 ${RESOURCE_NAMES[tpl.give]} ${tpl.giveAmt}을(를) 구하러 왔습니다. 받을 물품과 수량을 제시하십시오.`,
  });
  return true;
}

// 플레이어가 먼저 교역을 청할 수 있는지 — 불가하면 사유 문자열 (UI 버튼 비활성 사유와 공유)
export function canRequestTrade(state: GameState, factionName: string): string | null {
  const faction = FACTIONS.find(f => f.name === factionName);
  if (!faction || faction.exports.length === 0 || faction.imports.length === 0) return '교역 품목이 없는 세력입니다';
  const unlockReason = factionTradeUnlockReason(state, factionName);
  if (unlockReason) return unlockReason;
  if (countBuilt(state, 'market') === 0 && countBuilt(state, 'dock') === 0) return '장터나 부두가 필요합니다';
  if (state.pendingChoice || state.battle) return '지금은 거래할 수 없습니다';
  if (getRelation(state, factionName) < CONFIG.trade.minRelationToTrade) {
    return '관계가 나빠 상대해 주지 않습니다';
  }
  const last = state.lastTradeByFaction[factionName];
  const cooldown = playerTradeCooldownDays(state);
  if (last != null && state.day - last < cooldown) {
    return `상단이 아직 돌아오지 않았습니다 (${cooldown - (state.day - last)}일 뒤)`;
  }
  return null;
}

// 플레이어가 먼저 찾아가는 교역 협상창을 연다.
export function requestTrade(state: GameState, factionName: string): string | null {
  const reason = canRequestTrade(state, factionName);
  if (reason) return reason;
  state.pendingChoice = makeTradeChoice({
    faction: factionName,
    initiatedBy: 'player',
    phase: 'selecting',
    give: null,
    giveAmt: 0,
    get: null,
    getAmt: 0,
    round: 0,
    margin: relationMargin(getRelation(state, factionName)),
    message: `${factionName}에 사람을 보냈습니다. 받고 싶은 물품과 수량을 고르면 상대가 요구 조건을 내놓습니다.`,
  });
  return null;
}

export function negotiateTrade(
  state: GameState,
  get: ResourceId,
  getAmt: number,
  specialItem?: SpecialItemId,
): string | null {
  const negotiation = tradeNegotiationOf(state.pendingChoice);
  if (!negotiation) return '진행 중인 교역 협상이 없습니다.';
  if (!Number.isFinite(getAmt) || !Number.isInteger(getAmt) || getAmt <= 0) {
    negotiation.phase = 'rejected';
    negotiation.message = '받을 수량은 1 이상의 정수여야 합니다.';
    updateTradeNegotiation(state, negotiation);
    return negotiation.message;
  }

  if (specialItem) {
    const faction = FACTIONS.find(candidate => candidate.name === negotiation.faction);
    const item = SPECIAL_ITEM_DEFS[specialItem];
    if (!faction || !item || (state.specialItems[specialItem] ?? 0) < 1) {
      negotiation.message = '제시할 기물이 없습니다.';
      updateTradeNegotiation(state, negotiation);
      return negotiation.message;
    }
    if (negotiation.mode === 'extortion' || !faction.exports.includes(get)) {
      negotiation.message = '이 거래에는 기물을 제시할 수 없습니다.';
      updateTradeNegotiation(state, negotiation);
      return negotiation.message;
    }
    const capacity = factionTradeCapacity(state, negotiation.faction, get);
    const getUnitValue = factionValue(negotiation.faction, get);
    const valueMultiplier = negotiation.initiatedBy === 'player'
      ? 1 / relationMargin(getRelation(state, negotiation.faction))
      : visitorTradeMultiplier(getRelation(state, negotiation.faction));
    const maxGetAmt = Math.min(capacity, Math.floor((item.tradeValue * valueMultiplier) / getUnitValue));
    negotiation.specialItem = specialItem;
    negotiation.get = get;
    negotiation.getAmt = Math.min(getAmt, Math.max(0, maxGetAmt));
    negotiation.maxAcceptGetAmt = maxGetAmt;
    negotiation.round += 1;
    if (maxGetAmt < 1) {
      negotiation.phase = 'rejected';
      negotiation.message = `${item.name}을(를) 내놓아도 받을 만한 몫이 나오지 않는다고 합니다.`;
    } else if (getAmt <= maxGetAmt) {
      negotiation.phase = 'accepted';
      negotiation.getAmt = getAmt;
      negotiation.message = `${item.name}을(를) 보자 상대가 바로 조건을 받아들입니다.`;
    } else if (getAmt <= Math.ceil(maxGetAmt * CONFIG.trade.counterTolerance)) {
      negotiation.phase = 'countered';
      negotiation.message = `${item.name} 한 점이라면 ${RESOURCE_NAMES[get]} ${maxGetAmt}까지 내놓겠다고 합니다.`;
    } else {
      negotiation.phase = 'rejected';
      negotiation.getAmt = getAmt;
      negotiation.message = getAmt > capacity
        ? `${RESOURCE_NAMES[get]}은(는) 이번 철 최대 ${capacity}까지만 교역할 수 있습니다.`
        : `${item.name} 한 점으로는 요구한 수량을 맞출 수 없습니다.`;
    }
    updateTradeNegotiation(state, negotiation);
    return negotiation.phase === 'rejected' ? negotiation.message : null;
  }

  negotiation.specialItem = null;

  if (negotiation.initiatedBy === 'player') {
    const sameTerms = negotiation.phase === 'countered' && negotiation.get === get && negotiation.getAmt === getAmt;
    const nextRound = sameTerms ? negotiation.round + 1 : 0;
    if (sameTerms && nextRound > CONFIG.trade.maxHaggleRounds) {
      negotiation.message = '상대가 이것이 마지막 조건이라며 더는 물러서지 않습니다.';
      updateTradeNegotiation(state, negotiation);
      return null;
    }
    const baseMargin = relationMargin(getRelation(state, negotiation.faction));
    const margin = Math.max(1, baseMargin - nextRound * CONFIG.trade.haggleMarginStep);
    const quote = quoteFactionDemand(state, negotiation.faction, get, getAmt, margin);
    if (!quote.ok) {
      negotiation.phase = 'rejected';
      negotiation.get = get;
      negotiation.getAmt = getAmt;
      negotiation.message = quote.reason ?? '상대가 조건을 만들지 못했습니다.';
      updateTradeNegotiation(state, negotiation);
      return negotiation.message;
    }
    const improved = sameTerms && quote.giveAmt < negotiation.giveAmt;
    negotiation.phase = 'countered';
    negotiation.give = quote.give;
    negotiation.giveAmt = quote.giveAmt;
    negotiation.get = quote.get;
    negotiation.getAmt = quote.getAmt;
    negotiation.round = nextRound;
    negotiation.margin = quote.margin;
    negotiation.message = improved
      ? `${factionNameFor(negotiation)}이 조금 양보해 ${RESOURCE_NAMES[quote.give]} ${quote.giveAmt}을(를) 요구합니다.`
      : `${factionNameFor(negotiation)}은(는) ${RESOURCE_NAMES[quote.give]} ${quote.giveAmt}을(를) 내놓으라고 요구합니다.`;
    updateTradeNegotiation(state, negotiation);
    return null;
  }

  if (!negotiation.give || negotiation.giveAmt <= 0) return '상대의 요구품이 정해지지 않았습니다.';
  const evaluation = evaluateFactionProposal(state, negotiation.faction, {
    give: negotiation.give,
    giveAmt: negotiation.giveAmt,
    get,
    getAmt,
  });
  negotiation.phase = evaluation.outcome;
  negotiation.get = evaluation.offer.get;
  negotiation.getAmt = evaluation.offer.getAmt;
  negotiation.maxAcceptGetAmt = evaluation.maxGetAmt;
  negotiation.round += 1;
  negotiation.message = evaluation.message;
  updateTradeNegotiation(state, negotiation);
  return evaluation.outcome === 'rejected' ? evaluation.message : null;
}

function factionNameFor(negotiation: TradeNegotiation): string {
  return negotiation.faction;
}

// 플레이어가 먼저 청한 교역 처리 — 돌려보내기는 무벌칙.
// (명성 -1/위협 상승의 거절 벌칙은 상대가 찾아온 제안 전용이므로 절대 섞지 않는다)
function resolveInitiatedTrade(state: GameState, optionId: string): void {
  const c = state.pendingChoice!;
  const faction = c.data.faction as string;
  const quote = c.data.quote as TradeQuote;
  if (optionId === 'accept-quote') {
    const error = applyQuotedTrade(state, quote);
    if (error) {
      addLog(state, error, 'bad');
      state.pendingChoice = null;
      return;
    }
    // 먼저 아쉬운 소리를 한 쪽이므로 명성 보상은 제안 수락(+2)보다 작다
    state.resources.reputation = Math.min(100, state.resources.reputation + 1);
    state.lastTradeByFaction[faction] = state.day;
    // 먼저 사람을 보낸 거래는 조정의 눈에 밀무역으로 비친다 (모반 의심 계산용)
    if (isForeignTradeFaction(faction)) {
      state.initiatedTradeDays = [...(state.initiatedTradeDays ?? []), state.day].slice(-20);
    }
    changeRelation(state, faction, CONFIG.relations.tradeAccept);
    addLog(state, `장터에서 ${faction}과(와) ${RESOURCE_NAMES[quote.give]}을(를) ${RESOURCE_NAMES[quote.get]}(으)로 교환했습니다.`, 'trade');
  }
  state.pendingChoice = null;
}

export function resolveTrade(state: GameState, optionId: string): void {
  const c = state.pendingChoice;
  if (!c || c.kind !== 'trade') return;
  const negotiation = tradeNegotiationOf(c);
  if (negotiation) {
    if (optionId === 'confirm') {
      const canConfirm = negotiation.initiatedBy === 'player'
        ? negotiation.phase === 'accepted' || negotiation.phase === 'countered'
        : negotiation.phase === 'accepted' || negotiation.phase === 'countered';
      const specialItem = negotiation.specialItem ?? null;
      if (!canConfirm || (!specialItem && (!negotiation.give || negotiation.giveAmt <= 0)) ||
          !negotiation.get || negotiation.getAmt <= 0) {
        negotiation.message = '먼저 양쪽 조건을 확정해야 합니다.';
        updateTradeNegotiation(state, negotiation);
        return;
      }
      if (specialItem && (state.specialItems[specialItem] ?? 0) < 1) {
        negotiation.message = `${SPECIAL_ITEM_DEFS[specialItem].name}이(가) 기물함에 없습니다.`;
        updateTradeNegotiation(state, negotiation);
        return;
      }
      if (!specialItem && negotiation.give && (state.resources[negotiation.give] ?? 0) < negotiation.giveAmt) {
        negotiation.message = `${RESOURCE_NAMES[negotiation.give]}이(가) 부족해 거래를 확정할 수 없습니다.`;
        updateTradeNegotiation(state, negotiation);
        return;
      }
      if (specialItem) state.specialItems[specialItem] -= 1;
      else if (negotiation.give) state.resources[negotiation.give] -= negotiation.giveAmt;
      state.resources[negotiation.get] += negotiation.getAmt;
      useFactionTradeCapacity(state, negotiation.faction, negotiation.get, negotiation.getAmt);
      state.resources.reputation = Math.min(100, state.resources.reputation + (negotiation.initiatedBy === 'player' ? 1 : 2));
      changeRelation(state, negotiation.faction, CONFIG.relations.tradeAccept);
      if (negotiation.initiatedBy === 'player') {
        state.lastTradeByFaction[negotiation.faction] = state.day;
        if (isForeignTradeFaction(negotiation.faction)) {
          state.initiatedTradeDays = [...(state.initiatedTradeDays ?? []), state.day].slice(-20);
        }
      }
      addLog(
        state,
        `${negotiation.faction}과(와) ${specialItem ? `${SPECIAL_ITEM_DEFS[specialItem].name} 1` : `${RESOURCE_NAMES[negotiation.give!]} ${negotiation.giveAmt}`}을(를) ` +
          `${RESOURCE_NAMES[negotiation.get]} ${negotiation.getAmt}(으)로 교환했습니다.`,
        'trade',
      );
      state.pendingChoice = null;
      return;
    }
    if (optionId === 'break') {
      if (negotiation.initiatedBy === 'faction') {
        state.resources.reputation = Math.max(0, state.resources.reputation - 1);
        state.tradeRefusedDays = 10;
        changeRelation(state, negotiation.faction, CONFIG.relations.tradeDecline);
        addLog(state, `${negotiation.faction}과(와)의 교역 협상이 결렬됐습니다. 국경의 공기가 서늘해집니다.`, 'trade');
      } else {
        addLog(state, `${negotiation.faction}에 보낸 교역 사절을 거두었습니다.`, 'info');
      }
      state.pendingChoice = null;
      return;
    }
    return;
  }
  if (c.data.initiated) {
    resolveInitiatedTrade(state, optionId);
    return;
  }
  const d = c.data as unknown as TradeOffer & { faction: string };
  if (optionId === 'accept') {
    state.resources[d.give] = Math.max(0, state.resources[d.give] - d.giveAmt);
    state.resources[d.get] += d.getAmt;
    useFactionTradeCapacity(state, d.faction, d.get, d.getAmt);
    state.resources.reputation = Math.min(100, state.resources.reputation + 2);
    changeRelation(state, d.faction, CONFIG.relations.tradeAccept);
    addLog(state, `장터에서 ${d.faction}과(와) ${RESOURCE_NAMES[d.give]}을(를) ${RESOURCE_NAMES[d.get]}(으)로 교환했습니다.`, 'trade');
  } else {
    state.resources.reputation = Math.max(0, state.resources.reputation - 1);
    state.tradeRefusedDays = 10;
    changeRelation(state, d.faction, CONFIG.relations.tradeDecline);
    addLog(state, `${d.faction}의 교역 제안을 거절했습니다. 국경의 공기가 서늘해집니다.`, 'trade');
  }
  state.pendingChoice = null;
}

// 분위기용 잡보 — 위협도가 높으면 불길한 소식이 늘어난다
export function maybeFlavorLog(state: GameState, rng: () => number): void {
  if (rng() > 0.08) return;
  const tense = state.threat > 45;
  const pool = tense ? FLAVOR_LOGS_TENSE : FLAVOR_LOGS_CALM;
  addLog(state, pool[Math.floor(rng() * pool.length)], tense ? 'raid' : 'info');
}
