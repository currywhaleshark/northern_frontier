# 병종·민생 확장 계획: 가축 5종·의원·귀순병·팽배수·기마병

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. 해당 스킬이 세션에 없으면 일반 TDD 방식으로 진행한다. Steps use checkbox (`- [ ]`) 구문으로 추적한다.

**Goal:** 생존 게임의 정체성을 유지하면서 전투와 민생 양쪽에 걸치는 확장을 추가한다: (1) 축사를 **축종 선택형 가축 시스템**(닭→소·염소·양→군마, 거래·사건으로 점진 해금)으로 승격하고, (2) **의원**을 티어 2~3 건물·직업으로 추가해 역병 사건과 연계하며, (3) **귀순/투항 주민**을 외교·이주·포로 경로로 받아들이되 조정 의심(suspicion)과 연동하고, (4) 전투 병종으로 **팽배수**(대장간 방패)와 **기마병**(군마 기반)을 추가한다.

**확정된 설계 결정:**
- 가축은 **닭·염소·양·소·군마 5종**. 산출: 닭=고기·달걀, 염소=고기·젖, 양=고기·양털, 소=고기·젖·**농사 노동**, 군마=기병 양성.
- **처음부터 5종을 풀지 않는다.** 시작은 닭 정도, 이후 거래로 소를 사고, 귀순자가 몰고 온 말로 군마를 해금하는 식의 점진 해금.
- 의원은 **티어 2~3(보 또는 진)의 건물+직업**으로 정식 추가하고 역병 사건과 연계한다. (약초꾼 겸직 방식은 채택하지 않음.)
- 귀순병 보유가 **조정 의심을 올리는 연동은 확정**.
- (2026-07-17 추가) 귀순병은 **수비병·사냥꾼·파수꾼 정도로 유연 배치 가능**하게 한다.
  직업이 완전 고정된 네임드 특수 주민(2026-07-17-special-residents.md)과의 차별점이다.

**Architecture (재사용):**
- 축종 선택은 대장간 `smithyProduct` 패턴의 복제다 — 축사별 축종 선택 + 목동(`herder`) 작업. 기존 `herderTick`(agents.ts:1505)의 채집 구조를 축종별 산출 테이블로 일반화한다.
- 신규 자원(달걀·젖·양털·건초)은 자원 분류 마이그레이션(`migrateResourceBag`)이 가산적이라 안전하다. 달걀·젖은 `FOOD_RESOURCES`에 들어가는 순간 기존 식단 다양성 가점(consumption.ts의 presentTypes)이 자동 적용된다.
- 의원의 역병 연계는 기존 `plagueCase`/`epidemic`(IncidentState)과 격리 선택지(specialEvents.ts:293-311)에 보정을 얹는 방식이다.
- 귀순병은 `Resident`에 선택 필드 `origin?`을 추가하고, 획득 경로는 기존 이주(`maybeOfferImmigration`)·외교(`foreignSites`의 goodwill/favors/hungry)·의심(`state.suspicion`) 시스템에 앵커한다.
- 전투 병종은 `CombatRole × CombatWeaponId → combatCapabilities` 파이프라인(combatRoster.ts, combatCapabilities.ts)에 축을 추가한다. 팽배수 = 무기 축(`shield`), 기마병 = 별도 탑승 축(`mountAssignments`).
- **전술전 확장 계획(2026-07-14-tactical-formation-and-enemy-plans.md)과의 의존**: 팽배수의 차폐 계수는 그 계획 Task 1.2가 CONFIG로 승격한 노출 계수 표에 얹고, 기마병의 기동 면제는 Task 2.1 `redeploy`를 전제한다. 해당 Phase 완료 전에는 착수하지 않는다.

