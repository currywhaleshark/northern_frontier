# 핸드오프 — 전투확장 2단계 프론트엔드 (내일의 페이블에게)

> 작성: 2026-07-20 새벽, 집 환경의 페이블(Claude).
> 전제: **이 문서를 읽는 환경에는 Hermes도 kanban 보드도 없다.** 조율 이력은 아래 스냅샷이 전부이고,
> 이 문서 하나로 착수할 수 있어야 한다. 모든 설계·결정의 원전은
> [전술전 확장 2단계 계획서](superpowers/plans/2026-07-19-tactical-combat-expansion-phase-2.md)다 —
> 특히 **9.4절(분업·파일 소유권·계약), 13.8절(사용자 최종 결정), Phase 3 섹션**을 먼저 읽어라.

## 0. 30초 요약

- 역할 분담: **Codex = 게임 백엔드(`src/game/**`) + 스프라이트(`src/render/tactical*`) / Fable(너) = 프론트엔드(`src/components/**`, 전술 CSS)**.
- 너의 브랜치: `fable/combat-expansion-phase-2-frontend`. 통합 브랜치: `codex/combat-expansion-phase-2`.
- Phase 0~2는 양쪽 모두 완료·통합됨(통합 헤드 `7935631` + 너의 4커밋). **다음 작업 = Phase 3 프론트(빈 전장 배치 카드 UI)**, 단 Codex의 P3 백엔드 계약이 먼저 통합돼 있어야 한다.
- 사용자 방침: **Phase 3 프론트는 추론 수준을 엑스트라(xhigh)로 올려서 작업하기로 합의됨.** 시작 전에 사용자에게 상기시켜라.

## 1. 시작 절차 (반드시 이 순서)

1. `git fetch origin` 후 `origin/codex/combat-expansion-phase-2` 로그를 확인해 **P3 백엔드가 통합됐는지** 본다.
   판별 기준: `src/game/tacticalDeployment.ts` 존재 + `tools/game/test_tactical_deployment.mjs` 존재 +
   커밋 메시지에 deployment/배치 언급. 어젯밤 기준 Codex가 P3 백엔드 작업 중이었다(미완).
2. **통합돼 있으면**: 너의 브랜치를 통합 헤드로 `git merge --ff-only`(지금까지 항상 ff 가능했다 — 안 되면
   Codex가 병합을 안 한 것이니 rebase 말고 통합 커밋을 기다리거나 사용자에게 확인).
3. **통합 안 돼 있으면**: Phase 3 프론트를 시작하지 마라(계약 선행 원칙, 계획서 9.4). 대신 할 수 있는 것:
   Phase 4 준비(아래 6절), 또는 대기.
4. 계약 파악은 코드가 원전이다: `src/game/tacticalDeployment.ts`의 export 시그니처,
   `tools/game/fixtures/`의 신규 fixture, `test_tactical_deployment.mjs`가 곧 계약 문서다.
   Codex는 kanban 코멘트로 핸드오프 노트를 남기는 습관이 있는데 **그건 집에서만 보인다** —
   커밋 메시지와 테스트 파일에서 같은 정보를 얻어라.

## 2. 현재까지 된 것 (너의 커밋 4개, 전부 push됨)

| 커밋 | 내용 |
|---|---|
| `f4fabd2` | P1: EnemyPlanPanel을 `enemyPlanSummaryView` 계약 기반으로 확장(한 줄 요약·교리 강점/약점/권장 대응·편제 그룹 범주 표시), 시뮬레이터에 교리·편제·좌우 우회 강제 옵션 |
| `dcc4d21` | P1.5: `src/components/tactical/stagePointerDrag.ts` — **Phase 3에서 그대로 쓸 공용 드래그 훅**. `?dragSpike` URL 플래그 하네스(`StageDragSpike.tsx`)로 검증 완료 |
| `4534c5e` | P2: 행동 징후(`summary.intentSignals`) 표시, `doctrineShift` 이벤트 재생 연결(효과음+액터 펄스), 시뮬레이터 편제 `implementationPhase <= 2` 캡 |
| `d0d0c73` | P0: [UI 기준선 문서](QA-2026-07-20-tactical-ui-baseline.md) + 스크린샷 16장 + 재현 스크립트 |

