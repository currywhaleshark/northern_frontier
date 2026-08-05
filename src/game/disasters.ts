import { CONFIG } from './config';
import { BUILDING_DEFS, leveeAtEdge, type LeveeEdge } from './buildings';
import { cropIdForBuilding, CROP_DEFS } from './crops';
import { addLog } from './events';
import { openGuideOnce } from './guides';
import { withJosa } from './josa';
import { recordAnnals } from './annals';
import { makeRng } from './map';
import { advanceMineCollapseDisaster } from './mineCollapse';
import { damageBuildingTargets } from './raidDamage';
import { getSeason, getYear } from './seasons';
import { seasonWeatherSchedule, weatherForDay } from './weatherSchedule';
import { climateSeverityForState } from './climate';
import type {
  Building, CropId, DisasterAffectedTile, DisasterId, GameState, PendingDisaster, Terrain, WeatherId,
  WeirReservoirTile,
} from './types';

// 재해 발생 함수는 저마다 openGuideOnce(state, 'disaster') 한 줄을 들고 있다 (초회 길잡이 — 모달).
// 규칙: 새 재해 발생 함수를 추가하면 그 자리에도 openGuideOnce(state, 'disaster')를 함께 넣는다.
// 공통 진입점이 없어 개별로 걸린 구조라, 빠뜨리면 그 재해로 처음 만난 플레이어에게만 안내가 없다.
const DISASTER_IDS = new Set<DisasterId>([
  'earlyFrost',
  'lateFrost',
  'locust',
  'drought',
  'springFlood',
  'snowDamage',
  'epidemic',
  'livestockEpidemic',
  'mineCollapse',
  'fire',
]);

const FROST_WEATHERS = new Set<WeatherId>(['frost', 'coldSnap']);
const SNOW_DAMAGE_WEATHERS = new Set<WeatherId>(['heavySnow', 'blizzard']);
const TERRAIN_IDS = new Set<Terrain>(['forest', 'plain', 'mudflat', 'river', 'lake', 'sea', 'mountain', 'fertile', 'rock', 'center']);
const CARDINAL_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
const SPRING_FLOOD_TILE_SET_CACHE = new WeakMap<PendingDisaster, Set<string>>();

function finiteDay(value: unknown): number | null {
  const day = Math.floor(Number(value));
  return Number.isFinite(day) && day >= 1 ? day : null;
}

export function normalizePendingDisasters(value: unknown): PendingDisaster[] {
  if (!Array.isArray(value)) return [];
  const normalized: PendingDisaster[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue;
    const candidate = raw as Partial<PendingDisaster>;
    if (!DISASTER_IDS.has(candidate.id as DisasterId) || typeof candidate.choiceId !== 'string') continue;
    const startedDay = finiteDay(candidate.startedDay);
    const resolveDay = finiteDay(candidate.resolveDay);
    if (startedDay == null || resolveDay == null || resolveDay < startedDay) continue;
    const targetBuildingIds = Array.isArray(candidate.targetBuildingIds)
      ? [...new Set(candidate.targetBuildingIds
        .map(id => Math.floor(Number(id)))
        .filter(id => Number.isFinite(id) && id >= 1))]
      : undefined;
    const progress = Number.isFinite(Number(candidate.progress))
      ? Math.max(0, Number(candidate.progress))
      : undefined;
    const data = candidate.data && typeof candidate.data === 'object'
      ? Object.fromEntries(Object.entries(candidate.data)
        .filter((entry): entry is [string, number] => Number.isFinite(Number(entry[1])))
        .map(([key, entryValue]) => [key, Number(entryValue)]))
      : undefined;
    const affectedTiles = Array.isArray(candidate.affectedTiles)
      ? candidate.affectedTiles.flatMap(rawTile => {
        if (!rawTile || typeof rawTile !== 'object') return [];
        const tile = rawTile as Partial<DisasterAffectedTile>;
        const x = Math.floor(Number(tile.x));
        const y = Math.floor(Number(tile.y));
        if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 ||
            !TERRAIN_IDS.has(tile.originalTerrain as Terrain)) return [];
        const depth = Math.floor(Number(tile.depth));
        return [{
          x,
          y,
          originalTerrain: tile.originalTerrain as Terrain,
          ...(Number.isFinite(depth) && depth > 0 ? { depth } : {}),
        }];
      })
      : undefined;
    const fireSites = candidate.id === 'fire' && Array.isArray(candidate.fireSites)
      ? candidate.fireSites.flatMap(rawSite => {
        if (!rawSite || typeof rawSite !== 'object') return [];
        const site = rawSite as Partial<import('./types').FireSite>;
        const buildingId = Math.floor(Number(site.buildingId));
        const intensity = Number(site.intensity);
        const burnProgress = Number(site.burnProgress);
        const suppressionProgress = Number(site.suppressionProgress);
        const ignitedDay = finiteDay(site.ignitedDay);
        const ignitedSubTick = Math.floor(Number(site.ignitedSubTick));
        if (!Number.isFinite(buildingId) || buildingId < 1 ||
            !Number.isFinite(intensity) || !Number.isFinite(burnProgress) ||
            !Number.isFinite(suppressionProgress) || ignitedDay == null ||
            !Number.isFinite(ignitedSubTick) || ignitedSubTick < 0) return [];
        return [{
          buildingId,
          intensity: Math.max(0, intensity),
          burnProgress: Math.max(0, burnProgress),
          suppressionProgress: Math.max(0, suppressionProgress),
          ignitedDay,
          ignitedSubTick,
        }];
      })
      : undefined;
    const trappedResidentIds = candidate.id === 'mineCollapse' && Array.isArray(candidate.trappedResidentIds)
      ? [...new Set(candidate.trappedResidentIds
        .map(id => Math.floor(Number(id)))
        .filter(id => Number.isFinite(id) && id >= 1))]
      : undefined;
    normalized.push({
      id: candidate.id as DisasterId,
      choiceId: candidate.choiceId,
      startedDay,
      resolveDay,
      ...(targetBuildingIds && targetBuildingIds.length > 0 ? { targetBuildingIds } : {}),
      ...(progress != null ? { progress } : {}),
      ...(data && Object.keys(data).length > 0 ? { data } : {}),
      ...(affectedTiles && affectedTiles.length > 0 ? { affectedTiles } : {}),
      ...(fireSites && fireSites.length > 0 ? { fireSites } : {}),
      ...(trappedResidentIds && trappedResidentIds.length > 0 ? { trappedResidentIds } : {}),
    });
  }
  return normalized;
}

