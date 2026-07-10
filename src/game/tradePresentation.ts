import type { ResourceId } from './types';

export interface FactionArtwork {
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
};

export const TRADE_RESOURCE_SPRITES: Partial<Record<ResourceId, { column: number; row: number }>> = {
  grain: { column: 0, row: 0 },
  hide: { column: 1, row: 0 },
  iron: { column: 2, row: 0 },
  tools: { column: 3, row: 0 },
  meat: { column: 0, row: 1 },
  fish: { column: 1, row: 1 },
  herbs: { column: 2, row: 1 },
  hideClothes: { column: 3, row: 1 },
};
