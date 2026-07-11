import { useEffect, useMemo, useState } from 'react';
import { CONFIG } from '../game/config';
import { FACTIONS, RANK_NAMES, RESOURCE_NAMES, SEASON_NAMES } from '../game/constants';
import { tradeNegotiationOf } from '../game/events';
import { getRelation } from '../game/relations';
import { FACTION_ARTWORK } from '../game/tradePresentation';
import {
  factionTradeCapacity, factionTradeCapacitySummary, factionValue, visitorTradeMultiplier,
} from '../game/tradeValues';
import { RESOURCE_DEFS, type ResourceCategory } from '../game/resourceCatalog';
import { getSeason } from '../game/seasons';
import type { GameState, ResourceId } from '../game/types';
import { FactionName } from './FactionName';
import { TradeResourceIcon } from './TradeResourceIcon';

interface Props {
  state: GameState;
  onNegotiate: (get: ResourceId, getAmt: number) => void;
  onChoose: (optionId: string) => void;
}

type TradeCategory = Exclude<ResourceCategory, 'abstract'>;

const TRADE_CATEGORY_ORDER: TradeCategory[] = ['food', 'fuel', 'material', 'clothing', 'military', 'luxury'];
const TRADE_CATEGORY_LABELS: Record<TradeCategory, string> = {
  food: '식량',
  fuel: '연료',
  material: '자재',
  clothing: '의복',
  military: '군수',
  luxury: '사치',
};

function tradeCategoryOf(resource: ResourceId): TradeCategory {
  return RESOURCE_DEFS[resource].category as TradeCategory;
}

function suggestedAmount(state: GameState, factionName: string, give: ResourceId | null, giveAmt: number, get: ResourceId): number {
  const capacity = factionTradeCapacity(state, factionName, get);
  if (!give || giveAmt <= 0) return 1;
  const getValue = factionValue(factionName, get);
  if (!(getValue > 0)) return 1;
  return Math.max(1, Math.min(capacity, Math.floor(
    (giveAmt * factionValue(factionName, give) * visitorTradeMultiplier(getRelation(state, factionName))) / getValue,
  )));
}

function AmountStepper({ value, max, onChange }: { value: number; max: number; onChange: (amount: number) => void }) {
  const set = (next: number) => onChange(Math.max(1, Math.min(max, Math.floor(next) || 1)));
  return (
    <div className="trade-amount-stepper">
      <button type="button" aria-label="수량 줄이기" onClick={() => set(value - 1)}>−</button>
      <input
        type="number"
        min={1}
        max={max}
        step={1}
        value={value}
        aria-label="받을 수량"
        onChange={event => set(Number(event.target.value))}
      />
      <button type="button" aria-label="수량 늘리기" onClick={() => set(value + 1)}>＋</button>
    </div>
  );
}