**현재 코드의 출발점 (2026-07-14):**
- 축사(`stable`)는 목동이 고기+가죽을 채집하는 추상 작업장이다. 가축 개체·축종 개념이 없다.
- 무기 배정(`weaponAssignments`)은 주민당 **한 슬롯**이다. 방패를 무기로 추가하면 팽배수는 창과 양립 불가(팽배수 정체성에 부합). 말은 무기와 겹쳐야 하므로 별도 배정표가 필요하다.
- 치료: 질병은 약초 소모 완화(residents.ts:361-364), 전투 부상은 그룹 `wounded` 카운터 → 종료 시 `injure()` 일괄 적용. 라운드 중 복귀 개념 없음.
- 역병: `plagueSuspicion` 사건 → `plagueCase` → `epidemic`(pending/isolated/uncontained). 격리/방치 선택지 존재.
- 포로·귀순 시스템 없음. 전술전 확장 계획 Phase 4의 `포획조` 계책이 적 측 포로교환 사건을 예고하고 있어 대칭 확장점이 된다.
- 조정 의심(`state.suspicion`)은 화약 자급·월경 교역·북방 유착으로 상승하며 감찰·견책·토벌 유예로 이어진다 — 귀순병 연동의 기존 앵커.

**만들지 않는 것:**
- 가축 개체별 시뮬레이션(이름·나이·개별 이동) — 축사별 마릿수와 성장 게이지의 집계 모델로 한정한다.
- 무기 다중 슬롯 — "한 슬롯 = 한 병종 키트" 원칙 유지, 말만 별도 트랙.
- 기마 유닛의 지도 위 개별 기동 — 전술전은 기존 라운드제 안에서 기동 면제·추격 보정으로 표현한다.

---

## Phase A: 가축 기반 시스템 (닭부터)

### Task A1: 축종 자료구조와 축사 선택

**Files:**
- Modify: `src/game/types.ts` (`LivestockId = 'chicken' | 'goat' | 'sheep' | 'cattle' | 'horse'`, `Building.livestock?: { species: LivestockId; headcount: number; growth: number }`, `GameState.unlockedLivestock: LivestockId[]`)
- Modify: `src/game/buildings.ts`, `src/game/config.ts` (`CONFIG.livestock`: 축종별 수용 상한·번식 속도·산출표·사료)
- Modify: `src/game/saveLoad.ts`
- Modify: `src/components/InspectorPanel.tsx` (축사 선택 UI — 대장간 생산품 선택 패턴 복제)
- Create: `tools/game/test_livestock.mjs`

- [ ] 축사마다 축종 하나를 선택한다(해금된 축종만). 수용 상한은 축종별(예: 닭 8, 염소·양 5, 소·군마 3 — CONFIG). `headcount`는 번식으로 상한까지 완만히 증가(growth 게이지), 도축·약탈·아사로 감소한다.
- [ ] 시작 해금은 `['chicken']`. 신규 게임 초기화와 `unlockedLivestock` 저장 마이그레이션(없으면 `['chicken']`).
- [ ] 기존 축사 마이그레이션: 닭 + headcount 절반으로 초기화한다(기존 고기+가죽 채집과 단절되지만 저장 호환 폴백으로 명시). 기존 `herdFood`/`herdHide` 산출 상수는 제거한다.
- [ ] schemaVersion: 전술전 확장(v8)·사냥 재작업과 인상 시점을 조율한다 — 동시 배포면 편승, 단독이면 +1.

### Task A2: 사육 틱과 산출

**Files:**
- Modify: `src/game/agents.ts` (`herderTick` 재작성)
- Modify: `src/game/resourceCatalog.ts` (신규 자원 `eggs`(달걀)·`milk`(젖)·`wool`(양털)·`hay`(건초), 달걀·젖은 `FOOD_RESOURCES` 편입)
- Modify: `src/game/types.ts` (`ResourceId` 확장)
- Modify: `src/game/consumption.ts` (식단 가중치)
- Modify: `tools/game/test_livestock.mjs`, `tools/game/test_resource_category_consumption.mjs`

