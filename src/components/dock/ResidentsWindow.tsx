import { JOB_NAMES } from '../../game/constants';
import { COMBAT_WEAPON_NAMES } from '../../game/weapons';
import type { GameState } from '../../game/types';

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
  return (
    <div>
      <button type="button" className="btn small weapon-allocation-open" onClick={onOpenWeaponAllocation}>
        ⚔ 병기고 무기 배분
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
            <span>{resident.name}{resident.sick ? ' 🤒' : ''}{state.day < (resident.quarantinedUntil ?? 0) ? ' · 격리' : ''}</span>
            <span className="muted">{resident.alive
              ? `${resident.cartEquipped ? '🛒 ' : ''}${JOB_NAMES[resident.job]}${state.weaponAssignments[resident.id]
                ? ` · ${COMBAT_WEAPON_NAMES[state.weaponAssignments[resident.id]!]}`
                : ''}`
              : '사망'}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
