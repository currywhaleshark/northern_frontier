import { DAY_CYCLE_SUBTICKS } from '../game/dayCycle';
import { siegeReadiness } from '../game/siege';
import type { GameState, SiegeStance } from '../game/types';

const STANCE_NAMES: Record<SiegeStance, string> = { hold: '농성', wall: '성벽전', field: '회전' };
const PHASE_NAMES = {
  evacuation: '피난 유예', encirclement: '포위 대치', wallCombat: '성벽 교전', sortie: '출격', withdrawal: '철수',
} as const;

function days(value: number): string {
  return Number.isFinite(value) ? `${Math.max(0, Math.floor(value))}일분` : '넉넉함';
}

export function SiegePanel({ state, onChangeStance }: {
  state: GameState;
  onChangeStance: (stance: SiegeStance) => void;
}) {
  const siege = state.siegeState;
  if (!siege) return null;
  const readiness = siegeReadiness(state);
  const estimate = siege.enemySupplyEstimate.min === siege.enemySupplyEstimate.max
    ? `${siege.enemySupplyEstimate.min}일`
    : `${siege.enemySupplyEstimate.min}~${siege.enemySupplyEstimate.max}일`;
  const now = state.day * DAY_CYCLE_SUBTICKS + state.subTick;
  const evacuationTicks = Math.max(0, siege.evacuationDeadlineTick - now);
  const switchedToday = siege.lastStanceChangeDay === state.day;

  return (
    <section className="siege-panel" aria-label="공성 현황">
      <header><strong>공성 — {siege.faction}</strong><span>{PHASE_NAMES[siege.phase]}</span></header>
      <div className="siege-panel-grid">
        <span>현재 태세</span><b>{STANCE_NAMES[siege.stance]}</b>
        <span>적 전력</span><b>{Math.ceil(siege.raiderPower)}</b>
        <span>적 군량 예상</span><b>{estimate}</b>
        {siege.phase === 'evacuation' && <><span>폐문까지</span><b>{evacuationTicks}틱</b></>}
        <span>성내 인원</span><b>{readiness?.evacuees ?? 0}명</b>
        <span>성밖 고립</span><b className={siege.strandedResidentIds.length > 0 ? 'bad' : ''}>{siege.strandedResidentIds.length}명</b>
        <span>보호 식량</span><b>{days(readiness?.foodDays ?? 0)}</b>
        <span>보호 땔감</span><b>{days(readiness?.firewoodDays ?? 0)}</b>
        <span>남은 약탈 목표</span><b>{Math.max(0, siege.plunderTargetIds.length - siege.plunderedTargetIds.length)}</b>
      </div>
      {siege.phase !== 'evacuation' && siege.phase !== 'sortie' && siege.phase !== 'withdrawal' && (
        <div className="siege-stance-actions">
          <button disabled={siege.stance === 'hold' || switchedToday} onClick={() => onChangeStance('hold')}>농성</button>
          <button disabled={siege.stance === 'wall' || switchedToday} onClick={() => onChangeStance('wall')}>성벽전</button>
          <button className="danger" onClick={() => onChangeStance('field')}>수비대 출격</button>
        </div>
      )}
      {switchedToday && siege.phase !== 'evacuation' && <small>오늘은 이미 태세를 바꿨습니다.</small>}
    </section>
  );
}
