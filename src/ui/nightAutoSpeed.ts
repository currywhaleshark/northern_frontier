import { dayBandOf } from '../game/dayCycle';
import type { GameState } from '../game/types';

export const SLEEPING_NIGHT_SPEED = 10;

export interface NightAutoSpeedState {
  automaticDay: number | null;
  overrideDay: number | null;
  restoreSpeed: number;
}

export function createNightAutoSpeedState(): NightAutoSpeedState {
  return {
    automaticDay: null,
    overrideDay: null,
    restoreSpeed: 1,
  };
}

export function markNightSpeedOverride(
  control: NightAutoSpeedState,
  state: Pick<GameState, 'day' | 'subTick'>,
): void {
  if (dayBandOf(state.subTick) !== 'night') return;
  control.overrideDay = state.day;
  // 사용자가 밤중에 속도를 바꾸면 아침의 자동 복귀도 하지 않는다.
  control.automaticDay = null;
}

export function nightAutoSpeedTarget(
  control: NightAutoSpeedState,
  state: Pick<GameState, 'day' | 'subTick' | 'residents'>,
  currentSpeed: number,
  enabled: boolean,
): number | null {
  const night = dayBandOf(state.subTick) === 'night';

  if (!enabled || !night) {
    if (control.automaticDay == null) return null;
    const restoreSpeed = control.restoreSpeed;
    control.automaticDay = null;
    return restoreSpeed;
  }

  if (control.automaticDay === state.day || control.overrideDay === state.day) return null;
  const livingResidents = state.residents.filter(resident => resident.alive);
  if (livingResidents.length === 0 ||
      livingResidents.some(resident => resident.phase !== 'sleeping')) return null;

  control.automaticDay = state.day;
  control.restoreSpeed = currentSpeed;
  return SLEEPING_NIGHT_SPEED;
}
