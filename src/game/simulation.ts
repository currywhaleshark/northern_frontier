// 시뮬레이션 오케스트레이터
// 하루는 SUBTICKS개의 서브틱으로 나뉜다. 서브틱마다 주민 에이전트가 이동/작업/운반하고,
// 하루가 넘어갈 때 소비/생존/위협/이벤트 등 일일 처리를 한다.
import { CONFIG } from './config';
import { isJobUnlocked, JOB_NAMES, RANK_NAMES, RESOURCE_NAMES, SEASON_NAMES } from './constants';
import {
  BUILDING_DEFS, buildingCostFor, buildingFootprintTiles, canAfford, canAffordCost,
  cannonPlacementsUsed, canPlaceBuildingAt, canPlaceOn, clampPlotSide,
  clearBuildingTiles, computeDefense, getBuilding, isBuildingUnlocked,
  footprintTilesOf, isAreaBuildingType, isPaddyEligibleTile, isPlotBuildingType, isSmithyProductUnlocked,
  occupyBuildingTiles, plotArea, SMITHY_PRODUCT_DEFS,
} from './buildings';
import { isWallBuilding } from './walls';
import { addLog, maybeFlavorLog, maybeOfferTrade, resolveTrade } from './events';
import { announceCourtTribute, maybeCollectTribute, resolveCourtTribute } from './courtTribute';
import { dailyScenarioTick, resolveScenarioChoice, scenarioSuppressesRandomEvents } from './scenario';
import { grantYearlyPowder, resolvePetition } from './petition';
import { checkPromotion, resolvePromotionDecreeChoice } from './promotion';
import { resolveCrackdown, resolveInspection, updateSuspicion } from './suspicion';
import { generateMap, makeRng } from './map';
import { advanceForestGrowth, setTreeStage } from './forestGrowth';
import { isHabitatActive, spawnAnimalHabitats } from './habitats';
import { agentsTick, resetAgent, SUBTICKS } from './agents';
import { battleTick } from './battles';
import {
  checkRaidTrigger, raidHoldTick, raidersTick, resolveExpeditionRaidOrder, resolveExtortion, resolveRaid, updateThreat,
} from './raids';
import { driftRelations, initRelations } from './relations';
import { resetFactionTradeCapacityUsage } from './tradeValues';
import {
  avg, createResident, livingResidents, reconcileResidentHomes, updateMorale, updateResidentNeeds,
} from './residents';
import { getDayOfSeason, getSeason, getYear } from './seasons';
import { firewoodWeatherMult, rollWeather } from './weather';
import { defaultProcessingReserves } from './processing';
import { hasKnownMineralDepositNear } from './miningSites';
import {
  canPlantCropNow, cropIdForBuilding, CROP_DEFS, defaultCropForBuildingType, isCropAllowedOnBuilding,
} from './crops';
import {
  clothingCoverageTotal, consumeClothingWear, consumeFoodByDiet, consumeFuelHeat, foodTotal,
} from './consumption';
import { edictFoodRationMultiplier, edictFuelRationMultiplier } from './edicts';
import { getPointerAction } from './selectionActions';
import { createExploration, isBuildingFootprintExplored, refreshExploration } from './exploration';
import { LUXURY_RESOURCES } from './resourceCatalog';
import { DRYING_PRODUCT_DEFS } from './preservation';
import { haulerCarryCapacity, returnResidentCart, setResidentCartEquipped } from './equipment';
import { reconcileMountAssignments, reconcileWeaponAssignments, setAutomaticWeaponAllocation } from './weapons';
import { CURRENT_SCHEMA_VERSION } from './saveSchema';
import { expeditionTick } from './expedition';
import {
  maybeOpenExpeditionEngagementChoice, resolveExpeditionEngagementChoice,
} from './expeditionEngagement';
import { isHaulSourceBuilding } from './inventory';
import { maybeOfferDefectorImmigration, maybeOfferImmigration, resolveImmigration } from './immigration';
import { createIncidentState, resolveSpecialEvent, updateSpecialEvents } from './specialEvents';
import { dailyClaimTensionTick, noteBuildingClaimIntrusions } from './claimZones';
import { applyDailySpoilage, spoilageStockSnapshot } from './spoilage';
import { consumptionWeight, lifecycleDailyTick, resolveWeddingChoice } from './lifecycle';
import { applyJobChangeCarryover, dailyEducationTick, isLiterateJob } from './education';
import { canResidentTakeJob, isYouthWorkJob, youthActivityOf } from './youth';
import { dailyReligionTick, resolveReligionChoice } from './religion';
import { dailySpecialResidentTick, resolveSpecialResidentChoice } from './specialResidents';
import { dailySilverTick, resolveSilverVeinChoice } from './silver';
import { updateFermentation } from './fermentation';
import { isKimjangChoice, maybeOpenKimjangEvent, resolveKimjangChoice } from './kimjang';
import {
  createDefaultLivestockState, ensureLivestockState, livestockCapacityForStable, setPlotPlowOxen,
  setStableLivestock, slaughterStableLivestock, updateLivestock,
} from './livestock';
import { pastureRequiredHerders, setStablePasture } from './pastures';
import { resolveTerritoryWarning, updateTerritoryWarnings } from './territory';
import {
  foreignSiteAt, generateForeignSites, revealForeignSitesFromExploration, updateSeasonalForeignSites,
} from './foreignSites';
import {
  autoAssignWorkersToSelectedBuildingTypes as autoAssignWorkersToSelectedSlots,
  assignNearestWorkerToBuilding as assignNearestWorkerToSlot,
  assignResidentToBuilding as assignResidentToSlot,
  clearAssignmentsForBuilding,
  clearIncompatibleAssignment,
  unassignResidentFromBuilding as unassignResidentFromSlot,
  workerSlotConfig,
} from './workerSlots';
import type { AutoAssignBuildingType } from './workerSlots';
import type {
  Building, BuildingTypeId, CropId, Difficulty, DryingProductId, GameState, JobId, LivestockId, PointerAction, Resident, ResourceId, Season, SmithyProductId, YouthActivity,
} from './types';

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
    schemaVersion: CURRENT_SCHEMA_VERSION,
    day: 1,
    subTick: 0,
    difficulty,
    seed: s,
    weather: 'clear',
    map: tiles,
    exploration: createExploration({ map: tiles }),
    // 짐승 서식지: 숲 덩어리마다 난이도별 확률로 자리 잡는다 (마을 근처 하나는 보장)
    habitats: spawnAnimalHabitats(tiles, centerX, centerY, rng, diff.habitatChance),
    foreignSites: [],
    claimZones: [],
    nextForeignSiteId: 1,
    nextClaimZoneId: 1,
    territoryViolations: [],
    residents: [],
    buildings: [],
    nextBuildingId: 1,
    nextResidentId: 1,
    resources: startRes,
    unlockedLivestock: [...CONFIG.livestock.initialUnlocked],
    weaponAssignments: {},
    mountAssignments: {},
    weaponAllocationMode: 'auto',
    processingReserves: defaultProcessingReserves(),
    threat: 25,
    relations: initRelations(),
    expedition: null,
    raidHold: null,
    raiders: null,
    battle: null,
    battleScars: [],
    tacticalBattle: null,
    tacticalBattleReport: null,
    raidCooldown: 0,
    tradeRefusedDays: 0,
    lastTradeDay: 0,
    lastTradeByFaction: {},
    tradeCapacitySeason: 0,
    tradeCapacityUsed: {},
    lastImmigrationDay: -999,
    lastKimjangYear: 0,
    incidents: createIncidentState(s),
    specialItems: {
      wildGinseng: 0, tigerPelt: 0, gyrfalcon: 0,
      boDecree: 0, jinDecree: 0, buDecree: 0,
    },
    discoveredSpecialItems: [],
    tributeWaivers: 0,
    pendingChoice: null,
    courtTribute: null,
    tributeReserve: {},
    tributeFailStreak: 0,
    tributePaidStreak: 0,
    rank: 'settlement',
    pendingPromotionNotice: null,
    lastPetitionDay: 0,
    cannonsGranted: 0,
    suspicion: 0,
    edicts: {},
    edictWhiplashUntil: 0,
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
    lastDeathCause: 'other',
    victoryProgressNote: '',
  };
  state.spoilageStockAtDayStart = spoilageStockSnapshot(state);

  // 마을 중심지 + 초가집 2채는 지어진 상태로 시작
  placePrebuilt(state, 'center', centerX, centerY);
  const hutSpots = findNearbySpots(state, centerX, centerY, 'hut', 2);
  for (const spot of hutSpots) placePrebuilt(state, 'hut', spot.x, spot.y);
  generateForeignSites(state, rng);

  // 시작 주민 (마을 중심에서 출발)
  for (const [job, count] of Object.entries(CONFIG.start.jobs)) {
    for (let i = 0; i < count; i++) {
      state.residents.push(createResident(state, rng, job as JobId));
    }
  }
  // 개척민 중 글을 아는 이 — 의원·아전·훈장의 콜드 스타트를 막는다
  for (const resident of state.residents.slice(0, CONFIG.education.startLiterateAdults)) {
    resident.literate = true;
  }
  setAutomaticWeaponAllocation(state);
  reconcileResidentHomes(state, rng);

  state.weather = rollWeather(1, rng);
  state.resources.defense = computeDefense(state);
  refreshExploration(state);
  revealForeignSitesFromExploration(state);

  addLog(state, '조정의 명을 받아 두만강 이북 개척지에 도착했습니다. 짧은 봄 동안 겨울을 준비해야 합니다.', 'info');
  addLog(state, '나무를 베고, 집을 짓고, 식량과 장작을 모으십시오. 첫 겨울이 모든 것을 시험할 것입니다.', 'info');
  announceCourtTribute(state); // 1년차 봄이 day 1이므로 첫해 세공도 여기서 공지
  return state;
}

