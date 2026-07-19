import { CONFIG } from './config';
import { FACTIONS, RESOURCE_NAMES, SEASON_NAMES } from './constants';
import { countBuilt } from './buildings';
import { RESOURCE_DEFS } from './resourceCatalog';
import { getRelation } from './relations';
import { getSeason } from './seasons';
import { hasActivePassageForFaction } from './passage';
import type { GameState, ResourceId, TradeEvaluation, TradeOffer, TradeQuote, TradeRequest } from './types';

const ABSTRACT_RESOURCES = new Set<ResourceId>(['reputation', 'defense']);

export function relationMargin(relation: number): number {
  if (relation >= 75) return 1;
  if (relation >= 60) return 1.1;
  if (relation >= 45) return 1.25;
  return 1.5;
}

// 은이 낀 거래는 마진이 크게 줄어든다 — 누구나 반기는 결제 수단이라 흥정이 짧다.
// 물물교환(마진 1회)보다 은 왕복(축소 마진 2회)이 근소하게 이득이 되는 수준으로 유지한다.
export function silverAdjustedMargin(margin: number, give: ResourceId, get: ResourceId): number {
  if (give !== 'silver' && get !== 'silver') return margin;
  return 1 + (margin - 1) * CONFIG.trade.silverMarginKeep;
}

export function factionValue(factionName: string, resource: ResourceId): number {
  const faction = FACTIONS.find(candidate => candidate.name === factionName);
  return faction?.tradeValues[resource] ?? RESOURCE_DEFS[resource].tradeBaseValue;
}

export interface FactionTradeCapacitySummary {
  total: number;
  used: number;
  remaining: number;
}

function tradeCapacitySeason(day: number): number {
  return Math.floor((Math.max(1, day) - 1) / CONFIG.time.seasonDays);
}

function factionTradeCapacityTotal(state: GameState, factionName: string, resource: ResourceId): number {
  const faction = FACTIONS.find(candidate => candidate.name === factionName);
  if (!faction?.exports.includes(resource)) return 0;
  const base = CONFIG.trade.capacityBase[resource] ?? 0;
  if (!(base > 0)) return 0;
  const seasonMult = CONFIG.trade.capacitySeasonMult[getSeason(state.day)][resource] ?? 1;
  const factionMult = (faction.tradeCapacityMult ?? 1) * (faction.tradeCapacityByResource?.[resource] ?? 1);
  const rankMult = CONFIG.trade.capacityRankMult[state.rank ?? 'settlement'];
  const dockMult = countBuilt(state, 'dock') > 0 ? CONFIG.trade.dockCapacityMult : 1;
  const passageMult = hasActivePassageForFaction(state, factionName)
    ? CONFIG.foreignSites.passageTradeCapacityMult
    : 1;
  return Math.max(1, Math.floor(base * seasonMult * factionMult * rankMult * dockMult * passageMult));
}

export function factionTradeCapacitySummary(
  state: GameState,
  factionName: string,
  resource: ResourceId,
): FactionTradeCapacitySummary {
  const total = factionTradeCapacityTotal(state, factionName, resource);
  const currentSeason = tradeCapacitySeason(state.day);
  const used = state.tradeCapacitySeason === currentSeason
    ? Math.max(0, state.tradeCapacityUsed?.[factionName]?.[resource] ?? 0)
    : 0;
  return { total, used, remaining: Math.max(0, total - used) };
}

export function factionTradeCapacity(state: GameState, factionName: string, resource: ResourceId): number {
  return factionTradeCapacitySummary(state, factionName, resource).remaining;
}

export function useFactionTradeCapacity(
  state: GameState,
  factionName: string,
  resource: ResourceId,
  amount: number,
): void {
  if (!(amount > 0)) return;
  const currentSeason = tradeCapacitySeason(state.day);
  if (state.tradeCapacitySeason !== currentSeason || !state.tradeCapacityUsed) {
    state.tradeCapacitySeason = currentSeason;
    state.tradeCapacityUsed = {};
  }
  const factionUsage = state.tradeCapacityUsed[factionName] ?? {};
  factionUsage[resource] = (factionUsage[resource] ?? 0) + amount;
  state.tradeCapacityUsed[factionName] = factionUsage;
}

export function resetFactionTradeCapacityUsage(state: GameState): void {
  state.tradeCapacitySeason = tradeCapacitySeason(state.day);
  state.tradeCapacityUsed = {};
}

function validTradeAmount(amount: number): boolean {
  return Number.isFinite(amount) && Number.isInteger(amount) && amount > 0;
}

