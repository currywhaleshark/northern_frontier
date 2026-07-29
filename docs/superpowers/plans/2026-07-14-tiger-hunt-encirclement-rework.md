# 몰이사냥 재작업 계획: 부채꼴 포위망·호랑이 결정 테이블·반격 창구

> **계획 상태:** 완료
> **상태 갱신:** 2026-07-29 — 포위망·결정표·반격 창구와 전술 사냥 화면을 구현했다.

> 역사 계획 (2026-07-18): 체크박스와 후속 항목은 작성 시점 기록이다. 현재 상태는
> [UI 재구성 릴리스 후보](../../release-candidates/2026-07-ui-reorganization.md)를 기준으로 한다.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. 해당 스킬이 세션에 없으면 일반 TDD 방식으로 진행한다. Steps use checkbox (`- [ ]`) syntax로 추적한다.

**Goal:** 맹수 사냥(특히 호랑이)의 의도된 그림은 "여럿이 흩어져 몰이를 하고, 호랑이는 숨어 있다가 약한 쪽부터 한 번씩 급습하고, 플레이어는 포위망을 좁혀 몰아넣거나 급습을 반격해 정리한다"이다. 현재 구현은 선형 3단계 복도 + 매 라운드 무조건 공격이라 이 긴장이 전혀 살지 않는다. 전투를 **부채꼴 3개 + 심처의 포위망 모델**로 재작업한다: 배치가 곧 전술이 되고(흩으면 몰이가 되지만 조가 얇아지고, 뭉치면 안전하지만 구멍으로 몰이가 정체·도주), 호랑이는 결정 테이블로 은신·급습·돌파를 선택하며, 아군의 주 대미지 창구는 호랑이가 모습을 드러내는 순간의 반격이다.

**확정된 설계 결정:**
- **부채꼴은 3개.** 원정 인원 규모(통상 2~5개 조)에 맞춘다. 전 부채꼴을 막으려면 조를 나눠야 하고, 그 순간 각 조가 얇아진다 — 이것이 핵심 상충이다.
- **사냥대는 배치 단계에서 실제 분견대로 나눌 수 있다.** 현행 `역할+무기` 그룹 하나에 여러 주민이 묶일 수 있으므로, 수치 플래그가 아니라 `residentIds`를 실제로 분리한다. 분할·합류는 첫 교전 전 배치 단계에서만 허용하고, 전투 중에는 이미 만들어진 분견대의 부채꼴 재배치만 허용한다.
- **2명 원정은 세 부채꼴을 모두 막을 수 없다.** 이는 오류가 아니라 최소 편성의 의도된 약점이다. 3명 이상은 같은 역할·무기만 가진 편성이라도 세 분견대로 나눠 세 부채꼴을 막을 수 있다.
- **라운드 수는 코드로 확정하지 않는다.** `HUNT_MAX_ENGAGEMENTS` 하드코딩(현행 5)을 CONFIG로 옮기고, 시뮬레이션 하니스로 실측한 뒤 확정한다.

**Architecture (재사용):**
- 라운드 파이프라인(preparation → deployment → command → simulating → report), 이벤트 재생(`TacticalAnimationEvent`), 명령 소스(`commandSource`), 결과 적용(`applyWildlifeHuntOutcome`)은 그대로 쓴다.
- 부채꼴은 `TacticalBattleZone`의 재해석이다 — 구역 배열·`assignHuntGroup`·구역별 렌더 스트립을 재사용하고, "순차 스테이지" 의미만 "동시 존재하는 길목"으로 바꾼다.
- 명령은 기존 `TacticalCommandId` 값을 재매핑해 저장 호환 비용을 없앤다: `advance`=몰이, `ambush`=반격 대기, `volley`=사격, `hold`=창벽, `openRetreat`=철수. 신규 명령 ID를 만들지 않는다.
- 본 계획은 전술전 확장 계획(2026-07-14-tactical-formation-and-enemy-plans.md)이 **명시적으로 제외한 사냥 영역**만 다룬다. 현재 전술전 확장은 schema v9까지 적용되었으므로 본 계획은 **schema v10**을 사용한다. `saveLoad`·`types`의 현재 변경을 기준으로 작업하며 v9 마이그레이션에 새 의미를 덧씌우지 않는다.

