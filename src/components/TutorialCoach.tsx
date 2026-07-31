// 튜토리얼 코치 말풍선 — 현재 스텝에서 "다음에 누를 곳"을 화면 위에 직접 가리킨다.
// 원리: 각 소목표는 얕은 곳→깊은 곳 순서의 앵커 경로(data-tut)를 갖고,
// 화면에 실제로 보이는 가장 깊은 앵커를 가리킨다. 창을 열고 닫아도 스스로 따라가고,
// 앵커가 사라진 UI 개편에도 조용히 물러날 뿐 게임을 막지 않는다.
import { useEffect, useState, type CSSProperties } from 'react';
import { currentScenarioStep } from '../game/scenario';
import { countJob } from '../game/residents';
import { isWallBuilding } from '../game/walls';
import type { GameState } from '../game/types';

interface CoachHint {
  // 이 소목표가 끝났으면 다음 힌트로 넘어간다. 없으면 스텝이 끝날 때까지 유지.
  done?: (state: GameState) => boolean;
  path: readonly { tut: string; text: string }[];
}

// 스텝의 목표 수치는 scenario.flags에 주입되어 있다. 없으면 영영 못 이룬 것으로 본다.
function goal(state: GameState, key: string): number {
  return state.scenario?.flags[key] ?? Infinity;
}

function marked(state: GameState, key: string): boolean {
  return (state.scenario?.flags[key] ?? 0) > 0;
}

// 건설 힌트는 "완공"이 아니라 "배치"에서 물러난다 — 공사 중에 건설 목록을 계속 가리키면 안 된다
function placedCount(
  state: GameState,
  predicate: (type: GameState['buildings'][number]['type']) => boolean,
): number {
  return state.buildings.filter(building => predicate(building.type)).length;
}

// 실제로 씨가 들어간 면적 (scenario.ts의 totalSownArea와 같은 셈)
function sownArea(state: GameState): number {
  return state.buildings
    .filter(building => building.type === 'field' || building.type === 'paddy')
    .reduce((sum, building) => sum + (building.sownArea ?? 0), 0);
}

