// 무대 포인터 드래그 공용 인프라 — P1.5 스파이크로 검증한 뒤 Phase 3(배치 카드)·Phase 4(무대 명령)가
// 같은 경로를 사용한다. 마우스·터치·펜을 Pointer Events 하나로 처리한다.
//
// 핵심 규칙:
// - 이동 임계값 전에는 드래그를 시작하지 않는다 → 기존 클릭·팝오버 동작이 그대로 산다.
// - 드래그 핸들에만 CSS `touch-action: none`을 건다 → 핸들에서 시작한 터치는 무대 가로 스크롤로
//   새지 않고, 빈 무대 터치는 기존 스크롤·스냅을 그대로 쓴다.
// - 임계값을 넘으면 setPointerCapture로 포인터를 붙잡고, 앵커 판정은 좌표 기반
//   elementsFromPoint로 한다(캡처 중에는 이벤트 target이 핸들로 고정되므로).
// - Escape·우클릭·pointercancel은 항상 취소다. 취소 시 게임 상태는 손대지 않는다.
import { useCallback, useEffect, useRef, useState } from 'react';

export const STAGE_DRAG_THRESHOLD_PX = 6;

export interface StageDragPoint {
  x: number;
  y: number;
}

export interface StageDragState {
  dragging: boolean;
  pointerType: string | null;
  position: StageDragPoint | null;
  hoverAnchorId: string | null;
}

export interface StagePointerDragOptions {
  /** 앵커 판정에 쓸 data 속성 이름 (기본 data-stage-anchor) */
  anchorAttribute?: string;
  disabled?: boolean;
  onDrop: (anchorId: string | null, point: StageDragPoint, pointerType: string) => void;
  /** 임계값을 넘지 못하고 놓았을 때 — 기존 클릭 동작 위임 */
  onClick?: () => void;
  onCancel?: () => void;
}

const camelize = (attribute: string) =>
  attribute.replace(/^data-/, '').replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());

export function findStageDragAnchorId(
  x: number,
  y: number,
  anchorAttribute = 'data-stage-anchor',
): string | null {
  const datasetKey = camelize(anchorAttribute);
  for (const element of document.elementsFromPoint(x, y)) {
    const value = (element as HTMLElement).dataset?.[datasetKey];
    if (value) return value;
  }
  return null;
}

const IDLE_STATE: StageDragState = { dragging: false, pointerType: null, position: null, hoverAnchorId: null };

export function useStagePointerDrag(options: StagePointerDragOptions) {
  const { anchorAttribute = 'data-stage-anchor', disabled = false, onDrop, onClick, onCancel } = options;
  const [state, setState] = useState<StageDragState>(IDLE_STATE);
  const sessionRef = useRef<{
    pointerId: number;
    pointerType: string;
    origin: StageDragPoint;
    dragging: boolean;
    element: HTMLElement;
  } | null>(null);

  const endSession = useCallback((element?: HTMLElement, pointerId?: number) => {
    if (element != null && pointerId != null) {
      try {
        element.releasePointerCapture(pointerId);
      } catch {
        // 이미 해제되었거나 합성 이벤트라 캡처가 없던 경우 — 무시
      }
    }
    sessionRef.current = null;
    setState(IDLE_STATE);
  }, []);

  const cancelDrag = useCallback(() => {
    const session = sessionRef.current;
    if (!session) return;
    const wasDragging = session.dragging;
    endSession(session.element, session.pointerId);
    if (wasDragging) onCancel?.();
  }, [endSession, onCancel]);

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (disabled || sessionRef.current) return;
    // 우클릭·보조 버튼은 드래그 시작이 아니다 (우클릭은 취소 예약 버튼)
    if (event.button !== 0) return;
    sessionRef.current = {
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      origin: { x: event.clientX, y: event.clientY },
      dragging: false,
      element: event.currentTarget,
    };
  }, [disabled]);

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLElement>) => {
    const session = sessionRef.current;
    if (!session || event.pointerId !== session.pointerId) return;
    const dx = event.clientX - session.origin.x;
    const dy = event.clientY - session.origin.y;
    if (!session.dragging) {
      if (Math.hypot(dx, dy) < STAGE_DRAG_THRESHOLD_PX) return;
      session.dragging = true;
      try {
        session.element.setPointerCapture(session.pointerId);
      } catch {
        // 합성 포인터(테스트)나 이미 사라진 포인터 — 좌표 추적만으로 진행
      }
    }
    setState({
      dragging: true,
      pointerType: session.pointerType,
      position: { x: event.clientX, y: event.clientY },
      hoverAnchorId: findStageDragAnchorId(event.clientX, event.clientY, anchorAttribute),
    });
  }, [anchorAttribute]);

  const handlePointerUp = useCallback((event: React.PointerEvent<HTMLElement>) => {
    const session = sessionRef.current;
    if (!session || event.pointerId !== session.pointerId) return;
    const wasDragging = session.dragging;
    const point = { x: event.clientX, y: event.clientY };
    endSession(session.element, session.pointerId);
    if (!wasDragging) {
      onClick?.();
      return;
    }
    onDrop(findStageDragAnchorId(point.x, point.y, anchorAttribute), point, session.pointerType);
  }, [anchorAttribute, endSession, onClick, onDrop]);

  const handlePointerCancel = useCallback(() => {
    cancelDrag();
  }, [cancelDrag]);

  // Escape·우클릭은 드래그 중 언제든 취소한다.
  useEffect(() => {
    if (!state.dragging) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        cancelDrag();
      }
    };
    const onContextMenu = (event: MouseEvent) => {
      event.preventDefault();
      cancelDrag();
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('contextmenu', onContextMenu);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('contextmenu', onContextMenu);
    };
  }, [state.dragging, cancelDrag]);

  return {
    state,
    cancelDrag,
    handleProps: {
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp,
      onPointerCancel: handlePointerCancel,
    },
  };
}
