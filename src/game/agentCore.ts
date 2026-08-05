// 주민 에이전트의 공용 실행 계층 — 틱 컨텍스트, 이동·목표 판정, 짐 처리,
// 작업장 투입 보급, 화재 대응. 직업별 tick과 일과 사이클(agents.ts)이 이 위에 올라간다.
import { DIRS, findPath, isPassable, isPassableBuilding } from './pathfinding';
import { CONFIG } from './config';
import { DAY_CYCLE_SUBTICKS, WORK_RATE_SCALE } from './dayCycle';
import { footprintTilesOf, SMITHY_PRODUCT_DEFS, smithyProductOf } from './buildings';
import { RESOURCE_NAMES } from './constants';
import { skillGainMult } from './education';
import { skillGainArtifactMultiplier } from './specialItems';
import { haulingMoveSpeedMultiplier, scaledCarryCapacity } from './equipment';
import { laborEfficiencyMult } from './lifecycle';
import { edictElderLaborMultiplier, edictFireWorkMultiplier } from './edicts';
import { processableAmount } from './processing';
import { DRYING_PRODUCT_DEFS, dryingProductOf } from './preservation';
import { activePredatorScoutIds } from './expeditionIntel';
import { residentFootwearMoveMultiplier } from './wearables';
import { activeFireDisaster, applyFireWater, drawFireWater, nearestFireWaterSource } from './fire';
import { describeGoal } from './pathGoals';
import { assignedBuildingForResident, assignedSlotResidents, isResidentInAssignedSlot } from './workerSlots';
import { buildingWorkerSlots } from './buildingWorkerSlots';
import {
  addBuildingStock, buildingStock, depositResidentToBuilding, depositResidentToSettlement, isStorageBuilding,
} from './inventory';
import type {
  Building, BuildingTypeId, GameState, ProcessingInputId, Resident, ResourceId, Season, Tile,
} from './types';

export const SUBTICKS = DAY_CYCLE_SUBTICKS;

export interface Ctx {
  season: Season;
  outdoor: number;
  tMod: number;   // 도구 보정
  mMod: number;   // 사기·관청·등급 노동 보정
  outputMod: number; // mMod에 RC 자원 산출 보정을 한 번만 합성
  rng: () => number;
  centerId: number;
  huntable: Map<string, number>; // 사냥 가능 타일 ("x,y") → 수확 배율 — 서식지 범위/크기와 연동
  farmerWorkIdsByPlot: Map<number, number[]>;
  /** 이번 서브틱에 공사터 개간을 맡은 벌목꾼 (주민 id → 건물 id) */
  clearingCrew: Map<number, number>;
  /** 개간 담당이 따로 있는 나무 ("x,y") — 일반 벌목은 이 칸을 건드리지 않는다 */
  clearingReserved: Set<string>;
}

export const PRODUCING_JOBS = [
  'woodcutter', 'woodSplitter', 'hunter', 'farmer', 'miller', 'builder', 'curer', 'potter', 'saltMaker', 'smith', 'miner', 'fisher',
  'charcoalBurner', 'herder', 'powderMaker', 'tanner', 'weaver', 'herbalist', 'hauler',
];
export const OUTDOOR_JOBS = [
  'woodcutter', 'woodSplitter', 'hunter', 'herbalist', 'farmer', 'builder', 'miner', 'fisher',
  'charcoalBurner', 'herder', 'saltMaker',
];
export const GATHERING_JOBS = ['woodcutter', 'hunter', 'herbalist', 'miner', 'fisher'];

export const LEISURE_CLUSTER_CAPACITY = 4;
export const WORK_STOCK_EPSILON = 0.05 * WORK_RATE_SCALE;
export const WORK_CRAFT_EPSILON = 0.02 * WORK_RATE_SCALE;

