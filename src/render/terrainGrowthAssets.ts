import type { MineralResource, MineralVisualTier } from '../game/minerals';
import type { TreeStage } from '../game/forestGrowth';
import type { Season } from '../game/types';
import type { MountainProfile, TreeSpecies } from './terrainGrowthVisuals';

export interface TerrainGrowthSheet {
  src: string;
  cellWidth: number;
  cellHeight: number;
  cols: 6;
  rows: 9;
}

export interface TerrainGrowthSourceRect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

export const TERRAIN_GROWTH_DRAW_SIZE = Object.freeze({ width: 98, height: 112 });
export const TERRAIN_GROWTH_TREE_DRAW_SCALE = 0.7;

export const TERRAIN_GROWTH_SHEETS = Object.freeze({
  standard: {
    src: '/assets/terrain/folk-warm-terrain-growth-v1.png',
    cellWidth: 98,
    cellHeight: 112,
    cols: 6,
    rows: 9,
  },
  highDefinition: {
    src: '/assets/terrain/folk-warm-terrain-growth-v1-hd.png',
    cellWidth: 196,
    cellHeight: 224,
    cols: 6,
    rows: 9,
  },
}) satisfies Readonly<Record<'standard' | 'highDefinition', TerrainGrowthSheet>>;

const SEASON_ROW: Readonly<Record<Season, number>> = {
  spring: 0,
  summer: 1,
  autumn: 2,
  winter: 3,
};

const TREE_COLUMN: Readonly<Record<TreeSpecies, Readonly<Record<TreeStage, number>>>> = {
  broadleaf: { stump: 0, young: 1, mature: 2 },
  conifer: { stump: 3, young: 4, mature: 5 },
};

const MINERAL_ROW: Readonly<Record<MineralResource, number>> = {
  stone: 4,
  iron: 5,
  silver: 6,
};

const MINERAL_COLUMN: Readonly<Record<MineralVisualTier, number>> = {
  trace: 0,
  small: 1,
  medium: 2,
  large: 3,
  huge: 4,
};

const MOUNTAIN_COLUMN: Readonly<Record<MountainProfile, number>> = {
  shoulder: 0,
  ridgeLow: 1,
  ridgeHigh: 2,
  peak: 3,
  cliff: 4,
};

function rect(sheet: TerrainGrowthSheet, col: number, row: number): TerrainGrowthSourceRect {
  return {
    sx: col * sheet.cellWidth,
    sy: row * sheet.cellHeight,
    sw: sheet.cellWidth,
    sh: sheet.cellHeight,
  };
}

export function treeGrowthSourceRect(
  sheet: TerrainGrowthSheet,
  season: Season,
  species: TreeSpecies,
  stage: TreeStage,
): TerrainGrowthSourceRect {
  return rect(sheet, TREE_COLUMN[species][stage], SEASON_ROW[season]);
}

export function mineralGrowthSourceRect(
  sheet: TerrainGrowthSheet,
  resource: MineralResource,
  tier: MineralVisualTier,
): TerrainGrowthSourceRect {
  return rect(sheet, MINERAL_COLUMN[tier], MINERAL_ROW[resource]);
}

export function mountainGrowthSourceRect(
  sheet: TerrainGrowthSheet,
  winter: boolean,
  profile: MountainProfile,
): TerrainGrowthSourceRect {
  return rect(sheet, MOUNTAIN_COLUMN[profile], winter ? 8 : 7);
}
