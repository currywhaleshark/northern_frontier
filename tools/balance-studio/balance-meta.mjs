// 밸런스 편집기 키 메타데이터 — 차단 목록과 반영 시점 분류의 **단일 원본**.
// 코드젠(node)과 편집기 앱(vite)이 같은 파일을 import한다. 타입은 balance-meta.d.ts에 있다.

/**
 * 스프라이트 스튜디오가 자리 좌표를 소유하는 건물 —
 * tools/sprite-studio/generate_registries.mjs의 SLOT_BUILDING_TYPES와 같아야 한다.
 * 이 건물들만 slots(자리 수)를 잠근다. 좌표 목록과 개수가 어긋나면 근무자가 갈 곳이 없어진다.
 * (전 건물의 slots를 잠그려면 이 배열 대신 아래 rule의 test를 `path.endsWith('.slots')`로 바꾼다.)
 */
export const STUDIO_OWNED_SLOT_BUILDINGS = ['woodShed', 'saltworks', 'watchtower'];

/** 경로의 마지막 조각. */
function lastSegment(path) {
  const index = path.lastIndexOf('.');
  return index < 0 ? path : path.slice(index + 1);
}

// ── 차단 목록 ───────────────────────────────────────────────────────────
// 밸런스가 아닌 값 — 건드리면 밸런스가 아니라 **다른 무언가**가 깨진다.
// 편집기는 숨기고, 코드젠은 오버레이에 남아 있으면 에러로 중단한다.
export const BALANCE_BLOCK_RULES = [
  {
    id: 'rng-salt',
    reason: '난수 시드·salt — 결정론 재현용 상수라 값 자체에 밸런스 의미가 없다',
    test: path => /(?:Salt|Salts|SeedMultiplier|SeedOffset)$/.test(lastSegment(path))
      || /\.(?:seasonSalts|streamSalts|annualSalts)\./.test(`.${path}.`),
  },
  {
    id: 'ui',
    reason: '표시·레이아웃 값 — 타일 픽셀 크기와 로그 버퍼는 렌더·히트판정이 따르는 상수다',
    test: path => path === 'ui' || path.startsWith('ui.'),
  },
  {
    id: 'worker-slots',
    reason: '작업자 자리는 스프라이트 스튜디오(worker-slots.json)가 소유한다 — 중복 편집 금지',
    test: path => STUDIO_OWNED_SLOT_BUILDINGS.some(type => path === `buildings.${type}.slots`),
  },
  {
    id: 'building-unique',
    reason: '고유 건물 여부는 밸런스가 아니라 건설 규칙·UI 전제다',
    test: path => /^buildings\.[^.]+\.unique$/.test(path),
  },
  {
    id: 'tactical-terrain',
    reason: '전술 전장 지형·아트 참조 — 밸런스 수치가 아니다',
    test: path => /\.terrain$/.test(path) || /\.label$/.test(path),
  },
];

/** 차단이면 사유 문자열, 아니면 null. 상위 경로가 차단이면 하위도 차단이다. */
export function balanceBlockReason(path) {
  for (const rule of BALANCE_BLOCK_RULES) {
    if (rule.test(path)) return rule.reason;
  }
  return null;
}

// ── 반영 시점 ───────────────────────────────────────────────────────────
// 설계서 §4. "왜 지금 게임에 안 먹는가"를 편집기가 먼저 말하게 한다.
export const BALANCE_TIMINGS = {
  runtime: {
    label: '즉시',
    hint: '틱마다 CONFIG에서 다시 읽는다 — 저장·새로고침이면 진행 중 게임에도 먹는다',
  },
  worldgen: {
    label: '새 게임',
    hint: '지도·초기 상태를 만들 때 한 번 읽혀 타일에 굳는다 — 새 게임부터 반영된다',
  },
  saved: {
    label: '새 게임(저장값)',
    hint: '게임 상태에 복사되어 저장에 남는다 — 기존 저장은 저장된 값을 그대로 쓴다',
  },
};

/**
 * 접두사 규칙. 위에서부터 먼저 맞는 것을 쓴다. 아무것도 안 맞으면 runtime.
 * 근거는 각 항목 주석에 코드 위치로 적는다 — 나중에 옮겨 다니는 값을 추적하기 위해서다.
 */