// 새 여가 시설(예: 주막)은 이 우선순위 표에 타입을 추가하는 것으로 연결한다.
// 같은 우선순위 안에서는 건물 id 순으로 슬롯을 열어 저장/불러오기에도 흔들리지 않게 한다.
export const LEISURE_DESTINATION_TIERS: readonly (readonly BuildingTypeId[])[] = [
  ['shrine', 'hermitage'],
  ['market'],
  ['center'],
];

// ─────────────────────────── 공통 헬퍼 ───────────────────────────

export function effOf(state: GameState, r: Resident): number {
  return (1 + (r.skills[r.job] ?? 0) * CONFIG.production.skillEffect) * laborEfficiencyMult(r) *
    edictElderLaborMultiplier(state, r) * edictFireWorkMultiplier(state, r.job);
}

export function gainSkillTick(state: Pick<GameState, 'specialItems'>, r: Resident): void {
  const cur = r.skills[r.job] ?? 0;
  // 문해자는 무엇을 배워도 빠르다 (서당 교육의 평생 보상)
  r.skills[r.job] = Math.min(
    1,
    cur + (CONFIG.production.skillGainPerDay / 5) * skillGainMult(r) *
      skillGainArtifactMultiplier(state, r.job) * WORK_RATE_SCALE,
  );
}

export function carryTotal(r: Resident): number {
  return Object.values(r.carrying).reduce((s: number, v) => s + (v ?? 0), 0);
}

export function addCarry(r: Resident, res: ResourceId, amt: number): void {
  r.carrying[res] = (r.carrying[res] ?? 0) + amt;
}

export function depositAll(state: GameState, r: Resident): void {
  depositResidentToSettlement(state, r);
}

// 직업 변경/사망 등으로 에이전트 상태를 정리 (짐은 마을 몫으로 귀속)
export function resetAgent(state: GameState, r: Resident): void {
  depositAll(state, r);
  r.path = [];
  r.phase = 'rest';
  r.workTimer = 0;
  r.targetId = null;
  r.miningDepositBuildingId = null;
  r.haulTask = null;
  r.manualOrder = null;
}


function moveSteps(state: GameState, r: Resident, ctx: Ctx): number {
  let sp: number = CONFIG.agents.moveSpeed;
  if (ctx.season === 'winter') sp = CONFIG.agents.moveSpeedWinter;
  if (state.weather === 'blizzard' || state.weather === 'heavySnow') {
    sp = Math.min(sp, CONFIG.agents.moveSpeedSnow);
  }
  sp *= haulingMoveSpeedMultiplier(r);
  sp *= residentFootwearMoveMultiplier(r);
  const n = Math.floor(sp);
  return n + (ctx.rng() < sp - n ? 1 : 0);
}

export type GoResult = 'arrived' | 'moving' | 'stuck';

// 논리 좌표가 목표에 닿은 틱에도 화면은 px/py에서 x/y로 이동을 보간한다.
// 짐 내리기는 그 보간이 끝난 다음 틱에 실행해야 한다.
export function isSettledAtGoal(resident: Resident, result: GoResult): boolean {
  return result === 'arrived' && resident.px === resident.x && resident.py === resident.y;
}

// 실패한 경로 탐색은 몇 서브틱 쉬어 간다 — 막힌 주민이 매 틱 지도 전체를 다시 뒤지는 것을 막는다.
// (저장되지 않는 순수 성능 캐시. 지형은 서브틱 사이에 거의 변하지 않는다.)
const PATH_FAIL_COOLDOWN_TICKS = 3;
const pathFailUntilByState = new WeakMap<GameState, Map<number, number>>();
const huntDepletionWarningDayByState = new WeakMap<GameState, Map<number, number>>();
const tidalDepletionWarningDayByState = new WeakMap<GameState, Map<number, number>>();

export function pathFailUntilFor(state: GameState): Map<number, number> {
  let cache = pathFailUntilByState.get(state);
  if (!cache) {
    cache = new Map<number, number>();
    pathFailUntilByState.set(state, cache);
  }
  return cache;
}

