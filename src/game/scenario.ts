// 시나리오(튜토리얼) 엔진 — 일반 게임 위에 얹는 스크립트 레이어.
// 원칙:
//  - 스텝은 날짜 스크립트가 아니라 상태 술어(isDone)로 진행된다. 밸런스가 바뀌어도 스텝은 살아남는다.
//  - 랜덤 사건은 endOfDay의 게이트(scenarioSuppressesRandomEvents)로 통째로 잠근다.
//    결정론적 사건(세공 공지·수거, 날씨)은 그대로 둔다.
//  - 통제 사건(scripted incident)은 게이트와 무관한 스텝 훅(onStart/onDay)으로만 일으킨다.
//  - 저장에는 진행 위치(ScenarioState)만 남긴다. 문구·조건은 코드에 있으니
//    튜토리얼 내용을 고쳐도 세이브 마이그레이션이 필요 없다. 버전이 다르면 로드 시 해제한다.
import { buildingFootprintDims } from './buildings';
import { CONFIG } from './config';
import { consumeFuelHeat } from './consumption';
import { addLog } from './events';
import { markGuideSeen, openGuideOnce } from './guides';
import { openScriptedImmigrationChoice } from './immigration';
import { makeRng } from './map';
import { spawnRaiders } from './raids';
import { residentLogName } from './residentLogName';
import { withJosa } from './josa';
import { getDayOfSeason, getSeason, getYear } from './seasons';
import { tributeReserved } from './tributeReserve';
import { isWallBuilding } from './walls';
import { buildingTouchesWaterCoverage, naturalWaterCoverageTileSets } from './waterCoverage';
import { dailyFuelHeatNeed } from './winterReadiness';
import type { DialoguePresentation, GameState, JobId, Resident, ResourceId, ScenarioState } from './types';

// 진행 표식은 잎 모듈에 있다 (agents.ts가 누계를 올려야 해서 순환을 끊었다).
// 부르는 쪽은 예전처럼 scenario에서 가져다 쓴다.
export { countScenarioProgress, markScenarioFlag } from './scenarioFlags';

// 8 = 겨울 점검의 비축량을 합격선에서 권장선으로 바꾸고, 첫 겨울을 놓친 진행을 달력에 복구하는 판.
// 스텝 수·목표 의미가 바뀌면 진행 위치의 뜻이 달라지므로 반드시 올린다. v7은 스텝 순서가 같아
// 로드에서 v8로 호환 승격하고, 그보다 오래된 판은 일반 모드로 해제한다.
export const TUTORIAL_SCENARIO_VERSION = 8;

// 길잡이 화자는 튜토리얼 모달과 화면 앵커 말풍선이 함께 쓴다.
// 최종 초상 자산이 들어오면 portrait만 더하면 모든 대화 표면에 동시에 반영된다.
export const TUTORIAL_GUIDE_DIALOGUE: DialoguePresentation = {
  speaker: '연이',
  speakerTitle: '산골 길잡이',
};

/** 소목표 하나 — 칩에 `라벨 (현재/목표)`로 선다. 라벨은 짧은 명사, 칩은 수치 요약이다. */
interface ScenarioGoalProgress {
  label: string;
  current: number;
  target: number;
}

// 스텝의 원형 — isDone·goal은 여기서 파생시킨다 (아래 TUTORIAL_STEPS 참조).
interface ScenarioStepSpec {
  id: string;
  title: string;                        // 상단 바 목표 칩 제목
  body: string;                         // 스텝 시작 모달 본문
  // 완료 조건을 소목표 단위로 분해한 것. 대기(이튿날 아침)·사건(병자 회복)도 0/1 이진 항목이다.
  progress: (state: GameState) => ScenarioGoalProgress[];
  onStart?: (state: GameState) => void;
  // 이미 선행 준비가 끝난 선택 단계는 안내 모달까지 건너뛴다.
  skipWhen?: (state: GameState) => boolean;
  // 스텝 진행 중 매일 endOfDay에서 한 번 — 통제 사건 전용. 게이트와 무관하게 돈다.
  onDay?: (state: GameState, rng: () => number) => void;
}

interface ScenarioStepDefinition extends ScenarioStepSpec {
  goal: (state: GameState) => string;   // 목표 한 줄 (모달 하단) — progress에서 조합한다
  isDone: (state: GameState) => boolean; // progress에서 파생 — 두 눈금이 갈라질 수 없다
}

/** 소목표 하나의 달성 여부. 현재값이 목표를 넘어도(2/1) 완료다. */
export function scenarioGoalDone(item: ScenarioGoalProgress): boolean {
  return item.current >= item.target;
}

export function scenarioProgressComplete(items: readonly ScenarioGoalProgress[]): boolean {
  return items.every(scenarioGoalDone);
}

// 표시용 수치. 자원처럼 소수인 값은 내림한다 — 반올림하면 92.6/93이 "93/93"으로 보여
// 완료가 아닌데 완료처럼 읽힌다. 목표치가 주입되지 않은 경우(Infinity)는 '?'로 남긴다.
function goalNumberText(value: number, kind: 'current' | 'target'): string {
  if (!Number.isFinite(value)) return kind === 'current' ? '충분' : '?';
  return String(Math.max(0, Math.floor(value + 1e-9)));
}

/** `라벨 (현재/목표)` — 완료 표시(✅)는 붙이지 않는다. 칩은 표시를 따로 그린다. */
export function formatScenarioGoalItem(item: ScenarioGoalProgress): string {
  return `${item.label} (${goalNumberText(item.current, 'current')}/${goalNumberText(item.target, 'target')})`;
}

/** 모달 하단의 `목표: …` 한 줄 — 칩과 같은 형식으로 조합한다. */
export function formatScenarioGoal(items: readonly ScenarioGoalProgress[]): string {
  return items
    .map(item => `${scenarioGoalDone(item) ? '✅' : ''}${formatScenarioGoalItem(item)}`)
    .join(' · ');
}

// 플래그형 소목표 (미니맵 클릭·창 열람 등) — 0/1 이진
function flagGoal(state: GameState, label: string, key: string): ScenarioGoalProgress {
  return { label, current: (flags(state)[key] ?? 0) > 0 ? 1 : 0, target: 1 };
}

// 대기·사건형 소목표 (이튿날 아침·병자 회복 등) — 0/1 이진
function boolGoal(label: string, met: boolean): ScenarioGoalProgress {
  return { label, current: met ? 1 : 0, target: 1 };
}

// 목표치는 flags에 주입된다. 없으면 영영 못 이룬 것으로 본다 (기존 isDone의 ?? Infinity와 같은 뜻)
function goalTarget(state: GameState, key: string): number {
  return flags(state)[key] ?? Infinity;
}

