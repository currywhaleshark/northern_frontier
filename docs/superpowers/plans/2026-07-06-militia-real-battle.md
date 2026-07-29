# 민병대 소집 → 실제 전투 구현 계획

> **계획 상태:** 완료
> **상태 갱신:** 2026-07-29 — 민병 소집에서 실제 전투로 이어지는 흐름을 구현했다.

## 목표

습격 선택지에서 "민병대를 소집해 맞선다"를 고르면, 지금처럼 주사위 한 번으로 즉시 결과가
나오는 게 아니라 **지도 위에서 실제 전투가 벌어지게** 한다: 민병/파수꾼이 전선으로 달려가고,
몇 서브틱에 걸쳐 교전하며, 습격 무리 세력이 깎이는 것이 보이고, 그 결과로 승패가 갈린다.

## 현재 구조 (구현 전 반드시 읽을 것)

- `src/game/raids.ts`
  - `raidersTick()` (144행): 서브틱마다 습격 무리(`state.raiders: RaiderBand`)를 마을로 이동.
    도착하면 `openRaidChoice()`로 선택지 모달을 연다.
  - `resolveRaid()` (287행): 선택 결과 판정. `militia` 분기(312행)가 즉시 주사위
    `successP = defense / (defense + power)` 하나로 승패를 정한다. **이 분기를 교체한다.**
  - 보정 배율: 경보(`warnedDefenseMult` 1.25), 공성(`siegeDefenseMult` 1.15),
    눈보라/혹한(×1.2) — 새 전투에도 그대로 반영해야 한다.
  - 승리 효과: 명성 +5, 사기 +8, `changeRelation(militiaWin)`, 위협도 리셋.
  - 패배 효과: 부상 2~4명(심각도 30), `loot(0.2~0.3)`, 건물 파손 0~1채, 사기 -15,
    `changeRelation(militiaLoss)`. — 이 효과들은 전투 종료 시점으로 옮겨 재사용한다.
- `src/game/simulation.ts`
  - `advanceTick()` (162행): `state.pendingChoice`가 있으면 시뮬레이션 전체가 멈춘다.
    전투는 모달을 닫고 시뮬레이션이 돌아가는 상태에서 진행돼야 한다.
  - `resolveChoice()` (151행): 모달 선택 → `resolveRaid()` 호출 경로.
- `src/game/agents.ts`
  - `militiaTick()` (505행): 민병은 평시 군영/중심지에서 조련만 한다.
  - `watchmanTick()` (487행): 파수꾼은 방어 시설 순찰.
  - `agentsTick()` (538행): 직업별 틱 분기(585행 부근). 전투 중 징집된 주민은 여기서
    직업 틱 대신 전투 행동을 하도록 분기를 추가한다.
- `src/game/types.ts`: `RaiderBand`, `GameState`. `GameState`에 `battle` 필드를 추가한다.
- `src/render/renderer.ts`: `sprites.drawRaiders()`로 무리 렌더링. `size` 필드가 점 개수.
- `src/game/saveLoad.ts`: 구버전 저장 마이그레이션 패턴 있음 (없는 필드 기본값 채우기).
- `src/game/buildings.ts` `computeDefense()`: 방어도 = 건물 + 파수꾼×6 + 민병×12(군영 ×1.3).

## 설계

### 1. 전투 상태 (`src/game/types.ts`)

```ts
export type BattlePhase = 'muster' | 'clash';

export interface Battle {
  phase: BattlePhase;
  frontX: number;         // 전선 타일 (습격 무리 위치, 공성이면 목책 앞)
  frontY: number;
  initialPower: number;   // 시작 시 무리 전력 (승패 판정 기준)
  defenderIds: number[];  // 징집된 주민 id (민병 + 파수꾼)
  ticks: number;          // 경과 서브틱
  musterDeadline: number; // 집결 제한 (서브틱) — 넘으면 모인 인원만으로 개전
  faction: string;
  warned: boolean;
  siege: boolean;
}
```

