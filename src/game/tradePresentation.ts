import type { ResourceId } from './types';

interface FactionArtwork {
  src: string;
  alt: string;
  position?: string;
}

export const FACTION_ARTWORK: Record<string, FactionArtwork> = {
  '오도리 씨족': {
    src: '/assets/factions/odoori-v1.png',
    alt: '두만강가 농경 취락에서 곡물 교역을 준비하는 오도리 씨족',
    position: 'center 16%',
  },
  '올량합 부락': {
    src: '/assets/factions/olyanghap-v1.png',
    alt: '가죽과 말린 고기를 펼쳐 놓은 올량합 부락의 교역 장로',
    position: 'center 16%',
  },
  '골간 우디캐': {
    src: '/assets/factions/golgan-udige-v1.png',
    alt: '두만강 하구에서 마른 생선을 내놓는 골간 우디캐 어민',
    position: 'center 14%',
  },
  '니마차 우디캐': {
    src: '/assets/factions/nimacha-udige-v1.png',
    alt: '깊은 숲의 모피와 약초를 지키는 니마차 우디캐 사냥꾼',
    position: 'center 14%',
  },
  '홀라온 야인': {
    src: '/assets/factions/hollaon-v1.png',
    alt: '송화강 방면 설원에 머문 홀라온 야인의 기마 지도자',
    position: 'center 18%',
  },
  '변경 마적': {
    src: '/assets/factions/frontier-bandits-v1.png',
    alt: '겨울 산골 은신처에 모인 변경 마적 무리',
    position: 'center 16%',
  },
  '만상': {
    src: '/assets/factions/mansang-v1.png',
    alt: '북방 부두에 목화와 비단 꾸러미를 내리는 만상 상단',
    position: 'center 6%',
  },
  '송상': {
    src: '/assets/factions/songsang-v1.png',
    alt: '부두 창고에서 자기와 유기, 칠기와 비단을 거래하는 송상 상단',
    position: 'center 6%',
  },
};

export type ResourceIconId = ResourceId | 'foodGroup' | 'fuelGroup' | 'clothingGroup' | 'footwearGroup' | 'luxuryGroup';

interface TradeResourceSprite {
  atlas: string;
  columns: number;
  rows: number;
  column: number;
  row: number;
}

const BASE_ATLAS = '/assets/resources/trade-resource-atlas-v1.png';
const EXTENDED_ATLAS = '/assets/resources/trade-resource-atlas-v2.png';
const COMPLETE_ATLAS = '/assets/resources/trade-resource-atlas-v3.png';
const NEW_CONTENT_ATLAS = '/assets/resources/new-content-resource-atlas-v1.png';
const FUEL_GROUP_ICON = '/assets/resources/fuel-group-v1.png';
const COURT_ITEM_ATLAS = '/assets/ui/court-item-icons-v1.png';

