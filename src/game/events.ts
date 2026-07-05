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

// 장터가 있으면 주기적으로 교역 제안이 온다.
// 교역 상대와 품목은 세력 정의(FACTIONS.trades)를 따른다 — 습격 성향이 있어도
// 교역품이 있는 세력(니마차 등)은 평시엔 장사꾼으로 온다.
export function maybeOfferTrade(state: GameState, rng: () => number, daysSinceTrade: number): boolean {
  if (countBuilt(state, 'market') === 0) return false;
  if (state.pendingChoice) return false;
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
  const tpl = faction.trades[Math.floor(rng() * faction.trades.length)];
  const canGive = state.resources[tpl.give] >= tpl.giveAmt;

  const choice: PendingChoice = {
    kind: 'trade',
    title: `교역 제안 — ${faction.name}`,
    body: `${faction.name}(${faction.desc})이 장터에 찾아왔습니다.\n` +
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

export function resolveTrade(state: GameState, optionId: string): void {
  const c = state.pendingChoice;
  if (!c || c.kind !== 'trade') return;
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