function placePrebuilt(state: GameState, type: BuildingTypeId, x: number, y: number): void {
  const b: Building = {
    id: state.nextBuildingId++, type, x, y,
    progress: BUILDING_DEFS[type].buildDays, built: true, fieldGrowth: 0,
    cropId: defaultCropForBuildingType(type),
    queuedCropId: null,
  };
  if (isAreaBuildingType(type)) {
    b.w = 1;
    b.h = 1;
  }
  if (isPlotBuildingType(type)) {
    b.sownArea = 0;
    b.plowOxen = 0;
  }
  if (type === 'center') {
    b.w = 3;
    b.h = 2;
  }
  if (type === 'jangdokdae') b.fermentBatches = [];
  if (type === 'stable') b.livestock = createDefaultLivestockState();
  state.buildings.push(b);
  const tiles = footprintTilesOf(state, b) ?? [];
  occupyBuildingTiles(state, b);
  for (const tile of tiles) {
    if (tile.terrain === 'forest') tile.terrain = 'plain';
  }
}

function findNearbySpots(
  state: GameState,
  cx: number,
  cy: number,
  type: BuildingTypeId,
  count: number,
): { x: number; y: number }[] {
  const spots: { x: number; y: number }[] = [];
  const reserved = new Set<string>();
  const canReserve = (x: number, y: number): boolean => {
    const tiles = buildingFootprintTiles(state, type, x, y);
    if (!tiles) return false;
    const def = BUILDING_DEFS[type];
    return tiles.every(tile => !reserved.has(`${tile.x},${tile.y}`) && canPlaceOn(def, tile, state));
  };
  const reserve = (x: number, y: number): void => {
    const tiles = buildingFootprintTiles(state, type, x, y) ?? [];
    for (const tile of tiles) reserved.add(`${tile.x},${tile.y}`);
  };
  for (let r = 1; r <= 4 && spots.length < count; r++) {
    for (let dy = -r; dy <= r && spots.length < count; dy++) {
      for (let dx = -r; dx <= r && spots.length < count; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (canReserve(x, y)) {
          spots.push({ x, y });
          reserve(x, y);
        }
      }
    }
  }
  return spots;
}

// ─────────────────────────── 플레이어 행동 ───────────────────────────

