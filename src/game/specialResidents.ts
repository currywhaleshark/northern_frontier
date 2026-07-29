// 특수 주민 공통 명부와 사건 획득 규칙.
// UI·사건·렌더러가 같은 인물 정의를 쓴다.
import { withJosa } from './josa';
import { recordAnnals } from './annals';
import type { UiIconName } from '../ui/uiIconAssets';
import { CONFIG } from './config';
import { computeDefense } from './buildings';
import { rankAtLeast } from './constants';
import { JURCHEN_FACTION_NAMES } from './defectors';
import { addLog } from './events';
import { makeRng } from './map';
import { changeRelation, getRelation } from './relations';
import { createResident, reconcileResidentHomes } from './residents';
import { detachDepartingResidentFromFamily } from './family';
import { weaponStock } from './weapons';
import type {
  GameState,
  Gender,
  JobId,
  Rank,
  SpecialResidentId,
  SpecialResidentRecord,
} from './types';

// 특수 주민 고유의 패시브 스킬 — 명부·주민 선택 정보에 항상 붙어 다니는 표식.
// 종교인(무당·노승)은 존재 자체가 능력이라 스킬 없이 benefit 문구만 쓴다.
export interface SpecialResidentSkill {
  id: string;
  icon: UiIconName;
  name: string;
  effect: string;
}

export interface SpecialResidentDefinition {
  id: SpecialResidentId;
  name: string;
  shortName: string;
  badge: UiIconName;
  gender: Gender;
  age: number;
  job: JobId;
  epithet: string;
  story: string;
  benefit: string;
  risk: string;
  skills?: readonly SpecialResidentSkill[];
  illustration: { src: string; alt: string };
}

