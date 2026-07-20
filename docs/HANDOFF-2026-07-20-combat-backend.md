# 핸드오프 — 전투확장 2단계 백엔드 (내일의 Codex에게)

> 작성: 2026-07-20 새벽, 집 환경의 Codex.
> 전제: **이 문서를 읽는 환경에는 Hermes도 kanban 보드도 없다.** 찾거나 복구하려 하지 말고,
> Git과 이 문서만 진실로 삼아 바로 이어간다. 전체 설계 원전은
> [전술전 확장 2단계 계획서](superpowers/plans/2026-07-19-tactical-combat-expansion-phase-2.md)이며,
> 특히 7.3~7.6절, 9.4절, Phase 3, 13.8절의 사용자 확정을 먼저 읽는다.

## 0. 30초 요약

- 역할 분담: **Codex = `src/game/**` 백엔드 + `src/render/tactical*` 스프라이트 / Fable =
  `src/components/**` 전술 프론트 + 전술 CSS**. 계약 때문에 필요한 최소 1줄 외에는 상대 소유 파일을 건드리지 않는다.
- 통합 브랜치: `codex/combat-expansion-phase-2`. Codex P3 작업 브랜치:
  `codex/combat-expansion-phase-3-backend`.
- **P3 백엔드는 `dca02c9`에서 완료**됐다. 빈 무대 배치, 자동배치, 공통 분할·합류, 명명 조,
  민병 카드, 토벌 선행 침투, 야습 강제 자동배치, 저장 스키마 v25와 결정성 테스트가 들어 있다.
- P3 프론트는 아직 Fable 몫이다. 상세 착수 지침은
  [프론트엔드 핸드오프](HANDOFF-2026-07-20-combat-frontend.md)를 따른다.
- 회사 환경에서는 조율 보드가 없으므로 상태 변경·계약 요청·결정은 이 문서 또는 계획서에 기록하고 커밋한다.

## 1. 회사에서 시작하는 순서

```bash
git fetch origin
git switch codex/combat-expansion-phase-2
git pull --ff-only
git log --oneline -8
```

그다음 아래 존재 여부로 P3 통합을 판별한다.

- `src/game/tacticalDeployment.ts`
- `tools/game/test_tactical_deployment.mjs`
- `git log`에 `dca02c9 feat: add empty tactical deployment backend` 또는 이를 포함한 통합 커밋

세 항목이 있으면 kanban 확인 없이 현재 상태에서 계속한다. 없으면 임의로 재구현하지 말고
`origin/codex/combat-expansion-phase-3-backend`가 push됐는지 확인해 통합 브랜치와 비교한다.

## 2. P3 백엔드에서 완료한 계약

### 배치 상태와 자동배치

- 지휘 가능 그룹은 생성 직후 `deploymentPlacements[group.id] = null`, `zoneId = ''`로 시작한다.
- 피난 주민만 `center/rear/fixed`로 시작한다. 치료반은 선택 구역의 후열만 허용한다.
- `autoDeployTacticalGroups`는 변경 없는 순수 계산이고, `applyAutoDeployTacticalGroups`가 상태에 적용한다.
- 자동배치는 기존 기준과 동일하다: 방어전 사냥꾼 `approach`, 징집 민병 `storehouse`, 나머지 `wall`,
  토벌대 `lairTrail`, 사냥대 `huntSectorRidge`.
- 지휘 가능 카드를 전부 놓기 전에는 배치 완료가 거부된다. 미배치 예비대는 없다.

### 공통 분할·합류와 명명 조

- 방어·토벌·사냥이 `splitTacticalGroup` / `mergeTacticalGroups`를 공유한다.
- 원래 조당 최대 **3개 조각**, 치료반·피난 주민 제외 지휘 그룹 전체 최대 **10개**다.
- 분할·합류는 첫 교전 전 배치 단계만 가능하고 residentIds/count/power/readyMuskets 총합을 보존한다.
- 사라진 조 ID는 `deploymentGroupAliases`와 `resolveTacticalDeploymentGroupId`로 현재 ID에 연결된다.
- 특수주민은 역할·준비 무기·기마가 맞는 일반 조에 합류한다. `featuredResidents`에는 개인 정보가 남고,
  `group.special`을 통해 특기/명령 능력은 소속 조 전체에 적용된다.
