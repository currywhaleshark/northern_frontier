// Phase 6·7 무대 우회로 리본 — 공개(revealed)·징후(suspected) 경로만 무대 가장자리에 표시한다.
// 표시 상태·step·도착 범위는 전부 백엔드 tacticalFlankRouteView 계약 값이며, hidden 경로와
// 비공개 이동은 어떤 형태로도 렌더하지 않는다 (계획서 8.6).
// P7: 배치 단계에는 플레이어가 연 경로 행이 차단 배치 드롭 앵커가 되고, 재생 중에는
// routeAdvances → routeEngagements → routeArrivals 순으로 보고 배열을 그대로 재생한다.
import { tacticalRoutePlacementUnavailableReason } from '../../game/tacticalBattle';
import type { TacticalFlankRouteView } from '../../game/tacticalRoutes';
import type {
  TacticalBattle,
  TacticalRouteAdvance,
  TacticalRouteArrival,
  TacticalRouteEngagement,
  TacticalRouteSide,
} from '../../game/types';

const STEP_LABELS = ['입구', '중간', '후방 출구'] as const;

export const ROUTE_ANCHOR_PREFIX = 'route|';

export function parseRouteAnchorId(anchorId: string): TacticalRouteSide | null {
  if (!anchorId.startsWith(ROUTE_ANCHOR_PREFIX)) return null;
  const side = anchorId.slice(ROUTE_ANCHOR_PREFIX.length);
  return side === 'left' || side === 'right' ? side : null;
}

function controlLabel(control: TacticalFlankRouteView['route']['control']): string {
  if (control === 'defender') return '아군 통제';
  if (control === 'raider') return '적 통제';
  if (control === 'contested') return '교전 중';
  return '';
}

function engagementOutcomeLabel(outcome: TacticalRouteEngagement['outcome']): string {
  if (outcome === 'defenderHeld') return '차단 성공';
  if (outcome === 'raiderBreakthrough') return '차단 붕괴';
  return '경로 대치';
}

interface Props {
  battle: TacticalBattle;
  views: TacticalFlankRouteView[];
  /** 이번 라운드 재생 중일 때만 전달 — visibleToDefender 항목만 이동 표시에 쓴다 */
  routeAdvances: readonly TacticalRouteAdvance[] | null;
  /** P7 경로 교전·출구 도달 보고 — 승패·피해는 이 배열에서만 읽는다 */
  routeEngagements: readonly TacticalRouteEngagement[] | null;
  routeArrivals: readonly TacticalRouteArrival[] | null;
  playback: boolean;
  /** 배치 단계에만 true — 플레이어가 연 경로 행을 차단 배치 앵커로 만든다 */
  deploymentPhase: boolean;
  /** 배치 카드·무대 부대 드래그 중일 때의 대상 부대와 호버 앵커 */
  blockerDrag: { groupId: string; hoverAnchorId: string | null } | null;
  onFocusRoute: (zoneId: string) => void;
}

