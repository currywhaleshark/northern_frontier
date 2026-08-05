// 주민 에이전트 시뮬레이션 — 서브틱 단위의 직업별 작업, 운반, 하루 일과.
// 자원은 창고/거점에 짐을 부려야 마을 비축량에 더해진다.
// 이동·목표 판정 등 공용 실행 계층은 agentCore.ts, 경로 탐색은 pathfinding.ts에 있다.
import { withJosa } from './josa';
import {
  GATHERING_JOBS, LEISURE_CLUSTER_CAPACITY, LEISURE_DESTINATION_TIERS, OUTDOOR_JOBS, PRODUCING_JOBS,
  SUBTICKS, WORK_CRAFT_EPSILON, WORK_STOCK_EPSILON, absoluteTick, addCarry,
  assignFireResponses, assignedWorkplace, assignedWorkplaceOfTypes, buildingGoal, buildingInteractionGoal,
  carryTotal, clearHaulTask, depositAll, depositBuildings, depositGoal,
  effOf, ensureResidentOnPassableTile, fireResponseAgentTick, gainSkillTick, goTo,
  goToCenter, huntDepletionWarningDaysFor, isResidentAtBuildingInteraction, isSettledAtGoal, isWorkplaceInputStock,
  loiterNearBuilding, loiterNearCenter, nearestBuilding, pathFailUntilFor, resetAgent,
  supplyWorkplaceInputs, tidalDepletionWarningDaysFor, tryLoiterStep, unloadAtDepositGoal, workerSlotGoal,
  workplaceInputResources,
} from './agentCore';
// agents는 에이전트 계층의 공개 진입점으로 남는다 — 다른 모듈과 게임 테스트가 여기서 가져간다.
export {
  LEISURE_CLUSTER_CAPACITY, SUBTICKS, ensureResidentOnPassableTile, ensureResidentsOnPassableTiles,
  gainSkillTick, resetAgent,
} from './agentCore';
export { findPath, isPassable, isTerrainPassable } from './pathfinding';
import type { Ctx, GoResult, WorkplaceInputs } from './agentCore';
import {
  CARDINAL_DIRS, isPassable,
} from './pathfinding';
import { CONFIG } from './config';
import {
  DAY_BANDS, DAY_CYCLE_SUBTICKS, WORK_RATE_SCALE, WORK_SUBTICKS, dayBandOf,
} from './dayCycle';
import {
  BUILDING_DEFS, buildingCostForInstance, cemeteryPlotCapacity, clearBuildingTiles, computeDefense, footprintTilesOf,
  isPlotBuildingType, isSmithyProductUnlocked, occupyBuildingTiles, officeEfficiencyMultiplier,
  plotArea, preferredLeveeEdgeAt, saltworksHasSeaAccess, SMITHY_PRODUCT_DEFS, smithyProductOf, sownAreaOf,
} from './buildings';
import { JOB_NAMES, RESOURCE_NAMES } from './constants';
import { addLog } from './events';
import {
  applyEdictCorveeStrain, edictCorveeEligible, edictCorveeEveningSubticks, edictCurfewActive,
} from './edicts';
import { openBuildingCompletionGuide } from './guides';
import { residentLogName } from './residentLogName';
import { enrolledStudentIds } from './education';
import { haulerCarryCapacity, haulingMoveSpeedMultiplier, scaledCarryCapacity } from './equipment';
import {
  collectHuntableTiles, habitatReserveSummaryInArea, huntableHabitatAtTile, takeHabitatStock,
} from './habitats';
import { huntPreyName, rollHuntPrey, scaledHuntYield, type HuntPreyDef } from './hunting';
import { makeRng } from './map';
import { settlementMoraleProductionMultiplier } from './morale';
// 잎 모듈에서 직접 가져온다 — scenario.ts를 거치면 agents → scenario → raids → agents 고리가 생긴다
import { countScenarioProgress } from './scenarioFlags';
import { buryCorpse, corpsesOf, nextCorpseToCollect } from './lifecycle';
import { extractMineralDeposit, mineralRemaining } from './minerals';
import { clearTreeStage, markForestHarvest, treeStageFor } from './forestGrowth';
import { assignClearingCrews, clearingBlocksWork, clearingSites, pendingClearingTiles } from './landClearing';
import { isVeinSealedTile, recordRockMining, recordSilverMined } from './silver';
import { getSeason } from './seasons';
import { isLakeIceAt } from './lakeIce';
import { outdoorMult } from './weather';
import {
  droughtFarmGrowthMultiplier, droughtFishYieldMultiplier, initializeWeirReservoir,
  restoreWeirReservoir,
} from './disasters';
import { DRYING_PRODUCT_DEFS, dryingProductOf } from './preservation';
import { jangdokdaeInputNeeds } from './fermentation';
import { canGrowCropNow, canHarvestCropNow, canPlantCropNow, cropIdForBuilding, CROP_DEFS } from './crops';
import { clothingCoverageTotal, foodTotal, fuelHeatTotal } from './consumption';
import { isExplored } from './exploration';
import { activePredatorScoutIds } from './expeditionIntel';
import { FOOD_RESOURCES, FUEL_RESOURCES, RESOURCE_DEFS } from './resourceCatalog';
import {
  equipMissingWearables, footwearCoverageTotal,
  normalizeWearableResourceStocks, residentFootwearMoveMultiplier, resolvedTanneryProduct, TANNERY_PRODUCT_DEFS,
} from './wearables';
import { performHouseholdCraftAtHome } from './householdCraft';
import { isWallBuilding } from './walls';
import { bumpDefenseTopology, wallIntegrityMax } from './raidRoutes';
import {
  ensureLivestockState, hayFromHarvestProgress, livestockProductForHerder, plotWorkMultiplier,
} from './livestock';
import { performPhysicianTreatment } from './medicine';
import { isTileInMineWorkArea, mineralDepositsInMineRange, servingMineForTile } from './miningSites';
import { gatheringWorkArea, isTileInGatheringWorkArea } from './gatheringZones';
import { oreSampleAt } from './subsurfaceVeins';
import { tidalFlatYieldMultiplier } from './tidalFlats';
import {
  ensureFishingGrounds, fishingGroundAt, fishingGroundStockAt, fishingGroundSummaryInArea,
  takeFishingGroundStock, takeFishingGroundStockById,
} from './fishingGrounds';
import {
  advanceFishingBoatTrip, advanceFishingBoatWork, boardFishingBoat, disembarkFishingBoat,
  fishingBoatCrew, fishingBoatTripPlan, startFishingBoatTrip,
} from './fishingBoats';
import { waterDependentProductionMultiplier } from './waterSupply';
import { mineCollapseRepairLocked } from './mineCollapse';
import { rankProductionEfficiency } from './productionEfficiency';
import { cleanupRoyalPlaqueAfterBuildingRemoval, plaqueProductionMultiplier } from './royalPlaque';
import { describeGoal, type DescribedGoal } from './pathGoals';
import { farmWorkTileForTick } from './farmWorkTiles';
import { reconcileResidentHomes, residentHome } from './residents';
import { reconcileMountAssignments } from './weapons';
import { canWorkForeignTerritory, noteTerritoryViolation } from './territory';
import { noteProximityBuildingCompletion } from './proximityWarnings';
import {
  assignedBuildingForResident, assignedWorkers, autoAssignWorkersToBuilding,
  clearAssignmentsForBuilding, isResidentInAssignedSlot,
} from './workerSlots';
import { recordNotableBuildingCompletion } from './annals';
import {
  addBuildingStock, buildingStock, depositResidentToBuilding, depositResidentToSettlement,
  isHaulSourceBuilding, isStorageBuilding, takeBuildingStock,
} from './inventory';
import {
  clearLodgingLinksForBuilding, lodgingCanHostTonight, lodgingDailyNeeds, lodgingHutForResident,
  lodgingSupplySummary, lodgingWorkers,
} from './lodgingHuts';
import type {
  Building, BuildingTypeId, GameState, ManualOrder, Resident, ResourceId, Season,
  SmithyProductId, Tile,
} from './types';

// ─────────────────────────── 채집형 작업 공통 루틴 ───────────────────────────

interface GatherOpts {
  goal: (t: Tile) => boolean;
  /** 작업자가 설 수 있는 칸에서 실제 채집 대상을 찾는다. 생략하면 현재 칸이 대상이다. */
  targetFromWorkTile?: (workTile: Tile) => Tile | null;
  workTicks: number;
  yieldRes: ResourceId | ((tile: Tile) => ResourceId);
  yieldAmt: number | ((tile: Tile) => number); // 보정 전 1회 채집량 (타일에 따라 달라질 수 있다)
  cap: number | ((tile: Tile) => number); // 이만큼 지면 하역하러 간다
  depositExtra: BuildingTypeId[];
  depositTargets?: (state: GameState, resident: Resident) => Building[];
  onDeposit?: (resident: Resident) => void;
  taskWork: string | ((tile: Tile) => string);
  taskMove: string;
  taskHaul: string | ((resident: Resident) => string);
  taskNone?: string;
  adjustHarvestAmount?: (tile: Tile, r: Resident, amount: number) => number;
  onHarvest?: (tile: Tile, r: Resident, amount: number) => void;
  /** 작업지에 갈 길이 없을 때의 대체 행동. true를 돌려주면 이 틱을 넘겨받는다. */
  onStuck?: () => boolean;
}

function gatherJob(state: GameState, r: Resident, ctx: Ctx, o: GatherOpts): void {
  const forced = r.manualOrder?.kind === 'work' ? r.manualOrder.unauthorizedSiteIds ?? [] : [];
  const targetFrom = o.targetFromWorkTile ?? ((workTile: Tile): Tile => workTile);
  let knownGoal: DescribedGoal = (workTile: Tile): boolean => {
    const target = targetFrom(workTile);
    return target != null && isExplored(state, target.x, target.y) && o.goal(target) &&
      canWorkForeignTerritory(state, target.x, target.y, forced);
  };
  const currentTile = state.map[r.y][r.x];
  const currentTarget = targetFrom(currentTile) ?? currentTile;
  const carryCap = typeof o.cap === 'function' ? o.cap(currentTarget) : o.cap;
  // 짐이 찼거나 하역 중이면 거점으로
  if (carryTotal(r) >= scaledCarryCapacity(carryCap) ||
    (r.phase === 'toDeposit' && carryTotal(r) > 0)) {
    r.phase = 'toDeposit';
    r.task = typeof o.taskHaul === 'function' ? o.taskHaul(r) : o.taskHaul;
    const targets = o.depositTargets?.(state, r) ?? depositBuildings(state, o.depositExtra);
    const st = goTo(state, r, ctx, buildingInteractionGoal(state, targets.map(building => building.id)));
    if (isSettledAtGoal(r, st)) {
      const productionSite = targets.find(building => !isStorageBuilding(building) &&
        isResidentAtBuildingInteraction(state, r, building.id));
      if (productionSite) depositResidentToBuilding(productionSite, r);
      else depositResidentToSettlement(state, r);
      o.onDeposit?.(r);
      r.phase = 'rest';
    } else if (st === 'stuck') {
      depositResidentToSettlement(state, r); // 고립된 짐은 비상 회수로 처리한다
      o.onDeposit?.(r);
      r.phase = 'rest';
    }
    return;
  }
  // 작업 중
  if (r.phase === 'working') {
    const workTile = state.map[r.y][r.x];
    if (!knownGoal(workTile)) { r.phase = 'rest'; return; } // 서 있던 타일이나 대상이 변함(벌목·채광 소진 등)
    const target = targetFrom(workTile);
    if (!target) { r.phase = 'rest'; return; }
    r.task = typeof o.taskWork === 'function' ? o.taskWork(target) : o.taskWork;
    r.workTimer -= ctx.outdoor; // 궂은 날씨엔 일이 더디다
    gainSkillTick(state, r);
    if (r.workTimer <= 0) {
      const resource = typeof o.yieldRes === 'function' ? o.yieldRes(target) : o.yieldRes;
      const base = typeof o.yieldAmt === 'function' ? o.yieldAmt(target) : o.yieldAmt;
      const requested = base * ctx.tMod * ctx.outputMod * effOf(state, r) * WORK_RATE_SCALE;
      const amt = Math.max(0, o.adjustHarvestAmount?.(target, r, requested) ?? requested);
      if (amt > 0) addCarry(r, resource, amt);
      o.onHarvest?.(target, r, amt);
      r.phase = 'rest';
    }
    return;
  }
  // 작업지 탐색/이동
  const st = goTo(state, r, ctx, knownGoal);
  if (st === 'arrived') {
    r.phase = 'working';
    r.workTimer = o.workTicks;
    const target = targetFrom(state.map[r.y][r.x]);
    r.task = target && typeof o.taskWork === 'function' ? o.taskWork(target) :
      typeof o.taskWork === 'string' ? o.taskWork : o.taskMove;
  } else if (st === 'stuck') {
    if (o.onStuck?.()) return;
    r.phase = 'rest';
    if (carryTotal(r) > 0) {
      // 마지막 자원을 캐 목표가 사라진 경우의 실패 쿨다운이 지정 거점 하역까지 막지 않게 한다.
      pathFailUntilFor(state).delete(r.id);
      r.phase = 'toDeposit';
    } else loiterNearCenter(state, r, ctx, o.taskNone ?? '갈 곳 없음');
  } else {
    r.phase = 'toWork';
    r.task = o.taskMove;
  }
}

// ─────────────────────────── 플레이어 수동 명령 ───────────────────────────

function clearManualOrder(r: Resident): void {
  r.manualOrder = null;
  r.path = [];
  r.phase = 'rest';
  r.workTimer = 0;
  r.targetId = null;
}

function exactTileGoal(x: number, y: number): (t: Tile) => boolean {
  return describeGoal(t => t.x === x && t.y === y, [{ x, y }]);
}

function manualGoTo(
  state: GameState,
  resident: Resident,
  ctx: Ctx,
  order: ManualOrder,
  goal: (tile: Tile) => boolean,
): GoResult {
  const siteIds = order.unauthorizedSiteIds ?? [];
  return goTo(
    state,
    resident,
    ctx,
    goal,
    (x, y) => isPassable(state, x, y, siteIds),
    (x, y) => noteTerritoryViolation(state, siteIds, x, y, 'passage'),
  );
}

function logMineralDepletion(state: GameState, tile: Tile, resource: 'stone' | 'iron' | 'silver'): void {
  const mine = servingMineForTile(state, tile);
  const depositName = resource === 'silver' ? '은맥' : resource === 'iron' ? '철광맥' : '석재 노두';
  const otherDeposits = mine ? mineralDepositsInMineRange(state, mine, true).length : 0;
  addLog(
    state,
    mine
      ? otherDeposits > 0
        ? withJosa(depositName, '이/가') + ' 고갈되었습니다. 채광꾼들이 주변의 다른 광상으로 옮겨갑니다.'
        : withJosa(depositName, '이/가') + ' 고갈되었습니다. 채광장 주변 광상이 모두 바닥났습니다.'
      : withJosa(depositName, '이/가') + ' 고갈되어 지표에서 사라졌습니다.',
    'bad',
    true,
  );
}

function handleManualMoveOrder(state: GameState, r: Resident, ctx: Ctx, order: ManualOrder & { kind: 'move' }): boolean {
  if (!isPassable(state, order.x, order.y, order.unauthorizedSiteIds)) {
    r.task = '명령 지점 막힘';
    clearManualOrder(r);
    return true;
  }

  const st = manualGoTo(state, r, ctx, order, exactTileGoal(order.x, order.y));
  if (st === 'arrived') {
    r.task = '이동 완료';
    clearManualOrder(r);
  } else if (st === 'stuck') {
    r.task = '명령 지점 막힘';
    clearManualOrder(r);
  } else {
    r.phase = 'toWork';
    r.task = '이동 명령';
  }
  return true;
}

function reserveManualHaulTask(state: GameState, resident: Resident, source: Building): boolean {
  const current = resident.haulTask;
  if (current?.sourceBuildingId === source.id &&
      buildingStock(source, current.resource) > WORK_STOCK_EPSILON) {
    return true;
  }
  clearHaulTask(resident);
  for (const resource of HAUL_PRIORITY) {
    const available = availableHaulAmount(state, source, resource, resident.id);
    if (available <= WORK_STOCK_EPSILON) continue;
    resident.haulTask = {
      sourceBuildingId: source.id,
      resource,
      amount: Math.min(haulerCarryCapacity(resident), available),
    };
    resident.targetId = source.id;
    return true;
  }
  return false;
}

function handleManualHaulerTransport(
  state: GameState,
  resident: Resident,
  ctx: Ctx,
  order: ManualOrder & { kind: 'work' },
): boolean {
  const source = order.buildingId == null
    ? undefined
    : state.buildings.find(building => building.id === order.buildingId);
  if (!source || !isHaulSourceBuilding(source)) {
    clearHaulTask(resident);
    clearManualOrder(resident);
    resident.task = '운송 대상 없음';
    return true;
  }

  if (carryTotal(resident) > 0) {
    resident.phase = 'toDeposit';
    resident.task = `${BUILDING_DEFS[source.type].name} 강제 운송`;
    const st = manualGoTo(state, resident, ctx, order, depositGoal(state, []));
    if (isSettledAtGoal(resident, st) || st === 'stuck') {
      depositResidentToSettlement(state, resident);
      clearHaulTask(resident);
      resident.phase = 'rest';
    }
    return true;
  }

  const hasLoad = reserveManualHaulTask(state, resident, source);
  resident.phase = 'toWork';
  resident.task = hasLoad
    ? `${BUILDING_DEFS[source.type].name} 지정 수거`
    : `${BUILDING_DEFS[source.type].name} 운송 대기`;
  const st = manualGoTo(state, resident, ctx, order, buildingGoal(state, source.id));
  if (st === 'arrived') {
    noteTerritoryViolation(state, order.unauthorizedSiteIds ?? [], resident.x, resident.y, 'work');
    if (hasLoad && collectHaulLoad(state, resident, source) > 0) {
      resident.phase = 'toDeposit';
      resident.path = [];
    } else {
      clearHaulTask(resident);
      resident.phase = 'rest';
      resident.task = `${BUILDING_DEFS[source.type].name} 운송 대기`;
    }
  } else if (st === 'stuck') {
    clearHaulTask(resident);
    resident.phase = 'rest';
    resident.task = `${BUILDING_DEFS[source.type].name} 운송 길 막힘`;
  }
  return true;
}

function handleManualWorkOrder(state: GameState, r: Resident, ctx: Ctx, order: ManualOrder & { kind: 'work' }): boolean {
  if (order.repeat && r.job === 'hauler' && order.buildingId != null) {
    return handleManualHaulerTransport(state, r, ctx, order);
  }

  const tile = state.map[order.y]?.[order.x];
  if (!tile) {
    r.task = '명령 대상 없음';
    clearManualOrder(r);
    return true;
  }

  if (order.started) {
    if (r.phase === 'working') return false;
    clearManualOrder(r);
    return true;
  }

  const goal = order.buildingId != null ? buildingGoal(state, order.buildingId) : exactTileGoal(order.x, order.y);
  const st = manualGoTo(state, r, ctx, order, goal);
  if (st === 'arrived') {
    order.started = true;
    noteTerritoryViolation(state, order.unauthorizedSiteIds ?? [], r.x, r.y, 'work');
    return false;
  }
  if (st === 'stuck') {
    r.task = '명령 지점 막힘';
    clearManualOrder(r);
    return true;
  }
  r.phase = 'toWork';
  r.task = '명령 작업지로 이동';
  return true;
}

