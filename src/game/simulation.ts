// 시뮬레이션 오케스트레이터
// 하루는 SUBTICKS개의 서브틱으로 나뉜다. 서브틱마다 주민 에이전트가 이동/작업/운반하고,
// 하루가 넘어갈 때 소비/생존/위협/이벤트 등 일일 처리를 한다.
import { CONFIG } from './config';
import { isJobUnlocked, RANK_NAMES, SEASON_NAMES } from './constants';
import {
  BUILDING_DEFS, canAfford, cannonPlacementsUsed, canPlaceOn, computeDefense, countBuilt, housingCapacity,
  isBuildingUnlocked,
} from './buildings';
import { addLog, maybeFlavorLog, maybeOfferTrade, resolveTrade } from './events';
import { announceCourtTribute, maybeCollectTribute, resolveCourtTribute } from './courtTribute';
import { grantYearlyPowder, resolvePetition } from './petition';
import { checkPromotion, rankEffects } from './promotion';
import { resolveCrackdown, resolveInspection, updateSuspicion } from './suspicion';
import { generateMap, makeRng } from './map';
import { isHabitatActive, spawnAnimalHabitats } from './habitats';
import { agentsTick, resetAgent, SUBTICKS } from './agents';
import { battleTick } from './battles';
import { checkRaidTrigger, raidersTick, resolveRaid, updateThreat } from './raids';
import { driftRelations, initRelations } from './relations';
import { avg, createResident, livingResidents, updateMorale, updateResidentNeeds } from './residents';
import { getDayOfSeason, getSeason, getYear } from './seasons';
import { firewoodWeatherMult, rollWeather } from './weather';
import { defaultProcessingReserves, processableAmount } from './processing';
import type { Building, BuildingTypeId, Difficulty, GameState, JobId, ResourceId } from './types';

// ─────────────────────────── 새 게임 ───────────────────────────

export function newGame(seed?: number, difficulty: Difficulty = 'normal'): GameState {
  const s = seed ?? Math.floor(Math.random() * 2 ** 31);
  const rng = makeRng(s);
  const { tiles, centerX, centerY } = generateMap(s);

  // 난이도에 따라 시작 물자를 조절 (명성/방어도는 제외)
  const diff = CONFIG.difficulty[difficulty];
  const startRes: Record<ResourceId, number> = { ...CONFIG.start.resources };
  for (const key of Object.keys(startRes) as ResourceId[]) {
    if (key === 'reputation' || key === 'defense') continue;
    startRes[key] = Math.round(startRes[key] * diff.startRes);
  }

  const state: GameState = {
    day: 1,
    subTick: 0,
    difficulty,
    seed: s,
    weather: 'clear',
    map: tiles,
    // 짐승 서식지: 숲 덩어리마다 난이도별 확률로 자리 잡는다 (마을 근처 하나는 보장)
    habitats: spawnAnimalHabitats(tiles, centerX, centerY, rng, diff.habitatChance),
    residents: [],
    buildings: [],
    nextBuildingId: 1,
    nextResidentId: 1,
    resources: startRes,
    processingReserves: defaultProcessingReserves(),
    threat: 25,
    relations: initRelations(),
    raiders: null,
    battle: null,
    raidCooldown: 0,
    tradeRefusedDays: 0,
    lastTradeDay: 0,
    lastTradeByFaction: {},
    pendingChoice: null,
    courtTribute: null,
    tributeFailStreak: 0,
    tributePaidStreak: 0,
    rank: 'settlement',
    lastPetitionDay: 0,
    cannonsGranted: 0,
    suspicion: 0,
    nitrePaused: false,
    nitreHiddenUntil: 0,
    initiatedTradeDays: [],
    inspectionCooldownUntil: 0,
    censured: false,
    crackdownDeadline: 0,
    log: [],
    totalDeaths: 0,
    starvationDeathsThisYear: 0,
    winterStartPop: 0,
    winterDeaths: 0,
    lastWinterDeathRate: 0,
    badWinterStreak: 0,
    gameOver: null,
    victoryProgressNote: '',
  };

  // 마을 중심지 + 초가집 2채는 지어진 상태로 시작
  placePrebuilt(state, 'center', centerX, centerY);
  const hutSpots = findNearbySpots(state, centerX, centerY, 2);
  for (const spot of hutSpots) placePrebuilt(state, 'hut', spot.x, spot.y);

  // 시작 주민 (마을 중심에서 출발)
  for (const [job, count] of Object.entries(CONFIG.start.jobs)) {
    for (let i = 0; i < count; i++) {
      state.residents.push(createResident(state, rng, job as JobId));
    }
  }

  state.weather = rollWeather(1, rng);
  state.resources.defense = computeDefense(state);

  addLog(state, '조정의 명을 받아 두만강 이북 개척지에 도착했습니다. 짧은 봄 동안 겨울을 준비해야 합니다.', 'info');
  addLog(state, '나무를 베고, 집을 짓고, 식량과 장작을 모으십시오. 첫 겨울이 모든 것을 시험할 것입니다.', 'info');
  announceCourtTribute(state); // 1년차 봄이 day 1이므로 첫해 세공도 여기서 공지
  return state;
}