- [x] 목동 작업 = 배정 축사의 축종 산출표대로 생산: 닭 → 달걀(+도축 시 고기), 염소·소 → 젖, 양 → 양털(계절 깎기), 도축 명령 → 고기(+가죽). 젖은 염소·소 공통 자원 하나로 통일한다(품목 폭발 방지).
- [x] 달걀·젖이 식단 다양성 가점에 참여함을 테스트로 확인한다(consumption.ts presentTypes).
- [x] 양털은 베틀집의 병행 투입재로 편입: `cotton` 외 `wool`도 무명옷 생산 원료로 허용(agents.ts:463 입력 목록 확장). 목화 농사가 어려운 북방 배경과 맞는 대체 경로다.

### Task A3: 사료와 겨울 — 생존 게임 연결

**Files:**
- Modify: `src/game/agents.ts`, `src/game/simulation.ts` (일일 사료 소비)
- Modify: `src/game/config.ts`
- Modify: `src/components/AlertsPanel.tsx` (사료 부족 경고)
- Modify: `tools/game/test_livestock.mjs`

- [x] 사료 규칙: 닭은 곡물 소량, 초식 4종은 봄~가을 방목(소비 없음) + **겨울에는 건초 소비**. 건초는 가을에 목동·농부가 수확 후 그루터기에서 채집한다(CONFIG 산출).
- [x] 겨울 사료 부족 시: 성장 정지 → 마릿수 감소(아사) 순. 가을 도축(마릿수를 고기로 전환)이 자연스러운 대비책이 되도록 경고를 가을에 띄운다 — "겨울 사료가 부족합니다. 도축하거나 건초를 마련하십시오."
- [x] 습격 연계(선택): 창고 구역 약탈 시 가축도 약탈 대상에 포함(`addLoot` 유사 경로로 headcount 감소). 전술전 확장 계획 Phase 4의 `창고 약탈` 목적과 자연 연결된다.

### 2026-07-17 구현 기록 — Phase A 닭 슬라이스

- 축사별 `LivestockState`와 전체 5종 `LivestockId`/`unlockedLivestock` 골격을 추가했다. 현재 실제 운용 가능 축종은 시작 해금인 닭 하나이며, 축사당 4마리로 시작해 8마리까지 번식한다.
- 닭은 마리당 곡물 0.06/일을 먹고 완전 급여 시 마리당 번식 진행도 0.025/일을 얻는다. 사료가 부족하면 번식이 즉시 멈추며 3일 유예 뒤 이틀마다 1마리씩 줄어든다.
- 목동의 기존 무한 고기·가죽 채집을 제거했다. 배정된 축사의 닭 한 마리당 달걀 0.12/일을 생산하며 가을은 90%, 겨울은 65% 산란율을 적용한다. 명시적 도축은 닭 1마리를 고기 0.75로 바꿔 축사 현장 재고에 둔다.
- 달걀을 정식 식량 자원과 동물성 식품군에 넣었다. 일일 부패율은 2.5%로 생고기보다 느리고 채소보다 빠르며, 운반·저장·습격 식량 풀·상단 자원 표시에 포함된다.
- 재편된 `SelectionContextBar`/`ActionPopup`에 마릿수·번식·사료 상태·축종 선택·도축 명령을 연결했다. 가을과 겨울에는 남은 곡물로 월동 사료를 충당하지 못하면 경보가 뜬다.
- 저장 스키마를 v16으로 올렸다. v15 축사는 닭 4마리(수용 상한의 절반), 달걀 0, 닭 해금 상태로 이전한다.
- `test_livestock.mjs`를 포함한 전체 게임 테스트 78개와 프로덕션 빌드가 통과했다. 후속 범위는 염소·양·소·군마, 젖·양털·건초, 가축 약탈 연계다.

## Phase B: 의원 — 건물·직업·역병 연계

### Task B1: 의원 건물과 직업

**Files:**
- Modify: `src/game/types.ts` (`BuildingTypeId`에 `clinic`, `JobId`에 `physician`)
- Modify: `src/game/buildings.ts` (의원 건물 def — `minRank: 'bo'` 또는 `'jin'`, 구현 시 확정. 기본 권장 `'jin'`: 초반 치료는 약초꾼·약초막이 담당하고 의원은 중후반 상위 치료)
- Modify: `src/game/workerSlots.ts`, `src/game/agents.ts` (`physicianTick`)
- Modify: `src/game/saveLoad.ts`, `src/components/` (직업·건물 UI 노출)
- Create: `tools/game/test_physician.mjs`

