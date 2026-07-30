import { useEffect, useMemo, useState } from 'react';
import { CONFIG } from '../game/config';
import { factionLeaderFor, factionLeaderTemperLabel } from '../game/diplomaticFigures';
import { eligibleGiftResources, giftPreview, pactPreview } from '../game/diplomacy';
import { RESOURCE_NAMES } from '../game/constants';
import type { GameState, ResourceId } from '../game/types';

interface Props {
  state: GameState;
  onSend: (resource: ResourceId, amount: number) => void;
  onClose: () => void;
}

export function GiftEnvoyDialog({ state, onSend, onClose }: Props) {
  const pactMode = state.pendingChoice?.kind === 'pactEnvoy';
  const factionName = state.pendingChoice?.kind === 'giftEnvoy' || state.pendingChoice?.kind === 'pactEnvoy'
    ? state.pendingChoice.data.factionName as string
    : '';
  const resources = useMemo(() => eligibleGiftResources(state), [state.resources]);
  const [resource, setResource] = useState<ResourceId>(() => resources[0] ?? 'silk');
  const stock = Math.max(0, Math.floor(state.resources[resource] ?? 0));
  const [amount, setAmount] = useState(1);
  const leader = factionLeaderFor(state, factionName);

  useEffect(() => {
    if (!resources.includes(resource)) setResource(resources[0] ?? 'silk');
  }, [resource, resources]);

  useEffect(() => {
    setAmount(current => Math.max(1, Math.min(stock || 1, Math.floor(current) || 1)));
  }, [stock]);

  const gift = giftPreview(state, factionName, resource, amount);
  const pact = pactPreview(state, factionName, resource, amount);
  const blocked = !leader || stock < 1 || (pactMode && !pact.meetsGiftValue);
  const blockedReason = !leader ? '맹약을 받을 지도자를 찾을 수 없습니다'
    : stock < 1 ? '보낼 예물이 없습니다'
      : pactMode && !pact.meetsGiftValue ? `예물 가치 ${CONFIG.diplomacy.pactGiftValueMin} 이상이 필요합니다`
        : undefined;
  const setSafeAmount = (next: number) => setAmount(Math.max(1, Math.min(stock || 1, Math.floor(next) || 1)));

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal gift-envoy-dialog" onClick={event => event.stopPropagation()}>
        <h2>{leader ? `${leader.name} ${leader.title}에게 ${pactMode ? '화친 맹약' : '예물'}` : pactMode ? '화친 맹약 사절' : '예물 사절'}</h2>
        <div className="body">
          {leader && (
            <p className="gift-envoy-leader">
              <b>{factionName}</b> · {factionLeaderTemperLabel(leader.temper)}한 지도자
            </p>
          )}
          <p>
            {pactMode
              ? `사치품과 은 중 가치 ${CONFIG.diplomacy.pactGiftValueMin} 이상의 예물을 동봉해야 합니다. 사절은 ${CONFIG.diplomacy.envoyTravelDays}일 뒤 답신을 들고 돌아옵니다.`
              : `사치품과 은만 예물로 보낼 수 있습니다. 사절은 ${CONFIG.diplomacy.envoyTravelDays}일 뒤 답신을 들고 돌아옵니다.`}
          </p>
          <div className="gift-resource-picker" aria-label="예물 품목">
            {resources.map(candidate => (
              <button
                key={candidate}
                type="button"
                className={candidate === resource ? 'active' : ''}
                onClick={() => setResource(candidate)}
              >
                <span>{RESOURCE_NAMES[candidate]}</span>
                <small>보유 {Math.floor(state.resources[candidate] ?? 0)}</small>
              </button>
            ))}
          </div>
          <div className="gift-envoy-amount">
            <span>보낼 수량</span>
            <div className="trade-amount-stepper">
              <button type="button" aria-label="예물 수량 줄이기" onClick={() => setSafeAmount(amount - 1)}>−</button>
              <input
                type="number"
                min={1}
                max={stock}
                step={1}
                value={amount}
                aria-label="예물 수량"
                onChange={event => setSafeAmount(Number(event.target.value))}
              />
              <button type="button" aria-label="예물 수량 늘리기" onClick={() => setSafeAmount(amount + 1)}>＋</button>
            </div>
          </div>
          <div className="gift-envoy-preview">
            <span>예물 가치 {(pactMode ? pact.value : gift.value).toFixed(1)}</span>
            {pactMode ? (
              <>
                <strong>{pact.years}년간 불가침</strong>
                <span>체결 시 모반 의심 +{pact.suspicion}</span>
              </>
            ) : (
              <>
                <strong>관계 +{gift.relationGain}</strong>
                <span>모반 의심 +{gift.suspicion}</span>
              </>
            )}
          </div>
          {pactMode && !pact.meetsGiftValue && (
            <p className="gift-envoy-repeat">예물 가치가 {CONFIG.diplomacy.pactGiftValueMin}에 못 미칩니다.</p>
          )}
          {!pactMode && gift.repeatedThisYear && <p className="gift-envoy-repeat">같은 해의 두 번째 예물이라 관계 상승폭이 절반입니다.</p>}
        </div>
        <div className="modal-actions">
          <button className="btn primary" disabled={blocked} title={blocked ? blockedReason : undefined} onClick={() => onSend(resource, amount)}>
            {pactMode ? '맹약을 청한다' : '사절을 보낸다'}
          </button>
          <button className="btn" onClick={onClose}>그만둔다</button>
        </div>
      </div>
    </div>
  );
}