/** 첫해 겨울이 시작됐거나 이미 지났는가. 길잡이 새 게임은 언제나 첫해 봄 1일에 시작한다. */
function firstTutorialWinterReached(state: GameState): boolean {
  const year = getYear(state.day);
  return year > 1 || (year === 1 && getSeason(state.day) === 'winter');
}

/** 첫 겨울 생존 눈금. 봄이 와도 0으로 되돌리지 않아 둘째 해 단계가 다음 겨울까지 밀리지 않는다. */
function firstTutorialWinterProgress(state: GameState): number {
  const target = CONFIG.tutorial.winterEndDayOfSeason;
  const year = getYear(state.day);
  if (year > 1) return target;
  if (year === 1 && getSeason(state.day) === 'winter') {
    return Math.min(getDayOfSeason(state.day), target);
  }
  return 0;
}

function flags(state: GameState): Record<string, number> {
  return state.scenario?.flags ?? {};
}

function builtCount(state: GameState, predicate: (type: GameState['buildings'][number]['type']) => boolean): number {
  return state.buildings.filter(building => building.built && predicate(building.type)).length;
}

function placedCount(state: GameState, predicate: (type: GameState['buildings'][number]['type']) => boolean): number {
  return state.buildings.filter(building => predicate(building.type)).length;
}

function jobCount(state: GameState, job: JobId): number {
  return state.residents.filter(resident => resident.alive && resident.job === job).length;
}

function assignedJobCount(
  state: GameState,
  job: JobId,
  buildingTypes: readonly GameState['buildings'][number]['type'][],
): number {
  const validIds = new Set(state.buildings
    .filter(building => building.built && buildingTypes.includes(building.type))
    .map(building => building.id));
  return state.residents.filter(resident =>
    resident.alive && resident.job === job && resident.assignedBuildingId != null &&
    validIds.has(resident.assignedBuildingId)).length;
}

function isPlot(building: GameState['buildings'][number]): boolean {
  return building.type === 'field' || building.type === 'paddy';
}

// 실제로 씨가 들어간 면적 — 농부가 갈고 뿌린 만큼만 센다
function totalSownArea(state: GameState): number {
  return state.buildings
    .filter(isPlot)
    .reduce((sum, building) => sum + (building.sownArea ?? 0), 0);
}

// 배치만 된 면적 — 공사·파종을 기다리지 않는다 (2단계는 여기서 끝난다)
function placedPlotArea(state: GameState): number {
  return state.buildings.filter(isPlot).reduce((sum, building) => {
    const { w, h } = buildingFootprintDims(building);
    return sum + w * h;
  }, 0);
}

// 강(또는 물 흐르는 농수로) 급수권에 걸친 밭 — 우물 없이도 물을 먹는 땅
function hasNaturallyWateredPlot(state: GameState): boolean {
  const plots = state.buildings.filter(isPlot);
  if (plots.length === 0) return false;
  const coverage = naturalWaterCoverageTileSets(state);
  return plots.some(plot =>
    buildingTouchesWaterCoverage(plot, coverage.river) ||
    buildingTouchesWaterCoverage(plot, coverage.canal));
}

// 6단계의 통제 사건 — 스텝이 붙인 병자를 다시 찾는다
function scriptedPatient(state: GameState): Resident | null {
  const id = state.scenario?.flags.patientResidentId;
  if (id == null) return null;
  return state.residents.find(resident => resident.id === id) ?? null;
}

function livingCount(state: GameState): number {
  return state.residents.filter(resident => resident.alive).length;
}

// 누계 표식 (대장간의 도구·가죽공방의 가죽옷) — agents.ts가 지어낸 만큼 쌓아 준다
function counted(state: GameState, key: string): number {
  return flags(state)[key] ?? 0;
}

function activeTributeRequirements(state: GameState): [ResourceId, number][] {
  const tribute = state.courtTribute;
  if (!tribute || tribute.resolved) return [];
  return (Object.entries(tribute.items) as [ResourceId, number][])
    .filter((entry): entry is [ResourceId, number] => Number(entry[1]) > 0);
}

function wholeAvailableResource(state: GameState, resource: ResourceId): number {
  return Math.max(0, Math.floor((state.resources[resource] ?? 0) + 1e-9));
}

// 현재 재고만 옮겨도 올해 요구를 전량 채울 수 있는가. 이미 옮긴 양도 함께 센다.
export function tutorialTributeCanFillFromStock(state: GameState): boolean {
  const requirements = activeTributeRequirements(state);
  return requirements.length > 0 && requirements.every(([resource, required]) =>
    tributeReserved(state, resource) + wholeAvailableResource(state, resource) >= required);
}

export function tutorialTributePrepared(state: GameState): boolean {
  if (state.courtTribute?.resolved) return true;
  const requirements = activeTributeRequirements(state);
  return requirements.length > 0 && requirements.every(([resource, required]) =>
    tributeReserved(state, resource) >= required);
}

// 길잡이의 첫 세공은 가죽옷 한 품목으로 고정된다. 가진 몫으로 전량을 못 채울 때만
// 가죽공방 단계로 갈라진다. 다른 품목이 들어오면 잘못된 생산 안내를 내지 않는다.
export function tutorialTributeNeedsTannery(state: GameState): boolean {
  const required = activeTributeRequirements(state);
  return required.length === 1 && required[0][0] === 'hideClothes'
    && !tutorialTributePrepared(state) && !tutorialTributeCanFillFromStock(state);
}

function tributeReserveGoal(state: GameState): ScenarioGoalProgress {
  if (state.courtTribute?.resolved) return boolGoal('세공 처리', true);
  const required = activeTributeRequirements(state).find(([resource]) => resource === 'hideClothes')?.[1] ?? 1;
  return {
    label: '세공고',
    current: Math.min(required, tributeReserved(state, 'hideClothes')),
    target: required,
  };
}

function tributeStockGoal(state: GameState): ScenarioGoalProgress {
  const required = activeTributeRequirements(state).find(([resource]) => resource === 'hideClothes')?.[1] ?? 1;
  return {
    label: '가죽옷 확보',
    current: Math.min(required, tributeReserved(state, 'hideClothes') + wholeAvailableResource(state, 'hideClothes')),
    target: required,
  };
}

// 16단계: 지금 습격이 진행 중인가 (무리·전투·습격 선택지 어느 하나라도)
function raidInProgress(state: GameState): boolean {
  if (state.raiders || state.battle || state.tacticalBattle || state.raidHold) return true;
  const kind = state.pendingChoice?.kind;
  return kind === 'raid' || kind === 'extortion' || kind === 'expeditionRaidOrder';
}

