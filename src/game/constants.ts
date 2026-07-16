// 명칭, 텍스트, 정적 정의 모음
import type { BuildingTypeId, JobId, Rank, ResourceId, Season, Terrain, TradeOffer, WeatherId } from './types';
import { RESOURCE_DEFS, RESOURCE_ORDER as CATALOG_RESOURCE_ORDER } from './resourceCatalog';

export const SEASON_NAMES: Record<Season, string> = {
  spring: '봄', summer: '여름', autumn: '가을', winter: '겨울',
};

export const RANK_NAMES: Record<Rank, string> = {
  settlement: '개척지', bo: '보(堡)', jin: '진(鎭)', bu: '부(府)',
};

export const RANK_ORDER: Rank[] = ['settlement', 'bo', 'jin', 'bu'];

export function rankAtLeast(rank: Rank | undefined, minRank?: Rank): boolean {
  if (!minRank) return true;
  const current = RANK_ORDER.indexOf(rank ?? 'settlement');
  const required = RANK_ORDER.indexOf(minRank);
  return current >= required;
}

export const SEASON_ORDER: Season[] = ['spring', 'summer', 'autumn', 'winter'];

export const WEATHER_NAMES: Record<WeatherId, string> = {
  clear: '맑음', rain: '비', frost: '서리', heavySnow: '폭설',
  blizzard: '눈보라', coldSnap: '혹한', thawFlood: '해빙기 홍수',
};

export const WEATHER_ICONS: Record<WeatherId, string> = {
  clear: '☀️', rain: '🌧️', frost: '🌫️', heavySnow: '🌨️',
  blizzard: '🌬️', coldSnap: '🥶', thawFlood: '🌊',
};

export const TERRAIN_NAMES: Record<Terrain, string> = {
  forest: '숲', plain: '평지', river: '강', mountain: '산지',
  fertile: '비옥한 땅', rock: '바위/철광', center: '마을 터',
};

export const JOB_NAMES: Record<JobId, string> = {
  idle: '무직', woodcutter: '벌목꾼', hunter: '사냥꾼', farmer: '농부',
  woodSplitter: '장작꾼',
  miller: '방아꾼',
  builder: '건축가', hauler: '운반꾼', herbalist: '약초꾼', physician: '의원', curer: '갈무리꾼', potter: '옹기장이', smith: '대장장이',
  miner: '채광꾼', fisher: '어부',
  charcoalBurner: '숯쟁이', herder: '목동',
  tanner: '무두장이',
  weaver: '직조공',
  powderMaker: '염초장이', clerk: '아전',
  watchman: '파수꾼', militia: '수비병',
};

export const JOB_ORDER: JobId[] = [
  'idle', 'woodcutter', 'woodSplitter', 'hunter', 'farmer', 'miller', 'builder',
  'hauler', 'herbalist', 'physician', 'curer', 'potter', 'smith', 'miner', 'fisher', 'charcoalBurner', 'herder',
  'tanner', 'weaver', 'powderMaker', 'clerk',
  'watchman', 'militia',
];

export const JOB_MIN_RANK: Partial<Record<JobId, Rank>> = {
  miller: 'bo',
  miner: 'bo',
  fisher: 'bo',
  potter: 'bo',
  weaver: 'bo',
  charcoalBurner: 'jin',
  herder: 'jin',
  physician: 'jin',
  powderMaker: 'bu',
  clerk: 'bu',
};

export function isJobUnlocked(rank: Rank | undefined, job: JobId): boolean {
  return rankAtLeast(rank, JOB_MIN_RANK[job]);
}

