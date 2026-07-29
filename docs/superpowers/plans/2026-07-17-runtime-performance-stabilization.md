# 런타임 성능 안정화 수정 계획 — 렌더 루프 분리와 광역 경로탐색 캐시

> **계획 상태:** 완료
> **상태 갱신:** 2026-07-29 — 렌더 시계·viewport·탐사·광역 경로 최적화와 측정을 완료했다.

> 역사 계획 (2026-07-18): 체크박스와 후속 항목은 작성 시점 기록이다. 최종 전후 계측과
> 보존된 최적화 상태는 [UI 재구성 릴리스 후보](../../release-candidates/2026-07-ui-reorganization.md)를 기준으로 한다.

> **당시 기록:** 2026-07-17 병목 진단 및 페이블 2차 리뷰 반영 완료, 구현은 당시 미착수였다.
> 기준 브랜치는 `codex/ui-reorganization`, 작성 시점 HEAD는 `bfefe02`다.
> 페이블이 `agents.ts`에 적용한 A* 힙·통행 메모·실패 쿨다운·운반 예약 집계 최적화는
> 유효한 선행 작업으로 간주하며 보존한다.

**Goal:** 게임을 시작한 직후부터 발생하고 일시정지하면 사라지는 지속 프레임 저하를 제거한다.
React/UI 갱신과 지도 보간 렌더를 분리하고, 전체 월드 캔버스 재도색을 보이는 영역으로 제한한다.
그 뒤 벌목꾼·사냥꾼·약초꾼의 광역 목표 경로탐색을 주민별 전체 맵 스캔에서 틱 공유 목표장으로
바꿔 서브틱 순간 멈춤도 함께 제거한다.

**Architecture:** 현재처럼 `GameState`는 `stateRef`에서 가변 상태로 유지하되, App의 React
`version`은 실제 시뮬레이션 틱이나 사용자 명령으로 상태가 바뀔 때만 올린다. 주민 이동 보간은
게임 실행 중에만 `GameCanvas`가 소유하는 `requestAnimationFrame` 루프가 refs를 읽어 캔버스에만
그리고, 일시정지 중에는 입력·상태 변경 때 단발성 frame만 요청한다. 첫
슬라이스에서는 2016×2016 월드 캔버스와 기존 스크롤/포인터 좌표계를 유지하고, 매 프레임
보이는 월드 사각형과 작은 overscan만 지우고 다시 그린다. 경로탐색은 호출자가 명시적인
`GoalField`(목표 mask + O(1) 휴리스틱)를 넘기며, 직업별 광역 목표장은 한 `agentsTick` 안에서
공유한다. 런타임 캐시는 세이브에 넣지 않는다.

---

## 1. 문제 정의와 확정 진단

### A. 지속 프레임 저하 — 최우선

- `src/App.tsx`
  - 게임 실행 중 33ms `setInterval`이 실제 서브틱 진행 여부와 무관하게 항상 `bump()`한다.
  - 1배속에서는 실제 `advanceTick`이 약 1초에 한 번이어도 App 전체가 약 30회/초 렌더된다.
- `src/components/GameCanvas.tsx`
  - dependency array가 없는 effect가 매 React 렌더마다 `renderScene` 전체를 호출한다.
  - 기본 72×72맵과 28px 타일 때문에 캔버스는 2016×2016px, 약 406만 픽셀이다.
- `src/render/renderer.ts`
  - 매 프레임 전체 캔버스를 지우고 같은 크기의 지형 레이어를 전부 복사한다.
  - 이후 전체 건물 정렬, 주민/동물/전투 객체, 밤낮·날씨 전면 오버레이, 미답사 안개를 다시
    그린다.
  - 초기화와 지형 복사만으로 약 813만 픽셀/프레임, 30fps에서 약 2.44억 픽셀/초다.
- `src/components/Minimap.tsx`
  - App의 같은 `version` 갱신을 받아 전체 72×72 타일과 건물·세력·표식을 약 30회/초 다시
    그린다.
- 일시정지하면 App의 33ms effect가 빠지므로 위 연쇄가 멈춘다. 사용자가 관찰한 “실행 중
  심하고 정지하면 정상”과 직접 일치한다.

### B. 서브틱 순간 멈춤 — 두 번째 우선순위

- 페이블의 운반꾼 집계 개선 뒤 신규 게임 운반꾼 비용은 약 1ms까지 내려갔다.
- 남은 첫 서브틱 비용은 벌목꾼·사냥꾼·약초꾼의 광역 목표 탐색이 지배한다.
- `agents.ts::goalTiles`는 경로 요청마다 지도 5,184칸 전체를 스캔한다.
- 목표가 128개를 넘으면 현재 A* 휴리스틱이 `0`이 되어 다익스트라 탐색으로 퇴화한다.
- 광역 목표 predicate의 `isExplored`는 매 조회마다 탐색 배열과 지도 전체 행 길이를 다시
  검증한다. 목표 스캔 하나가 최대 약 `5,184 × 72`회의 행 길이 확인을 만든다.
- 같은 직업 주민들이 같은 숲·서식지를 찾더라도 목표 목록과 탐색 자료구조를 주민별로 다시
  만든다.

### C. 반복·파생 계산

- `agentsTick` 끝과 `advanceTick` 중간에서 `refreshExploration`이 같은 서브틱에 두 번 실행된다.
- `collectHuntableTiles`는 사냥꾼 유무와 관계없이 매 서브틱 계산된다.
- 렌더 중 건물마다 `assignedWorkers`가 주민 전체를 필터·정렬한다.
- TopBar는 렌더마다 주민별 집 찾기를 건물 선형 검색으로 수행한다.
- 지형 캐시 키가 `state.day`를 포함해 시각적 지형 변화가 없어도 매일 5,184타일 레이어를
  재생성한다. 반대로 같은 날 벌목으로 지형이 변하면 다음 날까지 캐시가 남을 여지도 있다.