- [x] 의원 틱: 병자·중상자(health 낮음)를 우선 치료 — 약초를 소모해 일일 회복량 가산, 병 회복 확률 상향(기존 `recoverChanceHerbs` 위에 의원 보정). 환자가 없으면 약초 정제(약초 → 소량 가공 보너스) 또는 대기.
- [x] 약초꾼과의 역할 분리를 명확히: 약초꾼 = 채집(공급), 의원 = 치료(소비·효율). 의원이 없어도 기존 약초 소모 치료는 그대로 동작한다(하위 호환).

### Task B2: 역병 사건 연계

**Files:**
- Modify: `src/game/specialEvents.ts` (plagueSuspicion·epidemic 분기)
- Modify: `src/game/residents.ts` (전염·회복 판정 보정)
- Modify: `tools/game/test_special_events.mjs`, `tools/game/test_physician.mjs`

- [x] 의원 보유 시: 역병 의심 사건의 진단 정확도 상승(가짜 의심을 조기 판별해 불필요한 격리 비용 감소), 격리 선택지의 회복 속도 상향, `uncontained` 확산 속도 감쇠, 중환자 사망 확률 감소. 수치는 전부 CONFIG.
- [x] 의원 부재 시 기존 확률 유지 — 역병 사건의 위협은 의원의 존재 이유이므로 기본 난이도를 낮추지 않는다.

### 2026-07-17 구현 기록 — Phase B 민생 슬라이스(B1·B2)

- 진(鎭) 승격 건물 `clinic`(의원)과 직업 `physician`을 추가했다. 의원은 2슬롯, 건설 비용은 목재 14·돌 10·약초 4·도구 2이며 건설 메뉴·작업 슬롯·자동 배정·선택 UI·주민 렌더 폴백에 편입했다.
- 의원은 병자를 먼저, 그다음 건강 75 미만 중상자를 치료한다. 의원 1명당 약초 0.6/일을 쓰며 건강 +6/일, 일반 질병 회복 확률 +18%/일을 제공한다. 환자가 없거나 약초가 없으면 의원에서 대기한다.
- 방역 보너스는 완공된 의원에 건강한 의원이 실제 배정돼 있을 때만 켜진다. 의원 자신이 병들거나 격리되거나 중상이면 즉시 효력이 사라진다.
- 역병 의심 사건에 1일 안전 진맥 선택지를 추가했다. 일반 격리와 집단 격리는 의원이 있을 때 3일 짧아지고, 미격리 역병은 전염 확률 50%·사망 확률 40%·건강 피해 60% 배율을 적용한다. 의원이 없을 때는 기존 수치가 그대로다.
- 조정에 의원 파견을 요청하는 기존 고비용 즉시 종식 선택지는 유지했다. 지역 의원은 역병을 즉시 삭제하지 않고 진단·격리·확산 억제로 대응하므로 두 경로의 역할이 구분된다.
- 저장 스키마는 v17이며 `test_physician.mjs`를 포함한 전체 게임 테스트 79개가 통과했다. 다음 의원 범위는 전술 치료반 B3다.

### Task B3: 전술 치료반 (의원의 전투 역할)

**Files:**
- Modify: `src/game/combatRoster.ts` (`CombatRole`에 `healer` — physician 직업 매핑)
- Modify: `src/game/combatCapabilities.ts`, `src/game/tacticalBattle.ts` (`DefenderGroupKind`에 `healer`, 라운드 종료 부상 복귀 처리)
- Modify: `src/game/saveLoad.ts` (`DEFENDER_KINDS`), `src/components/TacticalBattleScreen.tsx` (스프라이트·칩)
- Modify: `tools/game/test_tactical_battle.mjs`