function handleManualOrder(state: GameState, r: Resident, ctx: Ctx): boolean {
  const order = r.manualOrder;
  if (!order) return false;
  if (order.kind === 'move') return handleManualMoveOrder(state, r, ctx, order);
  return handleManualWorkOrder(state, r, ctx, order);
}

// ─────────────────────────── 직업별 행동 ───────────────────────────

// 공사터 개간 — 배정받은 현장의 나무만 골라 베고, 벤 자리는 평지가 되어 공사가 열린다.
// 일반 벌목과 달리 그루터기를 남기지 않는다: 자리를 비우는 것이 목적이기 때문이다.
function clearingWoodcutterTick(state: GameState, r: Resident, ctx: Ctx, siteId: number): void {
  const a = CONFIG.agents;
  const site = state.buildings.find(building => building.id === siteId);
  const targets = site ? pendingClearingTiles(state, site) : [];
  if (targets.length === 0) {
    woodcutterTick(state, r, ctx, true);
    return;
  }
  // 공사터 칸은 건물이 들어서 있어 밟지 못하는 경우가 많다(움집 등). 그래서 건축가와
  // 같이 옆 칸에 서서 베고, 벤 나무는 발밑이 아니라 인접한 그 나무를 지운다.
  const treeAt = (x: number, y: number): Tile | undefined =>
    targets.find(tree => tree.terrain === 'forest' &&
      Math.abs(tree.x - x) <= 1 && Math.abs(tree.y - y) <= 1);
  gatherJob(state, r, ctx, {
    goal: t => treeAt(t.x, t.y) != null,
    workTicks: a.work.chop,
    yieldRes: 'wood',
    yieldAmt: a.yields.wood * CONFIG.seasons.woodMult[ctx.season] *
      (r.special === 'tutorialAdvisor' ? CONFIG.specialResidents.tutorialAdvisorWoodYieldMult : 1),
    cap: a.carryCap.wood,
    depositExtra: ['lumberCamp'],
    taskWork: '공사터 벌목 중', taskMove: '공사터로 이동', taskHaul: '목재 운반',
    // 강 건너처럼 갈 길이 없는 공사터라면 놀리지 말고 평소 벌목으로 돌린다.
    // 길찾기 실패 쿨다운은 이 사람 몫으로 한 번 비워 준다 — 그러지 않으면 공사터에서
    // 걸린 쿨다운 때문에 이어지는 일반 벌목까지 같이 막혀 그냥 서 있게 된다.
    onStuck: () => {
      pathFailUntilFor(state).delete(r.id);
      woodcutterTick(state, r, ctx, true);
      return true;
    },
    onHarvest: (_tile, worker, woodAmount) => {
      addCarry(worker, 'brushwood', woodAmount * CONFIG.production.brushwoodPerWood);
      // 한 번 베면 그 칸은 완전히 열린다 — 공사가 여기서부터 시작된다.
      const felled = treeAt(worker.x, worker.y);
      if (!felled) return;
      felled.terrain = 'plain';
      clearTreeStage(felled);
      bumpDefenseTopology(state);
    },
  });
}

function woodcutterTick(state: GameState, r: Resident, ctx: Ctx, skipClearing = false): void {
  const a = CONFIG.agents;
  // 건설·확장·이전 예정지 개간은 정착지 공사 명령이므로 벌목장 작업영역보다 우선한다.
  // 따라서 영역 밖 공사터라도 개간조로 배정된 벌목꾼은 먼저 그 자리를 비운다.
  if (!skipClearing) {
    const siteId = ctx.clearingCrew.get(r.id);
    if (siteId != null) {
      clearingWoodcutterTick(state, r, ctx, siteId);
      return;
    }
  }
  const assignedCamp = assignedBuildingForResident(state, r);
  const lumberCamp = assignedCamp?.type === 'lumberCamp' ? assignedCamp : null;
  if (!lumberCamp) {
    if (carryTotal(r) > 0) depositResidentToSettlement(state, r);
    loiterNearCenter(state, r, ctx, '벌목장 배정 없음');
    return;
  }
  gatherJob(state, r, ctx, {
    // 공사터로 잡힌 나무는 개간 담당이 따로 있으므로 건드리지 않는다
    // (건물이 이미 올라앉은 칸, 그리고 이전 목적지처럼 아직 비어 있는 예정지 모두)
    goal: t => t.terrain === 'forest' && t.buildingId == null &&
      isTileInGatheringWorkArea(lumberCamp, t) &&
      !ctx.clearingReserved.has(`${t.x},${t.y}`) && treeStageFor(t) === 'mature',
    workTicks: a.work.chop,
    yieldRes: 'wood',
    yieldAmt: a.yields.wood * CONFIG.seasons.woodMult[ctx.season] *
      (r.special === 'tutorialAdvisor' ? CONFIG.specialResidents.tutorialAdvisorWoodYieldMult : 1),
    cap: a.carryCap.wood,
    depositExtra: ['lumberCamp'],
    depositTargets: () => [lumberCamp],
    taskWork: '벌목 중', taskMove: '벌목장 영역으로 이동', taskHaul: '목재 운반',
    taskNone: '벌목장 영역에 벨 나무 없음',
    onHarvest: (tile, worker, woodAmount) => {
      addCarry(worker, 'brushwood', woodAmount * CONFIG.production.brushwoodPerWood);
      // 성목을 반복 벌목하면 이따금 그루터기 단계로 내려가고 재성장을 기다린다.
      if (tile.buildingId == null) {
        if (markForestHarvest(tile, ctx.rng, a.forestDepleteChance)) bumpDefenseTopology(state);
      }
    },
  });
}

function hunterTick(state: GameState, r: Resident, ctx: Ctx): void {
  const a = CONFIG.agents;
  let caught: { prey: HuntPreyDef; meat: number; hide: number } | null = null;
  const assignedLodge = assignedBuildingForResident(state, r);
  const huntLodge = assignedLodge?.type === 'huntLodge' ? assignedLodge : null;
  if (!huntLodge) {
    if (carryTotal(r) > 0) depositResidentToSettlement(state, r);
    loiterNearCenter(state, r, ctx, '사냥막 배정 없음');
    return;
  }
  gatherJob(state, r, ctx, {
    // 짐승이 사는 서식지 범위 안에서만 사냥이 된다 (렌더러의 서식지 원과 동일 판정)
    goal: t => ctx.huntable.has(`${t.x},${t.y}`) &&
      isTileInGatheringWorkArea(huntLodge, t),
    workTicks: a.work.hunt,
    yieldRes: 'meat',
    // 서식지가 클수록 사냥감이 풍부하다
    yieldAmt: t => a.yields.game * CONFIG.seasons.gameMult[ctx.season] *
      (ctx.huntable.get(`${t.x},${t.y}`) ?? 0) * CONFIG.production.meatPerGame,
    cap: a.carryCap.meat,
    depositExtra: ['huntLodge'],
    depositTargets: () => [huntLodge],
    taskWork: '사냥감 추적 중',
    taskMove: '서식지로 이동',
    taskHaul: resident => `${huntPreyName(resident.lastHuntPrey)} 운반`,
    taskNone: '사냥막 영역에 남은 사냥감 없음',
    adjustHarvestAmount: (tile, _resident, baselineMeat) => {
      const habitat = huntableHabitatAtTile(state.map, state.habitats, tile.x, tile.y, a.hunting);
      if (!habitat) return 0;
      const taken = takeHabitatStock(habitat, 1);
      if (taken <= 0) return 0;
      const prey = rollHuntPrey(ctx.rng);
      const yields = scaledHuntYield(prey, baselineMeat * taken);
      caught = { prey, ...yields };
      if (habitat.stock <= 0) {
        const remaining = habitatReserveSummaryInArea(
          state.map,
          state.habitats,
          gatheringWorkArea(huntLodge),
        ).stock;
        const warningDays = huntDepletionWarningDaysFor(state);
        const lastWarningDay = warningDays.get(huntLodge.id) ?? -Infinity;
        if (remaining <= 1e-9 && state.day - lastWarningDay >= CONFIG.habitats.depletionLogCooldownDays) {
          warningDays.set(huntLodge.id, state.day);
          addLog(state, '서식지의 사냥감이 바닥났습니다. 숲을 남겨 두면 천천히 회복됩니다.', 'bad', true);
        }
      }
      return yields.meat;
    },
    onHarvest: (_tile, res, meatAmount) => {
      if (!caught) return;
      res.lastHuntPrey = caught.prey.id;
      res.task = `${caught.prey.name} 사냥 성공`;
      addCarry(res, 'hide', caught.hide);
      if (ctx.rng() < 0.08) {
        const yieldText = caught.hide > 0
          ? `고기 ${meatAmount.toFixed(1)}과 가죽 ${caught.hide.toFixed(1)}`
          : `고기 ${meatAmount.toFixed(1)}`;
        addLog(
          state,
          `${withJosa(residentLogName(res), '이/가')} ${withJosa(caught.prey.name, '을/를')} 잡아 ${yieldText} 분량을 가져옵니다.`,
          'good',
        );
      }
    },
    onDeposit: resident => { delete resident.lastHuntPrey; },
  });
}

function herbalistTick(state: GameState, r: Resident, ctx: Ctx): void {
  const a = CONFIG.agents;
  const forageRatio = CONFIG.production.foragedVegetablesPerHerb;
  const assignedHut = assignedBuildingForResident(state, r);
  const herbHut = assignedHut?.type === 'herbHut' ? assignedHut : null;
  if (!herbHut) {
    if (carryTotal(r) > 0) depositResidentToSettlement(state, r);
    loiterNearCenter(state, r, ctx, '약초막 배정 없음');
    return;
  }
  if (ctx.season === 'winter') {
    if (carryTotal(r) > 0) { r.phase = 'toDeposit'; }
    if (carryTotal(r) > 0) {
      goToCenter(state, r, ctx);
      if (isResidentAtBuildingInteraction(state, r, ctx.centerId)) depositAll(state, r);
    } else {
      loiterNearCenter(state, r, ctx, '마른 약초 손질');
    }
    return;
  }
  gatherJob(state, r, ctx, {
    goal: t => t.terrain === 'forest' && isTileInGatheringWorkArea(herbHut, t),
    workTicks: a.work.herb,
    yieldRes: 'herbs',
    yieldAmt: a.yields.herbs,
    cap: a.carryCap.herbs * (1 + forageRatio),
    depositExtra: ['herbHut'],
    depositTargets: () => [herbHut],
    taskWork: '약초·산물 채집 중', taskMove: '약초막 영역으로 이동', taskHaul: '약초·산물 운반',
    taskNone: '약초막 영역에 채집할 숲 없음',
    onHarvest: (_tile, worker, herbAmount) => {
      addCarry(worker, 'vegetables', herbAmount * forageRatio);
    },
  });
}

function maybeApplyQueuedCrop(farm: Building, season: Season): void {
  if (!farm.queuedCropId) return;
  const currentCrop = cropIdForBuilding(farm);
  if (currentCrop && farm.fieldGrowth > 0.5) return;
  if (!canPlantCropNow(farm.queuedCropId, farm.type, season)) return;
  farm.cropId = farm.queuedCropId;
  farm.queuedCropId = null;
  farm.fieldGrowth = 0;
  farm.sownArea = 0;
}

function goToFarmerWorkTile(state: GameState, resident: Resident, ctx: Ctx, farm: Building): GoResult {
  let workerIds = ctx.farmerWorkIdsByPlot.get(farm.id);
  if (!workerIds) {
    workerIds = assignedWorkers(state, farm).map(worker => worker.id);
    ctx.farmerWorkIdsByPlot.set(farm.id, workerIds);
  }
  const currentTile = state.map[resident.y]?.[resident.x];
  if (currentTile?.buildingId !== farm.id) {
    const entry = farmWorkTileForTick(farm, workerIds, resident.id, 0);
    const status = goTo(state, resident, ctx, exactTileGoal(entry.x, entry.y));
    resident.phase = status === 'arrived' ? 'working' : 'toWork';
    return status;
  }

  const target = farmWorkTileForTick(farm, workerIds, resident.id, absoluteTick(state));
  const status = goTo(state, resident, ctx, exactTileGoal(target.x, target.y));
  resident.phase = status === 'arrived' ? 'working' : 'toWork';
  return status;
}

function farmerTick(state: GameState, r: Resident, ctx: Ctx): void {
  const a = CONFIG.agents;
  const p = CONFIG.production;
  const f = CONFIG.farming;
  const construction = farmerConstructionTarget(state, r);
  if (construction) {
    constructionWorkerTick(state, r, ctx, construction);
    return;
  }
  const farm = assignedBuildingForResident(state, r);

  if (!farm || (farm.type !== 'field' && farm.type !== 'paddy') || !isResidentInAssignedSlot(state, r, farm)) {
    if (carryTotal(r) > 0) {
      const st = goTo(state, r, ctx, depositGoal(state, []));
      if (st === 'arrived' || st === 'stuck') depositAll(state, r);
      return;
    }
    loiterNearCenter(state, r, ctx, '밭 배정 없음');
    return;
  }

  maybeApplyQueuedCrop(farm, ctx.season);
  const cropId = cropIdForBuilding(farm);
  const crop = cropId ? CROP_DEFS[cropId] : null;

  if (ctx.season === 'winter') {
    if (carryTotal(r) > 0) {
      const st = goTo(state, r, ctx, depositGoal(state, []));
      if (st === 'arrived' || st === 'stuck') depositAll(state, r);
      return;
    }
    loiterNearBuilding(state, r, ctx, farm, 3, crop?.survivesWinter ? '월동 작물 관리' : '겨울 채비');
    return;
  }

  if (!cropId || !crop) {
    loiterNearBuilding(state, r, ctx, farm, 3, farm.queuedCropId ? '파종철 대기' : '작물 미선택');
    return;
  }

  const area = plotArea(farm);
  const sown = sownAreaOf(farm);
  farm.sownArea = sown;
  // 농부 1명이 tilesPerFarmer칸 몫을 감당한다 — 파종을 마친 칸수로 나눠 넓을수록 손이 더 간다
  const workBoost = f.tilesPerFarmer * plotWorkMultiplier(state, farm);
  const perTileDivisor = Math.max(1, sown);

  if (canHarvestCropNow(cropId, farm.type, ctx.season) && sown >= 0.5) {
    // 수확: 성장도가 남은 밭/논에서 선택 작물을 거둔다
    const target = farm.fieldGrowth > 0.5 ? farm : null;
    if (!target) {
      if (carryTotal(r) > 0) { r.phase = 'toDeposit'; return; }
      if (farm.queuedCropId) maybeApplyQueuedCrop(farm, ctx.season);
      loiterNearBuilding(state, r, ctx, farm, 3, '수확 마무리');
      return;
    }
    const st = goToFarmerWorkTile(state, r, ctx, target);
    if (st === 'arrived') {
      r.task = '수확 중';
      const take = Math.min(
        target.fieldGrowth,
        a.work.harvestPerSubtick * ctx.outdoor * effOf(state, r) * workBoost * WORK_RATE_SCALE / perTileDivisor,
      );
      target.fieldGrowth -= take;
      // 비옥지 보너스는 발자국 내 비옥 칸 비율만큼 (다칸 경작지의 혼합 지형 대응)
      const footprint = footprintTilesOf(state, target) ?? [];
      const fertileFraction = footprint.length > 0
        ? footprint.filter(t => t.terrain === 'fertile').length / footprint.length
        : 0;
      const fertile = target.type === 'field' ? 1 + fertileFraction * (p.fertileBonus - 1) : 1;
      // 소출은 파종을 마친 칸수에 비례한다 — 1×1 만작이면 기존과 동일
      addBuildingStock(target, crop.output, (take / 100) * crop.yield * sown * fertile * ctx.outputMod);
      if (ctx.season === 'autumn' && (crop.output === 'grain' || crop.output === 'rice')) {
        addBuildingStock(target, 'hay', hayFromHarvestProgress(take * sown));
      }
      if (target.fieldGrowth <= 0.5) {
        // 작기 종료 — 다음 파종을 위해 파종 칸을 비운다
        target.fieldGrowth = 0;
        target.sownArea = 0;
        if (target.queuedCropId) {
          target.cropId = target.queuedCropId;
          target.queuedCropId = null;
        }
      }
      gainSkillTick(state, r);
    } else {
      r.task = st === 'stuck' ? '길이 막힘' : `${withJosa(BUILDING_DEFS[farm.type].name, '으로/로')} 이동`;
    }
    return;
  }

  // 파종철: 아직 씨를 넣지 못한 칸부터 채운다
  if (canPlantCropNow(cropId, farm.type, ctx.season) && sown < area) {
    const st = goToFarmerWorkTile(state, r, ctx, farm);
    if (st === 'arrived') {
      r.task = `${crop.name} 파종 중`;
      const sowRate = ctx.outdoor * effOf(state, r) * plotWorkMultiplier(state, farm) *
        WORK_RATE_SCALE / f.sowWorkPerTile;
      farm.sownArea = Math.min(area, sown + sowRate);
      gainSkillTick(state, r);
    } else {
      r.task = st === 'stuck' ? '길이 막힘' : `${withJosa(BUILDING_DEFS[farm.type].name, '으로/로')} 이동`;
    }
    return;
  }

  if (!canGrowCropNow(cropId, farm.type, ctx.season) || sown < 0.5) {
    loiterNearBuilding(state, r, ctx, farm, 3, '파종철 대기');
    return;
  }

  // 생육철: 아직 안 자란 작물을 돌본다
  const target = farm.fieldGrowth < 100 ? farm : null;
  if (!target) {
    loiterNearBuilding(state, r, ctx, farm, 3, `${BUILDING_DEFS[farm.type].name} 관리`);
    return;
  }
  const st = goToFarmerWorkTile(state, r, ctx, target);
  if (st === 'arrived') {
    r.task = `${crop.name} 재배 중`;
    const weatherGrow = (state.weather === 'rain' ? 1.2 : state.weather === 'frost' ? 0.7 : 1) *
      droughtFarmGrowthMultiplier(state, target);
    target.fieldGrowth = Math.min(
      100,
      target.fieldGrowth + a.work.growPerSubtick * weatherGrow * effOf(state, r) *
        workBoost * WORK_RATE_SCALE / perTileDivisor,
    );
  gainSkillTick(state, r);
  } else {
    r.task = st === 'stuck' ? '길이 막힘' : `${withJosa(BUILDING_DEFS[farm.type].name, '으로/로')} 이동`;
  }
}