export const JOB_DESC: Record<JobId, string> = {
  idle: '배정된 일이 없습니다.',
  woodcutter: '숲까지 걸어가 나무를 베고, 벌목장이나 창고로 목재를 나릅니다.',
  woodSplitter: '창고에서 목재를 가져와 장작마당에 쌓고 난방 효율이 좋은 장작으로 팹니다.',
  hunter: '짐승 서식지를 오가며 사냥감을 잡아 사냥막이나 창고로 나릅니다.',
  farmer: '밭과 논을 오가며 선택한 작물을 돌보고 수확물을 나릅니다.',
  miller: '보(堡) 승격 후 창고의 벼를 방앗간으로 가져와 먹을 수 있는 곡물로 도정합니다.',
  builder: '공사장까지 가서 건물을 짓습니다.',
  hauler: '생산지의 현장 재고를 중심지와 창고로 나르며, 일이 없으면 채석을 다녀옵니다. 수레를 장비하면 적재량이 크게 늘어납니다.',
  herbalist: '산기슭을 다니며 약초와 야생과일·버섯·산나물을 채집해 약초막이나 창고로 나릅니다.',
  physician: '진(鎭) 승격 후 의원에서 약초로 병자와 중상자를 치료하고 역병의 진단과 방역을 돕습니다.',
  curer: '훈연소에서 고기를 보존육으로 만들고, 건조대에서 생선을 자반이나 건어물로 갈무리합니다.',
  potter: '보(堡) 승격 후 강가의 점토를 빚고 연료로 구워 옹기를 만듭니다.',
  smith: '창고에서 철과 필요한 재료를 가져와 지정 대장간에서 도구와 무기를 만듭니다.',
  miner: '보(堡) 승격 후 배치할 수 있습니다. 채광장에서 돌과 철을 안정적으로 캡니다.',
  fisher: '보(堡) 승격 후 배치할 수 있습니다. 나루터에서 강고기를 잡아 식량을 보탭니다.',
  charcoalBurner: '진(鎭) 승격 후 창고에서 목재를 가져와 지정 숯가마에서 숯으로 굽습니다.',
  herder: '진(鎭) 승격 후 배치할 수 있습니다. 축사에서 가축을 돌보며 식량과 가죽을 보탭니다.',
  tanner: '무두질 작업장에서 가죽을 손질해 옷감과 방한용 의복 생산을 돕습니다.',
  weaver: '베틀집에서 목화를 무명옷으로 짭니다.',
  powderMaker: '부(府) 승격 후 배치할 수 있습니다. 염초장에서 장작과 돌을 써서 화약을 만듭니다.',
  clerk: '부(府) 승격 후 배치할 수 있습니다. 관청에서 행정을 맡아 자원 수집과 생산 효율을 높입니다.',
  watchman: '방어 시설 사이를 순찰합니다. 방어도가 오르고 위협도 증가가 줄어듭니다.',
  militia: '군영(없으면 마을 중심)에서 조련하는 상비 수비병입니다. 방어도가 크게 오릅니다.',
};

// 지도 위 주민 점 색상
export const JOB_COLORS: Record<JobId, string> = {
  idle: '#9aa5ad', woodcutter: '#b0793a', hunter: '#7fa653', farmer: '#d9c26b',
  woodSplitter: '#c48b46',
  miller: '#b9a27a',
  builder: '#d98d5f', hauler: '#8fb7c9', herbalist: '#6fce9e', physician: '#77b7a8', curer: '#c88964', potter: '#a56d4a', smith: '#c96f6f',
  miner: '#9a8f7a', fisher: '#5ba7d8',
  charcoalBurner: '#d66f3f', herder: '#c7a85b',
  tanner: '#b9825a',
  weaver: '#8f9fbd',
  powderMaker: '#b47cc7', clerk: '#d0b36a',
  watchman: '#7f8fd9', militia: '#e05f5f',
};

export const RESOURCE_NAMES = Object.fromEntries(
  Object.entries(RESOURCE_DEFS).map(([id, def]) => [id, def.name]),
) as Record<ResourceId, string>;

export const RESOURCE_ICONS = Object.fromEntries(
  Object.entries(RESOURCE_DEFS).map(([id, def]) => [id, def.icon]),
) as Record<ResourceId, string>;