export function huntDepletionWarningDaysFor(state: GameState): Map<number, number> {
  let cache = huntDepletionWarningDayByState.get(state);
  if (!cache) {
    cache = new Map<number, number>();
    huntDepletionWarningDayByState.set(state, cache);
  }
  return cache;
}

export function tidalDepletionWarningDaysFor(state: GameState): Map<number, number> {
  let cache = tidalDepletionWarningDayByState.get(state);
  if (!cache) {
    cache = new Map<number, number>();
    tidalDepletionWarningDayByState.set(state, cache);
  }
  return cache;
}

export function absoluteTick(state: GameState): number {
  return state.day * SUBTICKS + state.subTick;
}

// 목표 조건을 향해 이동. 이미 목표 위면 arrived.
export function goTo(
  state: GameState,
  r: Resident,
  ctx: Ctx,
  isGoal: (t: Tile) => boolean,
  passable?: (x: number, y: number) => boolean,
  onStep?: (x: number, y: number) => void,
): GoResult {
  const canPass = passable ?? ((x: number, y: number) => isPassable(state, x, y));
  if (isGoal(state.map[r.y][r.x])) { r.path = []; return 'arrived'; }
  if (r.path.length === 0) {
    const pathFailUntil = pathFailUntilFor(state);
    const nowTick = absoluteTick(state);
    if ((pathFailUntil.get(r.id) ?? 0) > nowTick) return 'stuck';
    const p = findPath(state, r.x, r.y, isGoal, canPass);
    if (!p) {
      pathFailUntil.set(r.id, nowTick + PATH_FAIL_COOLDOWN_TICKS);
      return 'stuck';
    }
    pathFailUntil.delete(r.id);
    r.path = p;
  }
  const steps = moveSteps(state, r, ctx);
  for (let i = 0; i < steps && r.path.length > 0; i++) {
    const next = r.path[0];
    if (!canPass(next.x, next.y)) { r.path = []; return 'moving'; } // 다음 틱에 재탐색
    r.path.shift();
    r.x = next.x; r.y = next.y;
    onStep?.(next.x, next.y);
  }
  return isGoal(state.map[r.y][r.x]) ? 'arrived' : 'moving';
}

function isBuildingInteractionTile(state: GameState, t: Tile, buildingId: number): boolean {
  const building = state.buildings.find(b => b.id === buildingId);
  if (!building) return false;
  if (!isPassable(state, t.x, t.y)) return false;
  if (isPassableBuilding(building.type)) return t.buildingId === building.id;

  const footprint = footprintTilesOf(state, building);
  if (!footprint) return false;
  return footprint.some(tile =>
    Math.max(Math.abs(tile.x - t.x), Math.abs(tile.y - t.y)) === 1);
}

export function isResidentAtBuildingInteraction(state: GameState, r: Resident, buildingId: number): boolean {
  const tile = state.map[r.y]?.[r.x];
  return tile ? isBuildingInteractionTile(state, tile, buildingId) : false;
}

// 건물 상호작용 칸을 미리 집합으로 만든다 — 경로 탐색이 지도 전 칸에 목표 판정을 돌리므로
// 판정은 O(1)이어야 한다 (칸마다 건물 검색+발자국 검사를 하면 탐색 한 번에 수십만 연산이 된다).
export function buildingInteractionGoal(state: GameState, buildingIds: readonly number[]): (t: Tile) => boolean {
  const w = state.map[0]?.length ?? 0;
  const goalSet = new Set<number>();
  for (const id of buildingIds) {
    const building = state.buildings.find(b => b.id === id);
    if (!building) continue;
    const footprint = footprintTilesOf(state, building);
    if (!footprint) continue;
    if (isPassableBuilding(building.type)) {
      for (const tile of footprint) {
        if (tile.buildingId === building.id && isPassable(state, tile.x, tile.y)) {
          goalSet.add(tile.y * w + tile.x);
        }
      }
      continue;
    }
    const inFootprint = new Set(footprint.map(tile => tile.y * w + tile.x));
    for (const tile of footprint) {
      for (const [dx, dy] of DIRS) {
        const nx = tile.x + dx, ny = tile.y + dy;
        if (!state.map[ny]?.[nx]) continue;
        const ni = ny * w + nx;
        if (inFootprint.has(ni) || goalSet.has(ni)) continue;
        if (!isPassable(state, nx, ny)) continue;
        goalSet.add(ni);
      }
    }
  }
  const points = [...goalSet]
    .sort((a, b) => a - b)
    .map(index => ({ x: index % w, y: Math.floor(index / w) }));
  return describeGoal(t => goalSet.has(t.y * w + t.x), points);
}

