// 선택한 타일/건물/주민 정보 패널 + 조정(승격·세공·청원) 창구
import { useState } from 'react';
import {
  BUILDING_DEFS, getBuilding, isSmithyProductUnlocked, SMITHY_PRODUCT_DEFS, SMITHY_PRODUCT_ORDER, smithyProductOf,
} from '../game/buildings';
import { FACTIONS, isJobUnlocked, JOB_NAMES, JOB_ORDER, RANK_NAMES, RESOURCE_NAMES, TERRAIN_NAMES } from '../game/constants';
import { cropIdForBuilding, CROP_DEFS } from '../game/crops';
import { canRequestTrade } from '../game/events';
import { haulerCarryCapacity } from '../game/equipment';
import { canPetition } from '../game/petition';
import { nextRank, promotionConditions } from '../game/promotion';
import { suspicionBreakdown } from '../game/suspicion';
import { getRelation } from '../game/relations';
import { isExplored } from '../game/exploration';
import { mineralRemaining } from '../game/minerals';
import { isWallBuilding } from '../game/walls';
import { FACTION_ARTWORK } from '../game/tradePresentation';
import { LUXURY_RESOURCES } from '../game/resourceCatalog';
import { tributeReserved } from '../game/tributeReserve';
import { residentHome } from '../game/residents';
import type { GameState, JobId, Resident, ResourceId, SmithyProductId } from '../game/types';
import { FactionName } from './FactionName';

export type InspectorTab = 'tile' | 'people' | 'factions' | 'court';

