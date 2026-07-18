// 시나리오(튜토리얼) 엔진 — 일반 게임 위에 얹는 스크립트 레이어.
// 원칙:
//  - 스텝은 날짜 스크립트가 아니라 상태 술어(isDone)로 진행된다. 밸런스가 바뀌어도 스텝은 살아남는다.
//  - 랜덤 사건은 endOfDay의 게이트(scenarioSuppressesRandomEvents)로 통째로 잠근다.
//    결정론적 사건(세공 공지·수거, 날씨)은 그대로 둔다.
//  - 저장에는 진행 위치(ScenarioState)만 남긴다. 문구·조건은 코드에 있으니
//    튜토리얼 내용을 고쳐도 세이브 마이그레이션이 필요 없다. 버전이 다르면 로드 시 해제한다.
import { CONFIG } from './config';
import { addLog } from './events';
import { announceCourtTribute } from './courtTribute';
import { getDayOfSeason, getSeason } from './seasons';
import { isWallBuilding } from './walls';
import type { GameState, ScenarioState } from './types';

export const TUTORIAL_SCENARIO_VERSION = 1;

export interface ScenarioStepDefinition {
  id: string;
  title: string;                        // 상단 바 목표 칩 제목
  goal: (state: GameState) => string;   // 목표 한 줄 (칩·모달 하단)
  body: string;                         // 스텝 시작 모달 본문
  isDone: (state: GameState) => boolean;
  onStart?: (state: GameState) => void;
}

function flags(state: GameState): Record<string, number> {
  return state.scenario?.flags ?? {};
}

function builtCount(state: GameState, predicate: (type: GameState['buildings'][number]['type']) => boolean): number {
  return state.buildings.filter(building => building.built && predicate(building.type)).length;
}

function totalSownArea(state: GameState): number {
  return state.buildings
    .filter(building => building.type === 'field' || building.type === 'paddy')
    .reduce((sum, building) => sum + (building.sownArea ?? 0), 0);
}

