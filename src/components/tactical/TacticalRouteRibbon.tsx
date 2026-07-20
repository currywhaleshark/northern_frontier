// Phase 6 무대 우회로 리본 — 공개(revealed)·징후(suspected) 경로만 무대 가장자리에 표시한다.
// 표시 상태·step·도착 범위는 전부 백엔드 tacticalFlankRouteView 계약 값이며, hidden 경로와
// 비공개 이동은 어떤 형태로도 렌더하지 않는다 (계획서 8.6).
import type { TacticalFlankRouteView } from '../../game/tacticalRoutes';
import type { TacticalBattle, TacticalRouteAdvance } from '../../game/types';

const STEP_LABELS = ['입구', '중간', '후방 출구'] as const;

function controlLabel(control: TacticalFlankRouteView['route']['control']): string {
  if (control === 'defender') return '아군 통제';
  if (control === 'raider') return '적 통제';
  if (control === 'contested') return '교전 중';
  return '';
}

interface Props {
  battle: TacticalBattle;
  views: TacticalFlankRouteView[];
  /** 이번 라운드 재생 중일 때만 전달 — visibleToDefender 항목만 이동 표시에 쓴다 */
  routeAdvances: readonly TacticalRouteAdvance[] | null;
  playback: boolean;
  onFocusRoute: (zoneId: string) => void;
}

export function TacticalRouteRibbon({ battle, views, routeAdvances, playback, onFocusRoute }: Props) {
  const visible = views.filter(view => view.display !== 'hidden');
  if (visible.length === 0) return null;
  const groupLabel = (groupId: string) =>
    battle.defenderGroups.find(group => group.id === groupId)?.label ??
    battle.raiderGroups.find(group => group.id === groupId)?.label ?? '';
  return (
    <div className="tactical-route-ribbon" role="group" aria-label="우회로 상황">
      {visible.map(view => {
        const advances = (routeAdvances ?? []).filter(advance =>
          advance.routeId === view.route.id && advance.visibleToDefender);
        return (
          <button
            type="button"
            key={view.route.id}
            className={`tactical-route-ribbon-row side-${view.route.side} display-${view.display} control-${view.route.control}`}
            title={view.display === 'suspected'
              ? `${view.route.label} — 적 우회 징후. 정확한 위치는 알 수 없습니다.`
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
              <em className="tactical-route-advance" key={`${advance.groupId}-${advance.toStep}`}>
                {groupLabel(advance.groupId)} {advance.arrivedAtExit ? '후방 출구 도달!' : `${STEP_LABELS[advance.toStep]} 진입`}
              </em>
            ))}
          </button>
        );
      })}
    </div>
  );
}
