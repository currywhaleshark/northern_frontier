/**
 * 개발용 치트 패널 — docs/DESIGN-2026-08-03-debug-cheat-panel.md
 *
 * 개발 빌드 전용이다. GameSession이 `import.meta.env.DEV` 게이트 뒤에서 지연 import 하므로
 * 프로덕션 번들에는 이 파일도, 이 파일이 끌어오는 `game/debugActions`도 들어가지 않는다.
 *
 * 상태를 바꾸는 일은 전부 `game/debugActions`에 있다. 여기서는 값을 모아 그 함수를 부르고
 * 결과 문구만 띄운다 — 컴포넌트가 게임 상태를 직접 찌르지 않는다.
 */
import { useCallback, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { JOB_NAMES, JOB_ORDER, SEASON_NAMES, SEASON_ORDER } from '../game/constants';
import {
  AGE_BAND_NAMES, DEBUG_DISASTER_NAMES, DEBUG_LIVESTOCK_IDS, DEBUG_RESOURCE_IDS,
  DEBUG_SCENARIO_STEP_TITLES, DEBUG_SPECIAL_ITEM_IDS, DEBUG_SPECIAL_RESIDENT_IDS,
  debugAcquireLivestock, debugAddAllResources, debugAddResource, debugAdvanceDays,
  debugAdvanceToNextSeason, debugAnnounceTribute, debugClearScenario, debugCollectTribute,
  debugDateLabel, debugDemote, debugDumpState, debugGrantSpecialItem, debugHealResident,
  debugJumpToDate, debugKillResident, debugLockReason, debugOfferImmigration, debugPromote,
  debugRefillGatheringStocks, debugResetGuides, debugRestoreAllResidents, debugRevealMap,
  debugSetAllMorale, debugSetReputation, debugSetResource, debugSetScenarioStep,
  debugSetSuspicion, debugSetThreat, debugSetTributeStreak, debugSickenResident,
  debugSpawnRaid, debugSpawnResidents, debugSpawnSpecialResident, debugStartDisaster,
  debugStartEpidemic, debugStartFire, debugStartLivestockEpidemic, debugStartMineCollapse,
  debugStartPlagueSuspicion, debugStateSummary,
  livestockName, resourceName, specialItemName, specialResidentName,
  type DebugAgeBand, type DebugDisasterId, type DebugResult,
} from '../game/debugActions';
import type { GameState, Gender, JobId, LivestockId, ResourceId, Season, SpecialItemId, SpecialResidentId } from '../game/types';

interface Props {
  state: GameState;
  onChanged: () => void;
  onClose: () => void;
  aquiferLayer: boolean;
  oreLayer: boolean;
  onToggleMapLayer: (layer: 'aquifer' | 'ore') => void;
}

type SectionId = '자원' | '시간' | '마을' | '스폰' | '사건' | '주민' | '지도' | '기타';
const SECTIONS: readonly SectionId[] = ['자원', '시간', '마을', '스폰', '사건', '주민', '지도', '기타'];

const DISASTER_IDS: readonly DebugDisasterId[] =
  ['earlyFrost', 'lateFrost', 'locust', 'drought', 'springFlood', 'snowDamage'];
const AGE_BANDS: readonly DebugAgeBand[] = ['random', 'child', 'youth', 'adult', 'elder'];

const rowStyle: CSSProperties = { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4, marginBottom: 5 };
const labelStyle: CSSProperties = { minWidth: 62, color: 'var(--muted)', fontSize: 11 };
const inputStyle: CSSProperties = {
  width: 62, padding: '2px 4px', border: '1px solid var(--border)', borderRadius: 3,
  background: 'var(--panel2)', color: 'var(--text)', font: 'inherit', fontSize: 11,
};
const selectStyle: CSSProperties = { ...inputStyle, width: 'auto', maxWidth: 150 };
const buttonStyle: CSSProperties = {
  padding: '2px 7px', border: '1px solid var(--border)', borderRadius: 3,
  background: 'var(--panel2)', color: 'var(--text)', font: 'inherit', fontSize: 11, cursor: 'pointer',
};

function DebugButton({ children, onClick, title }: { children: ReactNode; onClick: () => void; title?: string }) {
  return <button type="button" style={buttonStyle} title={title} onClick={onClick}>{children}</button>;
}

function Row({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <div style={rowStyle}>
      {label ? <span style={labelStyle}>{label}</span> : null}
      {children}
    </div>
  );
}

export function DebugCheatPanel({ state, onChanged, onClose, aquiferLayer, oreLayer, onToggleMapLayer }: Props) {
  const [section, setSection] = useState<SectionId>('자원');
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [position, setPosition] = useState({ x: 24, y: 64 });
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null);

  const run = useCallback((action: () => DebugResult) => {
    const result = action();
    setStatus(result.ok ? { ok: true, text: result.detail } : { ok: false, text: result.reason });
    onChanged();
  }, [onChanged]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0 || (event.target as Element).closest('button')) return;
    event.preventDefault();
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: position.x,
      originY: position.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const handlePointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setPosition({
      x: Math.max(0, drag.originX + event.clientX - drag.startX),
      y: Math.max(0, drag.originY + event.clientY - drag.startY),
    });
  };
  const handlePointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  };

  const lockReason = debugLockReason(state);

  return (
    <section
      className="dock-window active"
      data-testid="debug-cheat-panel"
      style={{ position: 'fixed', top: 0, left: 0, transform: `translate3d(${position.x}px, ${position.y}px, 0)`, width: 420, height: 520, zIndex: 9500 }}
      aria-label="개발용 치트 패널"
    >
      <header
        className="dock-window-head"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <strong>디버그 치트 (개발 빌드 전용)</strong>
        <div className="dock-window-actions">
          <button type="button" aria-label="치트 패널 닫기" title="닫기 (`)" onClick={onClose}>×</button>
        </div>
      </header>
      <div className="dock-window-body" style={{ fontSize: 11 }}>
        <div style={{ marginBottom: 6, color: 'var(--muted)', lineHeight: 1.5 }}>
          {debugStateSummary(state)}
          <br />
          시나리오(길잡이) 진행 중에 쓰면 스텝 판정이 어긋날 수 있습니다.
          {lockReason ? <><br /><span style={{ color: 'var(--bad, #e08)' }}>잠금: {lockReason} — 시간 점프·사건 발화 불가</span></> : null}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginBottom: 7 }}>
          {SECTIONS.map(id => (
            <button
              key={id}
              type="button"
              style={{ ...buttonStyle, borderColor: section === id ? 'var(--accent)' : 'var(--border)', color: section === id ? 'var(--accent)' : 'var(--text)' }}
              onClick={() => setSection(id)}
            >{id}</button>
          ))}
        </div>

        {section === '자원' && <ResourceSection state={state} run={run} />}
        {section === '시간' && <TimeSection state={state} run={run} />}
        {section === '마을' && <SettlementSection state={state} run={run} />}
        {section === '스폰' && <SpawnSection state={state} run={run} />}
        {section === '사건' && <EventSection state={state} run={run} />}
        {section === '주민' && <ResidentSection state={state} run={run} />}
        {section === '지도' && (
          <MapSection state={state} run={run} aquiferLayer={aquiferLayer} oreLayer={oreLayer} onToggleMapLayer={onToggleMapLayer} />
        )}
        {section === '기타' && <MiscSection state={state} run={run} setStatus={setStatus} />}

        {status ? (
          <div style={{ marginTop: 8, paddingTop: 6, borderTop: '1px solid var(--border)', color: status.ok ? 'var(--accent)' : '#e08' }}>
            {status.ok ? '적용: ' : '실패: '}{status.text}
          </div>
        ) : null}
      </div>
    </section>
  );
}

