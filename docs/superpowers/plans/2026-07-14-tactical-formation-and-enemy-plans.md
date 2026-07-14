# 전술전 확장 계획: 3열 진형·표적 지정·후방 교전선·적 사전 계책

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. 해당 스킬이 세션에 없으면 일반 TDD 방식(각 Task마다 테스트 선행 → 구현 → 회귀 확인)으로 진행한다. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 현재 전술전은 전장 구역(접근로→방어선→창고→중심지)과 부대별 명령까지만 지휘할 수 있다. 이를 다음 네 축으로 확장한다: (1) 각 구역 내부를 **전열/중열/후열** 3열로 나누고, (2) 후방 급습을 **별도의 두 번째 교전선**으로 승격해 예비대 대응을 만들고, (3) **표적 지정**을 총 피해량 재분배 방식으로 추가하고, (4) 적도 전투 생성 시 잠기는 **목적·계책(계책점수)**을 갖게 해 정찰-대비의 정보전을 만든다. 실시간 RTS화·개별 유닛 판정은 하지 않는다.

**Architecture:** 기존 구조가 이미 이 방향의 절반을 담고 있으므로 재사용을 우선한다.
- **피해 모델**: 현재도 개별 공격 판정 없이 구역별 `enemyShare/defenseShare` → 부대별 노출 보정으로 피해를 배분한다 (`resolveTacticalRound`). 표적 지정은 새 피해를 만들지 않고 **이미 산출된 구역 손실 예산의 배분 가중치만** 바꾼다.
- **적 계획 잠금**: `flankPlan`이 이미 전투 생성 시 결정적 RNG로 확정되고 `flankPlanRevealed`로 정찰 공개된다. 계책 시스템은 이 단일 값을 `enemyPlan.stratagems[]`로 일반화한 것이다.
- **후방 교전선**: `rearAssault` 플래그·`rearEnemyShare` 블렌딩·후방 압박 감쇠(`pressureDelta *= 1 - rearEnemyShare * 0.55`)·UI의 별도 급습 열(`tactical-rear-assault-rank`)이 이미 있다. 이를 "정면/후방 두 번의 교전 판정"으로 분리 승격한다.
- **열 이동**: `fallback`/`advance`가 이미 "이번 라운드 전투력 페널티 + `applyNextEngagementStates`에서 실제 이동" 패턴이다. 열 재배치(`redeploy`)는 같은 패턴에 `pendingLine`만 추가한다.
- **클릭 부담**: `commandSource: 'recommended' | 'player'`와 `tacticalCommandState.ts`의 미지정 순회 헬퍼 패턴을 표적(`targetSource: 'auto' | 'player'`)에 그대로 재사용한다.
- **판정 코드는 세 벌**(방어전 `tacticalBattle.ts` / 산채 공격전 `tacticalAssault.ts` / 맹수 사냥 `tacticalHunt.ts`)이다. **사냥은 포위망 모델이므로 이 확장 전체에서 제외한다.** Phase 1~4는 방어전 한정으로 완성하고, Phase 6에서 공격전에 이식한다.

**의도적으로 만들지 않는 것 (논의 확정):**
- `zone.rearPressure` 별도 필드 — 기존 `rearEnemyShare` 감쇠가 같은 문제를 이미 푼다.
- 부대별 명시 `facing` 필드 — 열 + 교전선 존재 여부에서 **파생**한다 (후방 교전 존재 시 후열은 후방, 전열은 정면, 중열은 명령으로 선택).
- 플레이어 화포의 열 표적 — 플레이어 화포는 사전포격 준비 행동뿐이므로 대상 아님.
- 실시간 이동·투사체·아군 오사 시뮬레이션.

**현재 코드의 출발점 (2026-07-14):**
- `TacticalFormationLine = 'front' | 'rear'` (types.ts). `line`은 부대(`TacticalDefenderGroup`) 속성이고 구역은 `zoneId`로 따로 있으므로, "구역별 3열"은 추가 자료구조 없이 유니언 확장만으로 성립한다.
- `resolveTacticalRound`(tacticalBattle.ts, 약 460줄 단일 함수)가 구역 순회·매복·사격·백병·피해 배분·압박·약탈·사기·전진 판정을 전부 담는다. 이대로는 후방 교전선·표적 재분배를 얹을 수 없다.
- 적 손실은 `raiderLossRate`(구역 공통) × `lossResistance`로 균일 배분. 아군 손실은 `commandPowerMultiplier`·`casualtyMultiplier`·`formationExposureMultiplier`·`rearAssaultExposureMultiplier`의 곱. 이 계수들이 2열 전제로 조율되어 있다 — **이 확장의 최대 리스크는 자료구조가 아니라 이 계수 재조정이다.**
- 적 그룹의 손실은 `killed`(누적 사망)와 `power`(잔여 전력) 두 값을 갱신해 기록한다. 표적 재분배 시 `killed` 배분과 `power` 감소율이 서로 어긋나면 궤주 판정(`power <= originalPower * 0.035`)이 왜곡되므로, 그룹에 배분된 같은 손실률로 두 값을 함께 갱신해야 한다.
- 저장: `migrateTacticalBattle`(saveLoad.ts)이 전투 중 저장을 복원한다. `line` 폴백이 `front/rear`만 허용한다(saveLoad.ts:623 부근). `migrateToCurrent`는 **미래 schemaVersion을 명시적으로 throw로 거절한다**(saveLoad.ts:72) — 저장 의미가 바뀌는 시점에 버전을 올리면 구버전 빌드가 새 저장을 조용히 훼손하는 대신 깔끔하게 거절한다. 리플레이 시스템은 없다 — 라운드 보고서는 이벤트 로그 저장이지 재시뮬레이션이 아니다.
- 적 그룹의 인원 모델: `count`는 **최초 편성 인원으로 불변**이고 생존자는 `count - killed`로 파생한다(tacticalBattle.ts:1298). 손실은 `killed` 증가 + `power` 감소로만 기록한다. 이 계획의 모든 손실 배분 작업은 이 모델을 따른다.
- 피난 주민 그룹은 `power: 0`, `commandable: false`, `lockedZoneId: 'center'`이며 전투 준비도(`tacticalDefenderReadiness`)·전투력 합산·명령 비율에서 제외된다. 이 불변식은 최근 수정으로 고정된 것이므로 교전 분리 리팩터가 깨뜨리지 않도록 테스트로 못 박는다.
- UI: `TacticalBattleScreen.tsx`(약 1,480줄)가 구역 스트립·부대 스프라이트·이벤트 재생을 인라인으로 담는다. 후방 급습대는 이미 별도 열로 렌더링된다.
- 테스트: `tools/game/test_tactical_battle.mjs`, `test_tactical_assault.mjs`, `test_tactical_hunt.mjs`, `test_resource_save_migration.mjs`, `test_tactical_sfx.mjs`가 회귀 기준선이다.

