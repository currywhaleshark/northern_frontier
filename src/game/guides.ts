// 초회 도움말(길잡이 모듈) — "처음 보는 것"에 한 번만 붙는 안내.
// 원칙:
//  - 시나리오와 분리한다. 시나리오는 랜덤 사건을 잠그므로 안내를 위해 붙들어 둘 수 없다.
//    또 길잡이 시나리오가 도는 동안에는 절대 발화하지 않는다 — 이중 안내는 안내가 아니다.
//  - 저장에는 켬/끔과 본 날짜만 남긴다. 문구·형식은 코드에 있으니 모듈을 고쳐도 마이그레이션이 없다.
//  - 트리거는 각 시스템의 발생 지점에 openGuideOnce(state, '모듈id') 한 줄이 전부다.
//  - 형식은 두 가지뿐이다. 즉시 대응이 필요한 것(습격·화재·재해)만 시간을 멈추는 모달,
//    나머지는 비차단 카드. 어느 쪽이든 로그에 한 줄을 함께 남겨 놓쳐도 되짚을 수 있게 한다.
import { addLog } from './events';
import type { BuildingTypeId, GameState, GuideCardEntry, GuideState } from './types';

export type GuideFormat = 'card' | 'modal';

export type GuideModuleId =
  | 'preservation' | 'livestock' | 'oxen' | 'disaster' | 'fire' | 'diplomacy'
  | 'battle' | 'expedition' | 'beast' | 'mining' | 'chronicle' | 'rename'
  | 'tribute' | 'tannery' | 'coast' | 'saltworks';

export interface GuideModule {
  id: GuideModuleId;
  title: string;
  /** 로그에 병기하는 한 줄 — 카드를 놓쳐도 이것만은 남는다 */
  summary: string;
  body: string;
  format: GuideFormat;
}