// 11스텝의 소목표 순서를 그대로 따른다 (scenario.ts의 TUTORIAL_STEPS와 같은 순서·같은 id).
// 가리킬 UI가 없는 소목표(관찰·대기)는 힌트를 두지 않는다 — 코치는 조용히 물러난다.
const STEP_HINTS: Record<string, readonly CoachHint[]> = {
  naming: [
    {
      done: state => marked(state, 'residentSelected'),
      path: [{ tut: 'dock-residents', text: '주민 창을 열고 아무 주민이나 눌러 이름과 몸 상태를 살피십시오.' }],
    },
    {
      done: state => marked(state, 'minimapClicked'),
      path: [{ tut: 'minimap', text: '미니맵을 눌러 먼 땅으로 시점을 옮겨 보십시오.' }],
    },
    {
      done: state => marked(state, 'speedChanged'),
      path: [{ tut: 'time-play', text: '▶ 1배를 눌러 시간을 흐르게 하십시오. 급할수록 늦추어 살피는 편이 낫습니다.' }],
    },
    {
      path: [{ tut: 'time-play', text: '시간을 흘려 이튿날 아침을 맞으십시오.' }],
    },
  ],
  working: [
    {
      done: state => marked(state, 'jobPanelOpened'),
      path: [{ tut: 'dock-jobs', text: '하단 독의 직업 배정 창을 여십시오. 누가 무슨 일을 하는지 한눈에 보입니다.' }],
    },
    {
      done: state => countJob(state, 'woodcutter') >= 1,
      path: [
        { tut: 'dock-jobs', text: '직업 배정 창을 여십시오.' },
        { tut: 'job-detail-woodcutter', text: '벌목꾼을 눌러 상세 배정을 여십시오.' },
        { tut: 'job-candidate-woodcutter', text: '아래 무직자 명단에서 벌목꾼으로 배정할 주민을 체크하십시오.' },
        { tut: 'job-assign-selected-woodcutter', text: '선택 배정을 눌러 벌목꾼을 한 사람 이상 두십시오.' },
      ],
    },
    {
      done: state => countJob(state, 'hauler') >= 1,
      path: [
        { tut: 'dock-jobs', text: '직업 배정 창을 여십시오.' },
        { tut: 'job-detail-hauler', text: '운반꾼을 눌러 상세 배정을 여십시오.' },
        { tut: 'job-candidate-hauler', text: '아래 무직자 명단에서 운반꾼으로 배정할 주민을 체크하십시오.' },
        { tut: 'job-assign-selected-hauler', text: '선택 배정을 눌러 운반꾼을 두십시오. 자원은 창고에 들어와야 곳간에 잡힙니다.' },
      ],
    },
  ],
  sowing: [
    {
      path: [
        { tut: 'build-cat-farming', text: '농사 건설 목록을 여십시오.' },
        { tut: 'build-item-field', text: '밭을 고른 뒤 지도에서 끌어 크기를 정해 배치하십시오. 갈이와 파종은 농부가 잇습니다.' },
      ],
    },
  ],
  hearth: [
    {
      done: state => placedCount(state, type => type === 'hut' || type === 'ondol' || type === 'tileHouse')
        >= goal(state, 'houseGoal'),
      path: [
        { tut: 'build-cat-housing', text: '주거 건설 목록을 여십시오.' },
        { tut: 'build-item-hut', text: '초가집을 고른 뒤 지도의 빈 땅을 눌러 배치하십시오. 노숙하는 주민은 겨울을 넘기지 못합니다.' },
      ],
    },
    {
      done: state => placedCount(state, type => type === 'woodShed') >= goal(state, 'woodShedGoal'),
      path: [
        { tut: 'build-cat-production', text: '생산 건설 목록을 여십시오.' },
        { tut: 'build-item-woodShed', text: '장작마당을 골라 빈 땅에 배치하십시오. 목재는 여기서 장작이 됩니다.' },
      ],
    },
    {
      done: state => countJob(state, 'woodSplitter') >= 1,
      path: [
        { tut: 'dock-jobs', text: '직업 배정 창을 여십시오.' },
        { tut: 'job-detail-woodSplitter', text: '장작꾼을 눌러 상세 배정을 여십시오.' },
        { tut: 'job-candidate-woodSplitter', text: '아래 무직자 명단에서 장작꾼으로 배정할 주민을 체크하십시오.' },
        { tut: 'job-assign-selected-woodSplitter', text: '선택 배정을 눌러 장작꾼으로 올리십시오. 장작꾼은 장작마당이 있어야 일합니다.' },
      ],
    },
    {
      // 병행 조건: 파종이 더딘데 농부가 없으면 밭은 영영 비어 있다
      done: state => sownArea(state) >= goal(state, 'sownAreaGoal') || countJob(state, 'farmer') >= 1,
      path: [
        { tut: 'dock-jobs', text: '직업 배정 창을 여십시오.' },
        { tut: 'job-detail-farmer', text: '농부를 눌러 상세 배정을 여십시오. 밭을 갈고 씨를 뿌리는 것은 농부의 몫입니다.' },
        { tut: 'job-candidate-farmer', text: '아래 무직자 명단에서 농부로 배정할 주민을 체크하십시오.' },
        { tut: 'job-assign-selected-farmer', text: '선택 배정을 눌러 농부를 한 사람 이상 두십시오.' },
      ],
    },
    {
      path: [{ tut: 'time-play', text: '시간을 흘려 장작을 목표량까지 쌓고, 농부가 파종을 마치게 하십시오.' }],
    },
  ],
  water: [
    {
      done: state => marked(state, 'aquiferToggled'),
      path: [{ tut: 'map-layer-aquifer', text: '수맥(水) 탭을 눌러 땅 밑 물길과 급수 상태를 드러내십시오.' }],
    },
    {
      path: [
        { tut: 'build-cat-housing', text: '주거 건설 목록을 여십시오.' },
        { tut: 'build-item-well', text: '수맥이 짙은 자리에 우물을 파십시오. 강가에 붙은 밭이 있으면 그것으로 갈음됩니다.' },
      ],
    },
  ],
  hunting: [
    {
      done: state => countJob(state, 'hunter') >= 2,
      path: [
        { tut: 'dock-jobs', text: '직업 배정 창을 여십시오.' },
        { tut: 'job-detail-hunter', text: '사냥꾼을 눌러 상세 배정을 여십시오.' },
        { tut: 'job-candidate-hunter', text: '아래 무직자 명단에서 사냥꾼으로 배정할 주민을 체크하십시오.' },
        { tut: 'job-assign-selected-hunter', text: '선택 배정을 눌러 사냥꾼을 두 사람 이상으로 만드십시오.' },
      ],
    },
    {
      path: [{ tut: 'time-play', text: '시간을 흘려 사냥꾼이 고기를 채우게 하십시오. 고기는 상하니 쟁여 두기보다 제때 먹이십시오.' }],
    },
  ],
  patient: [
    {
      done: state => countJob(state, 'herbalist') >= 1,
      path: [
        { tut: 'dock-jobs', text: '직업 배정 창을 여십시오.' },
        { tut: 'job-detail-herbalist', text: '약초꾼을 눌러 상세 배정을 여십시오. 병자가 쓰는 약초는 약초꾼이 캐 옵니다.' },
        { tut: 'job-candidate-herbalist', text: '아래 무직자 명단에서 약초꾼으로 배정할 주민을 체크하십시오.' },
        { tut: 'job-assign-selected-herbalist', text: '선택 배정을 눌러 약초꾼을 한 사람 이상 두십시오.' },
      ],
    },
    {
      path: [{ tut: 'time-play', text: '시간을 흘려 병자가 자리를 털고 일어나기를 기다리십시오.' }],
    },
  ],
  tribute: [
    {
      done: state => marked(state, 'courtWindowOpened'),
      path: [{ tut: 'tribute-chip', text: '상단의 세공 칩을 눌러 조정 창을 여십시오.' }],
    },
    {
      path: [
        { tut: 'tribute-chip', text: '상단의 세공 칩을 눌러 조정 창을 여십시오.' },
        { tut: 'court-figure', text: '북병사의 이름과 성향을 살피십시오. 올해 세공은 그 아래에 적혀 있습니다.' },
        { tut: 'tribute-reserve', text: '＋ 또는 최대 버튼으로 요구 품목을 세공고에 비축하십시오.' },
      ],
    },
  ],
  defense: [
    {
      done: state => state.buildings.some(building => isWallBuilding(building.type)),
      path: [
        { tut: 'build-cat-defense', text: '방어 건설 목록을 여십시오.' },
        { tut: 'build-item-palisade', text: '목책을 골라 마을 어귀에 이어 지으십시오.' },
      ],
    },
    {
      done: state => countJob(state, 'militia') >= 1,
      path: [
        { tut: 'dock-jobs', text: '직업 배정 창을 여십시오.' },
        { tut: 'job-detail-militia', text: '수비병을 눌러 상세 배정을 여십시오. 수비병은 싸우는 사람입니다.' },
        { tut: 'job-candidate-militia', text: '아래 무직자 명단에서 수비병으로 배정할 주민을 체크하십시오.' },
        { tut: 'job-assign-selected-militia', text: '선택 배정을 눌러 수비병을 한 사람 이상 두십시오.' },
      ],
    },
    {
      done: state => countJob(state, 'watchman') >= 1,
      path: [
        { tut: 'dock-jobs', text: '직업 배정 창을 여십시오.' },
        { tut: 'job-detail-watchman', text: '파수꾼을 눌러 상세 배정을 여십시오. 파수꾼은 지켜보아 노림 자체를 줄입니다.' },
        { tut: 'job-candidate-watchman', text: '아래 무직자 명단에서 파수꾼으로 배정할 주민을 체크하십시오.' },
        { tut: 'job-assign-selected-watchman', text: '선택 배정을 눌러 파수꾼을 한 사람 이상 두십시오.' },
      ],
    },
  ],
  // 겨울 점검 패널이 아직 없다 — 패널이 서면(M4) 그 진입점을 여기에 잇는다
  stocktake: [],
  // 마지막 스텝은 버티는 일뿐이라 가리킬 곳이 없다
  winter: [],
};