**착수 게이트:**
- 현재 `codex/combat-system-expansion` 작업을 별도 체크포인트 커밋으로 먼저 고정한다. 본 계획의 대규모 사냥 변경과 앞선 전술전 확장을 한 커밋에 섞지 않는다.
- 체크포인트에서 `npm run test:combat`, `npm run test:game`, `npm run build`, `git diff --check`가 통과한 상태를 기준선으로 삼는다.
- `main` 병합이나 강제 푸시는 하지 않는다.
- 각 Task는 관련 회귀 테스트를 먼저 추가해 실패(RED)를 확인한 뒤 구현하고, 해당 테스트와 Phase 게이트를 통과(GREEN)시킨 다음 다음 Task로 이동한다.

**현재 코드의 출발점 (2026-07-14, tacticalHunt.ts 정독 결과):**
- 3구역(자취 지대→몰이 숲→막다른 굴)은 공간이 아니라 순차 스테이지다. 구역 전진 시 아군 전원과 짐승이 통째로 다음 구역에 재소집된다(tacticalHunt.ts:661-664). 배치 단계는 첫 전진 이후 무의미해진다.
- 호랑이는 매 라운드 무조건 공격하고, 그 공격이 은신을 자동 해제한다(tacticalHunt.ts:491-496). 라운드 시작 발각 판정(:475)은 사실상 장식이다. 은신 상태가 아군 사격을 막는 게이트(:503)로 기능하는 경우는 거의 없다.
- **표적 선택이 의도와 반대다**: `weakestGroup`(약한 조 우선)은 늑대가 쓰고 호랑이는 완전 무작위다(tacticalHunt.ts:356-358).
- 흩기 vs 뭉치기 상충은 준비 단계 일회성 플래그 `splitDrivers`(포위 +12·증가율 ×1.42·피격률 ×1.35)로만 존재한다(:233-235, :365). 전투 중 결정이 아니다.
- 원정대 그룹은 `createExpeditionTacticalGroups`에서 `역할+무기`별로 합쳐진다. 같은 무장의 사냥꾼 3명은 그룹 하나가 되므로, 현재 구조만으로는 세 부채꼴에 흩어 배치할 수 없다. `splitDrivers`도 실제 그룹을 나누지 않는다.
- 포위망은 전역 진행 바이고 모든 구역 pressure에 같은 값을 덮어쓴다(:470-471). 도주 결말은 5라운드 시간 초과뿐이다(:582). "구멍으로 빠져나감"은 존재하지 않는다.
- 전원이 뭉쳐 있어도 호랑이는 나와서 공격하고 포위망도 오른다 — "뭉치면 호랑이도 안 나오고 몰이도 안 되는" 정체 상태가 시스템상 발생 불가능하다.
- 결과 적용(`applyWildlifeHuntOutcome`)·장계 생성(`finishPredatorTacticalHunt`)·원정 귀환은 전투 내부와 분리되어 있어 재작업의 영향을 받지 않는다.
- 손상된 전술전의 현행 `tacticalRecoveryNeeded` 경로는 원정대를 `engage`에 남기지 않고 귀환시킨다. 구 형식 사냥 저장의 "전투만 폐기하고 개전 선택 재개"는 별도 사냥 복구 분기로 구현해야 한다.

**만들지 않는 것:**
- 지도 좌표 기반 실제 위치·이동 판정 — 부채꼴은 추상 슬롯이다.
- 신규 `TacticalCommandId` — 기존 ID 재매핑으로 해결한다.
- 방어전·산채전에서 사용하는 일반 부대 분할 기능 — 분견대 생성·합류는 `predatorHunt` 배치 단계에만 한정한다.
- 방어전·산채 공격전 코드 변경 — `tacticalCore`의 공용 헬퍼 추가는 허용하되 기존 함수 시그니처는 건드리지 않는다.

---

## Phase H0: 준비 — CONFIG 추출과 호랑이 결정 테이블의 순수 함수화

### Task H0.1: 사냥 상수 CONFIG 승격과 시뮬레이션 하니스

**Files:**
- Modify: `src/game/config.ts` (`CONFIG.tacticalBattle.hunt` 신설)
- Modify: `src/game/tacticalHunt.ts`
- Create: `tools/game/simulate_hunt_balance.mjs`
- Modify: `tools/game/test_tactical_hunt.mjs`

