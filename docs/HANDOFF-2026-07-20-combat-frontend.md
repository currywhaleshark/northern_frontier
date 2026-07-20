# 핸드오프 — 전투확장 2단계 프론트엔드 (내일의 페이블에게)

> 작성: 2026-07-20 새벽, 집 환경의 페이블(Claude).
> 전제: **이 문서를 읽는 환경에는 Hermes도 kanban 보드도 없다.** 조율 이력은 아래 스냅샷이 전부이고,
> 이 문서 하나로 착수할 수 있어야 한다. 모든 설계·결정의 원전은
> [전술전 확장 2단계 계획서](superpowers/plans/2026-07-19-tactical-combat-expansion-phase-2.md)다 —
> 특히 **9.4절(분업·파일 소유권·계약), 13.8절(사용자 최종 결정), Phase 3 섹션**을 먼저 읽어라.

## 0. 30초 요약

- 역할 분담: **Codex = 게임 백엔드(`src/game/**`) + 스프라이트(`src/render/tactical*`) / Fable(너) = 프론트엔드(`src/components/**`, 전술 CSS)**.
- 너의 브랜치: `fable/combat-expansion-phase-2-frontend`. 통합 브랜치: `codex/combat-expansion-phase-2`.
- **2026-07-20 회사 세션에서 Phase 3~8 프론트가 전부 완료·푸시됐다.** 세션 기록은 7~12절,
  집 복귀 체크리스트(칸반 동기화 포함)는 **13절**을 보라. 다음 작업 = Phase 9 (Codex 주도 스프라이트
  QC·밸런스, Fable은 정보 밀도·접근성·저해상도 시각 QA).
- 사용자 방침: Phase 3 이후 프론트는 추론 수준 엑스트라(xhigh)로 작업하기로 합의됨(세션 내내 적용됨).

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

## 8. 2026-07-20 회사 세션 기록 2 — P4 프론트 구현 완료 (이 커밋)

Codex의 P4 계약(`e20b56c`) 위에 무대 드래그·고스트·확인 카드를 구현했다.

### 구현 내역

- **`stagePointerDrag.ts`** — `trackPosition: false` 옵션 추가: 커서 좌표를 상태에 싣지 않고
  dragging/hoverAnchorId 변화 때만 재렌더(화면 단일 훅용). 기존 카드 훅 동작은 그대로.
- **`stageOrderPreview.ts` (신규)** — preview 표시 문구 헬퍼. 명령 라벨·`전열 → 중열` 전환 표기·
  `powerPenalty` 감소 문구. 수치는 전부 백엔드 preview 값 그대로.
- **`TacticalOrderConfirm.tsx` (신규)** — 7.9 확인 카드. role=dialog, Escape·우클릭 취소,
  카드 내부 클릭 stopPropagation, `[취소] [<명령> 확정]`. mutation은 콜백 위임(직접 호출 없음).
- **`TacticalBattleScreen.tsx`** — 화면 단일 무대 드래그 훅(`data-deploy-anchor` 공유):
  - 배치 단계 무대 부대 드롭 = 카드 드롭과 같은 검증·즉시 적용, 독 영역 드롭 = 예비 복귀.
  - 지휘 단계 드롭 = `tacticalStageOrderUnavailableReason`/`Preview` → 확인 카드(드롭 지점 근처,
    셸 안 클램프) → 확정 시 `applyTacticalStageOrder` 정확히 1회. 같은 위치 드롭은 선택만 유지.
  - 취소 경로: Escape·우클릭·무대 빈 곳 클릭·연출 진입(playback 효과에서 드래그+카드 자동 취소).
    확인 전 상태 불변. 확인 후 선택 유지(7.9).
  - 드롭 직후 따라오는 click이 팝오버를 다시 열지 않게 가드. 드래그 시작 시 열린 팝오버 닫음.
  - 오류·안내는 `tactical-deploy-feedback` 공용 notice(ok/warn tone)로 지휘 단계에도 표시.
- **`TacticalZoneColumn.tsx`** — `deployDrag` prop을 `stageDrag { groupId, hoverAnchorId, mode }`로
  일반화: mode 'deployment'는 배치 검증, 'command'는 무대 명령 계약. 지휘 모드에서 원위치 레인은
  앵커 제외(no-op), 호버 레인 고스트는 `<라벨> <명령> 예약`. 부대 div에 드래그 핸들 부여
  (배치 = 피난 주민 제외, 지휘 = 지휘 가능만) + `stage-dragging` 시각 상태. 레인 앵커는 지휘
  단계에도 유지.
