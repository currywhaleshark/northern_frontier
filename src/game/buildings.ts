// 건물 정의와 배치/방어 관련 헬퍼
import { CONFIG } from './config';
import { rankAtLeast } from './constants';
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
  tileHouse: {
    id: 'tileHouse', name: '기와집', emoji: '🏘️',
    desc: '보(堡) 승격 후 건설. 온돌을 갖춘 상위 주거. 7명 수용.',
    cost: { wood: 18, stone: 16, tools: 2 }, buildDays: 14, slots: 0, capacity: 7, defense: 0,
    winterBonus: true, placement: 'land', unique: false, minRank: 'bo',
  },
  storehouse: {
    id: 'storehouse', name: '창고', emoji: '🏚️',
    desc: '모든 짐을 부리는 하역 거점. 작업지 가까이 지으면 운반이 빨라지고, 습격 약탈 피해도 조금 줄인다.',
    cost: { wood: 10, stone: 2 }, buildDays: 6, slots: 0, capacity: 0, defense: 0,
    winterBonus: false, placement: 'land', unique: false,
  },
  bridge: {
    id: 'bridge', name: '다리', emoji: '🌉',
    desc: '보(堡) 승격 후 건설. 강 위에 놓아 사계절 주민 통행을 가능하게 한다.',
    cost: { wood: 16, stone: 10 }, buildDays: 8, slots: 0, capacity: 0, defense: 0,
    winterBonus: false, placement: 'river', unique: false, minRank: 'bo',
  },
  lumberCamp: {
    id: 'lumberCamp', name: '벌목장', emoji: '🪓',
    desc: '벌목꾼이 목재를 부리는 거점. 숲 가까이 지으면 나르는 거리가 크게 줄어든다.',
    cost: { wood: 6 }, buildDays: 4, slots: 4, capacity: 0, defense: 0,
    winterBonus: false, placement: 'land', unique: false,
  },
  huntLodge: {
    id: 'huntLodge', name: '사냥막', emoji: '🏹',
    desc: '사냥꾼이 사냥감을 부리는 거점. 짐승 서식지 가까이 지으면 왕복이 줄어든다.',
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
  mine: {
    id: 'mine', name: '채광장', emoji: '⛏️',
    desc: '보(堡) 승격 후 건설. 채광꾼이 돌과 철을 캐는 거점.',
    cost: { wood: 10, stone: 8, tools: 2 }, buildDays: 8, slots: 4, capacity: 0, defense: 0,
    winterBonus: false, placement: 'rock', unique: false, minRank: 'bo',
  },
  ferry: {
    id: 'ferry', name: '나루터', emoji: '⛵',
    desc: '보(堡) 승격 후 건설. 강가에 두어 어부가 식량을 얻는 거점.',
    cost: { wood: 14, stone: 4, tools: 1 }, buildDays: 7, slots: 4, capacity: 0, defense: 0,
    winterBonus: false, placement: 'riverbank', unique: false, minRank: 'bo',
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
    desc: '방어도 +25. 수비병의 방어 기여가 커진다. 승리 조건에 필요하다.',
    cost: { wood: 20, stone: 10, iron: 4 }, buildDays: 14, slots: 6, capacity: 0, defense: 25,
    winterBonus: false, placement: 'land', unique: true,
  },
  market: {
    id: 'market', name: '장터', emoji: '🏮',
    desc: '북방 세력과의 교역이 열리고, 습격 시 협상을 시도할 수 있다.',
    cost: { wood: 12, stone: 4 }, buildDays: 7, slots: 2, capacity: 0, defense: 0,
    winterBonus: false, placement: 'land', unique: true,
  },
  cannonEmplacement: {
    id: 'cannonEmplacement', name: '불랑기포대', emoji: '💥',
    desc: '조정이 하사한 불랑기포를 얹은 포대. 방어도 +40, 화약이 있으면 전투 방어가 크게 오른다 (교전마다 화약 소모). 부(府) 승격 후 조정 청원으로만 받을 수 있다.',
    cost: { wood: 6, stone: 10 }, buildDays: 6, slots: 1, capacity: 0, defense: 40,
    winterBonus: false, placement: 'land', unique: false,
  },
};

