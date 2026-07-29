# 이동·크기 조절 가능한 관리·HUD 창 계획 — 저장되는 배치와 클릭 포커스

> **계획 상태:** 완료
> **상태 갱신:** 2026-07-29 — 관리 창에서 미니맵·선택 컨텍스트까지 같은 창 체계로 확장했다.

> 역사 계획 (2026-07-18): 체크박스와 후속 항목은 작성 시점 기록이다. 현재 상태는
> [UI 재구성 릴리스 후보](../../release-candidates/2026-07-ui-reorganization.md)를 기준으로 한다.

> **당시 기록:** 2026-07-17 관리 창 구현 뒤 미니맵·선택 컨텍스트까지 같은 형식으로 확장 완료.
> 최적화 작업의 `window.__renderPerf` 계측과 병렬 변경을 보존한 상태에서 전체 88개 게임
> 테스트, 프로덕션 빌드, 브라우저 상호작용 QA를 통과했다.

**Goal:** 주민 목록·직업 배정·가공·거래/세력·조정·사건 창과 미니맵·선택 컨텍스트를
데스크톱 창처럼 자유롭게 이동하고 크기를 조절할 수 있게 한다. 창별 위치와 크기는 게임
저장과 분리된 UI 설정에 보존하며, 창이 겹치면 **마지막으로 클릭하거나 키보드 포커스를
받은 창이 가장 위**로 온다.

**Architecture:** 현재 `DockFrame`의 우측 고정 그리드 스택을 `.canvas-stage` 전체를 덮는
포인터 투과형 창 레이어로 바꾼다. `openDockWindowIds`는 관리 창 열림 상태만 나타내고,
`floatingWindowOrder`가 관리 창·미니맵·선택 컨텍스트의 세션 z순서를 함께 나타낸다.
`DockFrame`은 관리 항목과 HUD overlay 항목을 등록 순서대로 렌더하고 z-index만 순서에서
유도한다. 창별 저장 배치는 `UiPrefs`에 두고, 드래그/리사이즈 도중에는 React/App/localStorage를
매 포인터 이벤트마다 갱신하지 않는다. 각 `DockWindow`가 DOM 스타일과
`requestAnimationFrame`으로 임시 배치를 표시하고, `pointerup`에서 한 번만 정규화된 배치를
커밋한다.

---

## 1. 확정 요구사항

- 대상은 관리 창 6종과 HUD 창 2종이다.
  - `jobs` — 직업 배정
  - `processing` — 가공·비축
  - `residents` — 주민
  - `factions` — 세력·거래
  - `court` — 조정
  - `incidents` — 사건·기물함
  - `minimap` — 미니맵(항상 표시)
  - `selection` — 선택 컨텍스트(선택 중에만 표시)
- 제목 표시줄을 잡아 창을 이동할 수 있다.
- 창의 모서리·변을 잡아 가로/세로 크기를 조절할 수 있다.
- 창마다 마지막으로 지정한 `x`, `y`, `width`, `height`를 새로고침 뒤에도 복원한다.
- 창이 겹치면 창 내부 어디든 마지막으로 누른 창이 가장 위로 올라온다.
  - 버튼·입력·스크롤바를 누른 경우도 해당 창을 앞으로 보낸 뒤 원래 동작은 그대로 수행한다.
  - 키보드 탭으로 창 안에 포커스가 들어온 경우도 해당 창을 앞으로 보낸다.
- 기존 핀 의미는 유지한다.
  - 핀 = 다음 실행에도 자동으로 열기.
  - 위치·크기 저장 = 핀 여부와 무관. 닫았다 다시 열어도 마지막 배치를 사용한다.
  - 미니맵·선택 컨텍스트는 핀 대상이 아니며 외부 닫기 버튼을 두지 않는다. 선택 컨텍스트의
    기존 내부 닫기 버튼은 선택 해제로 동작한다.
- 우측 세로 아이콘 스트립은 계속 고정하고 항상 클릭 가능하게 둔다.
- `GameState`/세이브 스키마에는 창 배치를 넣지 않는다. `buksae-ui-prefs`만 사용한다.

### 이번 범위에서 하지 않는 것

