// 생애 주기 — 혼인·출산·압축 성장·노년·자연사·장례.
// 아이는 나이가 아니라 단계 게이지로 자라고(총 120일 ≈ 2.5게임년), 성인 나이는
// 새해마다 1살씩만 먹는다(비대칭 — 압축 노화는 개국공신을 너무 일찍 데려간다).
// 계획: docs/superpowers/plans/2026-07-17-marriage-birth-growth.md
import { BUILDING_DEFS, countBuilt } from './buildings';
import { CONFIG } from './config';
import { addLog } from './events';
import { settleEducationOnAdulthood } from './education';
import { hasResidentMonk } from './morale';
import { consumeEdibleFood, edibleFoodTotal } from './resources';
import { killResident, livingResidents, rollResidentName } from './residents';
import { getDayOfYear, getSeason } from './seasons';
import { youthLaborMult } from './youth';
import type { Building, Corpse, GameState, LifeStage, Resident } from './types';

export const LIFE_STAGE_ORDER: LifeStage[] = ['infant', 'child', 'youth'];
export const LIFE_STAGE_NAMES: Record<LifeStage, string> = {
  infant: '아기', child: '어린이', youth: '소년',
};

// ── 소비 몫 ──────────────────────────────────────────────

export function residentConsumptionShare(resident: Pick<Resident, 'stage'>): number {
  const stage = resident.stage;
  if (!stage) return 1;
  return CONFIG.lifecycle.consumptionShare[stage] ?? 1;
}

// 식량·장작·의복 소비의 기준 인구 — 아이는 성인보다 적게 먹고 적게 입는다.
export function consumptionWeight(state: GameState): number {
  return livingResidents(state).reduce((sum, r) => sum + residentConsumptionShare(r), 0);
}

// 주거 정원 계산용 — 아이는 침상 정원의 절반만 차지한다.
export function bedShare(resident: Pick<Resident, 'stage'>): number {
  return resident.stage ? CONFIG.lifecycle.childBedShare : 1;
}

function homeOccupancy(state: GameState, buildingId: number): number {
  return livingResidents(state)
    .filter(r => r.homeBuildingId === buildingId)
    .reduce((sum, r) => sum + bedShare(r), 0);
}

// ── 아이 생성 ────────────────────────────────────────────

export function applyLifeStage(resident: Resident, stage: LifeStage): void {
  resident.stage = stage;
  resident.stageProgress = 0;
  resident.age = LIFE_STAGE_ORDER.indexOf(stage); // 표기용 (0~2세 느낌)
  resident.job = 'idle';
  resident.assignedBuildingId = null;
  resident.skills = {};
  resident.task = LIFE_STAGE_NAMES[stage];
  if (stage === 'youth') {
    resident.youthActivity = 'work';
    resident.education ??= 0;
  } else {
    delete resident.youthActivity;
  }
}

// ── 성장 (일일) ──────────────────────────────────────────

function growStages(state: GameState): void {
  const l = CONFIG.lifecycle;
  for (const r of livingResidents(state)) {
    if (!r.stage) continue;
    if (r.hunger < l.growthPauseHungerBelow || r.warmth < l.growthPauseWarmthBelow) continue;
    r.stageProgress = (r.stageProgress ?? 0) + 1;
    if (r.stageProgress < l.stageDays[r.stage]) continue;
    const nextIndex = LIFE_STAGE_ORDER.indexOf(r.stage) + 1;
    if (nextIndex < LIFE_STAGE_ORDER.length) {
      applyLifeStage(r, LIFE_STAGE_ORDER[nextIndex]);
      continue;
    }
    // 성인이 되었다 — 취학 일수를 채웠으면 문해자로
    r.stage = null;
    r.stageProgress = 0;
    r.age = l.adultAge;
    r.job = 'idle';
    r.task = '무직';
    const educationResult = settleEducationOnAdulthood(r);
    addLog(
      state,
      educationResult
        ? `${r.name}이(가) 글을 깨친 어른으로 자랐습니다. 의원·아전·훈장을 맡을 수 있고, 아전·훈장 일을 시작할 밑천도 닦았습니다.`
        : `${r.name}이(가) 어엿한 한 사람 몫의 일손으로 자랐습니다.`,
      'good', true,
    );
  }
}

// ── 노화·자연사 (새해마다) ───────────────────────────────

function ageResidents(state: GameState, rng: () => number): void {
  if (getDayOfYear(state.day) !== 1 || state.day <= 1) return;
  const l = CONFIG.lifecycle;
  for (const r of livingResidents(state)) {
    if (r.stage) continue; // 아이는 단계 게이지로 자란다
    r.age += 1;
    if (r.age < l.elderDeathCheckAge) continue;
    const chance = Math.min(
      0.9,
      l.elderDeathAnnualBase + l.elderDeathAnnualPerYear * (r.age - l.elderDeathCheckAge),
    );
    if (rng() < chance) {
      killResident(state, r, '노환');
    }
  }
}