export const GUIDE_MODULES: Record<GuideModuleId, GuideModule> = {
  preservation: {
    id: 'preservation',
    title: '갈무리와 절임',
    summary: '거둔 것은 두는 순간부터 상합니다 — 움 저장고와 훈연소, 장독대가 겨울 밥상을 지킵니다.',
    format: 'card',
    body:
      '거둔 것은 두는 순간부터 상하기 시작합니다. 여름에는 더 빠릅니다.\n' +
      '· 움 저장고는 곁에 둔 생선·고기·채소가 스러지는 속도를 늦춥니다.\n' +
      '· 훈연소와 건조대는 상하는 것을 오래 두는 것으로 바꿉니다. 갈무리꾼이 맡습니다.\n' +
      '· 상단 바의 자원 묶음을 눌러 보십시오. 품목마다 하루에 얼마씩 스러지는지 적혀 있습니다.',
  },
  livestock: {
    id: 'livestock',
    title: '가축과 축사',
    summary: '축사의 짐승은 곳간에서 먹이를 먹습니다 — 방목지와 겨울 꼴을 함께 살피십시오.',
    format: 'card',
    body:
      '축사에 짐승을 들이면 곳간에서 먹이가 나갑니다. 굶기면 마릿수가 줄어듭니다.\n' +
      '· 축사를 고르면 기를 짐승과 방목지를 정할 수 있습니다. 방목지가 넓을수록 목동이 더 듭니다.\n' +
      '· 풀이 마르는 겨울에는 꼴을 미리 쟁여야 합니다. 수확 때 나온 꼴을 버리지 마십시오.\n' +
      '· 짐승은 알과 젖과 털을 내고, 잡으면 고기와 가죽이 됩니다.',
  },
  oxen: {
    id: 'oxen',
    title: '농우(農牛)',
    summary: '소는 밥상에 오르기 전에 밭을 갑니다 — 경작지를 골라 농우를 붙이십시오.',
    format: 'card',
    body:
      '소가 들어왔습니다. 소는 밥상에 오르기 전에 먼저 밭을 갑니다.\n' +
      '· 경작지를 고르면 농우 배정 칸이 보입니다. 붙인 만큼 갈이와 파종이 빨라집니다.\n' +
      '· 한 뙈기에 붙일 수 있는 마릿수에는 한이 있고, 큰 뙈기는 한 마리를 더 받습니다.\n' +
      '· 소를 잡거나 잃으면 배정이 저절로 풀립니다.',
  },
  disaster: {
    id: 'disaster',
    title: '재해 — 하늘의 몫',
    summary: '재해는 며칠에 걸쳐 진행됩니다 — 사건 창에서 남은 날과 피해 범위를 살피십시오.',
    format: 'modal',
    body:
      '하늘이 하는 일은 막을 수 없습니다. 그러나 무엇이 오고 있는지는 볼 수 있습니다.\n\n' +
      '· 서리·황충·가뭄·설해·대홍수는 닥친 뒤에도 며칠에 걸쳐 진행됩니다. 사건 창에 남은 날이 적힙니다.\n' +
      '· 가뭄에는 물이 닿는 땅만 버팁니다 — 보(洑)와 농수로가 닿는 경작지를 확인하십시오.\n' +
      '· 제방은 대홍수의 물길을 막고, 성한 지붕은 눈의 무게를 견딥니다.\n' +
      '· 곳간에 여유가 있으면 한 해 흉작은 넘길 수 있습니다. 재해의 대비는 결국 비축입니다.',
  },
  fire: {
    id: 'fire',
    title: '불',
    summary: '불은 가까운 주민이 물을 길어 끕니다 — 우물과 강이 가까울수록 빨리 잡힙니다.',
    format: 'modal',
    body:
      '불길이 일었습니다. 마른 날이 이어지면 어느 건물에서든 날 수 있습니다.\n\n' +
      '· 가까이 있는 주민들이 스스로 물을 길어 끕니다. 우물·강·부두가 가까울수록 빨리 잡힙니다.\n' +
      '· 잡지 못하면 건물이 타 없어지고 이웃 건물로 옮겨붙습니다.\n' +
      '· 염초장에 불이 붙으면 화약이 터집니다. 사람 사는 곳에서 떨어뜨려 두는 편이 낫습니다.\n' +
      '· 탄 건물은 건축가가 수리합니다. 목재와 일손을 남겨 두십시오.',
  },
  diplomacy: {
    id: 'diplomacy',
    title: '세력과 왕래',
    summary: '세력 창에서 관계와 교역·선물·협정을 살필 수 있습니다.',
    format: 'card',
    body:
      '국경 너머에도 사람이 삽니다. 그들과의 사이는 숫자로 남습니다.\n' +
      '· 하단 독의 세력 창에서 각 세력의 관계와 지금 맺은 계약을 볼 수 있습니다.\n' +
      '· 선물을 보내면 사이가 풀립니다. 사이가 좋으면 교역이 후해지고 습격 전에 귀띔이 옵니다.\n' +
      '· 다만 월경 교역이 잦으면 조정의 의심이 오릅니다. 저울질이 필요합니다.',
  },
  battle: {
    id: 'battle',
    title: '습격',
    summary: '습격이 다가옵니다 — 목책과 수비병, 무기 배정을 지금 점검하십시오.',
    format: 'modal',
    body:
      '강 건너의 무리가 개척지를 노리고 있습니다.\n\n' +
      '· 파수꾼과 망루·봉수대는 미리 알립니다. 경보가 있으면 대비할 날이 생깁니다.\n' +
      '· 목책과 성문은 길을 막고, 수비병은 그 뒤에서 싸웁니다. 무기 배정을 확인하십시오.\n' +
      '· 무리가 마을에 닿으면 어떻게 맞설지 고르게 됩니다. 물리는 길도, 내어 주는 길도 있습니다.\n' +
      '· 위협도는 상단 바에 늘 떠 있습니다. 높을수록 자주 옵니다.',
  },
  expedition: {
    id: 'expedition',
    title: '산채와 원정',
    summary: '산채가 습격의 출발지입니다 — 먼저 정찰하고, 준비가 서면 토벌대를 냅니다.',
    format: 'card',
    body:
      '변경 마적의 산채를 찾았습니다. 이곳이 습격의 출발지입니다.\n' +
      '· 산채를 골라 먼저 정찰을 보내십시오. 규모와 방비를 알아야 손실이 줄어듭니다.\n' +
      '· 정찰해 둔 산채에서 나온 습격은 미리 경보가 뜹니다.\n' +
      '· 준비가 서면 토벌대를 편성해 산채를 칠 수 있습니다. 나간 사람은 그동안 마을 일을 못 합니다.',
  },
  beast: {
    id: 'beast',
    title: '맹수',
    summary: '맹수의 흔적이 나왔습니다 — 사건 창에서 추적과 토벌을 다시 지시할 수 있습니다.',
    format: 'card',
    body:
      '짐승의 흔적이 나왔습니다. 늑대는 숲을, 호랑이는 밤의 마을을, 멧돼지는 밭을 노립니다.\n' +
      '· 서둘러 몰아내기보다 먼저 흔적을 쫓는 편이 낫습니다. 규모를 알면 승산이 보입니다.\n' +
      '· 사건·기물함 창에서 추적과 토벌을 다시 지시할 수 있습니다.\n' +
      '· 위험이 남아 있는 동안에는 숲일이 위험합니다. 벌목꾼과 사냥꾼의 자리를 살피십시오.',
  },
  mining: {
    id: 'mining',
    title: '광맥과 채광',
    summary: '지도의 광맥(鑛) 탭을 켜면 묻힌 자리가 드러납니다 — 채광장과 채광갱이 그것을 캡니다.',
    format: 'card',
    body:
      '땅 밑에는 돌과 철이, 드물게 은이 묻혀 있습니다.\n' +
      '· 지도의 광맥(鑛) 탭을 켜면 묻힌 자리가 색으로 드러납니다.\n' +
      '· 촌 단계부터 채광장을 광상 곁에 세울 수 있습니다. 배정 채광꾼은 그 반경 안만 캐고 채광장에 부립니다.\n' +
      '· 채광갱은 광맥 위에 세워 깊은 곳을 캐는 후반 시설입니다.\n' +
      '· 은은 본디 조정의 것입니다. 숨기고 캐면 잠채이니, 이득과 의심을 저울질하십시오.\n' +
      '· 갱도는 무너질 수 있습니다. 사람이 갇히면 서둘러 결정을 내려야 합니다.',
  },
  chronicle: {
    id: 'chronicle',
    title: '승격과 연대기',
    summary: '승격으로 새 건물과 직업이 열렸습니다 — 중심지를 누르면 연대기가 열립니다.',
    format: 'card',
    body:
      '조정이 개척지의 등급을 올렸습니다. 새 건물과 직업이 함께 열립니다.\n' +
      '· 조정 창에서 다음 승격의 조건을 볼 수 있습니다. 인구와 방비, 세공 성실도를 봅니다.\n' +
      '· 중심지를 누르면 연대기가 열립니다. 이 땅에서 일어난 일이 해마다 적혀 있습니다.\n' +
      '· 등급이 오르면 조정의 기대도 함께 오릅니다. 세공이 무거워지는 것을 셈해 두십시오.',
  },
  // 세공 파발 — 둘째 해 봄 첫 공지에 발화한다. 첫 해는 조정이 거두지 않으므로
  // 이 안내가 곧 세공이라는 살림의 첫 소개다 (R4). 즉시 손을 대야 하는 일이라 모달로 둔다.
  tribute: {
    id: 'tribute',
    title: '세공(歲貢)과 파발',
    summary: '북병사의 파발이 올해 세공을 알렸습니다 — 조정 창에서 세공고에 미리 비축하십시오.',
    format: 'modal',
    body:
      '북병사(北兵使) 명의의 파발이 왔습니다. 올해부터 조정이 해마다 세공을 거둡니다.\n\n' +
      '· 봄에 공지된 요구를 세 계절 동안 마련하고, 겨울 첫날 조정의 사자가 거두어 갑니다.\n' +
      '· 상단 바의 세공 칩을 눌러 조정 창을 여십시오. 북병사의 이름과 성향, 올해 요구가 그곳에 있습니다.\n' +
      '· 요구 품목은 세공고에 미리 비축하십시오. 넣어 둔 몫은 겨울 소비와 분리되어 잠깁니다.\n' +
      '· 다 채우지 못하면 명성이 깎이고 국경이 험악해집니다. 해를 거듭해 미납하면 더 아픕니다.\n' +
      '· 성실히 바치면 명성이 오르고, 격년으로 조정의 하사품이 내려옵니다.',
  },
  // 세공 파발(모달)을 닫은 직후 이어 붙는 카드 — 요구 품목이 가죽옷일 때만 온다 (openGuideFollowUp)
  tannery: {
    id: 'tannery',
    title: '무두장이와 가죽공방',
    summary: '가죽옷은 무두장이가 가죽공방에서 짓습니다 — 가죽 2장이 옷 한 벌이 됩니다.',
    format: 'card',
    body:
      '가죽옷은 저절로 생기지 않습니다. 무두장이가 가죽공방에서 짓습니다.\n' +
      '· 건설 목록(생산)의 가죽공방을 세우고, 직업 배정에서 무두장이를 두십시오.\n' +
      '· 가죽 2장이 옷 한 벌이 됩니다. 가죽은 사냥꾼이 짐승을 잡아 가져옵니다.\n' +
      '· 사냥꾼이 모자라면 가죽이 끊깁니다. 사냥막과 사냥꾼의 수를 함께 살피십시오.\n' +
      '· 지은 옷은 겨울 체온도 지킵니다. 바칠 몫과 입힐 몫을 함께 셈해 두십시오.',
  },
  coast: {
    id: 'coast',
    title: '해안과 바닷물',
    summary: '바닷물은 얼지 않지만 마시거나 농사·소방에 쓸 수 없습니다 — 시작 수맥과 담수 하천을 지키십시오.',
    format: 'card',
    body:
      '남쪽의 큰 물은 바다입니다. 겨울에도 얼지 않고 사람이 건널 수 없습니다.\n' +
      '· 바닷물은 마실 수 없고 논·농수로·화재 진압에도 쓰지 못합니다. 우물과 담수 하천을 따로 확보하십시오.\n' +
      '· 바다가 차지한 만큼 농지와 수맥이 적습니다. 시작 정착지 가까운 수맥은 보장되지만 확장할수록 물을 먼저 살펴야 합니다.\n' +
      '· 대신 해안에서는 자염막을 지어 소금을 자급할 수 있습니다.',
  },
  saltworks: {
    id: 'saltworks',
    title: '자염과 겨울 장작',
    summary: '자염막은 바닷물을 장작으로 끓여 소금을 냅니다 — 겨울 난방 몫과 경쟁합니다.',
    format: 'card',
    body:
      '자염막이 섰습니다. 염부를 배정하고 장작을 들이면 소금을 냅니다.\n' +
      '· 바닷물과 맞닿은 2×2 육지에만 지을 수 있고, 물길이 끊기면 생산도 멎습니다.\n' +
      '· 염부 한 명은 하루 소금 0.75를 내며 소금 하나마다 장작 1.25를 태웁니다.\n' +
      '· 겨울에도 가동하지만 난방 장작과 같은 재고를 씁니다. 추위가 오기 전에는 가동 인원을 조절하십시오.',
  },
  rename: {
    id: 'rename',
    title: '개칭 청원',
    // 발화 지점이 둘이라 문구를 계절에 매지 않는다 — 일반 게임은 겨울 다음 봄 첫날,
    // 길잡이는 두 해를 마친 자리에서 잇는다 (R5 전에는 첫 겨울 직후였다)
    summary: '겨울을 넘겼습니다 — 중심지에서 개칭을 청원해 이 땅의 이름을 문서에 올릴 수 있습니다.',
    format: 'card',
    body:
      '겨울을 넘기고 이 땅에 뿌리를 내렸습니다. 이제 제 이름을 붙일 때입니다.\n' +
      '· 중심지를 골라 개칭을 청원하십시오. 파발이 오가고 북병사의 허가가 내려와야 이름이 바뀝니다.\n' +
      '· 바뀐 이름은 조정의 문서와 연대기에 함께 남습니다.\n' +
      '· 한 번 고치면 한동안 다시 고칠 수 없습니다.',
  },
};