- [ ] `HUNT_MAX_ENGAGEMENTS`(5), `BAIT_MEAT_COST`(3), 급습 명중률·사망률·다중 피해율, 포위망 증가 계수, 재은닉 확률을 `CONFIG.tacticalBattle.hunt`로 옮긴다. 수치는 그대로 — 이 Task는 이동만 한다.
- [ ] 시뮬레이션 하니스: 고정 시드 N판(맹수 종류 × 호랑이 체급 × 원정 규모 조합)을 자동 지휘로 돌려 결과 분포(사살/격퇴/도주/패퇴 비율, 평균 사상, 평균 라운드)를 표로 출력한다. **라운드 수 확정은 이 하니스의 실측으로 한다** — 재작업 전 현행 분포를 먼저 채록해 비교 기준으로 남긴다.

### Task H0.2: 맹수 결정 테이블의 순수 함수 골격

**Files:**
- Create: `src/game/huntBeastAI.ts`
- Create: `tools/game/test_hunt_beast_ai.mjs`

- [ ] 순수 함수 `chooseBeastAction(input): BeastAction`을 만든다. 입력: 부채꼴별 봉쇄 강도·배치 조 스냅샷, 포위망 수치, 맹수 상태(hidden/revealed/wounded)·체급·잔여 전력, 미끼·덫 위치, 호출자가 결정적 RNG에서 미리 뽑아 전달한 `decisionRoll: number`. 함수 내부에서 `Math.random`이나 전역 상태를 읽지 않는다. 출력:
  ```ts
  type BeastAction =
    | { kind: 'lurk' }                                    // 은신 유지 — 조용한 라운드
    | { kind: 'ambush'; sectorId: string; targetGroupId: string }
    | { kind: 'breakout'; sectorId: string }              // 가장 얇은 부채꼴 돌파 시도
    | { kind: 'cornered' };                               // 포위 완성 — 심처 결착
  ```
- [ ] 결정 규칙 (우선순위 순):
  1. 포위망 ≥ 100 → `cornered`.
  2. 부상 상태이거나 포위망 ≥ 돌파 문턱(CONFIG)이고, 가장 얇은 부채꼴의 봉쇄 강도가 돌파 가능선 이하 → `breakout`.
  3. 가장 약한 조의 노출 점수(인원·근접 능력·창벽 여부·미끼 보정)가 급습 문턱 이하 → `ambush`(호랑이도 늑대의 `weakestGroup` 로직을 쓴다 — 현행 무작위 표적을 폐기해 의도 반전을 바로잡는다).
  4. 그 외 → `lurk`. **전원이 소수 부채꼴에 뭉쳐 모든 조가 강하면 이 분기가 계속 선택된다** — 조용한 라운드가 이어지고, H1의 구멍 규칙과 결합해 몰이 정체가 실제로 발생한다.
- [ ] 테스트: 표적이 항상 최약 조인지, 뭉친 배치에서 `lurk`가 지배적인지, 포위 상승 시 `breakout`으로 전이하는지, 같은 입력 → 같은 출력(결정성).

### Task H0.3: 사냥대 분견대 분할·합류

**Files:**
- Modify: `src/game/tacticalHunt.ts`
- Modify: `src/game/types.ts`
- Modify: `src/game/saveLoad.ts`
- Modify: `src/App.tsx`
- Modify: `src/components/TacticalBattleScreen.tsx`
- Modify: `tools/game/test_tactical_hunt.mjs`
- Modify: `tools/game/test_resource_save_migration.mjs`
- Modify: `tools/game/test_tactical_components.mjs`

- [ ] 실패 회귀 테스트부터 추가한다. 같은 역할·무기의 사냥꾼 3명이 현재 한 `TacticalDefenderGroup`으로 생성됨을 고정하고, 이를 1명씩 세 분견대로 나눈 뒤 서로 다른 부채꼴에 배치할 수 있어야 한다.
- [ ] 사냥 전용 API를 추가한다.
  ```ts
  splitHuntGroup(
    state: GameState,
    groupId: string,
    detachCount: number,
  ): string | null

  mergeHuntGroups(
    state: GameState,
    destinationGroupId: string,
    sourceGroupId: string,
  ): string | null
  ```