export function hasPendingDisaster(state: GameState, id: DisasterId): boolean {
  return state.pendingDisasters.some(disaster => disaster.id === id);
}

export function startEarlyFrostObservation(state: GameState, targetBuildingId: number): boolean {
  if (hasPendingDisaster(state, 'earlyFrost')) return false;
  state.pendingDisasters.push({
    id: 'earlyFrost',
    choiceId: 'wait-harvest',
    startedDay: state.day,
    resolveDay: state.day + CONFIG.disasters.earlyFrost.observationDays,
    targetBuildingIds: [targetBuildingId],
    progress: 0,
  });
  addLog(
    state,
    `수확을 미루고 ${CONFIG.disasters.earlyFrost.observationDays}일 동안 서리의 추이를 지켜봅니다.`,
    'info',
    true,
  );
  openGuideOnce(state, 'disaster');
  return true;
}

export function lateFrostRecoveryCropId(building: Pick<Building, 'type'>): CropId | null {
  if (building.type === 'field') return 'buckwheat';
  if (building.type === 'paddy') return 'rice';
  return null;
}

export function startLateFrostObservation(state: GameState, targetBuildingId: number): boolean {
  if (hasPendingDisaster(state, 'lateFrost')) return false;
  state.pendingDisasters.push({
    id: 'lateFrost',
    choiceId: 'wait-replant',
    startedDay: state.day,
    resolveDay: state.day + CONFIG.disasters.lateFrost.observationDays,
    targetBuildingIds: [targetBuildingId],
    progress: 0,
  });
  addLog(
    state,
    `갈아엎지 않고 ${CONFIG.disasters.lateFrost.observationDays}일 동안 새싹이 버티는지 지켜봅니다.`,
    'info',
    true,
  );
  openGuideOnce(state, 'disaster');
  return true;
}

export function startLocustInfestation(
  state: GameState,
  targetBuildingIds: number[],
  durationDays: number,
): boolean {
  if (hasPendingDisaster(state, 'locust')) return false;
  const [minimumDuration, maximumDuration] = CONFIG.disasters.locust.durationDays;
  const requestedDuration = Math.floor(durationDays);
  const duration = Number.isFinite(requestedDuration)
    ? Math.max(minimumDuration, Math.min(maximumDuration, requestedDuration))
    : minimumDuration;
  const targets = [...new Set(targetBuildingIds.filter(id => Number.isInteger(id) && id >= 1))];
  if (targets.length === 0) return false;
  state.pendingDisasters.push({
    id: 'locust',
    choiceId: 'endure',
    startedDay: state.day,
    resolveDay: state.day + duration,
    targetBuildingIds: targets,
    progress: 0,
  });
  addLog(state, '황충 떼가 경작지에 내려앉아 잎과 이삭을 갉아먹기 시작했습니다.', 'bad', true);
  openGuideOnce(state, 'disaster');
  return true;
}

