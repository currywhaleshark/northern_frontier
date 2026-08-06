import { getSeason } from './seasons';
import type { GameState, RaiderBand, Resident } from './types';
import type { ResidentSpeechFrequency } from '../ui/uiPrefs';
import { waterSupplySnapshot } from './waterSupply';
import { addLog } from './events';
import {
  BORDER_COMMANDER_TITLE, borderCommanderRumor, createBorderCommander,
} from './diplomaticFigures';
import { warParticipationSchedule } from './militaryAid';
import { CONFIG } from './config';
import { RESOURCE_NAMES } from './constants';

export type AmbientSpeechTone = 'ambient' | 'warning' | 'surprise';

export interface ActiveAmbientSpeech {
  id: string;
  speakerResidentId: number;
  text: string;
  tone: AmbientSpeechTone;
  startedAtMs: number;
  expiresAtMs: number;
}

interface RuntimeSpeechState {
  frequency: ResidentSpeechFrequency;
  visibleResidentIds: Set<number> | null;
  active: ActiveAmbientSpeech | null;
}

interface SpeechCandidate {
  id: string;
  factId: string;
  text: string;
  jobs?: Resident['job'][];
  priority?: number;
  oneShotId?: string;
  important?: boolean;
}

const runtimeByState = new WeakMap<GameState, RuntimeSpeechState>();

function runtime(state: GameState): RuntimeSpeechState {
  let value = runtimeByState.get(state);
  if (!value) {
    value = { frequency: 'normal', visibleResidentIds: null, active: null };
    runtimeByState.set(state, value);
  }
  return value;
}

export function setAmbientSpeechFrequency(state: GameState, frequency: ResidentSpeechFrequency): void {
  runtime(state).frequency = frequency;
}

export function setAmbientSpeechVisibleResidents(state: GameState, residentIds: readonly number[]): void {
  runtime(state).visibleResidentIds = new Set(residentIds);
}

export function activeAmbientSpeech(state: GameState, now = Date.now()): ActiveAmbientSpeech | null {
  const current = runtime(state).active;
  if (current && current.expiresAtMs <= now) {
    runtime(state).active = null;
    return null;
  }
  return current;
}

