# 몰이사냥 재작업 계획: 부채꼴 포위망·호랑이 결정 테이블·반격 창구

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. 해당 스킬이 세션에 없으면 일반 TDD 방식으로 진행한다. Steps use checkbox (`- [ ]`) syntax로 추적한다.

**Goal:** 맹수 사냥(특히 호랑이)의 의도된 그림은 "여럿이 흩어져 몰이를 하고, 호랑이는 숨어 있다가 약한 쪽부터 한 번씩 급습하고, 플레이어는 포위망을 좁혀 몰아넣거나 급습을 반격해 정리한다"이다. 현재 구현은 선형 3단계 복도 + 매 라운드 무조건 공격이라 이 긴장이 전혀 살지 않는다. 전투를 **부채꼴 3개 + 심처의 포위망 모델**로 재작업한다: 배치가 곧 전술이 되고(흩으면 몰이가 되지만 조가 얇아지고, 뭉치면 안전하지만 구멍으로 몰이가 정체·도주), 호랑이는 결정 테이블로 은신·급습·돌파를 선택하며, 아군의 주 대미지 창구는 호랑이가 모습을 드러내는 순간의 반격이다.

**확정된 설계 결정:**
- **부채꼴은 3개.** 원정 인원 규모(통상 2~5개 조)에 맞춘다. 전 부채꼴을 막으려면 조를 나눠야 하고, 그 순간 각 조가 얇아진다 — 이것이 핵심 상충이다.
- **라운드 수는 코드로 확정하지 않는다.** `HUNT_MAX_ENGAGEMENTS` 하드코딩(현행 5)을 CONFIG로 옮기고, 시뮬레이션 하니스로 실측한 뒤 확정한다.

**Architecture (재사용):**
- 라운드 파이프라인(preparation → deployment → command → simulating → report), 이벤트 재생(`TacticalAnimationEvent`), 명령 소스(`commandSource`), 결과 적용(`applyWildlifeHuntOutcome`)은 그대로 쓴다.
- 부채꼴은 `TacticalBattleZone`의 재해석이다 — 구역 배열·`assignHuntGroup`·구역별 렌더 스트립을 재사용하고, "순차 스테이지" 의미만 "동시 존재하는 길목"으로 바꾼다.
- 명령은 기존 `TacticalCommandId` 값을 재매핑해 저장 호환 비용을 없앤다: `advance`=몰이, `ambush`=반격 대기, `volley`=사격, `hold`=창벽, `openRetreat`=철수. 신규 명령 ID를 만들지 않는다.
- 본 계획은 진행 중인 전술전 확장 계획(2026-07-14-tactical-formation-and-enemy-plans.md)이 **명시적으로 제외한 사냥 영역**만 다루므로 충돌하지 않는다. 단 saveLoad·types 파일은 공유하므로 머지 순서만 조율한다.

**현재 코드의 출발점 (2026-07-14, tacticalHunt.ts 정독 결과):**
- 3구역(자취 지대→몰이 숲→막다른 굴)은 공간이 아니라 순차 스테이지다. 구역 전진 시 아군 전원과 짐승이 통째로 다음 구역에 재소집된다(tacticalHunt.ts:661-664). 배치 단계는 첫 전진 이후 무의미해진다.
- 호랑이는 매 라운드 무조건 공격하고, 그 공격이 은신을 자동 해제한다(tacticalHunt.ts:491-496). 라운드 시작 발각 판정(:475)은 사실상 장식이다. 은신 상태가 아군 사격을 막는 게이트(:503)로 기능하는 경우는 거의 없다.
- **표적 선택이 의도와 반대다**: `weakestGroup`(약한 조 우선)은 늑대가 쓰고 호랑이는 완전 무작위다(tacticalHunt.ts:356-358).
- 흩기 vs 뭉치기 상충은 준비 단계 일회성 플래그 `splitDrivers`(포위 +12·증가율 ×1.42·피격률 ×1.35)로만 존재한다(:233-235, :365). 전투 중 결정이 아니다.
- 포위망은 전역 진행 바이고 모든 구역 pressure에 같은 값을 덮어쓴다(:470-471). 도주 결말은 5라운드 시간 초과뿐이다(:582). "구멍으로 빠져나감"은 존재하지 않는다.
- 전원이 뭉쳐 있어도 호랑이는 나와서 공격하고 포위망도 오른다 — "뭉치면 호랑이도 안 나오고 몰이도 안 되는" 정체 상태가 시스템상 발생 불가능하다.
- 결과 적용(`applyWildlifeHuntOutcome`)·장계 생성(`finishPredatorTacticalHunt`)·원정 귀환은 전투 내부와 분리되어 있어 재작업의 영향을 받지 않는다.

