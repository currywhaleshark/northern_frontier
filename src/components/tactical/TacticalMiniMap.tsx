import { useState, type KeyboardEvent, type MouseEvent } from 'react';
import { tacticalGroupIsInRouteTransit, tacticalRaiderVisibleDuringPlayback } from '../../game/tacticalBattle';
import { tacticalActiveDefenderCount } from '../../game/tacticalCommandState';
import type { TacticalFlankRouteView } from '../../game/tacticalRoutes';
import type {
  GameState,
  TacticalBattleZone,
  TacticalDefenderGroup,
  TacticalFormationLine,
  TacticalRaiderGroup,
  TacticalRouteSide,
} from '../../game/types';
import { commandLabel } from './commandText';
import {
  tacticalPlaybackCasualties,
  tacticalRaiderIntentLabel,
} from './TacticalZoneColumn';
import {
  annularSectorPath,
  encirclementDash,
  huntDotPosition,
  polarPoint,
} from './minimapGeometry';

type TacticalBattle = NonNullable<GameState['tacticalBattle']>;

interface Props {
  battle: TacticalBattle;
  hunt: boolean;
  assault: boolean;
  viewedZoneId: string;
  selectedGroupId: string | null;
  eventIndex: number;
  playback: boolean;
  /** P6 우회로 표시 — 백엔드 tacticalFlankRouteView 결과만 받는다. hidden은 렌더하지 않는다. */
  routeViews: TacticalFlankRouteView[];
  onViewZone: (zoneId: string) => void;
  onSelectGroup: (groupId: string) => void;
}

const DEFENDER_FORMATION_LINES: readonly TacticalFormationLine[] = ['front', 'middle', 'rear'];
const RAIDER_FORMATION_LINES: readonly TacticalFormationLine[] = ['rear', 'middle', 'front'];

function lineLabel(line: TacticalFormationLine): string {
  return line === 'front' ? '전열' : line === 'middle' ? '중열' : '후열';
}

function defenderVisualActive(
  battle: TacticalBattle,
  group: TacticalDefenderGroup,
  eventIndex: number,
): number {
  const playbackLoss = tacticalPlaybackCasualties(battle, eventIndex, 'defender', group.id);
  return Math.min(group.count, tacticalActiveDefenderCount(group) + playbackLoss.futureTotal);
}

function raiderVisualActive(
  battle: TacticalBattle,
  group: TacticalRaiderGroup,
  eventIndex: number,
): number {
  const playbackLoss = tacticalPlaybackCasualties(battle, eventIndex, 'raider', group.id);
  return Math.min(group.count, Math.max(0, group.count - group.killed) + playbackLoss.futureTotal);
}

function defenderTooltip(
  battle: TacticalBattle,
  group: TacticalDefenderGroup,
  active: number,
  hunt: boolean,
): string {
  const position = hunt
    ? battle.zones.find(zone => zone.id === group.zoneId)?.name ?? '길목'
    : lineLabel(group.pendingLine ?? group.line);
  const command = group.command ? commandLabel(group.command, group, hunt) : '자동 명령';
  return `${group.label} ${active}명 · ${position} · ${command}`;
}

function raiderTooltip(
  battle: TacticalBattle,
  group: TacticalRaiderGroup,
  active: number,
): string {
  if (!group.revealed) return group.beastKind ? '은닉 — 위치 미확인' : '정체불명';
  const unit = group.beastKind ? '마리' : '명';
  const power = group.beastKind ? '' : ` · 전력 ${Math.round(group.power)}`;
  const rear = group.rearAssault ? ' · 후방 급습' : '';
  return `${group.label} ${active}${unit}${power} · ${tacticalRaiderIntentLabel(battle, group)}${rear}`;
}

function markerSize(active: number): 'small' | 'large' {
  return active >= 5 ? 'large' : 'small';
}

type CappedItem<T> = { item: T; aggregate?: false } | { item?: undefined; aggregate: number };

function cappedItems<T>(items: readonly T[]): CappedItem<T>[] {
  if (items.length <= 4) return items.map(item => ({ item }));
  return [
    ...items.slice(0, 3).map(item => ({ item } as CappedItem<T>)),
    { aggregate: items.length - 3 },
  ];
}

function activateOnKey(event: KeyboardEvent, action: () => void): void {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  action();
}

