import type { CSSProperties, ReactNode } from 'react';
import type { DockWindowId } from '../../ui/dockPresentation';
import { DockWindow } from './DockWindow';

export interface DockFrameItem {
  id: DockWindowId;
  label: string;
  icon: string;
  content: ReactNode;
}

interface Props {
  items: readonly DockFrameItem[];
  openWindowIds: readonly DockWindowId[];
  pinnedWindowIds: readonly DockWindowId[];
  onToggleWindow: (id: DockWindowId) => void;
  onTogglePinned: (id: DockWindowId) => void;
}

export function DockFrame({ items, openWindowIds, pinnedWindowIds, onToggleWindow, onTogglePinned }: Props) {
  const openItems = items.filter(item => openWindowIds.includes(item.id));
  const stackStyle = {
    '--dock-window-count': Math.max(1, openItems.length),
    '--dock-strip-count': items.length,
  } as CSSProperties;

  return (
    <aside className={`dock-frame${openItems.length > 0 ? ' has-open-windows' : ''}`} aria-label="관리 창">
      <div className="dock-window-stack" style={stackStyle}>
        {openItems.map(item => (
          <DockWindow
            key={item.id}
            id={item.id}
            title={item.label}
            pinned={pinnedWindowIds.includes(item.id)}
            onClose={() => onToggleWindow(item.id)}
            onTogglePinned={() => onTogglePinned(item.id)}
          >
            {item.content}
          </DockWindow>
        ))}
      </div>
      <nav className="dock-strip" aria-label="관리 창 열기">
        {items.map(item => {
          const open = openWindowIds.includes(item.id);
          const pinned = pinnedWindowIds.includes(item.id);
          return (
            <button
              key={item.id}
              type="button"
              className={`${open ? 'active' : ''}${pinned ? ' pinned' : ''}`}
              aria-label={`${item.label} 창 ${open ? '닫기' : '열기'}`}
              aria-pressed={open}
              title={`${item.label}${pinned ? ' · 고정됨' : ''}`}
              onClick={() => onToggleWindow(item.id)}
            >
              <span aria-hidden="true">{item.icon}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
