import { useEffect, useRef, useState } from 'react';
import { SEASON_NAMES } from '../game/constants';
import { getDayOfSeason, getSeason, getYear } from '../game/seasons';
import type { GameState, LogEntry } from '../game/types';
import { UiIcon, type UiIconName } from './UiIcon';

const LOG_ICON: Record<LogEntry['kind'], UiIconName> = {
  info: 'important',
  good: 'success',
  bad: 'warning',
  raid: 'raid',
  weather: 'weatherClear',
  trade: 'friendly',
};

const LOG_FILTERS: readonly { id: LogEntry['kind'] | 'all'; label: string }[] = [
  { id: 'all', label: '전체' },
  { id: 'info', label: '소식' },
  { id: 'good', label: '호재' },
  { id: 'bad', label: '악재' },
  { id: 'raid', label: '전투' },
  { id: 'weather', label: '날씨' },
  { id: 'trade', label: '교역' },
];

function LogDate({ day }: { day: number }) {
  return (
    <span className="unified-log-day">
      {getYear(day)}년 {SEASON_NAMES[getSeason(day)]} {getDayOfSeason(day)}일
    </span>
  );
}

function LogRow({ entry, compact = false }: { entry: LogEntry; compact?: boolean }) {
  return (
    <div className={`unified-log-item unified-log-${entry.kind}${entry.important ? ' important' : ''}${compact ? ' compact' : ''}`}>
      <span className="unified-log-symbol"><UiIcon name={LOG_ICON[entry.kind]} size={18} /></span>
      <span className="unified-log-content">
        <LogDate day={entry.day} />
        <span className="unified-log-text">{entry.text}</span>
      </span>
      {entry.important && <span className="unified-log-important" title="중요 소식"><UiIcon name="important" size={18} label="중요 소식" /></span>}
    </div>
  );
}

export function UnifiedLog({ state }: { state: GameState }) {
  const [pinnedOpen, setPinnedOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [filter, setFilter] = useState<LogEntry['kind'] | 'all'>('all');
  const listRef = useRef<HTMLDivElement>(null);
  const expanded = pinnedOpen || hovered || focused;
  const newest = state.log[state.log.length - 1];
  const importantEntries = state.log
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => entry.important || entry.kind === 'raid')
    .slice(-4)
    .reverse();
  const filteredEntries = state.log
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => filter === 'all' || entry.kind === filter)
    .reverse();

  useEffect(() => {
    const list = listRef.current;
    if (list && list.scrollTop <= 40) list.scrollTop = 0;
  }, [newest]);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = 0;
  }, [filter]);

  return (
    <section
      className={`unified-log${expanded ? ' expanded' : ' collapsed'}`}
      aria-label="기록"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={event => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false);
      }}
    >
      <button
        type="button"
        className="unified-log-toggle"
        aria-expanded={expanded}
        aria-controls="unified-log-history"
        aria-pressed={pinnedOpen}
        title={pinnedOpen ? '전체 기록 고정 해제' : '전체 기록 열기 및 고정'}
        onClick={() => setPinnedOpen(open => !open)}
      >
        <strong>기록</strong>
        <span>{expanded ? `전체 ${state.log.length}건` : `주요 ${importantEntries.length}건`}</span>
        <span aria-hidden="true">{expanded ? '▴' : '▾'}</span>
      </button>

      {expanded ? (
        <div className="unified-log-history" id="unified-log-history">
          <div className="unified-log-filters" aria-label="기록 종류 필터">
            {LOG_FILTERS.map(item => (
              <button
                key={item.id}
                type="button"
                className={filter === item.id ? 'active' : undefined}
                aria-pressed={filter === item.id}
                onClick={() => setFilter(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="unified-log-list" ref={listRef}>
            {filteredEntries.length > 0 ? filteredEntries.map(({ entry, index }) => (
              <LogRow key={index} entry={entry} />
            )) : (
              <div className="unified-log-empty">해당 종류의 기록이 없습니다.</div>
            )}
          </div>
        </div>
      ) : (
        <div className="unified-log-preview" aria-live="polite" aria-label="주요 소식">
          {importantEntries.length > 0 ? importantEntries.map(({ entry, index }) => (
            <LogRow key={index} entry={entry} compact />
          )) : (
            <div className="unified-log-empty compact">새로운 주요 소식이 없습니다.</div>
          )}
        </div>
      )}
    </section>
  );
}