export const BUILD_MENU_ORDER: BuildingTypeId[] = [
  'hut', 'ondol', 'tileHouse', 'storehouse', 'bridge', 'field', 'lumberCamp', 'huntLodge', 'herbHut',
  'smithy', 'mine', 'ferry', 'tannery', 'market', 'palisade', 'watchtower', 'beacon', 'garrison',
  'cannonEmplacement',
];

// 불랑기포대는 조정 하사 수(cannonsGranted)만큼만 놓을 수 있다 (건설 중 포함)
export function cannonPlacementsUsed(state: GameState): number {
  return state.buildings.filter(b => b.type === 'cannonEmplacement').length;
}

export function getBuilding(state: GameState, id: number | null): Building | undefined {
  if (id == null) return undefined;
  return state.buildings.find(b => b.id === id);
}

export function countBuilt(state: GameState, type: BuildingTypeId): number {
  return state.buildings.filter(b => b.type === type && b.built).length;
}

export function isBuildingUnlocked(rank: GameState['rank'] | undefined, type: BuildingTypeId): boolean {
  return rankAtLeast(rank, BUILDING_DEFS[type].minRank);
}

function isRiverbank(state: GameState | undefined, tile: Tile): boolean {
  if (!state) return false;
  if (tile.terrain === 'river' || tile.terrain === 'mountain' || tile.terrain === 'rock' || tile.terrain === 'center') {
    return false;
  }
  return (
    state.map[tile.y - 1]?.[tile.x]?.terrain === 'river' ||
    state.map[tile.y + 1]?.[tile.x]?.terrain === 'river' ||
    state.map[tile.y]?.[tile.x - 1]?.terrain === 'river' ||
    state.map[tile.y]?.[tile.x + 1]?.terrain === 'river'
  );
}

export function canPlaceOn(def: BuildingDef, tile: Tile, state?: GameState): boolean {
  if (tile.buildingId != null) return false;
  if (def.placement === 'any') return true;
  if (def.placement === 'river') return tile.terrain === 'river';
  if (def.placement === 'rock') return tile.terrain === 'rock';
  if (def.placement === 'riverbank') return isRiverbank(state, tile);
  if (def.placement === 'field') {
    return tile.terrain === 'fertile' || tile.terrain === 'plain';
  }
  if (tile.terrain === 'river' || tile.terrain === 'mountain' || tile.terrain === 'rock' || tile.terrain === 'center') {
    return false;
  }
  // land: 평지/숲/비옥지 (숲에 지으면 개간)
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

// 조총으로 무장 가능한 수비병 수 — 화약이 없으면 냉병기로 환원된다
export function armedMusketeers(state: GameState): number {
  if (state.resources.gunpowder <= 0) return 0;
  const militia = state.residents.filter(r => r.alive && r.job === 'militia').length;
  return Math.min(militia, Math.floor(state.resources.muskets));
}

// 방어도 = 건물 + 파수꾼 + 수비병 (조총 무장 수비병은 기여가 크다)
export function computeDefense(state: GameState): number {
  let d = 0;
  for (const b of state.buildings) {
    if (b.built) d += BUILDING_DEFS[b.type].defense;
  }
  const watchmen = state.residents.filter(r => r.alive && r.job === 'watchman').length;
  const militia = state.residents.filter(r => r.alive && r.job === 'militia').length;
  d += watchmen * CONFIG.raid.watchmanDefense;
  const garrisonMult = countBuilt(state, 'garrison') > 0 ? 1.3 : 1;
  const musketeers = armedMusketeers(state);
  d += Math.round(
    (musketeers * CONFIG.raid.musketDefense +
      (militia - musketeers) * CONFIG.raid.militiaDefense) * garrisonMult,
  );
  return Math.round(d);
}