- 창끼리 자동 타일링, 가장자리 스냅, 자석 정렬은 첫 구현에 넣지 않는다.
- 최소화 버튼·작업표시줄·다중 모니터 개념은 만들지 않는다.
- 건설 드로어와 전술 전투 패널은 부유 창 대상으로 바꾸지 않는다.
- z순서는 세션 중에만 유지한다. 위치·크기와 달리 마지막 포커스 순서는 localStorage에
  저장하지 않는다. 새 실행에서는 핀 배열/등록 순서로 열리고 마지막 항목이 위에 온다.

---

## 2. 현재 코드의 출발점 (2026-07-17)

- `src/components/dock/DockFrame.tsx`
  - `items.filter(...)`로 열린 창을 등록 순서대로 고른다.
  - `.dock-window-stack`에 열린 창 수만큼 같은 높이의 grid row를 만든다.
  - 창 위치·크기·포커스 개념이 없다.
- `src/components/dock/DockWindow.tsx`
  - 제목, 핀, 닫기, 본문 스크롤만 담당한다.
  - 드래그 핸들·리사이즈 핸들·인라인 배치 스타일이 없다.
- `src/App.tsx`
  - `openDockWindowIds`를 세션 열림 상태로 소유한다.
  - `openDockWindow`는 ID를 끝에 추가하지만, 이미 열린 창을 다시 포커스하지 않는다.
  - `toggleDockWindow`는 열기/닫기만 한다.
- `src/ui/uiPrefs.ts`
  - 현재 v4. `pinnedDockWindows`까지만 저장한다.
  - 게임 세이브와 분리된 `buksae-ui-prefs` 및 손상 JSON 방어가 이미 있다.
- `src/styles/global.css`
  - `.dock-frame`은 우측 폭 316px, `.dock-window-stack`은 고정 스택이다.
  - 관리 창이 하나라도 열리면 `:has(.dock-frame.has-open-windows)`로 미니맵·선택 정보·알림을
    왼쪽으로 302~332px 민다. 자유 배치 창에서는 이 고정 예약 공간이 맞지 않는다.
- 기존 U3 계획(`2026-07-14-ui-reorganization.md`)은 의도적으로
  **“드래그·크기 조절 없음”**을 선택했다. 이 문서는 그 제약을 해제하는 후속 계획이다.

---

## 3. 창 배치 데이터 모델과 저장

### 순수 배치 타입

새 파일 `src/ui/dockLayout.ts`에 UI 계산을 모은다.

```ts
export interface DockWindowLayout {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type DockWindowLayouts = Partial<Record<FloatingWindowId, DockWindowLayout>>;
```

좌표는 `.canvas-stage`의 좌상단을 `(0, 0)`으로 하는 정수 CSS pixel이다. 같은 화면 크기에서는
사용자가 놓은 위치를 정확히 복원하고, 다른 화면 크기에서는 런타임 clamp로 안전하게 맞춘다.

### `UiPrefs` v5 (구현 시 현재 버전 재확인)

현재 v4가 그대로라면 다음 버전은 v5다.

```ts
interface UiPrefs {
  // 기존 필드...
  pinnedDockWindows: DockWindowId[];
  dockWindowLayouts: DockWindowLayouts;
}
```

- **주의: 버전 숫자만 올리면 v4 설정 전체가 초기화된다 (검토 확정, 2026-07-17).**
  `normalizeUiPrefs`의 허용 버전 검사(uiPrefs.ts:77)가 `1 | 2 | 3 | 현재 버전`이라,
  현재 버전을 5로 올리는 순간 v4 파일은 허용 목록에서 탈락해 79행에서 즉시
  `defaultUiPrefs()`로 떨어진다 — 핀뿐 아니라 별표 자원·자원 그룹·건설 카테고리·자동
  배정까지 전부. 구현 지침:
  - 허용 버전 목록에 **v4를 반드시 추가**한다.
  - 기본 필드(별표 자원·자원 그룹): `version >= 1` 보존.
  - 건설 카테고리: `version >= 2` 보존.
  - 자동 배정: `version >= 3` 보존.
  - 고정 창(핀): `version >= 4` 보존.
  - 창 배치: `version >= 5` 복원, v4 이하는 `{}`.
  - **v4의 모든 기존 필드가 보존되는 테스트**를 `test_ui_prefs.mjs`에 추가한다 (§11).