// 노년 노동 효율 — 급격한 페널티 없이 완만하게.
export function elderLaborMult(resident: Pick<Resident, 'age' | 'stage'>): number {
  if (resident.stage) return 1;
  return resident.age >= CONFIG.lifecycle.elderLaborAge ? CONFIG.lifecycle.elderLaborMult : 1;
}

// 연령 단계 노동 효율의 단일 진입점. 소년과 노년 보정을 별도 위치에서 중복 곱하지 않는다.
export function laborEfficiencyMult(
  resident: Pick<Resident, 'age' | 'stage' | 'youthActivity'>,
): number {
  if (resident.stage) return youthLaborMult(resident);
  return elderLaborMult(resident);
}

// ── 혼인 ────────────────────────────────────────────────

function isMarriageEligible(state: GameState, r: Resident): boolean {
  if (!r.alive || r.stage) return false;
  if (r.age >= CONFIG.lifecycle.maxMarriageAge) return false;
  if (r.spouseId != null) {
    const spouse = state.residents.find(other => other.id === r.spouseId);
    if (spouse?.alive) return false; // 사별하면 재혼 가능
  }
  return true;
}

// 부부를 같은 집에 모은다 — 빈 침상이 있는 쪽으로.
function cohouseCouple(state: GameState, a: Resident, b: Resident): void {
  const tryMove = (mover: Resident, target: Resident): boolean => {
    if (target.homeBuildingId == null) return false;
    const home = state.buildings.find(building => building.id === target.homeBuildingId);
    if (!home || !home.built) return false;
    const capacity = BUILDING_DEFS[home.type].capacity;
    const occupancy = homeOccupancy(state, home.id) - (mover.homeBuildingId === home.id ? bedShare(mover) : 0);
    if (occupancy + bedShare(mover) > capacity) return false;
    mover.homeBuildingId = home.id;
    return true;
  };
  if (a.homeBuildingId != null && a.homeBuildingId === b.homeBuildingId) return;
  if (tryMove(b, a)) return;
  tryMove(a, b);
}

export function openWeddingChoice(state: GameState, a: Resident, b: Resident): void {
  const l = CONFIG.lifecycle;
  const canFeast = edibleFoodTotal(state) >= l.weddingFeastFood;
  state.pendingChoice = {
    kind: 'wedding',
    title: '혼례 — 변방의 경사',
    body:
      `${a.name}와(과) ${b.name}이(가) 백년가약을 맺었습니다.\n` +
      '변방의 살림살이에도 경사는 경사 — 잔치를 열어 마을의 시름을 씻을 수도 있습니다.',
    options: [
      {
        id: 'feast',
        label: '잔치를 연다',
        desc: `식량 ${l.weddingFeastFood}을 들여 온 마을이 먹고 마십니다. 전 주민 사기 +${l.weddingFeastMorale}.`,
        disabled: !canFeast,
        disabledReason: canFeast ? undefined : '잔치를 벌일 식량이 없습니다',
      },
      {
        id: 'quiet',
        label: '조용히 치른다',
        desc: '비용 없이 식만 올립니다. 두 사람과 이웃들의 잔잔한 기쁨만 남습니다.',
      },
    ],
    data: { aId: a.id, bId: b.id },
  };
}

export function resolveWeddingChoice(state: GameState, optionId: string): void {
  const choice = state.pendingChoice;
  if (!choice || choice.kind !== 'wedding') return;
  state.pendingChoice = null;
  const l = CONFIG.lifecycle;
  if (optionId === 'feast' && edibleFoodTotal(state) >= l.weddingFeastFood) {
    consumeEdibleFood(state, l.weddingFeastFood);
    for (const r of livingResidents(state)) r.morale = Math.min(100, r.morale + l.weddingFeastMorale);
    addLog(state, '혼례 잔치가 벌어졌습니다. 오랜만에 마을에 웃음소리가 가득합니다.', 'good', true);
    return;
  }
  for (const r of livingResidents(state)) r.morale = Math.min(100, r.morale + l.weddingQuietMorale);
  addLog(state, '조촐한 혼례가 치러졌습니다.', 'good');
}

