import { ArrowFatDown, ArrowFatUp } from '@phosphor-icons/react';
import { useLayoutEffect, useRef, useState, type CSSProperties, type DOMAttributes } from 'react';
import { tacticalStageMoveUnavailableReason } from '../../game/tacticalBattle';
import {
  tacticalRouteExitDestination,
  tacticalRouteGateDestination,
  type TacticalRouteExitTarget,
  type TacticalRouteStageGroupView,
  type TacticalRouteStageView,
} from '../../game/tacticalRoutes';
import type {
  GameState, Season, TacticalAnimationEvent, TacticalRouteNode, TacticalStageDestination,
} from '../../game/types';
import type { TacticalSpritePose } from '../../render/tacticalCharacterAssets';
import { tacticalRouteBackgroundAsset } from '../../render/tacticalBackgroundAssets';
import { DockDefenderSprite } from './TacticalGroupChip';
import { RaiderSprite } from './TacticalZoneColumn';
import { routeExitAnchorId, routeGateAnchorId } from './TacticalRouteGate';

interface Props {
  state: GameState;
  view: TacticalRouteStageView;
  selectedGroupId: string | null;
  playback: boolean;
  deploymentPhase: boolean;
  commandPhase: boolean;
  fieldLayout: boolean;
  season: Season;
  night: boolean;
  activeEvent: TacticalAnimationEvent | null;
  eventIndex: number;
  raiderFaction: string;
  targetingActive: boolean;
  targetableEnemyIds: ReadonlySet<string>;
  selectedTargetGroupId: string | null;
  stageDrag: { groupId: string; hoverAnchorId: string | null; mode: 'deployment' | 'command' } | null;
  stageDragHandlePropsFor: ((groupId: string) => DOMAttributes<HTMLElement>) | null;
  onSelectGroup: (groupId: string, element: HTMLElement) => void;
  onSelectTarget: (defenderGroupId: string, enemyGroupId: string, element: HTMLElement) => void;
  onViewZone: (zoneId: string) => void;
  onRequestMove: (groupId: string, destination: TacticalStageDestination, element: HTMLElement) => void;
}

interface RouteOrderArrowPath {
  key: string;
  d: string;
}

function measureRouteOrderArrowPaths(
  root: HTMLElement,
  groups: TacticalRouteStageGroupView[],
): RouteOrderArrowPath[] {
  const rootRect = root.getBoundingClientRect();
  return groups.flatMap(group => {
    if (group.side !== 'defender' || !group.movementReserved) return [];
    const source = root.querySelector<HTMLElement>(`[data-tactical-group-id="${group.groupId}"]`);
    const destination = group.destinationNode === 'middle'
      ? root.querySelector<HTMLElement>('[data-route-node="middle"]')
      : root.querySelector<HTMLElement>(`[data-route-exit-node="${group.destinationNode}"]`);
    if (!source || !destination) return [];
    const sourceRect = source.getBoundingClientRect();
    const destinationRect = destination.getBoundingClientRect();
    const startX = sourceRect.left - rootRect.left + sourceRect.width / 2;
    const startY = sourceRect.top - rootRect.top + sourceRect.height * 0.3;
    const endX = destinationRect.left - rootRect.left + destinationRect.width / 2;
    const endY = destinationRect.top - rootRect.top + destinationRect.height / 2;
    const dx = endX - startX;
    const arc = Math.max(26, Math.min(72, Math.abs(dx) * 0.22 + 18));
    return [{
      key: `${group.groupId}-route-move`,
      d: `M ${startX} ${startY} Q ${startX + dx / 2} ${Math.min(startY, endY) - arc} ${endX} ${endY}`,
    }];
  });
}

function controlLabel(control: TacticalRouteStageView['control']): string {
  if (control === 'defender') return '아군 통제';
  if (control === 'raider') return '적 통제';
  if (control === 'contested') return '교전 중';
  return '통행 없음';
}

function routeGroupIsActor(event: TacticalAnimationEvent | null, group: TacticalRouteStageGroupView): boolean {
  if (!event || event.side !== group.side) return false;
  if (event.actorGroupIds != null) return event.actorGroupIds.includes(group.groupId);
  return event.groupId == null || event.groupId === group.groupId;
}

function routeGroupPose(
  event: TacticalAnimationEvent | null,
  group: TacticalRouteStageGroupView,
): TacticalSpritePose {
  if (!event) return 'idle';
  if (event.kind === 'casualty' && event.groupId === group.groupId) return 'hurt';
  if ((event.kind === 'melee' || event.kind === 'volley' || event.kind === 'ambush') &&
      routeGroupIsActor(event, group)) return 'attack';
  return 'idle';
}

