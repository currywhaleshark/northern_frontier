// 하늘 시계 — 포물선 궤적 위를 낮에는 해가, 밤에는 달이 좌→우로 흐르는 HUD 시간 표시.
// 대역 정의(DAY_BANDS)에서 위치를 파생하므로 서브틱 수가 바뀌어도 자동 적응한다.
import { useRef } from 'react';
import { DAY_BANDS } from '../game/dayCycle';
import { CONFIG } from '../game/config';
import { DAY_BAND_NAMES, uiDayBand } from '../ui/dayBand';

const W = 92;
const H = 30;
const PAD = 9;
const HORIZON = 24;
const APEX = 5; // 궤적 꼭대기의 y

// 2차 베지어 (P0 지평선 좌단 → 제어점 상단 중앙 → P1 지평선 우단) 위의 점
function arcPoint(t: number): { x: number; y: number } {
  const clamped = Math.min(1, Math.max(0, t));
  const inv = 1 - clamped;
  const controlY = 2 * APEX - HORIZON; // y(0.5) = APEX가 되도록
  return {
    x: inv * inv * PAD + 2 * inv * clamped * (W / 2) + clamped * clamped * (W - PAD),
    y: inv * inv * HORIZON + 2 * inv * clamped * controlY + clamped * clamped * HORIZON,
  };
}

export function DayArcWidget({ subTick, speed }: { subTick: number; speed: number }) {
  const band = uiDayBand(subTick);
  const night = band === 'night';
  // 해는 새벽~저녁 전체를, 달은 밤 대역을 각각 좌→우로 가로지른다
  const spanStart = night ? DAY_BANDS.night.start : DAY_BANDS.dawn.start;
  const spanEnd = night ? DAY_BANDS.night.end : DAY_BANDS.evening.end;
  const t = (subTick - spanStart + 0.5) / (spanEnd - spanStart + 1);
  const p = arcPoint(t);
  const tickMs = CONFIG.time.msPerDay[speed] / CONFIG.agents.subticksPerDay;
  // 뒤로 가는 이동(세이브 로드·날짜 점프)은 전환 없이 순간이동 — 해·달은 앞으로만 흐른다
  const lastRef = useRef({ night, t });
  const movedBackward = lastRef.current.night === night && t < lastRef.current.t;
  lastRef.current = { night, t };
  const transitionMs = !movedBackward && Number.isFinite(tickMs) ? Math.min(600, tickMs * 0.9) : 0;

  return (
    <span className="day-arc" title={`${DAY_BAND_NAMES[band]} — ${night ? '달' : '해'}가 하늘을 지납니다`}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-label={`시간대: ${DAY_BAND_NAMES[band]}`} role="img">
        {/* 궤적 점선과 지평선 */}
        <path
          d={`M ${PAD} ${HORIZON} Q ${W / 2} ${2 * APEX - HORIZON} ${W - PAD} ${HORIZON}`}
          fill="none" stroke="var(--muted)" strokeWidth="1" strokeDasharray="3 3" opacity="0.55"
        />
        <line x1="3" y1={HORIZON} x2={W - 3} y2={HORIZON} stroke="var(--border)" strokeWidth="1" />
        {/* 밤에만 보이는 잔별 */}
        {night && (
          <g fill="var(--muted)" opacity="0.7">
            <circle cx={W * 0.28} cy={9} r="0.9" />
            <circle cx={W * 0.62} cy={6} r="0.7" />
            <circle cx={W * 0.78} cy={12} r="0.8" />
          </g>
        )}
        {/* 해 / 달 — 서브틱 사이를 CSS 전환으로 미끄러진다.
            key로 천체 교대 시 리마운트해 우측 끝→좌측 시작의 복귀 이동이 보이지 않게 한다 */}
        <g key={night ? 'moon' : 'sun'} style={{
          transform: `translate(${p.x}px, ${p.y}px)`,
          transition: `transform ${transitionMs}ms linear`,
        }}>
          {night ? (
            <>
              <circle r="4" fill="#cfd8e6" />
              <circle cx="1.8" cy="-1.2" r="3.4" fill="var(--panel2)" />
            </>
          ) : (
            <>
              <circle r="7" fill="#f7c94b" opacity="0.22" />
              <circle r="4.2" fill="#f7c94b" />
            </>
          )}
        </g>
      </svg>
    </span>
  );
}
