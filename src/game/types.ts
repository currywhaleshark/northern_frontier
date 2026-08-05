// 게임 전역 타입 정의
import type { CombatRole } from './combatRoster';
import type { ArtifactWeaponId as ArtifactWeaponIdType } from './specialItems';
import type { SpecialItemId as SpecialItemIdType } from './specialItems';

// 기물 ID의 런타임 원본은 specialItems.ts에 둔다. 이 별칭은 기존 타입 import 경로를 보존한다.
export type SpecialItemId = SpecialItemIdType;
export type ArtifactWeaponId = ArtifactWeaponIdType;

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

export type Difficulty = 'easy' | 'normal' | 'hard';

// 새 게임 설정 — 지도 생성 단계가 순차 구현되어도 저장에는 처음 고른 세계 조건을 고정한다.
export type MapRegion = 'plains' | 'mountain' | 'lake' | 'coast';
export type MapSize = 'small' | 'medium' | 'large';
export type SetupLevel = 'low' | 'normal' | 'high';

export interface NewGameTuning {
  startingResources: SetupLevel;
  resourceDensity: SetupLevel;
  climateSeverity: SetupLevel;
  threat: SetupLevel;
}

export interface NewGameOptions {
  settlementName: string;
  difficultyPreset: Difficulty | 'custom';
  baseDifficulty: Difficulty;
  region: MapRegion;
  mapSize: MapSize;
  tuning: NewGameTuning;
  seed?: number;
}

export interface WorldSetupSnapshot {
  difficultyPreset: Difficulty | 'custom';
  baseDifficulty: Difficulty;
  region: MapRegion;
  mapSize: MapSize;
  tuning: NewGameTuning;
  seedSource: 'random' | 'manual' | 'legacy' | 'tutorial';
  effective: {
    startResourceMultiplier: number;
    threatGainMultiplier: number;
    raidPowerMultiplier: number;
    habitatChance: number;
    resourceDensityMultiplier: number;
    climateSeverityMultiplier: number;
  };
}

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
  | 'mudflat'  // 갯벌 (해안 어살터의 도보 작업 지형)
  | 'river'    // 강 (겨울에는 얼어붙은 강으로 표시)
  | 'lake'     // 호수 (가장자리부터 점진적으로 결빙·해빙)
  | 'sea'      // 바다 (해수 — 식수·농수 불가, 결빙하지 않음)
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
  stock: number;    // 현재 남은 사냥감 비축(1회 사냥에 1 소모)
  capacity: number; // 반경 안 숲 잔존량으로 정해지는 최대 비축
}

export type FishingGroundKind = 'river' | 'mudflat' | 'lake' | 'sea';
export type FishingGroundDepthBand = 'shore' | 'mid' | 'deep';
export interface FishingGroundTile { x: number; y: number }

// 어장 — 같은 수역 안에서만 잘린 공유 비축 권역. 연안은 도보, 중·심수는 어선 전용이다.
export interface FishingGroundState {
  id: string;
  kind: FishingGroundKind;
  depthBand: FishingGroundDepthBand;
  x: number;
  y: number;
  radius: number;
  tiles: FishingGroundTile[];
  stock: number;
  capacity: number;
  recoveryPerDay: number;
}

type FishingBoatStatus =
  | 'building'
  | 'moored'
  | 'boarded'
  | 'underway'
  | 'fishing'
  | 'returning'
  | 'repairing'
  | 'disabled';

export type FishingBoatFacing = 'ne' | 'nw' | 'se' | 'sw';

export type FishingPortPierDirection = 'n' | 'e' | 's' | 'w';

export interface FishingPortPier {
  direction: FishingPortPierDirection;
  length: number;
}

export interface FishingBoatState {
  id: number;
  portId: number;
  mooringSlot: 0 | 1;
  boatyardId?: number | null;
  fisherIds: number[];
  /** v60 이하 저장 호환용. normalizeFishingBoats에서 fisherIds로 흡수한다. */
  fisherId?: number | null;
  x: number;
  y: number;
  px: number; // 직전 서브틱 위치 (렌더링 보간용)
  py: number;
  facing: FishingBoatFacing;
  cargoFish: number;
  cargoCapacity: number;
  durability: number;
  maxDurability: number;
  status: FishingBoatStatus;
  route: FishingGroundTile[];
  routeIndex: number;
  targetGroundId?: string | null;
  tripDepthBand?: Extract<FishingGroundDepthBand, 'mid' | 'deep'> | null;
  tripCatchTarget?: number;
  tripDistance?: number;
  fishingProgress?: number;
  constructionProgress?: number;
  constructionRequired?: number;
}

export type JobId =
  | 'idle'       // 무직
  | 'woodcutter' // 벌목꾼
  | 'woodSplitter' // 장작꾼
  | 'hunter'     // 사냥꾼
  | 'farmer'     // 농부
  | 'miller'     // 방아꾼
  | 'builder'    // 건축가
  | 'hauler'     // 운반꾼
  | 'herbalist'  // 약초꾼
  | 'physician'  // 의원
  | 'curer'      // 갈무리꾼
  | 'potter'     // 옹기장이
  | 'saltMaker'  // 염부
  | 'smith'      // 대장장이
  | 'miner'      // 채광꾼
  | 'fisher'     // 어부
  | 'charcoalBurner' // 숯쟁이
  | 'herder'     // 목동
  | 'tanner'     // 무두장이
  | 'weaver'     // 베 짜는 이
  | 'powderMaker' // 염초장이
  | 'clerk'      // 아전
  | 'watchman'   // 파수꾼
  | 'undertaker' // 장의사 (묘지 배정 — 시신 수습과 안장)
  | 'teacher'    // 훈장 (서당 배정 — 아이들을 가르친다)
  | 'shaman'     // 무당 (당집 상주 — 네임드 전용)
  | 'monk'       // 승려 (암자 상주 — 네임드 전용)
  | 'militia';   // 수비병 (내부 id는 저장 호환을 위해 유지)

export type CombatWeaponId = 'musket' | 'hornBow' | 'spear';
export type MountId = 'horse';
type WeaponAllocationMode = 'auto' | 'manual';
export type HuntPreyId = 'rabbit' | 'pheasant' | 'roeDeer' | 'wildBoar';

export type ResourceId =
  | 'grain'      // 먹을 수 있는 곡물(밭 수확물 + 도정한 벼)
  | 'rice'       // 논에서 수확한 도정 전 벼
  | 'meat'       // 고기
  | 'eggs'       // 달걀
  | 'milk'       // 젖
  | 'fish'       // 생선
  | 'curedMeat'  // 보존육
  | 'saltedFish' // 자반
  | 'driedFish'  // 건어물
  | 'vegetables' // 채소
  | 'kimchi'     // 김치
  | 'beans'      // 콩
  | 'jang'       // 장
  | 'salt'       // 소금 (교역 전용 보존 재료)
  | 'brushwood'  // 땔나무
  | 'firewood'   // 장작
  | 'charcoal'   // 숯
  | 'wood'       // 목재
  | 'stone'      // 돌
  | 'iron'       // 철
  | 'tools'      // 도구
  | 'onggi'      // 옹기
  | 'carts'      // 운반꾼이 장비하는 수레
  | 'hide'       // 가죽
  | 'hideClothes' // 가죽옷
  | 'strawShoes' // 짚신
  | 'leatherShoes' // 가죽신
  | 'cotton'     // 목화
  | 'wool'       // 양털
  | 'hay'        // 건초 (초식 가축의 겨울 사료)
  | 'cottonClothes' // 무명옷
  | 'herbs'      // 약초
  | 'gunpowder'  // 화약 (조정 지급 — 조총·포대가 전투마다 소모)
  | 'spears'     // 창
  | 'hornBows'   // 각궁
  | 'muskets'    // 조총 (조정 하사 — 수비병을 무장시킨다)
  | 'porcelain'  // 자기
  | 'brassware'  // 유기
  | 'lacquerware' // 칠기
  | 'silk'       // 비단
  | 'preciousMetal' // 귀금속
  | 'silver'     // 은 (조선 상단 결제 수단 — 부패하지 않는 가치 저장 자원)
  | 'reputation' // 명성
  | 'defense';   // 방어도

export type SmithyProductId = 'tools' | 'carts' | 'spears' | 'hornBows' | 'muskets' | 'silverwork';
export type TanneryProductId = 'auto' | 'hideClothes' | 'leatherShoes';
export type WearableSlot = 'clothing' | 'footwear';

export interface WornItem {
  resource: Extract<ResourceId, 'hideClothes' | 'cottonClothes' | 'strawShoes' | 'leatherShoes'>;
  wear: number; // 0(새것) ~ 1(수명 종료)
}

export type DryingProductId = 'saltedFish' | 'driedFish';

export type CropId = 'millet' | 'sorghum' | 'buckwheat' | 'barley' | 'rice' | 'vegetables' | 'beans' | 'cotton';

export type ProcessingInputId = 'wood' | 'rice' | 'hide' | 'iron' | 'meat' | 'fish';

export type BuildingTypeId =
  | 'center'     // 마을 중심지
  | 'hut'        // 초가집
  | 'ondol'      // 온돌집
  | 'tileHouse'  // 기와집
  | 'storehouse' // 창고
  | 'cellar'     // 움 저장고
  | 'smokehouse' // 훈연소
  | 'dryingRack' // 건조대
  | 'onggiKiln'  // 옹기가마
  | 'saltworks'  // 자염막 — 해안에서 장작으로 바닷물을 끓여 소금 생산
  | 'tidalFishery' // 어살터 — 갯벌을 도보로 이용하는 해안 어로 거점
  | 'jangdokdae' // 장독대
  | 'bridge'     // 다리
  | 'weir'       // 보(洑) — 가뭄 관개 시설
  | 'levee'      // 제방(堤防) — 대홍수 범람 차단
  | 'canal'      // 농수로 — 강물을 내륙 논으로 잇는 통행 가능한 도랑
  | 'lumberCamp' // 벌목장
  | 'woodShed'   // 장작마당
  | 'huntLodge'  // 사냥막
  | 'herbHut'    // 약초막
  | 'lodgingHut' // 숙식 움막 — 채집 거점에 링크되는 원거리 숙식·보급 시설
  | 'clinic'     // 의원
  | 'mine'       // 채광장
  | 'well'       // 우물 — 지하수 수맥 위 급수 시설
  | 'rainwaterCistern' // 빗물 저수조 — 강수만 모아 쓰는 무인 생활용수 시설
  | 'deepMine'   // 채광갱 — 지하 광맥을 캐는 부 단계 작업장
  | 'ferry'      // 낚시터 (구 저장 호환을 위해 내부 ID 유지)
  | 'fishingPort' // 포구 — 호수·바다 연안 어로와 어선 계류 거점
  | 'boatyard'    // 배무이터 — 어선 건조·본수리 시설
  | 'charcoalKiln' // 숯가마
  | 'stable'     // 축사
  | 'nitreYard'  // 염초장
  | 'dock'       // 부두
  | 'field'      // 밭
  | 'paddy'      // 논
  | 'watermill'  // 방앗간
  | 'smithy'     // 대장간
  | 'tannery'    // 가죽공방
  | 'weavingHouse' // 베틀집
  | 'beacon'     // 봉수대
  | 'palisade'   // 목책
  | 'earthFort'  // 토성
  | 'stoneWall'  // 석벽
  | 'gate'       // 성문
  | 'watchtower' // 망루
  | 'garrison'   // 군영
  | 'office'     // 관청
  | 'market'     // 장터
  | 'cemetery'   // 묘지 (시신 안장 — 묘 자리가 차오른다)
  | 'school'     // 서당 (훈장이 아이들을 가르친다 — 교육 만족)
  | 'shrine'     // 당집 (무속 — 무당이 와야 지을 수 있다)
  | 'hermitage'  // 암자 (불교 — 노승이 와야 지을 수 있다)
  | 'cannonEmplacement' // 불랑기포대 (부 승격 후 조정 청원으로만 배치)
  | 'chongtongEmplacement'; // 지자총통 포대 (하사 기물 보유 시 1곳)

