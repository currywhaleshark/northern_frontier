# 튜토리얼 개편 착수 지시문 — 「길잡이: 첫 겨울」

> **계획 상태:** 완료 — M0~M5 커밋(f1df2e7, f03c3cb, 58956ca), M6(감사·마무리) 완료 (2026-07-31 Opus)
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

## M4 — 겨울 점검 패널 (완료)

- [x] 판정은 게임 측에: `winterReadiness.ts`에 `winterChecklist(state)` 추가 — 6항목 `ok/warn/bad`.
      기준은 시나리오 flags(`foodDaysGoal`·`firewoodDaysGoal`)가 있으면 그것을, 없으면 `CONFIG.tutorial`의 같은 값을 쓴다.
      두 눈금(9단계 완료 조건 / 패널 표시)이 갈라지지 않게 하려는 것이다
- [x] 신규 `src/components/WinterChecklistPanel.tsx` — 표시 전용. 기존 창 관례(`modal-overlay` + `modal`, `edict-heading`)를 따랐다
- [x] 진입점은 상단 바 `topbar-objectives`의 칩(`ongoing-objective winter-check`) — 9단계 중에는 늘, 평시에는 시나리오 종료 후 가을·겨울에만 선다.
      칩에 일분 요약(식량/장작)이 함께 떠서 열지 않고도 눈금이 보인다
- [x] `markScenarioFlag(state, 'checklistOpened')`를 진입 핸들러(`handleOpenWinterChecklist`)에 연결 — M2 인계 사항 1 해소
- [x] 칩에 `data-tut="checklist-open"` 앵커, `TutorialCoach`의 `STEP_HINTS.stocktake` 2단 힌트(열기 → 목표까지 쌓기) — M2 인계 사항 2 해소

**판정 기준** (전부 `winterChecklist`):

| 항목 | ✓ | △ | ✕ |
|---|---|---|---|
| 식량 | 일분 ≥ `foodDaysGoal`(30) | ≥ 한 계절(12일) | 그 미만 |
| 땔감 | 일분 ≥ `firewoodDaysGoal`(24) | ≥ 한 계절(12일) | 그 미만 |

> 두 목표치는 M6 밸런스 재점검에서 18/14 → 30/24로 올렸다 (아래 M6 §3).
| 주거 | 노숙 0 ∧ 빈자리 > 0 | 노숙 0 ∧ 빈자리 0 | 노숙 ≥ 1 |
| 옷과 신발 | 결핍 0명 | 결핍 ≤ 인구 1/4 | 그 초과 |
| 세공고 | 요구 없음 또는 전 품목 충당 | 일부 충당 | 하나도 없음 |
| 병자 | 0명 | ≤ 인구 1/10 | 그 초과 |

## M5 — 선택형 길잡이 (완료)

- [x] `src/game/guides.ts` 확장: `GUIDE_MODULES` 12개(제목·로그 한 줄·본문·형식), `openGuideOnce`가 표시까지 맡는다.
      **`scenarioRunning` 가드로 시나리오 중에는 전부 미발화** (순환 import를 피해 `state.scenario` 술어를 직접 본다)
- [x] 형식: 습격·화재·재해만 모달(`PendingChoice.kind = 'guide'`), 나머지 9개는 비차단 카드.
      모달은 트리거 시점에 곧바로 열지 않고 `guideModalQueue`에 넣는다 — 같은 틱에 이어지는 사건 모달이 덮어쓰는 것을 막기 위함이다.
      `dailyGuideTick`(endOfDay 말미)과 `resolveChoice` 끝에서 자리를 보고 연다
- [x] 신규 `GuideCard.tsx`(`GuideCardLayer`) — 코치 말풍선과 구별되는 왼쪽 아래 금색 카드, 닫기 버튼. 표시와 동시에 로그에도 한 줄
- [x] `SettingsDialog.tsx` 상시 토글(게임 중에만 표시 — 메인 메뉴에는 상태가 없다). 끄면 떠 있던 카드·대기열도 함께 걷는다
- [x] 트리거 12곳 (전부 한 줄):

