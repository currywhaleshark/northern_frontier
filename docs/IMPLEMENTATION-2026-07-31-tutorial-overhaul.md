# 튜토리얼 개편 착수 지시문 — 「길잡이: 첫 겨울」

> **계획 상태:** 진행 중 — M0~M1 커밋(f1df2e7), M2·M3 완료 (2026-07-31 Opus, 미커밋), 다음 배정: M4
> **M0~M1 검증:** `test_tutorial_scenario.mjs`·`tsc --noEmit`·`npm run build` 통과 (Fable 재확인 포함). 시드 20260718 유지 — 수맥 우물 자리 137칸으로 4단계 성립. `npm run test:game`의 22개 실패는 HEAD에서도 동일한 선행 실패로 이번 변경과 무관 확인
> **담당:** Claude Opus 단독 (`src/game/**` + `src/components/**` 모두 — Codex 분업 없음)
> **작성:** 2026-07-31 Fable (검토·계획), 원전: [`docs/superpowers/plans/2026-07-31-tutorial-overhaul.md`](superpowers/plans/2026-07-31-tutorial-overhaul.md)

구현 세부와 근거는 전부 계획서에 있다. 이 문서는 마일스톤별 작업 지시와 완료 기준만 정리한다.
**계획서를 먼저 정독할 것.** 아래 결정은 전부 확정 상태다 — 재논의하지 않는다.

## 확정 결정 요약

1. **파종·집짓기 병행**: 2단계 「봄 파종」은 밭 4칸 *배치*로 완료(농부가 배경에서 갈고 파종), 3단계 「집과 장작」 isDone에 `totalSownArea ≥ 4` 병행 포함. 근거: 경작지 공사는 `farmer`, 건물 공사는 `builder` (`agents.ts:1581`, `simulation.ts:500`)
2. **정착지 이름**: 시작 입력 없음 — 0단계는 이름 확인만. 개칭 청원(`settlementName.ts`)은 첫 겨울 이후 `rename` 길잡이 모듈로 안내
3. **혹한**: A안 — 기후 시스템 무손상. 겨울 스텝 중 1회 "장작 소모 급증" 경고 + 당일 소모 배율(×1.3 기준, config화)
4. **첫 병자**: 스텝 onStart에서 건강한 성인 1명 `sick` 부여, isDone = 그 병자의 회복. 역병 시스템(`plagueCase`) 사용 금지
5. **초회 도움말(guides)**: 일반 게임 포함 모든 새 게임 `enabled: true` 기본, `SettingsDialog` 상시 토글, 구버전 저장은 `false` 보정
6. **`TUTORIAL_SCENARIO_VERSION = 3`** — 구버전 해제 로직은 기존 그대로 동작 (`saveLoad.ts` 2554행 부근)

## 지켜야 할 기존 원칙 (scenario.ts 상단 주석의 원칙 유지)

- 스텝은 상태 술어(isDone)로 진행 — 날짜 스크립트 금지
- 저장에는 진행 위치(`ScenarioState`)만 — 문구·조건은 코드에. 스텝 교체에 마이그레이션 불필요
- 랜덤 사건은 `scenarioSuppressesRandomEvents` 게이트 유지. 새 랜덤 일일 시스템은 게이트 뒤에 — 이 규칙 변경 금지
- 통제 사건은 게이트와 무관한 스텝 훅(`onStart`/`onDay`)으로만
- 코드 주석·문구·로그는 한국어, 기존 사극체 문체(“~하십시오”) 유지

## M0 — 타입·저장 계약

- [x] `src/game/scenario.ts`: `ScenarioStepDefinition`에 `onDay?: (state: GameState, rng: Rng) => void` 추가, `dailyScenarioTick`에서 isDone 판정 전에 호출 (rng는 endOfDay의 것을 전달 — 시그니처 변경 필요 시 호출부 갱신)
- [x] `src/game/types.ts`: `GuideState { enabled: boolean; seen: Record<string, number> }` 신설, `GameState.guides?: GuideState`
- [x] `src/game/saveSchema.ts`: `CURRENT_SCHEMA_VERSION = 53`, `saveLoad.ts` 마이그레이션 체인에 v53 추가 — `guides` 부재 시 `{ enabled: false, seen: {} }` (구버전 저장은 안내 끔)
- [x] `newGame()`: `guides = { enabled: true, seen: {} }` 초기화 (일반 게임 포함)
- [x] `TUTORIAL_SCENARIO_VERSION = 3`
- [x] 신규 `src/game/guides.ts`: `openGuideOnce(state, moduleId, ...)` 골격 — 1회성 판정(`seen` 기록)과 enabled 체크만. 트리거 연결·UI는 M5

## M1 — 필수 11스텝 재구성

계획서 §3 단계표가 명세다. `TUTORIAL_STEPS` 전면 개정:

