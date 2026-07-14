# 발효·보존 계획: 부패(채소·고기·생선)·움 저장고·훈제·염장·건조·장독대·김장

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. 해당 스킬이 세션에 없으면 일반 TDD 방식으로 진행한다. Steps use checkbox (`- [ ]`) 구문으로 추적한다.

**Goal:** 현재 가공 사슬은 전부 1차에서 끝나고, 부패가 없어 모든 식량이 무한 보존된다. **채소·고기·생선 3종에 부패를 도입**하고, 그 대응 수단을 계층으로 쌓는다: **움 저장고**(완화 — 부패를 늦춤) → **훈제·염장·건조**(보존 가공 — 부패하지 않는 보존식) → **장독대·김장**(발효 — 시간이 만드는 2·3차 가공). 겨울이 "버티는 계절"에서 "가을에 갈무리한 것을 꺼내 먹는 계절"로 바뀐다.

**확정된 설계 결정:**
- 부패 대상은 **채소·고기·생선 3종 전부**. 보존식(보존육·자반·건어물·김치·장)은 부패하지 않는다.
- 보존 수단 3종: **훈제**(고기+연료), **염장**(생선+소금), **건조**(생선, 무염·날씨 의존 — 소금 없이도 가능한 대체 경로).
- **움 저장고** 신설 — 식료품 전용 저장 건물은 현재 없음(창고는 범용). 자원이 전역 풀이므로 "보호 용량 모델"로 구현한다: 움 저장고 총 용량만큼의 생식품은 감속 부패, 초과분만 정상 부패.
- 황태 덕장은 **보류** — 어업이 강 기반이라 명태(바다 어물)가 성립하지 않는다. 바다 어업이 생기면 재검토.
- 술·젓갈·홍삼 등은 이 묶음이 자리 잡은 뒤 후속 계획.

**Architecture (재사용):**
- 신규 작물 콩은 `CropId` 유니언 + `crops.ts` 정의 추가(기존 7작물과 동일 파이프라인).
- 옹기가마·훈연막·건조덕장은 숯가마(charcoalKiln + 현장 재고 물류)의 구조 복제다. 옹기가마·건조덕장은 강가 배치(`placement: 'riverbank'` — 나루터 선례)로, 옹기가마는 점토를 현장 조달해 **점토 자원 신설을 회피**한다.
- 장독대의 숙성은 밭 `fieldGrowth`와 같은 "시간이 채우는 진행도" 모델 — 건물 배치(batch) 배열을 매일 진행한다.
- 김장은 기존 계절 사건 파이프라인(`pendingChoice`)으로 늦가을에 규모 선택지를 연다.
- 신규 자원 8종(소금·콩·옹기·장·김치·보존육·자반·건어물)은 `RESOURCE_DEFS.category`에 편입되고 `migrateResourceBag`이 가산적이라 저장 안전하다. **UI 계획 U1(자원바 전량 그룹화)이 선행 배포되어야 한다.**

**현재 코드의 출발점 (2026-07-15):**
- **부패 시스템이 없다.** 모든 식량이 무한 보존되므로 보존·발효 가공이 무의미하다. 부패 도입이 이 계획 전체의 초석이자 가장 신중해야 할 밸런스 변경이다.
- 식단: `FOOD_RESOURCES = [grain, meat, fish, vegetables]`, 채소 권장 몫 충족률 `vegetableRatio`(consumption.ts:74)가 0.5 미만이면 건강 페널티(residents.ts:358). 식단 다양성은 보유 식량 종류 수(presentTypes)로 가점된다.
- 작물 정의는 `crops.ts`(7종). 밭 작물 추가는 정형 작업.
- 교역: 세력·거점별 `tradeStock`과 `tradeBaseValue`. 소금 공급처 지정 필요.
- 건물 파이프라인: 정의(buildings.ts) + 워커 슬롯(workerSlots.ts) + 에이전트 틱(agents.ts) + 현장 재고(inventory.ts). 신규 건물은 이 4곳 등록으로 성립한다.
- 저장 건물은 범용 창고(storehouse)뿐 — 식료품 전용·부패 완화 건물은 없다.

**만들지 않는 것:**
- 건물별 식량 보관 배정(자원은 전역 풀 유지) — 움 저장고는 보호 용량으로만 작동한다.
- 곡물 부패 — 곡물·벼는 건조 곡물로 보존 안정이라는 설정을 유지한다(부패 대상을 넓히는 후속은 열어둠).
- 보존식의 원천×방법 전 조합 품목화 — 방법당 대표 품목 1종(보존육·자반·건어물)으로 고정해 품목 폭발을 막는다.
- 메주 자원화(장독대 배치 내부 상태), 장 종류 분리(된장·간장 → `jang` 1종), 김치 종류 구분.