| 모듈 | 형식 | 연결 지점 |
|---|---|---|
| `preservation` | 카드 | `agents.ts` 완공 훅(움 저장고·훈연소·건조대·장독대) / `simulation.ts` `onSeasonChange` 첫 가을 |
| `livestock` | 카드 | `agents.ts` 완공 훅(축사) / `livestock.ts` `acquireLivestock` |
| `oxen` | 카드 | `livestock.ts` `acquireLivestock` (species === 'cattle') |
| `disaster` | 모달 | `disasters.ts` 6개 발생 함수(이른서리·늦서리·황충·가뭄·설해·대홍수) |
| `fire` | 모달 | `fire.ts` `maybeStartFire` |
| `diplomacy` | 카드 | `foreignSites.ts` 첫 거점 발견(산채 제외) / `GameSession.tsx` 세력 창 첫 열람 |
| `battle` | 모달 | `raids.ts` `checkRaidTrigger` (습격 성사 직전) |
| `expedition` | 카드 | `foreignSites.ts` 첫 산채 발견 |
| `beast` | 카드 | `specialEvents.ts` `openWildlifeEvent` (멧돼지·늑대·호랑이 2지점) |
| `mining` | 카드 | `silver.ts` `openSilverVeinChoice` / `agents.ts` 완공 훅(채광갱) |
| `chronicle` | 카드 | `promotion.ts` `upgradeSettlementCenter` |
| `rename` | 카드 | `simulation.ts` `onSeasonChange` 겨울→봄 / `scenario.ts` `resolveScenarioChoice` (튜토리얼 완료 직후) |

- [x] `endOfDay`의 랜덤 게이트 블록 구조 무변경 — `dailyGuideTick`은 `dailyScenarioTick` 바로 뒤에 한 줄로 붙였다
- [x] 회귀 테스트 추가: 시나리오 중 미발화·seen 미기록, 12모듈 형식표, 카드/모달 경로(모달은 살아 있는 사건 모달을 덮지 않는다), 저장·로드 후 seen 유지, `enabled=false` 전량 미발화

## M6 — 감사·마무리 (완료)

감사가 목적이었으므로 기능 추가는 없다. 회귀 테스트 보강 2건, 규칙 주석 1건, 밸런스 수치 2건이 전부다.
`scenarioSuppressesRandomEvents` 게이트 블록 구조는 손대지 않았다.

### 1. 계획서 §9 테스트 7항목 커버리지

| # | 항목 | 덮는 테스트 | 기존/보강 |
|---|---|---|---|
| 1 | 완주 회귀 (11스텝·파종 시한·병행 완료) | 「완주: 각 스텝의 모범 답안」 블록 — 11스텝 순서 단언, `sownAtHearthExit >= 4`, 별도 블록의 `getSeason(day) === 'spring'` 파종창 단언 | 기존 |
| 2 | 랜덤 잠금 유지 | `ALLOWED_MODAL_KINDS = {scenario, tribute}` + `closeModals`가 완주 전 구간에 걸림. §9-7 잠금 프로브가 위협도 최대에서 30일을 더 돌린다 | 기존 + 보강 |
| 3 | 통제 사건 (병자·혹한 1회성) | 혹한 전용 블록(1회 발화·추가 소모·중복 방지), 완주 블록의 `patientResidentId`·회복 단언, 저장·로드 후 재발화 금지 블록 | 기존 |
| 4 | 버전 2 저장 해제 | 저장 블록 — 미래 버전(+1) 케이스에 **버전 2 케이스를 추가**하고, 해제된 저장의 게이트가 열려 있는지도 함께 단언 | 기존 + 보강 |
| 5 | guides 1회성·`enabled=false`·구버전 보정 | 시나리오 중 미발화 블록, 12모듈 형식표 블록, `enabled=false` 전량 침묵 블록, 스키마 v52 보정 블록, seen 저장 유지 블록 | 기존 |
| 6 | 시드 불변식 (서식지 + 수맥/자연 급수) | 결정론 블록 — `habitats.some(active)`, `tutorialWaterAccess`, "물 자리가 없습니다" 로그 부재 | 기존 |
| 7 | 완료 후 개방 | **신규 블록** — 위협도를 매일 100으로 밀고 30일을 돌려, 길잡이 중에는 습격이 한 번도 서지 않고 완료 선택(`guided`) 뒤에는 실제로 서는 것을 맞대어 본다. 술어(`scenarioSuppressesRandomEvents`)만이 아니라 `endOfDay`의 게이트가 풀리는지를 본다 | **보강(신규)** |

