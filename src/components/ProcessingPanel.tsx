import { RESOURCE_ICONS, RESOURCE_NAMES } from '../game/constants';
import { PROCESSING_INPUTS } from '../game/processing';
import type { GameState, ProcessingInputId } from '../game/types';

interface Props {
  state: GameState;
  onSetReserve: (resource: ProcessingInputId, amount: number) => void;
}

export function ProcessingPanel({ state, onSetReserve }: Props) {
  return (
    <div className="section">
      <div className="panel-title">가공 조절</div>
      {PROCESSING_INPUTS.map(id => {
        const stock = Math.floor(state.resources[id]);
        const reserve = state.processingReserves?.[id] ?? 0;
        const processable = Math.max(0, stock - reserve);
        return (
          <div className="processing-row" key={id}>
            <div className="processing-name" title={`${RESOURCE_NAMES[id]} ${stock}`}>
              <span>{RESOURCE_ICONS[id]}</span>
              <span>{RESOURCE_NAMES[id]}</span>
            </div>
            <div className="processing-controls">
              <button className="job-btn" title="5 줄이기" onClick={() => onSetReserve(id, reserve - 5)}>-5</button>
              <button className="job-btn" title="1 줄이기" onClick={() => onSetReserve(id, reserve - 1)}>-</button>
              <input
                className="processing-input"
                type="number"
                min={0}
                step={1}
                value={reserve}
                title="남길 양"
                onChange={e => onSetReserve(id, Number(e.target.value))}
              />
              <button className="job-btn" title="1 늘리기" onClick={() => onSetReserve(id, reserve + 1)}>+</button>
              <button className="job-btn" title="5 늘리기" onClick={() => onSetReserve(id, reserve + 5)}>+5</button>
            </div>
            <div className="processing-meta">
              보유 {stock} · 가공 {Math.floor(processable)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
