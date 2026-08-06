import { withJosa } from './josa';
import { CONFIG } from './config';
import { FACTIONS } from './constants';
import { addLog } from './events';
import { openGuideOnce } from './guides';
import { isExplored } from './exploration';
import { getSeason } from './seasons';
import { coastalGroundAt } from './tidalFlats';
import type {
  ClaimKind,
  ForeignSite,
  ForeignSiteActivityCondition,
  ForeignSiteMemory,
  ForeignSiteType,
  GameState,
  MapSize,
  Season,
  Tile,
} from './types';

const LOCAL_FACTIONS = ['오도리 씨족', '올량합 부락', '골간 우디캐'] as const;
const CAMP_FACTIONS = ['니마차 우디캐', '올량합 부락'] as const;
const SETTLEMENT_TERRAINS = new Set<Tile['terrain']>(['plain', 'fertile']);
const CAMP_TERRAINS = new Set<Tile['terrain']>(['forest', 'plain', 'fertile']);
const LAIR_TERRAINS = new Set<Tile['terrain']>(['mountain', 'forest', 'rock', 'plain', 'fertile']);

export const FOREIGN_SITE_COUNTS_BY_MAP_SIZE: Record<MapSize, Readonly<{
  settlements: number;
  seasonalCamps: number;
  banditLairs: number;
}>> = {
  small: { settlements: 1, seasonalCamps: 1, banditLairs: 1 },
  medium: { settlements: 2, seasonalCamps: 2, banditLairs: 1 },
  large: { settlements: 3, seasonalCamps: 2, banditLairs: 2 },
};

function centerOf(state: GameState): { x: number; y: number } {
  const center = state.buildings.find(building => building.type === 'center');
  return center ?? { x: Math.floor(state.map[0].length / 2), y: Math.floor(state.map.length / 2) };
}

