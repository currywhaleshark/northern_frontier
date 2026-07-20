// Phase 4·5 지휘 단계 확인 카드 — 무대 드롭·방향전환 명령을 한 번 확인하고 적용한다 (계획서 7.9).
// 브라우저 confirm()을 쓰지 않고, 확인 전에는 게임 상태를 바꾸지 않는다. 표시 문구는 호출부가
// 백엔드 preview 값으로 만들어 넘기며, 이 컴포넌트는 mutation을 직접 호출하지 않는다.
// Escape·우클릭은 취소(무대 빈 곳 클릭 취소는 부모 셸이 처리), 적용은 onConfirm 콜백에 위임한다.
import { useEffect, useRef, type CSSProperties } from 'react';

interface Props {
  title: string;
  penaltyText?: string | null;
  warning?: string | null;
  /** 확정 버튼 문구 — `재배치 확정`처럼 명령 이름을 담는다 */
  confirmLabel: string;
  style: CSSProperties;
  onConfirm: () => void;
  onCancel: () => void;
}

export function TacticalOrderConfirm({ title, penaltyText, warning, confirmLabel, style, onConfirm, onCancel }: Props) {
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

  return (
    <div
      className="tactical-order-confirm"
      role="dialog"
      aria-label={`${title} — ${confirmLabel}`}
      style={style}
      onClick={event => event.stopPropagation()}
    >
      <strong>{title}</strong>
      {penaltyText && <span>{penaltyText}</span>}
      {warning && <em>{warning}</em>}
      <div className="tactical-order-confirm-actions">
        <button type="button" className="btn" onClick={onCancel}>취소</button>
        <button type="button" className="btn primary" ref={confirmRef} onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </div>
  );
}
