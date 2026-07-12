import type { ForeignSite, GameState, RaiderBand } from './types';

export function visibleMinimapSites(state: Pick<GameState, 'foreignSites'>): ForeignSite[] {
  return state.foreignSites.filter(site => site.discovered);
}

export function visibleMinimapRaid(
  state: Pick<GameState, 'raiders' | 'battle'>,
): RaiderBand | null {
  const band = state.raiders;
  if (!band) return null;
  return band.warned || band.spotted || state.battle ? band : null;
}
