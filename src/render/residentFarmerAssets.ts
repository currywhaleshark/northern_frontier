import type { Building, Gender, Resident } from '../game/types';

export type FarmerSpriteAction = 'till' | 'harvest' | 'oxPlow';

export const RESIDENT_FARMER_TILL_SHEET = {
  frameSize: 40,
  columns: 3,
  rows: 2,
  frameDurationMs: 180,
  src: '/assets/resident-farmer-till-v1.png',
} as const;

export const RESIDENT_FARMER_TILL_HD_SHEET = {
  frameSize: 80,
  columns: 3,
  rows: 2,
  frameDurationMs: 180,
  src: '/assets/resident-farmer-till-hd-v1.png',
} as const;

export const RESIDENT_FARMER_HARVEST_SHEET = {
  frameSize: 40,
  columns: 3,
  rows: 2,
  frameDurationMs: 220,
  src: '/assets/resident-farmer-harvest-v1.png',
} as const;

export const RESIDENT_FARMER_HARVEST_HD_SHEET = {
  frameSize: 80,
  columns: 3,
  rows: 2,
  frameDurationMs: 220,
  src: '/assets/resident-farmer-harvest-hd-v1.png',
} as const;

export const RESIDENT_FARMER_OX_PLOW_SHEET = {
  frameSize: 72,
  columns: 3,
  rows: 2,
  frameDurationMs: 160,
  src: '/assets/resident-farmer-ox-plow-v1.png',
} as const;

export const RESIDENT_FARMER_OX_PLOW_HD_SHEET = {
  frameSize: 144,
  columns: 3,
  rows: 2,
  frameDurationMs: 160,
  src: '/assets/resident-farmer-ox-plow-hd-v1.png',
} as const;

const TILL_SEQUENCE = [0, 1, 2, 1] as const;
const HARVEST_SEQUENCE = [0, 1, 2, 1] as const;
const OX_PLOW_SEQUENCE = [0, 1, 0, 2] as const;

function sequenceFrame(sequence: readonly number[], frameDurationMs: number, elapsedMs: number): number {
  const step = Math.floor(Math.max(0, elapsedMs) / frameDurationMs);
  return sequence[step % sequence.length];
}

export function farmerTillFrameIndex(elapsedMs: number): number {
  return sequenceFrame(TILL_SEQUENCE, RESIDENT_FARMER_TILL_SHEET.frameDurationMs, elapsedMs);
}

export function farmerHarvestFrameIndex(elapsedMs: number): number {
  return sequenceFrame(HARVEST_SEQUENCE, RESIDENT_FARMER_HARVEST_SHEET.frameDurationMs, elapsedMs);
}

export function farmerOxPlowFrameIndex(elapsedMs: number): number {
  return sequenceFrame(OX_PLOW_SEQUENCE, RESIDENT_FARMER_OX_PLOW_SHEET.frameDurationMs, elapsedMs);
}

function sourceRect(frameSize: number, gender: Gender, frame: number) {
  return {
    sx: frame * frameSize,
    sy: (gender === 'female' ? 1 : 0) * frameSize,
    sw: frameSize,
    sh: frameSize,
  };
}

export function farmerTillSourceRect(gender: Gender, elapsedMs: number, highDefinition = false) {
  const frameSize = highDefinition
    ? RESIDENT_FARMER_TILL_HD_SHEET.frameSize
    : RESIDENT_FARMER_TILL_SHEET.frameSize;
  return sourceRect(frameSize, gender, farmerTillFrameIndex(elapsedMs));
}

export function farmerHarvestSourceRect(gender: Gender, elapsedMs: number, highDefinition = false) {
  const frameSize = highDefinition
    ? RESIDENT_FARMER_HARVEST_HD_SHEET.frameSize
    : RESIDENT_FARMER_HARVEST_SHEET.frameSize;
  return sourceRect(frameSize, gender, farmerHarvestFrameIndex(elapsedMs));
}

export function farmerOxPlowSourceRect(gender: Gender, elapsedMs: number, highDefinition = false) {
  const frameSize = highDefinition
    ? RESIDENT_FARMER_OX_PLOW_HD_SHEET.frameSize
    : RESIDENT_FARMER_OX_PLOW_SHEET.frameSize;
  return sourceRect(frameSize, gender, farmerOxPlowFrameIndex(elapsedMs));
}

type FarmerPresentationResident = Pick<Resident,
  'id' | 'alive' | 'job' | 'stage' | 'special' | 'sick' | 'assignedBuildingId' |
  'task' | 'x' | 'y' | 'px' | 'py'>;
type FarmerPresentationPlot = Pick<Building, 'id' | 'type' | 'plowOxen'>;

function isCultivationTask(task: string): boolean {
  return task.endsWith('파종 중') || task.endsWith('재배 중');
}

function isActiveAdultFarmer(resident: FarmerPresentationResident): boolean {
  return resident.alive && resident.job === 'farmer' && resident.stage == null && !resident.special &&
    !resident.sick && resident.px === resident.x && resident.py === resident.y;
}

/**
 * 농우 한 마리가 화면에서 여러 번 복제되지 않도록, 경작지별 배정 수만큼만
 * 현재 파종·재배 중인 성인 농부를 안정적인 ID 순서로 고른다.
 */
export function selectOxPlowFarmerIds(
  plots: readonly FarmerPresentationPlot[],
  residents: readonly FarmerPresentationResident[],
): Set<number> {
  const selected = new Set<number>();
  const candidatesByPlot = new Map<number, FarmerPresentationResident[]>();
  for (const resident of residents) {
    if (!isActiveAdultFarmer(resident) || !isCultivationTask(resident.task) ||
        resident.assignedBuildingId == null) continue;
    const candidates = candidatesByPlot.get(resident.assignedBuildingId) ?? [];
    candidates.push(resident);
    candidatesByPlot.set(resident.assignedBuildingId, candidates);
  }
  for (const candidates of candidatesByPlot.values()) candidates.sort((a, b) => a.id - b.id);

  for (const plot of plots) {
    if (plot.type !== 'field' && plot.type !== 'paddy') continue;
    const oxen = typeof plot.plowOxen === 'number' && Number.isFinite(plot.plowOxen)
      ? Math.max(0, Math.floor(plot.plowOxen))
      : 0;
    if (oxen === 0) continue;
    const candidates = candidatesByPlot.get(plot.id) ?? [];
    for (const resident of candidates.slice(0, oxen)) selected.add(resident.id);
  }
  return selected;
}

export function farmerSpriteActionFor(
  resident: FarmerPresentationResident,
  oxPlowFarmerIds: ReadonlySet<number>,
): FarmerSpriteAction | undefined {
  if (!isActiveAdultFarmer(resident)) return undefined;
  if (resident.task === '수확 중') return 'harvest';
  if (!isCultivationTask(resident.task)) return undefined;
  return oxPlowFarmerIds.has(resident.id) ? 'oxPlow' : 'till';
}
