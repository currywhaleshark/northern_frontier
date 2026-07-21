import { useState } from 'react';
import type { GameState } from '../game/types';
import {
  buildFeedbackDiagnostics,
  buildFeedbackIssueUrl,
  type FeedbackDraft,
  type FeedbackKind,
} from '../ui/feedbackReport';

interface Props {
  state: GameState;
  speed: number;
  zoom: number;
  onClose: () => void;
}

export function FeedbackDialog({ state, speed, zoom, onClose }: Props) {
  const [kind, setKind] = useState<FeedbackKind>('bug');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [reproduction, setReproduction] = useState('');
  const [includeDiagnostics, setIncludeDiagnostics] = useState(true);
  const context = { speed, zoom, userAgent: navigator.userAgent };
  const draft: FeedbackDraft = { kind, title, description, reproduction, includeDiagnostics };

  const downloadDiagnostics = () => {
    const blob = new Blob([JSON.stringify(buildFeedbackDiagnostics(state, context), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `buksae-bug-report-day-${state.day}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const submit = () => {
    window.open(buildFeedbackIssueUrl(draft, state, context), '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="modal-overlay game-menu-overlay" role="presentation">
      <section className="modal game-menu-modal feedback-dialog" role="dialog" aria-modal="true" aria-labelledby="feedback-title">
        <header className="game-menu-heading">
          <div>
            <span className="muted small">개발팀에 전달</span>
            <h2 id="feedback-title">의견 보내기</h2>
          </div>
          <button type="button" className="icon-btn" aria-label="뒤로" onClick={onClose}>×</button>
        </header>
        <div className="feedback-kind" role="group" aria-label="리포트 종류">
          <button type="button" className={kind === 'bug' ? 'active' : undefined} onClick={() => setKind('bug')}>버그 리포트</button>
          <button type="button" className={kind === 'suggestion' ? 'active' : undefined} onClick={() => setKind('suggestion')}>의견·제안</button>
        </div>
        <label>제목<input value={title} maxLength={100} onChange={event => setTitle(event.target.value)} /></label>
        <label>내용<textarea rows={5} value={description} onChange={event => setDescription(event.target.value)} /></label>
        {kind === 'bug' && (
          <>
            <label>재현 방법<textarea rows={3} value={reproduction} onChange={event => setReproduction(event.target.value)} /></label>
            <label className="feedback-diagnostics-toggle">
              <input type="checkbox" checked={includeDiagnostics} onChange={event => setIncludeDiagnostics(event.target.checked)} />
              최근 게임 기록과 실행 환경 첨부
            </label>
            <button type="button" className="btn" onClick={downloadDiagnostics}>전체 진단 기록 파일 저장</button>
          </>
        )}
        <p className="muted small">전송을 누르면 GitHub 리포트 작성 화면이 열립니다. 최종 제출 전에 첨부 내용을 확인할 수 있습니다.</p>
        <div className="game-menu-actions horizontal">
          <button type="button" className="btn" onClick={onClose}>뒤로</button>
          <button type="button" className="btn primary" disabled={!title.trim() || !description.trim()} onClick={submit}>리포트 작성 열기</button>
        </div>
      </section>
    </div>
  );
}