---

## 2. 재현 기준선

2026-07-17 고정 시드 `20260717`로 실제 `src/game/*.ts` 모듈을 트랜스파일해 계측했다.
시간값은 개발 머신의 방향성 기준이며 CI의 절대 합격선으로 직접 쓰지 않는다.

| 시나리오 | 기준선 |
|---|---:|
| 신규 게임, 주민 12명·건물 3동, 첫 서브틱 | 33.3ms |
| 위 첫 서브틱의 벌목꾼 | 20.6ms |
| 위 첫 서브틱의 사냥꾼 | 5.1ms |
| 위 첫 서브틱의 약초꾼 | 2.3ms |
| 위 첫 서브틱의 운반꾼 | 1.0ms |
| 합성 규모 주민 120명·건물 96동, 첫 서브틱 | 70.0ms |
| 같은 합성 규모, 이후 서브틱 | 6.4~10.7ms |
| 현재 `isExplored`를 쓴 단일 경로탐색 평균 | 1.195ms |
| 탐색 배열을 직접 조회한 같은 경로탐색 평균 | 0.173ms |
| 5,184칸 탐색 여부 순회 — 현재 helper | 1.113ms |
| 5,184칸 탐색 여부 순회 — 직접 배열 | 0.168ms |

### 구현 전 반드시 다시 남길 기준선

- 최신 병렬 작업을 반영한 HEAD에서 같은 시드로 3회 실행한다.
- 신규 게임 첫 서브틱은 **냉간 상태**로 정의한다.
  - 새 프로세스 또는 새 모듈 인스턴스에서 시작한다.
  - 주민들의 기존 `path`가 비어 있고 relevant runtime cache가 없는 첫 경로 요청이어야 한다.
  - `pathFailUntil` 같은 module-level cache가 이전 시나리오에서 남지 않게 한다.
- 각 시나리오의 median, p95, max와 아래 카운터를 기록한다.
  - `renderScene-total`, 렌더 구간별 bucket
  - `0-advanceTicks`, `t1-agents`~`t7-endOfDay`
  - `job-*`
  - App 렌더 수, 지도 프레임 수, 미니맵 base redraw 수
  - 경로 요청 수, 목표장 생성 수, 확장 노드 수, 실패/쿨다운 적중 수
- 브라우저 기준은 1280×720, 기본 배율 100%, 개발자 도구를 닫은 상태로 통일한다.
- 신규 게임 30초와 주민 120명·건물 96동 스트레스 세이브 30초를 각각 실행한다.

---

## 3. 성능·동작 불변조건

### 성능 목표

- 보간 애니메이션 때문에 App 전체가 30fps로 렌더되지 않는다.
- 시뮬레이션 틱과 사용자 명령이 없는 동안 React App commit은 발생하지 않는다.
- 지도 프레임은 보이는 월드 영역 + 1타일 overscan만 지우고 다시 그린다.
- 기본 신규 게임의 지도 렌더 p95는 목표 머신에서 16.7ms 이하다.
- 주민 120명·건물 96동 시나리오의 워밍업 이후 `advanceTick` p95는 16.7ms 이하,
  max는 33.3ms 이하를 목표로 한다.
- 신규 게임 첫 서브틱도 16.7ms 이하를 목표로 하되, 하드웨어 차이가 있는 자동 테스트에서는
  절대 ms 대신 목표장 생성 횟수·맵 스캔 횟수·렌더 영역 같은 구조적 예산을 검사한다.
- 30초 인수 실행에서 50ms 이상 main-thread long task가 없어야 한다.

### 게임 동작 불변조건

- `msPerDay`, `subticksPerDay`, 배속별 진행량, 탭 복귀 catch-up 상한은 바꾸지 않는다.
- 주민 이동 보간, 밤낮·날씨 애니메이션, 굴뚝 연기, 원정/습격 표식은 유지한다.
- 지도 클릭·주민 선택·우클릭 명령·패닝·경작지 드래그 배치 좌표를 바꾸지 않는다.
- A*의 통행 규칙, 대각선 모서리 통과 금지, 최단 비용, 실패 쿨다운 의미를 유지한다.
- 벌목·사냥·약초·건물 상호작용 대상 선택 결과는 동일 비용 tie를 제외하고 기존과 같아야 한다.
- 새 구현은 같은 버전·같은 시드·같은 명령을 반복하면 bit-for-bit 동일해야 한다.
- 구버전과 새 버전이 처음 달라진 경우에는 해당 지점의 후보·최단 비용을 기록한다. 최적화로
  허용하는 차이는 **동일 최단 비용 목표의 tie**뿐이며, 새 구현 내부에서는 고정 DIR 순서와
  ID/좌표 순서로 결정적으로 해소한다.
- 페이블이 추가한 이진 힙, 탐색별 통행 메모, 건물 목표 Set, 실패 쿨다운, 운반 예약 집계는
  삭제하거나 원래 구현으로 되돌리지 않는다.
- 런타임 캐시는 `GameState`와 저장 JSON에 추가하지 않는다. 저장 스키마 버전을 올리지 않는다.
- 전술 전투 렌더/판정과 은 경제·가축·신규 직업 밸런스는 이번 성능 작업에서 변경하지 않는다.

### 이번 범위에서 하지 않는 것

- 애니메이션을 끄거나 해상도·스프라이트 품질을 낮춰 문제를 감추지 않는다.
- 직업 생산 빈도를 임의로 낮추거나 주민을 라운드로빈 처리해 게임 결과를 바꾸지 않는다.
- 첫 구현부터 Web Worker로 `GameState` 전체를 복제하지 않는다. 렌더/탐색 구조 개선 뒤에도
  50ms long task가 남을 때 별도 계획으로 판단한다.
