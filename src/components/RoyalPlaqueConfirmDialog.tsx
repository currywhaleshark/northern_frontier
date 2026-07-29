interface Props {
  buildingName: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function RoyalPlaqueConfirmDialog({ buildingName, onConfirm, onCancel }: Props) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <section
        className="modal royal-plaque-confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="royal-plaque-confirm-title"
        onClick={event => event.stopPropagation()}
      >
        <h2 id="royal-plaque-confirm-title">사액 현판을 걸겠습니까?</h2>
        <div className="body">
          <b>{buildingName}</b>에 왕이 내린 현판을 영구히 귀속합니다.
          이 건물의 작업 산출은 25% 늘어나지만, 설치 뒤에는 현판을 옮길 수 없고
          플레이어가 건물을 이전하거나 해체할 수도 없습니다.
        </div>
        <div className="royal-plaque-warning">
          외부의 힘으로 건물이 완전히 사라지면 현판도 함께 소실됩니다.
        </div>
        <div className="royal-plaque-confirm-actions">
          <button className="btn" type="button" onClick={onCancel}>취소</button>
          <button className="btn primary" type="button" onClick={onConfirm} autoFocus>
            영구 귀속
          </button>
        </div>
      </section>
    </div>
  );
}
