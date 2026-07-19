# 전술전 확장 2단계 세부 계획

> 작성일: 2026-07-19
> 상태: **사용자 최종 결정·Codex/Fable 분업 경계 확정 — Phase 0/백엔드 착수**
> 기준 브랜치: `codex/combat-expansion-phase-2`
> 목적: 사용자 초안을 구현 가능한 단위로 구체화하고, 페이블과의 교차검증 뒤 확정한다.

## 0. 문서 사용법

이 문서는 항목마다 결정 상태를 구분한다.

- **[확정]** 사용자가 직접 요구했거나 기존 시스템의 유지 조건이다.
- **[권고]** 현재 코드와 플레이 흐름을 검토해 제안한 구현 방식이다.
- **[교차검증]** 역사성·조작감·밸런스 중 하나 이상을 페이블과 함께 다시 판단해야 한다.

교차검증 왕복과 사용자 최종 결정을 완료했다. 구현은 Phase 0의 기준선 고정과 문서 정합화부터 시작한다.

---

## 1. 한 문장 목표

현재 전술전의 `고정된 세력별 3~5개 부대 + 정면 돌파/후방 우회 중심 AI + 패널 위주 명령`을,
다음 네 요소가 서로 맞물리는 전술전으로 확장한다.

1. **전투마다 달라지는 제한된 병과 조합**
2. **편제에 맞는 적 교리와 실제 라운드 행동**
3. **무대 위 직접 조작으로 내리는 진형·이동·방향 명령**
4. **양측이 실제로 이동하고 차단할 수 있는 우회로**

목표는 병종 수를 늘리는 것 자체가 아니다. 전투 시작 시 적 편제를 보고
“이번에는 무엇이 위험하고, 무엇으로 막아야 하는가”가 달라져야 한다.

---

## 2. 현행 기준선

### 2.1 이미 구현되어 있는 것

- 전투 단계: 준비 → 배치 → 지휘 → 연출 → 보고.
- 전장 구역: 접근로 → 방어선 → 창고 → 중심지.
- 각 구역 내부의 전열·중열·후열.
- 부대별 명령, 인접 열 재배치, 전진·후퇴.
- 후방 급습의 별도 교전 판정과 중열 예비대의 `reinforceRear`.
- 적 목적 3종: 돌파·약탈·방화.
- 적 계책 5종: 후방 우회·방책 파괴조·불화살·정면 기만·야간 접근.
- 적 계책 정보 수준과 준비 행동을 통한 대응.
- 부대별 집중 표적, 정면/후방 노출, 치료반.
- 방어전·산채 공격전 공통 교전 판정층.

### 2.2 현재 한계

- 세력마다 부대 목록이 사실상 고정되어 전력 수치만 달라진다.
- `RaiderGroupKind`가 주력·약탈조·우회조 세 역할에 묶여 있어 병과와 임무가 분리되지 않는다.
- `combatMultiplier`, `lossResistance`, `wallPressureBonus`만으로는 병과의 강약이 충분히 드러나지 않는다.
- 적 목적과 계책은 다양하지만 라운드 중 보이는 행동은 정면 전진·침투·후방 급습으로 수렴한다.
- 열과 구역 이동은 가능하지만 주 조작이 하단 버튼·팝오버라 무대에서 지휘한다는 감각이 약하다.
- 우회대는 시뮬레이션상 구역을 건너뛰며, 플레이어가 경로 중간에서 발견·차단할 수 없다.
- 방향은 열과 후방 교전 존재 여부에서 자동 파생되어 플레이어가 직접 돌릴 수 없다.

### 2.3 유지할 불변식

- **[확정]** 실시간 RTS나 개별 병사 단위 시뮬레이션으로 바꾸지 않는다.
- **[확정]** 라운드 명령과 이산 구역/열 판정을 유지한다.
- **[확정]** 같은 시드의 전투 생성과 AI 선택은 결정적이어야 한다.
- **[확정]** 전투 중 저장·불러오기를 지원한다.
- **[확정]** 무대 직접 조작을 추가해도 하단 부대 독과 키보드 조작은 접근성 폴백으로 남긴다.
- **[확정]** 피난 주민과 치료반의 기존 보호 대상 규칙을 깨지 않는다.

---

## 3. 설계의 중심 분리

### 3.1 적 계획의 네 축

기존 `EnemyPlan`을 폐기하지 않고 다음 네 축으로 명확히 나눈다.

| 축 | 질문 | 예시 | 전투에 미치는 영향 |
|---|---|---|---|
| 목적 | 무엇을 얻으려 하는가 | 돌파, 약탈, 방화 | 목표 구역, 승패 가중치 |
| 교리 | 어떤 방식으로 싸우는가 | 기마 견제, 충격 돌파, 화력 압박 | 라운드별 행동 우선순위 |
| 편제 | 무엇을 데려왔는가 | 궁기병 중심대, 파책 공성대 | 실제 병과와 상성 |
| 계책 | 무엇을 숨겨 두었는가 | 후방 우회, 야간 접근, 기만 | 정보전과 준비 행동 |

현재 `objective`와 `stratagems`는 유지하고 다음 필드를 추가하는 방향을 권고한다.

```ts
type EnemyDoctrineId =
  | 'mountedSkirmish'
  | 'shockBreakthrough'
  | 'shieldedAdvance'
  | 'breachAndStorm'
  | 'missileSuppression'
  | 'fireSupport'
  | 'reserveCounterattack'
  | 'feignedRetreat';

// 타입과 저장 호환을 위해 8종을 유지한다.
// MVP 활성 6종: fireSupport는 Phase 8에서 활성화하고 feignedRetreat는 후속으로 보류한다.

interface EnemyPlan {
  objective: EnemyObjectiveId;
  doctrine: EnemyDoctrineId;
  compositionTemplateId: string;
  objectiveRevealed: boolean;
  doctrineRevealed: boolean;
  compositionRevealed: boolean;
  stratagemPoints: number;
  stratagems: EnemyStratagemState[];
}
```

- **[확정]** 한 전투에는 주 교리 하나만 둔다. 여러 교리를 동시에 구매하지 않는다.
- **[확정]** 계책은 기존처럼 최대 3개지만, 교리와 중복되는 계책은 구매 후보에서 제외한다.
- **[확정]** 목적은 승리 조건, 교리는 AI, 편제는 부대 생성, 계책은 예외 효과만 담당한다.
- **[확정]** `rearManeuver`는 삭제하지 않고 실제 우회로를 여는 계책으로 재정의한다.

### 3.2 병과와 임무 분리

`RaiderGroupKind = main | looters | flankers`는 임무를 나타내는 호환 필드로 유지하되,
전투 특성은 병과 정의에서 가져온다.

```ts
type TacticalUnitTag =
  | 'infantry' | 'mounted' | 'ranged' | 'firearm'
  | 'shock' | 'antiMounted' | 'shielded'
  | 'siege' | 'artillery' | 'indirectFire'
  | 'support' | 'scout';

interface TacticalUnitProfile {
  id: RaiderUnitType;
  label: string;
  tags: TacticalUnitTag[];
  preferredLine: TacticalFormationLine;
  rangedMultiplier: number;
  meleeMultiplier: number;
  chargeMultiplier: number;
  protectionMultiplier: number;
  mobility: 1 | 2 | 3;
  wallPressure: number;
  routeSpeed: 1 | 2;
  targetPriorities: TacticalUnitTag[];
}
```

- **[권고]** 프로필 수치는 `TacticalRaiderGroup` 저장 데이터에 복사하지 않고 `unitType`에서 파생한다.
- **[권고]** 전투 중 변하는 값만 그룹에 저장한다: 전력·인원·사기·위치·방향·명령·경로 진행도.
- **[권고]** 정적 프로필은 `src/game/tacticalUnits.ts`에 모으고 수치는 `CONFIG.tacticalBattle.units`에 둔다.

---

## 4. 병과 명세 초안

게임은 README에서 **조선후기풍 대체역사**로 규정되어 있다. 따라서 한 왕대의 정확한 편제를 재현하기보다
조선 전기부터 후기까지 실제로 확인되는 무기·무예·편제를 북방 대체역사 전장에 재구성한다.
아래의 `MVP`와 `후속 보류` 구분은 교차검증과 사용자 결정으로 확정됐다. profile 집계는 ID 기준이며,
기존 `RaiderUnitType` ID는 저장 호환을 위해 개명하지 않고 표시명만 바꾼다.

### 4.1 공통·북방 세력 병과

| 병과 | 강점 | 약점 | 주요 역할 | 상태 |
|---|---|---|---|---|
| 경기병 | 최고 기동, 우회로 이동, 추격·약탈 | 창벽·밀집 사격·장기 근접전 | 측면 탐색, 후열 급습, 패주 추격 | MVP |
| 궁기병 | 이동 사격, 느린 보병 유인, 노출 후열 견제 | 방패 전열, 집중 사격, 거친 지형 | 견제 후 후퇴, 추격 유도 | MVP |
| 창기병 | 첫 충돌의 높은 충격력, 열린 전열 돌파 | 창보병·목책·준비 사격 | 충격 돌파 | MVP |
| 창보병 | 대기병, 전열 유지, 우회로 봉쇄 | 화살·총포, 느린 재배치 | 방진, 길목 차단 | MVP |
| 방패보병 | 화살 피해 경감, 뒤 병력 차폐 | 총포·화포, 측후방, 낮은 공격력 | 전진 엄호, 공성대 보호 | MVP — 니마차·마적 |
| 궁병 | 안정적 원거리 화력, 화약 불필요 | 근접 급습, 눈보라·야간, 방패 | 전열 소모, 말 사상 | MVP |
| 총포수 | 방패·갑옷 관통, 사기 충격 | 재장전, 화약, 악천후, 근접전 | 정예·방패 표적 | MVP — 마적 탈영병 한정, 북방 기본 편제 제외 |
| 파책조 | 갈고리·도끼·밧줄로 목책 압박 | 사격과 근접 모두 취약 | 방책 파괴 | MVP — 니마차·마적 |
| 척후대 | 우회로 발견, 기만 해제, 매복 보정 | 정면 전투력 낮음 | 정보전 | 후속 보류 |
| 군기·고수 | 주변 사기·명령 유지 | 직접 전투력 거의 없음, 고가치 표적 | 지휘 지원 | 후속 보류 |

#### 상성 원칙

- 경기병·궁기병은 **기동에서 강하고 접촉 고정에서 약하다**.
- 창기병은 준비되지 않은 전열에는 강하지만 목책과 대기병 창벽에는 손해를 본다.
- 창보병은 정면 대기병에 강하지만 방향을 잘못 잡으면 측면에서 이점을 잃는다.
- 방패보병의 차폐는 화살에는 강하고 조총·완구·화차에는 일부 또는 전부 무효다.
- 궁병과 총포수는 후열 급습·우회로 차단 실패 시 높은 손실을 입는다.
- 파책조는 기존 `wallBreakers`의 숫자 보너스가 아니라 실제 그룹으로 보이게 한다.

### 4.2 조정 토벌군 병과

| 병과 | 강점 | 약점 | 전술적 특색 | 상태 |
|---|---|---|---|---|
| 방패수 | 사수·포수 차폐, 화살 방호 | 총포·곡사·측면, 낮은 살상력 | 방패 전열 | MVP |
| 살수·창검보병 | 근접전과 방책 돌입 | 원거리 소모, 기병 충격 | 삼수군 근접축 | MVP |
| 사수 | 각궁 지속 사격 | 급습·악천후 | 삼수군 원거리축 | MVP |
| 포수 | 조총 관통과 일제 사격 | 화약·재장전·기상 | 삼수군 화기축 | MVP |
| 기창병 | 정면 기병 돌격 | 창벽·목책 | 충격 예비대 | MVP |
| 마상편곤 기병 | 방패·밀집 근접대 교란 | 장창·사격·지속전 | 희귀 정예 근접 기병 | 후속 보류 |
| 궁기병 | 기동 사격과 측후방 압박 | 창벽·집중 사격 | 기동 예비대 | MVP |
| 의원대 | 비전사 전력 손실 일부 복귀, 사기 유지 | 직접 전투력 없음, 후열 급습 | 장기전 지원 | Phase 8 |
| 불랑기·직사 화포 | 목책·고정 표적 파괴 | 이동·선회·근접 방어 | 직사 공성 | MVP, 판정 세분화는 Phase 8 |
| 완구 | 목책 너머 곡사, 후열·말·밀집대 위협 | 낮은 명중, 긴 재장전, 탄약 | 간접 화력 | 후속 보류 |
| 화차 | 밀집 진형 광역 제압과 사기 충격 | 고정 방향, 긴 준비, 급습에 취약 | 일제 포화 | Phase 8 |

#### 화포 차별화

- **직사 화포**: 목책 파괴가 주 임무. 방책이 남아 있으면 인명 피해 효율이 낮다.
- **완구**: 목책을 넘어 후열을 위협한다. 명중 편차가 크고 한 라운드에 연속 사격할 수 없다.
- **화차**: 특정 열의 밀집도에 비례해 효율이 오른다. 사격 방향을 바꾸거나 재장전하는 동안 취약하다.
- 세 병과를 한 전투에 모두 넣지 않는다. 강한 조정군도 화력 패키지 하나만 선택하는 것이 기본이다.

### 4.3 역사 근거와 해석 범위

- 조선 후기 훈련도감은 포수·사수·살수의 삼수군으로 조직되었다. 따라서 관군의 기본 혼성 편제로
  `포수 + 사수 + 살수`를 쓰는 것은 직접적인 근거가 있다.
- 『무예도보통지』 계열에는 기창·마상편곤과 다양한 보병 무예가 포함된다. 다만 마상편곤을
  토벌군의 일반 병과가 아니라 **희귀 정예 기병**으로 제한하는 것이 안전하다.
- 완구는 조선 전기부터 확인되는 화포이며 단석·비격진천뢰 등을 발사하는 곡사 화기로 해석할 수 있다.
- 화차는 다수 총통 또는 신기전 발사틀을 수레에 얹은 무기이며, 대량 일제 사격 병과로 번역하기 적합하다.
- 조선의 방패는 원방패·장방패, 후기의 등패·생우피방패·죽패 등 여러 형태가 확인된다.
- 1451년 실록에는 화차 좌우에 방패를 붙일 경우 기동성이 떨어진다는 논의가 있어,
  화차의 `방호 증가 ↔ 방향전환·이동 저하` 선택을 게임 규칙으로 번역할 수 있다.

### 4.4 확정 profile 범위와 보류 후보

- 북방·공통은 기존 profile ID 9개를 재매핑하고 `shield-infantry`, `deserter-musketeer`,
  `wall-breaker` 3개를 추가한다.
- 관군은 기존 profile ID 5개를 재매핑하고 `court-shield`, `court-horse-archer`, `court-medic`,
  `court-hwacha` 4개를 추가한다.
- 세력별 표시명은 오버라이드할 수 있지만 같은 병과의 profile ID를 세력마다 복제하지 않는다.
- 홀라온은 순수 기마 세력으로 유지하며 방패보병·파책조·총포수를 배정하지 않는다.
- 상세 ID별 표시명·세력·Phase의 기준표는 13.7절을 따른다.

- 너무 세분된 개별 냉병기: 낭선·당파·월도·쌍검을 각각 별도 병과로 만들지 않는다.
- 화포식언해에 등장하는 모든 총통·포를 별도 병과로 만들지 않는다.
- 완구·마상편곤·척후대·군기·고수는 MVP 타입에 넣지 않고 후속에서 판단한다.
- 지휘관·전령·고수를 처음부터 독립 부대로 만들지 않는다. 교리 시스템 검증 후 지원 병과로 판단한다.
- 적 의원이 전사자를 되살리게 하지 않는다. 전사자는 불변이며, `power`의 비전사 이탈분만 일부 회복한다.

---

## 5. 편제 생성기

### 5.1 목표

- **[확정]** 전투마다 모든 병과가 섞여 나오지 않는다.
- **[확정]** 같은 세력도 여러 종류의 조합을 가져야 한다.
- **[확정]** 한 전투는 3~6개 그룹, 그중 핵심 병과 2~4종과 지원 병과 0~1종으로 제한한다.
- **[확정]** 편제 템플릿을 먼저 고른 뒤 총 전력을 병과별 예산으로 분배한다.

### 5.2 자료구조