interface Props {
  state: GameState;
  selected: { x: number; y: number } | null;
  onSetResidentJob: (id: number, job: JobId) => void;
  onToggleResidentCart: (id: number) => void;
  onRequestTrade: (factionName: string) => void;
  onPetition: () => void;
  onSetTributeReserve: (resource: ResourceId, amount: number) => void;
  onUseLuxuryGood: (resource: ResourceId) => void;
  onToggleNitre: () => void;
  onSetSmithyProduct: (buildingId: number, product: SmithyProductId) => void;
  onDemolishBuilding: (x: number, y: number) => void;
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

function ResidentDetail({ state, r, rank, onSetJob, onToggleCart }: {
  state: GameState;
  r: Resident;
  rank: GameState['rank'];
  onSetJob: (job: JobId) => void;
  onToggleCart: () => void;
}) {
  const home = r.alive ? residentHome(state, r) : null;
  return (
    <table className="insp-table">
      <tbody>
        <tr><td>이름</td><td>{r.name} ({r.age}세){r.sick ? ' 🤒' : ''}</td></tr>
        <tr>
          <td>직업</td>
          <td>
            <select
              value={r.job}
              disabled={!r.alive}
              onChange={e => onSetJob(e.target.value as JobId)}
              style={{ background: '#1e242b', color: '#d8dee5', border: '1px solid #39434e', borderRadius: 4 }}
            >
              {JOB_ORDER.filter(j => j === r.job || isJobUnlocked(rank, j)).map(j => (
                <option key={j} value={j}>{JOB_NAMES[j]}</option>
              ))}
            </select>
          </td>
        </tr>
        {r.alive && r.job === 'hauler' && (
          <tr>
            <td>운반 장비</td>
            <td>
              <span>{r.cartEquipped ? `🛒 수레 · 적재 ${haulerCarryCapacity(r)}` : `지게 · 적재 ${haulerCarryCapacity(r)}`}</span>{' '}
              <button
                type="button"
                className="btn small"
                disabled={!r.cartEquipped && state.resources.carts < 1}
                title={r.cartEquipped
                  ? '짐을 기본 적재량 이하로 내린 뒤 수레를 마을에 반납합니다'
                  : `마을 수레 ${Math.floor(state.resources.carts)}대`}
                onClick={onToggleCart}
              >
                {r.cartEquipped ? '반납' : '수레 장비'}
              </button>
            </td>
          </tr>
        )}
        <tr><td>현재 작업</td><td>{r.task}</td></tr>
        {r.alive && (
          <tr>
            <td>주거</td>
            <td>{home
              ? `${BUILDING_DEFS[home.type].emoji} ${BUILDING_DEFS[home.type].name} (${home.x}, ${home.y})`
              : '노숙'}</td>
          </tr>
        )}
        <tr><td>위치</td><td>({r.x}, {r.y})</td></tr>
        {Object.keys(r.carrying).length > 0 && (
          <tr>
            <td>{r.cartEquipped ? '수레 짐' : '지게 짐'}</td>
            <td>
              {Object.entries(r.carrying)
                .map(([res, amt]) => `${RESOURCE_NAMES[res as ResourceId]} ${(amt ?? 0).toFixed(1)}`)
                .join(', ')}
            </td>
          </tr>
        )}
        <tr><td>배고픔</td><td><Bar value={r.hunger} color="#d9a441" /></td></tr>
        <tr><td>체온</td><td><Bar value={r.warmth} color="#7ab3d9" /></td></tr>
        <tr><td>건강</td><td><Bar value={r.health} color="#6fbf73" /></td></tr>
        <tr><td>사기</td><td><Bar value={r.morale} color="#b58ad9" /></td></tr>
        <tr><td>숙련도</td><td>{(((r.skills[r.job] ?? 0)) * 100).toFixed(0)}%</td></tr>
      </tbody>
    </table>
  );
}

export function InspectorPanel({
  state, selected, onSetResidentJob, onToggleResidentCart, onRequestTrade, onPetition, onToggleNitre, onSetSmithyProduct,
  onSetTributeReserve, onUseLuxuryGood, onDemolishBuilding, tab, setTab, residentId, setResidentId,
}: Props) {
  const tile = selected ? state.map[selected.y]?.[selected.x] : null;
  const explored = tile ? isExplored(state, tile.x, tile.y) : false;
  const building = tile && explored ? getBuilding(state, tile.buildingId) : undefined;
  const resident = state.residents.find(r => r.id === residentId) ?? null;

  return (
    <div className="section">
      <div className="panel-title" style={{ display: 'flex', gap: 8 }}>
        <span style={{ cursor: 'pointer', opacity: tab === 'tile' ? 1 : 0.5 }} onClick={() => setTab('tile')}>정보</span>
        <span style={{ cursor: 'pointer', opacity: tab === 'people' ? 1 : 0.5 }} onClick={() => setTab('people')}>주민</span>
        <span style={{ cursor: 'pointer', opacity: tab === 'factions' ? 1 : 0.5 }} onClick={() => setTab('factions')}>세력</span>
        <span style={{ cursor: 'pointer', opacity: tab === 'court' ? 1 : 0.5 }} onClick={() => setTab('court')}>조정</span>
      </div>

      {tab === 'court' && (
        <CourtTab
          state={state}
          onPetition={onPetition}
          onToggleNitre={onToggleNitre}
          onSetTributeReserve={onSetTributeReserve}
          onUseLuxuryGood={onUseLuxuryGood}
        />
      )}

      {tab === 'tile' && (
        !tile ? <div className="muted small">지도를 클릭해 타일을 선택하세요.</div> : (
          <table className="insp-table">
            <tbody>
              <tr><td>위치</td><td>({tile.x}, {tile.y})</td></tr>
              {!explored ? (
                <>
                  <tr><td>상태</td><td>미답사</td></tr>
                  <tr><td colSpan={2} className="muted small">주민이 가까이 가면 지형과 자원을 확인할 수 있습니다.</td></tr>
                </>
              ) : (
                <>
              <tr><td>지형</td><td>{TERRAIN_NAMES[tile.terrain]}{tile.terrain === 'rock' && tile.hasIron ? ' (철맥)' : ''}</td></tr>
              {(tile.terrain === 'rock' || building?.type === 'mine') && (
                <tr>
                  <td>광상</td>
                  <td>{mineralRemaining(tile) > 0
                    ? (tile.hasIron ? '철 ' : '석재 ') + mineralRemaining(tile).toFixed(1) + ' 남음'
                    : '고갈'}</td>
                </tr>
              )}
              {tile.terrain === 'forest' && state.habitats.some(h =>
                h.active && (h.x - tile.x) ** 2 + (h.y - tile.y) ** 2 <= h.radius ** 2) && (
                <tr><td>서식지</td><td>🐾 짐승 서식지 범위 (사냥 가능)</td></tr>
              )}
              {building && (() => {
                const def = BUILDING_DEFS[building.type];
                const occupants = state.residents.filter(candidate =>
                  candidate.alive && candidate.homeBuildingId === building.id);
                return (
                  <>
                    <tr><td>건물</td><td>{def.emoji} {def.name}</td></tr>
                    <tr><td>상태</td><td>{building.built
                      ? '완공'
                      : `${building.repairing ? '수리 중' : '건설 중'} ${Math.floor((building.progress / Math.max(1, def.buildDays)) * 100)}%`}</td></tr>
                    {def.capacity > 0 && (
                      <tr><td>입주</td><td>{occupants.length}/{building.built ? def.capacity : 0}명</td></tr>
                    )}
                    {(building.type === 'field' || building.type === 'paddy') && building.built && (
                      <>
                        <tr>
                          <td>작물</td>
                          <td>
                            {(() => {
                              const cropId = cropIdForBuilding(building);
                              const queuedCrop = building.queuedCropId;
                              return cropId
                                ? `${CROP_DEFS[cropId].name}${queuedCrop ? ` -> ${CROP_DEFS[queuedCrop].name}` : ''}`
                                : queuedCrop ? `${CROP_DEFS[queuedCrop].name} 예약` : '미선택';
                            })()}
                          </td>
                        </tr>
                        <tr><td>성장</td><td><Bar value={building.fieldGrowth} color="#6fbf73" /></td></tr>
                      </>
                    )}
                    {building.type === 'smithy' && building.built && (
                      <tr>
                        <td>생산</td>
                        <td>
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            {SMITHY_PRODUCT_ORDER.map(product => {
                              const def = SMITHY_PRODUCT_DEFS[product];
                              const active = smithyProductOf(building) === product;
                              const unlocked = isSmithyProductUnlocked(state.rank, product);
                              const recipe = Object.entries(def.inputPerUnit)
                                .map(([res, amt]) => `${RESOURCE_NAMES[res as ResourceId]} ${amt}`)
                                .join(' + ');
                              return (
                                <button
                                  key={product}
                                  className="btn small"
                                  disabled={!unlocked}
                                  title={unlocked ? recipe : `${RANK_NAMES[def.minRank ?? 'bo']} 승격 후 생산`}
                                  style={active ? { borderColor: '#d9a441', color: '#d9a441', fontWeight: 700 } : undefined}
                                  onClick={() => onSetSmithyProduct(building.id, product)}
                                >
                                  {def.name}
                                </button>
                              );
                            })}
                          </div>
                        </td>
                      </tr>
                    )}
                    {(building.type === 'market' || building.type === 'dock') && building.built && (
                      <tr>
                        <td>교역</td>
                        <td>
                          {FACTIONS.filter(f => f.exports.length > 0).map(f => {
                            const reason = canRequestTrade(state, f.name);
                            return (
                              <button
                                key={f.name}
                                className="btn small"
                                disabled={!!reason}
                                title={reason ?? `${f.name}에 먼저 거래를 청합니다`}
                                style={{ margin: '2px 4px 2px 0' }}
                                onClick={() => onRequestTrade(f.name)}
                              >
                                <FactionName name={f.name} />
                              </button>
                            );
                          })}
                        </td>
                      </tr>
                    )}
                    {building.inventory && Object.values(building.inventory).some(amount => (amount ?? 0) > 0.05) && (
                      <tr>
                        <td>현장 재고</td>
                        <td>
                          {Object.entries(building.inventory)
                            .filter((entry): entry is [string, number] => (entry[1] ?? 0) > 0.05)
                            .map(([resource, amount]) => `${RESOURCE_NAMES[resource as ResourceId]} ${amount.toFixed(1)}`)
                            .join(', ')}
                        </td>
                      </tr>
                    )}
                    {isWallBuilding(building.type) && (
                      <tr>
                        <td>정비</td>
                        <td>
                          <button
                            className="btn small"
                            type="button"
                            onClick={() => onDemolishBuilding(tile.x, tile.y)}
                          >
                            철거
                          </button>
                        </td>
                      </tr>
                    )}
                    <tr><td colSpan={2} className="muted small">{def.desc}</td></tr>
                  </>
                );
              })()}
                </>
              )}
            </tbody>
          </table>
        )
      )}

      {tab === 'factions' && (
        <div>
          <div className="muted small" style={{ marginBottom: 6 }}>
            교역·공물·협상은 관계를 데우고, 거절과 전투는 식힙니다. 홀라온과 마적은 습격 전에 대가를 요구할 수 있습니다.
          </div>
          {FACTIONS.map(f => {
            const rel = getRelation(state, f.name);
            const color = rel >= 60 ? '#6fbf73' : rel >= 40 ? '#d9a441' : '#e06c5c';
            const artwork = FACTION_ARTWORK[f.name];
            const tradeReason = f.exports.length > 0 ? canRequestTrade(state, f.name) : null;
            const unlockLocked = f.tradeUnlockBuilding
              ? !state.buildings.some(building => building.built && building.type === f.tradeUnlockBuilding)
              : false;
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
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>{f.hostile ? '⚔️' : '🤝'} <FactionName name={f.name} /></span>
                    <span className="muted small">{Math.round(rel)}</span>
                  </div>
                  <Bar value={rel} color={color} />
                  {unlockLocked && (
                    <div className="faction-unlock-note">부두 건설 후 교역로 개방</div>
                  )}
                  <div className="muted small">
                    {f.exports.length > 0
                      ? '내놓음: ' + f.exports.map(resource => RESOURCE_NAMES[resource]).join(', ')
                      : f.extortionDemands?.length
                        ? '선제 요구: ' + f.extortionDemands.map(demand => RESOURCE_NAMES[demand.resource]).join(', ')
                        : '교역하지 않음'}
                  </div>
                  {f.imports.length > 0 && (
                    <div className="muted small">원함: {f.imports.map(resource => RESOURCE_NAMES[resource]).join(', ')}</div>
                  )}
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
            );
          })}
        </div>
      )}

      {tab === 'people' && (
        <div>
          {resident ? (
            <>
              <button className="btn small" style={{ marginBottom: 6 }} onClick={() => setResidentId(null)}>← 목록으로</button>
              <ResidentDetail
                state={state}
                r={resident}
                rank={state.rank}
                onSetJob={job => onSetResidentJob(resident.id, job)}
                onToggleCart={() => onToggleResidentCart(resident.id)}
              />
            </>
          ) : (
            <div style={{ maxHeight: 260, overflowY: 'auto' }}>
              {state.residents.map(r => (
                <div
                  key={r.id}
                  className={`resident-row${r.alive ? '' : ' dead'}`}
                  onClick={() => r.alive && setResidentId(r.id)}
                >
                  <span>{r.name}{r.sick ? ' 🤒' : ''}</span>
                  <span className="muted">{r.alive
                    ? `${r.cartEquipped ? '🛒 ' : ''}${JOB_NAMES[r.job]}`
                    : '사망'}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
