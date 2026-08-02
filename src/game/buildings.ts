// 건물 정의와 배치/방어 관련 헬퍼
import { CONFIG } from './config';
import { rankAtLeast } from './constants';
import { createCombatRoster } from './combatRoster';
import { hasKnownMineralDepositNear } from './miningSites';
import { aquiferSampleAt, oreSampleAt } from './subsurfaceVeins';
import { hasAdjacentFlowingCanal } from './irrigation';
import { GATE_CONVERSION_COSTS } from './walls';
import type { Building, BuildingDef, BuildingTypeId, GameState, Rank, ResourceId, SmithyProductId, Tile } from './types';

export const BUILDING_DEFS: Record<BuildingTypeId, BuildingDef> = {
  center: {
    id: 'center', name: '마을 중심지',
    desc: '개척지의 심장. 파괴되면 마을은 끝장난다.',
    cost: {}, buildDays: 0, slots: 0, capacity: 4, defense: 5,
    winterBonus: false, placement: 'land', unique: true,
  },
  hut: {
    id: 'hut', name: '초가집',
    desc: '4명이 사는 움집. 겨울엔 웃풍이 심하다.',
    cost: { wood: 7 }, buildDays: 5, slots: 0, capacity: 4, defense: 0,
    winterBonus: false, placement: 'land', unique: false,
  },
  ondol: {
    id: 'ondol', name: '온돌집',
    desc: '보(堡) 승격 후 건설. 구들을 놓아 겨울 체온 손실을 크게 줄인다. 5명 수용.',
    cost: { wood: 12, stone: 8 }, buildDays: 10, slots: 0, capacity: 5, defense: 0,
    winterBonus: true, placement: 'land', unique: false, minRank: 'bo',
  },
  tileHouse: {
    id: 'tileHouse', name: '기와집',
    desc: '진(鎭) 승격 후 건설. 온돌을 갖춘 상위 주거. 7명 수용.',
    cost: { wood: 18, stone: 16, tools: 2 }, buildDays: 14, slots: 0, capacity: 7, defense: 0,
    winterBonus: true, placement: 'land', unique: false, minRank: 'jin',
  },
  storehouse: {
    id: 'storehouse', name: '창고',
    desc: '모든 짐을 부리는 하역 거점. 작업지 가까이 지으면 운반이 빨라지고, 습격 약탈 피해도 조금 줄인다.',
    cost: { wood: 9, stone: 2 }, buildDays: 6, slots: 0, capacity: 0, defense: 0,
    winterBonus: false, placement: 'land', unique: false,
  },
  cellar: {
    id: 'cellar', name: '움 저장고',
    desc: `땅의 냉기를 이용해 생선·고기·채소 ${CONFIG.spoilage.cellarCapacity}만큼의 부패를 늦춘다. 여러 동의 보호 용량은 합산된다.`,
    cost: { wood: 5, stone: 3 }, buildDays: 4, slots: 0, capacity: 0, defense: 0,
    winterBonus: false, placement: 'land', unique: false,
  },
  smokehouse: {
    id: 'smokehouse', name: '훈연소',
    desc: '갈무리꾼이 고기와 장작 또는 숯을 써서 오래 두는 보존육을 만든다.',
    cost: { wood: 8, stone: 4, tools: 1 }, buildDays: 6, slots: 2, capacity: 0, defense: 0,
    winterBonus: false, placement: 'land', unique: false,
  },
  dryingRack: {
    id: 'dryingRack', name: '건조대',
    desc: '강가에서 생선을 자반이나 건어물로 갈무리한다. 건어물은 소금이 들지 않지만 비가 오면 작업이 멈춘다.',
    cost: { wood: 8, stone: 2, tools: 1 }, buildDays: 5, slots: 2, capacity: 0, defense: 0,
    winterBonus: false, placement: 'riverbank', unique: false,
  },
  onggiKiln: {
    id: 'onggiKiln', name: '옹기가마',
    desc: '보(堡) 승격 후 강가에 짓는다. 옹기장이가 현지 점토를 빚어 장작이나 숯으로 옹기를 굽는다.',
    cost: { wood: 12, stone: 6, tools: 2 }, buildDays: 7, slots: 2, capacity: 0, defense: 0,
    winterBonus: false, placement: 'riverbank', unique: false, minRank: 'bo',
  },
  jangdokdae: {
    id: 'jangdokdae', name: '장독대',
    desc: '보(堡) 승격 후 마당에 짓는다. 늦가을부터 초겨울까지 콩과 소금을 옹기에 담그면 시간이 장을 익힌다.',
    cost: { wood: 6, stone: 3, tools: 1 }, buildDays: 5, slots: 0, capacity: 0, defense: 0,
    winterBonus: false, placement: 'land', unique: false, minRank: 'bo',
  },
  bridge: {
    id: 'bridge', name: '다리',
    desc: '강 위에 놓아 사계절 주민 통행을 가능하게 한다.',
    cost: { wood: 14, stone: 9 }, buildDays: 8, slots: 0, capacity: 0, defense: 0,
    winterBonus: false, placement: 'river', unique: false,
  },
  weir: {
    id: 'weir', name: '보',
    desc: `강물을 막아 관개하는 낮은 둑. 가뭄 때 반경 ${CONFIG.disasters.drought.weirRadius}칸의 논밭 성장 피해를 줄이고, 완공 뒤 상류 강변 최대 ${CONFIG.disasters.drought.reservoirTileCount}칸에 물이 찬다. 통행로로는 쓸 수 없다.`,
    cost: { wood: 8, stone: 6, tools: 1 }, buildDays: 6, slots: 0, capacity: 0, defense: 0,
    winterBonus: false, placement: 'river', unique: false,
  },
  levee: {
    id: 'levee', name: '제방',
    desc: '강 타일의 육지 쪽 변에 가로·세로로 붙여 쌓는 낮은 둑. 인접 논밭을 차지하지 않고 일반 강가 건물과 공존하지만 방앗간·나루터·부두와는 겹칠 수 없다. 대홍수 범람을 막는 대신 뒤편에는 비옥한 퇴적도 오지 않는다.',
    cost: { wood: 3, stone: 4 }, buildDays: 3, slots: 0, capacity: 0, defense: 0,
    winterBonus: false, placement: 'river', unique: false,
  },
  canal: {
    id: 'canal', name: '농수로',
    desc: '강에서 물을 끌어 내륙 비옥지에 논을 여는 낮은 도랑. 서로 이어 강에 닿은 구간만 물이 흐르며, 마른 도랑도 통행할 수 있다.',
    cost: { wood: 2, stone: 1 }, buildDays: 2, slots: 0, capacity: 0, defense: 0,
    winterBonus: false, placement: 'land', unique: false, minRank: 'bo',
  },
  lumberCamp: {
    id: 'lumberCamp', name: '벌목장',
    desc: `벌목꾼을 배정하면 반경 ${CONFIG.gatheringZones.lumberCampRadius}칸 안의 성목만 베어 목재를 부리는 거점. 선택하면 작업영역과 남은 성목을 확인할 수 있다.`,
    cost: { wood: 3 }, buildDays: 2, slots: 4, capacity: 0, defense: 0,
    winterBonus: false, placement: 'land', unique: false,
  },
  woodShed: {
    id: 'woodShed', name: '장작마당',
    desc: '장작꾼이 창고에서 목재를 가져와 쌓아 두고 장작으로 패는 작업장.',
    cost: { wood: 7, stone: 2, tools: 1 }, buildDays: 5, slots: 2, capacity: 0, defense: 0,
    winterBonus: false, placement: 'land', unique: false,
  },
  huntLodge: {
    id: 'huntLodge', name: '사냥막',
    desc: `사냥꾼을 배정하면 반경 ${CONFIG.gatheringZones.huntLodgeRadius}칸 작업영역 안의 서식지만 이용한다. 서식지 비축은 사냥으로 줄고 숲이 남으면 회복된다.`,
    cost: { wood: 7, hide: 2 }, buildDays: 4, slots: 4, capacity: 0, defense: 0,
    winterBonus: false, placement: 'land', unique: false,
  },
  herbHut: {
    id: 'herbHut', name: '약초막',
    desc: `약초꾼을 배정하면 반경 ${CONFIG.gatheringZones.herbHutRadius}칸 작업영역 안의 숲에서만 약초와 야생 먹거리를 모은다.`,
    cost: { wood: 5 }, buildDays: 3, slots: 2, capacity: 0, defense: 0,
    winterBonus: false, placement: 'land', unique: false,
  },
  lodgingHut: {
    id: 'lodgingHut', name: '숙식 움막',
    desc: `채집 거점 작업영역 안에 세우는 임시 숙소. 거점당 한 동이 자동 연결되며 작업자가 ${CONFIG.gatheringZones.lodgingSupplyDays}일분 식량·땔감을 직접 가져와 머문다. 비축이 바닥나면 하루 귀가한 뒤 다시 보급한다.`,
    cost: { wood: 4, hide: 1 }, buildDays: 3, slots: 0, capacity: 0, defense: 0,
    winterBonus: false, placement: 'land', unique: false,
  },
  clinic: {
    id: 'clinic', name: '의원',
    desc: '진(鎭) 승격 후 건설. 의원이 약초로 병자와 중상자를 치료하고 역병의 진단과 방역을 돕는다.',
    cost: { wood: 14, stone: 10, herbs: 4, tools: 2 }, buildDays: 9, slots: 2, capacity: 0, defense: 0,
    winterBonus: false, placement: 'land', unique: false, minRank: 'jin',
  },
  field: {
    id: 'field', name: '밭',
    desc: '곡물·채소·콩·목화 중 작물을 골라 기른다. 비옥한 땅이면 소출 +30%.',
    cost: { wood: 2, tools: 1 }, buildDays: 3, slots: 1, capacity: 0, defense: 0,
    winterBonus: false, placement: 'field', unique: false,
  },
  paddy: {
    id: 'paddy', name: '논',
    desc: '보(堡) 승격 후 강가 또는 물이 흐르는 농수로 옆 비옥지에 짓는 벼 재배지. 많은 곡물을 거두고 방앗간으로 효율을 높일 수 있다.',
    cost: { wood: 4, tools: 1 }, buildDays: 4, slots: 1, capacity: 0, defense: 0,
    winterBonus: false, placement: 'paddy', unique: false, minRank: 'bo',
  },
  watermill: {
    id: 'watermill', name: '방앗간',
    desc: '보(堡) 승격 후 강가에 짓는 물레방아식 방앗간. 창고의 벼를 가져와 먹을 수 있는 곡물로 도정한다.',
    cost: { wood: 16, stone: 10, tools: 2 }, buildDays: 10, slots: 2, capacity: 0, defense: 0,
    winterBonus: false, placement: 'watermill', unique: false, minRank: 'bo',
  },
  smithy: {
    id: 'smithy', name: '대장간',
    desc: '대장장이가 창고에서 철과 재료를 가져와 도구, 수레와 무기를 만드는 작업장.',
    cost: { wood: 9, stone: 5 }, buildDays: 8, slots: 2, capacity: 0, defense: 0,
    winterBonus: false, placement: 'land', unique: false,
  },
  mine: {
    id: 'mine', name: '채광장',
    desc: `촌 단계 채집 거점. 광상 위가 아닌 주변 빈 땅에 세우면 배정 채광꾼이 반경 ${CONFIG.minerals.mineWorkRadius}칸의 돌·철·은을 캐 와 하역한다.`,
    cost: { wood: 6, stone: 4, tools: 1 }, buildDays: 5, slots: 4, capacity: 0, defense: 0,
    winterBonus: false, placement: 'land', unique: false,
  },
  well: {
    id: 'well', name: '우물',
    desc: `수맥 위에 파는 무인 급수 시설. 반경 ${CONFIG.water.wellRadius}칸 급수 기반이 되며, 수맥의 중심에 가까울수록 물이 풍부하다.`,
    cost: { wood: 4, stone: 6, tools: 1 }, buildDays: 4, slots: 0, capacity: 0, defense: 0,
    winterBonus: false, placement: 'land', unique: false,
  },
  deepMine: {
    id: 'deepMine', name: '채광갱',
    desc: '부(府) 승격 후 지하 광맥 위에 세우는 2×2 갱도. 채광꾼 4명이 광맥의 철이나 석재를 직접 캐며 같은 광맥의 매장량을 공유한다.',
    cost: { wood: 30, stone: 24, iron: 12, tools: 6 }, buildDays: 18, slots: 4, capacity: 0, defense: 0,
    winterBonus: false, placement: 'land', unique: false, minRank: 'bu',
  },
  ferry: {
    id: 'ferry', name: '나루터',
    desc: '보(堡) 승격 후 건설. 육지와 맞닿은 강 타일에 두어 어부가 식량을 얻는 거점.',
    cost: { wood: 14, stone: 4, tools: 1 }, buildDays: 7, slots: 2, capacity: 0, defense: 0,
    winterBonus: false, placement: 'riverbank', unique: false, minRank: 'bo',
  },
  charcoalKiln: {
    id: 'charcoalKiln', name: '숯가마',
    desc: '진(鎭) 승격 후 건설. 숯쟁이가 창고의 목재를 가져와 고효율 연료인 숯으로 굽는다.',
    cost: { wood: 12, stone: 12, tools: 1 }, buildDays: 8, slots: 3, capacity: 0, defense: 0,
    winterBonus: false, placement: 'land', unique: false, minRank: 'jin',
  },
  stable: {
    id: 'stable', name: '축사',
    desc: '진(鎭) 승격 후 건설. 완공 뒤 인접 평지에 방목지를 지정하며, 넓을수록 더 많은 가축과 목동이 필요하다.',
    cost: { wood: 16, stone: 6, grain: 8, tools: 1 }, buildDays: 9, slots: 2, capacity: 0, defense: 0,
    winterBonus: false, placement: 'land', unique: false, minRank: 'jin',
  },
  nitreYard: {
    id: 'nitreYard', name: '염초장',
    desc: '부(府) 승격 후 건설. 염초장이 장작과 돌에서 염초를 걸러 화약을 만든다.',
    cost: { wood: 18, stone: 18, iron: 2, tools: 3 }, buildDays: 12, slots: 2, capacity: 0, defense: 0,
    winterBonus: false, placement: 'land', unique: false, minRank: 'bu',
  },
  dock: {
    id: 'dock', name: '부두',
    desc: '부(府) 승격 후 강가에 짓는 대형 교역 거점. 장터 교역 규모가 커지고 상단 회전이 빨라진다.',
    cost: { wood: 24, stone: 12, iron: 2, tools: 3 }, buildDays: 12, slots: 4, capacity: 0, defense: 0,
    winterBonus: false, placement: 'riverbank', unique: true, minRank: 'bu',
  },
  tannery: {
    id: 'tannery', name: '가죽공방',
    desc: '가죽을 손질해 방한 성능이 좋은 가죽옷을 만든다.',
    cost: { wood: 7, tools: 1 }, buildDays: 5, slots: 2, capacity: 0, defense: 0,
    winterBonus: false, placement: 'land', unique: false,
  },
  weavingHouse: {
    id: 'weavingHouse', name: '베틀집',
    desc: '목화를 무명옷으로 짜는 작업장.',
    cost: { wood: 14, tools: 2 }, buildDays: 8, slots: 2, capacity: 0, defense: 0,
    winterBonus: false, placement: 'land', unique: false, minRank: 'bo',
  },
  beacon: {
    id: 'beacon', name: '봉수대',
    desc: '습격 조기 경보 확률이 크게 오르고, 습격 시 경보 대응이 가능해진다.',
    cost: { wood: 5, stone: 11 }, buildDays: 8, slots: 1, capacity: 0, defense: 4,
    winterBonus: false, placement: 'land', unique: true,
  },
  palisade: {
    id: 'palisade', name: '목책',
    desc: '통나무 방책 한 구간. 방어도 +3. 여러 개 지을 수 있다.',
    cost: { wood: 4 }, buildDays: 2, slots: 0, capacity: 0, defense: 3,
    winterBonus: false, placement: 'land', unique: false,
  },
  earthFort: {
    id: 'earthFort', name: '토성',
    desc: '진(鎭) 승격 후 건설. 목책보다 튼튼한 흙 성벽 구간. 방어도 +9.',
    cost: { wood: 8, stone: 8 }, buildDays: 5, slots: 0, capacity: 0, defense: 9,
    winterBonus: false, placement: 'land', unique: false, minRank: 'jin',
  },
  stoneWall: {
    id: 'stoneWall', name: '석벽',
    desc: '부(府) 승격 후 건설. 토성보다 더 단단한 석조 방어 구간. 방어도 +16.',
    cost: { stone: 10, iron: 1, tools: 1 }, buildDays: 6, slots: 0, capacity: 0, defense: 16,
    winterBonus: false, placement: 'land', unique: false, minRank: 'bu',
  },
  gate: {
    id: 'gate', name: '성문',
    desc: '완공된 목책·토성·석벽 한 구간을 선택해 전환한다. 원래 벽 등급을 보존하며 공사 중에는 계속 길을 막는다.',
    cost: { wood: 5 }, buildDays: 2, slots: 0, capacity: 0, defense: 2,
    winterBonus: false, placement: 'land', unique: false,
  },
  watchtower: {
    id: 'watchtower', name: '망루',
    desc: '방어도 +8, 조기 경보 확률 증가.',
    cost: { wood: 9, stone: 2 }, buildDays: 6, slots: 2, capacity: 0, defense: 8,
    winterBonus: false, placement: 'land', unique: false,
  },
  garrison: {
    id: 'garrison', name: '군영',
    desc: '방어도 +25. 수비병의 방어 기여가 커진다. 승리 조건에 필요하다.',
    cost: { wood: 18, stone: 9, iron: 4 }, buildDays: 14, slots: 6, capacity: 0, defense: 25,
    winterBonus: false, placement: 'land', unique: true,
  },
  office: {
    id: 'office', name: '관청',
    desc: '부(府) 승격 후 건설. 아전이 행정을 맡으면 자원 수집과 생산 효율이 높아진다.',
    cost: { wood: 24, stone: 24, iron: 2, tools: 4 }, buildDays: 14, slots: 4, capacity: 0, defense: 6,
    winterBonus: false, placement: 'land', unique: true, minRank: 'bu',
  },
  market: {
    id: 'market', name: '장터',
    desc: '북방 세력과의 교역이 열리고, 습격 시 협상을 시도할 수 있다.',
    cost: { wood: 11, stone: 4 }, buildDays: 7, slots: 2, capacity: 0, defense: 0,
    winterBonus: false, placement: 'land', unique: true,
  },
  cemetery: {
    id: 'cemetery', name: '묘지',
    desc: '세상을 떠난 이들을 안장한다. 장의사가 시신을 수습해 묻으면 마을이 위로를 얻고, 시신을 방치하면 민심이 상한다.',
    cost: { wood: 4, stone: 6 }, buildDays: 4, slots: 1, capacity: 0, defense: 0,
    winterBonus: false, placement: 'land', unique: false,
  },
  school: {
    id: 'school', name: '서당',
    desc: '훈장이 아이들에게 글을 가르친다. 진(鎭)쯤 되는 고을의 주민들은 글 배울 곳을 바란다.',
    cost: { wood: 10, stone: 4, tools: 1 }, buildDays: 8, slots: 1, capacity: 0, defense: 0,
    winterBonus: false, placement: 'land', unique: true, minRank: 'jin',
  },
  shrine: {
    id: 'shrine', name: '당집',
    desc: '마을의 안녕을 비는 무속의 당. 떠돌이 무당이 마을에 들어와야 지을 수 있다.',
    cost: { wood: 8, stone: 2, hide: 2 }, buildDays: 6, slots: 2, capacity: 0, defense: 0,
    winterBonus: false, placement: 'land', unique: true, minRank: 'jin',
  },
  hermitage: {
    id: 'hermitage', name: '암자',
    desc: '명복을 빌고 상례를 돕는 작은 절. 노승이 마을에 의탁해야 지을 수 있다.',
    cost: { wood: 10, stone: 6 }, buildDays: 8, slots: 2, capacity: 0, defense: 0,
    winterBonus: false, placement: 'land', unique: true, minRank: 'jin',
  },
  cannonEmplacement: {
    id: 'cannonEmplacement', name: '불랑기포대',
    desc: '조정이 하사한 불랑기포를 얹은 포대. 방어도 +40, 화약이 있으면 전투 방어가 크게 오른다 (교전마다 화약 소모). 부(府) 승격 후 조정 청원으로만 받을 수 있다.',
    cost: { wood: 6, stone: 10 }, buildDays: 6, slots: 1, capacity: 0, defense: 40,
    winterBonus: false, placement: 'land', unique: false,
  },
  chongtongEmplacement: {
    id: 'chongtongEmplacement', name: '총통 포대',
    desc: '하사받은 지자총통을 올린 작은 포대. 방어도 +20. 지자총통 하나로 한 곳만 세울 수 있으며, 포는 건설에 소모되지 않아 해체 뒤에도 다시 세울 수 있다.',
    cost: { wood: 6, stone: 10 }, buildDays: 6, slots: 1, capacity: 0, defense: 20,
    winterBonus: false, placement: 'land', unique: false,
  },
};

