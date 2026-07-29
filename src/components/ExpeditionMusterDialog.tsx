import { useState } from 'react';
import { computeDefense } from '../game/buildings';
import { JOB_NAMES } from '../game/constants';
import {
  availableExpeditionResidents, expeditionMusterPreview, expeditionStateBlockReason, predatorExpeditionTarget,
} from '../game/expedition';
import { isForeignSiteOperational } from '../game/foreignSites';
import { expeditionEnemyIntel } from '../game/expeditionIntel';
import { banditLairRaidChance } from '../game/siteDiplomacy';
import { predatorHuntChance } from '../game/specialEvents';
import {
  ARTIFACT_WEAPON_NAMES, COMBAT_WEAPON_IDS, COMBAT_WEAPON_NAMES, artifactWeaponForResident,
  resolvedWeaponAssignments, weaponStock,
} from '../game/weapons';
import type { CombatWeaponId, GameState, PredatorKind } from '../game/types';

export type ExpeditionMusterRequest =
  | { kind: 'lairAssault'; siteId: number }
  | { kind: 'predatorHunt'; predatorKind: PredatorKind };

interface Props {
  state: GameState;
  request: ExpeditionMusterRequest;
  onAssignWeapon: (residentId: number, weapon: CombatWeaponId | null) => void;
  onConfirm: (memberIds: number[]) => string | null;
  onClose: () => void;
}

type CombatRole = 'militia' | 'watchman' | 'hunter';

const ROLE_ORDER: CombatRole[] = ['militia', 'watchman', 'hunter'];

function predatorName(kind: PredatorKind): string {
  return kind === 'wolf' ? '늑대 떼' : '호랑이';
}

