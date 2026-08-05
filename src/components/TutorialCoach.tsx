// 튜토리얼 코치 말풍선 — 현재 스텝에서 "다음에 누를 곳"을 화면 위에 직접 가리킨다.
// 원리: 각 소목표는 얕은 곳→깊은 곳 순서의 앵커 경로(data-tut)를 갖고,
// 화면에 실제로 보이는 가장 깊은 앵커를 가리킨다. 창을 열고 닫아도 스스로 따라가고,
// 앵커가 사라진 UI 개편에도 조용히 물러날 뿐 게임을 막지 않는다.
import { useEffect, useState, type CSSProperties } from 'react';
import { buildingFootprintDims } from '../game/buildings';
import {
  currentScenarioStep, TUTORIAL_GUIDE_DIALOGUE, tutorialTributeCanFillFromStock,
  tutorialTributeNeedsTannery, tutorialTributePrepared,
} from '../game/scenario';
import { countJob } from '../game/residents';
import { isWallBuilding } from '../game/walls';
import type { GameState } from '../game/types';
import { DialoguePortrait } from './DialoguePortrait';

interface CoachHint {
  // 이 소목표가 끝났으면 다음 힌트로 넘어간다. 없으면 스텝이 끝날 때까지 유지.
  done?: (state: GameState) => boolean;
  path: readonly { tut: string; text: string }[];
}