export type SolidWallBuildingTypeId = Extract<BuildingTypeId, 'palisade' | 'earthFort' | 'stoneWall'>;

export interface Tile {
  x: number;
  y: number;
  terrain: Terrain;
  treeStage?: 'stump' | 'young' | 'mature'; // 숲 성장 상태. 구버전 저장의 숲은 성목으로 간주
  hasIron: boolean;       // rock 타일 중 철광 여부
  hasSilver?: boolean;    // 잠채/설점으로 은광이 된 광상. 구버전 저장은 없음
  mineralRemaining?: number; // 바위/철광의 남은 주 광물량. 구버전 저장은 없음
  tidalStock?: number;    // v57 이하 갯벌 비축 마이그레이션 원본. v58 런타임에서는 제거
  tidalCapacity?: number; // v57 이하 갯벌 최대 비축 마이그레이션 원본. v58 런타임에서는 제거
  buildingId: number | null;
}

export interface ExplorationState {
  explored: boolean[][];  // 한 번이라도 답사한 타일. 미답사는 지형/자원/건물을 알 수 없다.
}

export type ForeignSiteType =
  | 'village'
  | 'fishingVillage'
  | 'seasonalCamp'
  | 'outpost'
  | 'banditLair'
  | 'ruin';

export type ForeignSiteStatus =
  | 'hidden'
  | 'stable'
  | 'prosperous'
  | 'hungry'
  | 'sick'
  | 'hostile'
  | 'fortified'
  | 'abandoned'
  | 'burned';

export type ClaimKind = 'hunting' | 'fishing' | 'forest' | 'field' | 'sacred' | 'passage';

export interface ClaimZone {
  id: number;
  siteId: number;
  factionName: string | null;
  kind: ClaimKind;
  x: number;
  y: number;
  radius: number;
  discovered: boolean;
  permittedUntilDay?: number;
}

export interface ForeignSiteMemory {
  day: number;
  text: string;
  kind: 'good' | 'bad' | 'neutral';
}

export type BanditLairDoctrineId = 'trailAttrition' | 'wallHold' | 'leaderEscape';

export interface BanditLairDefensePlan {
  doctrine: BanditLairDoctrineId;
  doctrineRevealed: boolean;
  stratagemPoints: number;
}

export interface ForeignSite {
  id: number;
  type: ForeignSiteType;
  name: string;
  factionName: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  discovered: boolean;
  status: ForeignSiteStatus;
  population: number;
  militaryPower: number;
  foodStock: number;
  tradeStock: Partial<Record<ResourceId, number>>;
  influenceRadius: number;
  goodwill: number;
  trust: number;
  alarm: number;
  favors: number;
  memories: ForeignSiteMemory[];
  seasonalActive?: boolean;
  activeSeasons?: Season[];
  lastInteractionDay: number;
  lastRaidDay?: number;
  scoutedUntilDay?: number;
  lairScoutAttempts?: number;
  lairScoutFailures?: number;
  lairAssaultDefeats?: number;
  lairDoctrine?: BanditLairDoctrineId;
  lairDoctrineRevealed?: boolean;
  lairDoctrineRevision?: number;
  lairDoctrineChosenDay?: number;
  lairDoctrineNextReviewDay?: number;
}

type PointerCursor = 'default' | 'move' | 'copy' | 'pointer' | 'not-allowed';

export type SelectedEntity =
  | { kind: 'tile'; x: number; y: number }
  | { kind: 'resident'; id: number }
  | { kind: 'building'; id: number }
  | { kind: 'fishingBoat'; id: number };

export type PointerAction =
  | { kind: 'none'; cursor: PointerCursor; label: string }
  | { kind: 'move'; cursor: PointerCursor; label: string; x: number; y: number; unauthorizedSiteIds?: number[] }
  | { kind: 'work'; cursor: PointerCursor; label: string; x: number; y: number; buildingId?: number; unauthorizedSiteIds?: number[] }
  | { kind: 'building'; cursor: PointerCursor; label: string; buildingId: number }
  | { kind: 'invalid'; cursor: PointerCursor; label: string };

export type ManualOrder =
  | { kind: 'move'; x: number; y: number; unauthorizedSiteIds?: number[] }
  | { kind: 'work'; x: number; y: number; buildingId?: number; repeat?: boolean; unauthorizedSiteIds?: number[]; started?: boolean };

export type DayBand = 'dawn' | 'work' | 'evening' | 'night';

type AgentPhase =
  | 'rest'
  | 'toWork'
  | 'working'
  | 'toDeposit'
  | 'toLeisure'
  | 'leisure'
  | 'toHome'
  | 'sleeping';

interface HaulTask {
  sourceBuildingId: number;
  resource: ResourceId;
  amount: number;
  kind?: 'collect' | 'supply'; // 구버전 작업은 collect로 해석
  targetBuildingId?: number; // supply일 때 재료를 내려놓을 생산시설
}

// 생애 단계 — 성장 게이지 모델(가축 growth 선례). 나이가 아니라 단계로 자란다.
export type LifeStage = 'infant' | 'child' | 'youth';
export type YouthActivity = 'work' | 'school';

// 네임드 특수 주민 — 게임당 한 번만 오는 인물 (2026-07-17-special-residents.md의 첫 조각)
export type SpecialResidentId =
  | 'tutorialAdvisor' // 산골 길잡이 연이
  | 'mudang' | 'nosung' | 'exiledScholar' | 'jurchenWarrior'
  | 'tigerHunter'   // 착호 포수 박돌개
  | 'geomancer'     // 맹인 지관 허생
  | 'uinyeo'        // 내의원 의녀 단심
  | 'runawaySmith'  // 도망 야장 막쇠
  | 'interpreter'   // 퇴역 역관 배수겸
  | 'hangwae';      // 항왜 철포수 사야카

type SpecialResidentStatus = 'confined' | 'active' | 'departed' | 'declined' | 'dead';

export interface SpecialResidentRecord {
  status: SpecialResidentStatus;
  residentId?: number;
  availableUntilDay?: number;
  originFaction?: string;
  joinedDay?: number;
  courtDemandResolved?: boolean;
  pardonResolved?: boolean;
  nextDemandDay?: number;
}

export type ReligionId = 'shamanism' | 'buddhism';
export type ReligiousVocation = 'shaman' | 'monk';

// 민심 내역 — 티어가 오를수록 기대 항목이 늘어난다 (조정 탭 의심 내역과 같은 문법)
export interface MoraleFactor {
  id: string;
  label: string;
  delta: number;      // 목표 민심 기여 (+만족 / -불만)
  unlocked: boolean;  // 현 티어에서 기대 항목인지 (잠긴 항목은 계산 제외)
}

// 매장을 기다리는 시신. 방치가 길어지면 마을 민심이 상한다.
export interface Corpse {
  id: number;
  name: string;
  residentLabel?: string;   // 사망 당시 역할을 보존한 로그용 이름
  x: number;
  y: number;
  deathDay: number;
  cause: string;
  carried?: boolean;      // 장의사가 운구 중
  skipUntilDay?: number;  // 접근 불가 시신의 재시도 유예
  withExpedition?: boolean; // 원정대가 수습해 지니고 귀환 중 (귀환 시 마을에 내려놓는다)
}

// 묘지에 안치된 뒤에도 남는 최소 기록. 구버전 묘는 일부 값이 없을 수 있다.
interface BurialRecord {
  corpseId?: number;
  name?: string;
  cause?: string;
  deathDay?: number;
  burialDay?: number;
}

export interface Resident {
  id: number;
  name: string;
  age: number;
  gender: Gender;
  job: JobId;
  origin?: string; // 귀순·이주 전의 소속. 없으면 일반 개척지 주민
  // ── 생애 주기 (없으면 성인) ──
  stage?: LifeStage | null;    // 아기/어린이/소년 — 성인이 되면 지워진다
  stageProgress?: number;      // 현 단계에서 자란 일수 (굶주림·혹한이면 멈춤)
  // ── 교육 (서당) ──
  youthActivity?: YouthActivity; // 소년기 선택 — 반몫 노동 또는 서당 취학
  education?: number;          // 아이의 취학 누적 일수 — schoolingDays 채우면 문해
  literate?: boolean;          // 문해자 — 의원·아전·훈장 자격, 숙련 성장 가속
  spouseId?: number | null;    // 배우자 주민 id
  motherId?: number;           // "○○의 아이" 표기용
  motherName?: string;         // 부모가 이탈해도 남기는 역사적 이름
  fatherId?: number;
  fatherName?: string;
  special?: SpecialResidentId; // 네임드 특수 주민 — 직업 고정, 게임당 1회
  religiousVocation?: ReligiousVocation; // 종교 후계 소명 — 네임드 특기 없이 무당/승려 직업만 고정
  religiousMentorId?: number;   // 종교 계보: 내림굿을 내리거나 동자승으로 거둔 스승 주민 id
  birthRecoveryUntil?: number; // 산모 회복 — 이 날까지 노동 이탈
  corpseCarryId?: number | null; // 장의사가 운구 중인 시신 id
  hunger: number;   // 0(굶주림) ~ 100(포만)
  warmth: number;   // 0(동사 직전) ~ 100
  health: number;   // 0 사망
  morale: number;   // 0 ~ 100
  skills: Partial<Record<JobId, number>>; // 0 ~ 1 숙련도
  assignedBuildingId: number | null;
  homeBuildingId: number | null; // 실제 입주 중인 주거 건물. null이면 노숙
  task: string;     // 현재 작업 설명
  alive: boolean;
  sick: boolean;
  quarantinedUntil?: number; // 이 날까지 격리되어 배정은 유지하지만 일을 하지 못한다
  worn?: Partial<Record<WearableSlot, WornItem>>; // 사망·이탈 시 창고로 회수하지 않는다.
  lastWearableCheckDay?: number; // 새벽 자율 수령 중복 방지
  lastStrawShoeCraftDay?: number; // 저녁 짚신 생산 중복 방지
  lastHuntPrey?: HuntPreyId; // 사냥 성공 후 운반 중인 사냥감 표시
  fireResponse?: FireResponse; // 평시 화재의 물 긷기·운반·진화 왕복 상태
  trappedInMineId?: number; // 갱도 붕괴 구조가 끝날 때까지 일반 생활·노동에서 제외
  watchtowerEscapeTowerId?: number; // P4 무너지는 망루에서 탈출 중인 출발 건물
  watchtowerEscapeDeadlineTick?: number; // 퇴로가 없을 때 부상·사망을 판정할 유예
  watchtowerEscapeHasRoute?: boolean; // 저장 후에도 탈출/고립을 구분한다
  // ── 에이전트 상태 (지도 위 이동/작업/운반) ──
  x: number;
  y: number;
  px: number; // 직전 서브틱 위치 (렌더링 보간용)
  py: number;
  phase: AgentPhase;
  path: { x: number; y: number }[]; // 다음에 밟을 타일들
  workTimer: number;                // 현재 작업지에서 남은 작업량(서브틱)
  targetId: number | null;          // 목표 건물 id (밭/건설현장/순찰지 등)
  miningDepositBuildingId?: number | null; // 현재 짐을 부릴 담당 채광장. 없으면 일반 저장 거점
  lodgingSupplyHutId?: number | null; // 마을에서 숙식 움막으로 식량·땔감을 나르는 중
  lodgingHomeRestDay?: number | null; // 비축 소진 뒤 집에서 쉬는 절대일
  carrying: Partial<Record<ResourceId, number>>; // 지고 있는 짐
  cartEquipped: boolean; // 운반용 수레 장비 여부
  fishingBoatId?: number | null; // 승선 중인 어선. 육상 이동과 동시에 유지하지 않는다.
  haulTask: HaulTask | null; // 생산지 재고 운반 예약
  manualOrder: ManualOrder | null;  // 플레이어가 우클릭으로 지정한 이동/작업 명령
}