export function tryPlaceBuilding(
  state: GameState,
  type: BuildingTypeId,
  x: number,
  y: number,
  plotW?: number,
  plotH?: number,
): string | null {
  const def = BUILDING_DEFS[type];
  const tile = state.map[y]?.[x];
  if (!tile) return '지도 밖입니다.';
  // 경작지와 묘역은 드래그 크기를 받는다 — 그 외 건물은 타입 고정 크기
  const w = isAreaBuildingType(type) ? clampPlotSide(plotW ?? 1) : undefined;
  const h = isAreaBuildingType(type) ? clampPlotSide(plotH ?? 1) : undefined;
  if (!isBuildingUnlocked(state.rank, type)) {
    const rankName = def.minRank ? RANK_NAMES[def.minRank] : RANK_NAMES.bo;
    return `${rankName} 승격 후 지을 수 있습니다.`;
  }
  if (!isBuildingFootprintExplored(state, type, x, y, w, h)) return '아직 답사하지 않은 곳입니다.';
  revealForeignSitesFromExploration(state);
  const proposedTiles = buildingFootprintTiles(state, type, x, y, w, h) ?? [];
  if (proposedTiles.some(proposed => foreignSiteAt(state, proposed.x, proposed.y))) {
    return '현지 거점이 자리한 곳에는 건물을 지을 수 없습니다.';
  }
  if (type === 'mine') {
    if (!proposedTiles.every(proposed => canPlaceOn(def, proposed, state))) {
      return '채광장은 광상 위가 아닌 비어 있는 육지에 지어야 합니다.';
    }
    if (!hasKnownMineralDepositNear(state, x, y)) {
      return `반경 ${CONFIG.minerals.mineWorkRadius}칸 안에 발견된 광상이 있어야 합니다.`;
    }
  }
  if (!canPlaceBuildingAt(state, type, x, y, w, h)) return '이곳에는 지을 수 없습니다.';
  if (def.unique && state.buildings.some(b => b.type === type)) return '이미 건설 중이거나 완공되었습니다.';
  if (type === 'cannonEmplacement' && cannonPlacementsUsed(state) >= state.cannonsGranted) {
    return '불랑기포는 조정의 하사가 있어야 합니다. (조정 탭에서 청원)';
  }
  const cost = buildingCostFor(type, w ?? 1, h ?? 1);
  if (!canAffordCost(state, cost)) return '자원이 부족합니다.';

  for (const [res, amt] of Object.entries(cost)) {
    state.resources[res as keyof typeof state.resources] -= amt ?? 0;
  }
  const b: Building = {
    id: state.nextBuildingId++, type, x, y, progress: 0, built: false, fieldGrowth: 0,
    cropId: defaultCropForBuildingType(type),
    queuedCropId: null,
  };
  if (isAreaBuildingType(type)) {
    b.w = w;
    b.h = h;
  }
  if (isPlotBuildingType(type)) {
    b.sownArea = 0;
    b.plowOxen = 0;
  }
  if (type === 'smithy') b.smithyProduct = 'tools';
  if (type === 'dryingRack') b.dryingProduct = 'saltedFish';
  if (type === 'jangdokdae') b.fermentBatches = [];
  if (type === 'stable') b.livestock = createDefaultLivestockState();
  state.buildings.push(b);
  const tiles = buildingFootprintTiles(state, type, x, y, w, h) ?? [];
  occupyBuildingTiles(state, b);
  for (const footprintTile of tiles) {
    if (footprintTile.terrain === 'forest') {
      footprintTile.terrain = 'plain';
      state.resources.wood += 3; // 개간하며 얻는 목재
    }
  }
  addLog(state, `${def.name} 건설을 시작했습니다.`, 'info');
  noteBuildingClaimIntrusions(state, b);
  return null;
}

export function demolishBuilding(state: GameState, x: number, y: number): string | null {
  const tile = state.map[y]?.[x];
  if (!tile) return '지도 밖입니다.';
  const building = getBuilding(state, tile.buildingId);
  if (!building) return '철거할 건물이 없습니다.';
  if (!isWallBuilding(building.type)) return '성벽 계열만 철거할 수 있습니다.';

  const def = BUILDING_DEFS[building.type];
  for (const [res, amount] of Object.entries(def.cost)) {
    const refund = Math.max(1, Math.floor((amount ?? 0) / 2));
    state.resources[res as ResourceId] += refund;
  }
  for (const [res, amount] of Object.entries(building.inventory ?? {})) {
    state.resources[res as ResourceId] += amount ?? 0;
  }

  clearBuildingTiles(state, building.id);
  clearAssignmentsForBuilding(state, building.id);
  state.buildings = state.buildings.filter(b => b.id !== building.id);
  reconcileMountAssignments(state);
  state.resources.defense = computeDefense(state);
  addLog(state, `${def.name}을(를) 철거했습니다.`, 'info');
  return null;
}

export function cancelBuildingConstruction(state: GameState, buildingId: number): string | null {
  const building = getBuilding(state, buildingId);
  if (!building) return '취소할 건설 현장이 없습니다.';
  if (building.built) return '완공된 건물은 건설 취소할 수 없습니다.';
  if (building.repairing) return '수리 중인 건물은 건설 취소할 수 없습니다.';

  const def = BUILDING_DEFS[building.type];
  for (const [res, amount] of Object.entries(def.cost)) {
    state.resources[res as ResourceId] += amount ?? 0;
  }
  for (const [res, amount] of Object.entries(building.inventory ?? {})) {
    state.resources[res as ResourceId] += amount ?? 0;
  }

  clearBuildingTiles(state, building.id);
  clearAssignmentsForBuilding(state, building.id);
  state.buildings = state.buildings.filter(candidate => candidate.id !== building.id);
  reconcileMountAssignments(state);
  for (const resident of state.residents) {
    if (!resident.alive || resident.job !== 'builder') continue;
    resetAgent(state, resident);
    resident.task = '새 공사 확인 중';
  }
  state.resources.defense = computeDefense(state);
  addLog(state, `${def.name} 건설을 취소했습니다. 투입 자재를 모두 회수했습니다.`, 'info');
  return null;
}

// 직업 재배정: from 직업의 산 주민 1명을 to 직업으로
export function reassignJob(state: GameState, from: JobId, to: JobId): boolean {
  if (!isJobUnlocked(state.rank, to)) return false;
  // 문해자 전용 관직 — 글을 아는 주민만 후보가 된다
  const eligible = (res: Resident) => canResidentTakeJob(res, to)
    && (!isLiterateJob(to) || res.literate === true);
  const r = state.residents.find(res =>
    res.alive && !res.special && res.job === from && res.assignedBuildingId == null && eligible(res))
    ?? state.residents.find(res => res.alive && !res.special && res.job === from && eligible(res));
  if (!r) {
    if (isLiterateJob(to) && state.residents.some(res => res.alive && !res.special && res.job === from)) {
      addLog(state, `${JOB_NAMES[to]}은(는) 글을 아는 주민만 맡을 수 있습니다. 서당에서 아이를 가르치거나 문해자 유민을 기다리십시오.`, 'info');
    }
    return false;
  }
  if (to !== 'hauler') returnResidentCart(state, r);
  applyJobChangeCarryover(r, to);
  r.job = to;
  clearIncompatibleAssignment(state, r);
  resetAgent(state, r);
  reconcileWeaponAssignments(state);
  reconcileMountAssignments(state);
  state.resources.defense = computeDefense(state);
  return true;
}

