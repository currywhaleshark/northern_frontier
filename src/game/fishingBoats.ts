import { CONFIG } from './config';
import { takeFishingGroundStockById } from './fishingGrounds';
import { addBuildingStock } from './inventory';
import { isLakeIceAt } from './lakeIce';
import { getDayOfSeason, getSeason } from './seasons';
import type {
  Building, FishingBoatState, FishingGroundDepthBand, FishingGroundTile,
  GameState, Resident, Tile,
} from './types';

type WaterKind = 'lake' | 'sea';
type WaterfrontBuilding = Pick<Building, 'id' | 'type' | 'x' | 'y' | 'built' | 'boatWorkOrder'>;

const WATER_DIRECTIONS = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
] as const;

function waterKind(tile: Tile | undefined): WaterKind | null {
  return tile?.terrain === 'lake' || tile?.terrain === 'sea' ? tile.terrain : null;
}

function footprintSize(type: WaterfrontBuilding['type']): { w: number; h: number } {
  return type === 'boatyard' ? { w: 2, h: 2 } : { w: 1, h: 1 };
}

export function fishingWaterfrontAccessTiles(
  map: Tile[][],
  x: number,
  y: number,
  w: number,
  h: number,
): FishingGroundTile[] {
  const found = new Map<string, FishingGroundTile>();
  for (let fy = y; fy < y + h; fy++) {
    for (let fx = x; fx < x + w; fx++) {
      for (const direction of WATER_DIRECTIONS) {
        const nx = fx + direction.x;
        const ny = fy + direction.y;
        if (!waterKind(map[ny]?.[nx])) continue;
        found.set(`${nx},${ny}`, { x: nx, y: ny });
      }
    }
  }
  return [...found.values()].sort((left, right) => left.y - right.y || left.x - right.x);
}

export function fishingWaterAccessForBuilding(
  state: Pick<GameState, 'map'>,
  building: Pick<Building, 'type' | 'x' | 'y'>,
): FishingGroundTile[] {
  const { w, h } = footprintSize(building.type);
  return fishingWaterfrontAccessTiles(state.map, building.x, building.y, w, h);
}

export function fishingBoatRoute(
  map: Tile[][],
  start: FishingGroundTile,
  goal: FishingGroundTile,
): FishingGroundTile[] {
  const kind = waterKind(map[start.y]?.[start.x]);
  if (!kind || waterKind(map[goal.y]?.[goal.x]) !== kind) return [];
  const startKey = `${start.x},${start.y}`;
  const goalKey = `${goal.x},${goal.y}`;
  const queue: FishingGroundTile[] = [{ ...start }];
  const previous = new Map<string, string | null>([[startKey, null]]);
  for (let index = 0; index < queue.length; index++) {
    const current = queue[index];
    const currentKey = `${current.x},${current.y}`;
    if (currentKey === goalKey) break;
    for (const direction of WATER_DIRECTIONS) {
      const next = { x: current.x + direction.x, y: current.y + direction.y };
      const key = `${next.x},${next.y}`;
      if (previous.has(key) || waterKind(map[next.y]?.[next.x]) !== kind) continue;
      previous.set(key, currentKey);
      queue.push(next);
    }
  }
  if (!previous.has(goalKey)) return [];
  const route: FishingGroundTile[] = [];
  for (let key: string | null = goalKey; key != null; key = previous.get(key) ?? null) {
    const [x, y] = key.split(',').map(Number);
    route.push({ x, y });
  }
  return route.reverse();
}

function compatiblePortRoute(
  state: Pick<GameState, 'map'>,
  boatyard: Pick<Building, 'type' | 'x' | 'y'>,
  port: Pick<Building, 'type' | 'x' | 'y'>,
): FishingGroundTile[] {
  const yardAccess = fishingWaterAccessForBuilding(state, boatyard);
  const portAccess = fishingWaterAccessForBuilding(state, port);
  let best: FishingGroundTile[] = [];
  for (const from of yardAccess) {
    for (const to of portAccess) {
      const route = fishingBoatRoute(state.map, from, to);
      if (route.length > 0 && (best.length === 0 || route.length < best.length)) best = route;
    }
  }
  return best;
}