type RunFn = (action: () => DebugResult) => void;

function ResourceSection({ state, run }: { state: GameState; run: RunFn }) {
  const [query, setQuery] = useState('');
  const [amount, setAmount] = useState('100');
  const [item, setItem] = useState<SpecialItemId>(DEBUG_SPECIAL_ITEM_IDS[0]);
  const filtered = useMemo(() => {
    const needle = query.trim();
    if (!needle) return DEBUG_RESOURCE_IDS;
    return DEBUG_RESOURCE_IDS.filter(id => resourceName(id).includes(needle) || id.toLowerCase().includes(needle.toLowerCase()));
  }, [query]);
  const parsed = Number(amount);
  const value = Number.isFinite(parsed) ? parsed : 0;

  return (
    <div>
      <Row label="검색">
        <input style={{ ...inputStyle, width: 110 }} value={query} onChange={event => setQuery(event.target.value)} placeholder="곡물 / grain" />
        <span style={labelStyle}>입력값</span>
        <input style={inputStyle} value={amount} onChange={event => setAmount(event.target.value)} />
        <DebugButton onClick={() => run(() => debugAddAllResources(state, value))}>전 자원 +입력값</DebugButton>
      </Row>
      <div style={{ maxHeight: 210, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 4, padding: 4 }}>
        {filtered.map((id: ResourceId) => (
          <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3 }}>
            <span style={{ flex: '1 1 auto', minWidth: 0 }}>{resourceName(id)}</span>
            <span style={{ width: 54, textAlign: 'right', color: 'var(--muted)' }}>{Math.round(state.resources[id] ?? 0)}</span>
            <DebugButton onClick={() => run(() => debugAddResource(state, id, 10))}>+10</DebugButton>
            <DebugButton onClick={() => run(() => debugAddResource(state, id, 100))}>+100</DebugButton>
            <DebugButton onClick={() => run(() => debugSetResource(state, id, value))} title="입력값으로 설정">=</DebugButton>
          </div>
        ))}
        {filtered.length === 0 ? <div style={{ color: 'var(--muted)' }}>검색 결과 없음</div> : null}
      </div>
      <Row label="기물함">
        <select style={selectStyle} value={item} onChange={event => setItem(event.target.value as SpecialItemId)}>
          {DEBUG_SPECIAL_ITEM_IDS.map(id => <option key={id} value={id}>{specialItemName(id)}</option>)}
        </select>
        <span style={{ color: 'var(--muted)' }}>보유 {state.specialItems[item] ?? 0}</span>
        <DebugButton onClick={() => run(() => debugGrantSpecialItem(state, item, 1))}>지급 +1</DebugButton>
      </Row>
    </div>
  );
}