function isConstructionForJob(state: GameState, building: Building, job: 'farmer' | 'builder'): boolean {
  // 나무가 아직 서 있으면 벌목꾼 차례다 — 건축가·농부는 자리가 빌 때까지 기다린다.
  // (이전의 해체 단계는 옛 자리 일이라 새 자리 나무와 무관하게 계속 진행한다)
  if (clearingBlocksWork(state, building)) return false;
  if (mineCollapseRepairLocked(state, building)) return false;
  if (building.workOrder) return job === 'builder';
  if (building.boatWorkOrder) return job === 'builder';
  if (building.gateConversion) return job === 'builder';
  if (building.structureRepair) {
    const band = state.raiders;
    const contested = !!band && Math.max(Math.abs(band.x - building.x), Math.abs(band.y - building.y)) <= 1;
    return job === 'builder' && !contested;
  }
  if (building.repairing) return job === 'builder';
  const requiredJob = isPlotBuildingType(building.type) ? 'farmer' : 'builder';
  return requiredJob === job && (!building.built || building.expansion != null);
}

function constructionTarget(state: GameState, r: Resident, job: 'farmer' | 'builder'): Building | null {
  const sites = state.buildings.filter(building => isConstructionForJob(state, building, job));
  const priority = sites.find(building => building.id === state.priorityBuildingId);
  if (priority) return priority;
  const repairs = sites.filter(b => b.repairing);
  return nearestBuilding(r, repairs.length > 0 ? repairs : sites);
}

function builderTarget(state: GameState, r: Resident): Building | null {
  return constructionTarget(state, r, 'builder');
}

function farmerConstructionTarget(state: GameState, r: Resident): Building | null {
  return constructionTarget(state, r, 'farmer');
}

function completeBuildingDemolition(state: GameState, building: Building, ctx: Ctx): void {
  const def = BUILDING_DEFS[building.type];
  const cost = buildingCostForInstance(building);
  for (const [resource, amount] of Object.entries(cost)) {
    if ((amount ?? 0) <= 0) continue;
    state.resources[resource as ResourceId] += Math.max(1, Math.floor((amount ?? 0) * 0.5));
  }
  for (const [resource, amount] of Object.entries(building.inventory ?? {})) {
    state.resources[resource as ResourceId] += amount ?? 0;
  }
  restoreWeirReservoir(state, building);
  clearBuildingTiles(state, building.id);
  clearAssignmentsForBuilding(state, building.id);
  clearLodgingLinksForBuilding(state, building.id);
  state.buildings = state.buildings.filter(candidate => candidate.id !== building.id);
  cleanupRoyalPlaqueAfterBuildingRemoval(state, building.id);
  if (state.priorityBuildingId === building.id) state.priorityBuildingId = null;
  reconcileResidentHomes(state, ctx.rng);
  reconcileMountAssignments(state);
  state.resources.defense = computeDefense(state);
  addLog(state, `${def.name} 해체가 끝났습니다. 자재 일부를 회수했습니다.`, 'info', true);
}

function advanceBuildingWorkOrder(state: GameState, building: Building, ctx: Ctx, work: number): boolean {
  const order = building.workOrder;
  if (!order) return false;
  const def = BUILDING_DEFS[building.type];
  order.progress += work;
  if (order.progress < order.required) return true;

  if (order.kind === 'demolish') {
    completeBuildingDemolition(state, building, ctx);
    return true;
  }
  if (order.phase === 'dismantling') {
    const destination = order.destination;
    if (!destination) {
      delete building.workOrder;
      building.built = true;
      if (state.priorityBuildingId === building.id) state.priorityBuildingId = null;
      addLog(state, `${def.name} 이전 위치를 찾지 못해 작업을 중단했습니다.`, 'bad', true);
      return true;
    }
    restoreWeirReservoir(state, building);
    clearBuildingTiles(state, building.id);
    building.x = destination.x;
    building.y = destination.y;
    if (building.w != null) building.w = destination.w;
    if (building.h != null) building.h = destination.h;
    if (building.type === 'stable') delete building.pasture;
    if (building.type === 'levee') {
      building.leveeEdge = preferredLeveeEdgeAt(state, building.x, building.y, 0.5, 0.5, building.id) ?? undefined;
    }
    occupyBuildingTiles(state, building);
    order.phase = 'rebuilding';
    order.progress = 0;
    order.required = Math.max(1, def.buildDays);
    // 새 자리에 아직 나무가 서 있으면 벌목이 끝날 때까지 재건축은 열리지 않는다.
    const standingTrees = pendingClearingTiles(state, building).length;
    addLog(state, standingTrees > 0
      ? `${def.name} 해체를 마쳤습니다. 새 자리의 나무 ${standingTrees}그루를 벤 뒤 재건축을 시작합니다.`
      : `${def.name} 해체를 마치고 새 위치에서 재건축을 시작했습니다.`, 'info');
    return true;
  }

  building.built = true;
  if (isWallBuilding(building.type)) {
    building.structureIntegrityMax = wallIntegrityMax(building);
    building.structureIntegrity = building.structureIntegrityMax;
    building.breached = false;
    bumpDefenseTopology(state);
  }
  delete building.workOrder;
  noteProximityBuildingCompletion(state, building);
  initializeWeirReservoir(state, building);
  if (state.priorityBuildingId === building.id) state.priorityBuildingId = null;
  reconcileResidentHomes(state, ctx.rng);
  reconcileMountAssignments(state);
  state.resources.defense = computeDefense(state);
  addLog(state, `${def.name} 이전이 완료되었습니다.`, 'good', true);
  return true;
}

function constructionWorkerTick(state: GameState, r: Resident, ctx: Ctx, target: Building): void {
  const expansion = target.expansion;
  const def = BUILDING_DEFS[target.type];
  const st = goTo(state, r, ctx, buildingGoal(state, target.id));
  if (st === 'arrived') {
    r.phase = 'working';
    r.task = target.gateConversion
      ? '성문 전환 중'
      : target.structureRepair ? '돌파 성벽 수리 중'
      : target.workOrder
      ? target.workOrder.phase === 'rebuilding' ? '이전 재건축 중' : '건물 해체 중'
      : target.boatWorkOrder
        ? target.boatWorkOrder.kind === 'build' ? '어선 건조 중' : '어선 본수리 중'
      : expansion ? '영역 확장 중'
        : target.repairing ? '건물 수리 중' : '건설 중';
    const work = CONFIG.agents.work.buildPerSubtick * effOf(state, r) * ctx.tMod *
      Math.max(0.5, ctx.outdoor) * WORK_RATE_SCALE;
    gainSkillTick(state, r);
    if (advanceBuildingWorkOrder(state, target, ctx, work)) return;
    if (target.boatWorkOrder) {
      const result = advanceFishingBoatWork(state, target, work);
      if (result === 'built') addLog(state, '새 어선이 완성되어 연결된 포구에 계류되었습니다.', 'good', true);
      else if (result === 'repaired') addLog(state, '어선 본수리가 끝나 다시 출항할 수 있습니다.', 'good', true);
      return;
    }
    if (target.gateConversion) {
      const conversion = target.gateConversion;
      conversion.progress += work;
      if (conversion.progress >= conversion.required) {
        target.type = 'gate';
        target.gateWallType = conversion.wallType;
        target.progress = BUILDING_DEFS.gate.buildDays;
        delete target.gateConversion;
        target.structureIntegrityMax = wallIntegrityMax(target);
        target.structureIntegrity = target.structureIntegrityMax;
        bumpDefenseTopology(state);
        if (state.priorityBuildingId === target.id) state.priorityBuildingId = null;
        state.resources.defense = computeDefense(state);
        addLog(state, `${BUILDING_DEFS[conversion.wallType].name} 구간의 성문 전환이 끝났습니다.`, 'good', true);
      }
      return;
    }
    if (target.structureRepair) {
      const repair = target.structureRepair;
      repair.progress += work;
      if (repair.progress >= repair.required) {
        target.structureIntegrityMax = wallIntegrityMax(target);
        target.structureIntegrity = target.structureIntegrityMax;
        target.breached = false;
        delete target.structureRepair;
        if (state.priorityBuildingId === target.id) state.priorityBuildingId = null;
        bumpDefenseTopology(state);
        state.resources.defense = computeDefense(state);
        addLog(state, `${BUILDING_DEFS[target.type].name} 돌파 구간의 수리가 끝나 다시 길을 막습니다.`, 'good', true);
      }
      return;
    }
    if (expansion) {
      expansion.progress += work;
      if (expansion.progress >= expansion.required) {
        delete target.expansion;
        noteProximityBuildingCompletion(state, target);
        if (state.priorityBuildingId === target.id) state.priorityBuildingId = null;
        addLog(state, `${def.name} 영역 확장이 끝났습니다.`, 'good', true);
      }
      return;
    }

    target.progress += work;
    if (target.progress >= def.buildDays) {
      const repaired = target.repairing === true;
      target.progress = def.buildDays;
      target.built = true;
      target.repairing = false;
      delete target.repairCause;
      if (isWallBuilding(target.type)) {
        target.structureIntegrityMax = wallIntegrityMax(target);
        target.structureIntegrity = target.structureIntegrityMax;
        target.breached = false;
        bumpDefenseTopology(state);
      } else if (target.type === 'watchtower') {
        target.structureIntegrityMax = CONFIG.watchtower.integrityMax;
        target.structureIntegrity = target.structureIntegrityMax;
        target.watchtowerDamageDay = state.day;
        target.watchtowerDamageToday = 0;
        target.watchtowerHadTarget = false;
      }
      if (!repaired) noteProximityBuildingCompletion(state, target);
      initializeWeirReservoir(state, target);
      if (state.priorityBuildingId === target.id) state.priorityBuildingId = null;
      reconcileResidentHomes(state, ctx.rng);
      addLog(state, repaired
        ? `${def.name} 수리가 끝나 다시 가동됩니다.`
        : `${withJosa(def.name, '이/가')} 완공되었습니다.`, 'good',
      repaired || def.slots > 0 || def.capacity > 0 || def.unique);
      if (!repaired) recordNotableBuildingCompletion(state, target.type); // 최초 완공만 연대기에 (dedupe)
      if (!repaired) openBuildingCompletionGuide(state, target.type); // 처음 서는 살림이면 초회 길잡이
      const autoAssigned = autoAssignWorkersToBuilding(state, target.id);
      for (const worker of autoAssigned) resetAgent(state, worker);
      if (autoAssigned.length > 0) {
        addLog(
          state,
          `${def.name}에 근처 ${JOB_NAMES[autoAssigned[0].job]} ${autoAssigned.length}명을 자동 배정했습니다.`,
          'good',
        );
      }
      if (def.winterBonus && !repaired) {
        addLog(state, '온돌집 덕분에 주민들의 체온 손실이 줄어들 것입니다.', 'good');
      }
    }
  } else {
    r.phase = 'toWork';
    r.task = st === 'stuck' ? '길이 막힘' : '공사장으로 이동';
  }
}

function builderTick(state: GameState, r: Resident, ctx: Ctx): void {
  const target = builderTarget(state, r);
  if (!target) {
    r.phase = 'rest';
    loiterNearCenter(state, r, ctx, '지을 것 없음');
    return;
  }
  constructionWorkerTick(state, r, ctx, target);
}

const HAUL_PRIORITY: ResourceId[] = [
  'grain', 'rice', 'vegetables', 'kimchi', 'beans', 'meat', 'eggs', 'milk', 'fish',
  'curedMeat', 'saltedFish', 'driedFish', 'jang', 'salt',
  'firewood', 'brushwood', 'charcoal', 'wood',
  'hideClothes', 'cottonClothes', 'strawShoes', 'leatherShoes', 'tools', 'onggi', 'carts', 'gunpowder', 'spears', 'hornBows', 'muskets',
  'hide', 'cotton', 'wool', 'hay', 'herbs', 'stone', 'iron',
];

const FOOD_HAUL_RESOURCES = new Set<ResourceId>([...FOOD_RESOURCES, 'rice']);
const FUEL_HAUL_RESOURCES = new Set<ResourceId>(FUEL_RESOURCES);
const CLOTHING_HAUL_RESOURCES = new Set<ResourceId>(['hideClothes', 'cottonClothes']);
const FOOTWEAR_HAUL_RESOURCES = new Set<ResourceId>(['strawShoes', 'leatherShoes']);
const COMBAT_HAUL_RESOURCES = new Set<ResourceId>(['gunpowder', 'spears', 'hornBows', 'muskets']);
const JANGDOKDAE_SUPPLY_PRIORITY = ['onggi', 'salt', 'beans'] as const satisfies readonly ResourceId[];

function reservedSupplyAmount(
  state: GameState,
  targetBuildingId: number,
  resource: ResourceId,
  exceptResidentId: number,
): number {
  return state.residents.reduce((sum, resident) => {
    const task = resident.haulTask;
    if (!resident.alive || resident.id === exceptResidentId || task?.kind !== 'supply') return sum;
    if (task.targetBuildingId !== targetBuildingId || task.resource !== resource) return sum;
    return sum + task.amount;
  }, 0);
}

function reservedSettlementSupplyAmount(
  state: GameState,
  resource: ResourceId,
  exceptResidentId: number,
): number {
  return state.residents.reduce((sum, resident) => {
    const task = resident.haulTask;
    if (!resident.alive || resident.id === exceptResidentId || task?.kind !== 'supply') return sum;
    if (task.resource !== resource || carryTotal(resident) > 0) return sum;
    return sum + task.amount;
  }, 0);
}

function assignJangdokdaeSupplyTask(state: GameState, resident: Resident): boolean {
  const storage = state.buildings
    .filter(isStorageBuilding)
    .sort((a, b) => (
      Math.abs(a.x - resident.x) + Math.abs(a.y - resident.y)
      - Math.abs(b.x - resident.x) - Math.abs(b.y - resident.y)
    ) || a.id - b.id)[0];
  if (!storage) return false;

  const targets = state.buildings
    .filter(building => building.built && building.type === 'jangdokdae')
    .sort((a, b) => (
      Math.abs(a.x - resident.x) + Math.abs(a.y - resident.y)
      - Math.abs(b.x - resident.x) - Math.abs(b.y - resident.y)
    ) || a.id - b.id);
  for (const target of targets) {
    const needs = jangdokdaeInputNeeds(state, target);
    for (const resource of JANGDOKDAE_SUPPLY_PRIORITY) {
      const missing = Math.max(
        0,
        (needs[resource] ?? 0) - reservedSupplyAmount(state, target.id, resource, resident.id),
      );
      const available = Math.max(
        0,
        state.resources[resource]
          - reservedSettlementSupplyAmount(state, resource, resident.id),
      );
      const amount = Math.min(haulerCarryCapacity(resident), missing, available);
      if (amount <= WORK_STOCK_EPSILON) continue;
      resident.haulTask = {
        kind: 'supply',
        sourceBuildingId: storage.id,
        targetBuildingId: target.id,
        resource,
        amount,
      };
      resident.targetId = storage.id;
      resident.path = [];
      return true;
    }
  }
  return false;
}

function reservedHaulAmount(
  state: GameState,
  sourceBuildingId: number,
  resource: ResourceId,
  exceptResidentId: number,
): number {
  return state.residents.reduce((sum, resident) => {
    const task = resident.haulTask;
    if (resident.id === exceptResidentId || !task || carryTotal(resident) > 0) return sum;
    if (task.kind === 'supply') return sum;
    if (task.sourceBuildingId !== sourceBuildingId || task.resource !== resource) return sum;
    return sum + task.amount;
  }, 0);
}

function availableHaulAmount(
  state: GameState,
  building: Building,
  resource: ResourceId,
  residentId: number,
): number {
  if (building.type === 'jangdokdae') {
    const protectedInputs = jangdokdaeInputNeeds(state, building);
    if (Object.prototype.hasOwnProperty.call(protectedInputs, resource)) return 0;
  } else if (isWorkplaceInputStock(building, resource)) return 0;
  return Math.max(
    0,
    buildingStock(building, resource) - reservedHaulAmount(state, building.id, resource, residentId),
  );
}

function haulBatchMinimum(resident: Resident): number {
  return resident.cartEquipped ? CONFIG.agents.haulerCartBatchMin : CONFIG.agents.haulerBatchMin;
}

function assignHaulTask(state: GameState, resident: Resident): boolean {
  if (assignJangdokdaeSupplyTask(state, resident)) return true;

  // 성능: 기존 구현은 자원 25종 × 건물마다 (다른 주민 전체를 훑는) 예약량 계산을
  // 반복해 운반꾼 1명당 수백만 연산이 됐다. 예약량·가용량·긴급 판정 재료를
  // 한 번씩만 집계해 두고 같은 결과를 고른다.
  const sources = state.buildings.filter(building => building.built && !isStorageBuilding(building));
  if (sources.length === 0) return false;

  // 다른 운반꾼이 이미 예약한 양 (건물|자원 → 합계)
  const reserved = new Map<string, number>();
  for (const other of state.residents) {
    const task = other.haulTask;
    if (other.id === resident.id || !task || task.kind === 'supply' || carryTotal(other) > 0) continue;
    if (task.sourceBuildingId == null || !task.resource) continue;
    const key = `${task.sourceBuildingId}|${task.resource}`;
    reserved.set(key, (reserved.get(key) ?? 0) + task.amount);
  }

  // 건물별 자원별 가용량 행렬 — availableHaulAmount와 같은 규칙, 계산은 한 번씩만
  const perBuilding = sources.map(building => {
    const protectedInputs = building.type === 'jangdokdae'
      ? jangdokdaeInputNeeds(state, building)
      : null;
    const inputResources = protectedInputs ? null : workplaceInputResources(building);
    const amounts = HAUL_PRIORITY.map(resource => {
      if (protectedInputs && Object.prototype.hasOwnProperty.call(protectedInputs, resource)) return 0;
      if (inputResources && inputResources.includes(resource)) return 0;
      return Math.max(
        0,
        buildingStock(building, resource) - (reserved.get(`${building.id}|${resource}`) ?? 0),
      );
    });
    return { building, amounts, load: amounts.reduce((total, amount) => total + amount, 0) };
  });

  // 긴급 판정의 자원 무관 재료를 한 번만 계산 (isUrgentHaulResource와 같은 기준)
  const living = state.residents.filter(other => other.alive);
  const population = living.length;
  const foodLow = foodTotal(state) < population * 3;
  const fuelLow = fuelHeatTotal(state) < population * 2;
  const toolsLow = state.resources.tools < 3;
  const clothingLow = clothingCoverageTotal(state) < population * 0.5;
  const footwearLow = footwearCoverageTotal(state) < population * 0.5;
  const anySick = living.some(other => other.sick);
  const cartlessHauler = living.some(other => other.job === 'hauler' && !other.cartEquipped);
  const combatTension = state.threat >= CONFIG.threat.raidThreshold || state.raiders != null || state.battle != null;
  const isUrgent = (resource: ResourceId, available: number): boolean =>
    (FOOD_HAUL_RESOURCES.has(resource) && foodLow) ||
    (FUEL_HAUL_RESOURCES.has(resource) && fuelLow) ||
    (resource === 'tools' && toolsLow) ||
    (resource === 'carts' && state.resources.carts < 1 && state.resources.carts + available >= 1 && cartlessHauler) ||
    (CLOTHING_HAUL_RESOURCES.has(resource) && clothingLow) ||
    (FOOTWEAR_HAUL_RESOURCES.has(resource) && footwearLow) ||
    (resource === 'herbs' && anySick) ||
    (COMBAT_HAUL_RESOURCES.has(resource) && combatTension);

  const batchMin = haulBatchMinimum(resident);
  for (let index = 0; index < HAUL_PRIORITY.length; index++) {
    const resource = HAUL_PRIORITY[index];
    let best: { building: Building; available: number; distance: number } | null = null;
    for (const candidate of perBuilding) {
      const available = candidate.amounts[index];
      if (available <= WORK_STOCK_EPSILON) continue;
      if (!isUrgent(resource, available) && candidate.load + 0.0001 < batchMin) continue;
      const distance = Math.abs(candidate.building.x - resident.x) + Math.abs(candidate.building.y - resident.y);
      if (!best || distance < best.distance ||
        (distance === best.distance && candidate.building.id < best.building.id)) {
        best = { building: candidate.building, available, distance };
      }
    }
    if (!best) continue;
    resident.haulTask = {
      sourceBuildingId: best.building.id,
      resource,
      amount: Math.min(haulerCarryCapacity(resident), best.available),
    };
    resident.targetId = best.building.id;
    resident.path = [];
    return true;
  }
  return false;
}


