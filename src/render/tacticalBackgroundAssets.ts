import type { Season, TacticalZoneKind } from '../game/types';

type TacticalBackgroundKind = 'approach' | 'wall' | 'storehouse' | 'center';
type OffensiveBackgroundKind = 'banditLair' | 'predatorHunt';

export interface TacticalBackgroundAsset {
  src: string;
  size?: string;
  position?: string;
}

const BACKGROUND_KIND_BY_ZONE: Record<TacticalZoneKind, TacticalBackgroundKind> = {
  approach: 'approach',
  forest: 'approach',
  ford: 'approach',
  wall: 'wall',
  storehouse: 'storehouse',
  center: 'center',
};

function offensivePanorama(kind: OffensiveBackgroundKind, season: Season): string {
  const family = kind === 'banditLair' ? 'bandit' : 'hunt';
  return `/assets/tactical/offensive-backgrounds/${family}-panorama-${season}-v1.webp`;
}

export function tacticalBackgroundAsset(
  kind: TacticalZoneKind,
  season: Season,
  assaultKind?: OffensiveBackgroundKind,
  zoneOrder = 0,
): TacticalBackgroundAsset {
  if (assaultKind) {
    return {
      src: offensivePanorama(assaultKind, season),
      size: '200% 100%',
      position: zoneOrder <= 0 ? 'left center' : zoneOrder >= 2 ? 'right center' : 'center center',
    };
  }
  const backgroundKind = BACKGROUND_KIND_BY_ZONE[kind];
  return { src: `/assets/tactical/${backgroundKind}-${season}-v1.webp` };
}