function stableNumber(...parts: Array<string | number>): number {
  let hash = 2166136261;
  for (const char of parts.join(':')) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function visibleEligibleResidents(state: GameState, urgent = false): Resident[] {
  const visible = runtime(state).visibleResidentIds;
  return state.residents.filter(resident => {
    if (!resident.alive || resident.health <= 0) return false;
    if (resident.stage === 'infant' || resident.stage === 'child') return false;
    if (!urgent && resident.phase === 'sleeping') return false;
    return visible == null || visible.has(resident.id);
  });
}

function chooseSpeaker(
  state: GameState,
  salt: string,
  preferredJobs: readonly Resident['job'][] = [],
  urgent = false,
): Resident | null {
  const residents = visibleEligibleResidents(state, urgent);
  if (residents.length === 0) return null;
  for (const job of preferredJobs) {
    const matching = residents.filter(resident => resident.job === job);
    if (matching.length > 0) return matching[stableNumber(state.seed, state.day, salt, job) % matching.length];
  }
  return residents[stableNumber(state.seed, state.day, salt) % residents.length];
}

function emit(
  state: GameState,
  speaker: Resident,
  text: string,
  tone: AmbientSpeechTone,
  durationMs: number,
  id: string,
): void {
  const now = Date.now();
  runtime(state).active = {
    id: `${state.day}:${state.subTick}:${id}:${speaker.id}`,
    speakerResidentId: speaker.id,
    text,
    tone,
    startedAtMs: now,
    expiresAtMs: now + durationMs,
  };
}

function slotTicks(frequency: ResidentSpeechFrequency): number[] {
  if (frequency === 'off') return [];
  if (frequency === 'low') return [31];
  if (frequency === 'often') return [14, 27, 42, 54];
  return [20, 48];
}

function pruneHistory(state: GameState): void {
  state.ambientSpeech.recentLines = state.ambientSpeech.recentLines
    .filter(entry => state.day - entry.day < 7)
    .slice(-24);
  state.ambientSpeech.recentFacts = state.ambientSpeech.recentFacts
    .filter(entry => state.day - entry.day < 3)
    .slice(-16);
  state.ambientSpeech.consumedSlotIds = state.ambientSpeech.consumedSlotIds.slice(-8);
  state.ambientSpeech.deliveredRumorIds = state.ambientSpeech.deliveredRumorIds.slice(-32);
}

function ambientCandidates(state: GameState): SpeechCandidate[] {
  const living = Math.max(1, state.residents.filter(resident => resident.alive).length);
  const candidates: SpeechCandidate[] = [];
  const add = (candidate: SpeechCandidate): void => { candidates.push(candidate); };

  const war = warParticipationSchedule(state);
  if (war && war.dayOfYear >= war.offerDay - 10 && war.dayOfYear < war.offerDay) {
    add({
      id: `war-rumor-${war.year}`,
      factId: `war-rumor-${war.year}`,
      oneShotId: `war-rumor-${war.year}`,
      priority: 100,
      important: true,
      text: `${war.requester}와 ${war.opponent} 사이가 심상치 않다더군. 전령들이 바삐 오간다던데.`,
      jobs: ['hauler', 'clerk', 'hunter'],
    });
  }

  const nextTerm = (state.borderCommander?.termIndex ?? 0) + 1;
  const commanderChangeDay = nextTerm * CONFIG.time.yearDays * 2 + 1;
  const commanderDaysUntil = commanderChangeDay - state.day;
  if (commanderDaysUntil >= 3 && commanderDaysUntil <= 10) {
    const commander = createBorderCommander(state.seed, nextTerm);
    add({
      id: `border-commander-rumor-${nextTerm}`,
      factId: `border-commander-rumor-${nextTerm}`,
      oneShotId: `border-commander-rumor-${nextTerm}`,
      priority: 100,
      important: true,
      text: `새 ${BORDER_COMMANDER_TITLE}가 온다더군. ${borderCommanderRumor(commander.temper)}`,
      jobs: ['clerk', 'hauler'],
    });
  }

  if (state.raiders && !state.raiders.spotted) {
    const center = state.buildings.find(building => building.type === 'center');
    const dx = center ? state.raiders.x - center.x : 0;
    const dy = center ? state.raiders.y - center.y : -1;
    const direction = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? '서쪽' : '동쪽') : (dy < 0 ? '북쪽' : '남쪽');
    add({
      id: 'raid-clue-smoke', factId: 'raid-approach',
      priority: 90,
      text: `${direction} 하늘에 저 연기는 뭐지? 평소 보던 산불 연기는 아닌데.`,
      jobs: ['hunter', 'woodcutter', 'herbalist'],
    });
  }
  if ((state.corpses ?? []).some(corpse => !corpse.carried && !corpse.withExpedition)) {
    add({ id: 'corpse-unburied', factId: 'unburied-corpse', priority: 60, text: '저 시신은 언제까지 그대로 둘 셈인가… 마음이 편치 않군.' });
  }
  if (state.ambientSpeech.lastDietVarietyScore < 0.5) {
    const foodName = state.ambientSpeech.lastDominantFood
      ? RESOURCE_NAMES[state.ambientSpeech.lastDominantFood]
      : '같은 음식';
    add({
      id: 'diet-monotony', factId: 'diet-monotony', priority: 60,
      text: `요즘은 ${foodName}만 먹으니 물리는군. 다른 찬도 좀 있었으면 좋겠어.`,
    });
  }
  const waterShort = [...waterSupplySnapshot(state).buildings.values()]
    .some(supply => supply.demand > 0 && supply.ratio < 0.65);
  if (waterShort) {
    add({ id: 'water-low', factId: 'water-shortage', priority: 60, text: '물독 바닥이 보인다. 오늘 안에 물을 더 길어야겠어.', jobs: ['hauler'] });
  }
  if (state.resources.firewood + state.resources.brushwood < living * 0.8) {
    add({ id: 'fuel-low', factId: 'fuel-shortage', priority: 60, text: '밤공기가 매서운데 땔감이 영 시원찮군.', jobs: ['woodSplitter', 'woodcutter'] });
  }
  if (state.residents.some(resident => resident.alive && resident.hunger < 35)) {
    add({ id: 'hunger-low', factId: 'hunger', priority: 60, text: '속이 비어서 손에 힘이 안 들어가는군…' });
  }
  if (state.threat >= 70) {
    add({
      id: 'threat-tense', factId: 'high-threat',
      priority: 50,
      text: '요즘 산길에서 낯선 발자국을 봤다는 이가 많아. 밤길을 조심해야겠어.',
      jobs: ['hunter', 'watchman'],
    });
  }

  const season = getSeason(state.day);
  if (season === 'spring') add({ id: 'spring-mud', factId: 'season-spring', text: '눈 녹은 흙냄새가 난다. 이제 다시 밭일이 바빠지겠군.', jobs: ['farmer'] });
  else if (season === 'summer') add({ id: 'summer-rain', factId: 'season-summer', text: '구름 모양을 보니 한바탕 쏟아질지도 모르겠어.' });
  else if (season === 'autumn') add({ id: 'autumn-wind', factId: 'season-autumn', text: '바람이 달라졌어. 겨울 몫을 서둘러 쌓아야겠군.' });
  else add({ id: 'winter-cold', factId: 'season-winter', text: '숨을 쉴 때마다 콧속이 얼얼하군. 오늘도 단단히 여며야겠어.' });

  add({ id: 'chatter-meal', factId: 'chatter-meal', text: '오늘 저녁엔 따뜻한 국물이 있으면 좋겠는데.' });
  add({ id: 'chatter-weather', factId: 'chatter-weather', text: '해가 제법 길어졌나, 하루가 어제보다 느긋하군.' });
  add({ id: 'chatter-work', factId: 'chatter-work', text: '이 일만 마치면 잠깐 허리 좀 펴야겠어.' });
  add({ id: 'chatter-road', factId: 'chatter-road', text: '장터 가는 길에 새 소식이라도 들을 수 있으려나.' });
  return candidates;
}

