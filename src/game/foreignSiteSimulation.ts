import { CONFIG } from './config';
import { footprintTilesOf } from './buildings';
import { applyScheduledClaimWarning } from './claimZones';
import { DAY_CYCLE_SUBTICKS } from './dayCycle';
import { activeClaimAccord } from './diplomacy';
import { addLog, openForeignSiteCaravanTrade } from './events';
import { takeFishingGroundStockById } from './fishingGrounds';
import { addForeignSiteMemory, isForeignSiteOperational } from './foreignSites';
import { takeHabitatStock } from './habitats';
import { findPath, isTerrainPassable } from './pathfinding';
import { changeRelation, getRelation } from './relations';
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

function ensureZoneGrowth(zone: ClaimZone, day: number): NonNullable<ClaimZone['growth']> {
  zone.growth ??= {
    baseRadius: zone.radius,
    targetRadius: zone.radius,
    pressure: 0,
    lastBoundaryChangeDay: day,
    establishedUseBuildingIds: [],
  };
  return zone.growth;
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
  if (site.seasonalTransition) return false;
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

function currentSeasonKey(state: GameState): number {
  return Math.floor(Math.max(0, state.day - 1) / CONFIG.time.seasonDays);
}

function sitePassageActive(state: GameState, site: ForeignSite): boolean {
  return state.claimZones.some(zone => zone.siteId === site.id && zone.kind === 'passage' &&
    ((zone.permittedUntilDay ?? 0) >= state.day || !!activeClaimAccord(state, zone.id)));
}

function visitBuildingTarget(
  state: GameState,
  site: ForeignSite,
  kind: ForeignSitePartyKind,
  buildingTypes: readonly string[],
): ActivityTarget | null {
  const candidates: Array<{ x: number; y: number; resourceTargetId: string }> = [];
  const seen = new Set<string>();
  for (const building of state.buildings) {
    if (!building.built || !buildingTypes.includes(building.type)) continue;
    for (const tile of footprintTilesOf(state, building) ?? []) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const x = tile.x + dx;
          const y = tile.y + dy;
          const key = `${x},${y}`;
          if (seen.has(key) || !partyPassable(state, site, x, y)) continue;
          seen.add(key);
          candidates.push({ x, y, resourceTargetId: `building:${building.id}` });
        }
      }
    }
  }
  return firstReachableTarget(state, site, kind, candidates);
}

function spawnVisitorParty(
  state: GameState,
  site: ForeignSite,
  target: ActivityTarget,
  memberCount: number,
  cargo: Partial<Record<ResourceId, number>> = {},
): ForeignSiteParty {
  const activity = site.activity!;
  const start = siteStart(site);
  const party: ForeignSiteParty = {
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
    cargo,
    departedDay: state.day,
    activitySequence: activity.activitySequence++,
    resourceTargetId: target.resourceTargetId,
    spotted: site.discovered,
    facing: target.x < start.x ? -1 : 1,
  };
  state.foreignSiteParties.push(party);
  return party;
}

function caravanCargo(site: ForeignSite): Partial<Record<ResourceId, number>> {
  const entry = (Object.entries(site.tradeStock) as Array<[ResourceId, number]>)
    .filter(([, amount]) => Number.isFinite(amount) && amount >= 1)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0];
  return entry ? { [entry[0]]: Math.min(6, Math.floor(entry[1])) } : {};
}

function spawnCaravan(state: GameState, site: ForeignSite): boolean {
  const target = visitBuildingTarget(state, site, 'caravan', ['market', 'dock']);
  if (!target) {
    site.activity!.tradeRouteBlockedUntilDay = state.day + 3;
    return false;
  }
  spawnVisitorParty(state, site, target, Math.min(3, CONFIG.foreignSites.activity.maxMembers), caravanCargo(site));
  site.activity!.tradeRouteBlockedUntilDay = undefined;
  site.activity!.nextDiplomaticDay = state.day + CONFIG.foreignSites.activity.diplomaticIntervalDays;
  return true;
}

function spawnAidMessenger(state: GameState, site: ForeignSite): boolean {
  const target = visitBuildingTarget(state, site, 'messenger', ['center', 'market']);
  if (!target) return false;
  spawnVisitorParty(state, site, target, 1);
  site.activity!.lastAidRequestSeasonKey = currentSeasonKey(state);
  site.activity!.nextDiplomaticDay = state.day + CONFIG.foreignSites.activity.diplomaticIntervalDays;
  return true;
}