- 첫 슬라이스에서 월드 크기 canvas를 viewport 크기 camera canvas로 전면 교체하지 않는다.
  기존 스크롤·포인터 체계를 유지한 채 실제 repaint만 보이는 영역으로 줄인다.
- 모든 파생값을 한꺼번에 memoize하지 않는다. 계측상 남은 10% 이상 구간만 후속 캐시한다.

---

## 4. 계측과 반복 가능한 벤치

### 새 측정 도구

`tools/game/measure_runtime_performance.mjs`를 추가한다. 파일명이 `test_`로 시작하지 않게 해
`npm run test:game`에는 포함하지 않고, `npm run measure:runtime`으로 명시 실행한다.

- 기존 게임 테스트처럼 `src/game/*.ts`를 임시 폴더에 트랜스파일한다.
- 고정 시드 시나리오:
  1. 신규 게임 12명·3동, 24서브틱.
  2. 유효한 고유 ID/배치를 가진 주민 120명·건물 96동, 24서브틱.
  3. 벌목꾼·사냥꾼·약초꾼이 동시에 첫 경로를 찾는 시나리오.
  4. 목표가 막혀 실패 쿨다운이 동작하는 시나리오.
- 각 bucket의 count, total, mean, p50, p95, max를 표와 JSON 한 줄로 출력한다.
- 경로탐색은 요청 수, 목표 후보 수, 목표장 구축 수, 확장 노드 수를 별도로 출력한다.
- 신규 게임 첫 서브틱 시나리오는 스크립트 주석과 출력에 `cold-first-path`로 표시하고,
  시나리오별 프로세스/모듈 격리 여부도 함께 출력한다.
- 벤치는 보고용이다. OS 부하에 민감한 절대 시간으로 `test:game`을 실패시키지 않는다.

### 브라우저 옵트인 계측 확장

기존 `window.__renderPerf = {}` 경로를 유지하고 활성화됐을 때만 다음을 기록한다.

- `app-render`, `canvas-raf`, `canvas-visible-pixels`
- `scene-snapshot-build`, `terrain-layer-rebuild`, `fog-mask-rebuild`
- `minimap-base-redraw`, `minimap-overlay-redraw`
- `path-request`, `path-goal-field-build`, `path-expanded-node`
- bucket에 `max`와 제한 길이 sample ring을 추가해 p95를 계산할 수 있게 한다.
- 계측이 꺼진 기본 배포 경로에서는 sample 배열과 `performance.now()` 호출을 만들지 않는다.

---

## 5. 렌더 시계 분리

### 순수 게임 시계

새 파일 `src/ui/gameClock.ts`에 누적 시간 계산을 React와 분리한다.

```ts
interface GameClockStep {
  accumulator: number;
  ticksToAdvance: number;
}

advanceGameClock(
  accumulator: number,
  elapsed: number,
  msPerTick: number,
  maxCatchUpTicks: number,
): GameClockStep
```

- elapsed clamp, 정수 서브틱 수, 남은 accumulator만 계산하는 순수 함수다.
- pending choice·전술전·장계·game over 같은 게임 중단 조건과 실제 `advanceTick` 호출은 App이
  담당한다.
- 현재 scheduler가 한 callback 안에서 여러 틱을 계산한 뒤 중단 조건을 만났을 때 남은 시간을
  버리는 의미까지 기준 테스트로 고정한다. 성능 작업에서 시간 진행 규칙을 몰래 바꾸지 않는다.

### App 게임 루프

- 33ms scheduler와 누적 시간/catch-up 계산은 첫 단계에서 유지한다.
- `n === 0`이면 App의 `bump()`를 호출하지 않는다.
- 한 callback에서 여러 서브틱을 처리해도 batch가 끝난 뒤 `bump()`는 한 번만 호출한다.
- `animRef.current`는 실제 서브틱이 하나 이상 진행됐을 때만 갱신한다.
- pending choice, 전술전, 장계, game over로 틱이 중단된 경우 실제 상태 변경 여부를 기준으로
  한 번만 렌더한다.

### GameCanvas RAF

- `App`이 `animationActive` 또는 동등한 boolean을 `GameCanvas`에 전달한다. 기준은 게임 화면,
  `speed > 0`, 전술 화면/장계 비활성이다.
- `GameCanvas`는 animationActive 전환 시 RAF를 하나만 시작하고, 일시정지·unmount·화면 이탈 시
  취소한다.
- 최신 `state`, `anim`, hover, 선택, 배치 preview는 refs에서 읽는다.
- App/부모 React 렌더 없이 `alpha`를 계산하고 지도 canvas만 다시 그린다.
- prop/interaction ref 동기화 effect와 RAF lifetime effect를 분리한다.
- pointermove는 raw 좌표를 ref에 기록한다. React tooltip/cursor 상태는 타일 또는 의미 있는 hover
  대상이 실제로 바뀔 때만 갱신한다.
- 픽셀 단위 툴팁 위치는 tooltip element ref를 RAF에서 `transform`으로 직접 갱신한다. 경작지
  프리뷰 요약의 내용은 사각형 크기가 바뀔 때만 React로 갱신하되 위치는 같은 RAF DOM 경로를
  사용해 마우스를 부드럽게 따라간다.
- 일시정지 중에는 연속 RAF를 돌리지 않는다. hover·선택·패닝·배치 preview처럼 시각 입력이
  바뀌면 `requestCanvasRender()`로 단발성 frame을 요청한다.
- `document.hidden`, 전술 화면, 게임 화면 이탈 시 RAF를 멈추거나 저빈도로 내리고 복귀 시 즉시
  한 프레임을 그린다.

### P1 부수 기능 체크