```ts
interface TacticalCompositionSlot {
  role: RaiderGroupKind;
  candidates: Array<{ unitType: RaiderUnitType; weight: number }>;
  powerShare: [min: number, max: number];
  required?: boolean;
  minThreat?: number;
}

interface TacticalCompositionTemplate {
  id: string;
  faction: string;
  doctrines: EnemyDoctrineId[];
  objectives: EnemyObjectiveId[];
  weight: number;
  slots: TacticalCompositionSlot[];
  exclusions?: RaiderUnitType[][];
}
```

### 5.3 편제 선택 순서

1. 세력·위협도·목적에 맞는 템플릿 후보를 만든다.
2. 동일 시드 RNG로 교리를 선택한다.
3. 교리와 호환되는 편제 템플릿 하나를 선택한다.
4. 템플릿의 필수 슬롯을 먼저 채운다.
5. 남은 전력 예산으로 선택 슬롯 0~2개를 채운다.
6. 계책을 구매한다. `wallBreakers`·`rearManeuver`처럼 실제 그룹/경로가 필요한 계책은
   편제와 충돌하면 구매하지 않는다.
7. 최소 1명 보정과 반올림 후 총 `power`·`count`가 원래 예산과 일치하는지 검증한다.

### 5.4 편제 템플릿 예시

#### 북방 기마 세력

- **기마 견제대**: 궁기병 중심 + 경기병 + 소수 창기병.
- **홀라온 충격 돌파대**: 창기병 중심 + 경기병 + 소수 궁기병. 보병은 포함하지 않는다.
- **약탈 우회대**: 경기병 증편 + 약탈조 2슬롯, 정면 주력은 얇음.
- **니마차 산림 침투대**: 보병 궁수 + 창보병 + 파책조, 말 비중이 낮음.

#### 변경 마적

- **치고 빠지는 약탈대**: 경기병 + 궁기병 + 약탈조.
- **혼성 탈영병대**: 창보병 + 궁병/총포수 + 기마 두목대.
- **야간 파책대**: 파책조 + 방패보병 + 소수 기병.
- **거짓 후퇴대**: 후속 보류. 추격 처벌 규칙이 깊어진 뒤 활성화한다.

#### 조정 토벌군

- **삼수진**: 포수 + 사수 + 살수, 지원 병과 없음.
- **방패 전진대**: 방패수 + 포수/사수 + 파책 살수.
- **화력 압박대**: 포수 + 화차 + 호위 살수. Phase 8에서 활성화한다.
- **기병익대**: 창보병 주력 + 기창병 또는 궁기병. 편곤기병은 후속 변형으로 둔다.
- **정규 공성대**: 방패수 + 파책조 + 직사 화포.
- **장기 토벌대**: 삼수진 + 의원. 다른 중화기 지원은 제외하거나 확률을 크게 낮춘다.

### 5.5 다양성 게이트

- 세력별 고정 시드 200개를 생성했을 때 최소 4개 이상의 편제 ID가 출현한다.
- 같은 세력·비슷한 전력에서 가장 흔한 템플릿의 비중이 45%를 넘지 않는다.
- 지원 병과는 전체 전력의 20%를 넘지 않는다.
- 화차·완구·직사 화포·의원이 한 전투에 동시에 등장하지 않는다.
- 기병 없는 편제와 기병 중심 편제가 모두 존재한다.
- 모든 편제는 플레이어가 현재 보유 가능한 대응 수단을 최소 하나 갖는다.

---

## 6. 적 교리와 라운드 행동

### 6.1 교리별 실제 행동

| 교리 | 실제 행동 | 강점 | 명확한 약점/대응 |
|---|---|---|---|
| 기마 견제 | 사격 후 후퇴, 노출 부대만 추격 | 느린 전열 소모 | 진형 유지, 궁·총 집중 사격 |
| 충격 돌파 | 한 구역·한 열에 돌격 집중 | 얇은 전열 파괴 | 창벽, 목책, 준비 사격 |
| 방패 전진 | 방패수가 사격대를 가리며 전진 | 화살 피해 억제 | 총포·화포, 측면 우회 |
| 파책 돌입 | 파책조가 방책 압박, 호위가 차폐 | 빠른 목책 붕괴 | 파책조 집중 표적, 수리 |
| 원거리 제압 | 궁·총포가 노출 열을 집중 사격 | 접근 전 소모 | 우회, 악천후, 방패 |
| 화력 지원 *(Phase 8 활성)* | 화차 사격 후 보병 전진 | 후열·밀집대 위협 | 기동 급습, 산개, 재장전 타이밍 |
| 예비대 역습 | 주력을 고정하고 정예대를 나중에 투입 | 플레이어 재배치 처벌 | 예비대 유지, 정찰 |
| 거짓 후퇴 *(MVP 보류)* | 일부가 퇴각해 전진을 유도한 뒤 역습 | 무리한 추격 처벌 | 위치 고수, 정찰 |

### 6.2 AI 상태

교리는 단순 수치 보정이 아니라 그룹의 라운드 행동을 정하는 상태 머신으로 구현한다.

```ts
type TacticalAiState =
  | 'forming'
  | 'probing'
  | 'engaging'
  | 'withdrawing'
  | 'committingReserve'
  | 'routeTransit'
  | 'routeEngagement'
  | 'exiting';
```

- **[권고]** 그룹은 `intent`를 계속 가지되, 교리가 라운드마다 intent 전환 가중치를 제공한다.
- **[권고]** AI는 플레이어 명령 확정 전에 잠긴 교리와 전투 상태만 읽는다.
- **[확정]** 플레이어의 이번 라운드 드래그 위치를 보고 즉시 카운터 편제를 바꾸지 않는다.
- **[권고]** 정찰 수준이 높으면 교리명과 다음 행동 징후가 공개된다.
- **[권고]** 교리의 약점은 정보 패널에 문장으로 드러내고 실제 판정에도 동일하게 적용한다.

### 6.3 기존 계책의 2단계 연결

- `rearManeuver`: 실제 좌/우 우회로 중 하나를 적이 개방하고 우회 그룹을 진입시킨다.
- `wallBreakers`: 실제 파책조 그룹을 편제에 포함한다. 수치 보너스만 붙이지 않는다.
- `fireArrows`: 궁병/궁기병 그룹의 특정 행동으로 나타난다.
- `feint`: 가짜 전력 표시뿐 아니라 예비대 투입 시점과 연결한다.
- `nightApproach`: 우회로와 전열 가시성에 영향을 주고 적 사격도 함께 약화한다. 준비 대응 뒤에도
  효과 배율이 0.5를 넘으면 야습에 성공한 것으로 보아 수동 배치를 생략하고 기존 기본 자동배치를 확정한다.

---

## 7. 무대 직접 조작

### 7.1 조작 원칙

- **[확정]** 진열 이동·방향전환·전진·후퇴를 무대에서 수행할 수 있어야 한다.
- **[확정]** 드래그 중 이동 가능한 위치를 하이라이트한다.
- **[확정]** 유효 위치 위에서는 결과 위치를 고스트로 표시한다.
- **[확정]** 지휘 단계에서는 마우스를 놓으면 명령 내용을 한 번 확인한 뒤 적용한다. 배치 단계는 즉시
  적용하되 카드로 되돌리기와 `배치 초기화`를 제공한다.
- **[확정]** 선택 부대 양옆에 방향전환 화살표를 표시한다.
- **[권고]** Pointer Events를 사용해 마우스와 터치를 같은 경로로 처리한다.

### 7.2 배치 단계 재설계

- **[확정]** 전투 생성 직후 전투 가능한 아군을 기존 위치에 미리 놓지 않는다.
- **[확정]** 지휘 가능한 부대는 하단의 `배치 대기` 카드 영역에서 시작한다.
- **[확정]** 카드를 무대의 유효 배치 위치로 드래그해 배치한다.
- **[확정]** 피난 주민만 예외로 중심지 최후열에 자동 고정한다.
- **[확정]** 자동배치 버튼을 제공하며, 자동배치 결과는 기존 기본 배치와 같아야 한다.
- **[확정]** 적의 야습이 성공하면 예외적으로 수동 배치 단계를 건너뛰고 기존 기본 자동배치를 확정한
  상태로 라운드 1 지휘 단계에 진입한다.

현재 `TacticalDefenderGroup.zoneId`와 `line`은 전투 생성 시부터 실제 배치로 취급된다. 이를 바로
`string | null`로 바꾸면 교전 판정 전역에 null 처리가 퍼지므로, 배치 단계 전용 상태를
`TacticalBattle`에 분리하는 방식을 권고한다.

```ts
interface TacticalDeploymentPlacement {
  zoneId: string;
  line: TacticalFormationLine;
  facing: TacticalFacing;
  routeId?: string;
  concealed?: boolean;
}

interface TacticalBattle {
  deploymentPlacements?: Record<string, TacticalDeploymentPlacement | null>;
}
```

- 그룹의 기존 `zoneId`·`line`에는 자동배치 시 사용할 권장 기본값을 유지한다.
- 배치 화면과 배치 완료 조건은 `deploymentPlacements`만 읽는다.
- `null`인 그룹은 예비대 카드에만 표시하고 무대·전투력 합산·표적 지정에서 제외한다.
- 배치 확정 시 placement를 그룹의 실제 `zoneId`·`line`·`facing`에 한 번 적용한다.
- 배치 확정 뒤에는 `deploymentPlacements`를 읽기 전용 기록으로 남기거나 제거한다. 전투 중 저장
  단순성을 위해 **읽기 전용으로 남기는 안**을 권고한다.
- 구버전 전투 저장에 필드가 없으면 현재 `zoneId`·`line`을 이미 배치된 placement로 합성한다.

### 7.3 일반 전투 부대 분할·합류

- **[확정]** 같은 병종 부대는 사냥 부대처럼 배치 단계에서 나눌 수 있다.
- **[권고]** 기존 `splitHuntGroup`·`mergeHuntGroups`의 인원·전력 비례 분배 코드를 공통 함수로 추출한다.
- **[권고]** `huntOriginGroupId`를 일반화한 `deploymentCohortId`를 추가한다.
- 같은 원래 조이면서 역할·무기·기마 상태가 같은 조각만 다시 합칠 수 있다.
- 부상·전사 발생 전인 배치 단계에서만 분할·합류할 수 있다.
- `1명 분리`, `반으로 나누기`, 호환 조각 `다시 합치기`를 카드 메뉴에 제공한다.
- 분할된 각 조각은 독립적으로 다른 구역·열·우회로에 배치하고 별도 명령을 받을 수 있다.
- 인원·전력·준비된 조총 수·residentIds 합계는 분할 전후 완전히 같아야 한다.

#### 분할 제한 권고

- 한 원래 조를 최대 3개 조각으로 제한한다.
- 전투 전체 지휘 가능 그룹 상한을 10개로 둔다.
- 치료반과 피난 주민은 분할하지 않는다.
- 1명짜리 특수주민만 남은 조를 다시 분할하지 않는다.

상한이 없으면 최적 플레이가 모든 병력을 1명 단위로 쪼개는 것이 되고 지휘 클릭도 폭증한다.
**[확정]** 한 원래 조당 최대 3개, 치료반·피난 주민을 제외한 지휘 가능 그룹 전체 최대 10개로 한다.

### 7.4 예비 부대 카드와 자동배치

배치 단계 하단은 `배치 대기`와 `배치 완료` 두 영역으로 나눈다.

- 배치 대기 카드: 병과, 인원, 무기, 기마 여부, 특수주민, 추천 열을 표시한다.
- 카드를 집으면 무대의 유효 배치 앵커가 켜진다.
- 유효 앵커 위에서는 실제 부대 대신 배치 고스트가 보인다.
- 배치 단계 드롭은 즉시 적용하며 카드에 구역·열·방향과 특수 상태를 갱신한다.
- 이미 배치된 부대를 다시 카드 영역으로 끌면 예비 상태로 되돌릴 수 있다.
- 피난 주민을 제외한 모든 전투 참여 그룹이 배치되기 전에는 `배치 완료`를 누를 수 없다. 치료반도
  후열 제한 안에서 반드시 배치하며, 미배치 예비대는 MVP에서 허용하지 않는다.
- 피난 주민은 잠긴 카드로 보여주되 드래그할 수 없다.

`자동배치`는 현재 코드의 기본 규칙을 순수 함수로 추출해 사용한다.

- 방어전 사냥꾼 → 접근로.
- 방어전 일반 전투조·치료반 → 방어선.
- 전투 대응에서 처음부터 징집한 소집 민병(`mode === 'levy'`) → 창고 주변 전열.
- 준비 행동으로 만든 긴급 소집 민병 → 방책 전열.
- 피난 주민 → 중심지 후열 고정.
- 기본 열: 창·근접 전열, 조총 중열, 활·사냥꾼·치료반 후열.
- 토벌전 모든 일반 전투조 → 진입로.

일반 전투에서는 자동배치 후에도 플레이어가 카드·무대 드래그로 자유롭게 수정할 수 있다. `배치 초기화`는
지휘 가능 부대만 다시 예비 카드로 돌리고 피난 주민 고정 배치는 유지한다. 야습 강제 자동배치에서는 이
수정 구간 자체를 건너뛴다.

#### 준비 행동 `민병 소집`의 카드 전환

현재 `musterMilitia`는 준비 실행 시 `긴급 소집 민병`을 `wall/front`에 즉시 생성하고
전장 스프라이트까지 나타낸다. 빈 전장 배치 규칙에서는 다음처럼 변경한다.

1. 준비 행동을 선택해도 실행 전까지는 카드와 주민 구성이 바뀌지 않는다.
2. 준비 실행 시 피난 주민 그룹에서 대상 residentIds를 빼고 `긴급 소집 민병` 그룹을 만든다.
3. 신규 그룹의 `deploymentPlacements[group.id]`는 `null`로 둔다.
4. 준비 실행 연출은 “방책 전선에 합류”가 아니라 “무기를 받아 배치 명령을 기다린다”로 바꾼다.
5. 준비 연출이 끝나고 배치 단계에 진입하면 하단 `배치 대기` 영역에 긴급 소집 민병 카드가 나타난다.
6. 플레이어가 카드를 직접 배치하거나 자동배치를 누르면 그때 처음 무대에 나타난다.
7. 자동배치 시에는 현행과 동일하게 방책 전열에 놓는다.

- 피난 주민 카드의 인원은 소집 인원만큼 즉시 줄어야 한다.
- 소집 민병 카드도 일반 민병처럼 분할·합류할 수 있다. 다만 처음부터 징집된 민병과 합칠지는
  `deploymentCohortId`가 다르므로 기본적으로 금지한다.
- 준비 실행 연출 중에는 아직 무대에 없는 groupId를 스프라이트 점멸 대상으로 사용하지 않는다.
  카드 등장 플로트 또는 예비대 영역 강조 연출을 사용한다.
- 전투 중 저장 시 소집된 residentIds, 줄어든 피난 주민, `null` placement를 함께 복원한다.

#### 적 야습 성공 시 강제 자동배치

적 `nightApproach`는 기존의 준비점수 감소·양측 사격 저하·적 첫 라운드 사기 보너스에 더해 배치 주도권을
빼앗는다.

1. 준비 행동 실행이 모두 끝난 시점에 `enemyPlanStratagemScale(plan, 'nightApproach')`를 계산한다.
2. 효과 배율이 **0.5 초과**면 야습 성공으로 판정한다.
3. `autoDeployTacticalGroups`를 즉시 실행해 모든 배치 대기 카드를 기존 기본 위치에 놓는다.
4. placement를 곧바로 확정하고 수동 배치·분할·방향 수정 화면을 건너뛴다.
5. `야습! 대열을 갖출 틈이 없습니다` 연출 뒤 라운드 1 지휘 단계로 진입한다. 첫 명령까지 빼앗지는 않는다.

현재 `torchWatch`의 준비 대응 강도는 0.6이므로 미대응 배율 1.0은 강제 자동배치를 일으키지만, 횃불 경계를
실행한 배율 0.4는 이를 막는다. 이때 나머지 야간 접근 효과는 40% 규모로 남는다. 임계값은
`CONFIG.tacticalBattle.enemyPlan.effects.nightApproach.forcedAutoDeployThreshold = 0.5`로 관리한다.

- 전투 상태에는 `forcedAutoDeployment: 'nightApproach' | null`을 저장해 연출·장계·저장을 결정적으로 복원한다.
- 구버전 전투에는 `null`을 합성한다.
- 야습 강제 자동배치에서도 피난 주민 최후열, 치료반 후열, 긴급 소집 민병 방책 전열 규칙을 지킨다.
- 자동배치 결과 자체는 일반 자동배치와 같은 순수 함수를 사용한다. 별도의 불리한 임의 배치는 만들지 않는다.

