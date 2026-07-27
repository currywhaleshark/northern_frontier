import type { BuildingTypeId, Rank, Season } from '../game/types';
import {
  GENERATED_LARGE_BUILDING_SHEET,
  generatedLargeBuildingSourceRect,
} from '../render/generatedBuildingAssets';
import {
  OBLIQUE_BUILDING_SHEETS,
  obliqueBuildingFrame,
  obliqueBuildingSourceRect,
} from '../render/obliqueBuildingAssets';
import {
  CEMETERY_SHEETS,
  cemeterySourceRect,
} from '../render/cemeteryAssets';
import {
  WALL_FAMILY_SHEET,
  isWallFamilyWallType,
  wallFamilyPieceSourceRect,
} from '../render/wallFamilyAssets';
import {
  WALL_GATE_SHEET,
  wallGateSourceRect,
} from '../render/wallGateAssets';
import { AtlasIcon } from './AtlasIcon';

interface Props {
  type: BuildingTypeId;
  size?: number;
  season?: Season;
  rank?: Rank;
  className?: string;
  label?: string;
}

export function BuildingIcon({
  type,
  size = 28,
  season = 'autumn',
  rank,
  className = '',
  label,
}: Props) {
  const obliqueFrame = obliqueBuildingFrame(type, rank);
  if (obliqueFrame) {
    const sheet = OBLIQUE_BUILDING_SHEETS[obliqueFrame.group].highDefinition;
    return (
      <AtlasIcon
        src={sheet.src}
        sheetWidth={sheet.cellWidth * sheet.columns}
        sheetHeight={sheet.cellHeight * sheet.rows}
        frame={obliqueBuildingSourceRect(sheet, obliqueFrame.column, season)}
        size={size}
        className={`building-icon ${className}`}
        label={label}
      />
    );
  }

  if (type === 'cemetery') {
    const sheet = CEMETERY_SHEETS.highDefinition;
    return (
      <AtlasIcon
        src={sheet.src}
        sheetWidth={sheet.cellWidth * sheet.columns}
        sheetHeight={sheet.cellHeight * sheet.rows}
        frame={cemeterySourceRect(sheet, 1, season === 'winter')}
        size={size}
        className={`building-icon ${className}`}
        label={label}
      />
    );
  }

  if (isWallFamilyWallType(type)) {
    return (
      <AtlasIcon
        src={WALL_FAMILY_SHEET.src}
        sheetWidth={WALL_FAMILY_SHEET.tileSize * WALL_FAMILY_SHEET.columns}
        sheetHeight={WALL_FAMILY_SHEET.spriteHeight * WALL_FAMILY_SHEET.rows}
        frame={wallFamilyPieceSourceRect(type, 'horizontal', season)}
        size={size}
        className={`building-icon ${className}`}
        label={label}
      />
    );
  }

  if (type === 'gate') {
    return (
      <AtlasIcon
        src={WALL_GATE_SHEET.src}
        sheetWidth={WALL_GATE_SHEET.tileSize * WALL_GATE_SHEET.columns}
        sheetHeight={WALL_GATE_SHEET.spriteHeight * WALL_GATE_SHEET.rows}
        frame={wallGateSourceRect(undefined, season)}
        size={size}
        className={`building-icon ${className}`}
        label={label}
      />
    );
  }

  const sheet = GENERATED_LARGE_BUILDING_SHEET;
  return (
    <AtlasIcon
      src={sheet.src}
      sheetWidth={sheet.tileSize * sheet.columns}
      sheetHeight={sheet.spriteHeight * sheet.rows}
      frame={generatedLargeBuildingSourceRect(type, season)}
      size={size}
      className={`building-icon ${className}`}
      label={label}
    />
  );
}
