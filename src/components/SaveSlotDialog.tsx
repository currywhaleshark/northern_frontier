// 저장 슬롯 다이얼로그 — 저장/불러오기 공용, 슬롯 요약과 슬롯별 삭제 제공
import { useState } from 'react';
import { CONFIG } from '../game/config';
import { RANK_NAMES, SEASON_NAMES } from '../game/constants';
import { clearSave, readSaveSlotSummaries, type SaveSlotSummary } from '../game/saveLoad';
import { getDayOfSeason, getSeason, getYear } from '../game/seasons';
import { displaySettlementName, RANK_UNITS } from '../game/settlementName';
import type { Difficulty, Rank } from '../game/types';

interface Props {
  mode: 'save' | 'load';
  onSelect: (slot: number) => void;
  onClose: () => void;
  // 슬롯 삭제 등으로 저장 존재 여부가 바뀌었을 때 상위에 알린다
  onChanged?: () => void;
}

function slotDateLabel(summary: SaveSlotSummary): string | null {
  if (summary.day == null) return null;
  return `${getYear(summary.day)}년차 ${SEASON_NAMES[getSeason(summary.day)]} ${getDayOfSeason(summary.day)}일`;
}

function slotSettlementLabel(summary: SaveSlotSummary): string | null {
  if (!summary.settlementName) return null;
  const rank = summary.rank && summary.rank in RANK_UNITS ? summary.rank as Rank : 'settlement';
  return displaySettlementName(summary.settlementName, rank);
}

function slotDetailLabel(summary: SaveSlotSummary): string {
  const parts: string[] = [];
  if (summary.rank && summary.rank in RANK_NAMES) parts.push(RANK_NAMES[summary.rank as Rank]);
  if (summary.population != null) parts.push(`인구 ${summary.population}`);
  if (summary.difficulty && summary.difficulty in CONFIG.difficulty) {
    parts.push(CONFIG.difficulty[summary.difficulty as Difficulty].name);
  }
  return parts.join(' · ');
}

function savedAtLabel(savedAt: number | null): string | null {
  if (savedAt == null) return null;
  return new Date(savedAt).toLocaleString('ko-KR', {
    month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

export function SaveSlotDialog({ mode, onSelect, onClose, onChanged }: Props) {
  const [summaries, setSummaries] = useState(() => readSaveSlotSummaries());

  const handleSelect = (summary: SaveSlotSummary) => {
    if (mode === 'load' && !summary.exists) return;
    if (mode === 'save' && summary.exists &&
        !window.confirm(`${summary.slot}번 슬롯을 덮어쓸까요? 기존 저장은 사라집니다.`)) return;
    onSelect(summary.slot);
  };

  const handleDelete = (slot: number) => {
    if (!window.confirm(`${slot}번 슬롯의 저장 데이터를 삭제할까요?`)) return;
    clearSave(slot);
    setSummaries(readSaveSlotSummaries());
    onChanged?.();
  };

  return (
    <div className="modal-overlay save-slot-overlay" role="presentation" onMouseDown={event => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <div className="modal save-slot-dialog" role="dialog" aria-modal="true" aria-labelledby="save-slot-title">
        <div className="save-slot-heading">
          <h2 id="save-slot-title">{mode === 'save' ? '저장 슬롯 선택' : '불러올 저장 선택'}</h2>
          <button type="button" className="icon-btn" aria-label="닫기" onClick={onClose}>×</button>
        </div>
        <div className="save-slot-list">
          {summaries.map(summary => {
            const disabled = mode === 'load' && !summary.exists;
            const dateLabel = slotDateLabel(summary);
            return (
              <div key={summary.slot} className={`save-slot-card${summary.exists ? '' : ' empty'}`}>
                <button
                  type="button"
                  className="save-slot-main"
                  disabled={disabled}
                  onClick={() => handleSelect(summary)}
                >
                  <span className="save-slot-name">
                    {summary.slot}번 슬롯
                    {slotSettlementLabel(summary) && <> — {slotSettlementLabel(summary)}</>}
                  </span>
                  {summary.exists ? (
                    <span className="save-slot-info">
                      <span>{dateLabel ?? '정보를 읽을 수 없는 저장'}</span>
                      {slotDetailLabel(summary) && <span className="muted small">{slotDetailLabel(summary)}</span>}
                      {savedAtLabel(summary.savedAt) && (
                        <span className="muted small">저장 시각 {savedAtLabel(summary.savedAt)}</span>
                      )}
                    </span>
                  ) : (
                    <span className="save-slot-info muted">빈 슬롯</span>
                  )}
                </button>
                {summary.exists && (
                  <button
                    type="button"
                    className="btn save-slot-delete"
                    title="이 슬롯의 저장 데이터 삭제"
                    onClick={() => handleDelete(summary.slot)}
                  >
                    삭제
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
