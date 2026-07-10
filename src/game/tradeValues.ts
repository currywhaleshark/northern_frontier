import { FACTIONS, RESOURCE_NAMES } from './constants';
import { RESOURCE_DEFS } from './resourceCatalog';
import { getRelation } from './relations';
import type { GameState, ResourceId, TradeQuote, TradeRequest } from './types';

const ABSTRACT_RESOURCES = new Set<ResourceId>(['reputation', 'defense']);

export function relationMargin(relation: number): number {
  if (relation >= 75) return 1;
  if (relation >= 60) return 1.1;
  if (relation >= 45) return 1.25;
  return 1.5;
}

export function factionValue(factionName: string, resource: ResourceId): number {
  const faction = FACTIONS.find(candidate => candidate.name === factionName);
  return faction?.tradeValues[resource] ?? RESOURCE_DEFS[resource].tradeBaseValue;
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

  const margin = relationMargin(getRelation(state, factionName));
  const giveUnitValue = factionValue(factionName, request.give);
  const getUnitValue = factionValue(factionName, request.get);
  if (!(giveUnitValue > 0) || !(getUnitValue > 0)) {
    return rejected(factionName, request, '거래 가치가 없는 물품입니다.', margin);
  }
  const getAmt = Math.floor((request.giveAmt * giveUnitValue) / (getUnitValue * margin));
  if (getAmt < 1) return rejected(factionName, request, '제시한 물품의 가치가 너무 낮습니다.', margin);
  return {
    ok: true, faction: factionName,
    give: request.give, giveAmt: request.giveAmt,
    get: request.get, getAmt, margin,
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
  return null;
}