export type LivestockId = 'chicken' | 'goat' | 'sheep' | 'pig' | 'cattle' | 'horse';

export interface LivestockState {
  species: LivestockId;
  headcount: number;
  growth: number; // 다음 새끼가 태어나기까지의 진행도 0~1
  feedShortageDays: number;
}

export interface PastureArea {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface BuildingExpansion {
  kind: 'footprint' | 'pasture';
  fromArea: PastureArea;
  targetArea: PastureArea;
  progress: number;
  required: number;
  addedTiles: number;
}

interface BuildingWorkOrder {
  kind: 'demolish' | 'relocate';
  phase: 'dismantling' | 'rebuilding';
  progress: number;
  required: number;
  destination?: PastureArea;
}

interface GateConversion {
  wallType: SolidWallBuildingTypeId;
  progress: number;
  required: number;
  paidCost: Partial<Record<ResourceId, number>>;
}

interface StructureRepair {
  progress: number;
  required: number;
  paidCost: Partial<Record<ResourceId, number>>;
}

export interface WeirReservoirTile {
  x: number;
  y: number;
  originalTerrain: Extract<Terrain, 'plain' | 'fertile'>;
}

interface WeirReservoirState {
  startedDay: number;
  floodedCount: number;
  tiles: WeirReservoirTile[];
}

export interface GatheringWorkArea {
  x: number;
  y: number;
  radius: number;
}

export interface Building {
  id: number;
  type: BuildingTypeId;
  x: number;
  y: number;
  progress: number;   // 투입된 건축가-일수
  built: boolean;
  fieldGrowth: number; // 밭 전용: 작물 성장도 0~100
  w?: number; // 밭/논/묘역 전용: 가로 칸 수 (기본 1, 최대 CONFIG.farming.maxPlotSide)
  h?: number; // 밭/논/묘역 전용: 세로 칸 수 (기본 1, 최대 CONFIG.farming.maxPlotSide)
  sownArea?: number; // 밭/논 전용: 이번 작기에 파종을 마친 칸 수 (0 ~ w*h)
  plowOxen?: number; // 밭/논 전용: 배정된 농우(소) 마릿수
  cropId?: CropId | null; // 밭/논 전용: 현재 선택/재배 작물
  queuedCropId?: CropId | null; // 밭/논 전용: 수확 뒤 또는 다음 파종철에 적용할 작물
  smithyProduct?: SmithyProductId; // 대장간 전용: 현재 생산품
  tanneryProduct?: TanneryProductId; // 무두장 전용: 자동/가죽옷/가죽신
  dryingProduct?: DryingProductId; // 건조대 전용: 현재 생산품
  fermentBatches?: FermentBatch[]; // 장독대 전용: 절대일 기준 숙성 배치
  livestock?: LivestockState; // 축사 전용: 축종·마릿수·번식·사료 부족 상태
  pasture?: PastureArea; // 축사 전용: 완공 후 지정하는 인접 방목 영역
  expansion?: BuildingExpansion; // 완공된 영역형 건물의 확장 공사
  workOrder?: BuildingWorkOrder; // 건축가가 수행하는 해체 또는 이전 공사
  gateWallType?: SolidWallBuildingTypeId; // 성문 전용: 전환 전 벽 등급
  gateConversion?: GateConversion; // 완공 벽을 막힌 상태로 유지하며 진행하는 성문 전환 공사
  structureIntegrity?: number; // P2 성벽·성문과 P4 망루의 현재 구조 내구
  structureIntegrityMax?: number; // 기반 벽 등급 또는 망루에서 정한 최대 구조 내구
  breached?: boolean; // 내구가 0이 되어 양쪽 모두 통과 가능한 잔해가 된 상태
  structureRepair?: StructureRepair; // 돌파 잔해를 다시 차단 상태로 되돌리는 건축가 공사
  weirReservoir?: WeirReservoirState; // 보 전용: 상류 영구 침수 칸과 원래 지형
  leveeEdge?: 'n' | 'e' | 's' | 'w'; // 제방 전용: 강 타일에서 둑이 붙는 육지 쪽 변
  graves?: number; // 묘역 전용: 안장된 묘 수 (한 타일의 2×2 소구획에 최대 4기)
  burialRecords?: BurialRecord[]; // 묘지 전용: 이름·사인·사망일을 보존하는 안치 기록
  inventory?: Partial<Record<ResourceId, number>>; // 운반 전 생산지 현장 재고
  gatheringWorkArea?: GatheringWorkArea; // 채집 거점 전용: 건물과 독립적으로 옮기고 넓힐 수 있는 원형 작업영역
  linkedGatheringBuildingId?: number | null; // 숙식 움막 전용: 한 동이 맡는 채집 거점
  repairing?: boolean; // 외부 피해로 파손되어 건설담당의 수리가 필요한 상태
  watchtowerLastShotTick?: number; // P4 망루의 마지막 사격 절대 틱
  watchtowerDamageDay?: number; // P4 일일 피해 상한을 계산한 날짜
  watchtowerDamageToday?: number; // P4 해당 날짜에 실제로 준 누적 피해
  watchtowerHadTarget?: boolean; // P4 사거리 진입 즉시 사격을 위한 직전 표적 상태
  repairCause?: BuildingRepairCause; // 우측 경고에서 습격·설해·대홍수·화재 피해를 구분한다
  boatWorkOrder?: FishingBoatWorkOrder; // 배무이터 전용 어선 건조·본수리 공정
  portPier?: FishingPortPier; // 포구 전용: 육상 포구채에서 수면 계류대까지 뻗는 직선 잔교
  cisternStored?: number; // 빗물 저수조 전용: 지금 바로 쓸 수 있는 물
  cisternSnowStored?: number; // 빗물 저수조 전용: 봄 해빙 전까지 얼어 있는 눈물
  cisternDryWarningDay?: number; // 고갈 경고 중복 방지용 마지막 날짜
}

interface FishingBoatWorkOrder {
  kind: 'build' | 'repair';
  portId: number;
  boatId?: number;
  mooringSlot?: 0 | 1;
  progress: number;
  required: number;
}

export type BuildingRepairCause = 'raid' | 'snowDamage' | 'springFlood' | 'fire' | 'mineCollapse';

export interface FermentBatch {
  kind: 'jang' | 'kimchi';
  amount: number; // 완성 시 산출되는 발효식품 수량
  readyOnDay: number; // 저장/불러오기에도 흔들리지 않는 절대일
}

export interface BuildingDef {
  id: BuildingTypeId;
  name: string;
  desc: string;
  cost: Partial<Record<ResourceId, number>>;
  buildDays: number;        // 필요한 총 건축가-일수
  slots: number;            // 작업자 슬롯(참고용 표시)
  capacity: number;         // 주거 수용 인원
  defense: number;          // 제공 방어도
  winterBonus: boolean;     // 겨울 보너스 여부
  placement: 'land' | 'field' | 'paddy' | 'river' | 'rock' | 'riverbank' | 'coast' | 'mudflat' | 'fishingWaterfront' | 'watermill' | 'any';
  unique: boolean;          // 하나만 건설 가능 여부
  minRank?: Rank;
  region?: MapRegion;       // 특정 지역에서만 건설 가능한 시설
}

// 교역 제안: 마을이 give를 내주고 get을 받는다
export interface TradeOffer {
  give: ResourceId;
  giveAmt: number;
  get: ResourceId;
  getAmt: number;
}

export interface TradeRequest {
  give: ResourceId;
  giveAmt: number;
  get: ResourceId;
}

export interface TradeQuote {
  ok: boolean;
  reason?: string;
  faction: string;
  give: ResourceId;
  giveAmt: number;
  get: ResourceId;
  getAmt: number;
  margin: number;
}

type TradeNegotiationPhase = 'selecting' | 'countered' | 'accepted' | 'rejected';

export interface TradeNegotiation {
  faction: string;
  initiatedBy: 'player' | 'faction';
  mode?: 'trade' | 'extortion';
  phase: TradeNegotiationPhase;
  give: ResourceId | null; // 마을이 내놓는 물품
  giveAmt: number;
  originalGiveAmt?: number; // 상대가 먼저 요구한 최초 수량 (역제안 상한)
  get: ResourceId | null;  // 마을이 받는 물품
  getAmt: number;
  round: number;
  margin: number;
  message: string;
  maxAcceptGetAmt?: number;
  specialItem?: SpecialItemId | null;
}

export interface TradeEvaluation {
  outcome: Extract<TradeNegotiationPhase, 'accepted' | 'countered' | 'rejected'>;
  offer: TradeOffer;
  maxGetAmt: number;
  message: string;
}

type DiplomaticEnvoyKind = 'gift' | 'pact' | 'claimAccord' | 'aidRequest';

export interface PendingEnvoy {
  factionName: string;
  kind: DiplomaticEnvoyKind;
  payload: Partial<Record<ResourceId, number>>;
  dueDay: number;
  // 발송 순간 확정한 보정. 왕복 중 세이브를 다시 읽어도 답신 결과가 바뀌지 않는다.
  relationGain?: number;
  giftValue?: number;
  pactYears?: number;
  // 생활권 협정은 사절을 보낼 때 대상 구역과 가격을 고정한다.
  claimZoneId?: number;
  claimAccordUntilDay?: number;
  aidTargetSiteId?: number;
  aidWarriorCount?: number;
}

interface DiplomaticPact {
  factionName: string;
  untilDay: number;
}

interface ClaimAccord {
  zoneId: number;
  untilDay: number;
}

interface ReadyMilitaryAid {
  factionName: string;
  targetSiteId: number;
  warriorCount: number;
  arrivedDay: number;
}

export interface ExpeditionExternalAid {
  factionName: string;
  committed: number;
  killed: number;
  wounded: number;
}

export interface WarDispatch {
  requesterFactionName: string;
  opposingFactionName: string;
  memberIds: number[];
  sentDay: number;
  dueDay: number;
}

export interface LogEntry {
  day: number;
  text: string;
  kind: 'info' | 'good' | 'bad' | 'raid' | 'weather' | 'trade';
  important?: boolean; // 통합 로그 축약 상태의 주요 소식에 노출
  notice?: boolean; // 액션 중앙 플로트에도 한 번 띄울 중요한 게임 내 통지
}

// ── 연대기 — 영구 보존되는 굵직한 사건 기록 ──
// 로그(state.log)는 용량 제한으로 잘리는 흘러가는 소식이고, 연대기는 회고 화면이 읽는
// 마을의 역사다. 계획: docs/DESIGN-2026-07-29-chronicle-screen.md
export type AnnalsKind =
  | 'legacy'      // 구세이브에서 복원한 불완전한 과거 기록
  | 'founding'    // 정착 (기록 시작)
  | 'promotion'   // 보/진/부 승격
  | 'winter'      // 혹독한 월동 (겨울 사망률 문턱 초과 시만)
  | 'disaster'    // 재해 (이른서리·역병·해빙기 홍수 등)
  | 'raid'        // 습격과 그 결과 (격퇴/피해)
  | 'battle'      // 전술 전투 (원정·토벌)
  | 'special'     // 특수 주민 등장·이탈
  | 'grant'       // 하사·교지·사액
  | 'population'  // 인구 이정표
  | 'building'    // 주요 건물 최초 완공
  | 'trade'       // 정기거래 체결·갱신·파기
  | 'court'       // 조정 관련 (견책·감찰·토벌 유예·개칭 허가)
  | 'ending';     // 엔딩 도달

export interface AnnalsEntry {
  day: number;
  kind: AnnalsKind;
  text: string;       // 기록 시점에 완성된 한 문장 (화면에서 조립하지 않는다)
  dedupeKey?: string; // 인구 이정표·최초 완공처럼 저장 전체에서 1회인 사건
}

// 평생 통계 — 열람 전용 누적 카운터. 기존 totalDeaths류는 다른 시스템이 쓰므로 병행 유지.
export interface LifetimeStats {
  trackingSinceDay: number; // 신규 게임 1, 구세이브는 마이그레이션 당시 day
  births: number;
  deathsByCause: Record<DeathCauseId, number>;
  raidsRepelled: number;   // 최종 방어 결과가 승리인 습격
  raidsSuffered: number;   // 약탈·건물 피해·주민 사망 중 하나 이상이 있었던 습격
  tradesCompleted: number; // 실제 자원이 오간 거래 1회씩
  grantsReceived: number;  // 조정 하사 행사 1회씩
}

// 연도별 스냅샷 — 연초 상태 1건씩, 추이 그래프용
export interface YearlySnapshot {
  year: number;
  population: number;
  food: number;                 // foodTotal(state)
  fuelHeat: number;             // fuelHeatTotal(state)
  combatReadyResidents: number;
  buildings: number;            // 일반 건물만 (경작지·성벽 제외)
  fieldTiles: number;
  paddyTiles: number;
  wallSegments: number;         // 목책+토성+석벽
  silver: number;
}

// 개칭 청원 — 파발이 한양을 왕복하는 동안의 대기 상태
interface PendingSettlementRename {
  requestedName: string;
  sentDay: number;
  dueDay: number;
}

// 은맥의 생애: offered(선택 대기) → secret(잠채) / sanctioned(설점) / sealed(봉인) / buried(묻어둠)
type SilverVeinStatus = 'offered' | 'secret' | 'sanctioned' | 'sealed' | 'buried';

export interface SilverVeinState {
  status: SilverVeinStatus;
  x: number;
  y: number;
  discoveredDay: number;
  discoveredAmount?: number; // 최초 발견 순간 확정된 은 매장량. 다시 열어도 변하지 않는다
  minedTotal: number;      // 잠채/설점으로 캔 은 누계 (발각 확률에 비례)
  exposed?: boolean;       // 잠채가 조정에 알려졌는지 (스파이크는 1회)
  sealBroken?: boolean;    // 봉인 명령을 어기고 캐는 중인지 (발각 시 더 아프다)
  lastOfferDay?: number;   // 마지막으로 은맥 선택지를 연 날(기록·구 저장 호환)
}

interface ChoiceOption {
  id: string;
  label: string;
  desc?: string;
  effect?: string; // 대사와 분리해 표시하는 실제 비용·보상·목표
  disabled?: boolean;
  disabledReason?: string;
}

// 초상화 대화형 사건의 표시 정보. 사건 판정과 분리된 순수 표시 메타데이터라
// 기존 PendingChoice와 저장 호환을 유지하면서 튜토리얼·후반 이야기 사건이 함께 쓴다.
export interface DialoguePresentation {
  speaker: string;
  speakerTitle?: string;
  portrait?: {
    src: string;
    alt: string;
    position?: string;
  };
}

export interface PendingChoice {
  kind: 'raid' | 'expedition' | 'expeditionRaidOrder' | 'trade' | 'extortion' | 'tribute' | 'tributeAnnouncement' | 'tradeContract' | 'petition' | 'inspection' | 'crackdown' | 'immigration' | 'incident' | 'territory' | 'silverVein' | 'wedding' | 'religion' | 'specialResident' | 'scenario' | 'guide' | 'promotionDecree' | 'mineCollapse' | 'giftEnvoy' | 'pactEnvoy' | 'pactRenewal' | 'claimAccordEnvoy' | 'claimAccordRenewal' | 'claimAccordOffer' | 'aidRequestEnvoy' | 'warParticipationRequest' | 'warParticipationResult';
  title: string;
  body: string;
  illustration?: {
    src: string;
    alt: string;
  };
  dialogue?: DialoguePresentation;
  options: ChoiceOption[];
  // raid: { power, faction, warned } / trade: { give, giveAmt, get, getAmt, faction } / immigration: { count }
  data: Record<string, unknown>;
}

// ── 시나리오(튜토리얼) — 일반 게임 위에 얹는 스크립트 레이어 ──
// 내용(문구·조건)은 코드(scenario.ts)에 있고, 저장에는 진행 위치만 남긴다.
// version이 코드와 다르면 로드 시 시나리오를 해제하고 일반 모드로 전환한다.
export interface ScenarioState {
  id: 'tutorial';
  version: number;
  stepIndex: number;                // 진행 중 스텝 (0-based). steps.length면 완료 대기
  introShown: boolean;              // 현재 스텝의 안내 모달을 이미 띄웠는지
  completed?: boolean;
  flags: Record<string, number>;    // 스텝 목표 수치와 UI 훅 플래그 (예: residentSelected)
}

// ── 초회 도움말(길잡이 모듈) — 시나리오와 분리된 상태 ──
// 시나리오는 랜덤 사건을 잠그므로 안내를 이어가려고 붙들어 둘 수 없다.
// 튜토리얼이 끝난 뒤에도, 튜토리얼을 거치지 않은 일반 게임에서도 이 상태만으로 안내가 산다.
export interface GuideState {
  enabled: boolean;              // 완료 모달·설정에서 켜고 끈다
  seen: Record<string, number>;  // 모듈 id → 처음 본 날 (1회성 보장)
}

// 화면에 떠 있는 비차단 길잡이 카드 (시간을 멈추지 않는다 — 닫기 전까지 남는다)
export interface GuideCardEntry {
  moduleId: string;
  title: string;
  body: string;
  day: number;
}

export interface TerritoryViolation {
  siteId: number;
  // 항의를 생활권 협정으로 수습할 때 실제 침범 구역만 제안 대상으로 삼는다.
  zoneIds: number[];
  firstDay: number;
  lastDay: number;
  warningDay: number;
  passage: boolean;
  work: boolean;
  count: number;
  lastPassageDay?: number;
  lastWorkDay?: number;
}

export type PredatorKind = 'wolf' | 'tiger';
export type TigerTier = 'tiger' | 'greatTiger' | 'mountainLord';
export type WildlifeKind = PredatorKind | 'boar';
export type SpecialEventId = WildlifeKind | 'wildGinseng' | 'plagueSuspicion' | 'grainRequisition' |
  'shipwreck' | 'earlyFrost' | 'lateFrost' | 'locust' | 'drought' | 'gyrfalcon' | 'horseDefectors' |
  'livestockEpidemic';

export type DisasterId =
  | 'earlyFrost'
  | 'lateFrost'
  | 'locust'
  | 'drought'
  | 'springFlood'
  | 'snowDamage'
  | 'epidemic'
  | 'livestockEpidemic'
  | 'mineCollapse'
  | 'fire';

export interface PendingDisaster {
  id: DisasterId;
  choiceId: string;
  startedDay: number;
  resolveDay: number;
  targetBuildingIds?: number[];
  progress?: number;
  data?: Record<string, number>;
  affectedTiles?: DisasterAffectedTile[];
  fireSites?: FireSite[];
  trappedResidentIds?: number[];
}

export interface FireSite {
  buildingId: number;
  intensity: number;
  burnProgress: number;
  suppressionProgress: number;
  ignitedDay: number;
  ignitedSubTick: number;
}

type FireResponsePhase = 'toWater' | 'toFire';
export type FireWaterSourceKind = 'well' | 'river' | 'lake';

interface FireResponse {
  buildingId: number;
  sourceKind: FireWaterSourceKind;
  sourceBuildingId?: number;
  sourceX: number;
  sourceY: number;
  phase: FireResponsePhase;
  carriedWater: number;
}

export interface DisasterAffectedTile {
  x: number;
  y: number;
  originalTerrain: Terrain;
  depth?: number;
}

export interface PredatorThreat {
  kind: WildlifeKind;
  untilDay: number;
  size?: number;     // 저장 호환을 위해 선택값, 새 위협에는 실제 무리 규모를 기록한다
  strength?: number; // 편성 정보와 토벌 판정이 함께 참조하는 숨은 위협 전력
  tigerTier?: TigerTier; // 단독 호랑이 위협의 체급. 구버전 저장은 strength로 복원한다
  scouting?: {
    residentId: number;
    startedDay: number;
    completesOnDay: number;
    hunterSkill: number;
    usedGyrfalcon: boolean;
  };
  intel?: {
    precision: 'rough' | 'exact';
    revealedDay: number;
    source?: 'scout' | 'trade';
    scoutResidentId?: number;
    sourceFaction?: string;
    hunterSkill?: number;
    usedGyrfalcon?: boolean;
  };
}

interface PlagueCase {
  residentId: number;
  resolvesOnDay: number;
  real: boolean;
  isolated: boolean;
}

export interface EpidemicState {
  infectedIds: number[];
  /** 구 저장 호환용 고정 종료일. D7부터 종료 판정에는 사용하지 않는다. */
  untilDay: number;
  mode: 'pending' | 'isolated' | 'uncontained';
  startedDay?: number;
  quietDays?: number;
  newInfectionsToday?: number;
  totalInfected?: number;
  recoveredCount?: number;
  deathCount?: number;
  peakInfected?: number;
  quarantinedResidentIds?: number[];
  infectedSince?: Record<number, number>;
}

export type LivestockEpidemicGroup = 'ruminant' | 'pig' | 'chicken' | 'horse';

export interface LivestockEpidemicState {
  group: LivestockEpidemicGroup;
  infectedStableIds: number[];
  mode: 'pending' | 'isolated';
  startedDay: number;
  quietDays?: number;
  newInfectedStableIds?: number[];
  totalDeaths?: number;
  totalCulled?: number;
  recoveredStableIds?: number[];
  infectedSince?: Record<number, number>;
}

export interface IncidentState {
  year: number;
  scheduledDays: number[];
  resolutionCount: number;
  cooldownUntil: Partial<Record<SpecialEventId, number>>;
  predatorThreats: Partial<Record<WildlifeKind, PredatorThreat>>;
  plagueCase: PlagueCase | null;
  epidemic: EpidemicState | null;
  livestockEpidemic: LivestockEpidemicState | null;
}

// 조정 세공(歲貢) — 봄 첫날 그해 요구량이 공지되고, 겨울 첫날 사자가 거둬 간다
export interface CourtTribute {
  year: number;                               // 몇 년차 공물인지
  items: Partial<Record<ResourceId, number>>; // 요구 품목 (1~2종)
  dueDay: number;                             // 겨울 첫날 (수거일)
  resolved: boolean;                          // 올해분 처리 여부 (납부 또는 거절)
  paid: boolean;                              // 실제로 바쳤는지
}

// 정기거래 계약 — 협상이 성사된 조건을 연 단위로 잠근다.
// 체결한 계절의 첫날마다 자동 실행되며, 교환비는 만료까지 변하지 않는다.
export interface TradeContract {
  factionName: string;
  give: ResourceId; giveAmt: number;   // 매년 내주는 것
  get: ResourceId;  getAmt: number;    // 매년 받는 것
  executeSeason: Season;               // 체결한 계절 — 매년 이 계절 첫날 실행
  signedYear: number;
  durationYears: number;
  yearsExecuted: number;
  missedStreak: number;                // 연속 불이행 (2회면 파기)
  lastSettledYear: number;             // 그해 몫을 이행·부분이행·불이행으로 매듭지은 연도
}

export interface RaidBreach {
  buildingId: number;
  x: number;
  y: number;
}

export interface RaidRoutePlan {
  steps: Array<{ x: number; y: number }>;
  breaches: RaidBreach[];
  totalCost: number;
  kind: 'open' | 'assault';
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
  phase?: 'approaching' | 'breaching';
  route?: RaidRoutePlan;
  routeRevision?: number;
  routeTarget?: { x: number; y: number };
  breachTargetId?: number;
  towerTargetId?: number; // P4 피격 뒤 재표적한 망루
  towerReturnTarget?: { x: number; y: number }; // 망루 공격 뒤 돌아갈 원래 목표
  suppressedUntilTick?: number; // P4 피해 상한 뒤에도 남는 사격 억제
  speed: number;     // 서브틱당 이동 타일
  trail: { x: number; y: number }[]; // 지나온 자취 (눈밭 발자국 렌더링용)
}

export type ExpeditionKind = 'lairAssault' | 'predatorHunt';
type ExpeditionPhase = 'muster' | 'march' | 'engage' | 'return';
export type ExpeditionRaidOrder = 'return' | 'continue';

export interface Expedition {
  kind: ExpeditionKind;
  targetSiteId?: number;
  predatorKind?: PredatorKind;
  targetX: number;
  targetY: number;
  musterX: number;
  musterY: number;
  phase: ExpeditionPhase;
  memberIds: number[];
  x: number;
  y: number;
  px: number;
  py: number;
  path: { x: number; y: number }[];
  trail: { x: number; y: number }[];
  speed: number;
  ticks: number;
  carriedLoot?: Partial<Record<ResourceId, number>>;
  externalAid?: ExpeditionExternalAid;
}

interface RaidHoldState {
  power: number;
  faction: string;
  warned: boolean;
  siege: boolean;
  expeditionOrder: ExpeditionRaidOrder;
  ticksRemaining: number;
}

interface WatchtowerProjectile {
  id: number;
  towerId: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  ageTicks: number;
  durationTicks: number;
  bow: boolean;
}

type SiegePhase = 'evacuation' | 'encirclement' | 'wallCombat' | 'sortie' | 'withdrawal';
export type SiegeStance = 'hold' | 'wall' | 'field';
type SiegeWallEngagementMode = 'automatic' | 'manual';

/** P3 장기 공성. P2의 RaiderBand.siege와 원정대 대기용 RaidHoldState와는 별개다. */
export interface SiegeState {
  phase: SiegePhase;
  faction: string;
  raiderPower: number;
  enemySupply: number;
  enemySupplyEstimate: { min: number; max: number };
  intelLevel: number;
  warned: boolean;
  stance: SiegeStance;
  startedDay: number;
  lastProcessedDay: number;
  lastStanceChangeDay: number;
  evacuationDeadlineTick: number;
  defenderIds: number[];
  strandedResidentIds: number[];
  plunderTargetIds: number[];
  plunderedTargetIds: number[];
  activePlunderTargetId?: number;
  plunderPath: { x: number; y: number }[];
  loot: Partial<Record<ResourceId, number>>;
  protectedInterior: string[];
  topologyRevision: number;
  breachTargetId?: number;
  /** 같은 날 일일 성벽 압박과 직접 지휘가 중복 적용되지 않게 하는 처리 기록. */
  wallEngagement?: { day: number; mode: SiegeWallEngagementMode };
}

type BattlePhase = 'muster' | 'clash';
export type BattleOutcome = 'victory' | 'defeat';
// garrison: 수비병+파수꾼 요격 / levy: 성한 주민 전체 징집
export type BattleMode = 'garrison' | 'levy';
export type BattleLocation = 'outskirts' | 'village';

export interface Battle {
  phase: BattlePhase;
  mode: BattleMode;
  location?: BattleLocation; // 구버전 저장은 mode에서 복원
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

// 전투가 끝난 자리에 며칠간 남는 눈밭/땅 교란 자국 (연출 전용)
export interface BattleScar {
  x: number;
  y: number;
  until: number; // 이 날까지 자국이 남는다
}

type TacticalBattlePhase =
  | 'preparation'
  | 'preparationExecution'
  | 'deployment'
  | 'command'
  | 'simulating'
  | 'report'
  | 'finished';

export type TacticalZoneKind =
  | 'approach'
  | 'forest'
  | 'ford'
  | 'wall'
  | 'storehouse'
  | 'center';

export type DefenderGroupKind =
  | 'militia-spear'
  | 'militia-bow'
  | 'militia-musket'
  | 'militia-unarmed'
  | 'watchman'
  | 'hunter'
  | 'healer'
  | 'civilian';

export type RaiderGroupKind = 'main' | 'looters' | 'flankers';
export type TacticalFormationLine = 'front' | 'middle' | 'rear';
export type TacticalFlankPlan = 'breakthrough' | 'rearAssault';
export type EnemyObjectiveId = 'breakthrough' | 'plunder' | 'arson';
export type EnemyStratagemId = 'rearManeuver' | 'wallBreakers' | 'fireArrows' | 'feint' | 'nightApproach';
export type EnemyDoctrineId =
  | 'mountedSkirmish'
  | 'shockBreakthrough'
  | 'shieldedAdvance'
  | 'breachAndStorm'
  | 'missileSuppression'
  | 'fireSupport'
  | 'reserveCounterattack'
  | 'feignedRetreat';
export type TacticalEnemyFactionId = 'default' | 'nimacha' | 'holaon' | 'bandit' | 'court';
export type TacticalRouteSide = 'left' | 'right';
export type TacticalRouteIntel = 'unknown' | 'suspected' | 'revealed';
type TacticalRouteControl = 'neutral' | 'defender' | 'raider' | 'contested';
export type TacticalRouteTerrain = 'woodedRidge' | 'riverBank';
export type TacticalRouteNode = 'approachGate' | 'middle' | 'storehouseGate';
type TacticalRoutePurpose = 'block' | 'move' | 'flank' | 'return' | 'transfer';

export type TacticalStageId =
  | { kind: 'zone'; zoneId: string }
  | { kind: 'route'; routeId: string };

export type TacticalStageDestination =
  | { kind: 'zoneLane'; zoneId: string; line: TacticalFormationLine }
  | { kind: 'routeNode'; routeId: string; node: TacticalRouteNode };

type TacticalStageMoveEffect =
  | 'none'
  | 'redeploy'
  | 'advance'
  | 'fallback'
  | 'routeEntry'
  | 'block'
  | 'rearRaid'
  | 'return'
  | 'zoneTransfer';

export interface TacticalStageMovePreview {
  groupId: string;
  origin: TacticalStageDestination;
  destination: TacticalStageDestination;
  command: TacticalCommandId | null;
  purpose: TacticalRoutePurpose | null;
  effect: TacticalStageMoveEffect;
  powerPenalty: number;
  travelRounds: number;
  leavesFrontalBattle: boolean;
  warning?: string;
}

export interface TacticalFlankRoute {
  id: string;
  side: TacticalRouteSide;
  label: string;
  terrain: TacticalRouteTerrain;
  approachZoneId: 'approach';
  interiorZoneId: 'storehouse';
  openedByDefender: boolean;
  openedByRaider: boolean;
  defenderIntel: TacticalRouteIntel;
  control: TacticalRouteControl;
}

export interface TacticalRouteTransit {
  routeId: string;
  purpose: TacticalRoutePurpose;
  /** 물리 위치의 단일 표시 계약. step은 구버전 저장·라운드 판정 호환용이다. */
  node: TacticalRouteNode;
  /** 현재 명령이 끝나는 물리 노드. node와 같아도 출구 합류 명령이면 1라운드를 소비한다. */
  destinationNode: TacticalRouteNode;
  /** @deprecated TacticalRouteNode로 이관 중인 구형 진행도. */
  step: 0 | 1 | 2;
  destinationZoneId: string;
  destinationLine: TacticalFormationLine;
  originZoneId: string;
  /** 정상 명령으로 되돌아갈 출입구 구역. originZoneId는 경로 교전 패배 시 강제 퇴각 원점을 보존한다. */
  returnZoneId?: string;
  visibleToDefender: boolean;
  startedRound: number;
  elapsedRounds: number;
  roundsRequired: number;
  engagements: number;
}

export interface TacticalRouteAdvance {
  groupId: string;
  routeId: string;
  fromStep: 0 | 1 | 2;
  toStep: 0 | 1 | 2;
  visibleToDefender: boolean;
  arrivedAtExit: boolean;
}

export interface TacticalRouteEngagement {
  routeId: string;
  defenderGroupIds: string[];
  raiderGroupIds: string[];
  outcome: 'defenderHeld' | 'raiderBreakthrough' | 'contested';
  defenderLosses: number;
  raiderLosses: number;
  defenderRetreated: boolean;
  raiderRetreated: boolean;
  lines: string[];
}

export interface TacticalRouteArrival {
  routeId: string;
  groupId: string;
  side: 'defender' | 'raider';
  destinationZoneId: string;
  rearAssault: boolean;
}
type TacticalUnitTag =
  | 'infantry'
  | 'mounted'
  | 'ranged'
  | 'firearm'
  | 'shock'
  | 'antiMounted'
  | 'shielded'
  | 'siege'
  | 'artillery'
  | 'indirectFire'
  | 'support'
  | 'scout';
export type TacticalUnitArchetype =
  | 'lightCavalry'
  | 'horseArcher'
  | 'lancerCavalry'
  | 'spearInfantry'
  | 'shieldInfantry'
  | 'footArcher'
  | 'musketeer'
  | 'meleeInfantry'
  | 'looterInfantry'
  | 'wallBreaker'
  | 'directArtillery'
  | 'indirectArtillery'
  | 'medic';
export type TacticalAiState =
  | 'forming'
  | 'probing'
  | 'engaging'
  | 'withdrawing'
  | 'committingReserve'
  | 'routeTransit'
  | 'routeEngagement'
  | 'exiting';

export interface EnemyCounterBreakdown {
  intelligence: number;
  preparation: number;
  formation: number;
}

export interface EnemyStratagemState {
  id: EnemyStratagemId;
  revealed: boolean;
  counterLevel: 0 | 1 | 2;
  counter?: Partial<EnemyCounterBreakdown>;
}

export interface EnemyPlan {
  objective: EnemyObjectiveId;
  objectiveRevealed: boolean;
  doctrine?: EnemyDoctrineId;
  doctrineRevealed?: boolean;
  compositionTemplateId?: string;
  compositionRevealed?: boolean;
  flankRouteSide?: TacticalRouteSide;
  stratagemPoints: number;
  intelLevel?: 0 | 1 | 2 | 3 | 4;
  stratagems: EnemyStratagemState[];
}

export type RaiderUnitType =
  | 'nimacha-hunter'
  | 'nimacha-spearman'
  | 'nimacha-looter'
  | 'holaon-lancer'
  | 'holaon-horse-archer'
  | 'holaon-raider'
  | 'bandit-vanguard'
  | 'bandit-rider'
  | 'bandit-looter'
  | 'court-gunner'
  | 'court-archer'
  | 'court-melee'
  | 'court-cavalry'
  | 'court-artillery'
  | 'shield-infantry'
  | 'deserter-musketeer'
  | 'wall-breaker'
  | 'court-shield'
  | 'court-horse-archer'
  | 'court-medic'
  | 'court-hwacha';

export interface TacticalUnitProfile {
  id: RaiderUnitType;
  label: string;
  archetype: TacticalUnitArchetype;
  tags: readonly TacticalUnitTag[];
  factions: readonly TacticalEnemyFactionId[];
  intelCategory: string;
  defaultLine: TacticalFormationLine;
  rangedMultiplier: number;
  meleeMultiplier: number;
  chargeMultiplier: number;
  protectionMultiplier: number;
  mobility: 1 | 2 | 3;
  wallPressure: number;
  routeSpeed: 1 | 2;
  targetPriorities: readonly TacticalUnitTag[];
  implementationPhase: 1 | 2 | 8;
  enabled: boolean;
}

interface TacticalCompositionCandidate {
  unitType: RaiderUnitType;
  weight: number;
}

export interface TacticalCompositionSlot {
  role: RaiderGroupKind;
  candidates: readonly TacticalCompositionCandidate[];
  powerShare: readonly [min: number, max: number];
  required?: boolean;
  minThreat?: number;
}

export interface TacticalCompositionTemplate {
  id: string;
  label: string;
  faction: TacticalEnemyFactionId;
  doctrines: readonly EnemyDoctrineId[];
  objectives: readonly EnemyObjectiveId[];
  weight: number;
  slots: readonly TacticalCompositionSlot[];
  implementationPhase: 1 | 2 | 8;
}

export type TacticalCommandId =
  | 'hold'
  | 'attack'
  | 'volley'
  | 'ambush'
  | 'guardStorehouse'
  | 'protectCivilians'
  | 'redeploy'
  | 'reinforceRear'
  | 'fallback'
  | 'advance'
  | 'charge'
  | 'arson'
  | 'blockEscape'
  | 'openRetreat'
  | 'flankRoute';

export type TacticalAmbushAftermath = 'fallback' | 'hold';

export type TacticalFacing = 'towardEnemy' | 'towardRear';

export type PreparationActionId =
  | 'evacuateCivilians'
  | 'hideSupplies'
  | 'repairWall'
  | 'setAmbush'
  | 'prepareVolley'
  | 'firePrevention'
  | 'torchWatch'
  | 'preliminaryBombardment'
  | 'musterMilitia'
  | 'openFlankRoute'
  | 'nightAssault'
  | 'preInfiltration'
  | 'prepareFireArrows'
  | 'blockLeaderEscape'
  | 'lureGuards'
  | 'setHuntTraps'
  | 'placeBait'
  | 'splitDrivers';

export interface TacticalBattleZone {
  id: string;
  name: string;
  kind: TacticalZoneKind;
  order: number;
  pressure: number;
  breached: boolean;
  defenseBonus: number;
  ambushBonus: number;
  lootRisk: number;
  civilianRisk: number;
  description: string;
  /** P5 성벽전에서 지도 돌파 지점의 구조물 상태를 전투 시작 시 고정한 단면 스냅샷. */
  wallSection?: TacticalWallSection;
  sectorBlockade?: number;
  focusTargetGroupId?: string;
  focusTargetSource?: 'auto' | 'player';
}

interface TacticalWallSection {
  buildingId: number;
  wallType: SolidWallBuildingTypeId;
  integrity: number;
  integrityMax: number;
  gate: boolean;
  watchtowerIds: number[];
  stationedWatchmanIds: number[];
  bowWatchmanIds: number[];
}

export interface TacticalFeaturedResident {
  residentId: number;
  special: SpecialResidentId;
  name: string;
  shortName: string;
  traitLabel: string;
  spriteScale: number;
  origin?: string;
}

export interface TacticalDeploymentPlacement {
  zoneId: string;
  line: TacticalFormationLine;
  routeId?: string;
  hidden?: boolean;
  fixed?: boolean;
}

export interface TacticalDefenderGroup {
  id: string;
  kind: DefenderGroupKind;
  role: CombatRole;
  special?: SpecialResidentId;
  origin?: string;
  mount?: MountId;
  weapon: CombatWeaponId | null;
  artifactWeapon?: ArtifactWeaponId;
  readyMuskets?: number;
  label: string;
  baseLabel?: string;
  featuredResidents?: TacticalFeaturedResident[];
  featuredDetachment?: boolean;
  deploymentCohortId?: string;
  residentIds: number[];
  externalAidFactionName?: string;
  count: number;
  zoneId: string;
  command: TacticalCommandId | null;
  commandSource?: 'recommended' | 'player';
  power: number;
  wounded: number;
  killed: number;
  line: TacticalFormationLine;
  pendingLine?: TacticalFormationLine;
  /** 의미 기반 현재 방향. 화면의 좌우는 전투 orientation에서 파생한다. */
  facing: TacticalFacing;
  /** 값이 있으면 이번 라운드에 방향을 바꿨으며, facing과 같은 새 방향을 가리킨다. */
  pendingFacing?: TacticalFacing;
  targetGroupId?: string;
  targetSource?: 'auto' | 'player';
  ambushed?: boolean;
  /** 급습 공격 뒤 자동 이탈할지 현재 위치를 지킬지 정한다. 미지정 시 기존처럼 자동 이탈한다. */
  ambushAftermath?: TacticalAmbushAftermath;
  commandable?: boolean;
  lockedZoneId?: string;
  huntOriginGroupId?: string;
  huntMovedRound?: number;
  /** 이 교전에 적 후방에 도착했으며, 다른 구역으로 이동할 때까지 적 후방 위치를 유지한다. */
  rearRaidRound?: number;
  routeTransit?: TacticalRouteTransit;
}

export interface TacticalRaiderGroup {
  id: string;
  kind: RaiderGroupKind;
  unitType?: RaiderUnitType;
  label: string;
  zoneId: string;
  line: TacticalFormationLine;
  pendingZoneId?: string;
  targetGroupId?: string;
  targetSource?: 'ai';
  targetZoneId: string;
  power: number;
  /** Power at deployment, used as the hard ceiling for non-fatal support recovery. */
  maximumPower?: number;
  estimatedPower?: number;
  count: number;
  killed: number;
  morale: number;
  intent: 'advance' | 'loot' | 'flank' | 'breakWall' | 'defend' | 'escape' | 'withdraw';
  aiState?: TacticalAiState;
  aiStateChangedRound?: number;
  intentLockedUntilRound?: number;
  revealed: boolean;
  confused?: boolean;
  combatMultiplier?: number;
  lossResistance?: number;
  wallPressureBonus?: number;
  engagementsInZone: number;
  flankPlan?: TacticalFlankPlan;
  flankPlanRevealed?: boolean;
  rearAssault?: boolean;
  beastKind?: PredatorKind;
  tigerTier?: TigerTier;
  leader?: boolean;
  routeTransit?: TacticalRouteTransit;
  supportState?: TacticalRaiderSupportState;
}

export type TacticalRaiderSupportKind = 'directArtillery' | 'hwacha' | 'medic';

export interface TacticalRaiderSupportState {
  kind: TacticalRaiderSupportKind;
  shotsRemaining: number;
  readyOnRound: number;
  facingZoneId: string;
  firing?: boolean;
  lastFiredRound?: number;
  totalRestored?: number;
}

export interface TacticalPreparationEffect {
  id: PreparationActionId;
  label: string;
  cost: number;
  selected: boolean;
  applied: boolean;
}

export type TacticalAnimationEventKind =
    | 'camera'
    | 'bombardment'
    | 'fortify'
    | 'prepareAmbush'
    | 'readyVolley'
    | 'muster'
    | 'evacuate'
    | 'conceal'
    | 'zoneFall'
    | 'artilleryHit'
    | 'hwachaVolley'
    | 'supportReload'
    | 'enemyTreatment'
    | 'rearAssault'
    | 'advance'
    | 'ambush'
    | 'volley'
    | 'melee'
    | 'wallAssault'
    | 'wallHit'
    | 'loot'
    | 'retreat'
    | 'fire'
    | 'leaderEscape'
    | 'escapeBlocked'
    | 'beastReveal'
    | 'beastAmbush'
    | 'beastRout'
    | 'casualty'
    | 'moraleBreak'
    | 'doctrineShift'
    | 'report';

export interface TacticalAnimationEvent {
  zoneId: string;
  /** 우회로 전용 교전이면 재생 카메라가 포커스할 실제 경로 */
  routeId?: string;
  /** 우회로 전용 교전의 물리 노드 — 구버전 저장에는 없을 수 있다 */
  routeNode?: TacticalRouteNode;
  kind: TacticalAnimationEventKind;
  text?: string;
  durationMs: number;
  // 연출 보강용 부가 정보 (구버전 저장에는 없을 수 있어 전부 선택)
  side?: 'defender' | 'raider';
  direction?: 'frontal' | 'rear';
  groupId?: string;      // 피해를 입은 그룹 — 화면에서 해당 스프라이트를 쓰러뜨린다
  actorGroupIds?: string[]; // 이 이벤트에서 실제로 전진하거나 공격 동작을 하는 그룹
  casualties?: number;   // 이 이벤트로 쓰러지는 인원(전사+부상)
  wounded?: number;      // 재생 중 부상자가 생기는 시점을 복원하기 위한 세부 수치
  killed?: number;       // 재생 중 전사자가 생기는 시점을 복원하기 위한 세부 수치
  float?: string;        // 랭크 위로 떠오르는 짧은 전황 텍스트
  meleeParticipants?: number;
  shots?: {
    arrows?: number;
    muskets?: number;
    cannons?: number;
    rockets?: number;
  };
}

export interface TacticalRoundReport {
  round: number;
  focusZoneId: string;
  nextFocusZoneId: string;
  summary: string;
  lines: string[];
  events: TacticalAnimationEvent[];
  routeAdvances?: TacticalRouteAdvance[];
  routeEngagements?: TacticalRouteEngagement[];
  routeArrivals?: TacticalRouteArrival[];
  wounded: number;
  treated?: number;
  raiderPowerRestored?: number;
  killed: number;
  raidersKilled: number;
  loot: Partial<Record<ResourceId, number>>;
  buildingsDamaged: number;
  villageMoraleDelta: number;
  raiderMoraleDelta: number;
  positionsApplied?: boolean;
  ended?: boolean;
  stageTransition?: 'villageDefense';
  outcome?:
    | 'defenseSuccess'
    | 'partialLoss'
    | 'raidersLooted'
    | 'villageRouted'
    | 'negotiated'
    | 'assaultVictory'
    | 'assaultRaid'
    | 'assaultAbandoned'
    | 'assaultDefeat'
    | 'assaultWithdrawal'
    | 'huntKill'
    | 'huntRepelled'
    | 'huntEscaped'
    | 'huntDefeat';
}

export interface TacticalBattlePersonReport {
  residentId: number;
  name: string;
  groupLabel: string;
  healthAfter: number;
}

export type TacticalBattleGrade =
  | 'greatVictory'
  | 'victory'
  | 'narrowVictory'
  | 'narrowDefeat'
  | 'defeat'
  | 'crushingDefeat';

export type TacticalBattleFlankOutcome =
  | 'unused'
  | 'defenderHeld'
  | 'raiderReachedRear'
  | 'defenderReachedRear'
  | 'contested';

interface TacticalBattleFlankRouteReport {
  routeId: string;
  side: TacticalRouteSide;
  label: string;
  finalControl: TacticalRouteControl;
  outcome: TacticalBattleFlankOutcome;
  engagements: number;
  defenderHolds: number;
  raiderBreakthroughs: number;
  contestedEngagements: number;
  defenderArrivals: number;
  raiderArrivals: number;
  summary: string;
}

export interface TacticalBattleTacticsReport {
  objectiveId?: EnemyObjectiveId;
  objectiveLabel: string;
  objectiveAchieved?: boolean;
  doctrineId?: EnemyDoctrineId;
  doctrineLabel: string;
  compositionTemplateId?: string;
  compositionLabel: string;
  flankRoutes: TacticalBattleFlankRouteReport[];
}

export interface TacticalBattleReport {
  encounterKind: 'raidDefense' | 'banditLair' | 'predatorHunt';
  title: string;
  friendlyLabel: string;
  enemyLabel: string;
  battleId: number;
  date: string;
  factionName: string;
  mode: BattleMode;
  warned: boolean;
  outcome: NonNullable<TacticalRoundReport['outcome']>;
  outcomeLabel: string;
  result: 'victory' | 'defeat';
  grade: TacticalBattleGrade;
  gradeScore: number;
  closingSummary: string;
  initialFriendlyPower: number;
  initialEnemyPower: number;
  rounds: number;
  villageMorale: number;
  raiderMorale: number;
  defendersCommitted: number;
  defendersSurvived: number;
  killed: TacticalBattlePersonReport[];
  wounded: TacticalBattlePersonReport[];
  raidersCommitted: number;
  raidersKilled: number;
  raidersEscaped: number;
  damagedBuildings: BuildingTypeId[];
  loot: Partial<Record<ResourceId, number>>;
  recoveredLoot: Partial<Record<ResourceId, number>>;
  enemyRouted?: boolean;
  reputationDelta: number;
  relationDelta: number;
  threatAfter: number;
  highlights: string[];
  resourceDelta: Partial<Record<ResourceId, number>>;
  tactics?: TacticalBattleTacticsReport;
  siteOutcome?: 'burned' | 'abandoned' | 'fortified' | 'unchanged';
  predatorOutcome?: 'killed' | 'repelled' | 'escaped' | 'huntersDefeated' | 'withdrawn';
  externalAid?: ExpeditionExternalAid;
}

export interface TacticalBattle {
  encounterKind: 'raidDefense' | 'banditLair' | 'predatorHunt';
  id: number;
  factionName: string;
  warned: boolean;
  siege: boolean;
  originalPower: number;
  initialFriendlyPower: number;
  initialEnemyPower: number;
  phase: TacticalBattlePhase;
  round: number;
  prepPoints: number;
  prepActions: TacticalPreparationEffect[];
  preparationEvents: TacticalAnimationEvent[];
  zones: TacticalBattleZone[];
  flankRoutes?: TacticalFlankRoute[];
  defenderGroups: TacticalDefenderGroup[];
  deploymentPlacements?: Record<string, TacticalDeploymentPlacement | null>;
  deploymentSerial?: number;
  deploymentGroupAliases?: Record<string, string>;
  deploymentForced?: 'nightAmbush';
  raiderGroups: TacticalRaiderGroup[];
  enemyPlan?: EnemyPlan;
  enemyPlanDeploymentApplied?: boolean;
  currentZoneId: string;
  villageMorale: number;
  raiderMorale: number;
  reports: TacticalRoundReport[];
  pendingReport: TacticalRoundReport | null;
  mode: BattleMode;
  /** P5 장기 공성 수동전의 현재 무대. 일반 습격 방어전에는 없다. */
  defenseStage?: 'wallBreach' | 'villageDefense';
  wallStageRoundLimit?: number;
  villageStageStartRound?: number;
  orientation?: 'defense' | 'assault';
  assaultKind?: 'banditLair' | 'predatorHunt';
  assaultTargetSiteId?: number;
  lairDefensePlan?: BanditLairDefensePlan;
  lairLootPreRemoved?: number;
  leaderEscapeBlocked?: boolean;
  leaderEscaped?: boolean;
  assaultFireDamage?: number;
  huntPredatorKind?: PredatorKind;
  huntTigerTier?: TigerTier;
  huntPredatorState?: 'hidden' | 'revealed' | 'wounded' | 'fled';
  huntEncirclement?: number;
  huntEngagements?: number;
  huntDriversSplit?: boolean;
  huntTrapSet?: boolean;
  huntBaitPlaced?: boolean;
  huntBaitZoneId?: string;
  huntTrapZoneId?: string;
  huntLeaderKilled?: boolean;
  huntWithdrawn?: boolean;
  huntDetachmentSerial?: number;
  huntOpenSectorRounds?: Record<string, number>;
  huntBlockadeHistory?: Array<{
    round: number;
    sectors: Record<string, number>;
  }>;
  huntEscapeCause?: 'openSector' | 'breakout' | 'timeout' | 'withdrawn';
  huntEscapeZoneId?: string;
  huntCornered?: boolean;
  huntLastBeastAction?: {
    kind: 'lurk' | 'ambush' | 'breakout' | 'cornered';
    sectorId?: string;
    targetGroupId?: string;
  };
  huntLastBeastActions?: Array<{
    kind: 'lurk' | 'ambush' | 'breakout' | 'cornered';
    sectorId?: string;
    targetGroupId?: string;
  }>;
  huntCounterattackCount?: number;
  preliminaryBombardmentCannons?: number;
  preliminaryBombardmentChongtongs?: number;
  preliminaryBombardmentCasualties?: number;
  resourceSnapshot?: Partial<Record<ResourceId, number>>;
}

export interface AlertItem {
  id: string;
  text: string;
  level: 'warn' | 'danger';
}

interface GameOverState {
  won: boolean;
  reason: string;
}

type DeathCauseId = 'combat' | 'starvation' | 'cold' | 'disease' | 'other';

// 절목(節目) — 중심지에서 반포하는 시행 세칙. 개별 항목은 「~령(令)」.
// 계획: docs/DESIGN-2026-07-23-edict-system.md
export type EdictId =
  | 'ration'
  | 'fuelRation'
  | 'immigration'
  | 'fireCode'
  | 'curfew'
  | 'elderCare'
  | 'corvee';
export type EdictLevel = 'tight' | 'normal' | 'generous'; // 령마다 유효 단계가 다르다

export interface EdictState {
  level: EdictLevel;
  sinceDay: number;   // 조령모개 판정·"n일째 시행" 표기
}

export type FactionLeaderTemper = 'bold' | 'wily' | 'taciturn' | 'fierce';

export interface FactionLeader {
  name: string;
  title: '족장' | '추장';
  temper: FactionLeaderTemper;
}

export type BorderCommanderTemper = 'strict' | 'greedy' | 'lenient' | 'tactician';

export interface BorderCommander {
  name: string;
  temper: BorderCommanderTemper;
  termIndex: number;
  // F2 온건 성향의 세공 유예가 같은 임기에 반복되지 않게 하는 자리.
  tributeLeniencyUsed: boolean;
}

export interface GameState {
  schemaVersion: number;
  day: number;          // 경과 일수 (1부터)
  subTick: number;      // 하루 안의 서브틱 (0 ~ SUBTICKS-1)
  difficulty: Difficulty;
  worldSetup: WorldSetupSnapshot;
  seed: number;
  weather: WeatherId;
  map: Tile[][];
  aquiferLevels: number[]; // 결정적 수맥별 현재 수위. 기하는 seed에서 재계산
  oreVeinRemaining: number[]; // 결정적 지하 광맥별 남은 매장량
  exploration: ExplorationState;
  habitats: AnimalHabitat[];
  fishingGrounds: FishingGroundState[];
  fishingBoats: FishingBoatState[];
  nextFishingBoatId: number;
  foreignSites: ForeignSite[];
  claimZones: ClaimZone[];
  nextForeignSiteId: number;
  nextClaimZoneId: number;
  territoryViolations: TerritoryViolation[];
  residents: Resident[];
  buildings: Building[];
  defenseTopologyRevision: number; // 성벽·성목 등 침입 경로 비용 지형의 변경 번호
  priorityBuildingId?: number | null; // 건설·수리·확장·해체·이전 중 최우선 작업
  nextBuildingId: number;
  nextResidentId: number;
  resources: Record<ResourceId, number>;
  spoilageStockAtDayStart?: Partial<Record<ResourceId, number>>; // 당일 입고분 부패 유예용 하루 시작 재고
  unlockedLivestock: LivestockId[];
  weaponAssignments: Partial<Record<number, CombatWeaponId>>; // 주민별 전투 무기. 없으면 비무장
  mountAssignments: Partial<Record<number, MountId>>; // 무기와 별도인 주민별 탑승 군마
  weaponAllocationMode: WeaponAllocationMode; // 자동 배분을 유지할지 플레이어 배정을 고정할지
  processingReserves: Record<ProcessingInputId, number>; // 자동 가공/소비 전에 남길 원자재 수량
  threat: number;         // 습격 위협도 0~100
  relations: Record<string, number>; // 세력별 우호도 0~100 (키: 세력 이름)
  factionLeaders: Record<string, FactionLeader>; // 5개 여진 세력의 결정적 지도자
  borderCommander: BorderCommander; // 현 함경북도 병마절도사
  diplomaticPacts: DiplomaticPact[]; // 화친 맹약(E2) — E1에서 저장 자리를 먼저 만든다
  claimAccords: ClaimAccord[]; // 생활권 협정(E5)
  pendingEnvoys: PendingEnvoy[]; // 예물·맹약·생활권 협정·원병 사절 왕복 상태
  militaryAid: ReadyMilitaryAid | null; // 목표 산채 원정에 합류할 외부 원병
  warDispatch: WarDispatch | null; // 부족 전쟁에 파견되어 마을을 비운 민병
  lastWarParticipationOfferYear: number;
  giftEnvoyDays: Record<string, number[]>; // 세력별 예물 발송일 — 계절 제한·연차 반감용
  proximityWarnings: string[]; // 세력×사유 경고 dedupe(E4)
  proximityWarningProgress: Record<string, number>; // E4 완충 작업·거점 배회의 누적 일수
  expedition: Expedition | null; // 지도 위 토벌 원정대. 동시에 하나만 운용
  raidHold: RaidHoldState | null; // 원정대 귀환을 기다리는 완전 수성 상태
  siegeState: SiegeState | null; // P3 하루 단위 장기 공성 상태
  raiders: RaiderBand | null; // 접근 중인 습격 무리
  watchtowerProjectiles: WatchtowerProjectile[]; // P4 오버월드 화살 궤적
  nextWatchtowerProjectileId: number;
  battle: Battle | null;      // 지도 위에서 진행 중인 습격 전투
  battleScars?: BattleScar[]; // 끝난 전투 자리의 교란 자국 (구버전 저장에는 없음)
  tacticalBattle: TacticalBattle | null; // 직접 지휘하는 두루마리형 습격 전투
  tacticalBattleReport: TacticalBattleReport | null; // 전투 종료 뒤 확인하는 상세 장계
  raidCooldown: number;     // 습격 후 유예 기간
  tradeRefusedDays: number; // 최근 교역 거절 여파 남은 일수
  lastTradeDay: number;     // 마지막 교역 제안이 온 날
  lastTradeByFaction: Record<string, number>; // 세력별 마지막 플레이어 주도 교역일 (쿨다운용)
  tradeCapacitySeason: number; // 교역 물동량 사용량이 속한 계절 번호
  tradeCapacityUsed: Record<string, Partial<Record<ResourceId, number>>>; // 세력별 이번 계절 출고량
  lastImmigrationDay: number; // 마지막 이주민 수용 여부 선택지가 열린 날
  lastKimjangYear: number;    // 마지막으로 김장 규모를 결정한 연도 (0이면 아직 없음)
  incidents: IncidentState;    // 연간 돌발 사건 일정과 지속 중인 맹수 위험
  pendingDisasters: PendingDisaster[]; // 선택 뒤 실제 날씨·일일 진행으로 판정하는 재해
  lastSpringFloodYear?: number; // 같은 봄에 대홍수가 거듭 발생하지 않게 하는 연차 표식
  lastSnowDamageYear?: number; // 같은 겨울의 설해를 한 번만 판정하는 연차 표식
  specialItems: Record<SpecialItemId, number>; // 산삼·호피 등 일반 자원과 분리한 기물함
  discoveredSpecialItems: SpecialItemId[];     // 소모해도 남는 기물 도감
  courtGrantArtifactMisses: number;            // 적격 격년 하사품에서 연속으로 기물을 놓친 횟수
  royalPlaqueBuildingId: number | null;        // 사액 현판이 영구 귀속된 건물 (후속 설치 전에는 null)
  artifactWeaponAssignments: Partial<Record<ArtifactWeaponId, number | null>>; // 고유 무기별 장착 주민
  tributeWaivers: number;      // 산삼 진상으로 얻은 세공 면제 횟수
  // ── 생애 주기·장례 (구버전 저장에는 없음) ──
  corpses?: Corpse[];          // 매장 대기 시신
  nextCorpseId?: number;
  // ── 만족도·종교·특수 주민 (구버전 저장에는 없음) ──
  moraleFactors?: MoraleFactor[];   // 어제 계산된 민심 내역 (UI 표시용 스냅숏)
  lastFermentMealDay?: number;      // 마지막으로 밥상에 장·김치가 오른 날
  promotionCheerUntil?: number;     // 승격 직후 완충 버프 종료일
  expectationTransitionUntil?: number; // 만족도 도입 이전 고티어 저장의 새 기대 적응 종료일
  expectationTransitionNotified?: boolean; // 적응 안내 중요 로그를 이미 남겼는지
  unlockedReligions?: ReligionId[]; // 네임드가 와서 해금된 신앙 갈래
  religionOfferCooldownUntil?: number; // 다음 종교인 등장 가능일
  spentSpecialIds?: SpecialResidentId[]; // 이미 등장한 네임드 (게임당 1회)
  specialResidentRecords?: Partial<Record<SpecialResidentId, SpecialResidentRecord>>; // 안치·합류·이탈 상태
  scenario?: ScenarioState | null;  // 튜토리얼 등 스크립트 시나리오 (없으면 일반 모드)
  tutorialGraduate?: boolean;       // 길잡이를 완주하고 이어 가는 게임 (첫 세공 품목 고정에 쓴다)
  // 개발용 치트 패널로 상태를 건드린 게임. 밸런스 관찰·버그 리포트에서 오염 세이브를
  // 가려내는 표식일 뿐 게임플레이 불이익은 없다. (없으면 false — 구 저장 마이그레이션 불요)
  debugTouched?: boolean;
  guides?: GuideState;              // 초회 도움말 (구버전 저장에는 없음 = 끈 상태로 보정)
  guideCards?: GuideCardEntry[];    // 지금 떠 있는 비차단 길잡이 카드
  guideModalQueue?: string[];       // 모달 형식 길잡이 대기열 (다른 모달과 겹치지 않게 미룬다)
  // ── 은맥 (게임당 1회 — 채광 중 발견 사건으로만 등장) ──
  silverVein?: SilverVeinState | null; // 구버전 저장에는 없음
  silverPityDays?: number;     // 발견 전 누적 채광일 (보장 발동용)
  lastRockMiningDay?: number;  // 마지막으로 바위/철광을 캔 날 (은맥 판정 트리거)
  lastRockMiningTile?: { x: number; y: number }; // 그날 캐던 광상 위치
  pendingChoice: PendingChoice | null;
  courtTribute: CourtTribute | null;  // 올해 세공 (봄 공지 때 설정)
  tributeAnnouncementPendingYear?: number; // 다른 사건 창에 막힌 세공 파발 공지를 다시 띄울 연차
  tributeReserve: Partial<Record<ResourceId, number>>; // 올해 세공용으로 잠근 중심지 재고
  tradeContracts: TradeContract[];    // 세력·상단과의 연 단위 정기거래 계약
  tradeContractReserve: Partial<Record<ResourceId, number>>; // 계약 이행용으로 잠근 중심지 재고
  tributeFailStreak: number;          // 연속 미납 횟수 (2년 연속이면 명성 하락 가중)
  tributePaidStreak: number;          // 연속 납부 년수 (승격 조건의 "공물 성실도")
  rank: Rank;                         // 현재 승격 단계
  pendingPromotionNotice: Rank | null; // 중심지 업그레이드 뒤 표시할 승격·해금 안내
  lastPetitionDay: number;            // 마지막 청원 승인일 (계절당 1회 쿨다운)
  cannonsGranted: number;             // 조정이 하사한 불랑기포 수 (배치 가능 상한)
  // ── 모반 의심 (화약 자급/월경 교역/북방 유착이 조정의 눈총을 산다) ──
  suspicion: number;                  // 0~100
  // ── 절목 (구버전 저장에는 없음 = 전부 평시) ──
  edicts?: Partial<Record<EdictId, EdictState>>;
  edictWhiplashUntil?: number;        // 조령모개 민심 페널티 종료일
  nitrePaused: boolean;               // 염초장 가동 중지 토글 (플레이어)
  nitreHiddenUntil: number;           // 감찰 은닉: 이 날까지 염초장이 멈춘다
  initiatedTradeDays: number[];       // 최근 플레이어 주도 교역 성사일 (월경 교역 혐의)
  inspectionCooldownUntil: number;    // 다음 감찰 어사가 올 수 있는 날
  censured: boolean;                  // 현 의심 고조 구간에서 견책을 이미 받았는지
  crackdownDeadline: number;          // 토벌 유예 마감일 (0이면 없음)
  log: LogEntry[];
  // 연대기 — docs/DESIGN-2026-07-29-chronicle-screen.md
  settlementName: string;
  pendingSettlementRename: PendingSettlementRename | null;
  settlementRenameCooldownUntil: number; // 이 날까지 재개칭 불가 (0 = 제한 없음)
  annals: AnnalsEntry[];
  lifetimeStats: LifetimeStats;
  yearlySnapshots: YearlySnapshot[];
  totalDeaths: number;
  starvationDeathsThisYear: number;
  winterStartPop: number;
  winterDeaths: number;
  lastWinterDeathRate: number; // 직전 겨울 사망률
  badWinterStreak: number;     // 겨울 직후 인구 5명 미만 연속 횟수
  gameOver: GameOverState | null;
  lastDeathCause?: DeathCauseId; // 구버전 저장에는 없을 수 있음
  victoryProgressNote: string;
}
