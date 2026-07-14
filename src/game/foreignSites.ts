import { CONFIG } from './config';
import { FACTIONS } from './constants';
import { addLog } from './events';
import { isExplored } from './exploration';
import { getSeason } from './seasons';
import type {
  ClaimKind,
  ForeignSite,
  ForeignSiteMemory,
  ForeignSiteStatus,
  ForeignSiteType,
  GameState,
  Season,
  Tile,
} from './types';

const LOCAL_FACTIONS = ['오도리 씨족', '올량합 부락', '골간 우디캐'] as const;
const CAMP_FACTIONS = ['니마차 우디캐', '올량합 부락'] as const;

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

function siteFits(state: GameState, tile: Tile, width: number, height: number): boolean {
  const center = centerOf(state);
  if (manhattan(tile, center) < CONFIG.foreignSites.minCenterDistance) return false;
  for (let y = tile.y; y < tile.y + height; y++) {
    for (let x = tile.x; x < tile.x + width; x++) {
      const target = state.map[y]?.[x];
      if (!target || target.buildingId != null || target.terrain === 'river' || target.terrain === 'center') return false;
    }
  }
  return state.foreignSites.every(site => manhattan(tile, site) >= CONFIG.foreignSites.minSiteSpacing);
}

function chooseSiteTile(
  state: GameState,
  rng: () => number,
  width: number,
  height: number,
  score: (tile: Tile) => number,
): Tile {
  const candidates = state.map.flat()
    .filter(tile => siteFits(state, tile, width, height))
    .map(tile => ({ tile, score: score(tile) + rng() * 2 }))
    .sort((a, b) => b.score - a.score);
  if (candidates[0]) return candidates[0].tile;

  const center = centerOf(state);
  const fallback = state.map.flat()
    .filter(tile => tile.buildingId == null && tile.terrain !== 'river' && tile.terrain !== 'center')
    .sort((a, b) => manhattan(b, center) - manhattan(a, center))[0];
  return fallback ?? state.map[1][1];
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

export function generateForeignSites(state: GameState, rng: () => number): void {
  state.foreignSites = [];
  state.claimZones = [];
  state.nextForeignSiteId = 1;
  state.nextClaimZoneId = 1;

  const localFaction = LOCAL_FACTIONS[Math.floor(rng() * LOCAL_FACTIONS.length)];
  const localFactionDef = FACTIONS.find(faction => faction.name === localFaction);
  const localType: ForeignSiteType = localFaction === '골간 우디캐' ? 'fishingVillage' : 'village';
  const localTile = chooseSiteTile(state, rng, 2, 2, tile => {
    const river = terrainNear(state, tile, 'river', 3);
    const forest = terrainNear(state, tile, 'forest', 3);
    const fertile = terrainNear(state, tile, 'fertile', 3);
    const terrain = tile.terrain === 'fertile' ? 5 : tile.terrain === 'plain' ? 3 : 0;
    return terrain + river * (localType === 'fishingVillage' ? 2.2 : 1.1) + forest * 0.35 + fertile * 0.8;
  });
  const localSite = createSite(state, {
    type: localType,
    name: localType === 'fishingVillage' ? `${localFaction} 강가 어로 취락` : `${localFaction} 강가 부락`,
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
    tradeStock: localType === 'fishingVillage' ? { fish: 24, hide: 8, wood: 10 } : { grain: 22, meat: 12, hide: 10 },
    influenceRadius: 5,
    goodwill: Math.round(localFactionDef?.initialRelation ?? 50),
    trust: 45,
    alarm: 12,
    favors: 0,
  });
  addClaimZone(state, localSite, localType === 'fishingVillage' ? 'fishing' : 'field', 4);
  addClaimZone(state, localSite, 'passage', 5);

  const campFaction = CAMP_FACTIONS[Math.floor(rng() * CAMP_FACTIONS.length)];
  const activeSeasons: Season[] = campFaction === '니마차 우디캐' ? ['autumn', 'winter'] : ['spring', 'summer'];
  const campTile = chooseSiteTile(state, rng, 1, 1, tile => {
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

  const lairTile = chooseSiteTile(state, rng, 2, 2, tile => {
    const h = state.map.length;
    const w = state.map[0].length;
    const edge = Math.min(tile.x, tile.y, w - 1 - tile.x, h - 1 - tile.y);
    const terrain = tile.terrain === 'mountain' ? 14 : tile.terrain === 'forest' ? 10 : tile.terrain === 'rock' ? 8 : 0;
    return terrain + Math.max(0, 12 - edge) + Math.max(0, h * 0.45 - tile.y) * 0.25;
  });
  const lair = createSite(state, {
    type: 'banditLair',
    name: '변경 마적 산채',
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

export function ensureForeignSiteState(state: GameState): void {
  state.foreignSites ??= [];
  state.claimZones ??= [];
  state.nextForeignSiteId ??= Math.max(0, ...state.foreignSites.map(site => site.id)) + 1;
  state.nextClaimZoneId ??= Math.max(0, ...state.claimZones.map(zone => zone.id)) + 1;
  for (const site of state.foreignSites) {
    site.memories ??= [];
    site.tradeStock ??= {};
    site.goodwill ??= 50;
    site.trust ??= 35;
    site.alarm ??= 0;
    site.favors ??= 0;
    site.lastInteractionDay ??= -999;
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
    }
  }
}

export function foreignSiteAt(state: GameState, x: number, y: number): ForeignSite | null {
  return state.foreignSites.find(site => site.discovered &&
    x >= site.x && x < site.x + site.width && y >= site.y && y < site.y + site.height) ?? null;
}

export function discoveredForeignSites(state: GameState): ForeignSite[] {
  return state.foreignSites.filter(site => site.discovered);
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
  if (site.type === 'seasonalCamp') return `숲 너머에서 ${site.name}를 발견했습니다.`;
  if (site.type === 'banditLair') return '산비탈 깊은 곳에서 변경 마적의 산채 흔적을 찾았습니다.';
  if (site.type === 'ruin') return '버려진 야영지에서 오래된 화살촉과 부러진 솥을 발견했습니다.';
  return `숲 너머에서 ${site.name}이(가) 발견되었습니다.`;
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
    if (site.seasonalActive === active) continue;
    site.seasonalActive = active;
    if (!site.discovered) continue;
    addLog(state, active
      ? `${site.name}에 다시 연기가 올랐습니다.`
      : `계절이 바뀌며 ${site.name}가 비었습니다.`, 'info', true);
    addForeignSiteMemory(state, site.id, active ? '사냥꾼들이 계절 야영지로 돌아왔습니다.' : '계절이 바뀌어 야영지가 비었습니다.', 'neutral');
  }
}

export function findRaidOriginSite(state: GameState, factionName: string): ForeignSite | null {
  if (factionName !== '변경 마적') return null;
  const center = centerOf(state);
  return state.foreignSites.find(site =>
    site.type === 'banditLair' &&
    site.factionName === factionName &&
    site.status !== 'burned' &&
    site.status !== 'abandoned' &&
    manhattan(site, center) >= CONFIG.foreignSites.minRaidOriginDistance) ?? null;
}

export function isForeignSiteOperational(site: ForeignSite): boolean {
  if (site.status === 'burned' || site.status === 'abandoned') return false;
  return site.type !== 'seasonalCamp' || site.seasonalActive !== false;
}

export function setForeignSiteStatus(site: ForeignSite, status: ForeignSiteStatus): void {
  site.status = status;
}