export const SPECIAL_RESIDENT_ROSTER: readonly SpecialResidentDefinition[] = [
  {
    id: 'mudang',
    name: '만신 월향',
    shortName: '월향',
    badge: 'shaman',
    gender: 'female',
    age: CONFIG.religion.mudangAge,
    job: 'shaman',
    epithet: '산신을 모시는 떠돌이 무당',
    story: '방울과 부채를 지니고 북방의 산신을 모시며 마을에 들어왔다.',
    benefit: '당집에 상주하면 마을의 사기를 끌어올린다.',
    risk: '지속적인 조정 위험은 없지만, 사망하면 다시 얻을 수 없다.',
    illustration: {
      src: '/assets/events/special-mudang-wolhyang-v1.png',
      alt: '눈 내리는 북방 성책 앞에 방울과 부채를 든 만신 월향',
    },
  },
  {
    id: 'nosung',
    name: '노승 해운',
    shortName: '해운',
    badge: 'monk',
    gender: 'male',
    age: CONFIG.religion.nosungAge,
    job: 'monk',
    epithet: '망자의 명복을 비는 떠돌이 승려',
    story: '잿빛 승복 한 벌로 변방을 걸으며 살아 있는 이와 죽은 이를 함께 돌본다.',
    benefit: '암자에 상주하면 사망과 장례의 슬픔을 줄인다.',
    risk: '노년의 자연사 위험을 지닌 대체 불가한 인물이다.',
    illustration: {
      src: '/assets/events/special-monk-haeun-v1.png',
      alt: '북방 개척지 성문 앞에 목탁과 바랑을 들고 선 노승 해운',
    },
  },
  {
    id: 'exiledScholar',
    name: '귀양 선비 윤문겸',
    shortName: '윤문겸',
    badge: 'scholar',
    gender: 'male',
    age: CONFIG.specialResidents.exiledScholarAge,
    job: 'clerk',
    epithet: '조정에서 쫓겨난 문신',
    story: '당쟁에 연루되어 북관에 안치된 문신. 장부와 문서에 능하지만 죄인을 가깝게 두면 조정이 의심한다.',
    benefit: `아전 고정 · 관청 효율 +${Math.round(CONFIG.specialResidents.exiledScholarOfficeBonus * 100)}%p`,
    risk: `보유 중 모반 의심 +${CONFIG.specialResidents.exiledScholarSuspicionPerDay.toFixed(2)}/일`,
    skills: [
      {
        id: 'hanyangBrush',
        icon: 'calligraphy',
        name: '한양의 붓끝',
        effect: `조정에서 단련된 문서 솜씨. 그가 관아에 있는 것만으로 관청 행정 효율 +${Math.round(CONFIG.specialResidents.exiledScholarOfficeBonus * 100)}%p.`,
      },
    ],
    illustration: {
      src: '/assets/events/special-exiled-scholar-yun-v1.png',
      alt: '검은 갓을 쓰고 눈 쌓인 북방 관아에서 임명장을 받는 귀양 선비 윤문겸',
    },
  },
  {
    id: 'jurchenWarrior',
    name: '귀순 무사 아라개',
    shortName: '아라개',
    badge: 'hostile',
    gender: 'male',
    age: CONFIG.specialResidents.jurchenWarriorAge,
    job: 'militia',
    epithet: '옛 무리를 등진 여진 창잡이',
    story: '두만강 너머의 지리와 말, 매복에 능한 무사. 마을을 지키지만 출신 세력은 배신자를 돌려달라고 압박한다.',
    benefit: `수비병 고정 · 개인 창 · 전술 기본 전력 +${CONFIG.specialResidents.jurchenWarriorBasePowerBonus} · 매복 능력`,
    risk: `모반 의심 +${CONFIG.specialResidents.jurchenWarriorSuspicionPerDay.toFixed(2)}/일 · 여진 관계 상승 둔화 · 송환 요구`,
    skills: [
      {
        id: 'shadowAmbush',
        icon: 'moon',
        name: '숲그늘 매복',
        effect: '사냥꾼만 아는 매복술을 익힌 수비병. 전술 전투에서 그의 무리는 매복 명령을 쓸 수 있다.',
      },
      {
        id: 'veteranSpear',
        icon: 'trident',
        name: '백전 창술',
        effect: `병기고와 무관하게 자신의 창으로 싸우며, 전술 기본 전력 +${CONFIG.specialResidents.jurchenWarriorBasePowerBonus}.`,
      },
    ],
    illustration: {
      src: '/assets/events/special-jurchen-warrior-aragae-v1.png',
      alt: '두만강 가의 북방 성책에서 긴 창을 내려놓고 귀순을 청하는 여진 무사 아라개',
    },
  },
  {
    id: 'tigerHunter',
    name: '착호 포수 박돌개',
    shortName: '박돌개',
    badge: 'tiger',
    gender: 'male',
    age: CONFIG.specialResidents.tigerHunterAge,
    job: 'hunter',
    epithet: '범 쫓다 한 눈을 잃은 늙은 포수',
    story: '평생 착호갑사로 범을 쫓다 한쪽 눈을 잃었다. 발자국만 보고 짐승의 크기와 성질을 읽는다.',
    benefit: `사냥꾼 고정 · 맹수 추적 -${CONFIG.specialResidents.tigerHunterScoutDaysReduction}일 · 전술 기본 전력 +${CONFIG.specialResidents.tigerHunterBasePowerBonus}`,
    risk: '고령 · 인근 고을에 범 피해가 나면 조정이 착호 징발을 요구한다',
    skills: [
      {
        id: 'trackReading',
        icon: 'tracking',
        name: '범 발자국 읽기',
        effect: `그가 마을에 있으면 맹수 흔적 추적 기간이 ${CONFIG.specialResidents.tigerHunterScoutDaysReduction}일 줄어든다.`,
      },
      {
        id: 'oneEyedAim',
        icon: 'target',
        name: '외눈 조준',
        effect: `백전의 사냥 솜씨. 전술 기본 전력 +${CONFIG.specialResidents.tigerHunterBasePowerBonus}.`,
      },
    ],
    illustration: {
      src: '/assets/events/special-tiger-hunter-bak-v1.png',
      alt: '눈 쌓인 산길에서 외눈으로 범 발자국을 살피는 착호 포수 박돌개',
    },
  },
  {
    id: 'geomancer',
    name: '맹인 지관 허생',
    shortName: '허생',
    badge: 'geomancer',
    gender: 'male',
    age: CONFIG.specialResidents.geomancerAge,
    job: 'miner',
    epithet: '지팡이로 산맥을 짚는 떠돌이 풍수',
    story: '눈이 멀고서야 산세가 보인다는 지관. 지팡이로 땅을 두드리며 맥을 짚는다.',
    benefit: `채광꾼 고정 · 채광 산출 +${Math.round(CONFIG.specialResidents.geomancerMiningYieldBonus * 100)}% · 은맥 발견 확률 상승`,
    risk: '은이 나오기 시작하면 잠채 소문이 더 빨리 퍼진다',
    skills: [
      {
        id: 'mountainReading',
        icon: 'geomancer',
        name: '산세 읽기',
        effect: `그가 마을에 있으면 모든 채광 산출 +${Math.round(CONFIG.specialResidents.geomancerMiningYieldBonus * 100)}%, 은맥을 알아볼 확률이 크게 오른다.`,
      },
    ],
    illustration: {
      src: '/assets/events/special-geomancer-heo-v1.png',
      alt: '북방 광산 어귀에서 지팡이로 바위의 맥을 짚는 맹인 지관 허생',
    },
  },
  {
    id: 'uinyeo',
    name: '내의원 의녀 단심',
    shortName: '단심',
    badge: 'herb',
    gender: 'female',
    age: CONFIG.specialResidents.uinyeoAge,
    job: 'physician',
    epithet: '누명을 쓰고 쫓겨난 궁중 의녀',
    story: '궁중 독살 사건에 연루되었다는 누명을 쓰고 북방으로 쫓겨났다. 진짜 죄가 있는지는 아무도 모른다.',
    benefit: `의원 고정 · 치료 효율 +${Math.round((CONFIG.specialResidents.uinyeoTreatmentMult - 1) * 100)}% · 역병 확산 억제`,
    risk: `죄인 은닉 — 모반 의심 +${CONFIG.specialResidents.uinyeoSuspicionPerDay.toFixed(2)}/일`,
    skills: [
      {
        id: 'goldenNeedle',
        icon: 'needle',
        name: '금침',
        effect: `내의원에서 익힌 침술. 자신의 치료 효율 +${Math.round((CONFIG.specialResidents.uinyeoTreatmentMult - 1) * 100)}%.`,
      },
      {
        id: 'quarantineCraft',
        icon: 'herb',
        name: '방역',
        effect: `그가 살아 있으면 역병이 번질 확률이 ${Math.round((1 - CONFIG.specialResidents.uinyeoEpidemicSpreadMult) * 100)}% 줄어든다.`,
      },
    ],
    illustration: {
      src: '/assets/events/special-uinyeo-dansim-v1.png',
      alt: '눈 덮인 개척지 의원에서 병자를 치료하는 내의원 의녀 단심',
    },
  },
  {
    id: 'runawaySmith',
    name: '도망 야장 막쇠',
    shortName: '막쇠',
    badge: 'smith',
    gender: 'male',
    age: CONFIG.specialResidents.runawaySmithAge,
    job: 'smith',
    epithet: '대갓집에서 도망친 천출 대장장이',
    story: '남쪽 대갓집에서 도망친 천출. 관노 시절 병장기를 만들던 손이라 솜씨가 장인 수준이다.',
    benefit: `대장장이 고정 · 자신의 대장간 산출 +${Math.round((CONFIG.specialResidents.runawaySmithSmithyMult - 1) * 100)}%`,
    risk: '추노꾼이 찾아온다 — 몸값을 치르거나, 내어주거나, 명성을 잃는다',
    skills: [
      {
        id: 'lowbornHammer',
        icon: 'smith',
        name: '천출의 망치',
        effect: `병장기를 만들던 손. 자신의 대장간 작업 산출 +${Math.round((CONFIG.specialResidents.runawaySmithSmithyMult - 1) * 100)}%.`,
      },
    ],
    illustration: {
      src: '/assets/events/special-runaway-smith-maksoe-v1.png',
      alt: '밤의 대장간에서 추노꾼을 경계하며 쇠를 두드리는 도망 야장 막쇠',
    },
  },
  {
    id: 'interpreter',
    name: '퇴역 역관 배수겸',
    shortName: '배수겸',
    badge: 'interpreter',
    gender: 'male',
    age: CONFIG.specialResidents.interpreterAge,
    job: 'clerk',
    epithet: '반평생 국경에서 여진말을 옮긴 노역관',
    story: '국경에서 반평생 여진말을 옮겼다. 강 건너 씨족 어른들과 술잔을 나눈 사이다.',
    benefit: `아전 고정 · 여진 관계 상승 +${Math.round((CONFIG.specialResidents.interpreterRelationGainMult - 1) * 100)}%`,
    risk: `양쪽에 발을 걸친 자 — 모반 의심 +${CONFIG.specialResidents.interpreterSuspicionPerDay.toFixed(2)}/일`,
    skills: [
      {
        id: 'jurchenTongue',
        icon: 'interpreter',
        name: '여진말 능통',
        effect: `여진 세력과의 관계 상승량 +${Math.round((CONFIG.specialResidents.interpreterRelationGainMult - 1) * 100)}%.`,
      },
    ],
    illustration: {
      src: '/assets/events/special-interpreter-bae-v1.png',
      alt: '북방 관아에서 여진 사절과 조선 관리 사이의 말을 옮기는 퇴역 역관 배수겸',
    },
  },
  {
    id: 'hangwae',
    name: '항왜 철포수 사야카',
    shortName: '사야카',
    badge: 'cannon',
    gender: 'male',
    age: CONFIG.specialResidents.hangwaeAge,
    job: 'militia',
    epithet: '왜란 때 조선에 귀순한 늙은 철포 부대장',
    story: '왜란 때 무리를 이끌고 조선에 귀순해 반평생을 변방에서 싸웠다. 늙었지만 철포 다루는 솜씨는 팔도에 짝이 없다.',
    benefit: `수비병 고정 · 개인 조총 · 조총 전력 +${CONFIG.specialResidents.hangwaeMusketPowerBonus} · 화약 소모 -${Math.round((1 - CONFIG.specialResidents.hangwaePowderMult) * 100)}%`,
    risk: `모반 의심 +${CONFIG.specialResidents.hangwaeSuspicionPerDay.toFixed(2)}/일 · 조정의 압송 요구`,
    skills: [
      {
        id: 'matchlockMaster',
        icon: 'cannon',
        name: '철포 백발',
        effect: `개인 조총을 늘 지니며, 조총 사격 전력 +${CONFIG.specialResidents.hangwaeMusketPowerBonus}.`,
      },
      {
        id: 'powderThrift',
        icon: 'fireworks',
        name: '화약 아끼는 손',
        effect: `그가 마을에 있으면 모든 조총 사수의 화약 소모가 ${Math.round((1 - CONFIG.specialResidents.hangwaePowderMult) * 100)}% 줄어든다.`,
      },
    ],
    illustration: {
      src: '/assets/events/special-hangwae-sayaka-v1.png',
      alt: '조선식 군복과 전립을 갖추고 철포를 든 백발의 항왜 철포수 사야카',
    },
  },
] as const;

