// 튜토리얼 코치 말풍선 — 현재 스텝에서 "다음에 누를 곳"을 화면 위에 직접 가리킨다.
// 원리: 각 소목표는 얕은 곳→깊은 곳 순서의 앵커 경로(data-tut)를 갖고,
// 화면에 실제로 보이는 가장 깊은 앵커를 가리킨다. 창을 열고 닫아도 스스로 따라가고,
// 앵커가 사라진 UI 개편에도 조용히 물러날 뿐 게임을 막지 않는다.
import { useEffect, useState } from 'react';
import { currentScenarioStep } from '../game/scenario';
import { countJob } from '../game/residents';
import { isWallBuilding } from '../game/walls';
import type { GameState } from '../game/types';

interface CoachHint {
  // 이 소목표가 끝났으면 다음 힌트로 넘어간다. 없으면 스텝이 끝날 때까지 유지.
  done?: (state: GameState) => boolean;
  path: readonly { tut: string; text: string }[];
}

const STEP_HINTS: Record<string, readonly CoachHint[]> = {
  wake: [
    {
      done: state => (state.scenario?.flags.residentSelected ?? 0) > 0,
      path: [{ tut: 'dock-residents', text: '주민 창을 열고 아무 주민이나 눌러 보십시오.' }],
    },
    {
      path: [{ tut: 'time-play', text: '▶ 1배를 눌러 시간을 흐르게 하십시오.' }],
    },
  ],
  firewood: [
    {
      done: state => state.buildings.filter(building => building.built && building.type === 'woodShed').length
        >= (state.scenario?.flags.woodShedGoal ?? Infinity),
      path: [
        { tut: 'build-cat-production', text: '생산 건설 목록을 여십시오.' },
        { tut: 'build-item-woodShed', text: '장작마당을 골라 빈 땅에 배치하고 완공하십시오. 장작꾼은 이 작업장이 있어야 일합니다.' },
      ],
    },
    {
      done: state => countJob(state, 'woodSplitter') >= 1,
      path: [
        { tut: 'dock-jobs', text: '직업 배정 창을 여십시오.' },
        { tut: 'job-plus-woodSplitter', text: '장작꾼 ＋를 누르십시오. 원목을 장작으로 팹니다. 무직이 없으면 다른 직업의 −를 먼저 누르십시오.' },
      ],
    },
    {
      path: [{ tut: 'time-play', text: '시간을 흘려 장작마당의 장작꾼이 목표량까지 장작을 패게 하십시오.' }],
    },
  ],
  housing: [
    {
      done: state => state.buildings.filter(building =>
        building.type === 'hut' || building.type === 'ondol' || building.type === 'tileHouse').length
        >= (state.scenario?.flags.houseGoal ?? Infinity),
      path: [
        { tut: 'build-cat-housing', text: '주거 건설 목록을 여십시오.' },
        { tut: 'build-item-hut', text: '초가집을 고른 뒤 지도의 빈 땅을 눌러 배치하십시오.' },
      ],
    },
  ],
  sowing: [
    {
      done: state => state.buildings.some(building =>
        (building.type === 'field' || building.type === 'paddy') && !building.built),
      path: [
        { tut: 'build-cat-farming', text: '농사 건설 목록을 여십시오.' },
        { tut: 'build-item-field', text: '밭을 고른 뒤 지도에서 끌어 크기를 정해 배치하십시오.' },
      ],
    },
  ],
  hunting: [
    {
      done: state => countJob(state, 'hunter') >= 2,
      path: [
        { tut: 'dock-jobs', text: '직업 배정 창을 여십시오.' },
        { tut: 'job-plus-hunter', text: '사냥꾼 ＋를 눌러 2명 이상으로 만드십시오.' },
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
        { tut: 'job-plus-militia', text: '수비병 ＋를 눌러 1명 이상 두십시오.' },
      ],
    },
  ],
  tribute: [
    {
      path: [
        { tut: 'tribute-chip', text: '상단의 세공 칩을 눌러 조정 창을 여십시오.' },
        { tut: 'tribute-reserve', text: '＋ 또는 최대 버튼으로 요구 품목을 세공고에 비축하십시오.' },
      ],
    },
  ],
  winter: [],
};

function visibleAnchor(tut: string): HTMLElement | null {
  const el = document.querySelector(`[data-tut="${tut}"]`);
  if (!(el instanceof HTMLElement)) return null;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 ? el : null;
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
  const centerX = Math.min(window.innerWidth - 150, Math.max(150, rect.left + rect.width / 2));
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
        style={{
          left: centerX,
          ...(above
            ? { bottom: window.innerHeight - rect.top + 10 }
            : { top: rect.bottom + 10 }),
        }}
      >
        <span className="tutorial-coach-label">길잡이</span>
        {target.text}
      </div>
    </>
  );
}