// 완공 즉시 "처음 보는 살림"이 되는 건물들 — 완공 훅 한 곳에서 갈라 준다
const BUILDING_GUIDES: Partial<Record<BuildingTypeId, GuideModuleId>> = {
  cellar: 'preservation',
  smokehouse: 'preservation',
  dryingRack: 'preservation',
  jangdokdae: 'preservation',
  stable: 'livestock',
  deepMine: 'mining',
  saltworks: 'saltworks',
};

function ensureGuideState(state: GameState): GuideState {
  if (!state.guides || typeof state.guides !== 'object' || state.guides.seen == null) {
    // 구버전 저장 보정과 같은 규칙 — 이미 굴러가는 마을에 뒤늦은 안내를 쏟지 않는다
    state.guides = { enabled: false, seen: {} };
  }
  return state.guides;
}

export function guidesEnabled(state: GameState): boolean {
  return state.guides?.enabled === true;
}

export function setGuidesEnabled(state: GameState, enabled: boolean): void {
  ensureGuideState(state).enabled = enabled;
  if (!enabled) {
    // 꺼는 순간 떠 있던 카드와 대기 중인 모달도 함께 걷는다
    state.guideCards = [];
    state.guideModalQueue = [];
  }
}

export function hasSeenGuide(state: GameState, moduleId: string): boolean {
  return state.guides?.seen?.[moduleId] != null;
}