`GameState`에 `battle: Battle | null` 추가. 모두 평범한 JSON 값이라 저장 호환은
`saveLoad.ts`에 `if (!('battle' in parsed)) parsed.battle = null;` 한 줄이면 된다.

### 2. 개전 (`src/game/raids.ts` → 새 모듈 `src/game/battles.ts` 권장)

`resolveRaid()`의 `militia` 분기를 `startBattle(state)`로 교체:

- `state.pendingChoice = null`로 모달만 닫고, **`state.raiders`는 유지**한다
  (기존 코드 376행처럼 null로 지우면 안 된다).
- `battle` 생성: 전선 = 무리의 현재 위치(공성이면 그 자리 그대로),
  `defenderIds` = 살아 있고 앓지 않는 `militia` + `watchman` 전원,
  `musterDeadline` ≈ 4~6 서브틱.
- 로그: "민병대가 소집되었습니다. ○○이(가) 마을 어귀에서 진을 칩니다." (`kind: 'raid'`)
- 위협도 리셋/쿨다운은 개전 시점이 아니라 **전투 종료 시점**에 처리.

주의: `raidersTick()`은 `state.battle`이 있으면 이동을 멈추도록 가드 추가
(무리가 전투 중에 중심지로 파고들면 안 된다). `openRaidChoice()`의 militia 설명문도
"실제 전투가 벌어집니다. 민병과 파수꾼이 출전합니다..." 식으로 갱신.

### 3. 전투 진행 — `battleTick(state, rng)` (새 모듈 `battles.ts`)

`advanceTick()`에서 `agentsTick()` 다음, `raidersTick()` 이전에 호출.

**muster 단계**
- 징집 주민은 `agentsTick()`의 직업 분기 대신 전투 이동을 한다:
  `battle.defenderIds.includes(r.id)`면 전선 앞 1~2타일 지점으로 `goTo`
  (기존 `goTo`/`findPath` 재사용, task = '출전 중').
- 전선 반경 2타일 안에 도착한 인원이 전체의 60% 이상이거나 `ticks >= musterDeadline`
  → `phase = 'clash'`, 로그 "전투가 벌어졌습니다!".
- 징집 대상이 0명이어도 개전은 허용 (건물 방어도만으로 싸우는 기존 동작 보존).

**clash 단계 — 서브틱마다 소모전**
- 방어 전력: `defense = computeDefense(state)`에 기존 배율 그대로
  (warned ×1.25, siege ×1.15, 눈보라/혹한 ×1.2).
- 무리 전력 감소: `band.power -= defense * (0.10 + rng() * 0.08)`
- 아군 피해: 확률 `band.power / (band.power + defense)`로 서브틱당 최대 1명 부상
  (기존 `injure()` 재사용, 심각도 ~12). 전선 근처 징집 주민 우선.
- 무리 점 개수 갱신: `band.size = Math.max(1, Math.min(6, 3 + Math.floor(band.power / 25)))`
  — 전력이 깎이면 화면에서 무리가 줄어드는 게 보인다.
- 종료 판정:
  - **승리**: `band.power <= initialPower * 0.35`
  - **패배**: `ticks`가 상한(예: clash 8서브틱)을 넘겼는데 `band.power > defense`
  - 상한 도달 + 애매한 상태면 잔여 전력 비교로 판정 (`band.power > defense` → 패배)

**밸런스 기준**: 기대 승률이 기존 `defense/(defense+power)`와 크게 어긋나면 안 된다.
위 계수(0.10~0.18 소모율, 0.35 붕괴선, 8틱 상한)로 시작해서 §6의 시뮬레이션
스크립트로 승률을 비교·튜닝할 것.

**종료 처리** — 기존 `resolveRaid()` militia 분기의 효과를 그대로 옮긴다:
- 승리: 명성 +5, `moraleShock(-8)`, `changeRelation(militiaWin)`, 로그.
  추가 부상은 주지 않는다 (전투 중 이미 발생).