function routeStatusBadgeClass(statusLabel: string): string {
  if (statusLabel === '경로 차단') return 'route-blocking';
  if (statusLabel === '우회로 교전') return 'route-engaged';
  return 'route-moving';
}

function RouteFormationSprite({ group, raiderFaction, activeEvent }: {
  group: TacticalRouteStageGroupView;
  raiderFaction: string;
  activeEvent: TacticalAnimationEvent | null;
}) {
  const shown = Math.max(1, Math.min(6, group.count));
  const pose = routeGroupPose(activeEvent, group);
  const fallingCount = activeEvent?.kind === 'casualty' && activeEvent.groupId === group.groupId
    ? Math.min(shown, activeEvent.casualties ?? 0)
    : 0;
  return (
    <div
      className={`tactical-route-stage-formation ${group.side === 'defender' ? 'tactical-unit-line' : 'tactical-raider-sprites'}`}
      aria-label={`${group.label} ${group.count}명`}
    >
      {Array.from({ length: shown }, (_, index) => {
        const column = index % 3;
        const row = Math.floor(index / 3);
        return (
          <span
            className="tactical-route-stage-unit-slot"
            style={{
              '--route-unit-x': `${(column - 1) * 30}px`,
              '--route-unit-y': `${row * 24}px`,
              zIndex: 20 - row * 3 + column,
            } as CSSProperties}
            key={`${group.groupId}-sprite-${index}`}
          >
            {group.side === 'defender' && group.sprite.role ? (
              <DockDefenderSprite
                group={{
                  id: group.sprite.defenderGroupId ?? group.groupId,
                  role: group.sprite.role,
                  weapon: group.sprite.weapon ?? null,
                  mount: group.sprite.mount,
                  special: index === 0 ? group.sprite.special : undefined,
                }}
                gender={index % 2 === 0 ? 'male' : 'female'}
                pose={index < fallingCount ? 'hurt' : pose}
                falling={index < fallingCount}
              />
            ) : (
              <RaiderSprite
                faction={raiderFaction}
                unitType={group.sprite.raiderUnitType}
                hidden={false}
                offset={index}
                pose={index < fallingCount ? 'hurt' : pose}
                firing={pose === 'attack' && activeEvent?.kind === 'volley'}
                falling={index < fallingCount}
              />
            )}
          </span>
        );
      })}
    </div>
  );
}

