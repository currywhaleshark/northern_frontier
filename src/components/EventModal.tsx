// 사건 선택지 모달 — 열려 있는 동안 시뮬레이션은 멈춘다
import type { PendingChoice } from '../game/types';
import { renderFactionText } from './FactionName';
import { UiIcon } from './UiIcon';

interface Props {
  choice: PendingChoice;
  onChoose: (optionId: string) => void;
}

export function EventModal({ choice, onChoose }: Props) {
  const bodyLines = choice.body.split('\n');
  return (
    <div className="modal-overlay">
      <div className={`modal${choice.illustration ? ' event-modal-illustrated' : ''}`}>
        <h2>{choice.title}</h2>
        {choice.illustration && (
          <img
            className="event-illustration"
            src={choice.illustration.src}
            alt={choice.illustration.alt}
          />
        )}
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
            <div className="desc">{opt.disabled ? <><UiIcon name="disabled" size={18} /> {opt.disabledReason}</> : opt.desc}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