function TimeSection({ state, run }: { state: GameState; run: RunFn }) {
  const [days, setDays] = useState('10');
  const [year, setYear] = useState('2');
  const [season, setSeason] = useState<Season>('spring');
  const [dayOfSeason, setDayOfSeason] = useState('1');

  return (
    <div>
      <Row label="현재">{debugDateLabel(state)} ({state.day}일차)</Row>
      <Row label="빨리감기">
        <DebugButton onClick={() => run(() => debugAdvanceDays(state, 1))}>+1일</DebugButton>
        <DebugButton onClick={() => run(() => debugAdvanceDays(state, 5))}>+5일</DebugButton>
        <DebugButton onClick={() => run(() => debugAdvanceDays(state, 12))}>+12일</DebugButton>
        <DebugButton onClick={() => run(() => debugAdvanceToNextSeason(state))}>다음 계절</DebugButton>
      </Row>
      <Row label="n일 점프">
        <input style={inputStyle} value={days} onChange={event => setDays(event.target.value)} />
        <DebugButton onClick={() => run(() => debugAdvanceDays(state, Number(days)))}>진행</DebugButton>
      </Row>
      <Row label="날짜 이동">
        <input style={{ ...inputStyle, width: 42 }} value={year} onChange={event => setYear(event.target.value)} title="연차" />
        <select style={selectStyle} value={season} onChange={event => setSeason(event.target.value as Season)}>
          {SEASON_ORDER.map(id => <option key={id} value={id}>{SEASON_NAMES[id]}</option>)}
        </select>
        <input style={{ ...inputStyle, width: 42 }} value={dayOfSeason} onChange={event => setDayOfSeason(event.target.value)} title="계절 내 일차" />
        <DebugButton onClick={() => run(() => debugJumpToDate(state, Number(year), season, Number(dayOfSeason)))}>이동</DebugButton>
      </Row>
      <div style={{ color: 'var(--muted)' }}>과거로는 갈 수 없습니다. 모달·전투가 열리면 그 자리에서 멈춥니다.</div>
    </div>
  );
}