function portWorkArea(port: Pick<Building, 'x' | 'y' | 'gatheringWorkArea'>): { x: number; y: number; radius: number } {
  const configured = port.gatheringWorkArea;
  return {
    x: Number.isFinite(configured?.x) ? Math.round(configured!.x) : port.x,
    y: Number.isFinite(configured?.y) ? Math.round(configured!.y) : port.y,
    radius: Number.isFinite(configured?.radius)
      ? Math.max(CONFIG.gatheringZones.lumberCampMinRadius,
        Math.min(CONFIG.gatheringZones.lumberCampMaxRadius, Math.round(configured!.radius)))
      : CONFIG.gatheringZones.fishingPortRadius,
  };
}

function pointInArea(point: FishingGroundTile, area: { x: number; y: number; radius: number }): boolean {
  return (point.x - area.x) ** 2 + (point.y - area.y) ** 2 <= area.radius ** 2;
}

function shortestRouteToPort(
  state: Pick<GameState, 'map'>,
  port: Pick<Building, 'type' | 'x' | 'y'>,
  start: FishingGroundTile,
): FishingGroundTile[] {
  let best: FishingGroundTile[] = [];
  for (const access of fishingWaterAccessForBuilding(state, port)) {
    const route = fishingBoatRoute(state.map, start, access);
    if (route.length > 0 && (best.length === 0 || route.length < best.length)) best = route;
  }
  return best;
}

function clearFishingTrip(boat: FishingBoatState): void {
  boat.route = [];
  boat.routeIndex = 0;
  boat.targetGroundId = null;
  boat.tripDepthBand = null;
  boat.tripCatchTarget = 0;
  boat.tripDistance = 0;
  boat.fishingProgress = 0;
}

function syncFisherToBoat(state: GameState, boat: FishingBoatState): void {
  if (boat.fisherId == null) return;
  const fisher = state.residents.find(resident => resident.id === boat.fisherId && resident.alive);
  if (!fisher) return;
  fisher.px = fisher.x;
  fisher.py = fisher.y;
  fisher.x = boat.x;
  fisher.y = boat.y;
  fisher.path = [];
  fisher.phase = boat.status === 'fishing' ? 'working' : 'toWork';
  fisher.task = boat.status === 'fishing'
    ? '호수 어장에서 조업 중'
    : boat.status === 'returning'
      ? '포구로 귀항 중'
      : '호수 어장으로 항해 중';
}

export interface LakeFishingTripPlan {
  groundId: string;
  depthBand: Extract<FishingGroundDepthBand, 'mid' | 'deep'>;
  target: FishingGroundTile;
  route: FishingGroundTile[];
  outboundDistance: number;
  returnDistance: number;
  roundTripDistance: number;
  expectedCatch: number;
  expectedDurabilityCost: number;
  requiredSubticks: number;
}

export function lakeFishingDepartureAllowed(day: number): boolean {
  const season = getSeason(day);
  return season !== 'winter' && (season !== 'spring' || getDayOfSeason(day) >= 7);
}

export function fishingBoatExpectedCatch(
  depthBand: Extract<FishingGroundDepthBand, 'mid' | 'deep'>,
  roundTripDistance: number,
): number {
  const depthMultiplier = depthBand === 'deep'
    ? CONFIG.fishingBoats.deepCatchMultiplier
    : CONFIG.fishingBoats.midCatchMultiplier;
  const distanceBonus = Math.min(
    CONFIG.fishingBoats.maximumDistanceCatchBonus,
    Math.max(0, roundTripDistance) * CONFIG.fishingBoats.distanceCatchBonusPerTile,
  );
  return CONFIG.fishingBoats.baseCatchPerTrip * depthMultiplier * (1 + distanceBonus);
}

function expectedTripDurabilityCost(
  depthBand: Extract<FishingGroundDepthBand, 'mid' | 'deep'>,
  roundTripDistance: number,
  expectedCatch: number,
): number {
  const depthMultiplier = depthBand === 'deep' ? CONFIG.fishingBoats.deepDurabilityMultiplier : 1;
  return CONFIG.fishingBoats.departureDurabilityCost +
    roundTripDistance * CONFIG.fishingBoats.travelDurabilityPerTile +
    expectedCatch * CONFIG.fishingBoats.catchDurabilityPerFish * depthMultiplier;
}

