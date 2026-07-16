# UI 재구성 핸드오프 — 2026-07-16

## 저장소 상태

- 저장소: `https://github.com/currywhaleshark/northern_frontier`
- 브랜치: `codex/ui-reorganization`
- 이 문서 작성 직전 HEAD: `a018733 feat: finalize overlay layout`
- 구현 계획: `docs/superpowers/plans/2026-07-14-ui-reorganization.md`
- 전투 판정·명령 효과·자동 표적 로직은 이번 UI 재구성에서 변경하지 않았다.

## 완료된 작업

### 상단 자원바

- 자원을 묶음 칩과 지표로 재구성하고, 사용자가 별표한 개별 자원을 상단에 노출하는 `uiPrefs` 기반 구조를 추가했다.
- 묶음 팝오버는 hover뿐 아니라 focus와 클릭으로 열리며 키보드·터치 접근성 속성을 유지한다.
- 숨은 품목의 부족 상태도 묶음 칩과 팝오버에 표시한다.

### 하단 건설 메뉴와 일괄 작업자 배정

- 기존 좌측 건설 메뉴를 좌하단 아이콘 바와 비모달 드로어로 옮겼다.
- 건설 카드는 정사각형에 가까운 작은 카드로 만들고 스프라이트와 이름만 상시 표시한다. 설명·비용·공기·잠금 사유는 툴팁과 접근성 설명으로 제공한다.
- 카드 크기는 유지하면서 스프라이트만 키웠다.
- 자동 작업자 배정은 사용자가 체크한 건물 종류만 대상으로 하며 전체 선택·전체 해제와 설정 저장을 제공한다.
- 직업 인원 감소 시 미배정 인원부터 줄이고, 작업자 슬롯이 필요한 직업에만 미배정 수를 표시한다.

### 관리 도크와 선택 컨텍스트

- 직업·가공·주민·세력·조정·사건/기물함을 우측 도킹 창으로 이전하고 고정 좌우 사이드바를 제거했다.
- 건설 메뉴는 좌하단, 선택 컨텍스트는 우하단에 두어 둘을 동시에 사용할 수 있다.
- 주민·건물 선택은 빈 지도 좌클릭으로 해제하고, 지형 선택은 같은 지형을 다시 클릭해 해제한다.
- 건설 배치를 실제로 시작할 때만 기존 선택을 해제한다.

### 로그·경보·미니맵 최종 배치

- 중요 로그와 사건 로그를 좌상단 `UnifiedLog`로 통합했다. 축약 상태, 전체 이력, 종류 필터, 중요 표시를 유지한다.
- 경보는 우상단, 관리 도크는 우측, 건설 메뉴는 좌하단에 배치했다.
- 미니맵과 선택 컨텍스트는 하나의 우하단 세로 스택이다. 선택 컨텍스트가 열리면 미니맵이 그 위로 올라가고, 도킹 창이 열리면 스택 전체가 왼쪽으로 이동한다.
- 도킹 창과 우하단 스택은 8px 간격을 유지한다. 빈 스택 영역은 지도 포인터 입력을 통과시킨다.
- 최종 1280×720 화면은 `docs/superpowers/plans/assets/ui-reorganization-final-1280x720.png`에 기록했다.

## 주요 커밋

- `4b69b96 feat: reorganize top bar resources`
- `017f53d feat: add bottom build drawer`
- `cbe3288 fix: compact build drawer cards`
- `ae86d58 fix: use square build drawer cards`
- `b4293b2 fix: enlarge build drawer sprites`
- `350accd feat: add bulk building worker assignment`
- `29d9a2f feat: add docked management windows`
- `2ad4b78 feat: add selection context bar`
- `9ce2fbc fix: compact bottom ui panels`
- `f2c7591 fix: align build controls and selection`
- `a18e1fc feat: dock residents factions and court`
- `04137a5 feat: remove fixed right sidebar`
- `e14b108 feat: unify settlement logs`
- `a018733 feat: finalize overlay layout`

## 검증 결과

U5.2 마감 시 다음을 실행해 통과했다.

- `node tools/game/test_minimap_overlay_layout_ui.mjs`
- `node tools/game/test_selection_context_ui.mjs`
- `node tools/game/test_sidebar_removal_ui.mjs`
- `npm.cmd run build`
- `git diff --check`

브라우저에서 1280×720 기본 상태, 건물 선택 컨텍스트, 사건·기물함 도킹 창 동시 표시를 확인했다. 빌드는 성공하지만 기존과 같이 500kB 초과 번들 경고가 남아 있으며 이번 작업의 오류는 아니다.

## 후속 마감 상태

- U1 자원 그룹 시각 검증을 1280×720에서 완료했다. 그룹 접힘, 자재 팝오버, 별표 추가·제거, 숨은 도구 부족 강조가 모두 정상 동작한다.
- 검증 중 자원 팝오버가 좌상단 통합 로그 뒤로 가려지는 레이어 충돌을 발견해 팝오버를 로그보다 위로 올리고 회귀 테스트를 추가했다.
- 증빙 화면은 `docs/superpowers/plans/assets/ui-reorganization-u1-resource-popover-1280x720.png`에 기록했다. UI 재구성 계획의 모든 체크박스가 완료됐다.
- 후속 마감에서 관련 UI 테스트, 전체 게임 테스트 72개, 프로덕션 빌드와 `git diff --check`가 통과했다. 빌드에는 기존 500kB 초과 번들 경고만 남아 있다.

## 현재 작업 트리의 다른 작업자 변경

아래 파일과 디렉터리는 전술 스프라이트 크기·기준선 자동 보정 작업으로 보이며 이 핸드오프와 무관하다. 수정·삭제·스테이징·커밋하지 말고 담당 작업자가 처리하도록 그대로 둔다.

- `package.json`
- `src/components/tactical/TacticalGroupChip.tsx`
- `src/components/tactical/TacticalZoneColumn.tsx`
- `src/styles/global.css`의 전술 스프라이트 관련 미스테이징 변경
- `tools/game/test_tactical_sprite_poses.mjs`
- `src/render/tacticalSpriteMetrics.ts`
- `tools/game/generate_tactical_sprite_metrics.mjs`
- `tools/game/head-boxes/`
- `debug_output/`
- `generate_boxes.js`
- `generate_boxes.mjs`
- `generate_boxes.py`

`src/styles/global.css`에는 UI 재구성 커밋과 다른 작업자의 전술 변경이 함께 있었으나, UI 재구성 부분만 부분 스테이징해 이미 커밋했다. 현재 남아 있는 CSS diff는 다른 작업자 몫이다.

## 다음 작업자 권장 순서

1. `git status --short`로 위 미커밋 파일이 유지되는지 확인한다.
2. U1 자원 그룹 시각 검증을 짧게 수행하고 계획서를 완전히 마감한다.
3. 새 UI 작업을 시작한다면 좌상단 로그, 우상단 경보, 우측 도크, 좌하단 건설, 우하단 미니맵·컨텍스트의 앵커 경계를 유지한다.
4. 하단 명령판, 선택 컨텍스트, 건설 드로어를 서로 강하게 결합하지 않는다. 후속 기본 접힘이나 드래그 조작 작업이 독립적으로 들어갈 수 있어야 한다.
5. 다른 작업자의 전술 스프라이트 변경이 커밋되기 전에는 전체 `src/styles/global.css`를 통째로 스테이징하지 않는다.