export function startDrought(state: GameState, durationDays: number): boolean {
  if (hasPendingDisaster(state, 'drought')) return false;
  const [minimumDuration, maximumDuration] = CONFIG.disasters.drought.durationDays;
  const requestedDuration = Math.floor(durationDays);
  const duration = Number.isFinite(requestedDuration)
    ? Math.max(minimumDuration, Math.min(maximumDuration, requestedDuration))
    : minimumDuration;
  state.pendingDisasters.push({
    id: 'drought',
    choiceId: 'declared',
    startedDay: state.day,
    resolveDay: state.day + duration,
    progress: 0,
  });
  addLog(state, '며칠째 비가 끊기고 강물이 줄어 가뭄이 들었습니다.', 'bad', true);
  openGuideOnce(state, 'disaster');
  return true;
}

export function isDroughtActive(state: Pick<GameState, 'pendingDisasters'>): boolean {
  return state.pendingDisasters.some(disaster => disaster.id === 'drought');
}

export function hasSnowDamageTriggerWeather(
  state: Pick<GameState, 'seed' | 'day' | 'weather'> & Partial<Pick<GameState, 'worldSetup'>>,
): boolean {
  if (!SNOW_DAMAGE_WEATHERS.has(state.weather) || state.day <= 1) return false;
  let consecutive = 1;
  for (let offset = 1; offset < CONFIG.disasters.snowDamage.triggerConsecutiveSnowDays; offset++) {
    if (!SNOW_DAMAGE_WEATHERS.has(weatherForDay(
      state.seed, state.day - offset, climateSeverityForState(state),
    ))) return false;
    consecutive++;
  }
  return consecutive >= CONFIG.disasters.snowDamage.triggerConsecutiveSnowDays;
}

function snowDamageChance(building: Building): number {
  if (building.type === 'hut') return CONFIG.disasters.snowDamage.hutCollapseChance;
  if (building.type === 'ondol') return CONFIG.disasters.snowDamage.ondolCollapseChance;
  return 0;
}

export function maybeStartSnowDamage(state: GameState): boolean {
  if (getSeason(state.day) !== 'winter' || !hasSnowDamageTriggerWeather(state)) return false;
  if (state.lastSnowDamageYear === getYear(state.day)) return false;
  return startSnowDamage(state);
}

/** 설해 발생 본체 — 계절·연속 적설·연차 게이트를 통과한 뒤의 피해 판정과 경보. */
export function startSnowDamage(state: GameState): boolean {
  if (hasPendingDisaster(state, 'snowDamage')) return false;
  const year = getYear(state.day);
  state.lastSnowDamageYear = year;

  const rng = makeRng(state.seed + year * 88750319 + state.day * 971);
  const targets = state.buildings.filter(building =>
    building.built && !building.repairing && snowDamageChance(building) > 0 &&
    rng() < snowDamageChance(building));
  const damaged = damageBuildingTargets(state, rng, targets, 'snowDamage');
  state.pendingDisasters.push({
    id: 'snowDamage',
    choiceId: 'collapse',
    startedDay: state.day,
    resolveDay: state.day + CONFIG.disasters.snowDamage.alertDays,
    targetBuildingIds: targets.map(building => building.id),
    data: { damagedBuildings: damaged.length },
  });
  addLog(
    state,
    damaged.length > 0
      ? `이틀 내린 눈이 지붕을 짓눌렀습니다. 주거 ${damaged.length}채가 설해로 파손되어 수리가 필요합니다.`
      : '이틀 내린 눈이 지붕을 짓눌렀지만, 마을의 주거는 설해를 버텼습니다.',
    damaged.length > 0 ? 'bad' : 'info',
    true,
  );
  if (damaged.length > 0) {
    recordAnnals(state, 'disaster', `설해로 주거 ${damaged.length}채가 파손되었습니다.`);
  }
  openGuideOnce(state, 'disaster');
  return true;
}

export function isFarmIrrigatedByWeir(
  state: Pick<GameState, 'buildings'>,
  farm: Pick<Building, 'type' | 'x' | 'y' | 'w' | 'h'>,
): boolean {
  if (farm.type !== 'field' && farm.type !== 'paddy') return false;
  const width = Math.max(1, Math.floor(farm.w ?? 1));
  const height = Math.max(1, Math.floor(farm.h ?? 1));
  const right = farm.x + width - 1;
  const bottom = farm.y + height - 1;
  return state.buildings.some(building => {
    if (building.type !== 'weir' || !building.built) return false;
    const dx = building.x < farm.x ? farm.x - building.x : building.x > right ? building.x - right : 0;
    const dy = building.y < farm.y ? farm.y - building.y : building.y > bottom ? building.y - bottom : 0;
    return Math.max(dx, dy) <= CONFIG.disasters.drought.weirRadius;
  });
}

export function droughtFarmGrowthMultiplier(state: GameState, farm: Building): number {
  if (!isDroughtActive(state)) return 1;
  return isFarmIrrigatedByWeir(state, farm)
    ? CONFIG.disasters.drought.irrigatedFarmGrowthMultiplier
    : CONFIG.disasters.drought.farmGrowthMultiplier;
}