function tryMarriage(state: GameState, rng: () => number): void {
  const l = CONFIG.lifecycle;
  if (rng() >= l.marriageDailyChance) return;
  const eligible = livingResidents(state).filter(r => isMarriageEligible(state, r));
  const grooms = eligible.filter(r => r.gender === 'male');
  const brides = eligible.filter(r => r.gender === 'female');
  if (grooms.length === 0 || brides.length === 0) return;
  const groom = grooms[Math.floor(rng() * grooms.length)];
  const bride = brides[Math.floor(rng() * brides.length)];
  groom.spouseId = bride.id;
  bride.spouseId = groom.id;
  cohouseCouple(state, groom, bride);
  addLog(state, `${groom.name}와(과) ${bride.name}이(가) 혼인했습니다.`, 'good', true);
  // 시나리오(튜토리얼) 중에는 혼인 잔치 모달을 생략한다 — 혼인 자체는 그대로 진행
  if (!state.pendingChoice && !state.battle && !state.scenario) openWeddingChoice(state, groom, bride);
}

// ── 출산 ────────────────────────────────────────────────

function childCountOf(state: GameState, mother: Resident): number {
  return state.residents.filter(r => r.alive && r.motherId === mother.id).length;
}

function createNewborn(state: GameState, rng: () => number, mother: Resident, father: Resident): Resident {
  const gender = rng() < 0.5 ? 'male' : 'female';
  const name = rollResidentName(state, rng, gender);
  const baby: Resident = {
    id: state.nextResidentId++,
    name,
    age: 0,
    gender,
    job: 'idle',
    motherId: mother.id,
    fatherId: father.id,
    hunger: 80,
    warmth: 80,
    health: 100,
    morale: 70,
    skills: {},
    assignedBuildingId: null,
    homeBuildingId: mother.homeBuildingId,
    task: '아기',
    alive: true,
    sick: false,
    x: mother.x,
    y: mother.y,
    px: mother.x,
    py: mother.y,
    phase: 'rest',
    path: [],
    workTimer: 0,
    targetId: null,
    carrying: {},
    cartEquipped: false,
    haulTask: null,
    manualOrder: null,
  };
  applyLifeStage(baby, 'infant');
  return baby;
}

function tryBirths(state: GameState, rng: () => number): void {
  const l = CONFIG.lifecycle;
  const foodOk = edibleFoodTotal(state)
    >= livingResidents(state).length * CONFIG.needs.foodPerDay * l.birthFoodDaysRequired;
  if (!foodOk) return;
  const living = livingResidents(state);
  const warmthAvg = living.reduce((sum, r) => sum + r.warmth, 0) / Math.max(1, living.length);
  if (warmthAvg < l.birthWarmthRequired) return;

  for (const mother of living) {
    if (mother.gender !== 'female' || mother.stage || mother.spouseId == null) continue;
    if (mother.age >= l.maxMotherAge) continue;
    if (state.day < (mother.birthRecoveryUntil ?? 0)) continue;
    const father = state.residents.find(r => r.id === mother.spouseId);
    if (!father?.alive || father.homeBuildingId == null) continue;
    if (father.homeBuildingId !== mother.homeBuildingId) continue; // 같은 집에 살아야 한다
    if (childCountOf(state, mother) >= l.maxChildrenPerCouple) continue;

    let chance = l.birthDailyChance;
    const home = state.buildings.find(building => building.id === mother.homeBuildingId);
    if (home && homeOccupancy(state, home.id) + l.childBedShare > BUILDING_DEFS[home.type].capacity) {
      chance *= l.birthHousingFullMult; // 집이 꽉 차면 아기가 잘 안 생긴다
    }
    if (rng() >= chance) continue;

    const baby = createNewborn(state, rng, mother, father);
    state.residents.push(baby);
    const winterExtra = getSeason(state.day) === 'winter' ? l.birthWinterExtraRecovery : 0;
    mother.birthRecoveryUntil = state.day + l.birthRecoveryDays + winterExtra;
    addLog(state, `${mother.name}이(가) ${baby.gender === 'male' ? '사내' : '계집'}아이를 낳았습니다. 이름은 ${baby.name}.`, 'good', true);
  }
}

// ── 장례 ────────────────────────────────────────────────

export function corpsesOf(state: GameState): Corpse[] {
  if (!state.corpses) state.corpses = [];
  return state.corpses;
}

export function addCorpse(state: GameState, resident: Resident, cause: string): void {
  const corpses = corpsesOf(state);
  state.nextCorpseId = (state.nextCorpseId ?? 1);
  // 원정 중 전사자는 동료들이 시신을 수습해 지니고 돌아온다 — 두고 가지 않는다.
  const withExpedition = state.expedition?.memberIds.includes(resident.id) === true;
  corpses.push({
    id: state.nextCorpseId++,
    name: resident.name,
    x: resident.x,
    y: resident.y,
    deathDay: state.day,
    cause,
    ...(withExpedition ? { withExpedition: true } : {}),
  });
}

