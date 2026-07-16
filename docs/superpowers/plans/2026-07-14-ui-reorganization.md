# UI 개편 계획: 자원바 정책·하단 건설 드로어·도킹 핀 창·인스펙터 절단·로그 통합

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. 해당 스킬이 세션에 없으면 일반 TDD 방식으로 진행한다. Steps use checkbox (`- [ ]`) 구문으로 추적한다.

**Goal:** 좌우 고정 사이드바를 해체해 게임 캔버스를 넓히고, 품목이 계속 늘어나는 자원바에 영구적인 표시 정책을 세운다. 배치 원칙: **선택 문맥 정보는 하단, 전역 관리는 우측 도킹 핀 창, 건설은 하단 아이콘→드로어, 로그는 좌상단 통합, 지속 목표는 상단바 목표 행.**

**확정된 설계 결정:**
- 건설 메뉴는 **하단 아이콘 바 → 드로어**.
- 핀 창은 **v1 도킹형**(우측 가장자리 고정 슬롯, 열기/닫기/핀만) — 자유 드래그 배치는 만들지 않는다(수요 확인 시 v2).
- 자원바는 **전 품목 그룹 소속 + 사용자가 별표한 개별 자원만 추가 노출**. 이후 어떤 품목이 늘어도(가축 계획의 달걀·젖·양털·건초, 병종 계획의 방패 등) 상단바 기본 구성은 불변이다.
- 로그는 좌상단 통합(최근 중요 로그 상시 + 확장 시 전체 이력).
- 지형 상세(선택 문맥)는 하단으로, 주민 목록·세력·조정·직업 배정·가공 한도는 핀 창으로.

**Architecture (재사용과 원칙):**
- **절단선**: 화면의 모든 패널을 두 축으로 분류한다 — *선택 문맥*(클릭한 대상에 따라 바뀌고, 선택 해제 시 사라짐 → 하단 컨텍스트 바) vs *전역 관리*(선택과 무관하게 열어두고 참조 → 도킹 핀 창). 현재 `InspectorPanel`(751줄)이 이 둘을 섞고 있는 것이 근본 문제이며, 이 절단선이 서면 분해는 기계적이다.
- 핀 UX의 사내 선례는 `ResourceBreakdownPopover`(pinned + onTogglePinned)다. 이를 일반화한다.
- UI 상태는 **게임 세이브와 분리된 localStorage 키**(`buksae-ui-prefs`)의 버전 객체에 저장한다 — 저장 마이그레이션과 완전히 무관해진다. 단, U1에서는 별표·자원 그룹 핀만 정의하고 창 열림·드로어 카테고리는 실제 소유 단계(U2/U3)에서 prefs 버전을 올려 추가한다.
- 표시용 자원 그룹(자재·군수·가치재)은 **표시 전용 분류**로 `src/ui/resourceDisplay.ts`에 새로 정의한다. `FOOD_RESOURCES` 등 기존 분류는 소비 로직(consumption.ts)이 사용하는 의미 분류이므로 오염시키지 않는다.

**현재 코드의 출발점 (2026-07-14):**
- `TopBar.tsx`(187줄): 식량·땔감·옷·사치품 4그룹은 이미 팝오버+핀으로 묶여 있으나, 비그룹 자원 ~15종(목재·돌·철·도구·수레·가죽·목화·약초·화약·창·각궁·조총·귀금속 등)이 평면 나열된다. 팝오버 핀은 컴포넌트 state라 새로고침에 소실된다. 세공·토벌 유예 목표 행(`topbar-objectives`)이 이미 있다.
- `App.tsx` 레이아웃: `.side.left` = BuildMenu + JobPanel + ProcessingPanel(고정), `.side.right` = AlertsPanel + 승격 노트 + InspectorPanel + EventLog(고정). 캔버스 위에 `ImportantLogOverlay`(좌상단 토스트)와 `Minimap` 오버레이.
- `InspectorPanel.tsx`(751줄): 선택 문맥(타일/주민/건물/외부 거점)과 전역 탭(주민 목록·세력·조정)이 한 패널에 공존. `onOpenCourt`가 이 패널의 탭 전환에 의존한다.
- 건설 배치는 `placingType` 상태로 진행되고 좌측 BuildMenu가 진입점이다.
- 범용 DOM UI 테스트 하네스는 없지만 Node 기반 순수 모듈 테스트는 기존 `npm run test:game`에 편입할 수 있다. 표시 그룹·prefs 파싱 같은 모델 규칙은 자동 테스트하고, 실제 호버/포커스/레이아웃은 브라우저 시각 확인으로 보완한다.

