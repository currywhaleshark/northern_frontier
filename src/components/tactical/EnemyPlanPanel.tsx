import { enemyStratagemCounterStrength, enemyStratagemDefinition } from '../../game/enemyPlan';
import type { EnemyObjectiveId, EnemyPlan } from '../../game/types';

const OBJECTIVE_LABELS: Record<EnemyObjectiveId, string> = {
  breakthrough: '방어선 돌파',
  plunder: '비축 약탈',
  arson: '방책·창고 방화',
};

function counterLabel(strength: number): string {
  const percent = Math.round(Math.max(0, Math.min(1, strength)) * 100);
  if (percent >= 100) return '완전 대응 100%';
  if (percent > 0) return `부분 대응 ${percent}%`;
  return '미대응';
}

export function EnemyPlanPanel({ plan }: { plan: EnemyPlan }) {
  const revealed = plan.stratagems.filter(stratagem => stratagem.revealed);
  const hiddenCount = plan.stratagems.length - revealed.length;
  return (
    <aside className="tactical-enemy-plan" aria-label="적 목적과 계책 정보">
      <div className="tactical-enemy-plan-heading">
        <strong>적 정보</strong>
        <span>계책점수 {plan.stratagemPoints}</span>
      </div>
      <div className={`tactical-enemy-objective${plan.objectiveRevealed ? ' revealed' : ' hidden'}`}>
        <span>예상 목적</span>
        <strong>{plan.objectiveRevealed ? OBJECTIVE_LABELS[plan.objective] : '미확인'}</strong>
      </div>
      <div className="tactical-enemy-stratagems">
        {revealed.map(stratagem => {
          const definition = enemyStratagemDefinition(stratagem.id);
          const counterStrength = enemyStratagemCounterStrength(stratagem);
          return (
            <div className={`tactical-enemy-stratagem counter-${counterStrength >= 1 ? 2 : counterStrength > 0 ? 1 : 0}`} key={stratagem.id}>
              <strong>{definition.label}</strong>
              <span>{definition.effect}</span>
              <em>{counterLabel(counterStrength)}</em>
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