function migrationPath(state: GameState, site: ForeignSite): Array<{ x: number; y: number }> | null {
  const start = siteStart(site);
  const width = state.map[0]?.length ?? 0;
  const height = state.map.length;
  return findPath(
    state,
    start.x,
    start.y,
    tile => tile.x === 0 || tile.y === 0 || tile.x === width - 1 || tile.y === height - 1,
    (x, y) => partyPassable(state, site, x, y),
  );
}

function spawnSeasonalMigration(state: GameState, site: ForeignSite): boolean {
  const direction = site.seasonalTransition;
  if (!direction || state.foreignSiteParties.some(party => party.siteId === site.id)) return false;
  const outward = migrationPath(state, site);
  if (!outward?.length) return false;
  const camp = siteStart(site);
  const fullOutward = [camp, ...outward];
  const route = direction === 'entering' ? [...fullOutward].reverse() : fullOutward;
  const start = route[0];
  const path = route.slice(1);
  const target = path[path.length - 1] ?? start;
  const party: ForeignSiteParty = {
    id: state.nextForeignSitePartyId++, siteId: site.id, kind: 'seasonalMigration', phase: 'outbound',
    x: start.x, y: start.y, px: start.x + 0.5, py: start.y + 0.5,
    path, target: { x: target.x, y: target.y },
    memberCount: Math.min(3, CONFIG.foreignSites.activity.maxMembers),
    cargo: direction === 'leaving' ? caravanCargo(site) : {},
    departedDay: state.day, activitySequence: site.activity!.activitySequence++, migrationDirection: direction,
    spotted: site.discovered, facing: target.x < start.x ? -1 : 1,
  };
  state.foreignSiteParties.push(party);
  return true;
}

function boundaryExpansionAllowed(state: GameState, zone: ClaimZone, radius: number): boolean {
  const center = state.buildings.find(building => building.type === 'center');
  if (center) {
    const footprint = footprintTilesOf(state, center) ?? [];
    if (footprint.some(tile => (tile.x - zone.x) ** 2 + (tile.y - zone.y) ** 2 <= radius ** 2)) return false;
  }
  for (const site of state.foreignSites) {
    if (site.id === zone.siteId) continue;
    for (let y = site.y; y < site.y + site.height; y++) {
      for (let x = site.x; x < site.x + site.width; x++) {
        if ((x - zone.x) ** 2 + (y - zone.y) ** 2 <= radius ** 2) return false;
      }
    }
  }
  return !state.claimZones.some(other => other.siteId !== zone.siteId &&
    Math.hypot(other.x - zone.x, other.y - zone.y) < radius + other.radius);
}

function boundaryPatrolTarget(
  state: GameState,
  site: ForeignSite,
  zone: ClaimZone,
  radius: number,
): ActivityTarget | null {
  const candidates: Array<{ x: number; y: number }> = [];
  for (let y = zone.y - radius - 1; y <= zone.y + radius + 1; y++) {
    for (let x = zone.x - radius - 1; x <= zone.x + radius + 1; x++) {
      const distance = Math.hypot(x - zone.x, y - zone.y);
      if (Math.abs(distance - radius) > 0.7 || withinSite(site, x, y) || !partyPassable(state, site, x, y)) continue;
      candidates.push({ x, y });
    }
  }
  const sequence = site.activity?.activitySequence ?? 0;
  candidates.sort((left, right) =>
    hash(state.seed, site.id, sequence, left.x, left.y) - hash(state.seed, site.id, sequence, right.x, right.y));
  return firstReachableTarget(state, site, 'patrol', candidates);
}

function spawnBoundaryPatrol(state: GameState, site: ForeignSite, zone: ClaimZone, targetRadius: number): boolean {
  if (!canDepart(state, site) || !boundaryExpansionAllowed(state, zone, targetRadius)) return false;
  const target = boundaryPatrolTarget(state, site, zone, targetRadius);
  if (!target) return false;
  const activity = site.activity!;
  const start = siteStart(site);
  const memberCount = Math.min(2, CONFIG.foreignSites.activity.maxMembers);
  state.foreignSiteParties.push({
    id: state.nextForeignSitePartyId++,
    siteId: site.id,
    kind: 'patrol',
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
    activitySequence: activity.activitySequence++,
    claimZoneId: zone.id,
    boundaryChange: 'expand',
    patrolPurpose: 'boundary',
    spotted: site.discovered,
    facing: target.x < start.x ? -1 : 1,
  });
  const growth = ensureZoneGrowth(zone, state.day);
  growth.previousRadius = zone.radius;
  growth.targetRadius = targetRadius;
  growth.pendingChange = 'expand';
  return true;
}

