import { CONFIG } from './config';
import { DAY_CYCLE_SUBTICKS } from './dayCycle';
import { addLog } from './events';
import { takeFishingGroundStockById } from './fishingGrounds';
import { addForeignSiteMemory, isForeignSiteOperational } from './foreignSites';
import { takeHabitatStock } from './habitats';
import { findPath, isTerrainPassable } from './pathfinding';
import { getSeason } from './seasons';
import type {
  ClaimZone,
  ForeignSite,
  ForeignSiteActivityCondition,
  ForeignSiteParty,
  ForeignSitePartyKind,
  GameState,
  ResourceId,
  Tile,
} from './types';

interface ActivityTarget {
  kind: ForeignSitePartyKind;
  x: number;
  y: number;
  resourceTargetId?: string;
  path: Array<{ x: number; y: number }>;
}

const FOOD_CARGO = new Set<ResourceId>(['grain', 'meat', 'fish']);

function absoluteTick(state: Pick<GameState, 'day' | 'subTick'>): number {
  return state.day * DAY_CYCLE_SUBTICKS + state.subTick;
}

function hash(seed: number, siteId: number, sequence: number, x = 0, y = 0): number {
  let value = (seed ^ Math.imul(siteId + 19, 0x45d9f3b) ^
    Math.imul(sequence + 73, 0x27d4eb2d) ^ Math.imul(x + 101, 0x165667b1) ^
    Math.imul(y + 149, 0x9e3779b1)) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d) >>> 0;
  value ^= value >>> 15;
  return value >>> 0;
}

function withinSite(site: ForeignSite, x: number, y: number): boolean {
  return x >= site.x && x < site.x + site.width && y >= site.y && y < site.y + site.height;
}

function siteStart(site: ForeignSite): { x: number; y: number } {
  return {
    x: site.x + Math.floor((site.width - 1) / 2),
    y: site.y + Math.floor((site.height - 1) / 2),
  };
}

function partyPassable(state: GameState, site: ForeignSite, x: number, y: number): boolean {
  if (!isTerrainPassable(state, x, y)) return false;
  return !state.foreignSites.some(other => other.id !== site.id && withinSite(other, x, y));
}

function zoneContains(zone: ClaimZone, x: number, y: number): boolean {
  const dx = x - zone.x;
  const dy = y - zone.y;
  return dx * dx + dy * dy <= zone.radius * zone.radius;
}

function zonesFor(state: GameState, site: ForeignSite, kinds: readonly ClaimZone['kind'][]): ClaimZone[] {
  return state.claimZones.filter(zone => zone.siteId === site.id && kinds.includes(zone.kind));
}

function candidateTiles(
  state: GameState,
  site: ForeignSite,
  zones: readonly ClaimZone[],
  accepts: (tile: Tile) => boolean,
): Tile[] {
  const start = siteStart(site);
  const candidates: Tile[] = [];
  for (const zone of zones) {
    for (let y = zone.y - zone.radius; y <= zone.y + zone.radius; y++) {
      for (let x = zone.x - zone.radius; x <= zone.x + zone.radius; x++) {
        const tile = state.map[y]?.[x];
        if (!tile || !zoneContains(zone, x, y) || withinSite(site, x, y) || !accepts(tile)) continue;
        if (!partyPassable(state, site, x, y)) continue;
        candidates.push(tile);
      }
    }
  }
  const sequence = site.activity?.activitySequence ?? 0;
  return candidates.sort((left, right) => {
    const leftDistance = Math.max(Math.abs(left.x - start.x), Math.abs(left.y - start.y));
    const rightDistance = Math.max(Math.abs(right.x - start.x), Math.abs(right.y - start.y));
    return leftDistance - rightDistance ||
      hash(state.seed, site.id, sequence, left.x, left.y) - hash(state.seed, site.id, sequence, right.x, right.y);
  });
}

