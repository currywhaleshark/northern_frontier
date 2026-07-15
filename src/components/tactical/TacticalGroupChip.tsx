import { combatSpriteDescriptor } from '../../game/combatCapabilities';
import type { TacticalDefenderGroup } from '../../game/types';
import {
  TACTICAL_DEFENDER_ROLE_POSE_SHEET, TACTICAL_DEFENDER_WEAPON_POSE_SHEET,
  tacticalDefenderPoseCell,
} from '../../render/tacticalCharacterAssets';

interface Props {
  group: TacticalDefenderGroup;
  gender: 'male' | 'female';
  active: number;
  zoneName: string;
  mode: 'deployment' | 'command';
  selected: boolean;
  pending: boolean;
  commandText: string | null;
  targetText: string;
  onSelect: () => void;
}

function DockDefenderSprite({ group, gender }: {
  group: TacticalDefenderGroup;
  gender: 'male' | 'female';
}) {
  const descriptor = combatSpriteDescriptor(group.role, group.weapon);
  const cell = tacticalDefenderPoseCell(
    group.role,
    descriptor.source === 'weapon' ? descriptor.id : null,
    gender,
    'idle',
  );
  const sheet = cell.sheet === 'weapons'
    ? TACTICAL_DEFENDER_WEAPON_POSE_SHEET
    : TACTICAL_DEFENDER_ROLE_POSE_SHEET;
  return (
    <span
      className={`tactical-sprite tactical-defender role-${group.role} weapon-${group.weapon ?? 'unarmed'} pose-idle`}
      style={{
        backgroundImage: `url(${sheet.src})`,
        backgroundPosition: `${-cell.column * sheet.spriteWidth}px ${-cell.row * sheet.spriteHeight}px`,
        backgroundSize: `${sheet.columns * sheet.spriteWidth}px ${sheet.rows * sheet.spriteHeight}px`,
      }}
      aria-hidden="true"
    />
  );
}

export function TacticalGroupChip({
  group, gender, active, zoneName, mode, selected, pending, commandText, targetText, onSelect,
}: Props) {
  return (
    <button
      type="button"
      className={`tactical-dock-chip${selected ? ' active' : ''}${pending ? ' pending' : ''}${active === 0 ? ' routed' : ''}`}
      onClick={onSelect}
      disabled={active === 0}
      aria-label={`${group.label} 선택`}
    >
      <span className="tactical-dock-thumb" aria-hidden="true">
        <DockDefenderSprite group={group} gender={gender} />
      </span>
      <span className="tactical-dock-info">
        <strong>
          {group.label}
          <em>{active === 0 ? '전투 불능' : `${active}명`}</em>
        </strong>
        <span>{zoneName} · {group.line === 'front' ? '전열' : group.line === 'middle' ? '중열' : '후열'}{group.ambushed ? ' · 매복중' : ''}</span>
        {mode === 'command' && (
          <>
            <span className={`tactical-dock-command${pending ? ' waiting' : ''}`}>
              {group.commandable === false
                ? '보호 대상'
                : active === 0
                  ? '—'
                  : pending
                    ? `자동: ${commandText ?? '추천 없음'}`
                    : commandText ?? '—'}
            </span>
            {group.commandable !== false && active > 0 && <span className="tactical-dock-target">표적: {targetText || '자동'}</span>}
          </>
        )}
      </span>
    </button>
  );
}
