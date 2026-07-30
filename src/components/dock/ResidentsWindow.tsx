import { useState } from 'react';
import { BUILDING_DEFS } from '../../game/buildings';
import { JOB_NAMES } from '../../game/constants';
import { LIFE_STAGE_NAMES } from '../../game/lifecycle';
import {
  ARTIFACT_WEAPON_NAMES, COMBAT_WEAPON_NAMES, artifactWeaponForResident,
} from '../../game/weapons';
import {
  filteredResidents, type ResidentJobFilter, type ResidentSort, type ResidentStatusFilter,
} from '../../ui/residentListPresentation';
import type { GameState, JobId, Resident } from '../../game/types';
import { UiIcon } from '../UiIcon';

function residentRoleLabel(resident: Resident): string {
  if (resident.stage === 'youth' && resident.religiousVocation === 'monk') return '동자승';
  if (resident.stage) return LIFE_STAGE_NAMES[resident.stage];
  return JOB_NAMES[resident.job];
}

function workplaceLabel(state: GameState, resident: Resident): string {
  if (!resident.alive) return '사망';
  if (resident.stage === 'youth' && resident.religiousVocation === 'monk') return '암자 수행 중';
  if (resident.stage) return '성장 중';
  const workplace = state.buildings.find(building => building.id === resident.assignedBuildingId);
  return workplace ? `${BUILDING_DEFS[workplace.type].name} 배정` : '근무지 없음';
}

const STATUS_FILTERS: readonly { id: ResidentStatusFilter; label: string }[] = [
  { id: 'all', label: '모든 상태' },
  { id: 'attention', label: '건강 주의' },
  { id: 'workplace', label: '근무지 없음' },
  { id: 'young', label: '아이 · 소년' },
  { id: 'special', label: '특수 주민' },
  { id: 'dead', label: '사망 기록' },
];

const SORT_OPTIONS: readonly { id: ResidentSort; label: string }[] = [
  { id: 'arrival', label: '입주 순' },
  { id: 'name', label: '이름순' },
  { id: 'health', label: '건강 낮은 순' },
  { id: 'job', label: '직업순' },
  { id: 'workplace', label: '근무지 없음 우선' },
];

interface Props {
  state: GameState;
  selectedResidentId: number | null;
  onSelectResident: (residentId: number) => void;
  onOpenWeaponAllocation: () => void;
}

export function ResidentsWindow({
  state,
  selectedResidentId,
  onSelectResident,
  onOpenWeaponAllocation,
}: Props) {
  const [query, setQuery] = useState('');
  const [jobFilter, setJobFilter] = useState<ResidentJobFilter>('all');
  const [statusFilter, setStatusFilter] = useState<ResidentStatusFilter>('all');
  const [sort, setSort] = useState<ResidentSort>('arrival');
  const moraleFactors = (state.moraleFactors ?? []).filter(factor => factor.unlocked && factor.delta !== 0);
  const hasReligiousResidents = state.residents.some(resident =>
    resident.religiousVocation != null ||
    resident.job === 'shaman' ||
    resident.job === 'monk');
  const presentJobs = [...new Set(state.residents.map(resident => resident.job))]
    .filter(job => job !== 'shaman' && job !== 'monk')
    .sort((left, right) => JOB_NAMES[left].localeCompare(JOB_NAMES[right], 'ko-KR'));
  const jobOptions: Array<{ id: Exclude<ResidentJobFilter, 'all'>; label: string }> = [
    ...(hasReligiousResidents || jobFilter === 'religious'
      ? [{ id: 'religious' as const, label: '종교인' }]
      : []),
    ...presentJobs.map((job: JobId) => ({ id: job, label: JOB_NAMES[job] })),
  ];
  const visibleResidents = filteredResidents(state, {
    query,
    job: jobFilter,
    status: statusFilter,
    sort,
  });
  const selectedHidden = selectedResidentId != null && !visibleResidents.some(resident => resident.id === selectedResidentId);
  return (
    <div>
      <div className="panel-title">민심 내역</div>
      {moraleFactors.map(factor => (
        <div key={factor.id} className="small" style={{ color: factor.delta > 0 ? '#6fbf73' : '#e06c5c' }}>
          {factor.delta > 0 ? <UiIcon name="success" size={17} /> : '·'} {factor.label} ({factor.delta > 0 ? '+' : ''}{factor.delta})
        </div>
      ))}
      <button type="button" className="btn small weapon-allocation-open" onClick={onOpenWeaponAllocation} style={{ marginTop: 6 }}>
        <UiIcon name="arsenal" size={20} /> 병기고 무기·군마 배분
      </button>
      <div className="resident-list-controls" aria-label="주민 목록 필터와 정렬">
        <label>
          <span>이름</span>
          <input
            type="search"
            value={query}
            placeholder="이름 찾기"
            aria-label="주민 이름 찾기"
            onChange={event => setQuery(event.target.value)}
          />
        </label>
        <label>
          <span>직업</span>
          <select aria-label="주민 직업 필터" value={jobFilter} onChange={event => setJobFilter(event.target.value as ResidentJobFilter)}>
            <option value="all">모든 직업</option>
            {jobOptions.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>
        </label>
        <label>
          <span>상태</span>
          <select aria-label="주민 상태 필터" value={statusFilter} onChange={event => setStatusFilter(event.target.value as ResidentStatusFilter)}>
            {STATUS_FILTERS.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>
        </label>
        <label>
          <span>정렬</span>
          <select aria-label="주민 정렬 기준" value={sort} onChange={event => setSort(event.target.value as ResidentSort)}>
            {SORT_OPTIONS.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>
        </label>
      </div>
      <div className="resident-list-summary" aria-live="polite">
        {visibleResidents.length}/{state.residents.length}명 표시
        {selectedHidden && <span> · 선택한 주민은 현재 필터에 숨겨져 있습니다</span>}
      </div>
      <div className="dock-resident-list" aria-label="주민 목록">
        {visibleResidents.map(resident => (
          <button
            key={resident.id}
            type="button"
            className={`resident-row${resident.alive ? '' : ' dead'}${resident.id === selectedResidentId ? ' selected' : ''}`}
            disabled={!resident.alive}
            onClick={() => onSelectResident(resident.id)}
          >
            <span>{resident.special && <><UiIcon name="important" size={18} /> </>}{resident.name}{resident.sick && <> <UiIcon name="sick" size={18} /></>}{state.day < (resident.quarantinedUntil ?? 0) ? ' · 격리' : ''}</span>
            <span className="muted">{resident.alive ? <>
              {resident.cartEquipped && <><UiIcon name="cart" size={18} /> </>}
              {residentRoleLabel(resident)} · {workplaceLabel(state, resident)}
              {artifactWeaponForResident(state, resident.id)
                ? ` · ${ARTIFACT_WEAPON_NAMES[artifactWeaponForResident(state, resident.id)!]}`
                : state.weaponAssignments[resident.id]
                  ? ` · ${COMBAT_WEAPON_NAMES[state.weaponAssignments[resident.id]!]}`
                  : ''}
              {state.mountAssignments[resident.id] && <> · <UiIcon name="mounted" size={18} /> 기마</>}
            </> : '사망'}</span>
          </button>
        ))}
        {visibleResidents.length === 0 && <div className="resident-list-empty">현재 필터에 맞는 주민이 없습니다.</div>}
      </div>
    </div>
  );
}