현재 App의 렌더 후 effect와 GameCanvas 지역 state에 기대는 동작을 P1에서 함께 확인한다.

- `sndRef`의 새 로그 증가 감지와 good/bad/raid/trade/weather 효과음.
- `setWeatherAmbient`의 날씨 앰비언트 전환.
- pending choice·전투 시작/종료·game over 효과음.
- 경작지 drag preview 사각형, 크기/비용/농부 수 요약, 지도 hover tooltip.
- 일시정지 중 굴뚝 연기·날씨·주민 보간이 정지하고, 입력으로 요청한 frame만 그려지는지.

### React 경계

- `TopBar`, `Minimap`, 관리 창 본문은 더 이상 보간 때문에 30fps로 렌더되지 않아야 한다.
- `React.memo`는 렌더 시계 분리 뒤에도 실제로 반복되는 컴포넌트에만 적용한다.
- callback identity 때문에 memo가 무효화되면 App handler를 `useCallback`으로 안정화하되,
  대규모 prop API 변경은 별도 커밋으로 분리한다.

---

## 6. 보이는 영역만 지도 렌더

### `SceneViewport`

새 순수 헬퍼 `src/render/sceneViewport.ts`를 둔다.

```ts
interface SceneViewport {
  pixelX: number;
  pixelY: number;
  pixelWidth: number;
  pixelHeight: number;
  tileMinX: number;
  tileMinY: number;
  tileMaxX: number;
  tileMaxY: number;
}
```

- `.canvas-wrap`의 `scrollLeft`, `scrollTop`, `clientWidth`, `clientHeight`로 계산한다.
- 월드 캔버스 경계로 clamp하고 한 타일 overscan을 적용한다.
- 스크롤·ResizeObserver·창 배치 변경 시 viewport ref만 갱신하고 RAF가 다음 프레임에 사용한다.
- DOM canvas의 `width/height`와 pointer 좌표계는 그대로 둔다.

### `renderScene` 계약

- `SceneOptions`에 viewport를 추가한다.
- `ctx.save()`/`clip()`으로 보이는 영역 밖의 paint를 막는다.
- 전체 `clearRect` 대신 viewport pixel rect만 지운다.
- terrain layer도 `drawImage`의 source/destination rect를 viewport로 제한한다.
- 건물·주민·동물·습격·사이트·표식은 tile/pixel bounds가 viewport와 겹치는 항목만 그린다.
- 밤낮·날씨 overlay와 fog도 viewport 크기/타일 범위만 처리한다.
- 패닝 중 새로 드러난 영역은 다음 RAF에서 반드시 초기화·재도색한다.
- hover/선택/배치 사각형이 overscan 경계에서 잘리지 않도록 stroke와 sprite 최대 크기를 고려한다.

### 프레임 파생값 snapshot

`version`이 바뀔 때 한 번만 다음 값을 만든 뒤 RAF 프레임들이 재사용한다.

- y축 기준 정렬된 건물 배열.
- `builtWallTileSet`, 활성 claim zone/site/habitat 목록.
- 건물 ID별 배정 작업자 배열과 주민 ID별 무기/기마 표시 자료.
- 활성 원정 목표·포식자 정찰자 ID Set.
- 지형/건물/탐색 시각 signature.

signature는 매 RAF가 아니라 실제 `version` 변경 때만 계산한다. `state.day` 자체를 지형 cache
key로 쓰지 않고, 계절/결빙 상태와 타일의 실제 시각 속성으로 만든다. 이 방식은 저장 스키마나
모든 지형 mutation call site에 새 dirty flag를 심지 않고도 과잉 무효화와 stale cache를 함께
피한다.

P3 기준선에서 5,184칸 signature 계산이 `scene-snapshot-build`의 10% 또는 p95 0.5ms를 넘으면
runtime-only `terrainVisualRevision`으로 교체한다. 이 경우:

- 저장되는 `GameState` 필드로 만들지 않고 `WeakMap<GameState, { identity, revision }>` 또는
  동등한 비직렬화 registry를 쓴다.
- 신규 게임/로드로 state 객체가 바뀌면 identity가 달라 첫 terrain layer를 강제 구축한다.
- 런타임 시각 지형 변경 지점인 벌목, 건설 개간, 숲 재성장, 광상 생성·전환·고갈을 모두
  `markTerrainVisualDirty(state)` 경로로 모은다.
- mutation 누락으로 stale cache가 생기지 않는 회귀 테스트를 추가한다.

### 정적 레이어 추가 조건

viewport culling 뒤에도 `2-buildings`가 지도 프레임의 20% 또는 p95 2ms를 넘을 때만 건물·사이트
정적 레이어를 별도 cache한다. 처음부터 다중 canvas 구조로 확대하지 않는다.

---

## 7. 탐색 안개와 미니맵

### 탐색 hot path

- `ensureExploration`의 지도 크기 검증은 `newGame`, 저장 로드/마이그레이션, 지도 교체 같은
  상태 경계에서만 수행한다.
- 정상화된 `GameState` 내부의 `isExplored`는 bounds-safe 배열 조회 한 번만 한다.
- `revealAround`는 새로 열린 칸이 있었는지 boolean 또는 count를 반환한다.
- `refreshExploration`도 변경 여부를 반환해 fog/minimap cache를 불필요하게 깨지 않게 한다.
- `isBuildingFootprintExplored`는 같은 호출 안에서 `ensureExploration`을 반복하지 않는다.

### 중복 제거

- `agentsTick`과 `advanceTick`의 두 `refreshExploration` 중 하나만 남긴다.
- 주민 이동이 모두 끝난 뒤 foreign site 공개 전에 한 번 수행하는 현재 `advanceTick` 위치를
  단일 책임 지점으로 삼는다.
