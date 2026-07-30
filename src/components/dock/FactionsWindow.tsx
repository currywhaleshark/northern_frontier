import { withJosa } from '../../game/josa';
import { FACTIONS, RESOURCE_NAMES, SEASON_NAMES } from '../../game/constants';
import { canRequestTrade, factionTradeUnlockReason } from '../../game/events';
import { getRelation } from '../../game/relations';
import { FACTION_ARTWORK } from '../../game/tradePresentation';
import { contractsForFaction, nextContractDueDay } from '../../game/tradeContracts';
import { contractReserved } from '../../game/tradeContractReserve';
import {
  factionLeaderFor, factionLeaderTemperLabel,
} from '../../game/diplomaticFigures';
import { canOpenGiftEnvoy, giftEnvoyRemainingDays } from '../../game/diplomacy';
import type { GameState, TradeContract } from '../../game/types';
import { FactionName } from '../FactionName';
import { UiIcon } from '../UiIcon';

interface Props {
  state: GameState;
  onRequestTrade: (factionName: string) => void;
  onOpenGiftEnvoy: (factionName: string) => void;
  onCancelTradeContract: (contract: TradeContract) => void;
}

function RelationBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="bar-outer">
      <div className="bar-inner" style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: color }} />
    </div>
  );
}

// 세력별 활성 계약 — 품목·교환비·연차·다음 실행·계약고 충당률·해지
function ContractList({ state, factionName, onCancel }: {
  state: GameState;
  factionName: string;
  onCancel: (contract: TradeContract) => void;
}) {
  const contracts = contractsForFaction(state, factionName);
  if (contracts.length === 0) return null;
  return (
    <div className="faction-contracts">
      {contracts.map(contract => {
        const due = nextContractDueDay(state, contract);
        const covered = contractReserved(state, contract.give) + Math.max(0, state.resources[contract.give] ?? 0);
        const ratio = contract.giveAmt > 0 ? Math.min(1, covered / contract.giveAmt) : 1;
        const ready = ratio >= 1;
        return (
          <div key={`${contract.give}-${contract.get}`} className="faction-contract-row">
            <div className="faction-contract-terms">
              <strong>
                {RESOURCE_NAMES[contract.give]} {contract.giveAmt} → {RESOURCE_NAMES[contract.get]} {contract.getAmt}
              </strong>
              <span className="muted small">
                {contract.yearsExecuted}/{contract.durationYears}년차 · {SEASON_NAMES[contract.executeSeason]}마다
                {due != null && ` · ${Math.max(0, due - state.day)}일 뒤`}
                {contract.missedStreak > 0 && ` · 불이행 ${contract.missedStreak}회`}
              </span>
              <span className="small" style={{ color: ready ? '#6fbf73' : '#e06c5c' }}>
                다음 몫 충당 {Math.round(ratio * 100)}%
              </span>
            </div>
            <button
              className="btn small faction-contract-cancel"
              type="button"
              title="계약을 중도 해지합니다. 약속을 먼저 깬 쪽이 되어 우호도가 떨어집니다"
              onClick={() => onCancel(contract)}
            >
              해지
            </button>
          </div>
        );
      })}
    </div>
  );
}

export function FactionsWindow({ state, onRequestTrade, onOpenGiftEnvoy, onCancelTradeContract }: Props) {
  return (
    <div>
      <div className="muted small" style={{ marginBottom: 6 }}>
        교역·공물·협상은 관계를 데우고, 거절과 전투는 식힙니다. 홀라온과 마적은 습격 전에 대가를 요구할 수 있습니다.
      </div>
      {FACTIONS.filter(faction => !factionTradeUnlockReason(state, faction.name)).map(faction => {
        const relation = getRelation(state, faction.name);
        const color = relation >= 60 ? '#6fbf73' : relation >= 40 ? '#d9a441' : '#e06c5c';
        const artwork = FACTION_ARTWORK[faction.name];
        const tradeReason = faction.exports.length > 0 ? canRequestTrade(state, faction.name) : null;
        const leader = factionLeaderFor(state, faction.name);
        const giftReason = leader ? canOpenGiftEnvoy(state, faction.name) : null;
        const giftRemainingDays = leader ? giftEnvoyRemainingDays(state, faction.name) : null;
        return (
          <div key={faction.name} className="faction-entry" title={faction.desc}>
            {artwork && (
              <img
                className="faction-entry-art"
                src={artwork.src}
                alt={artwork.alt}
                loading="lazy"
                style={{ objectPosition: artwork.position }}
              />
            )}
            <div className="faction-entry-body">
              <div className="faction-entry-heading">
                <span><UiIcon name={faction.hostile ? 'hostile' : 'friendly'} size={20} /> <FactionName name={faction.name} /></span>
                <span className="faction-relation" style={{ color }}>{Math.round(relation)}</span>
              </div>
              {leader && (
                <div className="faction-leader-line">
                  <strong>{leader.name} {leader.title}</strong>
                  <span>{factionLeaderTemperLabel(leader.temper)}</span>
                </div>
              )}
              <RelationBar value={relation} color={color} />
              <div className="faction-entry-actions">
                <div className="faction-info">
                  <button
                    className="faction-trade-toggle"
                    type="button"
                    aria-label={`${faction.name} 정보와 교역품`}
                  >
                    ⓘ
                  </button>
                  <div className="faction-trade-detail-body" role="tooltip">
                    <div>{faction.desc}</div>
                    <div>
                      {faction.exports.length > 0
                        ? '내놓음: ' + faction.exports.map(resource => RESOURCE_NAMES[resource]).join(', ')
                        : faction.extortionDemands?.length
                          ? '선제 요구: ' + faction.extortionDemands.map(demand => RESOURCE_NAMES[demand.resource]).join(', ')
                          : '교역하지 않음'}
                    </div>
                    {faction.imports.length > 0 && (
                      <div>원함: {faction.imports.map(resource => RESOURCE_NAMES[resource]).join(', ')}</div>
                    )}
                  </div>
                </div>
                {faction.exports.length > 0 && (
                  <button
                    className="btn small faction-trade-button"
                    type="button"
                    disabled={!!tradeReason}
                    title={tradeReason ?? `${withJosa(faction.name, '과/와')} 교역 협상을 엽니다`}
                    onClick={() => onRequestTrade(faction.name)}
                  >
                    교역
                  </button>
                )}
                {leader && (
                  <button
                    className="btn small faction-gift-button"
                    type="button"
                    disabled={!!giftReason}
                    title={giftReason ?? `${leader.name} ${leader.title}에게 사치품이나 은을 예물로 보냅니다`}
                    onClick={() => onOpenGiftEnvoy(faction.name)}
                  >
                    예물
                  </button>
                )}
              </div>
              {giftRemainingDays != null && (
                <div className="faction-envoy-status">예물 사절 왕복 중 · {giftRemainingDays}일</div>
              )}
              <ContractList state={state} factionName={faction.name} onCancel={onCancelTradeContract} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