**구현 전 감사에서 보정한 사항 (2026-07-16):**
- `ResourceId`에는 재고가 아닌 `reputation`·`defense`도 포함된다. 따라서 "모든 ResourceId"가 아니라 `StockResourceId = Exclude<ResourceId, 'reputation' | 'defense'>`가 정확히 한 표시 그룹에 속해야 한다. `threat`는 애초에 `ResourceId`가 아니며 별도 지표다.
- 표시 그룹은 7개로 확정한다: 식량(도정 전 벼 포함), 땔감, 의복, 자재(도구·수레 포함), 군수, 사치품, 가치재(귀금속). 귀금속은 게임 판정상 사치품에도 포함되지만, 표시 정책에서는 세공 사치품과 유동 가치재를 나눈다. 이 분리는 표시 합계에만 적용하며 `LUXURY_RESOURCES`와 소비 판정은 변경하지 않는다.
- 별표 상한은 8개로 확정하고, 상한 도달 시 기존 별표를 임의로 밀어내지 않는다. 팝오버에서 새 별표 버튼을 비활성화하고 이유를 노출한다.
- 그룹 호버만으로 팝오버를 여는 현행 구조는 키보드 접근이 불가능하다. 그룹 트리거를 버튼으로 만들고 포커스/클릭으로도 열고 고정할 수 있게 한다. 팝오버 내부 포커스 이동 중에는 닫히지 않아야 한다.
- 그룹 7개와 별표 8개가 동시에 보일 수 있으므로 1280px에서도 상단바 전체 높이가 무제한 증가하지 않도록 자원 행의 가로 오버플로 정책을 둔다.
- 기존 `buksae-buildmenu-open`은 U2 전환 시 `buksae-ui-prefs`로 흡수하고 제거한다. 사운드 키는 사운드 모듈 소유이므로 이번 UI prefs에 합치지 않는다.

**만들지 않는 것:**
- 자유 드래그·임의 배치 창, z순서 관리, 창 크기 조절.
- 자원 그룹의 소비 로직 변경 — 표시 분류만 추가한다.
- 모바일 대응 레이아웃.

---

## Phase U1: 자원바 정책 — 전량 그룹화 + 별표 핀

### Task U1.1: UI 설정 저장소

**Files:**
- Create: `src/ui/uiPrefs.ts`
- Modify: `src/App.tsx` (초기 로드·변경 저장 연결)
- Test: `tools/game/test_ui_prefs.mjs`

- [x] `buksae-ui-prefs` localStorage 키에 버전 필드를 둔 단일 객체로 저장: U1 v1은 별표 자원 목록과 그룹 팝오버 핀만 소유한다. 도킹 창·드로어 필드는 U2/U3에서 실제 식별자가 확정될 때 버전 마이그레이션과 함께 추가한다.
- [x] 읽기 실패·손상된 JSON·버전 불일치·알 수 없는 자원/그룹 값은 기본값 또는 검증된 값으로 안전하게 정규화한다(절대 throw하지 않음). 별표는 중복 제거 후 최대 8개로 제한한다.
- [x] 게임 세이브(`buksae-save-v3`)와 완전 분리 — 세이브 초기화가 UI 설정을 건드리지 않고, 그 역도 같다.

### Task U1.2: 표시용 자원 그룹 확장

**Files:**
- Create: `src/ui/resourceDisplay.ts` (표시 그룹·순서·부족 기준)
- Modify: `src/components/TopBar.tsx`, `src/components/ResourceBreakdownPopover.tsx`
- Test: `tools/game/test_resource_display.mjs`

