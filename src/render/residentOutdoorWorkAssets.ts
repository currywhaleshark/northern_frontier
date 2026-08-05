import type { Gender, JobId } from '../game/types';

// 작업 도구까지 한 셀에 넣으며 작아진 인물 체격을 대기·보행 스프라이트와 맞춘다.
export const RESIDENT_WORK_PRESENTATION_SCALE = 1.16;
// 같은 셀 크기라도 도구·자세가 차지하는 여백이 달라 인물 자체가 작아 보이는 직업만 추가 보정한다.
export const RESIDENT_WORK_PRESENTATION_SCALE_BY_JOB: Partial<Record<JobId, number>> = {
  woodSplitter: 1.12,
  miner: 1.2,
  hunter: 1.05,
};

export const RESIDENT_WOOD_SPLITTER_WORK_SHEET = {
  frameSize: 40,
  columns: 4,
  rows: 2,
  frameDurationMs: 200,
  src: '/assets/resident-wood-splitter-work-v1.png',
} as const;

export const RESIDENT_WOOD_SPLITTER_WORK_HD_SHEET = {
  frameSize: 80,
  columns: 4,
  rows: 2,
  frameDurationMs: 200,
  src: '/assets/resident-wood-splitter-work-hd-v1.png',
} as const;

export const RESIDENT_FISHER_WORK_SHEET = {
  frameSize: 64,
  displayFrameSize: 40,
  columns: 4,
  rows: 2,
  frameDurationMs: 200,
  src: '/assets/resident-fisher-work-v1.png',
} as const;

export const RESIDENT_FISHER_WORK_HD_SHEET = {
  frameSize: 128,
  displayFrameSize: 40,
  columns: 4,
  rows: 2,
  frameDurationMs: 200,
  src: '/assets/resident-fisher-work-hd-v1.png',
} as const;

export const RESIDENT_FISHER_MUDFLAT_WORK_SHEET = {
  frameSize: 64,
  displayFrameSize: 40,
  columns: 4,
  rows: 2,
  frameDurationMs: 200,
  src: '/assets/resident-fisher-mudflat-work-v1.png',
} as const;

export const RESIDENT_FISHER_MUDFLAT_WORK_HD_SHEET = {
  frameSize: 128,
  displayFrameSize: 40,
  columns: 4,
  rows: 2,
  frameDurationMs: 200,
  src: '/assets/resident-fisher-mudflat-work-hd-v1.png',
} as const;

export const RESIDENT_HERDER_WORK_SHEET = {
  frameSize: 64,
  displayFrameSize: 40,
  columns: 4,
  rows: 2,
  frameDurationMs: 200,
  src: '/assets/resident-herder-work-v1.png',
} as const;

export const RESIDENT_HERDER_WORK_HD_SHEET = {
  frameSize: 128,
  displayFrameSize: 40,
  columns: 4,
  rows: 2,
  frameDurationMs: 200,
  src: '/assets/resident-herder-work-hd-v1.png',
} as const;

export const RESIDENT_CHARCOAL_BURNER_WORK_SHEET = {
  frameSize: 64,
  displayFrameSize: 40,
  columns: 4,
  rows: 2,
  frameDurationMs: 200,
  src: '/assets/resident-charcoal-burner-work-v1.png',
} as const;

export const RESIDENT_CHARCOAL_BURNER_WORK_HD_SHEET = {
  frameSize: 128,
  displayFrameSize: 40,
  columns: 4,
  rows: 2,
  frameDurationMs: 200,
  src: '/assets/resident-charcoal-burner-work-hd-v1.png',
} as const;

export const RESIDENT_POWDER_MAKER_WORK_SHEET = {
  frameSize: 64,
  displayFrameSize: 40,
  columns: 4,
  rows: 2,
  frameDurationMs: 200,
  src: '/assets/resident-powder-maker-work-v1.png',
} as const;

export const RESIDENT_POWDER_MAKER_WORK_HD_SHEET = {
  frameSize: 128,
  displayFrameSize: 40,
  columns: 4,
  rows: 2,
  frameDurationMs: 200,
  src: '/assets/resident-powder-maker-work-hd-v1.png',
} as const;

export const RESIDENT_UNDERTAKER_WORK_SHEET = {
  frameSize: 64,
  displayFrameSize: 40,
  columns: 4,
  rows: 2,
  frameDurationMs: 200,
  src: '/assets/resident-undertaker-work-v1.png',
} as const;

export const RESIDENT_UNDERTAKER_WORK_HD_SHEET = {
  frameSize: 128,
  displayFrameSize: 40,
  columns: 4,
  rows: 2,
  frameDurationMs: 200,
  src: '/assets/resident-undertaker-work-hd-v1.png',
} as const;

export const RESIDENT_CURER_WORK_SHEET = {
  frameSize: 64,
  displayFrameSize: 40,
  columns: 4,
  rows: 2,
  frameDurationMs: 200,
  src: '/assets/resident-curer-work-v1.png',
} as const;

export const RESIDENT_CURER_WORK_HD_SHEET = {
  frameSize: 128,
  displayFrameSize: 40,
  columns: 4,
  rows: 2,
  frameDurationMs: 200,
  src: '/assets/resident-curer-work-hd-v1.png',
} as const;

export const RESIDENT_POTTER_WORK_SHEET = {
  frameSize: 64,
  displayFrameSize: 40,
  columns: 4,
  rows: 2,
  frameDurationMs: 200,
  src: '/assets/resident-potter-work-v1.png',
} as const;

export const RESIDENT_POTTER_WORK_HD_SHEET = {
  frameSize: 128,
  displayFrameSize: 40,
  columns: 4,
  rows: 2,
  frameDurationMs: 200,
  src: '/assets/resident-potter-work-hd-v1.png',
} as const;