### 7.5 특수주민의 혼성 배치와 강조

현재 그룹 생성 키에 `special`이 포함되어 특수주민은 같은 직업·무기 주민과 별도 그룹이 된다.
2단계에서는 다음 규칙으로 바꾼다.

- **[확정]** 전투 배치 가능한 특수주민은 자기 역할·무기와 맞는 일반 주민 조에 포함한다.
- **[확정]** 특수주민의 특기는 그가 소속된 조 전체에 적용한다. 특기 설명의 “그의 무리는…”이라는
  서술을 실제 전투 규칙으로 보장하며 인원 비율·과반 조건을 두지 않는다.
- **[확정]** 무대에서는 특수주민 스프라이트를 같은 조 안에서 조금 더 크게 표시한다.
- **[확정]** 합류 호환 조건은 `role + readyWeapon + mount 여부`로 한다.
- 호환 일반 조가 없으면 특수주민 1인 카드로 남는다.
- 특수주민은 같은 전투조의 `residentIds`에 포함되며 별도 전력을 중복 생성하지 않는다.

```ts
interface TacticalFeaturedResident {
  residentId: number;
  special: SpecialResidentId;
  residentName: string;
  traitIds: string[];
}

interface TacticalDefenderGroup {
  featuredResidents?: TacticalFeaturedResident[];
  baseLabel: string;
  label: string;
}
```

- 렌더링 배율은 일반 주민 대비 1.12~1.18배로 하고 상시 소형 표식과 호버·선택 이름표를 함께 사용한다.
- 특수주민은 조의 가장 앞쪽 또는 중앙에 두고 z-index를 조금 높인다.
- 카드에는 초상/이름/특기 표식을 붙여 어느 조에 들어갔는지 알 수 있게 한다.
- 특수주민이 들어간 조의 이름은 `<주민 이름>의 <기본 조 이름>`으로 바꾼다. 예: `아라개의 창수비병조`.
- 일반 분할은 특수주민을 원본 조에 남기고 일반 residentIds부터 분리한다.
- 별도 메뉴 액션은 추상적인 `특수주민 분리`가 아니라 `<주민 이름>의 조 분리`로 표시한다.
  예: `아라개의 조 분리`.
- `<주민 이름>의 조 분리`는 해당 특수주민과 플레이어가 선택한 동료 0~2명을 새 조각으로 옮긴다.
  새 조각은 `<주민 이름>의 <기본 조 이름>`을 이어받고 원본은 일반 조 이름으로 돌아간다.
- 특기는 featured resident를 실제 포함한 명명 조에만 전체 적용된다. 분리 뒤 원본 일반 조에는 남지 않는다.
- MVP에서는 한 명명 조에 특수주민 한 명만 둔다. 서로 다른 특수주민의 명명 조끼리는 합치지 않는다.
- 특수주민이 들어간 조각을 합칠 때에도 featured resident ID가 중복되지 않아야 한다.
- 특수주민 개인의 기본 전력은 스냅샷 합산으로 한 번만 더하고, 특기 효과만 소속 조 전체의 capability와
  명령 가능 여부에 적용한다. 전력 수치를 인원수만큼 곱하지 않는다.

### 7.6 전투 종류별 배치 제한

#### 방어전

- 지휘 가능한 부대는 해당 전투의 모든 일반 구역에 배치할 수 있다.
- 피난 주민은 중심지 최후열 `towardEnemy` 방향으로 고정한다.
- 치료반은 선택 구역의 후열에만 배치할 수 있다.
- 열린 우회로가 있으면 해당 경로 입구도 유효 배치 앵커가 된다.

#### 토벌전

- **[확정]** 기본 배치는 진입로(`lairTrail`)에만 가능하다.
- 진입로 내부의 전열·중열·후열과 분할은 자유롭게 선택할 수 있다.
- **[확정]** 특정 전략을 채택하면 사냥꾼을 전방에 배치하고 은닉할 수 있다.
- **[확정]** 신규 준비 전략 `선행 침투`를 추가하며 비용은 준비점수 2로 한다.
- 전방 은닉 위치는 1차로 `lairWall`까지만 허용하고 `lairYard`·`lairKeep`은 금지한다.
- 전방 은닉은 사냥꾼 조각 1개, 최대 3명으로 제한한다.
- 은닉 조는 첫 행동 전까지 적 화면에서 숨고 첫 교전에서 매복 보너스를 받는다.
- 산채 경계도·정찰 실패·날씨에 따라 배치 중 발각될 수 있으며, 발각 시 은닉과 매복 보너스를 잃는다.
- 발각되더라도 부대가 삭제되거나 즉시 피해를 받지 않고 `노출된 전방조`로 전투를 시작한다.

`선행 침투`는 야간 습격·유인과 합치지 않는다. 전방 은닉 위치는 사냥꾼 조각 1개, 최대 3명으로 제한한다.

### 7.7 드래그가 의미하는 명령

| 시작/도착 | 배치 단계 | 지휘 단계 |
|---|---|---|
| 같은 구역, 다른 열 | 즉시 열 이동 | `redeploy` 예약 |
| 인접 구역, 같은 열 | 즉시 구역 배치 | `advance` 또는 `fallback` 예약 |
| 열린 우회로 입구 | 우회로 차단 배치 | 우회 기동 예약 |
| 같은 위치 | 선택만 유지 | 명령 없음 |
| 구역과 열을 동시에 변경 | 허용하지 않음 | 허용하지 않음 |

한 번의 드래그가 두 명령을 몰래 합치지 않게 하는 것이 중요하다. 구역 이동 뒤 열 이동은 다음 명령으로
따로 내려야 한다.

### 7.8 드래그 상태는 UI 전용

```ts
interface TacticalStageDragState {
  groupId: string;
  pointerId: number;
  origin: TacticalStageAnchor;
  hoverTarget?: TacticalStageAnchor;
  preview?: TacticalOrderPreview;
}

interface TacticalOrderPreview {
  command: 'deploy' | 'redeploy' | 'advance' | 'fallback' | 'enterRoute';
  destination: TacticalStageAnchor;
  powerPenalty: number;
  travelRounds: number;
  warning?: string;
}
```

- 드래그 상태와 고스트는 저장하지 않는다.
- 실제 상태는 확인 버튼을 누른 뒤 기존 게임 API를 통해서만 변경한다.
- `tacticalStageOrderUnavailableReason` 같은 순수 검증 함수를 만들고 버튼·드래그가 함께 사용한다.

### 7.9 확인 UI

지휘 단계에서는 브라우저 `confirm()`을 쓰지 않고 고스트 옆 소형 확인 카드로 표시한다. 배치 단계는
확인 카드를 띄우지 않고 즉시 적용하며 드래그백·배치 초기화로 되돌린다.

예시:

> 창 수비대 · 전열 → 중열
> 재배치 중 전투력 65% 감소
> `[취소] [재배치 확정]`

- 확인 전에는 게임 상태가 변하지 않는다.
- Escape·우클릭·무대 빈 곳 클릭은 취소한다.
- 연출 단계로 넘어가면 미확정 드래그를 자동 취소한다.
- 확인 후 선택 부대는 유지하고 고스트만 사라진다.

### 7.10 방향전환

기존 1단계의 “방향은 열에서 파생한다” 결정을 2단계에서 명시적으로 변경해야 한다.

```ts
type TacticalFacing = 'towardEnemy' | 'towardRear';

interface TacticalDefenderGroup {
  facing: TacticalFacing;
  pendingFacing?: TacticalFacing;
}
```

- 배치 단계 방향전환은 무료·즉시 적용.
- 지휘 단계 방향전환은 명령 확정 즉시 facing을 바꾸고 현재 라운드 판정부터 새 방향을 사용한다.
- 방향전환은 주 행동을 소비하지 않지만 현재 라운드의 유효 전투력에만 ×0.75를 적용한다. 중첩하지 않고
  라운드당 한 번만 적용하며 다음 라운드부터는 새 방향을 페널티 없이 유지한다.
- `reinforceRear`는 삭제하지 않고 `후방을 향해 교전에 합류`하는 편의 명령으로 유지한다.
- 후방을 향한 부대는 정면 공격에 노출되고, 정면을 향한 부대는 후방 급습에 노출된다.
- 좌·우 화면 방향은 방어/공격 orientation에 따라 달라지므로 저장 값은 `left/right`가 아니라 의미 기반 값으로 둔다.

### 7.11 접근성·회귀 조건

- 부대 클릭 팝오버와 하단 독은 유지한다.
- 키보드: 부대 선택 → 목적지 순회 → Enter → 확인의 동등 경로를 제공한다.
- 드래그 임계값 전에는 기존 클릭·팝오버 동작을 유지한다.
- 무대 가로 스크롤과 부대 드래그를 pointer capture와 이동 임계값으로 구분한다.
- `prefers-reduced-motion`에서는 고스트 이동 애니메이션을 줄인다.

---

## 8. 실제 우회로

### 8.1 핵심 규칙

- **[확정]** 플레이어도 후열 급습을 할 수 있다.
- **[확정]** 준비점수를 사용해 우회로를 열 수 있다.
- **[확정]** 적도 우회 전략을 쓰면 실제 우회로를 연다.
- **[확정]** 플레이어가 우회로를 열어 두면 미리 부대를 배치해 차단할 수 있다.
- **[확정]** 우회 중인 부대는 실제 경로를 따라 이동한다.
- **[확정]** 플레이어가 해당 우회로를 열거나 발견하지 못했다면 적 부대가 사라졌다가 후방에 나타나는 것처럼 보인다.
- **[확정]** 시뮬레이션 내부에서는 보이지 않는 경우에도 순간이동하지 않는다.

### 8.2 경로 수

**[권고]** 좌·우 두 개의 우회로를 둔다.

- 좌측: 숲 능선길 — 보병·척후에 유리, 기병 속도 제한.
- 우측: 하천 둑길 — 기병에 유리, 눈보라·해빙기에는 지연.

경로가 하나뿐이면 “열었는가”만 묻는 고정 정답이 된다. 두 경로는 어느 쪽을 열고 어느 쪽을 막을지
선택하게 한다. 실제 명칭과 지형 효과는 전투 날씨·지도 맥락에 맞춰 바꿀 수 있다.

### 8.3 자료구조

```ts
type TacticalRouteSide = 'left' | 'right';
type TacticalRouteIntel = 'unknown' | 'suspected' | 'revealed';
type TacticalRouteControl = 'neutral' | 'defender' | 'raider' | 'contested';

interface TacticalFlankRoute {
  id: string;
  side: TacticalRouteSide;
  label: string;
  terrain: 'woodedRidge' | 'riverBank';
  openedByDefender: boolean;
  openedByRaider: boolean;
  defenderIntel: TacticalRouteIntel;
  control: TacticalRouteControl;
}

interface TacticalRouteTransit {
  routeId: string;
  step: 0 | 1 | 2;
  destinationZoneId: string;
  visibleToDefender: boolean;
}
```

- 경로는 일반 `TacticalBattleZone`에 넣지 않는다. 압박·약탈·방책 수치를 가진 구역과 의미가 다르다.
- 경로 교전은 `resolveEngagementExchange`를 재사용하되 방책 압박과 구역 돌파 결과는 적용하지 않는다.
- `TacticalDefenderGroup`과 `TacticalRaiderGroup`에 선택 필드 `routeTransit?`를 추가한다.

### 8.4 준비점수와 개방

- 신규 준비 행동: `openFlankRoute`.
- 행동을 선택하면 좌/우 경로를 지정해야 하며, 지정 전에는 준비 확정을 막는다.
- **[권고 초깃값]** 경로 하나당 준비점수 2.
- 플레이어가 연 경로는 즉시 `revealed`가 되며 배치 단계에서 차단 부대를 놓을 수 있다.
- 양쪽 경로를 모두 열 수는 있지만 준비점수 4를 써야 하므로 다른 준비를 포기하게 된다.
- 적은 `rearManeuver` 계책을 보유하면 전투 생성 시 좌/우 한 경로를 이미 선택한다.

### 8.5 이동 시간

- 경로는 입구 → 중간 → 후방 출구 3단계로 표현한다.
- 보병은 기본 2라운드, 기병은 기본 1라운드에 통과한다.
- 숲 능선길의 기병은 2라운드, 하천 둑길의 보병은 2라운드를 유지한다.
- 눈보라·해빙기 효과는 이동을 최대 1라운드 늦출 수 있다.
- 이동 중인 부대는 정면 교전에 기여하지 않는다.

### 8.6 가시성

| 플레이어 상태 | 적 우회대 표시 |
|---|---|
| 경로 미개방·미발견 | 입구에서 사라지고 출구에서 출현. 중간 단계 비표시 |
| 징후만 탐지 | 미니맵에 `?`와 예상 도착 범위 표시 |
| 경로 개방 또는 완전 정찰 | 실제 경로와 현재 단계 표시 |
| 차단 부대 배치 | 적과 접촉 시 경로 교전 표시 |

- `nightApproach`는 `revealed`를 `suspected`로 한 단계 낮출 수 있지만, 플레이어가 직접 연 경로의
  실제 접촉까지 숨기지는 못한다.
- 보이지 않는 적의 상태는 UI에서만 숨긴다. AI·판정·저장은 항상 실제 `step`을 가진다.

### 8.7 차단과 경로 교전

- 플레이어 부대가 경로에 있으면 적 우회대와 중간 단계에서 교전한다.
- 승리한 측이 경로 통제권을 얻는다.
- 적이 이기면 차단 부대는 후퇴하고 적은 다음 단계에서 후열에 진입한다.
- 플레이어가 이기면 적은 입구로 밀려나거나 사기 상태에 따라 철수한다.
- 창보병은 기병 우회대를 막는 데 강하고, 궁병·총포수는 경로 단독 배치 시 근접에 취약하다.
- 경로 교전은 목책 압박을 만들지 않으며 중심지 약탈도 출구 도달 전에는 발생하지 않는다.

### 8.8 플레이어 후열 급습

- 플레이어가 연 경로에 전투 가능한 부대를 배치하고 `우회 기동`을 명령할 수 있다.
- 적 후열 도착 시 궁병·포수·완구·화차·의원을 우선 표적으로 지정할 수 있다.
- 적도 경로에 예비대를 놓았다면 중간에서 교전한다.
- 기병은 빠르지만 창보병 차단에 약하고, 보병 급습대는 느리지만 숲길에서 탐지되기 어렵다.
- 플레이어 급습대 역시 정면 전투에서 빠지므로 공짜 추가 화력이 아니다.

---

## 9. 전장·미니맵 표현

### 9.1 무대

- 선택 부대 주위에 드래그 손잡이 또는 옅은 링을 표시한다.
- 유효 열·인접 구역·열린 우회로 입구에만 하이라이트를 표시한다.
- 고스트는 원본보다 반투명하게 하고 `재배치`, `전진`, `후퇴`, `우회` 라벨을 붙인다.
- 선택 부대 좌우에 방향전환 화살표를 띄운다.
- 우회로가 공개됐을 때만 무대 가장자리의 분기 경로와 이동 중인 부대를 표시한다.
- 숨은 우회대 출현은 기존 `후방 급습!` 연출을 유지하되 실제 route transit 결과에서 발생시킨다.

### 9.2 미니맵

- 기존 직선 구역 스트립 위·아래에 좌/우 우회로 가지를 추가한다.
- 미개방 경로는 표시하지 않는다.
- 징후 단계는 점선과 `?`, 공개 단계는 실선과 부대 점으로 표시한다.
- 경로 차단·교전·돌파 상태를 중립/아군/적/교전 색으로 구분한다.
- 미니맵의 경로 노드 클릭은 해당 무대 경로로 카메라를 이동한다.

### 9.3 정보 패널

- 적 교리, 확인된 편제 핵심, 알려진 지원 병과, 우회 징후를 분리 표시한다.
- “강함”만 쓰지 않고 반드시 대응 약점을 함께 보여준다.
- 미확인 병과는 정확한 이름 대신 `기병 다수`, `중화기 징후`, `파책 도구`처럼 범주만 공개한다.

### 9.4 Codex/Fable 분업 및 통합 계획

여기서 **백엔드**는 서버를 뜻하지 않는다. 같은 클라이언트 저장소 안의 결정적 게임 도메인, 상태 전이,
전투 판정, 저장 마이그레이션, 순수 검증 함수와 자동 측정을 뜻한다.

#### 담당 원칙