export const RESOURCE_ORDER: ResourceId[] = CATALOG_RESOURCE_ORDER;

// 북방 세력 — 조선 기록의 두만강 방면 여진 집단들에서 딴 세력 구성.
// 단일 악역이 아니라, 습격 성향(hostile)과 교역(trades)이 따로 논다:
// 평시엔 장터에 물건을 팔러 오다가 흉년·긴장 국면에는 창을 들 수도 있다.
export interface Faction {
  name: string;
  hostile: boolean;      // 위협도가 높을 때 습격 무리로 나설 성향
  desc: string;
  color: string;
  trades: TradeOffer[];  // 비어 있으면 교역하지 않는 세력
  tradeValues: Partial<Record<ResourceId, number>>;
  exports: ResourceId[];
  imports: ResourceId[];
  extortionDemands?: { resource: ResourceId; baseAmount: number }[];
  tradeUnlockBuilding?: BuildingTypeId;
  tradeUnlockLabel?: string;
  raidEligible?: boolean;
  foreignTrade?: boolean;
  tradeCapacityMult?: number;
  tradeCapacityByResource?: Partial<Record<ResourceId, number>>;
  initialRelation: number; // 시작 우호도 (0~100)
}

export const COMMON_TRADE_RESOURCES: ResourceId[] = [
  'grain', 'rice', 'meat', 'fish', 'vegetables',
  'brushwood', 'firewood', 'charcoal',
  'wood', 'stone', 'iron', 'tools', 'hide', 'herbs',
  'hideClothes', 'cotton', 'cottonClothes',
];