export function lakeFishingTripPlan(
  state: GameState,
  boat: FishingBoatState,
  remainingWorkSubticks: number,
): LakeFishingTripPlan | null {
  if (!lakeFishingDepartureAllowed(state.day) ||
      (boat.status !== 'moored' && boat.status !== 'boarded') ||
      boat.durability < CONFIG.fishingBoats.minimumDepartureDurability ||
      boat.cargoFish >= boat.cargoCapacity || remainingWorkSubticks <= 0) return null;
  const port = state.buildings.find(building =>
    building.id === boat.portId && building.type === 'fishingPort' && building.built);
  if (!port || state.map[boat.y]?.[boat.x]?.terrain !== 'lake') return null;
  const area = portWorkArea(port);
  const candidates: LakeFishingTripPlan[] = [];
  for (const ground of state.fishingGrounds) {
    if (ground.kind !== 'lake' || (ground.depthBand !== 'mid' && ground.depthBand !== 'deep') || ground.stock <= 0) continue;
    for (const target of ground.tiles) {
      if (!pointInArea(target, area) || isLakeIceAt(state.map, state.day, target.x, target.y)) continue;
      const route = fishingBoatRoute(state.map, boat, target);
      if (route.length === 0 || route.some(point => isLakeIceAt(state.map, state.day, point.x, point.y))) continue;
      const returnRoute = shortestRouteToPort(state, port, target);
      if (returnRoute.length === 0 || returnRoute.some(point => isLakeIceAt(state.map, state.day, point.x, point.y))) continue;
      const outboundDistance = Math.max(0, route.length - 1);
      const returnDistance = Math.max(0, returnRoute.length - 1);
      const roundTripDistance = outboundDistance + returnDistance;
      const expectedCatch = Math.min(
        ground.stock,
        boat.cargoCapacity - boat.cargoFish,
        fishingBoatExpectedCatch(ground.depthBand, roundTripDistance),
      );
      if (expectedCatch <= 0) continue;
      const requiredSubticks = roundTripDistance + CONFIG.fishingBoats.fishingWorkSubticks +
        CONFIG.fishingBoats.returnSafetySubticks;
      const expectedDurabilityCost = expectedTripDurabilityCost(ground.depthBand, roundTripDistance, expectedCatch);
      if (requiredSubticks > remainingWorkSubticks || expectedDurabilityCost >= boat.durability) continue;
      candidates.push({
        groundId: ground.id,
        depthBand: ground.depthBand,
        target: { ...target },
        route,
        outboundDistance,
        returnDistance,
        roundTripDistance,
        expectedCatch,
        expectedDurabilityCost,
        requiredSubticks,
      });
    }
  }
  return candidates.sort((left, right) => {
    const leftUtility = left.expectedCatch / Math.max(1, left.requiredSubticks);
    const rightUtility = right.expectedCatch / Math.max(1, right.requiredSubticks);
    return rightUtility - leftUtility || right.expectedCatch - left.expectedCatch ||
      left.roundTripDistance - right.roundTripDistance || left.groundId.localeCompare(right.groundId) ||
      left.target.y - right.target.y || left.target.x - right.target.x;
  })[0] ?? null;
}

export function startLakeFishingTrip(
  state: GameState,
  boatId: number,
  remainingWorkSubticks: number,
): string | null {
  const boat = state.fishingBoats.find(candidate => candidate.id === boatId);
  if (!boat || boat.status !== 'boarded' || boat.fisherId == null) return '어부가 승선한 계류 어선이 필요합니다.';
  const plan = lakeFishingTripPlan(state, boat, remainingWorkSubticks);
  if (!plan) return '일몰 전에 다녀올 수 있는 호수 중·심수 어장이 없습니다.';
  boat.targetGroundId = plan.groundId;
  boat.tripDepthBand = plan.depthBand;
  boat.tripCatchTarget = Math.min(boat.cargoCapacity, boat.cargoFish + plan.expectedCatch);
  boat.tripDistance = plan.roundTripDistance;
  boat.fishingProgress = 0;
  boat.route = plan.route;
  boat.routeIndex = 0;
  boat.status = 'underway';
  boat.durability = Math.max(0, boat.durability - CONFIG.fishingBoats.departureDurabilityCost);
  syncFisherToBoat(state, boat);
  return null;
}