---

## Phase 0: 선행 리팩터 (밸런스 무변경)

이 페이즈의 모든 작업은 **판정 결과가 완전히 동일**해야 한다. 기존 테스트가 그대로 통과하는 것이 완료 조건이다.

### Task 0.1: 구역 교전 판정 함수 추출 (2층 분리)

**Files:**
- Create: `tools/game/test_tactical_golden.mjs` (golden characterization — 리팩터 **전에** 작성·채록)
- Modify: `src/game/tacticalBattle.ts`
- Create: `src/game/tacticalEngagement.ts`
- Modify: `tools/game/test_tactical_battle.mjs`

- [ ] **선행: golden 채록.** 리팩터에 손대기 전에 고정 시드 시나리오(세력 4종 × 경보 유무 × 후방 급습 유무 조합 최소 6종)로 전투 전 라운드를 자동 진행시키고, 라운드별 보고서(부대별 wounded/killed, 적 killed/power, 구역 pressure/breached, 사기 델타, 이벤트 kind 순서, 약탈 내역, 최종 outcome)를 JSON fixture로 채록해 커밋한다. 이후 모든 Phase 0 작업의 완료 조건은 이 golden과의 완전 일치다.
- [ ] fixture 갱신 정책: 기본 테스트 실행은 체크인된 JSON fixture를 **읽기 전용**으로 비교만 한다. 재채록은 명시적 플래그(예: `node tools/game/test_tactical_golden.mjs --update`)에서만 허용해, 회귀가 fixture 덮어쓰기로 조용히 통과되는 일을 막는다. 재채록은 의도된 밸런스 변경 Phase(1.2, 2.2, 3.3)에서만 수행하고 diff를 커밋 메시지에 남긴다.
- [ ] 공통층 `resolveEngagementExchange` 추출: 입력(참여 아군·적 그룹 스냅샷, 구역 보정, 명령, RNG) → 출력(아군 부대별 피해 배분, 적 그룹별 손실 배분(killed 증가분·power 감소율), 사기 델타, 전투 이벤트). **전력 교환과 피해 예산만 담당**하고 방어전 전용 개념(압박·약탈·돌파)은 알지 못한다 — Phase 6에서 공격전이 이 층만 재사용한다.
- [ ] 방어전층 `applyDefenseZoneConsequences`: 압박 델타·돌파 판정·약탈(`addLoot`)·건물 피해·`dominance`/`defenderReadiness` 기록(적 진격·궤주 판단 입력값)을 담당한다.
- [ ] 상태 변경의 귀속을 명시한다: `revealed`/`confused`/`ambushed` 갱신, 매복 후 강제 `fallback` 전환, 명령 무효화는 **호출자(`resolveTacticalRound`)가 두 층의 출력을 받아 적용**한다. 두 층은 입력을 변형하지 않는다.
- [ ] 정면 전력 합산·`rearEnemyShare` 블렌딩·노출 보정 수식은 1비트도 바꾸지 않는다.
- [ ] 회귀 검증: golden 완전 일치 + 기존 `test_tactical_battle.mjs` 통과.

### Task 0.2: `flankPlan` → `enemyPlan` 구조 이관

**Files:**
- Modify: `src/game/types.ts`
- Create: `src/game/enemyPlan.ts`
- Modify: `src/game/tacticalBattle.ts`
- Modify: `src/game/saveLoad.ts`
- Modify: `src/components/TacticalBattleScreen.tsx` (flankerIntel 표기 경로만)
- Modify: `tools/game/test_tactical_battle.mjs`, `tools/game/test_resource_save_migration.mjs`