- 개인 기본 전력 보너스는 조원 수만큼 증폭하지 않고 **특수주민 본인 1회만** 계산한다.
- 표시는 `아라개의 창 수비병`, 별도 액션은 `아라개의 조 분리`다. 명명 분리는 본인+동료 0~2명을 옮기고
  특기·이름 소유권도 함께 옮긴다.

### 준비행동과 전투별 제한

- `musterMilitia`는 피난 주민을 줄이고 `null` placement의 `긴급 소집 민병` 카드를 만든다.
  준비 연출은 아직 없는 무대 스프라이트를 groupId로 점멸시키지 않는다.
- 토벌 기본 배치는 `lairTrail`만 허용한다. 준비점수 2의 `preInfiltration`을 택하면 사냥꾼 1개 조,
  최대 3명만 `lairWall`에 `hidden`으로 둘 수 있다.
- 선행 침투는 `nightAssault`·`lureGuards`와 함께 선택할 수 없다.
- 적 `nightApproach` 효과 배율이 `CONFIG...forcedAutoDeployThreshold`(0.5)를 넘으면 기존 기본 진형으로
  강제 자동배치하고 수동 배치를 건너뛴다. `torchWatch` 후 배율 0.4면 정상 배치로 간다.

### 저장

- 저장 스키마는 v25다.
- 현재 전투의 placements, 분할 serial, aliases, 강제 야습, featured resident를 복원한다.
- v24 이하 전투처럼 placement가 없으면 저장된 `zoneId/line`으로 기존 배치를 합성해 진행 중 전투를 살린다.

## 3. 프론트에서 써야 하는 API

원전은 `src/game/tacticalDeployment.ts`와 `tools/game/test_tactical_deployment.mjs`다. 주요 API:

- selector: `tacticalDeploymentView`, `tacticalDeploymentUnavailableReason`
- 검증: `tacticalDeploymentPlacementUnavailableReason`
- 배치: `placeTacticalDeploymentGroup`, `removeTacticalDeploymentGroup`, `resetTacticalDeployment`
- 자동: `autoDeployTacticalGroups`, `applyAutoDeployTacticalGroups`
- 분할: `splitTacticalGroup`, `splitFeaturedTacticalGroup`, `mergeTacticalGroups`
- ID 복구: `resolveTacticalDeploymentGroupId`

이 API들은 `tacticalBattle.ts`에서도 재노출한다. UI에서 zone·line·hidden·상한·전력 수치를 재계산하지 말고
mutation/unavailable-reason을 호출한다. `deploymentPlacements`가 배치 단계 위치의 권위값이며
`group.zoneId`를 직접 바꾸면 테스트에서처럼 placement와 어긋난다.

## 4. 검증 결과

P3 구현 커밋 직전 다음이 통과했다.

```bash
npx tsc --noEmit
node tools/game/test_tactical_deployment.mjs
node tools/game/test_resource_save_migration.mjs
node tools/game/test_tactical_battle.mjs
node tools/game/test_tactical_hunt.mjs
node tools/game/test_tactical_components.mjs
npm run build
git diff --check
```

- 프로덕션 빌드는 성공하며 기존 500kB 초과 chunk 경고만 남는다.
- `npm run test:game`은 244초 제한에서 출력 없이 시간 초과했다. 핵심 테스트는 위처럼 개별 통과했다.
- `node tools/game/test_tactical_assault.mjs`의 마지막 승률 게이트는 **P3 이전 통합 헤드 `4534c5e`에서도
  똑같이** 실패한다: 자동 0.589, 직접 0.281. P3 회귀가 아니며 별도 밸런스 과제다.
- Fable 기준선에 기록된 비전투 `test_screen_ambient_audio.mjs` 실패도 기존 문제다.

## 5. P0 시각 기준과 다음 작업

- 기준 문서: `docs/QA-2026-07-20-tactical-ui-baseline.md`
- 16장 스크린샷: `docs/qa/tactical-baseline-2026-07-20/`
- 반드시 보존할 회귀점: 처음 빈 무대, 기존 구역/열 버튼의 접근성 대체조작, 기존 사냥 분할·합류 UX.

