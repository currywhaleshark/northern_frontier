import type { UiIconName } from '../ui/uiIconAssets';
import { CONFIG } from './config';
import type { GameState } from './types';

/**
 * 기물 ID의 단일 원본. 저장 정규화와 도감 필터도 이 목록을 사용한다.
 * `types.ts`는 여기서 타입만 가져오므로 런타임 순환 참조를 만들지 않는다.
 */
export const SPECIAL_ITEM_IDS = [
  'wildGinseng',
  'tigerPelt',
  'gyrfalcon',
  'boDecree',
  'jinDecree',
  'buDecree',
  'reliefGrainVoucher',
  'tributeWaiverDecree',
  'recruitmentNotice',
  'rainGauge',
] as const;

export type SpecialItemId = (typeof SPECIAL_ITEM_IDS)[number];

const SPECIAL_ITEM_ID_SET = new Set<string>(SPECIAL_ITEM_IDS);

export function isSpecialItemId(value: unknown): value is SpecialItemId {
  return typeof value === 'string' && SPECIAL_ITEM_ID_SET.has(value);
}

export function createSpecialItemInventory(): Record<SpecialItemId, number> {
  return Object.fromEntries(SPECIAL_ITEM_IDS.map(item => [item, 0])) as Record<SpecialItemId, number>;
}

/** 구 저장·런타임 누락값을 기물함의 현재 형태로 맞춘다. */
export function normalizeSpecialItemInventory(value: unknown): Record<SpecialItemId, number> {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const inventory = createSpecialItemInventory();
  for (const item of SPECIAL_ITEM_IDS) {
    const amount = Number(source[item]);
    inventory[item] = Number.isFinite(amount) ? Math.max(0, amount) : 0;
  }
  return inventory;
}

/** 알 수 없는 ID와 중복을 제거해, 소모 뒤에도 남는 도감을 안전하게 복원한다. */
export function normalizeDiscoveredSpecialItems(value: unknown): SpecialItemId[] {
  if (!Array.isArray(value)) return [];
  const discovered: SpecialItemId[] = [];
  for (const item of value) {
    if (isSpecialItemId(item) && !discovered.includes(item)) discovered.push(item);
  }
  return discovered;
}

/**
 * 기물 획득은 재고와 도감을 함께 갱신해야 한다. 이벤트·승격·하사품이 각각
 * 한쪽만 고치는 일을 막기 위해 공통 경로로 묶는다.
 */
export function grantSpecialItem(
  state: Pick<GameState, 'specialItems' | 'discoveredSpecialItems'>,
  item: SpecialItemId,
): void {
  state.specialItems[item] = (state.specialItems[item] ?? 0) + 1;
  if (!state.discoveredSpecialItems.includes(item)) state.discoveredSpecialItems.push(item);
}

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
  reliefGrainVoucher: {
    name: '구휼미 어음',
    icon: 'important',
    desc: '조정의 구휼미를 받을 수 있는 어음. 기물함에서 사용하면 곡물을 확보합니다.',
    tradeValue: 0,
    inventoryNote: '하사 전용 · 사용 시 소모',
  },
  tributeWaiverDecree: {
    name: '면세 교지',
    icon: 'decree',
    desc: '해당 해 세공을 면제받는 조정의 교지. 기물함에서 사용하거나 수거일에 내보일 수 있습니다.',
    tradeValue: 0,
    inventoryNote: '하사 전용 · 사용 시 소모',
  },
  recruitmentNotice: {
    name: '모민 방문',
    icon: 'calligraphy',
    desc: '새 주민 한 가구를 받아들일 기회를 여는 조정의 방문. 수락 여부를 정할 수 있습니다.',
    tradeValue: 0,
    inventoryNote: '하사 전용 · 사용 시 소모',
  },
  rainGauge: {
    name: '측우기',
    icon: 'weatherRain',
    desc: '해마다 달라지는 기후와 재해 선택지의 성공 가능성을 살필 수 있는 기구입니다.',
    tradeValue: 0,
    inventoryNote: '보유 중 기후·재해 정보 공개',
  },
};
