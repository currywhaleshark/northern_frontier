import type { BuildingTypeId, DayBand, GameState, Resident } from './types';

export const DAY_CYCLE_SUBTICKS = 72;

export const DAY_BANDS = {
  dawn: { start: 0, end: 8 },
  work: { start: 9, end: 44 },
  evening: { start: 45, end: 57 },
  night: { start: 58, end: 71 },
} as const satisfies Readonly<Record<DayBand, { start: number; end: number }>>;

export const WORK_SUBTICKS = DAY_BANDS.work.end - DAY_BANDS.work.start + 1;
export const LEGACY_WORK_SUBTICKS = 8;
export const WORK_RATE_SCALE = LEGACY_WORK_SUBTICKS / WORK_SUBTICKS;

const DAY_BAND_ORDER: readonly DayBand[] = ['dawn', 'work', 'evening', 'night'];
const INDOOR_LEISURE_BUILDING_TYPES: ReadonlySet<BuildingTypeId> = new Set([
  'shrine',
  'hermitage',
]);

export function dayBandOf(subTick: number): DayBand {
  if (!Number.isInteger(subTick) || subTick < 0 || subTick >= DAY_CYCLE_SUBTICKS) {
    throw new RangeError(`subTick must be an integer from 0 to ${DAY_CYCLE_SUBTICKS - 1}`);
  }

  for (const band of DAY_BAND_ORDER) {
    const range = DAY_BANDS[band];
    if (subTick >= range.start && subTick <= range.end) return band;
  }

  throw new RangeError(`subTick ${subTick} is not covered by DAY_BANDS`);
}

export function normalizeDayCycleSubTick(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.min(DAY_CYCLE_SUBTICKS - 1, Math.max(0, Math.floor(numeric)));
}

export function isIndoors(state: GameState, resident: Resident): boolean {
  if (resident.phase === 'sleeping') {
    if (resident.homeBuildingId == null) return false;
    const home = state.buildings.find(building => building.id === resident.homeBuildingId);
    return Boolean(home?.built);
  }

  if (resident.phase !== 'leisure' || resident.targetId == null) return false;
  const destination = state.buildings.find(building => building.id === resident.targetId);
  return Boolean(destination?.built && INDOOR_LEISURE_BUILDING_TYPES.has(destination.type));
}
