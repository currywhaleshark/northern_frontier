import type { BuildingTypeId, DayBand, GameState, Resident } from './types';

export const DAY_CYCLE_SUBTICKS = 12;

export const DAY_BANDS = {
  dawn: { start: 0, end: 0 },
  work: { start: 1, end: 8 },
  evening: { start: 9, end: 9 },
  night: { start: 10, end: 11 },
} as const satisfies Readonly<Record<DayBand, { start: number; end: number }>>;

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
