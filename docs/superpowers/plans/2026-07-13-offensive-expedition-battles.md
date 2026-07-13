# 공격전 계획: 토벌대 소집·원정·산채 토벌·맹수 사냥 (토벌 원정 시스템)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 지금까지의 전술 전투는 전부 방어전이다. 마적 산채 토벌과 호랑이·늑대 사냥을 **공격전**으로 승격한다: 메인 화면에서 주민을 개별로 움직이는 대신 **토벌대 소집**으로 수비병·사냥꾼 등을 몇 명 데려갈지 정해 하나의 부대로 묶고, 지도 위에서 목표 지점까지 이동한 뒤 공격전을 개시한다. 방어전과 마찬가지로 **자동 전투와 직접 지휘 둘 다** 지원한다. 산채 토벌(공성 양상)과 맹수 사냥(몰이 양상)은 서로 다른 구조로 만든다.

**Architecture:** 기존 자산을 최대한 재활용한다.
- 무기 배분: 현재의 직업·재고 기반 자동 배분을 주민별 명시 배분으로 승격한다. `residentId → weapon` 배정표를 방어도·원정대 예상 전력·자동 전투·직접 지휘가 함께 쓰는 단일 진실 공급원으로 삼고, 기존 자동 배분은 플레이어가 누를 수 있는 편의 기능으로 남긴다.
- 지도 이동·집결: `src/game/battles.ts`의 muster→clash 패턴과 `drawMusterFlag`/`drawBattleClash`/`battleScars`(renderer.ts) 재사용.
- 전술 화면: `TacticalBattleScreen.tsx`의 이벤트 재생 파이프라인(`TacticalAnimationEvent` 큐, 스팅어, 배속, 자막, FX 레이어)은 그대로 쓴다. 구역(zone)의 이름·설명·배경은 이미 데이터 주도이므로 공격전용 구역 세트만 새로 정의하면 된다.
- 자동 전투: 기존 즉석 판정(`raidBanditLair` in siteDiplomacy.ts, `resolveWildlifeHunt` in specialEvents.ts)을 **원정대 구성원 기준**으로 재산정해 재사용한다 — 보상/페널티 적용 코드는 자동·직접 지휘가 공유한다.
- 전투 시뮬레이션 모드(`battleSimulation.ts`)에 공격전 모드를 추가해 밸런스 실측 루프를 확보한다.

**현재 코드의 출발점 (2026-07-13):**
- `militiaWeaponAllocation`: 살아 있는 수비병 전원에게 조총→각궁→창→비무장 순으로 자동 배분한다. 파수꾼·사냥꾼은 실제 무기 소유자로 기록되지 않으므로, 원정 인원이 무엇을 들고 나가고 마을에 무엇이 남는지 일관되게 계산할 수 없다.
- `raidBanditLair`: 마을 전체 fieldTeam 기준 성공률 한 방 판정. 성공 시 산채 burned + 고정 노획, 실패 시 1명 중상 + fortified.
- `resolveWildlifeHunt`: `weaponReadiness`(마을 전체) 기준 한 방 판정. 늑대/호랑이/멧돼지 기본 성공률·실패 피해가 다름. 호랑이 실패는 사망 확률 존재.
- 맹수 위협은 `state.incidents.predatorThreats[kind]`(위치 없음). 원정 목표 지점이 되려면 지도 앵커가 필요 — 서식지(`state.habitats`) 또는 사건 발생 지점을 쓴다.
- `computeDefense`는 주민의 지도 위치와 무관하게 직업 수로 계산한다 — 원정 중 병력 공백을 반영하려면 제외 처리가 필요.

---

## Phase A: 토벌대 공통 파이프라인 (소집 → 이동 → 개전 선택 → 귀환)

### Task A0: 주민별 무기 배분과 병기고 UI

원정대 편성보다 먼저 구현한다. 누가 어떤 무기를 들고 있는지가 정해져야 출정 전력과 출정 후 마을 방어도를 같은 규칙으로 계산할 수 있다.

**Files:**
- Modify: `src/game/types.ts`
- Create: `src/game/weapons.ts`
- Modify: `src/game/buildings.ts`
- Modify: `src/game/tacticalBattle.ts`
- Modify: `src/game/siteDiplomacy.ts`
- Modify: `src/game/specialEvents.ts`
- Create: `src/components/WeaponAllocationDialog.tsx`
- Modify: `src/components/InspectorPanel.tsx` 또는 병기고/수비대 관리 진입점
- Modify: `src/App.tsx`
- Modify: `src/styles/global.css`
- Modify: `src/game/saveLoad.ts`
- Modify: `tools/game/test_tactical_battle.mjs`
- Modify: `tools/game/test_resource_save_migration.mjs`
- Create: `tools/game/test_weapon_assignments.mjs`