- v5에서 알 수 없는 창 ID는 버린다.
- 한 창의 배치가 손상돼도 전체 prefs를 초기화하지 않고 그 창의 배치만 버린다.
- `NaN`, `Infinity`, 문자열, 음수 크기, 지나치게 큰 값은 저장 정규화 단계에서 거부한다.
- 저장 값은 정수로 반올림한다. 실제 화면 경계 clamp는 viewport를 아는 런타임 함수가 한다.

추가 헬퍼:

```ts
setDockWindowLayout(prefs, id, layout): UiPrefs
resetDockWindowLayout(prefs, id): UiPrefs
normalizeDockWindowLayouts(value): DockWindowLayouts
```

`saveUiPrefs`는 기존 App effect를 그대로 사용하되 **드래그/리사이즈 종료 시 한 번만** prefs를
바꾼다. 포인터 이동마다 localStorage에 쓰지 않는다.

---

## 4. 기본 배치, 최소 크기, 화면 경계

### 시작값

창 내용에 맞춰 기본 크기를 다르게 둔다. 아래는 첫 튜닝값이며 `dockLayout.ts`의 단일 상수로
관리한다.

| 창 | 기본 크기 (px) |
|---|---:|
| 직업 배정 | 340 × 520 |
| 가공·비축 | 340 × 420 |
| 주민 | 440 × 540 |
| 세력·거래 | 440 × 520 |
| 조정 | 420 × 560 |
| 사건·기물함 | 380 × 420 |
| 미니맵 | 280 × 280 |
| 선택 컨텍스트 | 380 × 260 |

- 공통 최소 크기 시작값: `280 × 180`.
- **관리 창 기본 cascade는 우하단 HUD 기본 배치를 피한다 (검토
  확정, 2026-07-17).** 우측 밀기 CSS를 제거하면(§8) 스트립 왼쪽 계단식 기본 위치가
  미니맵을 바로 덮게 되므로, 기본 배치에만 적용되는 HUD 회피 구역을 둔다:
  - 넓은 화면: 미니맵·선택창이 쓰는 우측 레인을 피해 **그 왼쪽부터** cascade.
  - 좁은 화면: 공간이 부족하면 **좌상단 cascade로 폴백**.
  - 사용자가 직접 이동한 창은 HUD 위에 놓을 수 있다 — 회피는 기본값에만 적용된다.
  - viewport clamp는 화면 경계만 담당하고 HUD 영역을 영구 금지 구역으로 만들지 않는다.
  - 하단 안전 여백을 미니맵 높이만큼 키우는 방식은 쓰지 않는다 — 520~560px짜리 기본 창이
    일반 화면에서도 불필요하게 축소된다.
- 새 창을 열면 저장 배치가 있으면 그것을, 없으면 현재 viewport에서 계산한 기본 cascade를 쓴다.

### 안전 영역과 clamp

`clampDockWindowLayout(layout, viewport)`를 순수 함수로 둔다.

- 안전 여백 시작값: 좌/상 8px, 우측 아이콘 스트립 54px, 하단 56px.
- 창 전체가 안전 영역 안에 남도록 `x/y/width/height`를 clamp한다.
- 화면이 최소 크기보다 작으면 최소 크기보다 viewport 생존을 우선한다.
- 브라우저가 작아져 저장 배치가 일시적으로 화면 밖이 되면 **표시용 배치만 clamp**한다.
  자동 clamp 결과를 prefs에 덮어쓰지 않는다. 창을 실제로 이동/리사이즈했을 때만 저장한다.
- `ResizeObserver`로 `DockFrame`의 실제 stage 크기를 관찰하고 모든 열린 창의 표시 배치를
  재계산한다. 화면을 다시 키우면 사용자가 저장한 원래 배치로 돌아갈 수 있어야 한다.
- 제목 표시줄만 남기고 창 대부분을 화면 밖으로 보내는 방식은 허용하지 않는다. 복구 버튼에
  의존하지 않아도 항상 전체 창이 보이는 것을 기본 정책으로 한다.

각 창 제목 표시줄에는 `위치·크기 초기화` 버튼을 둔다. 관리 창만 핀·닫기 버튼을 함께
표시한다. 초기화하면 해당 ID의 저장 override를 삭제하고 현재 viewport의 기본 배치로 즉시
되돌린다.

---

## 5. z순서와 포커스