---

## Phase K1: 부패·소금·움 저장고 — 초석과 완화 장치를 한 배포로

부패와 그 1차 완화 수단(움 저장고)은 **반드시 같은 Phase로 배포**한다. 완화 없는 부패는 처벌일 뿐이다.

### Task K1.1: 3종 부패

**Files:**
- Modify: `src/game/simulation.ts` 또는 `src/game/consumption.ts` (일일 부패 처리)
- Modify: `src/game/config.ts` (`CONFIG.spoilage` — 품목별 일일 부패율·계절 배율)
- Modify: `src/components/TopBar.tsx` 팝오버 (부패 중 표시)
- Create: `tools/game/test_spoilage.mjs`

- [ ] 채소·고기·생선에 일일 부패율을 적용한다. 기본 속도: **생선 > 고기 > 채소**(CONFIG). 계절 배율: 여름 가속, 겨울 혹한 감속(천연 저장고). 보존식·김치·장·곡물은 부패하지 않는다.
- [ ] 부패는 일일 틱에서만 진행한다(로드 시점 소급 없음 — 구버전 대량 비축 저장의 급증발 방지). 부패량은 자원 팝오버의 "부패 중" 표기로 알린다(로그 소음 방지).
- [ ] **밸런스 게이트**: 자동 플레이 시뮬레이션(기존 `simulate_trade_autoplay.mjs` 패턴)으로 도입 전후를 비교한다. 목표: 사냥·어획 직후의 잉여가 수일 내 소비·가공 압박을 만들되, 1~2년차 겨울이 즉사 난이도가 되지 않는다. **훈제·염장(K2) 배포 전까지 고기·생선 부패율은 보수적으로 시작**하고 K2에서 최종치로 올린다(단계적 조임).

### Task K1.2: 소금 — 교역 의존재

**Files:**
- Modify: `src/game/types.ts` (`ResourceId`에 `salt`), `src/game/resourceCatalog.ts` (material)
- Modify: `src/game/foreignSites.ts`·교역 재고 (어촌·조선 상단 계열 거점의 tradeStock에 소금 편성)
- Modify: `src/game/saveLoad.ts`, `tools/game/test_trades.mjs`

- [ ] 소금은 생산 불가·교역 전용(내륙 변경 고증). 공급처 복수화: 어촌(`fishingVillage`)·상단 계열 거점. 염장·김장·장의 공통 열쇠 자원이 된다 — 겨울 전 소금 확보가 연례 과제.
- [ ] 세공 요구 품목에는 넣지 않는다(플레이어가 생산할 수 없는 품목의 세공은 부당).

### Task K1.3: 움 저장고

**Files:**
- Modify: `src/game/types.ts` (`BuildingTypeId`에 `cellar`)
- Modify: `src/game/buildings.ts` (움 저장고 — 낮은 비용, 티어1, winterBonus 성격의 반대: 여름에 진가)
- Modify: `src/game/simulation.ts` (보호 용량 적용), `src/game/config.ts`
- Modify: `tools/game/test_spoilage.mjs`

- [ ] 움 저장고 1동당 보호 용량 N(CONFIG). 생식품 재고 중 총 보호 용량 이하분은 감속 부패(예: ×0.3), 초과분만 정상 부패. 품목별 적용 순서는 "부패 빠른 것 우선 보호"(생선→고기→채소)로 결정적이게.
- [ ] 건물 툴팁·하단 컨텍스트에 현재 보호량/총 생식품량을 표시해 부족을 읽을 수 있게 한다.

## Phase K2: 보존 가공 — 훈제·염장·건조

### Task K2.1: 갈무리꾼과 훈연막·건조덕장

**Files:**
- Modify: `src/game/types.ts` (`BuildingTypeId`에 `smokehouse`·`dryingRack`, `JobId`에 `curer`(갈무리꾼), `ResourceId`에 `curedMeat`(보존육)·`saltedFish`(자반)·`driedFish`(건어물))
- Modify: `src/game/buildings.ts` (훈연막: 일반 배치 / 건조덕장: 강가 배치), `src/game/workerSlots.ts`, `src/game/agents.ts` (`curerTick` — 숯가마 틱 구조 복제), `src/game/inventory.ts`
- Modify: `src/game/resourceCatalog.ts`, `src/game/saveLoad.ts`
- Create: `tools/game/test_preservation.mjs`

