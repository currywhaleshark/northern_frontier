// 선택한 타일/건물/주민 정보 패널
import { BUILDING_DEFS, getBuilding } from '../game/buildings';
import { FACTIONS, JOB_NAMES, JOB_ORDER, RESOURCE_NAMES, TERRAIN_NAMES } from '../game/constants';
import { canRequestTrade } from '../game/events';
import { getRelation } from '../game/relations';
import type { GameState, JobId, Resident, ResourceId } from '../game/types';

export type InspectorTab = 'tile' | 'people' | 'factions';

interface Props {
  state: GameState;
  selected: { x: number; y: number } | null;
  onSetResidentJob: (id: number, job: JobId) => void;
  onRequestTrade: (factionName: string) => void;
  tab: InspectorTab;
  setTab: (t: InspectorTab) => void;
  residentId: number | null;
  setResidentId: (id: number | null) => void;
}

// "거래하기" 버튼 — 불가 사유는 게임 로직(canRequestTrade)과 같은 함수를 쓴다
function TradeButton({ state, factionName, onRequestTrade }: {
  state: GameState; factionName: string; onRequestTrade: (name: string) => void;
}) {
  const reason = canRequestTrade(state, factionName);
  return (
    <button
      className="btn small"
      disabled={!!reason}
      title={reason ?? '장터에서 먼저 거래를 청합니다'}
      onClick={() => onRequestTrade(factionName)}
    >
      거래하기{reason ? ` — ${reason}` : ''}
    </button>
  );
}

function Bar({ value, color }: { value: number; color: string }) {
  return (
    <div className="bar-outer">
      <div className="bar-inner" style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: color }} />
    </div>
  );
}

function ResidentDetail({ r, onSetJob }: { r: Resident; onSetJob: (job: JobId) => void }) {
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
              {JOB_ORDER.map(j => <option key={j} value={j}>{JOB_NAMES[j]}</option>)}
            </select>
          </td>
        </tr>
        <tr><td>현재 작업</td><td>{r.task}</td></tr>
        <tr><td>위치</td><td>({r.x}, {r.y})</td></tr>
        {Object.keys(r.carrying).length > 0 && (
          <tr>
            <td>지게 짐</td>
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
  state, selected, onSetResidentJob, onRequestTrade, tab, setTab, residentId, setResidentId,
}: Props) {
  const tile = selected ? state.map[selected.y]?.[selected.x] : null;
  const building = tile ? getBuilding(state, tile.buildingId) : undefined;
  const resident = state.residents.find(r => r.id === residentId) ?? null;

  return (
    <div className="section">
      <div className="panel-title" style={{ display: 'flex', gap: 8 }}>
        <span style={{ cursor: 'pointer', opacity: tab === 'tile' ? 1 : 0.5 }} onClick={() => setTab('tile')}>정보</span>
        <span style={{ cursor: 'pointer', opacity: tab === 'people' ? 1 : 0.5 }} onClick={() => setTab('people')}>주민</span>
        <span style={{ cursor: 'pointer', opacity: tab === 'factions' ? 1 : 0.5 }} onClick={() => setTab('factions')}>세력</span>
      </div>

      {tab === 'tile' && (
        !tile ? <div className="muted small">지도를 클릭해 타일을 선택하세요.</div> : (
          <table className="insp-table">
            <tbody>
              <tr><td>위치</td><td>({tile.x}, {tile.y})</td></tr>
              <tr><td>지형</td><td>{TERRAIN_NAMES[tile.terrain]}{tile.terrain === 'rock' && tile.hasIron ? ' (철맥)' : ''}</td></tr>
              {tile.terrain === 'forest' && state.habitats.some(h =>
                h.active && (h.x - tile.x) ** 2 + (h.y - tile.y) ** 2 <= h.radius ** 2) && (
                <tr><td>서식지</td><td>🐾 짐승 서식지 범위 (사냥 가능)</td></tr>
              )}
              {building && (() => {
                const def = BUILDING_DEFS[building.type];
                return (
                  <>
                    <tr><td>건물</td><td>{def.emoji} {def.name}</td></tr>
                    <tr><td>상태</td><td>{building.built ? '완공' : `건설 중 ${Math.floor((building.progress / Math.max(1, def.buildDays)) * 100)}%`}</td></tr>
                    {building.type === 'field' && building.built && (
                      <tr><td>작물</td><td><Bar value={building.fieldGrowth} color="#6fbf73" /></td></tr>
                    )}
                    {building.type === 'market' && building.built && (
                      <tr>
                        <td>교역</td>
                        <td>
                          {FACTIONS.filter(f => f.trades.length > 0).map(f => {
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
                                {f.name}
                              </button>
                            );
                          })}
                        </td>
                      </tr>
                    )}
                    <tr><td colSpan={2} className="muted small">{def.desc}</td></tr>
                  </>
                );
              })()}
            </tbody>
          </table>
        )
      )}

      {tab === 'factions' && (
        <div>
          <div className="muted small" style={{ marginBottom: 6 }}>
            교역·공물·협상은 관계를 데우고, 거절과 전투는 식힙니다. 관계가 나쁜 세력일수록 습격에 나서기 쉽습니다.
          </div>
          {FACTIONS.map(f => {
            const rel = getRelation(state, f.name);
            const color = rel >= 60 ? '#6fbf73' : rel >= 40 ? '#d9a441' : '#e06c5c';
            return (
              <div key={f.name} style={{ marginBottom: 9 }} title={f.desc}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>{f.hostile ? '⚔️' : '🤝'} {f.name}</span>
                  <span className="muted small">{Math.round(rel)}</span>
                </div>
                <Bar value={rel} color={color} />
                <div className="muted small">
                  {f.trades.length > 0
                    ? '교역품: ' + f.trades.map(t => RESOURCE_NAMES[t.get]).join(', ')
                    : '교역하지 않음'}
                </div>
                {f.trades.length > 0 && (
                  <div style={{ marginTop: 3 }}>
                    <TradeButton state={state} factionName={f.name} onRequestTrade={onRequestTrade} />
                  </div>
                )}
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
              <ResidentDetail r={resident} onSetJob={job => onSetResidentJob(resident.id, job)} />
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
                  <span className="muted">{r.alive ? JOB_NAMES[r.job] : '사망'}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
