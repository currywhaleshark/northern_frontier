# 연간 기후와 실제 날씨 연결 — 구현계획

> **계획 상태:** 완료
> **상태 갱신:** 2026-07-29 — P1~P7 구현·검증을 마치고 `800f624`로 병합했다.

- 작성일: 2026-07-28
- 기준 설계: `DESIGN-2026-07-28-annual-climate-weather.md`
- 작업 브랜치: `codex/annual-climate-weather`
- 이번 범위: W1~W6
- 후속 범위: 측우기 아이템, 재해 확률, 조정 하사품

## 1. 구현 목표

현재 `CONFIG.weather.table`에서 매일 독립 추첨하는 날씨를 다음 구조로 교체한다.

```text
세계 시드 + 연차
  → AnnualClimate
  → 계절별 강수일 수와 날씨별 일수
  → 12일짜리 결정적 날씨표
  → weatherForDay(seed, day)
  → 기존 농사·작업·난방·전투 효과
```

이 작업에서 측우기 아이템이나 이른 서리 확률은 아직 구현하지 않는다. 대신 후속 작업이 사용할
`AnnualClimate`, 기후 표현 라벨, 결정적 날씨 조회 API까지 완성한다.

## 2. 모델 사용 원칙

모든 작업을 상위 모델에 몰지 않는다.

- 기본 구현·연결·테스트는 `gpt-5.6-terra`가 맡는다.
- 알고리즘 불변조건이 복잡한 계절 날씨표 생성과 마지막 교차 감사만 `gpt-5.6-sol`이 맡는다.
- `xhigh`, `max`, `ultra` 추론은 사용하지 않는다.
- Terra 담당이 동일한 핵심 장애에 두 번 연속 막히거나, 공개 API를 다시 설계해야 할 때만 Sol로 승격한다.
- 동시에 편집하는 작업자는 최대 2명으로 제한하고 같은 파일을 병렬로 수정하지 않는다.
- 하위 작업자는 커밋·병합하지 않고 변경 파일, 판단, 실행한 테스트를 루트 작업자에게 인계한다.

### 모델 배정 요약

| 작업 | 담당 모델 | 추론 수준 | 배정 이유 |
|---|---|---:|---|
| P0 현재 계약 확인 | `gpt-5.6-terra` | medium | 읽기 중심의 제한된 조사 |
| P1 `AnnualClimate` 코어 | `gpt-5.6-terra` | high | 결정성·분포 테스트가 필요하지만 범위가 작음 |
| P2 계절 일수 배분·구간 배열 | `gpt-5.6-sol` | high | 반올림·단조성·연속 상한이 얽힌 핵심 알고리즘 |
| P3 시뮬레이션 연결 | `gpt-5.6-terra` | medium | 정해진 API를 기존 호출부에 연결 |
| P4 해빙기 홍수 연결 | `gpt-5.6-terra` | high | 직전 연도 겨울 조회와 경계 연차 처리 |
| P5 기후 표현 API | `gpt-5.6-terra` | medium | 정형적인 라벨·포맷 함수 |
| P6 표적 검증과 분포 측정 | `gpt-5.6-terra` | high | 테스트 작성·표본 검증 중심 |
| P7 최종 교차 감사 | `gpt-5.6-sol` | high | RNG·시간·저장·게임 효과 전체 경계 검토 |

## 3. 작업 패키지

### P0. 현재 날씨 계약 고정

**담당:** `gpt-5.6-terra`, reasoning `medium`

**읽을 파일**

- `src/game/weather.ts`
- `src/game/config.ts`
- `src/game/seasons.ts`
- `src/game/simulation.ts`
- `src/game/types.ts`
- 날씨를 직접 고정하는 기존 테스트

**산출물**

- 현재 `WeatherId`와 계절별 허용 날씨 목록
- 새 게임 첫날과 일일 갱신 호출 위치
- 날씨가 영향을 주는 주요 소비·농사·통행 경로
- 구세이브 당일 날씨 유지 규칙 확인

**편집:** 없음.

P0 결과로 아래 공개 API를 확정한 뒤 P1과 P2를 시작한다.

```ts
annualClimate(seed: number, year: number): AnnualClimate
seasonWeatherSchedule(seed: number, year: number, season: Season): readonly WeatherId[]
weatherForDay(seed: number, day: number): WeatherId
```

### P1. `AnnualClimate` 코어

**담당:** `gpt-5.6-terra`, reasoning `high`

**주 소유 파일**

- 신규 `src/game/climate.ts`
- `src/game/config.ts`의 기후 보정 수치
- 신규 `tools/game/test_annual_climate.mjs`

**구현**

- `temperatureAnomaly`, `precipitationAnomaly`, `storminess`
- 축마다 독립된 salt
- `rng() - rng()` 삼각분포
- `seed + year` 결정성
- 값 범위 `[-1, 1]`
- 저장 상태를 추가하지 않는 순수 함수

**표적 테스트**