- **키보드 동등 경로**: 기존 전열 토글(재배치 예약)·명령 바(전진/후퇴)가 같은 백엔드 검증을 쓰는
  동등 경로로 유지된다. 별도 목적지 순회 키는 만들지 않았다(범위 판단 — 필요하면 후속).
- 컴포넌트 계약 테스트 ~25건 추가(확인 전 상태 불변 경로·즉시/확인 분기·취소 경로·재계산 금지 등).

### 검증

- tsc·컴포넌트·stage_orders·test:combat·빌드 통과.
- 브라우저(방어전, 지휘 단계): 후열→중열 드래그 중 앵커 상태가 정확함(호버=hover, 인접 열=valid,
  비인접 열/대각/원거리 구역=blocked, 원위치=중립, 인접 구역 같은 열=valid) + 레인 고스트
  `재배치 예약` + 드래그 부대 dim. 드롭 → 확인 카드 `사냥활 사냥꾼 · 후열 → 중열 / 재배치 중 전투력
  65% 감소 / …` (백엔드 값). Escape 취소 시 상태 불변, 확정 시 redeploy+pendingLine만 기록(순간이동
  없음), 선택 유지. 같은 위치 드롭 = 선택만. 불가 레인 드롭 = 백엔드 사유 notice.
  배치 단계: 무대 부대 레인 이동 즉시 적용 + 독으로 역드래그 예비 복귀.

### 남은 것

- **인접 구역 드롭(전진/후퇴 확인 카드)의 실입력 재현 미완** — 이 페인은 무대 가로 스크롤이 고정되어
  옆 구역 레인에 포인터를 놓을 수 없다. 경로는 재배치와 동일 코드이고 명령 매핑·페널티는
  `test_tactical_stage_orders.mjs`가 검증하지만, **집에서 playwright로 전진/후퇴 확인 카드까지 실입력
  QA할 것**. 레인 유효성 클래스(인접 구역 valid)는 이 세션에서 확인됨.
- 실기기 터치 경로(기존 Phase 4 QA 항목)와 특수주민·적 6개 조 실화면(시뮬레이터 옵션 보강 대기)은
  그대로 남아 있다.

## 9. 2026-07-20 회사 세션 기록 3 — P5 프론트 구현 완료 (이 커밋)

Codex의 P5 방향 계약(`0c0f4c2`, 백엔드 핸드오프 9절) 위에 방향 UI를 구현했다.

### 구현 내역

- **무대 방향 화살표**: 선택한 지휘 가능 부대 양옆 ◀▶ (사냥 제외). 화면 좌우는 orientation에서만
  파생(방어: 왼쪽=적 방향 / 토벌: 반전), 현재 방향 화살표는 비활성. 배치 단계 클릭 = 즉시
  `setTacticalGroupFacing`(무료), 지휘 단계 클릭 = `tacticalFacingPreview` 확인 카드.
- **전방/후방 토글(키보드 동등 경로)**: 배치·지휘 블록의 전열 토글 옆. 같은 validator·확인 흐름.
- **확인 카드 일반화**: `TacticalOrderConfirm`을 표시 전용(title/penalty/warning/confirmLabel)으로
  바꿔 P4 무대 명령과 P5 방향이 공용. 방향 카드는 `후방 → 적 방향 / 방향전환으로 전투력 25% 감소 —
  이번 교전만 / 기존 명령(고수)은 유지됩니다` 형식이며 수치·문구는 전부 preview 값.
- **표시 방향 단일 소스**: 무대 스프라이트 반전(`rear-facing`)을 열·명령 파생에서 **명시적
  `group.facing`**으로 교체. `pendingFacing`은 무대 `회전 중` 배지(수치 없음, 미래 방향으로 렌더하지
  않음) + 지휘 독 칩 `· 회전 중`, `towardRear`는 칩·배치 카드에 `· 후방 경계`.
- 컴포넌트 계약 테스트 갱신·추가(~16건): facing 단일 소스, 화살표 존재, orientation 파생,
  0.75/25% 하드코딩 금지, preview 기반 문구, 토글 2곳 등.

### 검증

- tsc·컴포넌트·stage_orders·test:combat·빌드 통과.
- 브라우저: 배치 단계 화살표 즉시 전환(pendingFacing 없음=무료, 스프라이트 반전, 카드 `후방 경계`),
  지휘 단계 토글·화살표 모두 확인 카드 경유(확인 전 상태 불변), 확정 시 facing 변경+`pendingFacing`
  기록+명령 유지(고수)+무대·칩 `회전 중` 배지. 취소 정상.