function collectHaulLoad(state: GameState, resident: Resident, source: Building): number {
  const task = resident.haulTask;
  if (!task) return 0;
  const resources = [task.resource, ...HAUL_PRIORITY.filter(resource => resource !== task.resource)];
  for (const resource of resources) {
    const remaining = haulerCarryCapacity(resident) - carryTotal(resident);
    if (remaining <= 0.0001) break;
    const amount = Math.min(
      remaining,
      availableHaulAmount(state, source, resource, resident.id),
    );
    if (amount <= WORK_STOCK_EPSILON) continue;
    addCarry(resident, resource, takeBuildingStock(source, resource, amount));
  }
  return carryTotal(resident);
}

function handleSupplyHaulTask(state: GameState, resident: Resident, ctx: Ctx): void {
  const task = resident.haulTask;
  if (task?.kind !== 'supply' || task.targetBuildingId == null) return;
  const target = state.buildings.find(building =>
    building.id === task.targetBuildingId && building.built && building.type === 'jangdokdae');
  if (!target) {
    if (carryTotal(resident) > 0) depositResidentToSettlement(state, resident);
    clearHaulTask(resident);
    resident.phase = 'rest';
    return;
  }

  if (carryTotal(resident) > 0) {
    resident.phase = 'toDeposit';
    resident.task = `${BUILDING_DEFS[target.type].name} 재료 운반`;
    const status = goTo(state, resident, ctx, buildingGoal(state, target.id));
    if (isSettledAtGoal(resident, status)) {
      depositResidentToBuilding(target, resident);
      clearHaulTask(resident);
      resident.phase = 'rest';
    } else if (status === 'stuck') {
      depositResidentToSettlement(state, resident);
      clearHaulTask(resident);
      resident.phase = 'rest';
    }
    return;
  }

  const source = state.buildings.find(building =>
    building.id === task.sourceBuildingId && isStorageBuilding(building));
  if (!source || state.resources[task.resource] <= WORK_STOCK_EPSILON) {
    clearHaulTask(resident);
    resident.phase = 'rest';
    return;
  }
  resident.phase = 'toWork';
  resident.task = `${RESOURCE_NAMES[task.resource]} 싣는 중`;
  const status = goTo(state, resident, ctx, buildingGoal(state, source.id));
  if (status === 'arrived') {
    const amount = Math.min(task.amount, haulerCarryCapacity(resident), state.resources[task.resource]);
    if (amount > WORK_STOCK_EPSILON) {
      state.resources[task.resource] -= amount;
      addCarry(resident, task.resource, amount);
      resident.phase = 'toDeposit';
      resident.targetId = target.id;
      resident.path = [];
    } else {
      clearHaulTask(resident);
      resident.phase = 'rest';
    }
  } else if (status === 'stuck') {
    clearHaulTask(resident);
    resident.phase = 'rest';
  }
}

function haulerTick(state: GameState, r: Resident, ctx: Ctx): void {
  if (r.haulTask?.kind === 'supply') {
    handleSupplyHaulTask(state, r, ctx);
    return;
  }

  // 생산지에서 실은 짐을 창고에 하역한다.
  if (carryTotal(r) > 0) {
    r.phase = 'toDeposit';
    r.task = '창고로 운반';
    const st = goTo(state, r, ctx, depositGoal(state, []));
    if (isSettledAtGoal(r, st) || st === 'stuck') {
      depositResidentToSettlement(state, r);
      clearHaulTask(r);
      r.phase = 'rest';
    }
    return;
  }

  if (!r.haulTask) assignHaulTask(state, r);
  const assignedTask = r.haulTask as Resident['haulTask'];
  if (assignedTask?.kind === 'supply') {
    handleSupplyHaulTask(state, r, ctx);
    return;
  }
  const task = assignedTask;
  if (task) {
    const source = state.buildings.find(building =>
      building.id === task.sourceBuildingId && building.built && !isStorageBuilding(building));
    if (!source || buildingStock(source, task.resource) <= WORK_STOCK_EPSILON) {
      clearHaulTask(r);
      r.phase = 'rest';
      return;
    }
    r.phase = 'toWork';
    r.task = `${BUILDING_DEFS[source.type].name} 재고 수거`;
    const st = goTo(state, r, ctx, buildingGoal(state, source.id));
    if (st === 'arrived') {
      if (collectHaulLoad(state, r, source) > 0) {
        r.phase = 'toDeposit';
        r.path = [];
      } else {
        clearHaulTask(r);
        r.phase = 'rest';
      }
    } else if (st === 'stuck') {
      clearHaulTask(r);
      r.phase = 'rest';
    }
    return;
  }

  loiterNearCenter(state, r, ctx, '대기');
}

function millerTick(state: GameState, r: Resident, ctx: Ctx): void {
  const p = CONFIG.production;
  const mill = assignedWorkplace(state, r, ctx, 'watermill', '방앗간 배정 없음');
  if (!mill) return;

  const target = (p.millerRicePerDay / 5) * effOf(state, r) * ctx.outputMod * WORK_RATE_SCALE;
  if (supplyWorkplaceInputs(state, r, ctx, mill, { rice: target })) return;

  const st = goTo(state, r, ctx, buildingGoal(state, mill.id));
  if (st !== 'arrived') {
    r.phase = st === 'stuck' ? 'rest' : 'toWork';
    r.task = st === 'stuck' ? '길이 막힘' : '방앗간으로 이동';
    return;
  }

  const q = Math.min(buildingStock(mill, 'rice'), target);
  if (q <= WORK_STOCK_EPSILON) {
    r.phase = 'rest';
    loiterNearBuilding(state, r, ctx, mill, 3, '도정할 곡물 없음');
    return;
  }

  takeBuildingStock(mill, 'rice', q);
  addBuildingStock(mill, 'grain', q * p.grainPerRice * plaqueProductionMultiplier(state, mill.id));
  r.phase = 'working';
  r.task = '방아 찧기';
  gainSkillTick(state, r);
}

function woodSplitterTick(state: GameState, r: Resident, ctx: Ctx): void {
  const shed = assignedWorkplace(state, r, ctx, 'woodShed', '장작마당 배정 없음');
  if (!shed) return;
  const target = (CONFIG.production.firewoodWoodPerDay / 5) * effOf(state, r) *
    ctx.outputMod * WORK_RATE_SCALE;
  if (supplyWorkplaceInputs(state, r, ctx, shed, { wood: target })) return;
  const st = goTo(state, r, ctx, workerSlotGoal(state, r, shed));
  if (st !== 'arrived') {
    r.phase = st === 'stuck' ? 'rest' : 'toWork';
    r.task = st === 'stuck' ? '길이 막힘' : '장작마당으로 이동';
    return;
  }
  const wood = Math.min(
    buildingStock(shed, 'wood'),
    target,
  );
  if (wood <= WORK_STOCK_EPSILON) {
    r.phase = 'rest';
    r.task = '목재 대기';
    return;
  }
  takeBuildingStock(shed, 'wood', wood);
  addBuildingStock(
    shed,
    'firewood',
    wood * CONFIG.production.firewoodPerWood * plaqueProductionMultiplier(state, shed.id),
  );
  r.phase = 'working';
  r.task = '장작 패기';
  gainSkillTick(state, r);
}

function smithMaxCraftable(smithy: Building, product: SmithyProductId): number {
  const inputs = SMITHY_PRODUCT_DEFS[product].inputPerUnit;
  let max = Infinity;
  for (const [resource, perUnit] of Object.entries(inputs) as [ResourceId, number][]) {
    if (perUnit <= 0) continue;
    max = Math.min(max, buildingStock(smithy, resource) / perUnit);
  }
  return max === Infinity ? 0 : max;
}

function consumeSmithInputs(smithy: Building, product: SmithyProductId, made: number): void {
  const inputs = SMITHY_PRODUCT_DEFS[product].inputPerUnit;
  for (const [resource, perUnit] of Object.entries(inputs) as [ResourceId, number][]) {
    takeBuildingStock(smithy, resource, perUnit * made);
  }
}

function smithInputRequirements(product: SmithyProductId, target: number): WorkplaceInputs {
  const def = SMITHY_PRODUCT_DEFS[product];
  return Object.fromEntries(
    (Object.entries(def.inputPerUnit) as [ResourceId, number][])
      .map(([resource, amount]) => [resource, amount * target]),
  ) as WorkplaceInputs;
}

function smithInputWaitTask(smithy: Building, requirements: WorkplaceInputs): string {
  const missing = (Object.entries(requirements) as [ResourceId, number][])
    .find(([resource]) => buildingStock(smithy, resource) <= WORK_CRAFT_EPSILON)?.[0];
  return missing ? `${RESOURCE_NAMES[missing]} 대기` : '재료 대기';
}

function smithTick(state: GameState, r: Resident, ctx: Ctx): void {
  const smithy = assignedWorkplace(state, r, ctx, 'smithy', '대장간 배정 없음');
  if (!smithy) return;
  const product = smithyProductOf(smithy);
  const def = SMITHY_PRODUCT_DEFS[product];
  // 도망 야장 막쇠 '천출의 망치' — 본인의 산출이 오른다
  const specialMult = r.special === 'runawaySmith' ? CONFIG.specialResidents.runawaySmithSmithyMult : 1;
  const target = (def.ratePerDay / 5) * effOf(state, r) * ctx.outputMod * specialMult * WORK_RATE_SCALE;
  const requirements = smithInputRequirements(product, target);

  if (carryTotal(r) > 0) {
    supplyWorkplaceInputs(state, r, ctx, smithy, requirements);
    return;
  }

  if (!isSmithyProductUnlocked(state.rank, product)) {
    const st = goTo(state, r, ctx, buildingGoal(state, smithy.id));
    r.phase = st === 'moving' ? 'toWork' : 'rest';
    r.task = st === 'stuck' ? '길이 막힘' : st === 'arrived' ? '생산 잠김' : '대장간으로 이동';
    return;
  }

  if (supplyWorkplaceInputs(state, r, ctx, smithy, requirements)) return;
  const made = Math.min(target, smithMaxCraftable(smithy, product));
  if (made <= WORK_CRAFT_EPSILON) {
    const st = goTo(state, r, ctx, buildingGoal(state, smithy.id));
    r.phase = st === 'moving' ? 'toWork' : 'rest';
    r.task = st === 'stuck' ? '길이 막힘' : st === 'arrived'
      ? smithInputWaitTask(smithy, requirements)
      : '대장간으로 이동';
    return;
  }

  const st = goTo(state, r, ctx, buildingGoal(state, smithy.id));
  if (st === 'arrived') {
    r.phase = 'working';
    r.task = def.task;
    consumeSmithInputs(smithy, product, made);
    addBuildingStock(smithy, def.output, made * plaqueProductionMultiplier(state, smithy.id));
    // 길잡이 14단계(대장간)의 '도구' 누계 — 완성품 재고가 아니라 지어낸 양을 센다.
    // 재고로 세면 시작 도구 15개가 이미 목표를 넘겨 아무것도 가르치지 못한다.
    if (product === 'tools') countScenarioProgress(state, 'toolsCrafted', made);
    gainSkillTick(state, r);
  } else {
    r.phase = st === 'stuck' ? 'rest' : 'toWork';
    r.task = st === 'stuck' ? '길이 막힘' : '대장간으로 이동';
  }
}

function scaledRequirements(inputs: WorkplaceInputs, target: number): WorkplaceInputs {
  return Object.fromEntries(
    (Object.entries(inputs) as [ResourceId, number][])
      .map(([resource, amount]) => [resource, amount * target]),
  ) as WorkplaceInputs;
}

function maxCraftableFrom(workplace: Building, inputs: WorkplaceInputs): number {
  let max = Infinity;
  for (const [resource, perUnit] of Object.entries(inputs) as [ResourceId, number][]) {
    if (perUnit <= 0) continue;
    max = Math.min(max, buildingStock(workplace, resource) / perUnit);
  }
  return max === Infinity ? 0 : max;
}

function consumeRecipeInputs(workplace: Building, inputs: WorkplaceInputs, made: number): void {
  for (const [resource, perUnit] of Object.entries(inputs) as [ResourceId, number][]) {
    takeBuildingStock(workplace, resource, perUnit * made);
  }
}

function inputWaitTask(workplace: Building, requirements: WorkplaceInputs): string {
  const missing = (Object.entries(requirements) as [ResourceId, number][])
    .find(([resource]) => buildingStock(workplace, resource) <= WORK_CRAFT_EPSILON)?.[0];
  return missing ? `${RESOURCE_NAMES[missing]} 대기` : '재료 대기';
}

function preferredKilnFuel(state: GameState, workplace: Building): 'firewood' | 'charcoal' {
  if (buildingStock(workplace, 'charcoal') > WORK_CRAFT_EPSILON) return 'charcoal';
  if (buildingStock(workplace, 'firewood') > WORK_CRAFT_EPSILON) return 'firewood';
  if (state.resources.charcoal > WORK_STOCK_EPSILON) return 'charcoal';
  return 'firewood';
}

function curerTick(state: GameState, r: Resident, ctx: Ctx): void {
  const workplace = assignedWorkplaceOfTypes(
    state, r, ctx, ['smokehouse', 'dryingRack'], '갈무리 작업장 배정 없음',
  );
  if (!workplace) return;

  let output: ResourceId;
  let inputs: WorkplaceInputs;
  let target: number;
  let task: string;
  let rainBlocked = false;

  if (workplace.type === 'smokehouse') {
    const fuel = preferredKilnFuel(state, workplace);
    output = 'curedMeat';
    inputs = {
      meat: CONFIG.production.meatPerCuredMeat,
      [fuel]: fuel === 'charcoal'
        ? CONFIG.production.charcoalPerCuredMeat
        : CONFIG.production.firewoodPerCuredMeat,
    };
    target = (CONFIG.production.curedMeatPerDay / 5) * effOf(state, r) *
      ctx.outputMod * WORK_RATE_SCALE;
    task = '고기 훈연 중';
  } else {
    const def = DRYING_PRODUCT_DEFS[dryingProductOf(workplace)];
    output = def.output;
    inputs = def.inputPerUnit;
    target = (def.ratePerDay / 5) * effOf(state, r) * ctx.outputMod * WORK_RATE_SCALE;
    task = def.task;
    rainBlocked = def.stopsInRain && state.weather === 'rain';
  }

  const requirements = scaledRequirements(inputs, target);
  if (carryTotal(r) > 0) {
    supplyWorkplaceInputs(state, r, ctx, workplace, requirements);
    return;
  }
  if (supplyWorkplaceInputs(state, r, ctx, workplace, requirements)) return;

  const st = goTo(state, r, ctx, buildingGoal(state, workplace.id));
  if (st !== 'arrived') {
    r.phase = st === 'stuck' ? 'rest' : 'toWork';
    r.task = st === 'stuck' ? '길이 막힘' : `${withJosa(BUILDING_DEFS[workplace.type].name, '으로/로')} 이동`;
    return;
  }
  if (rainBlocked) {
    r.phase = 'rest';
    r.task = '비가 그치기를 기다림';
    return;
  }

  const made = Math.min(target, maxCraftableFrom(workplace, inputs));
  if (made <= WORK_CRAFT_EPSILON) {
    r.phase = 'rest';
    r.task = inputWaitTask(workplace, requirements);
    return;
  }

  consumeRecipeInputs(workplace, inputs, made);
  addBuildingStock(workplace, output, made * plaqueProductionMultiplier(state, workplace.id));
  r.phase = 'working';
  r.task = task;
  gainSkillTick(state, r);
}

function potterTick(state: GameState, r: Resident, ctx: Ctx): void {
  const kiln = assignedWorkplace(state, r, ctx, 'onggiKiln', '옹기가마 배정 없음');
  if (!kiln) return;
  const fuel = preferredKilnFuel(state, kiln);
  const inputs: WorkplaceInputs = {
    [fuel]: fuel === 'charcoal'
      ? CONFIG.production.charcoalPerOnggi
      : CONFIG.production.firewoodPerOnggi,
  };
  const target = (CONFIG.production.onggiPerDay / 5) * effOf(state, r) *
    ctx.outputMod * WORK_RATE_SCALE * waterDependentProductionMultiplier(state, kiln);
  const requirements = scaledRequirements(inputs, target);

  if (carryTotal(r) > 0) {
    supplyWorkplaceInputs(state, r, ctx, kiln, requirements);
    return;
  }
  if (supplyWorkplaceInputs(state, r, ctx, kiln, requirements)) return;

  const st = goTo(state, r, ctx, buildingGoal(state, kiln.id));
  if (st !== 'arrived') {
    r.phase = st === 'stuck' ? 'rest' : 'toWork';
    r.task = st === 'stuck' ? '길이 막힘' : '옹기가마로 이동';
    return;
  }

  const made = Math.min(target, maxCraftableFrom(kiln, inputs));
  if (made <= WORK_CRAFT_EPSILON) {
    r.phase = 'rest';
    r.task = inputWaitTask(kiln, requirements);
    return;
  }

  consumeRecipeInputs(kiln, inputs, made);
  addBuildingStock(kiln, 'onggi', made * plaqueProductionMultiplier(state, kiln.id));
  r.phase = 'working';
  r.task = '점토를 빚어 옹기 굽는 중';
  gainSkillTick(state, r);
}