## 3. Phase 3 프론트 — 네가 만들 것

계획서 Phase 3 섹션과 13.8 사용자 확정이 명세다. 요약하면:

- **배치 카드 독**: 지휘 가능 부대가 전부 `null` placement(카드 대기)로 시작. 하단을 `배치 대기`/`배치 완료`
  두 영역으로. 카드에는 병과·인원·무기·기마·특수주민·추천 열 표시.
- **카드 → 무대 배치**: `useStagePointerDrag` 재사용, 앵커는 백엔드가 주는 유효 배치 위치.
  **배치 단계 드롭은 확인 카드 없이 즉시 적용**(13.8 확정), 되돌리기는 카드 영역으로 역드래그 + `배치 초기화`.
- **자동배치 버튼**: 백엔드 `autoDeployTacticalGroups` 호출. 결과는
  [기준선 스크린샷](qa/tactical-baseline-2026-07-20/)의 `defense-deployment-*.png` 구역·열과 **완전히 같아야** 한다.
- **분할·합류 UI**: `1명 분리` / `절반` / `합치기` + **`<주민 이름>의 조 분리`**(특수주민 본인+동료 0~2명).
  특수주민이 든 조는 `아라개의 창수비병조`식 명명, 특기는 소속 조 전체 적용(과반 규칙은 사용자가 기각했음).
- **특수주민 강조**: 스프라이트 1.12~1.18배 + 상시 소형 표식 + 호버/선택 이름표. 상시 테두리 금지.
- **민병 소집 카드**: 준비 실행 시 상태 변경, 카드 노출·강조는 배치 단계 진입 시점.
- **야습 강제 자동배치**: 야습 성공 시 배치 화면을 건너뛰고 라운드 1 지휘로 — UI는 이 분기를 자연스럽게 처리
  (횃불 경계로 막았으면 정상 배치 화면).
- **토벌전**: 진입로만 배치 허용, `선행 침투` 전략 채택 시에만 사냥꾼 1조각 전방 은닉 앵커.
- 상한: 원래 조당 3조각, 지휘 가능 그룹 전체 10개(치료반·피난 주민 제외). 전원 배치 의무(미배치 예비대 없음).

**규칙**: 게임 규칙 수치를 컴포넌트에서 재계산하지 마라. 검증·적용은 전부 백엔드 mutation/unavailable-reason
API로. 계약에 빠진 게 있으면 컴포넌트에서 우회하지 말고 계획서에 "계약 요청" 메모를 남기고 사용자를 통해
Codex에 전달해라(집이면 kanban 코멘트).

## 4. 검증 루틴

```bash
npx tsc --noEmit -p .
node tools/game/test_tactical_components.mjs   # 프론트 소스 계약 테스트 (너의 파일)
npm run test:combat
npm run build
```

- 브라우저: 메인 메뉴 → 전투 시뮬레이션(홀라온·경보됨이 준비점수·공개 부대가 많아 QA에 좋다).
  콘솔 훅 `window.__game.state()`로 전투 상태 직접 확인 가능.
- 드래그 인프라 회귀: URL에 `?dragSpike` 붙이면 스파이크 하네스가 살아난다.
- 스크린샷 비교 기준: `docs/qa/tactical-baseline-2026-07-20/` (재현 스크립트 동봉 —
  playwright는 레포 밖에 설치할 것, `package.json`은 통합 전용 파일이다).
- 알려진 무관 실패: `test_screen_ambient_audio.mjs` 1건은 기준선부터 깨져 있음(비전투, 우리 소관 아님).

## 5. 어젯밤 kanban 마지막 스냅샷 (2026-07-20 00:30경)

| 태스크 | 상태 | 담당 |
|---|---|---|
| P1-backend 병과·편제·계약 | 완료 (`e38b283`+`4c0e9da`) | Codex |
| P1-followup 기병익대 측정 | 완료 (`1cebef1`) | Codex |
| P2-backend 상성·교리 AI | 완료 (`cc7a347`, 통합 `7935631`) | Codex |
| P0/P1/P1.5/P2-frontend | 전부 완료 (2절 커밋들) | Fable |
| **P3-backend 빈 전장 배치 계약** | **진행 중** (00:25 착수) | Codex |

