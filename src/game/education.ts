// 교육 — 서당 취학과 문해(文解).
// 아이(어린이·소년)는 서당 정원 안에 들면 글공부를 하고, 밖이면 반몫 심부름을 한다.
// 취학 일수를 채운 아이는 성인이 될 때 문해자가 된다. 문해자만 의원·아전·훈장을
// 맡을 수 있고, 무엇을 배워도 빠르며(숙련 가속), 전직할 때 익힌 것의 일부를 들고 간다.
import { CONFIG } from './config';
import { assignedWorkers } from './workerSlots';
import type { GameState, JobId, Resident } from './types';
import { youthActivityOf } from './youth';

// 문해자 전용 관직 — 글을 모르면 맡을 수 없다
export const LITERATE_JOBS: readonly JobId[] = ['physician', 'clerk', 'teacher'];

export function isLiterateJob(job: JobId): boolean {
  return LITERATE_JOBS.includes(job);
}

export function literateAdults(state: GameState): Resident[] {
  return state.residents.filter(resident => resident.alive && !resident.stage && resident.literate === true);
}

export function isSchoolAge(resident: Pick<Resident, 'alive' | 'stage'>): boolean {
  return resident.alive && (resident.stage === 'child' || resident.stage === 'youth');
}

// 취학 정원 — 건강한 훈장 1명당 seatsPerTeacher명
export function schoolSeatCount(state: GameState): number {
  let teachers = 0;
  for (const building of state.buildings) {
    if (building.type !== 'school' || !building.built) continue;
    teachers += assignedWorkers(state, building).filter(worker =>
      worker.job === 'teacher' && worker.alive && !worker.sick).length;
  }
  return teachers * CONFIG.education.seatsPerTeacher;
}

// 취학생 — 나이 든 아이(소년 우선)가 먼저 자리를 얻는다. 소년은 졸업이 가까워
// 남은 취학 기회가 적기 때문이다. 같은 단계면 먼저 태어난 아이 순.
export function enrolledStudentIds(state: GameState): Set<number> {
  const seats = schoolSeatCount(state);
  if (seats <= 0) return new Set();
  const students = state.residents
    .filter(resident => isSchoolAge(resident)
      && (resident.stage === 'child' || youthActivityOf(resident) === 'school'))
    .sort((a, b) => {
      const stageRank = (resident: Resident) => resident.stage === 'youth' ? 0 : 1;
      return stageRank(a) - stageRank(b) || a.id - b.id;
    })
    .slice(0, seats);
  return new Set(students.map(resident => resident.id));
}

// 일일 — 취학생의 글공부가 쌓인다
export function dailyEducationTick(state: GameState): void {
  const enrolled = enrolledStudentIds(state);
  if (enrolled.size === 0) return;
  for (const resident of state.residents) {
    if (!enrolled.has(resident.id)) continue;
    resident.education = Math.min(
      CONFIG.education.schoolDaysForAdultBonus,
      (resident.education ?? 0) + CONFIG.education.schoolProgressPerDay,
    );
  }
}

// 성인 전환 시 — 취학 일수를 채웠으면 문해자가 된다 (lifecycle에서 호출)
export function settleEducationOnAdulthood(resident: Resident): boolean {
  if (resident.education == null) {
    delete resident.youthActivity;
    return false;
  }
  const completed = resident.education >= CONFIG.education.schoolDaysForAdultBonus;
  resident.literate = completed;
  if (completed) {
    resident.skills.clerk = Math.max(
      resident.skills.clerk ?? 0,
      CONFIG.education.schoolAdultSkillBonus,
    );
    resident.skills.teacher = Math.max(
      resident.skills.teacher ?? 0,
      CONFIG.education.schoolAdultSkillBonus,
    );
  }
  resident.education = undefined;
  delete resident.youthActivity;
  return completed;
}

// 문해자의 숙련 성장 배율
export function skillGainMult(resident: Pick<Resident, 'literate'>): number {
  return resident.literate === true ? CONFIG.education.literateSkillGainMult : 1;
}

// 전직 시 — 문해자는 최고 숙련의 일부를 새 직업에 이월한다 ("문리가 트인 사람")
export function applyJobChangeCarryover(resident: Resident, newJob: JobId): void {
  if (resident.literate !== true) return;
  const best = Math.max(0, ...Object.values(resident.skills).map(value => value ?? 0));
  const carried = best * CONFIG.education.literateCarryover;
  if (carried > (resident.skills[newJob] ?? 0)) resident.skills[newJob] = carried;
}