export function setResidentJob(state: GameState, id: number, job: JobId): void {
  if (!isJobUnlocked(state.rank, job)) return;
  const r = state.residents.find(res => res.id === id);
  if (r?.stage && r.stage !== 'youth') {
    addLog(state, `${r.name}은(는) 아직 아이라 일을 맡길 수 없습니다.`, 'info');
    return;
  }
  if (r?.stage === 'youth' && youthActivityOf(r) !== 'work') {
    addLog(state, `${r.name}은(는) 서당에 다니는 소년이라 생산 일을 맡길 수 없습니다. 먼저 일 돕기를 선택하십시오.`, 'info');
    return;
  }
  if (r?.stage === 'youth' && !isYouthWorkJob(job)) {
    addLog(state, `${r.name}은(는) 소년이라 안전한 일 돕기 직무만 맡을 수 있습니다.`, 'info');
    return;
  }
  if (r?.special) {
    addLog(state, `${r.name}은(는) 제 소명이 있는 사람이라 다른 일을 맡지 않습니다.`, 'info');
    return;
  }
  if ((job === 'shaman' || job === 'monk') && !r?.special) {
    addLog(state, '무당과 승려는 마을에 들어온 그 사람만 맡을 수 있습니다.', 'info');
    return;
  }
  if (r && isLiterateJob(job) && r.literate !== true) {
    addLog(state, `${r.name}은(는) 글을 몰라 ${JOB_NAMES[job]}을(를) 맡을 수 없습니다. 서당에서 배운 아이나 문해자 유민이 필요합니다.`, 'info');
    return;
  }
  if (r && r.alive) {
    if (job !== 'hauler') returnResidentCart(state, r);
    applyJobChangeCarryover(r, job);
    r.job = job;
    clearIncompatibleAssignment(state, r);
    resetAgent(state, r);
    reconcileWeaponAssignments(state);
    reconcileMountAssignments(state);
    state.resources.defense = computeDefense(state);
  }
}

export function setYouthActivity(
  state: GameState,
  id: number,
  activity: YouthActivity,
): string | null {
  const resident = state.residents.find(candidate => candidate.id === id);
  if (!resident?.alive) return '소년 주민을 찾을 수 없습니다.';
  if (resident.stage !== 'youth') return '소년에게만 활동을 정할 수 있습니다.';
  if (youthActivityOf(resident) === activity) return null;

  if (activity === 'school') {
    returnResidentCart(state, resident);
    resident.job = 'idle';
    resident.assignedBuildingId = null;
  } else if (!isYouthWorkJob(resident.job)) {
    resident.job = 'idle';
    resident.assignedBuildingId = null;
  }
  resident.youthActivity = activity;
  resident.education ??= 0;
  resetAgent(state, resident);
  reconcileWeaponAssignments(state);
  reconcileMountAssignments(state);
  state.resources.defense = computeDefense(state);
  addLog(
    state,
    activity === 'school'
      ? `${resident.name}이(가) 일손을 놓고 서당에 다니기 시작했습니다.`
      : `${resident.name}이(가) 서당 공부를 멈추고 반몫으로 일을 돕습니다.`,
    'info',
  );
  return null;
}

export function toggleResidentCart(state: GameState, id: number): string | null {
  const resident = state.residents.find(candidate => candidate.id === id);
  if (!resident) return '주민을 찾을 수 없습니다.';
  const equipping = !resident.cartEquipped;
  const error = setResidentCartEquipped(state, resident, equipping);
  if (error) return error;
  resetAgent(state, resident);
  addLog(
    state,
    equipping
      ? `${resident.name}에게 수레를 장비했습니다. 적재량이 ${haulerCarryCapacity(resident)}(으)로 늘어납니다.`
      : `${resident.name}의 수레를 마을 비축으로 돌려보냈습니다.`,
    'good',
  );
  return null;
}

function interruptResidentForManualOrder(resident: Resident): void {
  resident.path = [];
  resident.phase = 'rest';
  resident.workTimer = 0;
  resident.targetId = null;
  resident.haulTask = null;
}

export function assignResidentToBuilding(state: GameState, residentId: number, buildingId: number): string | null {
  const resident = state.residents.find(res => res.id === residentId);
  const previousJob = resident?.job;
  const previousAssignment = resident?.assignedBuildingId;
  const reason = assignResidentToSlot(state, residentId, buildingId);
  if (reason) return reason;
  if (resident && (resident.job !== previousJob || resident.assignedBuildingId !== previousAssignment)) {
    resetAgent(state, resident);
  }
  return null;
}

export function assignNearestWorkerToBuilding(state: GameState, buildingId: number): string | null {
  const previousAssignments = new Map(state.residents.map(resident => [resident.id, resident.assignedBuildingId]));
  const reason = assignNearestWorkerToSlot(state, buildingId);
  if (reason) return reason;

  const changedResident = state.residents.find(
    resident => previousAssignments.get(resident.id) !== resident.assignedBuildingId,
  );
  if (changedResident) resetAgent(state, changedResident);
  return null;
}

export function unassignResidentFromBuilding(state: GameState, residentId: number): void {
  const resident = state.residents.find(res => res.id === residentId);
  const previousAssignment = resident?.assignedBuildingId;
  unassignResidentFromSlot(state, residentId);
  if (resident && previousAssignment != null && resident.assignedBuildingId == null) resetAgent(state, resident);
}

function hasForcedTerritoryAccess(required: readonly number[] | undefined, forced: readonly number[]): boolean {
  return (required ?? []).every(siteId => forced.includes(siteId));
}

export function issueResidentMoveOrder(
  state: GameState,
  residentId: number,
  x: number,
  y: number,
  forcedSiteIds: readonly number[] = [],
): string | null {
  const resident = state.residents.find(res => res.id === residentId && res.alive);
  if (!resident) return '선택한 주민이 없습니다.';
  const tile = state.map[y]?.[x];
  if (!tile) return '지도 밖입니다.';

  const action = getPointerAction(state, { kind: 'resident', id: residentId }, tile);
  if (action.kind !== 'move') return action.label || '이동할 수 없습니다.';
  if (!hasForcedTerritoryAccess(action.unauthorizedSiteIds, forcedSiteIds)) return '통행 허락이 없는 세력권입니다.';

  resident.manualOrder = { kind: 'move', x, y, unauthorizedSiteIds: [...forcedSiteIds] };
  interruptResidentForManualOrder(resident);
  resident.task = '이동 명령';
  return null;
}

