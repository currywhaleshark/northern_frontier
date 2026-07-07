// 게임 전역 타입 정의

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

export type Difficulty = 'easy' | 'normal' | 'hard';

// 승격 사다리: 개척지 → 보(堡) → 진(鎭) → 부(府). 부 승격이 최종 승리.
export type Rank = 'settlement' | 'bo' | 'jin' | 'bu';

export type Gender = 'male' | 'female';

export type WeatherId =
  | 'clear'      // 맑음
  | 'rain'       // 비
  | 'frost'      // 서리
  | 'heavySnow'  // 폭설
  | 'blizzard'   // 눈보라
  | 'coldSnap'   // 혹한
  | 'thawFlood'; // 해빙기 홍수

export type Terrain =
  | 'forest'   // 숲
  | 'plain'    // 평지
  | 'river'    // 강 (겨울에는 얼어붙은 강으로 표시)
  | 'mountain' // 산지
  | 'fertile'  // 비옥한 땅
  | 'rock'     // 바위/철광
  | 'center';  // 마을 중심지 예정지

// 짐승 서식지 — 지도 생성 때 숲 덩어리마다 난이도별 확률로 자리 잡는다.
// 반경 안 숲이 벌목으로 줄면 짐승이 떠나고(active=false), 숲이 되살아나면 돌아온다.
export interface AnimalHabitat {
  id: number;
  x: number;
  y: number;
  radius: number;
  active: boolean;
}

export type JobId =
  | 'idle'       // 무직
  | 'woodcutter' // 벌목꾼
  | 'hunter'     // 사냥꾼
  | 'farmer'     // 농부
  | 'builder'    // 건축가
  | 'hauler'     // 운반꾼
  | 'herbalist'  // 약초꾼
  | 'smith'      // 대장장이
  | 'miner'      // 채광꾼
  | 'fisher'     // 어부
  | 'watchman'   // 파수꾼
  | 'militia';   // 수비병 (내부 id는 저장 호환을 위해 유지)

export type ResourceId =
  | 'food'       // 식량
  | 'firewood'   // 장작
  | 'wood'       // 목재
  | 'stone'      // 돌
  | 'iron'       // 철
  | 'tools'      // 도구
  | 'hide'       // 가죽
  | 'clothes'    // 옷
  | 'herbs'      // 약초
  | 'grain'      // 곡물
  | 'game'       // 사냥감
  | 'gunpowder'  // 화약 (조정 지급 — 조총·포대가 전투마다 소모)
  | 'muskets'    // 조총 (조정 하사 — 수비병을 무장시킨다)
  | 'reputation' // 명성
  | 'defense';   // 방어도

export type ProcessingInputId = 'wood' | 'grain' | 'game' | 'hide' | 'iron';

export type BuildingTypeId =
  | 'center'     // 마을 중심지
  | 'hut'        // 초가집
  | 'ondol'      // 온돌집
  | 'tileHouse'  // 기와집
  | 'storehouse' // 창고
  | 'bridge'     // 다리
  | 'lumberCamp' // 벌목장
  | 'huntLodge'  // 사냥막
  | 'herbHut'    // 약초막
  | 'mine'       // 채광장
  | 'ferry'      // 나루터
  | 'field'      // 밭
  | 'smithy'     // 대장간
  | 'tannery'    // 가죽공방
  | 'beacon'     // 봉수대
  | 'palisade'   // 목책
  | 'watchtower' // 망루
  | 'garrison'   // 군영
  | 'market'     // 장터
  | 'cannonEmplacement'; // 불랑기포대 (부 승격 후 조정 청원으로만 배치)

export interface Tile {
  x: number;
  y: number;
  terrain: Terrain;
  hasIron: boolean;       // rock 타일 중 철광 여부
  buildingId: number | null;
}

export type AgentPhase = 'rest' | 'toWork' | 'working' | 'toDeposit';

export interface Resident {
  id: number;
  name: string;
  age: number;
  gender: Gender;
  job: JobId;
  hunger: number;   // 0(굶주림) ~ 100(포만)
  warmth: number;   // 0(동사 직전) ~ 100
  health: number;   // 0 사망
  morale: number;   // 0 ~ 100
  skills: Partial<Record<JobId, number>>; // 0 ~ 1 숙련도
  task: string;     // 현재 작업 설명
  alive: boolean;
  sick: boolean;
  // ── 에이전트 상태 (지도 위 이동/작업/운반) ──
  x: number;
  y: number;
  px: number; // 직전 서브틱 위치 (렌더링 보간용)
  py: number;
  phase: AgentPhase;
  path: { x: number; y: number }[]; // 다음에 밟을 타일들
  workTimer: number;                // 현재 작업지에서 남은 작업량(서브틱)
  targetId: number | null;          // 목표 건물 id (밭/건설현장/순찰지 등)
  carrying: Partial<Record<ResourceId, number>>; // 지고 있는 짐
}

export interface Building {
  id: number;
  type: BuildingTypeId;
  x: number;
  y: number;
  progress: number;   // 투입된 건축가-일수
  built: boolean;
  fieldGrowth: number; // 밭 전용: 작물 성장도 0~100
}

export interface BuildingDef {
  id: BuildingTypeId;
  name: string;
  emoji: string;
  desc: string;
  cost: Partial<Record<ResourceId, number>>;
  buildDays: number;        // 필요한 총 건축가-일수
  slots: number;            // 작업자 슬롯(참고용 표시)
  capacity: number;         // 주거 수용 인원
  defense: number;          // 제공 방어도
  winterBonus: boolean;     // 겨울 보너스 여부
  placement: 'land' | 'field' | 'river' | 'rock' | 'riverbank' | 'any';
  unique: boolean;          // 하나만 건설 가능 여부
  minRank?: Rank;
}

