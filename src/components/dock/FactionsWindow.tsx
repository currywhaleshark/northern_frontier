import { withJosa } from '../../game/josa';
import { FACTIONS, RESOURCE_NAMES } from '../../game/constants';
import { canRequestTrade, factionTradeUnlockReason } from '../../game/events';
import { getRelation } from '../../game/relations';
import { FACTION_ARTWORK } from '../../game/tradePresentation';
import type { GameState } from '../../game/types';
import { FactionName } from '../FactionName';
import { UiIcon } from '../UiIcon';

interface Props {
  state: GameState;
  onRequestTrade: (factionName: string) => void;
}

function RelationBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="bar-outer">
      <div className="bar-inner" style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: color }} />
    </div>
  );
}

export function FactionsWindow({ state, onRequestTrade }: Props) {
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
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