// 스텝 원형 — 소목표(progress)만 적는다. isDone·goal은 아래에서 이 배열로부터 파생시킨다.
const TUTORIAL_STEP_SPECS: readonly ScenarioStepSpec[] = [
  {
    id: 'naming',
    title: '이름과 첫 기록',
    body:
      '나으리, 드디어 두만강 이북의 새 땅에 닿았습니다. 낯설어도 걱정 마세요. 제가 곁에서 하나씩 짚어 드릴게요. 오늘부터 이곳의 이름은 조정 문서와 사람들의 기억에 함께 남습니다.\n\n' +
      '· 지도를 끌어 가까운 곳을 둘러보고, 미니맵을 눌러 먼 땅으로도 건너가 보세요.\n' +
      '· 상단 바의 ▶로 시간을 흐르게 하고 배속도 바꿔 보세요. 급할수록 잠시 늦추어 살피는 편이 좋습니다.\n' +
      '· 주민을 왼쪽 클릭하면 이름과 직업, 몸 상태를 볼 수 있습니다.\n' +
      '· 마을 중심지를 누르면 연대기가 열립니다. 앞으로 이곳에서 일어난 일은 그곳에 차곡차곡 적힐 거예요.',
    progress: state => [
      flagGoal(state, '주민 선택', 'residentSelected'),
      flagGoal(state, '미니맵', 'minimapClicked'),
      flagGoal(state, '배속', 'speedChanged'),
      boolGoal('이튿날 아침', state.day >= 2),
    ],
  },
  {
    id: 'working',
    title: '사람과 일',
    body:
      '사람은 저마다 맡을 일이 있어야 손이 제대로 움직입니다. 벌목꾼이 나무를 베어도 운반꾼이 창고에 들여놓기 전에는 우리 비축으로 잡히지 않아요.\n\n' +
      '· 하단 독의 직업 배정 창을 열어 보세요. 누가 무슨 일을 맡았는지 한눈에 보입니다.\n' +
      '· 건설 목록(생산)에서 값싼 벌목장을 먼저 세워 보세요. 채집 일은 거점에 배정된 사람만 합니다.\n' +
      '· 벌목장 터를 잡으면 건축가 옆의 ＋를 눌러 한 사람을 두세요. 건축가가 없으면 터만 잡힌 채 공사가 오르지 않습니다.\n' +
      '· 벌목장을 숲에 놓았다면 벌목꾼도 한 사람 두세요. 아직 거점에 배정하지 않았어도 공사터의 나무부터 베어 길을 엽니다.\n' +
      '· 벌목장이 완공되면 그곳의 작업 슬롯에 벌목꾼을 배정하고, 운반꾼도 한 사람 이상 두시면 됩니다.\n' +
      '· 직업 옆의 ＋를 누르면 무직자 한 사람을 빠르게 배정할 수 있어요.\n' +
      '· 땅바닥에 쌓인 자원은 아직 우리 살림이 아닙니다. 꼭 창고에 들어와야 곳간에 잡힌다는 것만 기억해 주세요.',
    progress: state => [
      flagGoal(state, '직업 창', 'jobPanelOpened'),
      { label: '벌목장 터', current: placedCount(state, type => type === 'lumberCamp'), target: 1 },
      { label: '건축가', current: jobCount(state, 'builder'), target: 1 },
      { label: '벌목장 완공', current: builtCount(state, type => type === 'lumberCamp'), target: 1 },
      { label: '벌목장 배정', current: assignedJobCount(state, 'woodcutter', ['lumberCamp']), target: 1 },
      { label: '운반꾼', current: jobCount(state, 'hauler'), target: 1 },
    ],
  },
  {
    id: 'sowing',
    title: '봄 파종',
    body:
      '북방의 봄은 생각보다 짧습니다. 파종철을 놓친 밭은 한 해를 통째로 놀게 되니, 이것부터 서두르는 편이 좋아요.\n\n' +
      '· 건설 목록(농사)에서 밭을 고르고, 지도 위를 끌어 크기를 정해 주세요.\n' +
      '· 밭을 선택하면 작물과 농우를 정할 수 있습니다. 조와 기장은 척박한 땅에서도 제법 잘 버팁니다.\n' +
      '· 직업 배정에서 농부를 한 사람 이상 두세요. 밭만 그어 두면 땅은 그대로 놉니다.\n' +
      '· 밭 터와 농부만 챙겨 주시면 갈이와 파종은 그들이 이어갑니다. 그동안 다른 살림을 살피셔도 괜찮아요.',
    progress: state => [
      { label: '밭 배치', current: placedPlotArea(state), target: goalTarget(state, 'sownAreaGoal') },
      { label: '농부', current: jobCount(state, 'farmer'), target: 1 },
    ],
  },
  {
    id: 'hearth',
    title: '집과 장작',
    body:
      '북방에서는 지붕과 따뜻한 아궁이가 목숨을 지켜 줍니다. 노숙하는 사람이 없도록 집을 마련하고, 겨울이 오기 전에 장작도 쌓아 두어야 해요.\n\n' +
      '· 목재와 장작은 다릅니다. 벌목꾼이 벤 것은 목재이고, 장작마당에서 장작꾼이 패야 비로소 땔감이 됩니다. ' +
      '원료를 가공해 비축하는 흐름은 앞으로도 자주 쓰이니 눈여겨봐 주세요.\n' +
      '· 건설 목록(주거)에서 초가집을, (생산)에서 장작마당을 지으세요.\n' +
      '· 벌목장을 지은 건축가가 두 공사도 맡습니다. 그사이 다른 일로 돌렸다면 다시 한 사람을 두면 됩니다.\n' +
      '· 직업 배정에서 장작꾼도 한 사람 이상 두세요. 장작꾼은 장작마당이 있어야 일합니다.\n' +
      '· 그동안 농부는 밭을 갈고 씨를 뿌립니다. 파종이 더디다면 농부가 모자라지 않은지도 살펴봐 주세요.',
    progress: state => [
      {
        label: '초가집',
        current: builtCount(state, type => type === 'hut' || type === 'ondol' || type === 'tileHouse'),
        target: goalTarget(state, 'houseGoal'),
      },
      {
        label: '장작마당',
        current: builtCount(state, type => type === 'woodShed'),
        target: goalTarget(state, 'woodShedGoal'),
      },
      { label: '장작꾼', current: jobCount(state, 'woodSplitter'), target: 1 },
      { label: '장작', current: state.resources.firewood, target: goalTarget(state, 'firewoodGoal') },
      { label: '파종', current: totalSownArea(state), target: goalTarget(state, 'sownAreaGoal') },
    ],
  },
  {
    id: 'water',
    title: '물과 땅',
    body:
      '사람도 짐승도 물 없이는 살 수 없습니다. 물이 닿지 않는 집은 병이 돌기 쉬우니, 마을의 물길부터 찾아볼까요?\n\n' +
      '· 지도의 수맥(水) 탭을 켜 보세요. 땅 밑 물길과 급수 상태가 색으로 드러납니다.\n' +
      '· 수맥 위에 우물을 파면 둘레의 집과 작업장이 물을 받습니다. 물길 한복판일수록 더 넉넉해요.\n' +
      '· 강가에 붙은 밭은 저절로 물을 먹습니다. 나중에는 농수로를 이어 내륙에도 논을 열 수 있지만, ' +
      '그건 보(堡)로 오른 뒤에 천천히 익혀도 됩니다.',
    // 우물 하나로도, 강가 밭 하나로도 물을 댄다 — 한 항목(물자리)으로 묶어 센다.
    // 강 급수권 계산은 지도 전체를 훑으므로 우물이 이미 섰으면 건너뛴다.
    progress: state => {
      const wells = builtCount(state, type => type === 'well');
      return [
        flagGoal(state, '수맥 탭', 'aquiferToggled'),
        { label: '물자리', current: wells >= 1 ? wells : (hasNaturallyWateredPlot(state) ? 1 : 0), target: 1 },
      ];
    },
  },
  {
    id: 'hunting',
    title: '사냥과 갈무리',
    body:
      '숲의 서식지에는 짐승이 모여 삽니다. 곡식이 모자랄 때 사냥감이 두 번째 곳간이 되어 줄 거예요.\n\n' +
      '· 서식지 가까운 숲에 사냥막을 세우고, 완공되면 사냥꾼 두 사람을 배정하세요.\n' +
      '· 사냥꾼은 배정된 사냥막의 작업영역 안에서만 사냥하고, 고기와 가죽을 그곳에 내려놓습니다. 사냥막을 선택하면 작업영역과 남은 짐승 비축을 볼 수 있어요.\n' +
      '· 고기는 오래 두면 상합니다. 여름에는 더 빠르니, 잔뜩 쌓기보다 제때 먹이는 편이 좋아요.\n' +
      '· 나중에 훈연장과 움집, 독을 갖추면 말리고 절여 겨울까지 보관할 수 있습니다.',
    progress: state => [
      { label: '사냥막', current: builtCount(state, type => type === 'huntLodge'), target: 1 },
      { label: '사냥막 배정', current: assignedJobCount(state, 'hunter', ['huntLodge']), target: 2 },
      { label: '고기', current: state.resources.meat, target: goalTarget(state, 'meatGoal') },
    ],
  },
  {
    id: 'patient',
    title: '첫 병자',
    body:
      '앓아누운 사람이 생겼습니다. 놀라지 마세요. 약초와 따뜻한 밥이 있으면 다시 일어날 가능성이 훨씬 커집니다.\n\n' +
      '· 약초는 약초꾼이 숲을 돌며 캐어 곳간에 비축합니다.\n' +
      '· 병자는 그 약초를 매일 조금씩 씁니다. 나중에 의원을 세우면 의원(醫員)도 같은 약초로 치료해요.\n' +
      '· 건설 목록(생산)에서 약초막을 숲 가까이 세우세요. 약초꾼은 배정된 약초막의 작업영역에서만 캡니다.\n' +
      '· 약초막이 완공되면 작업 슬롯에 약초꾼 한 사람을 배정해 주세요.\n' +
      '· 약초가 있으면 회복이 빠릅니다. 떨어지면 몸이 스스로 이겨 내기를 기다릴 수밖에 없어요.\n' +
      '· 굶주림과 추위도 병을 부릅니다. 따뜻한 밥과 아궁이가 가장 먼저 쓰는 약이에요.\n' +
      '· 진(鎭)으로 오르면 의원을 세워 병자를 돌보고 역병도 격리할 수 있습니다.',
    // 통제 사건: 건강한 성인 한 사람을 눕힌다 (역병 시스템은 쓰지 않는다 — 계획 §2-라)
    onStart: state => {
      const scenario = state.scenario;
      if (!scenario || scenario.flags.patientResidentId != null) return;
      const candidate = state.residents.find(resident =>
        resident.alive && !resident.sick && !resident.stage && !resident.special && resident.health >= 60);
      if (!candidate) return;
      candidate.sick = true;
      scenario.flags.patientResidentId = candidate.id;
      addLog(state, `${withJosa(residentLogName(candidate), '이/가')} 앓아누웠습니다. 약초를 살피십시오.`, 'bad', true);
    },
    // G3 이후 약초꾼은 약초막 배정이 있어야만 작업영역에서 채집한다.
    progress: state => {
      const patient = scriptedPatient(state);
      return [
        { label: '약초막', current: builtCount(state, type => type === 'herbHut'), target: 1 },
        { label: '약초막 배정', current: assignedJobCount(state, 'herbalist', ['herbHut']), target: 1 },
        // 병자를 붙이지 못했거나 기록이 사라지면 붙들지 않는다
        boolGoal('병자 회복', !patient || !patient.alive || !patient.sick),
      ];
    },
  },
  {
    id: 'defense',
    title: '방어의 기초',
    body:
      '강 건너의 무리는 약해 보이는 개척지를 노립니다. 길잡이 동안에는 습격이 오지 않지만, 그 뒤에는 위협도가 높아질수록 찾아오기 쉬워요.\n\n' +
      '· 건설 목록(방어)에서 목책을 이어 마을 어귀를 막아 주세요.\n' +
      '· 수비병은 싸우는 사람이고, 파수꾼은 먼저 살피는 사람입니다. 파수꾼이 있으면 위협을 일찍 알리고 노림 자체도 줄일 수 있어요.\n' +
      '· 직업 배정에서 수비병과 파수꾼을 각각 한 사람 이상 두세요.\n' +
      '· 봉수대와 망루는 나중에 배워도 됩니다. 지금은 목책과 지킬 사람이면 충분해요.',
    progress: state => [
      { label: '목책', current: builtCount(state, isWallBuilding), target: 1 },
      { label: '수비병', current: jobCount(state, 'militia'), target: 1 },
      { label: '파수꾼', current: jobCount(state, 'watchman'), target: 1 },
    ],
  },
  {
    id: 'stocktake',
    title: '겨울 점검',
    body:
      '이제 곳간을 한번 꼼꼼히 세어 볼 때입니다. 겨울에도 채울 수는 있지만, 폭설과 혹한이 오면 바깥일이 자주 묶이거든요. 미리 쌓아 두면 마음이 훨씬 놓입니다.\n\n' +
      '· 겨울 점검을 열어 식량과 땔감이 며칠분인지 확인해 보세요.\n' +
      '· 일분은 지금 인구가 겨울 소모로 먹고 땔 때의 셈입니다. 사람이 늘면 같은 비축도 더 빨리 줄어요.\n' +
      '· 섶과 숯도 땔감으로 함께 셉니다. 숯은 같은 부피로 더 오래 탑니다.\n' +
      '· 식량 30일분과 땔감 24일분은 넉넉한 권장선이지 합격선은 아닙니다. 모자라도 점검만 열면 다음으로 갈 수 있어요.\n' +
      '· 점검 전에 겨울이 먼저 닥치면 길잡이는 생존 단계로 넘어갑니다. 혹한이 닥친 날에는 하루 소모가 껑충 뛴다는 것도 기억해 주세요.',
    onDay: state => {
      const active = state.scenario;
      if (!active || (active.flags.checklistOpened ?? 0) > 0 ||
        (active.flags.stocktakeAutoAdvanced ?? 0) > 0 || !firstTutorialWinterReached(state)) return;
      active.flags.stocktakeAutoAdvanced = 1;
      addLog(
        state,
        '첫 겨울이 시작되었거나 이미 지났습니다. 준비 수치가 권장선에 못 미쳐도 길잡이는 생존 단계로 이어집니다. 겨울 점검에서 부족한 항목을 계속 보충하십시오.',
        'bad', true,
      );
    },
    // 점검을 여는 것이 필수 학습이다. 달력이 먼저 겨울에 닿으면 진행 고착을 막기 위해 자동 통과한다.
    progress: state => [boolGoal(
      '겨울 점검',
      (state.scenario?.flags.checklistOpened ?? 0) > 0 || firstTutorialWinterReached(state),
    )],
  },
  {
    id: 'winter',
    title: '첫 겨울',
    body:
      '나으리, 첫 겨울이 왔습니다. 여기까지 준비한 살림이면 해낼 수 있어요. 이제는 무리하게 넓히기보다 장작과 곳간이 줄어드는 속도를 잘 살펴봐 주세요.\n\n' +
      '· 장작이 떨어지면 체온이, 곳간이 비면 배가 먼저 무너집니다.\n' +
      '· 병자는 약초로 돌보고, 옷이 모자라면 체온이 더 빨리 식는다는 점도 살펴야 해요.\n' +
      `· 겨울 ${CONFIG.tutorial.winterEndDayOfSeason}일째 아침까지 첫 고비를 함께 넘겨 봅시다. ` +
      '봄이 오면 조정의 파발과 함께 새로운 일이 찾아올 거예요.',
    // 통제 사건: 기후는 건드리지 않고 그날의 장작 소모만 올린다 (계획 §2-다 A안)
    onDay: state => {
      const scenario = state.scenario;
      if (!scenario || (scenario.flags.coldSnapWarned ?? 0) > 0) return;
      // 첫 겨울을 놓친 구 저장이 다음 겨울에 들어와도 통제 혹한을 뒤늦게 재생하지 않는다.
      if (getYear(state.day) !== 1 || getSeason(state.day) !== 'winter') return;
      if (getDayOfSeason(state.day) < CONFIG.tutorial.coldSnapDayOfWinter) return;
      scenario.flags.coldSnapWarned = 1;
      const extraHeat = dailyFuelHeatNeed(state) * Math.max(0, CONFIG.tutorial.coldSnapFirewoodMult - 1);
      if (extraHeat > 0) consumeFuelHeat(state, extraHeat);
      addLog(
        state,
        '바람이 종일 문틈을 파고들어 아궁이가 쉬지 못했습니다. 오늘 장작 소모가 크게 늘었습니다.',
        'bad', true,
      );
    },
    // 첫 겨울 전에는 0일차. 첫 겨울 목표일을 넘긴 뒤에는 봄이 와도 완료 눈금을 유지한다.
    progress: state => [{
      label: '겨울',
      current: firstTutorialWinterProgress(state),
      target: CONFIG.tutorial.winterEndDayOfSeason,
    }],
  },

  // ────────────────────── 둘째 해 (R5) ──────────────────────
  // 첫 겨울은 정착의 고비였고, 여기서부터는 조정·살림·바깥세상을 배운다.
  // 순서: 세공 파발 → 무두장이 → 유민 → 광물 → 대장간 → 장터 → 전투(마무리).
  {
    id: 'tribute',
    title: '조정의 파발',
    body:
      '나으리, 봄이 왔습니다. 첫 겨울을 무사히 넘겼네요. 조정도 그 모습을 지켜보았고, 올해부터는 해마다 세공(歲貢)을 거두기 시작합니다.\n\n' +
      '· 북병사(北兵使)의 파발이 봄에 올해 요구를 알리고, 겨울 첫날 사자가 거두어 갑니다.\n' +
      '· 상단 바의 세공 칩을 눌러 조정 창을 열어 보세요. 북병사의 이름과 성향, 올해 요구가 그곳에 있습니다.\n' +
      '· 요구 품목은 세공고에 미리 옮겨 두세요. 넣어 둔 몫은 겨울 소비와 분리되어 안전하게 잠깁니다.\n' +
      '· 다 채우지 못하면 명성이 깎이고 국경이 험악해집니다. 성실히 바치면 격년으로 하사품도 내려와요.\n' +
      '· 파발이 아직 오지 않았다면 시간을 조금 흘려 보세요. 봄 첫날에 찾아옵니다.',
    // 이 스텝이 세공 길잡이 모듈의 내용을 그대로 가르친다 — 시나리오가 걷힌 뒤
    // 같은 트리거(봄 파발)가 다시 돌아도 두 번 설명하지 않게 본 것으로 적어 둔다.
    onStart: state => markGuideSeen(state, 'tribute'),
    progress: state => {
      const needsTannery = tutorialTributeNeedsTannery(state);
      return [
        boolGoal('세공 공지', state.courtTribute != null),
        flagGoal(state, '조정 창', 'courtWindowOpened'),
        needsTannery ? boolGoal('가죽옷 부족 확인', true) : tributeReserveGoal(state),
      ];
    },
  },
  {
    id: 'tanning',
    title: '무두장이와 가죽공방',
    body:
      '올해 조정이 찾는 것은 가죽옷입니다. 가죽만 쌓아 두어서는 옷이 되지 않으니, 무두장이와 가죽공방의 손을 빌려야 해요.\n\n' +
      '· 건설 목록(생산)에서 가죽공방을 세우고, 직업 배정에서 무두장이를 한 사람 두세요.\n' +
      '· 가죽 2장이 옷 한 벌이 됩니다. 가죽은 사냥꾼이 짐승을 잡아 가져옵니다.\n' +
      '· 사냥꾼이 모자라면 재료가 금세 끊깁니다. 사냥꾼 수와 곳간의 가죽을 함께 살펴봐 주세요.\n' +
      '· 가죽옷은 세공뿐 아니라 겨울 체온도 지켜 줍니다. 바칠 몫과 주민에게 입힐 몫을 함께 셈해 두는 편이 좋아요.\n' +
      '· 요구량을 채웠다면 조정 창으로 돌아가 가죽옷을 세공고에 전량 옮겨 주세요.',
    onStart: state => markGuideSeen(state, 'tannery'),
    skipWhen: state => tutorialTributePrepared(state),
    progress: state => [
      { label: '가죽공방', current: builtCount(state, type => type === 'tannery'), target: 1 },
      { label: '무두장이', current: jobCount(state, 'tanner'), target: 1 },
      // 시작 재고(가죽옷 18벌)가 아니라 가죽공방이 실제로 지어낸 양을 센다 — agents.ts가 쌓아 준다
      { label: '가죽옷', current: counted(state, 'hideClothesMade'), target: goalTarget(state, 'hideClothesMadeGoal') },
      tributeStockGoal(state),
      tributeReserveGoal(state),
    ],
  },
  {
    id: 'immigrants',
    title: '흘러든 사람들',
    body:
      '남쪽에서 떠돌던 사람들이 우리 마을의 연기를 보고 찾아오고 있습니다. 사람이 늘면 마을도 한층 북적이겠지만, 식구가 느는 만큼 살림도 함께 늘어나요.\n\n' +
      '· 받아들이면 일손이 붙지만 먹일 밥과 누일 자리도 더 필요합니다.\n' +
      '· 제안 창에 수용 뒤의 주거와 식량 일분이 함께 적힙니다. 그 셈을 보고 찬찬히 정하세요.\n' +
      '· 사정이 어렵다면 돌려보낼 수도 있습니다. 다만 야박하다는 소문이 돌아 명성이 조금 깎여요.\n' +
      '· 새로 온 사람들은 무직으로 도착합니다. 받아들였다면 직업 배정에서 일자리도 마련해 주세요.',
    // 통제 사건: 인구 기준선을 적어 두고, 이튿날부터 유민 제안을 직접 연다
    onStart: state => {
      const scenario = state.scenario;
      if (!scenario) return;
      if (scenario.flags.immigrantBasePop == null) scenario.flags.immigrantBasePop = livingCount(state);
    },
    // 랜덤 게이트는 우회하되 모달·수용/거절 처리는 일반 유민과 같은 경로를 쓴다.
    // 돌려보냈으면 며칠 뒤 다시 찾아온다 — 거절이 스텝을 영영 잠그면 안 된다.
    onDay: (state, rng) => {
      const scenario = state.scenario;
      if (!scenario || (scenario.flags.immigrantsJoined ?? 0) > 0) return;
      const base = scenario.flags.immigrantBasePop ?? livingCount(state);
      if (livingCount(state) > base) {
        scenario.flags.immigrantsJoined = 1;
        return;
      }
      const lastOffer = scenario.flags.immigrantOfferDay;
      if (lastOffer != null && state.day - lastOffer < CONFIG.tutorial.immigrantRetryDays) return;
      if (!openScriptedImmigrationChoice(state, rng)) return;
      scenario.flags.immigrantOfferDay = state.day;
      addLog(state, '떠돌던 사람들이 성책 앞에 이르렀습니다. 받아들일지 정하십시오.', 'info', true);
    },
    progress: state => [boolGoal('유민 수용', (flags(state).immigrantsJoined ?? 0) > 0)],
  },
  {
    id: 'minerals',
    title: '노두와 채광',
    body:
      '돌과 철은 땅이 숨겨 둔 살림입니다. 먼저 어디에 묻혀 있는지 찾아내야 꺼내 쓸 수 있어요.\n\n' +
      '· 미니맵 곁의 광맥(鑛) 탭을 켜 보세요. 땅속에 묻힌 자리가 색으로 드러납니다.\n' +
      '· 땅 위로 드러난 바위 자리가 노두입니다. 개척지 곁에도 돌 노두와 철 노두가 하나씩 있어요.\n' +
      `· 노두가 반경 안에 들도록 곁의 빈 땅에 채광장을 세우세요. 채광꾼은 배정된 채광장 반경 ${CONFIG.minerals.mineWorkRadius}칸 안에서만 캐고 그곳에 내려놓습니다.\n` +
      '· 채광장이 완공되면 작업 슬롯에 채광꾼을 배정해 주세요. 채집 직업은 모두 거점 배정이 필요합니다.\n' +
      '· 철 노두에서는 돌도 함께 딸려 옵니다. 노두의 양은 한정되어 있어 다 캐면 평지로 돌아가요.\n' +
      '· 땅속 깊은 광맥을 통째로 뚫는 채광갱은 훨씬 뒤, 부(府)의 살림이니 지금은 노두만 알아도 충분합니다.',
    progress: state => [
      flagGoal(state, '광맥 탭', 'oreToggled'),
      { label: '채광장', current: builtCount(state, type => type === 'mine'), target: 1 },
      { label: '채광장 배정', current: assignedJobCount(state, 'miner', ['mine']), target: 1 },
      // 곳간 재고가 아니라 캐낸 양 — 돌은 공사에 곧바로 쓰여 재고로는 늘지 않는 날이 있다
      { label: '돌·철', current: counted(state, 'mineralsMined'), target: goalTarget(state, 'mineralsMinedGoal') },
    ],
  },
  {
    id: 'smithy',
    title: '대장간과 도구',
    body:
      '아무리 좋은 도구도 쓰다 보면 닳습니다. 곳간의 도구가 바닥나면 공사와 농사가 함께 느려지니, 이제 우리 손으로 만들어 볼까요?\n\n' +
      '· 건설 목록(생산)에서 대장간을 세우고, 직업 배정에서 대장장이를 한 사람 두세요.\n' +
      '· 대장간은 철 하나와 목재 하나로 도구 하나를 만듭니다. 재료는 대장장이가 창고에서 가져와요.\n' +
      '· 대장간을 선택하면 무엇을 만들지 정할 수 있습니다. 수레와 무기는 나중에 열립니다.\n' +
      '· 철이 떨어지면 망치질도 멎습니다. 대장간과 함께 곳간의 철도 살펴봐 주세요.',
    progress: state => [
      { label: '대장간', current: builtCount(state, type => type === 'smithy'), target: 1 },
      { label: '대장장이', current: jobCount(state, 'smith'), target: 1 },
      { label: '도구', current: counted(state, 'toolsCrafted'), target: goalTarget(state, 'toolsCraftedGoal') },
    ],
  },
  {
    id: 'market',
    title: '장터와 교역',
    body:
      '국경 너머에도 저마다 살림을 꾸리는 사람들이 있습니다. 이 땅에서 나지 않는 것은 서로 바꾸어 얻으면 돼요.\n\n' +
      '· 건설 목록(생산)에서 장터를 세우세요. 장터가 있어야 상단이 찾아오고, 이쪽에서도 사람을 보낼 수 있습니다.\n' +
      '· 하단 독의 세력 창에서 상대를 고르고 교역을 청해 보세요. 받을 물품과 수량을 정하면 상대가 조건을 내놓습니다.\n' +
      '· 사이가 좋은 세력일수록 값을 후하게 쳐줍니다. 선물로 서먹한 사이를 풀 수도 있어요.\n' +
      '· 다만 국경을 넘는 교역이 잦으면 조정의 의심도 오릅니다. 이익과 의심을 함께 저울질해야 합니다.\n' +
      '· 습격이 닥쳤을 때 장터가 있으면 싸우지 않고 협상으로 돌려보낼 길도 생겨요.',
    // 교역 1회는 누계로 센다 — 스텝에 들어선 뒤에 오간 거래만 친다
    onStart: state => {
      const scenario = state.scenario;
      if (!scenario) return;
      if (scenario.flags.tradesBase == null) scenario.flags.tradesBase = state.lifetimeStats.tradesCompleted;
    },
    progress: state => {
      const base = flags(state).tradesBase ?? state.lifetimeStats.tradesCompleted;
      return [
        { label: '장터', current: builtCount(state, type => type === 'market'), target: 1 },
        { label: '교역', current: Math.min(1, Math.max(0, state.lifetimeStats.tradesCompleted - base)), target: 1 },
      ];
    },
  },
  {
    id: 'battle',
    title: '첫 습격',
    body:
      '나으리, 파수꾼이 강 건너에서 움직이는 무리를 보았습니다. 긴장되겠지만 우리가 준비한 목책과 사람들이 있으니, 선택지만 차분히 살피면 됩니다.\n\n' +
      '· 무리가 마을에 닿으면 어떻게 맞설지 고르게 됩니다. 목책은 길을 막고 수비병은 그 뒤에서 싸웁니다.\n' +
      '· 수비병으로 요격하면 마을 밖에서 맞서 건물 피해를 피할 수 있고, 민병을 징집하면 모두가 마을 안에서 싸웁니다.\n' +
      '· 직접 지휘를 고르면 전투 두루마리가 열려 배치와 전략을 손수 정할 수 있습니다.\n' +
      '· 꼭 싸워야 하는 것은 아닙니다. 공물을 보내거나, 장터가 있다면 협상을 걸 수도 있어요.\n' +
      '· 어느 길을 택하든 무리가 물러가고 마을이 남으면 됩니다. 그러면 제 길잡이도 끝나요.',
    // 통제 사건: 작은 무리 하나를 직접 불러 세운다. 전력은 CONFIG에서만 오고,
    // 그 뒤의 흐름(접근 → 선택지 → 전투 → 결산)은 실전과 완전히 같은 경로다.
    onDay: (state, rng) => {
      const scenario = state.scenario;
      if (!scenario || (scenario.flags.raidRepelled ?? 0) > 0) return;
      if (scenario.flags.raidSpawnDay == null) {
        if (state.pendingChoice || state.gameOver || raidInProgress(state)) return;
        spawnRaiders(state, rng, true, CONFIG.tutorial.scriptedRaidFaction, CONFIG.tutorial.scriptedRaidPower);
        if (!state.raiders && !state.pendingChoice) return; // 스폰에 실패하면 내일 다시
        scenario.flags.raidAlerted = 1;
        scenario.flags.raidSpawnDay = state.day;
        addLog(state, '파수꾼이 강 건너에서 다가오는 작은 무리를 알렸습니다. 목책 안으로 사람을 거두십시오.', 'raid', true);
        return;
      }
      // 물러갔는지는 "습격이 끝났고 마을이 남았는가"로 본다 — 이겨야만 통과하면
      // 한 번 밀린 개척지가 마지막 스텝에 갇힌다. 실전에서는 물러나는 것도 하나의 답이다.
      if (state.day <= scenario.flags.raidSpawnDay) return;
      if (raidInProgress(state) || state.gameOver) return;
      if (livingCount(state) <= 0) return;
      scenario.flags.raidRepelled = 1;
      addLog(state, '무리가 물러갔습니다. 마을은 남았습니다.', 'good', true);
    },
    progress: state => [
      flagGoal(state, '습격 경보', 'raidAlerted'),
      flagGoal(state, '격퇴', 'raidRepelled'),
    ],
  },
];