- [x] `CombatWeaponId = 'musket' | 'hornBow' | 'spear'`, 희소 배정표 `GameState.weaponAssignments`, `weaponAllocationMode: 'auto' | 'manual'`을 추가한다. 키는 주민 id이며 값이 없으면 비무장이다.
- [x] 수비병·파수꾼·사냥꾼에게 무기를 배정할 수 있다. 보유 수량을 넘는 배정은 금지하고, 사망·직업 변경·주민 이탈·재고 감소로 무효가 된 배정은 주민 id 우선순위로 결정적으로 정리한다.
- [x] 병기고 UI에서 주민별 수동 배정, 무기 해제, 기존 우선순위 기반 `자동 배분`, `모두 해제`를 제공한다. 직업·현재 임무·건강·무기별 방어 기여와 전체 방어도를 함께 보여준다. 원정 전력·출정 후 방어도 비교는 A2 편성창에서 같은 계산 함수를 연결한다.
- [x] 조총은 화약이 없어도 배정 자체는 유지한다. 다만 방어도·자동 전투·직접 지휘에서는 탄약 부족 상태를 표시하고 조총 화력 보너스를 적용하지 않는다.
- [x] `militiaWeaponAllocation`은 실제 배정표를 집계하도록 전환한다. `weaponCountsForResidents`가 임의의 주민 집합을 받아 마을 잔류군과 원정대를 같은 규칙으로 계산할 수 있다.
- [x] `computeDefense`, 산채·맹수 자동 판정, 전술 조 편성이 실제 주민별 배정을 사용한다. 원정 참여자 제외 연결은 A1의 `memberIds`가 생길 때 같은 주민 집합 계산으로 적용한다.
- [x] 구버전 저장에는 기존 규칙으로 최초 자동 배분한 뒤 `weaponAssignments`를 저장한다. 신규 게임도 자동 모드로 시작하며, 플레이어가 직접 변경하면 수동 모드로 고정된다.
- [x] 회귀 테스트: 중복 배정 금지, 재고 상한, 화약 부족 시 배정 유지, 사망/직업 변경 정리, 결정적 재고 축소, 구버전 저장 마이그레이션을 검증한다. 원정자 제외는 A1 통합 테스트에서 검증한다.

### Task A1: Expedition 상태 모델

**Files:**
- Modify: `src/game/types.ts`
- Create: `src/game/expedition.ts`
- Modify: `src/game/agents.ts`
- Modify: `src/game/buildings.ts`
- Modify: `src/game/raids.ts`
- Modify: `src/game/residents.ts`
- Modify: `src/game/simulation.ts` (newGame 초기값, 틱 진행 연결)
- Modify: `src/game/saveLoad.ts` (마이그레이션: 없으면 null)
- Create: `tools/game/test_expedition.mjs`

- [x] `GameState.expedition: Expedition | null` 추가 (동시에 1개만). 원정대 귀환을 기다리는 습격은 `raidHold`로 별도 보존한다.
- [x] Expedition 모델:
  ```ts
  interface Expedition {
    kind: 'lairAssault' | 'predatorHunt';
    targetSiteId?: number;        // lairAssault: ForeignSite id
    predatorKind?: PredatorKind;  // predatorHunt: wolf | tiger
    targetX: number; targetY: number;
    phase: 'muster' | 'march' | 'engage' | 'return';
    memberIds: number[];          // 참여 주민
    x: number; y: number; px: number; py: number; path: {x,y}[]; // 부대 단일 이동체
    speed: number;                // 겨울·악천후 페널티 반영
    ticks: number;
    carriedLoot?: Partial<Record<ResourceId, number>>; // 귀환 연출용 (적용은 전투 종료 시점)
  }
  ```