// 원정대 귀환 — 지니고 온 시신을 마을 어귀에 내려놓는다. 방치 유예는 이날부터 다시 센다.
export function deliverExpeditionCorpses(state: GameState, x: number, y: number): void {
  const delivered = corpsesOf(state).filter(corpse => corpse.withExpedition);
  if (delivered.length === 0) return;
  for (const corpse of delivered) {
    corpse.withExpedition = false;
    corpse.x = x;
    corpse.y = y;
    corpse.deathDay = state.day;
  }
  addLog(
    state,
    delivered.length === 1
      ? `토벌대가 전사한 ${delivered[0].name}의 시신을 수습해 돌아왔습니다.`
      : `토벌대가 전사자 ${delivered.length}명의 시신을 수습해 돌아왔습니다.`,
    'info',
    true,
  );
}

// 원정대 전멸 — 시신을 수습할 사람이 아무도 돌아오지 못했다.
export function loseExpeditionCorpses(state: GameState): void {
  const corpses = corpsesOf(state);
  const lost = corpses.filter(corpse => corpse.withExpedition);
  if (lost.length === 0) return;
  state.corpses = corpses.filter(corpse => !corpse.withExpedition);
  addLog(
    state,
    `전멸한 토벌대의 시신 ${lost.length}구는 끝내 거두지 못했습니다. 묘도 없이 이름만 남습니다.`,
    'bad',
    true,
  );
}

export function cemeteryFreePlots(state: GameState): number {
  return state.buildings
    .filter(building => building.type === 'cemetery' && building.built)
    .reduce((sum, building) => sum + Math.max(0, CONFIG.funeral.plotsPerCemetery - (building.graves ?? 0)), 0);
}

// 다음으로 수습할 시신 — 접근 실패로 유예됐거나 원정대가 지닌 시신은 건너뛴다.
export function nextCorpseToCollect(state: GameState): Corpse | null {
  return corpsesOf(state).find(corpse =>
    !corpse.carried && !corpse.withExpedition && state.day >= (corpse.skipUntilDay ?? 0)) ?? null;
}

export function buryCorpse(state: GameState, corpseId: number, cemetery: Building): boolean {
  const corpses = corpsesOf(state);
  const index = corpses.findIndex(corpse => corpse.id === corpseId);
  if (index < 0) return false;
  if ((cemetery.graves ?? 0) >= CONFIG.funeral.plotsPerCemetery) return false;
  const [corpse] = corpses.splice(index, 1);
  cemetery.graves = (cemetery.graves ?? 0) + 1;
  // 노승이 재(齋)를 올려 주면 위로가 깊어진다
  const relief = CONFIG.funeral.burialMoraleRelief
    + (hasResidentMonk(state) ? CONFIG.satisfaction.monkBurialBonus : 0);
  for (const r of livingResidents(state)) {
    r.morale = Math.min(100, r.morale + relief);
  }
  addLog(state, `${corpse.name}을(를) 양지바른 묘지에 안장했습니다. 마을이 위로를 얻습니다.`, 'info', true);
  return true;
}

// 방치 시신 — 유예를 넘긴 시신이 있으면 매일 민심이 상한다.
function unburiedPenalty(state: GameState): void {
  const f = CONFIG.funeral;
  const overdue = corpsesOf(state).filter(corpse =>
    !corpse.withExpedition && state.day - corpse.deathDay > f.unburiedGraceDays);
  if (overdue.length === 0) return;
  for (const r of livingResidents(state)) {
    r.morale = Math.max(0, r.morale - f.unburiedMoralePerDay);
  }
  if (state.day % 4 === 0) {
    const hasCemetery = countBuilt(state, 'cemetery') > 0;
    addLog(
      state,
      hasCemetery
        ? '거두지 못한 시신이 방치되어 있습니다. 장의사의 손이 모자랍니다.'
        : '거두지 못한 시신이 방치되어 민심이 흉흉합니다. 묘지가 필요합니다.',
      'bad',
    );
  }
}

// ── 일일 진입점 ──────────────────────────────────────────

// 운구자가 죽거나 전직하면 지고 있던 시신을 내려놓는다.
function reconcileCarriedCorpses(state: GameState): void {
  const carriers = new Map<number, Resident>();
  for (const r of state.residents) {
    if (r.corpseCarryId == null) continue;
    if (r.alive && r.job === 'undertaker') carriers.set(r.corpseCarryId, r);
    else r.corpseCarryId = null;
  }
  for (const corpse of corpsesOf(state)) {
    if (!corpse.carried) continue;
    const carrier = carriers.get(corpse.id);
    if (carrier) {
      corpse.x = carrier.x;
      corpse.y = carrier.y;
    } else {
      corpse.carried = false;
    }
  }
}

export function lifecycleDailyTick(state: GameState, rng: () => number): void {
  growStages(state);
  ageResidents(state, rng);
  tryMarriage(state, rng);
  tryBirths(state, rng);
  reconcileCarriedCorpses(state);
  unburiedPenalty(state);
}