function beginReturn(state: GameState, boat: FishingBoatState): void {
  const port = state.buildings.find(building =>
    building.id === boat.portId && building.type === 'fishingPort' && building.built);
  const route = port ? shortestRouteToPort(state, port, boat) : [];
  boat.status = 'returning';
  boat.route = route;
  boat.routeIndex = 0;
}

function unloadFishingBoat(state: GameState, boat: FishingBoatState): void {
  const port = state.buildings.find(building =>
    building.id === boat.portId && building.type === 'fishingPort' && building.built);
  if (port && boat.cargoFish > 0) addBuildingStock(port, 'fish', boat.cargoFish);
  boat.cargoFish = 0;
  clearFishingTrip(boat);
  if (boat.fisherId != null) disembarkFishingBoat(state, boat.id);
  else boat.status = boat.durability > 0 ? 'moored' : 'disabled';
}

export function advanceLakeFishingTrip(state: GameState, boatId: number, forceReturn = false): void {
  const boat = state.fishingBoats.find(candidate => candidate.id === boatId);
  if (!boat || boat.fisherId == null ||
      (boat.status !== 'underway' && boat.status !== 'fishing' && boat.status !== 'returning')) return;
  if (forceReturn && boat.status !== 'returning') beginReturn(state, boat);
  if (boat.status === 'underway' || boat.status === 'returning') {
    const nextIndex = boat.routeIndex + 1;
    const next = boat.route[nextIndex];
    if (next) {
      boat.routeIndex = nextIndex;
      boat.x = next.x;
      boat.y = next.y;
      boat.durability = Math.max(0, boat.durability - CONFIG.fishingBoats.travelDurabilityPerTile);
    }
    if (boat.route.length === 0 || boat.routeIndex >= boat.route.length - 1) {
      if (boat.status === 'returning') {
        unloadFishingBoat(state, boat);
        return;
      }
      boat.status = 'fishing';
      boat.route = [];
      boat.routeIndex = 0;
    }
    syncFisherToBoat(state, boat);
    return;
  }
  const ground = state.fishingGrounds.find(candidate => candidate.id === boat.targetGroundId);
  if (!ground || ground.stock <= 0 || forceReturn) {
    beginReturn(state, boat);
    syncFisherToBoat(state, boat);
    return;
  }
  boat.fishingProgress = Math.min(
    CONFIG.fishingBoats.fishingWorkSubticks,
    (boat.fishingProgress ?? 0) + 1,
  );
  const targetCatch = Math.max(0, boat.tripCatchTarget ?? 0);
  const remainingTarget = Math.max(0, targetCatch - boat.cargoFish);
  const workRemaining = Math.max(1, CONFIG.fishingBoats.fishingWorkSubticks - boat.fishingProgress + 1);
  const requested = Math.min(boat.cargoCapacity - boat.cargoFish, remainingTarget / workRemaining);
  const taken = takeFishingGroundStockById(state.fishingGrounds, ground.id, requested);
  boat.cargoFish += taken;
  const depthMultiplier = boat.tripDepthBand === 'deep' ? CONFIG.fishingBoats.deepDurabilityMultiplier : 1;
  boat.durability = Math.max(0,
    boat.durability - taken * CONFIG.fishingBoats.catchDurabilityPerFish * depthMultiplier);
  if (boat.fishingProgress >= CONFIG.fishingBoats.fishingWorkSubticks ||
      boat.cargoFish >= boat.cargoCapacity || boat.cargoFish >= targetCatch || ground.stock <= 0) {
    beginReturn(state, boat);
  }
  syncFisherToBoat(state, boat);
}

export function nearestCompatibleFishingPort(
  state: Pick<GameState, 'map' | 'buildings'>,
  boatyard: Pick<Building, 'type' | 'x' | 'y'>,
): Building | null {
  return state.buildings
    .filter(building => building.type === 'fishingPort' && building.built)
    .map(building => ({ building, route: compatiblePortRoute(state, boatyard, building) }))
    .filter(candidate => candidate.route.length > 0)
    .sort((left, right) => left.route.length - right.route.length || left.building.id - right.building.id)[0]
    ?.building ?? null;
}

function spendBoatResources(state: GameState, wood: number, tools: number): boolean {
  if (state.resources.wood < wood || state.resources.tools < tools) return false;
  state.resources.wood -= wood;
  state.resources.tools -= tools;
  return true;
}