export function specialResidentDefinition(id: SpecialResidentId): SpecialResidentDefinition {
  return SPECIAL_RESIDENT_ROSTER.find(candidate => candidate.id === id)!;
}

export function specialResidentSkills(id: SpecialResidentId): readonly SpecialResidentSkill[] {
  return specialResidentDefinition(id).skills ?? [];
}

export function specialResidentRecordsOf(
  state: GameState,
): Partial<Record<SpecialResidentId, SpecialResidentRecord>> {
  if (!state.specialResidentRecords) state.specialResidentRecords = {};
  return state.specialResidentRecords;
}

export function activeSpecialResident(state: GameState, id: SpecialResidentId) {
  return state.residents.find(resident => resident.alive && resident.special === id);
}

function markSpent(state: GameState, id: SpecialResidentId): void {
  if (!state.spentSpecialIds) state.spentSpecialIds = [];
  if (!state.spentSpecialIds.includes(id)) state.spentSpecialIds.push(id);
}

// 주기적 압박 사건(송환·압송·추노·징발)을 받는 인물의 재요구 간격
const DEMAND_COOLDOWNS: Partial<Record<SpecialResidentId, number>> = {
  jurchenWarrior: CONFIG.specialResidents.jurchenWarriorDemandCooldownDays,
  tigerHunter: CONFIG.specialResidents.tigerHunterDemandCooldownDays,
  runawaySmith: CONFIG.specialResidents.runawaySmithDemandCooldownDays,
  hangwae: CONFIG.specialResidents.hangwaeDemandCooldownDays,
};

function recruitSpecialResident(
  state: GameState,
  id: SpecialResidentId,
  rng: () => number,
  originFaction?: string,
): void {
  const definition = specialResidentDefinition(id);
  const resident = createResident(state, rng, definition.job);
  resident.name = definition.name;
  resident.gender = definition.gender;
  resident.age = definition.age;
  resident.special = id;
  resident.literate = true; // 이름 있는 인물은 모두 글을 안다
  if (originFaction) resident.origin = originFaction;
  state.residents.push(resident);
  reconcileResidentHomes(state, rng);
  const demandCooldown = DEMAND_COOLDOWNS[id];
  specialResidentRecordsOf(state)[id] = {
    status: 'active',
    residentId: resident.id,
    joinedDay: state.day,
    ...(originFaction ? { originFaction } : {}),
    ...(demandCooldown != null ? { nextDemandDay: state.day + demandCooldown } : {}),
  };
  markSpent(state, id);
  state.resources.defense = computeDefense(state);
  addLog(state, `${withJosa(definition.name, '이/가')} 마을 사람이 되었습니다.`, 'good', true);
  recordAnnals(state, 'special', `${withJosa(definition.name, '이/가')} 마을 사람이 되었습니다.`, `special:${id}`);
}

export function maybeOfferExiledScholar(state: GameState, rng: () => number): boolean {
  const id: SpecialResidentId = 'exiledScholar';
  if (!rankAtLeast(state.rank, CONFIG.specialResidents.exiledScholarMinRank)) return false;
  if (!state.buildings.some(building => building.built && building.type === 'office')) return false;
  if (state.pendingChoice || state.battle || state.gameOver) return false;
  if (state.spentSpecialIds?.includes(id) || specialResidentRecordsOf(state)[id]) return false;
  if (rng() >= CONFIG.specialResidents.exiledScholarDailyChance) return false;

  const definition = specialResidentDefinition(id);
  markSpent(state, id);
  state.pendingChoice = {
    kind: 'specialResident',
    title: '북관의 유배객 — 붓을 든 죄인',
    body:
      '조정에서 사람 하나를 이 변방에 안치하라는 공문이 왔습니다.\n' +
      `${withJosa(definition.shortName, '은/는')} 장부와 문서에 능하지만, 죄인을 관아에 들이면 조정의 눈초리를 감당해야 합니다.`,
    illustration: definition.illustration,
    options: [
      {
        id: 'appoint',
        label: '관아 일을 맡긴다',
        desc: `${withJosa(definition.name, '이/가')} 아전으로 합류합니다. ${definition.benefit}, ${definition.risk}.`,
      },
      {
        id: 'confine',
        label: '안치만 한다',
        desc: `${CONFIG.specialResidents.exiledScholarConfinedDays}일 안에 특수 주민 명부에서 다시 등용할 수 있습니다. 그동안 보너스와 리스크는 없습니다.`,
      },
    ],
    data: { special: id, phase: 'arrival' },
  };
  addLog(state, `${withJosa(definition.name, '을/를')} 북관에 안치하라는 공문이 도착했습니다.`, 'info', true);
  return true;
}

