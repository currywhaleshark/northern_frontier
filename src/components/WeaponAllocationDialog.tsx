import { JOB_NAMES } from '../game/constants';
import {
  COMBAT_WEAPON_IDS, COMBAT_WEAPON_NAMES, horseStock, MOUNT_NAMES, musketReadiness,
  residentDefenseContribution, resolvedMountAssignments, resolvedWeaponAssignments, weaponStock,
} from '../game/weapons';
import { createCombatRoster } from '../game/combatRoster';
import { CONFIG } from '../game/config';
import type { CombatWeaponId, GameState, MountId } from '../game/types';

interface Props {
  state: GameState;
  onAssign: (residentId: number, weapon: CombatWeaponId | null) => void;
  onAssignMount: (residentId: number, mount: MountId | null) => void;
  onAutoAssign: () => void;
  onClear: () => void;
  onClose: () => void;
}

export function WeaponAllocationDialog({
  state, onAssign, onAssignMount, onAutoAssign, onClear, onClose,
}: Props) {
  const assignments = resolvedWeaponAssignments(state);
  const mountAssignments = resolvedMountAssignments(state);
  const snapshots = new Map(createCombatRoster(state, { context: 'villageDefense' }).combatants
    .map(snapshot => [snapshot.residentId, snapshot]));
  const residents = state.residents
    .filter(resident => resident.alive &&
      (resident.job === 'militia' || resident.job === 'watchman' || resident.job === 'hunter'))
    .sort((a, b) => {
      const order = { militia: 0, watchman: 1, hunter: 2 } as const;
      return order[a.job as keyof typeof order] - order[b.job as keyof typeof order] || a.id - b.id;
    });
  const used: Record<CombatWeaponId, number> = { musket: 0, hornBow: 0, spear: 0 };
  for (const resident of residents) {
    const weapon = assignments[resident.id];
    if (weapon) used[weapon] += 1;
  }
  const mounted = residents.filter(resident => mountAssignments[resident.id] === 'horse').length;

  return (
    <div className="modal-overlay" role="presentation" onMouseDown={event => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <div className="modal weapon-allocation-dialog" role="dialog" aria-modal="true" aria-labelledby="weapon-allocation-title">
        <div className="weapon-allocation-heading">
          <div>
            <h2 id="weapon-allocation-title">병기고 무기·군마 배분</h2>
            <div className="muted small">
              {state.weaponAllocationMode === 'auto' ? '자동 배분 중' : '수동 배분 중'} · 현재 방어도 {state.resources.defense}
            </div>
          </div>
          <button type="button" className="icon-btn" aria-label="닫기" onClick={onClose}>×</button>
        </div>

        <div className="weapon-stock-grid">
          {COMBAT_WEAPON_IDS.map(weapon => (
            <div key={weapon} className="weapon-stock-card">
              <strong>{COMBAT_WEAPON_NAMES[weapon]}</strong>
              <span>{used[weapon]} / {weaponStock(state, weapon)} 배정</span>
              {weapon === 'musket' && (() => {
                const readiness = musketReadiness(
                  state,
                  residents.filter(resident => assignments[resident.id] === 'musket').map(resident => resident.id),
                  CONFIG.raid.powderPerMusket,
                );
                return <em>사격 가능 {readiness.ready} / 배정 {readiness.assigned}</em>;
              })()}
            </div>
          ))}
          <div className="weapon-stock-card mount-stock-card">
            <strong>{MOUNT_NAMES.horse}</strong>
            <span>{mounted} / {horseStock(state)} 배정</span>
            <em>무기와 별도 배정</em>
          </div>
        </div>

        <div className="weapon-allocation-actions">
          <button type="button" className="btn small primary" onClick={onAutoAssign}>자동 배분</button>
          <button type="button" className="btn small" onClick={onClear}>모두 해제</button>
          <span className="muted small">직접 변경하면 수동 배분으로 고정됩니다.</span>
        </div>

        <div className="weapon-allocation-list">
          {residents.length === 0 ? (
            <div className="muted small">무기를 배정할 수 있는 수비병·파수꾼·사냥꾼이 없습니다.</div>
          ) : residents.map(resident => {
            const current = assignments[resident.id] ?? '';
            const currentMount = mountAssignments[resident.id] ?? '';
            const snapshot = snapshots.get(resident.id);
            return (
              <label key={resident.id} className="weapon-allocation-row">
                <span>
                  <strong>{resident.name}</strong>
                  <small>
                    {JOB_NAMES[resident.job]} · {resident.task} · 건강 {Math.round(resident.health)} · 방어 기여 +
                    {snapshot ? snapshot.basePower + snapshot.weaponPower : 0}
                  </small>
                </span>
                <select
                  className="weapon-select"
                  value={current}
                  aria-label={`${resident.name} 무기`}
                  onChange={event => onAssign(
                    resident.id,
                    event.target.value ? event.target.value as CombatWeaponId : null,
                  )}
                >
                  <option value="">기본 무장</option>
                  {COMBAT_WEAPON_IDS.map(weapon => (
                    <option
                      key={weapon}
                      value={weapon}
                      disabled={current !== weapon && used[weapon] >= weaponStock(state, weapon)}
                    >
                      {COMBAT_WEAPON_NAMES[weapon]}
                      {weapon === 'musket' && state.resources.gunpowder <= 0 ? ' (화약 없음)' : ''}
                      {` · 방어 +${residentDefenseContribution(state, resident, weapon)}`}
                    </option>
                  ))}
                </select>
                <select
                  className="mount-select"
                  value={currentMount}
                  aria-label={`${resident.name} 탑승`}
                  onChange={event => onAssignMount(
                    resident.id,
                    event.target.value ? event.target.value as MountId : null,
                  )}
                >
                  <option value="">도보</option>
                  <option
                    value="horse"
                    disabled={currentMount !== 'horse' && mounted >= horseStock(state)}
                  >군마</option>
                </select>
              </label>
            );
          })}
        </div>
      </div>
    </div>
  );
}
