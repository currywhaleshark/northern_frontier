// 사건 선택지 모달 — 열려 있는 동안 시뮬레이션은 멈춘다
import type { PendingChoice } from '../game/types';
import { DialoguePortrait } from './DialoguePortrait';
import { renderFactionText } from './FactionName';
import { UiIcon } from './UiIcon';

interface Props {
  choice: PendingChoice;
  onChoose: (optionId: string) => void;
}

export function EventModal({ choice, onChoose }: Props) {
  const bodyLines = choice.body.split('\n');
  const body = (
    <div className={choice.dialogue ? 'dialogue-body' : 'body'}>
      {bodyLines.map((line, i) => (
        <div key={i}>{renderFactionText(line, choice.data.faction)}</div>
      ))}
    </div>
  );
  return (
    <div className="modal-overlay">
      <div
        className={`modal${choice.illustration ? ' event-modal-illustrated' : ''}${choice.dialogue ? ' event-modal-dialogue' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="event-modal-title"
      >
        <h2 id="event-modal-title">{choice.title}</h2>
        {choice.illustration && (
          <img
            className="event-illustration"
            src={choice.illustration.src}
            alt={choice.illustration.alt}
          />
        )}
        {choice.dialogue ? (
          <div className="dialogue-scene">
            <DialoguePortrait dialogue={choice.dialogue} />
            <div className="dialogue-copy">
              <div className="dialogue-speaker">
                <strong>{choice.dialogue.speaker}</strong>
                {choice.dialogue.speakerTitle && <span>{choice.dialogue.speakerTitle}</span>}
              </div>
              {body}
            </div>
          </div>
        ) : body}
        <div className="choice-list">
          {choice.options.map(opt => (
            <button
              key={opt.id}
              className="choice-btn"
              disabled={opt.disabled}
              onClick={() => onChoose(opt.id)}
            >
              <div className="label">{opt.label}</div>
              {(opt.disabled || opt.desc) && (
                <div className="desc">{opt.disabled ? <><UiIcon name="disabled" size={18} /> {opt.disabledReason}</> : opt.desc}</div>
              )}
              {!opt.disabled && opt.effect && <div className="choice-effect">{opt.effect}</div>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
