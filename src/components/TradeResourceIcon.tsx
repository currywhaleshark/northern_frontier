import { RESOURCE_ICONS } from '../game/constants';
import { RESOURCE_SPRITES, type ResourceIconId } from '../game/tradePresentation';
import type { ResourceId } from '../game/types';

export function ResourceIcon({ resource, size = 38 }: { resource: ResourceIconId; size?: number }) {
  const sprite = RESOURCE_SPRITES[resource];
  if (!sprite) {
    const fallback = RESOURCE_ICONS[resource as ResourceId] ?? '•';
    return <span className="resource-icon-fallback" style={{ width: size, height: size }}>{fallback}</span>;
  }
  return (
    <span
      className="resource-icon"
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        backgroundImage: `url('${sprite.atlas}')`,
        backgroundSize: `${sprite.columns * 100}% ${sprite.rows * 100}%`,
        backgroundPosition: `${sprite.column * (100 / (sprite.columns - 1))}% ${sprite.row * (100 / (sprite.rows - 1))}%`,
      }}
    />
  );
}

export const TradeResourceIcon = ResourceIcon;