export function droughtFishYieldMultiplier(state: GameState): number {
  return isDroughtActive(state) ? CONFIG.disasters.drought.fishYieldMultiplier : 1;
}

function tileKey(x: number, y: number): string {
  return `${x},${y}`;
}

function isReservoirLand(tile: { terrain: Terrain }): boolean {
  return tile.terrain === 'plain' || tile.terrain === 'fertile';
}

function isAdjacentToRiver(state: Pick<GameState, 'map'>, x: number, y: number): boolean {
  return CARDINAL_DIRS.some(([dx, dy]) => state.map[y + dy]?.[x + dx]?.terrain === 'river');
}

function reservoirTileOwnedByOtherWeir(
  state: Pick<GameState, 'buildings'>,
  ownerId: number,
  x: number,
  y: number,
): boolean {
  return state.buildings.some(building =>
    building.id !== ownerId &&
    building.type === 'weir' &&
    building.weirReservoir?.tiles.some(tile => tile.x === x && tile.y === y));
}

function reservoirCandidates(state: GameState, weir: Building): WeirReservoirTile[] {
  const radius = CONFIG.disasters.drought.reservoirSearchRadius;
  const candidates: WeirReservoirTile[] = [];
  for (let y = weir.y - radius; y < weir.y; y++) {
    for (let x = weir.x - radius; x <= weir.x + radius; x++) {
      const tile = state.map[y]?.[x];
      if (!tile || !isReservoirLand(tile) || tile.buildingId != null) continue;
      if (!isAdjacentToRiver(state, x, y)) continue;
      if (reservoirTileOwnedByOtherWeir(state, weir.id, x, y)) continue;
      if (state.pendingDisasters.some(disaster =>
        disaster.id === 'springFlood' &&
        disaster.affectedTiles?.some(affected => affected.x === x && affected.y === y))) continue;
      candidates.push({ x, y, originalTerrain: tile.terrain as 'plain' | 'fertile' });
    }
  }
  candidates.sort((left, right) => {
    const leftDy = weir.y - left.y;
    const rightDy = weir.y - right.y;
    const leftDistance = Math.max(Math.abs(left.x - weir.x), leftDy);
    const rightDistance = Math.max(Math.abs(right.x - weir.x), rightDy);
    return leftDistance - rightDistance ||
      leftDy - rightDy ||
      Math.abs(left.x - weir.x) - Math.abs(right.x - weir.x) ||
      left.x - right.x;
  });
  return candidates.slice(0, CONFIG.disasters.drought.reservoirTileCount);
}

export function initializeWeirReservoir(state: GameState, weir: Building): boolean {
  if (weir.type !== 'weir' || !weir.built || weir.weirReservoir) return false;
  const tiles = reservoirCandidates(state, weir);
  if (tiles.length === 0) return false;
  weir.weirReservoir = {
    startedDay: state.day,
    floodedCount: 0,
    tiles,
  };
  return true;
}

function reservoirFillThreshold(index: number, tileCount: number): number {
  const totalDays = Math.max(1, CONFIG.disasters.drought.reservoirFillDays);
  return Math.max(1, Math.ceil(totalDays * (index + 1) / Math.max(1, tileCount)));
}

interface ReservoirWaterVisual {
  x: number;
  y: number;
  progress: number;
}

export function weirReservoirWaterVisuals(state: GameState): ReservoirWaterVisual[] {
  const visuals: ReservoirWaterVisual[] = [];
  for (const building of state.buildings) {
    const reservoir = building.weirReservoir;
    if (building.type !== 'weir' || !reservoir) continue;
    const elapsed = Math.max(0, state.day - reservoir.startedDay);
    for (let index = 0; index < reservoir.tiles.length; index++) {
      const target = reservoir.tiles[index];
      if (state.map[target.y]?.[target.x]?.terrain === 'river') continue;
      const threshold = reservoirFillThreshold(index, reservoir.tiles.length);
      const previousThreshold = index === 0
        ? 0
        : reservoirFillThreshold(index - 1, reservoir.tiles.length) - 1;
      const span = Math.max(1, threshold - previousThreshold);
      const progress = Math.max(0, Math.min(1, (elapsed - previousThreshold) / span));
      if (progress > 0) visuals.push({ x: target.x, y: target.y, progress });
    }
  }
  return visuals;
}

