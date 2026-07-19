// 시간 속도 조절: 일시정지 / 1배속 / 3배속 / 10배속
interface Props {
  speed: number;
  setSpeed: (s: number) => void;
  paused: boolean;
}

const SPEEDS = [
  { value: 0, label: '⏸ 정지' },
  { value: 1, label: '▶ 1배' },
  { value: 3, label: '▶▶ 3배' },
  { value: 10, label: '▶▶▶ 10배' },
];

export function TimeControls({ speed, setSpeed, paused }: Props) {
  return (
    <span className="time-controls">
      {SPEEDS.map(s => (
        <button
          key={s.value}
          className={`time-btn${speed === s.value ? ' active' : ''}`}
          data-tut={s.value === 1 ? 'time-play' : undefined}
          onClick={() => setSpeed(s.value)}
        >
          {s.label}
        </button>
      ))}
      {paused && <span className="muted small" style={{ alignSelf: 'center' }}>(이벤트 대기 중)</span>}
    </span>
  );
}
