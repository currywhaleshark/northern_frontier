// 직업 배정 패널: 직업별 상세 화면에서 주민을 직접 골라 배정·해제한다.
import { withJosa } from '../game/josa';
import { useState } from 'react';
import { BUILDING_DEFS } from '../game/buildings';
import { isJobUnlocked, JOB_DESC, JOB_NAMES, JOB_ORDER } from '../game/constants';
import { isLiterateJob } from '../game/education';
import { residentDisplayAge } from '../game/lifecycle';
import { jobWorkforceCounts } from '../game/residents';
import { canResidentTakeJob } from '../game/youth';
import {
  AUTO_ASSIGN_BUILDING_TYPES,
  isResidentAvailableForWorkerSlot,
  SLOTTED_BUILDING_CONFIG,
  type AutoAssignBuildingType,
} from '../game/workerSlots';
import {
  setAutoAssignBuildingTypes,
  toggleAutoAssignBuildingType,
  type UiPrefs,
} from '../ui/uiPrefs';
import type { GameState, JobId, Resident } from '../game/types';
import { UiIcon } from './UiIcon';

const BUILDING_SLOT_JOBS = new Set(
  Object.values(SLOTTED_BUILDING_CONFIG).flatMap(config => config ? [config.job] : []),
);

interface Props {
  state: GameState;
  onReassign: (from: JobId, to: JobId) => void;
  onSetResidentJobs: (residentIds: readonly number[], job: JobId) => void;
  uiPrefs: UiPrefs;
  onUiPrefsChange: (update: (current: UiPrefs) => UiPrefs) => void;
  onAutoAssign: (types: readonly AutoAssignBuildingType[]) => void;
}

function jobSkill(resident: Resident, job: JobId): number {
  return resident.skills[job] ?? 0;
}

function byJobSkill(job: JobId) {
  return (left: Resident, right: Resident) =>
    jobSkill(right, job) - jobSkill(left, job) ||
    left.name.localeCompare(right.name, 'ko-KR') ||
    left.id - right.id;
}

function assignmentBlockReason(resident: Resident, job: JobId): string | null {
  if (resident.special) return '고정 직업';
  if (resident.religiousVocation) return '종교 소명 고정';
  if (!canResidentTakeJob(resident, job)) {
    return resident.stage === 'youth' ? '소년 배정 불가' : '아직 일을 맡길 수 없음';
  }
  if (isLiterateJob(job) && resident.literate !== true) return '문해 필요';
  return null;
}

function ResidentAssignmentRow({
  resident,
  job,
  checked,
  disabledReason,
  tutorialAnchor,
  onToggle,
}: {
  resident: Resident;
  job: JobId;
  checked: boolean;
  disabledReason: string | null;
  tutorialAnchor?: string;
  onToggle: () => void;
}) {
  return (
    <label
      className={`job-assignment-row${disabledReason ? ' disabled' : ''}`}
      title={disabledReason ?? `${JOB_NAMES[job]} 숙련 ${Math.round(jobSkill(resident, job) * 100)}%`}
      data-tut={tutorialAnchor}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabledReason != null}
        onChange={onToggle}
      />
      <span className="job-assignment-name">
        <strong>{resident.name}</strong>
        {disabledReason && <small>{disabledReason}</small>}
      </span>
      <span>{residentDisplayAge(resident)}세</span>
      <span className="job-assignment-skill">숙련 {Math.round(jobSkill(resident, job) * 100)}%</span>
    </label>
  );
}

function toggleSelected(
  selected: ReadonlySet<number>,
  id: number,
  setSelected: (next: Set<number>) => void,
) {
  const next = new Set(selected);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  setSelected(next);
}