export const FACTIONS: Faction[] = [
  {
    name: '오도리 씨족', hostile: false,
    desc: '회령 방면 강가에 정착해 밭을 갈고 조선과 오래 교역해 온 씨족',
    color: '#58b6a4',
    trades: [
      { give: 'tools', giveAmt: 3, get: 'grain', getAmt: 16 },
      { give: 'hideClothes', giveAmt: 4, get: 'hide', getAmt: 9 },
      { give: 'stone', giveAmt: 8, get: 'wood', getAmt: 6 },
    ],
    tradeValues: {
      grain: 0.8, rice: 0.65, meat: 1.7, fish: 1.4, vegetables: 0.9,
      brushwood: 0.5, firewood: 0.85, charcoal: 1.3,
      wood: 1.05, stone: 0.75, iron: 2.5, tools: 4.5,
      hide: 1.6, herbs: 1.4, hideClothes: 3.6, cotton: 1.6, cottonClothes: 3.1,
    },
    exports: [...COMMON_TRADE_RESOURCES],
    imports: [...COMMON_TRADE_RESOURCES, 'jang'],
    tradeCapacityByResource: {
      grain: 1.45, rice: 1.4, vegetables: 1.35, stone: 1.1,
      meat: 0.75, fish: 0.7, hide: 0.8, herbs: 0.9,
    },
    initialRelation: 60,
  },
  {
    name: '올량합 부락', hostile: false,
    desc: '두만강 가에서 반농반렵으로 살아가는 부락, 국경 무역에 밝다',
    color: '#d6a84f',
    trades: [
      { give: 'grain', giveAmt: 12, get: 'hide', getAmt: 8 },
      { give: 'hideClothes', giveAmt: 3, get: 'meat', getAmt: 10 },
      { give: 'stone', giveAmt: 8, get: 'firewood', getAmt: 9 },
    ],
    tradeValues: {
      grain: 1.1, rice: 0.9, meat: 1.2, fish: 1.5, vegetables: 1.2,
      brushwood: 0.45, firewood: 1.05, charcoal: 1.5,
      wood: 1.2, stone: 0.9, iron: 2.6, tools: 4.2,
      hide: 1.35, herbs: 1.2, hideClothes: 3.4, cotton: 1.8, cottonClothes: 3.3,
    },
    exports: [...COMMON_TRADE_RESOURCES],
    imports: [...COMMON_TRADE_RESOURCES, 'jang'],
    tradeCapacityByResource: {
      meat: 1.45, hide: 1.5, hideClothes: 1.2,
      firewood: 1.15, wood: 1.1,
      grain: 0.85, rice: 0.8, fish: 0.75, cotton: 0.8,
    },
    initialRelation: 55,
  },
  {
    name: '골간 우디캐', hostile: false,
    desc: '두만강 하구 바닷가에서 고기잡이하는 올적합 갈래, 마른 생선과 소금을 가져온다',
    color: '#5ba7d8',
    trades: [
      { give: 'iron', giveAmt: 4, get: 'grain', getAmt: 22 },
      { give: 'tools', giveAmt: 2, get: 'grain', getAmt: 15 },
      { give: 'firewood', giveAmt: 12, get: 'stone', getAmt: 10 },
      { give: 'wood', giveAmt: 8, get: 'salt', getAmt: 10 },
    ],
    tradeValues: {
      grain: 0.85, rice: 0.75, meat: 1.7, fish: 0.9, vegetables: 1.1,
      brushwood: 0.55, firewood: 1.15, charcoal: 1.3,
      wood: 1.45, stone: 0.85, iron: 2.7, tools: 4.4,
      hide: 1.9, herbs: 1.5, hideClothes: 3.6, cotton: 1.7, cottonClothes: 3.2, salt: 1.25,
    },
    exports: [...COMMON_TRADE_RESOURCES, 'salt'],
    imports: [...COMMON_TRADE_RESOURCES, 'jang'],
    tradeCapacityByResource: {
      fish: 1.8, grain: 1.1, tools: 1.1,
      wood: 0.75, firewood: 0.9, hide: 0.8, meat: 0.9,
    },
    initialRelation: 55,
  },
  {
    name: '니마차 우디캐', hostile: true,
    desc: '깊은 숲의 사냥 부족, 평시엔 담비 가죽을 팔러 오지만 굶주린 해에는 창을 든다',
    color: '#78b95e',
    trades: [
      { give: 'grain', giveAmt: 14, get: 'hide', getAmt: 12 },
      { give: 'grain', giveAmt: 16, get: 'herbs', getAmt: 7 },
      { give: 'stone', giveAmt: 8, get: 'wood', getAmt: 12 },
    ],
    tradeValues: {
      grain: 1.2, rice: 1, meat: 1.2, fish: 1.7, vegetables: 1.4,
      brushwood: 0.35, firewood: 0.65, charcoal: 1.2,
      wood: 0.7, stone: 1.15, iron: 2.8, tools: 4.6,
      hide: 1.25, herbs: 1.1, hideClothes: 3, cotton: 2, cottonClothes: 3.5,
    },
    exports: [...COMMON_TRADE_RESOURCES],
    imports: [...COMMON_TRADE_RESOURCES, 'jang'],
    tradeCapacityByResource: {
      brushwood: 1.8, firewood: 1.6, wood: 1.75,
      hide: 1.45, herbs: 1.6, meat: 1.25,
      grain: 0.55, rice: 0.5, fish: 0.6, stone: 0.7, iron: 0.75, cotton: 0.6,
    },
    initialRelation: 45,
  },
  {
    name: '홀라온 야인', hostile: true,
    desc: '송화강 쪽에서 말을 몰고 내려오는 무리, 먼 길을 온 만큼 빈손으로 돌아가지 않는다',
    color: '#d96f5f',
    trades: [],
    tradeValues: {},
    exports: [],
    imports: [],
    extortionDemands: [
      { resource: 'grain', baseAmount: 18 },
      { resource: 'hide', baseAmount: 7 },
      { resource: 'tools', baseAmount: 3 },
    ],
    initialRelation: 35,
  },
  {
    name: '변경 마적', hostile: true,
    desc: '국경을 떠도는 혼성 무장 무리, 조선 유민도 여진 낙오자도 섞여 있다',
    color: '#b56f7a',
    trades: [],
    tradeValues: {},
    exports: [],
    imports: [],
    extortionDemands: [
      { resource: 'grain', baseAmount: 15 },
      { resource: 'tools', baseAmount: 4 },
      { resource: 'hide', baseAmount: 6 },
    ],
    initialRelation: 25,
  },
  {
    name: '만상', hostile: false,
    desc: '의주와 북관의 길을 잇는 거상들, 부두가 열리면 목화와 비단, 귀금속을 싣고 찾아온다',
    color: '#55a79a',
    trades: [
      { give: 'hide', giveAmt: 10, get: 'cotton', getAmt: 10 },
      { give: 'iron', giveAmt: 5, get: 'cottonClothes', getAmt: 4 },
      { give: 'grain', giveAmt: 25, get: 'silk', getAmt: 3 },
      { give: 'wood', giveAmt: 18, get: 'preciousMetal', getAmt: 2 },
      { give: 'grain', giveAmt: 12, get: 'salt', getAmt: 8 },
    ],
    tradeValues: {
      grain: 1.1, rice: 0.9, meat: 1.8, fish: 1.6, vegetables: 1.2,
      brushwood: 0.55, firewood: 1, charcoal: 1.5,
      wood: 1.3, stone: 0.85, iron: 2.6, tools: 4.2,
      hide: 2, herbs: 1.6, hideClothes: 3.5, cotton: 1.5, cottonClothes: 3.2,
      porcelain: 6.2, brassware: 5.5, lacquerware: 5.8, silk: 7.5, preciousMetal: 10, salt: 1.55,
    },
    exports: [...COMMON_TRADE_RESOURCES, 'salt', 'brassware', 'silk', 'preciousMetal'],
    imports: [...COMMON_TRADE_RESOURCES, 'jang', 'porcelain', 'lacquerware'],
    tradeUnlockBuilding: 'dock',
    tradeUnlockLabel: '부두 건설 후 의주 상로가 열립니다',
    raidEligible: false,
    foreignTrade: false,
    tradeCapacityMult: 1.3,
    tradeCapacityByResource: {
      cotton: 1.5, cottonClothes: 1.4, silk: 1.5, preciousMetal: 1.3,
    },
    initialRelation: 55,
  },
  {
    name: '송상', hostile: false,
    desc: '개성에서 온 상단, 부두 창고를 거점으로 자기와 유기, 칠기와 비단을 대량으로 유통한다',
    color: '#c18a55',
    trades: [
      { give: 'hide', giveAmt: 10, get: 'porcelain', getAmt: 3 },
      { give: 'herbs', giveAmt: 10, get: 'brassware', getAmt: 3 },
      { give: 'preciousMetal', giveAmt: 2, get: 'lacquerware', getAmt: 4 },
      { give: 'wood', giveAmt: 18, get: 'silk', getAmt: 3 },
      { give: 'grain', giveAmt: 13, get: 'salt', getAmt: 8 },
    ],
    tradeValues: {
      grain: 1, rice: 0.8, meat: 1.7, fish: 1.5, vegetables: 1.1,
      brushwood: 0.5, firewood: 0.95, charcoal: 1.45,
      wood: 1.1, stone: 1, iron: 2.5, tools: 4,
      hide: 2.1, herbs: 1.7, hideClothes: 3.4, cotton: 1.8, cottonClothes: 3.1,
      porcelain: 6.5, brassware: 5.2, lacquerware: 4.8,
      silk: 6.4, preciousMetal: 9.5, salt: 1.5,
    },
    exports: [...COMMON_TRADE_RESOURCES, 'salt', 'porcelain', 'brassware', 'lacquerware', 'silk'],
    imports: [...COMMON_TRADE_RESOURCES, 'jang', 'preciousMetal'],
    tradeUnlockBuilding: 'dock',
    tradeUnlockLabel: '부두 건설 후 개성 상단과 거래할 수 있습니다',
    raidEligible: false,
    foreignTrade: false,
    tradeCapacityMult: 1.25,
    tradeCapacityByResource: {
      cottonClothes: 1.3, porcelain: 1.6, brassware: 1.5, lacquerware: 1.6, silk: 1.4,
    },
    initialRelation: 60,
  },
];

