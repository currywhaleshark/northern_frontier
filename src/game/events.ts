// 이벤트 로그, 교역 제안, 잡보(분위기) 이벤트
import { CONFIG } from './config';
import { FACTIONS, FLAVOR_LOGS_CALM, FLAVOR_LOGS_TENSE, RESOURCE_NAMES } from './constants';
import { countBuilt } from './buildings';
import { changeRelation, getRelation } from './relations';
import type { GameState, LogEntry, PendingChoice, ResourceId, TradeOffer } from './types';

export function addLog(state: GameState, text: string, kind: LogEntry['kind'] = 'info'): void {
  state.log.push({ day: state.day, text, kind });
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

// 장터가 있으면 주기적으로 교역 제안이 온다.
// 교역 상대와 품목은 세력 정의(FACTIONS.trades)를 따른다 — 습격 성향이 있어도
// 교역품이 있는 세력(니마차 등)은 평시엔 장사꾼으로 온다.
export function maybeOfferTrade(state: GameState, rng: () => number, daysSinceTrade: number): boolean {
  if (countBuilt(state, 'market') === 0) return false;
  if (state.pendingChoice || state.battle) return false;
  if (daysSinceTrade < CONFIG.trade.minIntervalDays) return false;
  if (rng() >= CONFIG.trade.dailyChance) return false;

  // 관계가 좋은 세력일수록 장터에 자주 온다
  const traders = FACTIONS.filter(f => f.trades.length > 0);
  if (traders.length === 0) return false;
  const weights = traders.map(f => 20 + getRelation(state, f.name));
  let pick = rng() * weights.reduce((s, w) => s + w, 0);
  let faction = traders[traders.length - 1];
  for (let i = 0; i < traders.length; i++) {
    pick -= weights[i];
    if (pick <= 0) { faction = traders[i]; break; }
  }
  const tpl = scaledTradeOffer(state, faction.trades[Math.floor(rng() * faction.trades.length)]);
  const canGive = state.resources[tpl.give] >= tpl.giveAmt;

  const choice: PendingChoice = {
    kind: 'trade',
    title: `교역 제안 — ${faction.name}`,
    body: `${faction.name}이 장터에 찾아왔습니다.\n` +
      `${RESOURCE_NAMES[tpl.give]} ${tpl.giveAmt}을(를) ${RESOURCE_NAMES[tpl.get]} ${tpl.getAmt}과(와) 바꾸자고 제안합니다.`,
    options: [
      {
        id: 'accept', label: '교환한다',
        desc: `${RESOURCE_NAMES[tpl.give]} -${tpl.giveAmt}, ${RESOURCE_NAMES[tpl.get]} +${tpl.getAmt}, 명성 +2`,
        disabled: !canGive,
        disabledReason: canGive ? undefined : `${RESOURCE_NAMES[tpl.give]}이(가) 부족합니다`,
      },
      {
        id: 'decline', label: '거절한다',
        desc: '자원은 지키지만 명성이 조금 떨어지고, 한동안 습격 위협이 오릅니다.',
      },
    ],
    data: { ...tpl, faction: faction.name },
  };
  state.pendingChoice = choice;
  return true;
}

// 플레이어가 먼저 교역을 청할 수 있는지 — 불가하면 사유 문자열 (UI 버튼 비활성 사유와 공유)
export function canRequestTrade(state: GameState, factionName: string): string | null {
  const faction = FACTIONS.find(f => f.name === factionName);
  if (!faction || faction.trades.length === 0) return '교역 품목이 없는 세력입니다';
  if (countBuilt(state, 'market') === 0) return '장터가 필요합니다';
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

// 플레이어 주도 교역: 그 세력의 교환 목록 전체를 선택지 모달로 연다
export function requestTrade(state: GameState, factionName: string): string | null {
  const reason = canRequestTrade(state, factionName);
  if (reason) return reason;
  const faction = FACTIONS.find(f => f.name === factionName)!;
  const offers = faction.trades.map(t => scaledTradeOffer(state, t));

  const choice: PendingChoice = {
    kind: 'trade',
    title: `장터 교역 — ${faction.name}`,
    body: `${faction.name}에 먼저 사람을 보냈습니다.\n무엇을 바꾸시겠습니까?`,
    options: [
      ...offers.map((t, i) => ({
        id: `offer-${i}`,
        label: `${RESOURCE_NAMES[t.give]} ${t.giveAmt} ↔ ${RESOURCE_NAMES[t.get]} ${t.getAmt}`,
        desc: `${RESOURCE_NAMES[t.give]} -${t.giveAmt}, ${RESOURCE_NAMES[t.get]} +${t.getAmt}, 명성 +1`,
        disabled: state.resources[t.give] < t.giveAmt,
        disabledReason: `${RESOURCE_NAMES[t.give]}이(가) 부족합니다`,
      })),
      { id: 'cancel', label: '돌려보낸다', desc: '거래 없이 상단을 돌려보냅니다. 불이익은 없습니다.' },
    ],
    data: { faction: faction.name, initiated: true, offers },
  };
  state.pendingChoice = choice;
  return null;
}

// 플레이어가 먼저 청한 교역 처리 — 돌려보내기는 무벌칙.
// (명성 -1/위협 상승의 거절 벌칙은 상대가 찾아온 제안 전용이므로 절대 섞지 않는다)
function resolveInitiatedTrade(state: GameState, optionId: string): void {
  const c = state.pendingChoice!;
  const faction = c.data.faction as string;
  const offers = c.data.offers as TradeOffer[];
  const picked = /^offer-(\d+)$/.exec(optionId);
  const offer = picked ? offers[Number(picked[1])] : undefined;
  if (offer && state.resources[offer.give] >= offer.giveAmt) {
    state.resources[offer.give] -= offer.giveAmt;
    state.resources[offer.get] += offer.getAmt;
    // 먼저 아쉬운 소리를 한 쪽이므로 명성 보상은 제안 수락(+2)보다 작다
    state.resources.reputation = Math.min(100, state.resources.reputation + 1);
    state.lastTradeByFaction[faction] = state.day;
    changeRelation(state, faction, CONFIG.relations.tradeAccept);
    addLog(state, `장터에서 ${faction}과(와) ${RESOURCE_NAMES[offer.give]}을(를) ${RESOURCE_NAMES[offer.get]}(으)로 교환했습니다.`, 'trade');
  }
  state.pendingChoice = null;
}

export function resolveTrade(state: GameState, optionId: string): void {
  const c = state.pendingChoice;
  if (!c || c.kind !== 'trade') return;
  if (c.data.initiated) {
    resolveInitiatedTrade(state, optionId);
    return;
  }
  const d = c.data as unknown as TradeOffer & { faction: string };
  if (optionId === 'accept') {
    state.resources[d.give] = Math.max(0, state.resources[d.give] - d.giveAmt);
    state.resources[d.get] += d.getAmt;
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
