import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
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
  pinnedWindowIds: readonly DockWindowId[];
  onTogglePinned: (id: DockWindowId) => void;
}

export function DockFrame({ items, pinnedWindowIds, onTogglePinned }: Props) {
  const [openWindowIds, setOpenWindowIds] = useState<readonly DockWindowId[]>(() => [...pinnedWindowIds]);

  useEffect(() => {
    setOpenWindowIds(current => {
      const added = pinnedWindowIds.filter(id => !current.includes(id));
      return added.length > 0 ? [...current, ...added] : current;
    });
  }, [pinnedWindowIds]);

  const openItems = items.filter(item => openWindowIds.includes(item.id));
  const stackStyle = {
    '--dock-window-count': Math.max(1, openItems.length),
  } as CSSProperties;

  const toggleWindow = (id: DockWindowId) => {
    setOpenWindowIds(current => current.includes(id)
      ? current.filter(openId => openId !== id)
      : [...current, id]);
  };

  return (
    <aside className={`dock-frame${openItems.length > 0 ? ' has-open-windows' : ''}`} aria-label="관리 창">
      <div className="dock-window-stack" style={stackStyle}>
        {openItems.map(item => (
          <DockWindow
            key={item.id}
            id={item.id}
            title={item.label}
            pinned={pinnedWindowIds.includes(item.id)}
            onClose={() => toggleWindow(item.id)}
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
              onClick={() => toggleWindow(item.id)}
            >
              <span aria-hidden="true">{item.icon}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