function placePrebuilt(state: GameState, type: BuildingTypeId, x: number, y: number): void {
  const b: Building = {
    id: state.nextBuildingId++, type, x, y,
    progress: BUILDING_DEFS[type].buildDays, built: true, fieldGrowth: 0,
  };
  state.buildings.push(b);
  state.map[y][x].buildingId = b.id;
  if (state.map[y][x].terrain === 'forest') state.map[y][x].terrain = 'plain';
}

function findNearbySpots(state: GameState, cx: number, cy: number, count: number): { x: number; y: number }[] {
  const spots: { x: number; y: number }[] = [];
  for (let r = 1; r <= 4 && spots.length < count; r++) {
    for (let dy = -r; dy <= r && spots.length < count; dy++) {
      for (let dx = -r; dx <= r && spots.length < count; dx++) {
        const t = state.map[cy + dy]?.[cx + dx];
        if (t && t.buildingId == null &&
            (t.terrain === 'plain' || t.terrain === 'fertile' || t.terrain === 'forest')) {
          spots.push({ x: t.x, y: t.y });
        }
      }
    }
  }
  return spots;
}

// ─────────────────────────── 플레이어 행동 ───────────────────────────

export function tryPlaceBuilding(state: GameState, type: BuildingTypeId, x: number, y: number): string | null {
  const def = BUILDING_DEFS[type];
  const tile = state.map[y]?.[x];
  if (!tile) return '지도 밖입니다.';
  if (!isBuildingUnlocked(state.rank, type)) {
    const rankName = def.minRank ? RANK_NAMES[def.minRank] : RANK_NAMES.bo;
    return `${rankName} 승격 후 지을 수 있습니다.`;
  }
  if (!canPlaceOn(def, tile, state)) return '이곳에는 지을 수 없습니다.';
  if (def.unique && state.buildings.some(b => b.type === type)) return '이미 건설 중이거나 완공되었습니다.';
  if (type === 'cannonEmplacement' && cannonPlacementsUsed(state) >= state.cannonsGranted) {
    return '불랑기포는 조정의 하사가 있어야 합니다. (조정 탭에서 청원)';
  }
  if (!canAfford(state, def)) return '자원이 부족합니다.';

  for (const [res, amt] of Object.entries(def.cost)) {
    state.resources[res as keyof typeof state.resources] -= amt ?? 0;
  }
  const b: Building = {
    id: state.nextBuildingId++, type, x, y, progress: 0, built: false, fieldGrowth: 0,
  };
  state.buildings.push(b);
  tile.buildingId = b.id;
  if (tile.terrain === 'forest') {
    tile.terrain = 'plain';
    state.resources.wood += 3; // 개간하며 얻는 목재
  }
  addLog(state, `${def.name} 건설을 시작했습니다.`, 'info');
  return null;
}

// 직업 재배정: from 직업의 산 주민 1명을 to 직업으로
export function reassignJob(state: GameState, from: JobId, to: JobId): boolean {
  if (!isJobUnlocked(state.rank, to)) return false;
  const r = state.residents.find(res => res.alive && res.job === from);
  if (!r) return false;
  r.job = to;
  resetAgent(state, r);
  return true;
}

export function setResidentJob(state: GameState, id: number, job: JobId): void {
  if (!isJobUnlocked(state.rank, job)) return;
  const r = state.residents.find(res => res.id === id);
  if (r && r.alive) {
    r.job = job;
    resetAgent(state, r);
  }
}