function warningPatrolTarget(
  state: GameState,
  site: ForeignSite,
  buildingId: number,
): ActivityTarget | null {
  const building = state.buildings.find(candidate => candidate.id === buildingId);
  if (!building) return null;
  const footprint = footprintTilesOf(state, building) ?? [];
  const candidates: Array<{ x: number; y: number }> = [];
  const seen = new Set<string>();
  for (const tile of footprint) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const x = tile.x + dx;
        const y = tile.y + dy;
        const key = `${x},${y}`;
        if (seen.has(key) || withinSite(site, x, y) || !partyPassable(state, site, x, y)) continue;
        seen.add(key);
        candidates.push({ x, y });
      }
    }
  }
  return firstReachableTarget(state, site, 'patrol', candidates);
}

function spawnWarningPatrol(state: GameState, site: ForeignSite, zone: ClaimZone, buildingId: number): boolean {
  if (!canDepart(state, site)) return false;
  const target = warningPatrolTarget(state, site, buildingId);
  if (!target) return false;
  const activity = site.activity!;
  const start = siteStart(site);
  const party: ForeignSiteParty = {
    id: state.nextForeignSitePartyId++, siteId: site.id, kind: 'patrol', phase: 'outbound',
    x: start.x, y: start.y, px: start.x + 0.5, py: start.y + 0.5,
    path: target.path, target: { x: target.x, y: target.y }, memberCount: Math.min(2, CONFIG.foreignSites.activity.maxMembers),
    cargo: {}, departedDay: state.day, activitySequence: activity.activitySequence++,
    claimZoneId: zone.id, patrolPurpose: 'warning', targetBuildingId: buildingId,
    spotted: site.discovered, facing: target.x < start.x ? -1 : 1,
  };
  state.foreignSiteParties.push(party);
  ensureZoneGrowth(zone, state.day).warningPatrolPartyId = party.id;
  return true;
}

function dispatchClaimWarningPatrols(state: GameState): void {
  for (const zone of state.claimZones) {
    const growth = zone.growth;
    if (growth?.warningTargetBuildingId == null) continue;
    const site = state.foreignSites.find(candidate => candidate.id === zone.siteId);
    if (!site || !isForeignSiteOperational(site)) continue;
    const targetStillExists = state.buildings.some(building => building.id === growth.warningTargetBuildingId);
    if (!targetStillExists || activeClaimAccord(state, zone.id)) {
      growth.warningTargetBuildingId = undefined;
      growth.warningScheduledDay = undefined;
      growth.warningPatrolPartyId = undefined;
      continue;
    }
    const activePatrol = growth.warningPatrolPartyId == null
      ? null : state.foreignSiteParties.find(party => party.id === growth.warningPatrolPartyId);
    if (activePatrol) continue;
    growth.warningPatrolPartyId = undefined;
    if (spawnWarningPatrol(state, site, zone, growth.warningTargetBuildingId)) continue;
    if (state.day - (growth.warningScheduledDay ?? state.day) >= 3) applyScheduledClaimWarning(state, zone.id);
  }
}

function openForeignSiteAidRequest(state: GameState, site: ForeignSite, party: ForeignSiteParty): boolean {
  if (state.pendingChoice || state.battle || state.scenario) return false;
  const cfg = CONFIG.foreignSites.activity;
  const sick = site.activity?.condition === 'sick';
  state.pendingChoice = {
    kind: 'foreignSiteAidRequest',
    title: `${site.name}의 원조 요청`,
    body: sick
      ? `${site.name}에서 온 전령이 굶주림과 병을 함께 호소합니다. 곡식과 약재를 보내면 그들의 생계 장부가 바로 나아집니다.`
      : `${site.name}에서 온 전령이 겨울을 넘길 곡식을 청합니다. 거절해도 곧바로 적대하지는 않지만 기억에는 남습니다.`,
    options: [
      {
        id: 'grain', label: `곡식 ${cfg.aidGrainAmount}을 보낸다`,
        desc: '굶주림과 식량 비축을 직접 개선합니다.',
        disabled: state.resources.grain < cfg.aidGrainAmount,
        disabledReason: state.resources.grain < cfg.aidGrainAmount ? '곡식이 부족합니다' : undefined,
      },
      ...(sick ? [{
        id: 'medicine', label: `곡식 ${cfg.aidMedicineGrainAmount}·약초 ${cfg.aidHerbsAmount}을 보낸다`,
        desc: '굶주림과 질병 누적을 함께 크게 낮춥니다.',
        disabled: state.resources.grain < cfg.aidMedicineGrainAmount || state.resources.herbs < cfg.aidHerbsAmount,
        disabledReason: state.resources.grain < cfg.aidMedicineGrainAmount || state.resources.herbs < cfg.aidHerbsAmount
          ? '곡식이나 약초가 부족합니다' : undefined,
      }] : []),
      { id: 'decline', label: '이번에는 돕지 못한다', desc: '즉시 적대하지 않지만 거절한 일을 기억합니다.' },
    ],
    data: { siteId: site.id, partyId: party.id },
  };
  party.interactionPending = true;
  addLog(state, `${site.name}의 전령이 중심지에 도착해 원조를 청했습니다.`, 'info', true);
  return true;
}

