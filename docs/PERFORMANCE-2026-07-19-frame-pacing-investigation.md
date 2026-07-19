# 프레임 페이싱 조사 — 플레이테스트 6번

## 결론

초기 정착지의 10배속 끊김은 simulation tick보다 `App` React 트리 전체 재렌더가 주된 병목이다.
프로덕션 표본에서 React render→layout commit은 평균 110.5ms였고, Long Animation Frame의
`MessagePort.onmessage` 구간과 시작 시각·소요 시간이 거의 일치했다. 같은 표본의 simulation tick은
최대 28.3ms, 주 캔버스 draw는 최대 60.4ms였다.

첫 단계에서는 원인 측정까지만 수행해 결과 없이 cache·memo·lazy loading을 추가하지 않는다는
플레이테스트 메모의 순서를 지켰다. 아래의 첫 최적화 slice는 이 측정 결과를 확인한 뒤 적용했다.

## 추가한 계측

계측은 기본 비활성이며 `?perf=1`인 로컬 실행에서만 시작/종료 UI가 나타난다.
`?perf=1&perfMs=2500`처럼 `perfMs`를 지정하면 DOM 스냅샷이 표본에 끼지 않도록 정해진 시간 뒤
자동 종료한다. 개발 콘솔에서는 `window.__game.perf.start()`, `stop()`, `snapshot()`도 사용할 수 있다.

하나의 `performance.now()` 시간축에 다음 표본을 기록한다.

- frame interval과 주 canvas draw
- simulation tick과 전체 game-loop 콜백
- React Profiler render/commit, App 트리 render→layout commit, passive effects
- minimap base/overlay draw
- 2ms 이상 pathfinding
- 브라우저 `longtask`, `long-animation-frame`과 script attribution
- 지원 브라우저의 GC entry, 미지원 시 1초 간격 JS heap 표본

이벤트 버퍼는 기본 20,000개로 제한한다. 일반 실행에서 probe가 없으면 표본을 만들지 않는다.

## CLI 기준선

`npm run measure:runtime` 결과다.

| 시나리오 | p50 | p95 | max/첫 tick | 해석 |
| --- | ---: | ---: | ---: | --- |
| cold-first-path, 12명/3건물 | 0.739–0.817ms | 10.525–14.260ms | 15.044–16.988ms | 초기 정착지 simulation은 프레임 예산 안팎 |
| stress, 120명/96건물 | 6.439–8.104ms | 40.384–45.772ms | 40.384–45.772ms | 큰 정착지에서는 주민 처리도 공동 병목 후보 |
| exploration helper path | 0.173–0.185ms | 0.395–0.806ms | 1.687–1.836ms | 단독 경로탐색은 이번 초기 표본의 주원인 아님 |

stress 표본의 `t1-agents` p95/max는 두 실행에서 37.815–42.718ms였다. 주민 수가 커지면 React 병목을 줄인 뒤에도
simulation 최적화가 추가로 필요할 수 있다.

## 브라우저 표본

조건은 프로덕션 Vite preview, 표준 난이도 새 게임, 12명/3건물, 화면을 정지시켜 초기 렌더를
가라앉힌 뒤 10배속 2.5초다. 종료 시점은 1년차 봄 3일 6서브틱이었다.

| 구간 | count | mean | p50 | p95 | max |
| --- | ---: | ---: | ---: | ---: | ---: |
| frame interval | 20 | 107.3ms | 104.2ms | 180.5ms | 180.5ms |
| long task | 20 | 105.2ms | 106.0ms | 136.0ms | 136.0ms |
| App tree render→layout commit | 18 | 110.5ms | 108.3ms | 136.5ms | 136.5ms |
| App tree passive effects | 18 | 6.4ms | 2.3ms | 56.1ms | 56.1ms |
| simulation tick | 22 | 4.8ms | 1.7ms | 17.0ms | 28.3ms |
| game-loop callback | 18 | 6.0ms | 2.1ms | 28.4ms | 28.4ms |
| main canvas draw | 22 | 6.3ms | 1.2ms | 53.5ms | 60.4ms |
| minimap base draw | 12 | 0.4ms | 0.4ms | 0.8ms | 0.8ms |

Long Animation Frame의 가장 긴 표본은 184.9ms였다. 그 안의 script attribution은 다음 세 구간이었다.

- simulation `setInterval`: 17.9ms
- React scheduler `MessagePort.onmessage`: 112.9ms
- canvas `requestAnimationFrame`: 53.6ms

React 트리 계측 136.5ms 표본은 같은 시각의 `MessagePort.onmessage` 136.5ms 표본과 정확히 겹쳤다.
따라서 평균 FPS가 아니라 틱마다 발생하는 전체 React 트리 commit이 frame pacing을 무너뜨린다는
가설이 직접 확인됐다.

브라우저는 `longtask`와 `long-animation-frame`은 지원했지만 GC PerformanceEntry는 지원하지 않았다.
이번 짧은 초기 정착지 표본에서 2ms 기준을 넘는 pathfinding은 반복적으로 나타나지 않았다.

