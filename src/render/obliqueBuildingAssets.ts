import type { BuildingTypeId, Rank, Season } from '../game/types';

export type ObliqueBuildingGroup = 'oneTile' | 'twoTile' | 'center';

export interface ObliqueBuildingSheet {
  readonly src: string;
  readonly cellWidth: number;
  readonly cellHeight: number;
  readonly columns: number;
  readonly rows: 2;
}

export const OBLIQUE_BUILDING_2X2_TYPES = [
  'hut',
  'ondol',
  'tileHouse',
  'storehouse',
  'cellar',
  'smokehouse',
  'jangdokdae',
  'woodShed',
  'clinic',
  'watermill',
  'smithy',
  'charcoalKiln',
  'stable',
  'nitreYard',
  'tannery',
  'weavingHouse',
  'beacon',
  'garrison',
  'office',
  'market',
  'school',
  'shrine',
  'hermitage',
  'cannonEmplacement',
] as const satisfies readonly BuildingTypeId[];

export const OBLIQUE_BUILDING_1X1_TYPES = [
  'lumberCamp',
  'huntLodge',
  'herbHut',
  'mine',
  'ferry',
  'dryingRack',
  'onggiKiln',
  'dock',
  'watchtower',
] as const satisfies readonly BuildingTypeId[];

const TWO_TILE_COLUMN = new Map<BuildingTypeId, number>(
  OBLIQUE_BUILDING_2X2_TYPES.map((type, index) => [type, index]),
);
// 별도 셀을 추가하지 않고 불랑기포대의 표준·HD 사선 뷰를 총통 포대에도 공유한다.
TWO_TILE_COLUMN.set('chongtongEmplacement', TWO_TILE_COLUMN.get('cannonEmplacement')!);
const ONE_TILE_COLUMN = new Map<BuildingTypeId, number>(
  OBLIQUE_BUILDING_1X1_TYPES.map((type, index) => [type, index]),
);
const CENTER_COLUMN: Record<Rank, number> = {
  settlement: 0,
  bo: 1,
  jin: 2,
  bu: 3,
};

export const OBLIQUE_BUILDING_SHEETS = {
  oneTile: {
    standard: {
      src: '/assets/oblique-buildings-1x1-v1.png',
      cellWidth: 28,
      cellHeight: 40,
      columns: OBLIQUE_BUILDING_1X1_TYPES.length,
      rows: 2,
    },
    highDefinition: {
      src: '/assets/oblique-buildings-1x1-v1-hd.png',
      cellWidth: 56,
      cellHeight: 80,
      columns: OBLIQUE_BUILDING_1X1_TYPES.length,
      rows: 2,
    },
  },
  twoTile: {
    standard: {
      src: '/assets/oblique-buildings-2x2-v1.png',
      cellWidth: 56,
      cellHeight: 80,
      columns: OBLIQUE_BUILDING_2X2_TYPES.length,
      rows: 2,
    },
    highDefinition: {
      src: '/assets/oblique-buildings-2x2-v1-hd.png',
      cellWidth: 112,
      cellHeight: 160,
      columns: OBLIQUE_BUILDING_2X2_TYPES.length,
      rows: 2,
    },
  },
  center: {
    standard: {
      src: '/assets/oblique-centers-v1.png',
      cellWidth: 84,
      cellHeight: 80,
      columns: 4,
      rows: 2,
    },
    highDefinition: {
      src: '/assets/oblique-centers-v1-hd.png',
      cellWidth: 168,
      cellHeight: 160,
      columns: 4,
      rows: 2,
    },
  },
} as const satisfies Record<
  ObliqueBuildingGroup,
  Record<'standard' | 'highDefinition', ObliqueBuildingSheet>
>;

export interface ObliqueBuildingFrame {
  readonly group: ObliqueBuildingGroup;
  readonly column: number;
}

export function obliqueBuildingFrame(
  type: BuildingTypeId,
  rank: Rank | undefined,
): ObliqueBuildingFrame | null {
  if (type === 'center') {
    return { group: 'center', column: CENTER_COLUMN[rank ?? 'settlement'] };
  }
  const oneTileColumn = ONE_TILE_COLUMN.get(type);
  if (oneTileColumn != null) return { group: 'oneTile', column: oneTileColumn };
  const twoTileColumn = TWO_TILE_COLUMN.get(type);
  if (twoTileColumn != null) return { group: 'twoTile', column: twoTileColumn };
  return null;
}

export function obliqueBuildingSourceRect(
  sheet: ObliqueBuildingSheet,
  column: number,
  season: Season,
) {
  return {
    sx: column * sheet.cellWidth,
    sy: (season === 'winter' ? 1 : 0) * sheet.cellHeight,
    sw: sheet.cellWidth,
    sh: sheet.cellHeight,
  };
}