export function TradeDialog({ state, onNegotiate, onChoose }: Props) {
  const negotiation = tradeNegotiationOf(state.pendingChoice);
  const faction = FACTIONS.find(candidate => candidate.name === negotiation?.faction);
  const initialGet = negotiation?.get ?? faction?.exports[0] ?? 'grain';
  const [get, setGet] = useState<ResourceId>(initialGet);
  const [category, setCategory] = useState<TradeCategory>(() => tradeCategoryOf(initialGet));
  const [getAmt, setGetAmt] = useState(() => negotiation?.getAmt && negotiation.getAmt > 0
    ? negotiation.getAmt
    : negotiation && faction
      ? suggestedAmount(state, faction.name, negotiation.give, negotiation.giveAmt, initialGet)
      : 1);

  useEffect(() => {
    if (negotiation?.get) {
      setGet(negotiation.get);
      setCategory(tradeCategoryOf(negotiation.get));
    }
    if (negotiation?.getAmt && negotiation.getAmt > 0) setGetAmt(negotiation.getAmt);
  }, [negotiation?.get, negotiation?.getAmt]);

  const receiveValue = useMemo(() => faction ? getAmt * factionValue(faction.name, get) : 0, [faction, get, getAmt]);
  const availableCategories = useMemo(() => faction
    ? TRADE_CATEGORY_ORDER.filter(candidate => faction.exports.some(resource => tradeCategoryOf(resource) === candidate))
    : [], [faction]);
  const visibleExports = useMemo(() => faction
    ? faction.exports.filter(resource => tradeCategoryOf(resource) === category)
    : [], [faction, category]);
  const giveValue = negotiation?.give && faction
    ? negotiation.giveAmt * factionValue(faction.name, negotiation.give)
    : 0;

  if (!negotiation || !faction) return null;
  const isExtortion = negotiation.mode === 'extortion';
  const artwork = FACTION_ARTWORK[faction.name];
  const relation = getRelation(state, faction.name);
  const capacitySummary = factionTradeCapacitySummary(state, faction.name, get);
  const capacity = capacitySummary.remaining;
  const dockActive = state.buildings.some(building => building.built && building.type === 'dock');
  const canConfirm = isExtortion ? Boolean(negotiation.give) : negotiation.initiatedBy === 'player'
    ? negotiation.phase === 'countered'
    : negotiation.phase === 'accepted' || negotiation.phase === 'countered';
  const hasPayment = !negotiation.give || (state.resources[negotiation.give] ?? 0) >= negotiation.giveAmt;
  const actionLabel = negotiation.initiatedBy === 'player'
    ? negotiation.phase === 'countered' ? '조금 더 흥정한다' : '조건을 묻는다'
    : '이 조건을 제시한다';
  const valueMax = Math.max(1, giveValue, receiveValue);

  return (
    <div className="modal-overlay">
      <div className={`modal trade-dialog${isExtortion ? ' extortion-dialog' : ''}`}>
        {artwork && (
          <img
            className="trade-faction-art"
            src={artwork.src}
            alt={artwork.alt}
            style={{ objectPosition: artwork.position }}
          />
        )}
        <div className="trade-dialog-heading">
          <div>
            {isExtortion && <div className="trade-kind-label">무장 사절의 최후통첩</div>}
            <h2><FactionName name={faction.name} /></h2>
            <div className="muted small">{faction.desc}</div>
          </div>
          <div className="trade-relation" title="현재 관계도">
            <span>관계</span>
            <strong>{Math.round(relation)}</strong>
          </div>
        </div>

        <div className="trade-offer-grid">
          <section className="trade-offer-side">
            <div className="trade-side-label">{isExtortion ? '그들이 요구하는 것' : '우리가 내놓는 것'}</div>
            {negotiation.give ? (
              <div className="trade-locked-resource">
                <TradeResourceIcon resource={negotiation.give} size={58} />
                <div>
                  <strong>{RESOURCE_NAMES[negotiation.give]} {negotiation.giveAmt}</strong>
                  <div className={hasPayment ? 'muted small' : 'small trade-shortage'}>
                    현재 비축 {Math.floor(state.resources[negotiation.give] ?? 0)}
                  </div>
                </div>
              </div>
            ) : (
              <div className="trade-empty-offer">상대의 요구를 기다리는 중</div>
            )}
          </section>

          <div className="trade-exchange-mark" aria-hidden="true">{isExtortion ? '→' : '⇄'}</div>

          <section className="trade-offer-side trade-receive-side">
            <div className="trade-side-label">{isExtortion ? '그들이 약속한 것' : '우리가 받는 것'}</div>
            {isExtortion ? (
              <div className="trade-extortion-outcome">
                <strong>이번 습격 철회</strong>
                <div className="muted small">요구품을 넘기면 무리가 길을 돌립니다.</div>
              </div>
            ) : (
              <>
                <div className="trade-resource-tabs" role="tablist" aria-label="교역품 분류">
                  {availableCategories.map(candidate => (
                    <button
                      key={candidate}
                      type="button"
                      role="tab"
                      aria-selected={category === candidate}
                      className={category === candidate ? 'active' : ''}
                      onClick={() => {
                        setCategory(candidate);
                        const resource = faction.exports.find(item => tradeCategoryOf(item) === candidate);
                        if (resource) {
                          setGet(resource);
                          setGetAmt(suggestedAmount(state, faction.name, negotiation.give, negotiation.giveAmt, resource));
                        }
                      }}
                    >
                      {TRADE_CATEGORY_LABELS[candidate]}
                    </button>
                  ))}
                </div>
                <div className="trade-resource-picker" role="radiogroup" aria-label="받을 물품">
                  {visibleExports.map(resource => (
                    <button
                      key={resource}
                      type="button"
                      role="radio"
                      aria-checked={get === resource}
                      className={`trade-resource-choice${get === resource ? ' active' : ''}`}
                      title={RESOURCE_NAMES[resource]}
                      onClick={() => {
                        setGet(resource);
                        setGetAmt(suggestedAmount(state, faction.name, negotiation.give, negotiation.giveAmt, resource));
                      }}
                    >
                      <TradeResourceIcon resource={resource} />
                      <span>{RESOURCE_NAMES[resource]}</span>
                    </button>
                  ))}
                </div>
                <AmountStepper value={getAmt} max={Math.max(1, capacity)} onChange={setGetAmt} />
                <div className="trade-capacity">
                  <span>{SEASON_NAMES[getSeason(state.day)]} · {RANK_NAMES[state.rank]} 교역 한도</span>
                  <strong>잔여 {capacity} / 총 {capacitySummary.total}</strong>
                  {capacitySummary.used > 0 && <em>사용 {capacitySummary.used}</em>}
                  {dockActive && <em>부두 ×{CONFIG.trade.dockCapacityMult}</em>}
                </div>
              </>
            )}
          </section>
        </div>

        {negotiation.give && !isExtortion && (
          <div className="trade-value-compare">
            <div>
              <span>제공 가치 {giveValue.toFixed(1)}</span>
              <i style={{ width: `${(giveValue / valueMax) * 100}%` }} />
            </div>
            <div>
              <span>요청 가치 {receiveValue.toFixed(1)}</span>
              <i style={{ width: `${(receiveValue / valueMax) * 100}%` }} />
            </div>
          </div>
        )}

        <div className={`trade-response ${negotiation.phase}`}>
          <span>{isExtortion ? '최후통첩' : negotiation.initiatedBy === 'faction' ? '상대 반응' : '협상 상황'}</span>
          <strong>{negotiation.message}</strong>
        </div>

        <div className={`trade-dialog-actions${isExtortion ? ' extortion-actions' : ''}`}>
          {isExtortion ? (
            <>
              <button
                className="btn primary"
                type="button"
                disabled={!hasPayment}
                title={hasPayment ? '요구품을 넘기고 이번 습격을 피합니다' : '요구받은 물품이 부족합니다'}
                onClick={() => onChoose('pay')}
              >
                요구를 들어준다
              </button>
              <button className="btn trade-break" type="button" onClick={() => onChoose('refuse')}>
                거부하고 대비한다
              </button>
            </>
          ) : (
            <>
              <button
                className="btn primary"
                type="button"
                disabled={!canConfirm || !hasPayment}
                title={!hasPayment ? '요구받은 물품이 부족합니다' : canConfirm ? '현재 조건으로 교역을 마칩니다' : '먼저 협상 조건을 만드십시오'}
                onClick={() => onChoose('confirm')}
              >
                확정
              </button>
              <button
                className="btn"
                type="button"
                disabled={capacity <= 0}
                title={capacity <= 0 ? '이번 계절 물동량을 모두 사용했습니다' : undefined}
                onClick={() => onNegotiate(get, getAmt)}
              >
                {actionLabel}
              </button>
              <button className="btn trade-break" type="button" onClick={() => onChoose('break')}>결렬</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
