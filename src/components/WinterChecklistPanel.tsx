// 겨울 점검 — "지금 곳간으로 겨울을 날 수 있는가"를 한 자리에 모아 보여 준다.
// 판정은 전부 winterReadiness.ts의 winterChecklist가 한다. 여기서는 그리기만 한다.
import { winterChecklist, winterReadiness, type WinterCheckVerdict } from '../game/winterReadiness';
import { getSeason } from '../game/seasons';
import { SEASON_NAMES } from '../game/constants';
import type { GameState } from '../game/types';

interface Props {
  state: GameState;
  onClose: () => void;
}

const VERDICT_MARK: Record<WinterCheckVerdict, string> = { ok: '✓', warn: '△', bad: '✕' };
const VERDICT_LABEL: Record<WinterCheckVerdict, string> = { ok: '좋음', warn: '아슬함', bad: '살펴야 함' };

export function WinterChecklistPanel({ state, onClose }: Props) {
  const items = winterChecklist(state);
  const readiness = winterReadiness(state);
  const season = getSeason(state.day);
  const shortfalls = items.filter(item => item.verdict !== 'ok').length;

  return (
    <div className="modal-overlay" role="presentation" onMouseDown={event => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <div
        className="modal winter-checklist-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="winter-checklist-title"
      >
        <div className="edict-heading">
          <div>
            <h2 id="winter-checklist-title">겨울 점검</h2>
            <div className="muted small">
              {SEASON_NAMES[season]} 기준 · 인구 소비 몫 {readiness.weight.toFixed(1)} ·
              {shortfalls === 0 ? ' 여섯 가지 모두 갖추었습니다' : ` ${shortfalls}가지가 아직 모자랍니다`}
            </div>
          </div>
          <button type="button" className="icon-btn" aria-label="닫기" onClick={onClose}>×</button>
        </div>

        <div className="muted small edict-rules">
          일분은 지금 인구가 겨울 소모로 먹고 땔 때의 셈입니다. 사람이 늘면 그만큼 줄어듭니다.
          모자란 것은 겨울에 채울 수 없으니, 가을에 미리 눌러 보십시오.
        </div>

        <ul className="winter-checklist-items">
          {items.map(item => (
            <li key={item.id} className={`winter-check-item ${item.verdict}`}>
              <span className="winter-check-mark" aria-hidden="true">{VERDICT_MARK[item.verdict]}</span>
              <div className="winter-check-text">
                <strong>
                  {item.label}
                  <span className="muted small"> · {VERDICT_LABEL[item.verdict]}</span>
                </strong>
                <div className="winter-check-value">{item.value}</div>
                <div className="muted small">{item.advice}</div>
              </div>
            </li>
          ))}
        </ul>

        <button type="button" className="btn primary game-menu-wide" onClick={onClose}>닫는다</button>
      </div>
    </div>
  );
}