export function resolveChoice(state: GameState, optionId: string): void {
  if (!state.pendingChoice) return;
  const rng = makeRng(state.seed + state.day * 7919 + 31);
  if (state.pendingChoice.kind === 'raid') resolveRaid(state, optionId, rng);
  else if (state.pendingChoice.kind === 'tribute') resolveCourtTribute(state, optionId);
  else if (state.pendingChoice.kind === 'petition') resolvePetition(state, optionId);
  else if (state.pendingChoice.kind === 'inspection') resolveInspection(state, optionId, rng);
  else if (state.pendingChoice.kind === 'crackdown') resolveCrackdown(state, optionId, rng);
  else resolveTrade(state, optionId);
  state.resources.defense = computeDefense(state);
}

export function continueAfterVictory(state: GameState): boolean {
  if (!state.gameOver?.won) return false;
  state.gameOver = null;
  addLog(state, '부(府) 승격 이후에도 개척을 계속 이어갑니다. 새 관청 체계와 부두 교역을 활용할 수 있습니다.', 'good');
  return true;
}

// ─────────────────────────── 틱 진행 ───────────────────────────

// 서브틱 1회: 에이전트 갱신, 하루가 차면 일일 처리
export function advanceTick(state: GameState): void {
  if (state.gameOver || state.pendingChoice) return;
  agentsTick(state);
  const tickRng = makeRng(state.seed + state.day * 7919 + state.subTick * 131 + 3);
  battleTick(state, tickRng);
  raidersTick(state, tickRng);
  state.subTick++;
  if (state.subTick >= SUBTICKS) {
    state.subTick = 0;
    endOfDay(state);
  }
}

// 하루 통째로 진행 (테스트/디버그용)
export function advanceDay(state: GameState): void {
  for (let i = 0; i < SUBTICKS; i++) {
    if (state.gameOver || state.pendingChoice) break;
    advanceTick(state);
  }
}

// ─────────────────────────── 일일 처리 ───────────────────────────

function endOfDay(state: GameState): void {
  const prevSeason = getSeason(state.day);
  state.day++;
  const season = getSeason(state.day);
  const rng = makeRng(state.seed + state.day * 7919);

  if (season !== prevSeason) onSeasonChange(state, prevSeason, season);

  // 날씨
  const prevWeather = state.weather;
  state.weather = rollWeather(state.day, rng);
  if (state.weather !== prevWeather) {
    if (state.weather === 'blizzard') addLog(state, '눈보라가 몰아칩니다. 장작 소모가 크게 증가하고 바깥일이 멈춥니다.', 'weather');
    else if (state.weather === 'coldSnap') addLog(state, '살을 에는 혹한이 닥쳤습니다. 밖에 오래 있으면 위험합니다.', 'weather');
    else if (state.weather === 'heavySnow') addLog(state, '폭설이 내려 발이 푹푹 빠집니다. 이동이 더뎌집니다.', 'weather');
    else if (state.weather === 'thawFlood') addLog(state, '해빙기 홍수로 강물이 불었습니다. 얼음 위로는 다닐 수 없습니다.', 'weather');
  }

  regrowForest(state, rng, season);
  updateHabitats(state);
  runTannery(state);
  runToolWear(state);
  runConsumptionAndNeeds(state, rng);

  driftRelations(state);
  updateThreat(state);
  checkRaidTrigger(state, rng);
  if (maybeOfferTrade(state, rng, state.day - state.lastTradeDay)) {
    state.lastTradeDay = state.day;
  }
  runImmigration(state, rng);
  maybeFlavorLog(state, rng);
  maybeCollectTribute(state); // 겨울: 조정의 사자가 세공을 거둔다 (모달 충돌 시 다음 날로)
  updateSuspicion(state, rng); // 모반 의심 누적과 감찰/견책/토벌 사건

  state.resources.defense = computeDefense(state);
  checkEndConditions(state);
}

