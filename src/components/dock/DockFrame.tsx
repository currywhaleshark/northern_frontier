import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import {
  resolveDockWindowLayout,
  type DockViewport,
  type DockWindowLayout,
  type DockWindowLayouts,
} from '../../ui/dockLayout';
import {
  FLOATING_WINDOW_IDS,
  type DockWindowId,
  type FloatingWindowId,
  type HudWindowId,
} from '../../ui/dockPresentation';
import { DockWindow } from './DockWindow';

export interface DockFrameItem {
  id: DockWindowId;
  label: string;
  icon: string;
  content: ReactNode;
}

export interface DockOverlayItem {
  id: HudWindowId;
  label: string;
  className?: string;
  content: ReactNode;
}

interface Props {
  items: readonly DockFrameItem[];
  overlayItems: readonly DockOverlayItem[];
  openWindowIds: readonly DockWindowId[];
  windowOrder: readonly FloatingWindowId[];
  pinnedWindowIds: readonly DockWindowId[];
  layouts: DockWindowLayouts;
  onToggleWindow: (id: DockWindowId) => void;
  onTogglePinned: (id: DockWindowId) => void;
  onFocusWindow: (id: FloatingWindowId) => void;
  onCommitLayout: (id: FloatingWindowId, layout: DockWindowLayout) => void;
  onResetLayout: (id: FloatingWindowId) => void;
}

const EMPTY_VIEWPORT: DockViewport = { width: 0, height: 0 };

export function DockFrame({
  items,
  overlayItems,
  openWindowIds,
  windowOrder,
  pinnedWindowIds,
  layouts,
  onToggleWindow,
  onTogglePinned,
  onFocusWindow,
  onCommitLayout,
  onResetLayout,
}: Props) {
  const frameRef = useRef<HTMLElement>(null);
  const [viewport, setViewport] = useState<DockViewport>(EMPTY_VIEWPORT);
  const openItems = items.filter(item => openWindowIds.includes(item.id));
  const floatingItems = [
    ...openItems.map(item => ({ ...item, className: undefined, management: true as const })),
    ...overlayItems.map(item => ({ ...item, icon: '', management: false as const })),
  ];

  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const measure = () => {
      const bounds = frame.getBoundingClientRect();
      const next = { width: Math.round(bounds.width), height: Math.round(bounds.height) };
      setViewport(current => current.width === next.width && current.height === next.height ? current : next);
    };
    measure();
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(measure);
      observer.observe(frame);
      return () => observer.disconnect();
    }
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  return (
    <aside
      ref={frameRef}
      className={`dock-frame${openItems.length > 0 ? ' has-open-windows' : ''}`}
      aria-label="관리 창"
    >
      <div className="dock-window-layer">
        {floatingItems.map(item => {
          const registrationIndex = FLOATING_WINDOW_IDS.indexOf(item.id);
          const layout = resolveDockWindowLayout(item.id, layouts[item.id], viewport, registrationIndex);
          const orderIndex = windowOrder.indexOf(item.id);
          return (
            <DockWindow
              key={item.id}
              id={item.id}
              title={item.label}
              className={item.className}
              pinned={item.management ? pinnedWindowIds.includes(item.id) : undefined}
              layout={layout}
              viewport={viewport}
              zIndex={Math.max(0, orderIndex) + 1}
              active={windowOrder[windowOrder.length - 1] === item.id}
              onClose={item.management ? () => onToggleWindow(item.id) : undefined}
              onTogglePinned={item.management ? () => onTogglePinned(item.id) : undefined}
              onFocus={() => onFocusWindow(item.id)}
              onLayoutCommit={layoutOverride => onCommitLayout(item.id, layoutOverride)}
              onResetLayout={() => onResetLayout(item.id)}
            >
              {item.content}
            </DockWindow>
          );
        })}
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
              data-tut={`dock-${item.id}`}
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