/**
 * 발화 없이 "이미 본 것"으로만 적어 둔다 — 길잡이 시나리오의 스텝이 같은 내용을
 * 직접 가르친 경우에 쓴다 (R5의 세공 파발·가죽공방 두 모듈). 스텝이 끝나고 시나리오가
 * 걷힌 뒤 같은 트리거(둘째 해 봄 파발)가 다시 돌아도 두 번 설명하지 않게 하려는 것이다.
 * 일반 게임의 R4 흐름은 이 함수를 부르지 않으므로 그대로 남는다.
 */
export function markGuideSeen(state: GameState, moduleId: GuideModuleId): void {
  const guides = ensureGuideState(state);
  if (guides.seen[moduleId] != null) return;
  guides.seen[moduleId] = state.day;
}

// scenario.ts의 scenarioActive와 같은 판정 — 순환 import를 피해 여기서 직접 본다.
// 길잡이 시나리오가 도는 동안에는 초회 도움말이 절대 발화하지 않는다.
function scenarioRunning(state: GameState): boolean {
  return state.scenario != null && !state.scenario.completed;
}

export function guideCards(state: GameState): readonly GuideCardEntry[] {
  return state.guideCards ?? [];
}

export function dismissGuideCard(state: GameState, moduleId: string): void {
  if (!state.guideCards) return;
  state.guideCards = state.guideCards.filter(card => card.moduleId !== moduleId);
}