- `agentsTick`이 직접 호출되는 테스트/도구가 탐색 갱신에 의존하는지 먼저 검색하고 필요한 경우
  테스트 helper에서 명시 호출하거나 `advanceTick` 계약으로 정리한다.

### Fog와 Minimap

- fog는 viewport 안의 타일만 조회한다.
- exploration signature가 바뀌지 않았으면 fog mask base를 다시 만들지 않는다.
- 미니맵의 지형·탐색·건물·사이트 base와 viewport/선택/펄스 overlay를 분리한다.
- base는 실제 `version` 또는 signature 변경 때만, viewport overlay는 스크롤/resize 때만 그린다.
- 원정 목표 pulse가 필요하면 작은 overlay만 RAF로 갱신하고 72×72 base를 다시 순회하지 않는다.

---

## 8. 광역 목표 경로탐색

### 목표 표현

`src/game/pathGoals.ts`에 순수 자료구조를 둔다.

```ts
interface GoalField {
  width: number;
  height: number;
  goals: readonly { x: number; y: number }[];
  goalMask: Uint8Array;
  heuristic: Int32Array;
}
```

- `goalMask[y * width + x]`로 목표 판정을 O(1)화한다.
- `heuristic`은 모든 목표를 초기 queue에 넣고 장애물을 무시한 8방향 **multi-source
  Dijkstra**로 한 번 구축하는 octile distance field다.
- 간선 비용은 직선 10, 대각선 14다. 일반 BFS는 사용하지 않는다.
- 첫 구현은 단순성과 검증 용이성을 위해 이진 힙을 쓸 수 있으며 복잡도는
  `O((V + E) log V)`다. field 구축이 다시 병목이 되면 작은 정수 가중치용 bucket/Dial queue로
  바꿔 맵 크기에 선형에 가까운 구축을 사용한다.
- 모든 실제 장애물을 무시하므로 A*에 admissible하며 목표가 128개를 넘어도 휴리스틱을 0으로
  내리지 않는다.
- 같은 좌표가 중복되지 않게 하고 좌표/ID 정렬로 생성 결과를 결정적으로 만든다.

### `findPath` API

- predicate-only API를 즉시 삭제하지 않고 작은 목표/기존 테스트용 wrapper로 남긴다.
- hot path는 `findPathToGoals(state, sx, sy, field, passable)`를 사용한다.
- 목표 목록이 이미 있는 건물·광상·하역·어부 목표는 전체 맵 `goalTiles` 스캔 없이 바로 field를
  만든다.
- 벌목·약초·사냥은 `agentsTick` 시작 시 관련 직업이 한 명 이상 있을 때만 base 후보를 한 번
  수집한다.
- 탐색 여부와 외국 세력 작업 허가는 base 후보 필터 단계에서 적용한다. 수동 명령의
  `unauthorizedSiteIds`처럼 주민별 조건이 다르면 base 후보를 공유하고 주민별 mask/filter만
  최소 비용으로 파생한다.
- 같은 `agentsTick` 안에서 동일 목표 조건의 주민은 같은 `GoalField`를 공유한다.
- 통행 predicate가 주민별로 달라도 heuristic은 장애물을 무시하므로 안전하게 공유할 수 있다.

### 반드시 보존할 페이블 최적화

- 최소 이진 힙과 lazy closed skip.
- 탐색 1회 안의 `passMemo`.
- 건물 상호작용 둘레의 precomputed Set/list.
- `PATH_FAIL_COOLDOWN_TICKS`와 런타임 Map.
- 운반 예약량·가용량·긴급 판정의 틱 집계.

### 후속 최적화 조건

- `r.path.shift()`는 경로 길이가 커질 때 O(n)이지만 현재 우선순위는 낮다.
- path 이동 비용이 계측상 `t1-agents`의 10%를 넘을 때만 reversed path 또는 runtime cursor로
  바꾼다. 저장 중인 `Resident.path` 형식을 먼저 바꾸지 않는다.
- 공통 flow field가 A*보다 실제로 유리한지는 `GoalField` 적용 뒤 expanded node 수를 보고
  결정한다.

---

## 9. 남은 틱 파생 계산

렌더와 경로 목표장 개선 뒤 프로파일을 다시 찍고 아래 순서로만 진행한다.

1. `collectHuntableTiles`
   - 사냥꾼/관련 수동 명령이 없으면 계산하지 않는다.
   - habitat·terrain signature가 같으면 이전 결과를 재사용한다.
2. `computeDefense`
   - 현재 스트레스 기준 약 0.225ms/틱이므로 선행 작업으로 당기지 않는다.
   - 주민 직업/건강/무기/건물 방어 상태가 바뀐 틱에만 계산하는 dirty 정책은 10% 이상으로
     올라올 때 적용한다.
3. 무기·기마 reconcile
   - 현재 스트레스 기준 약 0.08ms/틱이다. 의미 변화 위험이 있어 계측상 상승 전에는 유지한다.
4. TopBar/관리 창 파생값
   - App 30fps 렌더 제거 뒤에도 React commit p95가 높은 경우에만 `homeByResidentId`, 자원 그룹,
     부패 preview를 version 단위 selector로 묶는다.

---

## 10. 파일별 변경 계획

### 새 파일

- `src/render/sceneViewport.ts`
  - viewport clamp, tile bounds, overscan, 교차 판정 순수 함수.
- `src/ui/gameClock.ts`
  - elapsed/accumulator/catch-up에서 진행할 서브틱 수를 계산하는 순수 함수.
- `src/game/pathGoals.ts`
  - `GoalField`, goal mask, multi-source Dijkstra octile heuristic 생성.
- `tools/game/measure_runtime_performance.mjs`
  - 고정 시드 시뮬레이션·경로 벤치와 통계 출력.
- `tools/game/test_path_goal_fields.mjs`
  - 목표 mask/heuristic/최단경로/결정성 회귀.