export const BUILD_MENU_ORDER: BuildingTypeId[] = [
  'hut', 'ondol', 'tileHouse', 'storehouse', 'cellar', 'bridge', 'well', 'field', 'paddy', 'canal', 'weir', 'lumberCamp', 'woodShed', 'huntLodge', 'herbHut', 'lodgingHut', 'clinic',
  'smokehouse', 'dryingRack', 'smithy', 'mine', 'deepMine', 'ferry', 'watermill', 'onggiKiln', 'jangdokdae', 'charcoalKiln', 'stable', 'nitreYard', 'dock', 'tannery', 'weavingHouse', 'market', 'office', 'cemetery', 'school', 'shrine', 'hermitage',
  'levee', 'palisade', 'earthFort', 'stoneWall', 'gate', 'watchtower', 'beacon', 'garrison',
  'cannonEmplacement', 'chongtongEmplacement',
];

export const SINGLE_TILE_BUILDINGS = [
  'bridge',
  'weir',
  'levee',
  'canal',
  'lumberCamp',
  'huntLodge',
  'herbHut',
  'lodgingHut',
  'mine',
  'well',
  'field',
  'paddy',
  'ferry',
  'dryingRack',
  'onggiKiln',
  'dock',
  'palisade',
  'earthFort',
  'stoneWall',
  'gate',
  'watchtower',
] as const satisfies readonly BuildingTypeId[];

