import { CONFIG } from './config';
import type { SpecialItemId } from './types';

export const SPECIAL_ITEM_DEFS: Record<SpecialItemId, {
  name: string;
  icon: string;
  desc: string;
  tradeValue: number;
}> = {
  wildGinseng: {
    name: '산삼',
    icon: '🌿',
    desc: '깊은 산에서 얻은 귀한 약재. 모든 교역 상대가 높게 쳐줍니다.',
    tradeValue: CONFIG.specialEvents.ginsengTradeValue,
  },
  tigerPelt: {
    name: '호피',
    icon: '虎',
    desc: '호랑이 토벌의 증표. 진상품이자 값비싼 교역 기물입니다.',
    tradeValue: CONFIG.specialEvents.tigerPeltTradeValue,
  },
  gyrfalcon: {
    name: '해동청',
    icon: '鷹',
    desc: '북방의 귀한 매. 습격 무리를 더 일찍 발견하고 맹수 토벌의 규모 파악을 돕습니다.',
    tradeValue: 0,
  },
};