- §9-2의 허용 목록은 계획서가 적은 `scripted`·`guide`까지 넓히지 않고 `scenario`·`tribute`로 **더 좁게** 유지했다.
  통제 사건은 모달을 열지 않고 로그로만 말하고, guides는 시나리오 중 스스로 물러나므로 좁은 목록이 그대로 통과한다 —
  좁은 쪽이 더 강한 단언이라 그대로 둔다.

### 2. M4~M5 인계 사항 5건

| # | 인계 사항 | 판정 | 조치 |
|---|---|---|---|
| 1 | `guideCards`/`guideModalQueue`가 스키마 상승 없이 `GameState`에 실린 판단 | **문제없음 — 그대로 둔다.** 둘 다 표시용 임시 필드다. `loadGame`이 `Array.isArray` 검사로 없으면 `[]`로 정규화하고(2588·2594행 부근), 읽는 쪽은 전부 `?? []`를 쓴다. "다시 뜨지 않는다"는 약속은 스키마 v53에 실린 `guides.seen`이 지키므로 두 필드가 통째로 사라져도 1회성은 무너지지 않는다 | 근거를 못 박는 회귀 케이스 추가 (두 필드를 지운 저장이 `[]`로 로드되고 `seen`은 살아남는다) |
| 2 | `revealForeignSitesFromExploration`이 `loadGame`에서 새 거점을 드러낼 때 카드가 서는 동작 | **의도된 동작으로 승인.** 같은 호출이 발견 로그("…발견했습니다")도 함께 남기므로, 카드는 허공에 서는 게 아니라 그 자리에서 일어난 진짜 첫 발견에 붙는다. 구버전 저장은 `guides.enabled = false`라 애초에 조용하고, 시나리오 중에는 guides가 물러난다 | 없음 (기록만) |
| 3 | `disaster` 트리거가 6개 발생 함수에 개별로 걸린 약점 | **규칙 주석이 없었다.** 공통 진입점이 없어 새 재해 함수를 추가할 때 빠뜨리기 쉽다 | `disasters.ts`의 `DISASTER_IDS` 바로 위에 규칙 주석 한 단락 추가 — "새 재해 발생 함수를 추가하면 `openGuideOnce(state, 'disaster')`도 함께" |
| 4 | `beast` 두 분기 커버 | **덮여 있다.** `specialEvents.ts` `openWildlifeEvent` 안 멧돼지 분기(306행)와 늑대·호랑이 공통 분기(331행) 양쪽에 한 줄씩 있다 | 없음 |
| 5 | 고정(pin)된 창이 있는 채로 튜토리얼 시작 시 플래그가 즉시 켜지는 관대함 | **관대함을 유지한다.** 실기동으로 확인 — `uiPrefs.pinnedDockWindows`는 저장소에 남아 새 게임에서도 초기화되지 않으므로, 직업·조정 창을 고정해 두면 첫 화면부터 두 창이 실제로 떠 있고 플래그도 그때 켜진다. 플래그가 재는 것은 "그 창을 보았는가"이고 고정 창은 정말로 눈앞에 있다. 게다가 1단계는 벌목꾼·운반꾼 배정을, 7단계는 세공고 비축을 함께 요구하므로 배울 내용이 건너뛰어지지 않는다 | 없음 (기록만) |