function firstReachableTarget(
  state: GameState,
  site: ForeignSite,
  kind: ForeignSitePartyKind,
  candidates: readonly { x: number; y: number; resourceTargetId?: string }[],
): ActivityTarget | null {
  const start = siteStart(site);
  const selected = candidates.slice(0, 24);
  const byTile = new Map(selected.map(candidate => [`${candidate.x},${candidate.y}`, candidate]));
  const path = findPath(
    state,
    start.x,
    start.y,
    tile => byTile.has(`${tile.x},${tile.y}`),
    (x, y) => partyPassable(state, site, x, y),
  );
  const endpoint = path?.[path.length - 1];
  if (!path || path.length === 0 || !endpoint) return null;
  const candidate = byTile.get(`${endpoint.x},${endpoint.y}`);
  return candidate ? { kind, ...candidate, path } : null;
}

function farmTarget(state: GameState, site: ForeignSite): ActivityTarget | null {
  const zones = zonesFor(state, site, ['field']);
  const candidates = candidateTiles(state, site, zones, tile =>
    tile.buildingId == null && (tile.terrain === 'plain' || tile.terrain === 'fertile'));
  return firstReachableTarget(state, site, 'farm', candidates);
}

function forageTarget(state: GameState, site: ForeignSite): ActivityTarget | null {
  const owned = zonesFor(state, site, ['forest', 'hunting', 'fishing', 'passage']);
  const candidates = candidateTiles(state, site, owned, tile =>
    tile.buildingId == null && tile.terrain === 'forest');
  return firstReachableTarget(state, site, 'forage', candidates);
}

function huntTarget(state: GameState, site: ForeignSite): ActivityTarget | null {
  const zones = zonesFor(state, site, ['hunting']);
  const candidates = candidateTiles(state, site, zones, tile => tile.buildingId == null && tile.terrain === 'forest')
    .flatMap(tile => {
      const habitat = state.habitats
        .filter(candidate => candidate.active && candidate.stock > 0 &&
          (tile.x - candidate.x) ** 2 + (tile.y - candidate.y) ** 2 <= candidate.radius ** 2)
        .sort((left, right) => right.stock - left.stock || left.id - right.id)[0];
      return habitat ? [{ x: tile.x, y: tile.y, resourceTargetId: `habitat:${habitat.id}` }] : [];
    });
  return firstReachableTarget(state, site, 'hunt', candidates);
}

function fishingBlockedBySeason(state: GameState, kind: string): boolean {
  return getSeason(state.day) === 'winter' && (kind === 'river' || kind === 'lake');
}

function fishTarget(state: GameState, site: ForeignSite): ActivityTarget | null {
  const zones = zonesFor(state, site, ['fishing']);
  const candidates: Array<{ x: number; y: number; resourceTargetId: string }> = [];
  const steps = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
  for (const ground of state.fishingGrounds) {
    if (ground.depthBand !== 'shore' || ground.stock <= 0 || fishingBlockedBySeason(state, ground.kind)) continue;
    for (const water of ground.tiles) {
      if (!zones.some(zone => zoneContains(zone, water.x, water.y))) continue;
      for (const [dx, dy] of steps) {
        const x = water.x + dx;
        const y = water.y + dy;
        const tile = state.map[y]?.[x];
        if (!tile || withinSite(site, x, y) || !partyPassable(state, site, x, y)) continue;
        candidates.push({ x, y, resourceTargetId: `ground:${ground.id}` });
      }
    }
  }
  const start = siteStart(site);
  candidates.sort((left, right) =>
    Math.max(Math.abs(left.x - start.x), Math.abs(left.y - start.y)) -
      Math.max(Math.abs(right.x - start.x), Math.abs(right.y - start.y)) ||
    hash(state.seed, site.id, site.activity?.activitySequence ?? 0, left.x, left.y) -
      hash(state.seed, site.id, site.activity?.activitySequence ?? 0, right.x, right.y));
  return firstReachableTarget(state, site, 'fish', candidates);
}

function activityTarget(state: GameState, site: ForeignSite): ActivityTarget | null {
  if (site.type === 'village') return farmTarget(state, site) ?? forageTarget(state, site);
  if (site.type === 'fishingVillage') return fishTarget(state, site) ?? forageTarget(state, site);
  if (site.type === 'seasonalCamp') return huntTarget(state, site) ?? forageTarget(state, site);
  return null;
}

