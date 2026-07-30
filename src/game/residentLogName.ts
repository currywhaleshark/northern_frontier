import { JOB_NAMES } from './constants';
import type { Resident } from './types';

const LIFE_STAGE_LOG_NAMES = {
  infant: '아기',
  child: '어린이',
  youth: '소년',
} as const;

type LogNamedResident = Pick<
  Resident,
  'name' | 'job' | 'special' | 'stage' | 'religiousVocation'
>;

// 로그에서는 동명이인을 빠르게 구분할 수 있도록 일반 주민의 현재 역할을 붙인다.
// 네임드는 이름 자체에 칭호가 들어 있으므로 그대로 둔다.
export function residentLogName(resident: LogNamedResident): string {
  if (resident.special) return resident.name;
  if (resident.stage === 'youth' && resident.religiousVocation === 'monk') {
    return `동자승 ${resident.name}`;
  }
  if (resident.stage) return `${LIFE_STAGE_LOG_NAMES[resident.stage]} ${resident.name}`;
  return `${JOB_NAMES[resident.job]} ${resident.name}`;
}