- [x] 치료반: 후열 전용, 전투력 0에 가깝게. 라운드 종료 시 같은 구역 `wounded`를 소수 복귀시킨다(의원 1인당 라운드당 최대 1명, 약초 소모 — CONFIG). 전사자는 복구 불가. 전투 종료 시 `injure()` 심각도 완화 보정.
- [x] **밸런스 가드**: "부상 = 전선 이탈" 압박이 무뎌지지 않게 복귀량 상한과 약초 비용을 보수적으로 잡고, 고정 시드 실측으로 총 사상 분포 변화를 ±10% 안에서 확인한다.
- [x] 후방 급습의 표적 가치: 치료반은 피난 주민과 같은 고노출군으로 분류해 후열 경비의 보호 대상이 되게 한다(전술전 확장 계획의 후방 교전과 자연 결합).

### 2026-07-17 구현 기록 — Phase B 전술 슬라이스(B3)

- `physician`을 전투 역할 `healer`와 방어 그룹 `healer`로 매핑했다. 치료반은 무기를 받지 않고 1인당 전력 0.5만 기여하며, 전투 명령 없이 배치 단계에서 담당 구역만 정하는 후열 고정 보호 대상이다.
- 같은 구역에 생존한 의원 1명당 라운드 최대 1회의 복귀 판정을 한다. 성공률은 20%, 성공 시 약초 1을 쓰고 `wounded` 1명을 전열로 돌려보낸다. 전사자는 복구하지 않으며 전투 종료 시 같은 구역 잔여 부상의 `injure()` 심각도를 25% 낮춘다.
- 후방 급습은 치료반을 우선 가치 표적으로 삼으며 피난 주민과 같은 고노출 계수를 사용한다. 후열 또는 중열 근접 경비가 있으면 기존 후방 차폐 계수로 보호받는다.
- 치료반 칩에는 청록색 상태색과 `후열 자동 치료` 문구를 붙였다. 별도 전투 포즈 시트를 늘리지 않고 기존 비전투 주민 포즈를 재사용해 완성된 전투 스프라이트 작업과 충돌하지 않게 했다.
- 80개 고정 시드 비교에서 치료 효과 0인 동일 편성은 총 사상 136명(부상 135·전사 1), 치료 효과를 켠 편성은 124명(부상 123·전사 1)이었다. 12명 복귀·약초 12 소모로 총 사상 변화는 -8.82%여서 ±10% 가드를 통과했다. 측정은 `tools/game/measure_tactical_healer_balance.mjs`로 재현한다.
- 저장 스키마는 v18이며 치료반의 역할·후열·보호 상태·담당 구역을 복원한다. 전체 게임 테스트 79개, 프로덕션 빌드와 `git diff --check`가 통과했고 빌드에는 기존 500kB 초과 번들 경고만 남았다.

## Phase C: 팽배수 — 대장간 방패와 차폐

**의존: 전술전 확장 계획 Phase 1~2 완료 후 착수.**

### Task C1: 방패 생산과 배정

**Files:**
- Modify: `src/game/types.ts` (`SmithyProductId`·`CombatWeaponId`에 `shield`)
- Modify: `src/game/buildings.ts`(대장간 생산품), `src/game/weapons.ts`(배정·재고 정리 규칙), `src/game/config.ts`(재료: 목재+가죽+철 소량)
- Modify: `src/components/WeaponAllocationDialog.tsx`
- Modify: `tools/game/test_weapon_assignments.mjs`, `tools/game/test_smithy_products.mjs`

- [ ] 방패는 창·각궁·조총과 같은 파이프라인(생산 → 재고 → `weaponAssignments`)을 탄다. 한 슬롯 원칙에 따라 방패 배정자는 다른 무기를 들지 않는다 — 이것이 팽배수 병종 정의다.

### Task C2: 팽배수 전투 역량