`floatingWindowOrder` 배열을 아래처럼 정의한다. 관리 창의 열림/닫힘은 별도
`openDockWindowIds`가 소유하고, 미니맵은 항상 표시, 선택 컨텍스트는 선택 유무로 표시한다.

- 앞쪽 = 아래에 있는 창.
- 마지막 = 가장 위에 있는 창.
- 표시/열기: ID를 배열 끝에 추가.
- 포커스: 기존 ID를 제거하고 배열 끝에 추가.
- 닫기: 배열에서 제거하되 `dockWindowLayouts`는 남긴다.

순수 헬퍼 `bringDockWindowToFront(order, id)`를 두어 중복 없이 결정적으로 처리한다.
이미 마지막인 창을 다시 누르면 같은 배열 객체를 반환해 불필요한 App 렌더를 막는다.

**렌더 순서는 관리 `items`와 HUD `overlayItems`의 등록 순서로 고정하고, 쌓임은 z-index만으로
표현한다 (검토 확정, 2026-07-17).** `floatingWindowOrder`는 세션 z순서만 표현하며, 각 창의
`zIndex`는 `floatingWindowOrder.indexOf(id)`로 계산한다. 포커스 시 DOM 위치는 그대로 두고 z-index만
바꾼다. 근거: React key가 안정적이라 배열 순서 렌더도 재마운트는 없지만, 포커스마다 기존
DOM 노드가 실제로 재배치된다 — pointerdown 직후 굳이 DOM 구조까지 움직여 입력 연속성
위험(진행 중인 클릭 시퀀스·키보드 포커스)을 만들 이유가 없다. 같은 부모 안에서는 z-index로
충분하다.

포커스 트리거:

- `DockWindow`의 `onPointerDownCapture` — 창 내부 어느 곳을 눌러도 먼저 앞으로 보낸다.
- `onFocusCapture` — 키보드 탭으로 버튼/입력에 들어와도 앞으로 보낸다.
- 제목 표시줄 드래그 시작과 리사이즈 시작도 같은 경로를 사용한다.
- 본문 버튼의 클릭, 입력 변경, 스크롤은 막지 않는다. 포커스용 capture 핸들러에서는
  `preventDefault()`를 호출하지 않는다.

창 레이어는 지도보다 위에 두고 미니맵·선택 정보도 그 안에 포함하며, 전역 모달/전술 화면보다
아래에 둔다.
우측 아이콘 스트립은 창 레이어 내부 최상단 z-index를 가져 창에 가려지지 않는다.

---

## 6. 드래그와 리사이즈 상호작용

외부 라이브러리를 추가하지 않고 Pointer Events로 구현한다.

### 이동

- `.dock-window-head`의 빈 영역에서 `pointerdown` 시 이동 시작.
- 핀·초기화·닫기 버튼에서 시작한 포인터는 이동을 시작하지 않는다.
- 시작 시 `setPointerCapture(pointerId)`, 현재 표시 배치와 시작 좌표를 ref에 저장한다.
- `pointermove`의 최신 좌표를 ref에 넣고 한 프레임에 한 번만 RAF로 DOM style을 갱신한다.
- `pointerup`/`lostpointercapture`에서 최종 배치를 clamp하고 prefs에 한 번 커밋한다.
- 드래그 중 `Escape`는 시작 배치로 되돌리고 저장하지 않는다.
  - **우선순위 (검토 확정):** App에는 이미 전역 Escape 핸들러(건설 배치 취소)가 있다.
    활성 드래그가 Escape를 먼저 소비하고, App의 전역 건설 취소는 **소비되지 않은 경우에만**
    처리한다.

### 크기 조절

- 4개 변과 4개 모서리, 총 8개 hit zone을 둔다.
- 모서리는 12~14px, 변은 8~10px의 투명 hit 영역을 사용하고 표준 resize cursor를 준다.
- 우하단에는 작은 시각적 grip을 보여 크기 조절 가능성을 알린다.
- 각 handle은 `n/e/s/w` edge mask로 같은 계산 함수를 사용한다.
- 최소 크기와 안전 영역을 매 프레임 적용한다. 왼쪽/위쪽 resize는 크기와 함께 x/y가 변한다.
- 이동과 동일하게 RAF DOM 갱신, 종료 시 단 한 번 prefs 커밋한다.

### 성능 불변조건