// 주민 이름 생성용. 변방 개척민의 소박한 아명과 한자식 이름을 섞는다.
export const SURNAMES = [
  '김', '이', '박', '최', '정', '조', '강', '윤', '장',
  '임', '한', '오', '신', '안', '송', '전', '류', '홍',
];

// 실제 인구 통계의 재현값이 아니라, 작은 개척지에 흔한 성씨가 반복되어 보이게 하는 게임용 가중치다.
export const SURNAME_WEIGHTS = [22, 18, 12, 8, 7, 5, 5, 4, 4, 3, 3, 3, 2, 2, 1, 1, 1, 1] as const;

export const MALE_GIVEN_NAMES = [
  '돌쇠', '막손', '삼돌', '만복', '길동', '차돌', '무쇠', '봉수', '칠성', '팔복',
  '바우', '억쇠', '마당쇠', '개똥', '쇠돌', '복동', '귀동', '끝동', '막동', '업동',
  '천동', '금동', '산돌', '돌복', '장쇠', '덕쇠', '춘복', '성복', '흥복', '재복',
  '만수', '장수', '덕수', '춘삼', '봉삼', '두칠', '오복', '수복', '명복', '영수',
  '성길', '종길', '덕길', '흥길', '재길', '경손', '인손', '복손', '귀손', '철산',
  '태산', '한돌', '큰돌', '범돌', '수돌', '억만', '만춘', '춘길', '덕만', '복만',
];