const SINGLE_TILE_BUILDING_SET: ReadonlySet<BuildingTypeId> = new Set<BuildingTypeId>(SINGLE_TILE_BUILDINGS);

export function buildingFootprintSize(type: BuildingTypeId): 1 | 2 {
  return SINGLE_TILE_BUILDING_SET.has(type) ? 1 : 2;
}

// 밭·논은 드래그로 크기를 정하는 경작지다.
export function isPlotBuildingType(type: BuildingTypeId): type is 'field' | 'paddy' {
  return type === 'field' || type === 'paddy';
}

// 묘역도 경작지와 같은 사각 드래그 배치를 쓰되 농사 로직에는 들어가지 않는다.
export function isAreaBuildingType(type: BuildingTypeId): type is 'field' | 'paddy' | 'cemetery' {
  return isPlotBuildingType(type) || type === 'cemetery';
}

export function clampPlotSide(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 1;
  return Math.min(CONFIG.farming.maxPlotSide, Math.max(1, Math.floor(value)));
}

export interface FootprintDims { w: number; h: number }

export function buildingFootprintDims(building: Pick<Building, 'type' | 'w' | 'h'>): FootprintDims {
  if (isAreaBuildingType(building.type)) {
    // 크기 정보가 없던 구버전 묘지는 실제로 2×2를 차지했으므로 그 발자국을 보존한다.
    const legacyDefault = building.type === 'cemetery' ? 2 : 1;
    return {
      w: clampPlotSide(building.w ?? legacyDefault),
      h: clampPlotSide(building.h ?? legacyDefault),
    };
  }
  if (building.type === 'center') {
    return {
      w: Math.max(2, Math.min(3, Math.floor(building.w ?? 3))),
      h: 2,
    };
  }
  const size = buildingFootprintSize(building.type);
  return { w: size, h: size };
}