// 교역 제안: 마을이 give를 내주고 get을 받는다
export interface TradeOffer {
  give: ResourceId;
  giveAmt: number;
  get: ResourceId;
  getAmt: number;
}

export interface LogEntry {
  day: number;
  text: string;
  kind: 'info' | 'good' | 'bad' | 'raid' | 'weather' | 'trade';
}

export interface ChoiceOption {
  id: string;
  label: string;
  desc: string;
  disabled?: boolean;
  disabledReason?: string;
}

export interface PendingChoice {
  kind: 'raid' | 'trade' | 'tribute' | 'petition';
  title: string;
  body: string;
  options: ChoiceOption[];
  // raid: { power, faction, warned } / trade: { give, giveAmt, get, getAmt, faction } / tribute: { year }
  data: Record<string, unknown>;
}

// 조정 세공(歲貢) — 봄 첫날 그해 요구량이 공지되고, 겨울 첫날 사자가 거둬 간다
export interface CourtTribute {
  year: number;                               // 몇 년차 공물인지
  items: Partial<Record<ResourceId, number>>; // 요구 품목 (1~2종)
  dueDay: number;                             // 겨울 첫날 (수거일)
  resolved: boolean;                          // 올해분 처리 여부 (납부 또는 거절)
  paid: boolean;                              // 실제로 바쳤는지
}

// 지도 위를 이동하는 습격 무리
export interface RaiderBand {
  x: number;
  y: number;
  px: number; // 보간용 직전 위치
  py: number;
  path: { x: number; y: number }[];
  power: number;
  size: number;      // 지도에 그릴 인원 점 수
  faction: string;
  warned: boolean;   // 봉수/망루 조기 경보를 받았는지
  spotted: boolean;  // 접근 발견 로그를 이미 띄웠는지
  siege: boolean;    // 목책에 막혀 공성 중인지
  speed: number;     // 서브틱당 이동 타일
  trail: { x: number; y: number }[]; // 지나온 자취 (눈밭 발자국 렌더링용)
}

export type BattlePhase = 'muster' | 'clash';
export type BattleOutcome = 'victory' | 'defeat';
// garrison: 수비병+파수꾼 요격 / levy: 성한 주민 전체 징집
export type BattleMode = 'garrison' | 'levy';

export interface Battle {
  phase: BattlePhase;
  mode: BattleMode;
  frontX: number;
  frontY: number;
  initialPower: number;
  defenderIds: number[];
  ticks: number;
  musterDeadline: number;
  faction: string;
  warned: boolean;
  siege: boolean;
  // 교전 시작 때 기존 즉시 판정과 같은 확률로 굴려 둔 승패 — 소모전은 이 결과를 향해 연출된다
  outcome: BattleOutcome | null;
  // 징집(levy)된 일반 주민의 방어 기여 — 개전 시점 스냅샷.
  // 직업을 바꾸지 않고 명시 수치로 더한다 (computeDefense가 부풀지 않게).
  levyBonus?: number;
  // 구버전 저장 호환: 예전 코드가 전투 동안 직업을 바꿔 둔 주민들의 원래 직업
  draftedJobs?: { id: number; job: JobId }[];
}

export interface AlertItem {
  id: string;
  text: string;
  level: 'warn' | 'danger';
}

export interface GameOverState {
  won: boolean;
  reason: string;
}

export interface GameState {
  day: number;          // 경과 일수 (1부터)
  subTick: number;      // 하루 안의 서브틱 (0 ~ SUBTICKS-1)
  difficulty: Difficulty;
  seed: number;
  weather: WeatherId;
  map: Tile[][];
  habitats: AnimalHabitat[];
  residents: Resident[];
  buildings: Building[];
  nextBuildingId: number;
  nextResidentId: number;
  resources: Record<ResourceId, number>;
  processingReserves: Record<ProcessingInputId, number>; // 자동 가공 전에 남길 원자재 수량
  threat: number;         // 습격 위협도 0~100
  relations: Record<string, number>; // 세력별 우호도 0~100 (키: 세력 이름)
  raiders: RaiderBand | null; // 접근 중인 습격 무리
  battle: Battle | null;      // 지도 위에서 진행 중인 습격 전투
  raidCooldown: number;     // 습격 후 유예 기간
  tradeRefusedDays: number; // 최근 교역 거절 여파 남은 일수
  lastTradeDay: number;     // 마지막 교역 제안이 온 날
  lastTradeByFaction: Record<string, number>; // 세력별 마지막 플레이어 주도 교역일 (쿨다운용)
  pendingChoice: PendingChoice | null;
  courtTribute: CourtTribute | null;  // 올해 세공 (봄 공지 때 설정)
  tributeFailStreak: number;          // 연속 미납 횟수 (2년 연속이면 명성 하락 가중)
  tributePaidStreak: number;          // 연속 납부 년수 (승격 조건의 "공물 성실도")
  rank: Rank;                         // 현재 승격 단계
  lastPetitionDay: number;            // 마지막 청원 승인일 (계절당 1회 쿨다운)
  cannonsGranted: number;             // 조정이 하사한 불랑기포 수 (배치 가능 상한)
  log: LogEntry[];
  totalDeaths: number;
  starvationDeathsThisYear: number;
  winterStartPop: number;
  winterDeaths: number;
  lastWinterDeathRate: number; // 직전 겨울 사망률
  badWinterStreak: number;     // 겨울 직후 인구 5명 미만 연속 횟수
  gameOver: GameOverState | null;
  victoryProgressNote: string;
}
