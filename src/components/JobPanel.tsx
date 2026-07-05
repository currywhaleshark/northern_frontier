// 직업 배정 패널: 무직 풀에서 직업으로 +/-
import { JOB_DESC, JOB_NAMES, JOB_ORDER } from '../game/constants';
import { countJob } from '../game/residents';
import type { GameState, JobId } from '../game/types';

interface Props {
  state: GameState;
  onReassign: (from: JobId, to: JobId) => void;
}

export function JobPanel({ state, onReassign }: Props) {
  const idle = countJob(state, 'idle');
  return (
    <div className="section">
      <div className="panel-title">직업 배정 <span className="muted small">(무직 {idle}명)</span></div>
      {JOB_ORDER.filter(j => j !== 'idle').map(job => {
        const count = countJob(state, job);
        return (
          <div className="job-row" key={job} title={JOB_DESC[job]}>
            <span>{JOB_NAMES[job]}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <button className="job-btn" disabled={count === 0} onClick={() => onReassign(job, 'idle')}>−</button>
              <span className="count">{count}</span>
              <button className="job-btn" disabled={idle === 0} onClick={() => onReassign('idle', job)}>＋</button>
            </span>
          </div>
        );
      })}
    </div>
  );
}