// 하나의 큰 스프라이트가 두 행을 덮는 건물은 위 행을 건물 뒤 통로로 쓴다.
// 밭·논·묘역은 칸별 스프라이트이므로 이 깊이 표현의 대상이 아니다.
export function isWalkBehindBuilding(
  building: Pick<Building, 'type' | 'w' | 'h'>,
): boolean {
  return !isAreaBuildingType(building.type) && buildingFootprintDims(building).h === 2;
}

export function isBuildingUpperPassageTile(
  building: Pick<Building, 'type' | 'x' | 'y' | 'w' | 'h'>,
  x: number,
  y: number,
): boolean {
  if (!isWalkBehindBuilding(building) || y !== building.y) return false;
  const { w } = buildingFootprintDims(building);
  return x >= building.x && x < building.x + w;
}

type OperationalAreaBuilding = Pick<Building, 'type' | 'w' | 'h'> & Partial<Pick<Building, 'expansion'>>;

export function plotArea(building: OperationalAreaBuilding): number {
  const expansion = building.expansion?.kind === 'footprint' ? building.expansion : null;
  const { w, h } = expansion
    ? expansion.fromArea
    : buildingFootprintDims(building);
  return w * h;
}

export function cemeteryPlotCapacity(
  building: OperationalAreaBuilding,
): number {
  if (building.type !== 'cemetery') return 0;
  return plotArea(building) * CONFIG.funeral.plotsPerTile;
}