- [x] 원정 참여자는 집결/출정/교전 대기/귀환 작업으로 표시하고 일반 에이전트 작업에서 제외한다. `expeditionTick`이 집결·단일 부대 행군·귀환을 전담하며, 일일 굶주림·추위 피해도 제외해 원정 중 사망/부상은 전투 결과에서만 발생하게 한다.
- [x] A0의 실제 무기 배정과 원정 참여자를 기준으로 `computeDefense`를 다시 계산한다 — 토벌대가 사람과 무기를 가져간 동안 마을 방어도가 실제로 낮아진다. 자동 습격·직접 지휘·산채·맹수 후보에서도 원정자를 제외한다.
- [x] 원정 중 습격(`openRaidChoice`)이 오면 자동 회군시키지 않고 **원정대 명령 → 마을 대응** 순서의 두 결정을 연다. 첫 결정 결과를 습격 문맥에 저장한 뒤 기존 `pendingChoice`를 닫고 두 번째 결정을 열어 선택지가 서로 덮어쓰이지 않는다. 원정이 없으면 기존 `openRaidChoice` 흐름을 그대로 쓴다.
  - 원정대 명령: **즉시 회군** / **원정 계속**. 즉시 회군은 현재 단계에서 목표 행동을 중단하고 `return`으로 전환하며, 실제로 마을에 도착하기 전에는 방어전에 참여하지 못한다. 원정 계속은 기존 목표·전투·귀환 일정을 유지한다.
  - 마을 대응 ① **원정대를 기다리지 않고 싸운다**: 현재 마을에 남은 주민과 무기만으로 기존 자동 전투/직접 지휘를 시작한다.
  - 마을 대응 ② **완전 수성으로 굳히고 원정대를 기다린다**: 주민을 방책 안으로 모으고 일반 작업을 중단한다. 제한된 수성 대기 시간 동안 방책 보너스를 받으며, 원정대가 제때 도착하면 잔류 수비대에 합류한다. 적의 공격 시한이 먼저 끝나면 원정대 없이 전투를 시작한다.
  - 마을 대응 ③ **협상한다**: 기존 공물·거래·관계 기반 협상 선택지를 그대로 제공한다. 협상 성공 여부와 무관하게 원정대는 앞에서 선택한 명령을 따른다. 협상 실패로 전투가 시작될 때 아직 귀환하지 않은 원정대는 참가하지 못한다.
- [x] 습격 결정 UI에 귀환 예상 시간, 8틱 공격 시한, 현재 잔류 방어도와 원정대 합류 시 방어도를 표시한다. `원정 계속 + 수성 대기` 조합도 허용한다.
- [x] 완전 수성 대기는 `raidHold` 상태와 공격 시한을 사용한다. 대기 중 생산·건설·채집을 멈추고 주민을 중심지로 모으며, 원정대 도착 또는 시한 만료 중 먼저 발생한 사건으로 참전 인원을 확정한다. 이후 자동/직접 민병 수성 중 하나를 선택한다.
- [ ] 공격전 직접 지휘 중 습격이 발생하면 현재 라운드/명령 처리를 끝낸 안전한 경계에서 일시 정지하고 습격 결정을 연다. 회군을 택하면 현재 원정 전투는 자진 철수 결과로 수렴한다. (B/C 공격전 전술 상태가 추가될 때 연결.)

### Task A2: 소집 UI (토벌대 편성)

**Files:**
- Create: `src/components/ExpeditionMusterDialog.tsx`
- Modify: `src/components/InspectorPanel.tsx` (산채 선택 시 '토벌대 소집' 버튼 — 기존 `onRaidBanditLair` 대체)
- Modify: `src/components/AlertsPanel.tsx` 또는 맹수 위협 알림 경로 (기존 `openPredatorHunt` 진입점 대체)
- Modify: `src/App.tsx` (핸들러 연결)
- Modify: `src/styles/global.css`

- [x] 편성 다이얼로그: 직업군별(수비병/파수꾼/사냥꾼) 가용 인원에서 **몇 명 데려갈지 수량 선택**. A0에서 정한 주민별 실제 무기를 보여주고, 이 화면에서도 출정 전까지 재배정할 수 있게 한다. 예상 전력·예상 성공률(자동 전투 기준)·**출정 후 마을 방어도와 잔류 무기**를 함께 표시해 트레이드오프를 보이게 한다.
- [x] 최소 인원(예: 2명) 미달, 이미 원정 중, 습격 대응 중이면 소집 불가 사유 표시.
- [x] 산채 토벌은 발견된(`discovered`) 산채만, 맹수 사냥은 활성 `predatorThreats`가 있을 때만 진입 가능. 맹수 목표 지점: 늑대 = 마을에서 가장 가까운 활성 서식지(`habitats`), 호랑이 = 최근 사건 발생 지점 또는 가장 깊은 숲 타일 (v1은 서식지 앵커로 단순화).
- [x] 소집 확정 → `expedition` 생성(phase 'muster'), 참여자들이 집결 지점(마을 어귀)으로 걸어온 뒤 'march'로 전환 — `battles.ts`의 muster 준비 판정(60% 도착 or 마감) 패턴 재사용.