다음 순서는 다음과 같다.

1. Fable가 P3 카드 독·드래그 배치·자동배치·분할 UI를 구현한다(프론트 핸드오프 참고).
2. Codex는 프론트에서 발견한 **계약 누락만** 백엔드에 보완하고 React/CSS 구현을 대신하지 않는다.
3. P3 통합·브라우저 QA 뒤 Phase 4 무대 드래그/고스트로 이동한다.
4. 스프라이트 보강이 필요하면 Codex 소유로 처리하되 P3에는 새 생성 스프라이트가 필수는 아니다.

## 6. 보드 없는 환경의 작업 규약

- kanban/Hermes 상태·코멘트를 전제로 한 지시를 만들지 않는다. Git 커밋과 저장소 문서가 유일한 공유 상태다.
- 세션 시작 때 `git status`, `git log`, 이 문서, 프론트 핸드오프를 읽는다.
- 상대 작업자에게 필요한 계약은 계획서나 새 handoff 문서에 추가해 커밋한다.
- 통합 전 양쪽 브랜치에서 `git diff --check`, 소유 테스트, `npm run build`를 다시 실행한다.
- 루트 작업트리의 `backup_json/`, `debug_output*/`, `tools/game/debug-temp/`, `tools/render/generated/`,
  `tools/render/source_images/**` 미추적 산출물은 사용자 자산이므로 삭제·스테이징하지 않는다.

## 7. 보류 사항

- 장계의 적 교리·편제 표기는 `TacticalBattleReport` 데이터 계약이 생기는 Phase 9까지 보류됐다.
- 선행 침투의 산채 경계도·날씨 기반 발각 판정은 P3 완료 조건에는 포함하지 않았고 아직 구현하지 않았다.
  후속으로 넣을 때는 결정적 RNG 입력과 저장 필드를 먼저 설계한다.
- 방향전환·실제 우회로·지휘 단계 드래그 확인은 각각 후속 Phase 4~7 범위다.

## 8. 2026-07-20 통합 세션 — P3 프론트 통합과 Phase 4 백엔드 계약

### P3 통합 확인

- Fable의 P3 프론트 커밋 `ec6d9e0`을 통합 브랜치에 fast-forward했다.
- `src/App.tsx` 변경은 기존 `handleTacticalAction`의 오류 문자열 반환을 보존하고
  `onDeploymentAction` 범용 dispatch 하나만 추가한 최소 통합 경계로 승인했다.
- 타입 검사, 컴포넌트·배치·전투·사냥·저장 마이그레이션 테스트와 프로덕션 빌드가 통과했다.
- `test_tactical_assault.mjs` 마지막 밸런스 게이트는 기존과 같은 자동 0.589 / 직접 0.281로만 실패한다.
- 1280×720 브라우저에서 지휘 가능 아군을 상한 10개 조까지 분할한 뒤 자동배치해 카드 독, 무대 스택,
  키보드 선택 경로를 확인했다. 현재 시뮬레이터는 적 3개 조까지만 생성하므로 고정 피난 주민 포함 총
  14개 조까지 재현했다. 특수주민과 적 6개 조 실화면은 시뮬레이터 옵션 보강 뒤 다시 확인한다.

### Phase 4 공개 계약

`src/game/tacticalBattle.ts`가 다음 API와 자료형을 제공한다.

- `TacticalStageAnchor`
- `TacticalStageOrderPreview`
- `tacticalStageOrderUnavailableReason(battle, groupId, destination)`
- `tacticalStageOrderPreview(battle, groupId, destination)`
- `applyTacticalStageOrder(state, groupId, destination)`

규칙은 다음과 같다.

- 같은 위치 드롭은 `command: null`, `powerPenalty: 0`, `travelRounds: 0`의 선택 전용 no-op이다.
- 같은 구역의 인접 열은 `redeploy`, 인접 구역의 같은 열은 전투 orientation에 따라
  `advance` 또는 `fallback`이다.
- 한 드래그에서 구역과 열을 동시에 바꾸거나 비인접 구역·열로 옮기는 요청은 거부한다.
- preview는 상태를 바꾸지 않는 순수 함수다. 확정 mutation은 정확히 한 명령만 기록하며 즉시 순간이동하지
  않는다. 토벌전 열 재배치도 이제 다음 교전 위치 적용 때 반영한다.
