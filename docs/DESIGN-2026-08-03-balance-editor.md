# 밸런스 편집기 설계 — 오버레이 방식 별도 앱 (스프라이트 스튜디오 계승)

> **계획 상태:** 완료 (B1~B4 구현 — §8 구현 기록)
> **상태 갱신:** 2026-08-03 — 설계 확정. [디버그 치트 패널](DESIGN-2026-08-03-debug-cheat-panel.md)과 짝 — 편집기가 바꾼 수치를 패널로 즉석 검증하는 순환.
> **상태 갱신:** 2026-08-03 — B1~B4 구현 완료. 오버레이 병합 골격·편집기 앱·주석 동반 표시·반영 시점 배지·흡수용 diff까지.

- 작성일: 2026-08-03
- 선례: 스프라이트 스튜디오 (`tools/sprite-studio` — 별도 vite 앱, `data/*.json`, 저장 → 코드젠 → 게임 HMR)

## 0. 목표

밸런스 수치(건물 자재·공기, 매장량, 수확량, 각종 배율·확률·기간)를 **제작자가 직접 편집**한다. 수정 요청 → 코드 수정 → 빌드 왕복을 없애고, 편집 → 게임 HMR 반영 → 치트 패널로 검증의 즉석 순환을 만든다.

## 1. 현재 기준선 (2026-08-03 코드 대조)

- 수치 원천: `src/game/config.ts`(2001줄 — 설계 의도 주석 99줄 포함, 숫자·불린 중심의 중첩 객체)와 `src/game/buildings.ts`의 `BUILDING_DEFS`(비용·공기·슬롯·수용량·방어).
- **배치 인원수는 이미 편집 가능** — 스프라이트 스튜디오가 `worker-slots.json` → `src/game/buildingWorkerSlots.ts`를 생성 중. 이 소유권은 스튜디오에 남긴다(중복 편집 금지).
- 스튜디오 흐름 검증됨: vite dev 플러그인 API로 JSON 저장 → `generate_registries.mjs` 코드젠 → 게임 dev 서버 HMR.

## 2. 확정 방향 — B안: 오버레이

**config.ts·buildings.ts는 기본값·주석 원본 그대로 두고, 편집기는 바꾼 값만 오버레이로 남긴다.**

1. 저장 형식: `tools/balance-studio/data/balance-overrides.json` — 경로 키(`"minerals.nearbyStone": 40`, `"buildings.mine.cost.wood": 8`)에 값. **기본값과 같아지면 키 삭제.**
2. 반영 경로는 스튜디오와 동일한 코드젠: 저장 시 `src/game/balanceOverrides.ts`(정렬된 리터럴)를 생성 → 게임 HMR. `CONFIG`와 `BUILDING_DEFS`는 모듈 초기화 시점에 `applyBalanceOverrides()`로 깊은 병합. 실행 중 게임에는 리로드로 반영(맵 생성 값은 새 게임부터 — §4).
3. 장점: 원본 주석·설계 의도 보존, diff가 "무엇을 바꿨나"만 보임, 되돌리기 = 키 삭제, 기본값 대비 변경 표시가 구조적으로 공짜.

## 3. 편집기 앱 (`tools/balance-studio`, `npm run edit:balance`)

- **자동 폼 생성**: CONFIG·BUILDING_DEFS 트리를 순회해 숫자/불린 필드를 폼으로 — 항목별 수제 UI 없음. 최상위 키가 카테고리(map·minerals·agents·raid·tutorial·…, buildings.*).
- **주석 동반 표시**: config.ts 원문을 파싱해 각 키 위/옆 주석을 필드 설명으로 함께 보여준다 — 주석 99줄이 편집기의 도움말이 된다.
- 검색(키·한글 주석), 변경 항목 하이라이트·"변경분만 보기", 항목별·전체 리셋, 기본값 대비 배율 표시(1.33×).
- **편집 대상 제외 목록**: worker-slots(스튜디오 소유), 저장 스키마·버전 상수, 지형·아트 참조 등 비밸런스 키는 차단 목록으로 숨긴다.
- 검증: 타입 보존(숫자→숫자), 음수·0 금지 키 지정, 저장 시 코드젠 실패를 편집기에 표면화 (스튜디오와 동일).

## 4. 값의 반영 시점 — 편집기가 명시해야 할 구분

| 부류 | 반영 | 예 |
|---|---|---|
| 런타임 소비 값 | 저장·HMR 즉시 (진행 중 게임 포함) | 수확량·소모량·확률·배율 |
| 생성 시 굳는 값 | **새 게임부터** | 맵 크기·매장량·노두 배치·시작 물자 |
| 저장에 복사되는 값 | 새 게임부터 (기존 저장은 저장된 값 유지) | 시나리오 목표치 등 |

편집기 필드에 부류 배지를 달아 "왜 지금 게임에 안 먹는가"의 혼란을 없앤다. 부류는 차단 목록과 함께 키별 메타데이터로 관리.

## 5. 오버레이의 지위와 테스트