- [x] 표시 전용 7그룹을 정의한다: **식량**(곡물·벼·고기·생선·채소), **땔감**, **의복**, **자재**(목재·돌·철·도구·수레·가죽·목화·약초), **군수**(화약·창·각궁·조총), **사치품**(자기·유기·칠기·비단), **가치재**(귀금속). 모든 `StockResourceId`가 정확히 하나의 표시 그룹에 속함을 타입 제약과 테스트로 검증한다.
- [x] 명성·방어도·위협은 **지표**로 분리해 그룹화 대상에서 제외하고 현행 지표 위치를 유지한다.
- [x] 표시 그룹 합계는 표시용 함수로 계산한다. 식량·땔감·의복은 기존 환산 합계를 유지하고, 그 밖의 그룹은 해당 표시 품목의 단순 합계를 쓴다. `luxuryStockTotal`·`LUXURY_RESOURCES`를 포함한 게임 판정 로직은 변경하지 않는다.

### Task U1.3: 상단바 재구성 — 그룹 칩 + 별표 자원

**Files:**
- Modify: `src/components/TopBar.tsx`, `src/components/ResourceBreakdownPopover.tsx`
- Modify: `src/styles/global.css`

- [x] 기본 표시 = 그룹 합계 칩 7개 + 지표 + **사용자가 별표한 개별 자원**. 그룹 팝오버의 각 품목에 별표 토글을 두고, 별표한 자원은 상단바에 개별 칩으로 노출된다(uiPrefs 저장, 순서는 그룹 순). 별표 상한은 8개이며 상한 도달 시 새 별표 토글을 비활성화한다.
- [x] **부족 경고는 표시 여부와 무관**: 그룹에 숨은 품목이 부족 조건에 걸리면 그룹 칩이 low 스타일로 붉어지고 팝오버에서 해당 품목이 강조된다. 기존 `isLow`(현재 도구만)를 품목별 기준 테이블로 확장한다.
- [x] 팝오버 핀 상태를 컴포넌트 state에서 uiPrefs로 이전(새로고침 생존).
- [x] 그룹 트리거는 마우스 hover뿐 아니라 키보드 focus와 클릭으로 열 수 있어야 하며 `aria-expanded`·`aria-haspopup`·별표 `aria-pressed`를 제공한다. 터치에서는 그룹 탭→같은 팝오버 안에서 별표 조작이 가능해야 한다.
- [x] 자원 행은 1280px에서 상단바가 여러 줄로 무제한 커지지 않도록 가로 스크롤/오버플로 처리를 하고, 키보드 포커스 표시를 유지한다.
- [ ] 시각 검증: 미리보기로 그룹 접힘/팝오버/별표 추가·제거/low 강조를 확인하고 스크린샷을 남긴다.
  - 2026-07-16: 로컬 서버 응답은 확인했으나 내장 브라우저가 최초 연결 실패 뒤 보안 정책상 localhost 재탐색을 차단해 스크린샷 게이트는 보류. 자동 테스트 66개·프로덕션 빌드·`git diff --check`는 통과.

## Phase U2: 하단 건설 드로어

### Task U2.1: 하단 아이콘 바 + 드로어

**Files:**
- Create: `src/components/BuildDrawer.tsx` (기존 `BuildMenu.tsx` 대체)
- Create: `src/ui/buildPresentation.ts` (카테고리·드로어 전환 상태)
- Modify: `src/App.tsx` (`.side.left`에서 BuildMenu 제거, 하단 배치)
- Modify: `src/styles/global.css`
- Modify: `src/ui/uiPrefs.ts` (v1 → v2 마이그레이션)
- Delete: `src/components/BuildMenu.tsx`
- Test: `tools/game/test_build_drawer_presentation.mjs`, `tools/game/test_ui_prefs.mjs`