## 첫 최적화 slice

ordinary simulation tick은 더 이상 `App` 전체 `bump()`를 호출하지 않는다. 캔버스는
`useSyncExternalStore` 기반 runtime version boundary를 통해 매 처리 tick을 받고, TopBar·로그·도크를
포함한 관리 UI는 1배속 250ms, 3배속 500ms, 10배속 1,000ms cadence로 갱신한다. 중요한 로그,
이벤트 선택지, 전술전, 장계, game over는 이 제한을 우회해 즉시 표시한다. 플레이어 입력에 의한
기존 `bump()`도 즉시 캔버스와 App을 함께 갱신한다.

동일한 production 조건에서 이벤트가 발생하지 않고 1년차 봄 3일 5서브틱까지 진행된 비교 표본은
다음과 같다.

| 지표 | 변경 전 | 변경 후 | 변화 |
| --- | ---: | ---: | ---: |
| frame interval p50 | 104.2ms | 34.7ms | -66.7% |
| frame interval p95 | 180.5ms | 62.5ms | -65.4% |
| frame interval mean | 107.3ms | 40.6ms | -62.1% |
| App tree commit count | 18 | 4 | -77.8% |
| long task count | 20 | 6 | -70.0% |
| canvas draw count | 22 | 55 | +150.0% |
| canvas draw p95 | 53.5ms | 4.3ms | -92.0% |

App tree commit 한 번의 비용은 여전히 119.6–144.5ms로 크지만, 발생 빈도를 낮추면서 캔버스가
목표 30fps에 가까운 34.7ms 중앙값으로 다시 진행했다. 별도 표본에서 이주 이벤트가 발생했을 때
`pendingChoice` 모달이 즉시 표시되어 throttle 예외도 확인했다.

## 두 번째 snapshot 경계 slice

첫 slice의 속도별 cadence는 유지하되, scheduled refresh가 더 이상 `setVersion`으로 `App` 전체를
commit하지 않도록 캔버스용 store와 관리 UI용 store를 분리했다. 일반 tick은 캔버스 store를 매번
발행하고 관리 UI store를 cadence에 맞춰 발행한다. `App` state write는 플레이어 입력과 중요한 로그,
이벤트 선택지, 전술전, 장계, game over 같은 차단 상태에만 남겼다.

관리 UI store의 구독 경계는 다음처럼 나눴다.

- TopBar, 통합 로그, 알림, 건설 서랍, 선택 정보
- 현재 열린 도크 콘텐츠 각각. `DockFrame`이 닫힌 항목을 먼저 거르므로 닫힌 창의 구독 경계는 mount되지 않는다.
- 날씨 앰비언트, 로그·전투 효과음, 전술전 자동 일시정지를 담당하는 DOM 없는 runtime effect 경계

미니맵은 관리 UI cadence가 아니라 캔버스 store를 계속 구독한다. TopBar, 로그, 도크, 미니맵에는
별도 Profiler id를 두어 이후 열린 창별 비용을 같은 타임라인에서 구분할 수 있게 했다.

프로덕션 preview, 표준 새 게임 12명/3건물, 관리 창을 닫은 10배속 2.5초 표본 결과다. 측정 시작 직후
배속 버튼을 누르는 조건이므로 남은 `App` commit 1회는 해당 입력의 즉시 반영이다. scheduled management
refresh가 만든 `App` commit은 없었다.

| 지표 | 첫 slice | snapshot 경계 분리 후 | 변화 |
| --- | ---: | ---: | ---: |
| frame interval p50 | 34.7ms | 34.7ms | 유지 |
| frame interval p95 | 62.5ms | 34.8ms | -44.3% |
| frame interval mean | 40.6ms | 35.3ms | -13.1% |
| App tree commit count | 4 | 1 | -75.0% |
| App tree commit max | 144.5ms | 60.0ms | -58.5% |
| long task count | 6 | 1 | -83.3% |
| canvas draw count | 55 | 66 | +20.0% |
| simulation tick max | 28.3ms | 10.4ms | 표본 내 감소 |

frame p50은 이미 30fps 목표에 도달해 그대로였고, p95가 34.8ms로 내려가 정상 프레임 주변에
모였다. 직업 창을 연 추가 표본은 고정 시드의 이주 이벤트가 자동 진행을 중단해 비교에서 제외했다.
열린 창만 구독한다는 조건은 구조 테스트로 고정했으며, 열린 패널별 실측은 이벤트가 없는 재현 시나리오를
마련한 뒤 수행한다.

검증은 production build, 전체 109개 game test, CLI runtime measurement를 통과했다.

## 남은 최적화 우선순위

1. 이벤트가 없는 재현 시나리오에서 주민·직업 등 열린 도크 패널별 비용을 측정한다.
2. 경계별 측정으로 이득이 확인되는 컴포넌트에만 memo를 적용한다.
3. 120명 stress 표본을 브라우저에서도 재현해 `t1-agents`를 재평가한다.
4. 주 canvas의 드문 60ms대 표본을 terrain cache 재생성 시점과 함께 재측정한다.
