# 조정 하사품 개편 — 1차 구현계획

- 작성일: 2026-07-28
- 기준 설계: `DESIGN-2026-07-28-court-grants.md`
- 선행 구현: `IMPLEMENTATION-2026-07-28-annual-climate-weather.md`
- 작업 브랜치: `codex/court-grants`
- 이번 범위: G1~G4
- 후속 범위: 영구 숙련 기물, 사액 현판, 지자총통·총통 포대, 고유 무기

## 1. 구현 목표

격년 세공 완납 보상을 다음 구조로 교체한다.

```text
완납 또는 면세 처리
  → 실용 물자 1품목 확정
  → 실용 물자 추가 추첨
  → 선행 물자 추첨
  → 받을 수 있을 때만 가축·군마 후보 포함
  → 물자와 독립된 고유기물 추첨 및 천장
  → 1회성 하사품 사용 경로 제공
```

동시에 고유기물 식별자와 저장 보정을 단일 원본으로 정리하고, 선행 구현된
`AnnualClimate`를 재해 확률과 측우기 정보 표시에 연결한다.

이번 범위에서는 사액 현판, 지자총통, 총통 포대, 영구 숙련·전투 패시브를 만들지 않는다.
고유기물 목록과 저장 형식은 후속 항목을 안전하게 추가할 수 있도록 확장 가능하게 만든다.

## 2. 모델 사용 원칙

- 정형적인 보상표·저장 보정·기존 시스템 연결은 `gpt-5.6-terra`가 맡는다.
- 연간 기후와 재해 확률을 연결하는 교차 시스템 작업과 최종 감사만 `gpt-5.6-sol`이 맡는다.
- `xhigh`, `max`, `ultra` 추론은 사용하지 않는다.
- Terra 담당이 같은 핵심 장애에 두 번 연속 막히거나 공개 상태 계약을 다시 설계해야 할 때만 Sol로 승격한다.
- 동시에 편집하는 작업자는 최대 2명으로 제한하고 같은 파일을 병렬로 수정하지 않는다.
- 하위 작업자는 커밋·병합하지 않고 변경 파일, 판단, 실행한 테스트를 루트 작업자에게 인계한다.
- 각 단계가 끝날 때 다음 담당 모델과 추론 수준을 사용자에게 알린다.

### 모델 배정 요약

| 작업 | 담당 모델 | 추론 수준 | 배정 이유 |
|---|---|---:|---|
| P0 현재 계약 감사 | `gpt-5.6-terra` | medium | 읽기 중심의 제한된 조사 |
| P1 물자 보상표와 결정적 추첨 | `gpt-5.6-terra` | high | 가중치·연차 보정·중복 제외 검증 |
| P2 가축·군마 지급 | `gpt-5.6-terra` | medium | 기존 `acquireLivestock` 경로 재사용 |
| P3 고유기물 단일 원본과 저장 보정 | `gpt-5.6-terra` | high | 타입·초기화·구세이브 필터 일치 필요 |
| P4 독립 기물 추첨과 천장 | `gpt-5.6-terra` | high | 결정성·중복·천장 상태 검증 |
| P5 1회성 하사품 사용 경로 | `gpt-5.6-terra` | high | 면세·이민·모달 상태가 교차함 |
| P6 연간 기후·재해·측우기 연결 | `gpt-5.6-sol` | high | 확률 계약과 UI 공개 범위의 교차 감사 필요 |
| P7 집중 회귀 검증 | `gpt-5.6-terra` | high | 표적 테스트와 저장 왕복 검증 중심 |
| P8 최종 교차 감사 | `gpt-5.6-sol` | high | RNG·저장·승격·재해 전체 경계 검토 |

## 3. 작업 패키지

### P0. 현재 계약 감사

**담당:** `gpt-5.6-terra`, reasoning `medium`

**읽을 파일**