function validatesFactionPair(factionName: string, give: ResourceId, get: ResourceId): string | null {
  const faction = FACTIONS.find(candidate => candidate.name === factionName);
  if (!faction) return '세력을 찾을 수 없습니다.';
  if (give === get) return '같은 물품끼리는 거래할 수 없습니다.';
  if (ABSTRACT_RESOURCES.has(give) || ABSTRACT_RESOURCES.has(get)) return '명성과 방어도는 교역할 수 없습니다.';
  if (!faction.imports.includes(give)) return `${faction.name}이(가) 받지 않는 물품입니다.`;
  if (!faction.exports.includes(get)) return `${faction.name}이(가) 내놓지 않는 물품입니다.`;
  return null;
}

function rejected(faction: string, request: TradeRequest, reason: string, margin = 1): TradeQuote {
  return {
    ok: false, reason, faction,
    give: request.give, giveAmt: request.giveAmt,
    get: request.get, getAmt: 0, margin,
  };
}

export function quoteTrade(state: GameState, factionName: string, request: TradeRequest): TradeQuote {
  const faction = FACTIONS.find(candidate => candidate.name === factionName);
  if (!faction) return rejected(factionName, request, '세력을 찾을 수 없습니다.');
  if (!Number.isFinite(request.giveAmt) || !Number.isInteger(request.giveAmt) || request.giveAmt <= 0) {
    return rejected(factionName, request, '내줄 수량은 1 이상의 정수여야 합니다.');
  }
  if (request.give === request.get) return rejected(factionName, request, '같은 물품끼리는 거래할 수 없습니다.');
  if (ABSTRACT_RESOURCES.has(request.give) || ABSTRACT_RESOURCES.has(request.get)) {
    return rejected(factionName, request, '명성과 방어도는 교역할 수 없습니다.');
  }
  if (!faction.imports.includes(request.give)) {
    return rejected(factionName, request, `${faction.name}이(가) 받지 않는 물품입니다.`);
  }
  if (!faction.exports.includes(request.get)) {
    return rejected(factionName, request, `${faction.name}이(가) 내놓지 않는 물품입니다.`);
  }
  if ((state.resources[request.give] ?? 0) < request.giveAmt) {
    return rejected(factionName, request, `${RESOURCE_NAMES[request.give]}이(가) 부족합니다.`);
  }

  const margin = silverAdjustedMargin(
    relationMargin(getRelation(state, factionName)), request.give, request.get,
  );
  const giveUnitValue = factionValue(factionName, request.give);
  const getUnitValue = factionValue(factionName, request.get);
  if (!(giveUnitValue > 0) || !(getUnitValue > 0)) {
    return rejected(factionName, request, '거래 가치가 없는 물품입니다.', margin);
  }
  const getAmt = Math.min(
    factionTradeCapacity(state, factionName, request.get),
    Math.floor((request.giveAmt * giveUnitValue) / (getUnitValue * margin)),
  );
  if (getAmt < 1) return rejected(factionName, request, '제시한 물품의 가치가 너무 낮습니다.', margin);
  return {
    ok: true, faction: factionName,
    give: request.give, giveAmt: request.giveAmt,
    get: request.get, getAmt, margin,
  };
}

// 플레이어가 받고 싶은 물품과 수량을 먼저 고르면, 상대가 가장 현실적으로 받을 수 있는 선호품을 고른다.
export function quoteFactionDemand(
  state: GameState,
  factionName: string,
  get: ResourceId,
  getAmt: number,
  margin = relationMargin(getRelation(state, factionName)),
): TradeQuote {
  const faction = FACTIONS.find(candidate => candidate.name === factionName);
  const fallbackGive = faction?.imports[0] ?? get;
  const rejectedDemand = (reason: string): TradeQuote => ({
    ok: false, reason, faction: factionName,
    give: fallbackGive, giveAmt: 0, get, getAmt, margin,
  });
  if (!faction) return rejectedDemand('세력을 찾을 수 없습니다.');
  if (!validTradeAmount(getAmt)) return rejectedDemand('받을 수량은 1 이상의 정수여야 합니다.');
  if (!faction.exports.includes(get) || ABSTRACT_RESOURCES.has(get)) {
    return rejectedDemand(`${faction.name}이(가) 내놓지 않는 물품입니다.`);
  }
  const capacity = factionTradeCapacity(state, factionName, get);
  if (getAmt > capacity) {
    return rejectedDemand(
      `${SEASON_NAMES[getSeason(state.day)]}에는 ${RESOURCE_NAMES[get]}을(를) ${capacity}까지만 내놓을 수 있습니다.`,
    );
  }
  const getUnitValue = factionValue(factionName, get);
  if (!(getUnitValue > 0)) return rejectedDemand('거래 가치가 없는 물품입니다.');

  const demands = faction.imports
    .filter(resource => !ABSTRACT_RESOURCES.has(resource) && resource !== get)
    .map(resource => {
      const unitValue = factionValue(factionName, resource);
      const effMargin = silverAdjustedMargin(margin, resource, get);
      const amount = unitValue > 0 ? Math.ceil((getAmt * getUnitValue * effMargin) / unitValue) : 0;
      const stock = state.resources[resource] ?? 0;
      return {
        resource,
        amount,
        affordable: amount > 0 && stock >= amount,
        coverage: amount > 0 ? stock / amount : 0,
      };
    })
    .filter(candidate => candidate.amount > 0)
    .sort((a, b) => Number(b.affordable) - Number(a.affordable) || b.coverage - a.coverage);
  const demand = demands[0];
  if (!demand) return rejectedDemand('상대가 원하는 교환품을 정하지 못했습니다.');
  return {
    ok: true, faction: factionName,
    give: demand.resource, giveAmt: demand.amount,
    get, getAmt, margin,
  };
}

