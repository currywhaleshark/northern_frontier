import { JOB_NAMES } from '../game/constants';
import {
  ARTIFACT_WEAPON_BASE_WEAPONS, ARTIFACT_WEAPON_NAMES, COMBAT_WEAPON_IDS, COMBAT_WEAPON_NAMES,
  artifactWeaponForResident, horseStock, MOUNT_NAMES, musketReadiness, residentDefenseContribution,
  resolvedArtifactWeaponAssignments, resolvedMountAssignments, resolvedWeaponAssignments, weaponStock,
} from '../game/weapons';
import { createCombatRoster } from '../game/combatRoster';
import { CONFIG } from '../game/config';
import { ARTIFACT_WEAPON_IDS, SPECIAL_ITEM_DEFS } from '../game/specialItems';
import type { ArtifactWeaponId, CombatWeaponId, GameState, MountId } from '../game/types';
import { UiIcon } from './UiIcon';

interface Props {
  state: GameState;
  onAssign: (residentId: number, weapon: CombatWeaponId | null) => void;
  onAssignArtifact: (residentId: number, item: ArtifactWeaponId | null) => void;
  onAssignMount: (residentId: number, mount: MountId | null) => void;
  onAutoAssign: () => void;
  onClear: () => void;
  onClose: () => void;
}

export function WeaponAllocationDialog({
  state, onAssign, onAssignArtifact, onAssignMount, onAutoAssign, onClear, onClose,
}: Props) {
  const assignments = resolvedWeaponAssignments(state);
  const artifactAssignments = resolvedArtifactWeaponAssignments(state);
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
          {ARTIFACT_WEAPON_IDS.filter(item => (state.specialItems[item] ?? 0) > 0).map(item => (
            <div key={item} className="weapon-stock-card artifact-weapon-stock-card">
              <strong><UiIcon name={SPECIAL_ITEM_DEFS[item].icon} size={18} /> {ARTIFACT_WEAPON_NAMES[item]}</strong>
              <span>{typeof artifactAssignments[item] === 'number' ? '1 / 1 배정' : '0 / 1 배정'}</span>
              <em>{COMBAT_WEAPON_NAMES[ARTIFACT_WEAPON_BASE_WEAPONS[item]]} 계열 ×1.25</em>
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
            const currentArtifact = artifactWeaponForResident(state, resident.id) ?? '';
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
                  disabled={currentArtifact !== ''}
                  title={currentArtifact ? '고유 무기를 먼저 해제해야 일반 무기를 배정할 수 있습니다.' : undefined}
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
                  className="weapon-select artifact-weapon-select"
                  value={currentArtifact}
                  aria-label={`${resident.name} 고유 무기`}
                  onChange={event => onAssignArtifact(
                    resident.id,
                    event.target.value ? event.target.value as ArtifactWeaponId : null,
                  )}
                >
                  <option value="">고유 무기 없음</option>
                  {ARTIFACT_WEAPON_IDS.filter(item => (state.specialItems[item] ?? 0) > 0).map(item => (
                    <option
                      key={item}
                      value={item}
                      disabled={currentArtifact !== item && typeof artifactAssignments[item] === 'number'}
                    >
                      {ARTIFACT_WEAPON_NAMES[item]} · {COMBAT_WEAPON_NAMES[ARTIFACT_WEAPON_BASE_WEAPONS[item]]} ×1.25
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
