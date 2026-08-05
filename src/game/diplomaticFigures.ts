import { CONFIG } from './config';
import { withJosa } from './josa';
import { recordAnnalsWithLog } from './annals';
import type {
  BorderCommander, BorderCommanderTemper, FactionLeader, FactionLeaderTemper, GameState,
} from './types';

export const BORDER_COMMANDER_TITLE = '함경북도 병마절도사';

export const DIPLOMATIC_FACTION_NAMES = [
  '오도리 씨족',
  '올량합 부락',
  '골간 우디캐',
  '니마차 우디캐',
  '홀라온 야인',
] as const;

type DiplomaticFactionName = (typeof DIPLOMATIC_FACTION_NAMES)[number];

// 조선왕조실록의 집단별 여진 인명 표기를 완성된 이름 단위로 보존한다.
// 이름 조각을 교차 조합하지 않으며 왕조 시조급 유명인은 넣지 않는다.
const FACTION_LEADER_NAMES: Record<DiplomaticFactionName, readonly string[]> = {
  '오도리 씨족': [
    '동막사', '동말응거', '동창아', '최보야', '최어부', '보고로', '마사', '이을적',
  ],
  '올량합 부락': [
    '이시내', '야음부', '주장개', '도은도', '소응거', '노요고',
    '두이응거', '보양개', '가을다개', '돌룡합', '거을가개', '나수',
  ],
  '골간 우디캐': [
    '김조랑가', '무거응가', '아이간가', '아지가', '김모다오', '도쌍가', '이마두',
    '김모하', '진홍오', '연다', '간아지', '김우두', '이도롱',
  ],
  '니마차 우디캐': [
    '라방개', '오을도개', '야다호', '말응거', '아인첩목', '자리', '이보양개',
    '이부롱고', '야당지', '야랑가우', '시응거', '임다', '우증거', '잉이가',
  ],
  '홀라온 야인': [
    '하질이', '부자타', '소라적', '가롱개', '망가', '구적라', '모도오',
    '나이곤', '보당개', '도아야', '도리야노노호', '사롱합', '호시단',
  ],
};

const FACTION_TITLES: Record<DiplomaticFactionName, FactionLeader['title']> = {
  '오도리 씨족': '족장',
  '올량합 부락': '추장',
  '골간 우디캐': '추장',
  '니마차 우디캐': '추장',
  '홀라온 야인': '추장',
};

const FACTION_TEMPER_ORDER: readonly FactionLeaderTemper[] = [
  'bold', 'wily', 'taciturn', 'fierce',
];

const BORDER_TEMPER_ORDER: readonly BorderCommanderTemper[] = [
  'strict', 'greedy', 'lenient', 'tactician',
];

// 북병사 실존 인물을 그대로 재등장시키지 않고, 북방 무관 기록에서 확인되는
// 성씨와 당대식 두 글자 이름 풀을 교차한다.
const BORDER_SURNAMES = [
  '허', '성', '변', '윤', '이', '신', '한', '김',
  '조', '남', '강', '박', '정', '유', '서', '권',
] as const;

const BORDER_GIVEN_NAMES = [
  '종원', '계준', '희중', '윤경', '제원', '용선', '시준', '극선',
  '경신', '준겸', '성립', '응직', '수원', '종평', '계인', '윤신',
  '희겸', '제순', '용경', '시원', '극중', '경원', '준신', '성언',
] as const;

function stableHash(seed: number, salt: string): number {
  let hash = (Math.floor(seed) ^ 0x811c9dc5) >>> 0;
  for (let index = 0; index < salt.length; index++) {
    hash ^= salt.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d) >>> 0;
  hash ^= hash >>> 15;
  return hash >>> 0;
}

function portraitVariant(name: string): 1 | 2 {
  return (stableHash(0, name) % 2 + 1) as 1 | 2;
}

function pick<T>(values: readonly T[], seed: number, salt: string): T {
  return values[stableHash(seed, salt) % values.length];
}

function isDiplomaticFactionName(name: string): name is DiplomaticFactionName {
  return (DIPLOMATIC_FACTION_NAMES as readonly string[]).includes(name);
}