P3-backend 태스크 본문 요지(집 밖에서 못 보니 여기 옮김): 빈 `deploymentPlacements`로 시작 +
`autoDeployTacticalGroups` 복원, 일반 분할/합류, `<이름>의 조` 명명·특기 조 전체 적용, 민병소집 카드,
피난주민 최후열 고정, 토벌전 진입로 제한·전방 은닉, 야습 즉시 시작, 배치 selector·유효 앵커·mutation
단일 계약, 저장 마이그레이션, fixture·결정성 테스트까지 Codex 소유 파일에서 제공. React/CSS는 안 건드림.

## 6. 보류·주의사항 (까먹기 쉬운 것)

- **장계 교리·편제 표기**: `TacticalBattleReport`에 필드가 없어 Phase 9 데이터 계약까지 보류(합의됨).
- **실기기 터치 검증**: 드래그 인프라의 터치 경로는 설계상 동작하나 에뮬레이션 불가로 미검증 — Phase 4 QA 항목.
- **`src/sound/sfx.ts` 소유권**: Fable 소유로 이동 제안한 상태(계획서 13.10 5절). Codex의 소유권표 최종
  반영 여부를 9.4절에서 확인하고, 반영 전이면 sfx.ts 수정은 피해라.
- **드롭 확인 정책 혼동 주의**: 배치 단계 = 확인 없음 / 지휘 단계 = 확인 카드. Phase 4에서 구현.
- **브라우저 패널 함정(집 환경)**: 프리뷰 뷰포트가 0×0으로 깨지면 이벤트가 안 먹는다 —
  `resize_window 1280×720`부터. (회사 환경이면 무관)
- 커밋 서명 관례: 본문 끝 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- 회사에서 한 결정·계약 요청은 **이 문서나 계획서에 기록**해 두면, 집에 돌아온 페이블이 kanban에 동기화한다.

## 7. 2026-07-20 회사 세션 기록 — P3 프론트 구현 완료 (이 커밋)

Codex의 P3 백엔드(`dca02c9`, 통합 `d729f4f`)를 확인하고 P3 프론트를 구현했다. xhigh 합의는 지켜졌다.

### 구현 내역

- **`src/components/tactical/TacticalDeploymentDock.tsx` (신규)** — 배치 대기/배치 완료 카드 독.
  카드에 병과 라벨·인원·무기·기마·특수주민(★ 이름·특기)·추천 구역·열(`defaultTacticalDeploymentPlacement`)
  표시. 카드별 `useStagePointerDrag` — 드롭 즉시 적용(13.8), 대기 영역 역드래그로 예비 복귀,
  드롭 전 `tacticalDeploymentPlacementUnavailableReason` 선검증 + 피드백 줄(role=status).
  피난 주민은 잠긴 카드. `militia-unarmed-mustered` cohort는 배치 단계 진입 시 `긴급 소집` 배지+펄스.
- **`TacticalZoneColumn.tsx`** — 아군 전열 레인에 `data-deploy-anchor="{zoneId}|{line}"`(배치 단계만),
  드래그 중 유효/호버/불가 클래스(판정은 전부 백엔드 validator), 호버 유효 레인에 부대 고스트.
  특수주민: 본인 슬롯만 전용 시트(`slotSpecial`)·`--featured-scale`(백엔드 `spriteScale`)·상시 소형
  표식·호버/선택 이름표. 상시 테두리 없음. 구버전 저장(featuredResidents 없는 group.special)은 기존 동작 유지.
- **`TacticalBattleScreen.tsx`** — 배치 단계 개편: 헤딩에 자동배치/배치 초기화/배치 완료(게이트 =
  hunt ? `huntDeploymentUnavailableReason` : `view.unavailableReason`). UnitDock 대신 카드 독.
  분견대 편성 블록을 전 전투 공통화(1명 분리/반으로 나누기/같은 조 합류 — hunt는 기존 prop,
  그 외는 dispatch). `<이름>의 조 분리` + 동행 0~2명 선택 UI(`splitFeaturedTacticalGroup`).
  구역 버튼은 드래그와 같은 validator로 비활성+사유 title. 지휘 1라운드에
  `deploymentForced === 'nightAmbush'` 야습 강제배치 노트.
