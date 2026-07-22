import { ArrowFatDown, ArrowFatUp } from '@phosphor-icons/react';
import { tacticalStageMoveUnavailableReason } from '../../game/tacticalBattle';
import type { TacticalRouteExitTarget, TacticalRouteStageView } from '../../game/tacticalRoutes';
import type { GameState, TacticalRouteNode } from '../../game/types';

const ROUTE_GATE_ANCHOR_PREFIX = 'route-node|';
const ROUTE_EXIT_ANCHOR_PREFIX = 'route-exit|';

export function routeGateAnchorId(routeId: string, node: TacticalRouteNode): string {
  return `${ROUTE_GATE_ANCHOR_PREFIX}${routeId}|${node}`;
}

export function parseRouteGateAnchorId(anchorId: string): { routeId: string; node: TacticalRouteNode } | null {
  if (!anchorId.startsWith(ROUTE_GATE_ANCHOR_PREFIX)) return null;
  const [routeId, node] = anchorId.slice(ROUTE_GATE_ANCHOR_PREFIX.length).split('|');
  if (!routeId || (node !== 'approachGate' && node !== 'middle' && node !== 'storehouseGate')) return null;
  return { routeId, node };
}

export function routeExitAnchorId(routeId: string, target: TacticalRouteExitTarget): string {
  return `${ROUTE_EXIT_ANCHOR_PREFIX}${routeId}|${target}`;
}

export function parseRouteExitAnchorId(anchorId: string): { routeId: string; target: TacticalRouteExitTarget } | null {
  if (!anchorId.startsWith(ROUTE_EXIT_ANCHOR_PREFIX)) return null;
  const [routeId, target] = anchorId.slice(ROUTE_EXIT_ANCHOR_PREFIX.length).split('|');
  if (!routeId || (target !== 'approach' && target !== 'wall' && target !== 'storehouse')) return null;
  return { routeId, target };
}

interface Props {
  state: GameState;
  zoneId: string;
  views: TacticalRouteStageView[];
  playback: boolean;
  selectedGroupId: string | null;
  stageDrag: { groupId: string; hoverAnchorId: string | null; mode: 'deployment' | 'command' } | null;
  onViewRoute: (routeId: string) => void;
  onRequestEntry: (groupId: string, routeId: string, node: TacticalRouteNode, element: HTMLElement) => void;
}

export function TacticalRouteGate({
  state, zoneId, views, playback, selectedGroupId, stageDrag, onViewRoute, onRequestEntry,
}: Props) {
  if (zoneId !== 'approach' && zoneId !== 'storehouse') return null;
  const endpoint = zoneId === 'approach' ? '진입' : '창고';
  const node: TacticalRouteNode = zoneId === 'approach' ? 'approachGate' : 'storehouseGate';
  const commandPhase = state.tacticalBattle?.phase === 'command';
  return (
    <div className={`tactical-route-gates zone-${zoneId}`} aria-label={`${endpoint} 우회로 출입구`}>
      {views.map(view => {
        const isUpperGate = view.side === 'left';
        const RouteArrow = isUpperGate ? ArrowFatUp : ArrowFatDown;
        const gateState = view.display === 'revealed'
          ? view.control === 'neutral' ? '개방' : view.control === 'defender' ? '아군 통제'
            : view.control === 'raider' ? '적 통제' : '교전 중'
          : view.display === 'suspected' ? '징후 · 위치 미확인' : '폐쇄';
        const sideLabel = view.side === 'left' ? '좌측' : '우측';
        const anchorId = routeGateAnchorId(view.routeId, node);
        const routeOpened = state.tacticalBattle?.flankRoutes?.find(route => route.id === view.routeId)?.openedByDefender === true;
        const entryAnchor = commandPhase && routeOpened;
        const selectedGroup = state.tacticalBattle?.defenderGroups.find(group => group.id === selectedGroupId);
        const selectedAtEndpoint = entryAnchor && selectedGroup?.zoneId === zoneId && !selectedGroup.routeTransit;
        const entryReason = entryAnchor && stageDrag?.mode === 'command'
          ? tacticalStageMoveUnavailableReason(state, stageDrag.groupId, {
            kind: 'routeNode', routeId: view.routeId, node,
          })
          : null;
        const anchorClass = entryAnchor && stageDrag?.mode === 'command'
          ? entryReason == null
            ? stageDrag.hoverAnchorId === anchorId ? ' deploy-anchor-hover' : ' deploy-anchor-valid'
            : ' deploy-anchor-blocked'
          : '';
        return (
          <button
            type="button"
            {...(entryAnchor ? { 'data-deploy-anchor': anchorId } : {})}
            className={`tactical-route-gate side-${view.side} position-${isUpperGate ? 'upper' : 'lower'} display-${view.display} control-${view.control}${anchorClass}`}
            disabled={playback || !view.accessible}
            onClick={event => {
              event.stopPropagation();
              if (selectedAtEndpoint && selectedGroupId) {
                onRequestEntry(selectedGroupId, view.routeId, node, event.currentTarget);
                return;
              }
              onViewRoute(view.routeId);
            }}
            title={`${view.label} · ${gateState}${selectedAtEndpoint
              ? ` · 선택한 ${selectedGroup?.label ?? '부대'}의 우회로 진입 명령`
              : entryAnchor ? ' · 이곳에 부대를 끌어 놓으면 우회로 입구로 진입합니다.' : ''}`}
            aria-label={`${sideLabel} 우회로 ${endpoint} · ${isUpperGate ? '위쪽' : '아래쪽'} 화살표 · ${view.label} · ${gateState}${selectedAtEndpoint ? ' · 선택 부대 진입' : entryAnchor ? ' · 부대 드롭으로 진입' : ''}`}
            key={view.routeId}
          >
            <span className="tactical-route-gate-arrow" aria-hidden="true">
              <RouteArrow size={34} weight="fill" />
            </span>
            <span className="tactical-route-gate-copy" aria-hidden="true">
              <strong>{sideLabel} 우회로</strong>
              <small>{gateState}</small>
            </span>
          </button>
        );
      })}
    </div>
  );
}