### 남은 것

- **reinforceRear 경로 실비교 미완**: 이번 편제·상황(후방 급습 미발생)에서는 `후방 증원`이 전 부대
  비활성이라 버튼 경로와 화살표 경로의 결과 비교를 실행하지 못했다. 백엔드 계약(9절: reinforceRear
  확정 시 towardRear+당회 페널티, 이미 후방이면 페널티 없음)과 mutation 경로 검증으로 갈음 —
  **집에서 후방 급습 시나리오로 두 경로 비교 QA할 것**.
- 나머지 미완(스크린샷·인접 구역 드롭 실입력·터치·특수주민)은 8절과 동일.

## 10. 2026-07-20 회사 세션 기록 4 — P6 프론트 구현 완료 (이 커밋)

Codex의 P6 우회로 계약(`fd491ce`, 백엔드 핸드오프 10절) 위에 경로 표시 UI를 구현했다.

### 구현 내역

- **준비 좌/우 개방 토글**: 준비 그리드의 `우회로 개방` 카드를 방향별 버튼으로 교체
  (`tacticalFlankRoutePreparationView` + `toggleTacticalFlankRoutePreparation`). 점수 소비·환불·즉시
  공개는 전부 백엔드. flankRoutes 없는 전투(토벌·사냥)에서는 카드 자체를 숨긴다.
- **`TacticalRouteRibbon.tsx` (신규)**: 무대 좌상단 리본. `hidden` 미표시, `suspected`는 `? 징후 —
  도착 예상 1~3교전`(백엔드 범위값), `revealed`는 입구/중간/후방 출구 3단 step 표시 + control 색.
  재생 중에는 `pendingReport.routeAdvances`의 `visibleToDefender` 항목만 `중간 진입`/`후방 출구
  도달!` 칩으로 표시.
- **미니맵 가지**: 스트립 위(좌)/아래(우)에 경로 가지. 미개방 미표시, 징후 점선+`?`, 공개 실선+부대
  점, control 색(중립/아군/적/교전). 클릭 시 접근로로 카메라 이동.
- **정면 랭크·미니맵 점에서 이동 중 부대 제외**: `tacticalGroupIsInRouteTransit` 필터 — 비공개 경로
  누출 방지의 핵심(무대·미니맵 모두).
- **정보 패널 우회 징후 줄**: EnemyPlanPanel에 `routeViews` prop — `우회 징후: …` / `우회 확인: …`.
- 컴포넌트 계약 테스트 ~20건 추가(비누출·재파생 금지·reduced-motion 등). 화면은 `defenderIntel`·raw
  `routeTransit.step`을 직접 읽지 않는다(테스트로 강제).

### 검증