**전제 (검토 확정, 2026-07-17):** App은 게임 실행 중 33ms 타이머(App.tsx의 게임 루프)가
틱 진행 여부와 무관하게 `bump()`를 호출해 전체를 리렌더한다. 따라서 "드래그 중 재렌더
없음"은 검증 불가능한 조건이며, 불변조건은 다음으로 정의한다:

> **드래그·리사이즈가 기존 게임 루프 외의 추가 React 렌더나 저장을 발생시키지 않는다.
> 단, 시작 시 포커스 승격 1회와 종료 시 배치 커밋 1회는 허용한다.**

- `pointermove`마다 `setUiPrefs`, App state, localStorage를 갱신하지 않는다.
- 가능하면 `transform: translate3d(...)`로 이동하고, 리사이즈 때만 width/height를 갱신한다.
- RAF로 DOM 스타일만 갱신하는 설계는 그대로 유지한다.
- 구현 후 최적화 작업자가 추가한 memo/profile 훅을 보존하고, 포인터 처리 때문에 제거하지 않는다.

### 터치/텍스트 선택

- 제목 표시줄과 resize handle에만 `touch-action: none`, `user-select: none`을 적용한다.
- 본문에는 적용하지 않아 터치 스크롤과 텍스트 선택을 유지한다.
- 창 본문에서 시작한 드래그는 창 이동으로 해석하지 않는다.
- 포인터 capture 중 지도 캔버스 패닝/클릭이 동시에 발생하지 않도록 drag/resize 시작 이벤트만
  `preventDefault` 및 `stopPropagation`한다.

---

## 7. 컴포넌트/API 변경

### `DockFrame`

추가 props:

```ts
layouts: DockWindowLayouts;
overlayItems: readonly DockOverlayItem[];
windowOrder: readonly FloatingWindowId[];
onFocusWindow(id: FloatingWindowId): void;
onCommitLayout(id: FloatingWindowId, layout: DockWindowLayout): void;
onResetLayout(id: FloatingWindowId): void;
```

- full-stage bounds를 관찰한다.
- 관리 `items`와 HUD `overlayItems` 등록 순서로 DOM 순서를 고정하고, `windowOrder`는 각 창의
  z-index 계산에만 사용한다.
- 저장/기본 배치를 viewport에 맞춰 해석해 각 `DockWindow`에 전달한다.
- 아이콘 스트립과 부유 창 레이어를 분리한다.

### `DockWindow`

추가 props:

```ts
layout: DockWindowLayout;
className?: string;
zIndex: number;
onFocus(): void;
onLayoutCommit(layout: DockWindowLayout): void;
onResetLayout(): void;
```

- 포인터 gesture와 DOM 임시 스타일을 소유한다.
- 제목 표시줄 이동, 8방향 resize, 초기화 버튼, 포커스 capture를 담당한다.
- 핀/닫기 callback은 선택적이다. HUD 창은 초기화만, 관리 창은 핀·초기화·닫기를 표시한다.
- `React.memo` 적용 여부는 최적화 작업 결과를 보고 결정한다. gesture 자체가 게임 루프 기준선
  외의 추가 본문 렌더를 만들지 않는지 계측한다.

### `App`

- `floatingWindowOrder`와 `focusFloatingWindow(id)`를 추가해 관리·HUD ID를 같은 순서 끝으로 보낸다.
- `openDockWindow(id)`는 이미 열려 있으면 닫지 않고 앞으로 보낸다.
- 아이콘 스트립의 기존 toggle 동작은 유지한다: 열린 아이콘 클릭은 닫기, 닫힌 아이콘은 열기.
- `setDockWindowLayout`/`resetDockWindowLayout`로 UiPrefs를 갱신한다.
- 핀 효과는 현재처럼 핀 ID를 열되, 저장 배치와 z순서 책임을 섞지 않는다.

---

## 8. CSS/레이어 전환

- `.dock-frame`
  - 우측 316px 프레임에서 `position:absolute; inset:0; pointer-events:none`인 전체 stage
    stacking context로 변경.
- `.dock-window-stack`
  - grid와 `--dock-window-count`, `--dock-strip-count` 제거.
  - `.dock-window-layer { position:absolute; inset:0; pointer-events:none; }`로 대체.