function SettlementSection({ state, run }: { state: GameState; run: RunFn }) {
  const [reputation, setReputation] = useState('50');
  const [suspicion, setSuspicion] = useState('0');
  const [threat, setThreat] = useState('50');
  const [streak, setStreak] = useState('2');

  return (
    <div>
      <Row label="티어">
        <DebugButton onClick={() => run(() => debugPromote(state))}>승격</DebugButton>
        <DebugButton onClick={() => run(() => debugDemote(state))}>강등</DebugButton>
      </Row>
      <Row label="명성">
        <input style={inputStyle} value={reputation} onChange={event => setReputation(event.target.value)} />
        <DebugButton onClick={() => run(() => debugSetReputation(state, Number(reputation)))}>설정</DebugButton>
        <span style={{ color: 'var(--muted)' }}>현재 {Math.round(state.resources.reputation)}</span>
      </Row>
      <Row label="의심">
        <input style={inputStyle} value={suspicion} onChange={event => setSuspicion(event.target.value)} />
        <DebugButton onClick={() => run(() => debugSetSuspicion(state, Number(suspicion)))}>설정</DebugButton>
        <span style={{ color: 'var(--muted)' }}>현재 {Math.round(state.suspicion)}</span>
      </Row>
      <Row label="위협도">
        <input style={inputStyle} value={threat} onChange={event => setThreat(event.target.value)} />
        <DebugButton onClick={() => run(() => debugSetThreat(state, Number(threat)))}>설정</DebugButton>
        <span style={{ color: 'var(--muted)' }}>현재 {Math.round(state.threat)}</span>
      </Row>
      <Row label="세공 성실도">
        <input style={inputStyle} value={streak} onChange={event => setStreak(event.target.value)} />
        <DebugButton onClick={() => run(() => debugSetTributeStreak(state, Number(streak)))}>설정</DebugButton>
        <span style={{ color: 'var(--muted)' }}>현재 {state.tributePaidStreak}</span>
      </Row>
    </div>
  );
}

function SpawnSection({ state, run }: { state: GameState; run: RunFn }) {
  const [count, setCount] = useState('3');
  const [gender, setGender] = useState<Gender | 'random'>('random');
  const [ageBand, setAgeBand] = useState<DebugAgeBand>('random');
  const [job, setJob] = useState<JobId>('idle');
  const [special, setSpecial] = useState<SpecialResidentId>(DEBUG_SPECIAL_RESIDENT_IDS[0]);
  const [species, setSpecies] = useState<LivestockId>(DEBUG_LIVESTOCK_IDS[0]);
  const [heads, setHeads] = useState('2');

  return (
    <div>
      <Row label="주민">
        <input style={{ ...inputStyle, width: 42 }} value={count} onChange={event => setCount(event.target.value)} title="명수" />
        <select style={selectStyle} value={gender} onChange={event => setGender(event.target.value as Gender | 'random')}>
          <option value="random">성별 무작위</option>
          <option value="male">남</option>
          <option value="female">여</option>
        </select>
        <select style={selectStyle} value={ageBand} onChange={event => setAgeBand(event.target.value as DebugAgeBand)}>
          {AGE_BANDS.map(band => <option key={band} value={band}>{AGE_BAND_NAMES[band]}</option>)}
        </select>
        <select style={selectStyle} value={job} onChange={event => setJob(event.target.value as JobId)}>
          {JOB_ORDER.map(id => <option key={id} value={id}>{JOB_NAMES[id]}</option>)}
        </select>
        <DebugButton onClick={() => run(() => debugSpawnResidents(state, { count: Number(count), gender, ageBand, job }))}>스폰</DebugButton>
      </Row>
      <Row label="특수 주민">
        <select style={selectStyle} value={special} onChange={event => setSpecial(event.target.value as SpecialResidentId)}>
          {DEBUG_SPECIAL_RESIDENT_IDS.map(id => <option key={id} value={id}>{specialResidentName(id)}</option>)}
        </select>
        <DebugButton onClick={() => run(() => debugSpawnSpecialResident(state, special))}>합류</DebugButton>
      </Row>
      <Row label="가축">
        <select style={selectStyle} value={species} onChange={event => setSpecies(event.target.value as LivestockId)}>
          {DEBUG_LIVESTOCK_IDS.map(id => <option key={id} value={id}>{livestockName(id)}</option>)}
        </select>
        <input style={{ ...inputStyle, width: 42 }} value={heads} onChange={event => setHeads(event.target.value)} title="마리" />
        <DebugButton onClick={() => run(() => debugAcquireLivestock(state, species, Number(heads)))}>확보</DebugButton>
      </Row>
      <Row label="유민">
        <DebugButton onClick={() => run(() => debugOfferImmigration(state))}>제안 발화</DebugButton>
      </Row>
      <div style={{ color: 'var(--muted)' }}>가축은 빈 축사가 있어야 들어갑니다. 특수 주민은 게임당 1회입니다.</div>
    </div>
  );
}

