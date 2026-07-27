import type { UiIconName } from '../ui/uiIconAssets';
import { CONFIG } from './config';
import type { SpecialItemId } from './types';

export const SPECIAL_ITEM_DEFS: Record<SpecialItemId, {
  name: string;
  icon: UiIconName;
  desc: string;
  tradeValue: number;
  inventoryNote: string;
}> = {
  wildGinseng: {
    name: '산삼',
    icon: 'herb',
    desc: '깊은 산에서 얻은 귀한 약재. 모든 교역 상대가 높게 쳐줍니다.',
    tradeValue: CONFIG.specialEvents.ginsengTradeValue,
    inventoryNote: `교역 가치 ${CONFIG.specialEvents.ginsengTradeValue}`,
  },
  tigerPelt: {
    name: '호피',
    icon: 'tiger',
    desc: '호랑이 토벌의 증표. 진상품이자 값비싼 교역 기물입니다.',
    tradeValue: CONFIG.specialEvents.tigerPeltTradeValue,
    inventoryNote: `교역 가치 ${CONFIG.specialEvents.tigerPeltTradeValue}`,
  },
  gyrfalcon: {
    name: '해동청',
    icon: 'eagle',
    desc: '북방의 귀한 매. 습격 무리를 더 일찍 발견하고 맹수 토벌의 규모 파악을 돕습니다.',
    tradeValue: 0,
    inventoryNote: '보유 중 습격 조기발견 보너스',
  },
  boDecree: {
    name: '보(堡) 승격 교지',
    icon: 'decree',
    desc: '조정이 개척지를 보로 올리는 것을 허락한 교지. 중심지를 업그레이드할 수 있습니다.',
    tradeValue: 0,
    inventoryNote: '영구 보관 · 보 승격의 증표',
  },
  jinDecree: {
    name: '진(鎭) 승격 교지',
    icon: 'decree',
    desc: '조정이 보를 진으로 올리는 것을 허락한 교지. 중심지를 업그레이드할 수 있습니다.',
    tradeValue: 0,
    inventoryNote: '영구 보관 · 진 승격의 증표',
  },
  buDecree: {
    name: '부(府) 승격 교지',
    icon: 'decree',
    desc: '조정이 진을 부로 올리는 것을 허락한 교지. 개척 대업을 완성하는 문서입니다.',
    tradeValue: 0,
    inventoryNote: '영구 보관 · 부 승격의 증표',
  },
};
