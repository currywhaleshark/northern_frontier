// 명칭, 텍스트, 정적 정의 모음
import type { JobId, Rank, ResourceId, Season, Terrain, TradeOffer, WeatherId } from './types';

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
  builder: '건축가', hauler: '운반꾼', herbalist: '약초꾼', smith: '대장장이',
  miner: '채광꾼', fisher: '어부',
  charcoalBurner: '숯쟁이', herder: '목동',
  powderMaker: '염초장이', clerk: '아전',
  watchman: '파수꾼', militia: '수비병',
};

export const JOB_ORDER: JobId[] = [
  'idle', 'woodcutter', 'hunter', 'farmer', 'builder',
  'hauler', 'herbalist', 'smith', 'miner', 'fisher', 'charcoalBurner', 'herder',
  'powderMaker', 'clerk',
  'watchman', 'militia',
];

export const JOB_MIN_RANK: Partial<Record<JobId, Rank>> = {
  miner: 'bo',
  fisher: 'bo',
  charcoalBurner: 'jin',
  herder: 'jin',
  powderMaker: 'bu',
  clerk: 'bu',
};

export function isJobUnlocked(rank: Rank | undefined, job: JobId): boolean {
  return rankAtLeast(rank, JOB_MIN_RANK[job]);
}

export const JOB_DESC: Record<JobId, string> = {
  idle: '배정된 일이 없습니다.',
  woodcutter: '숲까지 걸어가 나무를 베고, 벌목장이나 창고로 목재를 나릅니다.',
  hunter: '짐승 서식지를 오가며 사냥감을 잡아 사냥막이나 창고로 나릅니다.',
  farmer: '밭을 오가며 봄여름에 작물을 돌보고 가을에 곡물을 거둬 나릅니다.',
  builder: '공사장까지 가서 건물을 짓습니다.',
  hauler: '창고에서 장작을 패고 사냥감을 손질하고 곡물을 도정하며, 일이 없으면 채석을 다녀옵니다.',
  herbalist: '산기슭을 다니며 약초를 캐 약초막이나 창고로 나릅니다.',
  smith: '대장간에서 도구를 만듭니다. 채광꾼이 없을 때만 철광까지 보조 채굴을 다녀옵니다.',
  miner: '보(堡) 승격 후 배치할 수 있습니다. 채광장에서 돌과 철을 안정적으로 캡니다.',
  fisher: '보(堡) 승격 후 배치할 수 있습니다. 나루터에서 강고기를 잡아 식량을 보탭니다.',
  charcoalBurner: '진(鎭) 승격 후 배치할 수 있습니다. 숯가마에서 목재를 장작으로 효율적으로 굽습니다.',
  herder: '진(鎭) 승격 후 배치할 수 있습니다. 축사에서 가축을 돌보며 식량과 가죽을 보탭니다.',
  powderMaker: '부(府) 승격 후 배치할 수 있습니다. 염초장에서 장작과 돌을 써서 화약을 만듭니다.',
  clerk: '부(府) 승격 후 배치할 수 있습니다. 관청에서 행정을 맡아 자원 수집과 생산 효율을 높입니다.',
  watchman: '방어 시설 사이를 순찰합니다. 방어도가 오르고 위협도 증가가 줄어듭니다.',
  militia: '군영(없으면 마을 중심)에서 조련하는 상비 수비병입니다. 방어도가 크게 오릅니다.',
};

// 지도 위 주민 점 색상
export const JOB_COLORS: Record<JobId, string> = {
  idle: '#9aa5ad', woodcutter: '#b0793a', hunter: '#7fa653', farmer: '#d9c26b',
  builder: '#d98d5f', hauler: '#8fb7c9', herbalist: '#6fce9e', smith: '#c96f6f',
  miner: '#9a8f7a', fisher: '#5ba7d8',
  charcoalBurner: '#d66f3f', herder: '#c7a85b',
  powderMaker: '#b47cc7', clerk: '#d0b36a',
  watchman: '#7f8fd9', militia: '#e05f5f',
};

export const RESOURCE_NAMES: Record<ResourceId, string> = {
  food: '식량', firewood: '장작', wood: '목재', stone: '돌', iron: '철',
  tools: '도구', hide: '가죽', clothes: '옷', herbs: '약초', grain: '곡물',
  game: '사냥감', gunpowder: '화약', muskets: '조총', reputation: '명성', defense: '방어도',
};

