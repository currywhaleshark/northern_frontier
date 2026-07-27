import { RESOURCE_SPRITES, type ResourceIconId } from '../game/tradePresentation';

export function ResourceIcon({ resource, size = 38 }: { resource: ResourceIconId; size?: number }) {
  const sprite = RESOURCE_SPRITES[resource];
  if (!sprite) {
    return <span className="resource-icon-fallback" style={{ width: size, height: size }} />;
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
        backgroundPosition: `${sprite.columns > 1 ? sprite.column * (100 / (sprite.columns - 1)) : 0}% ${sprite.rows > 1 ? sprite.row * (100 / (sprite.rows - 1)) : 0}%`,
      }}
    />
  );
}

export const TradeResourceIcon = ResourceIcon;
