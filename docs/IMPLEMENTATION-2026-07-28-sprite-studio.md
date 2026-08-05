# 스프라이트 스튜디오 — 구현계획 (인수인계용)

> **계획 상태:** 완료
> **상태 갱신:** 2026-08-05 — P9에서 루트 배포 PNG의 런타임 참조 감사·시각 선별·보관함 이동을 Sprite Studio에 추가했다.

- 설계 원전: `DESIGN-2026-07-28-sprite-studio.md`
- 이 문서는 **판단 없이 그대로 구현 가능한** 수준을 목표로 한다. 여기 없는 세부는
  "기존 코드 관례를 따른다"가 답이고, 설계 취지와 충돌하는 지시가 있으면 이 문서가 우선이다.

## 0. 불변 조건 (전 단계 공통)

1. **P0~P2가 끝난 시점에 게임 화면은 1px도 달라지지 않는다.**
   비율 레지스트리가 절대값이 아니라 **상대 배율**(초기값 전부 `scale: 1, dy: 0`)이고,
   효과 레지스트리 초기값이 현재 하드코딩 공식의 등가 스냅샷이기 때문에 산수로 보장된다.
2. 게임은 **생성된 TS만** 읽는다. 런타임에 JSON을 fetch하지 않는다.
3. 생성 파일 머리에는 `tacticalSpriteMetrics.ts`와 같은 경고 주석을 단다:
   `// 이 파일은 tools/sprite-studio/generate_registries.mjs가 생성한다. 직접 수정하지 말 것.`
4. `npx tsc --noEmit`과 `npm run build`가 각 단계 완료 조건에 포함된다.
5. `npm run test:game`에는 **원래 실패하는 테스트 6개**가 있다:
   test_legacy_expectation_transition, test_resource_save_migration,
   test_runtime_snapshot_boundaries, test_selection_context_ui,
   test_tactical_deployment, test_tactical_support_units.
   이 목록 밖의 새 실패만 회귀로 간주한다.

## 1. 파일 구조 (신규)

```
tools/sprite-studio/
  data/
    display-metrics.json      # R1 편집 원본
    work-anchors.json         # R2
    building-effects.json     # R3
    worker-slots.json         # R4
    building-shadows.json     # R5
  generate_registries.mjs     # data/*.json → src/render/spriteStudioRegistries.ts
  vite.config.mts             # 스튜디오 dev 서버 (포트 5184)
  index.html
  src/                        # 스튜디오 UI (게임 번들에 포함되지 않음)
src/render/spriteStudioRegistries.ts   # 생성 파일 — 게임이 읽는 유일한 소비 지점
```

- npm 스크립트: `"edit:sprites": "vite --config tools/sprite-studio/vite.config.mts"`
- `launch.json`에 `{ "name": "sprite-studio", runtimeExecutable: "npm", runtimeArgs: ["run", "edit:sprites"], "port": 5184 }` 추가
- 스튜디오 vite 설정: `publicDir`를 저장소 `public/`으로 지정 (시트 PNG 로드),
  `src/render/*`·`src/game/*`를 상대 경로로 직접 import (스튜디오도 TS)

## 2. R1 — 표시 비율 레지스트리

### 2-1. 스키마

```jsonc
// tools/sprite-studio/data/display-metrics.json
{ "work.miner": { "scale": 1, "dy": 0 }, "walk.hunter": { "scale": 1, "dy": 0 }, ... }
```

```ts
// 생성 결과 (spriteStudioRegistries.ts)
export interface SpriteDisplayMetric { readonly scale: number; readonly dy: number }
export const SPRITE_DISPLAY_METRIC_KEYS: readonly string[];   // 코드가 아는 전체 키
export const SPRITE_DISPLAY_METRICS: Readonly<Record<string, SpriteDisplayMetric>>;
export function spriteDisplayMetric(key: string): SpriteDisplayMetric; // 없으면 {1, 0}
```

코드젠은 JSON에 있는 키가 `SPRITE_DISPLAY_METRIC_KEYS`에 없으면 **에러로 중단**한다
(오타 키가 조용히 무시되는 것을 막는다). 키 목록의 단일 원본은 아래 2-2의 적용
지점들이며, 코드젠 스크립트 안에 같은 목록을 상수로 두고 검증한다.

### 2-2. 적용 지점 — `src/render/atlas.ts`의 `drawResident` 경로