export function visitorTradeMultiplier(relation: number): number {
  return CONFIG.trade.incomingOfferPremium / relationMargin(relation);
}

export function evaluateFactionProposal(
  state: GameState,
  factionName: string,
  offer: TradeOffer,
): TradeEvaluation {
  const invalidPair = validatesFactionPair(factionName, offer.give, offer.get);
  if (invalidPair || !validTradeAmount(offer.giveAmt) || !validTradeAmount(offer.getAmt)) {
    return {
      outcome: 'rejected', offer, maxGetAmt: 0,
      message: invalidPair ?? '수량은 1 이상의 정수여야 합니다.',
    };
  }
  const giveValue = offer.giveAmt * factionValue(factionName, offer.give);
  const getUnitValue = factionValue(factionName, offer.get);
  const capacity = factionTradeCapacity(state, factionName, offer.get);
  const valueLimit = Math.max(0, Math.floor(
    (giveValue * visitorTradeMultiplier(getRelation(state, factionName))) / getUnitValue,
  ));
  const maxGetAmt = Math.min(capacity, valueLimit);
  if (maxGetAmt < 1) {
    return { outcome: 'rejected', offer, maxGetAmt, message: '그 물품으로는 바꿀 만한 몫이 나오지 않는다고 합니다.' };
  }
  if (offer.getAmt <= maxGetAmt) {
    return { outcome: 'accepted', offer, maxGetAmt, message: '상대가 조건을 따져 본 뒤 고개를 끄덕입니다.' };
  }
  if (offer.getAmt <= Math.ceil(maxGetAmt * CONFIG.trade.counterTolerance)) {
    const counter = { ...offer, getAmt: maxGetAmt };
    return {
      outcome: 'countered', offer: counter, maxGetAmt,
      message: offer.getAmt > capacity
        ? `${RESOURCE_NAMES[offer.get]}은(는) 이번 철에 ${capacity}까지만 내놓을 수 있다고 합니다.`
        : `${RESOURCE_NAMES[offer.get]} ${maxGetAmt}이라면 거래하겠다고 역제안합니다.`,
    };
  }
  return {
    outcome: 'rejected', offer, maxGetAmt,
    message: offer.getAmt > capacity
      ? `${RESOURCE_NAMES[offer.get]}은(는) 이번 철 최대 ${capacity}까지만 교역할 수 있습니다.`
      : '요구가 지나치다며 제안을 거부했습니다. 수량을 낮춰 다시 협상할 수 있습니다.',
  };
}

export function applyQuotedTrade(state: GameState, quote: TradeQuote): string | null {
  if (!quote.ok) return quote.reason ?? '거래할 수 없습니다.';
  const current = quoteTrade(state, quote.faction, {
    give: quote.give, giveAmt: quote.giveAmt, get: quote.get,
  });
  if (!current.ok) return current.reason ?? '거래 조건을 다시 확인해야 합니다.';
  if (current.getAmt !== quote.getAmt || current.margin !== quote.margin) {
    return '관계나 시세가 달라졌습니다. 견적을 다시 확인하십시오.';
  }
  state.resources[quote.give] -= quote.giveAmt;
  state.resources[quote.get] += quote.getAmt;
  useFactionTradeCapacity(state, quote.faction, quote.get, quote.getAmt);
  return null;
}
