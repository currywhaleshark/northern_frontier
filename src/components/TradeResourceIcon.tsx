import { RESOURCE_ICONS } from '../game/constants';
import { TRADE_RESOURCE_SPRITES } from '../game/tradePresentation';
import type { ResourceId } from '../game/types';

export function TradeResourceIcon({ resource, size = 38 }: { resource: ResourceId; size?: number }) {
  const sprite = TRADE_RESOURCE_SPRITES[resource];
  if (!sprite) {
    return <span className="trade-resource-fallback" style={{ width: size, height: size }}>{RESOURCE_ICONS[resource]}</span>;
  }
  return (
    <span
      className="trade-resource-icon"
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        backgroundPosition: `${sprite.column * (100 / 3)}% ${sprite.row * 100}%`,
      }}
    />
  );
}