function minerTick(state: GameState, r: Resident, ctx: Ctx): void {
  const assignedMine = assignedBuildingForResident(state, r);
  if (assignedMine?.type === 'deepMine') {
    const sample = oreSampleAt(
      state.seed,
      state.map[0]?.length ?? 0,
      state.map.length,
      assignedMine.x,
      assignedMine.y,
      state.worldSetup?.region,
      state.worldSetup?.effective.resourceDensityMultiplier,
    );
    const remaining = sample ? state.oreVeinRemaining[sample.vein.id] ?? 0 : 0;
    if (!sample || remaining <= 0) {
      loiterNearBuilding(state, r, ctx, assignedMine, 2, '지하 광맥이 다함');
      return;
    }
    const status = goTo(state, r, ctx, workerSlotGoal(state, r, assignedMine));
    if (status !== 'arrived') {
      r.phase = status === 'stuck' ? 'rest' : 'toWork';
      r.task = status === 'stuck' ? '채광갱 길이 막힘' : '채광갱으로 이동';
      return;
    }
    const geomancerMult = state.residents.some(resident => resident.alive && resident.special === 'geomancer')
      ? 1 + CONFIG.specialResidents.geomancerMiningYieldBonus
      : 1;
    const richnessMult = 0.45 + sample.normalizedRichness * 0.75;
    const target = (CONFIG.minerals.deepMinePerDay / 5) * effOf(state, r) *
      ctx.outputMod * WORK_RATE_SCALE * geomancerMult * richnessMult;
    const mined = Math.min(remaining, target);
    if (mined <= 0) {
      r.phase = 'rest';
      r.task = '지하 광맥이 다함';
      return;
    }
    state.oreVeinRemaining[sample.vein.id] = remaining - mined;
    addBuildingStock(
      assignedMine,
      sample.vein.mineral,
      mined * plaqueProductionMultiplier(state, assignedMine.id),
    );
    if (sample.vein.mineral === 'iron') {
      addBuildingStock(
        assignedMine,
        'stone',
        mined * CONFIG.minerals.deepMineStoneByproductRatio *
          plaqueProductionMultiplier(state, assignedMine.id),
      );
    }
    if (remaining > 0 && state.oreVeinRemaining[sample.vein.id] <= 0) {
      addLog(state, `${sample.vein.mineral === 'iron' ? '철맥' : '석맥'}의 맥이 다했습니다.`, 'bad', true);
    }
    r.phase = 'working';
    r.task = sample.vein.mineral === 'iron' ? '갱내 철맥 채굴 중' : '갱내 석맥 채굴 중';
    gainSkillTick(state, r);
    return;
  }

  if (assignedMine?.type !== 'mine') {
    if (carryTotal(r) > 0) depositResidentToSettlement(state, r);
    r.miningDepositBuildingId = null;
    loiterNearCenter(state, r, ctx, '채광장 배정 없음');
    return;
  }

  const a = CONFIG.agents;
  // 맹인 지관 허생 '산세 읽기' — 마을 전체 채광 산출이 오른다
  const geomancerMult = state.residents.some(resident => resident.alive && resident.special === 'geomancer')
    ? 1 + CONFIG.specialResidents.geomancerMiningYieldBonus
    : 1;
  let minedResource: 'stone' | 'iron' | 'silver' = 'stone';
  gatherJob(state, r, ctx, {
    goal: t => isTileInMineWorkArea(assignedMine, t) &&
      t.terrain === 'rock' && mineralRemaining(t) > 0 && !isVeinSealedTile(state, t),
    targetFromWorkTile: workTile => {
      for (const [dx, dy] of CARDINAL_DIRS) {
        const target = state.map[workTile.y + dy]?.[workTile.x + dx];
        if (target && isTileInMineWorkArea(assignedMine, target) &&
            target.terrain === 'rock' && mineralRemaining(target) > 0 &&
            !isVeinSealedTile(state, target)) return target;
      }
      return null;
    },
    workTicks: a.work.mine,
    yieldRes: tile => tile.hasSilver ? 'silver' : tile.hasIron ? 'iron' : 'stone',
    yieldAmt: tile => (tile.hasSilver ? a.yields.silver : tile.hasIron ? a.yields.iron : a.yields.stone) * geomancerMult,
    cap: tile => tile.hasSilver ? a.carryCap.silver : tile.hasIron ? a.carryCap.iron : a.carryCap.stone,
    depositExtra: [],
    depositTargets: () => [assignedMine],
    onDeposit: worker => { worker.miningDepositBuildingId = null; },
    taskWork: tile => tile.hasSilver ? '은맥 채굴 중' : tile.hasIron ? '철광 채굴 중' : '채석 중',
    taskMove: '광상으로 이동',
    taskHaul: '광물 운반',
    taskNone: '캘 광상 없음',
    adjustHarvestAmount: (tile, _worker, amount) => {
      const extraction = extractMineralDeposit(tile, amount);
      minedResource = extraction.resource;
      if (extraction.depleted) logMineralDepletion(state, tile, extraction.resource);
      if (extraction.resource === 'silver') {
        recordSilverMined(state, extraction.amount);
        // 설점(보고 후 허가) 채굴은 산출의 큰 몫이 조정 몫으로 빠진다.
        const sanctionKeep = state.silverVein?.status === 'sanctioned' &&
          state.silverVein.x === tile.x && state.silverVein.y === tile.y
          ? 1 - CONFIG.silver.sanctionTaxRatio
          : 1;
        return extraction.amount * sanctionKeep;
      }
      if (extraction.amount > 0) recordRockMining(state, tile);
      // 길잡이 13단계(광물)의 '돌·철' 누계 — 곳간 재고가 아니라 캐낸 양을 센다
      // (돌은 공사에 곧바로 쓰여 재고로는 늘지 않는 날이 있다)
      countScenarioProgress(state, 'mineralsMined', extraction.amount);
      return extraction.amount;
    },
    onHarvest: (_tile, worker, amount) => {
      worker.miningDepositBuildingId = assignedMine.id;
      if (minedResource === 'iron') {
        addCarry(worker, 'stone', amount * (a.yields.mineStone / a.yields.iron));
      }
    },
  });
}

function saltMakerTick(state: GameState, r: Resident, ctx: Ctx): void {
  const saltworks = assignedWorkplace(state, r, ctx, 'saltworks', '자염막 배정 없음');
  if (!saltworks) return;
  if (!saltworksHasSeaAccess(state, saltworks)) {
    r.phase = 'rest';
    r.task = '바닷물 나르는 길이 끊김';
    return;
  }
  const inputs: WorkplaceInputs = { firewood: CONFIG.production.firewoodPerSalt };
  const target = (CONFIG.production.saltPerDay / 5) * effOf(state, r) *
    ctx.outputMod * WORK_RATE_SCALE;
  const requirements = scaledRequirements(inputs, target);

  if (carryTotal(r) > 0) {
    supplyWorkplaceInputs(state, r, ctx, saltworks, requirements);
    return;
  }
  if (supplyWorkplaceInputs(state, r, ctx, saltworks, requirements)) return;

  const returningWithSeaWater = r.task === '바닷물 지고 자염막으로 이동';
  if (r.task === '바닷물 긷는 중' && r.workTimer > 0) {
    r.phase = 'working';
    r.workTimer -= 1;
    if (r.workTimer <= 0) {
      r.task = '바닷물 지고 자염막으로 이동';
      r.path = [];
    }
    return;
  }

  if (!returningWithSeaWater) {
    const intakeGoal = (tile: Tile): boolean =>
      isPassable(state, tile.x, tile.y) &&
      Math.max(Math.abs(tile.x - saltworks.x), Math.abs(tile.y - saltworks.y)) <= 8 &&
      CARDINAL_DIRS.some(([dx, dy]) => state.map[tile.y + dy]?.[tile.x + dx]?.terrain === 'sea');
    const intakeMove = goTo(state, r, ctx, intakeGoal);
    if (intakeMove !== 'arrived') {
      r.phase = intakeMove === 'stuck' ? 'rest' : 'toWork';
      r.task = intakeMove === 'stuck' ? '바닷물 길이 막힘' : '바닷물 뜨러 해안으로 이동';
      return;
    }
    r.phase = 'working';
    r.task = '바닷물 긷는 중';
    r.workTimer = 4;
    return;
  }

  const st = goTo(state, r, ctx, workerSlotGoal(state, r, saltworks));
  if (st !== 'arrived') {
    r.phase = st === 'stuck' ? 'rest' : 'toWork';
    r.task = st === 'stuck' ? '길이 막힘' : '자염막으로 이동';
    return;
  }

  const made = Math.min(target, maxCraftableFrom(saltworks, inputs));
  if (made <= WORK_CRAFT_EPSILON) {
    r.phase = 'rest';
    r.task = inputWaitTask(saltworks, requirements);
    return;
  }

  consumeRecipeInputs(saltworks, inputs, made);
  addBuildingStock(saltworks, 'salt', made * plaqueProductionMultiplier(state, saltworks.id));
  r.workTimer = 0;
  r.phase = 'working';
  r.task = '바닷물 끓여 소금 내는 중';
  gainSkillTick(state, r);
}

function fisherTick(state: GameState, r: Resident, ctx: Ctx): void {
  const a = CONFIG.agents;
  const assignedBoat = state.fishingBoats.find(boat => boat.fisherIds.includes(r.id));
  const assignedPort = assignedBoat == null ? undefined : state.buildings.find(building =>
    building.id === assignedBoat.portId && building.type === 'fishingPort' && building.built);
  const workplace = assignedPort ?? assignedWorkplaceOfTypes(
    state, r, ctx, ['ferry', 'tidalFishery'], '어로 거점이나 어선 배정 없음',
  );
  if (!workplace) return;
  if (workplace.type === 'tidalFishery') {
    if (!state.fishingGrounds.some(ground => ground.kind === 'mudflat')) ensureFishingGrounds(state);
    gatherJob(state, r, ctx, {
      goal: tile => tile.terrain === 'mudflat' && tile.buildingId == null &&
        fishingGroundStockAt(state.fishingGrounds, tile.x, tile.y) > WORK_STOCK_EPSILON &&
        isTileInGatheringWorkArea(workplace, tile),
      workTicks: a.work.fish,
      yieldRes: 'fish',
      yieldAmt: a.yields.fish * tidalFlatYieldMultiplier(ctx.season),
      cap: a.carryCap.fish,
      depositExtra: ['tidalFishery'],
      depositTargets: () => [workplace],
      taskWork: tile => (tile.x + tile.y) % 2 === 0 ? '갯벌에서 조개·게 줍는 중' : '어살을 살피는 중',
      taskMove: '갯벌 작업지로 이동',
      taskHaul: '갯벌 어획물 운반',
      taskNone: '잡을 것이 없는 갯벌',
      adjustHarvestAmount: (tile, _resident, requested) => {
        const ground = fishingGroundAt(state.fishingGrounds, tile.x, tile.y, 'shore');
        const taken = takeFishingGroundStock(state.fishingGrounds, tile.x, tile.y, requested);
        if (ground && ground.stock <= WORK_STOCK_EPSILON) {
          const remaining = fishingGroundSummaryInArea(
            state.fishingGrounds, gatheringWorkArea(workplace), 'mudflat',
          ).stock;
          const warningDays = tidalDepletionWarningDaysFor(state);
          const lastWarningDay = warningDays.get(workplace.id) ?? -Infinity;
          if (remaining <= WORK_STOCK_EPSILON &&
              state.day - lastWarningDay >= CONFIG.tidalFlats.depletionLogCooldownDays) {
            warningDays.set(workplace.id, state.day);
            addLog(state, '어살터 작업영역의 갯벌 비축이 바닥났습니다. 며칠 쉬면 다시 찹니다.', 'bad', true);
          }
        }
        return taken;
      },
    });
    return;
  }
  if (workplace.type === 'fishingPort') {
    const area = gatheringWorkArea(workplace);
    const portKind = state.map[area.y]?.[area.x]?.terrain;
    if ((portKind === 'lake' || portKind === 'sea') && carryTotal(r) <= WORK_STOCK_EPSILON) {
      const remainingWorkSubticks = DAY_BANDS.work.end - state.subTick + 1;
      const candidate = state.fishingBoats
        .filter(boat => boat.id === assignedBoat?.id && (boat.status === 'moored' || boat.status === 'boarded'))
        .map(boat => ({ boat, plan: fishingBoatTripPlan(state, boat, remainingWorkSubticks) }))
        .filter((entry): entry is { boat: GameState['fishingBoats'][number]; plan: NonNullable<typeof entry.plan> } =>
          entry.plan != null)
        .sort((left, right) =>
          right.plan.expectedCatch - left.plan.expectedCatch ||
          left.plan.requiredSubticks - right.plan.requiredSubticks || left.boat.id - right.boat.id)[0];
      if (candidate) {
        const st = goTo(state, r, ctx, buildingInteractionGoal(state, [workplace.id]));
        if (st === 'arrived') {
          const boardError = boardFishingBoat(state, candidate.boat.id, r.id);
          r.phase = boardError == null ? 'toWork' : 'rest';
          r.task = boardError == null
            ? (candidate.boat.fisherIds.length > 1 ? '동승 어부를 기다리는 중' : `${portKind === 'sea' ? '바다' : '호수'} 중·심수 어장으로 출항`)
            : boardError;
        } else {
          r.phase = st === 'stuck' ? 'rest' : 'toWork';
          r.task = st === 'stuck' ? '포구 길이 막힘' : '어선에 타러 포구로 이동';
        }
        return;
      }
    }
    const availableGround = () => state.fishingGrounds
      .filter(ground => ground.depthBand === 'shore' && (ground.kind === 'lake' || ground.kind === 'sea') &&
        ground.stock > WORK_STOCK_EPSILON && ground.tiles.some(tile =>
          (tile.x - area.x) ** 2 + (tile.y - area.y) ** 2 <= area.radius ** 2 &&
          (ground.kind !== 'lake' || !isLakeIceAt(state.map, state.day, tile.x, tile.y))))
      .sort((left, right) =>
        (left.x - area.x) ** 2 + (left.y - area.y) ** 2 -
        ((right.x - area.x) ** 2 + (right.y - area.y) ** 2) || left.id.localeCompare(right.id))[0];
    const interactionGoal = buildingInteractionGoal(state, [workplace.id]);
    gatherJob(state, r, ctx, {
      goal: tile => interactionGoal(tile) && availableGround() != null,
      workTicks: a.work.fish,
      yieldRes: 'fish',
      yieldAmt: a.yields.fish * CONFIG.seasons.fishMult[ctx.season],
      cap: a.carryCap.fish,
      depositExtra: ['fishingPort'],
      depositTargets: () => [workplace],
      taskWork: '포구 연안에서 낚시 중',
      taskMove: '포구로 이동',
      taskHaul: '포구 어획물 하역',
      taskNone: '포구 연안 어장이 고갈됨',
      adjustHarvestAmount: (_tile, _resident, requested) => {
        const ground = availableGround();
        if (!ground) return 0;
        const taken = takeFishingGroundStockById(state.fishingGrounds, ground.id, requested);
        const kind = state.map[area.y]?.[area.x]?.terrain === 'lake' ? 'lake' : 'sea';
        const remaining = fishingGroundSummaryInArea(state.fishingGrounds, area, kind).stock;
        const warningDays = tidalDepletionWarningDaysFor(state);
        const lastWarningDay = warningDays.get(workplace.id) ?? -Infinity;
        if (remaining <= WORK_STOCK_EPSILON &&
            state.day - lastWarningDay >= CONFIG.tidalFlats.depletionLogCooldownDays) {
          warningDays.set(workplace.id, state.day);
          addLog(state, '포구 작업영역의 연안 어장이 바닥났습니다. 어선을 준비하거나 다른 어장을 찾으십시오.', 'bad', true);
        }
        return taken;
      },
    });
    return;
  }
  if (!fishingGroundAt(state.fishingGrounds, workplace.x, workplace.y, 'shore')) ensureFishingGrounds(state);
  const floodMult = state.weather === 'thawFlood' ? 0.25 : 1;
  const interactionGoal = buildingInteractionGoal(state, [workplace.id]);
  gatherJob(state, r, ctx, {
    goal: tile => interactionGoal(tile) &&
      fishingGroundStockAt(state.fishingGrounds, workplace.x, workplace.y) > WORK_STOCK_EPSILON,
    workTicks: a.work.fish,
    yieldRes: 'fish',
    yieldAmt: a.yields.fish * CONFIG.seasons.fishMult[ctx.season] * floodMult * droughtFishYieldMultiplier(state),
    cap: a.carryCap.fish,
    depositExtra: ['ferry'],
    taskWork: '고기잡이 중',
    taskMove: '낚시터로 이동',
    taskHaul: '물고기 운반',
    taskNone: '낚시터 어장이 고갈됨',
    adjustHarvestAmount: (_tile, _resident, requested) => {
      const taken = takeFishingGroundStock(state.fishingGrounds, workplace.x, workplace.y, requested);
      if (fishingGroundStockAt(state.fishingGrounds, workplace.x, workplace.y) <= WORK_STOCK_EPSILON) {
        const warningDays = tidalDepletionWarningDaysFor(state);
        const lastWarningDay = warningDays.get(workplace.id) ?? -Infinity;
        if (state.day - lastWarningDay >= CONFIG.tidalFlats.depletionLogCooldownDays) {
          warningDays.set(workplace.id, state.day);
          addLog(state, '낚시터의 연안 어장이 바닥났습니다. 며칠 쉬면 다시 찹니다.', 'bad', true);
        }
      }
      return taken;
    },
  });
}

function charcoalBurnerTick(state: GameState, r: Resident, ctx: Ctx): void {
  const p = CONFIG.production;
  const kiln = assignedWorkplace(state, r, ctx, 'charcoalKiln', '숯가마 배정 없음');
  if (!kiln) return;

  const target = (p.charcoalWoodPerDay / 5) * effOf(state, r) * ctx.outputMod * WORK_RATE_SCALE;
  if (supplyWorkplaceInputs(state, r, ctx, kiln, { wood: target })) return;

  const st = goTo(state, r, ctx, buildingGoal(state, kiln.id));
  if (st !== 'arrived') {
    r.phase = st === 'stuck' ? 'rest' : 'toWork';
    r.task = st === 'stuck' ? '길이 막힘' : '숯가마로 이동';
    return;
  }

  const wood = Math.min(
    buildingStock(kiln, 'wood'),
    target,
  );
  if (wood <= WORK_STOCK_EPSILON) {
    r.phase = 'rest';
    loiterNearBuilding(state, r, ctx, kiln, 3, '목재 대기');
    return;
  }

  takeBuildingStock(kiln, 'wood', wood);
  addBuildingStock(
    kiln,
    'charcoal',
    wood * p.charcoalPerWood * plaqueProductionMultiplier(state, kiln.id),
  );
  r.phase = 'working';
  r.task = '숯 굽기';
  gainSkillTick(state, r);
}

function herderTick(state: GameState, r: Resident, ctx: Ctx): void {
  const stable = assignedWorkplace(state, r, ctx, 'stable', '축사 배정 없음');
  if (!stable) return;
  const livestock = ensureLivestockState(stable);
  if (livestock.headcount <= 0) {
    loiterNearBuilding(state, r, ctx, stable, 3, '돌볼 가축 없음');
    return;
  }

  const st = goTo(state, r, ctx, buildingGoal(state, stable.id));
  if (st !== 'arrived') {
    r.phase = st === 'stuck' ? 'rest' : 'toWork';
    r.task = st === 'stuck' ? '길이 막힘' : '축사로 이동';
    return;
  }

  const product = livestockProductForHerder(
    livestock,
    ctx.season,
    (effOf(state, r) * ctx.outputMod * waterDependentProductionMultiplier(state, stable)) / WORK_SUBTICKS,
  );
  if (product && product.amount > 0) {
    addBuildingStock(
      stable,
      product.resource,
      product.amount * plaqueProductionMultiplier(state, stable.id),
    );
  }
  r.phase = 'working';
  r.task = product?.task ?? '가축 돌보기';
  gainSkillTick(state, r);
}