**Files:**
- Modify: `src/game/combatCapabilities.ts` (능력 `shield`), `src/game/tacticalEngagement.ts` (차폐 계수)
- Modify: `src/game/config.ts` (전술전 확장 Task 1.2가 승격한 노출 계수 표에 팽배수 열 추가)
- Modify: `src/game/tacticalBattle.ts` (`DefenderGroupKind`에 `militia-shield`, `GROUP_LABELS` '팽배 수비대'), `src/game/saveLoad.ts`
- Modify: `src/components/TacticalBattleScreen.tsx` (스프라이트)
- Modify: `tools/game/test_tactical_battle.mjs`

- [ ] 효과: 전열 배치 시 자기 피해 노출 감소 + 같은 구역 중·후열 차폐 강화. **적 화살 피해에 강하고 조총·화포 상대로는 보정 무효** — 적 계책 `방패벽`(사격에 강하고 느림)과 대칭 규칙을 공유한다. 공격력은 비무장 근접 수준.
- [ ] 고정 시드 실측: 팽배수 유무 시나리오에서 원거리 세력(니마차·홀라온 궁기병) 상대 사상 감소가 체감되되, 조정 토벌군(조총) 상대로는 무력함을 확인한다.

## Phase D: 귀순/투항 주민

### Task D1: 출신(origin)과 의심 연동

**Files:**
- Modify: `src/game/types.ts` (`Resident.origin?: string` — 세력 이름), `src/game/residents.ts`
- Modify: `src/game/suspicion.ts` 또는 의심 계산부 (야인 출신 보유 수 → 의심 가산)
- Modify: `src/game/saveLoad.ts`, `src/components/InspectorPanel.tsx` (출신 표기)
- Create: `tools/game/test_defectors.mjs`

- [x] `origin`이 있는 주민은 일반 주민과 동일하게 일하되, 야인 세력 출신 보유 수가 조정 의심을 완만히 올린다(CONFIG — 인원당 소량, 감찰 사건 문안에 반영). 귀순병이 강할수록 정치 비용을 지는 균형 장치다.
- [x] 전투 역량: 출신별 보정 — 니마차 출신 = 사냥꾼급 매복·정찰 능력, 홀라온 출신 = 기마 숙련(Phase E에서 기마병 우선 자격), 조정 이탈병 = 조총 숙련 보정. `combatCapabilities`/`combatBasePower`에 origin 인자를 추가한다.

### Task D2: 획득 경로 — 이주·외교·귀순 사건

**Files:**
- Modify: `src/game/immigration.ts` (귀순인 변형), `src/game/siteDiplomacy.ts` 또는 사건 경로 (기근 산채·우호 세력의 투항)
- Modify: `src/game/specialEvents.ts` (**말을 몰고 온 귀순자 사건** — 수용 시 홀라온 출신 주민 + `unlockedLivestock`에 `horse` 추가 + 군마 소량. 거절 시 관계·의심 무변화)
- Modify: `tools/game/test_defectors.mjs`

- [x] 이주 변형: 낮은 확률로 귀순인 무리가 온다 — 수용/거절 선택. 수용 시 노동력+전투 역량+의심, 거절 시 해당 세력 관계 소폭 하락.
- [x] 외교 경로: `hungry`/`sick` 상태의 세력 거점에서 투항 제안 — favors·goodwill 조건.
- [x] **군마 해금의 정식 경로**가 이 Phase의 귀순 사건이다(확정 결정 반영). 소·염소·양 해금은 Phase E 참조.
- [x] 포로 경로는 전술전 확장 계획 Phase 4(포획조·포로교환)의 배포 이후 후속 계획으로 분리한다 — 여기서는 구현하지 않고 `origin` 자료구조만 호환되게 둔다.

> 2026-07-17 구현 기록: 귀순 주민은 `origin`을 가진 일반 주민으로 생성되며, 자연 이주·취약 외교 거점·홀라온 군마 사건의 세 경로를 연결했다. 니마차 매복/정찰, 홀라온 기마 숙련 표식, 조정 이탈병 조총 보정이 개인 전투 스냅샷과 전술 그룹에 유지된다. 군마는 사육과 해금까지만 열었고 기마병 편성은 후속 전투 유닛 단계에 남겼다.

