import type { WeatherId } from '../game/types';
import {
  UI_ICON_FRAMES,
  WEATHER_UI_ICON_NAMES,
  type UiIconName,
} from '../ui/uiIconAssets';

export type { UiIconName } from '../ui/uiIconAssets';

interface Props {
  name: UiIconName;
  size?: number;
  className?: string;
  label?: string;
}

export function UiIcon({ name, size = 20, className = '', label }: Props) {
  const frame = UI_ICON_FRAMES[name];
  return (
    <span
      className={`ui-icon ${className}`.trim()}
      style={{
        width: size,
        height: size,
        backgroundImage: `url('${frame.atlas}')`,
        backgroundSize: '400% 400%',
        backgroundPosition: `${frame.column * (100 / 3)}% ${frame.row * (100 / 3)}%`,
      }}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  );
}

export function WeatherIcon({
  weather,
  size = 20,
  className = '',
  label,
}: {
  weather: WeatherId;
  size?: number;
  className?: string;
  label?: string;
}) {
  return (
    <UiIcon
      name={WEATHER_UI_ICON_NAMES[weather]}
      size={size}
      className={className}
      label={label}
    />
  );
}