/**
 * 대기 중인 모달 길잡이를 연다. 다른 모달이 떠 있으면 아무것도 하지 않고 다음 기회를 기다린다
 * (endOfDay 말미와 선택지 해소 직후에 다시 시도한다).
 */
export function flushGuideModal(state: GameState): void {
  const queue = state.guideModalQueue;
  if (!queue || queue.length === 0 || state.pendingChoice) return;
  const moduleId = queue.shift() as GuideModuleId;
  const guide = GUIDE_MODULES[moduleId];
  if (!guide) return;
  state.pendingChoice = {
    kind: 'guide',
    title: `길잡이 — ${guide.title}`,
    body: guide.body,
    options: [{ id: 'ok', label: '알겠소', desc: '이 안내는 다시 뜨지 않습니다. 설정에서 초회 도움말을 끌 수 있습니다.' }],
    data: { guideId: guide.id },
  };
}

/** endOfDay 말미 — 미뤄 둔 모달 길잡이를 다시 열어 본다. */
export function dailyGuideTick(state: GameState): void {
  flushGuideModal(state);
}

/**
 * 이 모듈을 처음 여는 경우에만 true를 돌려주고 본 날짜를 기록한다.
 * 카드는 즉시 화면에 서고, 모달은 대기열에 들어가 자리가 비면 열린다.
 * 어느 쪽이든 로그에 한 줄이 남는다.
 */
export function openGuideOnce(state: GameState, moduleId: GuideModuleId | string): boolean {
  const guides = ensureGuideState(state);
  if (!guides.enabled) return false;
  if (scenarioRunning(state)) return false;
  if (guides.seen[moduleId] != null) return false;
  const guide = GUIDE_MODULES[moduleId as GuideModuleId];
  if (!guide) return false;
  guides.seen[moduleId] = state.day;
  addLog(state, `길잡이 — ${guide.title}: ${guide.summary}`, 'info', true);
  if (guide.format === 'modal') {
    // 여기서 곧바로 열지 않는다 — 같은 틱에 이어지는 사건 모달이 덮어쓸 수 있다.
    // endOfDay 말미(dailyGuideTick)와 선택지 해소 직후에 자리를 보고 연다.
    state.guideModalQueue = [...(state.guideModalQueue ?? []), guide.id];
  } else {
    state.guideCards = [
      ...(state.guideCards ?? []),
      { moduleId: guide.id, title: guide.title, body: guide.body, day: state.day },
    ];
  }
  return true;
}

/**
 * 모달 길잡이를 닫은 직후 이어 붙는 안내 — 한 호흡 뒤에 오는 후속 카드다.
 * 세공 파발(모달)을 읽고 나면, 그 요구가 가죽옷일 때에 한해 가죽공방 카드가 잇는다.
 * 조건을 "튜토리얼 출신"이 아니라 "요구 품목에 가죽옷이 있음"으로 두는 이유:
 * 튜토리얼 출신은 첫 세공이 가죽옷으로 고정되어 있으니 언제나 이어지고,
 * 일반 게임은 실제로 가죽옷을 요구할 때만 뜬다 — 안내가 화면의 사실과 어긋나지 않는다.
 */
export function openGuideFollowUp(state: GameState, moduleId: string): void {
  if (moduleId === 'tribute' && (state.courtTribute?.items.hideClothes ?? 0) > 0) {
    openGuideOnce(state, 'tannery');
  }
}

/** 건물 완공 훅 — 처음 서는 살림이면 그에 맞는 길잡이를 연다. */
export function openBuildingCompletionGuide(state: GameState, type: BuildingTypeId): void {
  const moduleId = BUILDING_GUIDES[type];
  if (moduleId) openGuideOnce(state, moduleId);
}
