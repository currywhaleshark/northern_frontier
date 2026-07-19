import { RANK_NAMES, RESOURCE_NAMES } from '../../game/constants';
import { canPetition } from '../../game/petition';
import { nextRank, promotionConditions } from '../../game/promotion';
import { rankProductionEfficiency } from '../../game/productionEfficiency';
import { LUXURY_RESOURCES } from '../../game/resourceCatalog';
import { suspicionBreakdown } from '../../game/suspicion';
import { tributeReserved } from '../../game/tributeReserve';
import type { GameState, ResourceId } from '../../game/types';

interface Props {
  state: GameState;
  onPetition: () => void;
  onToggleNitre: () => void;
  onSetTributeReserve: (resource: ResourceId, amount: number) => void;
  onUseLuxuryGood: (resource: ResourceId) => void;
}

function StatusBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="bar-outer">
      <div className="bar-inner" style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: color }} />
    </div>
  );
}

export function CourtWindow({
  state,
  onPetition,
  onToggleNitre,
  onSetTributeReserve,
  onUseLuxuryGood,
}: Props) {
  const target = nextRank(state.rank);
  const petitionReason = canPetition(state);
  const tribute = state.courtTribute;
  const factors = suspicionBreakdown(state);
  const suspicionColor = state.suspicion >= 70 ? '#e06c5c' : state.suspicion >= 40 ? '#d9a441' : '#6fbf73';
  const hasNitre = state.buildings.some(building => building.type === 'nitreYard');
  const hidden = state.day < state.nitreHiddenUntil;
  const productionBonus = Math.round((rankProductionEfficiency(state.rank) - 1) * 100);

  return (
    <div>
      <table className="insp-table">
        <tbody>
          <tr><td>승격 단계</td><td>{RANK_NAMES[state.rank]}</td></tr>
          <tr><td>생산 조직 효율</td><td>{productionBonus > 0 ? `+${productionBonus}%` : '기준'}</td></tr>
          <tr><td>명성</td><td>{Math.floor(state.resources.reputation)} <StatusBar value={state.resources.reputation} color="#d9a441" /></td></tr>
        </tbody>
      </table>

      {target && (
        <>
          <div className="panel-title" style={{ marginTop: 8 }}>다음 승격 — {RANK_NAMES[target]}</div>
          {promotionConditions(state, target).map(([ok, text], index) => (
            <div key={index} className="small" style={{ color: ok ? '#6fbf73' : '#e06c5c' }}>
              {ok ? '✓' : '·'} {text}
            </div>
          ))}
        </>
      )}

      {tribute && (
        <>
          <div className="panel-title" style={{ marginTop: 8 }}>올해 세공 ({tribute.year}년차)</div>
          {state.tributeWaivers > 0 && !tribute.resolved && (
            <div className="small" style={{ color: '#6fbf73', marginBottom: 4 }}>
              산삼 진상 면제권이 겨울 수거 때 자동 적용됩니다.
            </div>
          )}
          {tribute.resolved ? (
            <div className="small" style={{ color: tribute.paid ? '#6fbf73' : '#e06c5c' }}>
              {tribute.paid ? '올해 세공 납부 완료 ✓' : '올해 세공을 바치지 못했습니다'}
            </div>
          ) : (
            <>
              {Object.entries(tribute.items).map(([resourceId, amount]) => {
                const resource = resourceId as ResourceId;
                const usable = Math.floor(state.resources[resource]);
                const reserved = tributeReserved(state, resource);
                const required = amount ?? 0;
                const ready = reserved >= required;
                return (
                  <div key={resource} className="tribute-reserve-row">
                    <span>{RESOURCE_NAMES[resource]}</span>
                    <span style={{ color: ready ? '#6fbf73' : '#e06c5c' }}>
                      세공고 {reserved.toFixed(0)} / {required} · 사용 {usable}
                    </span>
                    <div className="tribute-reserve-controls" data-tut="tribute-reserve">
                      <button type="button" title="5 줄이기" onClick={() => onSetTributeReserve(resource, reserved - 5)}>-5</button>
                      <button type="button" title="1 줄이기" onClick={() => onSetTributeReserve(resource, reserved - 1)}>−</button>
                      <input
                        type="number"
                        min={0}
                        max={required}
                        step={1}
                        value={reserved}
                        aria-label={`${RESOURCE_NAMES[resource]} 세공 비축량`}
                        onChange={event => onSetTributeReserve(resource, Number(event.target.value))}
                      />
                      <button type="button" title="1 늘리기" onClick={() => onSetTributeReserve(resource, reserved + 1)}>+</button>
                      <button type="button" title="5 늘리기" onClick={() => onSetTributeReserve(resource, reserved + 5)}>+5</button>
                      <button
                        type="button"
                        title="사용 가능한 재고로 세공 요구량까지 채우기"
                        aria-label={`${RESOURCE_NAMES[resource]} 세공고 최대치 채우기`}
                        disabled={reserved >= required || usable <= 0}
                        onClick={() => onSetTributeReserve(resource, required)}
                      >최대</button>
                    </div>
                  </div>
                );
              })}
              <div className="muted small" style={{ marginTop: 4 }}>
                {tribute.dueDay - state.day > 0
                  ? `겨울까지 ${tribute.dueDay - state.day}일`
                  : '조정의 사자가 기다리고 있습니다'}
              </div>
            </>
          )}
        </>
      )}

      <div className="panel-title" style={{ marginTop: 8 }}>모반 의심</div>
      <div className="small" style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ color: suspicionColor }}>{Math.round(state.suspicion)} / 100</span>
        {state.crackdownDeadline > 0 && (
          <span style={{ color: '#e06c5c' }}>토벌 유예 {Math.max(0, state.crackdownDeadline - state.day)}일</span>
        )}
      </div>
      <StatusBar value={state.suspicion} color={suspicionColor} />
      {state.crackdownDeadline > 0 && (
        <div className="small" style={{ color: '#e06c5c', marginTop: 2 }}>
          기한 안에 의심을 60 아래로 내리지 못하면 토벌군이 내려옵니다.
        </div>
      )}
      {factors.map(factor => (
        <div key={factor.id} className="muted small" style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>{factor.label}</span>
          <span style={{ color: factor.delta > 0 ? '#e06c5c' : '#6fbf73' }}>
            {factor.delta > 0 ? '+' : ''}{factor.delta.toFixed(2)}/일
          </span>
        </div>
      ))}
      {hasNitre && (
        <div style={{ marginTop: 4 }}>
          <button
            className="btn small"
            disabled={hidden}
            title={hidden
              ? `감찰을 피해 은닉 중입니다 (${state.nitreHiddenUntil - state.day}일 뒤 재가동)`
              : '염초장을 세우면 화약 생산이 멈추는 대신 의심이 오르지 않습니다'}
            onClick={onToggleNitre}
          >
            {hidden ? '⚗️ 염초장 은닉 중' : state.nitrePaused ? '⚗️ 염초장 가동 재개' : '⚗️ 염초장 가동 중지'}
          </button>
        </div>
      )}

      <div style={{ marginTop: 10 }}>
        <button
          className="btn small"
          disabled={!!petitionReason}
          title={petitionReason ?? '명성을 들여 조정의 지원 물자를 청합니다 (계절당 1회)'}
          onClick={onPetition}
        >
          📜 조정에 청원
        </button>
        {petitionReason && <div className="muted small" style={{ marginTop: 3 }}>{petitionReason}</div>}
      </div>

      {LUXURY_RESOURCES.some(resource => state.resources[resource] >= 1) && (
        <>
          <div className="panel-title" style={{ marginTop: 8 }}>사치품</div>
          <div className="luxury-actions">
            {LUXURY_RESOURCES.filter(resource => state.resources[resource] >= 1).map(resource => (
              <button
                key={resource}
                className="btn small"
                type="button"
                title={`보유 ${Math.floor(state.resources[resource])}`}
                onClick={() => onUseLuxuryGood(resource)}
              >
                {RESOURCE_NAMES[resource]} 사용
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