- `tools/game/test_runtime_performance_structure.mjs`
  - 반복 호출 수와 hot-path 전체 맵 스캔 금지 같은 구조적 성능 회귀.
- `tools/game/test_scene_viewport.mjs`
  - viewport/overscan/clamp/culling 순수 테스트.
- `tools/game/test_game_clock.mjs`
  - scheduler elapsed/catch-up/accumulator/batch 동작 순수 테스트.

### 수정 파일

- `src/App.tsx`
  - 무조건 33ms `bump()` 제거, 실제 tick batch당 한 번 렌더.
- `src/components/GameCanvas.tsx`
  - canvas RAF, 최신 props/interaction refs, viewport 관찰, snapshot 수명.
- `src/render/renderer.ts`
  - viewport 제한 clear/draw/cull, snapshot 사용, terrain key 수정, fog hot path.
- `src/components/Minimap.tsx`
  - base/overlay redraw 경계 분리.
- `src/game/exploration.ts`
  - 상태 경계 검증과 O(1) 조회 분리, 변경 여부 반환.
- `src/game/agents.ts`
  - `GoalField` hot path, 직업별 틱 공유, 중복 exploration 호출 제거.
- `src/game/simulation.ts`
  - 탐색 갱신 단일 책임, 계측 유지.
- `src/game/workerSlots.ts`
  - snapshot용 건물별 작업자 index helper가 필요할 때만 추가.
- `package.json`
  - `measure:runtime` 스크립트 추가.
- 기존 관련 테스트
  - `test_exploration.mjs`, `test_agent_loiter_farming.mjs`, `test_manual_orders.mjs`,
    `test_hauler_priority.mjs`, `test_minimap_overlay_layout_ui.mjs`.

---

## 11. 구현 순서와 커밋 경계

- [ ] **Phase P0 — 병렬 변경 재확인과 영구 기준선.**
  - 최신 HEAD와 `agents.ts`, `App.tsx`, `GameCanvas.tsx`, `renderer.ts` diff를 다시 읽는다.
  - Fable 최적화와 다른 작업자의 은 경제·가축·스프라이트 변경을 목록화한다.
  - `measure_runtime_performance.mjs`와 계측 counter를 먼저 추가한다.
  - `npm run test:game`, `npm run build`, 3회 기준선을 기록한다.
  - 권장 커밋: `test: add repeatable runtime performance baseline`.

- [ ] **Phase P1 — App 렌더와 캔버스 보간 시계 분리.**
  - `gameClock.ts` 순수 함수와 scheduler 단위 테스트를 먼저 만든다.
  - App의 무조건 `bump()` 제거, tick batch당 1회 렌더.
  - GameCanvas RAF와 refs, `animationActive`, 일시정지 단발 redraw 도입.
  - 툴팁 위치는 RAF DOM transform, 내용은 의미 변화 시 React 갱신으로 분리한다.
  - 사운드 트리거·날씨 앰비언트·경작지 preview 체크리스트를 통과한다.
  - TopBar/Minimap/도크가 보간 때문에 렌더되지 않는지 counter로 확인한다.
  - 이 단계에서는 renderer 내부 그림 순서를 바꾸지 않아 동작 회귀 범위를 좁힌다.
  - 권장 커밋: `perf: decouple canvas animation from app renders`.

- [ ] **Phase P2 — viewport repaint와 draw culling.**
  - `sceneViewport.ts`와 순수 테스트.
  - clear/terrain copy/day-night/weather/fog를 visible rect로 제한.
  - 건물·actor·overlay bounds culling.
  - 지도 네 모서리와 빠른 패닝에서 빈 영역·잔상·클릭 오프셋이 없는지 확인한다.
  - 권장 커밋: `perf: render only the visible world region`.

- [ ] **Phase P3 — 탐색·미니맵·프레임 snapshot.**
  - `isExplored` O(1)화와 상태 경계 정상화.
  - 중복 `refreshExploration` 제거.
  - sorted buildings, wall set, worker index 등 version snapshot.
  - 미니맵 base/overlay 분리와 terrain signature cache.
  - 권장 커밋: `perf: cache scene derivations and exploration layers`.

- [ ] **Phase P4 — 광역 목표장 경로탐색.**
  - `pathGoals.ts`, `GoalField`, multi-source Dijkstra heuristic.
  - 건물·광상·하역의 명시 목표 목록 연결.
  - 벌목·약초·사냥 후보를 agentsTick당 공유.
  - 기존 힙/passMemo/쿨다운/운반 집계가 그대로인지 diff와 테스트로 확인한다.
  - 권장 커밋: `perf: share broad pathfinding goal fields`.

- [ ] **Phase P5 — 재계측 기반 잔여 병목.**
  - P1~P4 뒤 3회 프로파일을 다시 남긴다.
  - 10% 이상인 구간만 huntable/defense/UI selector 순으로 개선한다.
  - 이번 문서에 없는 대규모 알고리즘 변경이 필요하면 구현 전 문서를 갱신한다.
  - 권장 커밋은 실제 남은 구간별로 분리한다.

- [ ] **Phase P6 — 전체 검증과 배포 게이트.**
  - 전체 게임 테스트, 프로덕션 빌드, diff check.
  - 브라우저 30초 신규/스트레스/배속 시나리오.
  - 기준선과 최종 median/p95/max/counter를 이 문서에 기록한다.
  - 완료 조건을 만족하기 전에는 단순 체감 개선만으로 마감하지 않는다.

각 Phase는 별도 커밋으로 유지한다. P1이 React 부하를, P2가 canvas paint 부하를, P4가
시뮬레이션 spike를 담당하므로 회귀 시 해당 계층만 독립적으로 비교·되돌릴 수 있어야 한다.

---

