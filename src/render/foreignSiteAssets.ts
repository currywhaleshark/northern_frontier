import type { Gender, Season } from '../game/types';
import foreignSiteManifest from './foreignSiteManifest.json';

export const FOREIGN_RESIDENT_SHEET = {
  spriteWidth: 28,
  spriteHeight: 40,
  columns: 4,
  rows: 2,
  src: '/assets/foreign-residents-v1.png',
} as const;

interface FrameRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

interface ForeignSiteSheet {
  readonly src: string;
  readonly cellWidth: number;
  readonly cellHeight: number;
  readonly columns: number;
  readonly rows: number;
  readonly sheetWidth: number;
  readonly sheetHeight: number;
  readonly frameLayout: {
    readonly normal: readonly FrameRect[];
    readonly winter: readonly FrameRect[];
  };
}

export type ForeignSiteStructureVariant = 'core' | 'prop';
export type ForeignSiteSpritePropKind = 'hut' | 'storehouse' | 'dryingRack' | 'boat' | 'huntLodge';

export const FOREIGN_SITE_SHEETS = foreignSiteManifest.sheets as {
  readonly core: {
    readonly standard: ForeignSiteSheet;
    readonly highDefinition: ForeignSiteSheet;
  };
  readonly prop: {
    readonly standard: ForeignSiteSheet;
    readonly highDefinition: ForeignSiteSheet;
  };
};

// 기존 가림 경계 계산과 호환되는 논리 표시 계약이다. 실제 소스 셀은 표준 2배·HD 8배다.
export const FOREIGN_SITE_CORE_SHEET = {
  spriteWidth: foreignSiteManifest.display.core.width,
  spriteHeight: foreignSiteManifest.display.core.height,
  columns: FOREIGN_SITE_SHEETS.core.standard.columns,
  rows: FOREIGN_SITE_SHEETS.core.standard.rows,
  src: FOREIGN_SITE_SHEETS.core.standard.src,
} as const;

export const FOREIGN_SITE_PROP_SHEET = {
  spriteWidth: foreignSiteManifest.display.prop.width,
  spriteHeight: foreignSiteManifest.display.prop.height,
  columns: FOREIGN_SITE_SHEETS.prop.standard.columns,
  rows: FOREIGN_SITE_SHEETS.prop.standard.rows,
  src: FOREIGN_SITE_SHEETS.prop.standard.src,
} as const;

const RESIDENT_COLUMNS: Record<string, number> = {
  '오도리 씨족': 0,
  '올량합 부락': 1,
  '골간 우디캐': 2,
  '니마차 우디캐': 3,
};

const STRUCTURE_COLUMNS: Record<string, number> = {
  ...RESIDENT_COLUMNS,
  '변경 마적': 4,
};

const SEMANTIC_PROP_COLUMNS: Partial<Record<ForeignSiteSpritePropKind, number>> = {
  dryingRack: 5,
  boat: 6,
};

export function foreignResidentSourceRect(factionName: string | undefined, gender: Gender) {
  const column = factionName == null ? undefined : RESIDENT_COLUMNS[factionName];
  if (column == null) return null;
  return {
    sx: column * FOREIGN_RESIDENT_SHEET.spriteWidth,
    sy: (gender === 'female' ? 1 : 0) * FOREIGN_RESIDENT_SHEET.spriteHeight,
    sw: FOREIGN_RESIDENT_SHEET.spriteWidth,
    sh: FOREIGN_RESIDENT_SHEET.spriteHeight,
  };
}

export function foreignStructureSheet(
  variant: ForeignSiteStructureVariant,
  highDefinition: boolean,
): ForeignSiteSheet {
  const pair = FOREIGN_SITE_SHEETS[variant];
  return highDefinition ? pair.highDefinition : pair.standard;
}

export function foreignStructureSourceRect(
  factionName: string | null,
  variant: ForeignSiteStructureVariant,
  season: Season,
  highDefinition: boolean,
  propKind?: ForeignSiteSpritePropKind,
) {
  const semanticColumn = propKind == null ? undefined : SEMANTIC_PROP_COLUMNS[propKind];
  const column = semanticColumn ?? (factionName == null ? undefined : STRUCTURE_COLUMNS[factionName]);
  if (column == null) return null;
  const sheet = foreignStructureSheet(variant, highDefinition);
  const row = season === 'winter' ? sheet.frameLayout.winter : sheet.frameLayout.normal;
  const frame = row[column];
  if (!frame) return null;
  return { sx: frame.x, sy: frame.y, sw: frame.w, sh: frame.h };
}
