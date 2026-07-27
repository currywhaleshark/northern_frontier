import type { Gender, JobId } from '../game/types';

export interface ResidentJigeCargoSheet {
  src: string;
  frameSize: number;
}

export interface ResidentJigeCargoSheetPair {
  standard: ResidentJigeCargoSheet;
  highDefinition: ResidentJigeCargoSheet;
}

export const RESIDENT_JIGE_CARGO_DISPLAY_FRAME_SIZE = 40;
export const RESIDENT_JIGE_CARGO_FRAME_DURATION_MS = 200;

function sheetPair(slug: string): ResidentJigeCargoSheetPair {
  return {
    standard: {
      src: `/assets/resident-${slug}-jige-walk-v1.png`,
      frameSize: 64,
    },
    highDefinition: {
      src: `/assets/resident-${slug}-jige-walk-hd-v1.png`,
      frameSize: 128,
    },
  };
}

export const RESIDENT_JIGE_CARGO_SHEETS: Partial<Record<JobId, ResidentJigeCargoSheetPair>> = {
  hauler: sheetPair('hauler'),
  fisher: sheetPair('fisher'),
  herbalist: sheetPair('herbalist'),
  miller: sheetPair('miller'),
  woodSplitter: sheetPair('wood-splitter'),
  smith: sheetPair('smith'),
  curer: sheetPair('curer'),
  potter: sheetPair('potter'),
  charcoalBurner: sheetPair('charcoal-burner'),
  powderMaker: sheetPair('powder-maker'),
  tanner: sheetPair('tanner'),
  weaver: sheetPair('weaver'),
};

export function isResidentJigeCargoJob(job: JobId): boolean {
  return RESIDENT_JIGE_CARGO_SHEETS[job] != null;
}

export function residentJigeCargoSourceRect(
  job: JobId,
  gender: Gender,
  moving: boolean,
  elapsedMs: number,
  highDefinition = false,
) {
  const pair = RESIDENT_JIGE_CARGO_SHEETS[job];
  if (!pair) return null;
  const frameSize = (highDefinition ? pair.highDefinition : pair.standard).frameSize;
  const frame = moving
    ? Math.floor(Math.max(0, elapsedMs) / RESIDENT_JIGE_CARGO_FRAME_DURATION_MS) % 4
    : 0;
  return {
    sx: frame * frameSize,
    sy: (gender === 'female' ? 1 : 0) * frameSize,
    sw: frameSize,
    sh: frameSize,
  };
}