export function TacticalRouteStage({
  state, view, selectedGroupId, playback, deploymentPhase, commandPhase, fieldLayout, season, night, activeEvent, eventIndex,
  raiderFaction, targetingActive, targetableEnemyIds, selectedTargetGroupId,
  stageDrag, stageDragHandlePropsFor, onSelectGroup, onSelectTarget, onViewZone, onRequestMove,
}: Props) {
  const background = tacticalRouteBackgroundAsset(view.terrain, season, night);
  const routeEvent = activeEvent?.routeId === view.routeId ? activeEvent : null;
  const stageRef = useRef<HTMLElement>(null);
  const [orderArrowPaths, setOrderArrowPaths] = useState<RouteOrderArrowPath[]>([]);
  const orderArrowSignature = commandPhase
    ? view.groups.map(group => `${group.groupId}:${group.node}:${group.destinationNode}:${group.movementReserved}`).join('|')
    : '';

  useLayoutEffect(() => {
    const root = stageRef.current;
    if (!root || orderArrowSignature === '') {
      setOrderArrowPaths([]);
      return;
    }
    const measure = () => setOrderArrowPaths(measureRouteOrderArrowPaths(root, view.groups));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [orderArrowSignature, selectedGroupId, view.groups]);

  const commandAnchorState = (node: TacticalRouteNode, exitArrow: boolean) => {
    if (!commandPhase || stageDrag?.mode !== 'command') return { anchorId: null, className: '' };
    const anchorId = routeGateAnchorId(view.routeId, node);
    const destination = exitArrow && node !== 'middle'
      ? tacticalRouteGateDestination(state.tacticalBattle!, stageDrag.groupId, view.routeId, node)
      : { kind: 'routeNode' as const, routeId: view.routeId, node };
    const reason = destination
      ? tacticalStageMoveUnavailableReason(state, stageDrag.groupId, destination)
      : '이동할 수 없는 출구입니다.';
    const className = reason == null
      ? stageDrag.hoverAnchorId === anchorId ? ' deploy-anchor-hover' : ' deploy-anchor-valid'
      : ' deploy-anchor-blocked';
    return { anchorId, className };
  };
  const selectedRouteGroup = view.groups.find(group =>
    group.side === 'defender' && group.groupId === selectedGroupId) ?? null;
  const exitOrders: Array<{ target: TacticalRouteExitTarget; label: string; detail: string }> = [
    { target: 'approach', label: '진입로 합류', detail: '진입로의 현재 대열로 합류' },
    { target: 'wall', label: '방책 후열 급습', detail: '방책에서 교전 중인 적의 후열 공격' },
    { target: 'storehouse', label: '창고지대 합류', detail: '창고지대의 현재 대열로 합류' },
  ];
  const exitOrderState = (target: TacticalRouteExitTarget) => {
    const dragGroupId = commandPhase && stageDrag?.mode === 'command' ? stageDrag.groupId : null;
    const groupId = dragGroupId ?? selectedRouteGroup?.groupId ?? null;
    const destination = groupId && state.tacticalBattle
      ? tacticalRouteExitDestination(state.tacticalBattle, groupId, view.routeId, target)
      : null;
    const reason = groupId && destination
      ? tacticalStageMoveUnavailableReason(state, groupId, destination)
      : '우회로 안의 아군 부대를 먼저 선택하십시오.';
    const anchorId = routeExitAnchorId(view.routeId, target);
    const className = dragGroupId
      ? reason == null
        ? stageDrag?.hoverAnchorId === anchorId ? ' deploy-anchor-hover' : ' deploy-anchor-valid'
        : ' deploy-anchor-blocked'
      : '';
    return { anchorId, destination, reason, className };
  };
  return (
    <section
      ref={stageRef}
      className={`tactical-route-stage terrain-${view.terrain} side-${view.side}${fieldLayout ? ' field-layout' : ''}${routeEvent ? ` event-${routeEvent.kind}` : ''}`}
      style={{
        backgroundImage: `url(${background.src})`,
        backgroundSize: background.size,
        backgroundPosition: background.position,
      }}
      aria-label={`${view.label} 전투 무대`}
    >
      <header>
        <div>
          <strong>{view.label}</strong>
          <span>{controlLabel(view.control)} · 정식 우회 전장</span>
        </div>
      </header>
      {commandPhase && (
        <div className="tactical-route-exit-orders" role="group" aria-label="우회로 도착 목적 선택">
          {exitOrders.map(order => {
            const option = exitOrderState(order.target);
            return (
              <button
                type="button"
                data-deploy-anchor={option.anchorId}
                className={`tactical-route-exit-order target-${order.target}${option.className}`}
                disabled={playback || !selectedRouteGroup || option.reason != null}
                title={option.reason ?? order.detail}
                onClick={event => {
                  event.stopPropagation();
                  if (selectedRouteGroup && option.destination) {
                    onRequestMove(selectedRouteGroup.groupId, option.destination, event.currentTarget);
                  }
                }}
                key={order.target}
              >
                <strong>{order.label}</strong>
                <small>{order.detail}</small>
              </button>
            );
          })}
        </div>
      )}
      <div className="tactical-route-stage-track" aria-label={`${view.label} 물리 경로`}>
        {view.nodes.map(node => {
          const groups = view.groups.filter(group => group.node === node.node);
          const exitZoneId = node.node === 'approachGate'
            ? 'approach'
            : node.node === 'storehouseGate' ? 'storehouse' : null;
          const exitLabel = node.node === 'approachGate' ? '진입로 출구' : '창고지대 출구';
          const ExitArrow = view.side === 'right' ? ArrowFatUp : ArrowFatDown;
          const middleAnchor = node.node === 'middle' ? commandAnchorState(node.node, false) : null;
          const exitAnchor = exitZoneId ? commandAnchorState(node.node, true) : null;
          return (
            <div
              className={`tactical-route-stage-node node-${node.node}${middleAnchor?.className ?? ''}`}
              data-route-node={node.node}
              {...(commandPhase && middleAnchor?.anchorId ? { 'data-route-command-anchor': true } : {})}
              {...(commandPhase && middleAnchor?.anchorId
                ? { 'data-deploy-anchor': middleAnchor.anchorId }
                : deploymentPhase && node.node === 'middle'
                ? { 'data-deploy-anchor': `route|${view.side}` }
                : {})}
              key={node.node}
            >
              {exitZoneId && (
                <button
                  type="button"
                  {...(exitAnchor?.anchorId ? { 'data-deploy-anchor': exitAnchor.anchorId } : {})}
                  data-route-exit-node={node.node}
                  className={`tactical-route-stage-exit position-${view.side === 'right' ? 'upper' : 'lower'}${exitAnchor?.className ?? ''}`}
                  disabled={playback}
                  onClick={event => {
                    event.stopPropagation();
                    onViewZone(exitZoneId);
                  }}
                  aria-label={`${exitLabel} · ${view.side === 'right' ? '위쪽' : '아래쪽'} 화살표`}
                  title={exitLabel}
                >
                  <ExitArrow size={34} weight="fill" aria-hidden="true" />
                  <span>{exitLabel}</span>
                </button>
              )}
              <span className="tactical-route-stage-node-label">{node.label}</span>
              <div className="tactical-route-stage-groups">
                {groups.map(group => {
                  const actor = routeGroupIsActor(routeEvent, group);
                  const meleeAttacker = routeEvent?.kind === 'melee' && actor;
                  const firing = routeEvent?.kind === 'volley' && actor;
                  const casualtyHit = routeEvent?.kind === 'casualty' && routeEvent.groupId === group.groupId;
                  const withdrawing = routeEvent?.groupId === group.groupId &&
                    (routeEvent.kind === 'retreat' || routeEvent.kind === 'moraleBreak');
                  const targetable = group.side === 'raider' && targetableEnemyIds.has(group.groupId);
                  const focusTarget = group.side === 'raider' && selectedTargetGroupId === group.groupId;
                  const interactive = group.side === 'defender'
                    ? commandPhase && !playback && group.commandable
                    : !playback && targetable;
                  const unitDragProps = group.side === 'defender' && commandPhase && group.commandable && stageDragHandlePropsFor
                    ? stageDragHandlePropsFor(group.groupId)
                    : null;
                  return (
                    <button
                      type="button"
                      {...(unitDragProps ?? {})}
                      data-tactical-group-id={group.groupId}
                      className={`tactical-route-stage-group ${group.side} ${group.side === 'defender' ? 'tactical-field-group' : 'tactical-raider-group'}${unitDragProps ? ' stage-drag-handle' : ''}${stageDrag?.groupId === group.groupId ? ' stage-dragging' : ''}${selectedGroupId === group.groupId ? ' selected' : ''}${targetable ? ' targetable' : targetingActive && group.side === 'raider' ? ' target-unavailable' : ''}${focusTarget ? ' focus-target' : ''}${meleeAttacker ? ' melee-attacker' : ''}${firing ? ' firing' : ''}${casualtyHit ? ' casualty-hit' : ''}${withdrawing ? ' withdrawing' : ''}`}
                      disabled={!interactive}
                      aria-pressed={group.side === 'raider' && targetable ? focusTarget : undefined}
                      onClick={event => {
                        event.stopPropagation();
                        if (group.side === 'defender') onSelectGroup(group.groupId, event.currentTarget);
                        else if (targetable && selectedGroupId) {
                          onSelectTarget(selectedGroupId, group.groupId, event.currentTarget);
                        }
                      }}
                      title={group.side === 'raider'
                        ? targetable ? focusTarget ? '집중 표적 해제' : '이 적 부대를 집중 표적으로 지정'
                          : targetingActive ? '선택 부대가 공격할 수 없는 우회로 표적입니다.' : `${group.label} · ${group.count}명 · ${group.statusLabel}`
                        : `${group.label} · ${group.count}명 · ${group.statusLabel}`}
                      key={group.groupId}
                    >
                      <RouteFormationSprite group={group} raiderFaction={raiderFaction} activeEvent={routeEvent} />
                      <span className="tactical-unit-label">
                        {group.label}{group.side === 'raider' ? ` ${group.count}명` : ''}
                        <em className={`tactical-state-badge ${routeStatusBadgeClass(group.statusLabel)}`}>
                          {group.statusLabel}
                        </em>
                        {focusTarget && <em className="tactical-state-badge focus-target">집중 표적</em>}
                      </span>
                    </button>
                  );
                })}
                {groups.length === 0 && <span className="tactical-route-stage-empty">비어 있음</span>}
              </div>
            </div>
          );
        })}
      </div>
      {orderArrowPaths.length > 0 && (
        <svg className="tactical-order-arrow-layer tactical-route-order-arrow-layer" aria-hidden="true">
          <defs>
            <marker
              id={`tactical-route-order-arrow-${view.routeId}`}
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" className="tactical-order-arrow-head move" />
            </marker>
          </defs>
          {orderArrowPaths.map(path => (
            <path
              key={path.key}
              className="tactical-order-arrow move"
              d={path.d}
              markerEnd={`url(#tactical-route-order-arrow-${view.routeId})`}
            />
          ))}
        </svg>
      )}
      {routeEvent?.float && (
        <span key={`route-float-${eventIndex}`} className={`tactical-float ${routeEvent.side ?? 'defender'}`}>
          {routeEvent.float}
        </span>
      )}
    </section>
  );
}
