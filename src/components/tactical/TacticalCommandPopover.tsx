import { useEffect, useId, useRef, type CSSProperties, type KeyboardEvent, type MouseEvent } from 'react';
import {
  tacticalCommandUnavailableReason,
  tacticalFormationLineUnavailableReason,
  tacticalSupportedCommands,
} from '../../game/tacticalBattle';
import {
  tacticalActiveDefenderCount,
  tacticalGroupCanReceiveCommand,
} from '../../game/tacticalCommandState';
import type {
  GameState,
  TacticalCommandId,
  TacticalDefenderGroup,
  TacticalFormationLine,
} from '../../game/types';
import { commandDescription, commandLabel } from './commandText';

interface Props {
  battle: NonNullable<GameState['tacticalBattle']>;
  group: TacticalDefenderGroup;
  hunt: boolean;
  placement: 'above' | 'below';
  style: CSSProperties;
  maxHeight: number;
  onCommand: (command: TacticalCommandId) => void;
  onSetLine: (line: TacticalFormationLine) => void;
  onMoveZone: (zoneId: string) => void;
  onClose: (restoreFocus: boolean) => void;
}

const FORMATION_LINES: readonly TacticalFormationLine[] = ['front', 'middle', 'rear'];

function lineLabel(line: TacticalFormationLine): string {
  return line === 'front' ? '전열' : line === 'middle' ? '중열' : '후열';
}

export function TacticalCommandPopover({
  battle,
  group,
  hunt,
  placement,
  style,
  maxHeight,
  onCommand,
  onSetLine,
  onMoveZone,
  onClose,
}: Props) {
  const headerId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const active = tacticalActiveDefenderCount(group);
  const canCommand = tacticalGroupCanReceiveCommand(group);
  const displayedLine = group.pendingLine ?? group.line;
  const availableCommands = tacticalSupportedCommands(battle).filter(command =>
    tacticalCommandUnavailableReason(battle, group, command) == null);

  useEffect(() => {
    const root = rootRef.current;
    const current = root?.querySelector<HTMLButtonElement>('[data-current="true"]');
    (current ?? root?.querySelector<HTMLButtonElement>('button'))?.focus();
  }, [group.id]);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    onClose(true);
  };
  const stopStageClick = (event: MouseEvent<HTMLDivElement>) => event.stopPropagation();

  return (
    <div
      ref={rootRef}
      className={`tactical-command-popover ${placement}${maxHeight < 120 ? ' constrained' : ''}`}
      style={{ ...style, maxHeight }}
      role="dialog"
      aria-labelledby={headerId}
      onKeyDown={handleKeyDown}
      onClick={stopStageClick}
    >
      <div className="tactical-command-popover-header">
        <strong id={headerId}>{group.label} {active}명</strong>
        {group.ambushed && <em className="tactical-state-badge ambushed">매복중</em>}
        <small>{group.command
          ? `${group.commandSource === 'player' ? '지금 명령' : '자동'} · ${commandLabel(group.command, group, hunt)}`
          : '자동 명령'}</small>
      </div>

      {!canCommand ? (
        <p className="tactical-command-popover-message">{group.commandable === false
          ? '피난 주민은 보호 대상이며 전투 명령을 받지 않습니다.'
          : '이 부대는 전투 불능이어서 명령을 내릴 수 없습니다.'}</p>
      ) : (
        <>
          {hunt ? (
            <div className="tactical-command-popover-lines" role="group" aria-label="길목 이동">
              {battle.zones.filter(zone => zone.id !== 'huntDen').map(zone => {
                const current = zone.id === group.zoneId;
                return (
                  <button
                    type="button"
                    className={current ? 'active' : ''}
                    title={current
                      ? '현재 지키는 길목입니다.'
                      : '이동한 조는 이번 라운드 몰이 기여가 절반으로 줄어듭니다.'}
                    onClick={() => onMoveZone(zone.id)}
                    key={zone.id}
                  >{zone.name}{!current && <small> ½</small>}</button>
                );
              })}
            </div>
          ) : (
            <div className="tactical-command-popover-lines" role="group" aria-label="전열 선택">
              {FORMATION_LINES.map(line => {
                const unavailableReason = tacticalFormationLineUnavailableReason(battle, group, line);
                return (
                  <button
                    type="button"
                    className={displayedLine === line ? 'active' : ''}
                    disabled={unavailableReason != null}
                    title={unavailableReason ?? (line === group.line ? '현재 전열' : '다음 라운드 목표 전열')}
                    onClick={() => onSetLine(line)}
                    key={line}
                  >{lineLabel(line)}{group.pendingLine === line && line !== group.line && <small> 예약</small>}</button>
                );
              })}
            </div>
          )}

          <div className="tactical-command-popover-list" role="group" aria-label="명령 선택">
            {availableCommands.length > 0 ? availableCommands.map(command => {
              const current = group.command === command;
              return (
                <button
                  type="button"
                  className={current ? 'current' : ''}
                  aria-pressed={current}
                  data-current={current}
                  onClick={() => onCommand(command)}
                  key={command}
                >
                  <b>{commandLabel(command, group, hunt)}</b>
                  <small>{commandDescription(command, group, hunt)}</small>
                </button>
              );
            }) : <p>지금 내릴 수 있는 명령이 없습니다.</p>}
          </div>

          {!hunt && (
            <div className="tactical-command-popover-footer">
              적 부대를 클릭하면 집중 표적<br />
              전체 명령은 아래 명령판에서
            </div>
          )}
        </>
      )}
    </div>
  );
}