export const RESOURCE_SPRITES: Partial<Record<ResourceIconId, TradeResourceSprite>> = {
  grain: { atlas: BASE_ATLAS, columns: 4, rows: 2, column: 0, row: 0 },
  hide: { atlas: BASE_ATLAS, columns: 4, rows: 2, column: 1, row: 0 },
  iron: { atlas: BASE_ATLAS, columns: 4, rows: 2, column: 2, row: 0 },
  tools: { atlas: BASE_ATLAS, columns: 4, rows: 2, column: 3, row: 0 },
  meat: { atlas: BASE_ATLAS, columns: 4, rows: 2, column: 0, row: 1 },
  fish: { atlas: BASE_ATLAS, columns: 4, rows: 2, column: 1, row: 1 },
  herbs: { atlas: BASE_ATLAS, columns: 4, rows: 2, column: 2, row: 1 },
  hideClothes: { atlas: BASE_ATLAS, columns: 4, rows: 2, column: 3, row: 1 },
  leatherShoes: { atlas: COURT_ITEM_ATLAS, columns: 4, rows: 4, column: 1, row: 0 },
  wood: { atlas: EXTENDED_ATLAS, columns: 4, rows: 3, column: 0, row: 0 },
  firewood: { atlas: EXTENDED_ATLAS, columns: 4, rows: 3, column: 1, row: 0 },
  stone: { atlas: EXTENDED_ATLAS, columns: 4, rows: 3, column: 2, row: 0 },
  charcoal: { atlas: EXTENDED_ATLAS, columns: 4, rows: 3, column: 3, row: 0 },
  cotton: { atlas: EXTENDED_ATLAS, columns: 4, rows: 3, column: 0, row: 1 },
  cottonClothes: { atlas: EXTENDED_ATLAS, columns: 4, rows: 3, column: 1, row: 1 },
  porcelain: { atlas: EXTENDED_ATLAS, columns: 4, rows: 3, column: 2, row: 1 },
  brassware: { atlas: EXTENDED_ATLAS, columns: 4, rows: 3, column: 3, row: 1 },
  lacquerware: { atlas: EXTENDED_ATLAS, columns: 4, rows: 3, column: 0, row: 2 },
  silk: { atlas: EXTENDED_ATLAS, columns: 4, rows: 3, column: 1, row: 2 },
  preciousMetal: { atlas: EXTENDED_ATLAS, columns: 4, rows: 3, column: 2, row: 2 },
  vegetables: { atlas: EXTENDED_ATLAS, columns: 4, rows: 3, column: 3, row: 2 },
  rice: { atlas: COMPLETE_ATLAS, columns: 4, rows: 3, column: 0, row: 0 },
  brushwood: { atlas: COMPLETE_ATLAS, columns: 4, rows: 3, column: 1, row: 0 },
  carts: { atlas: COMPLETE_ATLAS, columns: 4, rows: 3, column: 2, row: 0 },
  gunpowder: { atlas: COMPLETE_ATLAS, columns: 4, rows: 3, column: 3, row: 0 },
  spears: { atlas: COMPLETE_ATLAS, columns: 4, rows: 3, column: 0, row: 1 },
  hornBows: { atlas: COMPLETE_ATLAS, columns: 4, rows: 3, column: 1, row: 1 },
  muskets: { atlas: COMPLETE_ATLAS, columns: 4, rows: 3, column: 2, row: 1 },
  reputation: { atlas: COMPLETE_ATLAS, columns: 4, rows: 3, column: 3, row: 1 },
  defense: { atlas: COMPLETE_ATLAS, columns: 4, rows: 3, column: 0, row: 2 },
  foodGroup: { atlas: COMPLETE_ATLAS, columns: 4, rows: 3, column: 1, row: 2 },
  clothingGroup: { atlas: COMPLETE_ATLAS, columns: 4, rows: 3, column: 2, row: 2 },
  footwearGroup: { atlas: COMPLETE_ATLAS, columns: 4, rows: 3, column: 2, row: 2 },
  luxuryGroup: { atlas: COMPLETE_ATLAS, columns: 4, rows: 3, column: 3, row: 2 },
  fuelGroup: { atlas: FUEL_GROUP_ICON, columns: 1, rows: 1, column: 0, row: 0 },
  eggs: { atlas: NEW_CONTENT_ATLAS, columns: 4, rows: 4, column: 0, row: 0 },
  milk: { atlas: NEW_CONTENT_ATLAS, columns: 4, rows: 4, column: 1, row: 0 },
  curedMeat: { atlas: NEW_CONTENT_ATLAS, columns: 4, rows: 4, column: 2, row: 0 },
  saltedFish: { atlas: NEW_CONTENT_ATLAS, columns: 4, rows: 4, column: 3, row: 0 },
  driedFish: { atlas: NEW_CONTENT_ATLAS, columns: 4, rows: 4, column: 0, row: 1 },
  kimchi: { atlas: NEW_CONTENT_ATLAS, columns: 4, rows: 4, column: 1, row: 1 },
  beans: { atlas: NEW_CONTENT_ATLAS, columns: 4, rows: 4, column: 2, row: 1 },
  jang: { atlas: NEW_CONTENT_ATLAS, columns: 4, rows: 4, column: 3, row: 1 },
  salt: { atlas: NEW_CONTENT_ATLAS, columns: 4, rows: 4, column: 0, row: 2 },
  onggi: { atlas: NEW_CONTENT_ATLAS, columns: 4, rows: 4, column: 1, row: 2 },
  wool: { atlas: NEW_CONTENT_ATLAS, columns: 4, rows: 4, column: 2, row: 2 },
  hay: { atlas: NEW_CONTENT_ATLAS, columns: 4, rows: 4, column: 3, row: 2 },
  strawShoes: { atlas: COURT_ITEM_ATLAS, columns: 4, rows: 4, column: 0, row: 0 },
  silver: { atlas: NEW_CONTENT_ATLAS, columns: 4, rows: 4, column: 0, row: 3 },
};