export function TacticalRouteRibbon({
  battle, views, routeAdvances, routeEngagements, routeArrivals, playback, deploymentPhase, blockerDrag, onFocusRoute,
}: Props) {
  const visible = views.filter(view => view.display !== 'hidden');
  if (visible.length === 0) return null;
  const groupLabel = (groupId: string) =>
    battle.defenderGroups.find(group => group.id === groupId)?.label ??
    battle.raiderGroups.find(group => group.id === groupId)?.label ?? '';
  const zoneName = (zoneId: string) => battle.zones.find(zone => zone.id === zoneId)?.name ?? zoneId;
  return (
    <div className="tactical-route-ribbon" role="group" aria-label="우회로 상황">
      {visible.map(view => {
        const advances = (routeAdvances ?? []).filter(advance =>
          advance.routeId === view.route.id && advance.visibleToDefender);
        const engagements = (routeEngagements ?? []).filter(engagement => engagement.routeId === view.route.id);
        const arrivals = (routeArrivals ?? []).filter(arrival => arrival.routeId === view.route.id &&
          (arrival.side === 'defender' || view.display === 'revealed' || arrival.rearAssault));
        // 차단 배치 앵커 — 플레이어가 연 경로에만, 유효성은 백엔드 placement reason이 단일 소스
        const anchorId = `${ROUTE_ANCHOR_PREFIX}${view.route.side}`;
        const anchorActive = deploymentPhase && view.route.openedByDefender;
        const blockReason = anchorActive && blockerDrag
          ? tacticalRoutePlacementUnavailableReason(battle, blockerDrag.groupId, view.route.side)
          : null;
        const anchorClass = anchorActive && blockerDrag
          ? blockReason == null
            ? blockerDrag.hoverAnchorId === anchorId ? ' deploy-anchor-hover' : ' deploy-anchor-valid'
            : ' deploy-anchor-blocked'
          : '';
        return (
          <button
            type="button"
            key={view.route.id}
            {...(anchorActive ? { 'data-deploy-anchor': anchorId } : {})}
            className={`tactical-route-ribbon-row side-${view.route.side} display-${view.display} control-${view.route.control}${anchorClass}`}
            title={view.display === 'suspected'
              ? `${view.route.label} — 적 우회 징후. 정확한 위치는 알 수 없습니다.`
              : anchorActive
                ? `${view.route.label} — 카드나 부대를 끌어 놓으면 경로 중간을 차단합니다.`
                : `${view.route.label} — ${controlLabel(view.route.control) || '통행 없음'}`}
            disabled={playback}
            onClick={() => onFocusRoute('approach')}
          >
            <strong>{view.route.side === 'left' ? '좌' : '우'} · {view.route.label}</strong>
            {view.display === 'suspected' ? (
              <span className="tactical-route-suspect">
                ? 징후 — 도착 예상 {view.expectedArrivalRounds?.[0]}~{view.expectedArrivalRounds?.[1]}교전
              </span>
            ) : (
              <span className="tactical-route-steps" aria-label={`${view.route.label} 이동 단계`}>
                {([0, 1, 2] as const).map(step => (
                  <span className="tactical-route-step" key={step} title={STEP_LABELS[step]}>
                    {view.transits.filter(transit => transit.step === step).map(transit => (
                      <i
                        className={`tactical-route-unit ${transit.side}`}
                        key={transit.groupId}
                        title={`${groupLabel(transit.groupId)} — ${STEP_LABELS[step]}`}
                      />
                    ))}
                  </span>
                ))}
              </span>
            )}
            {view.display === 'revealed' && view.route.control !== 'neutral' && (
              <em className={`tactical-route-control ${view.route.control}`}>{controlLabel(view.route.control)}</em>
            )}
            {advances.map(advance => (
              <em className="tactical-route-advance" key={`advance-${advance.groupId}-${advance.toStep}`}>
                {groupLabel(advance.groupId)} {advance.arrivedAtExit ? '후방 출구 도달!' : `${STEP_LABELS[advance.toStep]} 진입`}
              </em>
            ))}
            {engagements.map((engagement, index) => (
              <em
                className={`tactical-route-engagement outcome-${engagement.outcome}`}
                key={`engagement-${index}`}
                title={engagement.lines.join(' ')}
              >
                {engagementOutcomeLabel(engagement.outcome)} — 아군 피해 {engagement.defenderLosses} ·
                {' '}적 피해 {engagement.raiderLosses}
                {engagement.defenderRetreated ? ' · 차단대 패퇴' : ''}
                {engagement.raiderRetreated ? ' · 적 철수' : ''}
              </em>
            ))}
            {arrivals.map(arrival => (
              <em
                className={`tactical-route-arrival side-${arrival.side}`}
                key={`arrival-${arrival.groupId}`}
              >
                {arrival.side === 'raider'
                  ? `적 우회대 ${zoneName(arrival.destinationZoneId)} 후방 진입!`
                  : `${groupLabel(arrival.groupId)} — ${zoneName(arrival.destinationZoneId)} 후열 급습 도달!`}
              </em>
            ))}
          </button>
        );
      })}
    </div>
  );
}