- [ ] 자료형 추가 (전부 선택 필드 — 구버전 저장은 `undefined`로 안전):
  ```ts
  type EnemyObjectiveId = 'breakthrough';   // 목적 ID — Phase 4에서 'plunder' | 'arson' 추가
  type EnemyStratagemId = 'rearManeuver';   // Phase 4에서 5종으로 확장
  interface EnemyStratagemState {
    id: EnemyStratagemId;
    revealed: boolean;          // 정찰로 플레이어에게 공개됐는지
    counterLevel: 0 | 1 | 2;    // 미대응 / 부분 대응 / 완전 대응 (Phase 4에서 사용)
  }
  interface EnemyPlan {
    objective: EnemyObjectiveId;
    objectiveRevealed: boolean;
    stratagemPoints: number;    // 계책점수 — Phase 4 전까지는 기록용
    stratagems: EnemyStratagemState[];
  }
  // TacticalBattle.enemyPlan?: EnemyPlan
  ```
  기존 `flankPlan` 2값의 대응: `'rearAssault'` → `rearManeuver` 계책 **보유**, `'breakthrough'` → `rearManeuver` **부재**(계책 0개, 기본 정면 돌파). `frontalPush` 같은 무의미 계책은 만들지 않는다 — `breakthrough`는 목적 ID로만 존재한다.
- [ ] `raiderGroups()`의 flankPlan 결정 로직을 `enemyPlan` 생성으로 옮기고, 기존 `flankPlan`/`flankPlanRevealed` 그룹 필드는 `enemyPlan`에서 파생해 채운다(당분간 이중 기록 — 판정 코드는 기존 필드를 계속 읽는다). 파생 규칙: `stratagems`에 `rearManeuver`가 있으면 `flankPlan = 'rearAssault'`, 없으면 `'breakthrough'`.
- [ ] 계획 확정 시점은 `createTacticalBattle` 내부(준비·배치 단계보다 앞) 그대로 유지. RNG 시드도 기존 `flankRoll` 방식 유지 — **결과가 동일한 습격은 이관 후에도 동일한 계획을 갖는다.**
- [ ] `migrateEnemyPlan` 필드 단위 검증 (Phase 0에 포함 — Phase 0 결과물이 단독으로 저장 안전해야 한다): `objective`가 화이트리스트 밖이면 `'breakthrough'`로, 알 수 없는 stratagem ID는 해당 항목만 제거, `counterLevel`이 0|1|2가 아니면 0으로, `revealed`/`objectiveRevealed`가 boolean이 아니면 false로 복구한다. `enemyPlan`이 아예 없거나 검증 후 비면 그룹의 `flankPlan`에서 합성한다. 어떤 경우에도 전투 전체를 버리지 않는다.
- [ ] 회귀 검증: 고정 시드에서 이관 전후 flankPlan 결과 동일, 전투 중 구버전 저장 로드 시 enemyPlan 합성 확인.

### Task 0.3: 전술 화면 구역·부대 컴포넌트 추출

**Files:**
- Modify: `src/components/TacticalBattleScreen.tsx`
- Create: `src/components/tactical/TacticalZoneColumn.tsx`
- Create: `src/components/tactical/TacticalGroupChip.tsx`
- Modify: `src/styles/global.css` (선택자 이동만)

- [ ] 구역 렌더링(배경·압박 바·방책·화재·급습 열·부대 필드)을 `TacticalZoneColumn`으로, 부대 독의 칩(라벨·인원·명령·열 표시)을 `TacticalGroupChip`으로 추출한다. DOM 구조·클래스명은 유지해 CSS 회귀를 막는다.
- [ ] 시각 검증: 방어전·공격전·사냥 각 1회를 미리보기로 열어 배치/연출이 기존과 동일함을 확인한다.

---

## Phase 1: 3열 자료구조와 화면

### Task 1.1: `middle` 열 추가와 저장 호환

**Files:**
- Modify: `src/game/types.ts` (`TacticalFormationLine = 'front' | 'middle' | 'rear'`)
- Modify: `src/game/tacticalBattle.ts` (`defaultFormationLine`, `setDefenderFormationLine`)
- Modify: `src/game/saveSchema.ts` (`CURRENT_SCHEMA_VERSION` 7 → 8)
- Modify: `src/game/saveLoad.ts` (`migrateV7ToV8`, line 폴백)
- Modify: `tools/game/test_resource_save_migration.mjs`

- [x] 유니언에 `'middle'` 추가. 기본 배치 규칙 변경: 창병·민병·파수꾼 → 전열, 조총 → **중열**, 각궁·사냥꾼·피난 주민 → 후열. (기존 저장의 front/rear 배치는 그대로 유효 — 강제 이전하지 않는다.)
- [x] **schemaVersion 7 → 8 인상.** `'middle'`이 저장에 처음 기록되는 시점이므로 버전을 올린다 — `migrateToCurrent`가 미래 버전을 throw로 거절하므로(saveLoad.ts:72), 인상해야 구버전 빌드가 새 저장을 line 폴백으로 조용히 재작성하는 대신 명시적으로 거절한다. `migrateV7ToV8`은 통과 마이그레이션(필드 변형 없음)이다.
- [x] `migrateTacticalBattle`의 line 폴백에 `'middle'` 허용 추가. 이후 Phase에서 추가되는 저장 필드(`pendingLine`, `focusTargetGroupId`/`focusTargetSource`, `enemyPlan`)도 각각 엄격 검증한다: 알 수 없는 값·존재하지 않는 그룹 ID는 **해당 필드만** 안전 초기화(`undefined`/`auto`)하고 전투 전체를 버리지 않는다.
- [x] 저장 테스트: v7 저장(front/rear) 로드, v8 저장 로드, 미래 버전(v9) 거절, 잘못된 line 값 폴백을 모두 검증한다.
- [x] 산채 공격전(`makePlayerGroup`)의 기본 열도 같은 규칙으로 갱신하되, 공격전 판정의 3열 반영은 Phase 6까지 보류(중열은 당분간 후열과 동일 취급).