`drawResident`(atlas.ts:2457에서 시작, 본체는 :1140~1450 부근) 내부의 로컬 헬퍼
`draw(image, rect, textureScale)`가 목적지 크기의 유일한 관문이다. 여기와 형제
경로에 키를 끼운다:

1. `draw(image, rect, textureScale, metricKey)` — 4번째 인자 추가.
   내부에서 `textureScale × spriteDisplayMetric(metricKey).scale`,
   y 좌표에 `+ metric.dy` 적용
2. `drawWork`/`drawStationaryWork`는 `draw`에 위임하므로 키 인자만 관통시킨다
3. `drawResidentCellRect`(:944, common locomotion 폴백)에도 같은 적용
4. 별도 함수로 그리는 경로는 **함수 내부의 목적지 크기 계산 지점**에 같은 방식 적용:
   `drawApprovedI2VLocomotion`, `drawIdleVideoWalk`,
   `drawWoodcutterVideoWork`, `drawWoodcutterVideoWalk`

### 2-3. 키 명명 규칙과 목록

규칙: `<계열>.<직업>[.<변형>]`. **drawResident 안의 draw 호출 지점 하나당 키 하나.**

| 계열 | 키 예 | 대응 지점 |
|---|---|---|
| `common` | `common` | drawCommon 폴백 (공용 보행 시트) |
| `i2v` | `i2v.<job>` | drawApprovedI2VLocomotion (함수 내부에서 job으로 결정) |
| `video` | `video.idle.walk` / `video.woodcutter.work` / `video.woodcutter.walk.axe` / `video.woodcutter.walk.jige` | 각 비디오 시트 함수 |
| `jige` | `jige.<job>` | 지게 짐 분기 (:1194~) |
| `walk` | `walk.woodcutter` `walk.hunter` `walk.hauler` `walk.builder` `walk.herbalist` `walk.miner` | 각 직업 보행 시트 draw |
| `work` | `work.woodcutter` `work.hunter` `work.builder` `work.herbalist` `work.miner` `work.woodSplitter` `work.fisher` `work.herder` `work.charcoalBurner` `work.powderMaker` `work.undertaker` `work.curer` `work.potter` + switch문 뒤쪽 나머지 직업 전부 | drawStationaryWork 호출들 |
| `work.farmer` | `work.farmer.oxPlow` `work.farmer.harvest` `work.farmer.till` | farmerAction 분기 |
| `load` | `load.woodcutter` `load.hunter` `load.miner` | 운반 시트 |
| `cart` | `cart.hauler` `cart-load.hauler` | 수레 분기 |

switch문을 위에서 아래로 훑으며 **모든** draw/drawWork/drawStationaryWork 호출에
규칙대로 키를 붙이고, 그 최종 목록을 코드젠 상수와 data JSON 양쪽에 동일하게 넣는다.
(위 표는 :1186~1420 확인분 — potter 이후 분기가 더 있으니 끝까지 확인할 것)

참고: `residentOutdoorWorkAssets.ts:6`의 `RESIDENT_WORK_PRESENTATION_SCALE_BY_JOB`
(woodSplitter 1.12, miner 1.2, hunter 1.05)은 **그대로 둔다** — 레지스트리는 그 위에
곱해지는 상대 배율이다. 기존 상수를 옮기려 들지 말 것 (무변화 원칙이 깨진다).

### 2-4. 완료 기준

- 전 키가 `{1, 0}`인 상태에서 게임 실행 → 이전과 화면 동일 (육안 + 정렬대 스크린샷 비교)
- 임의 키 하나를 `{1.5, -4}`로 바꾸고 코드젠 → 해당 스프라이트만 커진 것 확인 → 되돌림

## 3. R2 — 작업 앵커 레지스트리

### 3-1. 스키마와 키

```jsonc
// work-anchors.json — 키: "<직업>@<서있는 타일 지형>"
{
  "miner@rock":        { "offsetX": 0, "offsetY": 0, "facing": 0, "toolTipX": 0, "toolTipY": 0 },
  "woodcutter@forest": { ... },
  "herbalist@forest":  { ... }
}
// facing: 0 = 기존 로직 유지, 1 | -1 = 강제. offset 단위는 px (TILE=28 기준)
// toolTip*: 게임은 읽지 않는다. 스튜디오 정합 표시 전용
```

v1 키는 위 3개로 한정한다 (타일 위에 서서 채집하는 직업). 초기값 전부 0 = 현행 유지.