## 12. 자동 테스트 명세

### 렌더 시계/구조

- `advanceGameClock`에 `msPerTick` 미만 elapsed를 100회 누적하면 합계 `ticksToAdvance`가 0이고
  accumulator만 정확히 남는다.
- 여러 틱 분량 elapsed와 catch-up 상한을 넣으면 기존과 같은 `ticksToAdvance`와 accumulator를
  반환한다.
- speed 0/1/3/10의 `msPerTick`과 고정 elapsed를 넣었을 때 기존과 같은 서브틱 수가 계산된다.
- 위 세 항목은 `gameClock.ts` 순수 함수만 대상으로 fake DOM 없이 Node에서 실행한다.
- App source/계측 회귀는 `ticksProcessed > 0`인 batch에서만 `bump()`가 한 번 호출되고,
  `ticksProcessed === 0`에서는 호출되지 않음을 별도로 확인한다.
- GameCanvas RAF는 animationActive 구간당 하나만 존재하고 pause/unmount/hidden 상태에서
  정리된다.
- 일시정지 중 hover·선택·패닝 입력 1회는 단발 redraw 1회만 만들며 연속 RAF를 시작하지 않는다.
- 툴팁 내용이 같아도 pointer 좌표가 움직이면 DOM transform은 RAF마다 최신 좌표를 따른다.
- Minimap base redraw 수가 canvas RAF 수에 비례하지 않는다.

### SceneViewport

- 72×72, 28px 월드에서 중앙·네 모서리·작은 viewport bounds가 정확하다.
- 음수 scroll과 우/하단 초과가 월드 경계로 clamp된다.
- overscan이 최소 한 타일이고 월드 밖으로 나가지 않는다.
- viewport 밖 actor/building은 draw 후보에 들어가지 않는다.
- 큰 sprite/선택 stroke가 경계에서 잘리지 않는다.

### 탐색

- 손상/크기 불일치 exploration은 new/load 경계에서 복구된다.
- 정상 상태의 `isExplored` 반복 조회는 map-size validator를 다시 호출하지 않는다.
- `refreshExploration`은 새 칸이 열린 경우만 changed를 반환한다.
- 한 `advanceTick`당 exploration refresh는 정확히 1회다.
- foreign site 공개 순서는 exploration refresh 뒤로 유지된다.

### 경로탐색

- `GoalField.goalMask`가 후보 좌표만 표시한다.
- heuristic은 모든 목표에서 0이고, 인접 칸의 octile lower bound가 정확하다.
- 목표가 128개를 넘어도 heuristic이 0 배열로 퇴화하지 않는다.
- 장애물·강·다리·외국 세력권·대각선 corner 규칙을 기존과 동일하게 지킨다.
- 건물 둘레·광상·하역·어부·벌목·약초·사냥 fixture에서 기존 목적지와 최단 비용을 유지한다.
- 같은 틱의 같은 직업 주민 N명이 목표를 찾아도 base GoalField 생성 횟수는 1회다.
- 막힌 주민은 실패 후 3서브틱 동안 전체 탐색을 재요청하지 않는다.
- 운반 우선순위 fixture의 선택 결과와 예약량은 변하지 않는다.

### 저장·결정성

- **새 구현을 같은 시드·명령으로 30일 두 번 진행했을 때** 핵심 state snapshot이 bit-for-bit
  동일하다.
  - day/subTick, 자원, 주민 위치·직업·생존, 건물, habitat, 사건 상태.
- 구버전과 새 구현의 30일 snapshot이 다르면 최초 발산 틱을 찾아 경로 후보와 비용을 기록한다.
  동일 비용 tie가 아닌 목적지·최단 비용·통행 규칙 차이는 회귀로 처리한다.
- 허용된 tie 발산이 있더라도 생존·총생산·핵심 자원 같은 밸런스 지표가 별도 허용 범위를
  벗어나면 회귀로 처리한다. 허용 범위는 P0 기준선 분산을 보고 구현 전에 수치로 확정한다.
- 저장 JSON에 RAF, viewport, snapshot, GoalField, perf counter가 포함되지 않는다.
- 기존 저장 로드와 현재 저장 round-trip이 그대로 통과한다.

---

## 13. 브라우저 인수 시나리오

1. 1280×720 신규 게임을 시작하고 1배속으로 30초 둔다.
   - App/TopBar/Minimap이 30fps React commit을 만들지 않는다.
   - 주민 보간과 굴뚝 연기·날씨는 계속 움직인다.
2. 같은 상태를 일시정지/재개한다.
   - 정지 시 시뮬레이션은 멈추고 UI 입력·패닝은 유지된다.
   - 정지 중 연속 canvas RAF가 없고 입력/상태 변경 때만 단발 redraw가 발생한다.
   - 재개 시 시간 폭주나 주민 순간이동이 없다.
3. 1/3/10배속을 전환해 하루 경계와 선택 사건에서 기존 시간 진행을 확인한다.
4. 지도를 네 모서리까지 빠르게 패닝한다.
   - 검은 빈 영역, 이전 프레임 잔상, 잘린 sprite, click offset이 없다.
5. 비·눈·눈보라·겨울 결빙·해빙 홍수를 강제해 viewport overlay 경계를 확인한다.
6. 미답사 경계를 따라 주민을 이동시킨다.
   - fog와 minimap이 같은 틱에 열리고 foreign site가 늦거나 일찍 노출되지 않는다.
7. 관리 창 6개, 미니맵, 선택 컨텍스트를 겹쳐 띄우고 이동/resize한다.
   - canvas RAF 때문에 창 포커스·드래그가 끊기지 않는다.
8. 주민 120명·건물 96동 스트레스 세이브에서 30초 실행한다.
   - 50ms long task가 없고 입력/패닝이 즉시 반응한다.
