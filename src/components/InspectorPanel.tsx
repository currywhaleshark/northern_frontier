// 주민 목록·세력·조정·사건 패널. 선택 상세는 SelectionContextBar가 소유한다.
import { FACTIONS, JOB_NAMES, RANK_NAMES, RESOURCE_NAMES } from '../game/constants';
import { canRequestTrade, factionTradeUnlockReason } from '../game/events';
import { canPetition } from '../game/petition';
import { nextRank, promotionConditions } from '../game/promotion';
import { suspicionBreakdown } from '../game/suspicion';
import { getRelation } from '../game/relations';
import { FACTION_ARTWORK } from '../game/tradePresentation';
import { LUXURY_RESOURCES } from '../game/resourceCatalog';
import { tributeReserved } from '../game/tributeReserve';
import { predatorHuntChance } from '../game/specialEvents';
import { availablePredatorScouts, predatorScoutDuration } from '../game/expeditionIntel';
import { SPECIAL_ITEM_DEFS } from '../game/specialItems';
import { COMBAT_WEAPON_NAMES } from '../game/weapons';
import type { GameState, ResourceId, SpecialItemId, WildlifeKind } from '../game/types';
import { FactionName } from './FactionName';

export type InspectorTab = 'people' | 'factions' | 'court' | 'incidents';

interface Props {
  state: GameState;
  onRequestTrade: (factionName: string) => void;
  onPetition: () => void;
  onSetTributeReserve: (resource: ResourceId, amount: number) => void;
  onUseLuxuryGood: (resource: ResourceId) => void;
  onToggleNitre: () => void;
  onOrganizeHunt: (kind: WildlifeKind) => void;
  onScoutPredator: (kind: 'wolf' | 'tiger', residentId: number) => void;
  onOpenWeaponAllocation: () => void;
  tab: InspectorTab;
  setTab: (t: InspectorTab) => void;
  residentId: number | null;
  setResidentId: (id: number | null) => void;
}

function Bar({ value, color }: { value: number; color: string }) {
  return (
    <div className="bar-outer">
      <div className="bar-inner" style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: color }} />
    </div>
  );
}