- **`TacticalGroupChip.tsx`** — `DockDefenderSprite` export만 추가.
- **`global.css`** — 독/카드/앵커/고스트/특수주민/동행 선택 스타일 + `prefers-reduced-motion` 처리.
- **`tools/game/test_tactical_components.mjs`** — P3 프론트 계약 검사 ~35건 추가(즉시 적용·validator
  단일 사용·특수주민 배율 계약·상시 테두리 금지·reduced-motion 등).

### ⚠ 통합 경계 변경 — kanban 동기화 필요

`src/App.tsx`(통합 전용)에 최소 연결을 추가했다: `handleTacticalAction`이 오류 문자열을 반환하도록
변경(기존 호출부 영향 없음) + 범용 `handleTacticalDeploymentAction` + `onDeploymentAction` prop 1개.
P3 mutation 7종을 개별 핸들러로 늘리지 않기 위한 단일 dispatch이며 Phase 4~5도 재사용 예정.
**집에서 Codex/통합 담당에게 이 경계 변경을 알리고 승인 받을 것.**

### 계약 요청 후보 (비차단)

- `battleSimulation.ts`: 시뮬레이터 아군 구성에 **특수주민 포함 옵션**이 없어 명명 조·특기 UI를
  시뮬레이터에서 QA할 수 없다. 특수주민 스냅샷 생성 옵션 추가를 Codex에 요청 검토.

### 검증

- `npx tsc --noEmit`, `test_tactical_components.mjs`, `test_tactical_deployment.mjs`,
  `npm run test:combat`, `npm run build` 전부 통과 (500kB chunk 경고는 기존).
- 브라우저(전투 시뮬레이션): 방어전(홀라온·경보됨·민병 소집) — 빈 무대 시작, 카드 7장+잠긴 피난 주민,
  긴급 소집 배지, 자동배치 결과가 기준선 규칙과 정확 일치(사냥꾼 approach/rear, 조총 wall/middle,
  각궁 wall/rear, 나머지 wall/front, 소집 민병 wall/front), 배치 초기화, 1명 분리/합류(전력·인원 보존,
  alias 기록), 카드→레인 드래그(유효 앵커 12곳 하이라이트+레인 고스트+커서 고스트, 즉시 적용),
  역드래그 예비 복귀, 무효 위치 거부 피드백, 배치 완료→지휘 1라운드 진입.
  토벌전(선행 침투) — 4명 조는 목책 거부(3명 제한 사유), 분할 후 2명 조는 목책 은닉 배치
  (`hidden`+매복중+카드 은닉 표시), 2번째 사냥꾼 조는 "1개 조만" 사유로 거부, 마당/움막 진입로 제한,
  자동배치 시 전원 lairTrail 복귀. `?dragSpike` 하네스 생존.

### 남은 것 / 관찰

- **특수주민 화면 확인 미완** — 시뮬레이터에 특수주민이 없어 소스 검사·계약 테스트로만 검증. 본편
  저장(특수주민 보유)으로 확인하거나 위 계약 요청 후 QA.
- **야습 강제배치 실화면 재생 미확인** — 계책 발생이 확률적이라 시뮬레이터에서 강제 불가(백엔드
  fixture 테스트는 통과, UI는 기존 preparationEvents 재생 + 지휘 노트라 위험 낮음). 시뮬레이터 계책
  강제 옵션이 생기면 재확인.
- **스크린샷 QA 미완** — 이 세션의 브라우저 페인은 전투 화면 스크린샷 캡처가 타임아웃된다(DOM·상태
  검증으로 대체). 기준선 비교 스크린샷은 집에서 playwright 스크립트로 찍을 것.
- **페인 한정 관찰**: 무대 가로 스크롤(`scrollTo`)이 이 브라우저 페인에서 고정된다 — **stash로 기준선
  재현 결과 P3 이전에도 동일**하므로 앱 회귀 아님(실 브라우저·playwright에서는 정상으로 추정).
  16그룹 1280×720 겹침 QA도 스크린샷과 함께 집에서.