- [x] 하단 상시 아이콘 바(건설 카테고리: 주거/생산/농사/방어/특수) → 클릭 시 해당 카테고리 드로어가 위로 펼쳐진다. 카드는 스프라이트 위·이름 아래의 정사각형에 가까운 세로형으로 두고, 설명·비용·공기·티어 잠금 사유는 hover/focus 툴팁과 접근성 설명으로 제공한다. 기존 메뉴가 숨기던 잠금 건물도 포커스 가능한 `aria-disabled` 카드로 유지한다.
- [x] 배치 흐름: 건물 선택 시 드로어 자동 접힘 → `placingType` 진행 → 단일 배치 완료·취소(Esc/우클릭) 시 출발 카테고리 복귀. 마지막 카테고리 기억(uiPrefs), 단축키 `B`로 드로어 토글. 전환 시 기존 `buksae-buildmenu-open` 키는 v2 prefs에 흡수한 뒤 제거한다.
- [x] 드로어가 열려 있는 동안에도 캔버스 클릭·시간 진행은 정상 동작(모달이 아님). 셸은 포인터 이벤트를 통과시키고 실제 패널·바만 입력을 소비한다.
- [x] 시각 검증: 1280×800·1920×1080에서 배치 시작→취소→재개, 티어 잠금, 캔버스/좌우 패널 경계를 확인했다. 계절 지도와 분리된 97% 불투명 배경으로 대비를 고정했다.
  - 2026-07-16: 1280에서는 카드 한 줄 가로 스크롤, 1920에서는 드로어가 캔버스 좌우 10px 안쪽에 수용됨을 스크린샷으로 확인. 열린 동안 시간 진행도 유지됐으며 `B` 닫기/재열기와 취소 후 주거 카테고리 복원을 브라우저에서 확인했다.
  - 범위 경계: U2에서는 BuildMenu만 좌측에서 제거하고 JobPanel·ProcessingPanel은 U3 도킹 전환까지 유지한다.

## Phase U3: 도킹 핀 창 프레임 + 좌측 해체 완료

### Task U3.1: 도킹 창 프레임

**Files:**
- Create: `src/components/dock/DockFrame.tsx`, `src/components/dock/DockWindow.tsx`
- Modify: `src/App.tsx`, `src/styles/global.css`

- [x] 우측 가장자리 고정 슬롯에 도킹되는 창 프레임: 우측 세로 아이콘 스트립(창 토글 버튼) + 열린 창은 위에서 아래로 스택. 각 창은 열기/닫기/핀(핀 = 세션 간 열림 유지, uiPrefs). **드래그·크기 조절 없음.**
- [x] 창 영역은 자체적으로만 포인터 이벤트를 소비한다 — 캔버스의 우클릭 이동 명령·엣지 스크롤을 삼키지 않음을 명시적으로 확인한다(창 바깥 여백은 pointer-events 통과).
- [x] 열린 창이 세로 공간을 넘치면 창별 스크롤(전체 스택 스크롤 금지 — 위 창이 아래 창을 밀어내지 않게).

### Task U3.2: 직업 배정·가공 한도 이전

**Files:**
- Modify: `src/App.tsx` (`.side.left` 완전 제거)
- Modify: `src/components/JobPanel.tsx`, `src/components/ProcessingPanel.tsx` (DockWindow 내용물로 래핑)
- Modify: `src/styles/global.css`

- [x] JobPanel·ProcessingPanel을 도킹 창으로 이전하고 좌측 사이드바를 제거한다. 캔버스가 좌측 가장자리까지 확장된다.
- [x] 직업 배정처럼 "보면서 조작"하는 창은 핀 기본값 제안: 첫 실행 기본은 닫힘, 사용자가 핀하면 유지.

검증 메모 (2026-07-16): 1280×800·1920×1080에서 기본 닫힘, 두 창 동시 스택과 창별 스크롤, 핀 후 새 실행 자동 열림, 도킹 바깥 지도 클릭 전달을 확인했다. 창이 열리면 건설 드로어의 우측 경계를 도킹 창 왼쪽으로 줄여 두 조작면이 겹치지 않게 했다.

## Phase U4: InspectorPanel 절단

### Task U4.1: 하단 선택 컨텍스트 바

**Files:**
- Create: `src/components/SelectionContextBar.tsx`
- Modify: `src/components/InspectorPanel.tsx` (선택 문맥 렌더러 추출·이전)
- Modify: `src/App.tsx`, `src/styles/global.css`

