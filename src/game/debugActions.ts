/**
 * 개발용 치트 조작 모음 — docs/DESIGN-2026-08-03-debug-cheat-panel.md
 *
 * 규칙 세 가지:
 *  1. 치트 UI는 이 모듈만 부른다. 상태를 직접 찌르는 코드가 컴포넌트로 새지 않게 한다.
 *  2. 사건은 기존 발생 함수를 그대로 호출한다. 우회하는 것은 랜덤 게이트·쿨다운·확률뿐이고,
 *     사건이 굴러가는 규칙(선택지·진행·결산)은 평소 경로를 탄다.
 *  3. 단방향 의존 — 게임 코드는 이 모듈을 참조하지 않는다. 지우면 그냥 사라진다.
 *
 * 문구는 개발 도구답게 간결한 실무체로 쓰되, 게임 로그에 남기는 한 줄만 "(디버그)"를 붙인다.
 */
import { CONFIG } from './config';
import { JOB_NAMES, RANK_NAMES, RANK_ORDER, SEASON_NAMES, SEASON_ORDER } from './constants';
import { computeDefense } from './buildings';
import { addLog } from './events';
import { advanceDay } from './simulation';
import { getDayOfSeason, getSeason, getYear } from './seasons';
import { makeRng } from './map';
import { RESOURCE_DEFS, RESOURCE_ORDER } from './resourceCatalog';
import { SPECIAL_ITEM_DEFS, SPECIAL_ITEM_IDS, grantSpecialItem } from './specialItems';
import { createResident, killResident, livingResidents, reconcileResidentHomes } from './residents';
import { applyLifeStage } from './lifecycle';
import { IMPLEMENTED_LIVESTOCK_IDS, LIVESTOCK_DEFS, acquireLivestock } from './livestock';
import { openScriptedImmigrationChoice } from './immigration';
import { spawnRaiders } from './raids';
import { announceCourtTribute, openCourtTributeChoice } from './courtTribute';
import { nextRank, promotionDecreeItem, upgradeSettlementCenter } from './promotion';
import { SPECIAL_RESIDENT_ROSTER, recruitSpecialResident, specialResidentRecordsOf } from './specialResidents';
import {
  openDroughtEvent, openEarlyFrostEvent, openLateFrostEvent, openLivestockEpidemicEvent,
  openLocustEvent, openPlagueSuspicionEvent, startEpidemic,
} from './specialEvents';
import { hasPendingDisaster, startSnowDamage, startSpringFlood } from './disasters';
import { maybeStartFire } from './fire';
import { startMineCollapse } from './mineCollapse';
import { revealAround } from './exploration';
import { revealForeignSitesFromExploration } from './foreignSites';
import { normalizeHabitatReserve } from './habitats';
import { normalizeTidalFlatTile } from './tidalFlats';
import { TUTORIAL_STEPS } from './scenario';
import type {
  Gender, GameState, JobId, LifeStage, LivestockId, Resident, ResourceId, Season,
  SpecialItemId, SpecialResidentId,
} from './types';

// ─────────────────────────── 공통 ───────────────────────────

export type DebugResult =
  | { ok: true; detail: string }
  | { ok: false; reason: string };

/** 치트 실행 성공 — 표식을 남기고 로그 한 줄을 붙인다. */
function done(state: GameState, detail: string): DebugResult {
  markDebugTouched(state);
  addLog(state, `(디버그) ${detail}`, 'info', true);
  return { ok: true, detail };
}

function fail(reason: string): DebugResult {
  return { ok: false, reason };
}

/** 치트로 상태를 건드린 저장임을 남긴다 (게임플레이 불이익 없음). */
function markDebugTouched(state: GameState): void {
  state.debugTouched = true;
}

/**
 * 파괴적 조작(시간 점프·사건 발화) 잠금 사유. 기존 `__game.run` 가드와 같은 결이다.
 * 자원·수치처럼 되돌릴 수 있는 조작은 이 잠금을 보지 않는다.
 */