```powershell
node tools/game/test_annual_climate.mjs
```

검증 항목:

- 같은 시드·연차는 같은 결과
- 연차가 달라지면 적어도 한 축이 달라짐
- 세 축 모두 범위 준수
- 한 축의 salt나 호출 순서 변경이 다른 축 결과를 흔들지 않음
- 충분한 표본에서 평균이 0 근처이고 극단값이 중앙값보다 드묾

### P2. 계절 일수 배분과 연속 구간 배열

**담당:** `gpt-5.6-sol`, reasoning `high`

**주 소유 파일**

- `src/game/weather.ts`
- 필요 시 신규 `src/game/weatherSchedule.ts`
- 신규 `tools/game/test_weather_schedule.mjs`

**구현**

1. 기존 계절 기본표를 평년 가중치로 사용
2. 기후로 총 강수일 수 계산
3. 강수일 안에서 비·폭설·눈보라 배분
4. 비강수일 안에서 맑음·서리·혹한 배분
5. 날씨별 일수를 1~3일 구간으로 나눔
6. 결정적으로 구간을 섞되 극단 날씨 연속 상한 유지
7. 12일 배열 반환

**필수 불변조건**

- 배열 길이는 언제나 `CONFIG.time.seasonDays`
- 음수·NaN·미배정 날짜 없음
- 계절 기본 가중치가 0인 날씨는 생성하지 않음
- 같은 인자에서 배열이 항상 동일
- 고정한 시험용 기후 프로필에서, 동일 기온·폭풍성일 때 강수 편차가 낮아질수록 총 강수일이 증가하지 않음
- 동일 강수 편차에서 기온이 낮아질수록 눈 계열 몫이 감소하지 않음
- `blizzard`, `thawFlood`는 기본 1일, 허용해도 최대 2일 연속

**표적 테스트**

```powershell
node tools/game/test_weather_schedule.mjs
```

분포 표본 테스트는 정확한 특정 배열보다 불변조건과 단조성을 검사한다. 의도적인 배열 조정 때
스냅숏을 대량 수정하지 않도록 특정 시드 전체 배열 고정은 대표 사례 몇 개로 제한한다.

### P3. 실제 시뮬레이션 연결

**담당:** `gpt-5.6-terra`, reasoning `medium`

**의존:** P1, P2 공개 API 확정.

**주 소유 파일**

- `src/game/simulation.ts`
- 신규 `tools/game/test_weather_progression.mjs`

**구현**

- 새 게임 첫날 `rollWeather(1, rng)`를 `weatherForDay(seed, 1)`로 교체
- 일일 갱신을 `weatherForDay(state.seed, state.day)`로 교체
- 기존 `rollWeather`가 있던 자리에서는 호환용으로 공용 `rng()`를 정확히 한 번 호출하고 결과는 버린다.
  날씨 결정은 새 순수 API가 맡되, 뒤따르는 소비·생애주기 등의 일일 RNG 순서를 보존한다.
- 기존 날씨 변경 로그 유지
- 새 게임 초기화에서도 기존 날씨 추첨 위치의 RNG 소비 여부를 P0 계약과 대조해 보존한다.
- 구세이브를 불러온 당일의 `state.weather`는 그대로 두고 다음 날부터 새 표 적용
- 전투 시뮬레이터에서 사용자가 직접 지정하는 날씨는 변경하지 않음

**표적 테스트**

```powershell
node tools/game/test_weather_progression.mjs
node tools/game/test_daily_cycle.mjs
```

### P4. 해빙기 홍수와 직전 겨울 적설

**담당:** `gpt-5.6-terra`, reasoning `high`

**의존:** P2.

**주 소유 파일**

- `src/game/weather.ts` 또는 `src/game/weatherSchedule.ts`
- `src/game/config.ts`
- `tools/game/test_weather_schedule.mjs`

**구현**

- 직전 겨울의 `heavySnow + blizzard` 예정 일수 조회
- 다설한 겨울일수록 봄 `thawFlood` 일수 증가
- 현재 봄이 온난할수록 해빙 가중치 증가
- 1년차 봄은 `CONFIG`의 평년 적설 기본값 사용
- 홍수일은 `clear`를 우선 대체하고 부족하면 `frost`를 대체
- 전체 계절 길이와 강수일 수 불변조건 유지

**표적 테스트**

```powershell
node tools/game/test_weather_schedule.mjs
node tools/game/test_pathfinding_collision.mjs
```

### P5. 후속 측우기용 기후 표현 API

**담당:** `gpt-5.6-terra`, reasoning `medium`

**의존:** P1.

**주 소유 파일**

- `src/game/climate.ts`
- `src/game/constants.ts` 또는 별도 표현 모듈
- `tools/game/test_annual_climate.mjs`

**구현**

```ts
climateTemperatureLabel(climate): string
climatePrecipitationLabel(climate): string
climateStorminessLabel(climate): string
annualClimateSummary(climate): string
```