- **오버레이는 실험·조정 공간이고, 확정치는 주기적으로 기본값(config.ts)에 흡수한다** — 편집기에 "현재 오버레이 목록 내보내기(흡수용 diff)"를 두고, 흡수 라운드는 코드 수정으로 진행(주석 갱신 포함). 오버레이가 영구 분기 원천이 되면 기본값이 화석화된다.
- 오버레이 파일은 git 추적 — 조정 이력이 커밋으로 남는다.
- **게임·테스트는 같은 현실을 본다**: 회귀·밸런스 테스트도 병합된 값으로 돈다 (게임과 테스트가 다른 수치를 보면 테스트가 거짓말이 된다). 특정 수치를 단언하는 표적 테스트가 오버레이로 깨지는 것은 정상 신호 — 흡수 라운드에서 함께 갱신한다. 결정론 시드 테스트(튜토리얼 등)는 생성 값 오버레이 시 함께 재검증.

## 6. 단계 구성

| 단계 | 내용 |
|---|---|
| B1 | 오버레이 병합 골격(`balanceOverrides.ts` 코드젠 + `applyBalanceOverrides`) — 빈 오버레이로 무변화 회귀 확인 |
| B2 | 편집기 앱: CONFIG 자동 폼·검색·변경 하이라이트·저장 흐름 (스튜디오 vite 플러그인 이식) |
| B3 | BUILDING_DEFS 편집 + 주석 동반 표시 + 부류 배지 |
| B4 | 흡수용 diff 내보내기, 차단 목록 정비, 문서화 |

## 7. 후속 결정 항목

1. 진행 중 게임에 런타임 값을 반영하는 "다시 읽기" 버튼(리로드 없이) 제공 여부 — 권고: 1차 제외, HMR 리로드로 충분 → **1차 제외로 진행**
2. 오버레이 프리셋(밸런스 실험 세트 저장·전환) — 권고: B4 이후 → **미구현(후속)**
3. config.ts 주석 파싱의 견고성 — 실패 시 주석 없이 폼만 (기능 저하로 처리, 차단 아님) → **줄 단위 수확기로 구현, 273개 경로에서 주석 확보**

## 8. 구현 기록 (2026-08-03)

### 파일

| 파일 | 몫 |
|---|---|
| `src/game/balanceOverlay.ts` | 병합 로직 — `applyBalanceOverrides(target, prefix)`, `cloneBalanceTree` |
| `src/game/balanceOverrides.ts` | **생성물**(정렬된 리터럴). 직접 수정 금지 |
| `src/game/config.ts` | 리터럴을 `CONFIG_DEFAULTS`로 두고, 파일 말미에서 `CONFIG = applyBalanceOverrides(cloneBalanceTree(CONFIG_DEFAULTS), '')` |
| `src/game/buildings.ts` | 리터럴을 `BUILDING_DEF_DEFAULTS`로 두고, 리터럴 바로 뒤에서 `BUILDING_DEFS = applyBalanceOverrides(…, 'buildings.')` |
| `tools/balance-studio/data/balance-overrides.json` | 편집 원본(경로 키 → 값, git 추적) |
| `tools/balance-studio/generate_balance_overrides.mjs` | 코드젠 + 검증 (`npm run gen:balance`) |
| `tools/balance-studio/balance-meta.mjs` (+`.d.mts`) | 차단 목록·반영 시점·값 경고의 **단일 원본**. 코드젠과 편집기가 같이 읽는다 |
| `tools/balance-studio/parse_config_comments.mjs` | config.ts 주석 수확기 |
| `tools/balance-studio/vite.config.mts` · `src/**` | 편집기 앱 (`npm run edit:balance`, 포트 5185) |

### 병합 시점 보장

`CONFIG`·`BUILDING_DEFS`를 **정의한 모듈 본문 안에서** 병합을 끝낸다. ESM은 import된 모듈 본문을
소비자 본문보다 먼저 끝까지 실행하므로, `const TILE = CONFIG.ui.tileSize` 같은 모듈 최상위 대입도
이미 병합된 값을 읽는다. config.ts는 `./dayCycle`·`./types`·오버레이 모듈만 import하므로 순환이 없고,
`balanceOverrides.ts`는 `import type`만 쓰는 순수 데이터라 런타임 순환을 만들지 않는다.
빈 오버레이일 때 `CONFIG`는 기본값의 깊은 복사본 = 도입 이전과 완전히 같은 값이다.

### 검증 지점

- 코드젠이 없는 경로·형 불일치·차단 키를 **에러로 중단**한다 (`src/game/*.ts`를 임시 transpile해 기본값 트리와 대조 — 게임 테스트 하니스와 같은 수법).
- dev 서버는 저장 실패 시 JSON을 되돌리고 코드젠을 다시 돌린다 (스프라이트 스튜디오와 동일).
- 편집기는 0 이하·1 초과 확률·정수 자리 소수를 경고로 표시한다(막지는 않는다).

### 남은 것

- 오버레이 프리셋, 리로드 없는 "다시 읽기"
- 흡수 라운드는 사람이 한다 — "흡수용 diff" 버튼이 `키: 기본값 -> 오버레이값` 목록을 뽑아 준다