- `.dock-window`
  - `position:absolute`, inline `transform/width/height/z-index`, `pointer-events:auto`.
  - 활성 최상단 창은 border/box-shadow를 약간 강조하되 색상 차이는 과하지 않게 한다.
- `.dock-strip`
  - 기존 우측 상단 세로 스트립 유지, 내부 z-index는 모든 부유 창보다 높게 설정.
- `.dock-window-body`
  - `min-height:0`은 유지하고 `overflow:auto`로 바꾼다. 창이 줄어도 헤더는 고정되고 본문만
    양축 스크롤한다.
  - **가로 정책 (검토 확정):** 최소 폭 280px에서는 조정·세력 창의 표가 깨질 수 있으므로
    본문은 명시적으로 **양축 스크롤을 허용**(`overflow:auto`)하고, 버튼·입력 행만 반응형
    줄바꿈한다.
- 자유 배치 전환 후 아래 고정 밀기 규칙은 제거한다.
  - `.canvas-stage:has(.dock-frame.has-open-windows) .right-lower-stack`
  - `.canvas-stage:has(.dock-frame.has-open-windows) .right-overlay-stack`
  - 관련 900px/좁은 화면 예외
- 미니맵·선택 정보는 `.dock-window-layer` 안으로 이동한다. 미니맵 canvas는 창 너비 100%로
  스케일하고, 선택 정보는 창 본문을 채우면서 내부 스크롤을 유지한다.
- 알림만 원래 우측 overlay 위치를 유지한다. 고정 316px 빈 공간은 더 이상 예약하지 않는다.

좁은 화면에서도 별도 고정 스택으로 되돌리지 않는다. viewport clamp가 기본 창을 가능한
크기로 줄이고, 제목 이동/리사이즈는 그대로 제공한다. 단, 실제 터치 QA에서 8방향 handle이
너무 촘촘하면 좁은 화면에서는 모서리 handle 중심으로 hit area를 넓힌다.

---

## 9. 파일별 구현 목록

### 새 파일

- `src/ui/dockLayout.ts`
  - 타입, 기본 크기/cascade, 정규화, viewport clamp, resize 계산, z순서 헬퍼.
- `tools/game/test_dock_window_layout.mjs`
  - 순수 배치 계산·z순서·prefs round-trip 회귀 테스트.

### 수정 파일

- `src/ui/uiPrefs.ts`
  - prefs 버전 상승, `dockWindowLayouts`, v4 핀 보존 마이그레이션, set/reset 헬퍼.
- `src/ui/dockPresentation.ts`
  - 필요하면 기본 배치 metadata 또는 창별 최소 크기 정의를 `dockLayout.ts`와 공유.
- `src/components/dock/DockFrame.tsx`
  - viewport 관찰, 열린 순서 렌더, 부유 레이어, 레이아웃 props 연결.
- `src/components/dock/DockWindow.tsx`
  - 포커스, 제목 드래그, 8방향 resize, RAF 임시 스타일, 초기화.
- `src/App.tsx`
  - focus order, layout commit/reset, 새 DockFrame props.
- `src/styles/global.css`
  - fixed grid → floating layer, handles/cursors/active shadow, 고정 우측 밀기 제거.
- `tools/game/test_ui_prefs.mjs`
  - v4→새 버전 핀 보존, 배치 손상 부분 복구, 저장 round-trip.
- `tools/game/test_management_dock_ui.mjs`
  - focus/layout props, 모든 창 등록 유지, 거래·조정 액션 보존.
- `tools/game/test_sidebar_removal_ui.mjs`
- `tools/game/test_minimap_overlay_layout_ui.mjs`
- `tools/game/test_selection_context_ui.mjs`
  - “열린 도크 폭만큼 오른쪽 UI를 민다”는 옛 기대를 제거하고 floating overlay 정책으로 갱신.

---

## 10. 구현 순서

- [x] **Phase W0 — 최적화 작업 종료 후 재베이스라인.**
  - 다른 작업자의 최적화 커밋/변경을 먼저 확인한다.
  - `DockFrame`, `DockWindow`, App 렌더 경계, 성능 계측 훅이 이 문서 작성 시점과 달라졌는지
    다시 읽는다.
  - 변경 전 `npm run test:game`과 `npm run build`를 통과시켜 기준점을 남긴다.