// 경작지의 파종 칸 수 — 구버전 세이브(sownArea 없음)는 자라던 밭이면 전체 파종으로 본다
export function sownAreaOf(
  farm: Pick<Building, 'type' | 'w' | 'h' | 'sownArea' | 'fieldGrowth'> & Partial<Pick<Building, 'expansion'>>,
): number {
  const area = plotArea(farm);
  const raw = typeof farm.sownArea === 'number' && Number.isFinite(farm.sownArea)
    ? farm.sownArea
    : (farm.fieldGrowth > 0 ? area : 0);
  return Math.min(area, Math.max(0, raw));
}

export function buildingFootprintTiles(
  state: Pick<GameState, 'map'>,
  type: BuildingTypeId,
  x: number,
  y: number,
  w?: number,
  h?: number,
): Tile[] | null {
  const dims = buildingFootprintDims({ type, w, h });
  const width = dims.w;
  const height = dims.h;
  const tiles: Tile[] = [];
  for (let dy = 0; dy < height; dy++) {
    for (let dx = 0; dx < width; dx++) {
      const tile = state.map[y + dy]?.[x + dx];
      if (!tile) return null;
      tiles.push(tile);
    }
  }
  return tiles;
}

// 기존 건물 인스턴스의 발자국 — 경작지는 저장된 w/h를 쓴다
export function footprintTilesOf(
  state: Pick<GameState, 'map'>,
  building: Pick<Building, 'type' | 'x' | 'y' | 'w' | 'h'>,
): Tile[] | null {
  const { w, h } = buildingFootprintDims(building);
  return buildingFootprintTiles(state, building.type, building.x, building.y, w, h);
}

export function canPlaceBuildingAt(
  state: GameState,
  type: BuildingTypeId,
  x: number,
  y: number,
  w?: number,
  h?: number,
): boolean {
  const tiles = buildingFootprintTiles(state, type, x, y, w, h);
  if (!tiles) return false;
  if (tiles.some(tile => isWeirReservoirReservedTile(state, tile.x, tile.y) ||
      isSpringFloodAffectedTile(state, tile.x, tile.y))) return false;
  if (tiles.some(tile => state.buildings.some(building => {
    const destination = building.workOrder?.kind === 'relocate'
      ? building.workOrder.destination
      : undefined;
    return !!destination &&
      tile.x >= destination.x &&
      tile.y >= destination.y &&
      tile.x < destination.x + destination.w &&
      tile.y < destination.y + destination.h;
  }))) return false;
  if (tiles.some(tile => state.buildings.some(building => {
    const pasture = building.pasture;
    return !!pasture &&
      tile.x >= pasture.x &&
      tile.y >= pasture.y &&
      tile.x < pasture.x + pasture.w &&
      tile.y < pasture.y + pasture.h;
  }))) return false;
  if (type === 'watermill') {
    return !tiles.some(tile => leveeAtTile(state, tile.x, tile.y)) && canPlaceWatermillAt(state, x, y);
  }
  if (type === 'levee') {
    if (!isLeveePlacementEligible(state, x, y)) return false;
    const tile = tiles[0];
    const occupying = tile.buildingId == null ? undefined : state.buildings.find(building => building.id === tile.buildingId);
    return !occupying || !isLeveeIncompatibleBuildingType(occupying.type);
  }
  if (isLeveeIncompatibleBuildingType(type) && tiles.some(tile => leveeAtTile(state, tile.x, tile.y))) {
    return false;
  }
  const def = BUILDING_DEFS[type];
  if (!tiles.every(tile => canPlaceOn(def, tile, state))) return false;
  if (type === 'paddy' && !isPaddyFootprintEligible(state, tiles)) return false;
  if (type === 'mine') return hasKnownMineralDepositNear(state, x, y);
  if (type === 'well') {
    return aquiferSampleAt(state.seed, state.map[0]?.length ?? 0, state.map.length, x, y) != null;
  }
  if (type === 'deepMine') {
    const sample = oreSampleAt(state.seed, state.map[0]?.length ?? 0, state.map.length, x, y);
    return sample != null && (state.oreVeinRemaining[sample.vein.id] ?? 0) > 0;
  }
  return true;
}