// isDone·goal은 여기 한 곳에서만 만들어진다 — 진행 배열과 완료 판정이 갈라질 수 없는 구조다.
// (전 소목표 current ≥ target ⇔ isDone. 회귀 테스트가 17스텝 전부에서 이 등가를 확인한다)
export const TUTORIAL_STEPS: readonly ScenarioStepDefinition[] = TUTORIAL_STEP_SPECS.map(spec => ({
  ...spec,
  goal: state => formatScenarioGoal(spec.progress(state)),
  isDone: state => scenarioProgressComplete(spec.progress(state)),
}));

export function scenarioActive(state: GameState): boolean {
  return state.scenario != null && !state.scenario.completed;
}

// endOfDay 게이트 — 시나리오 중에는 랜덤 사건(습격·교역·유민·종교·특수 주민·은맥·의심·계절 사건)을 잠근다.
// 새 랜덤 시스템을 endOfDay에 추가할 때는 이 게이트 뒤에 넣는 것이 규칙이다.
// 통제 사건은 이 게이트와 무관하게 스텝 훅으로만 돈다.
export function scenarioSuppressesRandomEvents(state: GameState): boolean {
  return scenarioActive(state);
}

export function currentScenarioStep(state: GameState): ScenarioStepDefinition | null {
  const scenario = state.scenario;
  if (!scenario || scenario.completed) return null;
  return TUTORIAL_STEPS[scenario.stepIndex] ?? null;
}

