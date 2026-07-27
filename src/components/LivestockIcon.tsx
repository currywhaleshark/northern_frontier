import type { LivestockId } from '../game/types';
import {
  LIVESTOCK_SHEETS,
  livestockSourceRect,
} from '../render/livestockAssets';
import { AtlasIcon } from './AtlasIcon';

interface Props {
  species: LivestockId;
  size?: number;
  className?: string;
  label?: string;
}

export function LivestockIcon({
  species,
  size = 24,
  className = '',
  label,
}: Props) {
  const sheet = LIVESTOCK_SHEETS.highDefinition;
  return (
    <AtlasIcon
      src={sheet.src}
      sheetWidth={sheet.cellSize * sheet.columns}
      sheetHeight={sheet.cellSize}
      frame={livestockSourceRect(sheet, species)}
      size={size}
      className={`livestock-icon ${className}`}
      label={label}
    />
  );
}
