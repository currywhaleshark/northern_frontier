# 하루 생활 사이클 구현 계획 — Codex/Fable 오케스트레이션

- 작성일: 2026-07-23 (Fable 초안, 2026-07-24 Codex 협의 반영)
- 설계 원전: `docs/DESIGN-2026-07-23-daily-cycle.md`
- 체제 선례: `docs/superpowers/plans/2026-07-19-tactical-combat-expansion-phase-2.md`의 분업·계약 원칙 계승

## 0. 범위

| 단계 | 내용 | 포함 여부 |
|---|---|---|
| 1 | 골격: 서브틱 12 확장, 대역 정의, 귀가·취침 | **포함** |
| 2 | 저녁 여가: 마실 행동 (주막은 훅만 — 미실장) | **포함** |
| 3 | 파수꾼 야간 근무, 야습 소집 지연 | **보류** — 야간 판정은 기존 전투 사전준비(횃불 경계 유무)가 담당 중. 중복 설계 방지 위해 전면 보류 |
| 4 | 계절별 낮 길이 시각화 (수치 불변) | **포함** |

법도(야금령)·주막 연동은 각 시스템 미실장이므로 이번 작업에서는 **훅 자리만** 만든다.

## 1. 분업 원칙과 파일 소유권

전투확장 2단계 체제 계승: **계약 우선, 소유권 침범 금지, 계약 누락은 재계산 대신 상대에게 요청.**

| 영역 | 소유 | 이번 작업의 해당 파일 |
|---|---|---|
| 시뮬레이션·상태·저장 | **Codex** | `src/game/agents.ts`, `simulation.ts`, `config.ts`, `types.ts`, `saveLoad.ts`, `saveSchema.ts`, (신규) `src/game/dayCycle.ts` |
| 게임 로직 테스트 | **Codex** | `tools/game/test_daily_cycle.mjs`, 기존 장기 시뮬 회귀 |
| 스프라이트·아틀라스·에셋 생성 | **Codex** | `src/render/atlas.ts`, `residentCommonLocomotionAssets.ts`, `tools/render/**`, `public/assets/**` |
| **렌더러 그리기 로직** | **Fable** | `src/render/renderer.ts` (drawDayNight, 주민 드로잉 분기) — 단 아틀라스 참조 구조는 Codex 계약을 따름 |
| UI 컴포넌트·CSS | **Fable** | `src/components/**` (HUD 시간대 표시, 주민 정보 패널) |
| 사운드 | **Fable** | `src/sound/sfx.ts` (밤 환경음 — 선택) |

주의: `src/render/`는 이번 작업에서 양측이 모두 만진다. 경계는 "**그리기 함수 = Fable, 에셋·아틀라스 정의 = Codex**".
`codex/resident-woodcutting-sprite` 브랜치의 `atlas.ts` 변경은 2026-07-24 `main`에 선행 병합했다.
본 작업은 해당 병합 커밋에서 분기한 `codex/daily-cycle-v1`에서 진행한다 (협의 항목 §7-1).

## 2. 계약 (M0 — Codex가 먼저 커밋, 이후 병렬 작업)

Codex가 아래 시그니처를 확정·커밋하면 Fable은 이를 소비만 한다. 변경 필요 시 재협의.

```ts
// types.ts
export type DayBand = 'dawn' | 'work' | 'evening' | 'night';
export type AgentPhase =
  | 'rest' | 'toWork' | 'working' | 'toDeposit'   // 기존
  | 'toLeisure' | 'leisure'                        // 저녁
  | 'toHome' | 'sleeping';                         // 밤

// dayCycle.ts (신규 — 대역의 단일 진실)
export const DAY_CYCLE_SUBTICKS = 12;              // target spec. 런타임 SUBTICKS는 M1-BE에서 전환
export const DAY_BANDS: Readonly<Record<DayBand, { start: number; end: number }>>;
// 확정: dawn 0–0 / work 1–8 / evening 9–9 / night 10–11
export function dayBandOf(subTick: number): DayBand;  // 범위 밖 throw. 저장값 정리는 normalize helper 별도
export function isIndoors(state: GameState, r: Resident): boolean;
// 비표시 판정 확정: sleeping은 집 도착 후, leisure는 당집·암자(향후 주막) 재실 시만.
// toHome/toLeisure 이동 중·장터·중심지 여가는 표시. 내부 필드 표현은 Codex 재량
```