### Task 1.2: 3열 노출·차폐 계수 재조정

**Files:**
- Modify: `src/game/tacticalEngagement.ts`
- Modify: `src/game/config.ts` (계수를 CONFIG.tacticalBattle로 승격)
- Modify: `tools/game/test_tactical_battle.mjs`

- [x] `formationExposureMultiplier`를 3열로 확장: 정면 접촉 순서 전열→중열→후열. 전열이 건재하면 중·후열 노출 감소, 전열 궤멸 시 중열이 접촉 열로 승격. 하드코딩된 배율(0.42/1.25/1.45/1.7 등)을 CONFIG로 옮겨 조정 가능하게 한다.
- [x] `rearAssaultExposureMultiplier`를 역순(후열→중열→전열)으로 확장. 후열 근접병의 급습 차단 역할(현재 `rearMeleeGuard`)은 유지하되 중열 근접병도 부분 기여하게 한다.
- [x] 밸런스 실측: 고정 시드 20판(세력 4종 × 경보 유무 등)의 평균 아군 사상·적 처치·판정 결과 분포가 2열 기준선에서 ±15% 이내인지 확인하고 계수를 맞춘다. 기준선 수치는 이 작업 시작 시점에 스크립트로 채록한다.
  - 실측 스크립트: `node tools/game/measure_tactical_formation_balance.mjs`
  - 2열 기준선(중열을 후열로 강제): 평균 아군 사상 3.15명, 평균 적 처치 7.40명, 부분 손실 18회·방어 성공 2회.
  - 3열 결과: 평균 아군 사상 2.95명(-6.35%), 평균 적 처치 7.40명(0%), 부분 손실 18회·방어 성공 2회. 두 핵심 평균 모두 ±15% 게이트 이내이며 판정 결과 분포는 동일하다.

### Task 1.3: 3열 세로 쌓기 렌더링

**Files:**
- Modify: `src/components/tactical/TacticalZoneColumn.tsx`
- Modify: `src/components/TacticalBattleScreen.tsx` (배치 단계 열 선택 UI)
- Modify: `src/styles/global.css`

- [x] 구역 내부를 `적 후열│중열│전열│교전선│아군 전열│중열│후열` 세로 칸으로 렌더링하고, 같은 열의 부대는 위아래로 쌓는다. 공격전은 방향 반전(기존 `assault` 클래스 활용).
- [x] 화면 밀도 대책: 포커스 구역(`currentZoneId`)만 3열 확대, 비포커스 구역은 기존 압축 표시 유지.
- [x] 부대 칩에 열 표시를 `전열/중열/후열`로 갱신. 배치 단계에서 열 이동 버튼 3값 지원(`onSetFormationLine` 경로 재사용).
  - 시각 검증(1280px): 방어전·산채 공격전 방향, 같은 열 3개 부대 세로 적층, 3개 열 버튼, 본문·전장 가로 넘침 없음 확인.
- [x] 시각 검증: 미리보기로 방어전·공격전 배치와 3열 방향을 확인. 후방 급습 전용 연출은 기존 별도 급습 랭크를 유지하며, 교전선 분리는 Task 2.2에서 검증한다.

---

## Phase 2: 재배치·후위 경비·후방 교전선

### Task 2.1: `redeploy` 명령 (인접 열 이동)

**Files:**
- Modify: `src/game/types.ts` (`TacticalCommandId`에 `redeploy`, `TacticalDefenderGroup.pendingLine?`)
- Modify: `src/game/tacticalBattle.ts` (`IMPLEMENTED_COMMANDS`, `tacticalCommandUnavailableReason`, `commandPowerMultiplier`, `applyNextEngagementStates`, `tacticalCommandDescription`)
- Modify: `src/components/TacticalBattleScreen.tsx` (명령 목록 + 목표 열 선택)
- Modify: `src/game/saveLoad.ts` (`TACTICAL_COMMANDS` 집합)
- Modify: `tools/game/test_tactical_battle.mjs`

- [x] `redeploy`: 지휘 단계에서 목표 열(인접 열만)을 함께 지정. 해당 라운드 전투력 배율 0.35(advance 0.45 대비 소폭 낮음), 라운드 종료 후 `applyNextEngagementStates`에서 `line = pendingLine` 적용 — fallback/advance와 동일 패턴.
- [x] 피난 주민(`commandable === false`)은 대상 제외. 한 라운드에 열 이동과 구역 이동(fallback/advance)을 동시에 할 수 없다.
- [x] 테스트: 인접 열 제한, 라운드 페널티, 이동 적용 시점, 전투 중 저장·복원.

### Task 2.2: 후방 급습을 별도 교전 판정으로 승격

**Files:**
- Modify: `src/game/types.ts` (`TacticalCommandId`에 `reinforceRear`)
- Modify: `src/game/tacticalEngagement.ts`
- Modify: `src/game/tacticalBattle.ts` (`IMPLEMENTED_COMMANDS`, `tacticalCommandUnavailableReason`, `commandPowerMultiplier`, `tacticalCommandDescription`)
- Modify: `src/game/saveLoad.ts` (`TACTICAL_COMMANDS` 집합에 `reinforceRear` 추가)
- Modify: `src/components/TacticalBattleScreen.tsx` (명령 버튼·라벨)
- Modify: `tools/game/test_tactical_battle.mjs`