- tsc·컴포넌트·`test_tactical_routes`·test:combat·빌드 통과.
- 브라우저(방어전, 우회 좌측 강제): suspected 상태에서 패널 징후 줄·미니맵 점선 `?` 가지·리본 징후
  행이 모두 표시되고 hidden 우측 경로는 어디에도 없음. 좌측 개방 → 2점 소비·`revealed` 전환,
  재토글 → 2점 환불·suspected 복귀, 잔여 0점에서 우측 버튼이 백엔드 사유("남은 준비점수가
  부족합니다.")로 비활성. 기마 마적 우회대가 기병×능선길 규칙대로 2라운드에 걸쳐 입구→중간→후방
  출구로 이동하는 것을 리본 step·재생 칩(`중간 진입`, `후방 출구 도달!`)·`routeAdvances` 계약으로
  확인. 이동 중 정면 랭크·미니맵 구역 점에는 끝까지 나타나지 않고, step 2 도달 후에도 transit이
  유지된다(P7 경계).

### 남은 것

- **경로 control 색(아군/교전)과 차단 배치 UI는 Phase 7** — P6에서는 아군이 경로에 들어갈 수 없어
  중립/적 색만 실검증됨. → **11절에서 해소.**
- suspected 강등(nightApproach) 화면 확인은 계책 조합이 확률적이라 미실행 — selector 계약 테스트로
  갈음. 나머지 미완 항목은 8·9절과 동일.

## 11. 2026-07-20 회사 세션 기록 5 — P7 프론트 구현 완료 (이 커밋)

Codex의 P7 경로 교전 계약(`3606369`, 백엔드 핸드오프 11절) 위에 차단 배치·우회 기동·재생 UI를 구현했다.

### 구현 내역

- **경로 차단 배치**: 배치 단계에 플레이어가 연 경로의 리본 행이 드롭 앵커(`route|left/right`,
  `parseRouteAnchorId` 공용 헬퍼)가 된다. 카드·무대 부대 드래그 모두 지원 — 유효성은
  `tacticalRoutePlacementUnavailableReason`, 적용은 `placeTacticalRouteBlocker`. 호버 시 리본 행
  하이라이트 + 고스트 `…중간 차단 배치`. 차단 카드는 배치 완료 영역에 `<경로> · 경로 차단`으로 남고
  무대 랭크에는 없다(기존 transit 필터). 역드래그·일반 레인 재배치 시 route 해제는 백엔드가 처리.
- **우회 기동**: 기존 명령 dispatch 그대로 — `tacticalSupportedCommands`에 `flankRoute`가 오면 명령
  바에 자동 노출되고 검증은 범용 `tacticalCommandUnavailableReason`(내부 route order reason). 칩은
  `경로 차단 중`/`우회 이동 중`을 구분 표시.
- **재생**: 리본이 `routeAdvances → routeEngagements → routeArrivals` 순으로 보고 배열을 그대로
  재생한다. 교전 칩은 outcome별 색(차단 성공/차단 붕괴/경로 대치) + 양측 피해 + 패퇴/철수 표기,
  서사는 백엔드 `lines`를 title로. 도달 칩은 적 `후방 진입!`/아군 `후열 급습 도달!`. control
  아군/교전 색이 이번에 실검증됨.
- **후열 급습 배지**: `rearRaidRound`가 **표시 라운드**(`pendingReport?.round ?? battle.round`)와
  같을 때만 무대·칩 배지. 처음에 `battle.round` 비교로 넣었다가 재생 중 round가 이미 +1인 것을
  브라우저에서 발견해 수정 — 이 관례는 헤더 roundLabel과 동일하다.
- 배율 수치(급습·노출)는 UI 어디에도 없음(테스트 강제). 컴포넌트 계약 테스트 ~18건 추가.

### 검증

- tsc·컴포넌트·routes·test:combat·빌드 통과.
- 브라우저(우회 좌측 강제 + 좌측 개방): 창 수비병 카드→리본 드롭(호버 하이라이트·고스트) →
  `routeId` placement·purpose=block·step1·contested. 지휘에서 차단 유지 라운드에 경로 교전 재생
  칩 `차단 성공 — 아군 피해 1 · 적 피해 0` + `아군 통제` 전환 + 적 step0 밀림. `우회 기동` 클릭 →
  purpose=raid·step0 재출발, 2라운드 이동 후 `창 수비병 — 마을 방어선 후열 급습 도달!` 칩과
  `rearRaidRound` 기록, transit 제거·목적 구역 합류까지 확인.

### 남은 것

- 아군 차단대 패퇴(적 승리) 재생과 적 후방 진입 칩은 시드 사정상 실화면 미확인(계약 배열·칩 코드는
  동일 경로, 백엔드 테스트 고정). 집 QA 후보.
- 기존 미완 항목(스크린샷·터치·특수주민·인접 구역 드롭 실입력)은 8~10절과 동일.

## 12. 2026-07-20 회사 세션 기록 6 — P8 프론트 구현 완료 (이 커밋)

Codex의 P8 지원·화포 계약(`4b52501`, 백엔드 핸드오프 12절) 위에 표시·연출을 구현했다.

### 구현 내역

- **지원병 스프라이트**: `court-medic`/`court-hwacha`는 `TACTICAL_COURT_SUPPORT_POSE_SHEET` +
  `tacticalCourtSupportPoseCell` + `courtSupport` 메트릭으로 렌더. 화차 발사 앵커 사용.
- **상태 배지**: 무대 적 부대 라벨과 미니맵 툴팁에 `tacticalSupportUnitView`의 statusLabel만 표시
  (발사 준비/발사 중/재장전 · N교전/탄약 소진/부상병 치료 중 + 탄약 수). raw `supportState` 접근은
  테스트로 금지.
- **연출 구분**: `hwachaVolley`는 로켓 fx(개수는 `shots.rockets`, 표시 상한 12) + 포성 연사(상한 4),
  `supportReload`는 hammer, `enemyTreatment`는 heal 효과음 + 의원 attack 포즈 + 대상 조 초록 펄스
  (reduced-motion 존중).
- **보고**: `raiderPowerRestored > 0`이면 장계에 `적 의원대가 … 전투력 N을 회복했습니다` 줄 —
  전사자 복귀로 표현하지 않는다(테스트 강제).
- **시뮬레이터**: 교리/편제 상한을 8로 올려 `court-fire-support`(화력 압박대)·`court-long-campaign`
  (장기 토벌대)을 선택 가능하게 함.
- 컴포넌트 계약 테스트 ~17건 추가.

### 검증

- tsc·컴포넌트·`test_tactical_support_units`·test:combat·빌드 통과.
- 브라우저: 화력 압박대 — 화차가 지원 시트로 렌더(8스프라이트 운용조), `발사 준비 · 남은 탄약 2발`
  배지, 1라운드에 `hwachaVolley`(rockets 40, "신기전이 빗발칩니다") + 로켓 fx 12발 상한 재생,
  발사 후 탄약 1·readyOnRound+2, 배지가 view 값 그대로 전환. 장기 토벌대 — `enemyTreatment` 이벤트
  재생 + 의원 치료 펄스 + 장계 회복 줄("전투력 1을 회복") 확인.

### 남은 것

- `supportReload` 이벤트(방향 조정/재장전 연출)는 이번 라운드들에서 발생하지 않아 실화면 미확인 —
  sfx 매핑·기존 float 경로라 위험 낮음. 화차 `탄약 소진` 배지 실화면도 동일(라운드 수 제약).

## 13. 귀가 핸드오프 — 집(칸반 복귀) 체크리스트

**상태: Phase 3~8 프론트 완료.** 회사 세션 커밋(전부 push됨):

| Phase | 프론트 커밋 | 백엔드 커밋 | 내용 |
|---|---|---|---|
| P3 | `ec6d9e0` | `dca02c9` | 배치 카드 독·드래그 배치·분할/명명 조·특수주민 강조 |
| P4 | `43f28b8` | `e20b56c` | 무대 드래그·고스트·확인 카드 |
| P5 | `891226e` | `0c0f4c2` | 명시적 방향 화살표·토글·회전 배지 |
| P6 | `e96b639` | `fd491ce` | 우회로 준비·미니맵 가지·리본·비누출 |
| P7 | `1e34522` | `3606369` | 경로 차단 배치·우회 기동·교전/급습 재생 |
| P8 | (이 커밋) | `4b52501` | 지원병 스프라이트·상태 배지·화차/치료 연출 |

### kanban 동기화 (`hermes kanban boards switch northern-combat`)

1. `P3-frontend`~`P8-frontend` 태스크를 각각 `complete` 처리하고 위 커밋 해시를 코멘트로 남길 것.
2. **App.tsx 통합 경계 변경 기록**(P3): `handleTacticalAction` 오류 반환 + 범용
   `onDeploymentAction` dispatch 1개. Codex가 백엔드 핸드오프 8절에서 승인했지만 보드에도 기록.
3. **계약 요청 코멘트**(비차단): `battleSimulation.ts`에 시뮬레이터 특수주민 포함 옵션(명명 조·특기
   QA용) + 계책 강제 옵션(야습·suspected 강등 QA용) — Codex 태스크에 코멘트.

### 집에서 할 QA (우선순위순)

1. **playwright 스크린샷**: P3 이후 전 화면을 기준선(docs/qa/tactical-baseline-2026-07-20)과 비교
   촬영. 이 세션의 브라우저 페인은 전투 화면 캡처가 타임아웃돼 DOM 검증으로 대체했다.
2. **실입력 드래그 QA**: 인접 구역 드롭(전진/후퇴 확인 카드) — 회사 페인은 무대 가로 스크롤이
   고정돼(기준선 동일, 앱 회귀 아님) 옆 구역에 드롭할 수 없었다. 16그룹 1280×720 겹침도 함께.
3. **미발생 시나리오 재생**: 차단대 패퇴(적 승리)·적 후방 진입 칩, reinforceRear vs 방향 화살표
   경로 비교(후방 급습 시나리오), `supportReload` 연출, 화차 탄약 소진 배지, nightApproach
   suspected 강등.
4. **실기기 터치**(기존 Phase 4 QA 항목)와 특수주민 실화면(본편 저장 또는 위 계약 요청 후).

### 다음 작업

Phase 9 — Codex: 전 병과 스프라이트 QC·밸런스 측정(200시드) / Fable: 정보 밀도·접근성·저해상도
시각 QA + 장계 교리·편제 표기(Phase 9 데이터 계약 후, 6절 보류 항목). 기존 무관 실패 3건(주변음
구조·토벌 승률 게이트·특수주민 총구 앵커)은 P8까지 동일하게 유지 중.
