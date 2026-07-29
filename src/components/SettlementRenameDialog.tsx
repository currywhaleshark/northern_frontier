// 개칭 청원 — 새 이름과 함께 파발 왕복·재개칭 제한을 확인받는다.
// 발송 뒤에는 취소·수정할 수 없으므로 확인 창이 곧 마지막 관문이다.
import { useState } from 'react';
import { CONFIG } from '../game/config';
import {
  generateSettlementName, normalizeSettlementNameInput, SETTLEMENT_NAME_MAX_LENGTH,
} from '../game/settlementName';

interface Props {
  currentName: string;
  onSubmit: (name: string) => void;
  onClose: () => void;
}

export function SettlementRenameDialog({ currentName, onSubmit, onClose }: Props) {
  const [name, setName] = useState('');
  const trimmed = normalizeSettlementNameInput(name);
  const blocked = !trimmed
    ? '이름을 비워 둘 수 없습니다'
    : trimmed === currentName
      ? '지금 이름과 같습니다'
      : null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal rename-dialog" onClick={event => event.stopPropagation()}>
        <h2>개칭을 청원한다</h2>
        <div className="body">
          <p>
            지금 이름은 <b>{currentName}</b>입니다. 새 이름을 적어 한양으로 파발을 보냅니다.
          </p>
          <div className="settlement-name-row">
            <input
              className="settlement-name-input"
              value={name}
              maxLength={SETTLEMENT_NAME_MAX_LENGTH}
              autoFocus
              onChange={event => setName(event.target.value)}
              placeholder="새 이름"
            />
            <button
              type="button"
              className="btn settlement-name-dice"
              aria-label="정착지 이름 무작위 생성"
              onClick={() => setName(generateSettlementName(Math.floor(Math.random() * 2 ** 31)))}
            >
              🎲
            </button>
          </div>
          <p className="muted small">
            파발 왕복 {CONFIG.settlementNaming.renameTravelDays}일 · 허가 후 1년간 재개칭 불가.
            발송한 청원은 취소하거나 고칠 수 없습니다.
          </p>
        </div>
        <div className="modal-actions">
          <button
            className="btn primary"
            disabled={Boolean(blocked)}
            title={blocked ?? undefined}
            onClick={() => !blocked && onSubmit(trimmed)}
          >
            파발을 보낸다
          </button>
          <button className="btn" onClick={onClose}>그만둔다</button>
        </div>
      </div>
    </div>
  );
}