// 하역 거점: 중심지 + 창고 (+직업별 거점 건물)
export function depositBuildings(state: GameState, extra: BuildingTypeId[]): Building[] {
  const productionSites = state.buildings.filter(b => b.built && extra.includes(b.type));
  if (productionSites.length > 0) return productionSites;
  return state.buildings.filter(isStorageBuilding);
}

export function depositGoal(state: GameState, extra: BuildingTypeId[]): (t: Tile) => boolean {
  return buildingInteractionGoal(state, depositBuildings(state, extra).map(building => building.id));
}

export function unloadAtDepositGoal(
  state: GameState,
  resident: Resident,
  extra: BuildingTypeId[],
): void {
  const productionSite = depositBuildings(state, extra)
    .find(building => !isStorageBuilding(building) &&
      isResidentAtBuildingInteraction(state, resident, building.id));
  if (productionSite) depositResidentToBuilding(productionSite, resident);
  else depositResidentToSettlement(state, resident);
}

export function buildingGoal(state: GameState, id: number): (t: Tile) => boolean {
  return buildingInteractionGoal(state, [id]);
}

function naturalWaterGoal(state: GameState, riverX: number, riverY: number): (t: Tile) => boolean {
  const points: { x: number; y: number }[] = [];
  const width = state.map[0]?.length ?? 0;
  const indices = new Set<number>();
  for (const [dx, dy] of DIRS) {
    const x = riverX + dx;
    const y = riverY + dy;
    if (!state.map[y]?.[x] || !isPassable(state, x, y)) continue;
    indices.add(y * width + x);
  }
  for (const index of [...indices].sort((a, b) => a - b)) {
    points.push({ x: index % width, y: Math.floor(index / width) });
  }
  return describeGoal(tile => indices.has(tile.y * width + tile.x), points);
}

function canRespondToFire(state: GameState, resident: Resident): boolean {
  if (!resident.alive || resident.sick || resident.health < 20 || state.day < (resident.quarantinedUntil ?? 0)) return false;
  if (state.day < (resident.birthRecoveryUntil ?? 0)) return false;
  if (resident.stage && (resident.stage !== 'youth' || resident.youthActivity === 'school')) return false;
  if (state.expedition?.memberIds.includes(resident.id) || state.battle?.defenderIds.includes(resident.id)) return false;
  if (state.warDispatch?.memberIds.includes(resident.id)) return false;
  return !activePredatorScoutIds(state).has(resident.id);
}