계약 성립 조건:

- **노동 대역은 정확히 8서브틱** — 일일 생산량 불변의 구조적 보장 (설계 원전 §2-1)
- `r.task` 라벨 문자열은 백엔드가 소유 ("잠자리에 듦", "마실 나감" 등 — 기존 문법)
- `r.px/py` 보간 계약은 현행 유지 (서브틱당 직전 위치 기록)
- 렌더러의 `dayFrac` 계산식은 Fable이 소유하되, **자정 = night 대역 중앙**으로 정렬

## 3. 마일스톤

### M0 — 계약 커밋 (Codex, 소규모)

- §2의 타입·상수·헬퍼를 동작 변경 없이 커밋 (SUBTICKS는 아직 8 유지, 대역 정의만 존재)
- Fable은 이 시점부터 HUD·렌더러 작업을 병렬 착수 가능

### M1 — 골격: 서브틱 12 + 귀가·취침

| 담당 | 작업 |
|---|---|
| Codex | SUBTICKS 8→12, agentsTick 대역 분기 (dawn: 기상·출근 / night: 귀가·취침), 취침 중 이동·작업 계산 스킵, 온기 회복의 취침 귀속 (총량 불변), 저장 마이그레이션 (구버전 subTick 0–7 → 노동 대역 1–8 매핑), `test_daily_cycle.mjs` (생산 총량 불변·phase 전이) |
| Fable | `dayFrac` 곡선을 새 대역에 정렬 (한낮 = 노동 중반), `sleeping`+`isIndoors` 주민 비표시, HUD 시간대 표시 (해·달 아이콘 + 대역명), 주민 패널에 현재 대역 표기 |
| 공동 | **성능 게이트** (§5) 통과 확인 |

완료 정의: 1배속에서 주민이 밤에 귀가·소등 시간대에 실내 취침, 기존 장기 시뮬 회귀에서 연 단위 지표 오차 허용치 내, 성능 게이트 통과.

### M2 — 저녁 여가

| 담당 | 작업 |
|---|---|
| Codex | evening 대역: 마실 목적지 선정 (당집·암자 > 장터 > 중심지 앞), 목적지별 소규모 군집 (한 지점 쏠림 방지), 환자·격리자·젖먹이 예외, 주막 훅 (`leisureDestinations()`에 건물 타입 확장점만) |
| Codex (에셋) | **선택**: 여가 자세 스프라이트 (앉아 쉬기·담소). M2 초기엔 기존 idle 아틀라스 재사용으로 출시, 자세 스프라이트는 후속 폴리시 |
| Fable | leisure 주민 드로잉 (idle 재사용 + 소그룹 배치 시 겹침 최소화), 저녁 환경음 (선택 — sfx.ts) |

완료 정의: 저녁 대역에 주민들이 마실 지점으로 모였다가 밤에 흩어져 귀가. 여가는 순수 표현 계층 — 자원 소비·생산 수치 변화 없음을 테스트로 보증.

### M3 — 계절별 낮 길이 시각화 (Fable 단독)

- `drawDayNight`의 밤 어둠 곡선을 계절 파라미터화 (겨울: 어둠 구간 확장, 여름: 축소)
- **에이전트 대역은 불변** — 수치·행동 변화 없음 (이중 페널티 금지 원칙). Codex 작업 없음
- 완료 정의: 겨울 1배속에서 노동 대역 후반이 이미 어둑해 보임. 스크린샷 QA