export function startFishingBoatConstruction(state: GameState, boatyardId: number): string | null {
  const boatyard = state.buildings.find(building =>
    building.id === boatyardId && building.type === 'boatyard' && building.built);
  if (!boatyard) return '완공된 배무이터를 선택해야 합니다.';
  if (boatyard.boatWorkOrder) return '이미 어선 작업이 진행 중입니다.';
  const port = nearestCompatibleFishingPort(state, boatyard);
  if (!port) return '같은 호수나 바다로 이어진 완공 포구가 필요합니다.';
  if (!spendBoatResources(state, CONFIG.fishingBoats.buildWood, CONFIG.fishingBoats.buildTools)) {
    return `어선 건조에는 목재 ${CONFIG.fishingBoats.buildWood}, 도구 ${CONFIG.fishingBoats.buildTools}이 필요합니다.`;
  }
  boatyard.boatWorkOrder = {
    kind: 'build',
    portId: port.id,
    progress: 0,
    required: CONFIG.fishingBoats.buildWorkDays,
  };
  state.priorityBuildingId = boatyard.id;
  return null;
}

export function startFishingBoatRepair(
  state: GameState,
  boatyardId: number,
  boatId: number,
): string | null {
  const boatyard = state.buildings.find(building =>
    building.id === boatyardId && building.type === 'boatyard' && building.built);
  if (!boatyard) return '완공된 배무이터를 선택해야 합니다.';
  if (boatyard.boatWorkOrder) return '이미 어선 작업이 진행 중입니다.';
  const boat = state.fishingBoats.find(candidate => candidate.id === boatId);
  if (!boat || (boat.status !== 'moored' && boat.status !== 'disabled')) return '계류된 손상 어선만 수리할 수 있습니다.';
  if (boat.fisherId != null) return '어부가 내린 뒤 수리할 수 있습니다.';
  if (boat.durability >= boat.maxDurability) return '수리가 필요하지 않은 어선입니다.';
  const port = state.buildings.find(building => building.id === boat.portId && building.type === 'fishingPort' && building.built);
  if (!port || compatiblePortRoute(state, boatyard, port).length === 0) return '배무이터와 같은 수역의 포구에 계류해야 합니다.';
  if (!spendBoatResources(state, CONFIG.fishingBoats.repairWood, CONFIG.fishingBoats.repairTools)) {
    return `어선 수리에는 목재 ${CONFIG.fishingBoats.repairWood}, 도구 ${CONFIG.fishingBoats.repairTools}이 필요합니다.`;
  }
  boat.status = 'repairing';
  boat.boatyardId = boatyard.id;
  boatyard.boatWorkOrder = {
    kind: 'repair',
    portId: port.id,
    boatId: boat.id,
    progress: 0,
    required: CONFIG.fishingBoats.repairWorkDays,
  };
  state.priorityBuildingId = boatyard.id;
  return null;
}

export function advanceFishingBoatWork(
  state: GameState,
  boatyard: Building,
  work: number,
): 'built' | 'repaired' | null {
  const order = boatyard.type === 'boatyard' ? boatyard.boatWorkOrder : undefined;
  if (!order || !Number.isFinite(work) || work <= 0) return null;
  order.progress = Math.min(order.required, order.progress + work);
  if (order.progress < order.required) return null;
  if (order.kind === 'repair') {
    const boat = state.fishingBoats.find(candidate => candidate.id === order.boatId);
    if (boat) {
      boat.durability = boat.maxDurability;
      boat.status = 'moored';
      boat.boatyardId = null;
    }
    delete boatyard.boatWorkOrder;
    if (state.priorityBuildingId === boatyard.id) state.priorityBuildingId = null;
    return 'repaired';
  }
  const port = state.buildings.find(building => building.id === order.portId && building.type === 'fishingPort' && building.built);
  const mooring = port ? fishingWaterAccessForBuilding(state, port)[0] : undefined;
  if (!port || !mooring) {
    delete boatyard.boatWorkOrder;
    if (state.priorityBuildingId === boatyard.id) state.priorityBuildingId = null;
    return null;
  }
  state.fishingBoats.push({
    id: state.nextFishingBoatId++,
    portId: port.id,
    boatyardId: null,
    fisherId: null,
    x: mooring.x,
    y: mooring.y,
    cargoFish: 0,
    cargoCapacity: CONFIG.fishingBoats.cargoCapacity,
    durability: CONFIG.fishingBoats.durability,
    maxDurability: CONFIG.fishingBoats.durability,
    status: 'moored',
    route: [],
    routeIndex: 0,
  });
  delete boatyard.boatWorkOrder;
  if (state.priorityBuildingId === boatyard.id) state.priorityBuildingId = null;
  return 'built';
}