function onSeasonChange(state: GameState, prev: string, next: string): void {
  addLog(state, `${SEASON_NAMES[next as keyof typeof SEASON_NAMES]}이(가) 시작되었습니다. (${getYear(state.day)}년차)`, 'weather');

  if (next === 'winter') {
    state.winterStartPop = livingResidents(state).length;
    state.winterDeaths = 0;
    addLog(state, '강이 얼어붙기 시작합니다. 장작과 식량이 겨울을 버틸 만큼 있는지 확인하십시오.', 'weather');
    // 거두지 못한 곡식은 서리에 얼어붙는다
    let lost = false;
    for (const b of state.buildings) {
      if (b.type === 'field' && b.fieldGrowth > 1) lost = true;
      if (b.type === 'field') b.fieldGrowth = 0;
    }
    if (lost) addLog(state, '거두지 못한 곡식이 서리에 얼어붙었습니다.', 'bad');
  }
  if (prev === 'winter') {
    state.lastWinterDeathRate = state.winterStartPop > 0 ? state.winterDeaths / state.winterStartPop : 0;
    const pop = livingResidents(state).length;
    if (pop < 5) state.badWinterStreak++;
    else state.badWinterStreak = 0;
    addLog(state, `얼음이 풀립니다. 지난겨울 사망 ${state.winterDeaths}명 (사망률 ${(state.lastWinterDeathRate * 100).toFixed(0)}%).`,
      state.winterDeaths > 0 ? 'bad' : 'good');
  }
  if (next === 'spring') {
    state.starvationDeathsThisYear = 0;
    addLog(state, '파종철입니다. 밭에 농부를 배정하면 가을에 곡물을 거둘 수 있습니다.', 'info');
    announceCourtTribute(state); // 새해 세공 공지
    grantYearlyPowder(state);    // 진(鎭) 이상: 연례 화약 배급
  }
  if (next === 'autumn') {
    addLog(state, '수확철입니다. 곡식을 거두고 장작을 쌓아 두십시오. 국경 너머의 움직임도 잦아지는 때입니다.', 'info');
  }
}

// 봄/여름, 숲 인접 평지가 천천히 다시 숲이 된다
function regrowForest(state: GameState, rng: () => number, season: string): void {
  if (season !== 'spring' && season !== 'summer') return;
  const h = state.map.length;
  const forestBefore = new Set<string>();
  for (let y = 0; y < h; y++) {
    const row = state.map[y];
    for (let x = 0; x < row.length; x++) {
      if (row[x].terrain === 'forest') forestBefore.add(`${x},${y}`);
    }
  }

  const hasForestNearby = (x: number, y: number): boolean => {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        if (forestBefore.has(`${x + dx},${y + dy}`)) return true;
      }
    }
    return false;
  };

  for (let y = 0; y < h; y++) {
    const row = state.map[y];
    for (let x = 0; x < row.length; x++) {
      const t = row[x];
      if (t.terrain !== 'plain' || t.buildingId != null) continue;
      const chance = hasForestNearby(x, y)
        ? CONFIG.agents.forestRegrowChance
        : CONFIG.agents.forestPioneerChance;
      if (chance > 0 && rng() < chance) t.terrain = 'forest';
    }
  }
}

// 서식지 점검: 반경 안 숲이 줄면 짐승이 떠나고, 숲이 되살아나면 돌아온다
function updateHabitats(state: GameState): void {
  for (const habitat of state.habitats) {
    const active = isHabitatActive(state.map, habitat);
    if (active === habitat.active) continue;
    habitat.active = active;
    if (active) {
      addLog(state, '숲이 되살아나 짐승들이 서식지로 돌아왔습니다.', 'good');
    } else {
      addLog(state, '벌목으로 숲이 줄어 짐승들이 서식지를 떠났습니다.', 'bad');
    }
  }
}

// 가죽공방: 자동으로 가죽 → 옷
function runTannery(state: GameState): void {
  const tanneries = countBuilt(state, 'tannery');
  if (tanneries === 0) return;
  const hideUsed = Math.min(processableAmount(state, 'hide'), tanneries * CONFIG.production.tanneryHidePerDay);
  if (hideUsed >= 2) {
    const made = Math.floor(hideUsed / 2);
    state.resources.hide -= made * 2;
    state.resources.clothes += made;
  }
}

// 도구 마모: 생산직 인원 수에 비례
function runToolWear(state: GameState): void {
  const producing = [
    'woodcutter', 'hunter', 'farmer', 'builder', 'smith', 'miner', 'fisher',
    'charcoalBurner', 'herder', 'powderMaker', 'herbalist', 'hauler',
  ];
  const n = state.residents.filter(r => r.alive && !r.sick && producing.includes(r.job)).length;
  state.resources.tools = Math.max(0, state.resources.tools - n * CONFIG.production.toolWearPerWorker);
}