export function issueResidentWorkOrder(
  state: GameState,
  residentId: number,
  requestedAction: PointerAction,
  forcedSiteIds: readonly number[] = [],
): string | null {
  if (requestedAction.kind !== 'work') return '작업 명령이 아닙니다.';
  const resident = state.residents.find(res => res.id === residentId && res.alive);
  if (!resident) return '선택한 주민이 없습니다.';
  const tile = state.map[requestedAction.y]?.[requestedAction.x];
  if (!tile) return '지도 밖입니다.';

  const action = getPointerAction(state, { kind: 'resident', id: residentId }, tile);
  if (action.kind !== 'work') return action.label || '작업할 수 없습니다.';
  if (!hasForcedTerritoryAccess(action.unauthorizedSiteIds, forcedSiteIds)) return '작업 허락이 없는 세력권입니다.';

  const targetBuilding = action.buildingId == null ? undefined : getBuilding(state, action.buildingId);
  const forcedHaulTarget = resident.job === 'hauler' && !!targetBuilding && isHaulSourceBuilding(targetBuilding);
  if (targetBuilding?.built && workerSlotConfig(targetBuilding.type) && !forcedHaulTarget && forcedSiteIds.length === 0) {
    return assignResidentToBuilding(state, residentId, targetBuilding.id);
  }

  resident.manualOrder = {
    kind: 'work',
    x: action.x,
    y: action.y,
    buildingId: action.buildingId,
    repeat: resident.job === 'hauler' && forcedHaulTarget,
    unauthorizedSiteIds: [...forcedSiteIds],
  };
  interruptResidentForManualOrder(resident);
  resident.task = action.label;
  return null;
}

export function clearResidentManualOrder(state: GameState, residentId: number): void {
  const resident = state.residents.find(res => res.id === residentId);
  if (!resident) return;
  resident.manualOrder = null;
  interruptResidentForManualOrder(resident);
}

export function upgradeHousingBuilding(
  state: GameState,
  buildingId: number,
  targetType: Extract<BuildingTypeId, 'ondol' | 'tileHouse'>,
): string | null {
  const building = state.buildings.find(b => b.id === buildingId);
  if (!building) return '집을 찾을 수 없습니다.';
  if ((building.type !== 'hut' || targetType !== 'ondol') && (building.type !== 'ondol' || targetType !== 'tileHouse')) {
    return '개량할 수 없는 집입니다.';
  }
  if (!building.built) return '완공된 집만 개량할 수 있습니다.';
  const def = BUILDING_DEFS[targetType];
  if (!isBuildingUnlocked(state.rank, targetType)) {
    const rankName = def.minRank ? RANK_NAMES[def.minRank] : RANK_NAMES.bo;
    return `${rankName} 승격 후 개량할 수 있습니다.`;
  }
  if (!canAfford(state, def)) return '자원이 부족합니다.';

  for (const [res, amt] of Object.entries(def.cost)) {
    state.resources[res as keyof typeof state.resources] -= amt ?? 0;
  }
  building.type = targetType;
  building.progress = 0;
  building.built = false;
  occupyBuildingTiles(state, building);
  reconcileResidentHomes(state, makeRng(state.seed + state.day * 32452843 + building.id));
  addLog(state, `${def.name} 개량 공사를 시작했습니다.`, 'info');
  return null;
}

export function setBuildingCrop(
  state: GameState,
  buildingId: number,
  cropId: CropId,
  mode: 'queue' | 'uproot',
): string | null {
  const building = state.buildings.find(b => b.id === buildingId);
  if (!building || (building.type !== 'field' && building.type !== 'paddy')) return '작물을 고를 수 있는 건물이 아닙니다.';
  if (!building.built) return '완공된 밭이나 논에서만 작물을 고를 수 있습니다.';
  if (!isCropAllowedOnBuilding(cropId, building.type)) return `${CROP_DEFS[cropId].name}은(는) 이곳에서 기를 수 없습니다.`;

  const currentCrop = cropIdForBuilding(building);
  const hasStandingCrop = currentCrop != null && building.fieldGrowth > 0.5;
  const season = getSeason(state.day);

  if (mode === 'queue' && hasStandingCrop && currentCrop !== cropId) {
    building.queuedCropId = cropId;
    addLog(state, `${BUILDING_DEFS[building.type].name}의 다음 작물을 ${CROP_DEFS[cropId].name}(으)로 예약했습니다.`, 'info');
    return null;
  }

  building.fieldGrowth = 0;
  building.sownArea = 0;
  building.queuedCropId = null;
  if (canPlantCropNow(cropId, building.type, season)) {
    building.cropId = cropId;
    addLog(state, `${BUILDING_DEFS[building.type].name}에 ${CROP_DEFS[cropId].name}을(를) 심기로 했습니다.`, 'info');
  } else {
    building.cropId = null;
    building.queuedCropId = cropId;
    addLog(state, `${CROP_DEFS[cropId].name} 파종철이 아니어서 다음 가능 시기로 예약했습니다.`, 'info');
  }
  return null;
}

export function convertFieldToPaddy(state: GameState, buildingId: number): string | null {
  const building = state.buildings.find(b => b.id === buildingId);
  if (!building || building.type !== 'field') return '논으로 전환할 밭을 찾을 수 없습니다.';
  if (!building.built) return '완공된 밭만 논으로 전환할 수 있습니다.';
  const def = BUILDING_DEFS.paddy;
  if (!isBuildingUnlocked(state.rank, 'paddy')) return `${RANK_NAMES[def.minRank ?? 'bo']} 승격 후 논을 만들 수 있습니다.`;
  // 다칸 밭은 모든 칸이 강가 비옥지여야 논이 될 수 있다
  const footprint = footprintTilesOf(state, building) ?? [];
  if (footprint.length === 0 || !footprint.every(tile => isPaddyEligibleTile(state, tile))) {
    return '논은 강가의 비옥한 땅에만 만들 수 있습니다.';
  }
  const cost = buildingCostFor('paddy', building.w ?? 1, building.h ?? 1);
  if (!canAffordCost(state, cost)) return '자원이 부족합니다.';

  for (const [res, amt] of Object.entries(cost)) {
    state.resources[res as keyof typeof state.resources] -= amt ?? 0;
  }
  building.type = 'paddy';
  building.progress = 0;
  building.built = false;
  building.fieldGrowth = 0;
  building.sownArea = 0;
  building.cropId = 'rice';
  building.queuedCropId = null;
  occupyBuildingTiles(state, building);
  addLog(state, '밭을 논으로 바꾸는 공사를 시작했습니다.', 'info');
  return null;
}

