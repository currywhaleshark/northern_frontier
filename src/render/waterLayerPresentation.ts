import type { BuildingTypeId } from '../game/types';
import type { BuildingWaterSupply, WellWaterStatus } from '../game/waterSupply';
import type { CisternStatus } from '../game/rainwaterCistern';

type WaterLayerTintKind =
  | 'well'
  | 'well-low'
  | 'cistern'
  | 'cistern-low'
  | 'river-supplied'
  | 'lake-supplied'
  | 'canal-supplied'
  | 'well-supplied'
  | 'partially-supplied'
  | 'unsupplied';

interface WaterLayerTint {
  kind: WaterLayerTintKind;
  color: string;
  alpha: number;
}

const WELL_TINT: WaterLayerTint = { kind: 'well', color: '#45c5ef', alpha: 0.48 };
const WELL_LOW_TINT: WaterLayerTint = { kind: 'well-low', color: '#e7ad4f', alpha: 0.52 };
const CISTERN_TINT: WaterLayerTint = { kind: 'cistern', color: '#5ec7bb', alpha: 0.48 };
const CISTERN_LOW_TINT: WaterLayerTint = { kind: 'cistern-low', color: '#d7a956', alpha: 0.52 };
const RIVER_TINT: WaterLayerTint = { kind: 'river-supplied', color: '#4fd6c8', alpha: 0.42 };
const LAKE_TINT: WaterLayerTint = { kind: 'lake-supplied', color: '#4dadd8', alpha: 0.42 };
const CANAL_TINT: WaterLayerTint = { kind: 'canal-supplied', color: '#498aa8', alpha: 0.44 };
const SUPPLIED_TINT: WaterLayerTint = { kind: 'well-supplied', color: '#4b9ef2', alpha: 0.46 };
const PARTIAL_TINT: WaterLayerTint = { kind: 'partially-supplied', color: '#efb04f', alpha: 0.54 };
const UNSUPPLIED_TINT: WaterLayerTint = { kind: 'unsupplied', color: '#e86868', alpha: 0.56 };

export function waterLayerTintForBuilding(
  type: BuildingTypeId,
  built: boolean,
  supply: BuildingWaterSupply | undefined,
  wellStatus: WellWaterStatus | null,
  cistern: CisternStatus | null = null,
): WaterLayerTint | null {
  if (type === 'well') {
    if (!built) return WELL_TINT;
    if (!wellStatus || wellStatus.dailyOutput <= 0.05 || wellStatus.levelRatio <= 0.03) {
      return UNSUPPLIED_TINT;
    }
    if (wellStatus.levelRatio < 0.25) return WELL_LOW_TINT;
    return WELL_TINT;
  }
  if (type === 'rainwaterCistern') {
    if (!built) return CISTERN_TINT;
    if (!cistern || cistern.dailyOutput <= 0.05) return UNSUPPLIED_TINT;
    if (cistern.levelRatio < 0.25) return CISTERN_LOW_TINT;
    return CISTERN_TINT;
  }
  if (!supply || supply.demand <= 0) return null;
  if (supply.ratio >= 0.995) {
    if (supply.source === 'river') return RIVER_TINT;
    if (supply.source === 'lake') return LAKE_TINT;
    if (supply.source === 'canal') return CANAL_TINT;
    if (supply.source === 'cistern') return CISTERN_TINT;
    return SUPPLIED_TINT;
  }
  if (supply.ratio > 0.005) return PARTIAL_TINT;
  return UNSUPPLIED_TINT;
}
