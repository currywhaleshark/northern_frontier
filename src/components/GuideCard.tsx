// 초회 도움말 카드 — 시간을 멈추지 않는 작은 안내.
// 코치 말풍선(가리키는 파란 말풍선)과 구별되게 왼쪽 아래에 쌓이고, 닫기 전까지 남는다.
// 같은 내용이 로그에도 한 줄 남으므로 놓치고 닫아도 되짚을 수 있다.
import type { GuideCardEntry } from '../game/types';

interface Props {
  cards: readonly GuideCardEntry[];
  onDismiss: (moduleId: string) => void;
}

export function GuideCardLayer({ cards, onDismiss }: Props) {
  if (cards.length === 0) return null;
  return (
    <div className="guide-card-layer" role="status" aria-live="polite">
      {cards.map(card => (
        <section key={card.moduleId} className="guide-card" aria-label={`길잡이 — ${card.title}`}>
          <header className="guide-card-head">
            <span className="guide-card-label">길잡이</span>
            <strong>{card.title}</strong>
            <button
              type="button"
              className="icon-btn"
              aria-label={`${card.title} 안내 닫기`}
              title="닫기"
              onClick={() => onDismiss(card.moduleId)}
            >×</button>
          </header>
          <div className="guide-card-body">
            {card.body.split('\n').map((line, index) => <div key={index}>{line}</div>)}
          </div>
        </section>
      ))}
    </div>
  );
}