export function maybeOfferJurchenWarrior(state: GameState, rng: () => number): boolean {
  const id: SpecialResidentId = 'jurchenWarrior';
  if (!rankAtLeast(state.rank, CONFIG.specialResidents.jurchenWarriorMinRank)) return false;
  if (state.pendingChoice || state.battle || state.gameOver) return false;
  if (state.spentSpecialIds?.includes(id) || specialResidentRecordsOf(state)[id]) return false;
  const candidates = [...JURCHEN_FACTION_NAMES]
    .filter(name => getRelation(state, name) >= CONFIG.specialResidents.jurchenWarriorMinRelation)
    .sort((left, right) => getRelation(state, right) - getRelation(state, left) || left.localeCompare(right));
  const originFaction = candidates[0];
  if (!originFaction || rng() >= CONFIG.specialResidents.jurchenWarriorDailyChance) return false;

  const definition = specialResidentDefinition(id);
  markSpent(state, id);
  state.pendingChoice = {
    kind: 'specialResident',
    title: `성문 앞에 내려놓은 창 — ${originFaction}의 아라개`,
    body:
      `${originFaction}에서 이름난 창잡이 아라개가 무리를 등지고 귀순을 청합니다.\n` +
      '두만강 너머의 길과 매복을 아는 무사지만, 그를 품으면 옛 무리와 주변 여진 세력이 이 개척지를 곱게 보지 않을 것입니다.',
    illustration: definition.illustration,
    options: [
      {
        id: 'accept',
        label: '향화인으로 받아들인다',
        desc: `${withJosa(definition.name, '이/가')} 수비병으로 합류합니다. ${definition.benefit} ${definition.risk}`,
      },
      {
        id: 'decline',
        label: '창을 돌려준다',
        desc: '세력 관계와 조정 의심은 변하지 않습니다. 아라개는 다시 오지 않습니다.',
      },
    ],
    data: { special: id, phase: 'arrival', originFaction },
  };
  addLog(state, `${originFaction} 출신 무사 아라개가 귀순을 청했습니다.`, 'info', true);
  return true;
}

// 단순 도착 사건(받아들인다/돌려보낸다 2지선다) 공용 명세
interface SimpleArrivalSpec {
  id: SpecialResidentId;
  minRank: Rank;
  dailyChance: number;
  available: (state: GameState) => boolean;
  title: string;
  body: string;
  acceptLabel: string;
  acceptRole: string;
  declineLabel: string;
  declineDesc: string;
  offerLog: string;
}

const SIMPLE_ARRIVALS: readonly SimpleArrivalSpec[] = [
  {
    id: 'tigerHunter',
    minRank: CONFIG.specialResidents.tigerHunterMinRank,
    dailyChance: CONFIG.specialResidents.tigerHunterDailyChance,
    available: state => state.habitats?.some(habitat => habitat.active) ?? false,
    title: '외눈의 포수 — 착호갑사의 마지막 사냥터',
    body:
      '한쪽 눈에 헝겊을 두른 늙은 포수가 총 한 자루를 메고 성문 앞에 섰습니다.\n' +
      '평생 범을 쫓은 착호갑사 출신이라며, 마지막 사냥터로 이 변방을 골랐다고 합니다.',
    acceptLabel: '사냥꾼으로 받아들인다',
    acceptRole: '사냥꾼',
    declineLabel: '다른 산을 권한다',
    declineDesc: '박돌개는 총을 고쳐 메고 다른 산줄기로 떠납니다. 다시 오지 않습니다.',
    offerLog: '착호갑사 출신 포수 박돌개가 마을에 머물기를 청했습니다.',
  },
  {
    id: 'geomancer',
    minRank: CONFIG.specialResidents.geomancerMinRank,
    dailyChance: CONFIG.specialResidents.geomancerDailyChance,
    available: state => state.buildings.some(building => building.built && building.type === 'mine'),
    title: '지팡이 짚는 소경 — 산맥을 읽는 지관',
    body:
      '눈먼 노인이 지팡이로 광산 어귀의 바위를 두드리며 혼잣말을 합니다.\n' +
      '"이 산은 속이 차 있소." 소문난 지관 허생이 맞다면, 그의 지팡이는 값을 매길 수 없습니다.',
    acceptLabel: '채광꾼으로 받아들인다',
    acceptRole: '채광꾼',
    declineLabel: '헛소리로 치부한다',
    declineDesc: '허생은 지팡이를 끌며 안개 속으로 사라집니다. 다시 오지 않습니다.',
    offerLog: '맹인 지관 허생이 광산에 머물기를 청했습니다.',
  },
  {
    id: 'uinyeo',
    minRank: CONFIG.specialResidents.uinyeoMinRank,
    dailyChance: CONFIG.specialResidents.uinyeoDailyChance,
    available: state => state.buildings.some(building => building.built && building.type === 'clinic'),
    title: '약낭을 멘 여인 — 내의원에서 온 죄인',
    body:
      '약낭 하나만 멘 여인이 의원 앞에서 병자를 봐주고 있습니다.\n' +
      '궁중 독살 사건에 연루되어 쫓겨난 의녀라 합니다. 죄인을 거두면 조정의 눈초리도 함께 거두는 셈입니다.',
    acceptLabel: '의원으로 받아들인다',
    acceptRole: '의원',
    declineLabel: '조용히 보낸다',
    declineDesc: '단심은 약낭을 고쳐 메고 눈길을 떠납니다. 다시 오지 않습니다.',
    offerLog: '내의원 출신 의녀 단심이 의원에 머물기를 청했습니다.',
  },
  {
    id: 'runawaySmith',
    minRank: CONFIG.specialResidents.runawaySmithMinRank,
    dailyChance: CONFIG.specialResidents.runawaySmithDailyChance,
    available: state => state.buildings.some(building => building.built && building.type === 'smithy'),
    title: '숯검댕이 손 — 대장간에 숨어든 사내',
    body:
      '대장간 뒤에서 몰래 풀무질을 돕던 사내가 붙잡혔습니다. 손을 보니 평생 쇠를 만진 손입니다.\n' +
      '남쪽 대갓집에서 도망친 천출이라 합니다. 거두면 언젠가 추노꾼이 뒤따라올 것입니다.',
    acceptLabel: '대장장이로 받아들인다',
    acceptRole: '대장장이',
    declineLabel: '내보낸다',
    declineDesc: '막쇠는 고개를 숙이고 어둠 속으로 사라집니다. 다시 오지 않습니다.',
    offerLog: '도망 노비 출신 야장 막쇠가 대장간에 숨어 있다 발견되었습니다.',
  },
  {
    id: 'interpreter',
    minRank: CONFIG.specialResidents.interpreterMinRank,
    dailyChance: CONFIG.specialResidents.interpreterDailyChance,
    available: state => [...JURCHEN_FACTION_NAMES]
      .some(name => getRelation(state, name) >= CONFIG.specialResidents.interpreterMinRelation),
    title: '늙은 역관 — 국경의 마지막 통역',
    body:
      '퇴역한 역관 배수겸이 부(府)의 소문을 듣고 찾아왔습니다.\n' +
      '반평생 여진말을 옮긴 혀는 아직 녹슬지 않았지만, 양쪽 말을 다 하는 자를 조정은 곱게 보지 않습니다.',
    acceptLabel: '아전으로 받아들인다',
    acceptRole: '아전',
    declineLabel: '정중히 사양한다',
    declineDesc: '배수겸은 씁쓸히 웃으며 강가로 떠납니다. 다시 오지 않습니다.',
    offerLog: '퇴역 역관 배수겸이 관아에서 일하기를 청했습니다.',
  },
  {
    id: 'hangwae',
    minRank: CONFIG.specialResidents.hangwaeMinRank,
    dailyChance: CONFIG.specialResidents.hangwaeDailyChance,
    available: state => weaponStock(state, 'musket') >= 1,
    title: '녹슨 철포 — 왜란에서 돌아선 노병',
    body:
      '백발의 노인이 낡았지만 손질이 잘된 철포를 안고 성문 앞에 섰습니다.\n' +
      '왜란 때 조선에 귀순한 항왜 부대장이라 합니다. 팔도에 짝이 없는 솜씨지만, 왜인을 성책에 들이면 조정이 가만있지 않을 것입니다.',
    acceptLabel: '수비병으로 받아들인다',
    acceptRole: '수비병',
    declineLabel: '철포만 사서 보낸다',
    declineDesc: '사야카는 철포를 품에 안은 채 남쪽으로 떠납니다. 다시 오지 않습니다.',
    offerLog: '항왜 철포수 사야카가 성문 앞에서 귀부를 청했습니다.',
  },
];