### Task A3: 지도 이동·연출·개전 선택

**Files:**
- Modify: `src/game/expedition.ts`
- Modify: `src/render/renderer.ts`
- Modify: `src/render/sprites.ts` (부대 스프라이트 — 초기엔 `drawRaiders` 변형/아군 색으로 충분)
- Modify: `src/App.tsx`

- [x] march: 부대를 단일 이동체로 경로 이동(길찾기는 습격 무리와 동일 규칙). 겨울 발자국 trail, 집결 깃발(`drawMusterFlag` 재사용)을 마을 어귀에 표시.
- [x] 목표 도착 → phase 'engage' + `pendingChoice`(kind 'raid' 유사한 신규 kind 'expedition') 모달:
  - **자동 전투** — 즉석 판정(Task A4). 결과 로그 + 귀환.
  - **직접 지휘** — 공격전 전술 전투 개시(Phase B/C). A3에서는 진입 선택을 표시하되 B/C 엔진 구현 전까지 비활성화한다.
  - **철수** — 전투 없이 회군 (산채: alarm 상승만 / 맹수: 위협 유지).
- [x] 전투 종료 후 phase 'return': 부대가 마을로 회군(부상자가 있으면 speed 감소), 도착 시 expedition 해제 + 참여자 resetAgent. 노획물·위협 변화 등 **결과 적용은 전투 종료 즉시**(회군은 연출), 단 로그에 "토벌대가 돌아왔습니다" 귀환 로그를 남긴다.
- [x] 지도 연출: engage 중 목표 지점에 `drawBattleClash` 재사용(산채 위엔 화염 연기 추가 가능), 종료 후 `battleScars` 데칼. 산채 소각 성공 시 기존 burned 상태 렌더가 이미 있음.

### Task A4: 자동 전투를 원정대 기준으로 재산정

**Files:**
- Modify: `src/game/siteDiplomacy.ts` (`raidBanditLair` — 원정대 구성원 파라미터화)
- Modify: `src/game/specialEvents.ts` (`resolveWildlifeHunt` — 동일)
- Modify: `tools/game/test_battles.mjs` 또는 신규 테스트

- [x] 성공률 산식의 입력(fieldTeam/weaponReadiness)을 **원정대 memberIds 기준**으로 바꾼다 (기존 마을 전체 버전은 제거하거나 위임). 부상·사망 피해자도 원정대 안에서만 뽑는다.
- [x] 보상/페널티 적용부(산채 burned·loot·threat / 맹수 고기·가죽·호피·위협 해제)를 **직접 지휘 결과에서도 호출할 수 있게 함수로 분리**한다 — 자동과 직접 지휘가 같은 결과 코드로 수렴해야 밸런스가 갈라지지 않는다.
- [x] 회귀 테스트: 같은 구성일 때 원정대 기준 성공률이 기존 마을 전체 기준과 논리적으로 일관(부분 인원 → 더 낮음)한지, 화약 소모가 원정대 조총 수 기준인지.

---

## Phase B: 산채 토벌 — 공성 양상의 공격전

**설계 개요 (방어전과의 대칭/비대칭):**

산채 토벌은 방어전의 거울상이다. 이번엔 **플레이어가 압박을 올려 구역을 돌파**하고, 마적이 방어한다. 기존 엔진(`tacticalBattle.ts`)의 구역·압박·기세·이벤트 구조를 방향 플래그로 재사용하는 것을 권장 — 화면(`TacticalBattleScreen.tsx`)도 좌=적/우=아군 배치를 유지하면 재생 파이프라인 수정이 최소화된다.

**구역 구성 (4구역, 방어전과 동수):**

| 구역 | 성격 | 방어전 대응물 |
|---|---|---|
| 숲길 잠입로 | 접근. 정찰 여부에 따라 초병에게 발각/기습 | approach |
| 산채 목책 | 돌파 대상. 아군 압박을 올려 파괴 | wall (공수 반전) |
| 산채 마당 | 주력 백병전. 두목 친위대 | storehouse/center 중간 |
| 두목 움막·노획 창고 | 최종 목표: 두목 처치 + 노획 | center (공수 반전) |

