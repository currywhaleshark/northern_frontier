// 메인 메뉴·전투 시뮬레이션 공용 배경 눈발 — 인덱스 기반 의사난수로 위치·크기·속도를 흩뿌린다
export function MenuSnowLayer() {
  return (
    <div className="menu-snow-layer" aria-hidden="true">
      {Array.from({ length: 42 }, (_, index) => (
        <span
          key={index}
          className="menu-snowflake"
          style={{
            left: `${(index * 37) % 100}%`,
            width: 2 + (index * 5) % 3,
            height: 2 + (index * 5) % 3,
            opacity: 0.35 + ((index * 11) % 5) / 10,
            animationDuration: `${7 + ((index * 13) % 12) / 2}s`,
            animationDelay: `${-(((index * 7) % 42) / 3)}s`,
          }}
        />
      ))}
    </div>
  );
}