export function ExpeditionMusterDialog({
  state, request, onAssignWeapon, onConfirm, onClose,
}: Props) {
  const available = availableExpeditionResidents(state);
  const assignments = resolvedWeaponAssignments(state);
  const [selectedIds, setSelectedIds] = useState<number[]>(() => available.map(resident => resident.id));
  const [submitError, setSubmitError] = useState<string | null>(null);
  const availableIds = new Set(available.map(resident => resident.id));
  const selected = selectedIds.filter(id => availableIds.has(id));
  const selectedSet = new Set(selected);

  const targetSite = request.kind === 'lairAssault'
    ? state.foreignSites.find(site => site.id === request.siteId && site.type === 'banditLair')
    : null;
  const predatorTarget = request.kind === 'predatorHunt'
    ? predatorExpeditionTarget(state, request.predatorKind)
    : null;
  const targetError = request.kind === 'lairAssault'
    ? !targetSite
      ? '토벌할 산채를 찾을 수 없습니다.'
      : !targetSite.discovered
        ? '위치를 확인한 산채만 토벌할 수 있습니다.'
        : !isForeignSiteOperational(targetSite)
          ? '이미 비어 있거나 불탄 산채입니다.'
          : null
    : !state.incidents.predatorThreats[request.predatorKind]
      ? '현재 추적 중인 맹수가 없습니다.'
      : !predatorTarget
        ? '토벌대가 향할 활성 짐승 서식지가 없습니다.'
        : null;
  const stateError = expeditionStateBlockReason(state);
  const selectionError = selected.length < 2 ? '토벌대는 최소 2명이어야 합니다.' : null;
  const blockingError = targetError ?? stateError ?? selectionError;

  const musterPreview = expeditionMusterPreview(state, selected);
  const currentDefense = computeDefense(state);
  const remainingDefense = computeDefense(state, {
    excludedResidentIds: selected,
    gunpowderAvailable: musterPreview.remainingGunpowder,
  });
  const expeditionPower = musterPreview.expeditionPower;
  const successChance = request.kind === 'lairAssault'
    ? banditLairRaidChance(state, request.siteId, selected)
    : predatorHuntChance(state, request.predatorKind, selected);
  const enemyIntel = expeditionEnemyIntel(state, request);
  const successText = enemyIntel.precision === 'unknown'
    ? '???'
    : enemyIntel.precision === 'rough'
      ? `약 ${Math.round(successChance * 20) * 5}%`
      : `${Math.round(successChance * 100)}%`;

  const remainingWeapons = musterPreview.remainingWeapons;
  const previewByResidentId = new Map(
    [...musterPreview.expeditionCombatants, ...musterPreview.remainingCombatants]
      .map(combatant => [combatant.residentId, combatant]),
  );
  const used: Record<CombatWeaponId, number> = { musket: 0, hornBow: 0, spear: 0 };
  for (const resident of state.residents) {
    if (!resident.alive) continue;
    const weapon = assignments[resident.id];
    if (weapon) used[weapon] += 1;
  }

  const targetName = request.kind === 'lairAssault'
    ? targetSite?.name ?? '알 수 없는 산채'
    : `${predatorName(request.predatorKind)} 서식지`;

  const toggleResident = (residentId: number) => {
    setSubmitError(null);
    setSelectedIds(current => current.includes(residentId)
      ? current.filter(id => id !== residentId)
      : [...current, residentId]);
  };

  const changeRoleCount = (role: CombatRole, delta: number) => {
    const roleIds = available.filter(resident => resident.job === role).map(resident => resident.id);
    const selectedRoleIds = roleIds.filter(id => selectedSet.has(id));
    if (delta > 0) {
      const next = roleIds.find(id => !selectedSet.has(id));
      if (next != null) setSelectedIds(current => [...current, next]);
    } else {
      const remove = selectedRoleIds[selectedRoleIds.length - 1];
      if (remove != null) setSelectedIds(current => current.filter(id => id !== remove));
    }
    setSubmitError(null);
  };

  const confirm = () => {
    if (blockingError) {
      setSubmitError(blockingError);
      return;
    }
    setSubmitError(onConfirm(selected));
  };

  return (
    <div className="modal-overlay" role="presentation" onMouseDown={event => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <div className="modal expedition-muster-dialog" role="dialog" aria-modal="true" aria-labelledby="expedition-muster-title">
        <div className="expedition-muster-heading">
          <div>
            <div className="expedition-muster-kicker">목표 · {targetName}</div>
            <h2 id="expedition-muster-title">토벌대 편성</h2>
            <div className="muted small">전투 인원을 빼면 마을 방어와 잔류 무장도 함께 줄어듭니다.</div>
          </div>
          <button type="button" className="icon-btn" aria-label="닫기" onClick={onClose}>×</button>
        </div>

        <div className="expedition-role-grid">
          {ROLE_ORDER.map(role => {
            const total = available.filter(resident => resident.job === role).length;
            const count = available.filter(resident => resident.job === role && selectedSet.has(resident.id)).length;
            return (
              <div key={role} className="expedition-role-card">
                <span>{JOB_NAMES[role]}</span>
                <div>
                  <button type="button" aria-label={`${JOB_NAMES[role]} 한 명 제외`} onClick={() => changeRoleCount(role, -1)} disabled={count === 0}>−</button>
                  <strong>{count} / {total}</strong>
                  <button type="button" aria-label={`${JOB_NAMES[role]} 한 명 추가`} onClick={() => changeRoleCount(role, 1)} disabled={count === total}>+</button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="expedition-preview-grid">
          <div><span>출정 인원</span><strong>{selected.length}명</strong></div>
          <div><span>원정 전력</span><strong>{Math.round(expeditionPower)}</strong></div>
          <div><span>조총 준비</span><strong>{musterPreview.expeditionWeapons.readyMuskets} / 배정 {musterPreview.expeditionWeapons.assignedMuskets}</strong></div>
          <div><span>예상 성공</span><strong>{successText}</strong></div>
          <div className={remainingDefense < currentDefense * 0.6 ? 'danger' : ''}>
            <span>마을 방어도</span><strong>{Math.round(currentDefense)} → {Math.round(remainingDefense)}</strong>
          </div>
        </div>
        {musterPreview.expeditionWeapons.dryMuskets > 0 && (
          <div className="muted small expedition-powder-warning">
            화약 부족으로 {musterPreview.expeditionWeapons.dryMuskets}명은 기본 전력만 발휘
          </div>
        )}

        <div className={`expedition-enemy-intel ${enemyIntel.precision}`}>
          <div className="expedition-enemy-intel-heading">
            <span>적 정보</span>
            <strong>{enemyIntel.precisionLabel}</strong>
          </div>
          <div className="expedition-enemy-intel-values">
            <b>{enemyIntel.sizeText}</b>
            <b>{enemyIntel.powerText}</b>
          </div>
          <p>{enemyIntel.detail}</p>
        </div>

        <div className="expedition-remaining-weapons">
          <span>잔류 무장</span>
          <strong>조총 준비 {remainingWeapons.readyMuskets} / 배정 {remainingWeapons.assignedMuskets}</strong>
          <strong>각궁 {remainingWeapons.hornBows}</strong>
          <strong>창 {remainingWeapons.spears}</strong>
          <strong>기본 무장 {remainingWeapons.unarmed}</strong>
          {remainingWeapons.dryMuskets > 0 && (
            <em>화약 부족으로 {remainingWeapons.dryMuskets}명은 기본 전력만 발휘</em>
          )}
        </div>

        <div className="expedition-muster-actions">
          <button type="button" className="btn small" onClick={() => setSelectedIds(available.map(resident => resident.id))}>전원 편성</button>
          <button type="button" className="btn small" onClick={() => setSelectedIds([])}>모두 제외</button>
          <span className="muted small">체크로 개별 인원도 조절할 수 있습니다.</span>
        </div>

        <div className="expedition-member-list">
          {available.length === 0 ? (
            <div className="muted small expedition-empty">출정 가능한 건강한 수비병·파수꾼·사냥꾼이 없습니다.</div>
          ) : ROLE_ORDER.map(role => {
            const residents = available.filter(resident => resident.job === role);
            if (residents.length === 0) return null;
            return (
              <section key={role} className="expedition-member-group">
                <h3>{JOB_NAMES[role]}</h3>
                {residents.map(resident => {
                  const current = assignments[resident.id] ?? '';
                  const artifactWeapon = artifactWeaponForResident(state, resident.id);
                  const combatant = previewByResidentId.get(resident.id);
                  const personalPower = combatant ? combatant.basePower + combatant.weaponPower : 0;
                  const musketStatus = combatant?.assignedWeapon === 'musket'
                    ? combatant.readyWeapon === 'musket' ? ' · 조총 준비' : ' · 조총 배정·화약 부족'
                    : '';
                  return (
                    <div key={resident.id} className={`expedition-member-row ${selectedSet.has(resident.id) ? 'selected' : ''}`}>
                      <label>
                        <input
                          type="checkbox"
                          checked={selectedSet.has(resident.id)}
                          onChange={() => toggleResident(resident.id)}
                        />
                        <span>
                          <strong>{resident.name}</strong>
                          <small>
                            건강 {Math.round(resident.health)} · {resident.task} · 전력 +
                            {Math.round(personalPower)}{musketStatus}
                          </small>
                        </span>
                      </label>
                      <select
                        value={current}
                        aria-label={`${resident.name} 무기`}
                        disabled={artifactWeapon != null}
                        title={artifactWeapon ? `${ARTIFACT_WEAPON_NAMES[artifactWeapon]} 장착 중` : undefined}
                        onChange={event => onAssignWeapon(
                          resident.id,
                          event.target.value ? event.target.value as CombatWeaponId : null,
                        )}
                      >
                        <option value="">{artifactWeapon ? `고유무기: ${ARTIFACT_WEAPON_NAMES[artifactWeapon]}` : '기본 무장'}</option>
                        {COMBAT_WEAPON_IDS.map(weapon => (
                          <option
                            key={weapon}
                            value={weapon}
                            disabled={current !== weapon && used[weapon] >= weaponStock(state, weapon)}
                          >
                            {COMBAT_WEAPON_NAMES[weapon]}
                            {weapon === 'musket' && state.resources.gunpowder <= 0 ? ' (화약 없음)' : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </section>
            );
          })}
        </div>

        {(submitError ?? blockingError) && (
          <div className="expedition-muster-error" role="alert">{submitError ?? blockingError}</div>
        )}
        <div className="expedition-muster-footer">
          <button type="button" className="btn" onClick={onClose}>취소</button>
          <button type="button" className="btn primary" onClick={confirm} disabled={blockingError != null}>
            {selected.length}명 소집 확정
          </button>
        </div>
      </div>
    </div>
  );
}