## Phase E: 축종 확장과 해금 경로

### Task E1: 소·염소·양 해금과 산출

**Files:**
- Modify: `src/game/trades.ts` 또는 교역 경로 (가축 구매 — 세력별 취급 축종: 예. 니마차 = 염소, 조선 상단·장터 = 소, 홀라온 = 양·말)
- Modify: `src/game/agents.ts`, `src/game/config.ts`
- Modify: `tools/game/test_livestock.mjs`, `tools/game/test_trades.mjs`

- [x] 해금은 **첫 획득으로 발생**한다: 교역으로 소를 사면 `unlockedLivestock`에 `cattle` 추가 + 축사 배정 가능. 사건 변형(장이 선 날 가축 상인, 우호 세력의 선물)도 같은 경로를 탄다.
- [x] **소의 농사 노동**: 소를 보유한 축사 수에 따라 밭·논 작업 효율 보정(경운 — 농부 작업 속도 또는 수확량 CONFIG 가산, 상한 있음). 겨울 건초 부담과의 상충이 소 사육의 결정 포인트다.

### 2026-07-17 구현 기록 — Phase E 소·염소·양 슬라이스

- 실제 운용 축종에 염소·양·소를 추가했다. 축사 수용 상한은 염소·양 5마리, 소 3마리이며 축종별 번식·사료·산출·도축 수치를 `CONFIG.livestock`로 일반화했다. 군마 설정은 겨울 사료 호환용으로만 두고 실제 운용·해금은 Phase F까지 보류한다.
- 염소·소는 젖, 양은 계절 배율을 받는 양털을 생산한다. 젖은 동물성 식단군과 부패 체계에 편입했고, 양털은 목화가 없을 때 베틀집의 대체 투입재로 무명옷을 만든다.
- 초식 가축은 봄~가을 방목하고 겨울에만 건초를 먹는다. 가을 곡물·벼 수확 진행도에서 건초가 생기며, 가을·겨울 경보는 닭용 곡물과 초식 가축용 건초를 따로 산정한다.
- 소가 든 축사 한 곳당 농사 작업 속도 +8%, 최대 +24%를 적용한다. 일반 습격과 전술전의 실제 창고 약탈이 발생하면 전체 가축 수도 함께 줄어든다.
- 첫 교역 성사 시 빈 축사가 있으면 니마차 우디캐는 염소, 올량합 부락은 양, 만상·송상은 소 번식쌍을 건네며 그때 해당 축종이 해금된다. 홀라온 야인은 현행 교역 불가 세력이라 양 경로를 실제 거래 가능한 올량합에 배치했고, 군마는 확정 설계대로 귀순 사건에 남겼다.
- 가축·교역·식단·부패·선택 UI·전술전 관련 회귀 테스트와 프로덕션 빌드가 통과했다. 전체 테스트 모음은 동시 진행 중인 은 경제 검증과 겹쳐 별도 완료 확인이 필요하다.

## Phase F: 군마와 기마병

**의존: Phase A·D(군마 해금)·E 완료, 전술전 확장 계획 Phase 2(redeploy) 배포 후.**

### Task F1: 탑승 배정

**Files:**
- Modify: `src/game/types.ts` (`GameState.mountAssignments: Partial<Record<number, 'horse'>>`)
- Modify: `src/game/weapons.ts` (배정·무효 정리 — 무기 배정과 동일 규칙: 군마 마릿수 상한, 사망·이탈 시 결정적 회수)
- Modify: `src/components/WeaponAllocationDialog.tsx` (탑승 열 추가)
- Modify: `src/game/saveLoad.ts`
- Modify: `tools/game/test_weapon_assignments.mjs`

- [x] 말은 무기와 **별도 트랙**이다: 기마+창 = 기창병, 기마+각궁 = 기마 궁수. 배정 가능 수 = 군마 축사의 headcount 합. 전투에서 말이 손실될 수 있다(사상 발생 시 확률 — headcount 감소).