| 영역 | 주 담당 | 책임 |
|---|---|---|
| 게임 백엔드 | **Codex** | 자료형, 병과·편제·교리, 배치·분할·방향·우회 판정, AI, 저장, 마이그레이션, 결정성·밸런스 테스트 |
| 프론트엔드 | **Fable** | React 화면, 카드 독, 무대 드래그·고스트·확인 UI, 미니맵, 정보 패널, 키보드·터치·접근성, CSS, 화면 QA |
| 스프라이트 | **Codex** | 병과별 픽셀 아트, 포즈 시트, 투명화·정렬·QC, 아틀라스·메타데이터·sprite key 등록 |
| 스프라이트 화면 통합 | **Fable** | Codex가 제공한 sprite key와 metrics를 사용한 배치, 선택 링, 확대·고스트·연출 표시 |
| 통합 판정 | 공동 | 백엔드 계약 테스트 통과 뒤 프론트 연결, 최종 빌드·전투 회귀·1280×720 화면 QA |

#### 파일 소유권

**Codex 전용 — 게임 백엔드:**

- `src/game/types.ts`, `config.ts`, `enemyPlan.ts`, `combatRoster.ts`, `combatCapabilities.ts`.
- `src/game/tactical*.ts`, 새 `tacticalUnits.ts`, `tacticalCompositions.ts`, `tacticalDeployment.ts`,
  `tacticalRoutes.ts`.
- `src/game/saveLoad.ts`, `saveSchema.ts`, `battleSimulation.ts`.
- `tools/game/test_tactical_*.mjs`, `measure_tactical_*.mjs`, 게임 fixture 생성부. 단 컴포넌트 소스 검사
  전용 테스트는 Fable 담당이다.

**Fable 전용 — 프론트엔드:**

- `src/components/TacticalBattleScreen.tsx`, `BattleSimulationSetup.tsx`, `TacticalBattleReportModal.tsx`.
- `src/components/tactical/**`의 React 컴포넌트·배치 보조·표시 문구.
- `src/styles/global.css` 전 구간. Codex는 CSS를 수정하지 않는다.
- `src/sound/sfx.ts`. Codex는 효과음을 직접 트리거하지 않고 전투 이벤트 kind만 계약으로 제공한다.
- `tools/game/test_tactical_components.mjs`와 신규 프론트 상호작용·접근성 테스트.

**Codex 전용 — 스프라이트:**

- `public/assets/tactical/**`의 신규 병과·포즈 시트와 최종 투명 PNG/WebP.
- `src/render/tacticalCharacterAssets.ts`, `tacticalSpriteMetrics.ts`, 필요한
  `tacticalBackgroundAssets.ts` 변경.
- `src/render/renderer.ts`에 전술전 확장 연출이 필요해지는 경우 해당 전술 구간.
- `src/render/atlas.ts`, `sprites.ts`의 전술 자산 등록 구간. 전술 자산 이외의 기존 등록은 건드리지 않는다.
- 생성 원본, 프레임 정렬 결과, 접촉 시트와 육안 QC 기록.

**통합 담당만 수정:**

- `package.json`, 앱 최상위 연결부, 이 계획서처럼 양쪽 변경을 동시에 설명하는 문서.
- 같은 파일을 두 작업자가 동시에 수정하지 않는다. 경계 변경이 필요하면 먼저 계약 요청을 남기고 담당자가
  작은 선행 커밋으로 제공한다.

#### 백엔드 → 프론트엔드 계약

Codex는 Fable이 UI를 붙이기 전에 다음 공개 계약을 컴파일 가능하고 테스트된 상태로 제공한다.

1. 자료형: `TacticalDeploymentPlacement`, `TacticalFeaturedResident`, `TacticalFacing`,
   `TacticalRouteState`, `TacticalRouteTransit`, 신규 전투 이벤트.
2. 조회: 배치 대기/완료 그룹, 유효 앵커, 방향, 경로 공개 상태와 명명 조 label을 안정적으로 읽을 수 있는
   selector 또는 직렬화 가능한 상태.
3. 명령: `autoDeployTacticalGroups`, 배치 검증·확정, 일반 분할·합류, `<이름>의 조 분리`, 방향전환,
   전진·후퇴, 우회로 진입을 위한 순수 검증 함수와 단일 mutation API.
4. 오류: 버튼과 드래그가 서로 다른 규칙을 구현하지 않도록 동일한 unavailable-reason API를 사용한다.
5. 이벤트: 야습 강제 자동배치, facing 변경, 경로 진입·발견·차단·후열 도착을 UI가 자체 추론하지 않고
   백엔드 이벤트에서 재생할 수 있게 한다.
6. fixture: Codex가 생성한 고정 전투 fixture로 빈 배치, 자동배치, 야습, 명명 조, 좌·우 우회로를 각각
   재현한다. Fable은 fixture를 읽을 수 있지만 기대 게임 상태를 직접 고치지 않는다.

Fable은 프론트에 필요한 필드가 빠졌다면 컴포넌트 안에서 전투 상태를 재계산하지 않고 계약 변경을 요청한다.
Codex는 공개 계약을 바꿀 때 자료형·fixture·게임 테스트를 같은 커밋에서 갱신한다.

#### 스프라이트 계약

- Codex가 확정 profile ID마다 `spriteKey`, 프레임 크기, anchor, facing/pose 지원 목록과 fallback을 제공한다.
- 신규 우선 자산은 `shield-infantry`, `deserter-musketeer`, `wall-breaker`, `court-shield`,
  `court-horse-archer`, `court-medic`, `court-hwacha` 7종이다.
- 기존 profile 재매핑은 실루엣이 충분하면 기존 시트를 재사용하고, 병과 구분이 안 될 때만 변형 프레임을
  추가한다.
- 특수주민은 기존 개별 포즈를 유지한다. Codex가 크기·anchor 안전 범위를 metadata로 주고 Fable은
  1.12~1.18배 표시, 소형 표식, 이름표와 선택 링을 UI에서 적용한다.
- Fable은 PNG 픽셀, 프레임 좌표, atlas key를 직접 수정하지 않는다. Codex는 React 배치·CSS를 직접
  수정하지 않는다.

#### 브랜치와 병합 순서

1. 현재 `codex/combat-expansion-phase-2`를 통합 브랜치로 둔다.
2. 이 계획서를 기준선 커밋한 뒤 같은 커밋에서
   `codex/combat-expansion-phase-2-backend`와 `fable/combat-expansion-phase-2-frontend`를 분기한다.
3. 두 담당자는 별도 worktree에서 작업한다. 같은 체크아웃을 번갈아 쓰지 않는다.
4. Codex가 먼저 Phase 0 기준선과 Phase 1 공개 계약·fixture를 통합 브랜치에 병합한다.
5. Fable은 그 계약 커밋을 받아 화면 셸과 fixture 기반 UI를 연결한다. 백엔드가 다음 Phase를 진행하는 동안
   프론트는 이전에 잠긴 계약 위에서 병렬 작업한다.
6. Phase별 병합은 `백엔드 계약/판정 → 백엔드 테스트 → 프론트 연결 → 프론트 테스트 → 통합 smoke` 순서다.
7. 바이너리 스프라이트 충돌을 피하기 위해 전술 PNG와 atlas metadata는 Codex 브랜치에서만 생성·교체한다.
8. 한 Phase의 계약이 통합 브랜치에 들어가기 전 다음 Phase 프론트가 임시 필드를 만들어 선행하지 않는다.

#### Phase별 주 담당

| Phase | Codex | Fable | 인계 기준 |
|---|---|---|---|
| 0 | 기준선·결정성·계약 초안 | 현행 UI 스크린샷·상호작용 목록 | 기준선 테스트와 UI 기준 화면 공유 |
| 1 | 병과 profile·편제·공개 상태·시뮬레이터 도메인 | EnemyPlanPanel·시뮬레이터 설정 UI | profile/plan fixture 고정 |
| 2 | 상성·교리 AI·상태 머신·측정 | 강점/약점·행동 징후·장계 표시 | 교리 이벤트와 공개 selector 고정 |
| 3 | 배치·분할·명명 조·야습 강제배치·저장 | 카드 독·자동배치·분할 UI·배치 화면 | deployment fixture와 mutation API 고정 |
| 4 | 무대 명령 검증 API | 드래그·고스트·확인·키보드·터치 | 같은 명령의 버튼/드래그 결과 일치 |
| 5 | facing 판정·×0.75·저장 | 방향 화살표·고스트·페널티 표시 | 방향 계약 테스트 고정 |
| 6 | 우회로 상태·준비점수·가시성 | 경로 무대·미니맵·징후 표시 | 경로 공개 fixture 고정 |
| 7 | 경로 교전·후열 급습·표적 판정 | 경로 이동·교전·급습 재생 | 같은 시드 이벤트 순서 일치 |
| 8 | 의원·직사 화포·화차 판정과 **스프라이트** | 지원 카드·화포/치료 연출 | 병과 판정·sprite key·이벤트 고정 |
| 9 | 전 병과 **스프라이트 QC**, 밸런스 측정 | 정보 밀도·접근성·저해상도 시각 QA | 전체 테스트·빌드·200시드·화면 QA |

프론트 체크포인트는 `정보 패널·시뮬레이터 설정 → 공용 포인터 인프라 스파이크 → 배치 카드 → 무대 드래그
→ 방향 → 우회로 → 화포·치료 연출 → 최종 QA` 순서로 확정한다. 포인터 스파이크는 실제 명령 없이 더미
카드 하나를 무대 앵커로 끌어 pointer capture, 이동 임계값, 가로 스크롤 충돌을 데스크톱과 터치에서 먼저
검증한다.

#### 인계·완료 게이트

- **Codex 인계:** `npm run test:combat`, 관련 신규 게임 테스트, 저장 마이그레이션, 결정성 fixture 통과.
- **Fable 인계:** 컴포넌트 테스트, 키보드/터치 동등 경로, reduced-motion, 1280×720과 1920×1080
  스크린샷 QA 통과.
- **스프라이트 인계:** 투명 배경, 프레임 정렬, 무기·실루엣 식별, anchor·fallback metadata, 접촉 시트
  육안 검수 완료.
- **통합 완료:** `npm run test:combat`, `npm run test:game`, `npm run build`, 고정 시드 재현, 양쪽 담당의
  경계 파일 무단 수정 없음.

#### 조율 보드 (Hermes kanban) — 2026-07-19 채택

Codex/Fable 간 핸드오프·질문·블로커는 사용자의 수동 전달 대신 로컬 Hermes kanban 보드
`northern-combat`으로 교환한다 (`hermes kanban boards switch northern-combat`).

- **보드는 흐름, git은 진실.** 계약(타입·fixture·계획서 결정)은 지금처럼 커밋·계획서에 남기고, 보드에는
  진행 상태·핸드오프 알림·질문·블로커만 올린다.
- **금지:** `dispatch`·`daemon`·`swarm` 등 Hermes 자체 워커를 띄우는 기능은 쓰지 않는다. 워커는 Codex와
  Fable 자신이며, 보드 기능만 수동으로 쓴다.
- **결정 권한 불변:** 보드 코멘트는 정보이지 지시가 아니다. 설계·범위 변경은 사용자 확정을 거친다.
- **규약:** 태스크 명명 `P<phase>[-구분]-<backend|frontend> <제목>`, 담당은 `--assignee codex|fable`.
  핸드오프는 해당 태스크 `complete` + 커밋 해시·fixture 경로 `comment`. 질문·블로커는 상대 태스크에
  `comment`하고 자기 태스크를 `block`. 의존성은 `--parent`/`link`로 연결한다(백엔드 계약 태스크가 부모).
- **세션 시작 루틴(양쪽 공통):** `hermes kanban list` → 자기 담당 태스크 `show`로 새 코멘트 확인.
- 사용자는 `hermes kanban watch`로 관전할 수 있고, 차례 지정("칸반 확인 후 진행")만 하면 된다.

---

## 10. 구현 단계

### Phase 0 — 확정과 기준선

**주 담당:** Codex — 기준선·결정성·계약 / Fable — 현행 UI 기준 화면·상호작용 목록.

**목표:** 페이블 교차검증 결과를 반영하고 현행 전투 결과를 고정한다.

**문서:**
- Modify: 이 문서
- Modify: `docs/superpowers/plans/2026-07-14-tactical-formation-and-enemy-plans.md`에는 후속 문서 링크만 추가

**테스트/측정:**
- 기존 `tools/game/fixtures/tactical_golden.json` 재채록 금지 상태로 기준선 실행.
- 세력별 현행 편제·교리·승률·사상률·평균 라운드 측정값 저장.
- 1280×720과 1920×1080 전술 화면 기준 스크린샷 확보.

**완료 조건:**
- [x] 역사 범위와 채택 병과 확정.
- [x] 방향전환은 현재 판정부터 새 방향 + 해당 판정만 전투력 ×0.75로 확정.
- [x] 좌·우 두 경로, 경로당 준비점수 2로 확정.
- [x] MVP 병과와 후속 병과 분리.
- [x] 원래 조당 3개·지휘 가능 그룹 10개·미배치 예비대 불허로 확정.
- [x] 특수주민 특기는 소속 조 전체 적용, 주민 이름을 붙인 명명 조로 확정.
- [x] 토벌전 사냥꾼 전방 은닉은 `선행 침투` 준비점수 2로 확정.
- [x] 민병 소집 상태 변경은 준비 실행 시, 카드 공개는 배치 단계 진입 시로 확정.
- [x] 야습 성공 시 기존 기본 자동배치를 강제 확정하고 수동 배치를 생략하는 것으로 확정.

### Phase 1 — 병과 프로필과 편제 생성기

**주 담당:** Codex 백엔드. Fable은 계약 fixture가 잠긴 뒤 EnemyPlanPanel과 시뮬레이터 설정 UI를 연결한다.

**Files:**
- Modify: `src/game/types.ts`
- Create: `src/game/tacticalUnits.ts`
- Create: `src/game/tacticalCompositions.ts`
- Modify: `src/game/tacticalBattle.ts`
- Modify: `src/game/enemyPlan.ts`
- Modify: `src/game/config.ts`
- Modify: `src/game/saveLoad.ts`, `src/game/saveSchema.ts`
- Modify: `src/game/battleSimulation.ts`
- Modify (Fable): `src/components/BattleSimulationSetup.tsx`
- Create: `tools/game/test_tactical_compositions.mjs`

**작업:**
- [x] 병과 태그·프로필 정의.
- [x] 기존 unitType을 새 프로필에 매핑해 결과 무변경 확인.
- [x] 교리·편제 템플릿 자료형과 결정적 선택기 추가.
- [x] `enemyPlanSummaryView(battle)`와 `enemyCompositionIntelView(battle)` selector 추가.
- [x] label·강점·약점·권장 대응을 판정 정의와 공유하는 교리 정의 조회 API 추가.
- [x] 프론트가 모르는 `TacticalAnimationEvent.kind`를 안전하게 건너뛰는 전방 호환 규칙과 테스트 추가.
- [x] 세력별 최소 4개 템플릿 추가.
- [x] 개발용 전투 시뮬레이터에 교리·편제 템플릿·우회로 강제 옵션 추가.
- [x] 편제 다양성·전력 보존·금지 조합 테스트.
- [x] 구버전 저장은 기존 unitType과 enemyPlan에서 기본 교리/편제를 합성.

**완료 조건:** 편제는 달라지지만 병과별 새 상성은 아직 적용하지 않아 총 전투 결과가 기준선 ±5% 이내.

**2026-07-19 백엔드 검증:** 고정 6시나리오 기준 라운드 수·아군 전사·적 사상은 기준선과 동일하고
아군 부상은 -5%다. 다만 관군 기병익대 1건이 `partialLoss → defenseSuccess` 임계값을 넘어 최종
밸런스 완료 판정은 보류한다. Phase 2 상성 수치를 넣기 전에 관군 무화포 편제의 목책 압박을 측정한다.

### Phase 2 — 병과별 교전 특성과 교리 AI

**주 담당:** Codex 백엔드. Fable은 강점·약점·행동 징후와 장계 표시를 맡는다.

**Files:**
- Modify: `src/game/tacticalEngagement.ts`
- Modify: `src/game/tacticalBattle.ts`
- Modify: `src/game/enemyPlan.ts`
- Modify: `src/game/config.ts`
- Create: `tools/game/test_tactical_unit_matchups.mjs`
- Create: `tools/game/test_tactical_doctrines.mjs`
- Create: `tools/game/measure_tactical_composition_balance.mjs`

