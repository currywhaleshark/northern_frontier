import type { CoastalGroundKind } from '../game/tidalFlats';
import coastalGroundManifest from './coastalGroundManifest.json';

export type SeamlessCoastalGroundKind = CoastalGroundKind;

interface SeamlessCoastalGroundAsset {
  readonly src: string;
  readonly size: number;
  readonly sourceScale: 1 | 2;
}

interface FrameRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

const materials = coastalGroundManifest.materials as CoastalGroundKind[];
const frames = coastalGroundManifest.frame_layout.rows.coastal_materials as FrameRect[];

export const COASTAL_GROUND_SHEET = {
  src: coastalGroundManifest.game_input,
  width: coastalGroundManifest.display.width,
  height: coastalGroundManifest.display.height,
  sourceScale: coastalGroundManifest.display.sourceScale as 2,
  anchor: coastalGroundManifest.display.anchor,
} as const;

export const COASTAL_SEAMLESS_GROUND_SHEETS: Record<
  SeamlessCoastalGroundKind,
  { readonly standard: SeamlessCoastalGroundAsset; readonly highDefinition: SeamlessCoastalGroundAsset }
> = {
  mudflat: {
    standard: { src: '/assets/coastal-mudflat-seamless-v1-standard-448px.png', size: 448, sourceScale: 1 },
    highDefinition: { src: '/assets/coastal-mudflat-seamless-v1-hd-896px.png', size: 896, sourceScale: 2 },
  },
  sand: {
    standard: { src: '/assets/coastal-sand-seamless-v1-standard-448px.png', size: 448, sourceScale: 1 },
    highDefinition: { src: '/assets/coastal-sand-seamless-v1-hd-896px.png', size: 896, sourceScale: 2 },
  },
  shingle: {
    standard: { src: '/assets/coastal-shingle-seamless-v1-standard-448px.png', size: 448, sourceScale: 1 },
    highDefinition: { src: '/assets/coastal-shingle-seamless-v1-hd-896px.png', size: 896, sourceScale: 2 },
  },
  rocky: {
    standard: { src: '/assets/coastal-rocky-seamless-v1-standard-448px.png', size: 448, sourceScale: 1 },
    highDefinition: { src: '/assets/coastal-rocky-seamless-v1-hd-896px.png', size: 896, sourceScale: 2 },
  },
};

export function coastalGroundSourceRect(kind: CoastalGroundKind): FrameRect {
  const index = materials.indexOf(kind);
  const rect = frames[index];
  if (!rect) throw new Error(`Missing coastal ground atlas frame: ${kind}`);
  return rect;
}