function FriendlyHtmlMarker({
  battle,
  group,
  active,
  hunt,
  selected,
  onSelect,
}: {
  battle: TacticalBattle;
  group: TacticalDefenderGroup;
  active: number;
  hunt: boolean;
  selected: boolean;
  onSelect: (groupId: string) => void;
}) {
  return (
    <button
      type="button"
      tabIndex={-1}
      className={`tactical-minimap-dot friendly ${group.kind === 'civilian' ? 'civilian' : ''} ${markerSize(active)}${selected ? ' selected' : ''}`}
      title={defenderTooltip(battle, group, active, hunt)}
      aria-label={defenderTooltip(battle, group, active, hunt)}
      onClick={event => {
        event.stopPropagation();
        onSelect(group.id);
      }}
    />
  );
}

function EnemyHtmlMarker({
  battle,
  group,
  active,
}: {
  battle: TacticalBattle;
  group: TacticalRaiderGroup;
  active: number;
}) {
  return (
    <span
      className={`tactical-minimap-dot enemy ${markerSize(active)}${group.revealed ? '' : ' unknown'}${group.rearAssault ? ' rear-assault' : ''}${group.confused || group.intent === 'withdraw' ? ' subdued' : ''}`}
      title={raiderTooltip(battle, group, active)}
    />
  );
}

function AggregateHtmlMarker({ side, count }: { side: 'friendly' | 'enemy'; count: number }) {
  return (
    <span
      className={`tactical-minimap-dot ${side} large aggregate`}
      title={`그 밖의 ${count}개 조`}
    />
  );
}

function MinimapRouteBranch({
  view,
  playback,
  onViewZone,
}: {
  view: TacticalFlankRouteView | undefined;
  playback: boolean;
  onViewZone: (zoneId: string) => void;
}) {
  if (!view || view.display === 'hidden') return null;
  const suspected = view.display === 'suspected';
  const label = suspected
    ? `${view.route.label} — 우회 징후 · 도착 예상 ${view.expectedArrivalRounds?.[0]}~${view.expectedArrivalRounds?.[1]}교전`
    : `${view.route.label} 보기 · 이동 중 ${view.transits.length}개 조`;
  return (
    <button
      type="button"
      tabIndex={playback ? -1 : 0}
      className={`tactical-minimap-route side-${view.route.side} display-${view.display} control-${view.route.control}`}
      aria-label={label}
      title={label}
      onClick={() => {
        if (!playback) onViewZone('approach');
      }}
    >
      <i className="tactical-minimap-route-line" aria-hidden="true" />
      {suspected ? (
        <span className="tactical-minimap-route-suspect">?</span>
      ) : (
        <span className="tactical-minimap-route-steps" aria-hidden="true">
          {([0, 1, 2] as const).map(step => (
            <span className="tactical-minimap-route-step" key={step}>
              {view.transits.filter(transit => transit.step === step).map(transit => (
                <i className={`tactical-minimap-dot ${transit.side === 'raider' ? 'enemy' : 'friendly'} small`} key={transit.groupId} />
              ))}
            </span>
          ))}
        </span>
      )}
    </button>
  );
}