export function createTutorialScenarioState(goals: Record<string, number>): ScenarioState {
  return {
    id: 'tutorial',
    version: TUTORIAL_SCENARIO_VERSION,
    stepIndex: 0,
    introShown: false,
    flags: { ...goals },
  };
}

function openStepModal(state: GameState, step: ScenarioStepDefinition, index: number): void {
  state.pendingChoice = {
    kind: 'scenario',
    title: `길잡이 ${index + 1}/${TUTORIAL_STEPS.length} — ${step.title}`,
    body: step.body,
    dialogue: TUTORIAL_GUIDE_DIALOGUE,
    options: [{ id: 'ok', label: '알겠다.', effect: `해야 할 일 · ${step.goal(state)}` }],
    data: { phase: 'step', stepId: step.id },
  };
}

function openCompletionModal(state: GameState): void {
  state.pendingChoice = {
    kind: 'scenario',
    title: '길잡이 — 두 해를 넘기다',
    body:
      '나으리, 마침내 두 해를 넘겼습니다. 첫 겨울을 나고, 조정에 세공을 셈하고, 사람을 들이고, 무리를 물렸습니다. ' +
      '이제부터가 진짜 북방입니다.\n\n' +
      '잠가 두었던 일들이 모두 열립니다 — 습격은 위협도를 따라 스스로 오고, 상단과 사절이 왕래하며, ' +
      '불과 역병과 재해가 하늘의 몫으로 내립니다. 가축과 광산, 갈무리와 절임, 원정과 진법, ' +
      '그리고 보(堡)로의 승격은 아직 손대지 않은 살림입니다.\n\n' +
      '처음 보는 일이 나올 때마다 짧은 길잡이를 붙여 드릴 수 있습니다. 어느 쪽이든 뒤에 설정에서 다시 바꿀 수 있습니다.',
    dialogue: TUTORIAL_GUIDE_DIALOGUE,
    options: [
      {
        id: 'guided',
        label: '네 안내를 계속 듣겠다.',
        desc: '처음 보는 일이 생기면 연이가 짧게 설명합니다.',
        effect: '초회 길잡이 켜짐',
      },
      {
        id: 'solo',
        label: '이제부터는 내가 맡겠다.',
        desc: '추가 안내 없이 북방의 살림을 맡습니다.',
        effect: '초회 길잡이 꺼짐',
      },
    ],
    data: { phase: 'complete' },
  };
}

