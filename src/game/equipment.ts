import { CONFIG } from './config';
import type { GameState, Resident } from './types';

function carriedAmount(resident: Resident): number {
  return Object.values(resident.carrying).reduce((sum, amount) => sum + (amount ?? 0), 0);
}

export function haulerCarryCapacity(
  resident: Pick<Resident, 'job' | 'cartEquipped'>,
): number {
  return resident.job === 'hauler' && resident.cartEquipped
    ? CONFIG.agents.haulerCartCarryCap
    : CONFIG.agents.haulerCarryCap;
}

export function returnResidentCart(state: GameState, resident: Resident): boolean {
  if (!resident.cartEquipped) return false;
  resident.cartEquipped = false;
  state.resources.carts += 1;
  return true;
}

export function setResidentCartEquipped(
  state: GameState,
  resident: Resident,
  equipped: boolean,
): string | null {
  if (!resident.alive) return '사망한 주민의 장비는 바꿀 수 없습니다.';
  if (resident.job !== 'hauler') return '수레는 운반꾼만 장비할 수 있습니다.';
  if (equipped === resident.cartEquipped) return null;

  if (equipped) {
    if (state.resources.carts < 1) return '마을에 남은 수레가 없습니다.';
    state.resources.carts -= 1;
    resident.cartEquipped = true;
    return null;
  }

  if (carriedAmount(resident) > CONFIG.agents.haulerCarryCap + 0.0001) {
    return `짐을 ${CONFIG.agents.haulerCarryCap} 이하로 내린 뒤 수레를 반납할 수 있습니다.`;
  }
  returnResidentCart(state, resident);
  return null;
}