**작업:**
- [ ] 사격·근접·돌격·대기병·차폐·공성 태그별 판정 추가.
- [ ] 교리별 intent 전환 상태 머신 추가.
- [ ] intent 최소 유지 라운드를 두어 상태가 매 라운드 진동하지 않게 한다.
- [ ] 파책조를 실제 그룹으로 전환.
- [ ] 적 정보판에 교리 강점·약점 표시.
- [ ] 적 그룹별 행동 이벤트와 장계 문구 추가.

**완료 조건:** 각 교리의 권장 대응이 무대응보다 통계적으로 유리하고, 반대 상성도 일방적 승리가 되지 않는다.

### Phase 3 — 빈 전장 배치·부대 분할·자동배치

**주 담당:** Codex — 배치 엔진·저장·계약 / Fable — 카드 독·분할·배치 UI.

**Files:**
- Modify: `src/game/types.ts`
- Create: `src/game/tacticalDeployment.ts`
- Modify: `src/game/tacticalBattle.ts`
- Modify: `src/game/tacticalHunt.ts`
- Modify: `src/game/tacticalAssault.ts`
- Modify: `src/game/enemyPlan.ts`, `src/game/config.ts`
- Modify: `src/game/saveLoad.ts`, `src/game/saveSchema.ts`
- Modify: `src/components/TacticalBattleScreen.tsx`
- Modify: `src/components/tactical/TacticalGroupChip.tsx`
- Modify: `src/components/tactical/TacticalZoneColumn.tsx`
- Create: `tools/game/test_tactical_deployment.mjs`
- Modify: `tools/game/test_tactical_battle.mjs`
- Modify: `tools/game/test_tactical_hunt.mjs`
- Modify: `tools/game/test_tactical_assault.mjs`

**작업:**
- [ ] `deploymentPlacements`와 배치 단계 전용 검증 함수 추가.
- [ ] UI를 붙이기 전에 생성 직후 기존 자동배치를 적용하는 스파이크로 기존 골든 테스트를 통과.
- [ ] 지휘 가능 부대를 모두 `null` placement로 시작하고 피난 주민만 중심지 후열에 고정.
- [ ] 기존 사냥 분할·합류 계산을 공통 함수로 추출하고 일반 방어전·토벌전에 연결.
- [ ] `deploymentCohortId`와 그룹/조각 수 상한 추가.
- [ ] 하단 배치 대기 카드·배치 완료 카드·배치 초기화 추가.
- [ ] 현재 기본 위치 규칙을 `autoDeployTacticalGroups` 순수 함수로 추출.
- [ ] 자동배치 결과가 현행 기본 배치와 완전히 같은지 고정 테스트.
- [ ] 모든 전투 참여 카드를 배치해야 완료되게 하고 미배치 예비대는 허용하지 않음.
- [ ] 특수주민을 호환 일반 조에 합치고 `featuredResidents`로 개별 보존하며 특기를 소속 조 전체에 적용.
- [ ] `<주민 이름>의 <기본 조 이름>`과 `<주민 이름>의 조 분리` 액션 구현.
- [ ] 명명 조 분리 시 특수주민 + 선택 동료 0~2명을 옮기고 특기·이름의 소유권을 함께 이전.
- [ ] 특수주민 스프라이트 1.12~1.18배, 소형 표식, 호버·선택 이름표와 전력·residentId 중복 금지.
- [ ] `musterMilitia`가 무대 배치 대신 `null` placement의 긴급 소집 민병 카드를 추가하도록 변경.
- [ ] 소집 연출 문구·카드 등장 연출·피난 주민 인원 감소 연결.
- [ ] 토벌전은 진입로 배치만 허용하고, 확정한 특정 전략에서만 사냥꾼 전방 은닉 배치 허용.
- [ ] `nightApproach` 효과 배율이 0.5를 넘으면 기존 기본 자동배치를 확정하고 배치 화면 생략.
- [ ] 횃불 경계 적용 후 배율 0.4에서는 강제 자동배치를 막되 나머지 야습 효과는 유지.
- [ ] 배치 중 저장·복원과 구버전 placement 합성.

**완료 조건:**
- 수동 배치 전 무대에는 지휘 가능 아군이 한 명도 표시되지 않는다.
- 피난 주민은 항상 중심지 최후열에 있고 이동·분할할 수 없다.
- 분할·합류 전후 residentIds·count·power·readyMuskets 합계가 동일하다.
- 민병 소집 후 카드는 생기지만 플레이어 배치 또는 자동배치 전에는 무대에 나타나지 않는다.
- 자동배치 후의 구역·열은 2단계 이전 기본 배치와 완전히 같다.
- 토벌전의 불법 전방 배치가 거부되고 허용 전략의 사냥꾼만 은닉 배치된다.
- 아군 10그룹 + 적 6그룹, 총 16그룹이 1280×720에서 겹쳐 선택 불가능해지지 않는다.
- 야습 성공 시 수동 배치를 건너뛰며, 횃불 경계 성공 시에는 정상 배치 단계가 열린다.

### Phase 4 — 무대 드래그와 고스트

**주 담당:** Fable 프론트엔드. Codex는 공용 명령 검증·mutation API와 계약 테스트를 제공한다.

**Files:**
- Create: `src/components/tactical/stageOrderPreview.ts`
- Create: `src/components/tactical/TacticalOrderConfirm.tsx`
- Modify: `src/components/tactical/TacticalZoneColumn.tsx`
- Modify: `src/components/TacticalBattleScreen.tsx`
- Modify: `src/styles/global.css`
- Create: `tools/game/test_tactical_stage_orders.mjs`
- Modify: `tools/game/test_tactical_components.mjs`

**작업:**
- [ ] Pointer Events 기반 선택·드래그·취소.
- [ ] 예비 부대 카드를 유효 배치 앵커로 드래그.
- [ ] 배치된 부대를 예비 카드 영역으로 되돌리는 드래그.
- [ ] 유효 위치 하이라이트와 고스트.
- [ ] 지휘 단계 드롭 후 확인 카드. 배치 단계 드롭은 즉시 적용하고 되돌리기를 제공.
- [ ] 기존 배치·재배치·전진·후퇴 API 연결.
- [ ] 키보드 동등 경로.
- [ ] 하단 독과 팝오버의 동일 검증 함수 사용.

**완료 조건:** 취소 시 상태 불변, 확인 시 정확히 한 명령만 적용, 연출 중 조작 불가.

### Phase 5 — 명시적 방향

**주 담당:** Codex — facing 판정·저장 / Fable — 방향 화살표·고스트·페널티 표시.

**Files:**
- Modify: `src/game/types.ts`
- Modify: `src/game/tacticalBattle.ts`
- Modify: `src/game/tacticalEngagement.ts`
- Modify: `src/game/saveLoad.ts`, `src/game/saveSchema.ts`
- Modify: `src/components/tactical/TacticalZoneColumn.tsx`
- Modify: `src/components/TacticalBattleScreen.tsx`
- Modify: `tools/game/test_tactical_battle.mjs`

**작업:**
- [ ] `facing`, `pendingFacing` 추가와 구버전 기본값 합성.
- [ ] 좌우 방향전환 화살표.
- [ ] 명령 확정 즉시 facing 변경, 현재 라운드 판정에만 유효 전투력 ×0.75, 다음 라운드 페널티 해제.
- [ ] 정면/후방 노출을 열 자동 파생에서 방향 기반으로 전환.
- [ ] `reinforceRear` 호환 유지.

**완료 조건:** 방향을 잘못 둔 부대는 측후방 페널티를 받고, 돌려놓은 부대는 실제 후방 교전에 기여한다.

### Phase 6 — 우회로 자료구조·준비·가시성

**주 담당:** Codex — 경로 상태·준비점수·가시성 계약 / Fable — 무대 경로·미니맵·징후 표시.

**Files:**
- Modify: `src/game/types.ts`
- Create: `src/game/tacticalRoutes.ts`
- Modify: `src/game/tacticalBattle.ts`
- Modify: `src/game/enemyPlan.ts`
- Modify: `src/game/saveLoad.ts`, `src/game/saveSchema.ts`
- Modify: `src/components/tactical/TacticalMiniMap.tsx`
- Modify: `src/components/tactical/minimapGeometry.ts`
- Modify: `src/components/TacticalBattleScreen.tsx`
- Create: `tools/game/test_tactical_routes.mjs`
- Modify: `tools/game/test_minimap_geometry.mjs`

**작업:**
- [ ] 좌·우 경로 생성과 전투 생성 시 적 경로 잠금.
- [ ] 준비 행동과 경로 선택 UI.
- [ ] 경로 단계 이동과 날씨·기동력.
- [ ] unknown/suspected/revealed 표시 규칙.
- [ ] 전투 중 저장·복원.

**완료 조건:** 비공개 경로에서도 내부 이동 단계가 존재하고, 공개 경로에서는 같은 이동이 매 라운드 보인다.

### Phase 7 — 경로 교전과 플레이어 후열 급습

**주 담당:** Codex — 교전·표적·결정적 이벤트 / Fable — 이동·교전·급습 재생.

**Files:**
- Modify: `src/game/tacticalRoutes.ts`
- Modify: `src/game/tacticalEngagement.ts`
- Modify: `src/game/tacticalBattle.ts`
- Modify: `src/components/tactical/TacticalZoneColumn.tsx`
- Modify: `src/components/TacticalBattleScreen.tsx`
- Create: `tools/game/measure_tactical_route_balance.mjs`
- Modify: `tools/game/test_tactical_routes.mjs`

**작업:**
- [ ] 경로 차단 배치.
- [ ] 경로 중간 교전.
- [ ] 적 후열 진입과 기존 rear engagement 연결.
- [ ] 플레이어 우회대의 적 후열 급습.
- [ ] 정면 전력 이탈 비용 반영.
- [ ] 경로 통제와 퇴로 차단.

**완료 조건:** 우회는 성공 시 강하지만 정면 약화와 이동 시간 때문에 항상 정답이 아니어야 한다.

### Phase 8 — 지원·화포 병과

**주 담당:** Codex — 병과 판정과 스프라이트 / Fable — 지원 카드와 치료·화포 연출.

**Files:**
- Modify: `src/game/tacticalUnits.ts`
- Modify: `src/game/tacticalEngagement.ts`
- Modify: `src/game/tacticalBattle.ts`
- Modify: `src/game/config.ts`
- Modify: `src/components/tactical/TacticalZoneColumn.tsx`
- Modify: `src/render/tacticalCharacterAssets.ts`
- Modify (Fable): `src/sound/sfx.ts`
- Create: `tools/game/test_tactical_support_units.mjs`

**작업:**
- [ ] 관군 의원의 비전사 손실 회복.
- [ ] 직사 화포·완구·화차의 서로 다른 판정.
- [ ] 재장전·방향·탄약 또는 발사 횟수 제한.
- [ ] 화포 사격·곡사·화차 일제 사격 연출.
- [ ] 지원 병과 집중 표적과 우회 급습 가치.

**완료 조건:** 중화기는 보호받으면 위협적이지만 급습당하면 큰 전력 낭비가 된다.

### Phase 9 — 시각 자산·장계·최종 밸런스

**주 담당:** Codex — 스프라이트 QC·밸런스·장계 데이터 / Fable — UI 정보 밀도·접근성·화면 QA.

**Files:**
- Modify: 전술 캐릭터/화기 아틀라스와 메타데이터
- Modify: `src/components/tactical/EnemyPlanPanel.tsx`
- Modify: 장계 생성부
- Modify: golden fixture는 의도된 결과 검토 후에만 갱신

**작업:**
- [ ] 병과별 실루엣과 도구 식별.
- [ ] 교리·편제·우회 결과를 장계에 기록.
- [ ] 세력별 200시드 자동 측정.
- [ ] 1280×720 조작·겹침·스크롤 QA.
- [ ] 색상 외에도 아이콘·형태로 병과와 경로 상태 구분.

---

## 11. 테스트와 밸런스 게이트

### 11.1 필수 자동 테스트

- 편제 생성 결정성: 같은 입력·시드 → 같은 교리·편제·계책.
- 총 전력 보존: 그룹 power 합이 원래 예산과 일치.
- 인원 불변식: `0 <= killed <= count`, count는 전투 중 직접 감소하지 않음.
- 초기 배치: 지휘 가능 그룹 placement는 null, 피난 주민만 중심지 후열 고정.
- 자동배치: 기존 기본 구역·열과 완전히 동일.
- 분할·합류: residentIds·count·power·readyMuskets·featuredResidents 보존 및 중복 없음.
- 명명 조: `아라개의 창수비병조` 형식과 `아라개의 조 분리` 액션이 이름·residentId·특기 소유권을 보존.
- 민병 소집: 피난 주민 감소 + 긴급 소집 민병 카드 추가 + placement null.
- 특수주민: 호환 조에 한 번만 포함되고 일반 주민보다 크게 렌더링되며 특기가 소속 조 전체에 적용.
- 특수주민 분리: 명명 조만 특기를 유지하고 원본 일반 조에는 capability가 남지 않음.
- 토벌 배치: 진입로 외 배치 거부, 허용 전략의 사냥꾼 전방 은닉만 예외.
- 야습 배치: 배율 1.0은 강제 자동배치·배치 생략, 횃불 경계 후 0.4는 수동 배치 허용.
- 병과 상성: 창보병 대 기병, 방패 대 화살, 총포 대 방패, 급습 대 화포.
- 경로 이동: 공개 여부와 무관하게 같은 step 전이.
- 차단 교전: 승패에 따라 후퇴/후열 진입이 정확히 한 번 발생.
- 드래그 취소: 게임 상태 직렬화 결과 완전 동일.
- 드래그 확정: 하나의 pending order만 생성.
- 저장: 교리·편제·방향·경로 진행도·가시성 복원.
- 저장: `forcedAutoDeployment`와 명명 조의 baseLabel·featured resident 특기 복원.
- 구버전 저장: 신규 필드가 없으면 안전한 기본값 합성.

### 11.2 측정 매트릭스

- 세력 4종 × 편제 최소 4종 × 경보 유무 × 준비 대응 유무.
- 수동 배치/자동배치가 같은 placement일 때 전투 결과가 동일한지 비교.
- 분할 없음/2개 조각/최대 조각 수에 따른 지휘 부담과 전투 결과 비교.
- 같은 특수주민 명명 조의 1명/3명/대규모 편성에서 특기 효과와 전력 기여 비교.
- `nightApproach` 미보유/미대응/횃불 경계 대응에 따른 배치 단계 진입 여부·승률·사상률 비교.
- 방향 정면/후면 × 우회로 미개방/징후/공개/차단.
- 날씨 맑음/눈보라/해빙기.
- 플레이어 대응: 권장 대응/무대응/잘못된 대응.
- 최소 200시드 분포와 고정 시드 재현 결과를 함께 본다.

### 11.3 수치 게이트 초안

- 같은 총전력에서 편제에 따른 평균 승률 차이가 30%p를 넘지 않는다.
- 권장 상성 대응은 무대응보다 평균 사상자를 10~30% 줄인다.
- 우회 성공은 적 후열에 명확한 피해를 주되, 실패 시 정면 전력 이탈 이상의 손해를 준다.
- 특수주민 특기는 소속 조 전체의 명령·행동을 열지만 조 인원수만큼 원 전력 보너스를 복제하지 않는다.
- 야습 강제 자동배치의 평균 사상 증가가 무야습 대비 30%를 넘으면 강제배치를 없애기보다 기존
  첫 라운드 사기 보너스와 사격 페널티부터 낮춘다.
- 완구·화차의 단일 라운드 피해가 전투 전체 평균 사상의 40%를 넘지 않는다.
- 의원은 전사자를 복구하지 않고 총 전력 손실 완화가 10% 안팎을 넘지 않는다.
- 가장 흔한 편제가 세력별 전투의 45%를 넘지 않는다.

### 11.4 명령

```bash
npm run test:combat
node tools/game/test_tactical_compositions.mjs
node tools/game/test_tactical_unit_matchups.mjs
node tools/game/test_tactical_doctrines.mjs
node tools/game/test_tactical_deployment.mjs
node tools/game/test_tactical_stage_orders.mjs
node tools/game/test_tactical_routes.mjs
npm run test:game
npm run build
git diff --check
```

---

## 12. 리스크와 방지책

### 12.1 병과가 늘어도 결국 숫자 차이로만 보일 위험

