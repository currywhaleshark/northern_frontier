import { buildingFootprintDims } from './buildings';
import { CONFIG } from './config';
import { SEASON_ORDER } from './constants';
import { getDayOfSeason, getSeason } from './seasons';
import type { ForeignSite, GameState, Gender, JobId, Season, Terrain } from './types';

export type ForeignSitePropKind = 'field' | 'hut' | 'storehouse' | 'dryingRack' | 'boat' | 'huntLodge';

export interface ForeignSiteProp {
  kind: ForeignSitePropKind;
  x: number;
  y: number;
}

export interface ForeignSiteActor {
  x: number;
  y: number;
  job: JobId;
  gender: Gender;
  carrying: boolean;
  moving: boolean;
  facing: 1 | -1;
}

interface Point { x: number; y: number }
interface CandidatePoint extends Point { distance: number }

function hash(seed: number, siteId: number, x: number, y: number): number {
  let value = (seed ^ Math.imul(siteId + 17, 0x45d9f3b) ^ Math.imul(x + 71, 0x27d4eb2d) ^ Math.imul(y + 131, 0x165667b1)) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d) >>> 0;
  value ^= value >>> 15;
  return value >>> 0;
}

function withinSite(site: ForeignSite, x: number, y: number): boolean {
  return x >= site.x && x < site.x + site.width && y >= site.y && y < site.y + site.height;
}

function tileOccupied(state: GameState, site: ForeignSite, x: number, y: number): boolean {
  if (!state.map[y]?.[x] || withinSite(site, x, y)) return true;
  if (state.foreignSites.some(candidate => candidate.id !== site.id && withinSite(candidate, x, y))) return true;
  return state.buildings.some(building => {
    const { w, h } = buildingFootprintDims(building);
    return x >= building.x && x < building.x + w && y >= building.y && y < building.y + h;
  });
}

function nearbyTiles(
  state: GameState,
  site: ForeignSite,
  radius: number,
  allowed: ReadonlySet<Terrain>,
): Point[] {
  const tiles: CandidatePoint[] = [];
  for (let y = site.y - radius; y < site.y + site.height + radius; y++) {
    for (let x = site.x - radius; x < site.x + site.width + radius; x++) {
      const tile = state.map[y]?.[x];
      if (!tile || tileOccupied(state, site, x, y) || !allowed.has(tile.terrain)) continue;
      const dx = x < site.x ? site.x - x : x >= site.x + site.width ? x - (site.x + site.width - 1) : 0;
      const dy = y < site.y ? site.y - y : y >= site.y + site.height ? y - (site.y + site.height - 1) : 0;
      tiles.push({ x, y, distance: Math.max(dx, dy) });
    }
  }
  return tiles.sort((a, b) =>
    a.distance - b.distance || hash(state.seed, site.id, a.x, a.y) - hash(state.seed, site.id, b.x, b.y));
}

function takeUnused(candidates: Point[], used: Set<string>, count: number): Point[] {
  const result: Point[] = [];
  for (const point of candidates) {
    const key = `${point.x},${point.y}`;
    if (used.has(key)) continue;
    used.add(key);
    result.push(point);
    if (result.length >= count) break;
  }
  return result;
}