- [ ] 분할·합류는 `predatorHunt`의 첫 교전 전 `deployment` 단계에서만 가능하다. `wounded > 0`, `killed > 0`, `round > 1`, 전투불능 그룹은 분할할 수 없다. 지휘 단계에서는 분할·합류가 아니라 이미 존재하는 분견대의 부채꼴 이동만 허용한다.
- [ ] `residentIds`를 결정적인 순서로 실제 분리한다. 분견대 ID는 원본 ID와 저장되는 일련번호로 생성한다. `TacticalDefenderGroup.huntOriginGroupId?`, `TacticalBattle.huntDetachmentSerial?`을 추가해 저장·불러오기 뒤에도 ID와 합류 관계가 유지되게 한다.
- [ ] 사냥 전투 생성 시 모든 원본 조에 `huntOriginGroupId = group.id`를 초기화하고 `huntDetachmentSerial = 0`으로 시작한다. 분견대 라벨은 `각궁 사냥꾼 A조/B조`처럼 원본 병과를 유지하면서 서로 구분되게 한다.
- [ ] 분할 전후 다음 불변식을 정확히 보존한다: `residentIds` 집합, `count`, `power`, `readyMuskets`, `wounded`, `killed`. 전력은 원본 그룹에서 분리 인원 비율만큼 옮기고 마지막 분견대가 부동소수점 잔여를 가져 총합을 보존한다. 조총 준비 인원은 실제 `residentIds` 기준으로 `allocateMusketReadiness`를 다시 계산한다.
- [ ] 합류는 같은 `huntOriginGroupId`, 역할, 무기, 현재 부채꼴을 가진 생존 분견대끼리만 허용한다. 합류 후에도 총합과 주민 ID 집합을 보존하고 빈 원본/분견대는 제거한다.
- [ ] 배치 UI의 선택된 조에 `1명 분리`, `반으로 나누기`, `같은 조 합류`를 제공한다. 분할 불가 사유를 `disabled`와 `title`에 표시한다. 3명 이상인데 그룹 수가 3개 미만이면 "부채꼴을 모두 막으려면 조를 나누십시오" 안내를 표시한다.
- [ ] 테스트: 3명→3분견대, 2명→최대 2분견대, 중복·누락 주민 없음, 전력/인원/조총 준비 총합 보존, 잘못된 합류 거부, 전투 시작 후 분할 거부, 저장·불러오기 보존, 산채 토벌 그룹에는 분할 UI·API가 노출되지 않음을 검증한다.

---

## Phase H1: 부채꼴 포위망 자료구조와 배치

### Task H1.1: 부채꼴 3개 + 심처 구역 재정의

**Files:**
- Modify: `src/game/tacticalHunt.ts` (`huntZones`, `createPredatorTacticalHunt`, `assignHuntGroup`)
- Modify: `src/game/types.ts` (`TacticalBattleZone.sectorBlockade?: number`, 이동·구멍 상태)
- Modify: `src/game/saveLoad.ts`
- Modify: `src/game/saveSchema.ts` (`CURRENT_SCHEMA_VERSION = 10`)
- Modify: `src/App.tsx`
- Modify: `src/components/TacticalBattleScreen.tsx`
- Modify: `tools/game/test_tactical_hunt.mjs`, `tools/game/test_resource_save_migration.mjs`