**핵심 규칙:**
- 승리 조건 다층화 — ① **완전 소탕**(두목 움막 돌파 or 적 기세 붕괴): burned + 전체 노획 + 위협 대폭 감소. ② **창고 노획 후 이탈**(마당까지만 뚫고 철수): 노획 일부 + 산채는 fortified로 생존. ③ **격퇴당함**(아군 기세 붕괴): 사상 + 산채 fortified + 위협 상승. ④ **자진 철수**: 언제든 가능, 소모 최소·alarm만 상승.
- 마적 도주 메커니즘: 산채 기세가 낮아지면 두목이 노획물을 챙겨 도주 시도 → 잡으면 완전 소탕, 놓치면 산채는 abandoned(불태우지 못함, 보상 축소). 사전 준비 「퇴로 차단」으로 봉쇄 가능.
- 정찰 연동: `scoutedUntilDay`가 유효하면 적 조 구성이 처음부터 공개(revealed), 아니면 은닉 + 잠입로에서 초병 선제 사격 위험(방어전의 warned 반전).

### Task B1: 공격전 전술 엔진

**Files:**
- Modify: `src/game/types.ts` (`TacticalBattle.orientation?: 'defense' | 'assault'`, 산채용 zone kind, 마적 수비 유닛 타입)
- Modify: `src/game/tacticalBattle.ts` (또는 Create: `src/game/tacticalAssault.ts` — 공유 함수 추출 후 분리 권장)
- Modify: `src/game/saveLoad.ts`

- [x] 산채 전투 생성기: 원정대 memberIds → 수비대 그룹 생성 로직(`defenderGroups`) 재사용해 **아군 공격 그룹** 구성. 적은 산채 `militaryPower` 기반으로 초병/궁수/친위대/두목 조 생성 (방어전 `raiderGroups`의 세력별 편성 패턴 재사용).
- [x] 압박 방향 반전: 각 구역의 pressure를 **아군이 올린다**. 돌파(breach)는 아군의 진입. 기세는 「토벌대 기세 vs 산채 기세」.
- [x] 명령 세트 재사용 + 공격전 전용 추가: `hold/charge/volley/fallback/advance`는 그대로 의미가 통함. 추가 — **방화**(불화살: 목책·움막 압박 가속, 노획물 일부 소실 리스크), **퇴로 차단**(사냥꾼 분견 — 두목 도주 봉쇄, 해당 조는 본대 화력에서 빠짐).
- [x] 사전 준비(준비점수는 원정대 구성 — 사냥꾼 수·정찰 여부로 산정): 야습 대기(첫 교전 기습 보너스), 불화살 준비, 퇴로 매복, 유인(초병을 잠입로로 끌어냄).
- [x] 결과 적용은 Task A4에서 분리한 함수 호출로 수렴.

### Task B2: 공격전 화면·연출

**Files:**
- Modify: `src/components/TacticalBattleScreen.tsx`
- Modify: `src/render/tacticalBackgroundAssets.ts` (산채 구역 배경 — 초기엔 기존 wall/forest 배경 재사용 매핑, 신규 에셋은 선택)
- Modify: `src/styles/global.css`

- [x] 화면 라벨의 방향성 파라미터화: 헤더('산채 토벌 지휘'), 기세 보드(토벌대/산채), 방책 오브젝트(`tactical-barricade`)를 적측 연출로 재사용(아군이 부수는 대상).
- [x] 방화 연출: 기존 ruin-layer(연기·불씨)를 **아군이 지른 불**로 재사용 + 불화살 투사체(fx-arrow 변형, 불꽃 트레일).
- [x] 두목 도주 연출: moraleBreak 계열 이벤트로 두목 조가 화면 밖으로 빠져나감 + 퇴로 차단 성공 시 잠입로에서 매복 급습 이벤트 재생.

---

## Phase C: 맹수 사냥 — 몰이 양상의 공격전

**설계 개요 (산채와 완전히 다른 구조):**

맹수 사냥은 공성이 아니라 **몰이사냥**이다. 구역 돌파·압박 대신 **포위망 게이지**와 **짐승의 은닉/발각 상태**가 축이 된다. 짐승은 병력이 아니라 소수의 강력한 개체다.

