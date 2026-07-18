import { CONFIG } from './config';
import type { JobId, Resident } from './types';

export function isYouthWorkJob(job: JobId): boolean {
  return CONFIG.lifecycle.youthAllowedJobs.includes(job);
}

export function youthActivityOf(
  resident: Pick<Resident, 'stage' | 'youthActivity'>,
): 'work' | 'school' | null {
  if (resident.stage !== 'youth') return null;
  return resident.youthActivity === 'school' ? 'school' : 'work';
}

export function isWorkingYouth(
  resident: Pick<Resident, 'stage' | 'youthActivity'>,
): boolean {
  return youthActivityOf(resident) === 'work';
}

export function canResidentTakeJob(
  resident: Pick<Resident, 'stage' | 'youthActivity'>,
  job: JobId,
): boolean {
  if (!resident.stage) return true;
  return isWorkingYouth(resident) && isYouthWorkJob(job);
}

export function youthLaborMult(
  resident: Pick<Resident, 'stage' | 'youthActivity'>,
): number {
  if (resident.stage !== 'youth') return resident.stage ? 0 : 1;
  return isWorkingYouth(resident) ? CONFIG.lifecycle.youthWorkEfficiency : 0;
}
