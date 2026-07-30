import type { GameState, JobId, Resident } from '../game/types';

export type ResidentStatusFilter = 'all' | 'attention' | 'workplace' | 'young' | 'special' | 'dead';
export type ResidentSort = 'arrival' | 'name' | 'health' | 'job' | 'workplace';
export type ResidentJobFilter = 'all' | 'religious' | JobId;

export interface ResidentListFilters {
  query: string;
  job: ResidentJobFilter;
  status: ResidentStatusFilter;
  sort: ResidentSort;
}
function normalized(value: string): string {
  return value.trim().toLocaleLowerCase('ko-KR');
}

function hasHealthAttention(state: GameState, resident: Resident): boolean {
  return resident.alive && (
    resident.sick ||
    state.day < (resident.quarantinedUntil ?? 0) ||
    resident.health < 50
  );
}

function lacksWorkplace(resident: Resident): boolean {
  return resident.alive && !resident.stage && resident.assignedBuildingId == null;
}

function matchesStatus(state: GameState, resident: Resident, status: ResidentStatusFilter): boolean {
  switch (status) {
    case 'attention': return hasHealthAttention(state, resident);
    case 'workplace': return lacksWorkplace(resident);
    case 'young': return resident.alive && resident.stage != null;
    case 'special': return resident.alive && Boolean(resident.special);
    case 'dead': return !resident.alive;
    default: return true;
  }
}

function compareById(left: Resident, right: Resident): number {
  return left.id - right.id;
}

function compareResidents(left: Resident, right: Resident, sort: ResidentSort): number {
  if (sort === 'arrival') return compareById(left, right);
  if (sort === 'name') return left.name.localeCompare(right.name, 'ko-KR') || compareById(left, right);
  if (sort === 'health') {
    return Number(right.alive) - Number(left.alive)
      || left.health - right.health
      || compareById(left, right);
  }
  if (sort === 'job') {
    return left.job.localeCompare(right.job, 'en') || compareById(left, right);
  }
  return Number(lacksWorkplace(right)) - Number(lacksWorkplace(left)) || compareById(left, right);
}

function matchesJob(resident: Resident, job: ResidentJobFilter): boolean {
  if (job === 'all') return true;
  if (job === 'religious') {
    return resident.religiousVocation === 'shaman' ||
      resident.religiousVocation === 'monk' ||
      resident.job === 'shaman' ||
      resident.job === 'monk';
  }
  return resident.job === job;
}

export function filteredResidents(state: GameState, filters: ResidentListFilters): Resident[] {
  const query = normalized(filters.query);
  return state.residents
    .filter(resident =>
      matchesJob(resident, filters.job) &&
      matchesStatus(state, resident, filters.status) &&
      (!query || normalized(resident.name).includes(query)),
    )
    .sort((left, right) => compareResidents(left, right, filters.sort));
}