function manhattan(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function terrainNear(state: GameState, tile: Tile, terrain: Tile['terrain'], radius: number): number {
  let count = 0;
  for (let y = tile.y - radius; y <= tile.y + radius; y++) {
    for (let x = tile.x - radius; x <= tile.x + radius; x++) {
      if (state.map[y]?.[x]?.terrain === terrain) count++;
    }
  }
  return count;
}

function siteFits(
  state: GameState,
  tile: Tile,
  width: number,
  height: number,
  allowedTerrains: ReadonlySet<Tile['terrain']>,
  minSpacing: number = CONFIG.foreignSites.minSiteSpacing,
): boolean {
  const center = centerOf(state);
  if (manhattan(tile, center) < CONFIG.foreignSites.minCenterDistance) return false;
  for (let y = tile.y; y < tile.y + height; y++) {
    for (let x = tile.x; x < tile.x + width; x++) {
      const target = state.map[y]?.[x];
      if (!target || target.buildingId != null || !allowedTerrains.has(target.terrain)) return false;
      if ((target.terrain === 'plain' || target.terrain === 'fertile' || target.terrain === 'forest' ||
          target.terrain === 'rock') && coastalGroundAt(state.map, x, y) != null) return false;
    }
  }
  return state.foreignSites.every(site => {
    const overlaps = tile.x < site.x + site.width && tile.x + width > site.x &&
      tile.y < site.y + site.height && tile.y + height > site.y;
    return !overlaps && manhattan(tile, site) >= minSpacing;
  });
}

function chooseSiteTile(
  state: GameState,
  rng: () => number,
  width: number,
  height: number,
  allowedTerrains: ReadonlySet<Tile['terrain']>,
  score: (tile: Tile) => number,
): Tile {
  const candidates = state.map.flat()
    .filter(tile => siteFits(state, tile, width, height, allowedTerrains))
    .map(tile => ({ tile, score: score(tile) + rng() * 2 }))
    .sort((a, b) => b.score - a.score);
  if (candidates[0]) return candidates[0].tile;

  const center = centerOf(state);
  const fallback = state.map.flat()
    .filter(tile => siteFits(
      state, tile, width, height, allowedTerrains,
      Math.max(4, Math.floor(CONFIG.foreignSites.minSiteSpacing * 0.7)),
    ))
    .sort((a, b) => manhattan(b, center) - manhattan(a, center))[0];
  if (!fallback) throw new Error('외부 거점이 들어갈 유효한 터를 찾지 못했습니다.');
  return fallback;
}

function addClaimZone(
  state: GameState,
  site: ForeignSite,
  kind: ClaimKind,
  radius: number,
  discovered = false,
): void {
  state.claimZones.push({
    id: state.nextClaimZoneId++,
    siteId: site.id,
    factionName: site.factionName,
    kind,
    x: site.x + Math.floor(site.width / 2),
    y: site.y + Math.floor(site.height / 2),
    radius,
    discovered,
    growth: {
      baseRadius: radius,
      targetRadius: radius,
      pressure: 0,
      lastBoundaryChangeDay: state.day,
      establishedUseBuildingIds: [],
    },
  });
}

function createSite(
  state: GameState,
  input: Omit<ForeignSite, 'id' | 'memories' | 'lastInteractionDay'>,
): ForeignSite {
  const site: ForeignSite = {
    ...input,
    id: state.nextForeignSiteId++,
    memories: [],
    lastInteractionDay: -999,
  };
  state.foreignSites.push(site);
  return site;
}

function activityConditionFor(site: ForeignSite): ForeignSiteActivityCondition {
  return site.status === 'prosperous' || site.status === 'hungry' || site.status === 'sick'
    ? site.status
    : 'stable';
}

function ensureSiteActivity(site: ForeignSite, day: number): void {
  const activity = site.activity;
  const interval = CONFIG.foreignSites.activity.settlementIntervalDays;
  site.activity = {
    lastSettlementDay: Number.isFinite(activity?.lastSettlementDay)
      ? Math.min(day, Math.floor(activity!.lastSettlementDay)) : day,
    nextActivityDay: Number.isFinite(activity?.nextActivityDay)
      ? Math.max(day, Math.floor(activity!.nextActivityDay))
      : day + 1 + (site.id % interval),
    activitySequence: Number.isFinite(activity?.activitySequence)
      ? Math.max(0, Math.floor(activity!.activitySequence)) : 0,
    condition: activity?.condition === 'prosperous' || activity?.condition === 'hungry' || activity?.condition === 'sick'
      ? activity.condition : activityConditionFor(site),
    surplusSettlements: Number.isFinite(activity?.surplusSettlements)
      ? Math.max(0, Math.floor(activity!.surplusSettlements)) : 0,
    hungerDays: Number.isFinite(activity?.hungerDays)
      ? Math.max(0, Math.floor(activity!.hungerDays)) : 0,
    sicknessDays: Number.isFinite(activity?.sicknessDays)
      ? Math.max(0, Math.floor(activity!.sicknessDays)) : 0,
    pendingProduction: activity?.pendingProduction && typeof activity.pendingProduction === 'object'
      ? { ...activity.pendingProduction } : {},
    recentProduction: activity?.recentProduction && typeof activity.recentProduction === 'object'
      ? { ...activity.recentProduction } : {},
    nextDiplomaticDay: Number.isFinite(activity?.nextDiplomaticDay)
      ? Math.max(day, Math.floor(activity!.nextDiplomaticDay))
      : day + 4 + (site.id % 5),
    lastAidRequestSeasonKey: Number.isFinite(activity?.lastAidRequestSeasonKey)
      ? Math.floor(Number(activity!.lastAidRequestSeasonKey)) : undefined,
    tradeRouteBlockedUntilDay: Number.isFinite(activity?.tradeRouteBlockedUntilDay)
      ? Math.floor(Number(activity!.tradeRouteBlockedUntilDay)) : undefined,
  };
}

export function generateForeignSites(state: GameState, rng: () => number): void {
  state.foreignSites = [];
  state.foreignSiteParties = [];
  state.nextForeignSitePartyId = 1;
  state.claimZones = [];
  state.nextForeignSiteId = 1;
  state.nextClaimZoneId = 1;

  const mapSize = state.worldSetup?.mapSize ??
    (state.map.length >= 96 ? 'large' : state.map.length <= 56 ? 'small' : 'medium');
  const counts = FOREIGN_SITE_COUNTS_BY_MAP_SIZE[mapSize];
  const settlementFactionOffset = Math.floor(rng() * LOCAL_FACTIONS.length);
  for (let index = 0; index < counts.settlements; index++) {
    const localFaction = LOCAL_FACTIONS[(settlementFactionOffset + index) % LOCAL_FACTIONS.length];
    const localFactionDef = FACTIONS.find(faction => faction.name === localFaction);
    const localType: ForeignSiteType = localFaction === '골간 우디캐' ? 'fishingVillage' : 'village';
    const localTile = chooseSiteTile(state, rng, 2, 2, SETTLEMENT_TERRAINS, tile => {
      const river = terrainNear(state, tile, 'river', 3);
      const forest = terrainNear(state, tile, 'forest', 3);
      const fertile = terrainNear(state, tile, 'fertile', 3);
      const terrain = tile.terrain === 'fertile' ? 5 : 3;
      if (localType === 'fishingVillage') return terrain + river * 2.2 + forest * 0.25 + fertile * 0.8;
      const inland = index > 0 ? Math.max(0, 8 - river * 1.4) : 0;
      return terrain + river * (index > 0 ? -0.2 : 0.25) + forest * 0.45 + fertile * 0.8 + inland;
    });
    const riverside = terrainNear(state, localTile, 'river', 2) > 0;
    const localSite = createSite(state, {
      type: localType,
      name: localType === 'fishingVillage'
        ? `${localFaction} 강가 어로 취락`
        : `${localFaction} ${riverside ? '강가' : '들녘'} 부락`,
      factionName: localFaction,
      x: localTile.x,
      y: localTile.y,
      width: 2,
      height: 2,
      discovered: false,
      status: 'stable',
      population: 34 + Math.floor(rng() * 35),
      militaryPower: 18 + Math.floor(rng() * 18),
      foodStock: 35 + Math.floor(rng() * 30),
      tradeStock: localType === 'fishingVillage'
        ? { fish: 24, salt: 18, hide: 8, wood: 10 }
        : { grain: 22, meat: 12, hide: 10 },
      influenceRadius: 5,
      goodwill: Math.round(localFactionDef?.initialRelation ?? 50),
      trust: 45,
      alarm: 12,
      favors: 0,
    });
    addClaimZone(state, localSite, localType === 'fishingVillage' ? 'fishing' : 'field', 4);
    addClaimZone(state, localSite, 'passage', 5);
  }

  const campFactionOffset = Math.floor(rng() * CAMP_FACTIONS.length);
  for (let index = 0; index < counts.seasonalCamps; index++) {
    const campFaction = CAMP_FACTIONS[(campFactionOffset + index) % CAMP_FACTIONS.length];
    const activeSeasons: Season[] = campFaction === '니마차 우디캐' ? ['autumn', 'winter'] : ['spring', 'summer'];
    const campTile = chooseSiteTile(state, rng, 1, 1, CAMP_TERRAINS, tile => {
      const nearestHabitat = state.habitats.reduce((best, habitat) =>
        Math.min(best, manhattan(tile, habitat)), Number.POSITIVE_INFINITY);
      return (tile.terrain === 'forest' ? 10 : 0) + Math.max(0, 10 - nearestHabitat) + terrainNear(state, tile, 'forest', 2);
    });
    const camp = createSite(state, {
      type: 'seasonalCamp',
      name: `${campFaction} 계절 사냥 야영지`,
      factionName: campFaction,
      x: campTile.x,
      y: campTile.y,
      width: 1,
      height: 1,
      discovered: false,
      status: 'stable',
      population: 12 + Math.floor(rng() * 15),
      militaryPower: 14 + Math.floor(rng() * 16),
      foodStock: 14 + Math.floor(rng() * 18),
      tradeStock: { hide: 16, meat: 12, herbs: 6 },
      influenceRadius: 5,
      goodwill: Math.round(FACTIONS.find(faction => faction.name === campFaction)?.initialRelation ?? 45),
      trust: 34,
      alarm: 18,
      favors: 0,
      seasonalActive: activeSeasons.includes(getSeason(state.day)),
      activeSeasons,
    });
    addClaimZone(state, camp, 'hunting', 5);
    addClaimZone(state, camp, 'forest', 4);
  }

  for (let index = 0; index < counts.banditLairs; index++) {
    const lairTile = chooseSiteTile(state, rng, 2, 2, LAIR_TERRAINS, tile => {
      const h = state.map.length;
      const w = state.map[0].length;
      const edge = Math.min(tile.x, tile.y, w - 1 - tile.x, h - 1 - tile.y);
      const terrain = tile.terrain === 'mountain' ? 14 : tile.terrain === 'forest' ? 10 : tile.terrain === 'rock' ? 8 : 0;
      return terrain + Math.max(0, 12 - edge) + Math.max(0, h * 0.45 - tile.y) * 0.25;
    });
    const lair = createSite(state, {
      type: 'banditLair',
      name: index === 0 ? '변경 마적 산채' : '변경 마적 외곽 산채',
      factionName: '변경 마적',
      x: lairTile.x,
      y: lairTile.y,
      width: 2,
      height: 2,
      discovered: false,
      status: 'fortified',
      population: 18 + Math.floor(rng() * 15),
      militaryPower: 32 + Math.floor(rng() * 26),
      foodStock: 18 + Math.floor(rng() * 18),
      tradeStock: { grain: 8, tools: 2, hide: 9 },
      influenceRadius: 4,
      goodwill: 5,
      trust: 5,
      alarm: 55,
      favors: 0,
      lairScoutAttempts: 0,
      lairScoutFailures: 0,
      lairAssaultDefeats: 0,
      lairDoctrineRevealed: false,
    });
    addClaimZone(state, lair, 'passage', 4);
  }
  for (const site of state.foreignSites) ensureSiteActivity(site, state.day);
}

export function ensureForeignSiteState(state: GameState): void {
  state.foreignSites ??= [];
  state.foreignSiteParties ??= [];
  state.nextForeignSitePartyId ??= Math.max(0, ...state.foreignSiteParties.map(party => party.id)) + 1;
  state.claimZones ??= [];
  state.nextForeignSiteId ??= Math.max(0, ...state.foreignSites.map(site => site.id)) + 1;
  state.nextClaimZoneId ??= Math.max(0, ...state.claimZones.map(zone => zone.id)) + 1;
  for (const site of state.foreignSites) {
    site.memories ??= [];
    site.tradeStock ??= {};
    if (site.type === 'fishingVillage' && !Number.isFinite(site.tradeStock.salt)) {
      site.tradeStock.salt = 18;
    }
    site.goodwill ??= 50;
    site.trust ??= 35;
    site.alarm ??= 0;
    site.favors ??= 0;
    site.lastInteractionDay ??= -999;
    site.militaryActivityUntilDay = Number.isFinite(site.militaryActivityUntilDay)
      ? Math.max(0, Math.floor(Number(site.militaryActivityUntilDay))) : undefined;
    site.seasonalTransition = site.seasonalTransition === 'entering' || site.seasonalTransition === 'leaving'
      ? site.seasonalTransition : undefined;
    ensureSiteActivity(site, state.day);
    if (site.type === 'banditLair') {
      site.lairScoutAttempts = Number.isFinite(site.lairScoutAttempts)
        ? Math.max(0, Math.floor(site.lairScoutAttempts!)) : 0;
      site.lairScoutFailures = Number.isFinite(site.lairScoutFailures)
        ? Math.max(0, Math.floor(site.lairScoutFailures!)) : 0;
      site.lairAssaultDefeats = Number.isFinite(site.lairAssaultDefeats)
        ? Math.max(0, Math.floor(site.lairAssaultDefeats!)) : 0;
      if (site.lairDoctrine !== 'trailAttrition' && site.lairDoctrine !== 'wallHold' &&
          site.lairDoctrine !== 'leaderEscape') site.lairDoctrine = undefined;
      site.lairDoctrineRevealed = site.lairDoctrine != null && site.lairDoctrineRevealed === true;
      site.lairDoctrineRevision = Number.isFinite(site.lairDoctrineRevision)
        ? Math.max(0, Math.floor(site.lairDoctrineRevision!)) : 0;
      site.lairDoctrineChosenDay = Number.isFinite(site.lairDoctrineChosenDay)
        ? Math.floor(site.lairDoctrineChosenDay!) : state.day;
      site.lairDoctrineNextReviewDay = Number.isFinite(site.lairDoctrineNextReviewDay)
        ? Math.floor(site.lairDoctrineNextReviewDay!)
        : Math.max(
          state.day + CONFIG.foreignSites.banditLairDefense.doctrineReviewIntervalDays,
          (site.scoutedUntilDay ?? -1) + 1,
        );
    }
  }
  for (const zone of state.claimZones) {
    const growth = zone.growth;
    const baseRadius = Number.isFinite(growth?.baseRadius)
      ? Math.max(CONFIG.foreignSites.claimGrowth.minimumRadius, Math.floor(growth!.baseRadius))
      : Math.max(CONFIG.foreignSites.claimGrowth.minimumRadius, Math.floor(zone.radius));
    const targetRadius = Number.isFinite(growth?.targetRadius)
      ? Math.floor(growth!.targetRadius) : Math.floor(zone.radius);
    zone.radius = Math.max(CONFIG.foreignSites.claimGrowth.minimumRadius, Math.floor(zone.radius));
    zone.growth = {
      baseRadius,
      targetRadius: Math.max(
        CONFIG.foreignSites.claimGrowth.minimumRadius,
        Math.min(baseRadius + CONFIG.foreignSites.claimGrowth.maximumRadiusBonus, targetRadius),
      ),
      pressure: Number.isFinite(growth?.pressure)
        ? Math.max(-CONFIG.foreignSites.claimGrowth.pressureLimit,
          Math.min(CONFIG.foreignSites.claimGrowth.pressureLimit, Math.floor(growth!.pressure)))
        : 0,
      lastBoundaryChangeDay: Number.isFinite(growth?.lastBoundaryChangeDay)
        ? Math.floor(growth!.lastBoundaryChangeDay) : state.day,
      pendingChange: growth?.pendingChange === 'expand' || growth?.pendingChange === 'contract'
        ? growth.pendingChange : undefined,
      previousRadius: typeof growth?.previousRadius === 'number' && Number.isFinite(growth.previousRadius)
        ? Math.floor(growth.previousRadius) : undefined,
      establishedUseGraceUntilDay: typeof growth?.establishedUseGraceUntilDay === 'number' &&
        Number.isFinite(growth.establishedUseGraceUntilDay)
        ? Math.floor(growth.establishedUseGraceUntilDay) : undefined,
      establishedUseBuildingIds: Array.isArray(growth?.establishedUseBuildingIds)
        ? [...new Set(growth!.establishedUseBuildingIds.filter(id => Number.isInteger(id) && id > 0))]
        : [],
      warningTargetBuildingId: Number.isInteger(growth?.warningTargetBuildingId)
        ? growth!.warningTargetBuildingId : undefined,
      warningScheduledDay: typeof growth?.warningScheduledDay === 'number' && Number.isFinite(growth.warningScheduledDay)
        ? Math.floor(growth.warningScheduledDay) : undefined,
      warningPatrolPartyId: Number.isInteger(growth?.warningPatrolPartyId)
        ? growth!.warningPatrolPartyId : undefined,
    };
  }
  const siteIds = new Set(state.foreignSites.map(site => site.id));
  const phases = new Set(['outbound', 'working', 'returning', 'waiting', 'retreating']);
  const kinds = new Set(['farm', 'hunt', 'fish', 'forage', 'patrol', 'caravan', 'messenger', 'seasonalMigration']);
  const pendingInteractionPartyId = state.pendingChoice?.kind === 'foreignSiteAidRequest'
    ? Number(state.pendingChoice.data.partyId)
    : state.pendingChoice?.kind === 'trade' && state.pendingChoice.data.negotiation &&
        typeof state.pendingChoice.data.negotiation === 'object'
      ? Number((state.pendingChoice.data.negotiation as { sourcePartyId?: unknown }).sourcePartyId)
      : Number.NaN;
  state.foreignSiteParties = state.foreignSiteParties.filter(party =>
    party && Number.isInteger(party.id) && party.id > 0 && siteIds.has(party.siteId) &&
    kinds.has(party.kind) && phases.has(party.phase) && Number.isFinite(party.x) && Number.isFinite(party.y));
  for (const party of state.foreignSiteParties) {
    party.x = Math.floor(party.x);
    party.y = Math.floor(party.y);
    party.px = Number.isFinite(party.px) ? party.px : party.x + 0.5;
    party.py = Number.isFinite(party.py) ? party.py : party.y + 0.5;
    party.path = Array.isArray(party.path)
      ? party.path.filter(point => Number.isFinite(point?.x) && Number.isFinite(point?.y))
        .map(point => ({ x: Math.floor(point.x), y: Math.floor(point.y) }))
      : [];
    party.target = party.target && Number.isFinite(party.target.x) && Number.isFinite(party.target.y)
      ? { x: Math.floor(party.target.x), y: Math.floor(party.target.y) } : null;
    party.memberCount = Math.max(1, Math.min(
      CONFIG.foreignSites.activity.maxMembers,
      Number.isFinite(party.memberCount) ? Math.floor(party.memberCount) : 1,
    ));
    party.cargo = party.cargo && typeof party.cargo === 'object' ? { ...party.cargo } : {};
    party.departedDay = Number.isFinite(party.departedDay) ? Math.floor(party.departedDay) : state.day;
    party.activitySequence = Number.isFinite(party.activitySequence)
      ? Math.max(0, Math.floor(party.activitySequence)) : 0;
    party.claimZoneId = Number.isInteger(party.claimZoneId) && state.claimZones.some(zone => zone.id === party.claimZoneId)
      ? party.claimZoneId : undefined;
    party.boundaryChange = party.boundaryChange === 'expand' ? 'expand' : undefined;
    party.patrolPurpose = party.patrolPurpose === 'boundary' || party.patrolPurpose === 'warning'
      ? party.patrolPurpose : undefined;
    party.targetBuildingId = Number.isInteger(party.targetBuildingId) ? party.targetBuildingId : undefined;
    party.migrationDirection = party.migrationDirection === 'entering' || party.migrationDirection === 'leaving'
      ? party.migrationDirection : undefined;
    party.interactionPending = party.interactionPending === true && party.id === pendingInteractionPartyId;
    party.interactionResolved = party.interactionResolved === true;
    party.spotted = party.spotted === true;
    party.facing = party.facing === -1 ? -1 : 1;
  }
  state.nextForeignSitePartyId = Math.max(
    Number.isFinite(state.nextForeignSitePartyId) ? Math.floor(state.nextForeignSitePartyId) : 1,
    Math.max(0, ...state.foreignSiteParties.map(party => party.id)) + 1,
  );
  if (state.raiders) {
    state.raiders.originSiteId = Number.isInteger(state.raiders.originSiteId) &&
      state.foreignSites.some(site => site.id === state.raiders?.originSiteId)
      ? state.raiders.originSiteId : undefined;
  }
}

export function foreignSiteAt(state: GameState, x: number, y: number): ForeignSite | null {
  return state.foreignSites.find(site => site.discovered &&
    x >= site.x && x < site.x + site.width && y >= site.y && y < site.y + site.height) ?? null;
}

export function addForeignSiteMemory(
  state: GameState,
  siteId: number,
  text: string,
  kind: ForeignSiteMemory['kind'],
): void {
  const site = state.foreignSites.find(candidate => candidate.id === siteId);
  if (!site) return;
  site.memories.unshift({ day: state.day, text, kind });
  if (site.memories.length > 12) site.memories.length = 12;
}

function discoveryMessage(site: ForeignSite): string {
  if (site.type === 'fishingVillage') return `강가의 ${site.name}에서 연기가 피어오릅니다.`;
  if (site.type === 'seasonalCamp') return `숲 너머에서 ${withJosa(site.name, '을/를')} 발견했습니다.`;
  if (site.type === 'banditLair') return '산비탈 깊은 곳에서 변경 마적의 산채 흔적을 찾았습니다.';
  if (site.type === 'ruin') return '버려진 야영지에서 오래된 화살촉과 부러진 솥을 발견했습니다.';
  return `숲 너머에서 ${withJosa(site.name, '이/가')} 발견되었습니다.`;
}

export function revealForeignSitesFromExploration(state: GameState): void {
  ensureForeignSiteState(state);
  for (const site of state.foreignSites) {
    if (site.discovered) continue;
    const radius = site.type === 'banditLair' ? 0 : 1;
    let revealed = false;
    for (let y = site.y - radius; y < site.y + site.height + radius && !revealed; y++) {
      for (let x = site.x - radius; x < site.x + site.width + radius; x++) {
        if (isExplored(state, x, y)) { revealed = true; break; }
      }
    }
    if (!revealed) continue;
    site.discovered = true;
    if (site.status === 'hidden') site.status = 'stable';
    addLog(state, discoveryMessage(site), site.type === 'banditLair' ? 'bad' : 'info', true);
    // 첫 산채 발견 / 첫 세력 접촉 — 초회 길잡이(카드)
    openGuideOnce(state, site.type === 'banditLair' ? 'expedition' : 'diplomacy');
    addForeignSiteMemory(state, site.id, '개척지 사람들이 처음 이곳의 위치를 확인했습니다.', 'neutral');
  }

  for (const zone of state.claimZones) {
    if (zone.discovered) continue;
    const site = state.foreignSites.find(candidate => candidate.id === zone.siteId);
    if (site?.discovered || isExplored(state, zone.x, zone.y)) {
      zone.discovered = true;
      if (!site?.discovered) {
        addLog(state, '나무와 바위에 새겨진 표식을 발견했습니다. 누군가 오래 이용해 온 생활권인 듯합니다.', 'info', true);
      }
    }
  }
}

export function updateSeasonalForeignSites(state: GameState, season = getSeason(state.day)): void {
  for (const site of state.foreignSites) {
    if (site.type !== 'seasonalCamp') continue;
    const active = site.activeSeasons?.includes(season) ?? true;
    if (site.seasonalActive === active && !site.seasonalTransition) continue;
    site.seasonalTransition = active ? 'entering' : 'leaving';
    if (site.activity) site.activity.nextActivityDay = Math.max(site.activity.nextActivityDay, state.day + 1);
  }
}

export function findRaidOriginSite(state: GameState, factionName: string): ForeignSite | null {
  const center = centerOf(state);
  return state.foreignSites
    .filter(site => site.factionName === factionName && site.type !== 'ruin' &&
      isForeignSiteOperational(site) && site.militaryPower > 0 &&
      (site.militaryActivityUntilDay ?? 0) <= state.day &&
      manhattan(site, center) >= CONFIG.foreignSites.minRaidOriginDistance)
    .sort((left, right) => {
      const leftLair = left.type === 'banditLair' ? 1 : 0;
      const rightLair = right.type === 'banditLair' ? 1 : 0;
      return rightLair - leftLair || right.militaryPower - left.militaryPower || left.id - right.id;
    })[0] ?? null;
}

export function markRaidOriginDeparture(state: GameState, siteId: number): void {
  const site = state.foreignSites.find(candidate => candidate.id === siteId);
  if (!site) return;
  site.lastRaidDay = state.day;
  site.militaryActivityUntilDay = state.day + CONFIG.threat.raidCooldownDays;
  addForeignSiteMemory(state, site.id, '무장대가 개척지를 노리고 거주지에서 출발했습니다.', 'bad');
}

export function recordRaidOriginOutcome(
  state: GameState,
  siteId: number | undefined,
  outcome: 'repelled' | 'succeeded' | 'withdrew',
): void {
  if (siteId == null) return;
  const site = state.foreignSites.find(candidate => candidate.id === siteId);
  if (!site) return;
  const text = outcome === 'repelled'
    ? '개척지로 보낸 무장대가 패해 흩어져 돌아왔습니다.'
    : outcome === 'succeeded'
      ? '개척지로 보낸 무장대가 약탈과 위협을 마치고 돌아왔습니다.'
      : '개척지로 보낸 무장대가 싸움을 끝내고 물러났습니다.';
  addForeignSiteMemory(state, site.id, text, outcome === 'repelled' ? 'bad' : 'neutral');
  site.alarm = Math.min(100, site.alarm + (outcome === 'repelled' ? 6 : 2));
}

export function isForeignSiteOperational(site: ForeignSite): boolean {
  if (site.status === 'burned' || site.status === 'abandoned') return false;
  return site.type !== 'seasonalCamp' || site.seasonalActive !== false;
}
