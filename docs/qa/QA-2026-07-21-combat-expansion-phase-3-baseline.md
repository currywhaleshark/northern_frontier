# 전투 확장 3단계 Phase 0 기준선

> 기록일: 2026-07-21
> 기준 커밋: `1f1f5bf` (`codex/combat-expansion-phase-3` 시작점)
> 범위: 우회로 정식 전장 편입 전 회귀 기준선

## 자동 검사

- `node tools/game/test_tactical_routes.mjs` — 통과
- `node tools/game/test_tactical_deployment.mjs` — 통과
- `node tools/game/test_tactical_stage_orders.mjs` — 통과
- `node tools/game/test_tactical_battle.mjs` — 통과
- `node tools/game/test_resource_save_migration.mjs` — 통과
- `node tools/game/test_tactical_components.mjs` — 통과
- `node tools/game/test_tactical_background_assets.mjs` — 통과
- `npm run build` — 통과

`npm run check`는 개별 실패 없이 180초 실행 제한을 넘어 종료되었다. 이 저장소의 전체 게임 테스트는
각 파일을 순차 실행하므로, 이번 단계에서는 위 우회로 관련 핵심 테스트를 개별 실행해 기준선을 고정했다.

## 고정 시드 전투 측정

`node tools/game/test_tactical_battle.mjs`:

```json
{"footLosses":21,"mountedLosses":15,"footEnemyShare":26.486125453174214,"mountedEnemyShare":18.018601668186605}
```

## 우회로 차단 밸런스

`node tools/game/measure_tactical_route_balance.mjs`, 병과별 40시드:

| 차단대 | 유지율 | 돌파율 | 평균 아군 손실 | 평균 적 손실 |
|---|---:|---:|---:|---:|
| 창 | 97.5% | 0% | 0.175 | 0.45 |
| 활 | 97.5% | 0% | 0.25 | 0.375 |
| 조총 | 100% | 0% | 0.25 | 0.4 |

## 변경 금지 기준

- 우회로 전용 교전은 `battle.zones`의 pressure를 바꾸지 않는다.
- 출구 도착 전에는 loot를 만들지 않는다.
- 숨은 우회 부대는 실제 그룹 ID와 진행 위치를 UI selector에 노출하지 않는다.
- 기존 자동배치는 정면 zone/line 결과를 유지한다.
- 차단 붕괴 직후 승자는 같은 라운드에 후방으로 순간 진입하지 않는다.