const WOOD_SPLITTER_WORK_SEQUENCE = [0, 1, 2, 3] as const;
const FISHER_WORK_SEQUENCE = [0, 1, 2, 3] as const;
const FOUR_PHASE_WORK_SEQUENCE = [0, 1, 2, 3] as const;

export function woodSplitterWorkFrameIndex(elapsedMs: number): number {
  const step = Math.floor(
    Math.max(0, elapsedMs) / RESIDENT_WOOD_SPLITTER_WORK_SHEET.frameDurationMs,
  );
  return WOOD_SPLITTER_WORK_SEQUENCE[step % WOOD_SPLITTER_WORK_SEQUENCE.length];
}

export function woodSplitterWorkSourceRect(
  gender: Gender,
  elapsedMs: number,
  highDefinition = false,
) {
  const frameSize = highDefinition
    ? RESIDENT_WOOD_SPLITTER_WORK_HD_SHEET.frameSize
    : RESIDENT_WOOD_SPLITTER_WORK_SHEET.frameSize;
  return {
    sx: woodSplitterWorkFrameIndex(elapsedMs) * frameSize,
    sy: (gender === 'female' ? 1 : 0) * frameSize,
    sw: frameSize,
    sh: frameSize,
  };
}

export function fisherWorkFrameIndex(elapsedMs: number): number {
  const step = Math.floor(
    Math.max(0, elapsedMs) / RESIDENT_FISHER_WORK_SHEET.frameDurationMs,
  );
  return FISHER_WORK_SEQUENCE[step % FISHER_WORK_SEQUENCE.length];
}

export function fisherWorkSourceRect(
  gender: Gender,
  elapsedMs: number,
  highDefinition = false,
) {
  const frameSize = highDefinition
    ? RESIDENT_FISHER_WORK_HD_SHEET.frameSize
    : RESIDENT_FISHER_WORK_SHEET.frameSize;
  return {
    sx: fisherWorkFrameIndex(elapsedMs) * frameSize,
    sy: (gender === 'female' ? 1 : 0) * frameSize,
    sw: frameSize,
    sh: frameSize,
  };
}

export function fisherMudflatWorkSourceRect(
  gender: Gender,
  elapsedMs: number,
  highDefinition = false,
) {
  const frameSize = highDefinition
    ? RESIDENT_FISHER_MUDFLAT_WORK_HD_SHEET.frameSize
    : RESIDENT_FISHER_MUDFLAT_WORK_SHEET.frameSize;
  return {
    sx: fisherWorkFrameIndex(elapsedMs) * frameSize,
    sy: (gender === 'female' ? 1 : 0) * frameSize,
    sw: frameSize,
    sh: frameSize,
  };
}

function fourPhaseWorkFrameIndex(elapsedMs: number): number {
  const step = Math.floor(Math.max(0, elapsedMs) / 200);
  return FOUR_PHASE_WORK_SEQUENCE[step % FOUR_PHASE_WORK_SEQUENCE.length];
}

function wideWorkSourceRect(
  frameSize: number,
  gender: Gender,
  elapsedMs: number,
) {
  return {
    sx: fourPhaseWorkFrameIndex(elapsedMs) * frameSize,
    sy: (gender === 'female' ? 1 : 0) * frameSize,
    sw: frameSize,
    sh: frameSize,
  };
}

export function herderWorkSourceRect(
  gender: Gender,
  elapsedMs: number,
  highDefinition = false,
) {
  return wideWorkSourceRect(
    highDefinition ? RESIDENT_HERDER_WORK_HD_SHEET.frameSize : RESIDENT_HERDER_WORK_SHEET.frameSize,
    gender,
    elapsedMs,
  );
}

export function charcoalBurnerWorkSourceRect(
  gender: Gender,
  elapsedMs: number,
  highDefinition = false,
) {
  return wideWorkSourceRect(
    highDefinition
      ? RESIDENT_CHARCOAL_BURNER_WORK_HD_SHEET.frameSize
      : RESIDENT_CHARCOAL_BURNER_WORK_SHEET.frameSize,
    gender,
    elapsedMs,
  );
}

export function powderMakerWorkSourceRect(
  gender: Gender,
  elapsedMs: number,
  highDefinition = false,
) {
  return wideWorkSourceRect(
    highDefinition
      ? RESIDENT_POWDER_MAKER_WORK_HD_SHEET.frameSize
      : RESIDENT_POWDER_MAKER_WORK_SHEET.frameSize,
    gender,
    elapsedMs,
  );
}

export function undertakerWorkSourceRect(
  gender: Gender,
  elapsedMs: number,
  highDefinition = false,
) {
  return wideWorkSourceRect(
    highDefinition
      ? RESIDENT_UNDERTAKER_WORK_HD_SHEET.frameSize
      : RESIDENT_UNDERTAKER_WORK_SHEET.frameSize,
    gender,
    elapsedMs,
  );
}

export function curerWorkSourceRect(
  gender: Gender,
  elapsedMs: number,
  highDefinition = false,
) {
  return wideWorkSourceRect(
    highDefinition ? RESIDENT_CURER_WORK_HD_SHEET.frameSize : RESIDENT_CURER_WORK_SHEET.frameSize,
    gender,
    elapsedMs,
  );
}

export function potterWorkSourceRect(
  gender: Gender,
  elapsedMs: number,
  highDefinition = false,
) {
  return wideWorkSourceRect(
    highDefinition ? RESIDENT_POTTER_WORK_HD_SHEET.frameSize : RESIDENT_POTTER_WORK_SHEET.frameSize,
    gender,
    elapsedMs,
  );
}