- [ ] 구역을 `huntSectorRidge`(능선길)·`huntSectorRavine`(골짜기)·`huntSectorBrook`(개울가) + `huntDen`(덤불 심처)으로 교체한다. 심처는 맹수 전용 — 결착 전에는 아군 배치 불가. 부채꼴 3개는 order가 같은 **동시 존재 슬롯**이다.
- [ ] `resolveHuntRound`는 더 이상 `currentZoneId` 한 곳의 그룹만 필터링하지 않고 세 부채꼴 전체를 한 라운드 스냅샷으로 계산한다. `currentZoneId`는 저장 호환과 카메라 초점용으로만 남기고, 실제 맹수 행동 위치는 `BeastAction.sectorId`와 이벤트 `zoneId`가 결정한다.
- [ ] `assignHuntGroup`: "안쪽 구역 배치 금지" 규칙을 "심처 배치 금지"로 교체하고, 배치 단계뿐 아니라 **매 지휘 단계에서 부채꼴 간 재배치를 허용**한다. 지휘 단계에서 부채꼴을 옮긴 조는 `huntMovedRound = battle.round`를 기록하고 그 라운드 몰이 기여가 반값이다. 같은 부채꼴 재선택은 이동으로 계산하지 않는다.
- [ ] 지휘 UI에도 선택 조의 부채꼴 이동 버튼을 표시한다. 사냥에서는 전열·중열·후열 토글을 숨기고 그 자리를 부채꼴 이동과 이동 중 몰이 반감 안내에 사용한다.
- [ ] 전투 중 저장 마이그레이션: 구 구역 ID(`huntTracks`/`huntDrive`/`huntDen`)를 가진 진행 중 사냥 저장은 필드 단위로 복구하지 않고 **사냥 전투만 안전 폐기**한다. `legacyHuntRecoveryNeeded`를 일반 `tacticalRecoveryNeeded`와 분리해 `tacticalBattle = null`, `expedition.phase = 'engage'`, `pendingChoice = null`로 둔다. 다음 정상 업데이트에서 `maybeOpenExpeditionEngagementChoice`가 개전 선택지를 다시 연다. 일반 손상 전술전의 기존 안전 귀환 경로는 바꾸지 않는다.
- [ ] `CURRENT_SCHEMA_VERSION`을 10으로 올리고 `migrateV9ToV10`을 추가한다. v9의 산채 교리·부대별 표적 마이그레이션을 수정하거나 재사용하지 않는다. 신 형식 사냥의 분견대·부채꼴·위치 지정 필드는 정상 복원하고 구 형식 사냥만 위 규칙으로 폐기한다.
- [ ] 테스트: 배치/지휘 단계 이동, 이동 라운드 반감, 같은 부채꼴 재선택 무효, 심처 배치 거부, v9 구 사냥 전투만 폐기되고 원정은 `engage`에 남음, 다음 개전 선택 재생성, v10 신 사냥 저장 복원을 검증한다.

### Task H1.2: 부채꼴 봉쇄·구멍·포위망 진행 규칙

**Files:**
- Modify: `src/game/tacticalHunt.ts` (`resolveHuntRound`의 포위망 계산부)
- Modify: `src/game/config.ts`
- Modify: `tools/game/test_tactical_hunt.mjs`

- [ ] 부채꼴 봉쇄 강도 = 배치된 조의 유효 전력 합(몰이 명령 조는 몰이 기여, 그 외는 봉쇄만). 매 라운드 `zone.sectorBlockade`에 기록해 UI가 읽는다. 전역 pressure 덮어쓰기(:470-471)는 제거한다.
- [ ] 포위망 증가 = 부채꼴별 기여의 합. **빈 부채꼴(구멍)은 기여 0이고 전체 증가에 감쇠를 건다**(구멍 1개당 ×0.5 등 — CONFIG). 3곳 중 1곳만 막으면 포위망이 사실상 오르지 않는다.
- [ ] `TacticalBattle.huntOpenSectorRounds?: Record<string, number>`에 부채꼴별 연속 구멍 라운드를 기록한다. 봉쇄 문턱을 회복한 부채꼴은 해당 카운터를 0으로 되돌린다. 저장·불러오기와 동일 라운드 반복 호출에서 중복 증가하지 않아야 한다.
- [ ] 도주 규칙: 구멍(봉쇄 강도가 문턱 이하인 부채꼴)이 연속 2라운드 유지되고 포위망이 일정 수준 이상이면, 맹수 AI의 `breakout`과 별개로 **그 구멍으로 조용히 빠져나가는 판정**을 굴린다(성공 시 huntEscaped — "포위망이 닫히기 전에 ○○ 쪽 능선으로 빠져나갔습니다"). 시간 초과 도주는 최후 수단으로만 남긴다.
- [ ] 날씨·사냥꾼 기량 보정은 현행 유지(CONFIG 경유).

---

## Phase H2: 맹수 행동 연결과 반격 창구

### Task H2.1: 결정 테이블을 라운드 판정에 연결

**Files:**
- Modify: `src/game/tacticalHunt.ts` (`resolveHuntRound`, `beastAttack` 대체)
- Modify: `tools/game/test_tactical_hunt.mjs`