### 3-2. 적용 지점 — `src/render/residentWorkLayout.ts`

`residentWorkStances`가 이미 "근무 중 + 정지" 주민의 렌더 전용 오프셋을 계산한다.
여기에 앵커를 합성한다:

1. 시그니처에 지형 조회를 추가: `residentWorkStances(residents, tileSize, excludedIds, terrainAt?: (x,y) => Terrain)`
   — renderer.ts 호출부(1곳)에서 `state.map` 클로저를 넘긴다
2. 각 주민의 기본 오프셋 = 앵커(`<job>@<terrainAt(r.x,r.y)>` 키가 있으면 그 offset) + 기존 벌리기 오프셋
3. `facing`이 1/-1이면 기존 facing 계산을 덮어쓴다
4. 키가 없으면 완전 현행 동작

주의: `residentWorkStances`의 입력 타입 `WorkLayoutResident`에 `job`이 없다 —
`Pick<Resident, ...>`에 `job` 추가 (호출부는 Resident 전체를 주므로 무해).

### 3-3. 완료 기준

- 앵커 전부 0에서 화면 동일
- `miner@rock`에 `offsetX: 10` 시험 → 채광꾼만 옆으로 비켜서는 것 확인 → 되돌림

## 4. R3 — 건물 효과 레지스트리

### 4-1. 스키마

```jsonc
// building-effects.json — 키: 건물 타입. 좌표는 건물 draw 원점 기준 px (TILE=28)
{
  "ondol": [
    { "kind": "chimneySmoke", "x": 24, "y": -13, "scale": 1, "when": "winterHeating" },
    { "kind": "windowGlow",   "x": 12.5, "y": 11.8, "scale": 1, "when": "night" }
  ],
  "smithy": [
    { "kind": "chimneySmoke", "x": 24, "y": -13, "scale": 1, "when": "working" },
    { "kind": "fireSparks",   "x": 19.6, "y": 19, "scale": 1, "when": "working" }
  ]
}
```

`when` 의미 (렌더러가 이미 계산하는 조건에 1:1 대응 — 새 조건을 만들지 않는다):

| when | 현재 조건 |
|---|---|
| `working` | `activeWorkerCount > 0` (renderer.ts:1568의 `workplaceActiveCountByBuilding`) |
| `night` | `night > 0.28` 램프 (renderer.ts:2326~) — 램프 계산은 코드에 남긴다 |
| `winterHeating` | 기존 `heating && built` (renderer.ts:1577) |
| `always` | 완공 시 항상 |

### 4-2. 초기 스냅샷 — 현재 공식의 등가값

`size = TILE × footprint`. 건물별 footprint는 `buildingFootprintDims` 기준.
아래 공식으로 **건물 타입별 px 초기값을 계산해 JSON에 넣는다**:

| kind | 현재 공식 (renderer.ts) | 초기값 계산 |
|---|---|---|
| `chimneySmoke` | `bx + size − 4, by − 13` (:514 drawChimneySmoke) | `x = size − 4, y = −13` |
| `fireSparks` | `bx + size×0.7, by + size×0.68` (:540~) | `x = size×0.7, y = size×0.68` |
| `craftGlint` | `bx + size×0.35, by + size×0.72` (:549~) | `x = size×0.35, y = size×0.72` |
| `serviceGlow` | drawWorkplaceActivity의 'service' 분기 — **구현 시 해당 분기를 읽고 같은 방식으로 등가값 산출** | 〃 |
| `windowGlow` | `size×0.5 − 1.5, size×0.42`에 3×3 사각형 (:2335~) | `x = size×0.5 − 1.5, y = size×0.42` |

대상 건물의 초기 목록:

- `windowGlow`: hut·ondol·center·garrison (:2331의 하드코딩 목록 그대로)
- `winterHeating` chimneySmoke: ondol·center (:1578)
- `working` 효과: `workplacePresentation.ts`의 activity가 fire인 건물 = chimneySmoke + fireSparks,
  craft = craftGlint, service = serviceGlow. 표를 순회해 기계적으로 생성

### 4-3. 렌더러 개조

1. 신규 `drawBuildingEffects(ctx, buildingType, buildingId, bx, by, size, flags: { working, night01, winterHeating }, workers)` —
   레지스트리 배열을 순회하며 kind별 그리기 함수 호출. **kind별 입자 애니메이션 수식은
   기존 함수의 것을 그대로 옮긴다** (연기 위상·불꽃 파티클 수·창불 3×3 크기 등).
   위치만 데이터에서 온다. `scale`은 입자 크기·범위에 곱한다