export function canRelocateBuildingAt(
  state: GameState,
  building: Pick<Building, 'id' | 'type' | 'x' | 'y' | 'w' | 'h'>,
  x: number,
  y: number,
): boolean {
  const { w, h } = buildingFootprintDims(building);
  const tiles = buildingFootprintTiles(state, building.type, x, y, w, h);
  if (!tiles) return false;
  if (x === building.x && y === building.y) return false;
  if (tiles.some(tile => isWeirReservoirReservedTile(state, tile.x, tile.y) ||
      isSpringFloodAffectedTile(state, tile.x, tile.y))) return false;
  const overlapsReservedDestination = tiles.some(tile => state.buildings.some(candidate => {
    if (candidate.id === building.id) return false;
    const destination = candidate.workOrder?.kind === 'relocate'
      ? candidate.workOrder.destination
      : undefined;
    return !!destination &&
      tile.x >= destination.x && tile.y >= destination.y &&
      tile.x < destination.x + destination.w && tile.y < destination.y + destination.h;
  }));
  if (overlapsReservedDestination) return false;
  const overlapsPasture = tiles.some(tile => state.buildings.some(candidate => {
    const pasture = candidate.pasture;
    return !!pasture &&
      tile.x >= pasture.x && tile.y >= pasture.y &&
      tile.x < pasture.x + pasture.w && tile.y < pasture.y + pasture.h;
  }));
  if (overlapsPasture) return false;

  if (building.type === 'levee') {
    const tile = tiles[0];
    if (availableLeveeEdgesAt(state, x, y, building.id).length === 0) return false;
    const occupying = tile.buildingId == null ? undefined : state.buildings.find(candidate => candidate.id === tile.buildingId);
    return !occupying || occupying.id === building.id || !isLeveeIncompatibleBuildingType(occupying.type);
  }
  if (isLeveeIncompatibleBuildingType(building.type) &&
      tiles.some(tile => leveeAtTile(state, tile.x, tile.y, building.id))) return false;

  const def = BUILDING_DEFS[building.type];
  const usableTiles = tiles.map(tile => tile.buildingId === building.id
    ? { ...tile, buildingId: null }
    : tile);
  if (building.type === 'watermill') {
    if (usableTiles.some(tile => tile.buildingId != null)) return false;
    const hasRiver = usableTiles.some(tile => tile.terrain === 'river');
    const hasLand = usableTiles.some(isWatermillLandTile);
    return hasRiver && hasLand &&
      usableTiles.every(tile => tile.terrain === 'river' || isWatermillLandTile(tile));
  }
  if (!usableTiles.every(tile => canPlaceOn(def, tile, state))) return false;
  if (building.type === 'paddy' && !isPaddyFootprintEligible(state, usableTiles)) return false;
  if (building.type === 'mine') return hasKnownMineralDepositNear(state, x, y);
  if (building.type === 'well') {
    return aquiferSampleAt(state.seed, state.map[0]?.length ?? 0, state.map.length, x, y) != null;
  }
  if (building.type === 'deepMine') {
    const sample = oreSampleAt(state.seed, state.map[0]?.length ?? 0, state.map.length, x, y);
    return sample != null && (state.oreVeinRemaining[sample.vein.id] ?? 0) > 0;
  }
  return true;
}

// 드래그 영역 건설비는 칸수 비례 (1×1이면 기본 비용 그대로)
export function buildingCostFor(
  type: BuildingTypeId,
  w = 1,
  h = 1,
): Partial<Record<ResourceId, number>> {
  const def = BUILDING_DEFS[type];
  if (!isAreaBuildingType(type)) return def.cost;
  const area = clampPlotSide(w) * clampPlotSide(h);
  if (area === 1) return def.cost;
  const scaled: Partial<Record<ResourceId, number>> = {};
  for (const [res, amt] of Object.entries(def.cost)) {
    scaled[res as ResourceId] = (amt ?? 0) * area;
  }
  return scaled;
}

/** 저장된 기반 벽 등급까지 포함한 실제 건물 투자비. 해체 환급 계산에 쓴다. */
export function buildingCostForInstance(
  building: Pick<Building, 'type' | 'w' | 'h' | 'gateWallType'>,
): Partial<Record<ResourceId, number>> {
  const base = { ...buildingCostFor(building.type, building.w ?? 1, building.h ?? 1) };
  if (building.type !== 'gate' || !building.gateWallType) return base;
  const total: Partial<Record<ResourceId, number>> = {
    ...BUILDING_DEFS[building.gateWallType].cost,
  };
  for (const [resource, amount] of Object.entries(GATE_CONVERSION_COSTS[building.gateWallType])) {
    total[resource as ResourceId] = (total[resource as ResourceId] ?? 0) + (amount ?? 0);
  }
  return total;
}

export function canAffordCost(state: GameState, cost: Partial<Record<ResourceId, number>>): boolean {
  return Object.entries(cost).every(([res, amt]) =>
    state.resources[res as keyof typeof state.resources] >= (amt ?? 0));
}