export function foreignSiteProps(state: GameState, site: ForeignSite): ForeignSiteProp[] {
  if (site.type === 'seasonalCamp') {
    if (site.status === 'burned') return [];
    const candidates = nearbyTiles(state, site, 2, new Set<Terrain>(['forest', 'plain', 'fertile']));
    const point = candidates[0] ?? { x: site.x + 1, y: site.y };
    return [{ kind: 'huntLodge', ...point }];
  }
  if (site.type !== 'village' && site.type !== 'fishingVillage') return [];
  if (site.status === 'abandoned' || site.status === 'burned') return [];
  const used = new Set<string>();
  const props: ForeignSiteProp[] = [];
  const fieldTiles = nearbyTiles(state, site, 3, new Set<Terrain>(['plain', 'fertile']));
  for (const point of takeUnused(fieldTiles, used, site.type === 'village' ? 3 : 1)) {
    props.push({ kind: 'field', ...point });
  }

  const landTiles = nearbyTiles(state, site, 3, new Set<Terrain>(['plain', 'fertile', 'forest', 'center']));
  const structures = takeUnused(landTiles, used, site.type === 'village' ? 2 : 3);
  structures.forEach((point, index) => {
    const kind: ForeignSitePropKind = site.type === 'fishingVillage' && index < 2
      ? 'dryingRack'
      : index === structures.length - 1 ? 'storehouse' : 'hut';
    props.push({ kind, ...point });
  });

  if (site.type === 'fishingVillage') {
    const riverTiles = nearbyTiles(state, site, 4, new Set<Terrain>(['river']));
    for (const point of takeUnused(riverTiles, used, 1)) props.push({ kind: 'boat', ...point });
  }
  return props;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function smooth(value: number): number {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

function lerpPoint(from: Point, to: Point, amount: number): Point {
  return { x: from.x + (to.x - from.x) * amount, y: from.y + (to.y - from.y) * amount };
}

function actorAlongRoute(from: Point, to: Point, phase: number): Pick<ForeignSiteActor, 'x' | 'y' | 'moving' | 'facing' | 'carrying'> {
  const outbound = phase < 0.52;
  let progress: number;
  let moving: boolean;
  if (phase < 0.34) {
    progress = smooth(phase / 0.34);
    moving = true;
  } else if (phase < 0.52) {
    progress = 1;
    moving = false;
  } else if (phase < 0.86) {
    progress = 1 - smooth((phase - 0.52) / 0.34);
    moving = true;
  } else {
    progress = 0;
    moving = false;
  }
  const point = lerpPoint(from, to, progress);
  const direction = outbound ? to.x - from.x : from.x - to.x;
  return { ...point, moving, facing: direction < 0 ? -1 : 1, carrying: !outbound };
}

function settlementActors(state: GameState, site: ForeignSite, time: number): ForeignSiteActor[] {
  const props = foreignSiteProps(state, site);
  const center = { x: site.x + site.width / 2, y: site.y + site.height / 2 };
  const targets = props.length > 0
    ? props.map(prop => ({ x: prop.x + 0.5, y: prop.y + 0.5, kind: prop.kind }))
    : [{ x: center.x + 1.5, y: center.y + 0.5, kind: 'hut' as const }];
  const healthScale = site.status === 'sick' || site.status === 'hungry' ? 0.65 : 1;
  const count = Math.max(2, Math.min(6, Math.round((site.population / 13) * healthScale)));
  return Array.from({ length: count }, (_unused, index) => {
    const target = targets[index % targets.length];
    const phase = (time * 0.035 + index / count + (site.id % 7) * 0.07) % 1;
    const route = actorAlongRoute(center, target, phase);
    const job: JobId = target.kind === 'field'
      ? 'farmer'
      : target.kind === 'boat' || target.kind === 'dryingRack' ? 'fisher' : 'hauler';
    return { ...route, job, gender: (index + site.id) % 3 === 0 ? 'female' : 'male' };
  });
}

function nearestMapEdge(state: GameState, site: ForeignSite): Point {
  const width = state.map[0]?.length ?? 1;
  const height = state.map.length;
  const center = { x: site.x + site.width / 2, y: site.y + site.height / 2 };
  const edges = [
    { x: 0.5, y: center.y },
    { x: width - 0.5, y: center.y },
    { x: center.x, y: 0.5 },
    { x: center.x, y: height - 0.5 },
  ];
  return edges.sort((a, b) => Math.hypot(a.x - center.x, a.y - center.y) - Math.hypot(b.x - center.x, b.y - center.y))[0];
}

function adjacentSeason(season: Season, offset: -1 | 1): Season {
  const index = SEASON_ORDER.indexOf(season);
  return SEASON_ORDER[(index + offset + SEASON_ORDER.length) % SEASON_ORDER.length];
}

function campActors(state: GameState, site: ForeignSite, time: number): ForeignSiteActor[] {
  if (site.seasonalActive === false || site.status === 'abandoned' || site.status === 'burned') return [];
  const activeSeasons = site.activeSeasons ?? SEASON_ORDER;
  const season = getSeason(state.day);
  if (!activeSeasons.includes(season)) return [];
  const subtickFraction = ((time % CONFIG.agents.subticksPerDay) + CONFIG.agents.subticksPerDay) % CONFIG.agents.subticksPerDay;
  const dayOfSeason = getDayOfSeason(state.day) - 1 + subtickFraction / CONFIG.agents.subticksPerDay;
  const arriving = !activeSeasons.includes(adjacentSeason(season, -1)) && dayOfSeason < 1.75;
  const leaving = !activeSeasons.includes(adjacentSeason(season, 1)) && dayOfSeason > CONFIG.time.seasonDays - 1.75;
  const center = { x: site.x + site.width / 2, y: site.y + site.height / 2 };
  const edge = nearestMapEdge(state, site);
  const count = Math.max(3, Math.min(5, Math.round(site.population / 5)));

  if (arriving || leaving) {
    return Array.from({ length: count }, (_unused, index) => {
      const stagger = index * 0.12;
      const progress = arriving
        ? smooth((dayOfSeason - stagger) / 1.35)
        : smooth((dayOfSeason - (CONFIG.time.seasonDays - 1.65) - stagger) / 1.35);
      const from = arriving ? edge : center;
      const to = arriving ? center : edge;
      const point = lerpPoint(from, to, progress);
      return {
        ...point,
        job: 'hunter',
        gender: (index + site.id) % 4 === 0 ? 'female' : 'male',
        carrying: leaving && index % 2 === 0,
        moving: progress > 0 && progress < 1,
        facing: to.x < from.x ? -1 : 1,
      };
    });
  }

  const huntingTiles = nearbyTiles(state, site, 5, new Set<Terrain>(['forest', 'plain', 'fertile']));
  const targets = huntingTiles.length > 0 ? huntingTiles : [{ x: site.x + 2, y: site.y + 1 }];
  return Array.from({ length: count }, (_unused, index) => {
    const targetTile = targets[(index * 2) % targets.length];
    const target = { x: targetTile.x + 0.5, y: targetTile.y + 0.5 };
    const phase = (time * 0.045 + index / count + (site.id % 5) * 0.09) % 1;
    return {
      ...actorAlongRoute(center, target, phase),
      job: 'hunter',
      gender: (index + site.id) % 4 === 0 ? 'female' : 'male',
    };
  });
}

export function foreignSiteActors(state: GameState, site: ForeignSite, time: number): ForeignSiteActor[] {
  if (site.type === 'village' || site.type === 'fishingVillage') return settlementActors(state, site, time);
  if (site.type === 'seasonalCamp') return campActors(state, site, time);
  return [];
}