**구역 구성 (3구역):**

| 구역 | 성격 |
|---|---|
| 자취 지대 | 추적 단계. 사냥꾼 기량·날씨(눈밭 자취 유리, 눈보라 불리)로 발각 판정 |
| 몰이 숲 | 몰이꾼이 짐승을 밀어붙이는 구역. 짐승의 반격·돌파 시도 |
| 막다른 굴·덤불 | 결착 지점. 포위망 완성 시 최종 교전 |

**핵심 규칙:**
- **포위망 게이지**(0~100): '몰이' 명령으로 올린다. 포위망이 낮으면 짐승은 교전 회피·재은닉이 가능하고, 교전 상한(5회) 안에 결착 못 내면 **도주**(위협 유지, 사상 없음 — 실패라기보다 소득 없음).
- **호랑이**: 단일 개체지만 `호랑이 → 대호 → 산군` 3단계. 뒤 등급일수록 체구·전력·기습 피해·포위 저항·보상이 커진다. 은닉↔발각을 오가며, 은닉 중엔 사격 불가, 매 교전 **한 조를 골라 급습**한다. '창벽'으로 급습 피해 경감, '사격 대기'로 발각 순간 일제 사격 보너스. 조총이 특효. 잡으면 호피(기존 보상 재사용).
- **늑대 떼**: 별도 품종 등급 없이 **실제 무리 수(3~12마리)**가 난이도다. 수가 많을수록 전력·동시 피해 가능성·포위 저항·보상이 증가한다. 우두머리는 가장 약한 조를 노리고, 우두머리를 잡으면 무리 기세가 급락해 궤주. 전멸(완전 보상)과 격퇴(위협만 해제, 보상 축소)를 구분.
- 준비 행동: 함정 설치(몰이 숲에 — 짐승 통과 시 피해), 미끼(고기 자원 소모 — 첫 발각 자동 성공), 몰이꾼 나누기(포위망 상승 가속, 나뉜 조는 급습에 취약).

### Task C1: 사냥 전투 엔진

**Files:**
- Modify: `src/game/types.ts` (짐승 유닛 모델 — 은닉/발각, 우두머리 플래그, 포위망 필드)
- Modify: `src/game/tacticalBattle.ts` 또는 신규 `src/game/tacticalHunt.ts`
- Modify: `src/game/saveLoad.ts`

- [x] 사냥 전투 생성기: 원정대 → 아군 조 구성(산채와 공유), 짐승 생성(호랑이 1 / 늑대 무리 + 우두머리). 짐승 전력은 기존 `predatorHuntChance` 밸런스와 정합하게 역산.
- [x] 포위망 게이지 + 은닉/발각 상태 기계, '몰이/창벽/사격 대기' 명령 (기존 명령 셋에서 hold=창벽 재해석, volley=사격 대기 등 최소 신설로).
- [x] 호랑이 급습(조 지정 집중 피해)·재은닉, 늑대의 약한 조 표적 선택·우두머리 처치 시 기세 붕괴.
- [x] 결착 종류: 사살(전체 보상) / 격퇴(늑대 한정, 위협 해제 + 보상 절반) / 도주(위협 유지) / 참패(아군 기세 붕괴 — 사상 후 강제 회군). 보상·위협 처리는 Task A4 분리 함수로 수렴.

### Task C2: 사냥 화면·연출

**Files:**
- Modify: `src/components/TacticalBattleScreen.tsx`
- Modify: `src/render/tacticalCharacterAssets.ts` (호랑이·대호·산군·늑대 전투 시트)
- Modify: `src/render/tacticalBackgroundAssets.ts` (숲·굴 배경 — 기존 approach 숲 배경 재사용 가능)
- Modify: `src/styles/global.css`

- [x] 포위망 게이지를 기세 보드 자리에 표시 (「포위망 n%」 + 짐승 상태: 은닉/발각/부상).
- [x] 은닉 연출: 짐승 스프라이트 대신 흔들리는 수풀/발자국 마커(기존 `?` 은닉 마커 변형). 발각 순간 스팅어성 플래시.
- [x] 호랑이 급습 연출: 화면 흔들림(wallHit 재사용) + 피습 조 falling 스프라이트 집중, 「급습!」 플로트.
- [x] 늑대 궤주 연출: moraleBreak 재사용 + 무리가 화면 밖으로 흩어짐.

### Task C3: 공격전 전용 4계절 배경