function maybeOfferSimpleArrival(state: GameState, rng: () => number, spec: SimpleArrivalSpec): boolean {
  if (!rankAtLeast(state.rank, spec.minRank)) return false;
  if (state.pendingChoice || state.battle || state.gameOver) return false;
  if (state.spentSpecialIds?.includes(spec.id) || specialResidentRecordsOf(state)[spec.id]) return false;
  if (!spec.available(state) || rng() >= spec.dailyChance) return false;

  const definition = specialResidentDefinition(spec.id);
  markSpent(state, spec.id);
  state.pendingChoice = {
    kind: 'specialResident',
    title: spec.title,
    body: spec.body,
    illustration: definition.illustration,
    options: [
      {
        id: 'accept',
        label: spec.acceptLabel,
        desc: `${withJosa(definition.name, '이/가')} ${withJosa(spec.acceptRole, '으로/로')} 합류합니다. ${definition.benefit}. ${definition.risk}.`,
      },
      { id: 'decline', label: spec.declineLabel, desc: spec.declineDesc },
    ],
    data: { special: spec.id, phase: 'arrival' },
  };
  addLog(state, spec.offerLog, 'info', true);
  return true;
}

export function resolveSpecialResidentChoice(
  state: GameState,
  optionId: string,
  rng: () => number,
): void {
  const choice = state.pendingChoice;
  if (!choice || choice.kind !== 'specialResident') return;
  const id = choice.data.special as SpecialResidentId;
  const phase = choice.data.phase;
  state.pendingChoice = null;

  if (id === 'exiledScholar' && phase === 'arrival') {
    if (optionId === 'appoint') {
      recruitSpecialResident(state, id, rng);
      return;
    }
    const untilDay = state.day + CONFIG.specialResidents.exiledScholarConfinedDays;
    specialResidentRecordsOf(state)[id] = { status: 'confined', availableUntilDay: untilDay };
    addLog(state, `윤문겸을 객사에 안치했습니다. ${untilDay}일까지 다시 등용할 수 있습니다.`, 'info', true);
    return;
  }

  if (id === 'exiledScholar' && phase === 'courtDemand') {
    if (optionId === 'surrender') {
      departSpecialResident(state, id);
      state.suspicion = Math.max(
        0,
        state.suspicion - CONFIG.specialResidents.exiledScholarSurrenderSuspicionRelief,
      );
      addLog(state, '조정의 명에 따라 윤문겸을 압송했습니다. 관아의 빈자리는 크지만 눈초리는 누그러졌습니다.', 'bad', true);
      return;
    }
    state.suspicion = Math.min(
      100,
      state.suspicion + CONFIG.specialResidents.exiledScholarHideSuspicionRise,
    );
    addLog(state, '윤문겸이 이미 병들어 움직일 수 없다고 둘러댔습니다. 조정의 의심이 더욱 깊어졌습니다.', 'bad', true);
    return;
  }

  if (id === 'exiledScholar' && phase === 'pardon') {
    if (optionId === 'return') {
      departSpecialResident(state, id);
      state.resources.reputation += CONFIG.specialResidents.exiledScholarPardonReputation;
      state.suspicion = Math.max(
        0,
        state.suspicion - CONFIG.specialResidents.exiledScholarPardonSuspicionRelief,
      );
      addLog(state, '윤문겸이 사면장을 품고 한양으로 떠났습니다. 조정은 변방에서 세운 그의 공을 함께 기록했습니다.', 'good', true);
      return;
    }
    addLog(state, '윤문겸은 사면 뒤에도 북방에 남아 장부를 지키겠다고 청했습니다.', 'good', true);
    return;
  }

  if (id === 'jurchenWarrior' && phase === 'arrival') {
    const originFaction = String(choice.data.originFaction ?? '오도리 씨족');
    if (optionId === 'accept') {
      recruitSpecialResident(state, id, rng, originFaction);
      changeRelation(state, originFaction, -CONFIG.specialResidents.jurchenWarriorRecruitRelationLoss);
      addLog(state, `${withJosa(originFaction, '은/는')} 아라개를 받아들인 일을 배신자 비호로 여깁니다.`, 'bad', true);
      return;
    }
    specialResidentRecordsOf(state)[id] = { status: 'declined', originFaction };
    addLog(state, '아라개는 창을 거두고 눈길 너머로 사라졌습니다. 다시 돌아오지 않을 것입니다.', 'info', true);
    return;
  }

  if (id === 'jurchenWarrior' && phase === 'warriorDemand') {
    const originFaction = String(choice.data.originFaction ?? '오도리 씨족');
    if (optionId === 'surrender') {
      departSpecialResident(state, id);
      changeRelation(state, originFaction, CONFIG.specialResidents.jurchenWarriorSurrenderRelationGain);
      addLog(state, `아라개를 ${originFaction}에 넘겼습니다. 성책을 지키던 창 하나가 사라졌습니다.`, 'bad', true);
      return;
    }
    changeRelation(state, originFaction, -CONFIG.specialResidents.jurchenWarriorRefuseRelationLoss);
    state.threat = Math.min(100, state.threat + CONFIG.specialResidents.jurchenWarriorRefuseThreatRise);
    addLog(state, `${originFaction}의 송환 요구를 거절했습니다. 국경 너머 무리의 기세가 험악해졌습니다.`, 'raid', true);
    return;
  }

  if (phase === 'arrival' && SIMPLE_ARRIVALS.some(spec => spec.id === id)) {
    if (optionId === 'accept') {
      recruitSpecialResident(state, id, rng);
      return;
    }
    specialResidentRecordsOf(state)[id] = { status: 'declined' };
    const definition = specialResidentDefinition(id);
    addLog(state, `${withJosa(definition.shortName, '은/는')} 발길을 돌렸습니다. 다시 오지 않을 것입니다.`, 'info', true);
    return;
  }

  if (id === 'tigerHunter' && phase === 'tigerLevy') {
    const hunter = activeSpecialResident(state, id);
    if (optionId === 'comply' && hunter) {
      state.resources.reputation += CONFIG.specialResidents.tigerHunterLevyReputation;
      hunter.health = Math.max(10, hunter.health - CONFIG.specialResidents.tigerHunterLevyHealthLoss);
      addLog(state, '박돌개가 이웃 고을의 범을 잡고 상처투성이로 돌아왔습니다. 조정이 그 공을 함께 기록했습니다.', 'good', true);
      return;
    }
    state.resources.reputation = Math.max(
      0, state.resources.reputation - CONFIG.specialResidents.tigerHunterRefuseReputationLoss,
    );
    addLog(state, '늙은 포수의 몸을 핑계로 착호 징발을 물렸습니다. 조정의 실망이 장계에 남았습니다.', 'bad', true);
    return;
  }

  if (id === 'runawaySmith' && phase === 'chuno') {
    if (optionId === 'pay') {
      state.resources.silver = Math.max(
        0, state.resources.silver - CONFIG.specialResidents.runawaySmithRansomSilver,
      );
      addLog(state, `추노꾼에게 은 ${withJosa(CONFIG.specialResidents.runawaySmithRansomSilver, '을/를')} 치르고 막쇠의 몸값을 셈했습니다. 언젠가 또 다른 자가 올지 모릅니다.`, 'info', true);
      return;
    }
    if (optionId === 'surrender') {
      departSpecialResident(state, id);
      addLog(state, '막쇠는 결박된 채 남쪽으로 끌려갔습니다. 대장간의 망치 소리가 절반으로 줄었습니다.', 'bad', true);
      return;
    }
    state.resources.reputation = Math.max(
      0, state.resources.reputation - CONFIG.specialResidents.runawaySmithRefuseReputationLoss,
    );
    addLog(state, '추노꾼을 빈손으로 내쫓았습니다. 도망 노비를 비호한다는 소문이 남쪽까지 퍼집니다.', 'bad', true);
    return;
  }

  if (id === 'hangwae' && phase === 'hangwaeDemand') {
    if (optionId === 'surrender') {
      departSpecialResident(state, id);
      state.suspicion = Math.max(0, state.suspicion - CONFIG.specialResidents.hangwaeSurrenderSuspicionRelief);
      addLog(state, '사야카는 철포를 반납하고 순순히 압송길에 올랐습니다. 조정의 눈초리가 누그러졌습니다.', 'bad', true);
      return;
    }
    state.suspicion = Math.min(100, state.suspicion + CONFIG.specialResidents.hangwaeRefuseSuspicionRise);
    addLog(state, '사야카가 이미 죽어 묻혔다고 둘러댔습니다. 조정의 의심이 깊어졌습니다.', 'bad', true);
    return;
  }

  if (id === 'uinyeo' && phase === 'exoneration') {
    if (optionId === 'return') {
      departSpecialResident(state, id);
      state.resources.reputation += CONFIG.specialResidents.uinyeoExonerationReputation;
      state.suspicion = Math.max(0, state.suspicion - CONFIG.specialResidents.uinyeoExonerationSuspicionRelief);
      addLog(state, '단심이 누명을 벗고 한양으로 돌아갔습니다. 변방에서 살린 목숨들이 그의 죄를 씻었습니다.', 'good', true);
      return;
    }
    addLog(state, '단심은 누명을 벗고도 북방의 병자 곁에 남기를 청했습니다.', 'good', true);
  }
}

