import type { CSSProperties } from 'react';
import { combatSpriteDescriptor } from '../../game/combatCapabilities';
import type { TacticalDefenderGroup } from '../../game/types';
import { tacticalSpriteMetricVars } from '../../render/tacticalSpriteMetrics';
import {
  TACTICAL_DEFENDER_DEFAULT_WEAPON_POSE_SHEET,
  TACTICAL_HEALER_POSE_SHEET,
  TACTICAL_DEFENDER_ROLE_POSE_SHEET,
  TACTICAL_DEFENDER_WEAPON_POSE_SHEET,
  TACTICAL_SPECIAL_RESIDENT_POSE_SHEET,
  tacticalDefaultWeaponPose,
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
  /** P7 — 이번 라운드에 우회로 출구로 후열 급습에 도달한 부대 */
  rearRaid: boolean;
  commandText: string | null;
  targetText: string;
  onSelect: () => void;
}

// 하단 독·배치 카드가 공유하는 소형 부대 초상 — 특수주민이 든 조는 group.special로 전용 시트를 쓴다
export function DockDefenderSprite({ group, gender }: {
  group: TacticalDefenderGroup;
  gender: 'male' | 'female';
}) {
  const descriptor = combatSpriteDescriptor(group.role, group.weapon);
  const defaultWeapon = tacticalDefaultWeaponPose(group);
  const cell = tacticalDefenderPoseCell(
    group.role,
    descriptor.source === 'weapon' ? descriptor.id : null,
    gender,
    'idle',
    defaultWeapon,
    group.special,
  );
  const sheet = cell.sheet === 'weapons'
    ? TACTICAL_DEFENDER_WEAPON_POSE_SHEET
    : cell.sheet === 'defaultWeapons'
      ? TACTICAL_DEFENDER_DEFAULT_WEAPON_POSE_SHEET
      : cell.sheet === 'healers'
        ? TACTICAL_HEALER_POSE_SHEET
        : cell.sheet === 'specialResidents'
          ? TACTICAL_SPECIAL_RESIDENT_POSE_SHEET
          : TACTICAL_DEFENDER_ROLE_POSE_SHEET;
  const metricSheet = cell.sheet === 'weapons'
    ? 'defenderWeapons' as const
    : cell.sheet === 'defaultWeapons'
      ? 'defenderDefaultWeapons' as const
      : cell.sheet === 'healers'
        ? 'healers' as const
        : cell.sheet === 'specialResidents'
          ? 'specialResidents' as const
          : 'defenderRoles' as const;
  return (
    <span
      className={`tactical-sprite tactical-defender role-${group.role} weapon-${group.weapon ?? 'unarmed'} default-weapon-${defaultWeapon ?? 'none'} pose-idle`}
      style={{
        backgroundImage: `url(${sheet.src})`,
        backgroundPosition: `${-cell.column * sheet.spriteWidth}px ${-cell.row * sheet.spriteHeight}px`,
        backgroundSize: `${sheet.columns * sheet.spriteWidth}px ${sheet.rows * sheet.spriteHeight}px`,
        ...tacticalSpriteMetricVars(metricSheet, cell.column, cell.row),
      } as CSSProperties}
      aria-hidden="true"
    />
  );
}

export function TacticalGroupChip({
  group, gender, active, zoneName, mode, selected, pending, rearRaid, commandText, targetText, onSelect,
}: Props) {
  return (
    <button
      type="button"
      className={`tactical-dock-chip${group.kind === 'healer' ? ' healer' : ''}${selected ? ' active' : ''}${pending ? ' pending' : ''}${active === 0 ? ' routed' : ''}`}
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
        <span>{zoneName} · {group.line === 'front' ? '전열' : group.line === 'middle' ? '중열' : '후열'}{group.routeTransit ? ` · ${group.routeTransit.purpose === 'block' ? '경로 차단' : '우회 이동'} 중` : ''}{group.facing === 'towardRear' ? ' · 후방 경계' : ''}{group.pendingFacing ? ' · 회전 중' : ''}{rearRaid ? ' · 후열 급습' : ''}{group.ambushed ? ' · 매복중' : ''}</span>
        {mode === 'command' && (
          <>
            <span className={`tactical-dock-command${pending ? ' waiting' : ''}`}>
              {group.commandable === false
                ? group.kind === 'healer' ? '후열 자동 치료' : '보호 대상'
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