export function assignFireResponses(state: GameState, residents: readonly Resident[]): void {
  const disaster = activeFireDisaster(state);
  const sites = disaster?.fireSites ?? [];
  const activeIds = new Set(sites.map(site => site.buildingId));
  for (const resident of residents) {
    if (resident.fireResponse && (!activeIds.has(resident.fireResponse.buildingId) || !canRespondToFire(state, resident))) {
      delete resident.fireResponse;
    }
  }
  if (sites.length === 0) return;
  const assignedBySite = new Map<number, number>();
  for (const resident of residents) {
    if (resident.fireResponse) {
      assignedBySite.set(resident.fireResponse.buildingId, (assignedBySite.get(resident.fireResponse.buildingId) ?? 0) + 1);
    }
  }
  for (const site of sites) {
    const building = state.buildings.find(candidate => candidate.id === site.buildingId && candidate.built);
    if (!building) continue;
    const source = nearestFireWaterSource(state, building);
    if (!source) continue;
    const available = residents
      .filter(resident => !resident.fireResponse && canRespondToFire(state, resident))
      .sort((a, b) => Math.abs(a.x - building.x) + Math.abs(a.y - building.y) -
        (Math.abs(b.x - building.x) + Math.abs(b.y - building.y)) || a.id - b.id);
    let assigned = assignedBySite.get(building.id) ?? 0;
    for (const resident of available) {
      if (assigned >= CONFIG.disasters.fire.maximumRespondersPerSite) break;
      resident.fireResponse = {
        buildingId: building.id,
        sourceKind: source.kind,
        sourceBuildingId: source.buildingId,
        sourceX: source.x,
        sourceY: source.y,
        phase: 'toWater',
        carriedWater: 0,
      };
      resident.path = [];
      clearHaulTask(resident);
      assigned++;
    }
  }
}

export function fireResponseAgentTick(state: GameState, resident: Resident, ctx: Ctx): boolean {
  const response = resident.fireResponse;
  if (!response) return false;
  const burning = activeFireDisaster(state)?.fireSites?.some(site => site.buildingId === response.buildingId);
  const building = state.buildings.find(candidate => candidate.id === response.buildingId && candidate.built);
  if (!burning || !building || !canRespondToFire(state, resident)) {
    delete resident.fireResponse;
    return false;
  }
  clearHaulTask(resident);
  if (response.phase === 'toWater') {
    resident.task = response.sourceKind === 'well'
      ? '우물로 물 뜨러 이동'
      : response.sourceKind === 'lake' ? '호수로 물 뜨러 이동' : '강으로 물 뜨러 이동';
    const goal = response.sourceKind === 'well' && response.sourceBuildingId != null
      ? buildingGoal(state, response.sourceBuildingId)
      : naturalWaterGoal(state, response.sourceX, response.sourceY);
    const result = goTo(state, resident, ctx, goal);
    if (!isSettledAtGoal(resident, result)) return true;
    const amount = drawFireWater(state, {
      kind: response.sourceKind,
      buildingId: response.sourceBuildingId,
      x: response.sourceX,
      y: response.sourceY,
      distance: 0,
    });
    if (amount <= 0) {
      const source = nearestFireWaterSource(state, building);
      if (!source) {
        delete resident.fireResponse;
        resident.path = [];
        return false;
      }
      response.sourceKind = source.kind;
      response.sourceBuildingId = source.buildingId;
      response.sourceX = source.x;
      response.sourceY = source.y;
      resident.path = [];
      return true;
    }
    response.carriedWater = amount;
    response.phase = 'toFire';
    resident.path = [];
    return true;
  }
  resident.task = '화재 현장으로 물 운반';
  const result = goTo(state, resident, ctx, buildingGoal(state, building.id));
  if (!isSettledAtGoal(resident, result)) return true;
  applyFireWater(state, building.id, response.carriedWater);
  response.carriedWater = 0;
  response.phase = 'toWater';
  resident.task = '불길에 물 붓는 중';
  resident.path = [];
  return true;
}

/**
 * 서는 자리가 정해진 야외 작업 — 건물 옆 아무 칸이 아니라 등록된 칸으로 간다.
 * 자리는 스프라이트 스튜디오에서 실물을 보며 정하고, 배정 순번(id 오름차순)이
 * 곧 자리 번호라 두 근무자가 같은 칸을 다투지 않는다.
 * 미등록·지도 밖·통행 불가면 기존 동작(건물 인접 아무 칸)으로 되돌아간다.
 */
export function workerSlotGoal(state: GameState, r: Resident, building: Building): (t: Tile) => boolean {
  const slots = buildingWorkerSlots(building.type);
  if (slots.length === 0) return buildingGoal(state, building.id);
  const index = assignedSlotResidents(state, building).findIndex(worker => worker.id === r.id);
  if (index < 0) return buildingGoal(state, building.id);
  const slot = slots[index % slots.length];
  const sx = building.x + slot.tileDX;
  const sy = building.y + slot.tileDY;
  if (!state.map[sy]?.[sx] || !isPassable(state, sx, sy)) return buildingGoal(state, building.id);
  return describeGoal(t => t.x === sx && t.y === sy, [{ x: sx, y: sy }]);
}

