import { CONFIG } from './config';
import type { GameState, Resident, SpecialResidentRecord } from './types';

function recordForLivingSpecialResident(
  state: GameState,
  resident: Pick<Resident, 'id' | 'special'>,
): SpecialResidentRecord | null {
  if (!resident.special) return null;
  state.specialResidentRecords ??= {};
  return state.specialResidentRecords[resident.special] ??= {
    status: 'active',
    residentId: resident.id,
    joinedDay: state.day,
  };
}

/** 새로 합류한 특수주민은 2년간 노환을 면하고, 이후에도 노환 확률이 절반이다. */
export function specialResidentOldAgeDeathMultiplier(
  state: GameState,
  resident: Pick<Resident, 'id' | 'special'>,
): number {
  if (!resident.special) return 1;
  const joinedDay = state.specialResidentRecords?.[resident.special]?.joinedDay;
  if (joinedDay != null) {
    const graceDays = CONFIG.specialResidents.oldAgeGraceYears * CONFIG.time.yearDays;
    if (state.day - joinedDay < graceDays) return 0;
  }
  return CONFIG.specialResidents.oldAgeDeathMultiplier;
}

/** 맹수·역병의 무작위 즉사를 게임당 인물별 한 번만 중태로 바꾼다. */
export function applySpecialResidentFatefulEscape(
  state: GameState,
  resident: Pick<Resident, 'id' | 'special' | 'health' | 'sick'>,
): number | null {
  const record = recordForLivingSpecialResident(state, resident);
  if (!record || record.fatefulEscapeUsed) return null;
  record.fatefulEscapeUsed = true;
  const before = resident.health;
  resident.health = Math.max(1, Math.min(resident.health, CONFIG.specialResidents.fatefulEscapeHealth));
  resident.sick = true;
  return Math.max(0, before - resident.health);
}