function canDepart(state: GameState, site: ForeignSite): boolean {
  if (!isForeignSiteOperational(site) || site.type === 'banditLair' || site.type === 'ruin' || site.type === 'outpost') return false;
  if (state.weather === 'blizzard' || state.siegeState || state.tacticalBattle || state.battle) return false;
  return !state.foreignSiteParties.some(party => party.siteId === site.id);
}

function spawnParty(state: GameState, site: ForeignSite): boolean {
  const target = activityTarget(state, site);
  const activity = site.activity!;
  if (!target) {
    activity.nextActivityDay = state.day + 1;
    return false;
  }
  const start = siteStart(site);
  const maxMembers = Math.max(1, Math.min(CONFIG.foreignSites.activity.maxMembers, Math.ceil(site.population / 12)));
  const memberCount = 1 + hash(state.seed, site.id, activity.activitySequence, state.day) % maxMembers;
  state.foreignSiteParties.push({
    id: state.nextForeignSitePartyId++,
    siteId: site.id,
    kind: target.kind,
    phase: 'outbound',
    x: start.x,
    y: start.y,
    px: start.x + 0.5,
    py: start.y + 0.5,
    path: target.path,
    target: { x: target.x, y: target.y },
    memberCount,
    cargo: {},
    departedDay: state.day,
    activitySequence: activity.activitySequence,
    resourceTargetId: target.resourceTargetId,
    spotted: site.discovered,
    facing: target.x < start.x ? -1 : 1,
  });
  activity.activitySequence++;
  activity.nextActivityDay = state.day + CONFIG.foreignSites.activity.departureIntervalDays;
  return true;
}

function movementSpeed(state: GameState): number {
  const base = CONFIG.foreignSites.activity.travelSpeedTilesPerTick;
  if (state.weather === 'heavySnow') return base * 0.72;
  if (state.weather === 'coldSnap') return base * 0.85;
  if (state.weather === 'rain' || state.weather === 'thawFlood') return base * 0.9;
  return base;
}

function moveParty(state: GameState, party: ForeignSiteParty): boolean {
  const next = party.path[0];
  if (!next) return true;
  const tx = next.x + 0.5;
  const ty = next.y + 0.5;
  const dx = tx - party.px;
  const dy = ty - party.py;
  const distance = Math.hypot(dx, dy);
  const speed = movementSpeed(state);
  if (distance <= speed + 1e-9) {
    party.px = tx;
    party.py = ty;
    party.x = next.x;
    party.y = next.y;
    party.path.shift();
    return party.path.length === 0;
  }
  party.px += dx / distance * speed;
  party.py += dy / distance * speed;
  if (Math.abs(dx) > 0.001) party.facing = dx < 0 ? -1 : 1;
  return false;
}

function setCargo(party: ForeignSiteParty, resource: ResourceId, amount: number): void {
  if (!Number.isFinite(amount) || amount <= 0) return;
  party.cargo[resource] = (party.cargo[resource] ?? 0) + amount;
}

function harvest(state: GameState, party: ForeignSiteParty): void {
  const cfg = CONFIG.foreignSites.activity;
  if (party.kind === 'hunt') {
    const habitatId = Number(party.resourceTargetId?.replace('habitat:', ''));
    const habitat = state.habitats.find(candidate => candidate.id === habitatId);
    const taken = habitat ? takeHabitatStock(habitat, cfg.huntStockPerTrip) : 0;
    setCargo(party, 'meat', taken * 1.4);
    setCargo(party, 'hide', taken * 0.45);
    return;
  }
  if (party.kind === 'fish') {
    const groundId = party.resourceTargetId?.replace('ground:', '');
    const taken = groundId ? takeFishingGroundStockById(state.fishingGrounds, groundId, cfg.fishStockPerTrip) : 0;
    setCargo(party, 'fish', taken * 1.35);
    return;
  }
  if (party.kind === 'farm') {
    const season = getSeason(state.day);
    const multiplier = season === 'autumn' ? 1.35 : season === 'winter' ? 0.25 : season === 'spring' ? 0.8 : 1;
    setCargo(party, 'grain', cfg.farmFoodPerTrip * multiplier);
    return;
  }
  const forageMultiplier = getSeason(state.day) === 'winter' ? 0.5 : 1;
  setCargo(party, 'herbs', cfg.forageHerbsPerTrip * forageMultiplier);
  setCargo(party, 'wood', cfg.forageWoodPerTrip * forageMultiplier);
}

