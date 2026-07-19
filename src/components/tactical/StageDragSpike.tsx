// P1.5 스파이크 하네스 — 더미 카드 1장을 무대 구역 앵커로 끌어 포인터 인프라를 검증한다.
// `?dragSpike` URL 플래그로만 켜지며 게임 상태를 일절 변경하지 않는다.
// Phase 3 배치 카드가 이 파일의 사용 패턴(useStagePointerDrag + 앵커 하이라이트 + 고스트)을 물려받는다.
import { useEffect, useRef, useState } from 'react';
import type { TacticalBattle } from '../../game/types';
import { useStagePointerDrag } from './stagePointerDrag';

interface Props {
  battle: TacticalBattle;
  shellRef: React.RefObject<HTMLDivElement | null>;
  disabled: boolean;
}

interface HighlightRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function StageDragSpike({ battle, shellRef, disabled }: Props) {
  const [dropNote, setDropNote] = useState<string | null>(null);
  const dropTimerRef = useRef<number | null>(null);
  const { state, handleProps } = useStagePointerDrag({
    anchorAttribute: 'data-zone-id',
    disabled,
    onDrop: (anchorId, _point, pointerType) => {
      const zone = battle.zones.find(candidate => candidate.id === anchorId);
      setDropNote(zone
        ? `배치 미리보기: ${zone.name} (${pointerType})`
        : '유효한 배치 위치가 아닙니다');
    },
    onClick: () => setDropNote('클릭 — 임계값 미달, 드래그 아님'),
    onCancel: () => setDropNote('드래그 취소됨'),
  });

  useEffect(() => {
    if (dropNote == null) return;
    if (dropTimerRef.current != null) window.clearTimeout(dropTimerRef.current);
    dropTimerRef.current = window.setTimeout(() => setDropNote(null), 2500);
    return () => {
      if (dropTimerRef.current != null) window.clearTimeout(dropTimerRef.current);
    };
  }, [dropNote]);

  // 앵커 하이라이트는 셸 기준 절대배치 오버레이로 그린다 — 구역 컴포넌트를 건드리지 않는다.
  let highlight: HighlightRect | null = null;
  const shell = shellRef.current;
  if (state.dragging && state.hoverAnchorId && shell) {
    const zoneElement = shell.querySelector<HTMLElement>(`[data-zone-id="${state.hoverAnchorId}"]`);
    if (zoneElement) {
      const zoneRect = zoneElement.getBoundingClientRect();
      const shellRect = shell.getBoundingClientRect();
      highlight = {
        left: zoneRect.left - shellRect.left,
        top: zoneRect.top - shellRect.top,
        width: zoneRect.width,
        height: zoneRect.height,
      };
    }
  }
  const hoverZoneName = state.hoverAnchorId
    ? battle.zones.find(zone => zone.id === state.hoverAnchorId)?.name ?? null
    : null;

  return (
    <>
      {highlight && (
        <div
          className="stage-drag-anchor-highlight"
          aria-hidden="true"
          style={{ left: highlight.left, top: highlight.top, width: highlight.width, height: highlight.height }}
        />
      )}
      <div
        className={`stage-drag-handle tactical-drag-spike-card${state.dragging ? ' dragging' : ''}`}
        role="button"
        tabIndex={0}
        aria-label="드래그 스파이크 카드"
        onClick={event => event.stopPropagation()}
        {...handleProps}
      >
        <strong>스파이크 카드</strong>
        <span>{disabled ? '재생 중 조작 불가' : '무대 구역으로 끌어보세요'}</span>
        {dropNote && <em className="tactical-drag-spike-note">{dropNote}</em>}
      </div>
      {state.dragging && state.position && (
        <div
          className="stage-drag-ghost tactical-drag-spike-ghost"
          aria-hidden="true"
          style={{ left: state.position.x, top: state.position.y }}
        >
          {hoverZoneName ? `배치: ${hoverZoneName}` : '유효 위치 아님'}
        </div>
      )}
    </>
  );
}