> 2026-07-17 F1 구현 기록: `mountAssignments`를 무기와 독립된 저장 필드로 추가하고, 완성된 군마 축사의 실제 마릿수를 배정 상한으로 사용한다. 직업 이탈·사망·도축·약탈·아사·축사 철거 시 초과 배정을 즉시 정리하며, 기마 주민의 전투 사망에는 결정적 확률 판정으로 군마 손실이 발생한다. 병기고 대화상자에서 무기와 군마를 나란히 배정할 수 있고 구버전 저장은 빈 배정으로 안전하게 복원된다.

### Task F2: 기마 전투 역량 — "세게"가 아니라 "늦지 않게"

**Files:**
- Modify: `src/game/combatCapabilities.ts` (능력 `mounted`), `src/game/tacticalEngagement.ts`, `src/game/tacticalBattle.ts`
- Modify: `src/game/expedition.ts` (행군 속도 보정)
- Modify: `src/components/TacticalBattleScreen.tsx` (스프라이트)
- Modify: `tools/game/test_tactical_battle.mjs`, `tools/game/test_expedition.mjs`

- [ ] 방어전: 구역 이동(`advance`/`fallback`)·열 재배치(`redeploy`) 라운드 페널티 면제 — "이동이 공짜인 예비대". 후방 급습 대응 기동이 기마의 존재 이유다. 돌격 보정은 소폭(정적 농성에서 과강화 방지), 목책 안 수성에는 보정 없음.
- [ ] 추격: 승리·궤주 시 `recoverRoutedLoot` 회수율 상향(기존 50% 고정 → 기마 수에 따라 상한까지 가산)과 도주 적 추가 처치. 원정 행군 속도 가산.
- [ ] 고정 시드 실측: 기마 유무가 "전투 결과 뒤집기"가 아니라 "피해 통제·회수율 개선"으로 나타나는지 확인한다.

---

## 권장 순서와 의존 관계

```text
Phase A (가축 기반: 닭)          — 독립, 즉시 착수 가능
Phase B (의원)                   — 독립, A와 병행 가능
Phase C (팽배수)                 — 전술전 확장 Phase 1~2 완료 후
Phase D (귀순병)                 — 독립 (포로 경로만 전술전 확장 Phase 4 이후로 분리)
Phase E (소·염소·양 해금)        — A 완료 후
Phase F (군마·기마병)            — A·D·E + 전술전 확장 Phase 2 완료 후
```

## 검증과 게이트

- 각 Phase 최종 게이트(커밋 전 필수): `npm run test:game` → `npm run build` → `git diff --check` 무오류.
- 전투에 닿는 Phase(B3·C·F)는 고정 시드 실측으로 기존 분포 대비 변화를 수치로 남긴다.
- 저장 시나리오: `unlockedLivestock`·`Building.livestock`·`origin`·`mountAssignments` 각각 "없으면 안전 기본값" 폴백과 구버전 로드 테스트. schemaVersion 인상은 선행 계획들과 머지 시점에 조율.

## 리스크 요약

| 리스크 | 대응 |
| --- | --- |
| 신규 자원 4종으로 품목 폭발·UI 혼잡 | 젖은 염소·소 공통 1종, 달걀·젖은 기존 식량 UI에 편입, 건초는 사료 전용 표기 |
| 치료반·의원으로 소모전 압박 약화 | 복귀량 상한·약초 비용 보수 설정 + 고정 시드 ±10% 게이트 |
| 기마병이 방어전 밸런스를 뒤집음 | 화력 아닌 기동·회수 중심 설계, 목책 수성 보정 없음, 실측 게이트 |
| 귀순병이 공짜 강병이 됨 | 의심 가산 확정 연동 + 감찰 사건 문안 반영 |
| 병종당 스프라이트 비용 | `tools/render` 생성 파이프라인 재사용, Phase별 1~2종으로 분산 |
| 선행 계획들과 저장·타입 파일 충돌 | 공유 파일 수정을 Phase 단위로 몰고, schemaVersion은 머지 시점 담당자 간 확정 |