function StripMiniMap({
  battle,
  assault,
  hunt,
  viewedZoneId,
  selectedGroupId,
  eventIndex,
  playback,
  routeViews,
  onViewZone,
  onSelectGroup,
  hoveredZoneId,
  setHoveredZoneId,
}: Props & {
  hoveredZoneId: string | null;
  setHoveredZoneId: (zoneId: string | null) => void;
}) {
  const labelZoneId = hoveredZoneId ?? viewedZoneId;
  const labelIndex = Math.max(0, battle.zones.findIndex(zone => zone.id === labelZoneId));
  const routeBySide = (side: TacticalRouteSide) => routeViews.find(view => view.route.side === side);
  return (
    <div className={`tactical-minimap-strip${assault ? ' assault' : ''}`}>
      <MinimapRouteBranch view={routeBySide('left')} playback={playback} onViewZone={onViewZone} />
      <div className="tactical-minimap-strip-map">
        {battle.zones.map(zone => {
          // 우회 이동 중인 조는 구역 점이 아니라 경로 가지에서만 보인다 (계획서 8.6)
          const defenders = battle.defenderGroups.filter(group =>
            group.zoneId === zone.id && !tacticalGroupIsInRouteTransit(group) &&
            defenderVisualActive(battle, group, eventIndex) > 0);
          const raiders = battle.raiderGroups.filter(group =>
            group.zoneId === zone.id &&
            !tacticalGroupIsInRouteTransit(group) &&
            raiderVisualActive(battle, group, eventIndex) > 0 &&
            tacticalRaiderVisibleDuringPlayback(battle, group, eventIndex));
          const frontalRaiders = raiders.filter(group => !group.rearAssault);
          const rearRaiders = raiders.filter(group => group.rearAssault);
          const zoneLabel = `${zone.name} 보기 · 아군 ${defenders.length}개 조 · 적 ${raiders.length}개 조`;
          const viewZone = () => {
            if (!playback) onViewZone(zone.id);
          };
          return (
            <div
              role="button"
              tabIndex={playback ? -1 : 0}
              aria-label={zoneLabel}
              className={`tactical-minimap-segment${viewedZoneId === zone.id ? ' viewed' : ''}${zone.breached ? ' breached' : ''}`}
              onClick={viewZone}
              onKeyDown={event => activateOnKey(event, viewZone)}
              onMouseEnter={() => setHoveredZoneId(zone.id)}
              onMouseLeave={() => setHoveredZoneId(null)}
              key={zone.id}
            >
              <div className="tactical-minimap-segment-body">
                <div className="tactical-minimap-enemies">
                  {RAIDER_FORMATION_LINES.map(line => {
                    const lineGroups = frontalRaiders.filter(group => group.line === line);
                    return (
                      <div className={`tactical-minimap-line line-${line}`} key={line}>
                        {cappedItems(lineGroups).map((entry, index) => entry.item ? (
                          <EnemyHtmlMarker
                            battle={battle}
                            group={entry.item}
                            active={raiderVisualActive(battle, entry.item, eventIndex)}
                            key={entry.item.id}
                          />
                        ) : (
                          <AggregateHtmlMarker side="enemy" count={entry.aggregate} key={`enemy-${line}-more-${index}`} />
                        ))}
                      </div>
                    );
                  })}
                </div>
                <div className={`tactical-minimap-friendlies${rearRaiders.length > 0 ? ' has-rear-attackers' : ''}`}>
                  {DEFENDER_FORMATION_LINES.map(line => {
                    const lineGroups = defenders.filter(group => group.line === line);
                    return (
                      <div className={`tactical-minimap-line line-${line}`} key={line}>
                        {cappedItems(lineGroups).map((entry, index) => entry.item ? (
                          <FriendlyHtmlMarker
                            battle={battle}
                            group={entry.item}
                            active={defenderVisualActive(battle, entry.item, eventIndex)}
                            hunt={hunt}
                            selected={selectedGroupId === entry.item.id}
                            onSelect={onSelectGroup}
                            key={entry.item.id}
                          />
                        ) : (
                          <AggregateHtmlMarker side="friendly" count={entry.aggregate} key={`friendly-more-${index}`} />
                        ))}
                      </div>
                    );
                  })}
                  {rearRaiders.length > 0 && (
                    <div className="tactical-minimap-rear-attackers">
                      {cappedItems(rearRaiders).map((entry, index) => entry.item ? (
                        <EnemyHtmlMarker
                          battle={battle}
                          group={entry.item}
                          active={raiderVisualActive(battle, entry.item, eventIndex)}
                          key={entry.item.id}
                        />
                      ) : (
                        <AggregateHtmlMarker side="enemy" count={entry.aggregate} key={`rear-more-${index}`} />
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <span className="tactical-minimap-pressure" aria-label={`압박 ${Math.round(zone.pressure)}`}>
                <i style={{ width: `${Math.max(0, Math.min(100, zone.pressure))}%` }} />
              </span>
              {battle.currentZoneId === zone.id && <i className="tactical-minimap-focus" title="현재 전투 초점" />}
            </div>
          );
        })}
      </div>
      <MinimapRouteBranch view={routeBySide('right')} playback={playback} onViewZone={onViewZone} />
      <div className="tactical-minimap-name">
        {battle.zones[labelIndex]?.name} {labelIndex + 1}/{battle.zones.length}
      </div>
    </div>
  );
}

function SvgFriendlyMarker({
  battle,
  group,
  active,
  hunt,
  selected,
  x,
  y,
  onSelect,
}: {
  battle: TacticalBattle;
  group: TacticalDefenderGroup;
  active: number;
  hunt: boolean;
  selected: boolean;
  x: number;
  y: number;
  onSelect: (groupId: string) => void;
}) {
  const size = active >= 5 ? 8 : 6;
  const common = {
    className: `tactical-minimap-svg-dot friendly${group.kind === 'civilian' ? ' civilian' : ''}${selected ? ' selected' : ''}`,
    onClick: (event: MouseEvent<SVGElement>) => {
      event.stopPropagation();
      onSelect(group.id);
    },
  };
  return group.kind === 'civilian' ? (
    <circle {...common} cx={x} cy={y} r={size / 2}>
      <title>{defenderTooltip(battle, group, active, hunt)}</title>
    </circle>
  ) : (
    <rect {...common} x={x - size / 2} y={y - size / 2} width={size} height={size}>
      <title>{defenderTooltip(battle, group, active, hunt)}</title>
    </rect>
  );
}

function SvgRaiderMarker({
  battle,
  group,
  active,
  x,
  y,
}: {
  battle: TacticalBattle;
  group: TacticalRaiderGroup;
  active: number;
  x: number;
  y: number;
}) {
  const size = active >= 5 ? 8 : 6;
  const className = `tactical-minimap-svg-dot enemy${group.revealed ? '' : ' unknown'}${group.rearAssault ? ' rear-assault' : ''}${group.confused || group.intent === 'withdraw' ? ' subdued' : ''}`;
  if (group.beastKind) return (
    <rect
      className={`${className} beast state-${battle.huntPredatorState}`}
      x={x - 4}
      y={y - 4}
      width={8}
      height={8}
      transform={`rotate(45 ${x} ${y})`}
    >
      <title>{raiderTooltip(battle, group, active)}</title>
    </rect>
  );
  return (
    <circle className={className} cx={x} cy={y} r={size / 2}>
      <title>{raiderTooltip(battle, group, active)}</title>
    </circle>
  );
}

function HuntMiniMap({
  battle,
  hunt,
  viewedZoneId,
  selectedGroupId,
  eventIndex,
  playback,
  onViewZone,
  onSelectGroup,
  hoveredZoneId,
  setHoveredZoneId,
}: Props & {
  hoveredZoneId: string | null;
  setHoveredZoneId: (zoneId: string | null) => void;
}) {
  const sectors = battle.zones.filter(zone => zone.id !== 'huntDen').slice(0, 3);
  const den = battle.zones.find(zone => zone.id === 'huntDen');
  const labelZoneId = hoveredZoneId ?? viewedZoneId;
  const labelIndex = Math.max(0, battle.zones.findIndex(zone => zone.id === labelZoneId));
  const visibleRaiders = battle.raiderGroups.filter(group =>
    raiderVisualActive(battle, group, eventIndex) > 0 &&
    tacticalRaiderVisibleDuringPlayback(battle, group, eventIndex));
  const hiddenBeast = visibleRaiders.find(group => group.beastKind &&
    (!group.revealed || battle.huntPredatorState === 'hidden'));
  const activateZone = (zoneId: string) => {
    if (!playback) onViewZone(zoneId);
  };
  return (
    <div className="tactical-minimap-hunt">
      <svg className="tactical-minimap-hunt-map" viewBox="0 0 128 128" aria-label="몰이사냥 전장 지도">
        <circle className="tactical-minimap-encirclement-track" cx="64" cy="64" r="58" />
        <circle
          className="tactical-minimap-encirclement"
          cx="64"
          cy="64"
          r="58"
          strokeDasharray={encirclementDash(battle.huntEncirclement ?? 0)}
          transform="rotate(-90 64 64)"
        >
          <title>포위망 {Math.round(battle.huntEncirclement ?? 0)}%</title>
        </circle>
        {sectors.map((zone, sectorIndex) => {
          const start = -150 + sectorIndex * 120;
          const defenders = battle.defenderGroups.filter(group =>
            group.zoneId === zone.id && defenderVisualActive(battle, group, eventIndex) > 0);
          const raiders = visibleRaiders.filter(group => group.zoneId === zone.id && group !== hiddenBeast);
          const markerCount = defenders.length + raiders.length;
          const label = `${zone.name} 보기 · 아군 ${defenders.length}개 조 · 적 ${raiders.length}개 조`;
          return (
            <g key={zone.id}>
              <path
                role="button"
                tabIndex={playback ? -1 : 0}
                aria-label={label}
                className={`tactical-minimap-sector${viewedZoneId === zone.id ? ' viewed' : ''}${hoveredZoneId === zone.id ? ' hovered' : ''}${zone.breached ? ' breached' : ''}`}
                d={annularSectorPath(64, 64, 52, 22, start, start + 120)}
                onClick={() => activateZone(zone.id)}
                onKeyDown={event => activateOnKey(event, () => activateZone(zone.id))}
                onMouseEnter={() => setHoveredZoneId(zone.id)}
                onMouseLeave={() => setHoveredZoneId(null)}
              />
              {defenders.map((group, index) => {
                const [x, y] = huntDotPosition(sectorIndex, index, markerCount);
                const active = defenderVisualActive(battle, group, eventIndex);
                return (
                  <SvgFriendlyMarker
                    battle={battle}
                    group={group}
                    active={active}
                    hunt={hunt}
                    selected={selectedGroupId === group.id}
                    x={x}
                    y={y}
                    onSelect={onSelectGroup}
                    key={group.id}
                  />
                );
              })}
              {raiders.map((group, index) => {
                const [x, y] = huntDotPosition(sectorIndex, defenders.length + index, markerCount);
                return (
                  <SvgRaiderMarker
                    battle={battle}
                    group={group}
                    active={raiderVisualActive(battle, group, eventIndex)}
                    x={x}
                    y={y}
                    key={group.id}
                  />
                );
              })}
              {battle.huntBaitZoneId === zone.id && (() => {
                const [x, y] = huntDotPosition(sectorIndex, 0, 1, 26);
                return <rect className="tactical-minimap-prep bait" x={x - 2} y={y - 2} width="4" height="4" transform={`rotate(45 ${x} ${y})`}><title>미끼</title></rect>;
              })()}
              {battle.huntTrapZoneId === zone.id && (() => {
                const [x, y] = huntDotPosition(sectorIndex, 0, 1, 26);
                return <rect className="tactical-minimap-prep trap" x={x - 2} y={y - 2} width="4" height="4" transform={`rotate(45 ${x} ${y}) translate(5 0)`}><title>함정</title></rect>;
              })()}
            </g>
          );
        })}
        <circle
          role="button"
          tabIndex={playback ? -1 : 0}
          aria-label={`${den?.name ?? '굴'} 보기`}
          className={`tactical-minimap-den${viewedZoneId === den?.id ? ' viewed' : ''}`}
          cx="64"
          cy="64"
          r="17"
          onClick={() => den && activateZone(den.id)}
          onKeyDown={event => den && activateOnKey(event, () => activateZone(den.id))}
          onMouseEnter={() => den && setHoveredZoneId(den.id)}
          onMouseLeave={() => setHoveredZoneId(null)}
        />
        {den && battle.defenderGroups.filter(group =>
          group.zoneId === den.id && defenderVisualActive(battle, group, eventIndex) > 0).map((group, index, groups) => {
          const [x, y] = polarPoint(64, 64, 10, -90 + index * 360 / Math.max(1, groups.length));
          return (
            <SvgFriendlyMarker
              battle={battle}
              group={group}
              active={defenderVisualActive(battle, group, eventIndex)}
              hunt={hunt}
              selected={selectedGroupId === group.id}
              x={x}
              y={y}
              onSelect={onSelectGroup}
              key={group.id}
            />
          );
        })}
        {visibleRaiders.filter(group => group !== hiddenBeast && group.zoneId === den?.id).map(group => (
          <SvgRaiderMarker
            battle={battle}
            group={group}
            active={raiderVisualActive(battle, group, eventIndex)}
            x={64}
            y={64}
            key={group.id}
          />
        ))}
        {hiddenBeast && (
          <g className="tactical-minimap-tracks">
            <title>은닉 — 위치 미확인</title>
            <circle cx="59" cy="64" r="1.8" />
            <circle cx="64" cy="59" r="1.8" />
            <circle cx="69" cy="64" r="1.8" />
          </g>
        )}
      </svg>
      <div className="tactical-minimap-name">
        {battle.zones[labelIndex]?.name} {labelIndex + 1}/{battle.zones.length}
      </div>
    </div>
  );
}

export function TacticalMiniMap(props: Props) {
  const [hoveredZoneId, setHoveredZoneId] = useState<string | null>(null);
  return (
    <aside className={`tactical-minimap${props.playback ? ' playback' : ''}`} aria-label="전장 지도">
      {props.hunt ? (
        <HuntMiniMap
          {...props}
          hoveredZoneId={hoveredZoneId}
          setHoveredZoneId={setHoveredZoneId}
        />
      ) : (
        <StripMiniMap
          {...props}
          hoveredZoneId={hoveredZoneId}
          setHoveredZoneId={setHoveredZoneId}
        />
      )}
    </aside>
  );
}