export const FEMALE_GIVEN_NAMES = [
  '분이', '언년', '순덕', '금이', '복실', '매화', '삼월', '사월', '구월', '눈이',
  '설이', '오목', '끝순', '점순', '덕순', '금순', '옥순', '복순', '귀순', '춘순',
  '분순', '옥분', '금분', '덕분', '복분', '귀분', '춘분', '말분', '끝분', '점분',
  '점례', '순례', '복례', '덕례', '옥례', '금례', '춘례', '귀례', '월례', '길례',
  '간난', '끝난', '복단', '금단', '옥단', '덕임', '복임', '순임', '금임', '옥임',
  '월이', '달이', '별이', '봄이', '꽃님', '옥녀', '금녀', '순녀', '월향', '매월',
];

// 분위기용 잡보 로그
export const FLAVOR_LOGS_CALM = [
  '아이들이 얼어붙은 웅덩이에서 팽이를 돌립니다.',
  '노인들이 화롯가에 모여 남쪽 고향 이야기를 나눕니다.',
  '강가에서 물새 떼가 날아오릅니다.',
  '산등성이 너머로 기러기 떼가 지나갑니다.',
  '골간 우디캐의 고기잡이 배가 강 하구 쪽으로 내려가는 것이 보입니다.',
  '오도리 사람들이 강 건너 밭에서 김을 매고 있습니다.',
];

export const FLAVOR_LOGS_TENSE = [
  '두만강 너머에서 낯선 발자국이 발견되었습니다.',
  '경계병이 북쪽 능선의 연기를 발견했습니다.',
  '밤사이 마을 어귀의 개들이 심하게 짖었습니다.',
  '사냥꾼이 골짜기에서 낯선 말발굽 자국을 보았다고 보고합니다.',
  '홀라온 기마대가 북쪽 벌판을 지났다는 소문이 전해졌습니다.',
  '니마차 사냥꾼들이 올해는 담비가 씨가 말랐다고 투덜댔다 합니다.',
];