function finishVisitorInteraction(state: GameState, partyId: number): void {
  const party = state.foreignSiteParties.find(candidate => candidate.id === partyId);
  if (!party) return;
  party.interactionPending = false;
  party.interactionResolved = true;
}

export function resolveForeignSiteAidRequest(state: GameState, optionId: string): void {
  const choice = state.pendingChoice;
  if (!choice || choice.kind !== 'foreignSiteAidRequest') return;
  const siteId = Number(choice.data.siteId);
  const partyId = Number(choice.data.partyId);
  const site = state.foreignSites.find(candidate => candidate.id === siteId);
  state.pendingChoice = null;
  finishVisitorInteraction(state, partyId);
  if (!site?.activity) return;
  const cfg = CONFIG.foreignSites.activity;
  if (optionId === 'decline') {
    addForeignSiteMemory(state, site.id, '원조를 청한 전령이 빈손으로 돌아왔습니다.', 'bad');
    addLog(state, `${site.name}의 원조 요청을 거절했습니다.`, 'info', true);
    return;
  }
  const medicine = optionId === 'medicine';
  const grain = medicine ? cfg.aidMedicineGrainAmount : cfg.aidGrainAmount;
  const herbs = medicine ? cfg.aidHerbsAmount : 0;
  if (state.resources.grain < grain || state.resources.herbs < herbs) {
    addLog(state, '보내기로 한 원조 물자가 부족해 전령을 빈손으로 돌려보냈습니다.', 'bad', true);
    return;
  }
  state.resources.grain -= grain;
  state.resources.herbs -= herbs;
  const messenger = state.foreignSiteParties.find(candidate => candidate.id === partyId);
  if (messenger) messenger.cargo = herbs > 0 ? { grain, herbs } : { grain };
  site.foodStock += grain;
  site.activity.hungerDays = Math.max(0, site.activity.hungerDays - CONFIG.foreignSites.activity.settlementIntervalDays * 3);
  if (medicine) site.activity.sicknessDays = Math.max(0, site.activity.sicknessDays - CONFIG.foreignSites.activity.settlementIntervalDays * 4);
  site.goodwill = Math.min(100, site.goodwill + cfg.aidGoodwillGain);
  site.trust = Math.min(100, site.trust + cfg.aidTrustGain);
  site.favors += 1;
  if (site.factionName) changeRelation(state, site.factionName, cfg.aidRelationGain);
  if (foodDays(site) >= cfg.recoveryFoodDays && (!medicine || site.activity.sicknessDays === 0)) {
    applyCondition(state, site, 'stable');
  } else if (site.activity.condition === 'sick' && medicine) {
    applyCondition(state, site, 'hungry');
  }
  const text = medicine
    ? `곡식 ${grain}과 약초 ${herbs}을 받아 굶주림과 병세가 누그러졌습니다.`
    : `곡식 ${grain}을 받아 식량 사정이 나아졌습니다.`;
  addForeignSiteMemory(state, site.id, text, 'good');
  addLog(state, `${site.name}에 ${text}`, 'good', true);
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
  if (party.kind === 'patrol') {
    if (party.patrolPurpose === 'warning' && party.claimZoneId != null) {
      applyScheduledClaimWarning(state, party.claimZoneId);
    }
    return;
  }
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

function completeBoundaryPatrol(state: GameState, site: ForeignSite, party: ForeignSiteParty): void {
  if (party.boundaryChange !== 'expand' || party.claimZoneId == null) return;
  const zone = state.claimZones.find(candidate => candidate.id === party.claimZoneId && candidate.siteId === site.id);
  if (!zone?.growth || zone.growth.pendingChange !== 'expand') return;
  const previousRadius = zone.growth.previousRadius ?? zone.radius;
  const nextRadius = Math.max(previousRadius, zone.growth.targetRadius);
  const protectedIds = state.buildings.filter(building => {
    const footprint = footprintTilesOf(state, building) ?? [];
    return footprint.some(tile => {
      const distanceSquared = (tile.x - zone.x) ** 2 + (tile.y - zone.y) ** 2;
      return distanceSquared <= nextRadius ** 2 && distanceSquared > previousRadius ** 2;
    });
  }).map(building => building.id);
  zone.radius = nextRadius;
  zone.growth.lastBoundaryChangeDay = state.day;
  zone.growth.pressure = 0;
  zone.growth.pendingChange = undefined;
  zone.growth.previousRadius = undefined;
  zone.growth.establishedUseBuildingIds = protectedIds;
  zone.growth.establishedUseGraceUntilDay = protectedIds.length > 0
    ? state.day + CONFIG.time.seasonDays : undefined;
  const text = protectedIds.length > 0
    ? `경계 순찰을 마치고 생활권을 넓혔습니다. 새 경계 안의 기존 시설 ${protectedIds.length}곳은 한 계절 동안 유예됩니다.`
    : '경계 순찰을 마치고 생활권을 한 칸 넓혔습니다.';
  addForeignSiteMemory(state, site.id, text, 'neutral');
  if (zone.discovered && site.discovered) addLog(state, `${site.name}: ${text}`, 'info');
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
    if (!site) {
      finished.add(party.id);
      continue;
    }
    if (party.kind === 'seasonalMigration') {
      updateSpotted(state, site, party);
      if (!moveParty(state, party)) continue;
      const entering = party.migrationDirection === 'entering';
      site.seasonalActive = entering;
      site.seasonalTransition = undefined;
      const text = entering
        ? '사냥꾼들이 지도 밖에서 돌아와 계절 야영지를 다시 열었습니다.'
        : '사냥꾼들이 짐을 싣고 지도 밖으로 떠나 계절 야영지가 비었습니다.';
      addForeignSiteMemory(state, site.id, text, 'neutral');
      if (site.discovered) addLog(state, `${site.name}: ${text}`, 'info', true);
      finished.add(party.id);
      continue;
    }
    if (!isForeignSiteOperational(site)) {
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
      if (party.kind === 'caravan' || party.kind === 'messenger') {
        if (party.interactionResolved) {
          beginReturn(state, site, party);
        } else if (!party.interactionPending) {
          if (party.kind === 'caravan') {
            party.interactionPending = openForeignSiteCaravanTrade(state, site.id, party.id);
          } else {
            openForeignSiteAidRequest(state, site, party);
          }
        }
        continue;
      }
      if (now < (party.workUntilTick ?? now)) continue;
      harvest(state, party);
      beginReturn(state, site, party);
      continue;
    }
    if (party.phase === 'returning' || party.phase === 'retreating') {
      if (!moveParty(state, party)) continue;
      if (party.kind === 'farm' || party.kind === 'hunt' || party.kind === 'fish' || party.kind === 'forage') {
        depositCargo(site, party);
      }
      completeBoundaryPatrol(state, site, party);
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

function seasonalPressure(site: ForeignSite): number {
  if (site.type === 'seasonalCamp' && site.seasonalActive === false) return -3;
  const condition = site.activity?.condition ?? 'stable';
  if (condition === 'prosperous') return 2;
  if (condition === 'hungry') return -2;
  if (condition === 'sick') return -3;
  const produced = Object.values(site.activity?.recentProduction ?? {})
    .reduce((sum, amount) => sum + (amount ?? 0), 0);
  return produced > 0 ? 1 : 0;
}

function finalizeContraction(state: GameState, site: ForeignSite, zone: ClaimZone): void {
  const growth = ensureZoneGrowth(zone, state.day);
  zone.radius = Math.max(CONFIG.foreignSites.claimGrowth.minimumRadius, growth.targetRadius);
  growth.lastBoundaryChangeDay = state.day;
  growth.pendingChange = undefined;
  growth.previousRadius = undefined;
  growth.pressure = 0;
  growth.establishedUseBuildingIds = [];
  growth.establishedUseGraceUntilDay = undefined;
  const text = '바깥 활동이 줄어 생활권 경계를 한 칸 거두었습니다.';
  addForeignSiteMemory(state, site.id, text, 'neutral');
  if (zone.discovered && site.discovered) addLog(state, `${site.name}: ${text}`, 'info');
}

export function seasonalForeignSiteBoundaryTick(state: GameState): void {
  const cfg = CONFIG.foreignSites.claimGrowth;
  for (const zone of state.claimZones) {
    const site = state.foreignSites.find(candidate => candidate.id === zone.siteId);
    if (!site || site.type === 'banditLair' || site.type === 'ruin' || site.type === 'outpost' ||
        !isForeignSiteOperational(site)) continue;
    const growth = ensureZoneGrowth(zone, state.day);
    if (growth.pendingChange === 'contract') {
      if (!activeClaimAccord(state, zone.id) && growth.lastBoundaryChangeDay < state.day) {
        finalizeContraction(state, site, zone);
      }
      continue;
    }
    if (growth.pendingChange === 'expand') continue;
    growth.pressure = Math.max(-cfg.pressureLimit, Math.min(cfg.pressureLimit,
      growth.pressure + seasonalPressure(site)));
    const maxRadius = growth.baseRadius + cfg.maximumRadiusBonus;
    if (growth.pressure >= cfg.expandPressure && zone.radius < maxRadius) {
      spawnBoundaryPatrol(state, site, zone, zone.radius + 1);
      continue;
    }
    if (growth.pressure <= cfg.contractPressure && zone.radius > cfg.minimumRadius && !activeClaimAccord(state, zone.id)) {
      growth.previousRadius = zone.radius;
      growth.targetRadius = zone.radius - 1;
      growth.pendingChange = 'contract';
      growth.lastBoundaryChangeDay = state.day;
      growth.pressure = 0;
      const text = '먹을거리와 바깥 활동이 줄어 다음 계절부터 생활권 경계를 거둘 예정입니다.';
      addForeignSiteMemory(state, site.id, text, 'neutral');
      if (zone.discovered && site.discovered) addLog(state, `${site.name}: ${text}`, 'info');
    }
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

function dispatchSeasonalMigrations(state: GameState): void {
  for (const site of state.foreignSites) {
    if (site.type !== 'seasonalCamp' || !site.seasonalTransition) continue;
    spawnSeasonalMigration(state, site);
  }
}

function hasCaravanStock(site: ForeignSite): boolean {
  return Object.values(site.tradeStock).some(amount => Number.isFinite(amount) && (amount ?? 0) >= 1);
}

function dispatchDiplomaticParties(state: GameState): void {
  for (const site of state.foreignSites) {
    const activity = site.activity;
    if (!activity || state.day < activity.nextDiplomaticDay || !canDepart(state, site)) continue;
    const relation = site.factionName ? getRelation(state, site.factionName) : 0;
    const needsAid = activity.condition === 'hungry' || activity.condition === 'sick';
    if (!state.scenario && needsAid && relation >= CONFIG.foreignSites.activity.aidRequestMinRelation &&
        activity.lastAidRequestSeasonKey !== currentSeasonKey(state)) {
      if (spawnAidMessenger(state, site)) continue;
      activity.nextDiplomaticDay = state.day + 2;
      continue;
    }
    const blocked = (activity.tradeRouteBlockedUntilDay ?? -1) >= state.day;
    if (site.discovered && relation >= CONFIG.foreignSites.activity.caravanMinRelation &&
        sitePassageActive(state, site) && hasCaravanStock(site) && !blocked) {
      if (spawnCaravan(state, site)) continue;
    }
    activity.nextDiplomaticDay = state.day + 3;
  }
}

export function dailyForeignSiteActivityTick(state: GameState): void {
  dispatchClaimWarningPatrols(state);
  dispatchSeasonalMigrations(state);
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
  }
  dispatchDiplomaticParties(state);
  for (const site of state.foreignSites) {
    const activity = site.activity;
    if (!activity) continue;
    if (state.day >= activity.nextActivityDay && canDepart(state, site)) spawnParty(state, site);
  }
}

export function foreignSitePartyKindLabel(kind: ForeignSitePartyKind): string {
  if (kind === 'farm') return '경작하러 나감';
  if (kind === 'hunt') return '사냥 중';
  if (kind === 'fish') return '고기잡이 중';
  if (kind === 'patrol') return '경계 순찰 중';
  if (kind === 'caravan') return '장터로 가는 상단';
  if (kind === 'messenger') return '원조를 청하는 전령';
  if (kind === 'seasonalMigration') return '계절 이동 행렬';
  return '숲 채집 중';
}
