# 목책 연결(성벽화) + 문 계획

## 목표

1. 목책(palisade)을 이어 지으면 **인접한 목책끼리 벽으로 연결되어 보이게** (AoE 성벽 느낌).
2. 신규 건물 **문(gate)**: 벽 라인에 끼워 짓는 출입구 — **주민은 통과, 습격자는 통과 불가**.
3. 이에 맞춰 **완공된 목책은 주민도 통과 불가**로 변경 (지금은 주민이 벽을 그냥 걸어서
   지나다녀 문이 의미가 없다). 벽으로 두르면 문이 필수가 된다.

## 필수 배경

- `src/game/buildings.ts`: `BUILDING_DEFS.palisade`(cost wood 4, defense 3, unique false),
  `BUILD_MENU_ORDER`, `canPlaceOn`, `computeDefense`.
- 통행 규칙 두 벌:
  - 주민: `src/game/agents.ts` `isPassable()` — 현재 산/강만 막고 **건물은 안 막는다**.
  - 습격자: `src/game/raids.ts` `raiderPassable()` — 산 + 완공 목책을 막는다.
    `spawnRaiders()`의 공성 로직: 중심지까지 길이 없으면 `nearPalisade` 타일로 가서 siege.
- 렌더링: `src/render/renderer.ts`가 건물을 y순으로 `sprites.drawBuilding()` 호출.
  `BuildingDrawParams`(sprites.ts)에는 이웃 정보가 없다. atlas.ts는 생성 시트
  (`generatedBuildingAssets`)가 로드되면 그걸 우선 그린다 — 목책은 이 경로를 우회해야
  연결 모양을 그릴 수 있다.
- 참고: 강 오토타일(riverAutotile.ts)이 같은 문제(이웃 기반 연결)를 이미 푼 전례.

## 설계

### 1. 신규 건물 `gate` (`types.ts` BuildingTypeId, `buildings.ts`)

```
gate: { name: '목책 문', emoji: '🚪', desc: '목책 사이의 출입구. 주민만 드나들 수 있다.',
        cost: { wood: 6 }, buildDays: 2, defense: 2, placement: 'land', unique: false }
```
`BUILD_MENU_ORDER`의 palisade 옆에 추가. BuildMenu 카테고리(방어·군사)에도 포함
(src/components/BuildMenu.tsx의 types 배열).

### 2. 통행 규칙

- `isPassable()`(agents.ts): 타일에 **완공된 palisade**가 있으면 주민도 통과 불가.
  gate는 통과 가능 (건설 중인 목책은 지금처럼 통과 가능 — 건축가가 타일에 서서 짓는다).
- `raiderPassable()`(raids.ts): 완공 palisade **또는 gate** 통과 불가.
- `spawnRaiders()`의 `nearPalisade`/공성 판정에 gate 타일도 포함 (문 앞 공성 성립).
- ⚠️ **갇힘 문제**: 벽이 주민을 막게 되므로,
  - 문 없이 완전 포위된 링 안/밖의 주민은 `findPath`가 null → 기존 'stuck' 처리(task '갈 곳 없음')로
    죽지는 않지만 일을 못 한다. 배치 시점에 막을 수는 없으니(짓는 순서 문제) **철거 기능이 필수 동반**(§4).
  - **구버전 저장 마이그레이션**: 이미 목책 링을 두른 저장이 있다. saveLoad에서 특별 처리는
    하지 않는 대신(§4의 철거로 해결 가능), 로드 직후 로그 한 줄: "목책이 견고해졌습니다.
    이제 주민도 문으로만 드나들 수 있습니다."

### 3. 연결 렌더링

- `renderer.ts`: 건물 루프에서 palisade/gate에 한해 4방 이웃에 완공 palisade/gate가 있는지
  비트마스크를 계산해 `BuildingDrawParams.connections?: { n; e; s; w }`로 전달.
  (건물 수가 적으니 매 프레임 계산해도 되지만, 지형 레이어처럼 buildings.length 키로
  캐시되는 구조는 아님 — 건물은 매 프레임 그리므로 `Map<타일키>`를 프레임당 1회 만들어 조회.)
- `atlas.ts drawBuilding`: `p.type === 'palisade' || 'gate'`이면 생성 시트를 우회하고
  **절차 드로잉**으로 그린다 (1차 구현; 에셋화는 후속 폴리시):
  - 목책: 타일 중앙에 굵은 기둥, 연결된 방향으로 가로/세로 통나무 가로대 2줄
    (색: folk 팔레트 갈색 계열, 겨울엔 위에 눈 얹기 등은 선택).
  - 문: 양쪽 기둥 + 연결 방향 가로대 + 중앙에 밝은 문짝(열린 표현). 연결이 없으면 독립 문.
  - placeholderSprites 경로는 이모지 유지로 충분.
- 연결 판정 순수 함수 `palisadeConnections(buildings 또는 타일 조회, x, y)`는
  `src/render/` 또는 `src/game/`에 분리해 테스트 가능하게.

### 4. 철거 기능 (동반 필수)

- `simulation.ts`에 `demolishBuilding(state, x, y): string | null` — palisade/gate만 허용
  (다른 건물 철거는 범위 밖). 목재 절반 반환, 타일 buildingId 해제, defense 재계산.
- UI: 타일 선택 시 InspectorPanel 건물 정보에 "철거" 버튼 (palisade/gate 한정).
  App.tsx 콜백 패턴(onSetResidentJob 참고)으로 연결.

### 5. 밸런스/설계 메모

- gate defense 2 < palisade 3: 문이 약한 고리라는 직관 유지. 비용은 목재 6으로 벽보다 비싸게
  (문 남발로 벽 대체하는 것 방지 — 습격자만 기준으로는 문=벽이므로 가격로 차별화).
- 벽이 주민을 막으면 동선이 길어져 운반 효율이 떨어진다 — 이것이 "문 배치"를 고민하게 만드는
  핵심 재미. README 조작법에 한 줄 추가.

### 6. 테스트 — `tools/game/test_palisade.mjs` (기존 컴파일 패턴)

- isPassable: 완공 목책 불가/건설 중 가능/문 가능. raiderPassable: 목책·문 모두 불가.
- 완전 포위 링 + 문 1개: 주민 findPath가 문을 통과하는 경로를 찾는다.
- 문 없는 링: findPath null (stuck 처리 경로).
- spawnRaiders: 문만 있는 링 → 습격자는 문 앞 siege가 된다.
- palisadeConnections 비트마스크 (독립/일자/모서리/십자).
- demolishBuilding: 목재 반환·타일 해제·다른 건물 거부.
- `npm run build` + 노드 테스트 전체.

## 건드리지 않는 것

- 목책의 방어도 수치/공성 방어 배율(siegeDefenseMult), 다른 건물의 통행 규칙(계속 통과 가능),
  습격 무리 이동/전투 시스템.
