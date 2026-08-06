import type { ForeignSite, ForeignSiteParty, GameState, RaiderBand } from './types';

export function visibleMinimapSites(state: Pick<GameState, 'foreignSites'>): ForeignSite[] {
  return state.foreignSites.filter(site => site.discovered);
}

export function visibleMinimapForeignSiteParties(
  state: Pick<GameState, 'foreignSites' | 'foreignSiteParties'>,
): ForeignSiteParty[] {
  const discoveredSiteIds = new Set(state.foreignSites.filter(site => site.discovered).map(site => site.id));
  return state.foreignSiteParties.filter(party => party.spotted || discoveredSiteIds.has(party.siteId));
}

export function visibleMinimapRaid(
  state: Pick<GameState, 'raiders' | 'battle'>,
): RaiderBand | null {
  const band = state.raiders;
  if (!band) return null;
  return band.warned || band.spotted || state.battle ? band : null;
}
