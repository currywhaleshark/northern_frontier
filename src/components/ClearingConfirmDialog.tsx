// 나무를 낀 자리에 공사를 지정했을 때 개간 동의를 받는 확인 모달.
interface Props {
  title: string;
  trees: number;
  detail: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ClearingConfirmDialog({ title, trees, detail, onConfirm, onCancel }: Props) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <section
        className="modal clearing-confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="clearing-confirm-title"
        onClick={event => event.stopPropagation()}
      >
        <h2 id="clearing-confirm-title">{title}</h2>
        <div className="body">
          자리에 나무 <b>{trees}그루</b>가 서 있습니다.
          벌목꾼이 먼저 이 나무를 베어 자리를 비운 뒤에 공사가 시작됩니다.
        </div>
        <div className="muted small">{detail}</div>
        <div className="clearing-confirm-actions">
          <button className="btn" type="button" onClick={onCancel}>취소</button>
          <button className="btn primary" type="button" onClick={onConfirm} autoFocus>
            벌목하고 공사
          </button>
        </div>
      </section>
    </div>
  );
}
