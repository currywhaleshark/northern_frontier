// Phase 4 지휘 단계 확인 카드 — 무대 드롭 후 명령을 한 번 확인하고 적용한다 (계획서 7.9).
// 브라우저 confirm()을 쓰지 않고, 확인 전에는 게임 상태를 바꾸지 않는다.
// Escape·우클릭은 취소(무대 빈 곳 클릭 취소는 부모 셸이 처리), 적용은 onConfirm 콜백에 위임한다.
import { useEffect, useRef, type CSSProperties } from 'react';
import type { TacticalStageOrderPreview } from '../../game/tacticalBattle';
import type { TacticalBattle } from '../../game/types';
import {
  stageOrderCommandLabel,
  stageOrderPenaltyText,
  stageOrderTransitionText,
} from './stageOrderPreview';

interface Props {
  battle: TacticalBattle;
  preview: TacticalStageOrderPreview;
  groupLabel: string;
  style: CSSProperties;
  onConfirm: () => void;
  onCancel: () => void;
}

export function TacticalOrderConfirm({ battle, preview, groupLabel, style, onConfirm, onCancel }: Props) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    confirmRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onCancel();
    };
    const onContextMenu = (event: MouseEvent) => {
      event.preventDefault();
      onCancel();
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('contextmenu', onContextMenu);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('contextmenu', onContextMenu);
    };
  }, [onCancel]);

  const commandLabel = stageOrderCommandLabel(preview.command);
  const penaltyText = stageOrderPenaltyText(preview);

  return (
    <div
      className="tactical-order-confirm"
      role="dialog"
      aria-label={`${groupLabel} ${commandLabel} 확인`}
      style={style}
      onClick={event => event.stopPropagation()}
    >
      <strong>{groupLabel} · {stageOrderTransitionText(battle, preview)}</strong>
      {penaltyText && <span>{penaltyText}</span>}
      {preview.warning && <em>{preview.warning}</em>}
      <div className="tactical-order-confirm-actions">
        <button type="button" className="btn" onClick={onCancel}>취소</button>
        <button type="button" className="btn primary" ref={confirmRef} onClick={onConfirm}>
          {commandLabel} 확정
        </button>
      </div>
    </div>
  );
}
