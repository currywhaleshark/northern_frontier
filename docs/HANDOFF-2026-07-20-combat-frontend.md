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
