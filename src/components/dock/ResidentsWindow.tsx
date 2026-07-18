import { JOB_NAMES } from '../../game/constants';
import { LIFE_STAGE_NAMES } from '../../game/lifecycle';
import { COMBAT_WEAPON_NAMES } from '../../game/weapons';
import type { GameState, Resident } from '../../game/types';

function residentRoleLabel(state: GameState, resident: Resident): string {
  if (resident.stage) return LIFE_STAGE_NAMES[resident.stage];
  return JOB_NAMES[resident.job];
}

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
  const moraleFactors = (state.moraleFactors ?? []).filter(factor => factor.unlocked && factor.delta !== 0);
  const lockedFactors = (state.moraleFactors ?? []).filter(factor => !factor.unlocked);
  return (
    <div>
      <div className="panel-title">민심 내역 — 고을이 클수록 바라는 것이 많아진다</div>
      {moraleFactors.map(factor => (
        <div key={factor.id} className="small" style={{ color: factor.delta > 0 ? '#6fbf73' : '#e06c5c' }}>
          {factor.delta > 0 ? '✓' : '·'} {factor.label} ({factor.delta > 0 ? '+' : ''}{factor.delta})
        </div>
      ))}
      {lockedFactors.length > 0 && (
        <div className="small muted">
          잠긴 기대: {lockedFactors.map(factor => factor.label).join(' · ')} — 승격하면 주민들이 바라기 시작합니다
        </div>
      )}
      <button type="button" className="btn small weapon-allocation-open" onClick={onOpenWeaponAllocation} style={{ marginTop: 6 }}>
        ⚔ 병기고 무기·군마 배분
      </button>
      <div className="dock-resident-list">
        {state.residents.map(resident => (
          <button
            key={resident.id}
            type="button"
            className={`resident-row${resident.alive ? '' : ' dead'}${resident.id === selectedResidentId ? ' selected' : ''}`}
            disabled={!resident.alive}
            onClick={() => onSelectResident(resident.id)}
          >
            <span>{resident.special ? '★ ' : ''}{resident.name}{resident.sick ? ' 🤒' : ''}{state.day < (resident.quarantinedUntil ?? 0) ? ' · 격리' : ''}</span>
            <span className="muted">{resident.alive
              ? `${resident.cartEquipped ? '🛒 ' : ''}${residentRoleLabel(state, resident)}${state.weaponAssignments[resident.id]
                ? ` · ${COMBAT_WEAPON_NAMES[state.weaponAssignments[resident.id]!]}`
                : ''}${state.mountAssignments[resident.id] ? ' · 🐎 기마' : ''}`
              : '사망'}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