- 패배: `loot(0.2 + rng()*0.1)`, `damageBuildings(0~1)`, `moraleShock(15)`,
  `changeRelation(militiaLoss)`, 로그. 추가 부상 1~2명 (도주전 피해).
- 공통: `state.threat = CONFIG.threat.afterRaidThreat`, `raidCooldown` 설정,
  `state.raiders = null`, `state.battle = null`, 징집 주민 `resetAgent()`.

### 4. 에이전트 연동 (`src/game/agents.ts`)

- `agentsTick()` 직업 분기 앞에: `state.battle && battle.defenderIds.includes(r.id)`
  → `battleAgentTick(state, r, ctx)` (muster: 전선으로 이동 / clash: 제자리, task '전투 중').
- 선택 사항(하면 좋음): 전투 중 비전투 주민은 `goToCenter()`로 대피 (task '대피 중').
  분량이 부담되면 생략 가능 — 핵심 아님.
- 부상으로 건강이 20 미만이 된 징집 주민은 `defenderIds`에서 빼고 중심지로 후송.

### 5. 렌더링 (`src/render/renderer.ts`)

- 전투 중 전선 주변 시각 효과 (renderScene의 습격 무리 그리기 근처에 추가):
  - clash 단계에서 전선 타일 주위에 먼지/충돌 이펙트 — 기존 날씨 파티클처럼
    `performance.now()` 기반 절차 효과면 충분 (흰/주황 점 튀기기, 반경 ~1.5타일).
  - 징집 주민은 이미 개별 렌더링되므로 추가 작업 불필요 (모여드는 게 그대로 보인다).
- `band.size` 감소는 기존 `drawRaiders`가 알아서 반영한다.

### 6. 테스트 / 검증

- `tools/game/test_battles.mjs` (기존 `tools/game/test_forest_habitats.mjs`의
  ts 트랜스파일 패턴 복사): 순수 함수 단위로 —
  - 소모 공식: 방어도가 높을수록 무리 전력이 빨리 깎인다.
  - 종료 판정: 붕괴선/틱 상한 각각에서 승패가 올바르게 갈린다.
  - 징집 0명이어도 개전·종료가 성립한다.
- 밸런스 스크립트(스크래치): 시드 200개 × (defense, power) 조합별로 새 전투를 돌려
  승률을 `defense/(defense+power)`와 비교 — ±10%p 안이면 합격.
- 수동 검증 (preview): 습격 발생 → 민병 선택 → 민병 점들이 전선으로 이동 →
  교전 이펙트 → 무리 점 감소 → 승/패 로그 확인. 전투 중 저장→불러오기 재개 확인.
- `npm run build` + 기존 노드 테스트 전부.

## 엣지 케이스

- **pendingChoice 상호작용**: 전투 중 새 습격/교역 제안이 열리면 안 된다.
  `checkRaidTrigger`는 이미 `state.raiders`로 가드되고, `maybeOfferTrade`에
  `state.battle` 가드 추가.
- **전투 중 겨울 언 강**: 이동 규칙은 기존 `isPassable` 그대로 쓰면 된다.
- **징집 주민 전멸/후송으로 0명**: clash는 건물 방어도만으로 계속 진행 (교착 방지
  틱 상한이 있으므로 무한 루프 없음).
- **저장/불러오기**: `battle`은 직렬화 가능한 평값만 담는다. 마이그레이션 한 줄 (§1).
- **게임오버/승리 판정과 충돌**: `checkEndConditions`는 endOfDay에서만 돌므로 그대로 둔다.

## 건드리지 않는 것

- militia 외 선택지(피난/공물/협상/봉수)는 기존 즉시 판정 유지.
- `computeDefense`, `loot`, `injure`, `damageBuildings`, `moraleShock`는 재사용만 한다.
- 습격 무리 스폰/이동/공성 로직은 변경 없음 (전투 중 이동 정지 가드만 추가).
