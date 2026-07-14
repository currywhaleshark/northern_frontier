// 게임 전역 타입 정의
import type { CombatRole } from './combatRoster';

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
  | 'woodSplitter' // 장작꾼
  | 'hunter'     // 사냥꾼
  | 'farmer'     // 농부
  | 'miller'     // 방아꾼
  | 'builder'    // 건축가
  | 'hauler'     // 운반꾼
  | 'herbalist'  // 약초꾼
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
  | 'militia';   // 수비병 (내부 id는 저장 호환을 위해 유지)

export type CombatWeaponId = 'musket' | 'hornBow' | 'spear';
export type WeaponAllocationMode = 'auto' | 'manual';

export type ResourceId =
  | 'grain'      // 먹을 수 있는 곡물(밭 수확물 + 도정한 벼)
  | 'rice'       // 논에서 수확한 도정 전 벼
  | 'meat'       // 고기
  | 'fish'       // 생선
  | 'vegetables' // 채소
  | 'brushwood'  // 땔나무
  | 'firewood'   // 장작
  | 'charcoal'   // 숯
  | 'wood'       // 목재
  | 'stone'      // 돌
  | 'iron'       // 철
  | 'tools'      // 도구
  | 'carts'      // 운반꾼이 장비하는 수레
  | 'hide'       // 가죽
  | 'hideClothes' // 가죽옷
  | 'cotton'     // 목화
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
  | 'reputation' // 명성
  | 'defense';   // 방어도

export type SmithyProductId = 'tools' | 'carts' | 'spears' | 'hornBows' | 'muskets';

export type CropId = 'millet' | 'sorghum' | 'buckwheat' | 'barley' | 'rice' | 'vegetables' | 'cotton';

export type ProcessingInputId = 'wood' | 'rice' | 'hide' | 'iron';

export type BuildingTypeId =
  | 'center'     // 마을 중심지
  | 'hut'        // 초가집
  | 'ondol'      // 온돌집
  | 'tileHouse'  // 기와집
  | 'storehouse' // 창고
  | 'bridge'     // 다리
  | 'lumberCamp' // 벌목장
  | 'woodShed'   // 장작마당
  | 'huntLodge'  // 사냥막
  | 'herbHut'    // 약초막
  | 'mine'       // 채광장
  | 'ferry'      // 나루터
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
  | 'cannonEmplacement'; // 불랑기포대 (부 승격 후 조정 청원으로만 배치)

export interface Tile {
  x: number;
  y: number;
  terrain: Terrain;
  hasIron: boolean;       // rock 타일 중 철광 여부
  mineralRemaining?: number; // 바위/철광의 남은 주 광물량. 구버전 저장은 없음
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
}

export type PointerCursor = 'default' | 'move' | 'copy' | 'pointer' | 'not-allowed';

export type SelectedEntity =
  | { kind: 'tile'; x: number; y: number }
  | { kind: 'resident'; id: number }
  | { kind: 'building'; id: number };

export type PointerAction =
  | { kind: 'none'; cursor: PointerCursor; label: string }
  | { kind: 'move'; cursor: PointerCursor; label: string; x: number; y: number; unauthorizedSiteIds?: number[] }
  | { kind: 'work'; cursor: PointerCursor; label: string; x: number; y: number; buildingId?: number; unauthorizedSiteIds?: number[] }
  | { kind: 'building'; cursor: PointerCursor; label: string; buildingId: number }
  | { kind: 'invalid'; cursor: PointerCursor; label: string };

export type ManualOrder =
  | { kind: 'move'; x: number; y: number; unauthorizedSiteIds?: number[] }
  | { kind: 'work'; x: number; y: number; buildingId?: number; repeat?: boolean; unauthorizedSiteIds?: number[]; started?: boolean };

export type AgentPhase = 'rest' | 'toWork' | 'working' | 'toDeposit';