- [x] 신규 명령 `reinforceRear` 정식 등록: `TacticalCommandId` 유니언, `IMPLEMENTED_COMMANDS`, saveLoad의 `TACTICAL_COMMANDS`, `tacticalCommandDescription` 설명 문구, UI 명령 버튼. 사용 가능 조건(`tacticalCommandUnavailableReason`): 같은 구역에 후방 교전이 존재 + 근접 능력 보유 + 중열 배치.
- [x] 구역에 `rearAssault` 적이 있으면 Task 0.1의 `resolveEngagementExchange`를 **두 번 호출**한다: 정면 교전(비급습 적 vs 정면 대응 부대), 후방 교전(급습 적 vs 후방 대응 부대). 기존 `rearEnemyShare` 블렌딩 코드는 제거한다.
- [x] 부대의 대응 방향은 파생 규칙으로 정한다: 후방 교전이 존재하면 후열은 후방, 전열은 정면. 중열은 명령으로 결정 — `hold`/`volley` 등 일반 명령이면 정면, `reinforceRear`면 후방. 한 부대는 한 라운드에 한 교전에만 기여한다.
- [x] **피난 주민 불변식을 테스트로 고정**: 피난 주민(`commandable === false`, `power: 0`)은 정면/후방 어느 교전의 전투 부대로도 배정되지 않고, 전투력·준비도·명령 비율에 기여하지 않으며, 후방 교전 패배 시 **피해 대상으로만** 남는다. 중심지 고정(`lockedZoneId`)도 유지.
- [x] 압박은 정면 교전에서만 발생시킨다(후방 급습으로 목책이 무너지지 않는 원칙을 구조로 보장). 후방 교전의 패배는 후열 사상·주민 위험·마을 사기 하락으로만 반영한다.
- [x] 후방 교전 소멸 조건: 급습대 궤주·전멸 또는 자체 목표 달성 후 이탈. 기존 `rearAssault` 진입 연출(`rearAssault` 이벤트)은 유지.
- [x] 테스트: `reinforceRear`의 기본 추천 명령 채움(`chooseDefaultTacticalCommands`), 전투 중 저장·복원(구버전 명령 집합과의 호환), 사용 불가 사유.
  - 실측 스크립트: `node tools/game/measure_tactical_rear_engagement_balance.mjs` (각 조건 20개 고정 시드).
  - 후열 창병 경비: 주민 사상 0.55명, 적 잔여 전력 16.01, 적 처치 0.30명, 마을 사기 변화 -0.95.
  - 중열 `reinforceRear` 예비대: 주민 사상 0.80명, 적 잔여 전력 16.17, 적 처치 0.25명, 마을 사기 변화 -1.40.
  - 무대응: 주민 사상 3.15명, 적 잔여 전력 16.91, 적 처치 0.05명, 마을 사기 변화 -12.00.
- [x] 밸런스 실측: `rearManeuver` 계획 시드에서 (a) 후열에 창병을 미리 둔 경우, (b) 중열 예비대를 `reinforceRear`로 돌린 경우, (c) 무대응의 세 시나리오가 문서의 상충 관계 표대로 차등 결과를 내는지 확인한다.

### Task 2.3: 긴급 후방 대응 선택지 정리

**Files:**
- Modify: `src/game/tacticalBattle.ts` (`chooseDefaultTacticalCommands`, `tacticalCommandUnavailableReason`)
- Modify: `src/components/TacticalBattleScreen.tsx`
- Modify: `tools/game/test_tactical_battle.mjs`

- [x] 급습 발생 구역에서 가능한 대응을 명령 조합으로 노출한다: 중열 `reinforceRear` / 전열 `redeploy`(→후열, 정면 압박 증가 감수) / 원거리 자체 대응(후방 교전에 자동 편입되되 근접 노출 큼) / 무대응. 신규 시스템을 만들지 않고 2.1·2.2의 조합으로 성립시킨다.
  - 지휘 패널의 대응 카드에서 중열 예비대·후열 쪽 재배치·후열 원거리 대응 부대로 바로 선택을 이동하며, 무대응의 주민 피해 위험도 함께 표시한다.
- [x] `chooseDefaultTacticalCommands`: 급습 발생 시 중열 근접 예비대가 있으면 `reinforceRear`를 추천 명령으로 채운다.

---

## Phase 3: 표적 지정 (피해 재분배)

### Task 3.1: 구역별 화력 집중 표적 (v1)

부대별 표적이 아니라 **구역당 표적 1개**로 시작한다. 클릭 부담이 구역당 1회로 고정되고, 재분배 파이프라인·표적 가능 열 규칙·적 AI 대칭을 전부 검증한 뒤 Task 3.4에서 부대별로 세분화한다.

**Files:**
- Modify: `src/game/types.ts` (`TacticalBattleZone.focusTargetGroupId?`, `focusTargetSource?: 'auto' | 'player'`)
- Modify: `src/game/tacticalBattle.ts`
- Modify: `src/game/tacticalEngagement.ts`
- Modify: `src/game/saveLoad.ts`
- Modify: `src/components/tactical/TacticalZoneColumn.tsx`
- Modify: `tools/game/test_tactical_battle.mjs`

