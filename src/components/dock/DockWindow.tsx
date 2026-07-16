import type { ReactNode } from 'react';
import type { DockWindowId } from '../../ui/dockPresentation';

interface Props {
  id: DockWindowId;
  title: string;
  pinned: boolean;
  children: ReactNode;
  onClose: () => void;
  onTogglePinned: () => void;
}

export function DockWindow({ id, title, pinned, children, onClose, onTogglePinned }: Props) {
  const titleId = `dock-window-${id}-title`;
  return (
    <section className="dock-window" aria-labelledby={titleId}>
      <header className="dock-window-head">
        <strong id={titleId}>{title}</strong>
        <div className="dock-window-actions">
          <button
            type="button"
            className={pinned ? 'active' : ''}
            aria-label={pinned ? `${title} 창 고정 해제` : `${title} 창 고정`}
            aria-pressed={pinned}
            title={pinned ? '다음 실행부터 자동 열기 해제' : '다음 실행에도 자동 열기'}
            onClick={onTogglePinned}
          >핀</button>
          <button type="button" aria-label={`${title} 창 닫기`} title="닫기" onClick={onClose}>×</button>
        </div>
      </header>
      <div className="dock-window-body">{children}</div>
    </section>
  );
}