export function advanceWeirReservoirs(state: GameState): boolean {
  for (const building of state.buildings) {
    if (building.type === 'weir' && building.built && !building.weirReservoir) {
      initializeWeirReservoir(state, building);
    }
  }

  let terrainChanged = false;
  for (const building of state.buildings) {
    const reservoir = building.weirReservoir;
    if (building.type !== 'weir' || !building.built || !reservoir) continue;
    const elapsed = Math.max(0, state.day - reservoir.startedDay);
    const before = reservoir.floodedCount;
    let floodedCount = 0;
    for (let index = 0; index < reservoir.tiles.length; index++) {
      const target = reservoir.tiles[index];
      const tile = state.map[target.y]?.[target.x];
      if (!tile) continue;
      if (tile.terrain === 'river') {
        floodedCount++;
        continue;
      }
      if (elapsed < reservoirFillThreshold(index, reservoir.tiles.length) || tile.buildingId != null) continue;
      if (!isReservoirLand(tile)) continue;
      tile.terrain = 'river';
      floodedCount++;
      terrainChanged = true;
    }
    reservoir.floodedCount = floodedCount;
    if (before < reservoir.tiles.length && floodedCount === reservoir.tiles.length) {
      addLog(state, `보 상류에 물이 다 차 강변 ${floodedCount}칸이 잔잔한 저수면으로 바뀌었습니다.`, 'info', true);
    }
  }
  return terrainChanged;
}

export function restoreWeirReservoir(state: GameState, weir: Building): boolean {
  const reservoir = weir.weirReservoir;
  if (weir.type !== 'weir' || !reservoir) return false;
  let terrainChanged = false;
  for (const target of reservoir.tiles) {
    if (reservoirTileOwnedByOtherWeir(state, weir.id, target.x, target.y)) continue;
    const tile = state.map[target.y]?.[target.x];
    if (!tile || tile.terrain !== 'river') continue;
    tile.terrain = target.originalTerrain;
    terrainChanged = true;
  }
  delete weir.weirReservoir;
  return terrainChanged;
}

function floodableTerrain(terrain: Terrain): boolean {
  return terrain !== 'river' && terrain !== 'lake' && terrain !== 'sea' && terrain !== 'mudflat' && terrain !== 'mountain' && terrain !== 'rock';
}

function edgeFromStep(dx: number, dy: number): LeveeEdge {
  if (dx > 0) return 'e';
  if (dx < 0) return 'w';
  if (dy > 0) return 's';
  return 'n';
}

export function springFloodAffectedTiles(state: GameState, maximumDepth: number): DisasterAffectedTile[] {
  const depthLimit = Math.max(1, Math.floor(maximumDepth));
  const queue: Array<{ x: number; y: number; depth: number }> = [];
  const visited = new Set<string>();
  for (const row of state.map) {
    for (const tile of row) {
      if (tile.terrain !== 'river') continue;
      queue.push({ x: tile.x, y: tile.y, depth: 0 });
      visited.add(tileKey(tile.x, tile.y));
    }
  }

  const affected: DisasterAffectedTile[] = [];
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const current = queue[cursor];
    for (const [dx, dy] of CARDINAL_DIRS) {
      const x = current.x + dx;
      const y = current.y + dy;
      const key = tileKey(x, y);
      if (visited.has(key)) continue;
      const tile = state.map[y]?.[x];
      if (!tile) continue;
      if (tile.terrain === 'river') {
        visited.add(key);
        queue.push({ x, y, depth: current.depth });
        continue;
      }
      const depth = current.depth + 1;
      if (depth > depthLimit || !floodableTerrain(tile.terrain)) {
        visited.add(key);
        continue;
      }
      const levee = state.map[current.y]?.[current.x]?.terrain === 'river'
        ? leveeAtEdge(state, current.x, current.y, edgeFromStep(dx, dy))
        : undefined;
      if (levee?.built) continue;
      visited.add(key);
      affected.push({ x, y, originalTerrain: tile.terrain, depth });
      queue.push({ x, y, depth });
    }
  }
  return affected;
}

export function isSpringFloodActive(state: Pick<GameState, 'pendingDisasters'>): boolean {
  return state.pendingDisasters.some(disaster => disaster.id === 'springFlood');
}

export function isSpringFloodedTile(
  state: Pick<GameState, 'pendingDisasters'>,
  x: number,
  y: number,
): boolean {
  const disaster = state.pendingDisasters.find(candidate => candidate.id === 'springFlood');
  if (!disaster) return false;
  let tiles = SPRING_FLOOD_TILE_SET_CACHE.get(disaster);
  if (!tiles) {
    tiles = new Set((disaster.affectedTiles ?? []).map(tile => tileKey(tile.x, tile.y)));
    SPRING_FLOOD_TILE_SET_CACHE.set(disaster, tiles);
  }
  return tiles.has(tileKey(x, y));
}

export function activeSpringFloodTiles(
  state: Pick<GameState, 'pendingDisasters'>,
): readonly DisasterAffectedTile[] {
  return state.pendingDisasters.find(disaster => disaster.id === 'springFlood')?.affectedTiles ?? [];
}

