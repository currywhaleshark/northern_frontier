import { buildingFootprintDims } from './buildings';
import { CONFIG } from './config';
import { revealAround } from './exploration';
import type { ForeignSite, GameState } from './types';

interface PassageRoute {
  site: ForeignSite;
  tiles: { x: number; y: number }[];
}

function passagePermissionActive(state: GameState, siteId: number): boolean {
  return state.claimZones.some(zone => zone.siteId === siteId && zone.kind === 'passage' &&
    ((zone.permittedUntilDay ?? 0) >= state.day ||
      state.claimAccords.some(accord => accord.zoneId === zone.id && accord.untilDay > state.day)));
}

export function hasActivePassageForFaction(state: GameState, factionName: string): boolean {
  return state.foreignSites.some(site => site.factionName === factionName && passagePermissionActive(state, site.id));
}

function lineTiles(from: { x: number; y: number }, to: { x: number; y: number }): { x: number; y: number }[] {
  const result: { x: number; y: number }[] = [];
  let x = from.x;
  let y = from.y;
  const dx = Math.abs(to.x - from.x);
  const sx = from.x < to.x ? 1 : -1;
  const dy = -Math.abs(to.y - from.y);
  const sy = from.y < to.y ? 1 : -1;
  let error = dx + dy;
  while (true) {
    result.push({ x, y });
    if (x === to.x && y === to.y) break;
    const doubled = error * 2;
    if (doubled >= dy) { error += dy; x += sx; }
    if (doubled <= dx) { error += dx; y += sy; }
  }
  return result;
}

function passageRouteToSite(state: GameState, site: ForeignSite): { x: number; y: number }[] {
  const center = state.buildings.find(building => building.type === 'center');
  if (!center) return [];
  const centerDims = buildingFootprintDims(center);
  const from = {
    x: Math.round(center.x + (centerDims.w - 1) / 2),
    y: Math.round(center.y + (centerDims.h - 1) / 2),
  };
  const to = {
    x: Math.round(site.x + (site.width - 1) / 2),
    y: Math.round(site.y + (site.height - 1) / 2),
  };
  return lineTiles(from, to).filter(tile => state.map[tile.y]?.[tile.x]);
}

export function activePassageRoutes(state: GameState): PassageRoute[] {
  return state.foreignSites
    .filter(site => passagePermissionActive(state, site.id))
    .map(site => ({ site, tiles: passageRouteToSite(state, site) }))
    .filter(route => route.tiles.length > 0);
}

export function revealPassageRoute(state: GameState, site: ForeignSite): number {
  const route = passageRouteToSite(state, site);
  let newlyExplored = 0;
  for (const tile of route) {
    const before = state.exploration.explored[tile.y]?.[tile.x] === true;
    revealAround(state, tile.x, tile.y, CONFIG.foreignSites.passageRevealRadius);
    if (!before) newlyExplored += 1;
  }
  return newlyExplored;
}
