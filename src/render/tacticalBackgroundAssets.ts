import type { Season, TacticalZoneKind } from '../game/types';

type TacticalBackgroundKind = 'approach' | 'wall' | 'storehouse' | 'center';

const BACKGROUND_KIND_BY_ZONE: Record<TacticalZoneKind, TacticalBackgroundKind> = {
  approach: 'approach',
  forest: 'approach',
  ford: 'approach',
  wall: 'wall',
  storehouse: 'storehouse',
  center: 'center',
};

export function tacticalBackgroundAsset(kind: TacticalZoneKind, season: Season): string {
  const backgroundKind = BACKGROUND_KIND_BY_ZONE[kind];
  return `/assets/tactical/${backgroundKind}-${season}-v1.webp`;
}