function floodedBuildingIds(state: GameState, tiles: readonly DisasterAffectedTile[]): Set<number> {
  const ids = new Set<number>();
  for (const target of tiles) {
    const buildingId = state.map[target.y]?.[target.x]?.buildingId;
    if (buildingId != null) ids.add(buildingId);
  }
  return ids;
}

function applySpringFloodDamage(
  state: GameState,
  affectedTiles: readonly DisasterAffectedTile[],
  maximumDepth: number,
  rng: () => number,
): {
  damagedBuildings: number;
  damagedBuildingIds: number[];
  lostGrowth: number;
  breachedWeirs: number;
  breachedReservoirTiles: DisasterAffectedTile[];
} {
  const floodedIds = floodedBuildingIds(state, affectedTiles);
  const damageTargets: Building[] = [];
  let breachedWeirs = 0;
  const breachedReservoirTiles: DisasterAffectedTile[] = [];
  for (const building of state.buildings) {
    if (!building.built || building.type === 'center' || building.type === 'levee') continue;
    if (building.type === 'weir') {
      const breachChance = maximumDepth >= CONFIG.disasters.springFlood.deepDepth
        ? CONFIG.disasters.springFlood.weirBreachChanceDeep
        : CONFIG.disasters.springFlood.weirBreachChanceShallow;
      if (rng() < breachChance) {
        for (const tile of building.weirReservoir?.tiles ?? []) {
          breachedReservoirTiles.push({
            x: tile.x,
            y: tile.y,
            originalTerrain: tile.originalTerrain,
            depth: 1,
          });
        }
        restoreWeirReservoir(state, building);
        damageTargets.push(building);
        breachedWeirs++;
        continue;
      }
    }
    const placement = BUILDING_DEFS[building.type].placement;
    const flooded = floodedIds.has(building.id);
    const exposedToRiver = placement === 'river' || placement === 'riverbank' || placement === 'watermill';
    const chance = flooded
      ? CONFIG.disasters.springFlood.floodedBuildingDamageChance
      : exposedToRiver ? CONFIG.disasters.springFlood.riverBuildingDamageChance : 0;
    if (chance > 0 && rng() < chance) damageTargets.push(building);
  }
  const damagedBuildings = damageBuildingTargets(state, rng, damageTargets, 'springFlood').length;
  const damagedBuildingIds = damageTargets
    .filter(building => building.repairing && building.repairCause === 'springFlood')
    .map(building => building.id);

  let lostGrowth = 0;
  for (const building of state.buildings) {
    if ((building.type !== 'field' && building.type !== 'paddy') ||
        !floodedIds.has(building.id) || building.fieldGrowth <= 0) continue;
    const loss = Math.min(building.fieldGrowth, CONFIG.disasters.springFlood.cropGrowthLoss);
    building.fieldGrowth -= loss;
    if (building.fieldGrowth <= 0.5) {
      building.fieldGrowth = 0;
      building.sownArea = 0;
    }
    lostGrowth += loss;
  }
  return { damagedBuildings, damagedBuildingIds, lostGrowth, breachedWeirs, breachedReservoirTiles };
}

export function startSpringFlood(
  state: GameState,
  maximumDepth: number,
  drainageDays: number,
  rng: () => number = makeRng(state.seed + getYear(state.day) * 49979687 + 1709),
): boolean {
  if (isSpringFloodActive(state)) return false;
  const affectedTiles = springFloodAffectedTiles(state, maximumDepth);
  if (affectedTiles.length === 0) return false;
  const duration = Math.max(1, Math.floor(drainageDays));
  const damage = applySpringFloodDamage(state, affectedTiles, maximumDepth, rng);
  const affectedKeys = new Set(affectedTiles.map(tile => tileKey(tile.x, tile.y)));
  for (const tile of damage.breachedReservoirTiles) {
    if (affectedKeys.has(tileKey(tile.x, tile.y))) continue;
    affectedTiles.push(tile);
    affectedKeys.add(tileKey(tile.x, tile.y));
  }
  state.pendingDisasters.push({
    id: 'springFlood',
    choiceId: 'inundated',
    startedDay: state.day,
    resolveDay: state.day + duration,
    progress: 0,
    affectedTiles,
    targetBuildingIds: damage.damagedBuildingIds,
    data: {
      maximumDepth: Math.max(1, Math.floor(maximumDepth)),
      damagedBuildings: damage.damagedBuildings,
      breachedWeirs: damage.breachedWeirs,
      lostGrowth: damage.lostGrowth,
      depositSeed: (state.seed + getYear(state.day) * 67867967 + 2099) >>> 0,
    },
  });
  addLog(
    state,
    `눈 녹은 물이 한꺼번에 밀려와 강이 ${Math.max(1, Math.floor(maximumDepth))}칸 너비로 범람했습니다. ` +
      `건물 ${damage.damagedBuildings}채가 파손되고 경작지 성장도 ${Math.round(damage.lostGrowth)}%p를 잃었습니다.` +
      (damage.breachedWeirs > 0 ? ` 보 ${damage.breachedWeirs}곳이 터져 저수지가 빠졌습니다.` : ''),
    'bad',
    true,
  );
  recordAnnals(state, 'disaster', '해빙기 대홍수가 나 강변이 물에 잠겼습니다.');
  openGuideOnce(state, 'disaster');
  return true;
}