function IncidentsTab({ state, onOrganizeHunt, onScoutPredator }: {
  state: GameState;
  onOrganizeHunt: (kind: WildlifeKind) => void;
  onScoutPredator: (kind: 'wolf' | 'tiger', residentId: number) => void;
}) {
  const threats = (['wolf', 'tiger', 'boar'] as const)
    .map(kind => state.incidents.predatorThreats[kind])
    .filter(threat => threat != null);
  const itemIds = Object.keys(SPECIAL_ITEM_DEFS) as SpecialItemId[];
  const discovered = itemIds.filter(item => state.discoveredSpecialItems.includes(item));
  return (
    <div className="incident-panel">
      <div className="panel-title">활성 위험</div>
      {threats.length === 0 ? (
        <div className="muted small">현재 추적 중인 맹수가 없습니다.</div>
      ) : threats.map(threat => {
        const kind = threat.kind;
        const tiger = kind === 'tiger';
        const boar = kind === 'boar';
        const scouts = boar ? [] : availablePredatorScouts(state);
        const intel = threat.intel;
        const success = Math.round(predatorHuntChance(state, kind) * 100);
        const successLabel = boar || intel?.precision === 'exact'
          ? `${success}%`
          : intel?.precision === 'rough'
            ? `약 ${Math.round(success / 5) * 5}%`
            : '???';
        return (
          <div key={kind} className={`incident-threat ${tiger ? 'danger' : 'warn'}`}>
            <div>
              <strong>{tiger ? '호랑이 출몰' : boar ? '멧돼지 출몰' : '늑대 출몰'}</strong>
              <span>{Math.max(1, threat.untilDay - state.day)}일 남음</span>
            </div>
            <div className="muted small">
              {tiger ? '낮에는 숲, 밤에는 모든 주민이 위험' : boar ? '밤마다 농작물과 저장 식량이 위험' : '숲에 드나드는 주민이 위험'}
            </div>
            <div className="incident-hunt-row">
              <span>예상 성공 {successLabel}</span>
              <button className="btn small" type="button" onClick={() => onOrganizeHunt(kind)}>
                {boar ? '토벌 준비' : '즉시 토벌'}
              </button>
            </div>
            {!boar && (
              <div className="incident-scout-box">
                {threat.scouting ? (
                  <div>
                    <strong>흔적 추적 중</strong>
                    <span>
                      {state.residents.find(resident => resident.id === threat.scouting?.residentId)?.name ?? '사냥꾼'} ·
                      {' '}{Math.max(0, threat.scouting.completesOnDay - state.day)}일 남음
                    </span>
                  </div>
                ) : (
                  <>
                    <div>
                      <strong>규모 정보 {intel?.precision === 'exact' ? '정확' : intel?.precision === 'rough' ? '대략' : '???'}</strong>
                      <span>{intel ? '더 숙련된 사냥꾼으로 재추적할 수 있습니다.' : '사냥꾼을 며칠간 보내 흔적을 쫓습니다.'}</span>
                    </div>
                    {intel?.precision !== 'exact' && (
                      <select
                        defaultValue=""
                        aria-label={`${tiger ? '호랑이' : '늑대'} 흔적을 쫓을 사냥꾼`}
                        disabled={scouts.length === 0}
                        onChange={event => {
                          const residentId = Number(event.target.value);
                          if (residentId) onScoutPredator(kind, residentId);
                          event.currentTarget.value = '';
                        }}
                      >
                        <option value="">{scouts.length > 0 ? '사냥꾼 선택…' : '파견 가능 사냥꾼 없음'}</option>
                        {scouts.map(scout => {
                          const skill = scout.skills.hunter ?? 0;
                          const days = predatorScoutDuration(skill, (state.specialItems.gyrfalcon ?? 0) > 0);
                          return <option key={scout.id} value={scout.id}>{scout.name} · 숙련 {Math.round(skill * 100)}% · {days}일</option>;
                        })}
                      </select>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
      {state.incidents.plagueCase && (
        <div className="incident-threat warn">
          <div><strong>역병 의심 환자 관찰</strong><span>{Math.max(1, state.incidents.plagueCase.resolvesOnDay - state.day)}일 남음</span></div>
          <div className="muted small">{state.incidents.plagueCase.isolated ? '격리 중: 배정은 유지되지만 작업 중단' : '미격리: 실제 역병이면 후속 확산 사건 발생'}</div>
        </div>
      )}
      {state.incidents.epidemic && (
        <div className="incident-threat danger">
          <div><strong>역병 유행</strong><span>환자 {state.incidents.epidemic.infectedIds.length}명</span></div>
          <div className="muted small">{state.incidents.epidemic.mode === 'isolated' ? '환자 전원 격리 중' : state.incidents.epidemic.mode === 'pending' ? '대응 결정 대기 중' : '격리 없이 전염 중'}</div>
        </div>
      )}

      <div className="panel-title" style={{ marginTop: 10 }}>기물함</div>
      {discovered.length === 0 ? (
        <div className="muted small">아직 얻은 기물이 없습니다.</div>
      ) : discovered.map(item => {
        const def = SPECIAL_ITEM_DEFS[item];
        return (
          <div key={item} className="special-item-row" title={def.desc}>
            <span className="special-item-icon" aria-hidden="true">{def.icon}</span>
            <div>
              <strong>{def.name}</strong>
              <span className="muted small">{def.tradeValue > 0 ? `교역 가치 ${def.tradeValue}` : '보유 중 습격 조기발견 보너스'}</span>
            </div>
            <b>{state.specialItems[item]}</b>
          </div>
        );
      })}
      {state.tributeWaivers > 0 && (
        <div className="special-item-row tribute-waiver-row">
          <span className="special-item-icon" aria-hidden="true">免</span>
          <div><strong>세공 면제권</strong><span className="muted small">겨울 세공 수거 때 자동 사용</span></div>
          <b>{state.tributeWaivers}</b>
        </div>
      )}
    </div>
  );
}

// 조정 탭 — 승격·명성·세공·청원·모반 의심 (조정 관련 정보의 단일 창구)
function CourtTab({ state, onPetition, onToggleNitre, onSetTributeReserve, onUseLuxuryGood }: {
  state: GameState;
  onPetition: () => void;
  onToggleNitre: () => void;
  onSetTributeReserve: (resource: ResourceId, amount: number) => void;
  onUseLuxuryGood: (resource: ResourceId) => void;
}) {
  const target = nextRank(state.rank);
  const petitionReason = canPetition(state);
  const tribute = state.courtTribute;
  const factors = suspicionBreakdown(state);
  const suspicionColor = state.suspicion >= 70 ? '#e06c5c' : state.suspicion >= 40 ? '#d9a441' : '#6fbf73';
  const hasNitre = state.buildings.some(b => b.type === 'nitreYard');
  const hidden = state.day < state.nitreHiddenUntil;
  return (
    <div>
      <table className="insp-table">
        <tbody>
          <tr><td>승격 단계</td><td>{RANK_NAMES[state.rank]}</td></tr>
          <tr><td>명성</td><td>{Math.floor(state.resources.reputation)} <Bar value={state.resources.reputation} color="#d9a441" /></td></tr>
        </tbody>
      </table>

      {target && (
        <>
          <div className="panel-title" style={{ marginTop: 8 }}>다음 승격 — {RANK_NAMES[target]}</div>
          {promotionConditions(state, target).map(([ok, txt], i) => (
            <div key={i} className="small" style={{ color: ok ? '#6fbf73' : '#e06c5c' }}>
              {ok ? '✓' : '·'} {txt}
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
              {Object.entries(tribute.items).map(([res, amt]) => {
                const resource = res as ResourceId;
                const usable = Math.floor(state.resources[resource]);
                const reserved = tributeReserved(state, resource);
                const required = amt ?? 0;
                const ok = reserved >= required;
                return (
                  <div key={res} className="tribute-reserve-row">
                    <span>{RESOURCE_NAMES[resource]}</span>
                    <span style={{ color: ok ? '#6fbf73' : '#e06c5c' }}>
                      세공고 {reserved.toFixed(0)} / {required} · 사용 {usable}
                    </span>
                    <div className="tribute-reserve-controls">
                      <button type="button" title="5 줄이기" onClick={() => onSetTributeReserve(resource, reserved - 5)}>-5</button>
                      <button type="button" title="1 줄이기" onClick={() => onSetTributeReserve(resource, reserved - 1)}>−</button>
                      <input
                        type="number" min={0} max={required} step={1} value={reserved}
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
      <Bar value={state.suspicion} color={suspicionColor} />
      {state.crackdownDeadline > 0 && (
        <div className="small" style={{ color: '#e06c5c', marginTop: 2 }}>
          기한 안에 의심을 60 아래로 내리지 못하면 토벌군이 내려옵니다.
        </div>
      )}
      {/* 원인 내역 — 무엇이 의심을 올리는지 보여준다 (원인 불명의 게이지는 답답함만 만든다) */}
      {factors.map(f => (
        <div key={f.id} className="muted small" style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>{f.label}</span>
          <span style={{ color: f.delta > 0 ? '#e06c5c' : '#6fbf73' }}>
            {f.delta > 0 ? '+' : ''}{f.delta.toFixed(2)}/일
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
                key={resource} className="btn small" type="button"
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

export function InspectorPanel({
  state, onRequestTrade, onPetition, onToggleNitre, onSetTributeReserve, onUseLuxuryGood,
  onOrganizeHunt, onScoutPredator, tab, setTab, residentId, setResidentId, onOpenWeaponAllocation,
}: Props) {
  return (
    <div className="section">
      <div className="panel-title" style={{ display: 'flex', gap: 8 }}>
        <span style={{ cursor: 'pointer', opacity: tab === 'people' ? 1 : 0.5 }} onClick={() => setTab('people')}>주민</span>
        <span style={{ cursor: 'pointer', opacity: tab === 'factions' ? 1 : 0.5 }} onClick={() => setTab('factions')}>세력</span>
        <span style={{ cursor: 'pointer', opacity: tab === 'court' ? 1 : 0.5 }} onClick={() => setTab('court')}>조정</span>
        <span style={{ cursor: 'pointer', opacity: tab === 'incidents' ? 1 : 0.5 }} onClick={() => setTab('incidents')}>사건</span>
      </div>

      {tab === 'incidents' && (
        <IncidentsTab state={state} onOrganizeHunt={onOrganizeHunt} onScoutPredator={onScoutPredator} />
      )}

      {tab === 'court' && (
        <CourtTab
          state={state}
          onPetition={onPetition}
          onToggleNitre={onToggleNitre}
          onSetTributeReserve={onSetTributeReserve}
          onUseLuxuryGood={onUseLuxuryGood}
        />
      )}

      {tab === 'factions' && (
        <div>
          <div className="muted small" style={{ marginBottom: 6 }}>
            교역·공물·협상은 관계를 데우고, 거절과 전투는 식힙니다. 홀라온과 마적은 습격 전에 대가를 요구할 수 있습니다.
          </div>
          {FACTIONS.filter(f => !factionTradeUnlockReason(state, f.name)).map(f => {
            const rel = getRelation(state, f.name);
            const color = rel >= 60 ? '#6fbf73' : rel >= 40 ? '#d9a441' : '#e06c5c';
            const artwork = FACTION_ARTWORK[f.name];
            const tradeReason = f.exports.length > 0 ? canRequestTrade(state, f.name) : null;
            return (
              <div key={f.name} className="faction-entry" title={f.desc}>
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
                    <span>{f.hostile ? '⚔️' : '🤝'} <FactionName name={f.name} /></span>
                    <span className="faction-relation" style={{ color }}>{Math.round(rel)}</span>
                  </div>
                  <Bar value={rel} color={color} />
                  <div className="faction-entry-actions">
                    <div className="faction-info">
                      <button
                        className="faction-trade-toggle"
                        type="button"
                        aria-label={`${f.name} 정보와 교역품`}
                      >
                        ⓘ
                      </button>
                      <div className="faction-trade-detail-body" role="tooltip">
                        <div>{f.desc}</div>
                        <div>
                          {f.exports.length > 0
                            ? '내놓음: ' + f.exports.map(resource => RESOURCE_NAMES[resource]).join(', ')
                            : f.extortionDemands?.length
                              ? '선제 요구: ' + f.extortionDemands.map(demand => RESOURCE_NAMES[demand.resource]).join(', ')
                              : '교역하지 않음'}
                        </div>
                        {f.imports.length > 0 && (
                          <div>원함: {f.imports.map(resource => RESOURCE_NAMES[resource]).join(', ')}</div>
                        )}
                      </div>
                    </div>
                    {f.exports.length > 0 && (
                      <button
                        className="btn small faction-trade-button"
                        type="button"
                        disabled={!!tradeReason}
                        title={tradeReason ?? `${f.name}과 교역 협상을 엽니다`}
                        onClick={() => onRequestTrade(f.name)}
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
      )}

      {tab === 'people' && (
        <div>
          <button type="button" className="btn small weapon-allocation-open" onClick={onOpenWeaponAllocation}>
            ⚔ 병기고 무기 배분
          </button>
          <div style={{ maxHeight: 260, overflowY: 'auto' }}>
            {state.residents.map(resident => (
              <div
                key={resident.id}
                className={`resident-row${resident.alive ? '' : ' dead'}${resident.id === residentId ? ' selected' : ''}`}
                onClick={() => resident.alive && setResidentId(resident.id)}
              >
                <span>{resident.name}{resident.sick ? ' 🤒' : ''}{state.day < (resident.quarantinedUntil ?? 0) ? ' · 격리' : ''}</span>
                <span className="muted">{resident.alive
                  ? `${resident.cartEquipped ? '🛒 ' : ''}${JOB_NAMES[resident.job]}${state.weaponAssignments[resident.id]
                    ? ` · ${COMBAT_WEAPON_NAMES[state.weaponAssignments[resident.id]!]}`
                    : ''}`
                  : '사망'}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