## 4. 스프라이트·에셋 소요 (Codex 생성 담당)

| 항목 | 필요 시점 | 판정 |
|---|---|---|
| 취침 스프라이트 | — | **불필요** (실내 = 비표시, 창문 불빛이 기존에 있음) |
| 여가 자세 (앉기·담소) | M2 후속 | 선택 — 초기엔 idle 재사용 |
| 등불 든 귀가 오버레이 | — | 선택 — 밤 색조가 이미 있어 우선순위 낮음 |
| HUD 해·달 아이콘 | M1 | Fable이 기존 UI 아이콘 문법으로 자체 해결 시도, 품질 미달 시 Codex에 생성 요청 |

**이번 작업은 원칙적으로 신규 에셋 0으로 출시 가능**하도록 설계했다. 에셋은 전부 폴리시 항목.

## 5. 성능 게이트 (M1 통과 조건, 공동)

- 기준 세이브: 주민 100+ 대규모 정착지 (기존 QA 세이브 재사용)
- 착수 전 Codex가 베이스라인 계측: `__renderPerf` t1-agents 평균 ms/서브틱 × 8 = ms/일
- 통과 조건 (협의 확정):
  - t1-agents **ms/일 증가 ≤ +25%** (서브틱 +50%이나 취침 2서브틱은 스킵이므로 달성 가능 판단)
  - 10배속 프레임 p95 저하 없음 (Fable이 프레임 페이싱 측정 — 선례: PERFORMANCE-2026-07-19)
- 미달 시 대응 순서: 취침·여가 대역의 경로 탐색 캐시 → 대역 축소(12→10) 재협의

## 6. 브랜치·조율 (협의 확정)

- 통합 브랜치: `codex/daily-cycle-v1` / Fable 작업: `fable/daily-cycle-frontend`
- 칸반: Hermes 보드 `northern-daily-cycle` 신설 (또는 기존 보드에 레인 추가 — Codex 선호 따름)
- 흐름: M0 계약 커밋 → M1 양측 병렬 → 통합·성능 게이트 → M2 → M3(Fable 단독) → 최종 감사
- 최종 통합 감사는 전례대로 추론 수준 xhigh, 나머지 high

## 7. 협의 결과 (2026-07-24 확정 — 칸반 t_3b309722)

1. **선행 브랜치**: `resident-woodcutting-sprite` 정리·main 병합 → 갱신된 main에서 `codex/daily-cycle-v1` 분기.
   완료 신호는 M0 태스크(t_ae504d8b) 댓글 + push된 브랜치 (git이 진실).
   Fable은 M0 커밋이 올라간 `codex/daily-cycle-v1`에서 `fable/daily-cycle-frontend` 분기
2. **SUBTICKS**: 12 확정 (dawn1/work8/evening1/night2), 10은 성능 게이트 실패 시에만 재협의.
   M0은 target spec(`DAY_CYCLE_SUBTICKS`)+타입+헬퍼만, 런타임 전환은 M1-BE
3. **마이그레이션**: 구버전 subTick 0–7 → +1 매핑 (비정수·범위 밖은 정수화 후 clamp).
   주민 phase/path/carry 보존, 첫 M1 틱에서 대역 불일치만 정리 (전원 resetAgent 금지 —
   운반 짐 즉시 귀속으로 저장 직후 상태가 바뀌는 것 회피)
4. **성능 게이트**: agents ms/day 합계 비교 +25% 상한. 프레임: 120명/96건물 고정 시드,
   production 10배속 2.5초 ×3회, 중앙 run p95 +5% 이내 (측정: 백엔드 Codex / 프레임 Fable,
   방법론 PERFORMANCE-2026-07-19)
5. **여가 목적지**: 당집·암자 > 장터 > 중심지. cluster당 4명, resident id+day 결정적 분산,
   slot 소진 시 다음 우선순위로 spill. 당집·암자는 종교·직업 무관 전 주민 이용 가능