- [x] 타일/주민/건물/외부 거점 선택 시 하단(건설 아이콘 바 위)에 컨텍스트 바가 나타나고, 선택 해제 시 사라진다. 기존 InspectorPanel의 선택 문맥 렌더링·행동 버튼(작물 선택, 수리, 토벌대 소집 등)을 그대로 이전한다 — 기능 변경 없음, 위치만.
- [x] 건설 드로어와의 공존 규칙: 좌측 건설 묶음과 우측 선택 컨텍스트를 동시에 표시한다. 건설 배치를 시작할 때만 선택을 해제한다.

검증 메모 (2026-07-16): 타일·건물·주민 선택 문맥과 기존 건물 행동을 하단 `SelectionContextBar`로 이전했다. 건설 카테고리 메뉴와 확장 드로어는 하나의 좌하단 묶음, 선택 컨텍스트는 우하단의 약 20vw 폭 소형 패널로 분리해 동시에 표시한다. 주민·건물 선택은 빈 타일 좌클릭, 지형 선택은 같은 타일 재클릭으로 해제한다. 1280×800·1920×1080에서 도킹 창과 컨텍스트의 경계가 겹치지 않으며, 긴 주민 정보는 패널 내부에서만 스크롤됨을 확인했다.

### Task U4.2: 주민 목록·세력·조정을 도킹 창으로

**Files:**
- Create: `src/components/dock/ResidentsWindow.tsx`, `src/components/dock/FactionsWindow.tsx`, `src/components/dock/CourtWindow.tsx` (InspectorPanel 탭 내용 이전)
- Modify: `src/App.tsx` (`onOpenCourt` 등 탭 전환 핸들러 → 도킹 창 열기로 교체)
- Modify: `src/components/TopBar.tsx` (세공·토벌 버튼의 이동 대상 갱신)

- [x] 주민 목록·세력·조정 탭을 각각 도킹 창으로 이전한다. 주민 목록에서 주민 클릭 시 지도 이동+선택(기존 동작 유지)과 하단 컨텍스트 바 연동을 확인한다.
- [x] `onOpenCourt`(상단바 세공/토벌 유예 버튼, 사건 로그 링크 등)의 모든 호출처가 조정 창을 여는지 전수 확인한다.

검증 메모 (2026-07-16): 주민·세력·조정을 독립 도킹 창으로 추출하고 열림 상태를 `App`에서 제어해 상단 세공·토벌 유예 버튼이 조정 창을 직접 열도록 했다. 주민 행은 키보드 접근 가능한 버튼으로 바꾸고, 선택 시 해당 주민으로 지도를 이동한 뒤 하단 컨텍스트와 연동한다. 1280×800에서 두 창 스택과 내부 스크롤, 1920×1080에서 주민·세력·조정 세 창 스택 및 우측 컨텍스트 비겹침을 확인했다. 사건·기물함은 U4.3 전까지 우측 임시 패널에 남긴다.

### Task U4.3: 경고·승격의 재배치와 우측 해체 완료

**Files:**
- Modify: `src/components/AlertsPanel.tsx` (우상단 얇은 스택으로)
- Modify: `src/components/TopBar.tsx` (`topbar-objectives`에 승격 진행 합류)
- Modify: `src/App.tsx` (`.side.right` 제거 — EventLog는 Phase U5까지 임시로 우상단 유지)

- [ ] AlertsPanel을 캔버스 우상단 오버레이 스택으로 이전(도킹 창 아이콘 스트립과 겹치지 않게).
- [ ] 승격 진행(현재 우측 사이드바의 "다음 승격" 섹션)을 상단바 목표 행으로 이전 — 세공·토벌 유예와 함께 "지속 관리 항목"의 단일 자리가 된다. 클릭 시 조정 창 열기.

## Phase U5: 로그 통합 + 미니맵 재배치

### Task U5.1: 좌상단 통합 로그

**Files:**
- Create: `src/components/UnifiedLog.tsx` (`ImportantLogOverlay` + `EventLog` 통합)
- Modify: `src/App.tsx`, `src/styles/global.css`
- Delete: `src/components/ImportantLogOverlay.tsx`, `src/components/EventLog.tsx` (통합 완료 후)