- [ ] 매 라운드 `chooseBeastAction` 결과로 분기한다. `lurk` = 공격 없음("산이 조용합니다" 이벤트 — 정적도 정보다), `ambush` = 해당 부채꼴 최약 조 급습(현행 명중·사망 수식 재사용, `splitDrivers` 보정 제거), `breakout` = 해당 부채꼴 봉쇄 강도와의 대결 판정(성공 = 도주 결말, 실패 = 그 부채꼴 조와 반격 대기 조의 반격 피해를 받고 노출 유지), `cornered` = 전 조를 심처로 이동시키는 결착 라운드(맹수가 정면으로 싸우며 급습 배율 강화).
- [ ] **은신은 실제 게이트가 된다**: 맹수가 `ambush`/`breakout`/`cornered`로 행동한 라운드에만 노출되고, 노출 라운드에만 아군 사격·돌입이 가능하다(현행 :503 게이트 재사용). 매 라운드 무조건 공격·자동 발각(:491-496)은 제거한다. 재은닉은 "행동하지 않은 다음 라운드 자동" — 별도 확률 없이 단순화한다.
- [ ] 수색: 사냥꾼 조의 `ambush` 명령(재매핑: 반격 대기)과 별개로, 은신 라운드에 사냥꾼이 있으면 현행 발각 판정(:475)을 유지해 **정체 국면의 타개 수단**으로 남긴다. 발각 성공 라운드는 노출 라운드로 취급한다.

### Task H2.2: 반격 대기와 명령 재매핑

**Files:**
- Modify: `src/game/tacticalHunt.ts` (`huntCommandUnavailableReason`, `chooseDefaultHuntCommands`, 명령 처리)
- Modify: `src/components/TacticalBattleScreen.tsx` (기존 사냥 전용 `commandLabel`·`commandDescription` 교체)
- Modify: `tools/game/test_tactical_hunt.mjs`
- Modify: `tools/game/test_tactical_components.mjs`

- [ ] 명령 재매핑(기존 ID, 라벨·효과만 사냥 전용): `advance`=**몰이**(부채꼴 몰이 기여·소음, 피격 노출 큼), `ambush`=**반격 대기**(몰이 기여 없음, 맹수가 자기 또는 인접 부채꼴에서 행동하는 순간 전력 반격 — 주 대미지 창구), `volley`=**사격**(노출 라운드에만, 현행 게이트), `hold`=**창벽**(급습 피해 감소 — 현행 spearWall 유지), `charge`=**돌입**(노출·결착 라운드의 근접 공격), `fallback`은 사냥에서 제거, `openRetreat` 유지.
- [ ] `ambush` 재매핑은 사냥꾼 전용 매복 제한을 그대로 쓰지 않는다. 모든 생존 전투조가 반격 대기를 선택할 수 있고, 사냥꾼·파수꾼은 수색 및 인접 부채꼴 반격 효율 보너스를 받는다. 이렇게 해야 사냥꾼이 없는 합법 원정도 주 대미지 창구를 사용할 수 있다.
- [ ] 반격 판정: 맹수 행동 부채꼴의 반격 대기 조는 전력 100%, 인접 부채꼴(3개 원형 — 모두 서로 인접)의 반격 대기 조는 감쇠 배율(CONFIG)로 기여. 반격 피해는 노출 라운드의 사격 피해와 합산해 현행 피해 수식(:554)에 태운다.
- [ ] `chooseDefaultHuntCommands` 재작성: 사냥꾼 = 반격 대기, 창병 = 몰이(맹수 은신 중) / 창벽(노출 중), 사수 = 사격(노출) / 몰이(은신). `commandSource === 'player'`인 유효 명령만 유지하고, `recommended` 명령은 매 라운드 맹수 상태에 맞춰 다시 계산한다. 기본 명령만으로도 "몰다가, 나오면 친다"가 성립해야 한다.

### Task H2.3: 미끼·덫의 부채꼴 재정의와 `splitDrivers` 폐기

**Files:**
- Modify: `src/game/tacticalHunt.ts` (준비 행동 적용부, `HUNT_PREPARATIONS`)
- Modify: `src/game/huntBeastAI.ts` (미끼·덫 입력)
- Modify: `src/game/types.ts` (`huntBaitZoneId`, `huntTrapZoneId`)
- Modify: `src/game/saveLoad.ts` (`splitDrivers` 폐기 폴백, 위치 필드 복원)
- Modify: `src/App.tsx`
- Modify: `src/components/TacticalBattleScreen.tsx`
- Modify: `tools/game/test_tactical_hunt.mjs`
- Modify: `tools/game/test_resource_save_migration.mjs`, `tools/game/test_tactical_components.mjs`

