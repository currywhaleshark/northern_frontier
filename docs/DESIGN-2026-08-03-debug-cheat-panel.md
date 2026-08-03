# 디버그 치트 패널 설계 — 개발용 상태 조작·스폰·사건 발화

> **계획 상태:** 완료 (2026-08-03 구현·검증)
> **상태 갱신:** 2026-08-03 — 설계 확정. [밸런스 편집기](DESIGN-2026-08-03-balance-editor.md)와 짝을 이루는 개발 도구 트랙 — 편집기가 바꾼 수치를 게임 안에서 즉시 시험하는 손이 이 패널이다.
> **상태 갱신:** 2026-08-03 — §2~§3 구현 완료. 8개 섹션, `src/game/debugActions.ts` 단일 조작 모듈, DEV 게이트 + 지연 import, `debugTouched` 표식, 프로덕션 무포함 회귀 고정. 아래 [구현 기록](#6-구현-기록-2026-08-03) 참조.

- 작성일: 2026-08-03

## 0. 목표

원하는 기능을 게임 안에서 **바로** 시험할 수 있게 한다: 티어·자원·명성·의심 임의 조정, 주민·특수 주민·가축·자원 스폰, 사건(습격·재해·화재·세공·병자) 강제 발화, 시간 점프. 매번 세이브를 만들어 조건을 갖추는 노동을 없앤다.

## 1. 현재 기준선 (2026-08-03 코드 대조)

- **콘솔 훅이 이미 있다**: `GameSession.tsx` 488행 — `window.__game.state()`(상태 참조), `__game.run(n)`(n일 빨리감기). 상태를 밖에서 만지는 통로는 뚫려 있고, 남은 것은 조작 함수의 노출과 UI다.
- **발화 함수 대부분이 이미 존재한다**: scripted 유민(`openScriptedImmigrationChoice`), 통제 습격(`spawnRaiders` 전력 인자), 세공 공지(`announceCourtTribute`), 재해 발생 함수 6종, 화재(`maybeStartFire` 내부 생성 경로), 특수 주민·은맥·역병, 가축 확보(`acquireLivestock`), 승격(`upgradeSettlementCenter`). 치트 패널은 새 시스템이 아니라 **기존 함수의 버튼화**다.
- 개발 전용 게이트 선례: `import.meta.env.DEV` (perf 프로브·개발 훅들).

## 2. 확정 방향

1. **개발 빌드 한정.** 패널 코드는 `import.meta.env.DEV` 게이트 + 지연 import로 프로덕션 번들에서 제외한다.
2. **열기**: 백틱(\`) 키 토글. 게임 화면 위 플로팅 창(기존 관리 창 관례).
3. **조작은 전용 모듈로 모은다**: 신규 `src/game/debugActions.ts` — UI는 이 모듈만 부른다. 기존 시스템 함수를 재사용하고, 직접 대입(자원·수치)은 여기서만 한다. 흩어진 곳곳에서 상태를 찌르지 않는다.
4. **치트 사용 표식**: 치트로 상태를 바꾼 저장에는 `debugTouched: true`를 남긴다 — 밸런스 관찰·버그 리포트에서 오염 세이브를 구분하기 위함. 게임플레이 불이익은 없다.
5. 모달·전투 중 조작 금지 규칙: `pendingChoice`·전술 전투 중에는 파괴적 조작(시간 점프·사건 발화)을 잠그고 사유를 표시한다 (기존 `__game.run` 가드와 동일).

## 3. 패널 구성 (섹션별)

| 섹션 | 기능 | 재사용 |
|---|---|---|
| 자원 | 전 자원 검색·직접 입력(+10/+100/입력), 기물함(산삼·호피 등) 지급 | `resources`·`specialItems` 직접 대입 |
| 시간 | n일 점프, 다음 계절로, 특정 연차·계절·일로 이동, 배속 무관 1일 진행 | `__game.run` 확장, `advanceDay` |
| 마을 | 티어 승격/강등, 명성·의심·위협도 설정, 세공 성실도 | `upgradeSettlementCenter`, 수치 대입 |
| 스폰 | 주민 n명(성별·나이대 선택), 특수 주민 선택 스폰, 가축(종·수), 유민 제안 발화 | `createResident`, 특수 주민 정의, `acquireLivestock`, scripted 유민 |
| 사건 | 습격(전력 입력), 재해 6종 개별, 화재, 갱도 붕괴, 역병/병자, 세공 공지·수거, 공성(방어 개편 후) | 각 발생 함수 직접 호출 |
| 주민 상태 | 선택 주민 회복/발병/사망, 전원 만복·회복, 사기 설정 | 필드 대입 + 기존 회복 경로 |
| 지도 | 전 지도 탐사 해제, 수맥·광맥 레이어 강제, 서식지·어장 비축 리필 | `exploration`, 비축 필드 |
| 기타 | guides seen 초기화, 시나리오 스텝 건너뛰기/해제, 상태 JSON 덤프 | `guides`, `scenario` 조작 |

- 각 버튼은 실행 결과를 기존 로그 문법으로 한 줄 남긴다("(디버그) 곡식 +100") — 무엇을 만졌는지 재현 가능하게.
- 사건 발화는 랜덤 게이트·쿨다운을 우회하되 **사건 자체의 진행 규칙은 그대로** 탄다 — 치트는 트리거만 대신한다.

## 4. 경계

- 프로덕션 번들 무포함을 빌드 산출물 검사(문자열 부재)로 회귀 고정.
- 결정론 테스트와 무간섭 — debugActions는 게임 코드에서 역참조되지 않는 단방향 의존.
- 시나리오(튜토리얼) 중 사용 시 스텝 술어가 꼬일 수 있음 — 패널 상단에 경고 한 줄, 막지는 않는다(개발 도구).

## 5. 후속 결정 항목

1. `debugTouched` 표식을 저장 슬롯 UI에 표시할지 (권고: 작은 아이콘) — **미구현**. 필드는 저장에 실리고 패널 상단에 표시되지만 슬롯 목록에는 아직 없다.
2. 상태 JSON 덤프의 역방향(붙여넣기 로드) 허용 여부 — 권고: 1차 제외. **제외로 확정**(덤프만 구현).
3. 방어 개편 P3 이후 공성 강제 개시 버튼 추가 — **미구현**. 방어 개편 P5(성벽 단면 전술 무대) 이후로 미룸.

## 6. 구현 기록 (2026-08-03)

### 파일

| 파일 | 성격 | 요지 |
|---|---|---|
| `src/game/debugActions.ts` | 신규 | 모든 치트 조작. UI가 부르는 유일한 진입점. 게임 코드는 이 모듈을 역참조하지 않는다 |
| `src/components/DebugCheatPanel.tsx` | 신규 | 8개 섹션 플로팅 창. `dock-window` 클래스를 그대로 써 창 관례를 따르고, 자체 CSS는 인라인이라 프로덕션 스타일시트도 늘리지 않는다 |
| `src/GameSession.tsx` | 수정 | `import.meta.env.DEV ? lazy(() => import(...)) : null` 게이트, 백틱(`Backquote`) 토글, 패널 렌더 |
| `src/game/types.ts` | 수정 | `GameState.debugTouched?: boolean` |
| `src/game/saveLoad.ts` | 수정 | 불러오기에서 `=== true` 보정 (`tutorialGraduate` 선례 — 기본값 false라 스키마 상승 불요) |
| `src/game/disasters.ts` | 수정 | `maybeStartSnowDamage`를 게이트와 본체(`startSnowDamage`)로 분리 — 동작 동일 |
| `src/game/specialEvents.ts` | 수정 | `openEarlyFrostEvent`·`openLateFrostEvent`·`openLocustEvent`·`openDroughtEvent`·`openPlagueSuspicionEvent`·`openLivestockEpidemicEvent`·`startEpidemic`에 `export` 추가 (본문 무변경) |
| `src/game/specialResidents.ts` | 수정 | `recruitSpecialResident`에 `export` 추가 |
| `src/vite-env.d.ts` | 신규 | `import.meta.env` 타입 (`vite/client`) |
| `tools/game/test_debug_cheat_panel.mjs` | 신규 | 조작 계약 + 소스 구조 + 프로덕션 무포함 회귀 |

### 섹션별 조작과 재사용 함수

- **자원** — `debugAddResource`/`debugSetResource`/`debugAddAllResources`(직접 대입), 기물함 지급은 `grantSpecialItem`(재고+도감 공통 경로)
- **시간** — `debugAdvanceDays`/`debugAdvanceToNextSeason`/`debugJumpToDate` 전부 `advanceDay` 반복. 과거로는 가지 않는다
- **마을** — 승격은 교지 지급 후 `upgradeSettlementCenter`(실제 승격 경로), 강등·명성·의심·위협·세공 성실도는 수치 대입
- **스폰** — `createResident` + `applyLifeStage` + `reconcileResidentHomes`, 특수 주민은 `recruitSpecialResident`, 가축은 `acquireLivestock`, 유민은 `openScriptedImmigrationChoice`
- **사건** — 습격 `spawnRaiders`(전력 인자), 재해 6종은 `openEarlyFrostEvent`/`openLateFrostEvent`/`openLocustEvent`/`openDroughtEvent`/`startSpringFlood`/`startSnowDamage`, 화재 `maybeStartFire(state, () => 0)`, 갱도 붕괴 `startMineCollapse`, 병자 `openPlagueSuspicionEvent`, 역병 `startEpidemic`, 가축 역병 `openLivestockEpidemicEvent`, 세공 `announceCourtTribute`/`openCourtTributeChoice`
- **주민 상태** — 회복·발병은 필드 대입, 사망은 `killResident`(시신·배우자·통계 포함)
- **지도** — `revealAround` + `revealForeignSitesFromExploration`, 비축 리필은 `normalizeHabitatReserve`/`normalizeTidalFlatTile`을 거친 뒤 수용력까지 채움. 수맥·광맥 레이어는 게임 상태가 아니라 UI 선호값이라 세션이 넘긴 콜백으로 토글한다(표식 없음)
- **기타** — `guides.seen` 초기화, 시나리오 스텝 이동·해제(`TUTORIAL_STEPS` 색인), 상태 JSON 덤프(클립보드)

### 규칙

- 모든 조작은 `(디버그) …` 로그 한 줄과 `debugTouched = true`를 남긴다. 실패는 로그 없이 패널 하단에 사유만 띄운다.
- 파괴적 조작(시간 점프·사건 발화)은 `debugLockReason`으로 잠근다 — 모달·승격 안내·전술 전투·게임 종료. 자원·수치처럼 되돌릴 수 있는 조작은 잠금과 무관하다.
- 사건은 확률·쿨다운·계절 게이트만 우회한다. 발생 조건 대상(경작지·축사·채광갱)이 없으면 실패 사유를 돌려준다.

### 검증

- `npx tsc --noEmit` 통과 / `npm run build` 통과
- 프로덕션 번들에 `디버그 치트`·`(디버그)`·`debug-cheat-panel`·`전 지도 탐사 해제` 등 특징 문자열 없음. `DebugCheatPanel` 청크도 생성되지 않는다 (`debugTouched`만 `saveLoad` 청크에 남는데, 저장 필드라 의도된 것)
- `npm run test:game` — 신규 `test_debug_cheat_panel.mjs` 포함 core 84개 중 `test_building_footprints.mjs` 1건 실패. 이 실패는 직전 HEAD(`55fa624`)에서도 동일하게 나는 선행 실패(어항 2×2 점유영역)로 이번 작업과 무관
- dev 실기동: 백틱으로 패널 개폐, 곡물 +100 → `(디버그) 곡물 +100`, 5일 점프, 주민 3명 스폰, 습격(전력 8) 발화 → 평소 습격 선택지로 이어짐, 전 지도 탐사(4610칸), 보 승격, 화재·설해 발화, 모달 중 사건 발화 잠금 표시까지 확인. 콘솔 오류 없음