2. 호출부 교체 (전부 3곳):
   - :1577~1583 (겨울 난방 연기 + 작업 효과) → `drawBuildingEffects` 1회 호출로 통합
   - :2326~2339 (밤 창불빛 루프) → 루프 본문을 `windowGlow` 이미터 순회로 교체
3. 기존 `drawChimneySmoke`/`drawWorkplaceActivity`는 kind별 내부 함수로 분해 후 제거

### 4-4. 완료 기준

- 초기 JSON 상태에서: 겨울 밤 온돌집(연기+창불), 가동 중 대장간(연기+불꽃),
  가동 중 베틀집(반짝임)이 **개조 전과 동일 위치·동일 모양** (전후 스크린샷 비교)
- 이미터 하나를 옮기고 코드젠 → 해당 건물만 바뀌는 것 확인 → 되돌림

## 5. R4 — 작업자 슬롯 (v1: 장작마당 한정)

### 5-1. 스키마

```jsonc
// worker-slots.json — v1은 woodShed 키만 유효
{
  "woodShed": [
    { "tileDX": -1, "tileDY": 1, "offsetX": 0, "offsetY": 0, "facing": 1 },
    { "tileDX":  1, "tileDY": 1, "offsetX": 0, "offsetY": 0, "facing": -1 }
  ]
}
```

초기 데이터는 **빈 객체 `{}`** — 슬롯 미등록 = 현행 유지가 기본값이고,
위 예시 좌표는 스튜디오에서 실물을 보고 정한다.

### 5-2. 시뮬레이션 변경 — `agents.ts` 한 곳

`woodSplitterTick`(:1936)의 `goTo(state, r, ctx, buildingGoal(state, shed.id))`(:1942)를
신규 헬퍼로 교체한다:

```ts
function workerSlotGoal(state: GameState, r: Resident, building: Building): (t: Tile) => boolean {
  const slots = BUILDING_WORKER_SLOTS[building.type];   // 생성 레지스트리
  if (!slots || slots.length === 0) return buildingGoal(state, building.id);
  // 이 건물에 배정된 근무자를 id 오름차순 정렬 → 자신의 순번 = 슬롯 인덱스
  // (workerSlots.ts의 assignedSlotResidents를 재사용해 배정자 목록을 얻는다)
  const index = /* 자신의 순번 */;
  const slot = slots[index % slots.length];
  const sx = building.x + slot.tileDX, sy = building.y + slot.tileDY;
  const tile = state.map[sy]?.[sx];
  if (!tile || !isPassable(state, sx, sy)) return buildingGoal(state, building.id); // 폴백
  return describeGoal(t => t.x === sx && t.y === sy, [{ x: sx, y: sy }]);
}
```

- **woodSplitterTick 외의 호출부는 바꾸지 않는다** (운반꾼 하역, 다른 직업 전부 현행)
- 슬롯 칸 도착 = arrived → 기존과 같이 working 전환. 배정이 id 순 결정적이라
  두 근무자가 같은 슬롯을 다투지 않는다
- 폴백 조건: 슬롯 미등록 / 슬롯 칸이 지도 밖 / 통행 불가

### 5-3. 렌더 변경

renderer.ts의 `residentWorkStances` 호출부에서:

1. "슬롯 근무자" 집합 계산: `phase === 'working'` && 배정 건물에 슬롯 있음 &&
   현재 좌표가 자기 슬롯 칸과 일치
2. 이들은 `excludedResidentIds`로 벌리기에서 제외 (파라미터가 이미 있다)
3. 별도로 슬롯의 `offsetX/offsetY/facing`을 stance로 넣는다 (같은 Map에 추가)

### 5-4. 완료 기준

- 슬롯 미등록 상태에서 완전 현행 (장기 시뮬에서 장작 생산량 변화 없음 — 슬롯 칸이
  기존 인접 칸보다 멀 수 있으므로 등록 후에는 왕복이 미세하게 달라질 수 있다. 미등록 기준)
- woodShed에 슬롯 2개 등록 → 두 장작꾼이 항상 그 두 칸에서 작업, 시각적으로 고정 확인
- 슬롯 칸을 건물로 막으면 폴백 동작 확인