export function occupyBuildingTiles(
  state: GameState,
  building: Pick<Building, 'id' | 'type' | 'x' | 'y' | 'w' | 'h'>,
): void {
  if (building.type === 'levee') return;
  const tiles = footprintTilesOf(state, building);
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
    if (building.type === 'levee') continue;
    const tiles = footprintTilesOf(state, building);
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

function isWeirReservoirReservedTile(state: GameState, x: number, y: number): boolean {
  return state.buildings.some(building =>
    building.type === 'weir' &&
    building.weirReservoir?.tiles.some(tile => tile.x === x && tile.y === y));
}

function isSpringFloodAffectedTile(state: GameState, x: number, y: number): boolean {
  return state.pendingDisasters.some(disaster =>
    disaster.id === 'springFlood' &&
    disaster.affectedTiles?.some(tile => tile.x === x && tile.y === y));
}

export type LeveeEdge = 'n' | 'e' | 's' | 'w';

const LEVEE_EDGE_OFFSETS: ReadonlyArray<readonly [LeveeEdge, number, number]> = [
  ['n', 0, -1],
  ['e', 1, 0],
  ['s', 0, 1],
  ['w', -1, 0],
];

const LEVEE_INCOMPATIBLE_BUILDINGS: ReadonlySet<BuildingTypeId> = new Set([
  'watermill',
  'ferry',
  'dock',
]);

export function isLeveeIncompatibleBuildingType(type: BuildingTypeId): boolean {
  return LEVEE_INCOMPATIBLE_BUILDINGS.has(type);
}

export function leveeAtTile(
  state: Pick<GameState, 'buildings'>,
  x: number,
  y: number,
  ignoredBuildingId?: number,
): Building | undefined {
  return state.buildings.find(building => building.id !== ignoredBuildingId &&
    building.type === 'levee' && building.x === x && building.y === y);
}

function isLeveeBankLand(tile: Tile | undefined): boolean {
  return tile != null &&
    tile.terrain !== 'river' &&
    tile.terrain !== 'mountain' &&
    tile.terrain !== 'rock' &&
    tile.terrain !== 'center';
}

export function leveeEdgesAt(state: Pick<GameState, 'map'>, x: number, y: number): LeveeEdge[] {
  if (state.map[y]?.[x]?.terrain !== 'river') return [];
  const edges: LeveeEdge[] = [];
  for (const [edge, dx, dy] of LEVEE_EDGE_OFFSETS) {
    if (isLeveeBankLand(state.map[y + dy]?.[x + dx])) edges.push(edge);
  }
  return edges;
}

export function leveeAtEdge(
  state: Pick<GameState, 'buildings'>,
  x: number,
  y: number,
  edge: LeveeEdge,
  ignoredBuildingId?: number,
): Building | undefined {
  return state.buildings.find(building => building.id !== ignoredBuildingId &&
    building.type === 'levee' && building.x === x && building.y === y &&
    building.leveeEdge === edge);
}

export function availableLeveeEdgesAt(
  state: Pick<GameState, 'map' | 'buildings'>,
  x: number,
  y: number,
  ignoredBuildingId?: number,
): LeveeEdge[] {
  return leveeEdgesAt(state, x, y).filter(edge => !leveeAtEdge(state, x, y, edge, ignoredBuildingId));
}

export function preferredLeveeEdgeAt(
  state: Pick<GameState, 'map' | 'buildings'>,
  x: number,
  y: number,
  localX = 0.5,
  localY = 0.5,
  ignoredBuildingId?: number,
): LeveeEdge | null {
  const distance: Record<LeveeEdge, number> = {
    n: localY,
    e: 1 - localX,
    s: 1 - localY,
    w: localX,
  };
  return availableLeveeEdgesAt(state, x, y, ignoredBuildingId)
    .sort((a, b) => distance[a] - distance[b])[0] ?? null;
}

export function isLeveePlacementEligible(state: GameState, x: number, y: number): boolean {
  return availableLeveeEdgesAt(state, x, y).length > 0;
}

// 지자총통은 기물함에 남아 있고, 총통 포대만 완성·건설·이전 작업을 통틀어 하나로 제한한다.
// 해체가 끝나 건물이 목록에서 제거되면 이 값도 0이 되어 같은 총통으로 재건할 수 있다.
export function chongtongPlacementsUsed(state: GameState): number {
  return state.buildings.filter(b => b.type === 'chongtongEmplacement').length;
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
  const specialBonus = state.residents.some(resident => resident.alive && resident.special === 'exiledScholar')
    ? CONFIG.specialResidents.exiledScholarOfficeBonus
    : 0;
  return 1 + bonus + specialBonus;
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

function hasAdjacentRiver(state: GameState | undefined, tile: Tile): boolean {
  if (!state) return false;
  return (
    state.map[tile.y - 1]?.[tile.x]?.terrain === 'river' ||
    state.map[tile.y + 1]?.[tile.x]?.terrain === 'river' ||
    state.map[tile.y]?.[tile.x - 1]?.terrain === 'river' ||
    state.map[tile.y]?.[tile.x + 1]?.terrain === 'river'
  );
}

function isPaddyPlacementTile(tile: Tile): boolean {
  return tile.terrain === 'fertile' || tile.terrain === 'plain' || tile.terrain === 'forest';
}

export function isPaddyEligibleTile(state: GameState | undefined, tile: Tile): boolean {
  return isPaddyPlacementTile(tile) &&
    (hasAdjacentRiver(state, tile) || hasAdjacentFlowingCanal(state, tile.x, tile.y));
}

export function isPaddyFootprintEligible(
  state: GameState | undefined,
  tiles: readonly Tile[],
): boolean {
  return tiles.length > 0 &&
    tiles.every(isPaddyPlacementTile) &&
    tiles.some(tile => isPaddyEligibleTile(state, tile));
}

function isWatermillLandTile(tile: Tile): boolean {
  return tile.terrain !== 'river' &&
    tile.terrain !== 'mountain' &&
    tile.terrain !== 'rock' &&
    tile.terrain !== 'center';
}

function canPlaceWatermillAt(state: GameState, x: number, y: number): boolean {
  const tiles = buildingFootprintTiles(state, 'watermill', x, y);
  if (!tiles || tiles.some(tile => tile.buildingId != null)) return false;
  const hasRiver = tiles.some(tile => tile.terrain === 'river');
  const hasLand = tiles.some(isWatermillLandTile);
  const allUsable = tiles.every(tile => tile.terrain === 'river' || isWatermillLandTile(tile));
  return hasRiver && hasLand && allUsable;
}

export function canPlaceOn(def: BuildingDef, tile: Tile, state?: GameState): boolean {
  if (tile.buildingId != null) return false;
  if (def.placement === 'any') return true;
  if (def.placement === 'river') return tile.terrain === 'river';
  if (def.placement === 'rock') return tile.terrain === 'rock';
  if (def.placement === 'riverbank') return isRiverbank(state, tile);
  if (def.placement === 'paddy') return isPaddyPlacementTile(tile);
  if (def.placement === 'watermill') return false;
  if (def.placement === 'field') {
    // 숲도 받는다 — 벌목꾼이 베어 평지로 만든 뒤에야 농부가 공사를 시작한다.
    return tile.terrain === 'fertile' || tile.terrain === 'plain' || tile.terrain === 'forest';
  }
  if (tile.terrain === 'river' || tile.terrain === 'mountain' || tile.terrain === 'rock' || tile.terrain === 'center') {
    return false;
  }
  // land: 평지/숲/비옥지 (숲에 지으면 개간)
  return true;
}

export function canAfford(state: GameState, def: BuildingDef): boolean {
  return canAffordCost(state, def.cost);
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

export const SMITHY_PRODUCT_ORDER: SmithyProductId[] = ['tools', 'carts', 'spears', 'hornBows', 'muskets', 'silverwork'];

export const SMITHY_PRODUCT_DEFS: Record<SmithyProductId, SmithyProductDef> = {
  tools: {
    id: 'tools',
    name: '도구',
    output: 'tools',
    inputPerUnit: { iron: 1, wood: 1 },
    ratePerDay: CONFIG.production.toolsPerDay,
    task: '도구 제작 중',
  },
  carts: {
    id: 'carts',
    name: '수레',
    output: 'carts',
    inputPerUnit: {
      wood: CONFIG.production.cartWoodPerUnit,
      iron: CONFIG.production.cartIronPerUnit,
      tools: CONFIG.production.cartToolsPerUnit,
    },
    ratePerDay: CONFIG.production.cartsPerDay,
    task: '수레 제작 중',
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
  // 은세공 — 화폐(은)를 사치재(귀금속)로 바꾸는 비가역 싱크. 은 보유 자체는 만족을 주지 않는다.
  silverwork: {
    id: 'silverwork',
    name: '은세공',
    minRank: 'jin',
    output: 'preciousMetal',
    inputPerUnit: {
      silver: CONFIG.production.silverworkSilverPerUnit,
      charcoal: CONFIG.production.silverworkCharcoalPerUnit,
    },
    ratePerDay: CONFIG.production.silverworkPerDay,
    task: '은세공 중',
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

// 실제로 조총을 배정받아 사격 가능한 전투원 수.
export function armedMusketeers(state: GameState): number {
  return createCombatRoster(state, { context: 'villageDefense' }).combatants
    .filter(combatant => combatant.readyWeapon === 'musket').length;
}

export interface MilitiaWeaponAllocation {
  muskets: number;
  hornBows: number;
  spears: number;
  unarmed: number;
}

export function militiaWeaponAllocation(state: GameState): MilitiaWeaponAllocation {
  const militia = createCombatRoster(state, { context: 'villageDefense' }).combatants
    .filter(combatant => combatant.role === 'militia');
  // 탄약 없는 조총수는 배정을 유지하지만 현재 전투 계산에서는 비무장 수비병으로 취급한다.
  return {
    muskets: militia.filter(combatant => combatant.readyWeapon === 'musket').length,
    hornBows: militia.filter(combatant => combatant.readyWeapon === 'hornBow').length,
    spears: militia.filter(combatant => combatant.readyWeapon === 'spear').length,
    unarmed: militia.filter(combatant => combatant.readyWeapon == null).length,
  };
}

// 방어도 = 건물 + 마을에 남은 전투원의 직업·실제 배정 무기.
export function computeDefense(
  state: GameState,
  options: {
    includeExpedition?: boolean;
    excludedResidentIds?: Iterable<number>;
    gunpowderAvailable?: number;
  } = {},
): number {
  const excludedResidentIds = [...(options.excludedResidentIds ?? [])];
  const combatants = [...createCombatRoster(state, {
    context: 'villageDefense', excludedResidentIds, gunpowderAvailable: options.gunpowderAvailable,
  }).combatants];
  if (options.includeExpedition && state.expedition) {
    combatants.push(...createCombatRoster(state, {
      context: 'expedition', memberIds: state.expedition.memberIds, excludedResidentIds,
      gunpowderAvailable: options.gunpowderAvailable,
    }).combatants);
  }
  let d = 0;
  for (const b of state.buildings) {
    if (!b.built) continue;
    const defenseType = b.type === 'gate' && b.gateWallType ? b.gateWallType : b.type;
    d += BUILDING_DEFS[defenseType].defense;
  }
  const garrisonMult = countBuilt(state, 'garrison') > 0 ? 1.3 : 1;
  const unique = new Map(combatants.map(combatant => [combatant.residentId, combatant]));
  const peopleDefense = [...unique.values()].reduce((sum, combatant) =>
    sum + combatant.basePower + combatant.weaponPower, 0);
  d += Math.round(peopleDefense * garrisonMult);
  return Math.round(d);
}