export function debugLockReason(state: GameState): string | null {
  if (state.gameOver) return '게임이 끝난 상태';
  if (state.pendingChoice) return '선택 모달이 열려 있음';
  if (state.pendingPromotionNotice) return '승격 안내가 열려 있음';
  if (state.tacticalBattle || state.tacticalBattleReport) return '전술 전투 진행 중';
  return null;
}

function requireUnlocked(state: GameState): string | null {
  const reason = debugLockReason(state);
  return reason ? `${reason} — 이 조작은 잠겨 있습니다` : null;
}

function debugRng(state: GameState, salt: number): () => number {
  // 게임의 결정론 시퀀스와 섞이지 않도록 별도 씨앗을 쓴다.
  return makeRng((state.seed + state.day * 7919 + salt * 104729) >>> 0);
}

function numberOr(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

// ─────────────────────────── 자원 ───────────────────────────

export const DEBUG_RESOURCE_IDS: readonly ResourceId[] = RESOURCE_ORDER;

export function resourceName(id: ResourceId): string {
  return RESOURCE_DEFS[id].name;
}

/** 자원 증감 — 대응 시스템 함수가 없어 직접 대입한다 (설계 §3). */
export function debugAddResource(state: GameState, id: ResourceId, delta: number): DebugResult {
  const amount = numberOr(delta, 0);
  if (amount === 0) return fail('증감량이 0입니다');
  const before = state.resources[id] ?? 0;
  state.resources[id] = Math.max(0, before + amount);
  const applied = state.resources[id] - before;
  return done(state, `${resourceName(id)} ${applied >= 0 ? '+' : ''}${round(applied)}`);
}

export function debugSetResource(state: GameState, id: ResourceId, value: number): DebugResult {
  const next = Math.max(0, numberOr(value, 0));
  state.resources[id] = next;
  return done(state, `${resourceName(id)} = ${round(next)}`);
}

/** 전 자원 일괄 지급 — 추상 자원(명성·방어도)은 상한이 다르므로 건드리지 않는다. */
export function debugAddAllResources(state: GameState, delta: number): DebugResult {
  const amount = numberOr(delta, 0);
  if (amount === 0) return fail('증감량이 0입니다');
  let count = 0;
  for (const id of RESOURCE_ORDER) {
    if (RESOURCE_DEFS[id].category === 'abstract') continue;
    state.resources[id] = Math.max(0, (state.resources[id] ?? 0) + amount);
    count++;
  }
  return done(state, `전 자원 ${amount >= 0 ? '+' : ''}${round(amount)} (${count}종)`);
}

export const DEBUG_SPECIAL_ITEM_IDS: readonly SpecialItemId[] = SPECIAL_ITEM_IDS;

export function specialItemName(id: SpecialItemId): string {
  return SPECIAL_ITEM_DEFS[id].name;
}

/** 기물함 지급 — 재고와 도감을 함께 갱신하는 기존 경로를 쓴다. */
export function debugGrantSpecialItem(state: GameState, id: SpecialItemId, count = 1): DebugResult {
  const times = Math.max(1, Math.floor(numberOr(count, 1)));
  for (let i = 0; i < times; i++) grantSpecialItem(state, id);
  return done(state, `${specialItemName(id)} +${times}`);
}

function round(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

// ─────────────────────────── 시간 ───────────────────────────

/** n일 진행 — 배속과 무관하게 즉시 돌린다. 모달·전투가 열리면 그 자리에서 멈춘다. */
export function debugAdvanceDays(state: GameState, days: number): DebugResult {
  const locked = requireUnlocked(state);
  if (locked) return fail(locked);
  const requested = Math.max(1, Math.floor(numberOr(days, 1)));
  const startDay = state.day;
  let advanced = 0;
  for (let i = 0; i < requested; i++) {
    if (debugLockReason(state)) break;
    advanceDay(state);
    advanced++;
  }
  if (advanced === 0) return fail('하루도 진행하지 못했습니다');
  const stopped = advanced < requested ? ` (요청 ${requested}일 중 중단)` : '';
  return done(state, `${advanced}일 진행 — ${startDay}일차 → ${state.day}일차${stopped}`);
}

export function debugAdvanceToNextSeason(state: GameState): DebugResult {
  const locked = requireUnlocked(state);
  if (locked) return fail(locked);
  const remaining = CONFIG.time.seasonDays - getDayOfSeason(state.day) + 1;
  return debugAdvanceDays(state, remaining);
}

function debugTargetDay(year: number, season: Season, dayOfSeason: number): number {
  const seasonIndex = Math.max(0, SEASON_ORDER.indexOf(season));
  const y = Math.max(1, Math.floor(numberOr(year, 1)));
  const d = Math.min(CONFIG.time.seasonDays, Math.max(1, Math.floor(numberOr(dayOfSeason, 1))));
  return (y - 1) * CONFIG.time.yearDays + seasonIndex * CONFIG.time.seasonDays + d;
}

/** 특정 연차·계절·일로 이동 — 시간은 되돌릴 수 없으므로 앞으로만 간다. */
export function debugJumpToDate(
  state: GameState, year: number, season: Season, dayOfSeason: number,
): DebugResult {
  const locked = requireUnlocked(state);
  if (locked) return fail(locked);
  const target = debugTargetDay(year, season, dayOfSeason);
  if (target <= state.day) {
    return fail(`과거로는 갈 수 없습니다 (현재 ${state.day}일차, 요청 ${target}일차)`);
  }
  return debugAdvanceDays(state, target - state.day);
}

export function debugDateLabel(state: GameState): string {
  return `${getYear(state.day)}년차 ${SEASON_NAMES[getSeason(state.day)]} ${getDayOfSeason(state.day)}일`;
}

// ─────────────────────────── 마을 ───────────────────────────

/** 승격 — 교지를 기물함에 넣고 실제 중심지 업그레이드 경로를 그대로 탄다. */
export function debugPromote(state: GameState): DebugResult {
  const target = nextRank(state.rank);
  if (!target) return fail('이미 부(府)입니다');
  const center = state.buildings.find(building => building.type === 'center' && building.built);
  if (!center) return fail('완공된 중심지가 없습니다');
  if (state.pendingPromotionNotice) return fail('승격 안내가 아직 열려 있습니다');
  const item = promotionDecreeItem(target);
  if ((state.specialItems[item] ?? 0) <= 0) grantSpecialItem(state, item);
  const reason = upgradeSettlementCenter(state, center.id);
  if (reason) return fail(reason);
  return done(state, `${RANK_NAMES[target]} 승격`);
}

/** 강등 — 대응 시스템 함수(의심 100 강등)는 몰수·토벌까지 묶여 있어 등급만 내린다. */
export function debugDemote(state: GameState): DebugResult {
  const index = RANK_ORDER.indexOf(state.rank);
  if (index <= 0) return fail('이미 개척지입니다');
  const target = RANK_ORDER[index - 1];
  state.rank = target;
  state.tributePaidStreak = 0;
  return done(state, `${RANK_NAMES[target]}(으)로 강등`);
}

export function debugSetReputation(state: GameState, value: number): DebugResult {
  state.resources.reputation = clamp(numberOr(value, 0), 0, 100);
  return done(state, `명성 = ${round(state.resources.reputation)}`);
}

export function debugSetSuspicion(state: GameState, value: number): DebugResult {
  state.suspicion = clamp(numberOr(value, 0), 0, 100);
  return done(state, `의심 = ${round(state.suspicion)}`);
}

export function debugSetThreat(state: GameState, value: number): DebugResult {
  state.threat = clamp(numberOr(value, 0), 0, 100);
  return done(state, `위협도 = ${round(state.threat)}`);
}

export function debugSetTributeStreak(state: GameState, value: number): DebugResult {
  state.tributePaidStreak = Math.max(0, Math.floor(numberOr(value, 0)));
  state.tributeFailStreak = 0;
  return done(state, `세공 성실도 = ${state.tributePaidStreak}년 연속 납부`);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// ─────────────────────────── 스폰 ───────────────────────────

export type DebugAgeBand = 'random' | 'child' | 'youth' | 'adult' | 'elder';

interface DebugResidentSpawnOptions {
  count?: number;
  gender?: Gender | 'random';
  ageBand?: DebugAgeBand;
  job?: JobId;
  literate?: boolean;
}

/** 주민 스폰 — 유민 수용과 같은 createResident + 거처 재배치 경로를 쓴다. */
export function debugSpawnResidents(state: GameState, options: DebugResidentSpawnOptions = {}): DebugResult {
  const count = Math.max(1, Math.min(50, Math.floor(numberOr(options.count, 1))));
  const rng = debugRng(state, state.residents.length + 11);
  const band = options.ageBand ?? 'random';
  const job: JobId = band === 'child' || band === 'youth' ? 'idle' : (options.job ?? 'idle');
  for (let i = 0; i < count; i++) {
    const resident = createResident(state, rng, job);
    if (options.gender === 'male' || options.gender === 'female') resident.gender = options.gender;
    applyAgeBand(resident, band, rng);
    if (options.literate) resident.literate = true;
    state.residents.push(resident);
  }
  reconcileResidentHomes(state, rng);
  state.resources.defense = computeDefense(state);
  const bandLabel = AGE_BAND_NAMES[band];
  return done(state, `주민 ${count}명 스폰 (${bandLabel}·${JOB_NAMES[job]})`);
}

export const AGE_BAND_NAMES: Record<DebugAgeBand, string> = {
  random: '무작위',
  child: '아이',
  youth: '소년',
  adult: '성인',
  elder: '노인',
};

function applyAgeBand(resident: Resident, band: DebugAgeBand, rng: () => number): void {
  if (band === 'child' || band === 'youth') {
    applyLifeStage(resident, band as LifeStage);
    return;
  }
  if (band === 'adult') resident.age = 20 + Math.floor(rng() * 20);
  else if (band === 'elder') resident.age = 55 + Math.floor(rng() * 12);
}

export const DEBUG_SPECIAL_RESIDENT_IDS: readonly SpecialResidentId[] =
  SPECIAL_RESIDENT_ROSTER.map(definition => definition.id);

export function specialResidentName(id: SpecialResidentId): string {
  return SPECIAL_RESIDENT_ROSTER.find(definition => definition.id === id)?.name ?? id;
}

/** 특수 주민 스폰 — 도착 사건을 건너뛰고 합류 처리(명부·연대기·방어도)만 그대로 태운다. */
export function debugSpawnSpecialResident(state: GameState, id: SpecialResidentId): DebugResult {
  if (specialResidentRecordsOf(state)[id]) return fail('이미 등장한 인물입니다');
  recruitSpecialResident(state, id, debugRng(state, 29));
  return done(state, `특수 주민 ${specialResidentName(id)} 합류`);
}

export const DEBUG_LIVESTOCK_IDS: readonly LivestockId[] = IMPLEMENTED_LIVESTOCK_IDS;

export function livestockName(id: LivestockId): string {
  return LIVESTOCK_DEFS[id].name;
}

/** 가축 확보 — 빈 축사 판정과 해금 처리를 하는 기존 함수를 그대로 부른다. */
export function debugAcquireLivestock(state: GameState, species: LivestockId, amount: number): DebugResult {
  const count = Math.max(1, Math.floor(numberOr(amount, 1)));
  const error = acquireLivestock(state, species, count);
  if (error) return fail(error);
  return done(state, `${livestockName(species)} ${count}마리 확보`);
}

/** 유민 제안 — 길잡이의 통제 유민과 같은 경로(계절·확률·쿨다운만 우회). */
export function debugOfferImmigration(state: GameState): DebugResult {
  const locked = requireUnlocked(state);
  if (locked) return fail(locked);
  if (!openScriptedImmigrationChoice(state, debugRng(state, 37))) return fail('유민 제안을 열지 못했습니다');
  return done(state, '유민 제안 발화');
}

// ─────────────────────────── 사건 ───────────────────────────

/** 습격 — 전력을 직접 지정해 습격 무리를 띄운다(경보 여부 선택). */
export function debugSpawnRaid(state: GameState, power: number, warned = false): DebugResult {
  const locked = requireUnlocked(state);
  if (locked) return fail(locked);
  if (state.raiders || state.battle) return fail('이미 습격이 진행 중입니다');
  const strength = Math.max(1, Math.floor(numberOr(power, 6)));
  spawnRaiders(state, debugRng(state, 43), warned, undefined, strength);
  if (!state.raiders) return fail('습격 경로를 찾지 못했습니다 (지형·맹약 확인)');
  return done(state, `습격 발화 (전력 ${strength}${warned ? '·사전 경보' : ''})`);
}

export type DebugDisasterId =
  | 'earlyFrost' | 'lateFrost' | 'locust' | 'drought' | 'springFlood' | 'snowDamage';

export const DEBUG_DISASTER_NAMES: Record<DebugDisasterId, string> = {
  earlyFrost: '이른 서리',
  lateFrost: '늦서리',
  locust: '황충',
  drought: '가뭄',
  springFlood: '해빙기 대홍수',
  snowDamage: '설해',
};

/** 재해 6종 — 계절·날씨·쿨다운만 우회하고 각 사건의 발생 함수를 그대로 호출한다. */
export function debugStartDisaster(state: GameState, id: DebugDisasterId): DebugResult {
  const locked = requireUnlocked(state);
  if (locked) return fail(locked);
  if (hasPendingDisaster(state, id)) return fail(`${DEBUG_DISASTER_NAMES[id]}이(가) 이미 진행 중입니다`);
  const rng = debugRng(state, 53);
  if (id === 'earlyFrost') openEarlyFrostEvent(state, rng);
  else if (id === 'lateFrost') openLateFrostEvent(state, rng);
  else if (id === 'locust') openLocustEvent(state, rng);
  else if (id === 'drought') openDroughtEvent(state, rng);
  else if (id === 'snowDamage') {
    if (!startSnowDamage(state)) return fail('설해를 시작하지 못했습니다');
  } else {
    const config = CONFIG.disasters.springFlood;
    if (!startSpringFlood(state, config.shallowDepth, config.drainageDays[0], rng)) {
      return fail('범람할 강변 지형이 없습니다');
    }
  }
  // 대상 경작지가 없으면 open* 계열은 조용히 아무것도 하지 않는다 — 사유를 돌려준다.
  if (!state.pendingChoice && !hasPendingDisaster(state, id)) {
    return fail(`${DEBUG_DISASTER_NAMES[id]} 발생 조건 대상이 없습니다 (경작지·파종 상태 확인)`);
  }
  return done(state, `재해 발화 — ${DEBUG_DISASTER_NAMES[id]}`);
}

/** 화재 — 확률 게이트만 우회하고 발화 대상 선택·연소 규칙은 기존 경로 그대로. */
export function debugStartFire(state: GameState): DebugResult {
  const locked = requireUnlocked(state);
  if (locked) return fail(locked);
  if (!maybeStartFire(state, () => 0)) return fail('불이 붙을 건물이 없거나 이미 화재 중입니다');
  return done(state, '화재 발화');
}

/** 갱도 붕괴 — 전조형/즉시형 선택. 광맥 고갈·우천 위험 판정만 건너뛴다. */
export function debugStartMineCollapse(state: GameState, withWarning: boolean): DebugResult {
  const locked = requireUnlocked(state);
  if (locked) return fail(locked);
  const mine = state.buildings.find(building => building.type === 'deepMine' && building.built);
  if (!mine) return fail('완공된 채광갱이 없습니다');
  if (!startMineCollapse(state, mine, debugRng(state, 59), withWarning)) {
    return fail('이미 붕괴 사건이 진행 중입니다');
  }
  return done(state, `갱도 붕괴 발화 (${withWarning ? '전조' : '즉시'})`);
}

/** 병자 — 역병 의심 사건을 그대로 연다 (진맥·격리·방치 선택지 포함). */
export function debugStartPlagueSuspicion(state: GameState): DebugResult {
  const locked = requireUnlocked(state);
  if (locked) return fail(locked);
  if (state.incidents.plagueCase || state.incidents.epidemic) return fail('이미 역병 사건이 진행 중입니다');
  if (livingResidents(state).length === 0) return fail('살아 있는 주민이 없습니다');
  openPlagueSuspicionEvent(state, debugRng(state, 61));
  if (!state.pendingChoice) return fail('역병 의심 사건을 열지 못했습니다');
  return done(state, '역병 의심 사건 발화');
}

/** 역병 — 의심 단계를 건너뛰고 실제 발병부터 시작한다 (전염망·격리 규칙 그대로). */
export function debugStartEpidemic(state: GameState): DebugResult {
  const locked = requireUnlocked(state);
  if (locked) return fail(locked);
  if (state.incidents.epidemic) return fail('이미 역병이 돌고 있습니다');
  const rng = debugRng(state, 67);
  const residents = livingResidents(state);
  const patient = residents[Math.floor(rng() * residents.length)];
  if (!patient) return fail('살아 있는 주민이 없습니다');
  startEpidemic(state, patient);
  return done(state, `역병 발화 (첫 환자 ${patient.name})`);
}

export function debugStartLivestockEpidemic(state: GameState): DebugResult {
  const locked = requireUnlocked(state);
  if (locked) return fail(locked);
  if (state.incidents.livestockEpidemic) return fail('이미 가축 역병이 돌고 있습니다');
  openLivestockEpidemicEvent(state, debugRng(state, 71));
  if (!state.incidents.livestockEpidemic) return fail('가축이 있는 축사가 없습니다');
  return done(state, '가축 역병 발화');
}

/** 세공 공지 — 봄 첫날 파발과 같은 경로 (연차 롤·모달 포함). */
export function debugAnnounceTribute(state: GameState): DebugResult {
  const locked = requireUnlocked(state);
  if (locked) return fail(locked);
  announceCourtTribute(state);
  if (!state.courtTribute) return fail(`${CONFIG.tribute.firstYear}년차 전에는 세공을 거두지 않습니다`);
  return done(state, '세공 공지 발화');
}

/** 세공 수거 — 겨울 첫날 사자의 수거 선택지를 연다. */
export function debugCollectTribute(state: GameState): DebugResult {
  const locked = requireUnlocked(state);
  if (locked) return fail(locked);
  if (!state.courtTribute || state.courtTribute.resolved) return fail('올해 미결 세공이 없습니다');
  openCourtTributeChoice(state);
  if (!state.pendingChoice) return fail('세공 수거 창을 열지 못했습니다');
  return done(state, '세공 수거 발화');
}

// ─────────────────────────── 주민 상태 ───────────────────────────

function findResident(state: GameState, residentId: number): Resident | null {
  return state.residents.find(resident => resident.id === residentId) ?? null;
}

export function debugHealResident(state: GameState, residentId: number): DebugResult {
  const resident = findResident(state, residentId);
  if (!resident?.alive) return fail('살아 있는 주민이 아닙니다');
  resident.health = 100;
  resident.sick = false;
  delete resident.quarantinedUntil;
  return done(state, `${resident.name} 회복`);
}

export function debugSickenResident(state: GameState, residentId: number): DebugResult {
  const resident = findResident(state, residentId);
  if (!resident?.alive) return fail('살아 있는 주민이 아닙니다');
  resident.sick = true;
  resident.health = Math.min(resident.health, 45);
  return done(state, `${resident.name} 발병`);
}

/** 사망 — 시신·배우자·통계까지 처리하는 기존 사망 경로를 그대로 탄다. */
export function debugKillResident(state: GameState, residentId: number): DebugResult {
  const resident = findResident(state, residentId);
  if (!resident?.alive) return fail('살아 있는 주민이 아닙니다');
  killResident(state, resident, '개발용 조작');
  return done(state, `${resident.name} 사망 처리`);
}

export function debugRestoreAllResidents(state: GameState): DebugResult {
  const residents = livingResidents(state);
  if (residents.length === 0) return fail('살아 있는 주민이 없습니다');
  for (const resident of residents) {
    resident.hunger = 100;
    resident.warmth = 100;
    resident.health = 100;
    resident.sick = false;
  }
  return done(state, `전원 만복·회복 (${residents.length}명)`);
}

export function debugSetAllMorale(state: GameState, value: number): DebugResult {
  const morale = clamp(numberOr(value, 60), 0, 100);
  const residents = livingResidents(state);
  if (residents.length === 0) return fail('살아 있는 주민이 없습니다');
  for (const resident of residents) resident.morale = morale;
  return done(state, `전원 민심 = ${round(morale)}`);
}

// ─────────────────────────── 지도 ───────────────────────────

/** 전 지도 탐사 해제 — 탐사 상태만 열고 거점 노출은 기존 파생 함수에 맡긴다. */
export function debugRevealMap(state: GameState): DebugResult {
  const height = state.map.length;
  const width = state.map[0]?.length ?? 0;
  if (width === 0 || height === 0) return fail('지도가 없습니다');
  const revealed = revealAround(
    state,
    Math.floor(width / 2),
    Math.floor(height / 2),
    width + height,
  );
  revealForeignSitesFromExploration(state);
  return done(state, `전 지도 탐사 해제 (${revealed}칸 신규)`);
}

/** 서식지·어장·갯벌 비축 리필 — 각 시스템의 정규화를 거친 뒤 수용력까지 채운다. */
export function debugRefillGatheringStocks(state: GameState): DebugResult {
  let habitats = 0;
  for (const habitat of state.habitats) {
    normalizeHabitatReserve(state.map, habitat);
    if (!habitat.active) continue;
    habitat.stock = habitat.capacity;
    habitats++;
  }
  let grounds = 0;
  for (const ground of state.fishingGrounds) {
    ground.stock = ground.capacity;
    grounds++;
  }
  let mudflats = 0;
  for (const row of state.map) {
    for (const tile of row) {
      if (tile.terrain !== 'mudflat') continue;
      normalizeTidalFlatTile(tile);
      tile.tidalStock = tile.tidalCapacity ?? CONFIG.tidalFlats.capacityPerTile;
      mudflats++;
    }
  }
  return done(state, `비축 리필 — 서식지 ${habitats} · 어장 ${grounds} · 갯벌 ${mudflats}칸`);
}

// ─────────────────────────── 기타 ───────────────────────────

/** 초회 도움말 기록 초기화 — 안내를 처음부터 다시 보게 한다. */
export function debugResetGuides(state: GameState): DebugResult {
  state.guides = { enabled: state.guides?.enabled ?? true, seen: {} };
  state.guideCards = [];
  state.guideModalQueue = [];
  return done(state, '길잡이 기록 초기화');
}

export const DEBUG_SCENARIO_STEP_TITLES: readonly string[] = TUTORIAL_STEPS.map(step => step.title);

/** 시나리오 스텝 이동 — 다음 일일 처리에서 해당 스텝 안내부터 다시 시작한다. */
export function debugSetScenarioStep(state: GameState, stepIndex: number): DebugResult {
  const scenario = state.scenario;
  if (!scenario) return fail('진행 중인 시나리오가 없습니다');
  const index = Math.max(0, Math.min(TUTORIAL_STEPS.length - 1, Math.floor(numberOr(stepIndex, 0))));
  scenario.stepIndex = index;
  scenario.introShown = false;
  scenario.completed = false;
  return done(state, `시나리오 ${index + 1}단계로 이동 — ${TUTORIAL_STEPS[index].title}`);
}

/** 시나리오 해제 — 완주와 같은 상태(랜덤 사건 개방·완주 표식)로 만든다. */
export function debugClearScenario(state: GameState): DebugResult {
  if (!state.scenario) return fail('진행 중인 시나리오가 없습니다');
  state.scenario = null;
  state.tutorialGraduate = true;
  return done(state, '시나리오 해제 (완주 처리)');
}

/** 상태 JSON 덤프 — 저장과 같은 직렬화 형태. 역방향(붙여넣기 로드)은 범위 밖이다. */
export function debugDumpState(state: GameState): string {
  return JSON.stringify(state);
}

export function debugStateSummary(state: GameState): string {
  return [
    `${debugDateLabel(state)} · ${RANK_NAMES[state.rank]}`,
    `주민 ${livingResidents(state).length}명 · 명성 ${round(state.resources.reputation)}`,
    `위협 ${round(state.threat)} · 의심 ${round(state.suspicion)}`,
    state.debugTouched ? '치트 사용 표식 있음' : '치트 사용 표식 없음',
  ].join(' / ');
}