## 5b. R5 — 건물 그림자 레지스트리

### 5b-1. 현재 구조 (renderer.ts)

건물 그림자는 스프라이트 알파에서 구운 실루엣을 전단 변환으로 지면에 눕힌다
(`buildingShadowSilhouette` :2079, `drawWorldShadows`의 건물 루프 :2168~2204).
건물별 노브는 이미 하나 있다 — `COURTYARD_SHADOW_OVERRIDES`(:2076):

```ts
// 마당형 건물 — groundFrac: 시각 높이 중 마당(그림자 제외) 비율,
// anchorDepthFrac: 풋프린트 밑변에서 본채 접지선까지 물러날 깊이 비율
const COURTYARD_SHADOW_OVERRIDES = { center: { groundFrac: 0.33, anchorDepthFrac: 0.5 } };
```

이 상수를 레지스트리로 승격하고 노브를 넓힌다.

### 5b-2. 스키마

```jsonc
// building-shadows.json — 키: 건물 타입. 없는 타입 = standard 기본값
{
  "center":    { "mode": "courtyard", "groundFrac": 0.33, "anchorDepthFrac": 0.5, "lengthScale": 1 },
  "watchtower": { "mode": "standard", "groundFrac": 0, "anchorDepthFrac": 0, "lengthScale": 1 }
}
// mode: "standard" | "courtyard" | "none"(그림자 없음)
// lengthScale: 그 건물만 그림자 길이 배율 (shearX에 곱함, 기본 1)
```

초기 데이터: `center`의 courtyard 항목 하나만 (현행 스냅샷). 나머지는 파일에 넣지
않는다 = standard 기본값. **초기 상태 화면 무변화**가 이번에도 산수로 성립한다.

### 5b-3. 렌더러 개조

1. `COURTYARD_SHADOW_OVERRIDES` 상수 제거 → 레지스트리 조회로 교체 (:2185의 `courtyard` 변수)
2. `mode === 'none'`이면 그 건물 스킵 (루프 첫머리의 `isAreaBuildingType` 제외와 같은 자리, :2168)
3. `lengthScale`은 그 건물의 전단에만 곱한다 — 루프 안에서 `shearX × lengthScale`을
   지역 변수로 만들어 `reachTiles` 계산(:2172)과 transform(:2200)에 함께 사용
4. **바꾸지 말 것**: `lift`·`backOffset`·이중 스탬프 구조·나무/주민 그림자·
   `dayShadowFor`의 시간·계절·날씨 계산 (전부 전역 물리라 건물별 편집 대상이 아니다)
5. 건물별 alpha는 **의도적으로 넣지 않는다** — 그림자는 단일 레이어에 불투명하게 모아
   마지막에 한 번만 옅게 얹는 구조(:2057 주석)라, 건물별 투명도는 겹침 얼룩을 되살린다

### 5b-4. 스튜디오 — 탭 C 그림자 레이어

- 실루엣 투영 코드를 export 헬퍼로 추출해 (`drawBuildingShadowFor(...)` 등)
  스튜디오가 **실제 투영 코드**로 미리보기 — 모조 구현 금지
- 태양 슬라이더 (dayFrac 아침~저녁) + 계절 셀렉터로 그림자 길이·방향 변화를 훑으며 조절
- 편집 노브: mode 3택 / groundFrac 슬라이더(0~0.6) / anchorDepthFrac 슬라이더(0~1,
  courtyard일 때만 활성) / lengthScale 슬라이더(0.5~1.5)
- groundFrac·anchorDepthFrac 이해를 돕기 위해 실루엣 위에 잘리는 영역과 접지선을
  색선으로 오버레이

### 5b-5. 완료 기준

- 초기 데이터에서 개조 전후 화면 동일 (특히 중심지 — courtyard 경로가 유일하게 쓰이는 곳)
- 봉수대에 `lengthScale: 1.3` 시험 → 봉수대 그림자만 길어짐 → 되돌림
- `none` 시험 → 해당 건물 그림자만 사라짐 → 되돌림

## 6. 스튜디오 앱

### 6-1. 서버 (vite 플러그인)

`vite.config.mts`에 인라인 플러그인:

```
POST /api/save { registry: "display-metrics"|"work-anchors"|"building-effects"|"worker-slots"|"building-shadows", data: {...} }
  → tools/sprite-studio/data/<registry>.json 기록 (pretty-print, 키 정렬)
  → execFile("node", ["tools/sprite-studio/generate_registries.mjs"]) 실행
  → { ok: true } 또는 { ok: false, error }
GET /api/data → data/*.json 4종 일괄 반환
```

head_box_editor.mjs의 저장→재생성 흐름(:1~50 참조)과 같은 UX. 인증 없음(로컬 전용).

### 6-2. 공통 미리보기 기반

- 캔버스 배율 3배 (TILE 28 → 84px 표시), 픽셀레이트 (`image-rendering: pixelated`)
- `requestAnimationFrame` 루프에서 실제 draw 함수 호출 — 스프라이트 로딩은
  `src/render/atlas.ts`의 로더를 그대로 사용 (`getActiveSprites` 등 공개 API 우선,
  부족하면 필요한 로더 함수를 export로 승격 — 게임 동작 무영향 변경만 허용)
- 각 탭의 편집 결과는 즉시 로컬 상태로 미리보기에 반영, "저장" 버튼으로만 파일 기록

### 6-3. 탭 A — 비율 정렬대

- 전 키를 카드 격자로: 카드마다 `drawResident`를 mock 파라미터로 호출
  (키→mock 매핑: `work.miner` = `{ job:'miner', working:true, moving:false, gender }` 등.
  키 명명 규칙이 곧 mock 규칙이다). 남/녀 각 1체, 발끝 기준선 + 눈금
- 기준 실루엣: `common` 키의 정지 프레임을 반투명 40% 회색으로 모든 카드에 겹침
- 카드 클릭 → 우측 패널: scale 슬라이더(0.5~2.0, step 0.01) + dy 스피너(±20) +
  "애니메이션 재생" 토글 (animationTimeMs 진행/정지)
- 저장 시 display-metrics.json 전체 기록

### 6-4. 탭 B — 작업 자세

- 문맥 셀렉터 (`miner@rock` / `woodcutter@forest` / `herbalist@forest`)
- 장면: 3×3 타일 (drawTerrain으로 실제 지형), 중앙 칸에 대상물
  (rock 타일 + 광상 시각, forest 나무), 그 위에 작업 애니메이션 주민
- 주민 드래그 → offsetX/Y. facing 버튼 (기존/좌/우). 도구 접점 십자 드래그 (표시 전용)
- 다인 미리보기 토글: 같은 칸 2~4인일 때 벌리기 로직까지 합성해 표시
  (`residentWorkStances`를 그대로 호출)

### 6-5. 탭 C — 건물

- 건물 셀렉터 (효과 또는 슬롯이 유효한 타입 전부). 실제 `drawBuilding`으로 표시
- 상태 토글: 밤(night 0→1 슬라이더) / 가동(workers 0~4) / 겨울 난방
- **효과 레이어**: 이미터 마커 드래그, `+`(kind 선택 드롭다운) / `−`, scale 슬라이더,
  when 드롭다운. 효과는 drawBuildingEffects로 실시간 재생
- **슬롯 레이어** (woodShed 선택 시): 주변 칸 클릭으로 슬롯 배치/해제 (통행 불가
  칸은 회색 처리로 거부), 칸 내 드래그로 offset, facing 토글.
  슬롯마다 장작 패기 애니메이션 주민을 실시간 표시
- 저장은 레이어별 각각 (building-effects.json / worker-slots.json)

## 7. 작업 순서와 완료 체크리스트

| 순서 | 내용 | 완료 기준 |
|---|---|---|
| P0 | 코드젠 + 레지스트리 5종 골격 (전부 초기값) + R1 적용 | §2-4 |
| P1 | R2 적용 | §3-3 |
| P2 | R3 + R5 적용 (효과·그림자 데이터화) | §4-4, §5b-5 — **여기까지 화면 무변화** |
| P3 | 스튜디오 셸 + 서버 + 탭 A | 조절→저장→게임 dev 서버에서 확인 |
| P4 | 탭 B | miner@rock 정합 |
| P5 | 탭 C 효과·그림자 레이어 | 이미터 추가/제거/이동, 그림자 노브 |
| P6 | R4 + 탭 C 슬롯 레이어 | §5-4 — **유일하게 동작이 바뀌는 단계** |
| P7 | `miner@rock` 인접 대상 문맥 | 게임은 실제 인접 광상을 바라보고, 탭 B는 좌·우·상·하 대상 위치를 미리보기 |
| P8 | 인접 채광 가림 순서 | 위쪽 광부는 노두 뒤, 좌우·아래쪽 광부는 노두 앞에 보이며 게임과 탭 B가 같은 정렬 계약 사용 |
| P9 | 자산 정리 탭 | 직접·동적 참조를 구분하고 검증된 미사용 루트 PNG만 선택해 배포 폴더 밖 보관함으로 이동 |