export function maybeStartSpringFlood(state: GameState): boolean {
  if (getSeason(state.day) !== 'spring' || state.weather !== 'thawFlood') return false;
  const year = getYear(state.day);
  if (state.lastSpringFloodYear === year || isSpringFloodActive(state)) return false;
  const thawDays = seasonWeatherSchedule(state.seed, year, 'spring')
    .filter(weather => weather === 'thawFlood').length;
  if (thawDays < CONFIG.disasters.springFlood.triggerMinThawFloodDays) return false;
  state.lastSpringFloodYear = year;
  const depth = thawDays >= CONFIG.disasters.springFlood.deepFloodMinThawFloodDays
    ? CONFIG.disasters.springFlood.deepDepth
    : CONFIG.disasters.springFlood.shallowDepth;
  const [minimumDuration, maximumDuration] = CONFIG.disasters.springFlood.drainageDays;
  const rng = makeRng(state.seed + year * 49979687 + 1709);
  const duration = minimumDuration + Math.floor(rng() * (maximumDuration - minimumDuration + 1));
  return startSpringFlood(state, depth, duration, rng);
}

function resolveSpringFlood(state: GameState, disaster: PendingDisaster): void {
  const rng = makeRng(Math.floor(disaster.data?.depositSeed ?? (state.seed + state.day * 2099)));
  let fertileTiles = 0;
  for (const target of disaster.affectedTiles ?? []) {
    const tile = state.map[target.y]?.[target.x];
    if (!tile || target.originalTerrain !== 'plain' || tile.terrain !== 'plain') continue;
    if (rng() >= CONFIG.disasters.springFlood.fertileDepositChance) continue;
    tile.terrain = 'fertile';
    fertileTiles++;
  }
  addLog(
    state,
    fertileTiles > 0
      ? `큰물이 빠졌습니다. 강이 남긴 흙으로 평지 ${fertileTiles}칸이 비옥해졌습니다.`
      : '큰물이 빠지고 강변 길이 다시 열렸습니다.',
    fertileTiles > 0 ? 'good' : 'info',
    true,
  );
}

function resolveEarlyFrost(state: GameState, disaster: PendingDisaster): void {
  const targetId = disaster.targetBuildingIds?.[0];
  const farm = targetId == null
    ? undefined
    : state.buildings.find(building => building.id === targetId);
  const cropId = farm ? cropIdForBuilding(farm) : null;
  if (!farm || !cropId || farm.fieldGrowth <= 0) {
    addLog(state, '서리의 경과를 살피던 경작지에 더는 거둘 작물이 없어 관찰을 마쳤습니다.', 'info', true);
    return;
  }
  const frostDays = Math.max(0, Math.floor(disaster.progress ?? 0));
  if (frostDays < CONFIG.disasters.earlyFrost.failureFrostDays) {
    addLog(
      state,
      `서리가 오래 이어지지 않았습니다. ${withJosa(CROP_DEFS[cropId].name, '이/가')} 버텨 정상 수확을 기대할 수 있습니다.`,
      'good',
      true,
    );
    return;
  }
  const before = farm.fieldGrowth;
  farm.fieldGrowth *= CONFIG.disasters.earlyFrost.failureGrowthMultiplier;
  addLog(
    state,
    `${CONFIG.disasters.earlyFrost.observationDays}일 중 ${frostDays}일이나 찬 기운이 이어져 ` +
      `${withJosa(CROP_DEFS[cropId].name, '이/가')} 예상 소출의 ${Math.round(before - farm.fieldGrowth)}%를 잃었습니다.`,
    'bad',
    true,
  );
}

function resolveLateFrost(state: GameState, disaster: PendingDisaster): void {
  const targetId = disaster.targetBuildingIds?.[0];
  const farm = targetId == null
    ? undefined
    : state.buildings.find(building => building.id === targetId);
  const cropId = farm ? cropIdForBuilding(farm) : null;
  if (!farm || !cropId || farm.fieldGrowth <= 0) {
    addLog(state, '늦서리를 지켜보던 경작지에 더는 살필 새싹이 없어 관찰을 마쳤습니다.', 'info', true);
    return;
  }
  const frostDays = Math.max(0, Math.floor(disaster.progress ?? 0));
  if (frostDays < CONFIG.disasters.lateFrost.failureFrostDays) {
    addLog(
      state,
      `늦서리가 오래 이어지지 않았습니다. ${withJosa(CROP_DEFS[cropId].name, '이/가')} 다시 기운을 차렸습니다.`,
      'good',
      true,
    );
    return;
  }
  farm.fieldGrowth = 0;
  farm.sownArea = 0;
  farm.cropId = null;
  farm.queuedCropId = null;
  addLog(
    state,
    `${CONFIG.disasters.lateFrost.observationDays}일 중 ${frostDays}일이나 찬 기운이 이어져 ` +
      `${withJosa(CROP_DEFS[cropId].name, '이/가')} 고사했습니다. 여름 작물을 다시 심을 수 있습니다.`,
    'bad',
    true,
  );
}