- [ ] `placeBait`와 `setHuntTraps`는 준비 단계에서 사용을 **예약**하고, 실제 위치·자원 소비·`applied=true` 확정은 배치 단계에서 수행한다. 선택한 준비가 있는데 유효한 부채꼴 위치가 지정되지 않았으면 전투 시작을 비활성화하고 사유를 표시한다.
- [ ] `placeBait`: 배치 단계에서 **부채꼴 하나를 지정**해 미끼를 놓는다. `huntBaitZoneId`에 저장하고 고기는 위치 확정 시 한 번만 소비한다. 결정 테이블의 급습 표적 선택이 그 부채꼴로 강하게 기울고(노출 점수 보정), 첫 급습의 발각이 확정된다. "미끼 부채꼴 + 인접 반격 대기"가 의도된 함정 플레이가 된다. 현행 "시작부터 전체 발각"은 제거.
- [ ] `setHuntTraps`: 배치 단계에서 부채꼴 하나를 지정해 `huntTrapZoneId`에 저장한다. 그 부채꼴로의 `breakout`·조용한 도주는 1회 자동 실패하고 맹수가 피해를 입는다(현행 1회성 피해 유지, 위치 지정만 추가).
- [ ] `splitDrivers` 폐기: 흩기/뭉치기는 이제 실제 배치로 표현되므로 준비 행동에서 제거한다. `PreparationActionId` 유니언과 saveLoad 화이트리스트에는 유지(구버전 저장 호환)하되 목록에서 빼고, 진행 중 저장에 선택되어 있으면 효과 없이 무시한다.
- [ ] 테스트: 위치 미지정 전투 시작 거부, 유효하지 않은 심처 지정 거부, 미끼 고기 1회 소비, 저장·불러오기 후 위치 유지, 덫 1회 소모, `splitDrivers` 잔존 저장 무효화를 검증한다.

---

## Phase H3: 늑대 변주·UI·마무리

### Task H3.1: 늑대 무리 변주

**Files:**
- Modify: `src/game/tacticalHunt.ts`, `src/game/huntBeastAI.ts`
- Modify: `tools/game/test_tactical_hunt.mjs`

- [ ] 늑대는 같은 결정 테이블을 쓰되 무리 특성으로 변주한다: 우두머리 그룹과 무리 그룹이 **서로 다른 부채꼴을 같은 라운드에 찔러볼 수 있다**(다중 급습 — 흩어진 배치의 위험이 호랑이전보다 크고, 대신 개별 급습은 약함). 우두머리 처치 → 궤주(현행 `huntLeaderKilled`·`huntRepelled` 유지). 사냥꾼 반격 대기의 우두머리 집중(현행 leaderShare 0.55) 유지.
- [ ] 체급 차등: 호랑이 체급(tigerTier)은 돌파 문턱·급습 배율·`lurk` 인내심(급습 문턱)에 반영한다 — 산군은 좀처럼 약점을 노출하지 않고, 일반 호랑이는 성급하다.

### Task H3.2: 부채꼴 UI

**Files:**
- Modify: `src/components/TacticalBattleScreen.tsx`
- Modify: `src/styles/global.css`

- [ ] 사냥 화면을 부채꼴 3열 + 중앙 심처로 렌더링한다(가로 스트립 재사용: 능선길│심처│골짜기│개울가 배열 또는 3열+심처 오버레이 — 기존 zone 스트립 구조를 유지하는 안을 우선 검토). 각 부채꼴에 봉쇄 강도 게이지(`sectorBlockade`)를, 헤더에 전체 포위망 %를 표시한다.
- [ ] 맹수 표기: 은신 중에는 심처에 실루엣·물음표, 노출 라운드에만 행동 부채꼴에 스프라이트. `lurk` 라운드는 "산이 조용합니다" 정적 연출.
- [ ] 배치 단계·지휘 단계에서 조 칩을 부채꼴로 끌어 배치(기존 `assignHuntGroup` 경로), 이동 중 몰이 반감 표시. 배치 단계에는 H0.3의 분할·합류 조작을 함께 표시하고, 사냥 화면에서는 전열·중열·후열 UI를 숨긴다.

### Task H3.3: 결말·장계·라운드 수 확정

**Files:**
- Modify: `src/game/tacticalHunt.ts` (`outcomeText`, `finishPredatorTacticalHunt` 하이라이트)
- Modify: `tools/game/simulate_hunt_balance.mjs`
- Modify: `tools/game/test_tactical_hunt.mjs`

