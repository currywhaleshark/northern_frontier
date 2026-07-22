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
  TacticalAmbushAftermath,
  TacticalCommandId,
  TacticalDefenderGroup,
  TacticalFormationLine,
  TacticalRaiderGroup,
} from '../../game/types';
import { tacticalAvailableCommands } from './commandPresentation';
import { commandDescription, commandLabel } from './commandText';

interface Props {
  battle: NonNullable<GameState['tacticalBattle']>;
  group: TacticalDefenderGroup;
  hunt: boolean;
  mode: 'self' | 'attack' | 'ambushAftermath';
  target?: TacticalRaiderGroup | null;
  placement: 'above' | 'below';
  style: CSSProperties;
  maxHeight: number;
  onCommand: (command: TacticalCommandId) => void;
  onAmbushAftermath: (aftermath: TacticalAmbushAftermath) => void;
  onSetLine: (line: TacticalFormationLine) => void;
  onMoveZone: (zoneId: string) => void;
  onReturnRoute: () => void;
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

function routeNodeLabel(group: TacticalDefenderGroup): string | null {
  if (!group.routeTransit) return null;
  if (group.routeTransit.node === 'approachGate') return '진입로 측 입구';
  if (group.routeTransit.node === 'middle') return '중간 차단 지점';
  return '창고지대 측 입구';
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
  const [expanded, setExpanded] = useState(false);
  const huntZones = hunt ? battle.zones.filter(zone => zone.id !== 'huntDen') : [];
  const canMove = hunt
    ? huntZones.some(zone => zone.id !== group.zoneId)
    : FORMATION_LINES.some(line =>
      line !== displayedLine && tacticalFormationLineUnavailableReason(battle, group, line) == null);
  if (!canMove) return null;

  return (
    <div className="tactical-command-placement">
      <button
        type="button"
        className="tactical-command-placement-toggle"
        aria-expanded={expanded}
        title={expanded ? '배치 선택 접기' : '배치 선택 펼치기'}
        onClick={() => setExpanded(value => !value)}
      >배치 {expanded ? '▴' : '▾'}</button>
      {expanded && (hunt ? (
        <div className="tactical-command-popover-segment" role="group" aria-label="길목 이동">
          {huntZones.map(zone => {
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
      ) : (
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
      ))}
    </div>
  );
}

export function TacticalCommandPopover({
  battle,
  group,
  hunt,
  mode,
  target,
  placement,
  style,
  maxHeight,
  onCommand,
  onAmbushAftermath,
  onSetLine,
  onMoveZone,
  onReturnRoute,
  onClose,
}: Props) {
  const headerId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const active = tacticalActiveDefenderCount(group);
  const canCommand = tacticalGroupCanReceiveCommand(group);
  const displayedLine = group.pendingLine ?? group.line;
  const availableCommands = tacticalAvailableCommands(battle, group);
  const quickCommands = mode === 'ambushAftermath'
    ? []
    : hunt
    ? availableCommands
    : mode === 'attack'
      ? (['attack', 'volley', 'charge', 'ambush'] as const).filter(command => availableCommands.includes(command))
      : (['hold', 'ambush', 'guardStorehouse', 'protectCivilians', 'reinforceRear', 'arson', 'blockEscape', 'openRetreat'] as const)
        .filter(command => availableCommands.includes(command));
  const routeLocation = group.routeTransit
    ? `${battle.flankRoutes?.find(route => route.id === group.routeTransit?.routeId)?.label ?? '우회로'} · ${routeNodeLabel(group)}`
    : null;
  const locationLabel = routeLocation ?? (hunt
    ? battle.zones.find(zone => zone.id === group.zoneId)?.name ?? '길목 미정'
    : lineLabel(displayedLine));
  const manualTargetLabel = target?.label ?? (!hunt && group.targetSource === 'player' && group.targetGroupId
    ? battle.raiderGroups.find(target => target.id === group.targetGroupId)?.label ?? '지정 표적'
    : null);

  useEffect(() => {
    const root = rootRef.current;
    const current = root?.querySelector<HTMLButtonElement>('[data-current="true"]');
    (current ?? root?.querySelector<HTMLButtonElement>('button'))?.focus();
  }, [group.id, mode, target?.id]);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape') {
      const arrowKeys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
      if (!arrowKeys.includes(event.key)) return;
      const buttons = Array.from(rootRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
      const currentIndex = buttons.indexOf(event.target as HTMLButtonElement);
      if (currentIndex < 0 || buttons.length < 2) return;
      event.preventDefault();
      const backwards = event.key === 'ArrowLeft' || event.key === 'ArrowUp';
      const nextIndex = (currentIndex + (backwards ? -1 : 1) + buttons.length) % buttons.length;
      buttons[nextIndex]?.focus();
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    onClose(true);
  };
  const stopStageClick = (event: MouseEvent<HTMLDivElement>) => event.stopPropagation();
  const renderCommandButton = (command: TacticalCommandId, kind: 'quick') => {
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
          {mode !== 'self' && manualTargetLabel && (
            <em className="tactical-command-target-badge" title={`수동 표적: ${manualTargetLabel}`}>
              → {manualTargetLabel}
            </em>
          )}
          {group.ambushed && <em className="tactical-state-badge ambushed">매복중</em>}
        </div>
      </div>

      {!canCommand ? (
        <p className="tactical-command-popover-message">{group.commandable === false
          ? group.kind === 'healer'
            ? '전술 치료반은 후열 보호 대상이며 같은 구역의 부상자를 자동 치료합니다.'
            : '피난 주민은 보호 대상이며 전투 명령을 받지 않습니다.'
          : '이 부대는 전투 불능이어서 명령을 내릴 수 없습니다.'}</p>
      ) : (
        <div className="tactical-command-popover-body">
          {mode === 'ambushAftermath' ? (
            <>
              <p className="tactical-command-popover-message">급습 뒤 추격을 피해 이탈할지, 현재 방어선을 지킬지 선택하십시오.</p>
              <div className="tactical-command-quick-grid" role="group" aria-label="급습 후 행동">
                <button
                  type="button"
                  className="tactical-command-option quick"
                  title="급습 공격 뒤 다음 방어선으로 물러납니다."
                  onClick={() => onAmbushAftermath('fallback')}
                >공격 후 이탈</button>
                <button
                  type="button"
                  className="tactical-command-option quick"
                  title="급습 공격 뒤 현재 구역과 전열에 남습니다."
                  onClick={() => onAmbushAftermath('hold')}
                >위치 유지</button>
              </div>
            </>
          ) : (<>
          {mode === 'self' && hunt && (
            <TacticalPlacementSegment
              key={group.id}
              battle={battle}
              group={group}
              hunt={hunt}
              displayedLine={displayedLine}
              onSetLine={onSetLine}
              onMoveZone={onMoveZone}
            />
          )}

          {mode === 'self' && group.routeTransit && (
            <div className="tactical-route-return-control">
              <button
                type="button"
                className="tactical-command-option quick"
                title="현재 우회로에서 출발했던 입구 방향으로 한 단계 되돌아갑니다."
                onClick={onReturnRoute}
              >↩ 출발지로 복귀</button>
              <small>우회로에서 한 지점씩 되돌아가 출발 전장으로 합류합니다.</small>
            </div>
          )}

          <div className="tactical-command-quick-grid" role="group" aria-label="빠른 명령">
            {quickCommands.map(command => renderCommandButton(command, 'quick'))}
          </div>

          {quickCommands.length === 0 && (
            <p className="tactical-command-popover-message">지금 내릴 수 있는 명령이 없습니다.</p>
          )}
          </>)}
        </div>
      )}
    </div>
  );
}
