// 건물 정의와 배치/방어 관련 헬퍼
import { CONFIG } from './config';
import type { Building, BuildingDef, BuildingTypeId, GameState, Tile } from './types';

export const BUILDING_DEFS: Record<BuildingTypeId, BuildingDef> = {
  center: {
    id: 'center', name: '마을 중심지', emoji: '🏯',
    desc: '개척지의 심장. 파괴되면 마을은 끝장난다.',
    cost: {}, buildDays: 0, slots: 0, capacity: 4, defense: 5,
    winterBonus: false, placement: 'land', unique: true,
  },
  hut: {
    id: 'hut', name: '초가집', emoji: '🛖',
    desc: '4명이 사는 움집. 겨울엔 웃풍이 심하다.',
    cost: { wood: 8 }, buildDays: 5, slots: 0, capacity: 4, defense: 0,
    winterBonus: false, placement: 'land', unique: false,
  },
  ondol: {
    id: 'ondol', name: '온돌집', emoji: '🏠',
    desc: '구들을 놓은 집. 장작만 있으면 겨울 체온 손실이 크게 줄어든다. 5명 수용.',
    cost: { wood: 12, stone: 8 }, buildDays: 10, slots: 0, capacity: 5, defense: 0,
    winterBonus: true, placement: 'land', unique: false,
  },
  storehouse: {
    id: 'storehouse', name: '창고', emoji: '🏚️',
    desc: '모든 짐을 부리는 하역 거점. 작업지 가까이 지으면 운반이 빨라지고, 습격 약탈 피해도 조금 줄인다.',
    cost: { wood: 10, stone: 2 }, buildDays: 6, slots: 0, capacity: 0, defense: 0,
    winterBonus: false, placement: 'land', unique: false,
  },
  lumberCamp: {
    id: 'lumberCamp', name: '벌목장', emoji: '🪓',
    desc: '벌목꾼이 목재를 부리는 거점. 숲 가까이 지으면 나르는 거리가 크게 줄어든다.',
    cost: { wood: 6 }, buildDays: 4, slots: 4, capacity: 0, defense: 0,
    winterBonus: false, placement: 'land', unique: false,
  },
  huntLodge: {
    id: 'huntLodge', name: '사냥막', emoji: '🏹',
    desc: '사냥꾼이 사냥감을 부리는 거점. 사냥터 가까이 지으면 왕복이 줄어든다.',
    cost: { wood: 8, hide: 2 }, buildDays: 4, slots: 4, capacity: 0, defense: 0,
    winterBonus: false, placement: 'land', unique: false,
  },
  herbHut: {
    id: 'herbHut', name: '약초막', emoji: '🌿',
    desc: '약초꾼이 약초를 부리는 거점. 숲 가까이 지으면 채집 왕복이 줄어든다.',
    cost: { wood: 6 }, buildDays: 3, slots: 2, capacity: 0, defense: 0,
    winterBonus: false, placement: 'land', unique: false,
  },
  field: {
    id: 'field', name: '밭', emoji: '🌾',
    desc: '봄에 갈고 가을에 곡물을 거둔다. 비옥한 땅이면 소출 +30%.',
    cost: { wood: 2, tools: 1 }, buildDays: 3, slots: 2, capacity: 0, defense: 0,
    winterBonus: false, placement: 'field', unique: false,
  },
  smithy: {
    id: 'smithy', name: '대장간', emoji: '⚒️',
    desc: '철과 목재로 도구를 만든다. 철이 없으면 대장장이가 철광에서 캔다.',
    cost: { wood: 10, stone: 6 }, buildDays: 8, slots: 2, capacity: 0, defense: 0,
    winterBonus: false, placement: 'land', unique: false,
  },
  tannery: {
    id: 'tannery', name: '가죽공방', emoji: '🧵',
    desc: '가죽 2를 옷 1로 만든다. (자동, 하루 2가죽 처리)',
    cost: { wood: 8, tools: 1 }, buildDays: 5, slots: 2, capacity: 0, defense: 0,
    winterBonus: false, placement: 'land', unique: false,
  },
  beacon: {
    id: 'beacon', name: '봉수대', emoji: '🗻',
    desc: '습격 조기 경보 확률이 크게 오르고, 습격 시 경보 대응이 가능해진다.',
    cost: { wood: 6, stone: 12 }, buildDays: 8, slots: 1, capacity: 0, defense: 4,
    winterBonus: false, placement: 'land', unique: true,
  },
  palisade: {
    id: 'palisade', name: '목책', emoji: '🚧',
    desc: '통나무 방책 한 구간. 방어도 +3. 여러 개 지을 수 있다.',
    cost: { wood: 4 }, buildDays: 2, slots: 0, capacity: 0, defense: 3,
    winterBonus: false, placement: 'land', unique: false,
  },
  watchtower: {
    id: 'watchtower', name: '망루', emoji: '🗼',
    desc: '방어도 +8, 조기 경보 확률 증가.',
    cost: { wood: 10, stone: 2 }, buildDays: 6, slots: 2, capacity: 0, defense: 8,
    winterBonus: false, placement: 'land', unique: false,
  },
  garrison: {
    id: 'garrison', name: '군영', emoji: '⛺',
    desc: '방어도 +25. 민병의 방어 기여가 커진다. 승리 조건에 필요하다.',
    cost: { wood: 20, stone: 10, iron: 4 }, buildDays: 14, slots: 6, capacity: 0, defense: 25,
    winterBonus: false, placement: 'land', unique: true,
  },
  market: {
    id: 'market', name: '장터', emoji: '🏮',
    desc: '북방 세력과의 교역이 열리고, 습격 시 협상을 시도할 수 있다.',
    cost: { wood: 12, stone: 4 }, buildDays: 7, slots: 2, capacity: 0, defense: 0,
    winterBonus: false, placement: 'land', unique: true,
  },
};