function departSpecialResident(state: GameState, id: SpecialResidentId): void {
  const resident = activeSpecialResident(state, id);
  if (resident) {
    delete state.weaponAssignments[resident.id];
    delete state.mountAssignments[resident.id];
    detachDepartingResidentFromFamily(state, resident);
    state.residents = state.residents.filter(candidate => candidate.id !== resident.id);
  }
  specialResidentRecordsOf(state)[id] = { status: 'departed' };
  const rng = makeRng(state.seed + state.day * 3253 + 97);
  reconcileResidentHomes(state, rng);
  state.resources.defense = computeDefense(state);
}

export function appointConfinedSpecialResident(state: GameState, id: SpecialResidentId): string | null {
  const record = specialResidentRecordsOf(state)[id];
  if (id !== 'exiledScholar' || record?.status !== 'confined') return '지금 등용할 수 있는 인물이 아닙니다.';
  if ((record.availableUntilDay ?? -1) < state.day) return '이미 등용할 기회가 지났습니다.';
  const rng = makeRng(state.seed + state.day * 3253 + 71);
  recruitSpecialResident(state, id, rng);
  return null;
}

function syncSpecialResidentRecords(state: GameState): void {
  const records = specialResidentRecordsOf(state);
  for (const definition of SPECIAL_RESIDENT_ROSTER) {
    const resident = state.residents.find(candidate => candidate.special === definition.id);
    if (!resident) continue;
    if (resident.alive) {
      if (!records[definition.id]) {
        const demandCooldown = DEMAND_COOLDOWNS[definition.id];
        records[definition.id] = {
          status: 'active',
          residentId: resident.id,
          joinedDay: state.day,
          ...(resident.origin ? { originFaction: resident.origin } : {}),
          ...(demandCooldown != null ? { nextDemandDay: state.day + demandCooldown } : {}),
        };
      }
      continue;
    }
    if (records[definition.id]?.status === 'dead') continue;
    records[definition.id] = { status: 'dead', residentId: resident.id };
    addLog(
      state,
      `${withJosa(definition.name, '이/가')} 세상을 떠났습니다. 그 인연과 재주는 다시 돌아오지 않습니다.`,
      'bad',
      true,
    );
  }
}