- [ ] 신규 직업 **갈무리꾼(curer)** 하나가 훈연막·건조덕장을 모두 맡는다(직업 폭발 방지).
- [ ] **훈연막**: 고기 + 연료(장작/숯) → 보존육. 안정적·연료 소모.
- [ ] **건조덕장**(강가): 생산 선택 2종 — **자반**(생선+소금, 안정·소금 소모) / **건어물**(생선만, 무염·느림·비 오면 정지 — 날씨 의존). 소금(교역) vs 시간(날씨)의 선택이 이 건물의 재미다. 생산 선택은 대장간 `smithyProduct` 패턴 재사용.
- [ ] 가공 비율 제어: 원물을 전부 가공해 버리지 않도록 기존 가공 한도(`processingReserves` — ProcessingPanel) 패턴에 고기·생선 원물 보존 한도를 추가한다.

### Task K2.2: 보존식의 식단 규칙

**Files:**
- Modify: `src/game/consumption.ts`, `src/game/resourceCatalog.ts` (`FOOD_RESOURCES` 편입, foodWeight)
- Modify: `tools/game/test_resource_category_consumption.mjs`

- [ ] 보존육·자반·건어물은 부패하지 않는 식량이다. **식단 다양성(presentTypes) 계산에서는 원물 종류로 귀속**한다(보존육=고기, 자반·건어물=생선) — 보존식 품목 수로 다양성이 인위적으로 부풀지 않게 하는 불변식.
- [ ] 소비 순서: 부패하는 원물 먼저, 보존식 나중(자연스러운 저장 행동).
- [ ] K2 배포와 함께 K1.1의 고기·생선 부패율을 최종치로 상향한다(단계적 조임의 완성).

## Phase K3: 콩과 옹기

### Task K3.1: 콩 작물

**Files:**
- Modify: `src/game/types.ts` (`CropId`·`ResourceId`에 `beans`), `src/game/crops.ts`, `src/game/resourceCatalog.ts` (food, foodWeight 낮게)
- Modify: `src/game/saveLoad.ts`, `tools/game/test_crop_paddy_milling.mjs`

- [ ] 콩: 밭 작물, 늦봄 파종·가을 수확. 식량 겸 장 원료. 부패하지 않는다(건조 두류).
- [ ] (메모) 가축 계획 Phase A3의 겨울 사료 대용 훅 — 여기서는 구현하지 않는다.

### Task K3.2: 옹기가마와 옹기

**Files:**
- Modify: `src/game/types.ts` (`BuildingTypeId`에 `onggiKiln`, `JobId`에 `potter`, `ResourceId`에 `onggi`)
- Modify: `src/game/buildings.ts` (강가 배치, minRank 'bo' 제안), `src/game/workerSlots.ts`, `src/game/agents.ts`, `src/game/inventory.ts`
- Modify: `src/game/resourceCatalog.ts` (material), `src/game/saveLoad.ts`
- Create: `tools/game/test_onggi.mjs`

- [ ] 옹기가마(강가): 옹기장이가 점토 현장 조달 + 연료로 옹기를 굽는다.
- [ ] 옹기는 소모성 용기: 장·김장 배치에 잠기고, 완성 시 파손률(CONFIG) 제외 회수.

## Phase K4: 장독대 — 시간이 만드는 2차 가공

### Task K4.1: 장독대와 장 숙성

**Files:**
- Modify: `src/game/types.ts` (`BuildingTypeId`에 `jangdokdae`, `Building.fermentBatches?: Array<{ kind: 'jang' | 'kimchi'; amount: number; readyOnDay: number }>`, `ResourceId`에 `jang`)
- Modify: `src/game/buildings.ts` (마당 배치, 워커 슬롯 없음 — 운반꾼이 채우고 시간이 일한다), `src/game/simulation.ts`, `src/game/inventory.ts`
- Modify: `src/game/resourceCatalog.ts` (food — 식단 다양성 기여, 교역 고가), `src/game/saveLoad.ts`
- Create: `tools/game/test_fermentation.mjs`

- [ ] 장 담그기: 늦가을~초겨울 콩+소금+옹기 → 배치 생성(메주는 내부 상태) → 수개월 숙성(`readyOnDay`, 절대일 저장) → 장 산출 + 옹기 회수. 진행도는 건물 선택 시 하단 컨텍스트에 표시(UI 계획 U4 컨텍스트 바에 자연 편입).
- [ ] 습격 약탈 대상에서 장독대 재고는 기본 제외(장독은 무거워서 안 가져간다 — 훅만 남김).