- `src/game/courtTribute.ts`
- `src/game/specialItems.ts`
- `src/game/types.ts`
- `src/game/saveLoad.ts`
- `src/game/livestock.ts`
- `src/game/immigration.ts`
- `src/game/specialEvents.ts`
- 관련 게임 테스트

**산출물**

- 세공 완납·면세·격년 하사 호출 순서와 RNG 계약
- 등급 및 자원 식별자의 실제 명칭
- 가축 수용 가능 여부와 지급 API
- 고유기물 초기화·저장·발견 목록의 중복 지점
- 이민 선택지와 재해 확률의 안전한 연결 지점

**편집:** 없음.

### P1. 실용·선행 물자 보상표

**담당:** `gpt-5.6-terra`, reasoning `high`

**주 소유 파일**

- `src/game/courtTribute.ts`
- 필요 시 신규 `src/game/courtGrants.ts`
- `src/game/config.ts`
- 신규 `tools/game/test_court_grants.mjs`

**구현**

- `{ resource, baseAmount, weight, minRank, category }` 후보표
- 실용 물자 1개 확정, 실용 물자 추가 40%, 선행 물자 35%
- 같은 하사 안의 동일 자원 중복 제외
- `min(1.8, 1 + 0.08 × (year - 1))` 연차 보정
- 세계 시드와 연차만 사용하는 결정적 추첨
- 자원 재고량에 따른 후보 가중치 변경 금지
- 지급 내역을 한 번에 읽을 수 있는 하사 로그

**표적 테스트**

```powershell
node tools/game/test_court_grants.mjs
node tools/game/test_court_tribute.mjs
```

### P2. 가축·군마 후보와 지급

**담당:** `gpt-5.6-terra`, reasoning `medium`

**주 소유 파일**

- `src/game/courtGrants.ts` 또는 `src/game/courtTribute.ts`
- `src/game/livestock.ts`
- `tools/game/test_court_grants.mjs`
- 필요 시 `tools/game/test_livestock.mjs`

**구현**

- 진 이상에서 일반 가축과 군마 후보 개방
- 일반 가축은 `chicken`, `goat`, `sheep`, `pig`, `cattle`만 포함
- 군마는 `horse` 고정
- 해당 축종을 받을 빈 축사가 없으면 후보에서 제외
- 실제 지급은 `acquireLivestock`만 사용
- 사전 판정과 지급 결과가 어긋나면 다른 물자로 조용히 대체하지 않고 명시적으로 처리

### P3. 고유기물 식별자 단일 원본

**담당:** `gpt-5.6-terra`, reasoning `high`

**주 소유 파일**

- `src/game/specialItems.ts`
- `src/game/types.ts`
- `src/game/saveLoad.ts`
- 새 게임 초기화 및 구세이브 보정 지점
- 신규 또는 기존 저장 마이그레이션 테스트

**구현**

- `SPECIAL_ITEM_IDS`를 단일 원본으로 정의
- `SpecialItemId` 타입을 목록에서 파생
- 새 게임 `specialItems`, 구세이브 기본값, `discoveredSpecialItems` 필터가 같은 목록 사용
- 하사 전용 기물의 `tradeValue`는 0
- 이번 범위의 1회성 기물과 측우기 정의 추가

**표적 테스트**

```powershell
node tools/game/test_resource_save_migration.mjs
node tools/game/test_special_events.mjs
```

### P4. 독립 고유기물 추첨과 천장

**담당:** `gpt-5.6-terra`, reasoning `high`

**주 소유 파일**

- `src/game/courtGrants.ts` 또는 `src/game/courtTribute.ts`
- `src/game/types.ts`
- `src/game/saveLoad.ts`
- `tools/game/test_court_grants.mjs`

**구현**

- 물자 지급 후 독립적으로 12% 추첨
- 보유 중인 비소모성 기물과 한 번만 받을 수 있는 기물 중복 제외
- 적격 하사를 네 번 연속 놓치면 다섯 번째에 지급
- 받을 수 있는 후보가 없을 때 천장을 소비하지 않음
- 천장 상태는 저장·불러오기 후 보존
- 결과는 세계 시드와 연차에 대해 결정적

