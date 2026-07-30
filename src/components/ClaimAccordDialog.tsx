import { useEffect, useMemo, useState } from 'react';
import { claimAccordLabel, claimAccordPreview, eligibleClaimAccordResources } from '../game/diplomacy';
import { factionLeaderFor, factionLeaderTemperLabel } from '../game/diplomaticFigures';
import { RESOURCE_NAMES } from '../game/constants';
import type { GameState, ResourceId } from '../game/types';

interface Props {
  state: GameState;
  onSend: (resource: ResourceId, amount: number) => void;
  onClose: () => void;
}

export function ClaimAccordDialog({ state, onSend, onClose }: Props) {
  const factionName = state.pendingChoice?.kind === 'claimAccordEnvoy'
    ? state.pendingChoice.data.factionName as string
    : '';
  const zoneId = state.pendingChoice?.kind === 'claimAccordEnvoy'
    ? state.pendingChoice.data.zoneId as number
    : -1;
  const zone = state.claimZones.find(candidate => candidate.id === zoneId);
  const leader = factionLeaderFor(state, factionName);
  const resources = useMemo(() => eligibleClaimAccordResources(state, factionName), [state.resources, factionName]);
  const [resource, setResource] = useState<ResourceId>(() => resources[0] ?? 'silver');
  const stock = Math.max(0, Math.floor(state.resources[resource] ?? 0));
  const [amount, setAmount] = useState(1);

  useEffect(() => {
    if (!resources.includes(resource)) setResource(resources[0] ?? 'silver');
  }, [resource, resources]);
  useEffect(() => {
    setAmount(current => Math.max(1, Math.min(stock || 1, Math.floor(current) || 1)));
  }, [stock]);

  const preview = claimAccordPreview(state, factionName, zoneId, resource, amount);
  const blocked = !leader || !zone || stock < 1 || !preview.meetsValue;
  const blockedReason = !leader ? '협정을 받을 지도자를 찾을 수 없습니다'
    : !zone ? '생활권을 찾을 수 없습니다'
      : stock < 1 ? '동봉할 은이나 물자가 없습니다'
        : !preview.meetsValue ? `제안 가치 ${preview.requiredValue} 이상이 필요합니다`
          : undefined;
  const setSafeAmount = (next: number) => setAmount(Math.max(1, Math.min(stock || 1, Math.floor(next) || 1)));

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal gift-envoy-dialog" onClick={event => event.stopPropagation()}>
        <h2>{leader ? `${leader.name} ${leader.title}에게 생활권 협정` : '생활권 협정 사절'}</h2>
        <div className="body">
          {leader && <p className="gift-envoy-leader"><b>{factionName}</b> · {factionLeaderTemperLabel(leader.temper)}한 지도자</p>}
          <p>{zone ? `${claimAccordLabel(zone)}의 채집·작업 권리를 1년간 청합니다. 은 또는 그들이 받는 물자를 고르면 사절은 여섯 날 뒤 답신을 들고 돌아옵니다.` : '생활권 정보를 확인하고 있습니다.'}</p>
          <div className="gift-resource-picker" aria-label="협정 대가 품목">
            {resources.map(candidate => (
              <button key={candidate} type="button" className={candidate === resource ? 'active' : ''} onClick={() => setResource(candidate)}>
                <span>{RESOURCE_NAMES[candidate]}</span><small>보유 {Math.floor(state.resources[candidate] ?? 0)}</small>
              </button>
            ))}
          </div>
          <div className="gift-envoy-amount">
            <span>보낼 수량</span>
            <div className="trade-amount-stepper">
              <button type="button" aria-label="협정 대가 수량 줄이기" onClick={() => setSafeAmount(amount - 1)}>−</button>
              <input type="number" min={1} max={stock} step={1} value={amount} aria-label="협정 대가 수량" onChange={event => setSafeAmount(Number(event.target.value))} />
              <button type="button" aria-label="협정 대가 수량 늘리기" onClick={() => setSafeAmount(amount + 1)}>＋</button>
            </div>
          </div>
          <div className="gift-envoy-preview"><span>제안 가치 {preview.value.toFixed(1)} / 필요 {preview.requiredValue}</span><strong>1년간 채집·작업 권리</strong></div>
          {!preview.meetsValue && <p className="gift-envoy-repeat">제안 가치가 {preview.requiredValue}에 못 미칩니다.</p>}
        </div>
        <div className="modal-actions">
          <button className="btn primary" disabled={blocked} title={blocked ? blockedReason : undefined} onClick={() => onSend(resource, amount)}>협정을 청한다</button>
          <button className="btn" onClick={onClose}>그만둔다</button>
        </div>
      </div>
    </div>
  );
}