- [ ] 도주 결말 문구를 원인별로 분리한다: 구멍 도주("○○ 쪽 봉쇄가 얇아 빠져나감"), 돌파 성공, 시간 초과. 장계 하이라이트에 부채꼴 봉쇄 이력·반격 성공 횟수를 남긴다.
- [ ] **라운드 수 확정**: H0.1 하니스로 재작업 후 분포를 실측하고, 현행 대비 사살/도주/패퇴 비율이 수용 범위에 들도록 `maxEngagements`·돌파 문턱·급습 문턱을 조정해 확정한다. 목표 감각: 성실한 3부채꼴 운용이면 결착까지 도달 가능, 2부채꼴 뭉치기는 정체 끝 도주가 다수, 1부채꼴 몰빵은 거의 확실한 도주.

---

## 검증과 게이트

- 각 Phase 최종 게이트(커밋 전 필수): `npm run test:game` → `npm run build` → `git diff --check` 무오류.
- H0.1에서 재작업 **전** 결과 분포를 채록해 두고, H3.3에서 재작업 후 분포와 비교해 밸런스 확정 근거로 남긴다.
- 전투 중 저장 시나리오: v9 구 형식 사냥 저장 안전 폐기(원정 `engage` 유지·개전 선택 재개), v10 신 형식 분견대/부채꼴/미끼/덫 저장·복원, `splitDrivers` 잔존 저장 무시를 테스트에 포함한다.
- 분견대 불변식: 분할·합류 전후 주민 ID 집합, 총 인원, 총 전력, 준비 조총 수가 동일하다 / 주민 ID가 두 그룹에 중복되지 않는다 / 사상자 발생 뒤에는 분할·합류할 수 없다.
- 전투 불변식: 맹수는 행동하거나 수색으로 발각된 라운드에만 노출된다 / 노출 라운드에만 아군 사격·반격 피해가 적용된다 / 구멍이 있으면 포위망 증가가 감쇠된다 / 호랑이 급습 표적은 항상 노출 점수 최저 조다 / 동일 시드·상태는 동일 행동을 낸다.
- 회귀 경로: 자동 맹수 사냥, 직접 늑대 사냥, 직접 호랑이 사냥, 화약 소비, 주민 부상·사망 적용, 사냥 장계, 원정 귀환, 산채 토벌, 습격 방어 테스트를 모두 유지한다.

## 리스크 요약

| 리스크 | 대응 |
| --- | --- |
| 정체 국면(전원 뭉치기 + lurk)이 지루한 무한 대치가 됨 | 수색 발각(H2.1)과 미끼(H2.3)를 타개 수단으로 유지, 시간 초과 도주가 최종 안전판 |
| 부채꼴 3개 + 2명 최소 원정에서 전면 봉쇄 불가 | 의도된 약점으로 유지하되 구멍 감쇠·도주 문턱을 인원 수에 따라 완만하게 조정(CONFIG), 개전·배치 화면에 경고 문구 |
| 같은 역할·무기 그룹을 나눌 때 주민·전력이 복제되거나 누락됨 | H0.3에서 배치 단계 전용 분할, 결정적 ID, 주민 ID 집합·총 인원·전력·준비 조총 수 불변식과 저장 회귀 테스트 |
| 구 진행 중 사냥 저장 파손 | 일반 손상 복구와 분리한 `legacyHuntRecoveryNeeded`: 사냥 전투만 폐기 + 원정 `engage` 유지 + 개전 선택 재개 (마을 상태 무손실) |
| 전술전 확장과 saveLoad·types 충돌 | 현재 v9를 기준으로 `migrateV9ToV10`을 독립 추가하고 v9 마이그레이션은 수정하지 않음 |
| 준비 단계에서 선택한 미끼·덫이 배치 위치 없이 소비됨 | 준비 단계에서는 예약만 하고 배치 단계 위치 확정 시 한 번만 소비·적용, 미지정 전투 시작 거부 |
| 명령 재매핑으로 방어전 설명 문구 오염 | 현재 `TacticalBattleScreen`의 사냥 전용 `commandLabel`·`commandDescription` 분기를 확장하고 공용 `tacticalCommandDescription` 시그니처는 변경하지 않음 |