- 정적 전투력 배율만 다르게 하지 않는다.
- 사격/근접/돌격/대기병/차폐/기동/공성 중 최소 하나의 행동 규칙이 달라야 병과로 채택한다.
- 적 정보판과 장계가 그 차이를 같은 용어로 설명해야 한다.

### 12.2 적 시스템이 목적·교리·편제·계책으로 과도하게 복잡해질 위험

- 플레이어에게는 한 문장 요약부터 보여준다.
  - 예: `목적: 돌파 · 교리: 방패 전진 · 확인 병과: 방패수/포수 · 계책 1개 미확인`
- 목적 1개, 교리 1개, 편제 1개, 계책 최대 3개라는 상한을 지킨다.

### 12.3 무대 드래그가 기존 스크롤·클릭과 충돌할 위험

- 포인터 이동 임계값 전에는 클릭으로 취급한다.
- 부대에서 시작한 포인터만 명령 드래그가 된다.
- 빈 무대 드래그는 기존 가로 스크롤을 유지한다.
- 고스트 단계에서는 게임 상태를 바꾸지 않는다.

### 12.4 방향전환이 클릭 노동이 될 위험

- 후방 위협이 없으면 기본 방향을 자동 유지한다.
- 권장 명령이 필요한 방향을 함께 제안한다.
- 배치 단계는 무료 회전한다.
- 지휘 단계는 주 행동을 유지하고 현재 라운드 판정에만 유효 전투력 ×0.75를 적용한다.

### 12.5 우회로가 항상 정답이 될 위험

- 준비점수를 소비한다.
- 이동 중 정면 전력에서 빠진다.
- 도착까지 시간이 걸린다.
- 적 예비대와 경로 차단에 패할 수 있다.
- 전투가 빨리 끝나면 도착 전에 무의미해질 수 있다.

### 12.6 화포가 전투를 단발 추첨으로 만들 위험

- 완구는 낮은 명중과 긴 재장전.
- 화차는 밀집대에만 높은 효율.
- 직사 화포는 방책·고정 표적 중심.
- 모두 후열 급습과 방향전환에 취약.
- 지원 병과 동시 출현을 제한한다.

### 12.7 부대 분할과 빈 전장이 배치 노동을 늘릴 위험

- 자동배치를 한 번에 제공하고 결과를 수동 수정할 수 있게 한다.
- 한 원래 조의 조각 수와 전체 지휘 그룹 수에 상한을 둔다.
- 분할 버튼은 `1명`, `절반`, `합류`를 우선 제공하고 특수주민 조에는 `<이름>의 조 분리`를 추가한다.
- 피난 주민과 치료반처럼 선택 의미가 없는 그룹은 자동 고정한다.
- 특수주민은 별도 1인 카드를 강제하지 않고 호환 조 안에서 강조한다.
- 민병 소집·특수주민 합류로 카드가 추가되면 배치 대기 영역을 짧게 강조한다.
- 자동배치 플레이와 세부 수동배치 플레이의 평균 전투력 차이가 지나치게 벌어지지 않게 측정한다.

### 12.8 야습 강제 자동배치가 준비 선택을 고정할 위험

- 강제 자동배치는 효과 배율이 0.5를 넘는 성공한 `nightApproach`에만 적용한다.
- 횃불 경계의 준비 대응 강도 0.6은 배율을 0.4로 낮춰 강제 자동배치를 확실히 막는다.
- 야습 자동배치는 기존 기본 배치만 사용하며 추가로 불리한 무작위 위치를 만들지 않는다.
- 수동 배치만 생략하고 라운드 1의 지휘 명령은 보장한다.
- 장계와 준비 카드에 `야습 성공 시 수동 배치 불가`를 사전에 명시한다.

---

## 13. 페이블 교차검증 요청 목록

페이블에는 단순 찬반보다 아래 질문에 대한 반례와 대안을 요청한다.

### 역사·병과

1. 조선후기풍 대체역사에서 삼수군·화차·완구·마상편곤을 함께 쓰는 범위가 납득 가능한가?
2. `팽배수`를 공식 병과명으로 쓸지, `방패수/등패수`로 부르는 편이 정확한가?
3. 여진·북방 세력의 보병·기병 조합에서 과장되거나 빠진 핵심 병과가 있는가?
4. 갈고리·도끼 파책조를 독립 그룹으로 보는 것이 좋은가, 기존 계책 부착물로 두는 것이 좋은가?
5. 완구·화차·직사 화포의 게임상 역할 구분이 역사적 성격과 크게 충돌하지 않는가?

### 시스템 구조

6. 목적/교리/편제/계책 4분리가 불필요하게 복잡한가? 합쳐야 할 축이 있는가?
7. 한 전투 3~6그룹, 핵심 2~4병과, 지원 0~1이라는 상한이 적절한가?
8. 방향을 명시 필드로 바꾸는 것이 기존 3열·후방 교전보다 명확한가?
9. 방향전환이 한 라운드 행동을 소비해야 하는가, 전투력 페널티만 받아야 하는가?
10. 구역과 열을 한 드래그에서 동시에 바꾸지 못하게 하는 제한이 답답한가?

### 우회로

11. 좌·우 두 경로가 의미 있는 선택을 만드는가, 하나의 경로와 정찰 수준만으로 충분한가?
12. 플레이어가 경로를 열면 적 이동을 완전히 볼 수 있다는 규칙이 너무 강한가?
13. 기병 1라운드/보병 2라운드 이동이 현행 최대 5라운드 전투에서 적절한가?
14. 준비점수 2점이 다른 준비 행동과 비교해 적절한가?
15. 경로 교전을 일반 구역과 분리한 자료구조가 타당한가?

### UX·범위

16. 매 드롭 확인이 안전성보다 피로를 더 크게 만드는가? 반복 확인 생략 옵션이 필요한가?
17. 직접 조작 도입 뒤 하단 명령 바를 어느 정도까지 남겨야 하는가?
18. MVP에서 제외해야 할 병과·교리·화포가 무엇인가?
19. Phase 순서에서 먼저 검증해야 할 가장 큰 기술적 위험은 무엇인가?
20. 현재 계획에서 테스트로 잡히지 않는 실패 모드는 무엇인가?
21. 일반 부대 분할 상한을 원래 조당 3개·전투 전체 10개로 두는 것이 적절한가?
22. 모든 전투 가능 부대를 반드시 배치해야 하는가, 일부를 미배치 예비대로 남길 수 있어야 하는가?
23. 특수주민 한 명의 매복·정찰 능력이 혼성 조 전체 명령을 열어야 하는가, 인원 비율 보정만 줘야 하는가?
24. 특수주민 스프라이트 1.12~1.18배 강조가 충분한가, 별도 테두리·이름표도 필요한가?
25. 토벌전 사냥꾼 전방 은닉을 별도 `선행 침투`로 만들지, 기존 `야간 습격/유인`에 연결할지?
26. 민병 소집 카드는 준비 연출 직후 나타나야 하는가, 배치 단계 진입 순간에 나타나야 하는가?
27. 자동배치가 기존 배치를 그대로 복원하는 것 외에 교리 대응형 스마트 배치도 제공해야 하는가?

---

## 13.5 페이블 교차검증 회신 (2026-07-19)

> 코드 대조 결과: 이 문서가 인용한 현행 구조(준비점수 경제 `prep.max 8`·행동별 비용, `musterMilitia`가
> `wall/front`에 즉시 그룹을 생성하는 동작, `splitHuntGroup`의 `deployment·round 1·사상자 없음` 제약,
> `rearAssault`가 열·명령에서 파생되는 방식, `GROUP_POWER`·계책 비용표)는 모두 실제 코드와 일치한다.
> `npm run test:combat`·`test:game` 스크립트도 존재한다. 아래는 13절 질문 번호별 회신이다.

### 역사·병과

1. **납득 가능.** 삼수군(1593 훈련도감)·화차(전기 이래 개량 지속)·완구(전기)·마상편곤(후기 기병 무예)은
   17세기에 실제로 공존한 체계다. 완구의 대인 곡사 해석은 대완구로 발사한 비격진천뢰(경주성, 1592)에
   근거가 있으므로, 장계·툴팁에서 '진천뢰'류 표현을 쓰면 해석의 근거가 드러난다. 마상편곤의 희귀 정예
   제한은 계획대로.
2. **'방패수' 권고.** '팽배수'는 조선 전기 오위 병종 용어라 후기풍 기조와 어긋난다. 표시명은 방패수,
   도감·설명에서 등패·장방패를 언급한다. '등패수'는 정확하지만 플레이어에게 낯설다.
3. **큰 누락 없음.** 여진 중갑 돌격 기병은 '창기병'이 담당하면 충분하고, 니마차(산림)·홀라온(기마)
   구분은 템플릿 방향과 일치한다. 한 가지 주의: **북방 세력에 총포수를 넣지 말 것.** 관군만 화기를 갖는
   비대칭이 이 게임의 전술 정체성에 유리하다. 변경 마적 '혼성 탈영병대'의 소수 총포수만 탈영병 서사로
   예외 허용.
4. **독립 그룹 권고(계획안 지지).** 집중 표적·우회 급습의 대상이 되어야 대응 놀이가 성립한다.
   `wallBreakers` 계책은 '편제에 파책조 슬롯을 추가하는 트리거'로 재정의.
5. **충돌 없음.** 직사=파벽, 완구=곡사 대인·후열, 화차=밀집 제압은 실제 용도(행주대첩 화차, 비격진천뢰)와
   부합한다.

### 시스템 구조

6. **4축 분리 타당.** 다만 `objectiveRevealed`·`doctrineRevealed`·`compositionRevealed` 세 boolean은
   초기값을 기존 `intelLevel`(0~4) 임계값에서 파생시키고, 전투 중 이벤트(정찰·계책 카운터)로만 갱신하기를
   권고 — 공개 규칙이 한 곳에 모인다.
7. **상한 적절.** 단 적 최대 6그룹 + 아군 지휘 그룹 상한 10이면 무대에 최대 16개 그룹이 선다.
   1280×720 겹침 QA를 Phase 3 완료 조건에 포함할 것.
8. **명시 facing이 낫다.** 현행 `line + reinforceRear` 파생은 우회로·플레이어 급습이 생기는 순간 표현력이
   부족해진다. 2값(towardEnemy/towardRear) 유지, 4방향 확장 금지 동의.
9. **전투력 페널티 방식 권고(행동 소비 반대).** maxRounds 5에서 행동 소비형 방향전환은 실질 2라운드
   손실이라 사실상 쓰이지 않는 버튼이 된다. 또 `reinforceRear`(이동+후방 합류)와 기능이 충돌한다.
   '주 명령 유지 + 그 라운드 전투력 25% 감소 + 다음 라운드부터 새 방향' 안을 기본으로.
10. **답답하지 않다.** 라운드가 자원인 게임에서 '이동에도 비용이 있다'를 명확히 하는 제한이다. 유지.

### 우회로

11. **2개 유지 권고.** MVP에서 좌/우 지형 차이는 '병종별 통과 라운드 수'만 두고 날씨 상호작용은
    후속으로 미뤄도 선택 구조가 성립한다.
12. **과하지 않다.** 준비점수 2가 대가이고 `nightApproach` 강등이 카운터로 이미 있다. 유지.
13. **기병 1라운드 적절, 보병 2라운드는 분업으로 수용.** 보병의 공격적 우회는 한계 효용이 낮겠지만
    이는 버그가 아니라 역할 분화다: 창보병은 배치 단계 **차단 배치**(이동 라운드 0), 기병은 급습 기동.
    `measure_tactical_route_balance.mjs`에 보병 급습 사용률·성공률을 별도 지표로 넣고 낮으면 그대로 수용.
14. **2점 적절.** `setAmbush`·`prepareVolley`(각 2점)와 균형이 맞고, 기습(기본 1점)에서는 열 수 없는 것도
    경보 체계의 가치를 높여 오히려 좋다.
15. **분리 타당.** 구역의 pressure/loot/breach 의미론과 다르다. `resolveEngagementExchange` 재사용 +
    구역 결과 미적용 계획 지지.

### UX·범위

16. **배치 단계는 확인 생략, 지휘 단계만 드롭 확인.** 배치는 배치 완료 전까지 자유 수정이 가능하므로
    즉시 적용 + 되돌리기(카드로 드래그백·배치 초기화)로 충분하다. 이러면 확인 피로 대부분이 사라져
    '반복 확인 생략 옵션'이 필요 없다.
17. **하단 독 전량 유지.** 접근성 폴백이 [확정]이기도 하다. 축소는 무대 조작 정착 후 별도 판단.
18. **MVP 제외 권고:** 척후대(정찰 기능은 intelLevel로 대체 가능), 완구(화차만 먼저 — '밀집에 강함'이
    더 읽기 쉬운 규칙), 마상편곤(Phase 8 이후), 군기·고수(보류 확정), 교리 `feignedRetreat`(현행 추격
    메커닉이 얕아 처벌 대상 행동이 불명확). → MVP: 공통 8종 + 관군 9종(직사 화포·화차 포함), 교리 6종
    (`fireSupport`는 화포와 함께 Phase 8 합류).
19. **최대 기술 위험은 Phase 3(빈 전장 배치).** zoneId/line을 읽는 판정 전역, 세 전투 종류, 전투 중
    저장, musterMilitia 순서에 모두 닿는다. 착수 전 스파이크 권고: UI 없이 `deploymentPlacements` 도입
    + '생성 직후 자동배치 즉시 적용' 경로로 골든 테스트를 먼저 통과시키는 커밋을 만들고 그 위에 카드
    UI를 얹을 것. 2순위 위험은 Phase 4의 드래그 vs 가로 스크롤 충돌 — 터치 프로토타입을 앞당길 것.
20. **테스트가 못 잡는 실패 모드:**
    - 분할·합류로 group id가 바뀐 뒤 UI 선택·팝오버·`targetGroupId`가 stale id를 참조하는 동기화 문제
      (직렬화 비교로는 안 잡힘 — 판정은 `normalizeTacticalGroupTargets`가 막지만 UI 선택 상태는 별개).
    - 신버전에서 저장한 전투 중 세이브를 구버전이 여는 역방향 호환(재생 큐의 신규 event kind).
    - `reallocateHuntMusketReadiness` 일반화와 라운드별 화약 소모의 상호작용.
    - 교리 상태 머신의 라운드별 intent 진동(히스테리시스 필요 — 전환 최소 유지 라운드를 두고 테스트).
    - 그룹 수 증가로 라운드 재생 총 시간이 늘어나는 페이싱 저하 — 라운드당 재생 ms를 측정 지표에 추가.
    - 키보드 경로와 드래그 경로가 다른 검증을 타는 회귀 — 두 경로가 같은 검증 함수를 쓰는지 확인하는
      테스트를 명시적으로 둘 것.
21. **적절.** 현행 방어전 기본 그룹 수(4~7)에 분할 여지를 더해도 상한 10이면 감당 가능. 단 '전체 10'은
    치료반·피난 주민을 제외한 **지휘 가능 그룹 기준**임을 명시할 것.
22. **MVP는 전원 배치 의무 권고.** 전투 중 신규 투입 경로가 없는 설계에서 미배치 예비대는 순수 손해라
    함정 선택지다. 아군판 '지연 투입' 메커닉을 붙일 때 재검토.
23. **과반 규칙 + 분리 활용 권고.** 조 전체 매복 명령은 능력 보유 인원이 과반일 때만 열리고, 특수주민
    1인의 매복을 쓰려면 분할로 소분견을 만들면 된다(1명 분리를 이미 지원). 개인 전투력 기여는 스냅샷
    합산 유지 — 별도 비율 보정 수식이 필요 없어진다.
24. **배율만으로는 부족할 가능성이 높다.** 전술 스프라이트 크기에서 12~18%는 미묘하다. 배율 + 상시
    소형 표식(머리띠·깃 1~2px 포인트) + 호버/선택 시 이름표 권고. 상시 테두리는 시각 소음이라 반대.
25. **신규 `선행 침투`(2점) 권고.** 야간 습격에 붙이면 효과 과적, 유인에 붙이면 서사가 어긋난다.
    준비점수 경제가 빠듯한 것 자체가 이 선택의 의미다.
26. **상태 변경은 준비 실행 시, 카드 노출·강조는 배치 단계 진입 순간.** '연출 중 무대에 없는 groupId를
    참조하지 않는다'는 7.4 원칙과 일치한다.
27. **MVP는 현행 복원 자동배치만.** 교리 대응은 정보 패널의 '권장 대응' 문장으로 제공하고 자동 배치화하지
    않기를 권고 — 스마트 배치가 최적이 되는 순간 직접 조작 시스템 전체가 장식이 된다.