- [ ] 좌상단 앵커: 최근 중요 로그 N줄 상시 표시(현행 토스트 대체) → 클릭/호버로 전체 이력 패널 확장. kind 필터(info/good/bad/raid/weather/trade)와 중요 표시(`important`)는 유지. 확장 패널이 열려 있어도 게임은 계속 진행.
- [ ] 토스트의 자동 소멸 타이밍·중복 억제 등 기존 ImportantLogOverlay 동작을 회귀 없이 흡수한다.

### Task U5.2: 미니맵 재배치와 오버레이 충돌 정리

**Files:**
- Modify: `src/App.tsx`, `src/components/Minimap.tsx`, `src/styles/global.css`

- [ ] 미니맵을 우하단으로 이전(좌상단 로그·우상단 경고·우측 도킹 스트립·하단 컨텍스트 바와 겹치지 않는 마지막 빈 모서리). 하단 컨텍스트 바가 열릴 때 미니맵이 가려지지 않는지 확인.
- [ ] 최종 오버레이 배치도(좌상단 로그 / 우상단 경고 / 우측 도킹 / 하단 건설+컨텍스트 / 우하단 미니맵)를 이 계획서에 스크린샷과 함께 기록해 마감한다.

---

## 권장 순서와 단계별 출시 가능성

```text
U1 (자원바)          — 독립, 즉시. 가축 계획(품목 추가)보다 먼저 배포되어야 함
U2 (건설 드로어)      — 독립
U3 (도킹 프레임+좌측 해체) — U2 이후 (좌측이 비어야 캔버스 확장이 완성됨)
U4 (인스펙터 절단)    — U3 이후 (도킹 프레임 필요)
U5 (로그 통합+미니맵)  — 마지막 (다른 조각들의 자리가 확정된 뒤)
```
각 Phase는 독립적으로 커밋·출시 가능하며, 중간 상태에서도 게임은 항상 플레이 가능해야 한다.

## 검증과 게이트

- 각 Phase 최종 게이트: `npm run build`(tsc 포함) → `npm run test:game`(게임 로직 무영향 확인) → `git diff --check` → **브라우저 미리보기 시각 검증**(해당 Phase의 조작 흐름을 실제로 수행하고 스크린샷).
- 공통 시각 체크리스트: 캔버스 우클릭 이동 명령이 패널에 먹히지 않는가 / 시간 진행 중 패널 조작이 가능한가 / 1280×800과 1920×1080에서 겹침이 없는가 / 겨울(밝은 배경)에서 오버레이 대비가 유지되는가.
- uiPrefs: 자동 테스트로 버전 불일치·손상 JSON·알 수 없는 값·중복·8개 상한을 검증하고, 브라우저에서 새로고침 생존과 세이브 초기화 상호 무간섭을 확인.

## 리스크 요약

| 리스크 | 대응 |
| --- | --- |
| 패널이 캔버스 입력(우클릭 명령·엣지 스크롤)을 삼킴 | 도킹 프레임의 pointer-events 통과 규칙 + Phase별 시각 체크리스트에 고정 항목 |
| 하단 공간 경합(건설 바 vs 컨텍스트 바) | 컨텍스트 바 등장 시 드로어 접힘 규칙(U4.1)으로 단일 점유 |
| InspectorPanel 분해 중 기능 누락 | "기능 변경 없음, 위치만" 원칙 + 행동 버튼(작물·수리·소집 등) 전수 목록화 후 이전 |
| `onOpenCourt` 등 탭 전환 의존 호출처 누락 | U4.2에서 호출처 전수 grep 확인을 완료 조건에 포함 |
| 별표·핀 상태가 세이브와 얽힘 | uiPrefs를 localStorage 별도 키로 격리(U1.1), 세이브 마이그레이션 무관 |
| 자원 품목 추가 시 그룹 누락 | 모든 `StockResourceId`가 정확히 한 표시 그룹에 속하는 타입 제약 + 자동 테스트(U1.2) |