- [x] **Phase W1 — 순수 배치 모델과 prefs 마이그레이션.**
  - `dockLayout.ts`와 순수 테스트를 먼저 만든다.
  - UiPrefs 버전 상승, v4 핀 보존, 손상 배치 부분 복구, set/reset 헬퍼.
  - 이 단계에서는 화면이 아직 고정 스택이어도 된다.
- [x] **Phase W2 — z순서와 부유 렌더링.**
  - 관리 창용 `openDockWindowIds`와 세션 z순서용 `floatingWindowOrder`를 분리.
  - DockFrame을 full-stage floating layer로 전환하고 저장/default 배치를 absolute style로 표시.
  - 클릭·키보드 포커스 시 마지막 창을 앞으로 보낸다.
  - 이동/리사이즈 전에도 창을 겹쳐 띄우고 포커스만 먼저 검증한다.
- [x] **Phase W3 — 이동과 크기 조절.**
  - 제목 표시줄 pointer capture 이동.
  - 8방향 resize, 최소 크기, viewport clamp, Escape 취소, lost capture 마감.
  - RAF DOM 갱신과 pointerup 1회 prefs 커밋.
  - 위치·크기 초기화 버튼.
- [x] **Phase W4 — 반응형/오버레이 정리.**
  - 우측 고정 밀기 CSS 제거, 미니맵·선택 정보·알림 위치 회귀 테스트 갱신.
  - 좁은 화면 clamp와 터치 hit area 검증.
  - 핀·닫기·아이콘 토글·모달 레이어 상호작용 검증.
- [x] **Phase W5 — 전체 검증과 성능 확인.**
  - 새 순수/정적 UI 테스트와 전체 게임 테스트.
  - 프로덕션 빌드.
  - 브라우저 수동 QA 및 pointermove 중 렌더/저장 횟수 계측.
- [x] **Phase W6 — 미니맵·선택 컨텍스트 확장.**
  - `FloatingWindowId`에 `minimap`, `selection`을 추가하고 기존 v5 배치 저장을 공유.
  - 두 HUD를 `overlayItems`로 같은 창 레이어와 z순서에 연결.
  - 미니맵 너비 스케일, 선택 본문 내부 스크롤, HUD별 초기화와 새로고침 복원 검증.

각 Phase는 별도 커밋이 가능하게 유지한다. 특히 W1(저장 모델)과 W2~W3(상호작용)를 분리하면
최적화 변경과 충돌했을 때 순수 상태 로직을 잃지 않고 UI 부분만 재조정할 수 있다.

---

## 11. 자동 테스트 명세

### `test_dock_window_layout.mjs`

- 관리 창 6개와 HUD 창 2개가 모두 유효한 기본 배치를 가진다.
- 선택 컨텍스트는 우하단 안전 영역, 미니맵은 그 위에 기본 배치된다.
- 기본/cascade 배치가 1280×720, 900×600, 작은 viewport에서 안전 영역을 벗어나지 않는다.
- 이동 clamp가 음수 좌표와 우/하단 초과를 막는다.
- 8방향 resize가 최소 크기와 안전 영역을 지킨다.
- viewport shrink의 표시 clamp가 원본 저장 객체를 변경하지 않는다.
- `bringDockWindowToFront(['jobs','court'], 'jobs')` → `['court','jobs']`.
- 이미 최상단인 ID 포커스는 같은 배열 객체를 반환한다.
- 닫았다 다시 열 때 저장 배치를 재사용한다는 reducer/helper 흐름을 검증한다.

### `test_ui_prefs.mjs`

- v4 prefs의 별표·그룹·건설 카테고리·자동 배정·**핀 목록이 모두 보존**된다.
- v4에는 배치가 없으므로 `{}`로 시작한다.
- 새 버전 배치가 저장/로드 round-trip한다.
- 알 수 없는 ID와 손상된 한 창 배치만 제거되고 다른 prefs/창 배치는 보존된다.
- reset helper는 해당 ID만 지운다.

### 기존 UI 회귀