function EventSection({ state, run }: { state: GameState; run: RunFn }) {
  const [power, setPower] = useState('8');
  const [warned, setWarned] = useState(false);

  return (
    <div>
      <Row label="습격">
        <input style={inputStyle} value={power} onChange={event => setPower(event.target.value)} title="전력" />
        <label style={{ display: 'flex', alignItems: 'center', gap: 3, color: 'var(--muted)' }}>
          <input type="checkbox" checked={warned} onChange={event => setWarned(event.target.checked)} />사전 경보
        </label>
        <DebugButton onClick={() => run(() => debugSpawnRaid(state, Number(power), warned))}>발화</DebugButton>
      </Row>
      <Row label="재해">
        {DISASTER_IDS.map(id => (
          <DebugButton key={id} onClick={() => run(() => debugStartDisaster(state, id))}>{DEBUG_DISASTER_NAMES[id]}</DebugButton>
        ))}
      </Row>
      <Row label="시설">
        <DebugButton onClick={() => run(() => debugStartFire(state))}>화재</DebugButton>
        <DebugButton onClick={() => run(() => debugStartMineCollapse(state, true))}>갱도 붕괴(전조)</DebugButton>
        <DebugButton onClick={() => run(() => debugStartMineCollapse(state, false))}>갱도 붕괴(즉시)</DebugButton>
      </Row>
      <Row label="역병">
        <DebugButton onClick={() => run(() => debugStartPlagueSuspicion(state))}>병자(의심)</DebugButton>
        <DebugButton onClick={() => run(() => debugStartEpidemic(state))}>역병 발병</DebugButton>
        <DebugButton onClick={() => run(() => debugStartLivestockEpidemic(state))}>가축 역병</DebugButton>
      </Row>
      <Row label="세공">
        <DebugButton onClick={() => run(() => debugAnnounceTribute(state))}>공지</DebugButton>
        <DebugButton onClick={() => run(() => debugCollectTribute(state))}>수거</DebugButton>
      </Row>
      <div style={{ color: 'var(--muted)' }}>
        확률·쿨다운·계절 게이트만 우회합니다. 발생 조건 대상(경작지·축사·채광갱 등)이 없으면 실패로 표시됩니다.
        공성 강제 개시는 방어 개편 P5 이후로 미뤘습니다.
      </div>
    </div>
  );
}