- [x] 지휘 단계에서 구역의 적 그룹을 클릭해 집중 표적 지정. 미지정이면 `auto`(현행 균일 배분과 동일). 표적이 궤주·전멸·구역 이탈하면 `auto` 복귀 — 라운드마다 재지정 강요하지 않는다.
- [x] `revealed === false`인 적은 표적 지정 불가.
- [x] 전투 중 저장 호환: 필드 없으면 `auto`.

### Task 3.2: 병과별 표적 가능 열 규칙

**Files:**
- Create: `src/game/tacticalTargeting.ts`
- Modify: `src/game/tacticalBattle.ts` (적 그룹의 열 개념 부여)
- Modify: `src/components/tactical/TacticalZoneColumn.tsx` (지정 불가 사유 표시)
- Create: `tools/game/test_tactical_targeting.mjs`

- [ ] 적 그룹에도 `line`을 부여한다(생성 시 unitType 기반: 근접 선봉 전열, 사격대 중열, 지휘·화포 후열). 저장 폴백은 unitType에서 재파생.
- [ ] 표적 가능 판정 함수 `canTargetLine(attackerGroup, targetLine, context)`:
  - 창·근접: 노출된 첫 접촉 열만 (정면은 전→중→후, 후방 교전은 역순).
  - 조총: 전열·중열. 아군 전열이 백병 접촉 중이고 표적이 적 전열 너머면 위력 감소 배율(기본 0.65, `prepareVolley` 적용 시 0.8) — 사격 불가 대신 감소로 통일.
  - 각궁: 전 열 가능, 열별 효율 100%/90%/75%.
  - 판정 불가 시 사유 문자열 반환 → UI에서 어둡게 + 사유 툴팁 (기존 `tacticalCommandUnavailableReason` 패턴).
- [ ] 효율·집중도 수치는 전부 CONFIG.tacticalBattle로.

### Task 3.3: 손실 예산 재분배와 적 AI 대칭

**Files:**
- Modify: `src/game/tacticalEngagement.ts`
- Modify: `src/game/config.ts` (병과별 집중도)
- Modify: `tools/game/test_tactical_battle.mjs`, `tools/game/test_tactical_targeting.mjs`

- [ ] 적 손실 배분 변경 — 순서를 고정한다:
  1. 교전의 **정수 사상자 총예산**을 현행 방식(`raiderLossRate` 기반 기대값 + 확률 올림)으로 먼저 한 번만 확정한다.
  2. 아군 부대 중 `canTargetLine` 판정상 **지정 표적에 도달 가능한 부대의 전력만** 집중 몫에 기여한다. 도달 불가능한 부대(예: 표적이 후열인데 조총)의 전력은 자동 배분 몫으로 남는다.
  3. 집중 몫은 병과별 집중도(창 85%, 조총 80%, 각궁 65% — CONFIG)로 표적에, 잔여는 같은 열/구역에 배분한다.
  4. 정수 배분은 안정된 그룹 순서(배열 순서) + 최대 나머지 방식으로 결정적으로 나눈다 — 기존 `distribute()`(tacticalBattle.ts:356)와 같은 패턴.
  - **불변식(테스트로 고정): 표적 유무·조합에 관계없이 교전의 총 사상자 예산은 동일하다.**
- [ ] 손실 기록 모델: **`count`는 불변**, `killed`만 증가, `power`는 그 그룹에 배분된 손실률만큼 감소(현행 `attacker.power *= 1 - groupLossRate` 유지, 손실률만 재분배 결과로 대체). `0 <= killed <= count` 불변식을 테스트에 추가한다 — `count`를 직접 줄이면 생존자 계산(`count - killed`)과 이중 차감된다.
- [ ] 집중 상한: 한 적 그룹이 한 라운드에 받을 수 있는 손실을 교전 총 손실의 일정 비율(예: 70%, CONFIG)로 제한 — 후열 지휘부 저격 편중 방지.
- [ ] 표적 무효 처리: 표적 그룹이 궤주·전멸·구역 이탈했거나 저장 복원 시 ID가 존재하지 않으면 해당 구역 표적만 `auto`로 복구한다(전투를 버리지 않는다).
- [ ] **적 AI 동일 규칙**: 적 그룹도 intent 기반 표적을 선택한다(주력→아군 전열 근접대, 약탈조→창고 수비대, 급습대→후열 원거리·주민, 사격대→노출 조총대). 같은 `canTargetLine` 제약과 집중도를 적용해 아군 피해 배분 가중치로 사용한다.
- [ ] 밸런스 실측: 표적 전면 사용 시나리오와 전면 auto 시나리오의 총 사상 규모 차이가 ±10% 이내(분배만 달라짐)인지 확인.

### Task 3.4 (선택): 부대별 표적으로 세분화

- [ ] v1 플레이 검증 후 진행 여부 결정. 진행 시 `TacticalDefenderGroup.targetGroupId?/targetSource?`를 추가하고 구역 표적은 기본값 공급자로 강등한다. `tacticalCommandState.ts`의 미지정 순회 패턴을 표적 미지정 순회로 확장한다.

---

## Phase 4: 적 목적·계책 엔진 (방어전)

### Task 4.1: 목적 3종과 계책점수

**Files:**
- Modify: `src/game/enemyPlan.ts`
- Modify: `src/game/tacticalBattle.ts` (`createTacticalBattle`, `raiderGroups`)
- Modify: `src/game/config.ts`
- Create: `tools/game/test_enemy_plan.mjs`