export function boardFishingBoat(state: GameState, boatId: number, residentId: number): string | null {
  const boat = state.fishingBoats.find(candidate => candidate.id === boatId);
  const resident = state.residents.find(candidate => candidate.id === residentId && candidate.alive);
  if (!boat || !resident) return '어선이나 어부를 찾을 수 없습니다.';
  if (boat.status !== 'moored' || boat.fisherId != null) return '빈 채로 계류된 어선이 아닙니다.';
  if (resident.job !== 'fisher' || resident.assignedBuildingId !== boat.portId) return '이 포구에 배정된 어부만 승선할 수 있습니다.';
  if (resident.fishingBoatId != null) return '이미 다른 어선에 승선했습니다.';
  const port = state.buildings.find(building => building.id === boat.portId && building.type === 'fishingPort' && building.built);
  if (!port || Math.max(Math.abs(resident.x - port.x), Math.abs(resident.y - port.y)) > 1) {
    return '포구에 도착한 어부만 승선할 수 있습니다.';
  }
  boat.fisherId = resident.id;
  boat.status = 'boarded';
  resident.fishingBoatId = boat.id;
  resident.px = resident.x;
  resident.py = resident.y;
  resident.x = boat.x;
  resident.y = boat.y;
  resident.path = [];
  resident.phase = 'toWork';
  resident.task = '어선에 승선함';
  return null;
}

export function disembarkFishingBoat(state: GameState, boatId: number): string | null {
  const boat = state.fishingBoats.find(candidate => candidate.id === boatId);
  if (!boat || boat.fisherId == null) return '승선한 어부가 없습니다.';
  const resident = state.residents.find(candidate => candidate.id === boat.fisherId);
  const port = state.buildings.find(building => building.id === boat.portId && building.type === 'fishingPort' && building.built);
  if (!resident || !port) return '하선할 포구를 찾을 수 없습니다.';
  resident.fishingBoatId = null;
  const landing = WATER_DIRECTIONS
    .map(direction => state.map[port.y + direction.y]?.[port.x + direction.x])
    .find(tile => tile && tile.buildingId == null &&
      tile.terrain !== 'river' && tile.terrain !== 'lake' && tile.terrain !== 'sea' &&
      tile.terrain !== 'mudflat' && tile.terrain !== 'mountain' && tile.terrain !== 'rock') ??
    state.map[port.y]?.[port.x];
  resident.x = landing?.x ?? port.x;
  resident.y = landing?.y ?? port.y;
  resident.px = resident.x;
  resident.py = resident.y;
  resident.path = [];
  boat.fisherId = null;
  boat.status = boat.durability > 0 ? 'moored' : 'disabled';
  clearFishingTrip(boat);
  return null;
}

const BOAT_STATUSES = new Set<FishingBoatState['status']>([
  'moored', 'boarded', 'underway', 'fishing', 'returning', 'repairing', 'disabled',
]);