- 모든 DockWindow ID가 계속 App에 등록돼 있다.
- 주민 클릭 지도 중심 이동, 세력 거래, 조정 청원/세공/사치품, 사건 액션이 그대로다.
- 핀과 닫기 버튼이 드래그를 시작하지 않는다.
- 우측 UI를 316px 미는 옛 CSS/테스트가 남지 않는다.
- 관리 창 레이어가 전역 모달보다 높은 z-index를 갖지 않는다.
- 미니맵·선택 컨텍스트가 관리 창과 같은 `windowOrder`에서 z-index를 얻는다.
- 미니맵 캔버스는 창 너비에 맞춰 늘어나고, 선택 컨텍스트 본문은 창 내부에서 스크롤된다.

---

## 12. 브라우저 인수 시나리오

1. 관리 창 6개를 모두 열고 미니맵·선택 컨텍스트까지 서로 겹치게 놓는다.
2. 아래에 보이는 창의 본문·헤더·입력 요소를 각각 눌러 매번 최상단으로 오는지 확인한다.
3. 주민 창을 넓혀 열 수와 표가 잘 보이는지, 작게 줄이면 본문만 스크롤되는지 확인한다.
4. 세력 창에서 거래 버튼, 조정 창에서 청원/세공, 직업 창에서 증감 버튼을 눌러 포커스 처리로
   원래 클릭이 삼켜지지 않는지 확인한다.
5. 각 변과 모서리 resize, 좌상단 방향 resize, 최소 크기, 화면 끝 clamp를 확인한다.
6. 창을 이동·리사이즈하고 닫았다 다시 열어 같은 배치를 확인한다.
7. 새로고침한다.
   - 핀 창만 자동으로 열린다.
   - 핀/비핀 모두 저장했던 배치는 유지된다.
8. 브라우저를 작게 줄여 모든 창이 화면 안에 들어오는지 확인하고, 다시 키웠을 때 자동 clamp가
   저장 원본을 파괴하지 않았는지 확인한다.
9. 드래그 중 Escape, 창 닫기, 포인터가 창 밖으로 나간 상태의 pointerup/lost capture를 확인한다.
10. 이동 중 지도 캔버스가 같이 패닝/클릭되지 않고, 본문 터치 스크롤은 유지되는지 확인한다.
11. 성능 계측으로 **드래그가 기존 게임 루프 외의 추가 렌더·저장을 만들지 않는지** 확인한다
    (§6 불변조건 — 게임 루프의 30fps 리렌더 자체는 드래그와 무관하게 존재한다).
    - 기존 `window.__renderPerf` 옵트인 계측(renderScene 구간·advanceTick 단계·직업별)을
      전후 기준선으로 사용한다.
    - 단, React 컴포넌트 렌더 횟수와 localStorage 쓰기 횟수는 __renderPerf가 세지 않으므로
      **별도 카운터(예: DockWindow 렌더 카운터)와 저장 spy**(saveUiPrefs 호출 계수)로
      gesture당 포커스 승격 1회 + 배치 커밋 1회만 발생함을 확인한다.
12. 미니맵과 선택 컨텍스트를 각각 이동·리사이즈한 뒤 새로고침/새 게임 진입을 거쳐 같은
    좌표·크기가 복원되는지 확인한다.
13. 관리 창, 미니맵, 선택 컨텍스트를 차례로 눌러 세 종류가 하나의 z순서로 승격되는지 확인한다.

---

## 13. 완료 조건

- 현재 6개 관리 창과 미니맵·선택 컨텍스트 모두 이동·크기 조절 가능.
- 겹친 창은 마지막 pointer/focus 창이 즉시 최상단.
- 창별 위치·크기가 닫기/재열기와 새로고침을 통과.
- 핀 의미와 기존 모든 창 내부 액션 유지.
- 작은 viewport/해상도 변경에서도 창을 잃지 않음.
- 포인터 이동 중 App/localStorage 연속 갱신 없음.
- `npm run test:game`, `npm run build`, `git diff --check` 통과.
- 계획 범위 밖인 최적화 변경 및 다른 작업자의 파일을 덮어쓰지 않음.

### 구현 검증 기록 (2026-07-17)

- `npm run test:game`: **88/88 통과**.
- `npm run build`: 통과. 기존 대형 chunk 경고만 유지.
- 브라우저 QA: 다중 창 겹침과 마지막 클릭 z-index 승격, 제목줄 이동, resize, 새로고침 후
  위치·크기 복원, 초기화, 미니맵·선택 컨텍스트의 공통 z순서와 개별 저장 복원을 확인.
- 브라우저 콘솔: 오류 없음.