### 3. 밸런스 재점검 — 겨울 점검 목표치 상향 (18/14 → 30/24)

M1 보고의 지적이 사실이었고, 실측은 그보다 더 헐거웠다 (길잡이 시드·인구 12):

| 시점 | 식량 일분 | 장작 일분 |
|---|---|---|
| 게임 시작 (day 1, 아무것도 하지 않은 상태) | 25.0 | 18.2 |
| 모범 답안이 9단계에 닿는 시점 | 42.6 | 22.7 |
| 그 뒤 20일 무보강 추이 | 42.6 → 54.6 (계속 상승) | 22.7 → 16.6 (계속 하강) |

옛 목표 18/14는 **시작 곳간만으로 이미 둘 다 충족**되어, 9단계는 사실상 "겨울 점검을 한 번 열기" 스텝이었다.
`CONFIG.tutorial`을 다음으로 조정했다 (`winterChecklist`가 같은 값을 패널 기준으로도 쓰므로 한 곳만 고치면 눈금이 함께 움직인다):

- `foodDaysGoal: 18 → 30` — 겨울 12일 + 봄 전반. 시작 25.0일분으로는 못 넘어, 첫해 봄여름의 생산이 있어야 닿는다
- `firewoodDaysGoal: 14 → 24` — 겨울 12일의 두 배. 도달 시점 22.7일분에 못 미치고 그 뒤로도 계속 줄어드는 눈금이라,
  장작꾼·벌목꾼을 실제로 더 붙여야 넘는다. 개편안이 노린 "겨울은 장작이 떨어지는 순간부터"를 목표가 처음으로 강제한다

실기동 확인: 9단계 상태에서 겨울 점검 칩이 「식량 29일분 / 장작 17일분」으로 서고 패널의 식량·땔감이 둘 다 `△ 아슬함`으로 뜬다 (옛 값이면 둘 다 `✓`).

### 4. 실기동 스모크 (dev 서버)

- 0단계 모달이 게임 시작과 동시에 열리고, 상단 목표 칩이 스텝 제목·목표를 함께 띄운다
- 코치 말풍선이 주민 창 아이콘을 가리키다가, 미니맵 클릭·배속(3배) 전환·주민 선택을 마치자 「시간을 흘려 이튿날 아침을 맞으십시오」로 넘어간다 — M2의 UI 훅 3개(`minimapClicked`·`speedChanged`·`residentSelected`)가 실제로 기록된다
- 이튿날 아침에 1단계 모달(「길잡이 2/11 — 사람과 일」)이 이어 열린다
- 9단계에서 겨울 점검 칩이 서고, 눌러 열면 6항목 판정 패널이 새 기준(30/24)으로 뜬다
- 직업·조정 창을 고정한 채 새 길잡이를 시작하면 두 창이 첫 화면부터 떠 있다 (인계 5의 근거)

### 5. 변경 파일

- `src/game/config.ts` — `tutorial.foodDaysGoal` 30, `tutorial.firewoodDaysGoal` 24 + 실측 근거 주석
- `src/game/disasters.ts` — 재해 발생 함수 추가 시 `openGuideOnce`를 함께 넣으라는 규칙 주석
- `tools/game/test_tutorial_scenario.mjs` — §9-7 완료 후 개방 블록 신규, 버전 2 저장 케이스, 표시용 guide 필드 정규화 케이스
- `docs/IMPLEMENTATION-2026-07-31-tutorial-overhaul.md`·`docs/superpowers/plans/2026-07-31-tutorial-overhaul.md`·`docs/PLAN-STATUS.md` — 상태 갱신