export function normalizeFishingBoats(state: GameState): void {
  const ports = new Set(state.buildings
    .filter(building => building.type === 'fishingPort' && building.built)
    .map(building => building.id));
  const residentById = new Map(state.residents.map(resident => [resident.id, resident]));
  const usedFisherIds = new Set<number>();
  const source = Array.isArray(state.fishingBoats) ? state.fishingBoats : [];
  const usedIds = new Set<number>();
  state.fishingBoats = source.filter(boat => {
    if (!Number.isInteger(boat?.id) || usedIds.has(boat.id) || !ports.has(boat.portId)) return false;
    const tile = state.map[Math.floor(boat.y)]?.[Math.floor(boat.x)];
    if (!waterKind(tile)) return false;
    usedIds.add(boat.id);
    boat.x = Math.floor(boat.x);
    boat.y = Math.floor(boat.y);
    boat.maxDurability = Number.isFinite(boat.maxDurability) && boat.maxDurability > 0
      ? boat.maxDurability : CONFIG.fishingBoats.durability;
    boat.durability = Number.isFinite(boat.durability)
      ? Math.max(0, Math.min(boat.maxDurability, boat.durability)) : boat.maxDurability;
    boat.cargoCapacity = Number.isFinite(boat.cargoCapacity) && boat.cargoCapacity > 0
      ? boat.cargoCapacity : CONFIG.fishingBoats.cargoCapacity;
    boat.cargoFish = Number.isFinite(boat.cargoFish)
      ? Math.max(0, Math.min(boat.cargoCapacity, boat.cargoFish)) : 0;
    boat.status = BOAT_STATUSES.has(boat.status) ? boat.status : 'moored';
    boat.route = Array.isArray(boat.route)
      ? boat.route.filter(point => Number.isInteger(point?.x) && Number.isInteger(point?.y) && waterKind(state.map[point.y]?.[point.x]))
      : [];
    boat.routeIndex = Math.max(0, Math.min(boat.route.length, Math.floor(boat.routeIndex ?? 0)));
    boat.targetGroundId = typeof boat.targetGroundId === 'string' ? boat.targetGroundId : null;
    boat.tripDepthBand = boat.tripDepthBand === 'mid' || boat.tripDepthBand === 'deep'
      ? boat.tripDepthBand : null;
    boat.tripCatchTarget = Number.isFinite(boat.tripCatchTarget)
      ? Math.max(0, Math.min(boat.cargoCapacity, boat.tripCatchTarget!)) : 0;
    boat.tripDistance = Number.isFinite(boat.tripDistance) ? Math.max(0, boat.tripDistance!) : 0;
    boat.fishingProgress = Number.isFinite(boat.fishingProgress)
      ? Math.max(0, Math.min(CONFIG.fishingBoats.fishingWorkSubticks, Math.floor(boat.fishingProgress!))) : 0;
    const fisher = boat.fisherId == null ? undefined : residentById.get(boat.fisherId);
    if (!fisher || !fisher.alive || fisher.job !== 'fisher' || fisher.assignedBuildingId !== boat.portId ||
        usedFisherIds.has(fisher.id)) {
      boat.fisherId = null;
      if (boat.status === 'boarded' || boat.status === 'underway' || boat.status === 'fishing' || boat.status === 'returning') {
        const port = state.buildings.find(building =>
          building.id === boat.portId && building.type === 'fishingPort' && building.built);
        const mooring = port ? fishingWaterAccessForBuilding(state, port)[0] : undefined;
        if (port && boat.cargoFish > 0) addBuildingStock(port, 'fish', boat.cargoFish);
        boat.cargoFish = 0;
        if (mooring) {
          boat.x = mooring.x;
          boat.y = mooring.y;
        }
        boat.status = boat.durability > 0 ? 'moored' : 'disabled';
        clearFishingTrip(boat);
      }
    } else {
      usedFisherIds.add(fisher.id);
      fisher.fishingBoatId = boat.id;
      fisher.x = boat.x;
      fisher.y = boat.y;
      fisher.px = boat.x;
      fisher.py = boat.y;
      fisher.path = [];
    }
    return true;
  });
  const boatById = new Map(state.fishingBoats.map(boat => [boat.id, boat]));
  for (const resident of state.residents as Array<Resident>) {
    if (resident.fishingBoatId != null && boatById.get(resident.fishingBoatId)?.fisherId !== resident.id) {
      resident.fishingBoatId = null;
    }
  }
  for (const building of state.buildings) {
    const order = building.boatWorkOrder;
    if (!order) continue;
    if (building.type !== 'boatyard' || !building.built || !ports.has(order.portId) ||
        (order.kind !== 'build' && order.kind !== 'repair') ||
        !Number.isFinite(order.required) || order.required <= 0) {
      delete building.boatWorkOrder;
      continue;
    }
    order.progress = Number.isFinite(order.progress)
      ? Math.max(0, Math.min(order.required, order.progress)) : 0;
    if (order.kind === 'repair') {
      const boat = order.boatId == null ? undefined : boatById.get(order.boatId);
      if (!boat || boat.portId !== order.portId) delete building.boatWorkOrder;
    } else {
      delete order.boatId;
    }
  }
  state.nextFishingBoatId = Math.max(
    Number.isInteger(state.nextFishingBoatId) ? state.nextFishingBoatId : 1,
    ...state.fishingBoats.map(boat => boat.id + 1),
    1,
  );
}