9. 벌목꾼·사냥꾼·약초꾼을 여러 명 한꺼번에 배정한다.
   - 첫 작업 시작 시 한 프레임 이상 멎지 않고 모두 유효한 목표로 이동한다.
10. 저장 후 새로고침해 같은 상태에서 성능과 시각 결과가 유지되는지 확인한다.

가능하면 P0과 P6에서 같은 카메라 위치·시드·기간을 녹화하고 Chrome Performance trace와
`window.__renderPerf` 요약을 함께 남긴다. 화면 녹화만으로 합격시키지 않는다.

---

## 14. 병렬 작업·충돌 방지

- 구현 시작 직전 아래 hot file의 최신 diff와 작성자를 다시 확인한다.
  - `src/App.tsx`
  - `src/components/GameCanvas.tsx`
  - `src/components/Minimap.tsx`
  - `src/render/renderer.ts`
  - `src/game/agents.ts`
  - `src/game/simulation.ts`
- 특히 `agents.ts`는 페이블의 최적화 결과를 기준으로 patch하며 파일 전체 교체를 금지한다.
- 은 경제·가축·신규 직업 작업이 `types.ts`, `constants.ts`, `config.ts`, `simulation.ts`를 바꾸면
  해당 변경을 먼저 보존하고 성능 코드를 최소 범위로 재적용한다.
- 다음 기존/병렬 산출물은 삭제·스테이징·커밋하지 않는다.
  - `backup_json/`
  - `debug_output/`
  - `debug_output_heuristic/`
  - `tools/game/debug-temp/`
  - `tools/render/generated/`
- 각 Phase 전후 `git status --short`, `git diff --check`, 대상 파일 diff를 확인한다.

---

## 15. 완료 조건

- 지속 프레임 저하의 원인이던 App 30fps 전체 렌더가 제거됨.
- 월드 canvas가 매 프레임 전체 2016×2016 영역을 clear/copy하지 않음.
- 미니맵 base와 관리 UI가 canvas 보간 주기로 재렌더되지 않음.
- 벌목·사냥·약초 광역 목표가 주민별 전체 맵 scan과 heuristic 0 경로를 사용하지 않음.
- 신규 게임과 120명·96동 시나리오가 §3 성능 목표를 만족함.
- pause/resume, 배속, 지도 입력, 탐색/fog, 저장 결정성이 유지됨.
- 일시정지 중 연속 canvas animation/paint가 발생하지 않으며 툴팁·경작지 preview는 부드럽게
  반응함.
- 페이블의 기존 A*/운반 최적화와 다른 작업자의 경제·가축·스프라이트 변경이 보존됨.
- `npm run test:game`, `npm run build`, `git diff --check` 통과.
- 최종 계측표와 브라우저 인수 결과가 이 문서에 기록됨.

---

## 16. 구현 기록 (2026-07-18)

### 반영한 범위

- **P0**: 재현 가능한 runtime 측정기와 렌더 구조 회귀 테스트를 추가했다.
- **P1**: App의 무조건 33ms `bump()`를 제거하고, 실제 simulation tick마다 한 번만 React를 갱신한다.
  canvas 보간은 독립 RAF로 옮겼으며 정지·숨김 상태에서는 연속 RAF를 중단한다. 툴팁 좌표도
  React state가 아니라 DOM transform으로 이동한다.
- **P2**: 2016×2016 canvas는 유지하되 viewport+한 타일 overscan만 clear/copy/clip하고,
  fog·배치 강조·건물·주민·사이트·시신을 visible bounds로 cull한다. 스크롤과 ResizeObserver가
  정지 상태에서도 단발 redraw를 요청한다.
- **P3(핵심 hot path)**: `isExplored`를 O(1) 배열 조회로 전환하고, `agentsTick`의 중복
  `refreshExploration`을 제거했다. 지형 layer key는 day/building count가 아니라 계절·결빙·실제
  지형 시각 signature를 사용한다.
- **P4(광역 채집 목표)**: `pathGoals.ts`의 multi-source octile Dijkstra field를 추가했다.
  벌목·약초·사냥·채광은 같은 state/일자 안에서 broad field를 재사용하고, 현재 답사·통행 가능한
  후보만 틱별로 좁힌다. 3명 미만의 초기 작업자 집단은 기존 A*를 유지해 신규 게임의 field 생성
  spike를 피한다. 건물 interaction goal도 명시 goal point를 A*에 전달해 전 지도 goal scan을
  피한다.

### 검증 결과

- `npm run test:game`: **93/93 통과** (476.5초).
- `npm run build`: 통과. 기존 bundle size 경고만 남아 있다.
- `test_path_goal_determinism.mjs`: 목표장 사용 직업 혼합으로 같은 시드 30일 snapshot 동일.
- 브라우저: 실행 중 `data-version`이 simulation tick에만 증가, 정지 후 6개 표본은 모두 동일,
  650ms 간격 정지 스크린샷은 byte-identical, 재개 후 simulation version 진행, console error 0건.
- 단독 기준선 측정의 최근 표본:
  - cold-first-path: 첫 tick **44.219ms**, 중앙값 **1.982ms**, p95 **28.697ms**.
  - 120명·96동 stress: 중앙값 **20.007ms**, 평균 **37.951ms**. 첫 field 생성이 포함된 첫 tick은
    **124.083ms**이며, 신규 게임의 소수 작업자 경로에는 field를 만들지 않아 별도로 보호한다.
  - 최초 P0 cold-first-path 첫 tick **167.667ms**, stress 첫 tick **322.072ms**와 비교해 큰 spike가
    줄었음을 확인했다. 벤치마크 환경의 JIT/CPU 변동이 있어 절대 ms는 단일 실행 합격 기준으로
    사용하지 않고, 구조 테스트와 반복 측정을 함께 본다.