**만들지 않는 것:**
- 지도 좌표 기반 실제 위치·이동 판정 — 부채꼴은 추상 슬롯이다.
- 신규 `TacticalCommandId` — 기존 ID 재매핑으로 해결한다.
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

- [ ] 순수 함수 `chooseBeastAction(input): BeastAction`을 만든다. 입력: 부채꼴별 봉쇄 강도·배치 조 스냅샷, 포위망 수치, 맹수 상태(hidden/revealed/wounded)·체급·잔여 전력, 미끼·덫 위치, RNG. 출력:
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

---

## Phase H1: 부채꼴 포위망 자료구조와 배치

### Task H1.1: 부채꼴 3개 + 심처 구역 재정의

**Files:**
- Modify: `src/game/tacticalHunt.ts` (`huntZones`, `createPredatorTacticalHunt`, `assignHuntGroup`)
- Modify: `src/game/types.ts` (`TacticalBattleZone.sectorBlockade?: number` — 부채꼴 봉쇄 강도 표시용)
- Modify: `src/game/saveLoad.ts`
- Modify: `tools/game/test_tactical_hunt.mjs`, `tools/game/test_resource_save_migration.mjs`

- [ ] 구역을 `huntSectorRidge`(능선길)·`huntSectorRavine`(골짜기)·`huntSectorBrook`(개울가) + `huntDen`(덤불 심처)으로 교체한다. 심처는 맹수 전용 — 결착 전에는 아군 배치 불가. 부채꼴 3개는 order가 같은 **동시 존재 슬롯**이다.
- [ ] `assignHuntGroup`: "안쪽 구역 배치 금지" 규칙을 "심처 배치 금지"로 교체하고, 배치 단계뿐 아니라 **매 지휘 단계에서 부채꼴 간 재배치를 허용**한다. 그 라운드에 부채꼴을 옮긴 조는 몰이 기여가 반값(이동 중 — 방어전 redeploy와 같은 논리, 별도 명령 없이 배치 변경으로 처리).
- [ ] 전투 중 저장 마이그레이션: 구 구역 ID(`huntTracks`/`huntDrive`/`huntDen`)를 가진 진행 중 사냥 저장은 필드 단위로 복구할 수 없으므로 **사냥 전투만 안전 폐기**한다 — `tacticalBattle = null`로 두고 원정은 `engage` 단계 그대로 유지, 로드 직후 기존 개전 선택지를 다시 연다(기존 `tacticalRecoveryNeeded` 경로 재사용). 마을·원정 상태는 손실 없음.
- [ ] schemaVersion: 본계획(전술전 확장, v8 예정)과 별도 배포면 +1 인상, 동시 배포면 같은 인상에 편승한다. 머지 시점에 담당자 간 확정.

### Task H1.2: 부채꼴 봉쇄·구멍·포위망 진행 규칙

**Files:**
- Modify: `src/game/tacticalHunt.ts` (`resolveHuntRound`의 포위망 계산부)
- Modify: `src/game/config.ts`
- Modify: `tools/game/test_tactical_hunt.mjs`

- [ ] 부채꼴 봉쇄 강도 = 배치된 조의 유효 전력 합(몰이 명령 조는 몰이 기여, 그 외는 봉쇄만). 매 라운드 `zone.sectorBlockade`에 기록해 UI가 읽는다. 전역 pressure 덮어쓰기(:470-471)는 제거한다.
- [ ] 포위망 증가 = 부채꼴별 기여의 합. **빈 부채꼴(구멍)은 기여 0이고 전체 증가에 감쇠를 건다**(구멍 1개당 ×0.5 등 — CONFIG). 3곳 중 1곳만 막으면 포위망이 사실상 오르지 않는다.
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
- Modify: `src/game/tacticalBattle.ts` (`tacticalCommandDescription`에 사냥 문맥 분기 인자 추가)
- Modify: `src/components/TacticalBattleScreen.tsx` (사냥일 때 명령 라벨·설명 교체)
- Modify: `tools/game/test_tactical_hunt.mjs`