P0~P2 커밋과 P3~P6 커밋을 분리하라. P0~P2는 게임 코드 리팩터,
P3~P5는 순수 툴 추가, P6만 게임 동작 변경이다.

### P7 완료 기준

- [x] `residentWorkStances`가 서 있는 지형과 별도로 실제 작업 대상 지형·좌표를 받을 수 있다.
- [x] 인접 채광 중인 광부는 `miner@rock` 앵커를 계속 적용하고 좌우 광상 방향을 바라본다.
- [x] 탭 B에서 광부는 중앙 통행 칸, 광상은 선택한 인접 칸에 표시되며 네 방향을 바꿔 확인할 수 있다.
- [x] 기존 벌목꾼·약초꾼의 같은 칸 작업 문맥과 저장된 앵커 데이터는 그대로 유지한다.

2026-08-02 검증: `npm run typecheck:sprites`, 작업 앵커·스튜디오 소스 회귀, 실제 탭 B의 오른쪽/왼쪽
광상 전환과 브라우저 콘솔 무오류를 확인했다.

### P8 완료 기준

- [x] 광부가 노두 위쪽 칸에서 작업하면 실제 깊이 관계대로 노두 뒤에 그려진다.
- [x] 광부가 노두 좌우 칸에서 작업하면 큰 노두에 깔리지 않고 노두 앞에 그려진다.
- [x] 광부가 노두 아래쪽 칸에서 작업하면 기존 행 정렬대로 노두 앞에 그려진다.
- [x] 게임 렌더러와 탭 B가 동일한 순수 정렬 계산을 사용하며 네 방향 회귀가 이를 고정한다.

2026-08-02 P8 검증: 작업 앵커·프레젠테이션·스튜디오 표적 회귀, `typecheck:sprites`, core
81/81과 배포 빌드를 통과했다. 탭 B의 좌우 광부는 큰 노두 앞에, 노두 위쪽 광부는 뒤에,
아래쪽 광부는 앞에 보이는 것을 네 방향 실화면으로 확인했다.

### P9 완료 기준

- [x] `public/assets/*.png` 전체를 코드·JSON 매니페스트의 직접 참조와 대조한다.
- [x] 계절 지형 24개와 지게 24개처럼 동적 경로로 로드하는 파일은 미사용으로 오판하지 않는다.
- [x] 미사용 후보를 실제 이미지·용량·대체 자산과 함께 Studio에서 선별할 수 있다.
- [x] 서버는 감사 시점에도 미사용인 파일만 허용하며 경로 이탈을 거부하고, 삭제 대신 날짜별 보관함으로 이동한다.
- [x] 기존 생성 원본과 하위 `events`·`ui`·`tactical` 자산은 건드리지 않는다.

2026-08-05 P9 검증: 루트 PNG 189개 중 직접 참조 122개·동적 참조 48개·미사용 후보
19개(약 2.0MB)를 분류했다. 자산 감사 회귀와 활성 주민 시트 무결성, `typecheck:sprites`를 통과했다.

## 8. 명시적 비범위 (하지 말 것)

- 전술 전투 스프라이트 (기존 `tacticalSpriteMetrics` 체계 유지 — 건드리지 않는다)
- 헤드박스 에디터 통합 (후속)
- 밭·논 농부의 위치 고정 (설계상 제외)
- woodShed 외 건물의 작업자 슬롯 활성화 (레지스트리는 범용이되 v1 데이터는 woodShed만)
- 세이브 데이터 변경 (이 작업 전체가 렌더·시뮬 목표 계산만 건드리고 저장 상태는 무변)
- 기존 상수(`RESIDENT_WORK_PRESENTATION_SCALE_BY_JOB` 등)의 레지스트리 이관
- 나무·주민 그림자와 태양 물리(`dayShadowFor`)의 편집 — 전역 시스템이라 대상 아님
- 건물별 그림자 투명도 — 단일 레이어 합성 구조상 겹침 얼룩을 되살리므로 금지 (§5b-3)