function physicianTick(state: GameState, r: Resident, ctx: Ctx): void {
  const clinic = assignedWorkplace(state, r, ctx, 'clinic', '의원 배정 없음');
  if (!clinic) return;
  const st = goTo(state, r, ctx, buildingGoal(state, clinic.id));
  if (st !== 'arrived') {
    r.phase = st === 'stuck' ? 'rest' : 'toWork';
    r.task = st === 'stuck' ? '길이 막힘' : '의원으로 이동';
    return;
  }

  const result = performPhysicianTreatment(
    state,
    r,
    effOf(state, r) * ctx.mMod * waterDependentProductionMultiplier(state, clinic),
    ctx.rng,
  );
  if (result.status === 'no-patient') {
    loiterNearBuilding(state, r, ctx, clinic, 3, '진료할 환자 없음');
    return;
  }
  if (result.status === 'no-herbs') {
    loiterNearBuilding(state, r, ctx, clinic, 3, '약초 대기');
    return;
  }
  r.phase = 'working';
  r.task = `${result.patient?.name ?? '환자'} 진료 중`;
  gainSkillTick(state, r);
  if (result.status === 'recovered' && result.patient) {
    addLog(
      state,
      `${residentLogName(r)}의 치료로 ${withJosa(residentLogName(result.patient), '이/가')} 병에서 회복했습니다.`,
      'good',
    );
  }
}

function powderMakerTick(state: GameState, r: Resident, ctx: Ctx): void {
  const p = CONFIG.production;
  // 가동 중지(토글) 또는 감찰 은닉 중이면 화약을 만들지 않는다
  if (state.nitrePaused || state.day < state.nitreHiddenUntil) {
    loiterNearCenter(state, r, ctx, '염초장 가동 중지');
    return;
  }
  const yard = assignedWorkplace(state, r, ctx, 'nitreYard', '질초장 배정 없음');
  if (!yard) return;

  const target = (p.gunpowderPerDay / 5) * effOf(state, r) * ctx.outputMod * WORK_RATE_SCALE;
  const requirements = {
    firewood: target * p.gunpowderFirewoodPerPowder,
    stone: target * p.gunpowderStonePerPowder,
  } satisfies WorkplaceInputs;
  if (supplyWorkplaceInputs(state, r, ctx, yard, requirements)) return;

  const st = goTo(state, r, ctx, buildingGoal(state, yard.id));
  if (st !== 'arrived') {
    r.phase = st === 'stuck' ? 'rest' : 'toWork';
    r.task = st === 'stuck' ? '길이 막힘' : '염초장으로 이동';
    return;
  }

  const firewoodLimit = buildingStock(yard, 'firewood') / p.gunpowderFirewoodPerPowder;
  const stoneLimit = buildingStock(yard, 'stone') / p.gunpowderStonePerPowder;
  const made = Math.min(target, firewoodLimit, stoneLimit);
  if (made <= WORK_CRAFT_EPSILON) {
    r.phase = 'rest';
    loiterNearBuilding(state, r, ctx, yard, 3, '화약 재료 대기');
    return;
  }

  takeBuildingStock(yard, 'firewood', made * p.gunpowderFirewoodPerPowder);
  takeBuildingStock(yard, 'stone', made * p.gunpowderStonePerPowder);
  addBuildingStock(yard, 'gunpowder', made * plaqueProductionMultiplier(state, yard.id));
  r.phase = 'working';
  r.task = '화약 제조';
  gainSkillTick(state, r);
}

function tannerTick(state: GameState, r: Resident, ctx: Ctx): void {
  const p = CONFIG.production;
  const tannery = assignedWorkplace(state, r, ctx, 'tannery', '무두장 배정 없음');
  if (!tannery) return;

  const product = resolvedTanneryProduct(state, tannery);
  const productDef = TANNERY_PRODUCT_DEFS[product];
  const target = (p.tanneryHidePerDay / 5) * effOf(state, r) * ctx.outputMod * WORK_RATE_SCALE *
    waterDependentProductionMultiplier(state, tannery);
  if (supplyWorkplaceInputs(state, r, ctx, tannery, { hide: target })) return;

  const st = goTo(state, r, ctx, buildingGoal(state, tannery.id));
  if (st !== 'arrived') {
    r.phase = st === 'stuck' ? 'rest' : 'toWork';
    r.task = st === 'stuck' ? '길이 막힘' : '무두장으로 이동';
    return;
  }

  const hideUsed = Math.min(
    buildingStock(tannery, 'hide'),
    target,
  );
  if (hideUsed <= WORK_STOCK_EPSILON) {
    r.phase = 'rest';
    loiterNearBuilding(state, r, ctx, tannery, 3, '가죽 대기');
    return;
  }

  takeBuildingStock(tannery, 'hide', hideUsed);
  const tanned = (hideUsed / productDef.hidePerUnit) * plaqueProductionMultiplier(state, tannery.id);
  addBuildingStock(tannery, productDef.output!, tanned);
  // 길잡이 11단계(가죽공방)의 '가죽옷' 누계 — 시작 재고 18벌과 섞이지 않게 지어낸 양만 센다
  if (productDef.output === 'hideClothes') countScenarioProgress(state, 'hideClothesMade', tanned);
  r.phase = 'working';
  r.task = productDef.task;
  gainSkillTick(state, r);
}

function weaverTick(state: GameState, r: Resident, ctx: Ctx): void {
  const weavingHouse = assignedWorkplace(state, r, ctx, 'weavingHouse', '베틀집 배정 없음');
  if (!weavingHouse) return;
  const target = (CONFIG.production.weaverCottonPerDay / 5) * effOf(state, r) *
    ctx.outputMod * WORK_RATE_SCALE;
  const cottonAvailable = buildingStock(weavingHouse, 'cotton') + (state.resources.cotton ?? 0);
  const woolAvailable = buildingStock(weavingHouse, 'wool') + (state.resources.wool ?? 0);
  const input: 'cotton' | 'wool' = cottonAvailable > WORK_STOCK_EPSILON ||
    woolAvailable <= WORK_STOCK_EPSILON ? 'cotton' : 'wool';
  if (supplyWorkplaceInputs(state, r, ctx, weavingHouse, { [input]: target })) return;
  const st = goTo(state, r, ctx, buildingGoal(state, weavingHouse.id));
  if (st !== 'arrived') {
    r.phase = st === 'stuck' ? 'rest' : 'toWork';
    r.task = st === 'stuck' ? '길이 막힘' : '베틀집으로 이동';
    return;
  }
  const fiber = Math.min(
    buildingStock(weavingHouse, input),
    target,
  );
  if (fiber <= WORK_STOCK_EPSILON) {
    r.phase = 'rest';
    r.task = '섬유 대기';
    return;
  }
  takeBuildingStock(weavingHouse, input, fiber);
  addBuildingStock(
    weavingHouse,
    'cottonClothes',
    fiber * CONFIG.production.cottonClothesPerCotton * plaqueProductionMultiplier(state, weavingHouse.id),
  );
  r.phase = 'working';
  r.task = input === 'wool' ? '양털 짜기' : '베 짜기';
  gainSkillTick(state, r);
}

function clerkTick(state: GameState, r: Resident, ctx: Ctx): void {
  const office = nearestBuilding(r, state.buildings.filter(b => b.type === 'office' && b.built));
  if (!office) {
    loiterNearCenter(state, r, ctx, '관청 없음');
    return;
  }

  const st = goTo(state, r, ctx, buildingGoal(state, office.id));
  if (st === 'arrived') {
    r.phase = 'working';
    r.task = '관청 업무';
    gainSkillTick(state, r);
  } else {
    r.phase = st === 'stuck' ? 'rest' : 'toWork';
    r.task = st === 'stuck' ? '길이 막힘' : '관청으로 이동';
  }
}

function watchmanTick(state: GameState, r: Resident, ctx: Ctx): void {
  const assignedTower = assignedBuildingForResident(state, r);
  if (assignedTower?.type === 'watchtower') {
    const st = goTo(state, r, ctx, workerSlotGoal(state, r, assignedTower));
    r.phase = st === 'arrived' ? 'working' : st === 'stuck' ? 'rest' : 'toWork';
    r.task = st === 'arrived' ? '망루 주둔' : st === 'stuck' ? '망루 접근로 막힘' : '망루로 이동';
    return;
  }
  r.task = '경계 근무';
  // 방어 시설 사이를 순찰한다
  const posts = state.buildings.filter(b =>
    b.built && (BUILDING_DEFS[b.type].defense > 0 || b.type === 'center'));
  if (posts.length === 0) { loiterNearCenter(state, r, ctx, '경계 근무'); return; }
  let target = posts.find(b => b.id === r.targetId);
  if (!target || (r.workTimer <= 0 && isResidentAtBuildingInteraction(state, r, target.id))) {
    target = posts[Math.floor(ctx.rng() * posts.length)];
    r.targetId = target.id;
    r.path = [];
    r.workTimer = 3; // 도착 후 머무는 시간
  }
  const st = goTo(state, r, ctx, buildingGoal(state, target.id));
  if (st === 'arrived') r.workTimer -= 1;
  else if (st === 'stuck') r.targetId = null;
}

function militiaTick(state: GameState, r: Resident, ctx: Ctx): void {
  r.task = '조련 중';
  const garrison = state.buildings.find(b => b.type === 'garrison' && b.built);
  if (garrison) goTo(state, r, ctx, buildingGoal(state, garrison.id));
  else loiterNearCenter(state, r, ctx, '조련 중');
}


function battleAgentTick(state: GameState, r: Resident, ctx: Ctx): void {
  const battle = state.battle;
  if (!battle) return;
  if (battle.phase === 'muster') {
    r.task = '출전 중';
    const st = goTo(state, r, ctx, tile =>
      Math.abs(tile.x - battle.frontX) + Math.abs(tile.y - battle.frontY) <= 2);
    if (st === 'stuck') {
      r.path = [];
      r.task = '전선 대기';
    }
    return;
  }
  r.path = [];
  r.phase = 'working';
  r.task = '전투 중';
}

function idleTick(state: GameState, r: Resident, ctx: Ctx): void {
  loiterNearCenter(state, r, ctx, '대기');
}

function stationedIndoorWorkerTick(
  state: GameState,
  resident: Resident,
  ctx: Ctx,
  building: Building,
  task: string,
): void {
  const status = goTo(state, resident, ctx, buildingGoal(state, building.id));
  if (status === 'arrived') {
    resident.phase = 'working';
    resident.task = task;
  } else {
    resident.phase = status === 'stuck' ? 'rest' : 'toWork';
    resident.task = status === 'stuck' ? '길이 막힘' : `${BUILDING_DEFS[building.type].name} 이동 중`;
  }
}

// 훈장·무당·승려 — 제 일터에 상주한다 (효과는 배정 여부로 판정된다)
function teacherTick(state: GameState, r: Resident, ctx: Ctx): void {
  const school = assignedWorkplace(state, r, ctx, 'school', '서당 배정 없음');
  if (!school) return;
  stationedIndoorWorkerTick(state, r, ctx, school, '글 가르치는 중');
}

function shamanTick(state: GameState, r: Resident, ctx: Ctx): void {
  const shrine = assignedWorkplace(state, r, ctx, 'shrine', '당집 배정 없음');
  if (!shrine) return;
  stationedIndoorWorkerTick(state, r, ctx, shrine, '치성 드리는 중');
}

function monkTick(state: GameState, r: Resident, ctx: Ctx): void {
  const hermitage = assignedWorkplace(state, r, ctx, 'hermitage', '암자 배정 없음');
  if (!hermitage) return;
  stationedIndoorWorkerTick(state, r, ctx, hermitage, '독경 중');
}

// 장의사 — 시신을 수습해 묘지에 안장한다. 시신이 없으면 묘지를 돌본다.
function undertakerTick(state: GameState, r: Resident, ctx: Ctx): void {
  const cemetery = assignedWorkplace(state, r, ctx, 'cemetery', '묘지 배정 없음');
  if (!cemetery) return;
  const f = CONFIG.funeral;

  // 운구 중 — 묘지로 모신다
  if (r.corpseCarryId != null) {
    const corpse = corpsesOf(state).find(candidate => candidate.id === r.corpseCarryId);
    if (!corpse) { r.corpseCarryId = null; return; }
    const st = goTo(state, r, ctx, buildingGoal(state, cemetery.id));
    if (st === 'stuck') { r.task = '길이 막힘'; return; }
    if (st !== 'arrived') { r.task = '상여 운구'; return; }
    if ((cemetery.graves ?? 0) >= cemeteryPlotCapacity(cemetery)) {
      r.task = '묘 자리 부족';
      corpse.carried = false;
      corpse.x = r.x;
      corpse.y = r.y;
      r.corpseCarryId = null;
      return;
    }
    buryCorpse(state, corpse.id, cemetery);
    r.corpseCarryId = null;
    return;
  }

  const corpse = nextCorpseToCollect(state);
  if (!corpse) {
    loiterNearBuilding(state, r, ctx, cemetery, 2, '묘지 돌봄');
    return;
  }
  if ((cemetery.graves ?? 0) >= cemeteryPlotCapacity(cemetery)) {
    loiterNearBuilding(state, r, ctx, cemetery, 2, '묘 자리 부족');
    return;
  }
  const st = goTo(state, r, ctx, t => Math.abs(t.x - corpse.x) + Math.abs(t.y - corpse.y) <= 1);
  if (st === 'stuck') {
    corpse.skipUntilDay = state.day + f.corpseRetryDays;
    r.task = '시신에 접근 불가';
    return;
  }
  if (st !== 'arrived') { r.task = '시신 수습하러 이동'; return; }
  corpse.carried = true;
  r.corpseCarryId = corpse.id;
  r.task = '상여 운구';
}


export function leisureDestinations(state: GameState): Building[] {
  const built = state.buildings.filter(building => building.built);
  return LEISURE_DESTINATION_TIERS.flatMap(types =>
    built
      .filter(building => types.includes(building.type))
      .sort((a, b) => a.id - b.id),
  );
}

function isLeisureEligible(state: GameState, resident: Resident): boolean {
  return resident.alive &&
    resident.stage !== 'infant' &&
    !resident.sick &&
    state.day >= (resident.quarantinedUntil ?? 0) &&
    resident.health >= 20 &&
    state.day >= (resident.birthRecoveryUntil ?? 0);
}

function leisureOrderKey(residentId: number, day: number): number {
  let value = (residentId ^ Math.imul(day + 1, 0x9e3779b1)) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x85ebca6b) >>> 0;
  value = Math.imul(value ^ (value >>> 13), 0xc2b2ae35) >>> 0;
  return (value ^ (value >>> 16)) >>> 0;
}

export function eveningDepartureDelay(residentId: number, day: number): 1 | 2 {
  return (1 + (leisureOrderKey(residentId, day) & 1)) as 1 | 2;
}

export function morningDepartureSubTick(
  distanceTiles: number,
  residentId: number,
  day: number,
  tilesPerTick: number = CONFIG.agents.moveSpeed,
): number {
  const travelTicks = Math.max(1, Math.ceil(Math.max(0, distanceTiles) / Math.max(0.1, tilesPerTick)));
  const orderKey = leisureOrderKey(residentId, day);
  const idealDeparture = DAY_BANDS.work.start - travelTicks;
  // 새벽 전체를 써도 제시간에 못 가는 원거리 주민은 첫 3틱에 나눠 출발한다.
  if (idealDeparture <= DAY_BANDS.dawn.start) {
    return DAY_BANDS.dawn.start + (orderKey % 3);
  }
  const tieBreak = orderKey & 1;
  return Math.max(
    DAY_BANDS.dawn.start,
    Math.min(DAY_BANDS.dawn.end, idealDeparture - tieBreak),
  );
}

export function morningWakeSubTick(
  departureSubTick: number | null,
  residentId: number,
  day: number,
): number {
  const orderKey = leisureOrderKey(residentId, day);
  if (departureSubTick == null) {
    return DAY_BANDS.dawn.start + 1 + (orderKey % Math.max(1, DAY_BANDS.dawn.end - 2));
  }
  // 이른 통근자는 나타나는 순간 바로 출발해 첫 3틱의 실루엣도 분산한다.
  if (departureSubTick <= DAY_BANDS.dawn.start + 2) return departureSubTick;
  const preparationTicks = 1 + ((orderKey >>> 2) & 1);
  return Math.max(DAY_BANDS.dawn.start, departureSubTick - preparationTicks);
}

export function leisureAssignments(
  state: GameState,
  residents: readonly Resident[] = state.residents,
): Map<number, number> {
  const destinations = leisureDestinations(state);
  if (destinations.length === 0) return new Map();

  const orderedResidents = residents
    .filter(resident => isLeisureEligible(state, resident))
    .sort((a, b) => {
      const keyDelta = leisureOrderKey(a.id, state.day) - leisureOrderKey(b.id, state.day);
      return keyDelta || a.id - b.id;
    });
  const assignments = new Map<number, number>();
  for (let index = 0; index < orderedResidents.length; index++) {
    const destination = destinations[Math.floor(index / LEISURE_CLUSTER_CAPACITY)];
    if (!destination) break;
    assignments.set(orderedResidents[index].id, destination.id);
  }
  return assignments;
}

function resumeCriticalActivity(r: Resident): void {
  if (r.phase !== 'toHome' && r.phase !== 'sleeping' &&
      r.phase !== 'toLeisure' && r.phase !== 'leisure') return;
  r.phase = 'rest';
  r.path = [];
  r.targetId = null;
}

function lodgingSupplyInTransit(state: GameState, hutId: number): { food: number; fuelHeat: number } {
  let food = 0;
  let fuelHeat = 0;
  for (const resident of state.residents) {
    if (!resident.alive || resident.lodgingSupplyHutId !== hutId) continue;
    for (const resource of FOOD_RESOURCES) food += resident.carrying[resource] ?? 0;
    for (const resource of FUEL_RESOURCES) {
      fuelHeat += (resident.carrying[resource] ?? 0) * (RESOURCE_DEFS[resource].fuelValue ?? 1);
    }
  }
  return { food, fuelHeat };
}

function takeLodgingFoodSupply(state: GameState, resident: Resident, requested: number): number {
  let remaining = Math.max(0, requested);
  let taken = 0;
  for (const resource of FOOD_RESOURCES) {
    if (remaining <= 0.000001) break;
    const amount = Math.min(Math.max(0, state.resources[resource] ?? 0), remaining);
    if (amount <= 0) continue;
    state.resources[resource] -= amount;
    addCarry(resident, resource, amount);
    remaining -= amount;
    taken += amount;
  }
  return taken;
}

