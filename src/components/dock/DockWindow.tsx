import {
  useCallback,
  useEffect,
  useRef,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import {
  moveDockWindowLayout,
  resizeDockWindowLayout,
  type DockResizeEdge,
  type DockViewport,
  type DockWindowLayout,
} from '../../ui/dockLayout';
import type { FloatingWindowId } from '../../ui/dockPresentation';

interface Props {
  id: FloatingWindowId;
  title: string;
  className?: string;
  pinned?: boolean;
  layout: DockWindowLayout;
  viewport: DockViewport;
  zIndex: number;
  active: boolean;
  children: ReactNode;
  onClose?: () => void;
  onTogglePinned?: () => void;
  onFocus: () => void;
  onLayoutCommit: (layout: DockWindowLayout) => void;
  onResetLayout: () => void;
}

interface DockGesture {
  pointerId: number;
  captureTarget: HTMLElement;
  kind: 'move' | 'resize';
  edge?: DockResizeEdge;
  startX: number;
  startY: number;
  startLayout: DockWindowLayout;
  currentLayout: DockWindowLayout;
}

const RESIZE_EDGES: readonly DockResizeEdge[] = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'];

function sameLayout(a: DockWindowLayout, b: DockWindowLayout): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

export function DockWindow({
  id,
  title,
  className,
  pinned = false,
  layout,
  viewport,
  zIndex,
  active,
  children,
  onClose,
  onTogglePinned,
  onFocus,
  onLayoutCommit,
  onResetLayout,
}: Props) {
  const titleId = `dock-window-${id}-title`;
  const windowRef = useRef<HTMLElement>(null);
  const layoutRef = useRef(layout);
  const viewportRef = useRef(viewport);
  const gestureRef = useRef<DockGesture | null>(null);
  const rafRef = useRef(0);
  layoutRef.current = layout;
  viewportRef.current = viewport;

  const applyLayout = useCallback((next: DockWindowLayout) => {
    const element = windowRef.current;
    if (!element) return;
    element.style.transform = `translate3d(${next.x}px, ${next.y}px, 0)`;
    element.style.width = `${next.width}px`;
    element.style.height = `${next.height}px`;
  }, []);

  const cancelPendingFrame = useCallback(() => {
    if (!rafRef.current) return;
    cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
  }, []);

  const scheduleCurrentLayout = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      const gesture = gestureRef.current;
      if (gesture) applyLayout(gesture.currentLayout);
    });
  }, [applyLayout]);

  const layoutAtPointer = useCallback((gesture: DockGesture, clientX: number, clientY: number) => {
    const deltaX = clientX - gesture.startX;
    const deltaY = clientY - gesture.startY;
    return gesture.kind === 'move'
      ? moveDockWindowLayout(gesture.startLayout, deltaX, deltaY, viewportRef.current)
      : resizeDockWindowLayout(
        gesture.startLayout,
        gesture.edge ?? 'se',
        deltaX,
        deltaY,
        viewportRef.current,
      );
  }, []);

  const settleGesture = useCallback((pointerId: number, commit: boolean, releaseCapture = true) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== pointerId) return;
    gestureRef.current = null;
    cancelPendingFrame();
    const finalLayout = commit ? gesture.currentLayout : gesture.startLayout;
    applyLayout(finalLayout);
    if (releaseCapture) {
      try {
        if (gesture.captureTarget.hasPointerCapture(pointerId)) {
          gesture.captureTarget.releasePointerCapture(pointerId);
        }
      } catch {
        // 포인터가 이미 취소되거나 대상이 분리된 경우에는 정리만 계속한다.
      }
    }
    if (commit && !sameLayout(gesture.startLayout, finalLayout)) onLayoutCommit(finalLayout);
  }, [applyLayout, cancelPendingFrame, onLayoutCommit]);

  useEffect(() => {
    const cancelOnEscape = (event: KeyboardEvent) => {
      const gesture = gestureRef.current;
      if (!gesture || event.key !== 'Escape') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      settleGesture(gesture.pointerId, false);
    };
    window.addEventListener('keydown', cancelOnEscape, true);
    return () => window.removeEventListener('keydown', cancelOnEscape, true);
  }, [settleGesture]);

  useEffect(() => () => cancelPendingFrame(), [cancelPendingFrame]);

  const beginGesture = (
    event: ReactPointerEvent<HTMLElement>,
    kind: DockGesture['kind'],
    edge?: DockResizeEdge,
  ) => {
    if (event.button !== 0 || gestureRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    const captureTarget = event.currentTarget;
    const startLayout = layoutRef.current;
    gestureRef.current = {
      pointerId: event.pointerId,
      captureTarget,
      kind,
      edge,
      startX: event.clientX,
      startY: event.clientY,
      startLayout,
      currentLayout: startLayout,
    };
    captureTarget.setPointerCapture(event.pointerId);
  };

  const handleHeadPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    const target = event.target as Element;
    if (target.closest('.dock-window-actions')) return;
    beginGesture(event, 'move');
  };

  const handleGesturePointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    event.preventDefault();
    gesture.currentLayout = layoutAtPointer(gesture, event.clientX, event.clientY);
    scheduleCurrentLayout();
  };

  const handleGesturePointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    gesture.currentLayout = layoutAtPointer(gesture, event.clientX, event.clientY);
    settleGesture(event.pointerId, true);
  };

  const handleGesturePointerCancel = (event: ReactPointerEvent<HTMLElement>) => {
    settleGesture(event.pointerId, false, false);
  };

  const handleLostPointerCapture = (event: ReactPointerEvent<HTMLElement>) => {
    settleGesture(event.pointerId, true, false);
  };

  const gestureHandlers = {
    onPointerMove: handleGesturePointerMove,
    onPointerUp: handleGesturePointerUp,
    onPointerCancel: handleGesturePointerCancel,
    onLostPointerCapture: handleLostPointerCapture,
  };
  const windowStyle = {
    transform: `translate3d(${layout.x}px, ${layout.y}px, 0)`,
    width: layout.width,
    height: layout.height,
    zIndex,
  } as CSSProperties;

  return (
    <section
      ref={windowRef}
      className={`dock-window${className ? ` ${className}` : ''}${active ? ' active' : ''}`}
      style={windowStyle}
      aria-labelledby={titleId}
      onPointerDownCapture={onFocus}
      onFocusCapture={onFocus}
    >
      <header className="dock-window-head" onPointerDown={handleHeadPointerDown} {...gestureHandlers}>
        <strong id={titleId}>{title}</strong>
        <div className="dock-window-actions">
          {onTogglePinned ? (
            <button
              type="button"
              className={pinned ? 'active' : ''}
              aria-label={pinned ? `${title} 창 고정 해제` : `${title} 창 고정`}
              aria-pressed={pinned}
              title={pinned ? '다음 실행부터 자동 열기 해제' : '다음 실행에도 자동 열기'}
              onClick={onTogglePinned}
            >핀</button>
          ) : null}
          <button
            type="button"
            aria-label={`${title} 창 위치와 크기 초기화`}
            title="위치·크기 초기화"
            onClick={onResetLayout}
          >↺</button>
          {onClose ? (
            <button type="button" aria-label={`${title} 창 닫기`} title="닫기" onClick={onClose}>×</button>
          ) : null}
        </div>
      </header>
      <div className="dock-window-body">{children}</div>
      {RESIZE_EDGES.map(edge => (
        <div
          key={edge}
          className="dock-window-resize"
          data-edge={edge}
          aria-hidden="true"
          onPointerDown={event => beginGesture(event, 'resize', edge)}
          {...gestureHandlers}
        />
      ))}
    </section>
  );
}
