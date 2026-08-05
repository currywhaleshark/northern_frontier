import { withJosa } from './josa';
import { addLog, tradeNegotiationOf } from './events';
import { predatorExpeditionTarget } from './expedition';
import { isForeignSiteOperational } from './foreignSites';
import { changeRelation, getRelation } from './relations';
import type { GameState, PredatorKind } from './types';

interface PredatorIntelOffer {
  kind: PredatorKind;
  label: string;
  precision: 'rough' | 'exact';
  priceResource: 'grain';
  priceAmount: number;
  siteName: string;
  distance: number;
}

function predatorLabel(kind: PredatorKind): string {
  return kind === 'wolf' ? '늑대 떼 흔적 정보' : '호랑이 행적 정보';
}

function informationPrice(relation: number): number {
  return Math.max(4, Math.min(40, Math.ceil(10 * 2 ** ((60 - relation) / 20))));
}

export function predatorIntelOffers(state: GameState, factionName: string): PredatorIntelOffer[] {
  const relation = getRelation(state, factionName);
  const precision: PredatorIntelOffer['precision'] = relation >= 50 ? 'exact' : 'rough';
  const priceAmount = informationPrice(relation);
  const offers: PredatorIntelOffer[] = [];

  for (const kind of ['wolf', 'tiger'] as const) {
    const threat = state.incidents.predatorThreats[kind];
    const target = predatorExpeditionTarget(state, kind);
    if (!threat || !target || threat.intel?.precision === 'exact') continue;
    if (threat.intel?.precision === precision) continue;

    const nearby = state.foreignSites
      .filter(site => site.discovered && site.factionName === factionName && isForeignSiteOperational(site) &&
        (site.type === 'village' || site.type === 'fishingVillage' || site.type === 'seasonalCamp'))
      .map(site => ({
        site,
        distance: Math.abs(site.x + site.width / 2 - target.x) + Math.abs(site.y + site.height / 2 - target.y),
      }))
      .filter(entry => entry.distance <= Math.max(14, entry.site.influenceRadius + 8))
      .sort((a, b) => a.distance - b.distance || a.site.id - b.site.id)[0];
    if (!nearby) continue;

    offers.push({
      kind,
      label: predatorLabel(kind),
      precision,
      priceResource: 'grain',
      priceAmount,
      siteName: nearby.site.name,
      distance: Math.round(nearby.distance),
    });
  }
  return offers;
}

export function purchasePredatorIntel(
  state: GameState,
  factionName: string,
  kind: PredatorKind,
): string | null {
  const offer = predatorIntelOffers(state, factionName).find(candidate => candidate.kind === kind);
  if (!offer) return '지금 이 세력에게서 살 수 있는 맹수 정보가 없습니다.';
  if (state.resources[offer.priceResource] < offer.priceAmount) {
    return `곡식이 부족합니다. 정보값으로 ${withJosa(offer.priceAmount, '이/가')} 필요합니다.`;
  }
  const threat = state.incidents.predatorThreats[kind];
  if (!threat) return '그사이 맹수의 흔적이 사라졌습니다.';

  state.resources[offer.priceResource] -= offer.priceAmount;
  const scouting = threat.scouting;
  if (scouting) {
    const hunter = state.residents.find(resident => resident.id === scouting.residentId && resident.alive);
    if (hunter) hunter.task = '흔적 추적 중지 후 귀환';
    delete threat.scouting;
  }
  threat.intel = {
    precision: offer.precision,
    revealedDay: state.day,
    source: 'trade',
    sourceFaction: factionName,
  };
  changeRelation(state, factionName, 1);
  const negotiation = tradeNegotiationOf(state.pendingChoice);
  if (negotiation) {
    negotiation.message = `${offer.siteName}의 사냥꾼들이 ${withJosa(offer.label, '을/를')} 넘겼습니다. ` +
      `규모를 ${offer.precision === 'exact' ? '정확히' : '대략'} 파악했습니다.`;
    if (state.pendingChoice) state.pendingChoice.body = negotiation.message;
  }
  addLog(
    state,
    `${factionName}에게 곡식 ${withJosa(offer.priceAmount, '을/를')} 주고 ${withJosa(offer.label, '을/를')} 샀습니다. ` +
      `적 규모를 ${offer.precision === 'exact' ? '정확히' : '대략'} 파악했습니다.`,
    'trade',
    true,
  );
  return null;
}