function returnPath(state: GameState, site: ForeignSite, party: ForeignSiteParty): Array<{ x: number; y: number }> | null {
  return findPath(
    state,
    party.x,
    party.y,
    tile => withinSite(site, tile.x, tile.y),
    (x, y) => partyPassable(state, site, x, y),
  );
}

function beginReturn(state: GameState, site: ForeignSite, party: ForeignSiteParty): void {
  const path = returnPath(state, site, party);
  if (!path) {
    party.phase = 'waiting';
    party.path = [];
    return;
  }
  party.phase = 'returning';
  party.path = path;
  delete party.workUntilTick;
}

function depositCargo(site: ForeignSite, party: ForeignSiteParty): void {
  const activity = site.activity!;
  for (const [resource, rawAmount] of Object.entries(party.cargo) as Array<[ResourceId, number]>) {
    const amount = Number.isFinite(rawAmount) ? Math.max(0, rawAmount) : 0;
    if (amount <= 0) continue;
    activity.pendingProduction[resource] = (activity.pendingProduction[resource] ?? 0) + amount;
    if (FOOD_CARGO.has(resource)) {
      site.foodStock += amount * 0.72;
      site.tradeStock[resource] = (site.tradeStock[resource] ?? 0) + amount * 0.28;
    } else {
      site.tradeStock[resource] = (site.tradeStock[resource] ?? 0) + amount;
    }
  }
}

function updateSpotted(state: GameState, site: ForeignSite, party: ForeignSiteParty): void {
  if (party.spotted || site.discovered) {
    party.spotted = true;
    return;
  }
  party.spotted = state.residents.some(resident => resident.alive &&
    (resident.x - party.x) ** 2 + (resident.y - party.y) ** 2 <= 6 ** 2);
}

export function foreignSitePartiesTick(state: GameState): void {
  const finished = new Set<number>();
  const now = absoluteTick(state);
  for (const party of state.foreignSiteParties) {
    const site = state.foreignSites.find(candidate => candidate.id === party.siteId);
    if (!site || !isForeignSiteOperational(site)) {
      finished.add(party.id);
      continue;
    }
    updateSpotted(state, site, party);
    if (party.phase === 'outbound') {
      if (moveParty(state, party)) {
        party.phase = 'working';
        party.workUntilTick = now + CONFIG.foreignSites.activity.workDurationTicks;
      }
      continue;
    }
    if (party.phase === 'working') {
      if (now < (party.workUntilTick ?? now)) continue;
      harvest(state, party);
      beginReturn(state, site, party);
      continue;
    }
    if (party.phase === 'returning' || party.phase === 'retreating') {
      if (!moveParty(state, party)) continue;
      depositCargo(site, party);
      site.activity!.nextActivityDay = Math.max(
        site.activity!.nextActivityDay,
        state.day + CONFIG.foreignSites.activity.departureIntervalDays,
      );
      finished.add(party.id);
    }
  }
  if (finished.size > 0) {
    state.foreignSiteParties = state.foreignSiteParties.filter(party => !finished.has(party.id));
  }
}

function foodDays(site: ForeignSite): number {
  const dailyNeed = Math.max(0.01, site.population * CONFIG.foreignSites.activity.foodConsumptionPerPersonPerDay);
  return Math.max(0, site.foodStock) / dailyNeed;
}

export function foreignSiteFoodDays(site: ForeignSite): number {
  return foodDays(site);
}

function statusText(condition: ForeignSiteActivityCondition): string {
  if (condition === 'prosperous') return '먹을거리와 교역품이 넉넉해져 거주지가 풍족해졌습니다.';
  if (condition === 'hungry') return '먹을거리가 줄어 거주지에 굶주림이 번지고 있습니다.';
  if (condition === 'sick') return '오랜 굶주림과 추위로 거주지에 병이 돌고 있습니다.';
  return '먹을거리 사정이 나아져 거주지가 안정을 되찾았습니다.';
}