// 화면을 가리키는 짧은 말은 큰 대화보다 가볍게 들려야 한다. 원문의 조작 정보는
// 그대로 두고 딱딱한 명령형 어미만 연이의 다정한 존댓말로 바꾼다.
export function tutorialCoachVoice(text: string): string {
  const endings: readonly [string, string][] = [
    ['여십시오.', '열어 보세요.'],
    ['누르십시오.', '눌러 보세요.'],
    ['두십시오.', '두세요.'],
    ['올리십시오.', '올려 주세요.'],
    ['만드십시오.', '만들어 주세요.'],
    ['배정하십시오.', '배정해 주세요.'],
    ['배치하십시오.', '배치해 주세요.'],
    ['완공하십시오.', '완공해 주세요.'],
    ['기다리십시오.', '기다려 주세요.'],
    ['흘리십시오.', '흘려 보세요.'],
    ['드러내십시오.', '드러내 보세요.'],
    ['정하십시오.', '정해 보세요.'],
    ['살피십시오.', '살펴보세요.'],
    ['먹이십시오.', '먹여 주세요.'],
    ['하십시오.', '해 주세요.'],
  ];
  return endings.reduce((line, [formal, friendly]) => line.split(formal).join(friendly), text);
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

function builtCount(state: GameState, type: GameState['buildings'][number]['type']): number {
  return state.buildings.filter(building => building.built && building.type === type).length;
}

function assignedJobCount(
  state: GameState,
  job: GameState['residents'][number]['job'],
  type: GameState['buildings'][number]['type'],
): number {
  return state.residents.filter(resident => {
    if (!resident.alive || resident.job !== job || resident.assignedBuildingId == null) return false;
    const building = state.buildings.find(candidate => candidate.id === resident.assignedBuildingId);
    return building?.built === true && building.type === type;
  }).length;
}

// 배치만 된 밭 면적 (scenario.ts의 placedPlotArea와 같은 셈)
function placedPlotArea(state: GameState): number {
  return state.buildings
    .filter(building => building.type === 'field' || building.type === 'paddy')
    .reduce((sum, building) => {
      const { w, h } = buildingFootprintDims(building);
      return sum + w * h;
    }, 0);
}

// 실제로 씨가 들어간 면적 (scenario.ts의 totalSownArea와 같은 셈)
function sownArea(state: GameState): number {
  return state.buildings
    .filter(building => building.type === 'field' || building.type === 'paddy')
    .reduce((sum, building) => sum + (building.sownArea ?? 0), 0);
}

// 17스텝의 소목표 순서를 그대로 따른다 (scenario.ts의 TUTORIAL_STEPS와 같은 순서·같은 id).
// 가리킬 UI가 없는 소목표(관찰·대기)는 힌트를 두지 않는다 — 코치는 조용히 물러난다.
//
// 직업 배정 안내는 이원화되어 있다 (R2-1). 벌목장 터 직후 건축가는 빠른 ＋ 경로로 먼저 두고,
// 1단계 벌목꾼 한 번만 상세 4단 경로
// (`job-detail-*` → 후보 체크 → 선택 배정)로 가르쳐 상세 창의 존재를 보여주고,
// 그 뒤의 모든 직업은 빠른 배정 2단 경로(`dock-jobs` → `job-plus-{job}`)로 안내한다.
// ＋ 버튼이 접혀 보이지 않으면 코치는 얕은 앵커(`dock-jobs`)로 스스로 물러난다.
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
      done: state => placedCount(state, type => type === 'lumberCamp') >= 1,
      path: [
        { tut: 'build-cat-production', text: '생산 건설 목록을 여십시오.' },
        { tut: 'build-item-lumberCamp', text: '벌목장을 골라 숲 가까운 빈 땅에 배치하십시오.' },
      ],
    },
    {
      done: state => countJob(state, 'builder') >= 1,
      path: [
        { tut: 'dock-jobs', text: '직업 배정 창을 여십시오.' },
        {
          tut: 'job-plus-builder',
          text: '벌목장 터를 잡았으니 바로 건축가 옆의 ＋를 눌러 한 사람 두십시오. 건축가가 없으면 공사가 오르지 않습니다.',
        },
      ],
    },
    {
      done: state => countJob(state, 'woodcutter') >= 1,
      path: [
        { tut: 'dock-jobs', text: '직업 배정 창을 여십시오.' },
        { tut: 'job-detail-woodcutter', text: '벌목꾼을 눌러 상세 배정을 여십시오.' },
        { tut: 'job-candidate-woodcutter', text: '아래 무직자 명단에서 벌목꾼으로 배정할 주민을 체크하십시오.' },
        {
          tut: 'job-assign-selected-woodcutter',
          text: '선택 배정을 눌러 벌목꾼을 한 사람 이상 두십시오. 사람을 골라 직업에 넣고 싶을 때는 이 상세 배정을 씁니다.',
        },
      ],
    },
    {
      done: state => builtCount(state, 'lumberCamp') >= 1,
      path: [{ tut: 'time-play', text: '건축가를 두고 시간을 흘려 벌목장을 완공하십시오.' }],
    },
    {
      done: state => assignedJobCount(state, 'woodcutter', 'lumberCamp') >= 1,
      path: [
        { tut: 'map-view', text: '지도에서 완공된 벌목장을 눌러 선택해 보세요.' },
        {
          tut: 'building-worker-slot-lumberCamp',
          text: '이제 빈 작업 슬롯을 눌러 벌목꾼을 배정하십시오.',
        },
      ],
    },
    {
      // 여기서부터는 상세 창을 거치지 않는다 — ＋ 한 번이 무직자 하나를 그 자리에서 올린다
      done: state => countJob(state, 'hauler') >= 1,
      path: [
        { tut: 'dock-jobs', text: '직업 배정 창을 여십시오.' },
        {
          tut: 'job-plus-hauler',
          text: '운반꾼 옆의 ＋를 눌러 한 사람 올리십시오. 앞으로는 이 ＋만으로 빠르게 배정하면 됩니다. '
            + '자원은 창고에 들어와야 곳간에 잡힙니다.',
        },
      ],
    },
  ],
  sowing: [
    {
      done: state => placedPlotArea(state) >= goal(state, 'sownAreaGoal'),
      path: [
        { tut: 'build-cat-farming', text: '농사 건설 목록을 여십시오.' },
        { tut: 'build-item-field', text: '밭을 고른 뒤 지도에서 끌어 크기를 정해 배치하십시오. 갈이와 파종은 농부가 잇습니다.' },
      ],
    },
    {
      // 밭만 그어 두면 땅은 논다 — 전원 무직으로 출발하므로 농부는 여기서 처음 배정한다
      done: state => countJob(state, 'farmer') >= 1,
      path: [
        { tut: 'dock-jobs', text: '직업 배정 창을 여십시오.' },
        {
          tut: 'job-plus-farmer',
          text: '농부 옆의 ＋를 눌러 한 사람 이상 두십시오. 밭을 갈고 씨를 뿌리는 것은 농부의 몫이며, 파종철은 짧습니다.',
        },
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
      // 앞 단계에서 둔 건축가를 그새 물렸을 때만 다시 보이는 구제 힌트다
      done: state => countJob(state, 'builder') >= 1,
      path: [
        { tut: 'dock-jobs', text: '직업 배정 창을 여십시오.' },
        {
          tut: 'job-plus-builder',
          text: '벌목장을 지은 건축가를 다른 일로 돌렸다면 다시 ＋로 한 사람 두십시오. 초가집과 장작마당도 건축가가 짓습니다.',
        },
      ],
    },
    {
      done: state => countJob(state, 'woodSplitter') >= 1,
      path: [
        { tut: 'dock-jobs', text: '직업 배정 창을 여십시오.' },
        {
          tut: 'job-plus-woodSplitter',
          text: '장작꾼 옆의 ＋를 눌러 한 사람 이상 올리십시오. 장작꾼은 장작마당이 있어야 일합니다.',
        },
      ],
    },
    {
      // 병행 조건: 파종이 더딘데 농부가 없으면 밭은 영영 비어 있다
      done: state => sownArea(state) >= goal(state, 'sownAreaGoal') || countJob(state, 'farmer') >= 1,
      path: [
        { tut: 'dock-jobs', text: '직업 배정 창을 여십시오.' },
        {
          tut: 'job-plus-farmer',
          text: '농부 옆의 ＋를 눌러 한 사람 이상 두십시오. 밭을 갈고 씨를 뿌리는 것은 농부의 몫입니다.',
        },
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
      done: state => placedCount(state, type => type === 'huntLodge') >= 1,
      path: [
        { tut: 'build-cat-production', text: '생산 건설 목록을 여십시오.' },
        { tut: 'build-item-huntLodge', text: '사냥막을 골라 서식지 가까운 숲에 배치하십시오.' },
      ],
    },
    {
      done: state => builtCount(state, 'huntLodge') >= 1,
      path: [{ tut: 'time-play', text: '시간을 흘려 사냥막을 완공하십시오.' }],
    },
    {
      done: state => countJob(state, 'hunter') >= 2,
      path: [
        { tut: 'dock-jobs', text: '직업 배정 창을 여십시오.' },
        { tut: 'job-plus-hunter', text: '사냥꾼 옆의 ＋를 두 번 눌러 사냥꾼을 두 사람 이상으로 만드십시오.' },
      ],
    },
    {
      done: state => assignedJobCount(state, 'hunter', 'huntLodge') >= 2,
      path: [
        { tut: 'map-view', text: '지도에서 완공된 사냥막을 눌러 선택해 보세요.' },
        {
          tut: 'building-worker-slot-huntLodge',
          text: '이제 빈 작업 슬롯을 두 번 눌러 사냥꾼을 배정하십시오.',
        },
      ],
    },
    {
      path: [{ tut: 'time-play', text: '시간을 흘려 사냥꾼이 고기를 채우게 하십시오. 고기는 상하니 쟁여 두기보다 제때 먹이십시오.' }],
    },
  ],
  patient: [
    {
      // 약초막은 약초꾼의 거점이다 — 숲 가까이 두면 짐을 그곳에 부려 왕복이 줄어든다
      done: state => placedCount(state, type => type === 'herbHut') >= 1,
      path: [
        { tut: 'build-cat-production', text: '생산 건설 목록을 여십시오.' },
        { tut: 'build-item-herbHut', text: '약초막을 골라 숲 가까운 빈 땅에 배치하십시오. 약초꾼이 그곳에 약초를 부립니다.' },
      ],
    },
    {
      // 3단계에서 둔 건축가를 그새 물렸다면 터만 잡힌 채 공사가 오르지 않는다 — 정상 진행에서는 뜨지 않는다
      done: state => countJob(state, 'builder') >= 1
        || placedCount(state, type => type === 'herbHut') === 0
        || state.buildings.some(building => building.type === 'herbHut' && building.built),
      path: [
        { tut: 'dock-jobs', text: '직업 배정 창을 여십시오.' },
        {
          tut: 'job-plus-builder',
          text: '건축가 옆의 ＋를 눌러 한 사람 두십시오. 건축가가 없으면 약초막은 터만 잡힌 채 오르지 않습니다.',
        },
      ],
    },
    {
      done: state => countJob(state, 'herbalist') >= 1,
      path: [
        { tut: 'dock-jobs', text: '직업 배정 창을 여십시오.' },
        {
          tut: 'job-plus-herbalist',
          text: '약초꾼 옆의 ＋를 눌러 한 사람 이상 두십시오. 병자가 쓰는 약초는 약초꾼이 숲에서 캐 옵니다.',
        },
      ],
    },
    {
      done: state => assignedJobCount(state, 'herbalist', 'herbHut') >= 1,
      path: [
        { tut: 'map-view', text: '지도에서 완공된 약초막을 눌러 선택해 보세요.' },
        {
          tut: 'building-worker-slot-herbHut',
          text: '이제 빈 작업 슬롯을 눌러 약초꾼을 배정하십시오.',
        },
      ],
    },
    {
      path: [{ tut: 'time-play', text: '시간을 흘려 병자가 자리를 털고 일어나기를 기다리십시오.' }],
    },
  ],
  // R4: 세공 스텝은 사라졌다 — 첫 해에는 조정이 거두지 않으므로, 세공·세공고·북병사는
  // 둘째 해 봄 첫 파발에서 길잡이 모듈(tribute)이 맡는다.
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
        { tut: 'job-plus-militia', text: '수비병 옆의 ＋를 눌러 한 사람 이상 두십시오. 수비병은 싸우는 사람입니다.' },
      ],
    },
    {
      done: state => countJob(state, 'watchman') >= 1,
      path: [
        { tut: 'dock-jobs', text: '직업 배정 창을 여십시오.' },
        { tut: 'job-plus-watchman', text: '파수꾼 옆의 ＋를 눌러 한 사람 이상 두십시오. 파수꾼은 지켜보아 노림 자체를 줄입니다.' },
      ],
    },
  ],
  stocktake: [
    {
      done: state => marked(state, 'checklistOpened'),
      path: [{
        tut: 'checklist-open',
        text: '상단의 겨울 점검을 눌러 곳간이 며칠분인지 확인하십시오. 식량 30일분과 땔감 24일분은 '
          + '넉넉함의 권장선이며, 부족해도 길잡이 진행을 막지는 않습니다.',
      }],
    },
  ],
  // 첫 겨울은 버티는 일뿐이라 가리킬 곳이 없다 (R5에서 완료 지점이 아니라 중간 스텝이 되었다)
  winter: [],

  // ── 둘째 해 (R5) ──
  tribute: [
    {
      done: state => state.courtTribute != null,
      path: [{ tut: 'time-play', text: '시간을 흘려 봄 첫날의 파발을 기다리십시오. 북병사의 사자가 올해 요구를 알립니다.' }],
    },
    {
      done: state => marked(state, 'courtWindowOpened'),
      path: [{ tut: 'dock-court', text: '하단 독의 조정 창을 여십시오. 북병사의 이름과 성향, 올해 세공이 그곳에 있습니다.' }],
    },
    {
      // 얕은 앵커(독 아이콘) → 깊은 앵커(창 안의 세공고 칸). 창이 닫혀 있으면 코치가 스스로 물러난다
      done: state => tutorialTributeNeedsTannery(state),
      path: [
        { tut: 'dock-court', text: '조정 창을 여십시오.' },
        { tut: 'tribute-reserve', text: '세공고에 올해 요구 품목을 옮겨 두십시오. 넣어 둔 몫은 겨울 소비와 분리되어 잠깁니다.' },
      ],
    },
  ],
  tanning: [
    {
      done: state => placedCount(state, type => type === 'tannery') >= 1,
      path: [
        { tut: 'build-cat-production', text: '생산 건설 목록을 여십시오.' },
        { tut: 'build-item-tannery', text: '가죽공방을 골라 빈 땅에 배치하십시오. 가죽옷은 여기서 나옵니다.' },
      ],
    },
    {
      done: state => countJob(state, 'tanner') >= 1,
      path: [
        { tut: 'dock-jobs', text: '직업 배정 창을 여십시오.' },
        {
          tut: 'job-plus-tanner',
          text: '무두장이 옆의 ＋를 눌러 한 사람 두십시오. 가죽 2장이 옷 한 벌이 됩니다.',
        },
      ],
    },
    {
      done: state => tutorialTributeCanFillFromStock(state),
      path: [{ tut: 'time-play', text: '시간을 흘려 무두장이가 가죽옷을 짓게 하십시오. 가죽이 끊기거든 사냥꾼을 더 두십시오.' }],
    },
    {
      done: state => tutorialTributePrepared(state),
      path: [
        { tut: 'dock-court', text: '가죽옷이 마련되었습니다. 조정 창을 다시 여십시오.' },
        { tut: 'tribute-reserve', text: '가죽옷을 세공고에 요구량만큼 옮겨 두십시오.' },
      ],
    },
  ],
  // 유민은 스텝이 직접 부르는 통제 사건이다 — 가리킬 곳은 시간뿐이고, 판단은 제안 창에서 한다
  immigrants: [
    {
      path: [{ tut: 'time-play', text: '시간을 흘리십시오. 떠돌던 이들이 성책 앞에 닿으면 받아들일지 정하게 됩니다.' }],
    },
  ],
  minerals: [
    {
      done: state => marked(state, 'oreToggled'),
      path: [{ tut: 'map-layer-ore', text: '광맥(鑛) 탭을 눌러 땅속에 묻힌 자리를 드러내십시오.' }],
    },
    {
      done: state => placedCount(state, type => type === 'mine') >= 1,
      path: [
        { tut: 'build-cat-production', text: '생산 건설 목록을 여십시오.' },
        { tut: 'build-item-mine', text: '노두가 반경 안에 들도록 주변 빈 땅에 채광장을 배치하십시오.' },
      ],
    },
    {
      done: state => builtCount(state, 'mine') >= 1,
      path: [{ tut: 'time-play', text: '시간을 흘려 채광장을 완공하십시오.' }],
    },
    {
      done: state => countJob(state, 'miner') >= 1,
      path: [
        { tut: 'dock-jobs', text: '직업 배정 창을 여십시오.' },
        {
          tut: 'job-plus-miner',
          text: '채광꾼 옆의 ＋를 눌러 한 사람 두십시오.',
        },
      ],
    },
    {
      done: state => assignedJobCount(state, 'miner', 'mine') >= 1,
      path: [
        { tut: 'map-view', text: '지도에서 완공된 채광장을 눌러 선택해 보세요.' },
        {
          tut: 'building-worker-slot-mine',
          text: '이제 빈 작업 슬롯을 눌러 채광꾼을 배정하십시오.',
        },
      ],
    },
    {
      path: [{ tut: 'time-play', text: '시간을 흘려 배정된 채광꾼이 영역 안의 돌과 철을 캐 오게 하십시오.' }],
    },
  ],
  smithy: [
    {
      done: state => placedCount(state, type => type === 'smithy') >= 1,
      path: [
        { tut: 'build-cat-production', text: '생산 건설 목록을 여십시오.' },
        { tut: 'build-item-smithy', text: '대장간을 골라 빈 땅에 배치하십시오. 철과 목재가 도구가 되는 곳입니다.' },
      ],
    },
    {
      done: state => countJob(state, 'smith') >= 1,
      path: [
        { tut: 'dock-jobs', text: '직업 배정 창을 여십시오.' },
        {
          tut: 'job-plus-smith',
          text: '대장장이 옆의 ＋를 눌러 한 사람 두십시오. 대장장이가 창고에서 철과 목재를 가져옵니다.',
        },
      ],
    },
    {
      path: [{ tut: 'time-play', text: '시간을 흘려 대장간이 도구를 짓게 하십시오. 철이 마르면 망치질이 멎습니다.' }],
    },
  ],
  market: [
    {
      done: state => placedCount(state, type => type === 'market') >= 1,
      path: [
        { tut: 'build-cat-special', text: '특수 건설 목록을 여십시오.' },
        { tut: 'build-item-market', text: '장터를 골라 빈 땅에 배치하십시오. 장터가 서야 상단과 왕래가 열립니다.' },
      ],
    },
    {
      path: [{
        tut: 'dock-factions',
        text: '세력 창을 열어 사이가 좋은 상대에게 교역을 청하십시오. 받을 물품과 수량을 정하면 조건이 나옵니다.',
      }],
    },
  ],
  // 마지막 스텝 — 무리가 닿으면 선택 창이 열리고, 코치는 모달 앞에서 물러난다
  battle: [
    {
      path: [{ tut: 'time-play', text: '시간을 흘리십시오. 무리가 마을에 닿으면 어떻게 맞설지 고르게 됩니다.' }],
    },
  ],
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
        <DialoguePortrait dialogue={TUTORIAL_GUIDE_DIALOGUE} compact />
        <span className="tutorial-coach-copy">
          <span className="tutorial-coach-label">{TUTORIAL_GUIDE_DIALOGUE.speaker}</span>
          {tutorialCoachVoice(target.text)}
        </span>
      </div>
    </>
  );
}
