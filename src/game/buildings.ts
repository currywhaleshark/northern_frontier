// 건물 정의와 배치/방어 관련 헬퍼
import { CONFIG } from './config';
import { rankAtLeast } from './constants';
import type { Building, BuildingDef, BuildingTypeId, GameState, Rank, ResourceId, SmithyProductId, Tile } from './types';

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
    desc: '강 위에 놓아 사계절 주민 통행을 가능하게 한다.',
    cost: { wood: 16, stone: 10 }, buildDays: 8, slots: 0, capacity: 0, defense: 0,
    winterBonus: false, placement: 'river', unique: false,
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
    desc: '철과 목재로 도구를 만든다. 채광꾼이 없을 때만 대장장이가 철광을 보조 채굴한다.',
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
    desc: '보(堡) 승격 후 건설. 육지와 맞닿은 강 타일에 두어 어부가 식량을 얻는 거점.',
    cost: { wood: 14, stone: 4, tools: 1 }, buildDays: 7, slots: 4, capacity: 0, defense: 0,
    winterBonus: false, placement: 'riverbank', unique: false, minRank: 'bo',
  },
  charcoalKiln: {
    id: 'charcoalKiln', name: '숯가마', emoji: '🔥',
    desc: '진(鎭) 승격 후 건설. 숯쟁이가 목재를 장작으로 더 효율적으로 굽는 생산 거점.',
    cost: { wood: 12, stone: 12, tools: 1 }, buildDays: 8, slots: 3, capacity: 0, defense: 0,
    winterBonus: false, placement: 'land', unique: false, minRank: 'jin',
  },
  stable: {
    id: 'stable', name: '축사', emoji: '🐂',
    desc: '진(鎭) 승격 후 건설. 목동이 가축을 돌보며 식량과 가죽을 꾸준히 보탠다.',
    cost: { wood: 16, stone: 6, grain: 8, tools: 1 }, buildDays: 9, slots: 3, capacity: 0, defense: 0,
    winterBonus: false, placement: 'land', unique: false, minRank: 'jin',
  },
  nitreYard: {
    id: 'nitreYard', name: '염초장', emoji: '⚗️',
    desc: '부(府) 승격 후 건설. 염초장이 장작과 돌에서 염초를 걸러 화약을 만든다.',
    cost: { wood: 18, stone: 18, iron: 2, tools: 3 }, buildDays: 12, slots: 3, capacity: 0, defense: 0,
    winterBonus: false, placement: 'land', unique: false, minRank: 'bu',
  },
  dock: {
    id: 'dock', name: '부두', emoji: '⚓',
    desc: '부(府) 승격 후 강가에 짓는 대형 교역 거점. 장터 교역 규모가 커지고 상단 회전이 빨라진다.',
    cost: { wood: 24, stone: 12, iron: 2, tools: 3 }, buildDays: 12, slots: 4, capacity: 0, defense: 0,
    winterBonus: false, placement: 'riverbank', unique: true, minRank: 'bu',
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
  earthFort: {
    id: 'earthFort', name: '토성', emoji: '🧱',
    desc: '진(鎭) 승격 후 건설. 목책보다 튼튼한 흙 성벽 구간. 방어도 +9.',
    cost: { wood: 8, stone: 8 }, buildDays: 5, slots: 0, capacity: 0, defense: 9,
    winterBonus: false, placement: 'land', unique: false, minRank: 'jin',
  },
  stoneWall: {
    id: 'stoneWall', name: '석벽', emoji: '🧱',
    desc: '부(府) 승격 후 건설. 토성보다 더 단단한 석조 방어 구간. 방어도 +16.',
    cost: { stone: 10, iron: 1, tools: 1 }, buildDays: 6, slots: 0, capacity: 0, defense: 16,
    winterBonus: false, placement: 'land', unique: false, minRank: 'bu',
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
  office: {
    id: 'office', name: '관청', emoji: '📜',
    desc: '부(府) 승격 후 건설. 아전이 행정을 맡으면 자원 수집과 생산 효율이 높아진다.',
    cost: { wood: 24, stone: 24, iron: 2, tools: 4 }, buildDays: 14, slots: 4, capacity: 0, defense: 6,
    winterBonus: false, placement: 'land', unique: true, minRank: 'bu',
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
  'smithy', 'mine', 'ferry', 'charcoalKiln', 'stable', 'nitreYard', 'dock', 'tannery', 'market', 'office',
  'palisade', 'earthFort', 'stoneWall', 'watchtower', 'beacon', 'garrison',
  'cannonEmplacement',
];

export const SINGLE_TILE_BUILDINGS = [
  'bridge',
  'lumberCamp',
  'huntLodge',
  'herbHut',
  'mine',
  'field',
  'ferry',
  'dock',
  'palisade',
  'earthFort',
  'stoneWall',
  'watchtower',
] as const satisfies readonly BuildingTypeId[];

const SINGLE_TILE_BUILDING_SET: ReadonlySet<BuildingTypeId> = new Set<BuildingTypeId>(SINGLE_TILE_BUILDINGS);

export function buildingFootprintSize(type: BuildingTypeId): 1 | 2 {
  return SINGLE_TILE_BUILDING_SET.has(type) ? 1 : 2;
}

export function buildingFootprintTiles(
  state: Pick<GameState, 'map'>,
  type: BuildingTypeId,
  x: number,
  y: number,
): Tile[] | null {
  const size = buildingFootprintSize(type);
  const tiles: Tile[] = [];
  for (let dy = 0; dy < size; dy++) {
    for (let dx = 0; dx < size; dx++) {
      const tile = state.map[y + dy]?.[x + dx];
      if (!tile) return null;
      tiles.push(tile);
    }
  }
  return tiles;
}

export function canPlaceBuildingAt(state: GameState, type: BuildingTypeId, x: number, y: number): boolean {
  const tiles = buildingFootprintTiles(state, type, x, y);
  if (!tiles) return false;
  const def = BUILDING_DEFS[type];
  return tiles.every(tile => canPlaceOn(def, tile, state));
}

export function occupyBuildingTiles(
  state: GameState,
  building: Pick<Building, 'id' | 'type' | 'x' | 'y'>,
): void {
  const tiles = buildingFootprintTiles(state, building.type, building.x, building.y);
  if (!tiles) return;
  for (const tile of tiles) tile.buildingId = building.id;
}

export function clearBuildingTiles(state: GameState, buildingId: number): void {
  for (const row of state.map) {
    for (const tile of row) {
      if (tile.buildingId === buildingId) tile.buildingId = null;
    }
  }
}

export function rebuildBuildingFootprints(state: GameState): void {
  for (const row of state.map) {
    for (const tile of row) tile.buildingId = null;
  }
  for (const building of state.buildings) {
    const tiles = buildingFootprintTiles(state, building.type, building.x, building.y);
    if (!tiles) continue;
    for (const tile of tiles) {
      if (tile.buildingId == null) tile.buildingId = building.id;
    }
  }
}

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

export function officeEfficiencyMultiplier(state: GameState): number {
  if (countBuilt(state, 'office') === 0) return 1;
  const clerks = state.residents.filter(r =>
    r.alive && !r.sick && r.health >= 20 && r.job === 'clerk').length;
  const bonus = Math.min(CONFIG.production.officeMaxBonus, clerks * CONFIG.production.officeBonusPerClerk);
  return 1 + bonus;
}

export function isBuildingUnlocked(rank: GameState['rank'] | undefined, type: BuildingTypeId): boolean {
  return rankAtLeast(rank, BUILDING_DEFS[type].minRank);
}

function isRiverbank(state: GameState | undefined, tile: Tile): boolean {
  if (!state) return false;
  if (tile.terrain !== 'river') return false;
  const isLand = (neighbor: Tile | undefined): boolean =>
    neighbor != null &&
    neighbor.terrain !== 'river' &&
    neighbor.terrain !== 'mountain' &&
    neighbor.terrain !== 'rock' &&
    neighbor.terrain !== 'center';
  return (
    isLand(state.map[tile.y - 1]?.[tile.x]) ||
    isLand(state.map[tile.y + 1]?.[tile.x]) ||
    isLand(state.map[tile.y]?.[tile.x - 1]) ||
    isLand(state.map[tile.y]?.[tile.x + 1])
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

export interface SmithyProductDef {
  id: SmithyProductId;
  name: string;
  minRank?: Rank;
  output: ResourceId;
  inputPerUnit: Partial<Record<ResourceId, number>>;
  ratePerDay: number;
  task: string;
}

export const SMITHY_PRODUCT_ORDER: SmithyProductId[] = ['tools', 'spears', 'hornBows', 'muskets'];

export const SMITHY_PRODUCT_DEFS: Record<SmithyProductId, SmithyProductDef> = {
  tools: {
    id: 'tools',
    name: '도구',
    output: 'tools',
    inputPerUnit: { iron: 1, wood: 1 },
    ratePerDay: CONFIG.production.toolsPerDay,
    task: '도구 제작 중',
  },
  spears: {
    id: 'spears',
    name: '창',
    minRank: 'bo',
    output: 'spears',
    inputPerUnit: { iron: CONFIG.production.spearIronPerUnit, wood: CONFIG.production.spearWoodPerUnit },
    ratePerDay: CONFIG.production.spearsPerDay,
    task: '창 제작 중',
  },
  hornBows: {
    id: 'hornBows',
    name: '각궁',
    minRank: 'jin',
    output: 'hornBows',
    inputPerUnit: { wood: CONFIG.production.hornBowWoodPerUnit, hide: CONFIG.production.hornBowHidePerUnit },
    ratePerDay: CONFIG.production.hornBowsPerDay,
    task: '각궁 제작 중',
  },
  muskets: {
    id: 'muskets',
    name: '조총',
    minRank: 'bu',
    output: 'muskets',
    inputPerUnit: {
      iron: CONFIG.production.musketIronPerUnit,
      wood: CONFIG.production.musketWoodPerUnit,
      tools: CONFIG.production.musketToolsPerUnit,
    },
    ratePerDay: CONFIG.production.musketsPerDay,
    task: '조총 제작 중',
  },
};

export function smithyProductOf(building: Pick<Building, 'smithyProduct'> | undefined): SmithyProductId {
  const product = building?.smithyProduct;
  return product && Object.prototype.hasOwnProperty.call(SMITHY_PRODUCT_DEFS, product) ? product : 'tools';
}

export function isSmithyProductUnlocked(rank: GameState['rank'] | undefined, product: SmithyProductId): boolean {
  return rankAtLeast(rank, SMITHY_PRODUCT_DEFS[product].minRank);
}

export function availableSmithyProducts(rank: GameState['rank'] | undefined): SmithyProductId[] {
  return SMITHY_PRODUCT_ORDER.filter(product => isSmithyProductUnlocked(rank, product));
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
  return militiaWeaponAllocation(state).muskets;
}

export interface MilitiaWeaponAllocation {
  muskets: number;
  hornBows: number;
  spears: number;
  unarmed: number;
}

export function militiaWeaponAllocation(state: GameState): MilitiaWeaponAllocation {
  const militia = state.residents.filter(r => r.alive && r.job === 'militia').length;
  const muskets = state.resources.gunpowder > 0
    ? Math.min(militia, Math.floor(state.resources.muskets))
    : 0;
  let remaining = militia - muskets;
  const hornBows = Math.min(remaining, Math.floor(state.resources.hornBows));
  remaining -= hornBows;
  const spears = Math.min(remaining, Math.floor(state.resources.spears));
  remaining -= spears;
  return { muskets, hornBows, spears, unarmed: remaining };
}

// 방어도 = 건물 + 파수꾼 + 수비병 (조총 무장 수비병은 기여가 크다)
export function computeDefense(state: GameState): number {
  let d = 0;
  for (const b of state.buildings) {
    if (b.built) d += BUILDING_DEFS[b.type].defense;
  }
  const watchmen = state.residents.filter(r => r.alive && r.job === 'watchman').length;
  d += watchmen * CONFIG.raid.watchmanDefense;
  const garrisonMult = countBuilt(state, 'garrison') > 0 ? 1.3 : 1;
  const armed = militiaWeaponAllocation(state);
  d += Math.round(
    (armed.muskets * CONFIG.raid.musketDefense +
      armed.hornBows * CONFIG.raid.hornBowDefense +
      armed.spears * CONFIG.raid.spearDefense +
      armed.unarmed * CONFIG.raid.militiaDefense) * garrisonMult,
  );
  return Math.round(d);
}