- [ ] 명령 재매핑(기존 ID, 라벨·효과만 사냥 전용): `advance`=**몰이**(부채꼴 몰이 기여·소음, 피격 노출 큼), `ambush`=**반격 대기**(몰이 기여 없음, 맹수가 자기 또는 인접 부채꼴에서 행동하는 순간 전력 반격 — 주 대미지 창구), `volley`=**사격**(노출 라운드에만, 현행 게이트), `hold`=**창벽**(급습 피해 감소 — 현행 spearWall 유지), `fallback`은 사냥에서 제거, `openRetreat` 유지.
- [ ] 반격 판정: 맹수 행동 부채꼴의 반격 대기 조는 전력 100%, 인접 부채꼴(3개 원형 — 모두 서로 인접)의 반격 대기 조는 감쇠 배율(CONFIG)로 기여. 반격 피해는 노출 라운드의 사격 피해와 합산해 현행 피해 수식(:554)에 태운다.
- [ ] `chooseDefaultHuntCommands` 재작성: 사냥꾼 = 반격 대기, 창병 = 몰이(맹수 은신 중) / 창벽(노출 중), 사수 = 사격(노출) / 몰이(은신). 기본 명령만으로도 "몰다가, 나오면 친다"가 성립해야 한다.

### Task H2.3: 미끼·덫의 부채꼴 재정의와 `splitDrivers` 폐기

**Files:**
- Modify: `src/game/tacticalHunt.ts` (준비 행동 적용부, `HUNT_PREPARATIONS`)
- Modify: `src/game/huntBeastAI.ts` (미끼·덫 입력)
- Modify: `src/game/saveLoad.ts` (`splitDrivers` 폐기 폴백 — 저장에 있으면 무시)
- Modify: `tools/game/test_tactical_hunt.mjs`

- [ ] `placeBait`: 배치 단계에서 **부채꼴 하나를 지정**해 미끼를 놓는다. 결정 테이블의 급습 표적 선택이 그 부채꼴로 강하게 기울고(노출 점수 보정), 첫 급습의 발각이 확정된다. "미끼 부채꼴 + 인접 반격 대기"가 의도된 함정 플레이가 된다. 현행 "시작부터 전체 발각"은 제거.
- [ ] `setHuntTraps`: 부채꼴 하나를 지정해 덫을 깐다. 그 부채꼴로의 `breakout`·조용한 도주는 1회 자동 실패하고 맹수가 피해를 입는다(현행 1회성 피해 유지, 위치 지정만 추가).
- [ ] `splitDrivers` 폐기: 흩기/뭉치기는 이제 실제 배치로 표현되므로 준비 행동에서 제거한다. `PreparationActionId` 유니언과 saveLoad 화이트리스트에는 유지(구버전 저장 호환)하되 목록에서 빼고, 진행 중 저장에 선택되어 있으면 효과 없이 무시한다.

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
- [ ] 배치 단계·지휘 단계에서 조 칩을 부채꼴로 끌어 배치(기존 `assignHuntGroup` 경로), 이동 중 몰이 반감 표시.

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
- 전투 중 저장 시나리오: 구 형식 사냥 저장 안전 폐기(원정 유지·개전 선택 재개), 신 형식 저장·복원, `splitDrivers` 잔존 저장 무시를 테스트에 포함한다.
- 불변식: 맹수는 행동한 라운드에만 노출된다 / 노출 라운드에만 아군 사격이 가능하다 / 구멍이 있으면 포위망 증가가 감쇠된다 / 호랑이 급습 표적은 항상 노출 점수 최저 조다.

## 리스크 요약

| 리스크 | 대응 |
| --- | --- |
| 정체 국면(전원 뭉치기 + lurk)이 지루한 무한 대치가 됨 | 수색 발각(H2.1)과 미끼(H2.3)를 타개 수단으로 유지, 시간 초과 도주가 최종 안전판 |
| 부채꼴 3개 + 조 2개(최소 원정)에서 성립 불가 | 구멍 감쇠·도주 문턱을 조 수에 따라 완만하게 조정(CONFIG), 최소 인원 진입 시 경고 문구 |
| 구 진행 중 사냥 저장 파손 | 사냥 전투만 안전 폐기 + 원정 `engage` 유지 + 개전 선택 재개 (마을 상태 무손실) |
| 본계획(전술전 확장)과 saveLoad·types 충돌 | 공유 파일 수정 최소화(명령 ID 재사용), schemaVersion 인상은 머지 시점에 담당자 간 확정 |
| 명령 재매핑으로 방어전 설명 문구 오염 | `tacticalCommandDescription`에 문맥 인자 추가, 방어전 경로는 기존 문구 유지 검증 |
