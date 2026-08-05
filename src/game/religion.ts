// 종교 — 사람이 먼저 온다. 떠돌이 무당/노승이 마을에 들어와야 당집/암자를 지을 수 있고,
// 시설은 상주 인력 없이도 기본 만족(신앙)을 준다. 월향·해운은 후계를 남기며,
// 네임드가 상주할 때만 일반 후계자보다 강한 큰굿·천도재 효과를 낸다.
// 계획: docs/superpowers/plans/2026-07-17-satisfaction-religion.md (M3)
import { withJosa } from './josa';
import { CONFIG } from './config';
import { computeDefense } from './buildings';
import { JOB_NAMES, rankAtLeast } from './constants';
import { addLog } from './events';
import { returnResidentCart } from './equipment';
import { resetAgent } from './agents';
import {
  createResident, reconcileResidentHomes,
} from './residents';
import { residentLogName } from './residentLogName';
import { makeRng } from './map';
import { specialResidentDefinition } from './specialResidents';
import {
  reconcileMountAssignments, reconcileWeaponAssignments,
} from './weapons';
import { clearIncompatibleAssignment } from './workerSlots';
import type {
  GameState, JobId, ReligionId, Resident, SpecialResidentId,
} from './types';

interface ReligionPerson {
  special: SpecialResidentId;
  religion: ReligionId;
  name: string;
  gender: 'male' | 'female';
  age: number;
  job: 'shaman' | 'monk';
  building: '당집' | '암자';
  title: string;
  body: string;
  acceptLabel: string;
}

const PERSONS: ReligionPerson[] = [
  {
    special: 'mudang',
    religion: 'shamanism',
    name: '만신 월향',
    gender: 'female',
    age: CONFIG.religion.mudangAge,
    job: 'shaman',
    building: '당집',
    title: '떠돌이 무당 — 방울 소리',
    body:
      '방울과 부채를 진 무당이 성문 앞에 섰습니다. 스스로를 만신 월향이라 부르는 그는\n' +
      '이 땅의 산신이 당집을 원한다고 말합니다. 받아들이면 당집을 지을 수 있게 되고,\n' +
      '무당이 당집에 상주하면 마을의 기운이 오릅니다.',
    acceptLabel: '무당을 받아들인다',
  },
  {
    special: 'nosung',
    religion: 'buddhism',
    name: '노승 해운',
    gender: 'male',
    age: CONFIG.religion.nosungAge,
    job: 'monk',
    building: '암자',
    title: '늙은 승려 — 목탁 소리',
    body:
      '잿빛 승복의 노승이 마을에 의탁을 청합니다. 해운이라 불리는 그는 산기슭에 암자를\n' +
      '들이고 세상을 떠난 이들의 명복을 빌겠다 합니다. 받아들이면 암자를 지을 수 있게 되고,\n' +
      '노승이 암자에 상주하면 상을 당한 마을의 슬픔이 덜합니다.',
    acceptLabel: '노승을 받아들인다',
  },
];

function unlockedReligionsOf(state: GameState): ReligionId[] {
  if (!state.unlockedReligions) state.unlockedReligions = [];
  return state.unlockedReligions;
}

function spentSpecials(state: GameState): SpecialResidentId[] {
  if (!state.spentSpecialIds) state.spentSpecialIds = [];
  return state.spentSpecialIds;
}

function forceReligiousJob(
  state: GameState,
  resident: Resident,
  job: Extract<JobId, 'shaman' | 'monk'>,
  mentor?: Resident | null,
): void {
  returnResidentCart(state, resident);
  resident.religiousVocation = job;
  if (mentor) resident.religiousMentorId = mentor.id;
  else delete resident.religiousMentorId;
  resident.job = job;
  clearIncompatibleAssignment(state, resident);
  resetAgent(state, resident);
  resident.task = JOB_NAMES[job];
  reconcileWeaponAssignments(state);
  reconcileMountAssignments(state);
  state.resources.defense = computeDefense(state);
}

function successorCandidate(state: GameState, rng: () => number): Resident | null {
  const candidates = state.residents.filter(resident =>
    resident.alive && !resident.stage && !resident.special && !resident.religiousVocation &&
    resident.job !== 'shaman' && resident.job !== 'monk');
  if (candidates.length === 0) return null;
  return candidates[Math.min(candidates.length - 1, Math.floor(rng() * candidates.length))];
}

function ensureShamanSuccession(state: GameState, rng: () => number): void {
  if (!isReligionUnlocked(state, 'shamanism')) return;
  const livingShamans = state.residents.filter(resident =>
    resident.alive && resident.job === 'shaman');
  const livingShamanIds = new Set(livingShamans.map(resident => resident.id));
  const named = livingShamans.find(resident => resident.special === 'mudang');
  const lineageHolder = named ?? [...livingShamans]
    .filter(resident =>
      resident.religiousMentorId == null ||
      !livingShamanIds.has(resident.religiousMentorId))
    .sort((left, right) => left.id - right.id)[0];
  if (lineageHolder) {
    const hasLivingSuccessor = livingShamans.some(resident =>
      resident.religiousMentorId === lineageHolder.id);
    if (hasLivingSuccessor) return;
    if (lineageHolder.special === 'mudang' &&
        lineageHolder.age < CONFIG.religion.mudangSuccessionAge) return;
  }

  const successor = successorCandidate(state, rng);
  if (!successor) return;
  forceReligiousJob(state, successor, 'shaman', lineageHolder);
  addLog(
    state,
    lineageHolder
      ? `${withJosa(residentLogName(lineageHolder), '이/가')} ${withJosa(residentLogName(successor), '을/를')} 신제자로 삼아 내림굿을 내렸습니다. ${withJosa(residentLogName(successor), '은/는')} 다음 신맥을 이을 단 한 명의 후계자가 되었습니다.`
      : `월향에게서 시작된 신맥이 ${residentLogName(successor)}에게 내렸습니다. ${withJosa(residentLogName(successor), '은/는')} 끊어진 무당의 소명을 다시 이었습니다.`,
    'good',
    true,
  );
}