function takeLodgingFuelSupply(state: GameState, resident: Resident, requestedHeat: number): number {
  let remaining = Math.max(0, requestedHeat);
  let provided = 0;
  for (const resource of FUEL_RESOURCES) {
    if (remaining <= 0.000001) break;
    const value = RESOURCE_DEFS[resource].fuelValue ?? 1;
    const units = Math.min(Math.max(0, state.resources[resource] ?? 0), remaining / value);
    if (units <= 0) continue;
    state.resources[resource] -= units;
    addCarry(resident, resource, units);
    remaining -= units * value;
    provided += units * value;
  }
  return provided;
}

function residentAtVillageSupplyAnchor(state: GameState, resident: Resident, centerId: number): boolean {
  const home = residentHome(state, resident);
  const anchor = home ?? state.buildings.find(building => building.id === centerId && building.built) ?? null;
  return !!anchor && buildingGoal(state, anchor.id)(state.map[resident.y][resident.x]);
}

function prepareLodgingSupply(state: GameState, resident: Resident, centerId: number): boolean {
  const hut = lodgingHutForResident(state, resident);
  if (!hut || resident.lodgingHomeRestDay === state.day || resident.lodgingSupplyHutId != null ||
      carryTotal(resident) > 0 || !residentAtVillageSupplyAnchor(state, resident, centerId)) return false;
  const workers = lodgingWorkers(state, hut).filter(worker =>
    !worker.sick && state.day >= (worker.quarantinedUntil ?? 0) && worker.health >= 20);
  const target = lodgingDailyNeeds(state, workers);
  const personal = lodgingDailyNeeds(state, [resident]);
  const stock = lodgingSupplySummary(state, hut);
  const inbound = lodgingSupplyInTransit(state, hut.id);
  const days = CONFIG.gatheringZones.lodgingSupplyDays;
  const foodMissing = Math.max(0, target.rationedFood * days - stock.food - inbound.food);
  const fuelMissing = Math.max(0, target.rationedFuelHeat * days - stock.fuelHeat - inbound.fuelHeat);
  const foodTaken = takeLodgingFoodSupply(state, resident, Math.min(foodMissing, personal.rationedFood * days));
  const heatTaken = takeLodgingFuelSupply(state, resident, Math.min(fuelMissing, personal.rationedFuelHeat * days));
  if (foodTaken <= 0.000001 && heatTaken <= 0.000001) return false;
  resident.lodgingSupplyHutId = hut.id;
  resident.path = [];
  resident.targetId = hut.id;
  return true;
}

function deliverLodgingSupply(state: GameState, resident: Resident, ctx: Ctx): boolean {
  if (resident.lodgingSupplyHutId == null) return false;
  const hut = state.buildings.find(building =>
    building.id === resident.lodgingSupplyHutId && building.type === 'lodgingHut' && building.built);
  if (!hut) {
    resident.lodgingSupplyHutId = null;
    if (carryTotal(resident) > 0) depositResidentToSettlement(state, resident);
    return false;
  }
  resident.phase = 'toDeposit';
  resident.targetId = hut.id;
  resident.task = '숙식 움막 보급 운반 중';
  const result = goTo(state, resident, ctx, buildingGoal(state, hut.id));
  if (isSettledAtGoal(resident, result)) {
    depositResidentToBuilding(hut, resident);
    resident.lodgingSupplyHutId = null;
    resident.phase = 'rest';
    resident.path = [];
    resident.targetId = null;
    resident.task = '숙식 움막 보급 완료';
  } else if (result === 'stuck') {
    depositResidentToSettlement(state, resident);
    resident.lodgingSupplyHutId = null;
    resident.phase = 'rest';
    resident.path = [];
    resident.targetId = null;
    resident.task = '움막 보급길을 찾지 못함';
  }
  return true;
}

interface DawnCommutePlan {
  phase: 'toWork' | 'toDeposit';
  targetId: number | null;
  goal: DescribedGoal;
  movingTask: string;
  arrivedTask: string;
  staggerByDistance: boolean;
}

function dawnCommutePlan(state: GameState, r: Resident): DawnCommutePlan | null {
  if (r.manualOrder) {
    const order = r.manualOrder;
    const buildingId = order.kind === 'work' ? order.buildingId : undefined;
    return {
      phase: 'toWork',
      targetId: buildingId ?? null,
      goal: buildingId != null
        ? buildingGoal(state, buildingId) as DescribedGoal
        : exactTileGoal(order.x, order.y) as DescribedGoal,
      movingTask: '명령 작업지로 이동',
      arrivedTask: '명령 작업지에서 채비',
      staggerByDistance: false,
    };
  }

  if (r.haulTask) {
    const carrying = carryTotal(r) > 0;
    const destinationId = carrying && r.haulTask.kind === 'supply'
      ? r.haulTask.targetBuildingId
      : carrying
        ? null
        : r.haulTask.sourceBuildingId;
    return {
      phase: carrying ? 'toDeposit' : 'toWork',
      targetId: destinationId ?? null,
      goal: (destinationId == null
        ? depositGoal(state, [])
        : buildingGoal(state, destinationId)) as DescribedGoal,
      movingTask: carrying ? '운반 재개 준비' : '수거 재개 준비',
      arrivedTask: carrying ? '운반 거점에서 채비' : '수거지에서 채비',
      staggerByDistance: false,
    };
  }

  if (carryTotal(r) > 0 && !GATHERING_JOBS.includes(r.job)) {
    const miningDeposit = r.job === 'miner' && r.miningDepositBuildingId != null
      ? state.buildings.find(building =>
        building.id === r.miningDepositBuildingId && building.built && building.type === 'mine')
      : null;
    return {
      phase: 'toDeposit',
      targetId: miningDeposit?.id ?? null,
      goal: (miningDeposit
        ? buildingGoal(state, miningDeposit.id)
        : depositGoal(state, [])) as DescribedGoal,
      movingTask: '짐 정리 준비',
      arrivedTask: '하역 거점에서 채비',
      staggerByDistance: false,
    };
  }

  if (r.job === 'builder' || r.job === 'farmer') {
    const target = r.job === 'builder'
      ? builderTarget(state, r)
      : farmerConstructionTarget(state, r);
    if (target) {
      return {
        phase: 'toWork',
        targetId: target.id,
        goal: buildingGoal(state, target.id) as DescribedGoal,
        movingTask: '공사장으로 이동',
        arrivedTask: '공사장에서 채비',
        staggerByDistance: true,
      };
    }
  }

  const workplace = assignedBuildingForResident(state, r);
  if (!workplace) return null;
  let workplaceGoal = buildingGoal(state, workplace.id) as DescribedGoal;
  if (r.job === 'farmer' && (workplace.type === 'field' || workplace.type === 'paddy')) {
    const workerIds = assignedWorkers(state, workplace).map(worker => worker.id);
    const workBandStartTick = state.day * SUBTICKS + DAY_BANDS.work.start;
    const tile = farmWorkTileForTick(workplace, workerIds, r.id, workBandStartTick);
    workplaceGoal = exactTileGoal(tile.x, tile.y) as DescribedGoal;
  }
  return {
    phase: 'toWork',
    targetId: workplace.id,
    goal: workplaceGoal,
    movingTask: '일터로 이동',
    arrivedTask: '일터에서 채비',
    staggerByDistance: true,
  };
}

function minimumGoalDistance(
  origins: readonly { x: number; y: number }[],
  destinations: readonly { x: number; y: number }[],
  fallback: Resident,
): number {
  const from = origins.length > 0 ? origins : [fallback];
  const to = destinations.length > 0 ? destinations : [fallback];
  let distance = Infinity;
  for (const origin of from) {
    for (const destination of to) {
      distance = Math.min(
        distance,
        Math.max(Math.abs(origin.x - destination.x), Math.abs(origin.y - destination.y)),
      );
    }
  }
  return Number.isFinite(distance) ? distance : 0;
}

function morningCommuteDistance(state: GameState, r: Resident, ctx: Ctx, goal: DescribedGoal): number {
  const home = residentHome(state, r);
  const lodging = r.phase === 'sleeping' ? lodgingHutForResident(state, r) : null;
  const origin = lodging && r.targetId === lodging.id
    ? buildingGoal(state, lodging.id) as DescribedGoal
    : home
      ? buildingGoal(state, home.id) as DescribedGoal
    : ctx.centerId >= 0
      ? buildingGoal(state, ctx.centerId) as DescribedGoal
      : null;
  return minimumGoalDistance(origin?.goalPoints ?? [], goal.goalPoints ?? [], r);
}

function morningMoveTilesPerTick(state: GameState, r: Resident, ctx: Ctx): number {
  let speed: number = CONFIG.agents.moveSpeed;
  if (ctx.season === 'winter') speed = CONFIG.agents.moveSpeedWinter;
  if (state.weather === 'blizzard' || state.weather === 'heavySnow') {
    speed = Math.min(speed, CONFIG.agents.moveSpeedSnow);
  }
  return Math.max(1, Math.floor(
    speed * haulingMoveSpeedMultiplier(r) * residentFootwearMoveMultiplier(r),
  ));
}

function morningPreparationAgentTick(state: GameState, r: Resident, ctx: Ctx): void {
  const home = residentHome(state, r);
  const lodging = r.phase === 'sleeping' ? lodgingHutForResident(state, r) : null;
  const center = ctx.centerId >= 0
    ? state.buildings.find(building => building.id === ctx.centerId && building.built) ?? null
    : null;
  const anchor = lodging && r.targetId === lodging.id ? lodging : home ?? center;
  const anchorId = anchor?.id ?? null;
  if (r.phase !== 'rest' || r.targetId !== anchorId) {
    r.phase = 'rest';
    r.path = [];
    r.targetId = anchorId;
  }
  if (lodging && anchorId === lodging.id) {
    loiterNearBuilding(state, r, ctx, lodging, 2, '움막에서 아침 채비');
  } else if (home) {
    loiterNearBuilding(state, r, ctx, home, 2, '아침 채비');
  } else if (center) {
    loiterNearBuilding(state, r, ctx, center, 2, '아침 채비');
  } else {
    r.task = '아침 채비';
    r.path = [];
    tryLoiterStep(state, r, ctx, r.x, r.y, 2);
  }
}

function waitForMorningWake(state: GameState, r: Resident, wakeSubTick: number): boolean {
  if (r.phase !== 'sleeping' || state.subTick >= wakeSubTick) return false;
  r.path = [];
  r.task = lodgingHutForResident(state, r)?.id === r.targetId ? '숙식 움막에서 잠자는 중' : '잠자는 중';
  return true;
}

function dawnAgentTick(state: GameState, r: Resident, ctx: Ctx): void {
  r.task = '아침 채비';
  equipMissingWearables(state, r);
  const unavailable = r.stage != null || r.sick || state.day < (r.quarantinedUntil ?? 0) ||
    r.health < 20 || state.day < (r.birthRecoveryUntil ?? 0);
  if (unavailable) {
    if (waitForMorningWake(state, r, morningWakeSubTick(null, r.id, state.day))) return;
    r.phase = 'rest';
    r.path = [];
    r.targetId = null;
    return;
  }

  if (r.lodgingSupplyHutId != null) {
    deliverLodgingSupply(state, r, ctx);
    return;
  }
  const lodging = lodgingHutForResident(state, r);
  if (lodging && !lodgingCanHostTonight(state, lodging)) {
    if (waitForMorningWake(state, r, morningWakeSubTick(null, r.id, state.day))) return;
    if (prepareLodgingSupply(state, r, ctx.centerId)) {
      deliverLodgingSupply(state, r, ctx);
      return;
    }
    if (residentAtVillageSupplyAnchor(state, r, ctx.centerId)) {
      r.lodgingHomeRestDay = state.day;
      r.task = '숙식 움막 보급 부족';
      r.phase = 'rest';
      r.path = [];
      r.targetId = residentHome(state, r)?.id ?? ctx.centerId;
      return;
    }
  }

  const plan = dawnCommutePlan(state, r);
  if (!plan) {
    if (waitForMorningWake(state, r, morningWakeSubTick(null, r.id, state.day))) return;
    morningPreparationAgentTick(state, r, ctx);
    return;
  }
  let departureSubTick = DAY_BANDS.dawn.start + (leisureOrderKey(r.id, state.day) & 1);
  if (plan.staggerByDistance) {
    const distance = morningCommuteDistance(state, r, ctx, plan.goal);
    departureSubTick = morningDepartureSubTick(
      distance,
      r.id,
      state.day,
      morningMoveTilesPerTick(state, r, ctx),
    );
  }
  if (waitForMorningWake(
    state,
    r,
    morningWakeSubTick(departureSubTick, r.id, state.day),
  )) return;
  if (state.subTick < departureSubTick) {
    morningPreparationAgentTick(state, r, ctx);
    return;
  }

  const startCommute = (
    phase: 'toWork' | 'toDeposit',
    targetId: number | null,
    goal: (tile: Tile) => boolean,
    movingTask: string,
    arrivedTask: string,
  ): GoResult => {
    if (r.phase !== phase || r.targetId !== targetId) {
      r.phase = phase;
      r.path = [];
      r.targetId = targetId;
    }
    const result = goTo(state, r, ctx, goal);
    r.task = result === 'arrived' ? arrivedTask : movingTask;
    return result;
  };

  const result = startCommute(
    plan.phase,
    plan.targetId,
    plan.goal,
    plan.movingTask,
    plan.arrivedTask,
  );
  if (result === 'stuck') {
    r.phase = 'rest';
    r.targetId = null;
    r.task = '아침 채비';
  }
}

type HomeEntryReason = 'sleep' | 'snowShelter';

function returnHomeAgentTick(
  state: GameState,
  r: Resident,
  ctx: Ctx,
  reason: HomeEntryReason = 'sleep',
): void {
  const home = residentHome(state, r);
  const center = state.buildings.find(building => building.id === ctx.centerId && building.built) ?? null;
  const lodging = r.lodgingHomeRestDay === state.day || r.sick || state.day < (r.quarantinedUntil ?? 0) || r.health < 20
    ? null
    : lodgingHutForResident(state, r);
  const lodgingReady = lodging ? lodgingCanHostTonight(state, lodging) : false;
  const destination = lodgingReady ? lodging : home ?? center;
  const sheltering = reason === 'snowShelter';
  const sleepingTask = sheltering
    ? lodgingReady ? '숙식 움막에서 폭설 대피' : home ? '집 안에서 폭설 대피' : '처마 밑에서 폭설 대피'
    : lodgingReady ? '숙식 움막에서 잠듦' : home ? '잠자리에 듦' : '처마 밑에서 잠듦';
  const movingTask = sheltering
    ? lodgingReady ? '폭설을 피해 숙식 움막으로 이동 중' : home ? '폭설을 피해 귀가 중' : '폭설을 피해 처마로 이동 중'
    : lodgingReady ? '숙식 움막으로 돌아가는 중' : home ? '집으로 돌아가는 중' : '처마를 찾아가는 중';

  if (!destination) {
    r.phase = 'sleeping';
    r.path = [];
    r.targetId = null;
    r.task = sleepingTask;
    return;
  }

  if (r.phase === 'sleeping' && r.targetId === destination.id) {
    r.path = [];
    r.task = sleepingTask;
    return;
  }

  if (r.phase !== 'toHome' || r.targetId !== destination.id) {
    r.phase = 'toHome';
    r.path = [];
    r.targetId = destination.id;
  }
  r.task = movingTask;
  const result = goTo(state, r, ctx, buildingGoal(state, destination.id));
  if (result === 'arrived') {
    r.phase = 'sleeping';
    r.path = [];
    const craft = reason === 'sleep' && home && !lodgingReady && !edictCorveeEligible(state, r)
      ? performHouseholdCraftAtHome(state, r)
      : null;
    r.task = craft?.task ?? sleepingTask;
  } else if (result === 'stuck') {
    r.path = [];
    r.task = '귀갓길을 찾지 못함';
  }
}

function eveningLeisureAgentTick(
  state: GameState,
  r: Resident,
  ctx: Ctx,
  destinationId: number | undefined,
): void {
  if (destinationId == null) {
    returnHomeAgentTick(state, r, ctx);
    return;
  }

  if (r.phase === 'leisure' && r.targetId === destinationId) {
    r.path = [];
    r.task = '마실 중';
    return;
  }

  if (r.phase !== 'toLeisure' || r.targetId !== destinationId) {
    r.phase = 'toLeisure';
    r.path = [];
    r.targetId = destinationId;
  }
  r.task = '마실 나감';
  const result = goTo(state, r, ctx, buildingGoal(state, destinationId));
  if (result === 'arrived') {
    r.phase = 'leisure';
    r.path = [];
    r.task = '마실 중';
  } else if (result === 'stuck') {
    returnHomeAgentTick(state, r, ctx);
  }
}

function prepareWorkBandAgent(r: Resident): void {
  if (r.phase === 'rest' && r.task === '아침 채비') {
    r.path = [];
    r.targetId = null;
    return;
  }
  if (r.phase !== 'toHome' && r.phase !== 'sleeping' &&
      r.phase !== 'toLeisure' && r.phase !== 'leisure') return;
  r.phase = 'rest';
  r.path = [];
  r.targetId = null;
  r.task = '아침 채비';
}

function waitForEveningDeparture(r: Resident): void {
  r.phase = 'rest';
  r.path = [];
  r.targetId = null;
  r.task = '일 마무리';
}

function finishCurrentBoundedWork(state: GameState, r: Resident, ctx: Ctx): boolean {
  if (!GATHERING_JOBS.includes(r.job)) return false;
  const finishingWork = r.phase === 'working' && r.workTimer > 0;
  if (!finishingWork) return false;
  switch (r.job) {
    case 'woodcutter': woodcutterTick(state, r, ctx); break;
    case 'hunter': hunterTick(state, r, ctx); break;
    case 'herbalist': herbalistTick(state, r, ctx); break;
    case 'miner': minerTick(state, r, ctx); break;
    case 'fisher': fisherTick(state, r, ctx); break;
    default: return false;
  }
  return true;
}

const END_OF_DAY_DEPOSIT_TASK = '짐을 부리러 가는 중';

function endOfDayDepositExtra(r: Resident): BuildingTypeId[] {
  switch (r.job) {
    case 'woodcutter': return ['lumberCamp'];
    case 'hunter': return ['huntLodge'];
    case 'herbalist': return ['herbHut'];
    case 'fisher': return ['ferry', 'tidalFishery', 'fishingPort'];
    default: return [];
  }
}

function endOfDayDirectDeposit(state: GameState, r: Resident): Building | null {
  if (r.job === 'hauler' && r.haulTask?.kind === 'supply' && r.haulTask.targetBuildingId != null) {
    return state.buildings.find(building =>
      building.id === r.haulTask?.targetBuildingId && building.built) ?? null;
  }
  if (r.job === 'miner' && r.miningDepositBuildingId != null) {
    return state.buildings.find(building =>
      building.id === r.miningDepositBuildingId && building.built && building.type === 'mine') ?? null;
  }
  return null;
}

