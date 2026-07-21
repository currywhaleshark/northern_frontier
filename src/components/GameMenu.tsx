interface Props {
  canLoad: boolean;
  onResume: () => void;
  onSave: () => void;
  onLoad: () => void;
  onNewGame: () => void;
  onSettings: () => void;
  onFeedback: () => void;
}

export function GameMenu({ canLoad, onResume, onSave, onLoad, onNewGame, onSettings, onFeedback }: Props) {
  return (
    <div className="modal-overlay game-menu-overlay" role="presentation">
      <section className="modal game-menu-modal" role="dialog" aria-modal="true" aria-labelledby="game-menu-title">
        <header className="game-menu-heading">
          <div>
            <span className="muted small">ESC 메뉴</span>
            <h2 id="game-menu-title">북새</h2>
          </div>
          <button type="button" className="icon-btn" aria-label="게임으로 돌아가기" onClick={onResume}>×</button>
        </header>
        <div className="game-menu-actions">
          <button type="button" className="btn primary" onClick={onResume}>계속하기</button>
          <button type="button" className="btn" onClick={onSave}>저장</button>
          <button type="button" className="btn" onClick={onLoad} disabled={!canLoad}>불러오기</button>
          <button type="button" className="btn" onClick={onNewGame}>새 게임</button>
          <button type="button" className="btn" onClick={onSettings}>설정</button>
          <button type="button" className="btn" onClick={onFeedback}>의견·버그 리포트</button>
        </div>
        <p className="muted small game-menu-hint"><kbd>Esc</kbd> 게임으로 돌아가기</p>
      </section>
    </div>
  );
}