function createMonkNovice(
  state: GameState,
  rng: () => number,
  mentor: Resident | null,
): Resident {
  const novice = createResident(state, rng, 'idle');
  novice.age = 2;
  novice.stage = 'youth';
  novice.stageProgress = 0;
  novice.youthActivity = 'work';
  novice.education = 0;
  novice.religiousVocation = 'monk';
  if (mentor) novice.religiousMentorId = mentor.id;
  novice.job = 'idle';
  novice.assignedBuildingId = null;
  novice.task = '동자승';
  state.residents.push(novice);
  reconcileResidentHomes(state, rng);
  addLog(
    state,
    mentor
      ? `${withJosa(residentLogName(mentor), '이/가')} ${withJosa(residentLogName(novice), '을/를')} 거두었습니다. 성인이 되면 승려의 길을 잇습니다.`
      : `해운이 생전에 거두어 둔 ${withJosa(residentLogName(novice), '이/가')} 암자의 법맥을 잇기 위해 모습을 드러냈습니다.`,
    'good',
    true,
  );
  return novice;
}

function ensureMonkSuccession(state: GameState, rng: () => number): void {
  if (!isReligionUnlocked(state, 'buddhism')) return;
  const livingNovice = state.residents.some(resident =>
    resident.alive && resident.religiousVocation === 'monk' && resident.stage != null);
  if (livingNovice) return;

  const livingMonks = state.residents
    .filter(resident => resident.alive && !resident.stage && resident.job === 'monk')
    .sort((left, right) =>
      Number(right.special === 'nosung') - Number(left.special === 'nosung') ||
      right.age - left.age ||
      left.id - right.id);
  const mentor = livingMonks.find(candidate =>
    candidate.age >= CONFIG.religion.monkNoviceMentorAge &&
    !state.residents.some(resident =>
      resident.alive && resident.religiousMentorId === candidate.id));
  if (mentor) {
    createMonkNovice(state, rng, mentor);
    return;
  }
  if (livingMonks.length === 0) createMonkNovice(state, rng, null);
}

export function reconcileReligiousSuccession(state: GameState, rng: () => number): void {
  ensureShamanSuccession(state, rng);
  ensureMonkSuccession(state, rng);
}

function isReligionUnlocked(state: GameState, religion: ReligionId): boolean {
  return unlockedReligionsOf(state).includes(religion);
}

function openReligionChoice(state: GameState, person: ReligionPerson): void {
  const definition = specialResidentDefinition(person.special);
  state.pendingChoice = {
    kind: 'religion',
    title: person.title,
    body: person.body,
    illustration: definition.illustration,
    options: [
      {
        id: 'accept',
        label: person.acceptLabel,
        desc: `${withJosa(person.name, '이/가')} 주민이 되고 ${person.building} 건설이 열립니다. 종교는 순수한 만족 콘텐츠 — 조정의 눈총은 없습니다.`,
      },
      {
        id: 'decline',
        label: '돌려보낸다',
        desc: '지금은 때가 아닙니다. 훗날 다시 문을 두드릴 수 있습니다.',
      },
    ],
    data: { special: person.special },
  };
  addLog(state, `${withJosa(person.name, '이/가')} 마을 어귀에 나타났습니다.`, 'info', true);
}

export function resolveReligionChoice(state: GameState, optionId: string): void {
  const choice = state.pendingChoice;
  if (!choice || choice.kind !== 'religion') return;
  state.pendingChoice = null;
  const person = PERSONS.find(candidate => candidate.special === choice.data.special);
  if (!person) return;
  const r = CONFIG.religion;

  if (optionId !== 'accept') {
    state.religionOfferCooldownUntil = state.day + r.declineRetryDays;
    addLog(state, `${withJosa(person.name, '이/가')} 조용히 발길을 돌렸습니다. 인연이 있으면 다시 올 것입니다.`, 'info');
    return;
  }

  const rng = makeRng(state.seed + state.day * 2749 + 19);
  const resident = createResident(state, rng, person.job);
  resident.name = person.name;
  resident.gender = person.gender;
  resident.age = person.age;
  resident.special = person.special;
  state.residents.push(resident);
  reconcileResidentHomes(state, rng);
  spentSpecials(state).push(person.special);
  unlockedReligionsOf(state).push(person.religion);
  state.religionOfferCooldownUntil = state.day + r.declineRetryDays;
  addLog(
    state,
    `${withJosa(person.name, '이/가')} 마을 사람이 되었습니다. 이제 ${withJosa(person.building, '을/를')} 지을 수 있습니다.`,
    'good',
    true,
  );
  reconcileReligiousSuccession(state, rng);
}

// 일일 판정 — 진(鎭) 이상에서 아직 오지 않은 종교인이 낮은 확률로 문을 두드린다.
export function dailyReligionTick(state: GameState, rng: () => number): void {
  reconcileReligiousSuccession(state, rng);
  const r = CONFIG.religion;
  if (!rankAtLeast(state.rank, r.minRank)) return;
  if (state.pendingChoice || state.battle || state.gameOver) return;
  if (state.day < (state.religionOfferCooldownUntil ?? 0)) return;
  const candidates = PERSONS.filter(person =>
    !spentSpecials(state).includes(person.special) && !isReligionUnlocked(state, person.religion));
  if (candidates.length === 0) return;
  if (rng() >= r.dailyChance) return;
  openReligionChoice(state, candidates[Math.floor(rng() * candidates.length)]);
}
