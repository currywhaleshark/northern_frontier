import { CONFIG } from './config';
import { addLog } from './events';
import { takeFishingGroundStockById } from './fishingGrounds';
import { addBuildingStock } from './inventory';
import { isLakeIceAt } from './lakeIce';
import { makeRng } from './map';
import { seaConditionAt } from './seaConditions';
import { getDayOfSeason, getSeason } from './seasons';
import { coastalGroundAt } from './tidalFlats';
import type {
  Building, FishingBoatFacing, FishingBoatState, FishingGroundDepthBand, FishingGroundTile, FishingPortPier,
  FishingPortPierDirection, GameState, Resident, Tile,
} from './types';

type WaterKind = 'lake' | 'sea';
type WaterfrontBuilding = Pick<Building, 'id' | 'type' | 'x' | 'y' | 'built' | 'boatWorkOrder' | 'portPier'>;

const WATER_DIRECTIONS = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
] as const;

const BOAT_FACINGS = new Set<FishingBoatFacing>(['ne', 'nw', 'se', 'sw']);

export const FISHING_PORT_PIER_MIN_LENGTH = 3;
export const FISHING_PORT_PIER_MAX_LENGTH = 6;

const PORT_PIER_DIRECTIONS: readonly {
  direction: FishingPortPierDirection;
  x: number;
  y: number;
}[] = [
  { direction: 'n', x: 0, y: -1 },
  { direction: 'e', x: 1, y: 0 },
  { direction: 's', x: 0, y: 1 },
  { direction: 'w', x: -1, y: 0 },
];

function portPierStep(direction: FishingPortPierDirection): { x: number; y: number } {
  const found = PORT_PIER_DIRECTIONS.find(candidate => candidate.direction === direction) ?? PORT_PIER_DIRECTIONS[0];
  return { x: found.x, y: found.y };
}

export function fishingPortPierPositions(
  x: number,
  y: number,
  pier: FishingPortPier,
  includeMain = true,
): FishingGroundTile[] {
  const step = portPierStep(pier.direction);
  const positions: FishingGroundTile[] = includeMain ? [{ x, y }] : [];
  for (let distance = 1; distance <= pier.length; distance++) {
    positions.push({ x: x + step.x * distance, y: y + step.y * distance });
  }
  return positions;
}

function validSeaPierPath(map: Tile[][], positions: FishingGroundTile[]): boolean {
  let enteredSea = false;
  for (const position of positions) {
    const tile = map[position.y]?.[position.x];
    if (!tile) return false;
    if (tile.terrain === 'sea') {
      enteredSea = true;
      continue;
    }
    if (enteredSea || tile.terrain === 'lake' || tile.terrain === 'river') return false;
    if (tile.terrain === 'mudflat') continue;
    if ((tile.terrain === 'plain' || tile.terrain === 'fertile') &&
        coastalGroundAt(map, tile.x, tile.y) != null) continue;
    return false;
  }
  return enteredSea;
}

export function fishingPortPierAt(map: Tile[][], x: number, y: number): FishingPortPier | null {
  const main = map[y]?.[x];
  if (!main || (main.terrain !== 'plain' && main.terrain !== 'fertile') || coastalGroundAt(map, x, y) != null) {
    return null;
  }
  for (let length = FISHING_PORT_PIER_MIN_LENGTH; length <= FISHING_PORT_PIER_MAX_LENGTH; length++) {
    for (const candidate of PORT_PIER_DIRECTIONS) {
      const pier: FishingPortPier = { direction: candidate.direction, length };
      const positions = fishingPortPierPositions(x, y, pier, false);
      const terminal = positions[positions.length - 1];
      const water = waterKind(map[terminal.y]?.[terminal.x]);
      if (water === 'lake' && positions.every(position => map[position.y]?.[position.x]?.terrain === 'lake')) {
        return pier;
      }
      if (water === 'sea' && validSeaPierPath(map, positions)) return pier;
    }
  }
  return null;
}

export function fishingPortMooringTile(
  map: Tile[][],
  x: number,
  y: number,
  pier: FishingPortPier,
): FishingGroundTile | null {
  const positions = fishingPortPierPositions(x, y, pier, false);
  const terminal = positions[positions.length - 1];
  return waterKind(map[terminal.y]?.[terminal.x]) ? terminal : null;
}

export function fishingBoatFacingForStep(dx: number, dy: number): FishingBoatFacing | null {
  if (Math.abs(dx) >= Math.abs(dy) && dx > 0) return 'ne';
  if (Math.abs(dx) >= Math.abs(dy) && dx < 0) return 'sw';
  if (dy > 0) return 'se';
  if (dy < 0) return 'nw';
  return null;
}

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
  building: Pick<Building, 'type' | 'x' | 'y' | 'portPier'>,
): FishingGroundTile[] {
  if (building.type === 'fishingPort' && building.portPier) {
    const mooring = fishingPortMooringTile(state.map, building.x, building.y, building.portPier);
    return mooring ? [mooring] : [];
  }
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
  const waterName = state.map[boat.y]?.[boat.x]?.terrain === 'sea' ? '바다' : '호수';
  fisher.phase = boat.status === 'fishing' ? 'working' : 'toWork';
  fisher.task = boat.status === 'fishing'
    ? `${waterName} 어장에서 조업 중`
    : boat.status === 'returning'
      ? '포구로 귀항 중'
      : `${waterName} 어장으로 항해 중`;
}