| # | id | 완료 조건 요점 |
|---|---|---|
| 0 | `naming` | `residentSelected` ∧ `minimapClicked` ∧ `speedChanged` ∧ day≥2 |
| 1 | `working` | `jobPanelOpened` ∧ 벌목꾼≥1 ∧ 운반꾼≥1 |
| 2 | `sowing` | 밭/논 배치 면적 ≥ 4 (완공·파종 불요) |
| 3 | `hearth` | 집 1채 + 장작마당 + 장작꾼 + 장작 목표 ∧ `totalSownArea ≥ 4` |
| 4 | `water` | `aquiferToggled` ∧ (우물 완공 ∨ 자연 급수 밭 존재) |
| 5 | `hunting` | 사냥꾼 2명 ∧ 고기 목표 (현행 유지, 본문에 부패 경고) |
| 6 | `patient` | onStart 병자 삽입(결정 4), isDone = 해당 병자 회복 (`flags`에 병자 id 기록) |
| 7 | `tribute` | 현행 ∧ `courtWindowOpened` (onStart `announceCourtTribute` 유지) |
| 8 | `defense` | 목책 ∧ 수비병 1 ∧ 파수꾼 1 |
| 9 | `stocktake` | `checklistOpened` ∧ 식량·장작 n일분 (목표치는 flags 주입) |
| 10 | `winter` | 겨울 10일 (현행) + onDay 혹한 1회(결정 3, 발화 여부 flags 기록) |

- [x] 본문 문구: 개편안 문안 기조 (계획서 §3 및 사용자 개편안 원문 인용부). 목재/장작 구분(3), 수맥·논·농수로 소개(4), 부패(5), 북병사·명성·의심(7), 수비병/파수꾼 구분(8) 본문 반영
- [x] UI 훅 플래그(`minimapClicked`, `speedChanged`, `jobPanelOpened`, `aquiferToggled`, `courtWindowOpened`, `checklistOpened`)는 **M1에서는 읽기만** — `markScenarioFlag` 연결은 M2. isDone이 이 플래그를 참조하는 것은 그대로 구현
- [x] `src/game/tutorialStart.ts`: 새 목표치 주입(`foodDaysGoal`·`firewoodDaysGoal` 등), `ensureTutorialInvariants`에 수맥/자연 급수 불변식 추가. `TUTORIAL_SEED`가 조건 미달이면 시드 재선정
- [x] 겨울 점검용 일분 계산 헬퍼(예: `winterReadiness(state)`) — 전일 소모 스냅샷 근사. 게임 측에 두고 M4 패널이 재사용
- [x] 완료 모달: 선택지 2개(**계속해서 안내받는다** / **이제 스스로 운영한다** → `guides.enabled`), 새 문구("첫 겨울은 끝났지만 북방은 이제부터입니다…")
- [x] `tools/game/test_tutorial_scenario.mjs` 병행 갱신: 새 11스텝 모범 답안 완주(UI 플래그는 테스트가 직접 주입), 봄 시한 내 밭 배치·3단계 종료 시 파종 4칸 단언, 랜덤 잠금·버전 2 저장 해제·수맥 불변식 케이스
- [x] 알려진 과도기: `TutorialCoach`의 `STEP_HINTS`가 구 스텝 id를 참조 — 코치는 설계상 조용히 물러나므로 M1에서는 방치, M2에서 전면 갱신

**M0~M1 완료 기준**: `node tools/game/test_tutorial_scenario.mjs` 통과 + 타입 검사/프로덕션 빌드 통과 + 새 튜토리얼을 실제 기동해 0~2단계 진행 확인(수동 또는 헤드리스). 커밋은 사용자 확인 후.

## M2 — UI 훅 연결 + 코치 전면 갱신 (완료)

- [x] `markScenarioFlag` 연결: `minimapClicked`(Minimap `onNavigate` → GameSession), `speedChanged`(`setUserSpeed`),
      `jobPanelOpened`·`courtWindowOpened`(`openDockWindowIds` 감시 effect — 독 아이콘·단축키·세공 칩·고정 창 복원을 모두 덮는다),
      `aquiferToggled`(수맥 탭 핸들러). `checklistOpened`는 M4가 패널과 함께 연결한다
- [x] `STEP_HINTS` 11스텝 전면 개정 — 구 id(wake/firewood/housing) 제거, 소목표 순서대로 얕은 곳→깊은 곳 앵커 경로
- [x] 신규 앵커: `minimap`(Minimap), `map-layer-aquifer`(MapLayerTabs), `court-figure`(CourtWindow 북병사 카드)
- [x] `stocktake`·`winter`는 가리킬 UI가 없어 빈 힌트 — 겨울 점검 패널이 서면(M4) `stocktake`에 진입점을 잇는다

## M3 — 통제 사건 다듬기 (완료)

- [x] 혹한: 문구·배율·발화일 모두 `CONFIG.tutorial`에서만 오고 경고는 important 로그, 기후 시스템 무손상 확인
- [x] 병자: onStart 경고 로그와 본문·코치(약초꾼 배정) 안내가 같은 곳을 가리키는지 확인
- [x] 1회성 플래그(`coldSnapWarned`·`patientResidentId`) 저장·로드 유지를 회귀 테스트로 고정

## M4~M6 (후속 배정 — 착수 전 이 문서 갱신)
- M4: `WinterChecklistPanel.tsx` — `winterReadiness` 재사용, 9단계 자동 표시 + 가을~겨울 상시 진입점
- M5: `guides` 트리거 11곳 연결(계획서 §5 표 — `rename` 포함), `GuideCard` 비차단 카드 + 습격·화재·재해는 모달, `SettingsDialog` 토글
- M6: §9 테스트 전량 + `PLAN-STATUS.md`·본 문서 상태 갱신