### 질문 목록 밖 추가 권고

- **개발용 전투 시뮬레이터 확장 누락:** `src/game/battleSimulation.ts`·`BattleSimulationSetup.tsx`에
  교리·편제 템플릿·우회로 강제 옵션을 추가하는 항목을 Phase 1~2 파일 목록에 넣을 것. 매치업 QA의
  가장 빠른 경로다.
- **구버전 '전투 중 저장'의 우회대:** 기존 순간이동식 `rearAssault` 전투는 transit을 합성하지 말고
  그 전투에 한해 레거시 동작을 유지하는 편이 안전하다(전투 단위 플래그).
- **maxRounds 5 전제:** 측정에서 우회·화포가 조기 종료로 무의미해지는 비율이 높으면, 통과 라운드
  단축보다 `maxRounds`(5→6) 조정을 먼저 검토하는 편이 부작용이 적다.

---

## 13.6 Codex 재회신 (2026-07-19)

> 아래 내용은 페이블 회신에 대한 기술 검토 결과다. **사용자의 최종 결정은 아니며**, 14절의 최종 결정
> 열은 사용자가 확정하기 전까지 유지한다. 다만 구현 계획 정합화를 위해 채택 가능한 권고와 추가 확인이
> 필요한 지점을 구분한다.

### 그대로 채택할 권고

1. 후기풍 표시명은 `팽배수`보다 `방패수`를 사용한다. 등패·장방패는 도감 설명으로 남긴다.
2. 북방 세력은 총포수를 기본 편제에서 제외한다. 총포는 관군의 비대칭 강점으로 두고, 변경 마적의
   `혼성 탈영병대`만 서사적 예외로 허용한다.
3. 파책조는 독립 그룹으로 유지하고 `wallBreakers`는 파책조 슬롯을 편제에 추가하는 계책으로 정의한다.
4. 목적·교리·편제·계책의 4축 분리와 `towardEnemy | towardRear` 2값 facing을 채택한다. 4방향 확장은
   하지 않으며, 한 드래그에서 구역과 열을 동시에 바꾸지 않는 제약도 유지한다.
5. 방향전환은 주 행동을 없애지 않고 **해당 판정 라운드의 유효 전투력에 0.75를 곱한다.** 중첩 감산은
   금지하며 한 라운드에 한 번만 적용한다.
6. 우회로는 좌·우 2개, 경로당 준비점수 2점, 기병 1라운드·보병 2라운드 통과를 기준선으로 둔다.
   경로 교전 자료구조는 일반 구역과 분리하되 교전 계산기는 재사용한다.
7. 배치 단계의 드롭 확인은 생략하고 카드로 되돌리기와 `배치 초기화`를 제공한다. 전투 지휘 단계에서만
   드롭 확인을 유지하며, 하단 명령 독과 키보드 경로는 전량 유지한다.
8. 분할 상한은 원래 조당 3개, 치료반·피난 주민을 제외한 지휘 가능 그룹 전체 10개로 둔다. MVP에서는
   모든 지휘 가능 부대를 배치해야 전투를 시작할 수 있고 미배치 예비대는 허용하지 않는다.
9. 특수주민의 조 단위 특수 명령은 능력 보유 resident가 해당 조의 과반일 때만 연다. 1명의 능력을
   활용하려면 배치 단계에서 소분견으로 분리한다. 표시 방식은 1.12~1.18배 확대 + 상시 소형 표식 +
   호버·선택 이름표를 채택하고 상시 테두리는 쓰지 않는다.
10. 토벌전 사냥꾼 전방 은닉은 별도 준비 전략 `선행 침투`로 만들고 비용은 2점으로 시작한다.
11. 민병 소집은 준비 실행 시 주민·그룹 상태를 변경하고, 준비 연출이 끝난 뒤 배치 단계에 진입할 때
    `null` placement의 긴급 소집 민병 카드를 노출·강조한다. 직접 배치 또는 자동배치 전에는 무대에
    스프라이트를 만들지 않는다.
12. 자동배치는 MVP에서 현행 기본 배치 복원만 지원한다. 교리 대응은 정보 패널의 권장 문장으로 제공하고
    스마트 자동배치는 보류한다.

### 범위 축소에 대한 동의

- MVP에서 척후대, 완구, 마상편곤, 군기·고수, `feignedRetreat`를 제외하는 데 동의한다.
- 직사 화포와 화차를 먼저 구현하고, `fireSupport` 교리는 화포 구현 Phase에 합류시킨다.
- 다만 `공통 8종 + 관군 9종`은 중복 병과 포함 여부가 읽는 사람마다 다르게 해석될 수 있다. 다음 회신에서는
  **MVP 실제 병과 ID, 표시명, 사용 세력, 구현 Phase**를 한 행씩 적은 확정 후보표를 요청한다.

### 구현 순서와 검증에 추가할 항목

1. Phase 3 착수 전에 UI 없는 `deploymentPlacements` 스파이크를 만든다. 생성 직후 기존 자동배치를 적용한
   상태로 기존 골든 테스트를 먼저 통과시킨 뒤 빈 전장·카드 UI를 얹는다.
2. Phase 3 완료 조건에 아군 지휘 그룹 10 + 적 그룹 6, 총 16그룹의 1280×720 겹침·선택·스크롤 QA를
   명시한다.
3. `src/game/battleSimulation.ts`와 `BattleSimulationSetup.tsx`에 교리·편제 템플릿·우회로 강제 옵션을
   추가해 매치업과 경로 밸런스를 재현할 수 있게 한다.
4. 분할·합류 뒤 stale group id가 UI 선택·팝오버·`targetGroupId`에 남지 않도록 동일한 정규화 함수를
   키보드와 드래그 경로 양쪽에서 사용하고 전용 UI 상태 테스트를 둔다.
5. 교리 intent에는 최소 유지 라운드를 두고 진동을 검사한다. 측정 결과에는 라운드당 재생 시간과 보병
   우회 사용률·성공률을 추가한다.
6. 기존 순간이동식 `rearAssault`가 저장된 전투는 전투 단위 레거시 플래그로 기존 동작을 유지한다.
   새 transit을 억지로 합성하지 않는다.
7. `maxRounds`는 우선 5를 유지한다. 우회·화포가 조기 종료 때문에 무의미해지는 비율이 측정으로 확인될
   때만 6라운드를 검토한다.

### 페이블 재확인 요청

1. `공통 8종 + 관군 9종`의 정확한 병과 ID 목록과 중복 집계 기준을 제시해 달라.
2. 방향전환은 명령을 확정한 현재 라운드 판정 전에 facing이 바뀌고 그 판정에 25% 페널티가 적용되는 것으로
   해석했다. 회신의 “다음 라운드부터 새 방향”이 **시각 전환만 즉시·판정 방향은 다음 라운드**라는 뜻인지,
   아니면 **현재 판정부터 새 방향·현재 판정만 페널티**라는 뜻인지 명확히 해 달라. 후자를 권고한다.
3. `objectiveRevealed`·`doctrineRevealed`·`compositionRevealed`를 저장 필드로 중복 보유할지, `intelLevel`과
   전투 중 공개 이벤트에서 계산하는 단일 공개 상태를 둘지 구체적인 단일 진실 공급원을 제안해 달라.
4. 저장 호환 범위는 **신버전이 구버전 저장을 읽는 전방 마이그레이션**으로 한정하는 것이 현실적이다.
   구버전 실행 파일이 신버전 저장을 여는 역방향 호환까지 요구한 것인지 확인해 달라. 후자는 범위에서
   제외할 것을 권고한다.
5. 위 채택안을 본문·Phase·테스트·14절 결정표에 반영할 때 서로 충돌하는 문구가 더 있는지 마지막으로
   대조해 달라. 특히 방향전환 비용, MVP 병과 수, 특수주민 능력 규칙, 전원 배치 의무를 확인 대상으로 둔다.

---

## 13.7 페이블 재회신 (2026-07-19, 재확인 5건)

### 1. MVP 병과 확정 후보표

집계 기준을 먼저 정리한다. 이전 회신의 '공통 8'은 **원형(archetype)** 기준, '관군 9'는 **profile** 기준으로
섞여 있었다 — 코덱스 지적이 맞다. 앞으로는 **profile ID 기준으로만 센다.** 원형은 태그 조합으로 공유하는
설계 개념일 뿐 집계 단위가 아니다. 기존 `RaiderUnitType` id는 저장 호환을 위해 개명하지 않고 표시명만
바꾼다.

#### 북방·공통 (기존 9 profile 유지 + 신규 3)

| profile ID | 표시명 | 원형 | 사용 세력 | Phase |
|---|---|---|---|---|
| `holaon-raider` (기존) | 약탈 기병 | 경기병 | 홀라온 | 1 (재매핑) |
| `bandit-rider` (기존) | 기마 마적 | 경기병 | 마적 | 1 (재매핑) |
| `holaon-horse-archer` (기존) | 기마 궁수 | 궁기병 | 홀라온 | 1 (재매핑) |
| `holaon-lancer` (기존) | 기마 선봉 | 창기병 | 홀라온 | 1 (재매핑) |
| `nimacha-spearman` (기존) | 창잡이 | 창보병 | 니마차 | 1 (재매핑) |
| `nimacha-hunter` (기존) | 숲 사냥꾼 | 보병 궁수 | 니마차 | 1 (재매핑) |
| `nimacha-looter`·`bandit-looter` (기존) | 노획조/약탈패 | 약탈 경보병 (임무형) | 니마차·마적 | 1 (재매핑) |
| `bandit-vanguard` (기존) | 두목 친위대 | 도수 근접보병 (임무형) | 마적 | 1 (재매핑) |
| `shield-infantry` (신규) | 방패꾼 | 방패보병 | 니마차·마적 | 2 |
| `deserter-musketeer` (신규) | 탈영 총포수 | 총포수 | **마적 한정** | 2 |
| `wall-breaker` (신규) | 파책조 | 파책조 | 니마차·마적 | 2 |

- 신규 3종은 세력 공용 profile 하나에 세력별 표시명 오버라이드를 허용한다(세력별 id 분화 금지 —
  프로필 폭발 방지).
- 홀라온(순수 기마 세력)에는 `wall-breaker`·`shield-infantry`를 주지 않는다. 홀라온의 파책 수단은
  `breachAndStorm` 교리 대신 화공(fireArrows)과 돌파 압박으로 남긴다.

#### 관군 (기존 5 + 신규 4 = 9 profile)

| profile ID | 표시명 | 비고 | Phase |
|---|---|---|---|
| `court-gunner` (기존) | 훈련도감 포수 | | 1 (재매핑) |
| `court-archer` (기존) | 훈련도감 사수 | | 1 (재매핑) |
| `court-melee` (기존) | 훈련도감 살수 | | 1 (재매핑) |
| `court-cavalry` (기존) | 기창 기병 (표시명 변경) | | 1 (재매핑) |
| `court-artillery` (기존) | 불랑기 화포 (표시명 변경) | 직사 판정 세분화는 Phase 8 | 1 / 8 |
| `court-shield` (신규) | 방패수 | | 2 |
| `court-horse-archer` (신규) | 관군 궁기병 | 궁기병 원형 공유 | 2 |
| `court-medic` (신규) | 의원대 | 비전사 손실만 회복 | 8 |
| `court-hwacha` (신규) | 화차 | | 8 |

#### 보류 (타입에 넣지 않음)

`court-mortar`(완구) · `court-mounted-flail`(마상편곤) · `scout`(척후대) · `banner-crew`(군기·고수).
`EnemyDoctrineId`는 8종 타입을 유지하되 MVP 활성은 6종(거짓 후퇴 비활성, 화력 지원은 Phase 8 활성화).

### 2. 방향전환 적용 시점

**후자 확정.** 명령 확정 시 facing이 즉시 바뀌고, **현재 라운드 판정부터 새 방향으로 판정하되 그 판정에만
×0.75를 적용**한다. 다음 라운드부터는 페널티 없음. 이전 회신의 "다음 라운드부터 새 방향"은 "다음
라운드부터는 페널티 없이 새 방향 유지"라는 뜻이었다 — 모호한 표현이었고 코덱스 해석(후자)이 의도와 같다.
중첩 금지·라운드당 1회 적용 동의.

### 3. 공개 상태의 단일 진실 공급원

**저장된 reveal 플래그가 런타임 진실이고, `intelLevel`은 전투 생성 시 입력일 뿐이다.**

- 매핑 함수 `initialEnemyPlanReveals(intelLevel)` 하나를 `enemyPlan.ts`에 두고, 전투 생성 시 이 함수만이
  intelLevel → 초기 reveal을 결정한다. (예: 1=목적, 2=편제 범주, 3=교리, 4=계책 일부 — 수치는 Phase 1에서 확정)
- 전투 중 공개(정찰·계책 카운터·교전 노출)는 이벤트가 플래그를 직접 켠다. 계산식으로 파생하려면 이벤트
  로그 리플레이가 필요해져 더 복잡해진다.
- 이 방식은 기존에 이미 저장 필드인 `objectiveRevealed`·`stratagems[].revealed`의 패턴과 같아 마이그레이션
  부담이 최소다.
- 불변식 테스트: reveal 플래그는 단조 증가(true→false 금지). `nightApproach`의 강등은 **경로 정보
  (`TacticalRouteIntel`)에만** 적용되는 별개 상태이므로 이 불변식과 충돌하지 않는다.

### 4. 저장 호환 범위

**전방 마이그레이션 한정 확인.** 이전 회신 20-②는 요구가 아니라 실패 모드 지적이었다. 확인 결과 현행
코드가 이미 이 정책이다 — `migrateToCurrent`(saveLoad.ts)가 `version > CURRENT_SCHEMA_VERSION`이면
명시적으로 throw한다. 역방향 호환은 범위 제외에 동의하며, 남는 작업은 하나뿐이다: 이 throw가 UI에서
"더 새로운 버전의 저장입니다"류의 명확한 안내로 표시되는지 확인(불명확하면 메시지만 보강).

### 5. 충돌 문구 대조 결과

채택안 반영 시 함께 고쳐야 할 지점 전수 목록:

| 위치 | 현재 문구 | 필요한 수정 |
|---|---|---|
| 7.1 [확정] | "마우스를 놓으면 명령 내용을 한 번 확인한 뒤 적용한다" | "지휘 단계에서는"으로 한정 (배치 단계 확인 생략과 충돌) |
| 7.9 도입부 | 매 드롭 확인 전제 | 배치 단계 예외를 첫 문장에 명시 (예시 자체는 지휘 단계라 유지 가능) |
| 7.10 | "라운드 행동을 소비한다는 안을 기본 권고" + 하단 [교차검증] 문단 | 채택안(현재 판정부터 새 방향·해당 판정만 ×0.75)으로 교체, [교차검증] 해소 표기 |
| 12.4 | "페이블 검증에서 비용이 과하다고 판단되면 전투력 페널티 방식으로 바꾼다" | 페널티 방식 확정으로 문구 정리 |
| Phase 5 작업 | "[ ] 방향전환 비용과 적용 시점" | 결정 내용을 작업 항목에 명기 |
| 4.1 총포수 행 | "채택 권고" | "마적 탈영병·관군 한정 — 북방 기본 편제 배제" 명기 |
| 4.1 척후대 행 | "추가 권고" | "MVP 보류"로 상태 변경 |
| 5.4 약탈 우회대 | "경기병 + 약탈조 + 척후대" | 척후대 보류에 맞춰 MVP 구성 수정 (경기병 증편 또는 약탈조 2슬롯) |
| 5.4 기병익대 | "기창병/궁기병 또는 편곤기병" | 편곤은 후속 변형 각주로 이동 |
| 5.4 화력 압박대 | "완구 또는 화차" | MVP는 화차만 |
| 6.1 표 | 거짓 후퇴·화력 지원 행 | 각각 "MVP 보류" / "Phase 8 활성" 표기 |
| 3.1 코드 예시 | `EnemyDoctrineId` 8종 열거 | 타입 8종 유지 + MVP 활성 6종 주석 |
| 7.4 | "모든 **필수** 전투 그룹이 배치되기 전에는" | '필수'가 미배치 예비대 여지로 읽힘 — "치료반·피난 주민 제외 모든 지휘 가능 그룹"으로 명확화 |
| 14 결정표 | '방향전환 비용' 현재 권고 열 | 채택안으로 갱신 |