export interface FishingBoatTripPlan {
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

export type LakeFishingTripPlan = FishingBoatTripPlan;

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

function seaDurabilityMultiplier(state: GameState, kind: WaterKind): number {
  if (kind !== 'sea') return 1;
  const condition = seaConditionAt(state);
  if (condition === 'storm') return CONFIG.fishingBoats.stormTravelDurabilityMultiplier;
  return condition === 'rough' ? CONFIG.fishingBoats.roughDurabilityMultiplier : 1;
}

export function fishingBoatExpectedDurabilityCost(
  depthBand: Extract<FishingGroundDepthBand, 'mid' | 'deep'>,
  roundTripDistance: number,
  expectedCatch: number,
  conditionMultiplier = 1,
): number {
  const depthMultiplier = depthBand === 'deep' ? CONFIG.fishingBoats.deepDurabilityMultiplier : 1;
  return (CONFIG.fishingBoats.departureDurabilityCost +
    roundTripDistance * CONFIG.fishingBoats.travelDurabilityPerTile +
    expectedCatch * CONFIG.fishingBoats.catchDurabilityPerFish * depthMultiplier) * conditionMultiplier;
}

export function fishingBoatTripPlan(
  state: GameState,
  boat: FishingBoatState,
  remainingWorkSubticks: number,
): FishingBoatTripPlan | null {
  const kind = waterKind(state.map[boat.y]?.[boat.x]);
  if (!kind || (kind === 'lake' && !lakeFishingDepartureAllowed(state.day)) ||
      (kind === 'sea' && seaConditionAt(state) === 'storm') ||
      (boat.status !== 'moored' && boat.status !== 'boarded') ||
      boat.durability < CONFIG.fishingBoats.minimumDepartureDurability ||
      boat.cargoFish >= boat.cargoCapacity || remainingWorkSubticks <= 0) return null;
  const port = state.buildings.find(building =>
    building.id === boat.portId && building.type === 'fishingPort' && building.built);
  if (!port) return null;
  const area = portWorkArea(port);
  const candidates: FishingBoatTripPlan[] = [];
  for (const ground of state.fishingGrounds) {
    if (ground.kind !== kind || (ground.depthBand !== 'mid' && ground.depthBand !== 'deep') || ground.stock <= 0) continue;
    for (const target of ground.tiles) {
      if (!pointInArea(target, area) ||
          (kind === 'lake' && isLakeIceAt(state.map, state.day, target.x, target.y))) continue;
      const route = fishingBoatRoute(state.map, boat, target);
      if (route.length === 0 ||
          (kind === 'lake' && route.some(point => isLakeIceAt(state.map, state.day, point.x, point.y)))) continue;
      const returnRoute = shortestRouteToPort(state, port, target);
      if (returnRoute.length === 0 ||
          (kind === 'lake' && returnRoute.some(point => isLakeIceAt(state.map, state.day, point.x, point.y)))) continue;
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
      const expectedDurabilityCost = fishingBoatExpectedDurabilityCost(
        ground.depthBand, roundTripDistance, expectedCatch, seaDurabilityMultiplier(state, kind),
      );
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

export function lakeFishingTripPlan(
  state: GameState,
  boat: FishingBoatState,
  remainingWorkSubticks: number,
): LakeFishingTripPlan | null {
  return state.map[boat.y]?.[boat.x]?.terrain === 'lake'
    ? fishingBoatTripPlan(state, boat, remainingWorkSubticks)
    : null;
}

export function seaFishingTripPlan(
  state: GameState,
  boat: FishingBoatState,
  remainingWorkSubticks: number,
): FishingBoatTripPlan | null {
  return state.map[boat.y]?.[boat.x]?.terrain === 'sea'
    ? fishingBoatTripPlan(state, boat, remainingWorkSubticks)
    : null;
}

export function startFishingBoatTrip(
  state: GameState,
  boatId: number,
  remainingWorkSubticks: number,
): string | null {
  const boat = state.fishingBoats.find(candidate => candidate.id === boatId);
  if (!boat || boat.status !== 'boarded' || boat.fisherId == null) return '어부가 승선한 계류 어선이 필요합니다.';
  const kind = waterKind(state.map[boat.y]?.[boat.x]);
  const plan = fishingBoatTripPlan(state, boat, remainingWorkSubticks);
  if (!plan) {
    if (kind === 'sea' && seaConditionAt(state) === 'storm') return '풍랑 예보로 오늘 바다 출항이 취소되었습니다.';
    return `일몰 전에 다녀올 수 있는 ${kind === 'sea' ? '바다' : '호수'} 중·심수 어장이 없습니다.`;
  }
  boat.targetGroundId = plan.groundId;
  boat.tripDepthBand = plan.depthBand;
  boat.tripCatchTarget = Math.min(boat.cargoCapacity, boat.cargoFish + plan.expectedCatch);
  boat.tripDistance = plan.roundTripDistance;
  boat.fishingProgress = 0;
  boat.route = plan.route;
  boat.routeIndex = 0;
  boat.status = 'underway';
  boat.durability = Math.max(0,
    boat.durability - CONFIG.fishingBoats.departureDurabilityCost *
      seaDurabilityMultiplier(state, kind ?? 'lake'));
  syncFisherToBoat(state, boat);
  return null;
}

export const startLakeFishingTrip = startFishingBoatTrip;
export const startSeaFishingTrip = startFishingBoatTrip;

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

function applySeaStormHazard(state: GameState, boat: FishingBoatState): void {
  const rng = makeRng(
    state.seed + state.day * 0x45d9f3b + boat.id * 0x119de1f3 + CONFIG.fishingBoats.seaConditionSalt,
  );
  const hullDamage = CONFIG.fishingBoats.stormHullDamageMin +
    rng() * (CONFIG.fishingBoats.stormHullDamageMax - CONFIG.fishingBoats.stormHullDamageMin);
  boat.durability = Math.max(0, boat.durability - hullDamage);
  const fisher = boat.fisherId == null ? undefined : state.residents.find(resident => resident.id === boat.fisherId);
  let injuryText = '';
  if (fisher && rng() < CONFIG.fishingBoats.stormInjuryChance) {
    const injury = CONFIG.fishingBoats.stormInjuryMin +
      rng() * (CONFIG.fishingBoats.stormInjuryMax - CONFIG.fishingBoats.stormInjuryMin);
    fisher.health = Math.max(5, fisher.health - injury);
    injuryText = ` 어부도 파도에 휩쓸려 다쳤습니다.`;
  }
  addLog(state, `출어 중 풍랑을 만나 어선 #${boat.id}의 선체가 ${Math.ceil(hullDamage)}만큼 파손되었습니다.${injuryText}`, 'bad', true);
}

export function advanceFishingBoatTrip(state: GameState, boatId: number, forceReturn = false): void {
  const boat = state.fishingBoats.find(candidate => candidate.id === boatId);
  if (!boat || boat.fisherId == null ||
      (boat.status !== 'underway' && boat.status !== 'fishing' && boat.status !== 'returning')) return;
  const kind = waterKind(state.map[boat.y]?.[boat.x]);
  const seaCondition = kind === 'sea' ? seaConditionAt(state) : 'calm';
  if (kind === 'sea' && seaCondition === 'storm' && boat.status !== 'returning') {
    applySeaStormHazard(state, boat);
    beginReturn(state, boat);
  }
  if (forceReturn && boat.status !== 'returning') beginReturn(state, boat);
  if (boat.status === 'underway' || boat.status === 'returning') {
    const nextIndex = boat.routeIndex + 1;
    const next = boat.route[nextIndex];
    if (next) {
      const facing = fishingBoatFacingForStep(next.x - boat.x, next.y - boat.y);
      if (facing) boat.facing = facing;
      boat.routeIndex = nextIndex;
      boat.x = next.x;
      boat.y = next.y;
      const travelMultiplier = kind === 'sea' && seaCondition === 'storm'
        ? CONFIG.fishingBoats.stormTravelDurabilityMultiplier
        : kind === 'sea' && seaCondition === 'rough'
          ? CONFIG.fishingBoats.roughDurabilityMultiplier
          : 1;
      boat.durability = Math.max(0,
        boat.durability - CONFIG.fishingBoats.travelDurabilityPerTile * travelMultiplier);
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
  const conditionMultiplier = kind === 'sea' && seaCondition === 'rough'
    ? CONFIG.fishingBoats.roughDurabilityMultiplier : 1;
  boat.durability = Math.max(0,
    boat.durability - taken * CONFIG.fishingBoats.catchDurabilityPerFish * depthMultiplier * conditionMultiplier);
  if (boat.fishingProgress >= CONFIG.fishingBoats.fishingWorkSubticks ||
      boat.cargoFish >= boat.cargoCapacity || boat.cargoFish >= targetCatch || ground.stock <= 0) {
    beginReturn(state, boat);
  }
  syncFisherToBoat(state, boat);
}

export const advanceLakeFishingTrip = advanceFishingBoatTrip;

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
    facing: fishingBoatFacingForStep(mooring.x - port.x, mooring.y - port.y) ?? 'ne',
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
    boat.facing = BOAT_FACINGS.has(boat.facing) ? boat.facing : 'ne';
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