6. **isIndoors**: 이번 범위는 취침·실내 여가 한정 (가공직 확대 없음). 판정 세부는 §2 계약 주석 참조.
   `dayBandOf`는 범위 밖 throw, 저장값 정리는 normalize helper 분리

## 7.5 M4 튜닝 라운드 (2026-07-24 테스트플레이 피드백, 사용자 확정)

1~4단계 완료 후 테스트플레이에서 "하루가 너무 짧아 생활 사이클이 휘리릭 지나간다,
퇴근 때 뛰어들어온다"는 피드백. 사용자 확정 결정:

- **msPerDay ×6**: {1: 48000, 3: 16000, 10: 4800} — 전 배속 비례
- **(2차 수정) 이동 속도 유지 + 하루 밀도 상승**: 슬로모션(×6 비례 서브틱 연장) 대신
  주민 체감 속도를 현재와 동일하게 유지 → 하루당 이동량·왕복 ~4.5배.
  **A′ 확정**: SUBTICKS 72, 대역 dawn 0–8 / work 9–44 / evening 45–57 / night 58–71.
  기존 실시간 서브틱 간격과 이동·workTimer cadence를 유지하고, 경제·숙련·농사·건설의
  per-work-tick delta는 기본 8/36(2/9)로 정규화
- **밸런스 유의**: 이동 비중 감소로 원거리 직업 실효 산출 상승 방향 — 밀도 상승은 의도된
  변화이므로 완전 복원이 아니라 과도한 인플레만 장기 시뮬 계측 후 보정
- **성능 게이트 기준 전환**: ms/day → "10배속 실시간 1초당 agents ms +25% 이내" (하루가
  6배 길어져 ms/day 지표 의미 상실)
- **퇴근 시차**: 귀가·마실 출발을 id 해시로 대역 내 분산 (동시 러시 제거)
- 칸반: M4-BE t_151b48b2 (Codex) → M4-FE t_be886f2f (Fable — 채택안에 따라 범위 확정)

## 7.6 M5 생활 리듬 보정 (2026-07-24 테스트플레이 피드백, 사용자 확정)

- **아침채비**: 출발 전에는 집(노숙자는 중심지) 반경 2칸에서 생산·소비 없는 짧은 이동.
- **거리 기반 출근**: 주거지–일터 목표점의 예상 이동 틱을 노동 대역 시작에서 역산한다.
  먼 주민부터 출발하고 같은 거리 주민은 resident id+day로 0~1틱 분산한다. 새벽에 도착해도
  노동 대역 전에는 생산하지 않는다.
- **작업 마감**: 저녁 대역 진입 뒤 새 작업을 시작하지 않는다. 벌목·사냥·채집·채광·어업은
  이미 시작한 workTimer 1회분만 완료하고, 운반꾼은 현재 운반 건만 전달한 뒤 떠난다.
- **즉시 중단**: 건설·수리와 농사·가공·진료 등 틱 단위 완결 작업은 저녁 시작과 함께 멈춘다.
  공사 progress는 그대로 보존하며, 밤 대역에서는 모든 생활 작업보다 귀가를 우선한다.
- 칸반: M5-BE t_4b4e6c32 (Codex)

## 8. 리스크 요약

| 리스크 | 완화 |
|---|---|
| 성능 (72서브틱) | 취침 스킵 + 10배속 실시간 agents ms/s +25% 게이트 |
| 밸런스 회귀 | per-work-tick 2/9 정규화 + 마감 1회분 상한 + 후속 장기 시뮬 |
| atlas.ts 충돌 | 선행 브랜치 병합 후 착수 (§7-1) |
| 저장 호환 | schema v36 12→72 대역 상대 위치 매핑 + phase/path/carry 보존 |
| 소유권 중첩 (src/render) | "그리기 = Fable / 에셋 = Codex" 경계를 본 문서로 명문화 |