export function createFactionLeaders(seed: number): Record<string, FactionLeader> {
  return Object.fromEntries(DIPLOMATIC_FACTION_NAMES.map(factionName => [
    factionName,
    {
      name: pick(FACTION_LEADER_NAMES[factionName], seed, `faction-name:${factionName}`),
      title: FACTION_TITLES[factionName],
      temper: pick(FACTION_TEMPER_ORDER, seed, `faction-temper:${factionName}`),
    },
  ]));
}

export function borderCommanderTermIndex(day: number): number {
  const safeDay = Number.isFinite(day) ? Math.max(1, Math.floor(day)) : 1;
  return Math.floor((safeDay - 1) / (CONFIG.time.yearDays * 2));
}

export function createBorderCommander(seed: number, termIndex: number): BorderCommander {
  const safeTerm = Number.isFinite(termIndex) ? Math.max(0, Math.floor(termIndex)) : 0;
  const nameCount = BORDER_SURNAMES.length * BORDER_GIVEN_NAMES.length;
  // 97은 384와 서로소라 모든 조합을 돌기 전에는 이름이 반복되지 않는다.
  const nameIndex = (stableHash(seed, 'border-commander-name') + safeTerm * 97) % nameCount;
  const surname = BORDER_SURNAMES[Math.floor(nameIndex / BORDER_GIVEN_NAMES.length)];
  const givenName = BORDER_GIVEN_NAMES[nameIndex % BORDER_GIVEN_NAMES.length];
  return {
    name: `${surname}${givenName}`,
    temper: pick(BORDER_TEMPER_ORDER, seed, `border-temper:${safeTerm}`),
    termIndex: safeTerm,
    tributeLeniencyUsed: false,
  };
}

function validFactionLeader(value: unknown): value is FactionLeader {
  if (!value || typeof value !== 'object') return false;
  const leader = value as Partial<FactionLeader>;
  return typeof leader.name === 'string' && leader.name.length > 0 &&
    (leader.title === '족장' || leader.title === '추장') &&
    FACTION_TEMPER_ORDER.includes(leader.temper as FactionLeaderTemper);
}

function validBorderCommander(value: unknown, expectedTerm: number): value is BorderCommander {
  if (!value || typeof value !== 'object') return false;
  const commander = value as Partial<BorderCommander>;
  return typeof commander.name === 'string' && commander.name.length > 0 &&
    commander.termIndex === expectedTerm &&
    BORDER_TEMPER_ORDER.includes(commander.temper as BorderCommanderTemper);
}

export function normalizeDiplomaticFigures(state: GameState): void {
  const generatedLeaders = createFactionLeaders(state.seed);
  const rawLeaders = state.factionLeaders && typeof state.factionLeaders === 'object'
    ? state.factionLeaders
    : {};
  state.factionLeaders = Object.fromEntries(DIPLOMATIC_FACTION_NAMES.map(factionName => [
    factionName,
    validFactionLeader(rawLeaders[factionName]) ? rawLeaders[factionName] : generatedLeaders[factionName],
  ]));

  const expectedTerm = borderCommanderTermIndex(state.day);
  if (!validBorderCommander(state.borderCommander, expectedTerm)) {
    state.borderCommander = createBorderCommander(state.seed, expectedTerm);
  } else {
    state.borderCommander.tributeLeniencyUsed = state.borderCommander.tributeLeniencyUsed === true;
  }
}

export function updateDiplomaticFigures(state: GameState): void {
  const termIndex = borderCommanderTermIndex(state.day);
  if (state.borderCommander?.termIndex === termIndex) return;

  state.borderCommander = createBorderCommander(state.seed, termIndex);
  const subject = `${BORDER_COMMANDER_TITLE} ${state.borderCommander.name}`;
  const text = `${withJosa(subject, '이/가')} 새로 부임했습니다. ${borderCommanderRumor(state.borderCommander.temper)}`;
  recordAnnalsWithLog(state, 'court', text, 'info', `border-commander:${termIndex}`);
}

export function factionLeaderFor(state: GameState, factionName: string): FactionLeader | null {
  if (!isDiplomaticFactionName(factionName)) return null;
  return state.factionLeaders?.[factionName] ?? null;
}

export function factionLeaderPortraitPath(
  leader: Pick<FactionLeader, 'name' | 'temper'>,
): string {
  return `/assets/portraits/faction-${leader.temper}-${portraitVariant(leader.name)}.png`;
}