이번 단계에서는 TopBar나 기물함에 표시하지 않는다. 측우기 아이템이 생길 때 보유 여부에 따라
표시할 수 있도록 순수 표현 API만 제공한다.

**표적 테스트**

```powershell
node tools/game/test_annual_climate.mjs
```

### P6. 집중 회귀 검증

**담당:** `gpt-5.6-terra`, reasoning `high`

**의존:** P1~P5 완료.

기존 효과에 별도 연간 생산 배율을 추가하지 않았는지 확인하고 다음 테스트만 한 번 실행한다.

```powershell
node tools/game/test_annual_climate.mjs
node tools/game/test_weather_schedule.mjs
node tools/game/test_weather_progression.mjs
node tools/game/test_daily_cycle.mjs
node tools/game/test_fuel_and_clothing_chains.mjs
node tools/game/test_preservation.mjs
node tools/game/test_pathfinding_collision.mjs
npm run build
```

각 패키지에서 이미 성공한 테스트를 변경 없이 반복하지 않는다. P6에서는 최종 통합 결과에 대해서만
위 목록을 한 번 실행한다.

### P7. 최종 교차 감사

**담당:** `gpt-5.6-sol`, reasoning `high`

**감사 항목**

- `seed + year` 결정성과 축별 독립 salt
- 12일 배분, 단조성, 연속 상한
- 일일 시뮬레이션의 다른 RNG 순서가 바뀌지 않았는지
- 저장 필드 없이 구세이브가 이어지는지
- 실제 날씨 효과와 연간 기후 페널티가 이중 적용되지 않았는지
- 전투 시뮬레이터의 수동 날씨가 유지되는지
- 측우기 후속 작업이 사용할 API가 상태나 UI에 결합되지 않았는지
- 테스트가 구현을 그대로 복제해 같은 버그를 공유하지 않는지

감사자는 원칙적으로 코드를 다시 대규모 작성하지 않는다. 발견 사항을 위험도순으로 정리하고,
작은 수정은 해당 Terra 담당에게 되돌린다. 핵심 알고리즘 재설계가 필요할 때만 Sol이 직접 수정한다.

## 4. 병렬 실행 순서

```text
P0 Terra-medium
  ↓
P1 Terra-high
  ↓
P2 Sol-high
  ├─ P3 Terra-medium
  ├─ P4 Terra-high
  └─ P5 Terra-medium
        ↓
      P6 Terra-high
        ↓
      P7 Sol-high
```

P3·P4·P5는 소유 파일이 겹치지 않도록 조정했을 때만 최대 2개까지 병렬 실행한다.
P4가 `weather.ts`를 수정하는 동안 P3은 `simulation.ts`만 수정하고, 통합은 루트 작업자가 한다.

## 5. 테스트 비용 통제와 전체 테스트 승격 조건

### 기본 원칙

- 하위 작업자는 자기 패키지의 표적 테스트만 실행한다.
- `npm run test:game`과 `npm run check`를 작업 패키지마다 반복하지 않는다.
- TypeScript 빌드는 P6 통합 시 한 번 실행한다.
- 문서만 바꾼 커밋에는 게임 테스트를 실행하지 않는다.

### 최종 감사에서 전체 게임 테스트를 실행하는 조건

P7 감사자가 다음 중 하나를 발견했을 때만 `npm run test:game`을 추가 실행한다.

- `simulation.ts`의 일일 처리 순서 또는 공용 RNG 소비 순서가 바뀜
- `GameState`나 저장 마이그레이션을 추가함
- 표적 테스트 실패가 날씨 외 시스템으로 번짐
- 기존 테스트가 날씨를 고정하지 않고 일일 진행 결과에 의존하는 사례가 다수 발견됨
- 감사자가 회귀 범위를 표적 테스트로 한정할 수 없다고 근거를 남김

`npm run check`는 렌더 에셋·건물 에셋·가축 에셋까지 포함하므로 이번 작업에서는 기본적으로 실행하지 않는다.
날씨 시각 에셋이나 렌더 파이프라인까지 수정했을 때만 최종 전체 감사에서 승격한다.

## 6. 커밋 단위

1. `연간 기후와 계절 날씨표를 추가한다`
   - P1, P2, 핵심 단위 테스트
2. `결정적 날씨표를 일일 시뮬레이션에 연결한다`
   - P3, P4, 진행·홍수 테스트
3. `기후 표현 API와 통합 검증을 보강한다`
   - P5, P6, 감사 수정

최종 감사가 끝난 뒤에만 `main` 병합 대상으로 본다.

## 7. 완료 조건

- 모든 P1~P6 표적 테스트 통과
- `npm run build` 통과
- P7 Sol-high 감사에서 미해결 고위험 항목 없음
- 필요하다고 판정된 경우에만 `npm run test:game` 또는 `npm run check` 통과
- 문서의 W1~W6와 실제 코드·테스트가 대응
- 조정 하사품 구현을 시작할 수 있는 안정된 `AnnualClimate` API 제공