function applyCondition(state: GameState, site: ForeignSite, condition: ForeignSiteActivityCondition): void {
  const activity = site.activity!;
  if (activity.condition === condition) return;
  activity.condition = condition;
  if (site.status === 'stable' || site.status === 'prosperous' || site.status === 'hungry' || site.status === 'sick') {
    site.status = condition;
  }
  const text = statusText(condition);
  addForeignSiteMemory(state, site.id, text, condition === 'prosperous' || condition === 'stable' ? 'good' : 'bad');
  if (site.discovered) addLog(state, `${site.name}: ${text}`, condition === 'prosperous' || condition === 'stable' ? 'good' : 'bad');
}

function settleSite(state: GameState, site: ForeignSite): void {
  const activity = site.activity!;
  const elapsed = Math.max(1, state.day - activity.lastSettlementDay);
  const cfg = CONFIG.foreignSites.activity;
  const season = getSeason(state.day);
  const seasonMultiplier = season === 'autumn' ? 1.18 : season === 'winter' ? 0.62 : season === 'summer' ? 1.08 : 0.95;
  const typeMultiplier = site.type === 'fishingVillage' ? 0.96 : site.type === 'seasonalCamp' ? 0.78 : 1;
  const passive = site.population * cfg.passiveFoodPerPersonPerDay * elapsed * seasonMultiplier * typeMultiplier;
  const consumption = site.population * cfg.foodConsumptionPerPersonPerDay * elapsed;
  site.foodStock = Math.max(0, site.foodStock + passive - consumption);

  const days = foodDays(site);
  const produced = Object.values(activity.pendingProduction).reduce((sum, amount) => sum + (amount ?? 0), 0);
  activity.recentProduction = { ...activity.pendingProduction };
  activity.pendingProduction = {};
  activity.lastSettlementDay = state.day;

  if (days < cfg.hungryFoodDays) {
    activity.hungerDays += elapsed;
    activity.surplusSettlements = 0;
    if (activity.hungerDays >= cfg.sicknessHungerDays &&
        (season === 'winter' || state.weather === 'coldSnap')) {
      activity.sicknessDays += elapsed;
      applyCondition(state, site, 'sick');
    } else if (activity.hungerDays >= cfg.settlementIntervalDays * 2) {
      applyCondition(state, site, 'hungry');
    }
    return;
  }

  activity.hungerDays = Math.max(0, activity.hungerDays - elapsed * 2);
  activity.sicknessDays = Math.max(0, activity.sicknessDays - elapsed);
  if (days >= cfg.prosperousFoodDays && produced > 0) {
    activity.surplusSettlements++;
    if (activity.surplusSettlements >= cfg.prosperousSettlements) applyCondition(state, site, 'prosperous');
    return;
  }
  activity.surplusSettlements = 0;
  if (days >= cfg.recoveryFoodDays && (activity.condition === 'hungry' || activity.condition === 'sick')) {
    applyCondition(state, site, 'stable');
  } else if (activity.condition === 'prosperous' && days < cfg.prosperousFoodDays * 0.7) {
    applyCondition(state, site, 'stable');
  }
}

function retryWaitingParty(state: GameState, party: ForeignSiteParty): void {
  const site = state.foreignSites.find(candidate => candidate.id === party.siteId);
  if (!site) return;
  const path = returnPath(state, site, party);
  if (!path) return;
  party.path = path;
  party.phase = 'returning';
}

export function dailyForeignSiteActivityTick(state: GameState): void {
  for (const party of state.foreignSiteParties) {
    if (party.phase === 'waiting') retryWaitingParty(state, party);
  }
  for (const site of state.foreignSites) {
    const activity = site.activity;
    if (!activity) continue;
    if (site.type !== 'banditLair' && site.type !== 'ruin' && isForeignSiteOperational(site) &&
        !(site.type === 'seasonalCamp' && site.seasonalActive === false) &&
        state.day - activity.lastSettlementDay >= CONFIG.foreignSites.activity.settlementIntervalDays) {
      settleSite(state, site);
    }
    if (state.day >= activity.nextActivityDay && canDepart(state, site)) spawnParty(state, site);
  }
}

export function foreignSitePartyKindLabel(kind: ForeignSitePartyKind): string {
  if (kind === 'farm') return '경작하러 나감';
  if (kind === 'hunt') return '사냥 중';
  if (kind === 'fish') return '고기잡이 중';
  return '숲 채집 중';
}