export const BALANCE_TIMING_RULES = [
  // 지도 생성(map.ts)에서 타일에 굳는 값
  { timing: 'worldgen', test: path => path.startsWith('map.') },
  {
    timing: 'worldgen',
    // map.ts: setMineralDeposit / 매장량 롤. 반경·매장량은 생성 시 확정된다.
    test: path => /^minerals\.(?:stoneMin|stoneMax|ironMin|ironMax|legacyStone|legacyIron|silverMin|silverMax|nearbyStone|nearbyIron|nearbyMinDistance|nearbyMaxDistance)$/.test(path),
  },
  // map.ts:368 tile.tidalCapacity = CONFIG.tidalFlats.capacityPerTile
  { timing: 'worldgen', test: path => path === 'tidalFlats.capacityPerTile' },
  // habitats.ts:113 서식지 비축량은 생성 시 숲 칸 수로 확정된다
  { timing: 'worldgen', test: path => /^habitats\.(?:reservePerForestTile|reserveMin|reserveMax)$/.test(path) },
  // simulation.ts:162 startRes 복사 / :293 시작 주민 수
  { timing: 'worldgen', test: path => path.startsWith('start.') },
  { timing: 'worldgen', test: path => path === 'education.startLiterateAdults' },
  // newGameOptions.ts:166 난이도 프리셋 — 시작 물자 배율과 서식지 확률은 생성에만 쓰인다
  { timing: 'worldgen', test: path => /^difficulty\.[^.]+\.(?:startRes|habitatChance)$/.test(path) },

  // tutorialStart.ts가 길잡이 목표치를 상태로 복사한다 — 저장에 남는다
  { timing: 'saved', test: path => /^tutorial\.(?:meatGoal|sownAreaGoal|foodDaysGoal|firewoodDaysGoal|hideClothesMadeGoal|mineralsMinedGoal|toolsCraftedGoal)$/.test(path) },
  // simulation.ts:197 상태로 복사되는 초기 해금 목록
  { timing: 'saved', test: path => path.startsWith('livestock.initialUnlocked') },
  // buildings.ts:570/645, simulation.ts:354 — 건물을 지을 때 gatheringWorkArea에 굳는다
  { timing: 'saved', test: path => /^gatheringZones\.[^.]*Radius$/.test(path) },
  // 어선은 만들 때 내구도를 상태에 복사한다
  { timing: 'saved', test: path => path === 'fishingBoats.durability' },

  // 건물 정의는 전부 런타임 조회(BUILDING_DEFS[type])이지만, 공기·비용은
  // 착공한 건물의 진행 상태에 이미 굳어 있다 — 새로 짓는 것부터 반영된다.
  { timing: 'saved', test: path => /^buildings\.[^.]+\.(?:buildDays|cost\..+)$/.test(path) },
];

/** 'runtime' | 'worldgen' | 'saved' */
export function balanceTiming(path) {
  for (const rule of BALANCE_TIMING_RULES) {
    if (rule.test(path)) return rule.timing;
  }
  return 'runtime';
}

// ── 값 검증 ────────────────────────────────────────────────────────────
// 막지는 않는다(개척용 도구다). 다만 "이 값은 시스템을 멈출 수 있다"를 눈에 보이게 한다.
/** 경고 문구, 없으면 null. */
export function balanceValueWarning(defaultValue, value) {
  if (typeof value !== 'number' || typeof defaultValue !== 'number') return null;
  if (!Number.isFinite(value)) return '숫자가 아니다';
  if (defaultValue > 0 && value <= 0) return '기본값이 양수인 항목에 0 이하 — 나눗셈·반복이 멈출 수 있다';
  if (defaultValue < 0 && value >= 0) return '기본값이 음수인 항목에 0 이상 — 부호가 뒤집혔다';
  if (defaultValue > 0 && defaultValue <= 1 && value > 1) return '확률·비율로 보이는 항목이 1을 넘는다';
  if (Number.isInteger(defaultValue) && !Number.isInteger(value)) return '기본값이 정수다 — 칸 수·일수라면 소수는 위험하다';
  return null;
}