export interface HaulTask {
  sourceBuildingId: number;
  resource: ResourceId;
  amount: number;
}

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
  assignedBuildingId: number | null;
  homeBuildingId: number | null; // 실제 입주 중인 주거 건물. null이면 노숙
  task: string;     // 현재 작업 설명
  alive: boolean;
  sick: boolean;
  quarantinedUntil?: number; // 이 날까지 격리되어 배정은 유지하지만 일을 하지 못한다
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
  cartEquipped: boolean; // 운반용 수레 장비 여부
  haulTask: HaulTask | null; // 생산지 재고 운반 예약
  manualOrder: ManualOrder | null;  // 플레이어가 우클릭으로 지정한 이동/작업 명령
}

export interface Building {
  id: number;
  type: BuildingTypeId;
  x: number;
  y: number;
  progress: number;   // 투입된 건축가-일수
  built: boolean;
  fieldGrowth: number; // 밭 전용: 작물 성장도 0~100
  cropId?: CropId | null; // 밭/논 전용: 현재 선택/재배 작물
  queuedCropId?: CropId | null; // 밭/논 전용: 수확 뒤 또는 다음 파종철에 적용할 작물
  smithyProduct?: SmithyProductId; // 대장간 전용: 현재 생산품
  inventory?: Partial<Record<ResourceId, number>>; // 운반 전 생산지 현장 재고
  repairing?: boolean; // 습격으로 파손되어 건설담당의 수리가 필요한 상태
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
  placement: 'land' | 'field' | 'paddy' | 'river' | 'rock' | 'riverbank' | 'watermill' | 'any';
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

export type TradeNegotiationPhase = 'selecting' | 'countered' | 'accepted' | 'rejected';

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

export interface LogEntry {
  day: number;
  text: string;
  kind: 'info' | 'good' | 'bad' | 'raid' | 'weather' | 'trade';
  important?: boolean; // 지도 좌상단 주요 소식에 별도 노출
}

export interface ChoiceOption {
  id: string;
  label: string;
  desc: string;
  disabled?: boolean;
  disabledReason?: string;
}

export interface PendingChoice {
  kind: 'raid' | 'expedition' | 'expeditionRaidOrder' | 'trade' | 'extortion' | 'tribute' | 'petition' | 'inspection' | 'crackdown' | 'immigration' | 'incident' | 'territory';
  title: string;
  body: string;
  illustration?: {
    src: string;
    alt: string;
  };
  options: ChoiceOption[];
  // raid: { power, faction, warned } / trade: { give, giveAmt, get, getAmt, faction } / immigration: { count }
  data: Record<string, unknown>;
}

export interface TerritoryViolation {
  siteId: number;
  firstDay: number;
  lastDay: number;
  warningDay: number;
  passage: boolean;
  work: boolean;
  count: number;
  lastPassageDay?: number;
  lastWorkDay?: number;
}

export type SpecialItemId = 'wildGinseng' | 'tigerPelt' | 'gyrfalcon';
export type PredatorKind = 'wolf' | 'tiger';
export type TigerTier = 'tiger' | 'greatTiger' | 'mountainLord';
export type WildlifeKind = PredatorKind | 'boar';
export type SpecialEventId = WildlifeKind | 'wildGinseng' | 'plagueSuspicion' | 'grainRequisition' |
  'shipwreck' | 'earlyFrost' | 'gyrfalcon';

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

export interface PlagueCase {
  residentId: number;
  resolvesOnDay: number;
  real: boolean;
  isolated: boolean;
}

export interface EpidemicState {
  infectedIds: number[];
  untilDay: number;
  mode: 'pending' | 'isolated' | 'uncontained';
}

export interface IncidentState {
  year: number;
  scheduledDays: number[];
  resolutionCount: number;
  cooldownUntil: Partial<Record<SpecialEventId, number>>;
  predatorThreats: Partial<Record<WildlifeKind, PredatorThreat>>;
  plagueCase: PlagueCase | null;
  epidemic: EpidemicState | null;
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

export type ExpeditionKind = 'lairAssault' | 'predatorHunt';
export type ExpeditionPhase = 'muster' | 'march' | 'engage' | 'return';
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
}

export interface RaidHoldState {
  power: number;
  faction: string;
  warned: boolean;
  siege: boolean;
  expeditionOrder: ExpeditionRaidOrder;
  ticksRemaining: number;
}

export type BattlePhase = 'muster' | 'clash';
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

export type TacticalBattlePhase =
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
  | 'civilian';

export type RaiderGroupKind = 'main' | 'looters' | 'flankers';
export type TacticalFormationLine = 'front' | 'middle' | 'rear';
export type TacticalFlankPlan = 'breakthrough' | 'rearAssault';
export type EnemyObjectiveId = 'breakthrough';
export type EnemyStratagemId = 'rearManeuver';

export interface EnemyStratagemState {
  id: EnemyStratagemId;
  revealed: boolean;
  counterLevel: 0 | 1 | 2;
}

export interface EnemyPlan {
  objective: EnemyObjectiveId;
  objectiveRevealed: boolean;
  stratagemPoints: number;
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
  | 'court-artillery';

export type TacticalCommandId =
  | 'hold'
  | 'volley'
  | 'ambush'
  | 'guardStorehouse'
  | 'protectCivilians'
  | 'redeploy'
  | 'fallback'
  | 'advance'
  | 'charge'
  | 'arson'
  | 'blockEscape'
  | 'openRetreat';

export type PreparationActionId =
  | 'evacuateCivilians'
  | 'hideSupplies'
  | 'repairWall'
  | 'setAmbush'
  | 'prepareVolley'
  | 'preliminaryBombardment'
  | 'musterMilitia'
  | 'nightAssault'
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
}

export interface TacticalDefenderGroup {
  id: string;
  kind: DefenderGroupKind;
  role: CombatRole;
  weapon: CombatWeaponId | null;
  readyMuskets?: number;
  label: string;
  residentIds: number[];
  count: number;
  zoneId: string;
  command: TacticalCommandId | null;
  commandSource?: 'recommended' | 'player';
  power: number;
  wounded: number;
  killed: number;
  line: TacticalFormationLine;
  pendingLine?: TacticalFormationLine;
  ambushed?: boolean;
  commandable?: boolean;
  lockedZoneId?: string;
}

export interface TacticalRaiderGroup {
  id: string;
  kind: RaiderGroupKind;
  unitType?: RaiderUnitType;
  label: string;
  zoneId: string;
  pendingZoneId?: string;
  targetZoneId: string;
  power: number;
  count: number;
  killed: number;
  morale: number;
  intent: 'advance' | 'loot' | 'flank' | 'breakWall' | 'defend' | 'escape' | 'withdraw';
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
}

export interface TacticalPreparationEffect {
  id: PreparationActionId;
  label: string;
  cost: number;
  selected: boolean;
  applied: boolean;
}

export interface TacticalAnimationEvent {
  zoneId: string;
  kind:
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
    | 'report';
  text?: string;
  durationMs: number;
  // 연출 보강용 부가 정보 (구버전 저장에는 없을 수 있어 전부 선택)
  side?: 'defender' | 'raider';
  groupId?: string;      // 피해를 입은 그룹 — 화면에서 해당 스프라이트를 쓰러뜨린다
  casualties?: number;   // 이 이벤트로 쓰러지는 인원(전사+부상)
  float?: string;        // 랭크 위로 떠오르는 짧은 전황 텍스트
  meleeParticipants?: number;
  shots?: {
    arrows?: number;
    muskets?: number;
    cannons?: number;
  };
}

export interface TacticalRoundReport {
  round: number;
  focusZoneId: string;
  nextFocusZoneId: string;
  summary: string;
  lines: string[];
  events: TacticalAnimationEvent[];
  wounded: number;
  killed: number;
  raidersKilled: number;
  loot: Partial<Record<ResourceId, number>>;
  buildingsDamaged: number;
  villageMoraleDelta: number;
  raiderMoraleDelta: number;
  ended?: boolean;
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
  siteOutcome?: 'burned' | 'abandoned' | 'fortified' | 'unchanged';
  predatorOutcome?: 'killed' | 'repelled' | 'escaped' | 'huntersDefeated' | 'withdrawn';
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
  defenderGroups: TacticalDefenderGroup[];
  raiderGroups: TacticalRaiderGroup[];
  enemyPlan?: EnemyPlan;
  currentZoneId: string;
  villageMorale: number;
  raiderMorale: number;
  reports: TacticalRoundReport[];
  pendingReport: TacticalRoundReport | null;
  mode: BattleMode;
  orientation?: 'defense' | 'assault';
  assaultKind?: 'banditLair' | 'predatorHunt';
  assaultTargetSiteId?: number;
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
  huntLeaderKilled?: boolean;
  huntWithdrawn?: boolean;
  preliminaryBombardmentCannons?: number;
  preliminaryBombardmentCasualties?: number;
  resourceSnapshot?: Partial<Record<ResourceId, number>>;
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

export type DeathCauseId = 'combat' | 'starvation' | 'cold' | 'disease' | 'other';

export interface GameState {
  schemaVersion: number;
  day: number;          // 경과 일수 (1부터)
  subTick: number;      // 하루 안의 서브틱 (0 ~ SUBTICKS-1)
  difficulty: Difficulty;
  seed: number;
  weather: WeatherId;
  map: Tile[][];
  exploration: ExplorationState;
  habitats: AnimalHabitat[];
  foreignSites: ForeignSite[];
  claimZones: ClaimZone[];
  nextForeignSiteId: number;
  nextClaimZoneId: number;
  territoryViolations: TerritoryViolation[];
  residents: Resident[];
  buildings: Building[];
  nextBuildingId: number;
  nextResidentId: number;
  resources: Record<ResourceId, number>;
  weaponAssignments: Partial<Record<number, CombatWeaponId>>; // 주민별 전투 무기. 없으면 비무장
  weaponAllocationMode: WeaponAllocationMode; // 자동 배분을 유지할지 플레이어 배정을 고정할지
  processingReserves: Record<ProcessingInputId, number>; // 자동 가공/소비 전에 남길 원자재 수량
  threat: number;         // 습격 위협도 0~100
  relations: Record<string, number>; // 세력별 우호도 0~100 (키: 세력 이름)
  expedition: Expedition | null; // 지도 위 토벌 원정대. 동시에 하나만 운용
  raidHold: RaidHoldState | null; // 원정대 귀환을 기다리는 완전 수성 상태
  raiders: RaiderBand | null; // 접근 중인 습격 무리
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
  incidents: IncidentState;    // 연간 돌발 사건 일정과 지속 중인 맹수 위험
  specialItems: Record<SpecialItemId, number>; // 산삼·호피 등 일반 자원과 분리한 기물함
  discoveredSpecialItems: SpecialItemId[];     // 소모해도 남는 기물 도감
  tributeWaivers: number;      // 산삼 진상으로 얻은 세공 면제 횟수
  pendingChoice: PendingChoice | null;
  courtTribute: CourtTribute | null;  // 올해 세공 (봄 공지 때 설정)
  tributeReserve: Partial<Record<ResourceId, number>>; // 올해 세공용으로 잠근 중심지 재고
  tributeFailStreak: number;          // 연속 미납 횟수 (2년 연속이면 명성 하락 가중)
  tributePaidStreak: number;          // 연속 납부 년수 (승격 조건의 "공물 성실도")
  rank: Rank;                         // 현재 승격 단계
  lastPetitionDay: number;            // 마지막 청원 승인일 (계절당 1회 쿨다운)
  cannonsGranted: number;             // 조정이 하사한 불랑기포 수 (배치 가능 상한)
  // ── 모반 의심 (화약 자급/월경 교역/북방 유착이 조정의 눈총을 산다) ──
  suspicion: number;                  // 0~100
  nitrePaused: boolean;               // 염초장 가동 중지 토글 (플레이어)
  nitreHiddenUntil: number;           // 감찰 은닉: 이 날까지 염초장이 멈춘다
  initiatedTradeDays: number[];       // 최근 플레이어 주도 교역 성사일 (월경 교역 혐의)
  inspectionCooldownUntil: number;    // 다음 감찰 어사가 올 수 있는 날
  censured: boolean;                  // 현 의심 고조 구간에서 견책을 이미 받았는지
  crackdownDeadline: number;          // 토벌 유예 마감일 (0이면 없음)
  log: LogEntry[];
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