export function goToCenter(state: GameState, r: Resident, ctx: Ctx): GoResult {
  return goTo(state, r, ctx, buildingGoal(state, ctx.centerId));
}

function manhattanXY(ax: number, ay: number, bx: number, by: number): number {
  return Math.abs(ax - bx) + Math.abs(ay - by);
}

function canStepTo(state: GameState, x: number, y: number, dx: number, dy: number): boolean {
  const nx = x + dx, ny = y + dy;
  if (!isPassable(state, nx, ny)) return false;
  if (dx !== 0 && dy !== 0 && (!isPassable(state, x + dx, y) || !isPassable(state, x, y + dy))) return false;
  return true;
}

export function tryLoiterStep(
  state: GameState,
  r: Resident,
  ctx: Ctx,
  anchorX: number,
  anchorY: number,
  radius: number,
): boolean {
  const start = Math.floor(ctx.rng() * DIRS.length);
  for (let i = 0; i < DIRS.length; i++) {
    const [dx, dy] = DIRS[(start + i) % DIRS.length];
    const nx = r.x + dx, ny = r.y + dy;
    if (manhattanXY(nx, ny, anchorX, anchorY) > radius) continue;
    if (!canStepTo(state, r.x, r.y, dx, dy)) continue;
    r.x = nx;
    r.y = ny;
    return true;
  }
  return false;
}

function loiterNearPoint(
  state: GameState,
  r: Resident,
  ctx: Ctx,
  anchorX: number,
  anchorY: number,
  radius: number,
  task: string,
): GoResult {
  r.task = task;
  if (manhattanXY(r.x, r.y, anchorX, anchorY) > radius) {
    const returnRadius = Math.max(1, Math.min(2, radius));
    return goTo(state, r, ctx, tile =>
      isPassable(state, tile.x, tile.y) && manhattanXY(tile.x, tile.y, anchorX, anchorY) <= returnRadius);
  }
  r.path = [];
  if (ctx.rng() < 0.65 && tryLoiterStep(state, r, ctx, anchorX, anchorY, radius)) return 'moving';
  return 'arrived';
}

export function loiterNearCenter(state: GameState, r: Resident, ctx: Ctx, task: string): GoResult {
  const center = state.buildings.find(b => b.id === ctx.centerId);
  if (!center) {
    r.task = task;
    r.path = [];
    tryLoiterStep(state, r, ctx, r.x, r.y, 2);
    return 'arrived';
  }
  return loiterNearPoint(state, r, ctx, center.x, center.y, 8, task);
}

export function loiterNearBuilding(
  state: GameState,
  r: Resident,
  ctx: Ctx,
  building: Building,
  radius: number,
  task: string,
): GoResult {
  r.task = task;
  if (manhattanXY(r.x, r.y, building.x, building.y) > radius) {
    return goTo(state, r, ctx, buildingGoal(state, building.id));
  }
  r.path = [];
  if (ctx.rng() < 0.55 && tryLoiterStep(state, r, ctx, building.x, building.y, radius)) return 'moving';
  return 'arrived';
}

function depositCarriedResources(
  state: GameState,
  r: Resident,
  ctx: Ctx,
  extra: BuildingTypeId[],
  task: string,
): boolean {
  if (carryTotal(r) <= 0) return false;
  r.phase = 'toDeposit';
  r.task = task;
  const st = goTo(state, r, ctx, depositGoal(state, extra));
  if (isSettledAtGoal(r, st)) {
    unloadAtDepositGoal(state, r, extra);
    r.phase = 'rest';
  } else if (st === 'stuck') {
    depositResidentToSettlement(state, r);
    r.phase = 'rest';
  }
  return true;
}