function visibleAnchor(tut: string): HTMLElement | null {
  const el = document.querySelector(`[data-tut="${tut}"]`);
  if (!(el instanceof HTMLElement)) return null;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 ? el : null;
}

const COACH_BUBBLE_WIDTH = 280;
const COACH_VIEWPORT_MARGIN = 10;
const COACH_ARROW_INSET = 10;

export function coachHorizontalPlacement(targetCenterX: number, viewportWidth: number) {
  const bubbleWidth = Math.max(1, Math.min(COACH_BUBBLE_WIDTH, viewportWidth - COACH_VIEWPORT_MARGIN * 2));
  const halfWidth = bubbleWidth / 2;
  const centerX = Math.min(
    viewportWidth - COACH_VIEWPORT_MARGIN - halfWidth,
    Math.max(COACH_VIEWPORT_MARGIN + halfWidth, targetCenterX),
  );
  const maxArrowOffset = Math.max(0, halfWidth - COACH_ARROW_INSET);
  const arrowOffset = Math.min(maxArrowOffset, Math.max(-maxArrowOffset, targetCenterX - centerX));
  return { centerX, arrowOffset };
}

export function TutorialCoach({ state }: { state: GameState }) {
  // 앵커 위치는 DOM에서 읽으므로 주기적으로 다시 잰다 (창 열림/스크롤/리사이즈 추적)
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setTick(tick => tick + 1), 400);
    return () => window.clearInterval(timer);
  }, []);

  const step = currentScenarioStep(state);
  if (!step || state.pendingChoice) return null;
  const hint = (STEP_HINTS[step.id] ?? []).find(candidate => !candidate.done?.(state));
  if (!hint) return null;

  let target: { el: HTMLElement; text: string } | null = null;
  for (const node of hint.path) {
    const el = visibleAnchor(node.tut);
    if (el) target = { el, text: node.text };
  }
  if (!target) return null;

  const rect = target.el.getBoundingClientRect();
  const above = rect.top > 110;
  const { centerX, arrowOffset } = coachHorizontalPlacement(rect.left + rect.width / 2, window.innerWidth);
  const bubbleStyle: CSSProperties & { '--coach-arrow-offset': string } = {
    left: centerX,
    '--coach-arrow-offset': `${arrowOffset}px`,
    ...(above
      ? { bottom: window.innerHeight - rect.top + 10 }
      : { top: rect.bottom + 10 }),
  };
  return (
    <>
      <div
        className="tutorial-coach-ring"
        style={{
          left: rect.left - 4,
          top: rect.top - 4,
          width: rect.width + 8,
          height: rect.height + 8,
        }}
      />
      <div
        className={`tutorial-coach-bubble ${above ? 'above' : 'below'}`}
        role="status"
        style={bubbleStyle}
      >
        <span className="tutorial-coach-label">길잡이</span>
        {target.text}
      </div>
    </>
  );
}