export function borderCommanderPortraitPath(
  commander: Pick<BorderCommander, 'name' | 'temper'>,
): string {
  return `/assets/portraits/border-${commander.temper}-${portraitVariant(commander.name)}.png`;
}

// 습격·통첩처럼 세력 전체가 행동하는 문구에서는 지도자의 무리로 보이게 한다.
// 지도자가 없는 변경 마적·상단은 기존 세력명을 그대로 쓴다.
export function factionLeaderSubject(state: GameState, factionName: string): string {
  const leader = factionLeaderFor(state, factionName);
  return leader ? `${leader.name} ${leader.title}` : factionName;
}

export function factionRaidPartyLabel(state: GameState, factionName: string): string {
  const leader = factionLeaderFor(state, factionName);
  return leader ? `${leader.name} ${leader.title}의 무리` : factionName;
}

export function factionLeaderTemperLabel(temper: FactionLeaderTemper): string {
  return {
    bold: '호방',
    wily: '노회',
    taciturn: '과묵',
    fierce: '사나움',
  }[temper];
}

export function factionLeaderGreeting(leader: FactionLeader): string {
  return {
    bold: '먼 길을 왔으니 좋은 물목으로 시원하게 담판하자고 하오.',
    wily: '오래 갈 약속이라면 서로의 셈을 찬찬히 맞춰 보자고 하오.',
    taciturn: '말보다 물목을 보고 정하겠다고 전하였소.',
    fierce: '빈손으로 돌아갈 생각은 없으니 신중히 값을 부르시오.',
  }[leader.temper];
}

export function factionLeaderEnvoyLabel(leader: FactionLeader): string {
  return `${withJosa(`${leader.name} ${leader.title}`, '이/가')} 보낸 사절`;
}

export function borderCommanderTemperLabel(temper: BorderCommanderTemper): string {
  return {
    strict: '엄격',
    greedy: '탐욕',
    lenient: '온건',
    tactician: '지장',
  }[temper];
}

export function borderCommanderRumor(temper: BorderCommanderTemper): string {
  return {
    strict: '송사에 엄한 자라더라.',
    greedy: '손이 크다는 소문이 곱지 않다.',
    lenient: '변방 사정에 너그러운 무관이라더라.',
    tactician: '국경 지리에 밝은 무관이라더라.',
  }[temper];
}

interface BorderCommanderEffects {
  suspicionRiseMultiplier: number;
  suspicionNaturalDecayMultiplier: number;
  courtGrantRankShift: number;
  petitionReputationMultiplier: number;
  petitionResourceMultiplier: number;
  threatDecayMultiplier: number;
}

export function borderCommanderEffects(
  state: Pick<GameState, 'borderCommander'>,
): BorderCommanderEffects {
  const effects = CONFIG.borderCommanderEffects;
  const base: BorderCommanderEffects = {
    suspicionRiseMultiplier: 1,
    suspicionNaturalDecayMultiplier: 1,
    courtGrantRankShift: 0,
    petitionReputationMultiplier: 1,
    petitionResourceMultiplier: 1,
    threatDecayMultiplier: 1,
  };
  switch (state.borderCommander.temper) {
    case 'strict':
      return {
        ...base,
        suspicionRiseMultiplier: effects.strictSuspicionRiseMultiplier,
        courtGrantRankShift: effects.strictGrantRankShift,
      };
    case 'greedy':
      return {
        ...base,
        courtGrantRankShift: effects.greedyGrantRankShift,
        petitionReputationMultiplier: effects.greedyPetitionReputationMultiplier,
      };
    case 'lenient':
      return {
        ...base,
        suspicionNaturalDecayMultiplier: effects.lenientSuspicionDecayMultiplier,
      };
    case 'tactician':
      return {
        ...base,
        petitionResourceMultiplier: effects.tacticianPetitionResourceMultiplier,
        threatDecayMultiplier: effects.tacticianThreatDecayMultiplier,
      };
  }
}

export function borderCommanderDaysRemaining(state: Pick<GameState, 'day' | 'borderCommander'>): number {
  const lastDay = (state.borderCommander.termIndex + 1) * CONFIG.time.yearDays * 2;
  return Math.max(0, lastDay - state.day + 1);
}