export function setSmithyProduct(state: GameState, buildingId: number, product: SmithyProductId): string | null {
  const building = state.buildings.find(b => b.id === buildingId);
  if (!building || building.type !== 'smithy') return '대장간을 찾을 수 없습니다.';
  if (!isSmithyProductUnlocked(state.rank, product)) {
    const minRank = SMITHY_PRODUCT_DEFS[product].minRank;
    const rankName = minRank ? RANK_NAMES[minRank] : RANK_NAMES.bo;
    return `${rankName} 승격 후 생산할 수 있습니다.`;
  }
  building.smithyProduct = product;
  addLog(state, `대장간 생산품을 ${SMITHY_PRODUCT_DEFS[product].name}(으)로 바꿨습니다.`, 'info');
  return null;
}

export function setLivestockSpecies(state: GameState, buildingId: number, species: LivestockId): string | null {
  return setStableLivestock(state, buildingId, species);
}

export function defineStablePasture(
  state: GameState,
  buildingId: number,
  x: number,
  y: number,
  w: number,
  h: number,
): string | null {
  const error = setStablePasture(state, buildingId, { x, y, w, h });
  if (error) return error;
  const stable = state.buildings.find(building => building.id === buildingId)!;
  const livestock = ensureLivestockState(stable);
  addLog(
    state,
    `축사 방목지를 ${w}×${h}칸으로 정했습니다. ${livestockCapacityForStable(stable, livestock.species)}마리 수용 · 목동 ${pastureRequiredHerders(stable)}명 필요.`,
    'info',
  );
  return null;
}

export function slaughterLivestock(state: GameState, buildingId: number, amount = 1): string | null {
  return slaughterStableLivestock(state, buildingId, amount);
}

export function assignPlotPlowOxen(state: GameState, buildingId: number, count: number): string | null {
  return setPlotPlowOxen(state, buildingId, count);
}

export function setDryingProduct(state: GameState, buildingId: number, product: DryingProductId): string | null {
  const building = state.buildings.find(b => b.id === buildingId);
  if (!building || building.type !== 'dryingRack') return '건조대를 찾을 수 없습니다.';
  building.dryingProduct = product;
  addLog(state, `건조대 생산품을 ${DRYING_PRODUCT_DEFS[product].name}(으)로 바꿨습니다.`, 'info');
  return null;
}

export function resolveChoice(state: GameState, optionId: string): void {
  if (!state.pendingChoice) return;
  const selectedOption = state.pendingChoice.options.find(option => option.id === optionId);
  if (selectedOption?.disabled || (state.pendingChoice.options.length > 0 && !selectedOption)) return;
  if (state.pendingChoice.kind === 'territory' && state.pendingChoice.data.mode === 'orderConfirm') {
    const choice = state.pendingChoice;
    const action = choice.data.action as PointerAction;
    const residentId = choice.data.residentId as number;
    const siteIds = choice.data.siteIds as number[];
    state.pendingChoice = null;
    if (optionId === 'force') {
      const error = action.kind === 'move'
        ? issueResidentMoveOrder(state, residentId, action.x, action.y, siteIds)
        : action.kind === 'work'
          ? issueResidentWorkOrder(state, residentId, action, siteIds)
          : '강행할 명령이 없습니다.';
      if (error) addLog(state, error, 'bad');
    }
    return;
  }
  const incidentNonce = state.pendingChoice.kind === 'incident'
    ? state.incidents.resolutionCount++
    : 0;
  const rng = makeRng(state.seed + state.day * 7919 + incidentNonce * 104729 + 31);
  if (state.pendingChoice.kind === 'expedition') resolveExpeditionEngagementChoice(state, optionId, rng);
  else if (state.pendingChoice.kind === 'expeditionRaidOrder') resolveExpeditionRaidOrder(state, optionId);
  else if (state.pendingChoice.kind === 'raid') resolveRaid(state, optionId, rng);
  else if (state.pendingChoice.kind === 'extortion') resolveExtortion(state, optionId, rng);
  else if (state.pendingChoice.kind === 'tribute') resolveCourtTribute(state, optionId);
  else if (state.pendingChoice.kind === 'petition') resolvePetition(state, optionId);
  else if (state.pendingChoice.kind === 'inspection') resolveInspection(state, optionId, rng);
  else if (state.pendingChoice.kind === 'crackdown') resolveCrackdown(state, optionId, rng);
  else if (state.pendingChoice.kind === 'immigration') resolveImmigration(state, optionId);
  else if (state.pendingChoice.kind === 'incident' && isKimjangChoice(state.pendingChoice)) resolveKimjangChoice(state, optionId);
  else if (state.pendingChoice.kind === 'incident') resolveSpecialEvent(state, optionId, rng);
  else if (state.pendingChoice.kind === 'territory') resolveTerritoryWarning(state, optionId);
  else if (state.pendingChoice.kind === 'silverVein') resolveSilverVeinChoice(state, optionId, rng);
  else if (state.pendingChoice.kind === 'wedding') resolveWeddingChoice(state, optionId);
  else if (state.pendingChoice.kind === 'religion') resolveReligionChoice(state, optionId);
  else if (state.pendingChoice.kind === 'specialResident') resolveSpecialResidentChoice(state, optionId, rng);
  else if (state.pendingChoice.kind === 'scenario') resolveScenarioChoice(state, optionId);
  else if (state.pendingChoice.kind === 'promotionDecree') resolvePromotionDecreeChoice(state, optionId);
  else resolveTrade(state, optionId);
  reconcileWeaponAssignments(state);
  reconcileMountAssignments(state);
  state.resources.defense = computeDefense(state);
}

export function autoAssignWorkersToBuildingTypes(
  state: GameState,
  types: readonly AutoAssignBuildingType[],
): Resident[] {
  const assigned = autoAssignWorkersToSelectedSlots(state, types);
  for (const resident of assigned) resetAgent(state, resident);
  return assigned;
}