- `powerPenalty`는 현재 교전 전력에서 빠지는 비율이다. 예를 들어 보병 `redeploy`의 0.65는 전력 35% 기여를
  뜻한다. 기마 여부와 전투별 기존 명령 배율은 백엔드가 계산한다.
- 분할·합류로 사라진 groupId도 `deploymentGroupAliases`를 통해 현재 조로 복구한다.
- 맹수 사냥은 Phase 4에서 기존 길목 이동 계약을 유지하며 공용 직선 전선 드래그 대상에서 제외한다.

계약 테스트는 `tools/game/test_tactical_stage_orders.mjs`다. Fable은 Phase 4 무대 고스트·확인 카드·키보드
경로에서 목적지별 preview/unavailable-reason을 그대로 사용하고 전력 페널티나 명령 종류를 재계산하지 않는다.

## 9. 2026-07-20 통합 세션 — P4 프론트 통합과 Phase 5 백엔드 계약

### P4 통합 확인

- Fable의 P4 프론트 커밋 `43f28b8`을 통합 브랜치에 fast-forward했다.
- 무대 드래그는 배치 단계에서 즉시 적용하고, 지휘 단계에서만 `tacticalStageOrderPreview` 뒤 확인 카드를
  띄운다. 확인 전 상태 불변·확정 시 단일 mutation 경계와 App 통합 경계를 검토했다.
- `tsc`, 컴포넌트 계약, 무대 명령 계약이 통합 직후 통과했다.
- 통합 브라우저 스모크에서 방어전 생성 → 빈 무대 → 자동배치 → 지휘 단계까지 확인했다. 이 환경의 브라우저
  입력 API는 drag를 제공하지 않아 확인 카드의 실제 재입력은 Fable `43f28b8`의 실검증 기록을 따른다.

### Phase 5 상태 의미와 공개 API

`TacticalDefenderGroup`에 다음 상태가 추가됐다.

- `facing: 'towardEnemy' | 'towardRear'`: 명령 확정 즉시 적용된 현재 판정 방향.
- `pendingFacing?: TacticalFacing`: `facing`과 같은 새 방향을 담는 이번 라운드 방향전환 페널티 표식.
  다음 라운드 목표를 뜻하지 않는다. 값이 있으면 현재 판정에만 ×0.75를 적용하고, 전투 연출 완료 때 지운다.

`src/game/tacticalBattle.ts`의 프론트 공개 계약:

- `TacticalFacingPreview`
- `tacticalFacingUnavailableReason(battle, groupId, facing)`
- `tacticalFacingPreview(battle, groupId, facing)`
- `setTacticalGroupFacing(state, groupId, facing)`

preview는 `origin`, `destination`, 보존되는 `command`, `powerMultiplier`, `powerPenalty`,
`currentRoundOnly`를 제공한다. 배치 단계는 `1 / 0 / false`, 지휘 단계는 `0.75 / 0.25 / true`다.
UI는 이 수치를 재계산하지 않는다. 배치 단계는 즉시 mutation하고, 지휘 단계는 preview 확인 뒤 mutation한다.
같은 방향·미배치 카드·피난 주민·치료반·전투 불능 부대·연출/보고 단계는 unavailable-reason으로 거부한다.

### 판정 규칙

- 방향전환은 주 명령을 소비하거나 바꾸지 않는다. 한 라운드에 왕복 전환해도 `pendingFacing` 하나만 남아
  ×0.75가 중첩되지 않는다.
- `splitTacticalEngagementDefenders`는 정면과 후방 공격이 동시에 있을 때 열이나 `reinforceRear`가 아니라
  `facing`으로 부대를 나눈다. 정면 공격만 또는 후방 공격만 있으면 전투 가능 부대가 그 교전에 남고,
  공격 반대 방향을 향한 부대는 측후방 노출 페널티를 받는다.
- 잘못된 방향의 피격 노출은 기존 진형 노출값에
  `CONFIG.tacticalBattle.formationExposure.facing.wrongDirectionExposureMultiplier`(현재 1.5)를 곱한다.