function skipPreparedScenarioSteps(state: GameState): void {
  const active = state.scenario;
  if (!active || active.completed) return;
  while (active.stepIndex < TUTORIAL_STEPS.length) {
    const step = TUTORIAL_STEPS[active.stepIndex];
    if (!step.skipWhen?.(state)) return;
    active.stepIndex += 1;
    active.introShown = false;
  }
}

// endOfDay 말미에서 하루 한 번 — 통제 사건을 돌리고, 스텝 안내를 열고, 목표 달성 시 다음 스텝으로 넘긴다
export function dailyScenarioTick(
  state: GameState,
  rng: () => number = makeRng(state.seed + state.day * 7919),
): void {
  const scenario = state.scenario;
  if (!scenario) return;
  if (scenario.completed) {
    if (!scenario.flags.completionShown && !state.pendingChoice) {
      scenario.flags.completionShown = 1;
      openCompletionModal(state);
    }
    return;
  }

  skipPreparedScenarioSteps(state);
  if (scenario.stepIndex >= TUTORIAL_STEPS.length) {
    scenario.completed = true;
    if (!state.pendingChoice) {
      scenario.flags.completionShown = 1;
      openCompletionModal(state);
    }
    return;
  }

  const step = TUTORIAL_STEPS[scenario.stepIndex];
  if (!step) {
    scenario.completed = true;
    return;
  }

  if (!scenario.introShown) {
    if (state.pendingChoice) return; // 결정론적 사건(세공 수거 등)과 겹치면 다음 날
    step.onStart?.(state);
    openStepModal(state, step, scenario.stepIndex);
    scenario.introShown = true;
    return;
  }

  step.onDay?.(state, rng); // 통제 사건은 목표 판정보다 먼저 — 그날의 결과가 판정에 반영된다

  if (!step.isDone(state)) return;
  addLog(state, `길잡이 — '${step.title}' 목표를 이뤘습니다.`, 'good', true);
  scenario.stepIndex += 1;
  scenario.introShown = false;
  skipPreparedScenarioSteps(state);
  if (scenario.stepIndex >= TUTORIAL_STEPS.length) {
    scenario.completed = true;
    if (!state.pendingChoice) {
      scenario.flags.completionShown = 1;
      openCompletionModal(state);
    }
    return;
  }
  // 다음 안내를 바로 연다 — 하루를 허비하지 않도록
  if (!state.pendingChoice) {
    const next = TUTORIAL_STEPS[scenario.stepIndex];
    next.onStart?.(state);
    openStepModal(state, next, scenario.stepIndex);
    scenario.introShown = true;
  }
}