export const TUTORIAL_STEPS: readonly ScenarioStepDefinition[] = [
  {
    id: 'wake',
    title: '변방의 아침',
    goal: () => '주민을 한 명 선택해 보고, 2일차 아침 맞이하기',
    body:
      '두만강 이북의 개척지에 도착했습니다. 이 시나리오는 첫 겨울을 넘길 때까지 기본 살림을 안내합니다.\n\n' +
      '· 지도를 끌어 주변을 둘러보고, 주민을 왼쪽 클릭으로 선택해 보십시오. 선택 창에서 직업과 상태가 보입니다.\n' +
      '· 상단 바의 ▶ 버튼으로 시간을 흐르게 하고 배속을 조절합니다.\n' +
      '· 목표는 상단 바의 목표 칩에 항상 표시됩니다.',
    isDone: state => (flags(state).residentSelected ?? 0) > 0 && state.day >= 2,
  },
  {
    id: 'firewood',
    title: '장작이 곧 목숨',
    goal: state => `장작 ${flags(state).firewoodGoal ?? 0} 확보`,
    body:
      '북방의 겨울은 장작이 떨어지는 순간부터 사람을 잡아갑니다.\n\n' +
      '· 벌목꾼이 나무를 베어 원목을 나르고, 장작꾼이 원목을 장작으로 팹니다.\n' +
      '· 하단 독의 직업 배정 창에서 인원을 조절할 수 있습니다.\n' +
      '· 인구가 늘수록 하루 장작 소모도 늘어난다는 것을 기억하십시오.',
    isDone: state => state.resources.firewood >= (flags(state).firewoodGoal ?? Infinity),
  },
  {
    id: 'housing',
    title: '지붕 아래로',
    goal: () => '초가집 1채 새로 짓기',
    body:
      '노숙하는 주민은 겨울에 얼어 죽습니다. 집은 곧 난방이자 회복입니다.\n\n' +
      '· 하단의 건설 목록(주거)에서 초가집을 골라 빈 땅에 배치하십시오.\n' +
      '· 건축가가 자재를 나르고 며칠에 걸쳐 완공합니다.\n' +
      '· 완공된 집은 주민이 알아서 입주합니다.',
    isDone: state => builtCount(state, type => type === 'hut' || type === 'ondol' || type === 'tileHouse')
      >= (flags(state).houseGoal ?? Infinity),
  },
  {
    id: 'sowing',
    title: '봄 파종',
    goal: () => '밭을 일구고 4칸 이상 파종하기',
    body:
      '봄은 짧습니다. 파종철이 지나면 그 칸은 한 해 내내 놉니다.\n\n' +
      '· 건설 목록(농사)에서 밭을 끌어 크기를 정해 배치하십시오.\n' +
      '· 농부가 밭을 갈고 씨를 뿌립니다. 가을에 거둔 곡식이 겨울 식량이 됩니다.\n' +
      '· 밭을 선택하면 작물을 고르고 농우를 붙일 수 있습니다.',
    isDone: state => totalSownArea(state) >= 4,
  },
  {
    id: 'hunting',
    title: '사냥과 갈무리',
    goal: state => `사냥꾼 2명 배정 + 고기 ${flags(state).meatGoal ?? 0} 확보`,
    body:
      '숲의 서식지에는 짐승이 삽니다. 사냥은 곡식이 떨어졌을 때의 두 번째 곳간입니다.\n\n' +
      '· 직업 배정에서 사냥꾼을 2명 이상 두십시오.\n' +
      '· 사냥꾼은 서식지 근처에서 사냥해 고기와 가죽을 가져옵니다.\n' +
      '· 고기는 상합니다. 나중에 훈연장과 움집이 생기면 갈무리를 배웁니다.',
    isDone: state =>
      state.residents.filter(resident => resident.alive && resident.job === 'hunter').length >= 2 &&
      state.resources.meat >= (flags(state).meatGoal ?? Infinity),
  },
  {
    id: 'defense',
    title: '목책과 수비병',
    goal: () => '목책을 짓고 수비병 1명 배정하기',
    body:
      '강 건너의 무리들은 약한 개척지를 노립니다. 이 시나리오에서는 습격이 오지 않지만, 실전에서는 위협도가 오르면 옵니다.\n\n' +
      '· 건설 목록(방어)에서 목책을 이어 지어 마을 어귀를 막으십시오.\n' +
      '· 직업 배정에서 수비병을 1명 이상 두십시오.\n' +
      '· 상단 바의 위협도와 방어도를 눈여겨보십시오.',
    isDone: state =>
      builtCount(state, isWallBuilding) >= 1 &&
      state.residents.some(resident => resident.alive && resident.job === 'militia'),
  },
  {
    id: 'tribute',
    title: '조정의 몫',
    goal: () => '세공고에 곡식을 조금이라도 비축하기',
    body:
      '봄에 조정이 공지한 세공은 겨울에 사자가 와서 거둡니다. 미리 떼어 두지 않으면 겨울 곳간에서 그대로 빠져나갑니다.\n\n' +
      '· 상단 바의 세공 칩을 눌러 조정 창을 여십시오.\n' +
      '· 세공고에 요구 품목을 비축하면 소비와 분리되어 잠깁니다.\n' +
      '· 다 못 채우면 명성이 깎이고, 해를 거듭해 미납하면 더 아픕니다.',
    isDone: state => Object.values(state.tributeReserve).some(amount => (amount ?? 0) > 0),
    onStart: state => {
      if (!state.courtTribute) announceCourtTribute(state);
    },
  },
  {
    id: 'winter',
    title: '첫 겨울나기',
    goal: () => `겨울 ${CONFIG.time.seasonDays}일 중 10일까지 버티기`,
    body:
      '이제 겨울입니다. 바깥일이 멈추고 장작과 곳간이 줄어드는 계절입니다.\n\n' +
      '· 장작이 떨어지면 체온이, 곳간이 비면 배가 먼저 무너집니다.\n' +
      '· 병자는 의원 격리와 약초로 다스립니다.\n' +
      '· 겨울 10일째 아침까지 버티면 시나리오가 끝납니다.',
    isDone: state => getSeason(state.day) === 'winter' && getDayOfSeason(state.day) >= 10,
  },
];

export function scenarioActive(state: GameState): boolean {
  return state.scenario != null && !state.scenario.completed;
}

// endOfDay 게이트 — 시나리오 중에는 랜덤 사건(습격·교역·유민·종교·특수 주민·은맥·의심·계절 사건)을 잠근다.
// 새 랜덤 시스템을 endOfDay에 추가할 때는 이 게이트 뒤에 넣는 것이 규칙이다.
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
      '개척지가 첫 겨울을 버텨냈습니다. 기본 살림은 이제 손에 익었을 것입니다.\n\n' +
      '계속하면 습격·교역·조정 사건이 모두 열린 일반 게임으로 이어집니다. ' +
      '남은 겨울과 다음 해부터는 진짜 북방입니다.',
    options: [{ id: 'continue', label: '이 마을로 계속한다', desc: '시나리오가 끝나고 모든 사건이 열립니다.' }],
    data: { phase: 'complete' },
  };
}

// endOfDay 말미에서 하루 한 번 — 스텝 안내를 열고, 목표 달성 시 다음 스텝으로 넘긴다
export function dailyScenarioTick(state: GameState): void {
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
  if (phase === 'complete' && optionId === 'continue') {
    state.scenario = null;
    addLog(state, '길잡이를 마쳤습니다. 이제 모든 사건이 열립니다.', 'info', true);
  }
}