function damageLocustFarms(state: GameState, disaster: PendingDisaster): void {
  let lostGrowth = 0;
  for (const id of disaster.targetBuildingIds ?? []) {
    const farm = state.buildings.find(building => building.id === id);
    if (!farm || (farm.type !== 'field' && farm.type !== 'paddy') || farm.fieldGrowth <= 0) continue;
    const loss = Math.min(farm.fieldGrowth, CONFIG.disasters.locust.dailyGrowthLoss);
    farm.fieldGrowth -= loss;
    if (farm.fieldGrowth <= 0.5) {
      farm.fieldGrowth = 0;
      farm.sownArea = 0;
    }
    lostGrowth += loss;
  }
  disaster.progress = Math.max(0, disaster.progress ?? 0) + lostGrowth;
}

function resolveLocust(state: GameState, disaster: PendingDisaster): void {
  const lostGrowth = Math.round(Math.max(0, disaster.progress ?? 0));
  addLog(
    state,
    lostGrowth > 0
      ? `황충 떼가 다른 들판으로 떠났습니다. 경작지 성장도를 모두 합쳐 ${lostGrowth}%p 갉아먹었습니다.`
      : '황충 떼가 떠났지만 이미 남아 있던 작물이 없었습니다.',
    lostGrowth > 0 ? 'bad' : 'info',
    true,
  );
}

function resolveDrought(state: GameState, endedByRain: boolean): void {
  addLog(
    state,
    endedByRain
      ? '마침내 비가 내려 메마른 땅을 적셨습니다. 가뭄이 풀렸습니다.'
      : '강물이 차츰 돌아오고 메마른 기운이 누그러져 가뭄이 끝났습니다.',
    'good',
    true,
  );
}

function resolveSnowDamage(state: GameState, disaster: PendingDisaster): void {
  const damaged = Math.max(0, Math.floor(disaster.data?.damagedBuildings ?? 0));
  if (damaged > 0) {
    addLog(state, `설해 피해 조사가 끝났습니다. 파손된 주거 ${damaged}채는 건설담당이 수리합니다.`, 'info');
  }
}

export function advancePendingDisasters(state: GameState): void {
  if (state.pendingDisasters.length === 0) return;
  const remaining: PendingDisaster[] = [];
  for (const disaster of state.pendingDisasters) {
    if (disaster.id === 'mineCollapse') {
      if (advanceMineCollapseDisaster(state, disaster) === 'keep') remaining.push(disaster);
      continue;
    }
    if (disaster.id === 'drought' && state.day > disaster.startedDay && state.weather === 'rain') {
      resolveDrought(state, true);
      continue;
    }
    if (state.day > disaster.startedDay && state.day <= disaster.resolveDay &&
        (disaster.id === 'earlyFrost' || disaster.id === 'lateFrost') && FROST_WEATHERS.has(state.weather)) {
      disaster.progress = Math.max(0, disaster.progress ?? 0) + 1;
    }
    if (state.day > disaster.startedDay && state.day <= disaster.resolveDay && disaster.id === 'locust') {
      damageLocustFarms(state, disaster);
    }
    if (state.day < disaster.resolveDay) {
      remaining.push(disaster);
      continue;
    }
    if (disaster.id === 'earlyFrost') resolveEarlyFrost(state, disaster);
    else if (disaster.id === 'lateFrost') resolveLateFrost(state, disaster);
    else if (disaster.id === 'locust') resolveLocust(state, disaster);
    else if (disaster.id === 'drought') resolveDrought(state, false);
    else if (disaster.id === 'springFlood') resolveSpringFlood(state, disaster);
    else if (disaster.id === 'snowDamage') resolveSnowDamage(state, disaster);
    // 화재는 일 단위 resolveDay가 아니라 서브틱 연소·진화로 끝난다.
    // 기한을 넘긴 경우도 fire.advanceFire가 마지막 피해를 정산한다.
    else if (disaster.id === 'fire') remaining.push(disaster);
  }
  state.pendingDisasters = remaining;
}

export function pendingDisasterDaysRemaining(state: GameState, disaster: PendingDisaster): number {
  return Math.max(0, disaster.resolveDay - state.day);
}
