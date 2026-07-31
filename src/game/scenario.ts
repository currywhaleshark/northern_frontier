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
import { announceCourtTribute } from './courtTribute';
import { openGuideOnce } from './guides';
import { makeRng } from './map';
import { residentLogName } from './residentLogName';
import { withJosa } from './josa';
import { getDayOfSeason, getSeason } from './seasons';
import { isWallBuilding } from './walls';
import { buildingTouchesWaterCoverage, naturalWaterCoverageTileSets } from './waterCoverage';
import { dailyFuelHeatNeed, winterReadiness } from './winterReadiness';
import type { GameState, JobId, Resident, ScenarioState } from './types';

export const TUTORIAL_SCENARIO_VERSION = 3;

/** 소목표 하나 — 칩에 `라벨 (현재/목표)`로 선다. 라벨은 짧은 명사, 칩은 수치 요약이다. */
export interface ScenarioGoalProgress {
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
  // 스텝 진행 중 매일 endOfDay에서 한 번 — 통제 사건 전용. 게이트와 무관하게 돈다.
  onDay?: (state: GameState, rng: () => number) => void;
}

export interface ScenarioStepDefinition extends ScenarioStepSpec {
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

function flags(state: GameState): Record<string, number> {
  return state.scenario?.flags ?? {};
}

function builtCount(state: GameState, predicate: (type: GameState['buildings'][number]['type']) => boolean): number {
  return state.buildings.filter(building => building.built && predicate(building.type)).length;
}

function jobCount(state: GameState, job: JobId): number {
  return state.residents.filter(resident => resident.alive && resident.job === job).length;
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

// 스텝 원형 — 소목표(progress)만 적는다. isDone·goal은 아래에서 이 배열로부터 파생시킨다.
const TUTORIAL_STEP_SPECS: readonly ScenarioStepSpec[] = [
  {
    id: 'naming',
    title: '이름과 첫 기록',
    body:
      '두만강 이북, 조정이 내린 땅에 닿았습니다. 오늘부터 이 이름은 조정의 문서와 주민들의 기억에 남습니다.\n\n' +
      '· 지도를 끌어 주변을 둘러보고, 미니맵을 눌러 먼 땅으로도 건너가 보십시오.\n' +
      '· 상단 바의 ▶로 시간을 흐르게 하고 배속을 바꿔 보십시오. 급할수록 늦추어 살피는 편이 낫습니다.\n' +
      '· 주민을 왼쪽 클릭으로 선택하면 이름과 직업, 몸 상태가 보입니다.\n' +
      '· 마을 중심지를 누르면 연대기가 열립니다. 이 개척지에서 일어난 일이 그곳에 적힙니다.',
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
      '사람은 저마다 맡은 일이 다릅니다. 벌목꾼이 벤 나무도 운반꾼이 창고에 들여야 비로소 비축입니다.\n\n' +
      '· 하단 독의 직업 배정 창을 여십시오. 누가 무슨 일을 하는지 한눈에 보입니다.\n' +
      '· 벌목꾼과 운반꾼을 각각 한 사람 이상 두십시오. 건축가가 있어야 집도 오릅니다.\n' +
      '· 벌목꾼은 직업을 눌러 상세 배정으로 사람을 골라 보십시오. 누구를 앉히는지 그곳에서 정합니다.\n' +
      '· 그다음부터는 직업 옆의 ＋만 눌러도 무직자 하나가 그 일로 올라갑니다. 급할 때는 이 편이 빠릅니다.\n' +
      '· 땅바닥에 쌓인 자원은 아직 살림이 아닙니다. 창고에 들어와야 곳간에 잡힙니다.',
    progress: state => [
      flagGoal(state, '직업 창', 'jobPanelOpened'),
      { label: '벌목꾼', current: jobCount(state, 'woodcutter'), target: 1 },
      { label: '운반꾼', current: jobCount(state, 'hauler'), target: 1 },
    ],
  },
  {
    id: 'sowing',
    title: '봄 파종',
    body:
      '봄은 짧습니다. 파종철이 지나면 그 칸은 한 해 내내 놉니다.\n\n' +
      '· 건설 목록(농사)에서 밭을 끌어 크기를 정해 배치하십시오.\n' +
      '· 밭을 선택하면 작물을 고르고 농우를 붙일 수 있습니다. 조·기장은 척박한 땅에서도 견딥니다.\n' +
      '· 직업 배정에서 농부를 한 사람 이상 두십시오. 밭만 그어 두면 땅은 그대로 놉니다.\n' +
      '· 배치까지가 그대의 몫입니다. 갈이와 파종은 농부가 이어가니, 그동안 다른 일을 보십시오.',
    progress: state => [
      { label: '밭 배치', current: placedPlotArea(state), target: goalTarget(state, 'sownAreaGoal') },
      { label: '농부', current: jobCount(state, 'farmer'), target: 1 },
    ],
  },
  {
    id: 'hearth',
    title: '집과 장작',
    body:
      '북방의 겨울은 장작이 떨어지는 순간부터 사람을 잡아갑니다. 노숙하는 주민은 그 전에 얼어 죽습니다.\n\n' +
      '· 목재와 장작은 다릅니다. 벌목꾼이 벤 것은 목재이고, 장작마당에서 장작꾼이 패야 땔감이 됩니다. ' +
      '원료를 가공해 비축하는 이 문법은 앞으로도 되풀이됩니다.\n' +
      '· 건설 목록(주거)에서 초가집을, (생산)에서 장작마당을 지으십시오.\n' +
      '· 두 공사는 건축가가 맡습니다. 직업 배정에서 건축가를 한 사람 이상 두십시오 — ' +
      '건축가가 없으면 터만 잡힌 채 공사가 오르지 않습니다.\n' +
      '· 직업 배정에서 장작꾼도 한 사람 이상 두십시오. 장작꾼은 장작마당이 있어야 일합니다.\n' +
      '· 그동안 농부는 밭을 갈고 씨를 뿌립니다. 파종이 더디거든 농부가 모자란 것입니다.',
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
      '사람도 짐승도 물을 먹습니다. 물이 닿지 않는 집에는 병이 돕니다.\n\n' +
      '· 지도의 수맥(水) 탭을 켜 보십시오. 땅 밑 물길과 급수 상태가 색으로 드러납니다.\n' +
      '· 수맥 위에 우물을 파면 둘레의 집과 작업장이 물을 받습니다. 수맥 한복판일수록 물이 넉넉합니다.\n' +
      '· 강가에 붙은 밭은 절로 물을 먹습니다. 뒤에 농수로를 이어 내륙에도 논을 열 수 있으나, ' +
      '그것은 보(堡)로 오른 뒤의 일입니다.',
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
      '숲의 서식지에는 짐승이 삽니다. 사냥은 곡식이 떨어졌을 때의 두 번째 곳간입니다.\n\n' +
      '· 직업 배정에서 사냥꾼을 두 사람 이상 두십시오.\n' +
      '· 사냥꾼은 서식지 근처에서 사냥해 고기와 가죽을 가져옵니다.\n' +
      '· 고기는 상합니다. 여름에는 더 빨리 상하니 쟁여 두기보다 제때 먹이는 편이 낫습니다.\n' +
      '· 뒤에 훈연장과 움집, 독을 갖추면 말리고 절여 겨울까지 두는 법을 배웁니다.',
    progress: state => [
      { label: '사냥꾼', current: jobCount(state, 'hunter'), target: 2 },
      { label: '고기', current: state.resources.meat, target: goalTarget(state, 'meatGoal') },
    ],
  },
  {
    id: 'patient',
    title: '첫 병자',
    body:
      '앓아누운 이가 생겼습니다. 병자는 일을 못 하고, 곳간의 약초를 축내며, 그대로 두면 목숨을 잃습니다.\n\n' +
      '· 약초는 약초꾼의 몫입니다. 숲을 돌며 약초와 산물을 캐어 곳간에 비축합니다.\n' +
      '· 그 약초를 병자가 매일 조금씩 씁니다. 뒤에 의원을 세우면 의원(醫員)도 같은 약초로 치료합니다.\n' +
      '· 건설 목록(생산)에서 약초막을 숲 가까이 세우십시오. 약초꾼이 그곳에 짐을 부려 채집 왕복이 줄어듭니다.\n' +
      '· 직업 배정에서 약초꾼 옆의 ＋를 눌러 한 사람 두십시오.\n' +
      '· 약초가 있으면 회복이 빠릅니다. 떨어지면 몸이 스스로 이겨 내기를 기다릴 수밖에 없습니다.\n' +
      '· 굶주림과 추위는 병을 부릅니다. 밥과 아궁이가 곧 약입니다.\n' +
      '· 뒤에 진(鎭)으로 오르면 의원을 세워 병자를 돌보고 역병을 격리합니다.',
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
    // 약초막 완공을 함께 요구한다 (R2-2). 약초꾼은 약초막이 없어도 숲에서 캐 오지만
    // (`agents.ts` herbalistTick — 약초막은 depositExtra, 곧 가까운 하역처다),
    // 거점을 세워 두어야 왕복이 줄어 병자에게 약초가 제때 닿는다. 직업마다 거점이 있다는
    // 문법을 여기서 한 번 더 밟게 하려고 배치가 아니라 완공을 조건으로 둔다.
    progress: state => {
      const patient = scriptedPatient(state);
      return [
        { label: '약초막', current: builtCount(state, type => type === 'herbHut'), target: 1 },
        { label: '약초꾼', current: jobCount(state, 'herbalist'), target: 1 },
        // 병자를 붙이지 못했거나 기록이 사라지면 붙들지 않는다
        boolGoal('병자 회복', !patient || !patient.alive || !patient.sick),
      ];
    },
  },
  {
    id: 'tribute',
    title: '조정의 몫',
    body:
      '봄에 조정이 공지한 세공은 겨울에 사자가 와서 거둡니다. 미리 떼어 두지 않으면 겨울 곳간에서 그대로 빠져나갑니다.\n\n' +
      '· 상단 바의 세공 칩을 눌러 조정 창을 여십시오. 북병사(北兵使)의 이름과 성향이 그곳에 있습니다.\n' +
      '· 세공고에 요구 품목을 비축하면 소비와 분리되어 잠깁니다.\n' +
      '· 다 못 채우면 명성이 깎이고, 해를 거듭해 미납하면 더 아픕니다.\n' +
      '· 조정은 개척지가 홀로 강해지는 것도 눈여겨봅니다. 화약을 스스로 만들고 월경 교역이 잦으면 ' +
      '의심이 오릅니다 — 길잡이 동안에는 오르지 않으니 문법만 익혀 두십시오.',
    progress: state => [
      flagGoal(state, '조정 창', 'courtWindowOpened'),
      boolGoal('세공고 비축', Object.values(state.tributeReserve).some(amount => (amount ?? 0) > 0)),
    ],
    onStart: state => {
      if (!state.courtTribute) announceCourtTribute(state);
    },
  },
  {
    id: 'defense',
    title: '방어의 기초',
    body:
      '강 건너의 무리들은 약한 개척지를 노립니다. 길잡이 동안에는 습격이 오지 않으나, 실전에서는 위협도가 오르면 옵니다.\n\n' +
      '· 건설 목록(방어)에서 목책을 이어 지어 마을 어귀를 막으십시오.\n' +
      '· 수비병은 싸우는 사람이고, 파수꾼은 지켜보는 사람입니다. 파수꾼은 위협을 미리 알리고 노림 자체를 줄입니다.\n' +
      '· 직업 배정에서 수비병과 파수꾼을 각각 한 사람 이상 두십시오.\n' +
      '· 봉수대와 망루는 뒤에 배웁니다. 지금은 목책과 사람이면 됩니다.',
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
      '겨울에 들기 전에 곳간을 셈해야 합니다. 겨울에도 채울 수는 있으나 ' +
      '폭설과 혹한에 일손이 묶이는 날이 잦으니, 미리 쌓아 두는 편이 안전합니다.\n\n' +
      '· 겨울 점검을 열어 식량과 장작이 며칠분인지 확인하십시오.\n' +
      '· 일분은 지금 인구가 겨울 소모로 먹고 땔 때의 셈입니다. 인구가 늘면 그만큼 줄어듭니다.\n' +
      '· 섶과 숯도 땔감으로 함께 셉니다. 숯은 같은 부피로 더 오래 탑니다.\n' +
      '· 넉넉할수록 겨울이 편합니다. 혹한이 닥친 날은 하루 소모가 껑충 뜁니다.',
    progress: state => {
      const readiness = winterReadiness(state);
      return [
        flagGoal(state, '겨울 점검', 'checklistOpened'),
        { label: '식량 일분', current: readiness.foodDays, target: goalTarget(state, 'foodDaysGoal') },
        { label: '장작 일분', current: readiness.firewoodDays, target: goalTarget(state, 'firewoodDaysGoal') },
      ];
    },
  },
  {
    id: 'winter',
    title: '첫 겨울',
    body:
      '이제 겨울입니다. 바깥일이 멈추고 장작과 곳간이 줄어드는 계절입니다.\n\n' +
      '· 장작이 떨어지면 체온이, 곳간이 비면 배가 먼저 무너집니다.\n' +
      '· 병자는 약초로 다스리고, 옷이 모자라면 체온이 더 빨리 식습니다.\n' +
      `· 겨울 ${CONFIG.tutorial.winterEndDayOfSeason}일째 아침까지 버티면 길잡이가 끝납니다.`,
    // 통제 사건: 기후는 건드리지 않고 그날의 장작 소모만 올린다 (계획 §2-다 A안)
    onDay: state => {
      const scenario = state.scenario;
      if (!scenario || (scenario.flags.coldSnapWarned ?? 0) > 0) return;
      if (getSeason(state.day) !== 'winter') return;
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
    // 겨울에 들기 전에는 0일차 — 계절이 바뀌어야 셈이 오른다
    progress: state => [{
      label: '겨울',
      current: getSeason(state.day) === 'winter' ? getDayOfSeason(state.day) : 0,
      target: CONFIG.tutorial.winterEndDayOfSeason,
    }],
  },
];

// isDone·goal은 여기 한 곳에서만 만들어진다 — 진행 배열과 완료 판정이 갈라질 수 없는 구조다.
// (전 소목표 current ≥ target ⇔ isDone. 회귀 테스트가 11스텝 전부에서 이 등가를 확인한다)
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

// UI 상호작용 플래그 (예: App에서 주민 선택 시 residentSelected)
export function markScenarioFlag(state: GameState, key: string): void {
  if (!state.scenario || state.scenario.completed) return;
  state.scenario.flags[key] = 1;
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
    options: [{ id: 'ok', label: '알겠소', desc: `목표: ${step.goal(state)}` }],
    data: { phase: 'step', stepId: step.id },
  };
}

function openCompletionModal(state: GameState): void {
  state.pendingChoice = {
    kind: 'scenario',
    title: '길잡이 — 첫 겨울을 넘기다',
    body:
      '첫 겨울은 끝났지만 북방은 이제부터입니다.\n\n' +
      '잠가 두었던 일들이 이제 모두 열립니다 — 강 건너의 습격과 상단의 왕래, 불과 역병과 재해, ' +
      '세력의 사절까지. 가축과 광산, 갈무리와 절임, 원정과 진법은 아직 손대지 않은 살림입니다.\n\n' +
      '처음 보는 일이 나올 때마다 짧은 길잡이를 붙여 드릴 수 있습니다. 어느 쪽이든 뒤에 설정에서 다시 바꿀 수 있습니다.',
    options: [
      { id: 'guided', label: '계속해서 안내받는다', desc: '처음 보는 일에 짧은 안내가 붙습니다.' },
      { id: 'solo', label: '이제 스스로 운영한다', desc: '안내 없이 북방의 살림을 맡습니다.' },
    ],
    data: { phase: 'complete' },
  };
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
  const guided = optionId !== 'solo';
  state.guides = { enabled: guided, seen: state.guides?.seen ?? {} };
  addLog(
    state,
    guided
      ? '길잡이를 마쳤습니다. 이제 모든 사건이 열립니다. 처음 보는 일에는 짧은 안내가 붙습니다.'
      : '길잡이를 마쳤습니다. 이제 모든 사건이 열립니다. 안내 없이 스스로 꾸려 가십시오.',
    'info', true,
  );
  // 첫 겨울을 넘긴 직후 — 개칭 청원을 여기서 잇는다 (일반 게임은 겨울 다음 봄 첫날)
  openGuideOnce(state, 'rename');
}