export function JobPanel({
  state,
  onReassign,
  onSetResidentJobs,
  uiPrefs,
  onUiPrefsChange,
  onAutoAssign,
}: Props) {
  const [selectedJob, setSelectedJob] = useState<JobId | null>(null);
  const [selectedAssignedIds, setSelectedAssignedIds] = useState<Set<number>>(() => new Set());
  const [selectedIdleIds, setSelectedIdleIds] = useState<Set<number>>(() => new Set());
  const idle = jobWorkforceCounts(state, 'idle');
  const selectedAutoAssignTypes = uiPrefs.autoAssignBuildingTypes;
  const allAutoAssignTypesSelected = selectedAutoAssignTypes.length === AUTO_ASSIGN_BUILDING_TYPES.length;

  const openJobDetail = (job: JobId) => {
    setSelectedJob(job);
    setSelectedAssignedIds(new Set());
    setSelectedIdleIds(new Set());
  };

  if (selectedJob) {
    const gated = isLiterateJob(selectedJob);
    const assignedResidents = state.residents
      .filter(resident => resident.alive && resident.job === selectedJob)
      .sort(byJobSkill(selectedJob));
    const idleResidents = state.residents
      .filter(resident => resident.alive && resident.job === 'idle')
      .sort(byJobSkill(selectedJob));
    const removableIds = assignedResidents
      .filter(resident => !resident.special)
      .map(resident => resident.id);
    const assignableIds = idleResidents
      .filter(resident => assignmentBlockReason(resident, selectedJob) == null)
      .map(resident => resident.id);
    const allRemovableSelected = removableIds.length > 0 &&
      removableIds.every(id => selectedAssignedIds.has(id));
    const allAssignableSelected = assignableIds.length > 0 &&
      assignableIds.every(id => selectedIdleIds.has(id));
    const firstAssignableId = assignableIds[0];

    const unassignSelected = () => {
      if (selectedAssignedIds.size === 0) return;
      onSetResidentJobs([...selectedAssignedIds], 'idle');
      setSelectedAssignedIds(new Set());
    };
    const assignSelected = () => {
      if (selectedIdleIds.size === 0) return;
      onSetResidentJobs([...selectedIdleIds], selectedJob);
      setSelectedIdleIds(new Set());
    };

    return (
      <div className="dock-panel-content job-panel-content job-detail-panel">
        <button
          type="button"
          className="job-detail-back"
          onClick={() => setSelectedJob(null)}
        >← 직업 목록</button>
        <div className="job-detail-heading">
          <div>
            <h3>{JOB_NAMES[selectedJob]} 상세 배정</h3>
            <p>{JOB_DESC[selectedJob]}{gated ? ' · 문해자 전용' : ''}</p>
          </div>
          <strong>{assignedResidents.length}명</strong>
        </div>

        <section className="job-assignment-section" aria-labelledby="assigned-residents-title">
          <div className="job-assignment-section-head">
            <strong id="assigned-residents-title">현재 {JOB_NAMES[selectedJob]}</strong>
            <button
              type="button"
              disabled={removableIds.length === 0}
              onClick={() => setSelectedAssignedIds(
                allRemovableSelected ? new Set() : new Set(removableIds),
              )}
            >{allRemovableSelected ? '전체 해제' : '전체 선택'}</button>
          </div>
          <div className="job-assignment-columns" aria-hidden="true">
            <span />
            <span>이름</span>
            <span>나이</span>
            <span>해당 직업 숙련도</span>
          </div>
          <div className="job-assignment-list">
            {assignedResidents.length === 0 && (
              <div className="job-assignment-empty">현재 배정된 주민이 없습니다.</div>
            )}
            {assignedResidents.map(resident => (
              <ResidentAssignmentRow
                key={resident.id}
                resident={resident}
                job={selectedJob}
                checked={selectedAssignedIds.has(resident.id)}
                disabledReason={resident.special ? '고정 직업' : null}
                onToggle={() => toggleSelected(
                  selectedAssignedIds,
                  resident.id,
                  setSelectedAssignedIds,
                )}
              />
            ))}
          </div>
        </section>

        <div className="job-assignment-transfer" aria-label="선택한 주민 직업 이동">
          <button
            type="button"
            disabled={selectedAssignedIds.size === 0}
            onClick={unassignSelected}
          >↓ 선택 해제 {selectedAssignedIds.size > 0 && `${selectedAssignedIds.size}명`}</button>
          <button
            type="button"
            disabled={selectedIdleIds.size === 0}
            data-tut={selectedIdleIds.size > 0 ? `job-assign-selected-${selectedJob}` : undefined}
            onClick={assignSelected}
          >↑ 선택 배정 {selectedIdleIds.size > 0 && `${selectedIdleIds.size}명`}</button>
        </div>

        <section className="job-assignment-section" aria-labelledby="idle-residents-title">
          <div className="job-assignment-section-head">
            <strong id="idle-residents-title">무직자</strong>
            <button
              type="button"
              disabled={assignableIds.length === 0}
              onClick={() => setSelectedIdleIds(
                allAssignableSelected ? new Set() : new Set(assignableIds),
              )}
            >{allAssignableSelected ? '전체 해제' : '배정 가능 전체 선택'}</button>
          </div>
          <div className="job-assignment-columns" aria-hidden="true">
            <span />
            <span>이름</span>
            <span>나이</span>
            <span>해당 직업 숙련도</span>
          </div>
          <div className="job-assignment-list">
            {idleResidents.length === 0 && (
              <div className="job-assignment-empty">무직 주민이 없습니다.</div>
            )}
            {idleResidents.map(resident => {
              const disabledReason = assignmentBlockReason(resident, selectedJob);
              return (
                <ResidentAssignmentRow
                  key={resident.id}
                  resident={resident}
                  job={selectedJob}
                  checked={selectedIdleIds.has(resident.id)}
                  disabledReason={disabledReason}
                  tutorialAnchor={
                    selectedIdleIds.size === 0 && resident.id === firstAssignableId
                      ? `job-candidate-${selectedJob}`
                      : undefined
                  }
                  onToggle={() => toggleSelected(
                    selectedIdleIds,
                    resident.id,
                    setSelectedIdleIds,
                  )}
                />
              );
            })}
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="dock-panel-content job-panel-content">
      <div className="dock-panel-summary">
        무직 <strong>성인 {idle.adult}명</strong> · 소년 {idle.youth}명
      </div>
      <div className="auto-assign-panel">
        <div className="auto-assign-head">
          <span>건물 자동 배정 <small>선택 {selectedAutoAssignTypes.length}/{AUTO_ASSIGN_BUILDING_TYPES.length}</small></span>
          <button
            type="button"
            className="auto-assign-run"
            disabled={selectedAutoAssignTypes.length === 0}
            title="기존 건물 배정은 유지하고, 같은 직업의 미배정 주민을 선택한 시설의 빈 자리에 배치합니다."
            onClick={() => onAutoAssign(selectedAutoAssignTypes)}
          >자동 배치</button>
        </div>
        <details className="auto-assign-settings">
          <summary>대상 건물 설정</summary>
          <div className="auto-assign-actions">
            <button
              type="button"
              disabled={allAutoAssignTypesSelected}
              onClick={() => onUiPrefsChange(current => setAutoAssignBuildingTypes(current, AUTO_ASSIGN_BUILDING_TYPES))}
            >모두 체크</button>
            <button
              type="button"
              disabled={selectedAutoAssignTypes.length === 0}
              onClick={() => onUiPrefsChange(current => setAutoAssignBuildingTypes(current, []))}
            >모두 해제</button>
          </div>
          <div className="auto-assign-types" role="group" aria-label="자동 배정 건물 종류">
            {AUTO_ASSIGN_BUILDING_TYPES.map(type => (
              <label key={type}>
                <input
                  type="checkbox"
                  checked={selectedAutoAssignTypes.includes(type)}
                  onChange={() => onUiPrefsChange(current => toggleAutoAssignBuildingType(current, type))}
                />
                <span>{BUILDING_DEFS[type].name}</span>
              </label>
            ))}
          </div>
        </details>
      </div>
      {JOB_ORDER.filter(job => job !== 'idle' && isJobUnlocked(state.rank, job, state.worldSetup?.region)).map(job => {
        const count = jobWorkforceCounts(state, job);
        const gated = isLiterateJob(job);
        const assignableIdle = state.residents.filter(resident =>
          resident.alive && resident.job === 'idle' &&
          assignmentBlockReason(resident, job) == null).length;
        const unassigned = BUILDING_SLOT_JOBS.has(job)
          ? state.residents.filter(resident =>
            resident.job === job && resident.assignedBuildingId == null &&
            isResidentAvailableForWorkerSlot(state, resident)).length
          : null;
        return (
          <div
            className="job-row"
            key={job}
            title={`${JOB_DESC[job]}${gated ? '\n문해자 전용 — 글을 아는 주민만 맡습니다' : ''}`}
          >
            <button
              type="button"
              className="job-row-detail"
              data-tut={`job-detail-${job}`}
              onClick={() => openJobDetail(job)}
              title={`${JOB_NAMES[job]} 상세 배정 열기`}
            >
              <span>
                {JOB_NAMES[job]}
                {gated && <span aria-label="문해자 전용" title="문해자 전용"> <UiIcon name="literate" size={18} /></span>}
                {unassigned != null && <small> (배치 가능 {unassigned})</small>}
                <small className="job-detail-hint">상세 배정 · 무직 후보 {assignableIdle}</small>
              </span>
              <span aria-hidden="true">›</span>
            </button>
            <span className="job-controls">
              <button
                type="button"
                className="job-btn"
                disabled={count.total === 0}
                title={`${JOB_NAMES[job]} 1명을 무직으로 전환`}
                onClick={() => onReassign(job, 'idle')}
              >−</button>
              <span className="job-count-breakdown" aria-label={`성인 ${count.adult}명, 소년 ${count.youth}명`}>
                <span>성인 <strong>{count.adult}</strong></span>
                <small>소년 {count.youth}</small>
              </span>
              <button
                type="button"
                className="job-btn"
                data-tut={`job-plus-${job}`}
                disabled={assignableIdle === 0}
                title={assignableIdle === 0
                  ? gated ? '무직 문해자가 없습니다' : '이 직업을 맡을 수 있는 무직 주민이 없습니다'
                  : `무직 주민 1명을 ${withJosa(JOB_NAMES[job], '으로/로')} 배정`}
                onClick={() => onReassign('idle', job)}
              >＋</button>
            </span>
          </div>
        );
      })}
    </div>
  );
}