export function useLuxuryGood(state: GameState, resource: ResourceId): string | null {
  if (!(LUXURY_RESOURCES as readonly ResourceId[]).includes(resource)) return '사치품이 아닙니다.';
  if ((state.resources[resource] ?? 0) < 1) return '사치품이 부족합니다.';
  state.resources[resource] -= 1;
  for (const resident of livingResidents(state)) {
    resident.morale = Math.min(100, resident.morale + CONFIG.petition.luxuryMorale);
  }
  addLog(state, `${RESOURCE_NAMES[resource]}을(를) 나누어 주민들의 사기를 북돋았습니다.`, 'good');
  return null;
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
  if (state.gameOver || state.pendingChoice || state.tacticalBattle || state.tacticalBattleReport) return;
  // 틱 병목 계측 (옵트인) — window.__renderPerf가 있으면 단계별 누적 ms를 쌓는다
  const perf = typeof window !== 'undefined' ? window.__renderPerf : undefined;
  let perfLast = perf ? performance.now() : 0;
  const lap = (name: string): void => {
    if (!perf) return;
    const now = performance.now();
    const bucket = perf[name] ?? (perf[name] = { total: 0, count: 0 });
    bucket.total += now - perfLast;
    bucket.count++;
    perfLast = now;
  };
  agentsTick(state);
  lap('t1-agents');
  reconcileWeaponAssignments(state);
  reconcileMountAssignments(state);
  lap('t2-reconcile');
  state.resources.defense = computeDefense(state);
  lap('t3-defense');
  expeditionTick(state);
  maybeOpenExpeditionEngagementChoice(state);
  const tickRng = makeRng(state.seed + state.day * 7919 + state.subTick * 131 + 3);
  raidHoldTick(state, tickRng);
  lap('t4-expedition');
  refreshExploration(state);
  revealForeignSitesFromExploration(state);
  lap('t5-exploration');
  battleTick(state, tickRng);
  raidersTick(state, tickRng);
  lap('t6-battles');
  state.subTick++;
  if (state.subTick >= SUBTICKS) {
    state.subTick = 0;
    endOfDay(state);
  }
  lap('t7-endOfDay');
}

// 하루 통째로 진행 (테스트/디버그용)
export function advanceDay(state: GameState): void {
  for (let i = 0; i < SUBTICKS; i++) {
    if (state.gameOver || state.pendingChoice || state.tacticalBattle || state.tacticalBattleReport) break;
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
    if (state.weather === 'blizzard') addLog(state, '눈보라가 몰아칩니다. 장작 소모가 크게 증가하고 바깥일이 멈춥니다.', 'weather', true);
    else if (state.weather === 'coldSnap') addLog(state, '살을 에는 혹한이 닥쳤습니다. 밖에 오래 있으면 위험합니다.', 'weather', true);
    else if (state.weather === 'heavySnow') addLog(state, '폭설이 내려 발이 푹푹 빠집니다. 이동이 더뎌집니다.', 'weather');
    else if (state.weather === 'thawFlood') addLog(state, '해빙기 홍수로 강물이 불었습니다. 얼음 위로는 다닐 수 없습니다.', 'weather');
  }

  regrowForest(state, rng, season);
  updateHabitats(state);
  runToolWear(state);
  runConsumptionAndNeeds(state, rng);
  dailyEducationTick(state); // 취학 아동의 글공부 누적 (성인 전환 판정보다 먼저)
  lifecycleDailyTick(state, rng); // 성장·노화·혼인·출산·장례 (소비/체온 갱신 뒤)
  updateLivestock(state);
  applyDailySpoilage(state);
  updateFermentation(state);

  driftRelations(state);
  updateThreat(state);
  // 시나리오(튜토리얼) 중에는 랜덤 사건을 잠근다. 결정론적 처리(세공, 날씨)는 그대로.
  // 규칙: 새 랜덤 일일 시스템은 반드시 이 게이트 뒤에 추가한다.
  if (!scenarioSuppressesRandomEvents(state)) {
    checkRaidTrigger(state, rng);
    if (maybeOfferTrade(state, rng, state.day - state.lastTradeDay)) {
      state.lastTradeDay = state.day;
    }
    if (!maybeOfferDefectorImmigration(state, rng)) maybeOfferImmigration(state, rng);
    maybeFlavorLog(state, rng);
  }
  maybeCollectTribute(state); // 겨울: 조정의 사자가 세공을 거둔다 (모달 충돌 시 다음 날로)
  if (!scenarioSuppressesRandomEvents(state)) {
    dailyReligionTick(state, rng); // 떠돌이 무당/노승이 문을 두드린다 (진 이상)
    dailySpecialResidentTick(state, rng); // 귀양 선비 등 이름 있는 특수 주민
    dailySilverTick(state, rng); // 은맥 최초 발견/잠채 발각 — 의심 갱신보다 먼저
    updateSuspicion(state, rng); // 모반 의심 누적과 감찰/견책/토벌 사건
    maybeOpenKimjangEvent(state); // 늦가을~입동의 연례 공동 김장. 다른 모달이 있으면 기간 안에 재시도
    updateSpecialEvents(state, rng); // 기존 제도권 사건과 모달이 겹치면 예정일을 넘겨 다음 날 재시도
    updateTerritoryWarnings(state);
    dailyClaimTensionTick(state);
  }
  dailyScenarioTick(state); // 시나리오 스텝 진행 — 모달이 비어 있을 때 다음 안내를 연다

  state.resources.defense = computeDefense(state);
  checkEndConditions(state);
}

// 파종철이 닫히는 계절 전환에서 못 심은 칸을 확정한다 — 그 칸은 이번 작기 내내 논다
function settleSowingDeadline(state: GameState, prev: string, next: string): void {
  let idleTiles = 0;
  for (const b of state.buildings) {
    if ((b.type !== 'field' && b.type !== 'paddy') || !b.built) continue;
    const cropId = cropIdForBuilding(b);
    if (!cropId) continue;
    const crop = CROP_DEFS[cropId];
    const wasPlantable = crop.plantSeasons.includes(prev as Season);
    const stillPlantable = crop.plantSeasons.includes(next as Season);
    if (!wasPlantable || stillPlantable) continue;
    const area = plotArea(b);
    // 반쯤 심다 만 칸은 버려진다 (정수 칸만 소출에 든다)
    const sown = Math.min(area, Math.max(0, Math.floor(b.sownArea ?? 0)));
    b.sownArea = sown;
    if (sown < area) idleTiles += area - sown;
  }
  if (idleTiles > 0) {
    addLog(state, `파종철이 끝났습니다. 일손이 모자라 경작지 ${idleTiles}칸이 씨를 넣지 못한 채 놀게 됩니다.`, 'bad', true);
  }
}

function onSeasonChange(state: GameState, prev: string, next: string): void {
  resetFactionTradeCapacityUsage(state);
  updateSeasonalForeignSites(state, next as ReturnType<typeof getSeason>);
  addLog(state, `${SEASON_NAMES[next as keyof typeof SEASON_NAMES]}이(가) 시작되었습니다. (${getYear(state.day)}년차)`, 'weather');
  settleSowingDeadline(state, prev, next);

  if (next === 'winter') {
    state.winterStartPop = livingResidents(state).length;
    state.winterDeaths = 0;
    addLog(state, '강이 얼어붙기 시작합니다. 장작과 식량이 겨울을 버틸 만큼 있는지 확인하십시오.', 'weather', true);
    // 거두지 못한 곡식은 서리에 얼어붙는다
    let lost = false;
    for (const b of state.buildings) {
      if (b.type !== 'field' && b.type !== 'paddy') continue;
      const cropId = cropIdForBuilding(b);
      if (cropId && CROP_DEFS[cropId].survivesWinter) continue;
      if (b.fieldGrowth > 1) lost = true;
      b.fieldGrowth = 0;
      b.sownArea = 0;
    }
    if (lost) addLog(state, '거두지 못한 곡식이 서리에 얼어붙었습니다.', 'bad', true);
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
    addLog(state, '파종철입니다. 밭과 논의 작물 선택을 확인하고 농부를 배정하십시오.', 'info');
    announceCourtTribute(state); // 새해 세공 공지
    grantYearlyPowder(state);    // 진(鎭) 이상: 연례 화약 배급
  }
  if (next === 'autumn') {
    addLog(state, '수확철입니다. 곡식을 거두고 장작을 쌓아 두십시오. 국경 너머의 움직임도 잦아지는 때입니다.', 'info');
  }
}