export function assignedWorkplace(
  state: GameState,
  r: Resident,
  ctx: Ctx,
  type: BuildingTypeId,
  waitTask: string,
): Building | null {
  return assignedWorkplaceOfTypes(state, r, ctx, [type], waitTask);
}

export function assignedWorkplaceOfTypes(
  state: GameState,
  r: Resident,
  ctx: Ctx,
  types: readonly BuildingTypeId[],
  waitTask: string,
): Building | null {
  const building = assignedBuildingForResident(state, r);
  if (!building || !types.includes(building.type) || !isResidentInAssignedSlot(state, r, building)) {
    if (depositCarriedResources(state, r, ctx, [], waitTask)) return null;
    loiterNearCenter(state, r, ctx, waitTask);
    return null;
  }
  return building;
}

export type WorkplaceInputs = Partial<Record<ResourceId, number>>;

function isReservedProcessingInput(resource: ResourceId): resource is ProcessingInputId {
  return resource === 'wood' || resource === 'rice' || resource === 'hide' || resource === 'iron'
    || resource === 'meat' || resource === 'fish';
}

function settlementProcessingStock(state: GameState, resource: ResourceId): number {
  return isReservedProcessingInput(resource) ? processableAmount(state, resource) : state.resources[resource];
}

export function workplaceInputResources(building: Building): ResourceId[] {
  switch (building.type) {
    case 'watermill': return ['rice'];
    case 'woodShed': return ['wood'];
    case 'charcoalKiln': return ['wood'];
    case 'tannery': return ['hide'];
    case 'weavingHouse': return ['cotton'];
    case 'nitreYard': return ['firewood', 'stone'];
    case 'smithy': return Object.keys(SMITHY_PRODUCT_DEFS[smithyProductOf(building)].inputPerUnit) as ResourceId[];
    case 'smokehouse': return ['meat', 'firewood', 'charcoal'];
    case 'dryingRack': return Object.keys(DRYING_PRODUCT_DEFS[dryingProductOf(building)].inputPerUnit) as ResourceId[];
    case 'onggiKiln': return ['firewood', 'charcoal'];
    case 'saltworks': return ['firewood'];
    case 'jangdokdae': return ['beans', 'salt', 'onggi'];
    default: return [];
  }
}

export function isWorkplaceInputStock(building: Building, resource: ResourceId): boolean {
  return workplaceInputResources(building).includes(resource);
}

function processorCarryCapacity(resource: ResourceId): number {
  const capacities = CONFIG.agents.carryCap as Partial<Record<ResourceId, number>>;
  return scaledCarryCapacity(capacities[resource] ?? CONFIG.agents.haulerCarryCap);
}

function unloadWorkplaceInputs(building: Building, resident: Resident, inputs: Set<ResourceId>): void {
  for (const [resource, amount] of Object.entries(resident.carrying) as [ResourceId, number][]) {
    if (!inputs.has(resource) || amount <= 0) continue;
    addBuildingStock(building, resource, amount);
    delete resident.carrying[resource];
  }
}

