// 습격/교역 선택지 모달 — 열려 있는 동안 시뮬레이션은 멈춘다
import type { PendingChoice } from '../game/types';
import { renderFactionText } from './FactionName';

interface Props {
  choice: PendingChoice;
  onChoose: (optionId: string) => void;
}

export function EventModal({ choice, onChoose }: Props) {
  const bodyLines = choice.body.split('\n');
  return (
    <div className="modal-overlay">
      <div className="modal">
        <h2>{choice.title}</h2>
        <div className="body">
          {bodyLines.map((line, i) => (
            <div key={i}>{renderFactionText(line, choice.data.faction)}</div>
          ))}
        </div>
        {choice.options.map(opt => (
          <button
            key={opt.id}
            className="choice-btn"
            disabled={opt.disabled}
            onClick={() => onChoose(opt.id)}
          >
            <div className="label">{opt.label}</div>
            <div className="desc">{opt.disabled ? `⛔ ${opt.disabledReason}` : opt.desc}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