function depositEndOfDayLoad(state: GameState, r: Resident, ctx: Ctx): boolean {
  if (carryTotal(r) <= 0) return false;
  const directTarget = endOfDayDirectDeposit(state, r);
  const extra = endOfDayDepositExtra(r);
  const targetId = directTarget?.id ?? null;
  if (r.phase !== 'toDeposit' || r.task !== END_OF_DAY_DEPOSIT_TASK || r.targetId !== targetId) {
    r.phase = 'toDeposit';
    r.path = [];
    r.targetId = targetId;
  }
  r.task = END_OF_DAY_DEPOSIT_TASK;
  const result = goTo(
    state,
    r,
    ctx,
    directTarget ? buildingGoal(state, directTarget.id) : depositGoal(state, extra),
  );
  if (isSettledAtGoal(r, result)) {
    if (directTarget) depositResidentToBuilding(directTarget, r);
    else unloadAtDepositGoal(state, r, extra);
    if (r.job === 'hauler') clearHaulTask(r);
    if (r.job === 'miner') r.miningDepositBuildingId = null;
    r.phase = 'rest';
    r.path = [];
    r.targetId = null;
    r.task = '짐을 부리고 일 마침';
  } else if (result === 'stuck') {
    depositResidentToSettlement(state, r);
    if (r.job === 'hauler') clearHaulTask(r);
    if (r.job === 'miner') r.miningDepositBuildingId = null;
    r.phase = 'rest';
    r.path = [];
    r.targetId = null;
    r.task = '짐을 맡기고 일 마침';
  }
  return true;
}

function closeOutWorkday(state: GameState, r: Resident, ctx: Ctx): boolean {
  if (finishCurrentBoundedWork(state, r, ctx)) return true;
  if (depositEndOfDayLoad(state, r, ctx)) return true;
  if (r.job === 'hauler' && r.haulTask != null) clearHaulTask(r);
  r.workTimer = 0;
  if (r.phase !== 'toLeisure' && r.phase !== 'leisure' &&
      r.phase !== 'toHome' && r.phase !== 'sleeping') {
    waitForEveningDeparture(r);
  }
  return false;
}

function corveeEveningAgentTick(state: GameState, resident: Resident, ctx: Ctx): boolean {
  if (!edictCorveeEligible(state, resident)) return false;
  const elapsed = state.subTick - DAY_BANDS.evening.start;
  if (elapsed < 0 || elapsed >= edictCorveeEveningSubticks(state)) return false;
  if (resident.job === 'builder') builderTick(state, resident, ctx);
  else haulerTick(state, resident, ctx);
  const onDuty = resident.phase === 'working' || resident.phase === 'toWork' ||
    resident.phase === 'toDeposit' || resident.haulTask != null;
  if (!onDuty) return false;
  applyEdictCorveeStrain(state, resident);
  return true;
}

function siegeResidentDisposition(state: GameState, resident: Resident): 'evacuate' | 'work' | 'suspend' | 'stranded' {
  const siege = state.siegeState;
  if (!siege || siege.phase === 'sortie' || siege.phase === 'withdrawal') return 'work';
  const now = state.day * DAY_CYCLE_SUBTICKS + state.subTick;
  if (siege.phase === 'evacuation' && now < siege.evacuationDeadlineTick) return 'evacuate';
  const interior = new Set(siege.protectedInterior);
  if (siege.strandedResidentIds.includes(resident.id) || !interior.has(`${resident.x},${resident.y}`)) return 'stranded';
  if (siege.phase === 'wallCombat' && siege.defenderIds.includes(resident.id)) return 'suspend';
  if (resident.lodgingSupplyHutId != null || resident.job === 'hauler') return 'suspend';
  const assigned = resident.assignedBuildingId == null ? null :
    state.buildings.find(building => building.id === resident.assignedBuildingId && building.built) ?? null;
  if (assigned && OUTDOOR_JOBS.includes(resident.job)) {
    const footprint = footprintTilesOf(state, assigned) ?? [{ x: assigned.x, y: assigned.y }];
    if (!footprint.every(tile => interior.has(`${tile.x},${tile.y}`))) return 'suspend';
  }
  return 'work';
}

// ─────────────────────────── 틱 진입점 ───────────────────────────

export function agentsTick(state: GameState): void {
  normalizeWearableResourceStocks(state);
  const dayBand = dayBandOf(state.subTick);
  const rngSubTick = dayBand === 'work' ? state.subTick - DAY_BANDS.work.start : state.subTick;
  const rng = makeRng(state.seed + state.day * 7919 + rngSubTick * 101 + 7);
  const season = getSeason(state.day);
  const living = state.residents.filter(r => r.alive);
  const predatorScouts = activePredatorScoutIds(state);
  const warDispatchIds = new Set(state.warDispatch?.memberIds ?? []);
  const enrolledStudents = enrolledStudentIds(state); // 서당 정원 안의 취학 아동
  if (living.length === 0) return;
  const leisureResidents = living.filter(resident =>
    !predatorScouts.has(resident.id) &&
    !warDispatchIds.has(resident.id) &&
    !state.expedition?.memberIds.includes(resident.id) &&
    !state.battle?.defenderIds.includes(resident.id) &&
    !state.raidHold);
  const eveningAssignments = dayBand === 'evening'
    ? leisureAssignments(state, leisureResidents)
    : new Map<number, number>();

  const producers = living.filter(r =>
    !warDispatchIds.has(r.id) &&
    PRODUCING_JOBS.includes(r.job) && !r.sick && state.day >= (r.quarantinedUntil ?? 0) && r.health >= 20).length;
  const t = state.resources.tools;
  const tMod = producers <= 0 || t >= producers ? 1 : 0.6 + 0.4 * (t / producers);
  const mAvg = living.reduce((s, r) => s + r.morale, 0) / living.length;
  const center = state.buildings.find(b => b.type === 'center');
  const laborOutputMod = settlementMoraleProductionMultiplier(mAvg) * officeEfficiencyMultiplier(state) *
    rankProductionEfficiency(state.rank);
  const ctx: Ctx = {
    season,
    outdoor: outdoorMult(state.weather),
    tMod,
    mMod: laborOutputMod,
    outputMod: laborOutputMod * CONFIG.production.resourceOutputMultiplier,
    rng,
    centerId: center ? center.id : -1,
    huntable: collectHuntableTiles(state.map, state.habitats, CONFIG.agents.hunting),
    farmerWorkIdsByPlot: new Map(),
    // 개간 배정은 서브틱마다 다시 계산한다 — 저장 상태가 아니라 이번 틱의 인력 배치다.
    clearingCrew: assignClearingCrews(
      state,
      living.filter(resident => resident.job === 'woodcutter' &&
        !warDispatchIds.has(resident.id) &&
        !resident.sick && state.day >= (resident.quarantinedUntil ?? 0) &&
        !resident.manualOrder),
    ),
    clearingReserved: new Set(
      clearingSites(state).flatMap(site => site.tiles.map(tile => `${tile.x},${tile.y}`)),
    ),
  };
  assignFireResponses(state, living);

  for (const r of living) {
    const activeBoat = r.fishingBoatId == null
      ? undefined
      : state.fishingBoats.find(boat => boat.id === r.fishingBoatId && boat.fisherIds.includes(r.id));
    if (activeBoat) {
      r.px = r.x;
      r.py = r.y;
      const boardedCrew = fishingBoatCrew(state, activeBoat)
        .filter(resident => resident.fishingBoatId === activeBoat.id)
        .sort((left, right) => left.id - right.id);
      if (boardedCrew[0]?.id !== r.id) {
        r.x = activeBoat.x;
        r.y = activeBoat.y;
        r.path = [];
        r.phase = activeBoat.status === 'fishing' ? 'working' : 'toWork';
        r.task = activeBoat.status === 'boarded' ? '동승 어부를 기다리는 중' : '어선 조업 중';
        continue;
      }
      if (activeBoat.status === 'boarded') {
        const remainingWorkSubticks = DAY_BANDS.work.end - state.subTick + 1;
        const tripError = dayBand === 'work'
          ? startFishingBoatTrip(state, activeBoat.id, remainingWorkSubticks)
          : '오늘 조업 시간이 끝났습니다.';
        if (tripError == null) {
          r.task = `${state.map[activeBoat.y]?.[activeBoat.x]?.terrain === 'sea' ? '바다' : '호수'} 중·심수 어장으로 출항`;
        } else if (tripError.includes('모두 승선')) {
          r.task = tripError;
        } else {
          disembarkFishingBoat(state, activeBoat.id);
        }
      } else {
        advanceFishingBoatTrip(state, activeBoat.id, dayBand !== 'work');
      }
      continue;
    }
    ensureResidentOnPassableTile(state, r);
    // 보간용 직전 위치 기록
    r.px = r.x;
    r.py = r.y;
    if (r.trappedInMineId != null) {
      r.task = '갱도에 매몰됨';
      r.path = [];
      r.phase = 'rest';
      clearHaulTask(r);
      continue;
    }
    if (predatorScouts.has(r.id)) {
      resumeCriticalActivity(r);
      r.task = '맹수 흔적 추적 중';
      clearHaulTask(r);
      r.path = [];
      r.manualOrder = null;
      if (carryTotal(r) > 0) depositAll(state, r);
      continue;
    }
    // 원정 참여자는 expeditionTick이 집결·행군·귀환을 전담한다.
    if (state.expedition?.memberIds.includes(r.id)) {
      resumeCriticalActivity(r);
      r.task = state.expedition.phase === 'muster'
        ? '토벌 집결 중'
        : state.expedition.phase === 'return'
          ? '토벌 귀환 중'
          : state.expedition.phase === 'engage'
            ? '토벌 교전 대기'
            : '토벌 출정';
      clearHaulTask(r);
      continue;
    }
    if (state.raidHold) {
      resumeCriticalActivity(r);
      r.task = '완전 수성 중';
      clearHaulTask(r);
      if (carryTotal(r) > 0) depositAll(state, r);
      goToCenter(state, r, ctx);
      continue;
    }
    if (r.watchtowerEscapeTowerId != null) {
      resumeCriticalActivity(r);
      clearHaulTask(r);
      r.manualOrder = null;
      r.phase = 'toWork';
      if (r.watchtowerEscapeHasRoute && r.path.length > 0) {
        const next = r.path.shift()!;
        r.x = next.x;
        r.y = next.y;
        r.task = '망루에서 철수 중';
      } else if (r.watchtowerEscapeHasRoute) {
        delete r.watchtowerEscapeTowerId;
        delete r.watchtowerEscapeDeadlineTick;
        delete r.watchtowerEscapeHasRoute;
        r.phase = 'rest';
        r.task = '수비대에 합류';
      } else {
        r.path = [];
        r.phase = 'rest';
        r.task = '망루에 고립됨';
      }
      continue;
    }
    const siegeDisposition = siegeResidentDisposition(state, r);
    if (siegeDisposition === 'evacuate') {
      resumeCriticalActivity(r);
      r.task = '성안으로 피난 중';
      clearHaulTask(r);
      goToCenter(state, r, ctx);
      continue;
    }
    if (siegeDisposition === 'stranded' || siegeDisposition === 'suspend') {
      resumeCriticalActivity(r);
      r.task = siegeDisposition === 'stranded'
        ? '성밖에 고립됨'
        : state.siegeState?.phase === 'wallCombat' && state.siegeState.defenderIds.includes(r.id)
          ? '성벽을 지키는 중'
          : '공성으로 성밖 작업 중지';
      clearHaulTask(r);
      r.path = [];
      r.manualOrder = null;
      continue;
    }
    // 전투에 징집된 주민은 생활 대역보다 전선 행동을 우선한다.
    if (state.battle?.defenderIds.includes(r.id)) {
      resumeCriticalActivity(r);
      battleAgentTick(state, r, ctx);
      continue;
    }
    if (warDispatchIds.has(r.id)) {
      resumeCriticalActivity(r);
      r.task = '부족 전쟁 파견 중';
      clearHaulTask(r);
      r.path = [];
      r.manualOrder = null;
      if (carryTotal(r) > 0) depositAll(state, r);
      continue;
    }
    if (fireResponseAgentTick(state, r, ctx)) continue;
    if (r.lodgingSupplyHutId != null && deliverLodgingSupply(state, r, ctx)) continue;
    if (r.lodgingHomeRestDay === state.day) {
      returnHomeAgentTick(state, r, ctx);
      r.task = r.phase === 'sleeping' ? '집에서 쉬며 움막 보급을 준비함' : '움막 보급을 위해 귀가 중';
      continue;
    }
    const stationedTower = assignedBuildingForResident(state, r);
    if (r.job === 'watchman' && stationedTower?.type === 'watchtower') {
      watchmanTick(state, r, ctx);
      continue;
    }
    // 폭설·눈보라에는 실외 작업자가 일과/여가보다 귀가와 입실을 우선한다.
    const sheltersFromSnow = OUTDOOR_JOBS.includes(r.job) &&
      (state.weather === 'heavySnow' || ctx.outdoor < CONFIG.agents.shelterThreshold);
    if (sheltersFromSnow && dayBand !== 'night') {
      returnHomeAgentTick(state, r, ctx, 'snowShelter');
      continue;
    }
    if (dayBand === 'dawn') {
      dawnAgentTick(state, r, ctx);
      continue;
    }
    if (dayBand === 'work' && state.subTick === DAY_BANDS.work.end && !edictCorveeEligible(state, r)) {
      closeOutWorkday(state, r, ctx);
      continue;
    }
    if (dayBand === 'evening') {
      if (corveeEveningAgentTick(state, r, ctx)) continue;
      if (closeOutWorkday(state, r, ctx)) continue;
      const departureSubTick = DAY_BANDS.evening.start + eveningDepartureDelay(r.id, state.day);
      if (state.subTick < departureSubTick) {
        waitForEveningDeparture(r);
        continue;
      }
      const lodging = lodgingHutForResident(state, r);
      if (lodging && lodgingCanHostTonight(state, lodging)) {
        returnHomeAgentTick(state, r, ctx);
        continue;
      }
      if (edictCurfewActive(state)) {
        returnHomeAgentTick(state, r, ctx);
        continue;
      }
      eveningLeisureAgentTick(state, r, ctx, eveningAssignments.get(r.id));
      continue;
    }
    if (dayBand === 'night') {
      r.workTimer = 0;
      if (depositEndOfDayLoad(state, r, ctx)) continue;
      if (r.job === 'hauler' && r.haulTask != null) clearHaulTask(r);
      returnHomeAgentTick(state, r, ctx);
      continue;
    }
    prepareWorkBandAgent(r);
    // 아기·어린이와 취학 소년. 일 돕기를 고른 소년만 아래 일반 직업 흐름으로 내려간다.
    if (r.stage) {
      if (r.stage === 'infant') {
        clearHaulTask(r);
        r.task = '집에서 자람';
        r.phase = 'rest';
        r.path = [];
        continue;
      }
      if (r.stage === 'youth' && r.youthActivity !== 'school') {
        // 안전 직무 배정과 0.5 효율은 배정 경계/laborEfficiencyMult에서 단 한 번 적용한다.
      } else if (enrolledStudents.has(r.id)) {
        clearHaulTask(r);
        if (carryTotal(r) > 0) depositAll(state, r);
        const school = state.buildings.find(building => building.type === 'school' && building.built);
        if (school) loiterNearBuilding(state, r, ctx, school, 3, '글공부');
        else loiterNearCenter(state, r, ctx, '뛰노는 중');
        continue;
      } else if (r.stage === 'youth') {
        clearHaulTask(r);
        if (carryTotal(r) > 0) depositAll(state, r);
        loiterNearCenter(state, r, ctx, '서당 수업 중단');
        continue;
      } else {
        haulerTick(state, r, ctx);
        if (r.task === '대기') r.task = '심부름거리 찾는 중';
        continue;
      }
    }
    // 산모는 집에서 몸을 추스른다
    if (state.day < (r.birthRecoveryUntil ?? 0)) {
      r.task = '산후 조리';
      clearHaulTask(r);
      if (carryTotal(r) > 0) depositAll(state, r);
      goToCenter(state, r, ctx);
      continue;
    }
    // 병자/격리자/중상자는 마을 중심에서 쉬며 배정은 유지한다
    if (r.sick || state.day < (r.quarantinedUntil ?? 0) || r.health < 20) {
      r.task = state.day < (r.quarantinedUntil ?? 0) ? '격리 중' : '앓아누움';
      clearHaulTask(r);
      if (carryTotal(r) > 0) depositAll(state, r); // 짐은 이웃이 거둬 간다
      goToCenter(state, r, ctx);
      continue;
    }
    const forcedWorkSites = r.manualOrder?.kind === 'work' ? r.manualOrder.unauthorizedSiteIds ?? [] : [];
    if (r.phase === 'working' && !canWorkForeignTerritory(state, r.x, r.y, forcedWorkSites)) {
      r.phase = 'rest';
      r.workTimer = 0;
      r.path = [];
      r.task = '작업 허가 없음';
      goToCenter(state, r, ctx);
      continue;
    }
    if (handleManualOrder(state, r, ctx)) continue;
    const jobPerf = typeof window !== 'undefined' ? window.__renderPerf : undefined;
    const jobStart = jobPerf ? performance.now() : 0;
    switch (r.job) {
      case 'woodcutter': woodcutterTick(state, r, ctx); break;
      case 'woodSplitter': woodSplitterTick(state, r, ctx); break;
      case 'hunter': hunterTick(state, r, ctx); break;
      case 'herbalist': herbalistTick(state, r, ctx); break;
      case 'farmer': farmerTick(state, r, ctx); break;
      case 'miller': millerTick(state, r, ctx); break;
      case 'builder': builderTick(state, r, ctx); break;
      case 'hauler': haulerTick(state, r, ctx); break;
      case 'curer': curerTick(state, r, ctx); break;
      case 'potter': potterTick(state, r, ctx); break;
      case 'saltMaker': saltMakerTick(state, r, ctx); break;
      case 'smith': smithTick(state, r, ctx); break;
      case 'miner': minerTick(state, r, ctx); break;
      case 'fisher': fisherTick(state, r, ctx); break;
      case 'charcoalBurner': charcoalBurnerTick(state, r, ctx); break;
      case 'herder': herderTick(state, r, ctx); break;
      case 'physician': physicianTick(state, r, ctx); break;
      case 'powderMaker': powderMakerTick(state, r, ctx); break;
      case 'tanner': tannerTick(state, r, ctx); break;
      case 'weaver': weaverTick(state, r, ctx); break;
      case 'clerk': clerkTick(state, r, ctx); break;
      case 'undertaker': undertakerTick(state, r, ctx); break;
      case 'teacher': teacherTick(state, r, ctx); break;
      case 'shaman': shamanTick(state, r, ctx); break;
      case 'monk': monkTick(state, r, ctx); break;
      case 'watchman': watchmanTick(state, r, ctx); break;
      case 'militia': militiaTick(state, r, ctx); break;
      default: idleTick(state, r, ctx); break;
    }
    if (jobPerf) {
      const key = `job-${r.job}`;
      const bucket = jobPerf[key] ?? (jobPerf[key] = { total: 0, count: 0 });
      bucket.total += performance.now() - jobStart;
      bucket.count++;
    }
  }
}
