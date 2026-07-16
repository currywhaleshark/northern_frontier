// 직업 배정 패널: 무직 풀에서 직업으로 +/-
import { BUILDING_DEFS } from '../game/buildings';
import { isJobUnlocked, JOB_DESC, JOB_NAMES, JOB_ORDER } from '../game/constants';
import { countJob } from '../game/residents';
import {
  AUTO_ASSIGN_BUILDING_TYPES,
  SLOTTED_BUILDING_CONFIG,
  type AutoAssignBuildingType,
} from '../game/workerSlots';
import {
  setAutoAssignBuildingTypes,
  toggleAutoAssignBuildingType,
  type UiPrefs,
} from '../ui/uiPrefs';
import type { GameState, JobId } from '../game/types';

const BUILDING_SLOT_JOBS = new Set(
  Object.values(SLOTTED_BUILDING_CONFIG).flatMap(config => config ? [config.job] : []),
);

interface Props {
  state: GameState;
  onReassign: (from: JobId, to: JobId) => void;
  uiPrefs: UiPrefs;
  onUiPrefsChange: (update: (current: UiPrefs) => UiPrefs) => void;
  onAutoAssign: (types: readonly AutoAssignBuildingType[]) => void;
}

export function JobPanel({ state, onReassign, uiPrefs, onUiPrefsChange, onAutoAssign }: Props) {
  const idle = countJob(state, 'idle');
  const selectedAutoAssignTypes = uiPrefs.autoAssignBuildingTypes;
  const allAutoAssignTypesSelected = selectedAutoAssignTypes.length === AUTO_ASSIGN_BUILDING_TYPES.length;
  return (
    <div className="dock-panel-content job-panel-content">
      <div className="dock-panel-summary">무직 {idle}명</div>
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
      {JOB_ORDER.filter(j => j !== 'idle' && isJobUnlocked(state.rank, j)).map(job => {
        const count = countJob(state, job);
        const unassigned = BUILDING_SLOT_JOBS.has(job)
          ? state.residents.filter(resident =>
            resident.alive && resident.job === job && resident.assignedBuildingId == null).length
          : null;
        return (
          <div className="job-row" key={job} title={JOB_DESC[job]}>
            <span>{JOB_NAMES[job]} {unassigned != null && <small>(미배정 {unassigned})</small>}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <button className="job-btn" disabled={count === 0} onClick={() => onReassign(job, 'idle')}>−</button>
              <span className="count">{count}</span>
              <button className="job-btn" disabled={idle === 0} onClick={() => onReassign('idle', job)}>＋</button>
            </span>
          </div>
        );
      })}
    </div>
  );
}