**Files:**
- Modify: `src/render/tacticalBackgroundAssets.ts`
- Modify: `src/components/TacticalBattleScreen.tsx`
- Add: `public/assets/tactical/offensive-backgrounds/*`

- [x] 산채 3구역 연속 배경: 숲길 접근 → 목책·성문 → 본채·노획물 구역.
- [x] 맹수토벌 3구역 연속 배경: 자취 지대 → 몰이 숲 → 막다른 굴·덤불.
- [x] 봄·여름·가을·겨울 4계절 변형. 계절마다 지형과 구조물 배치는 유지하고 식생·적설·지면만 변화.
- [x] 공격전 3구역은 같은 파노라마의 좌·중·우 구간을 확대해 전진할수록 배경도 이어지도록 표시.
- [x] 공격전은 토벌대가 왼쪽에서 오른쪽으로 전진하며, 양 진영 스프라이트와 전투 연출도 진행 방향에 맞게 반전.

---

## Phase D: 시뮬레이터·검증

### Task D1: 전투 시뮬레이션 모드에 공격전 추가

**Files:**
- Modify: `src/game/battleSimulation.ts`
- Modify: `src/components/BattleSimulationSetup.tsx`
- Modify: `src/App.tsx`
- Test: `tools/game/test_tactical_battle.mjs`

- [x] 시나리오 선택: 방어전(기존) / 산채 토벌 / 호랑이 사냥 / 늑대 사냥. 공격전은 원정대 구성(직업·수량)·산채 전력(militaryPower)·정찰 여부·날씨를 지정/랜덤으로.
- [x] 공격전도 종료 후 설정 화면 복귀·결과 미저장 동일 적용.

### Task D2: 검증

Run:

```bash
npm run build
node tools/game/test_tactical_battle.mjs
node tools/game/test_tactical_assault.mjs
node tools/game/test_tactical_hunt.mjs
node tools/game/test_battles.mjs
node tools/game/test_expedition.mjs
node tools/game/test_expedition_engagement.mjs
node tools/game/test_manual_orders.mjs
node tools/game/test_building_footprints.mjs
node tools/game/test_resource_save_migration.mjs
```

- [x] 신규 엔진 단위 테스트: (a) 산채 — 동일 원정대로 자동 전투 성공률과 직접 지휘 승률이 비슷한 구간에 있는지(±15%p), 퇴로 차단 시 두목 도주 실패, 방화 시 노획 감소. (b) 사냥 — 우두머리 처치 → 늑대 궤주, 포위망 미완성 5교전 → 도주(사상 없음), 호랑이 급습이 한 조 집중인지.
- [x] 파이프라인 실측: 소집 → 행군 → 개전 선택(자동/직접/철수 3경로) → 귀환까지 지도에서 확인. 원정 중 사람과 무기에 따른 마을 방어도 하락, 습격 발생 시 원정대 명령과 마을 대응의 순차 결정을 확인한다.
- [x] 원정 중 습격 분기 실측: `회군/계속 × 즉시 전투/완전 수성 대기/협상` 조합을 검증한다. 회군 예상 시간과 공격 시한 비교, 제때 귀환한 원정대의 합류, 미도착 시 잔류군만 참전, 협상 성공/실패 뒤 원정 명령 유지가 모두 일관되어야 한다.
- [x] 저장 호환: 원정 중 저장/로드, 구버전 저장(expedition 없음) 로드.
- [x] 시뮬레이터로 기준 시나리오 실측: 산채(militaryPower 60, 정찰 있음/없음), 호랑이(사냥꾼 4+조총 2), 늑대(혼성 6명) — 각각 「준비를 갖추면 유리하고 맨몸 강행은 참패 위험」이 체감되는지.

---

**우선순위:** A0 → A1 → A2 → A4의 공통 결과 함수·원정대 기준 산식 → A3 (파이프라인이 먼저 — 자동 전투만으로도 완결된 가치가 있다) → B1 → B2 (산채가 엔진 재사용률이 높아 먼저) → C1 → C2 (사냥은 신규 메커니즘이 많아 뒤에) → D1 → D2.

**의도적으로 미룬 것 (후속 계획):** 원정 보급(식량 소모)·다중 원정·정주 부락 공격(외교 대참사 경로)·조정 토벌군과의 야전·원정 중 랜덤 조우. v1은 「산채 하나, 맹수 하나를 부대로 때린다」에 집중한다.