## Phase K5: 김장 — 늦가을 공동 사건 (묶음의 완성)

### Task K5.1: 김장 사건과 김치

**Files:**
- Modify: `src/game/types.ts` (`ResourceId`에 `kimchi`), `src/game/specialEvents.ts` 또는 계절 사건 경로
- Modify: `src/game/consumption.ts` (**김치를 채소 몫으로 산입** — vegetableRatio 계산에 합산, consumption.ts:74 부근)
- Modify: `src/game/resourceCatalog.ts` (food, 부패 없음), `src/game/saveLoad.ts`
- Modify: `tools/game/test_fermentation.mjs`, `tools/game/test_resource_category_consumption.mjs`

- [ ] 가을 마지막 순(입동 무렵) 김장철 사건: 규모 선택(소·중·대) — 채소+소금+옹기 소모, 장독대에 김치 배치(숙성 수일). 재료·옹기·장독대 수가 상한, 부족 사유는 선택지에 표시.
- [ ] 김치는 부패하지 않고 **채소 몫(vegetableRatio)을 충족**한다 — 겨울 채소 건강 페널티(residents.ts:358)의 정답. 다양성 귀속은 채소.
- [ ] 김장 완료 시 소폭 사기 상승(공동 노동 잔치 — 규모 비례, CONFIG).
- [ ] 밸런스 게이트: 자동 플레이로 (a) 김장·보존 가공을 한 마을과 안 한 마을의 겨울 건강·사기 격차가 체감되되, (b) 안 해도 생존 자체는 가능(사망 스파이크가 아니라 페널티 차이)함을 확인한다.

---

## 권장 순서와 의존 관계

```text
UI 계획 U1 (자원바 그룹화)   — 선행 필수 (신규 품목 8종)
K1 (부패 3종 + 소금 + 움 저장고) — 초석. 부패와 완화 장치는 한 배포
K2 (훈제·염장·건조)          — K1 직후. 배포와 함께 고기·생선 부패율 최종치로
K3 (콩 + 옹기)               — K1과 병행 가능
K4 (장독대 + 장)             — K3 이후
K5 (김장 + 김치)             — K1·K3·K4 이후, 묶음의 완성
```

## 검증과 게이트

- 각 Phase 최종 게이트: `npm run test:game` → `npm run build` → `git diff --check` 무오류.
- K1·K2·K5는 자동 플레이 시뮬레이션 비교(부패 도입 전후, 보존·김장 유무)를 수치로 남긴다.
- 저장 시나리오: 신규 자원 8종 가산 마이그레이션, `fermentBatches` 폴백(없으면 빈 배열), 대량 비축 구버전 저장의 완만한 부패 진입, 신규 건물·직업의 구버전 무해성. schemaVersion 인상은 선행 계획들과 머지 시점 조율.
- 불변식: 보존식·김치·장·곡물·콩은 부패하지 않는다 / 부패는 일일 틱에서만 진행된다 / 움 저장고 보호는 부패 빠른 품목 우선으로 결정적이다 / 보존식의 식단 다양성은 원물로 귀속된다 / 김치는 채소 몫을 충족한다 / 옹기 없이 장·김장 배치는 생성되지 않는다.

## 리스크 요약

| 리스크 | 대응 |
| --- | --- |
| 부패가 기존 세이브·초반 난이도를 급격히 올림 | 부패율 보수 시작 + K2에서 단계적 상향, 움 저장고 동시 배포, 자동 플레이 비교 게이트, 겨울 감속 |
| 보존 수단 없이 부패만 있는 고통 구간 | K1에 움 저장고 포함, 고기·생선 최종 부패율은 K2 배포와 동시 적용 |
| 품목 8종 추가로 상단바 과밀 | UI 계획 U1 선행 배포를 의존 관계로 강제 |
| 보존식이 식단 다양성을 인위적으로 부풀림 | 다양성 원물 귀속 불변식(K2.2) |
| 소금 두절로 염장·김장 불가가 부당하게 느껴짐 | 공급처 복수화 + 무염 대체 경로(건어물·훈제) 존재 + 가을 소금 경고(AlertsPanel) |
| 건물 2종·직업 1종 추가 비용 | 갈무리꾼 1직업이 훈연막·건조덕장 겸임, 틱은 숯가마 구조 복제 |
| 발효 대기 모델의 저장 호환 | `fermentBatches` 선택 필드, readyOnDay 절대일 저장 |
