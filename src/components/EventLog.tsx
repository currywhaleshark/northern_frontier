// 이벤트 로그 (최신이 위). 새 로그가 쌓이면 최신 쪽으로 자동 스크롤한다.
import { useEffect, useRef } from 'react';
import { getDayOfSeason, getSeason, getYear } from '../game/seasons';
import { SEASON_NAMES } from '../game/constants';
import type { GameState } from '../game/types';

export function EventLog({ state }: { state: GameState }) {
  const listRef = useRef<HTMLDivElement>(null);
  // 로그는 상한에 도달하면 length가 고정되므로, 최신 항목 참조로 새 로그를 감지한다
  const newest = state.log[state.log.length - 1];

  // 사용자가 위쪽(최신 근처)을 보고 있으면 새 로그가 와도 맨 위로 따라간다.
  // 아래로 스크롤해 옛 기록을 읽는 중이면 방해하지 않는다.
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    if (el.scrollTop <= 40) el.scrollTop = 0;
  }, [newest]);

  return (
    <div className="section event-log-panel">
      <div className="panel-title">기록</div>
      <div className="log-list" ref={listRef}>
        {state.log.map((entry, i) => ({ entry, i })).reverse().map(({ entry, i }) => (
          <div key={i} className={`log-entry log-${entry.kind}`}>
            <span className="day">
              {getYear(entry.day)}년 {SEASON_NAMES[getSeason(entry.day)]} {getDayOfSeason(entry.day)}일
            </span>
            {entry.text}
          </div>
        ))}
      </div>
    </div>
  );
}