- 후방 기동 카운터와 후방 근접 엄호도 명시적 방향을 사용한다. 열만 후열인 부대는 자동으로 후방을 막지 않는다.
- `reinforceRear`는 중열 근접/기마 예비대의 편의 명령으로 유지되며, 확정 시 `towardRear`로 돌리고 해당
  라운드 ×0.75를 적용한다. 이미 후방을 향하고 있으면 새 페널티를 만들지 않는다.
- 신규 부대와 피난 주민은 `towardEnemy`로 시작한다. 화면의 좌우는 저장하지 않고 전투 orientation에서
  프론트가 표시 방향만 파생한다.

### 저장과 검증

- 저장 스키마는 v26이다. v25→v26 루트 마이그레이션은 additive이며 실제 전투 필드 정규화는
  `migrateTacticalBattle`에서 한다.
- 구버전 저장은 실제 후방 교전이 이미 활성화된 구역에서만 기존 규칙을 합성한다: 후열 또는
  `reinforceRear` 중열은 `towardRear`, 나머지와 피난 주민은 `towardEnemy`. 구버전 저장에 일회성
  `pendingFacing` 페널티를 새로 만들지 않는다.
- 현재 저장의 facing과 pendingFacing은 전투 중 round-trip에서 보존된다.
- 방향 계약·결정성·골든 fixture·저장 round-trip을 갱신했다. `test_tactical_battle.mjs`,
  `test_resource_save_migration.mjs`, `test_enemy_plan.mjs`, `test_tactical_golden.mjs`가 핵심 계약 테스트다.

### Fable의 Phase 5 프론트 착수점

1. 선택 부대 양옆 방향 화살표와 방향 고스트를 붙인다. 배치 단계는 바로
   `setTacticalGroupFacing`, 지휘 단계는 `tacticalFacingPreview` 확인 카드를 거친다.
2. 확인 카드의 25%·현재 라운드 한정 문구는 preview 값에서 표시한다. `pendingFacing`이 있으면 무대와 카드에
   현재 판정 페널티를 표시하되, 이것을 아직 적용되지 않은 미래 방향으로 렌더링하지 않는다.
3. 기존 `onDeploymentAction` dispatch로 mutation을 연결할 수 있다. App 통합 경계에 별도 방향 callback을
   추가한다면 최소 변경으로 기록한다.
4. `reinforceRear` 버튼 경로와 방향 화살표 경로가 같은 facing/페널티 결과를 내는지 브라우저에서 함께 확인한다.

전체 게임 러너에서 P5·저장·골든·교리 테스트는 통과했다. 남은 기존 실패는 토벌 자동/직접 승률 게이트,
`test_screen_ambient_audio.mjs`, `test_tactical_sprite_poses.mjs` 세 개이며 P5 변경 범위 밖이다.

## 10. 2026-07-20 통합 세션 — P5 프론트 통합과 Phase 6 우회로 백엔드 계약

### P5 통합 확인

- Fable의 P5 프론트 커밋 `891226e`를 통합 브랜치에 fast-forward했다.
- 배치 방향전환은 즉시 mutation, 지휘 방향전환은 preview → 확인 카드 → mutation 1회를 지켰다.
- 무대·배지·지휘 독은 `group.facing`/`pendingFacing`만 사용하고 페널티 수치를 UI에 하드코딩하지 않는다.

### Phase 6 상태 계약

`TacticalBattle.flankRoutes`에 방어전마다 좌·우 두 경로가 생긴다. 일반 `zones` 배열에는 넣지 않는다.

- `flank-left`: 숲 능선길 / `woodedRidge`
- `flank-right`: 하천 둥길 / `riverBank`
- 각 경로는 `openedByDefender`, `openedByRaider`, `defenderIntel`, `control`을 가진다.
- `rearManeuver`가 있으면 `enemyPlan.flankRouteSide`가 생성 시 좌/우 한 곳으로 잠기고 해당 경로만 `openedByRaider=true`가 된다.

`TacticalDefenderGroup`/`TacticalRaiderGroup`의 선택 필드 `routeTransit`은 `routeId`,
`step: 0 | 1 | 2`, `destinationZoneId`, `visibleToDefender`, `startedRound`, `elapsedRounds`,
`roundsRequired`를 가진다. step은 입구 0 → 중간 1 → 후방 출구 2이다.

