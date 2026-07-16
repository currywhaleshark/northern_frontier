import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';
import { tacticalFormationLineUnavailableReason } from '../../game/tacticalBattle';
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
import { tacticalCommandPresentation } from './commandPresentation';
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

interface TacticalPlacementSegmentProps {
  battle: NonNullable<GameState['tacticalBattle']>;
  group: TacticalDefenderGroup;
  hunt: boolean;
  displayedLine: TacticalFormationLine;
  onSetLine: (line: TacticalFormationLine) => void;
  onMoveZone: (zoneId: string) => void;
}

const FORMATION_LINES: readonly TacticalFormationLine[] = ['front', 'middle', 'rear'];

function lineLabel(line: TacticalFormationLine): string {
  return line === 'front' ? '전열' : line === 'middle' ? '중열' : '후열';
}

// Kept separate from action commands so future stage dragging can replace this
// placement-only control without changing command presentation or execution.
function TacticalPlacementSegment({
  battle,
  group,
  hunt,
  displayedLine,
  onSetLine,
  onMoveZone,
}: TacticalPlacementSegmentProps) {
  if (hunt) {
    return (
      <div className="tactical-command-popover-segment" role="group" aria-label="길목 이동">
        {battle.zones.filter(zone => zone.id !== 'huntDen').map(zone => {
          const current = zone.id === group.zoneId;
          return (
            <button
              type="button"
              className={current ? 'active' : ''}
              aria-pressed={current}
              title={current
                ? '현재 지키는 길목입니다.'
                : '이동한 조는 이번 라운드 몰이 기여가 절반으로 줄어듭니다.'}
              onClick={() => onMoveZone(zone.id)}
              key={zone.id}
            >{zone.name}{!current && <small> ½</small>}</button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="tactical-command-popover-segment" role="group" aria-label="전열 선택">
      {FORMATION_LINES.map(line => {
        const unavailableReason = tacticalFormationLineUnavailableReason(battle, group, line);
        const active = displayedLine === line;
        return (
          <button
            type="button"
            className={active ? 'active' : ''}
            aria-pressed={active}
            disabled={unavailableReason != null}
            title={unavailableReason ?? (line === group.line ? '현재 전열' : '다음 라운드 목표 전열')}
            onClick={() => onSetLine(line)}
            key={line}
          >{lineLabel(line)}{group.pendingLine === line && line !== group.line && <small> 예약</small>}</button>
        );
      })}
    </div>
  );
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
  const descriptionId = useId();
  const moreCommandsId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [hoveredCommand, setHoveredCommand] = useState<TacticalCommandId | null>(null);
  const active = tacticalActiveDefenderCount(group);
  const canCommand = tacticalGroupCanReceiveCommand(group);
  const displayedLine = group.pendingLine ?? group.line;
  const { quick: quickCommands, more: moreCommands } = tacticalCommandPresentation(battle, group);
  const locationLabel = hunt
    ? battle.zones.find(zone => zone.id === group.zoneId)?.name ?? '길목 미정'
    : lineLabel(displayedLine);
  const targetLabel = group.targetSource === 'player'
    ? battle.raiderGroups.find(target => target.id === group.targetGroupId)?.label ?? '자동'
    : '자동';
  const commandSummary = !canCommand
    ? '전투 명령 없음'
    : group.command
      ? `${group.commandSource === 'player' ? '지정' : '자동'}: ${commandLabel(group.command, group, hunt)}`
      : '자동: 추천 대기';
  const describedCommand = hoveredCommand ?? group.command;
  const description = describedCommand
    ? commandDescription(describedCommand, group, hunt)
    : '명령을 선택하십시오';

  useEffect(() => {
    setExpanded(false);
    setHoveredCommand(null);
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
  const renderCommandButton = (command: TacticalCommandId, kind: 'quick' | 'more') => {
    const current = group.command === command;
    const label = commandLabel(command, group, hunt);
    const commandHelp = commandDescription(command, group, hunt);
    return (
      <button
        type="button"
        className={`tactical-command-option ${kind}${current ? ' current' : ''}`}
        aria-label={`${label}: ${commandHelp}`}
        aria-pressed={current}
        data-command-id={command}
        data-current={current}
        title={`${label} — ${commandHelp}`}
        onMouseEnter={() => setHoveredCommand(command)}
        onMouseLeave={() => setHoveredCommand(value => (value === command ? null : value))}
        onFocus={() => setHoveredCommand(command)}
        onBlur={() => setHoveredCommand(value => (value === command ? null : value))}
        onClick={() => onCommand(command)}
        key={command}
      >{label}</button>
    );
  };

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
        <div className="tactical-command-popover-title">
          <strong id={headerId}>{group.label} {active}명</strong>
          <span aria-hidden="true">·</span>
          <span>{locationLabel}</span>
          {group.ambushed && <em className="tactical-state-badge ambushed">매복중</em>}
        </div>
        <small title={`${commandSummary}${!hunt && canCommand ? ` · 표적: ${targetLabel}` : ''}`}>
          {commandSummary}{!hunt && canCommand && <> · 표적: {targetLabel}</>}
        </small>
      </div>

      {!canCommand ? (
        <p className="tactical-command-popover-message">{group.commandable === false
          ? '피난 주민은 보호 대상이며 전투 명령을 받지 않습니다.'
          : '이 부대는 전투 불능이어서 명령을 내릴 수 없습니다.'}</p>
      ) : (
        <div className="tactical-command-popover-body">
          <TacticalPlacementSegment
            battle={battle}
            group={group}
            hunt={hunt}
            displayedLine={displayedLine}
            onSetLine={onSetLine}
            onMoveZone={onMoveZone}
          />

          <div className="tactical-command-quick-grid" role="group" aria-label="빠른 명령">
            {quickCommands.map(command => renderCommandButton(command, 'quick'))}
            {moreCommands.length > 0 && (
              <button
                type="button"
                className={`tactical-command-more-toggle${quickCommands.length % 2 === 0 ? ' wide' : ''}`}
                aria-controls={moreCommandsId}
                aria-expanded={expanded}
                aria-label={expanded ? '빠른 명령만 보기' : '나머지 명령 더보기'}
                title={expanded ? '빠른 명령만 보기' : '나머지 유효 명령 보기'}
                onClick={() => setExpanded(value => !value)}
              >{expanded ? '간략히' : '···'}</button>
            )}
          </div>

          {expanded && moreCommands.length > 0 && (
            <div
              className="tactical-command-more-list"
              id={moreCommandsId}
              role="group"
              aria-label="나머지 명령"
            >
              {moreCommands.map(command => renderCommandButton(command, 'more'))}
            </div>
          )}

          {quickCommands.length === 0 && moreCommands.length === 0 && (
            <p className="tactical-command-popover-message">지금 내릴 수 있는 명령이 없습니다.</p>
          )}
          <p
            className="tactical-command-popover-description"
            id={descriptionId}
            aria-live="polite"
          >{description}</p>
        </div>
      )}
    </div>
  );
}