// 봄/여름, 숲 인접 평지가 천천히 다시 숲이 된다
function regrowForest(state: GameState, rng: () => number, season: Season): void {
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
      if (t.terrain === 'forest') {
        advanceForestGrowth(
          t,
          season,
          rng,
          CONFIG.agents.forestStumpSproutChance,
          CONFIG.agents.forestYoungMatureChance,
        );
        continue;
      }
      if (t.terrain !== 'plain' || t.buildingId != null) continue;
      const chance = hasForestNearby(x, y)
        ? CONFIG.agents.forestRegrowChance
        : CONFIG.agents.forestPioneerChance;
      if (chance > 0 && rng() < chance) setTreeStage(t, 'young');
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

// 도구 마모: 생산직 인원 수에 비례
function runToolWear(state: GameState): void {
  const producing = [
    'woodcutter', 'woodSplitter', 'hunter', 'farmer', 'miller', 'builder', 'curer', 'potter', 'smith', 'miner', 'fisher',
    'charcoalBurner', 'herder', 'powderMaker', 'tanner', 'weaver', 'herbalist', 'hauler',
  ];
  const n = state.residents.filter(r =>
    r.alive && !r.sick && state.day >= (r.quarantinedUntil ?? 0) && producing.includes(r.job)).length;
  state.resources.tools = Math.max(0, state.resources.tools - n * CONFIG.production.toolWearPerWorker);
}

function runConsumptionAndNeeds(state: GameState, rng: () => number): void {
  const cfg = CONFIG.needs;
  const season = getSeason(state.day);
  const living = livingResidents(state);
  const pop = living.length;
  if (pop === 0) return;

  // 나이 단계별 소비 몫 — 아이는 성인보다 적게 먹고 적게 입는다
  const weight = consumptionWeight(state);

  // 식량 — 절미령이 서면 창고에서 내주는 몫만 줄어든다. 배부름은 평시 몫을 기준으로 재므로
  // 아껴 먹인 만큼 끼니를 거른 이가 생기고, 배고픔과 건강이 서서히 무너진다.
  const foodNeed = weight * cfg.foodPerDay;
  const rationedFoodNeed = foodNeed * edictFoodRationMultiplier(state);
  const foodResult = consumeFoodByDiet(state, rationedFoodNeed);
  const fedRatio = foodNeed > 0 ? Math.min(1, foodResult.totalConsumed / foodNeed) : 1;
  const foodShortage = foodResult.shortageRatio < 0.999; // 배급이 아니라 재고가 모자란 경우

  // 장작 — 절탄령도 같은 문법. 아궁이에 덜 넣은 만큼 체온 충족률이 떨어진다.
  const fwNeed = weight * cfg.firewoodPerPerson *
    CONFIG.seasons.firewoodMult[season] * firewoodWeatherMult(state.weather);
  const rationedFwNeed = fwNeed * edictFuelRationMultiplier(state);
  const heatProvided = consumeFuelHeat(state, rationedFwNeed);
  const firewoodRatio = fwNeed > 0 ? Math.min(1, heatProvided / fwNeed) : 1;
  const fuelShortage = heatProvided < rationedFwNeed - 0.000001;

  // 옷
  const clothesCoverage = Math.min(1, clothingCoverageTotal(state) / Math.max(1, weight));
  if (season === 'winter') {
    consumeClothingWear(state, weight * cfg.clothesWearWinter);
  }

  const rng2 = makeRng(state.seed + state.day * 104729);
  updateResidentNeeds(
    state, rng2, fedRatio, firewoodRatio, clothesCoverage,
    foodResult.varietyScore, foodResult.vegetableRatio,
    new Set(state.expedition?.memberIds ?? []),
  );

  // 밥상에 장·김치가 올랐는지 — 진 티어의 "밥상의 격" 성분이 이 날짜를 본다
  if ((foodResult.byResource.kimchi ?? 0) + (foodResult.byResource.jang ?? 0) > 0) {
    state.lastFermentMealDay = state.day;
  }

  const foodOk = foodTotal(state) > weight * cfg.foodPerDay * 6;
  updateMorale(state, {
    foodOk,
    warmthAvg: avg(state, 'warmth'),
    dietVarietyScore: foodResult.varietyScore,
    clothesCoverage,
  });

  if (foodShortage) addLog(state, '식량이 모자라 주민들이 배를 곯았습니다.', 'bad');
  if (fuelShortage && (season === 'winter' || season === 'autumn')) {
    addLog(state, '장작이 부족해 아궁이가 식었습니다. 주민들의 체온이 떨어집니다.', 'bad');
  }
  if ((state.weather === 'coldSnap' || state.weather === 'blizzard') && rng() < 0.2) {
    addLog(state, '혹한으로 약한 주민들이 앓기 시작합니다.', 'bad');
  }
}

// ─────────────────────────── 승패 판정 ───────────────────────────

function checkEndConditions(state: GameState): void {
  if (state.gameOver) return;
  const living = livingResidents(state);

  if (living.length === 0) {
    const reason = state.lastDeathCause === 'combat'
      ? '주민 전원이 전투에서 전사했습니다. 개척지는 습격대에게 무너졌습니다.'
      : state.lastDeathCause === 'starvation'
        ? '굶주림으로 주민 전원이 쓰러졌습니다. 개척지는 끝내 버려졌습니다.'
        : state.lastDeathCause === 'cold'
          ? '혹한으로 주민 전원이 숨졌습니다. 개척지는 눈 속에 묻혔습니다.'
          : state.lastDeathCause === 'disease'
            ? '질병으로 주민 전원이 숨졌습니다. 개척지는 끝내 버려졌습니다.'
            : '주민 전원이 숨져 개척지가 버려졌습니다.';
    state.gameOver = { won: false, reason };
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