### P5. 1회성 하사품

**담당:** `gpt-5.6-terra`, reasoning `high`

**주 소유 파일**

- `src/game/courtTribute.ts`
- `src/game/specialItems.ts`
- `src/game/immigration.ts`
- UI의 기물 사용 처리
- 관련 표적 테스트

**구현**

- 구휼미 어음: 사용 즉시 설정값만큼 곡물 지급
- 면세 교지: 세공 면제와 납부 연속 기록을 공통 해결 함수로 처리
- 모민 방문: 일일 확률·계절·쿨다운을 건너뛰되 기존 가족 생성과 주거·식량 예측을 재사용
- 다른 모달이나 전투 중에는 모민 방문 사용 차단
- 효과가 실제로 적용될 때만 아이템 소모
- 한국어 조사 조합은 기존 조사 헬퍼 사용

### P6. 연간 기후·재해·측우기

**담당:** `gpt-5.6-sol`, reasoning `high`

**주 소유 파일**

- `src/game/specialEvents.ts`
- `src/game/climate.ts`
- 측우기 정보 표시 UI
- `src/game/config.ts`
- 관련 표적 테스트

**구현**

- 고정된 재해 후보 확률을 해당 연도 `AnnualClimate`로 보정
- 건조·강수·폭풍·기온 축과 재해 종류의 관계를 설정값으로 명시
- 최종 확률은 안전한 범위로 제한
- 측우기 보유 시 연간 기후 요약과 재해 선택지 성공 확률 공개
- 미보유 시 기존처럼 수치 확률을 숨김
- 측우기는 재해 결과를 바꾸지 않고 정보만 제공

### P7. 집중 회귀 검증

**담당:** `gpt-5.6-terra`, reasoning `high`

P1~P6에서 성공한 테스트를 매 단계마다 반복하지 않는다. 최종 통합 결과에서 다음 관련 묶음만 한 번 실행한다.

```powershell
node tools/game/test_court_grants.mjs
node tools/game/test_court_tribute.mjs
node tools/game/test_livestock.mjs
node tools/game/test_immigration.mjs
node tools/game/test_promotion.mjs
node tools/game/test_resource_save_migration.mjs
node tools/game/test_special_events.mjs
node tools/game/test_annual_climate.mjs
node tools/game/test_weather_schedule.mjs
npm run build
```

### P8. 최종 교차 감사

**담당:** `gpt-5.6-sol`, reasoning `high`

**감사 항목**

- 저장·불러오기로 같은 연도 하사 결과를 바꿀 수 없는가
- 보상 RNG가 다른 일일 RNG 순서를 의도치 않게 흔들지 않는가
- 면세가 납부 연속 기록과 승격 조건을 정확히 한 번만 갱신하는가
- 가축 실패가 보상 손실이나 잘못된 축종 전환을 만들지 않는가
- 고유기물 천장이 중복 후보·빈 후보·구세이브에서 안전한가
- 측우기 공개 확률과 실제 판정 확률이 같은 계산을 쓰는가

전체 `npm run test:game`은 이 감사에서 다음 중 하나가 확인될 때만 실행한다.

- 공용 일일 RNG 순서가 변경됨
- 저장 스키마의 넓은 범위가 변경됨
- 표적 테스트 실패가 관련 없는 여러 시스템으로 번짐

렌더 자산을 바꾸지 않으므로 `npm run check`는 실행하지 않는다.

## 4. 커밋 경계

1. 구현계획 문서
2. P1~P2 물자·가축 하사
3. P3~P4 고유기물 저장·추첨
4. P5 1회성 사용 경로
5. P6 기후·재해·측우기
6. P7~P8 검증 보정

각 커밋은 관련 표적 테스트가 통과한 뒤 만든다. 사용자 소유의 미추적 렌더·디버그 산출물은
스테이징하지 않는다.