export function maybeOpenExiledScholarFollowup(state: GameState, rng: () => number): boolean {
  const id: SpecialResidentId = 'exiledScholar';
  const scholar = activeSpecialResident(state, id);
  const record = specialResidentRecordsOf(state)[id];
  if (!scholar || record?.status !== 'active') return false;
  if (state.pendingChoice || state.battle || state.gameOver) return false;
  const definition = specialResidentDefinition(id);

  if (
    !record.courtDemandResolved
    && state.suspicion >= CONFIG.specialResidents.exiledScholarCourtDemandSuspicion
    && rng() < CONFIG.specialResidents.exiledScholarCourtDemandChance
  ) {
    record.courtDemandResolved = true;
    state.pendingChoice = {
      kind: 'specialResident',
      title: '한양의 추궁 — 유배객을 압송하라',
      body:
        '감찰을 마친 조정 관리가 윤문겸의 신병을 한양으로 보내라는 명을 내밀었습니다.\n' +
        '내어주면 그의 재주는 잃지만 의심을 덜 수 있습니다. 숨기면 관아의 손은 남아도 조정의 눈초리가 더 매서워집니다.',
      illustration: definition.illustration,
      options: [
        {
          id: 'surrender',
          label: '조정에 압송한다',
          desc: `윤문겸이 떠납니다. 모반 의심 -${CONFIG.specialResidents.exiledScholarSurrenderSuspicionRelief}.`,
        },
        {
          id: 'hide',
          label: '병들었다고 숨긴다',
          desc: `윤문겸은 남지만 모반 의심 +${CONFIG.specialResidents.exiledScholarHideSuspicionRise}.`,
        },
      ],
      data: { special: id, phase: 'courtDemand' },
    };
    addLog(state, '조정에서 윤문겸의 신병을 요구했습니다.', 'bad', true);
    return true;
  }

  const serviceDays = state.day - (record.joinedDay ?? state.day);
  if (
    !record.pardonResolved
    && serviceDays >= CONFIG.specialResidents.exiledScholarPardonServiceDays
    && state.suspicion <= CONFIG.specialResidents.exiledScholarPardonMaxSuspicion
    && rng() < CONFIG.specialResidents.exiledScholarPardonChance
  ) {
    record.pardonResolved = true;
    state.pendingChoice = {
      kind: 'specialResident',
      title: '한양의 사면 — 북방에서 씻은 죄',
      body:
        '변방의 장부를 바로잡은 공이 한양에 닿았습니다. 윤문겸의 죄를 사하고 벼슬길을 다시 열겠다는 교지가 내려왔습니다.\n' +
        '그를 돌려보내면 관아의 재주는 잃지만, 조정은 이 개척지의 공까지 함께 기억할 것입니다.',
      illustration: definition.illustration,
      options: [
        {
          id: 'return',
          label: '한양으로 돌려보낸다',
          desc: `윤문겸이 떠납니다. 명성 +${CONFIG.specialResidents.exiledScholarPardonReputation}, 모반 의심 -${CONFIG.specialResidents.exiledScholarPardonSuspicionRelief}.`,
        },
        {
          id: 'remain',
          label: '북방에 남기를 청한다',
          desc: '윤문겸이 계속 아전으로 남습니다. 이후 사면 제안은 다시 오지 않습니다.',
        },
      ],
      data: { special: id, phase: 'pardon' },
    };
    addLog(state, '윤문겸의 죄를 사한다는 교지가 내려왔습니다.', 'good', true);
    return true;
  }
  return false;
}

export function maybeOpenJurchenWarriorFollowup(state: GameState, rng: () => number): boolean {
  const id: SpecialResidentId = 'jurchenWarrior';
  const warrior = activeSpecialResident(state, id);
  const record = specialResidentRecordsOf(state)[id];
  if (!warrior || record?.status !== 'active') return false;
  if (state.pendingChoice || state.battle || state.gameOver) return false;
  const originFaction = record.originFaction ?? warrior.origin;
  if (!originFaction) return false;

  if (
    getRelation(state, originFaction) <= CONFIG.specialResidents.jurchenWarriorDesertRelationBelow
    && rng() < CONFIG.specialResidents.jurchenWarriorDesertChance
  ) {
    departSpecialResident(state, id);
    addLog(state, '아라개가 한밤중에 창과 활을 챙겨 성책을 떠났습니다. 어디로 갔는지는 아무도 모릅니다.', 'bad', true);
    return true;
  }

  if (
    state.day >= (record.nextDemandDay ?? 0)
    && rng() < CONFIG.specialResidents.jurchenWarriorDemandChance
  ) {
    record.nextDemandDay = state.day + CONFIG.specialResidents.jurchenWarriorDemandCooldownDays;
    const definition = specialResidentDefinition(id);
    state.pendingChoice = {
      kind: 'specialResident',
      title: `배신자를 내놓아라 — ${originFaction}의 사절`,
      body:
        `${originFaction}의 무장 사절이 성문 앞에 와서 아라개를 결박해 돌려보내라고 요구합니다.\n` +
        '내어주면 국경의 분노를 누그러뜨릴 수 있지만 정예 수비병을 잃습니다. 거절하면 습격의 명분을 더해 줍니다.',
      illustration: definition.illustration,
      options: [
        {
          id: 'surrender',
          label: '아라개를 넘긴다',
          desc: `아라개가 떠납니다. ${originFaction} 관계 +${CONFIG.specialResidents.jurchenWarriorSurrenderRelationGain}.`,
        },
        {
          id: 'refuse',
          label: '향화인을 지킨다',
          desc: `${originFaction} 관계 -${CONFIG.specialResidents.jurchenWarriorRefuseRelationLoss}, 위협 +${CONFIG.specialResidents.jurchenWarriorRefuseThreatRise}.`,
        },
      ],
      data: { special: id, phase: 'warriorDemand', originFaction },
    };
    addLog(state, `${originFaction}에서 아라개의 송환을 요구했습니다.`, 'raid', true);
    return true;
  }
  return false;
}

// 주기적 압박 사건 공통 게이트 — 활동 중 + 쿨다운 경과 + 일일 확률
function demandDue(
  state: GameState,
  id: SpecialResidentId,
  chance: number,
  rng: () => number,
): SpecialResidentRecord | null {
  const resident = activeSpecialResident(state, id);
  const record = specialResidentRecordsOf(state)[id];
  if (!resident || record?.status !== 'active') return null;
  if (state.pendingChoice || state.battle || state.gameOver) return null;
  if (state.day < (record.nextDemandDay ?? 0) || rng() >= chance) return null;
  return record;
}

export function maybeOpenTigerHunterFollowup(state: GameState, rng: () => number): boolean {
  const record = demandDue(state, 'tigerHunter', CONFIG.specialResidents.tigerHunterDemandChance, rng);
  if (!record) return false;
  record.nextDemandDay = state.day + CONFIG.specialResidents.tigerHunterDemandCooldownDays;
  state.pendingChoice = {
    kind: 'specialResident',
    title: '착호 징발 — 이웃 고을의 범 피해',
    body:
      '이웃 고을에 범이 내려와 사람이 상했다는 장계가 돌았습니다.\n' +
      '조정은 이름난 포수 박돌개를 착호에 보내라 명합니다. 보내면 공은 크지만, 늙은 포수가 성할 리 없습니다.',
    illustration: specialResidentDefinition('tigerHunter').illustration,
    options: [
      {
        id: 'comply',
        label: '포수를 보낸다',
        desc: `명성 +${CONFIG.specialResidents.tigerHunterLevyReputation}. 박돌개가 크게 다쳐 돌아옵니다.`,
      },
      {
        id: 'refuse',
        label: '늙은 몸을 핑계 댄다',
        desc: `명성 -${CONFIG.specialResidents.tigerHunterRefuseReputationLoss}.`,
      },
    ],
    data: { special: 'tigerHunter', phase: 'tigerLevy' },
  };
  addLog(state, '조정이 박돌개의 착호 징발을 명했습니다.', 'info', true);
  return true;
}