function ResidentSection({ state, run }: { state: GameState; run: RunFn }) {
  const living = state.residents.filter(resident => resident.alive);
  const [selected, setSelected] = useState<number>(living[0]?.id ?? 0);
  const [morale, setMorale] = useState('80');
  const id = living.some(resident => resident.id === selected) ? selected : (living[0]?.id ?? 0);

  return (
    <div>
      <Row label="대상">
        <select style={{ ...selectStyle, maxWidth: 190 }} value={id} onChange={event => setSelected(Number(event.target.value))}>
          {living.map(resident => (
            <option key={resident.id} value={resident.id}>
              {resident.name} · {JOB_NAMES[resident.job]} · 건강 {Math.round(resident.health)}{resident.sick ? ' · 병' : ''}
            </option>
          ))}
        </select>
      </Row>
      <Row label="선택 주민">
        <DebugButton onClick={() => run(() => debugHealResident(state, id))}>회복</DebugButton>
        <DebugButton onClick={() => run(() => debugSickenResident(state, id))}>발병</DebugButton>
        <DebugButton onClick={() => run(() => debugKillResident(state, id))}>사망</DebugButton>
      </Row>
      <Row label="전원">
        <DebugButton onClick={() => run(() => debugRestoreAllResidents(state))}>만복·회복</DebugButton>
        <input style={inputStyle} value={morale} onChange={event => setMorale(event.target.value)} title="사기" />
        <DebugButton onClick={() => run(() => debugSetAllMorale(state, Number(morale)))}>사기 설정</DebugButton>
      </Row>
    </div>
  );
}

function MapSection({ state, run, aquiferLayer, oreLayer, onToggleMapLayer }: {
  state: GameState;
  run: RunFn;
  aquiferLayer: boolean;
  oreLayer: boolean;
  onToggleMapLayer: (layer: 'aquifer' | 'ore') => void;
}) {
  return (
    <div>
      <Row label="탐사">
        <DebugButton onClick={() => run(() => debugRevealMap(state))}>전 지도 탐사 해제</DebugButton>
      </Row>
      <Row label="레이어">
        <DebugButton onClick={() => onToggleMapLayer('aquifer')}>수맥 {aquiferLayer ? '끄기' : '켜기'}</DebugButton>
        <DebugButton onClick={() => onToggleMapLayer('ore')}>광맥 {oreLayer ? '끄기' : '켜기'}</DebugButton>
      </Row>
      <Row label="비축">
        <DebugButton onClick={() => run(() => debugRefillGatheringStocks(state))}>서식지·어장·갯벌 리필</DebugButton>
      </Row>
      <div style={{ color: 'var(--muted)' }}>레이어 토글은 화면 표시 설정이라 저장 표식(debugTouched)을 남기지 않습니다.</div>
    </div>
  );
}

function MiscSection({ state, run, setStatus }: {
  state: GameState;
  run: RunFn;
  setStatus: (status: { ok: boolean; text: string }) => void;
}) {
  const [step, setStep] = useState('0');
  const copyDump = () => {
    const json = debugDumpState(state);
    const size = `${(json.length / 1024).toFixed(1)}KB`;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(json)
        .then(() => setStatus({ ok: true, text: `상태 JSON ${size} 클립보드 복사` }))
        .catch(() => {
          console.log(json);
          setStatus({ ok: true, text: `클립보드 실패 — 콘솔에 출력 (${size})` });
        });
      return;
    }
    console.log(json);
    setStatus({ ok: true, text: `상태 JSON ${size} 콘솔 출력` });
  };

  return (
    <div>
      <Row label="길잡이">
        <DebugButton onClick={() => run(() => debugResetGuides(state))}>seen 초기화</DebugButton>
      </Row>
      <Row label="시나리오">
        <select style={{ ...selectStyle, maxWidth: 200 }} value={step} onChange={event => setStep(event.target.value)}>
          {DEBUG_SCENARIO_STEP_TITLES.map((title, index) => (
            <option key={title} value={index}>{index + 1}. {title}</option>
          ))}
        </select>
        <DebugButton onClick={() => run(() => debugSetScenarioStep(state, Number(step)))}>이동</DebugButton>
        <DebugButton onClick={() => run(() => debugClearScenario(state))}>해제</DebugButton>
      </Row>
      <Row label="상태 덤프">
        <DebugButton onClick={copyDump}>JSON 복사</DebugButton>
      </Row>
      <div style={{ color: 'var(--muted)' }}>
        현재 시나리오: {state.scenario ? `${state.scenario.stepIndex + 1}단계` : '없음'} · 붙여넣기 로드는 범위 밖입니다.
      </div>
    </div>
  );
}