// 가공 작업자는 창고에서 원료를 직접 가져와 지정 작업장의 현장 재고로 만든다.
export function supplyWorkplaceInputs(
  state: GameState,
  resident: Resident,
  ctx: Ctx,
  workplace: Building,
  requirements: WorkplaceInputs,
): boolean {
  const inputIds = (Object.entries(requirements) as [ResourceId, number][])
    .filter(([, amount]) => amount > 0)
    .map(([resource]) => resource);
  const inputSet = new Set(inputIds);
  const hasCarriedInput = inputIds.some(resource => (resident.carrying[resource] ?? 0) > 0);

  if (hasCarriedInput) {
    resident.phase = 'toDeposit';
    resident.task = '작업장에 원료 운반';
    const st = goTo(state, resident, ctx, buildingGoal(state, workplace.id));
    if (isSettledAtGoal(resident, st)) {
      unloadWorkplaceInputs(workplace, resident, inputSet);
      resident.phase = 'rest';
      resident.path = [];
    } else if (st === 'stuck') {
      depositResidentToSettlement(state, resident);
      resident.phase = 'rest';
    }
    return true;
  }

  if (carryTotal(resident) > 0) {
    return depositCarriedResources(state, resident, ctx, [], '남은 짐 정리');
  }

  const resource = (Object.entries(requirements) as [ResourceId, number][]).find(([candidate, needed]) =>
    needed > 0 &&
    buildingStock(workplace, candidate) + 0.0001 < needed &&
    settlementProcessingStock(state, candidate) > WORK_STOCK_EPSILON)?.[0];
  if (!resource) return false;

  const storage = nearestBuilding(resident, state.buildings.filter(isStorageBuilding));
  if (!storage) {
    resident.phase = 'rest';
    resident.task = '원료 창고 없음';
    return true;
  }

  resident.phase = 'toWork';
  resident.task = `${RESOURCE_NAMES[resource]} 가지러 이동`;
  const st = goTo(state, resident, ctx, buildingGoal(state, storage.id));
  if (st === 'arrived') {
    const pickupCap = resource === 'tools'
      ? Math.min(1, processorCarryCapacity(resource))
      : processorCarryCapacity(resource);
    const amount = Math.min(settlementProcessingStock(state, resource), pickupCap);
    if (amount > WORK_STOCK_EPSILON) {
      state.resources[resource] = Math.max(0, state.resources[resource] - amount);
      addCarry(resident, resource, amount);
      resident.phase = 'toDeposit';
      resident.path = [];
      resident.task = `${RESOURCE_NAMES[resource]} 운반`;
    } else {
      resident.phase = 'rest';
      resident.path = [];
      resident.task = `${RESOURCE_NAMES[resource]} 대기`;
    }
  } else if (st === 'stuck') {
    resident.phase = 'rest';
    resident.task = '창고 길이 막힘';
  }
  return true;
}

function nearestPassableTile(state: GameState, x: number, y: number, maxRadius = 8): Tile | null {
  for (let radius = 1; radius <= maxRadius; radius++) {
    for (let ty = y - radius; ty <= y + radius; ty++) {
      for (let tx = x - radius; tx <= x + radius; tx++) {
        if (Math.max(Math.abs(tx - x), Math.abs(ty - y)) !== radius) continue;
        const tile = state.map[ty]?.[tx];
        if (tile && isPassable(state, tx, ty)) return tile;
      }
    }
  }
  return null;
}

export function ensureResidentOnPassableTile(state: GameState, r: Resident): void {
  const ignored = r.manualOrder?.unauthorizedSiteIds ?? [];
  if (isPassable(state, r.x, r.y, ignored)) return;
  const tile = nearestPassableTile(state, r.x, r.y);
  if (!tile) return;
  r.x = tile.x;
  r.y = tile.y;
  r.px = tile.x;
  r.py = tile.y;
  r.path = [];
}

export function ensureResidentsOnPassableTiles(state: GameState): void {
  for (const resident of state.residents) {
    const boat = resident.fishingBoatId == null
      ? undefined
      : state.fishingBoats.find(candidate => candidate.id === resident.fishingBoatId && candidate.fisherIds.includes(resident.id));
    if (resident.alive && !boat) ensureResidentOnPassableTile(state, resident);
  }
}

// ─────────────────────────── 소소한 공용 헬퍼 ───────────────────────────

export function clearHaulTask(resident: Resident): void {
  resident.haulTask = null;
  resident.targetId = null;
  resident.path = [];
}

export function nearestBuilding<T extends { x: number; y: number }>(r: Resident, list: T[]): T | null {
  let best: T | null = null;
  let bestD = Infinity;
  for (const b of list) {
    const d = Math.abs(b.x - r.x) + Math.abs(b.y - r.y);
    if (d < bestD) { bestD = d; best = b; }
  }
  return best;
}