export const RESOURCE_ICONS: Record<ResourceId, string> = {
  food: '🍚', firewood: '🔥', wood: '🪵', stone: '🪨', iron: '⛏️',
  tools: '🔨', hide: '🦌', clothes: '🧥', herbs: '🌿', grain: '🌾',
  game: '🐗', gunpowder: '🧨', muskets: '🔫', reputation: '📜', defense: '🛡️',
};

export const RESOURCE_ORDER: ResourceId[] = [
  'food', 'firewood', 'wood', 'stone', 'iron', 'tools', 'hide',
  'clothes', 'herbs', 'grain', 'game', 'gunpowder', 'muskets', 'reputation', 'defense',
];

// 북방 세력 — 조선 기록의 두만강 방면 여진 집단들에서 딴 세력 구성.
// 단일 악역이 아니라, 습격 성향(hostile)과 교역(trades)이 따로 논다:
// 평시엔 장터에 물건을 팔러 오다가 흉년·긴장 국면에는 창을 들 수도 있다.
export interface Faction {
  name: string;
  hostile: boolean;      // 위협도가 높을 때 습격 무리로 나설 성향
  desc: string;
  color: string;
  trades: TradeOffer[];  // 비어 있으면 교역하지 않는 세력
  initialRelation: number; // 시작 우호도 (0~100)
}

export const FACTIONS: Faction[] = [
  {
    name: '오도리 씨족', hostile: false,
    desc: '회령 방면 강가에 정착해 밭을 갈고 조선과 오래 교역해 온 씨족',
    color: '#58b6a4',
    trades: [
      { give: 'tools', giveAmt: 3, get: 'grain', getAmt: 16 },
      { give: 'clothes', giveAmt: 4, get: 'hide', getAmt: 9 },
    ],
    initialRelation: 60,
  },
  {
    name: '올량합 부락', hostile: false,
    desc: '두만강 가에서 반농반렵으로 살아가는 부락, 국경 무역에 밝다',
    color: '#d6a84f',
    trades: [
      { give: 'grain', giveAmt: 12, get: 'hide', getAmt: 8 },
      { give: 'clothes', giveAmt: 3, get: 'game', getAmt: 10 },
    ],
    initialRelation: 55,
  },
  {
    name: '골간 우디캐', hostile: false,
    desc: '두만강 하구 바닷가에서 고기잡이하는 올적합 갈래, 마른 생선과 소금을 가져온다',
    color: '#5ba7d8',
    trades: [
      { give: 'iron', giveAmt: 4, get: 'food', getAmt: 22 },
      { give: 'tools', giveAmt: 2, get: 'food', getAmt: 15 },
    ],
    initialRelation: 55,
  },
  {
    name: '니마차 우디캐', hostile: true,
    desc: '깊은 숲의 사냥 부족, 평시엔 담비 가죽을 팔러 오지만 굶주린 해에는 창을 든다',
    color: '#78b95e',
    trades: [
      { give: 'grain', giveAmt: 14, get: 'hide', getAmt: 12 },
      { give: 'food', giveAmt: 16, get: 'herbs', getAmt: 7 },
    ],
    initialRelation: 45,
  },
  {
    name: '홀라온 야인', hostile: true,
    desc: '송화강 쪽에서 말을 몰고 내려오는 무리, 먼 길을 온 만큼 빈손으로 돌아가지 않는다',
    color: '#d96f5f',
    trades: [],
    initialRelation: 35,
  },
  {
    name: '변경 마적', hostile: true,
    desc: '국경을 떠도는 혼성 무장 무리, 조선 유민도 여진 낙오자도 섞여 있다',
    color: '#b56f7a',
    trades: [],
    initialRelation: 25,
  },
];

// 주민 이름 생성용
export const SURNAMES = ['김', '이', '박', '최', '정', '한', '오', '류', '전', '남', '백', '문', '강', '조'];
export const GIVEN_NAMES = [
  '돌쇠', '막손', '분이', '삼돌', '언년', '개똥', '순덕', '만복', '길동', '점박',
  '금이', '차돌', '복실', '큰놈', '작은놈', '넙치', '똘이', '매화', '실겅', '무쇠',
  '봉수', '삼월', '사월', '오목', '칠성', '팔복', '구월', '눈이', '설이', '바우',
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
