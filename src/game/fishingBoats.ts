import { CONFIG } from './config';
import type {
  Building, FishingBoatState, FishingGroundTile, GameState, Resident, Tile,
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
  if (!port || Math.abs(resident.x - port.x) + Math.abs(resident.y - port.y) > 1) {
    return '포구에 도착한 어부만 승선할 수 있습니다.';
  }
  boat.fisherId = resident.id;
  boat.status = 'boarded';
  resident.fishingBoatId = boat.id;
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
  boat.route = [];
  boat.routeIndex = 0;
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
    const fisher = boat.fisherId == null ? undefined : residentById.get(boat.fisherId);
    if (!fisher || !fisher.alive || fisher.job !== 'fisher' || fisher.assignedBuildingId !== boat.portId ||
        usedFisherIds.has(fisher.id)) {
      boat.fisherId = null;
      if (boat.status === 'boarded') boat.status = boat.durability > 0 ? 'moored' : 'disabled';
    } else {
      usedFisherIds.add(fisher.id);
      fisher.fishingBoatId = boat.id;
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