function runConsumptionAndNeeds(state: GameState, rng: () => number): void {
  const cfg = CONFIG.needs;
  const season = getSeason(state.day);
  const living = livingResidents(state);
  const pop = living.length;
  if (pop === 0) return;

  // 식량
  const foodNeed = pop * cfg.foodPerDay;
  const fedRatio = foodNeed > 0 ? Math.min(1, state.resources.food / foodNeed) : 1;
  state.resources.food = Math.max(0, state.resources.food - foodNeed);

  // 장작
  const fwNeed = pop * cfg.firewoodPerPerson *
    CONFIG.seasons.firewoodMult[season] * firewoodWeatherMult(state.weather);
  const firewoodRatio = fwNeed > 0 ? Math.min(1, state.resources.firewood / fwNeed) : 1;
  state.resources.firewood = Math.max(0, state.resources.firewood - fwNeed);

  // 옷
  const clothesCoverage = Math.min(1, state.resources.clothes / pop);
  if (season === 'winter') {
    state.resources.clothes = Math.max(0, state.resources.clothes - pop * cfg.clothesWearWinter);
  }

  const rng2 = makeRng(state.seed + state.day * 104729);
  updateResidentNeeds(state, rng2, fedRatio, firewoodRatio, clothesCoverage);

  const foodOk = state.resources.food > pop * cfg.foodPerDay * 6;
  updateMorale(state, foodOk, avg(state, 'warmth'), countBuilt(state, 'market') > 0);

  if (fedRatio < 1) addLog(state, '식량이 모자라 주민들이 배를 곯았습니다.', 'bad');
  if (firewoodRatio < 1 && (season === 'winter' || season === 'autumn')) {
    addLog(state, '장작이 부족해 아궁이가 식었습니다. 주민들의 체온이 떨어집니다.', 'bad');
  }
  if ((state.weather === 'coldSnap' || state.weather === 'blizzard') && rng() < 0.2) {
    addLog(state, '혹한으로 약한 주민들이 앓기 시작합니다.', 'bad');
  }
}

function runImmigration(state: GameState, rng: () => number): void {
  const season = getSeason(state.day);
  if (season !== 'spring' && season !== 'summer') return;
  const im = CONFIG.immigration;
  const living = livingResidents(state);
  const pop = living.length;
  const housing = housingCapacity(state);
  if (housing.total - pop <= 0) return;
  if (state.resources.food < pop * im.minFoodPerPerson) return;
  if (avg(state, 'morale') < im.minMorale) return;
  if (rng() >= im.dailyChance * rankEffects(state.rank).immigration) return; // 승격할수록 사람이 모인다

  const rngN = makeRng(state.seed + state.day * 15485863);
  const count = Math.min(
    housing.total - pop,
    im.groupMin + Math.floor(rngN() * (im.groupMax - im.groupMin + 1)),
  );
  for (let i = 0; i < count; i++) {
    state.residents.push(createResident(state, rngN, 'idle'));
  }
  addLog(state, `살 곳을 찾아 남쪽에서 이주민 ${count}명이 도착했습니다. 직업을 배정해 주십시오.`, 'good');
}

// ─────────────────────────── 승패 판정 ───────────────────────────

function checkEndConditions(state: GameState): void {
  if (state.gameOver) return;
  const living = livingResidents(state);

  if (living.length === 0) {
    state.gameOver = { won: false, reason: '모든 주민이 죽었습니다. 개척지는 눈 속에 묻혔습니다.' };
    return;
  }
  if (!state.buildings.some(b => b.type === 'center' && b.built)) {
    state.gameOver = { won: false, reason: '마을 중심지가 파괴되었습니다. 개척은 실패로 끝났습니다.' };
    return;
  }
  if (state.badWinterStreak >= 2) {
    state.gameOver = { won: false, reason: '두 해 연속 겨울을 넘긴 주민이 다섯도 되지 않습니다. 조정은 개척지를 포기했습니다.' };
    return;
  }
  const starveLimit = Math.max(4, Math.ceil((living.length + state.starvationDeathsThisYear) * 0.3));
  if (state.starvationDeathsThisYear >= starveLimit) {
    state.gameOver = { won: false, reason: '식량 부족으로 대규모 아사가 벌어졌습니다. 살아남은 이들은 마을을 버리고 떠났습니다.' };
    return;
  }

  // 승격 사다리: 다음 단계 조건 점검 (충족 시 승격, 부 승격이 최종 승리)
  checkPromotion(state);
}

export { getSeason, getYear, getDayOfSeason, SUBTICKS };