export const BUILD_MENU_ORDER: BuildingTypeId[] = [
  'hut', 'ondol', 'storehouse', 'field', 'lumberCamp', 'huntLodge', 'herbHut',
  'smithy', 'tannery', 'market', 'palisade', 'watchtower', 'beacon', 'garrison',
];

export function getBuilding(state: GameState, id: number | null): Building | undefined {
  if (id == null) return undefined;
  return state.buildings.find(b => b.id === id);
}

export function countBuilt(state: GameState, type: BuildingTypeId): number {
  return state.buildings.filter(b => b.type === type && b.built).length;
}

export function canPlaceOn(def: BuildingDef, tile: Tile): boolean {
  if (tile.buildingId != null) return false;
  if (tile.terrain === 'river' || tile.terrain === 'mountain' || tile.terrain === 'rock' || tile.terrain === 'center') {
    return false;
  }
  if (def.placement === 'field') {
    return tile.terrain === 'fertile' || tile.terrain === 'plain';
  }
  // land: 평지/숲/사냥터/비옥지 (숲에 지으면 개간)
  return true;
}

export function canAfford(state: GameState, def: BuildingDef): boolean {
  return Object.entries(def.cost).every(([res, amt]) =>
    state.resources[res as keyof typeof state.resources] >= (amt ?? 0));
}

// 주거 수용량 (완공 건물만)
export function housingCapacity(state: GameState): { total: number; ondol: number } {
  let total = 0, ondol = 0;
  for (const b of state.buildings) {
    if (!b.built) continue;
    const def = BUILDING_DEFS[b.type];
    total += def.capacity;
    if (def.winterBonus) ondol += def.capacity;
  }
  return { total, ondol };
}

// 방어도 = 건물 + 파수꾼 + 민병
export function computeDefense(state: GameState): number {
  let d = 0;
  for (const b of state.buildings) {
    if (b.built) d += BUILDING_DEFS[b.type].defense;
  }
  const watchmen = state.residents.filter(r => r.alive && r.job === 'watchman').length;
  const militia = state.residents.filter(r => r.alive && r.job === 'militia').length;
  d += watchmen * CONFIG.raid.watchmanDefense;
  const garrisonMult = countBuilt(state, 'garrison') > 0 ? 1.3 : 1;
  d += Math.round(militia * CONFIG.raid.militiaDefense * garrisonMult);
  return Math.round(d);
}
