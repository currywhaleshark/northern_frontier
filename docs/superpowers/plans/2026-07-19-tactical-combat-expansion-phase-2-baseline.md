# 전술전 확장 2단계 Phase 0 기준선

> 측정일: 2026-07-19
> 기준 커밋: `b8305e4` (`Document tactical combat expansion phase 2`)
> 백엔드 브랜치: `codex/combat-expansion-phase-2-backend`
> 저장 스키마: v24

## 검증 결과

| 항목 | 결과 | 기록 |
|---|---|---|
| `npm run test:combat` | 통과 | `footLosses 21`, `mountedLosses 15`, 적 전력 비중 `26.4861 / 18.0186` |
| `npm run test:game` | 기준선 실패 1/110 | `test_screen_ambient_audio.mjs`만 실패, 나머지 109개 통과 |
| `npm run build` | 통과 | 196 modules, main JS 865.86 kB (gzip 312.73 kB), 기존 500 kB 경고 |
| `npm run measure:runtime` | 통과 | 아래 시나리오 기록 |

## 기존 전체 회귀 실패

`test_screen_ambient_audio.mjs`는 `App.tsx`의 로그·전투 SFX effect를 추출한 문자열에 별도의 날씨 ambient
effect가 뒤이어 포함됐다는 이유로 실패한다. 실제 실패 지점은 전술전 백엔드가 아니며 이번 브랜치에서
`App.tsx` 변경도 없다.

- 실패 assertion: `log and battle SFX inspection must not update weather ambient on every snapshot`.
- 현재 `setWeatherAmbient(state.weather)`는 별도 `[state.weather]` effect에 있다.
- 소유권상 `App.tsx`는 통합 전용이므로 Phase 1 백엔드 작업에서 기대값이나 앱 코드를 고치지 않는다.
- 백엔드 변경 뒤에도 동일한 단일 실패만 남는지 전체 통합 게이트에서 비교한다.

## 런타임 기준선

### cold-first-path

- residents 12, buildings 3, ticks 24.
- tick mean 6.261 ms, p50 1.869 ms, p95 26.470 ms, max/first tick 42.313 ms.
- `t6-battles` mean 0.018 ms, p95 0.006 ms, max 0.348 ms.

### stress-120-residents-96-buildings

- residents 120, buildings 96, ticks 8.
- tick mean 25.347 ms, p50 14.693 ms, p95/max/first tick 80.620 ms.
- `t6-battles` mean 0.377 ms, p95/max 2.975 ms.

### exploration-lookup

- 30 samples per variant, path length 5.
- helper mean 1.080 ms, p95 3.279 ms, max 11.308 ms.
- raw mean 0.472 ms, p95 1.308 ms, max 1.421 ms.
- helper/raw mean ratio 2.29x.

## Phase 1 회귀 기준

- 기존 tactical golden fixture는 의도된 판정 변경 전까지 재채록하지 않는다.
- 병과 profile과 편제 메타데이터를 추가한 직후에는 기존 unitType 전투 결과가 변하지 않아야 한다.
- Phase 1 완료 시 `test:combat`, 신규 profile/편제/selector 테스트, build를 필수 실행한다.
- 전체 `test:game`은 위 ambient-audio 1건 외 신규 실패가 없어야 한다.
