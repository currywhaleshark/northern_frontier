import { SEASON_NAMES } from '../game/constants';
import { getDayOfSeason, getSeason, getYear } from '../game/seasons';
import type { GameState, LogEntry } from '../game/types';

const LOG_SYMBOL: Record<LogEntry['kind'], string> = {
  info: '●',
  good: '✓',
  bad: '!',
  raid: '⚔',
  weather: '※',
  trade: '↔',
};

export function ImportantLogOverlay({ state }: { state: GameState }) {
  const entries = state.log
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => entry.important || entry.kind === 'raid')
    .slice(-4)
    .reverse();
  if (entries.length === 0) return null;

  return (
    <div className="important-log-overlay" aria-live="polite" aria-label="주요 소식">
      <div className="important-log-stack">
        {entries.map(({ entry, index }) => (
          <div key={index} className={`important-log-item important-log-${entry.kind}`}>
            <span className="important-log-symbol" aria-hidden="true">{LOG_SYMBOL[entry.kind]}</span>
            <span className="important-log-content">
              <span className="important-log-day">
                {getYear(entry.day)}년 {SEASON_NAMES[getSeason(entry.day)]} {getDayOfSeason(entry.day)}일
              </span>
              <span className="important-log-text">{entry.text}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