export function resolveScenarioChoice(state: GameState, optionId: string): void {
  const choice = state.pendingChoice;
  if (!choice || choice.kind !== 'scenario') return;
  const phase = choice.data.phase;
  state.pendingChoice = null;
  if (phase !== 'complete') return;
  // 시나리오는 여기서 끝난다 — 붙들고 있으면 랜덤 사건 게이트가 영영 열리지 않는다.
  // 이후의 안내는 시나리오와 분리된 guides 상태가 맡는다.
  state.scenario = null;
  // 길잡이 출신이라는 표식은 시나리오가 걷힌 뒤에도 남는다 — 둘째 해 첫 세공 품목을
  // 가죽옷으로 고정해 무두장이·가죽공방 안내로 잇는 데 쓴다 (R4). 저장에 함께 실린다.
  state.tutorialGraduate = true;
  const guided = optionId !== 'solo';
  state.guides = { enabled: guided, seen: state.guides?.seen ?? {} };
  addLog(
    state,
    guided
      ? '길잡이를 마쳤습니다. 이제 모든 사건이 열립니다. 처음 보는 일에는 짧은 안내가 붙습니다.'
      : '길잡이를 마쳤습니다. 이제 모든 사건이 열립니다. 안내 없이 스스로 꾸려 가십시오.',
    'info', true,
  );
  // 두 해를 넘긴 직후 — 개칭 청원을 여기서 잇는다 (일반 게임은 첫 겨울 다음 봄 첫날)
  openGuideOnce(state, 'rename');
}