export function maybeOpenRunawaySmithFollowup(state: GameState, rng: () => number): boolean {
  const record = demandDue(state, 'runawaySmith', CONFIG.specialResidents.runawaySmithDemandChance, rng);
  if (!record) return false;
  record.nextDemandDay = state.day + CONFIG.specialResidents.runawaySmithDemandCooldownDays;
  const ransom = CONFIG.specialResidents.runawaySmithRansomSilver;
  const silver = Math.floor(state.resources.silver);
  state.pendingChoice = {
    kind: 'specialResident',
    title: '추노 — 대장간을 찾아온 사내들',
    body:
      '몽둥이를 든 사내들이 막쇠의 얼굴이 그려진 방을 들이밀며 대장간을 에워쌌습니다.\n' +
      '남쪽 대갓집이 보낸 추노꾼입니다. 몸값을 치르거나, 내어주거나, 내쫓아야 합니다.',
    illustration: specialResidentDefinition('runawaySmith').illustration,
    options: [
      {
        id: 'pay',
        label: '몸값을 치른다',
        desc: `은 ${ransom} 지불. 막쇠는 남습니다.`,
        ...(silver < ransom
          ? { disabled: true, disabledReason: `은 ${ransom} 필요 (보유 ${silver})` }
          : {}),
      },
      { id: 'surrender', label: '내어준다', desc: '막쇠가 끌려갑니다. 대장간 특기를 잃습니다.' },
      {
        id: 'refuse',
        label: '내쫓는다',
        desc: `명성 -${CONFIG.specialResidents.runawaySmithRefuseReputationLoss}. 추노꾼은 다시 올 것입니다.`,
      },
    ],
    data: { special: 'runawaySmith', phase: 'chuno' },
  };
  addLog(state, '추노꾼이 막쇠를 잡으러 대장간에 들이닥쳤습니다.', 'bad', true);
  return true;
}

export function maybeOpenHangwaeFollowup(state: GameState, rng: () => number): boolean {
  const record = demandDue(state, 'hangwae', CONFIG.specialResidents.hangwaeDemandChance, rng);
  if (!record) return false;
  record.nextDemandDay = state.day + CONFIG.specialResidents.hangwaeDemandCooldownDays;
  state.pendingChoice = {
    kind: 'specialResident',
    title: '왜인을 내놓아라 — 조정의 공문',
    body:
      '변방 성책에 왜인이 숨어 산다는 상소가 조정에 올라갔습니다.\n' +
      '사야카를 한양으로 압송하라는 공문이 내려왔습니다. 내어주면 의심은 덜지만 철포의 명수를 잃습니다.',
    illustration: specialResidentDefinition('hangwae').illustration,
    options: [
      {
        id: 'surrender',
        label: '압송에 응한다',
        desc: `사야카가 떠납니다. 모반 의심 -${CONFIG.specialResidents.hangwaeSurrenderSuspicionRelief}.`,
      },
      {
        id: 'hide',
        label: '이미 죽었다고 둘러댄다',
        desc: `사야카는 남지만 모반 의심 +${CONFIG.specialResidents.hangwaeRefuseSuspicionRise}.`,
      },
    ],
    data: { special: 'hangwae', phase: 'hangwaeDemand' },
  };
  addLog(state, '조정이 항왜 사야카의 압송을 명했습니다.', 'bad', true);
  return true;
}

export function maybeOpenUinyeoFollowup(state: GameState, rng: () => number): boolean {
  const id: SpecialResidentId = 'uinyeo';
  const uinyeo = activeSpecialResident(state, id);
  const record = specialResidentRecordsOf(state)[id];
  if (!uinyeo || record?.status !== 'active') return false;
  if (state.pendingChoice || state.battle || state.gameOver) return false;
  const serviceDays = state.day - (record.joinedDay ?? state.day);
  if (
    record.pardonResolved
    || serviceDays < CONFIG.specialResidents.uinyeoExonerationServiceDays
    || rng() >= CONFIG.specialResidents.uinyeoExonerationChance
  ) return false;
  record.pardonResolved = true;
  state.pendingChoice = {
    kind: 'specialResident',
    title: '누명 벗은 의녀 — 진범이 밝혀지다',
    body:
      '궁중 독살 사건의 진범이 잡혔다는 소식이 북방까지 닿았습니다.\n' +
      '단심의 죄가 씻겼으니 원하면 반가로 돌아갈 수 있습니다. 돌려보내면 의원의 손은 잃지만 조정은 이 개척지의 후의를 기억할 것입니다.',
    illustration: specialResidentDefinition('uinyeo').illustration,
    options: [
      {
        id: 'return',
        label: '한양으로 돌려보낸다',
        desc: `단심이 떠납니다. 명성 +${CONFIG.specialResidents.uinyeoExonerationReputation}, 모반 의심 -${CONFIG.specialResidents.uinyeoExonerationSuspicionRelief}.`,
      },
      { id: 'remain', label: '북방에 남기를 청한다', desc: '단심이 계속 의원으로 남습니다.' },
    ],
    data: { special: id, phase: 'exoneration' },
  };
  addLog(state, '단심의 누명이 벗겨졌다는 소식이 닿았습니다.', 'good', true);
  return true;
}

export function dailySpecialResidentTick(state: GameState, rng: () => number): void {
  syncSpecialResidentRecords(state);
  const scholar = specialResidentRecordsOf(state).exiledScholar;
  if (scholar?.status === 'confined' && (scholar.availableUntilDay ?? Infinity) < state.day) {
    specialResidentRecordsOf(state).exiledScholar = { status: 'departed' };
    const fate = rng() < 0.5 ? '사면되어 한양으로 돌아갔습니다' : '변방의 겨울을 넘기지 못했습니다';
    addLog(state, `안치했던 윤문겸은 ${fate}. 등용할 기회가 닫혔습니다.`, 'info', true);
  }
  if (state.pendingChoice) return;
  const followups = [
    maybeOpenExiledScholarFollowup,
    maybeOpenJurchenWarriorFollowup,
    maybeOpenTigerHunterFollowup,
    maybeOpenRunawaySmithFollowup,
    maybeOpenHangwaeFollowup,
    maybeOpenUinyeoFollowup,
  ];
  for (const followup of followups) {
    if (followup(state, rng)) return;
  }
  if (maybeOfferExiledScholar(state, rng) || maybeOfferJurchenWarrior(state, rng)) return;
  for (const spec of SIMPLE_ARRIVALS) {
    if (maybeOfferSimpleArrival(state, rng, spec)) return;
  }
}