적 우회대는 생성 시 step 0에 실제로 배치되며, 비공개 경로에서도 매 라운드 동일한 실제 step을 진행한다.
이동 중에는 정면 교전·일제사격 대상·구역 압박에 참여하지 않는다.

### 준비 행동 API

`src/game/tacticalBattle.ts`에서 다음을 재노출한다.

- `tacticalFlankRoutePreparationView(state)`
- `tacticalFlankRoutePreparationUnavailableReason(state, side)`
- `toggleTacticalFlankRoutePreparation(state, side)`

`openFlankRoute`는 **경로당** 준비점수 2를 쓴다. 좌·우를 모두 열면 4점이다. 범용
`spendPreparationAction(state, 'openFlankRoute')`는 방향 선택 안내 오류를 돌려주므로 UI는 반드시 방향별 mutation을 쓴다.
준비 단계에서 다시 끄면 2점이 정확히 환불되고, 플레이어가 연 경로는 즉시 `revealed`로 된다.

### 가시성과 프론트 selector

- `tacticalFlankRouteView(battle)`
- `tacticalRouteBySide(battle, side)`
- `tacticalGroupIsInRouteTransit(group)`
- `TACTICAL_FLANK_ROUTE_IDS`

`tacticalFlankRouteView` 결과의 `display`는 `hidden | suspected | revealed`이다.

- `hidden`: `transits=[]`. 실제 step을 UI에 누출하지 않는다.
- `suspected`: `transits=[]`, `expectedArrivalRounds=[1,3]`. 미니맵의 `?`와 예상 도착 범위만 표시한다.
- `revealed`: 경로의 실제 transit step을 `transits`로 제공한다.

`nightApproach`는 적의 공개 경로를 `suspected`로 한 단계 낮출 수 있지만, 플레이어가 직접 연 경로는 항상
`revealed`다. AI·판정·저장은 가시성과 무관하게 실제 step을 유지한다.

`pendingReport.routeAdvances`에는 이번 라운드의 `fromStep`, `toStep`, `visibleToDefender`,
`arrivedAtExit`가 들어 있다. Fable은 공개 이동 재생에 이 배열을 쓰고 비공개 항목은 렌더하지 않는다.

### 이동 시간

- 보병: 기본 2라운드.
- 기병/고기동 병과: 기본 1라운드.
- 숲 능선길의 기병: 2라운드.
- 눈보라, 또는 해빙기 하천 둥길: 1라운드 추가.

수치는 `tacticalRouteRoundsRequired(group, route, weather)`에서만 계산한다.

### Phase 7 경계

Phase 6에서 step 2는 “후방 출구에 도달”이며 `routeTransit`을 아직 제거하지 않는다. 후방 구역 진입,
차단대와의 중간 교전, 우회 성공/패퇴, 플레이어 후열 급습은 Phase 7 판정 계약이다. Fable은 step 2를
기존 `rearAssault` 교전으로 추측해 변환하지 않는다.

### 저장과 검증

- 저장 스키마는 v27이다.
- v26 이하에서 `rearManeuver`만 있고 경로 선택이 없으면 새 RNG를 쓰지 않고 좌측 경로로 합성한다.
- 경로, 개방 선택, control, transit step/소요 라운드, report movement가 필드 단위로 검증·복원된다.
- `tools/game/test_tactical_routes.mjs`가 경로 잠금, 2점 소비/환불, 병종·지형·날씨 속도, 비공개 내부 이동,
  selector 비누출, 라운드 보고 계약을 고정한다.

Fable의 Phase 6 프론트는 준비 행동에 좌/우 선택을 붙이고,
`tacticalFlankRouteView`만으로 무대 가장자 경로·미니맵 `?`·공개 이동을 표시한다.

`tsc`, `test:combat`, 경로·무대 명령·배치·적 계획·교리·골든·저장·사냥 테스트와
프로덕션 빌드가 통과했다. 전체 `test:game`의 실패는 기존에도 남아 있던 주변음 구조 검사,
산채 자동/직접 밸런스 게이트, 특수주민 총구 앵커 검사 3건만 동일하게 남았다.