- [ ] `EnemyObjectiveId`를 `'breakthrough' | 'plunder' | 'arson'`으로 확장. 세력·전력·관계에서 결정적 RNG로 목적을 정하고, 목적이 적 편성 비중(`raiderSplit`)과 승리 조건 가중(약탈 라운드 수, 방화 목표)을 조정한다.
- [ ] 계책점수: 세력 성향·전력·원한(관계 악화)에서 산출, 목적별 계책 후보 풀에서 1~3개를 점수 내에서 구매. **전부 `createTacticalBattle`에서 확정 — 플레이어 배치·준비를 보기 전에 잠긴다.**
- [ ] 한 전투 계책 수 상한 3개(원칙: 과다 사용 금지).

### Task 4.2: 계책 5종

**Files:**
- Modify: `src/game/enemyPlan.ts`, `src/game/tacticalBattle.ts`, `src/game/tacticalEngagement.ts`
- Modify: `src/game/types.ts` (`TacticalRaiderGroup.estimatedPower?`, `PreparationActionId`에 `firePrevention`/`torchWatch`)
- Modify: `src/game/saveLoad.ts` (`PREPARATION_ACTION_IDS` 화이트리스트, `estimatedPower` 검증·폴백)
- Modify: `src/components/TacticalBattleScreen.tsx` (적 부대 칩·툴팁이 `estimatedPower`를 표시 — 필드의 표시 소비자를 이 Task에서 함께 만든다. Phase 5의 `EnemyPlanPanel`은 이를 재사용)
- Modify: `src/game/config.ts`
- Modify: `tools/game/test_enemy_plan.mjs`

각 계책은 `{ 효과, 사전 징후 텍스트, 대응 준비 행동, 적의 대가 }` 4요소를 반드시 갖는다. 효과는 가능한 한 기존 그룹 속성(`combatMultiplier`, `lossResistance`, `wallPressureBonus`)과 구역 수치로 표현한다.

- [ ] 신규 준비 행동 정식 등록: `firePrevention`(화재 대비)·`torchWatch`(횃불 경계)를 `PreparationActionId` 유니언, `PREPARATION_ACTIONS` 목록(라벨·비용), saveLoad의 `PREPARATION_ACTION_IDS` 화이트리스트, 사용 불가 사유(`tacticalPreparationUnavailableReason`)에 모두 추가한다.

- [ ] `rearManeuver`(후방 우회) — 기존 flankPlan 이관분에 4요소 부착. 대응: 후열 경비.
- [ ] `wallBreakers`(방책 파괴조) — 주력 일부에 `wallPressureBonus`, 대가로 `lossResistance` 악화(사격 우선 표적화 용이). 대응: `repairWall`·사격 준비.
- [ ] `fireArrows`(불화살) — 병력 대신 목책·창고 압박/건물 파손 확률 증가. 대응: 신규 준비 행동 `firePrevention`(화재 대비, 1점). 공격전의 `arson`/`prepareFireArrows` 자산 재사용.
- [ ] `feint`(정면 기만) — 실제 전력 일부를 약탈·우회조로 이전하고, 정면 주력의 **표시 전력을 과장**한다. 표시 전력은 실제 `power`와 분리된 신규 필드 `TacticalRaiderGroup.estimatedPower?`(UI·정보판이 읽는 값)로 표현한다 — `revealed` 불리언 왜곡이나 실제 전력 조작으로 구현하지 않는다. 정찰 공개(`counterLevel >= 1`) 시 `estimatedPower`가 실제값으로 정정된다. 대응: 예비대 유지(중열 근접 보유 시 자동 부분 대응). 저장 폴백: 필드 없으면 실제 `power` 표시.
- [ ] `nightApproach`(야간 접근) — 준비점수 감소(`preparationPoints`에 페널티)와 첫 라운드 적 기세 보너스, 양측 사격 효율 감소. 대응: 신규 준비 행동 `torchWatch`(횃불 경계, 1점). 단 준비점수를 깎는 계책이므로 징후는 반드시 전투 전 로그로 노출한다.
- [ ] `counterLevel` 처리: 대응 준비 행동 적용 시 계책 효과 50~70% 감쇠(부분), 정찰 4단계급 정보가 있으면 첫 발동 무력화(완전). 발견해도 삭제하지 않는다.
- [ ] 테스트: 계책 잠금의 결정성(같은 시드 → 같은 계획), 대응 유무별 효과 차등, 상한 3개.

### Task 4.3: 조기 경보와 계책 정보의 분리

**Files:**
- Modify: `src/game/tacticalBattle.ts` (`preparationPoints`, `raiderGroups`의 scouts/deep 파생)
- Modify: `src/game/enemyPlan.ts`
- Modify: `tools/game/test_enemy_plan.mjs`

- [ ] 기존 입력을 두 축으로 재편: 조기 경보(봉수·망루·경보 여부 → 준비점수, 현행 유지)와 계책 정보(사냥꾼·파수꾼·망루 → `enemyPlan` 공개 수준 0~4단계).
- [ ] 공개 수준별: 0=목적·계책 비공개, 1=징후 텍스트만, 2=목적 또는 계책 1개 공개, 3=대부분 공개, 4=계책 1개 `counterLevel=2` 시작.
- [ ] 원칙 보장: 낮은 단계에서도 잠긴 계책마다 징후 텍스트 1줄은 반드시 준비 단계 로그에 나온다(예: 말발굽 갈림, 기름 천 화살촉).

