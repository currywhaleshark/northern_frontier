export type WaterSurfaceKind = 'river' | 'lake' | 'sea' | 'riverIce' | 'lakeIce';

interface WaterSurfaceAsset {
  readonly src: string;
  readonly size: number;
  readonly sourceScale: 1 | 2;
}

type WaterSurfacePair = {
  readonly standard: WaterSurfaceAsset;
  readonly highDefinition: WaterSurfaceAsset;
};

export const WATER_SURFACE_SHEETS: Record<WaterSurfaceKind, WaterSurfacePair> = {
  river: {
    standard: { src: '/assets/water-river-seamless-v1-standard-448px.png', size: 448, sourceScale: 1 },
    highDefinition: { src: '/assets/water-river-seamless-v1-hd-896px.png', size: 896, sourceScale: 2 },
  },
  lake: {
    standard: { src: '/assets/water-lake-seamless-v1-standard-448px.png', size: 448, sourceScale: 1 },
    highDefinition: { src: '/assets/water-lake-seamless-v1-hd-896px.png', size: 896, sourceScale: 2 },
  },
  sea: {
    standard: { src: '/assets/water-sea-seamless-v1-standard-448px.png', size: 448, sourceScale: 1 },
    highDefinition: { src: '/assets/water-sea-seamless-v1-hd-896px.png', size: 896, sourceScale: 2 },
  },
  riverIce: {
    standard: { src: '/assets/water-river-ice-seamless-v1-standard-448px.png', size: 448, sourceScale: 1 },
    highDefinition: { src: '/assets/water-river-ice-seamless-v1-hd-896px.png', size: 896, sourceScale: 2 },
  },
  lakeIce: {
    standard: { src: '/assets/water-lake-ice-seamless-v1-standard-448px.png', size: 448, sourceScale: 1 },
    highDefinition: { src: '/assets/water-lake-ice-seamless-v1-hd-896px.png', size: 896, sourceScale: 2 },
  },
};