export function ambientSpeechTick(state: GameState): void {
  const speech = state.ambientSpeech;
  if (!speech) return;
  if (speech.lastProcessedDay !== state.day) {
    speech.lastProcessedDay = state.day;
    speech.consumedSlotIds = [];
    pruneHistory(state);
  }

  const frequency = runtime(state).frequency;
  const dueTicks = slotTicks(frequency).filter(tick => tick <= state.subTick);
  if (dueTicks.length === 0) return;
  for (const tick of dueTicks) {
    const slotId = `${state.day}:${tick}`;
    if (speech.consumedSlotIds.includes(slotId)) continue;
    // 고배속에서 놓친 말풍선은 밀린 순서대로 쏟아내지 않는다.
    if (state.subTick - tick > 6) {
      speech.consumedSlotIds.push(slotId);
      continue;
    }
    if (activeAmbientSpeech(state)) return;

    const recentLines = new Set(speech.recentLines.map(entry => entry.id));
    const recentFacts = new Set(speech.recentFacts.map(entry => entry.id));
    const allCandidates = ambientCandidates(state)
      .filter(candidate => !candidate.oneShotId || !speech.deliveredRumorIds.includes(candidate.oneShotId));
    const candidates = allCandidates.filter(candidate =>
      !recentLines.has(candidate.id) && !recentFacts.has(candidate.factId));
    const available = candidates.length > 0 ? candidates : allCandidates;
    if (available.length === 0) return;
    const highestPriority = Math.max(...available.map(candidate => candidate.priority ?? 10));
    const pool = available.filter(candidate => (candidate.priority ?? 10) === highestPriority);
    const candidate = pool[stableNumber(state.seed, state.day, tick) % pool.length];
    const speaker = chooseSpeaker(state, `slot-${tick}`, candidate.jobs);
    if (!speaker) return; // 화면 안에 깨어 있는 주민이 나타날 때까지 짧게 유예한다.

    emit(state, speaker, candidate.text, 'ambient', 4800, candidate.id);
    speech.consumedSlotIds.push(slotId);
    speech.recentLines.push({ id: candidate.id, day: state.day });
    speech.recentFacts.push({ id: candidate.factId, day: state.day });
    if (candidate.oneShotId) speech.deliveredRumorIds.push(candidate.oneShotId);
    if (candidate.important) addLog(state, `사람들 사이에 이런 소문이 돕니다. “${candidate.text}”`, 'info', true);
    pruneHistory(state);
    return;
  }
}

export function announceRaidSpawnSpeech(state: GameState, band: RaiderBand): void {
  if (!band.warned) return;
  const diplomatic = band.warningSource === 'diplomatic';
  const speaker = chooseSpeaker(
    state,
    `raid-spawn-${band.faction}`,
    diplomatic ? ['clerk', 'hauler'] : ['watchman', 'militia'],
    true,
  );
  if (!speaker) return;
  const text = diplomatic
    ? `오가는 이가 귀띔했소. ${band.faction} 쪽 무장대가 이리로 향한다는군!`
    : '봉수 신호다! 모두 대비하라, 무장대가 이쪽으로 온다!';
  emit(state, speaker, text, 'warning', 5600, `raid-spawn-${band.faction}`);
}

export function announceRaidProximitySpeech(state: GameState, band: RaiderBand): void {
  if (band.proximityAlerted) return;
  band.proximityAlerted = true;
  const speaker = chooseSpeaker(state, `raid-near-${band.faction}`, ['watchman', 'militia', 'hunter'], true);
  if (!speaker) return;
  if (band.warned) {
    emit(state, speaker, '보인다! 경보대로다. 각자 맡은 자리에서 대기하라!', 'warning', 5600, `raid-near-${band.faction}`);
  } else {
    emit(state, speaker, '적이다! 바로 코앞이다! 무기를 들어라!', 'surprise', 3600, `raid-near-${band.faction}`);
  }
}
