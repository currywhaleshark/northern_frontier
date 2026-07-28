// 하사 소모품은 기물함에서만 쓴다. 실패하는 동작은 재고를 줄이지 않는다.
import { CONFIG } from './config';
import { resolveTributeWaiver } from './courtTribute';
import { addLog } from './events';
import { openGrantedImmigrationChoice } from './immigration';
import { withJosa } from './josa';
import { getYear } from './seasons';
import type { GameState, SpecialItemId } from './types';

export type UsableSpecialItemId = 'reliefGrainVoucher' | 'tributeWaiverDecree' | 'recruitmentNotice';

export function useSpecialItem(state: GameState, item: UsableSpecialItemId): string | null {
  if ((state.specialItems[item] ?? 0) < 1) return '기물함에 해당 기물이 없습니다.';
  if (item === 'reliefGrainVoucher') {
    const amount = CONFIG.courtGrants.reliefGrainVoucherAmount;
    state.resources.grain = (state.resources.grain ?? 0) + amount;
    state.specialItems[item] -= 1;
    addLog(state, `구휼미 어음을 내어 조정의 ${withJosa(`곡물 ${amount}`, '을/를')} 받았습니다.`, 'good', true);
    return null;
  }
  if (item === 'tributeWaiverDecree') {
    if (!state.courtTribute || state.courtTribute.resolved || state.courtTribute.year !== getYear(state.day)) {
      return '올해 세공이 아직 공지되지 않았거나 이미 처리되었습니다.';
    }
    return resolveTributeWaiver(state, item) ? null : '면세 교지를 지금 사용할 수 없습니다.';
  }
  if (!openGrantedImmigrationChoice(state)) return '지금은 모민 방문을 펼칠 수 없습니다.';
  state.specialItems[item] -= 1;
  return null;
}

export function isUsableSpecialItem(item: SpecialItemId): item is UsableSpecialItemId {
  return item === 'reliefGrainVoucher' || item === 'tributeWaiverDecree' || item === 'recruitmentNotice';
}