---

## Phase 5: 정보 UI

### Task 5.1: 적 정보판

**Files:**
- Create: `src/components/tactical/EnemyPlanPanel.tsx`
- Modify: `src/components/TacticalBattleScreen.tsx` (준비 단계에 배치)
- Modify: `src/styles/global.css`

- [ ] 준비 화면에 표시: 예상 목적(공개 시), 확인된 계책 목록, 미확인 계책 **개수**, 계책별 대응 상태(미대응/부분/완전). 기존 `flankerIntel` 한 줄 표기를 이 패널로 대체.

### Task 5.2: 준비 행동 대응 태그

**Files:**
- Modify: `src/components/TacticalBattleScreen.tsx` (준비 행동 카드)
- Modify: `src/game/tacticalBattle.ts` (`PREPARATION_ACTIONS`에 대응 계책 메타)

- [ ] 각 준비 행동 카드에 "대응: 방책 파괴조" 식의 태그를 표시하고, 공개된 계책과 매칭되면 강조한다. 신규 행동 `firePrevention`·`torchWatch`·후열 경비 안내를 포함한다.

---

## Phase 6: 산채 공격전 이식과 방어 교리

### Task 6.1: 공격전에 3열·표적 이식

**Files:**
- Modify: `src/game/tacticalAssault.ts` (`resolveAssaultRound`를 Task 0.1 교전 함수 기반으로 재작성)
- Modify: `tools/game/test_tactical_assault.mjs`

- [ ] 공격전 라운드 판정을 `tacticalEngagement.ts` 공통 함수로 이관하고 3열·표적 지정을 활성화한다. 사냥(`tacticalHunt.ts`)은 손대지 않는다.
- [ ] 회귀 실측: 기존 공격전 시드별 결과 분포 ±15% 이내.

### Task 6.2: 산채 방어 교리 3종

**Files:**
- Modify: `src/game/enemyPlan.ts` (교리 = 목적의 산채 버전)
- Modify: `src/game/tacticalAssault.ts` (`createBanditLairTacticalAssault`, `banditDefenders`, `assaultZones`)
- Modify: `src/game/siteDiplomacy.ts` (경계도·토벌 실패 이력 연동)
- Modify: `tools/game/test_tactical_assault.mjs`

- [ ] 산채 계책점수: `site.alarm`, 정찰 발각 이력, 이전 토벌 실패, 잔여 병력에서 산출.
- [ ] 교리 3종: `trailAttrition`(길목 소모전 — 잠입로 방어·매복 강화), `wallHold`(목책 고수 — lairWall 방어·사격 보너스, 안쪽 약화), `leaderEscape`(두목 탈출 우선 — 기존 `leaderEscaped`/`blockLeaderEscape` 메커니즘에 가짜 움막·선반출 결합).
- [ ] 정찰 상충: 정찰 성공 시 교리 공개(기존 `scoutedUntilDay` 활용), 실패 시 `alarm` 상승 → 산채 계책점수 증가. 다회 정찰이 항상 정답이 되지 않게 실패 확률·경계 상승 폭을 CONFIG로 조정.

---

## 검증과 밸런스 게이트

- Phase 0: `test_tactical_golden.mjs`의 golden 완전 일치가 완료 조건이다. golden은 리팩터 착수 **전** 커밋에서 채록한다.
- **각 Phase의 최종 게이트(커밋 전 필수):** `npm run test:game` → `npm run build` → `git diff --check` 모두 무오류. (`npm run check`가 앞의 둘을 묶는다.)
- 손실 배분 불변식 상시 검증: 총 사상자 예산 불변(표적 유무 무관), `0 <= killed <= count`, `count` 불변.
- Phase 1·2·3은 각각 고정 시드 실측 스크립트로 기준선 대비 결과 분포를 채록해 계획서에 수치를 남긴다 (수동 지휘가 자동 판정 대비 무조건 우위가 되지 않는지 포함).
- 전투 중 저장 → 로드 → 계속 진행 시나리오를 Phase 1(3열)·2(pendingLine)·3(표적)·4(enemyPlan) 각각에서 테스트에 포함한다.

## 리스크 요약

| 리스크 | 대응 |
| --- | --- |
| 2열 전제 노출 계수의 재조정 실패 → 밸런스 붕괴 | Task 1.2에서 계수 CONFIG화 + 기준선 실측 게이트 |
| 판정 코드 3벌 중복 | Phase 0에서 공통 교전 함수 추출, 사냥 제외, 공격전은 Phase 6에서 일괄 이식 |
| `resolveTacticalRound` 비대화 | Phase 0 분해를 선행 조건으로 강제 |
| 표적 집중이 총 피해를 키움 | 정수 예산 선확정 + 총량 불변 테스트, 집중 상한 CONFIG |
| 사망자 이중 차감 (`count` 직접 감소) | `count` 불변·`killed` 증가 모델을 계획에 명문화, `0 <= killed <= count` 불변식 테스트 |
| 전투 중 저장 파손 | schemaVersion 7→8 인상(미래 버전은 명시 거절), 신규 필드는 선택 필드 + 필드 단위 안전 초기화, Phase별 구버전·미래 버전 저장 테스트 |
| 적 계획이 배치를 훔쳐본다는 인상 | 계획 확정은 `createTacticalBattle` 시점(준비·배치 전)으로 고정, 테스트로 결정성 검증 |