**단순 문구 충돌이 아닌 설계 공백 1건:** 7.5의 "조를 분할하면 특수주민은 기본적으로 원본 조에 남고,
일반 residentIds부터 분리한다"는 과반 규칙과 결합하면 특수주민 능력을 쓸 방법이 없어진다(분리로 능력을
활용하라는 채택안의 전제가 막힘). 분할 메뉴에 **`특수주민 분리`** 액션(특수주민 + 선택 인원 0~2명을
소분견으로)을 추가해야 한다. Phase 3 작업 목록과 11.1 분할·합류 테스트에 이 항목을 넣을 것.

---

## 13.8 사용자 최종 결정 (2026-07-19)

- 13.5~13.7의 병과·교리·우회로·배치·방향전환·화포 범위·선행 침투 권고를 채택한다.
- 특수주민 과반 규칙은 채택하지 않는다. 특수주민의 특기 설명이 “그의 무리는…”을 전제로 하므로 해당
  주민이 소속된 조 전체에 특기를 적용한다.
- 특수주민이 든 조는 `아라개의 창수비병조`처럼 `<주민 이름>의 <기본 조 이름>`으로 명명한다.
- 분리 액션도 `특수주민 분리`가 아니라 `아라개의 조 분리`처럼 `<주민 이름>의 조 분리`로 표시한다.
- 적 야습 성공 시 수동 배치 기회를 잃고, 기존 기본 자동배치가 확정된 상태로 라운드 1 지휘 단계에
  진입한다. 횃불 경계로 야습 효과 배율을 0.4까지 낮추면 이 강제 자동배치를 막는다.
- 13.7의 충돌 문구 목록은 검토 이력으로 보존하며, 실제 구현 기준은 위 결정을 반영한 본문과 14절이다.

---

## 13.9 Codex 분업 회신 및 Fable 확인 요청 (2026-07-19)

사용자가 다음 역할을 지정했다.

- **Codex:** 게임 백엔드 전체와 스프라이트.
- **Fable:** 프론트엔드 전체.

이에 따라 9.4절의 분업안을 제안한다. 이미 확정된 게임 설계를 다시 열지는 않으며, 이번 회신은 병렬 작업의
충돌 방지와 계약 확정만을 목적으로 한다.

### Codex가 먼저 제공할 것

1. Phase 0 기준선 결과와 변경 금지 golden fixture.
2. `src/game/types.ts`의 배치·명명 조·방향·경로·이벤트 자료형.
3. UI가 공유할 배치/명령 unavailable-reason과 mutation API.
4. 빈 배치, 자동배치, 야습 강제 자동배치, `아라개의 창수비병조`, 좌·우 우회로 fixture.
5. profile별 sprite key·metrics·fallback과 신규 7종 스프라이트 납품 순서.

### Fable에 요청하는 확인

1. `src/components/**`와 전술 CSS를 Fable 전용, `src/game/**`를 Codex 전용으로 두는 경계에 동의하는가?
2. `TacticalBattleScreen.tsx`는 Fable이 전담하고, `src/render/tactical*` 및 전술 atlas metadata는 Codex가
   전담하는 경계에 동의하는가?
3. Phase 1 계약 fixture만으로 먼저 만들 수 있는 화면과, 반드시 추가 backend selector/event가 필요한 화면을
   구분해 목록으로 회신해 달라.
4. 프론트 편의를 위해 게임 상태를 컴포넌트에서 재계산하거나 임시 타입을 복제하지 않고, 누락 계약은
   Codex에 선행 요청하는 방식에 동의하는가?
5. `package.json`, 앱 최상위 연결부처럼 불가피하게 겹칠 파일이 더 있다면 착수 전에 정확한 파일명과 필요한
   변경을 알려 달라.
6. 프론트 체크포인트를 `정보 패널 → 배치 카드 → 무대 드래그 → 방향 → 우회로 → 화포/치료 연출 → 최종 QA`
   순서로 진행해도 되는지, 더 안전한 순서가 있다면 제안해 달라.

### 병합 제안

- 계획서 기준선 커밋 뒤 backend/frontend 브랜치를 같은 커밋에서 분기한다.
- Codex가 계약 커밋을 통합 브랜치에 먼저 넣고 Fable이 이를 받아 fixture 기반 UI를 시작한다.
- 이후 Phase별로 백엔드 계약과 테스트를 먼저 잠그고 프론트 연결·화면 테스트를 뒤따르게 한다.
- Fable이 위 6건에 회신하면 파일 소유권표와 인계 순서를 최종 확정하고 분기한다.

---

## 13.10 Fable 분업 회신 (2026-07-19)

13.9의 확인 요청 6건에 대한 회신이다. 결론: **6건 모두 동의**하며, 아래에 경계 세부 확인 3건과 수정 제안
2건(sfx.ts 소유, 체크포인트 순서 1곳)을 덧붙인다.

### 1. `src/components/**` / `src/game/**` 경계 — 동의

다음을 명시적으로 확인한다.

- `src/components/tactical/`의 비 React 헬퍼(`commandPresentation.ts`, `commandText.ts`,
  `minimapGeometry.ts`, `popoverPlacement.ts`)도 표시 계층이므로 **Fable 소유**에 포함한다.
- `src/styles/global.css`는 전 구간 **Fable 전용**으로 두고 Codex는 CSS를 수정하지 않는다
  (9.4의 "전술전 UI/CSS 구간"보다 단순한 규칙이 충돌 방지에 낫다).
- Fable은 `src/game/**`을 **import(읽기)로만** 사용한다. 현행 `TacticalBattleScreen`·
  `BattleSimulationSetup`이 이미 이 패턴이다.

### 2. `TacticalBattleScreen` / `src/render/tactical*` 경계 — 동의

- Fable은 `tacticalCharacterAssets`·`tacticalSpriteMetrics`의 공개 API(sprite key·metrics·fallback)를
  소비만 하고 픽셀·프레임 좌표·atlas key를 수정하지 않는다.
- `src/render/renderer.ts`(지도 위 전투 연출)는 이번 계획 범위 밖이며, 범위에 들어오면 render 계층
  규칙에 따라 Codex 소유로 본다.

### 3. Phase 1 계약만으로 가능한 화면 vs 추가 계약 필요 목록

**Phase 1 fixture·계약만으로 착수 가능:**

- `EnemyPlanPanel` 확장 — 한 문장 요약(목적·교리·확인 병과·미확인 계책 수), 교리 강점·약점 표시.
- `BattleSimulationSetup` — 교리·편제 템플릿·우회로 강제 옵션 UI.
  단, `createBattleSimulation` options에 해당 강제 필드가 Phase 1 계약에 포함되는 것이 전제다.
- 장계(`TacticalBattleReportModal`)의 편제·교리 표기 확장.

**추가 backend selector/event가 필요한 항목 (Phase 1 계약에 포함 요청):**

1. `enemyPlanSummaryView(battle)` — reveal 상태를 반영한 요약 데이터(문자열 조립은 프론트가 해도 되나,
   무엇이 공개됐는지의 판단은 백엔드 단일 소스여야 한다).
2. `enemyCompositionIntelView(battle)` — 그룹별 `{표시명 또는 범주 라벨, revealed, 원형 태그}`.
   9.3의 `기병 다수`/`중화기 징후` 같은 **범주 문자열의 단일 소스**를 백엔드에 둘 것.
3. 교리 정의 조회 API — label·강점·약점·권장 대응 문장. 12.1의 "정보판·장계가 판정과 같은 용어" 요건을
   지키려면 판정 코드와 같은 정의 객체에서 나와야 한다.
4. **이벤트 전방 호환 규칙** — 프론트 재생 switch가 모르는 `TacticalAnimationEvent.kind`를 안전하게
   건너뛴다는 규칙을 계약에 명문화하고, Phase별 신규 kind 목록을 해당 Phase 계약 커밋에서 잠글 것.

**이후 Phase 계약에 의존 (Phase 1에 불필요):** 배치 카드 독(3), 무대 드래그 검증·preview API(4),
facing(5), 경로 상태·미니맵(6), 경로 이벤트 재생(7), 화포·치료 이벤트와 `TacticalShotCounts` 확장(8).

### 4. 재계산·임시 타입 금지 — 동의

경계를 한 줄로 정의한다: **게임 규칙 수치(전투력·페널티·이동 라운드·판정 결과)는 프론트에서 재계산하지
않는다.** 순수 표시 파생(포맷팅, 레이아웃 지오메트리, 고스트의 시각 배치)은 프론트에 남는다.
`TacticalOrderPreview`의 `powerPenalty`·`travelRounds`처럼 규칙 수치가 미리보기에 필요한 경우는 백엔드
preview/검증 API에서 받는다.

### 5. 겹침 파일 회신

| 파일 | 확인 결과 |
|---|---|
| `tools/run-game-tests.mjs` | `test_*.mjs` 자동 발견 방식이라 등록 충돌 없음 — 수정 불필요, 겹침 아님 |
| `src/sound/sfx.ts` | **소유 미지정 발견.** 효과음 트리거는 `TacticalBattleScreen`(Fable)에서 일어나므로 **Fable 소유를 제안**한다. Codex는 이벤트 kind 목록만 계약으로 잠그면 된다. Phase 8 파일 목록의 `sfx.ts`를 Fable 열로 이동 요청 |
| `src/App.tsx` | 통합 전용 동의 |
| `package.json` | 통합 전용 동의. 프론트 신규 스크립트가 필요하면 사전 요청 |
| 이 계획서 | 통합 전용 동의 (회신 절 추가는 예외 관행 유지) |
| `tools/game/fixtures/**` | Codex 전용 동의. Fable 테스트는 읽기만 |

위 외에 겹칠 파일은 확인되지 않았다.

### 6. 체크포인트 순서 — 동의, 삽입 1건 제안

제안 순서 `정보 패널 → 배치 카드 → 무대 드래그 → 방향 → 우회로 → 화포/치료 연출 → 최종 QA`에 동의하되,
**'정보 패널' 직후에 '공용 포인터 인프라 스파이크'를 삽입**한다.

- 근거: 배치 카드(Phase 3 UI)의 카드→무대 드래그가 이미 포인터 캡처·이동 임계값·가로 스크롤 구분
  인프라를 요구한다. 이 인프라는 Phase 4 무대 드래그와 공유되며, 드래그 vs 스크롤 충돌은 13.5에서
  2순위 기술 위험으로 지목한 항목이다.
- 스파이크 내용: 실제 명령 없이 더미 카드 1장을 무대 앵커로 끄는 최소 프로토타입을 데스크톱+터치에서
  검증. 실패 시 배치 카드 UI 설계를 바꿀 시간이 남는다.
- 시뮬레이터 설정 UI는 '정보 패널' 체크포인트에 포함한다(이후 모든 화면 QA의 재현 도구이므로 가장
  먼저 필요하다).

### 병합 제안 — 동의

기준선 커밋에서 backend/frontend 분기, Codex 계약 커밋 선행, 별도 worktree, Phase별
`백엔드 계약 → 백엔드 테스트 → 프론트 연결 → 프론트 테스트 → 통합 smoke` 순서 모두 동의한다.
Codex가 파일 소유권표에 위 5절(sfx.ts)·1절(헬퍼·CSS) 확인 사항을 반영해 최종 확정하면 분기에 이의 없다.

---

## 13.11 Codex 분업 최종 확정 (2026-07-19)

Fable의 13.10 회신을 모두 수용하고 9.4절과 Phase 작업표에 반영했다.

- `src/components/tactical/**`의 비 React 헬퍼를 포함한 전 파일과 `src/styles/global.css` 전 구간은 Fable 전용.
- `src/sound/sfx.ts`는 Fable 전용. Codex는 안정된 전투 이벤트 kind만 제공.
- `src/render/tactical*`, 전술 atlas metadata와 범위에 들어오는 `renderer.ts` 전술 구간은 Codex 전용.
- Phase 1에 적 계획 요약 selector, 편제 정보 view, 교리 정의 조회 API, 미지 이벤트 안전 건너뛰기 규칙 추가.
- 프론트 순서에 정보 패널 직후 공용 포인터 인프라 스파이크 추가.
- 기준선 커밋, 같은 기준점에서 두 브랜치 분기, 별도 worktree, 계약 우선 병합 순서를 최종 확정한다.

추가 협의 없이 Phase 0 기준선과 Codex 백엔드 계약 작업을 시작할 수 있다.

---

## 14. 교차검증 뒤 확정할 결정표

| 결정 | 현재 권고 | 페이블 의견 | 최종 결정 |
|---|---|---|---|
| 역사 범위 | 후기풍 대체역사, 후기 용어 우선 | 방패수 명칭·북방 기본 총포수 배제 | **확정 — 마적 탈영 총포수만 예외** |
| MVP 병과 | 기존 profile 재매핑 + 신규 7종 | 척후대·완구·마상편곤·군기/고수 보류 | **확정** |
| 편제 규모 | 3~6그룹, 지원 0~1 | 최대 16그룹 저해상도 QA 추가 | **확정** |
| 주 교리 수 | 타입 8종, MVP 활성 6종, 전투당 1종 | 거짓 후퇴 보류·화력 지원 Phase 8 | **확정** |
| 우회로 수 | 좌·우 2개 | MVP 지형 차이는 병종별 통과 라운드 | **확정** |
| 우회로 비용 | 경로당 준비점수 2 | 기존 2점 준비 행동과 균형 | **확정** |
| 방향전환 | 현재 판정부터 새 방향, 현재 판정만 ×0.75 | 행동 소모 반대·중첩 금지 | **확정** |
| 드롭 확인 | 지휘 단계만 확인 | 배치 단계는 즉시 적용·자유 수정 | **확정** |
| 화포 동시 출현 | 지원 화포 1종 | MVP 직사 화포·화차, 완구 후속 | **확정** |
| 부대 분할 상한 | 원래 조당 3개·지휘 가능 그룹 10개 | 치료반·피난 주민은 상한 제외 | **확정** |
| 초기 배치 | 전부 카드 대기·전원 배치 의무 | 미배치 예비대 불허 | **확정** |
| 자동배치 | 기존 기본 배치 그대로 | 스마트 자동배치 보류 | **확정** |
| 피난 주민 | 중심지 최후열 고정 | 사용자 확정 | 확정 |
| 특수주민 | 호환 일반 조 합류·명명 조·확대/표식/이름표 | 페이블 과반 규칙은 사용자 수정 | **확정 — 특기는 소속 조 전체 적용** |
| 특수주민 분리 | `<이름>의 조 분리`, 본인 + 동료 0~2명 | 페이블의 설계 공백 지적을 사용자식 명명으로 수정 | **확정** |
| 민병 소집 | null placement의 긴급 소집 민병 카드 추가 | 사용자 확정 — 카드 노출은 배치 단계 진입 시점 권고 | 확정 |
| 토벌전 기본 배치 | 진입로만 허용 | 사용자 확정 | 확정 |
| 사냥꾼 전방 은닉 | 사냥꾼 조각 1개·최대 3명 | 신규 `선행 침투` 준비점수 2 | **확정** |
| 적 야습 성공 | 기존 기본 자동배치 강제 후 라운드 1 지휘 | 횃불 경계 배율 0.4면 강제 배치 방지 | **확정** |

---

## 15. 참고 자료

- [한국민족문화대백과사전 — 삼수](https://encykorea.aks.ac.kr/Article/E0026685)
- [한국민족문화대백과사전 — 훈련도감](https://encykorea.aks.ac.kr/Article/E0065793)
- [한국민족문화대백과사전 — 무예](https://encykorea.aks.ac.kr/Article/E0019164)
- [한국민족문화대백과사전 — 편곤](https://encykorea.aks.ac.kr/Article/E0059829)
- [한국민족문화대백과사전 — 방패](https://encykorea.aks.ac.kr/Article/E0069041)
- [한국민족문화대백과사전 — 완구](https://encykorea.aks.ac.kr/Article/E0038953)
- [한국민족문화대백과사전 — 화차](https://encykorea.aks.ac.kr/Article/E0064882)
- [한국민족문화대백과사전 — 화포식언해](https://encykorea.aks.ac.kr/Article/E0064928)
- [문종실록 1451년 3월 7일 — 화차와 방패의 기동성 논의](https://sillok.history.go.kr/id/kea_10103007_004)
- [세종실록 1433년 7월 4일 — 기사병·기창병·화통궁수의 진법](https://sillok.history.go.kr/id/kda_11507004_003)
- [국사편찬위원회 한국사연구휘보 — 조선군 기병 전술 변화와 동아시아](https://db.history.go.kr/id/hb_170_01_000380)
