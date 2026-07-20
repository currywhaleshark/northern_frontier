import {
  enemyStratagemCounterStrength,
  enemyStratagemCounterStrengthForEngagement,
  enemyStratagemDefinition,
  type EnemyPlanSummaryView,
} from '../../game/enemyPlan';
import type { TacticalFlankRouteView } from '../../game/tacticalRoutes';
import type { EnemyPlan, EnemyStratagemId } from '../../game/types';

function counterLabel(strength: number): string {
  const percent = Math.round(Math.max(0, Math.min(1, strength)) * 100);
  if (percent >= 100) return '완전 대응 100%';
  if (percent > 0) return `부분 대응 ${percent}%`;
  return '미대응';
}

interface Props {
  plan: EnemyPlan;
  summary: EnemyPlanSummaryView;
  effectiveCounterStrengths?: Partial<Record<EnemyStratagemId, number>>;
  effectiveRearCounterZoneName?: string;
  /** P6 우회 징후 — 백엔드 tacticalFlankRouteView 결과. hidden 경로는 여기서도 표시하지 않는다. */
  routeViews?: TacticalFlankRouteView[];
}

export function EnemyPlanPanel({
  plan,
  summary,
  effectiveCounterStrengths,
  effectiveRearCounterZoneName,
  routeViews,
}: Props) {
  const revealed = plan.stratagems.filter(stratagem => stratagem.revealed);
  const hiddenCount = plan.stratagems.length - revealed.length;
  const { objective, doctrine, composition, intentSignals } = summary;
  const objectiveRevealed = objective.revealed;
  return (
    <aside className="tactical-enemy-plan" aria-label="적 목적·교리·편제·계책 정보">
      <div className="tactical-enemy-plan-heading">
        <strong>적 정보</strong>
        <span>계책점수 {plan.stratagemPoints}</span>
      </div>
      <p className="tactical-enemy-summary-line">
        {`목적: ${objective.label} · 교리: ${doctrine.label} · 편제: ${composition.templateLabel}`}
        {summary.hiddenStratagemCount > 0 && ` · 미확인 계책 ${summary.hiddenStratagemCount}개`}
      </p>
      {(routeViews ?? []).filter(view => view.display !== 'hidden').map(view => (
        <p className={`tactical-enemy-route-intel display-${view.display}`} key={view.route.id}>
          {view.display === 'suspected'
            ? `우회 징후: ${view.route.label} — 적 우회대 의심 · 도착 예상 ${view.expectedArrivalRounds?.[0]}~${view.expectedArrivalRounds?.[1]}교전`
            : `우회 확인: ${view.route.label} — ${view.transits.some(transit => transit.side === 'raider')
              ? '적 우회대 이동 중'
              : '통행 없음'}`}
        </p>
      ))}
      <div className={`tactical-enemy-objective${objectiveRevealed ? ' revealed' : ' hidden'}`}>
        <span>예상 목적</span>
        <strong>{objective.label}</strong>
      </div>
      <div className={`tactical-enemy-doctrine${doctrine.revealed ? ' revealed' : ' hidden'}`}>
        <span>교리</span>
        <strong>{doctrine.label}</strong>
        {doctrine.revealed && (
          <ul className="tactical-enemy-doctrine-notes">
            {doctrine.strength && <li className="doctrine-strength">강점 — {doctrine.strength}</li>}
            {doctrine.weakness && <li className="doctrine-weakness">약점 — {doctrine.weakness}</li>}
            {doctrine.counter && <li className="doctrine-counter">권장 대응 — {doctrine.counter}</li>}
          </ul>
        )}
        {intentSignals.groups.length > 0 && (
          <ul className="tactical-enemy-intent-signals" aria-label="공개된 적 부대의 행동 징후">
            {intentSignals.groups.map(group => (
              <li key={group.groupId} data-ai-state={group.state}>
                {group.label} — {group.signal}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className={`tactical-enemy-composition${composition.revealed ? ' revealed' : ' hidden'}`}>
        <span>편제</span>
        <strong>{composition.templateLabel}</strong>
        {(composition.groups.length > 0 || composition.hiddenGroupCount > 0) && (
          <ul className="tactical-enemy-composition-groups">
            {composition.groups.map(group => (
              <li key={group.groupId} className={group.exact ? 'exact' : 'category'}>
                {group.exact && group.count != null
                  ? `${group.label} ${group.count}명`
                  : `${group.category} (범주 추정)`}
                {group.support && <em className="support-tag"> 지원</em>}
              </li>
            ))}
            {composition.hiddenGroupCount > 0 && (
              <li className="hidden-groups">미확인 부대 {composition.hiddenGroupCount}개</li>
            )}
          </ul>
        )}
      </div>
      <div className="tactical-enemy-stratagems">
        {revealed.map(stratagem => {
          const definition = enemyStratagemDefinition(stratagem.id);
          const effectiveCounterStrength = effectiveCounterStrengths?.[stratagem.id];
          const counterStrength = effectiveCounterStrength ?? (stratagem.id === 'rearManeuver'
            ? enemyStratagemCounterStrengthForEngagement(stratagem, 0)
            : enemyStratagemCounterStrength(stratagem));
          return (
            <div className={`tactical-enemy-stratagem counter-${counterStrength >= 1 ? 2 : counterStrength > 0 ? 1 : 0}`} key={stratagem.id}>
              <strong>{definition.label}</strong>
              <span>{definition.effect}</span>
              <em>{counterLabel(counterStrength)}</em>
              {stratagem.id === 'rearManeuver' && (
                <small>{effectiveCounterStrength != null
                  ? `현재 ${effectiveRearCounterZoneName ?? '급습 전선'} 후열 경비 반영`
                  : '진형 대응은 실제 급습 전선에서 계산됩니다.'}</small>
              )}
            </div>
          );
        })}
        {hiddenCount > 0 && (
          <div className="tactical-enemy-stratagem hidden">
            <strong>미확인 계책 {hiddenCount}개</strong>
            <span>징후는 전투 전 로그에서 확인할 수 있습니다.</span>
          </div>
        )}
        {revealed.length === 0 && hiddenCount === 0 && (
          <div className="tactical-enemy-stratagem none">확인된 별도 계책 없음</div>
        )}
      </div>
    </aside>
  );
}
