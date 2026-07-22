# 우회로 실전 무대·양측 출입구 지휘 계획

> 작성일: 2026-07-21  
> 상태: **구현 전 계획 초안 — 범위·분업·계약 기준선**  
> 선행 구현: `2026-07-19-tactical-combat-expansion-phase-2.md` Phase 3~7  
> 담당: **Codex — 백엔드·저장·밸런스·전술 배경 자산 / Fable — 프론트엔드·드래그 UX·CSS·화면 QA**

## 0. 한 문장 목표

현재 미니맵과 상단 리본에만 표시되는 좌·우 우회로를 `진입로 ↔ 우회로 ↔ 창고지대`로 이어지는 실제 전투
무대로 승격하고, 플레이어가 배치 단계부터 부대를 그 무대에 직접 놓은 뒤 이동·차단·교전·출구 진입을 현장
드래그로 명령할 수 있게 한다.

---

## 1. 현재 상태와 이번 변경의 핵심

### 1.1 이미 구현된 기반

- 방어전에는 좌측 `숲 능선길`, 우측 `하천 둔길` 두 우회로가 생성된다.
- 각 경로는 `unknown / suspected / revealed` 정보 상태와 `neutral / defender / raider / contested` 통제 상태를 가진다.
- 우회 부대는 경로 `입구 → 중간 → 후방 출구`를 라운드 단위로 이동한다.
- 경로 중간의 차단대와 우회대는 별도 교전을 벌이고, 승패에 따라 철수 또는 후방 진입한다.
- 배치 카드나 무대 부대를 상단 `TacticalRouteRibbon`에 드롭해 차단 배치할 수 있다.
- 우회 이동 중인 부대는 정면 전투 무대에서 빠지고 미니맵·리본의 작은 표식으로만 보인다.

### 1.2 현재 UX의 문제

- 우회로에 실제 병력이 있어도 본 무대에는 전투 현장이 없으므로, 이동·대치·차단 붕괴를 현장에서 지휘한다는
  감각이 약하다.
- 배치 단계에서 우회로로 바로 보낼 수 없고, 먼저 일반 전장에 배치한 뒤 리본으로 다시 보내야 한다.
- 경로 부대가 정면 무대에서 사라진 뒤에는 작은 점과 문장으로만 상태를 판단해야 한다.
- 진입로와 창고지대에 경로 출입구가 없어 `어디에서 들어가고 어디로 나오는가`가 공간적으로 연결되지 않는다.
- 하단 버튼, 리본, 미니맵, 무대 드래그가 서로 다른 조작면처럼 느껴진다.

### 1.3 이번 변경의 원칙

1. **우회로는 실제 무대다.** 병력 스프라이트, 선택, 드래그 앵커, 이동 고스트, 교전·피해 연출을 모두 가진다.
2. **우회로는 일반 약탈 구역은 아니다.** 화면상 무대가 되더라도 정면 구역의 pressure·loot·civilian 판정을
   잘못 공유하지 않고 기존 경로 전용 교전 규칙을 유지한다.
3. **드래그는 명령 입력이다.** 부대를 놓는 순간 순간이동시키지 않고, 예상 이동 시간과 정면 이탈을 확인한 뒤
   기존 라운드 해석기가 이동·차단·교전을 처리한다.
4. **지도는 요약, 무대는 지휘다.** 미니맵은 전황 탐색과 빠른 이동용으로 남기되 실제 명령은 무대에서 완결한다.
5. **정보 은닉은 유지한다.** 미공개 적 우회대의 정확한 위치·병과·피해를 새 무대가 누설하지 않는다.

---

## 2. 확정 공간 구조

### 2.1 분기형 전투 무대

정면 전장은 기존 순서를 유지한다.

```text
진입로 ── 성문 방어선 ── 창고지대 ── 마을 중심지
  │                         │
  ├── 좌측 숲 능선길 ───────┤
  └── 우측 하천 둔길 ───────┘
```

- 좌·우 우회로는 각각 **진입로 측 입구**, **중간 차단 지점**, **창고지대 측 입구**를 가진다.
- 우회로는 성문 방어선을 건너뛰므로 성공한 적 우회대는 창고지대 측 출구로 진입한다.
- 진입로와 창고지대 무대에는 좌측·우측 출입구가 각각 하나씩 생긴다.
- 성문과 마을 중심지에는 우회로 출입구를 만들지 않는다.
- 한쪽 우회로에서 다른 쪽 우회로로 직접 순간 이동할 수 없다. 반드시 진입로 또는 창고지대로 나온 뒤 다시
  들어가야 한다.

### 2.2 무대와 전투 판정의 분리

- `battle.zones`는 계속 정면 압박·약탈·민간인 위험을 계산하는 네 구역만 가진다.
- 새 `tacticalStageTopology` selector가 정면 구역과 경로 무대를 하나의 표시 그래프로 합친다.
- 경로 안의 피해·사기·후퇴는 `tacticalRoutes.ts`에서 처리하고 정면 pressure를 만들지 않는다.
- 경로 출구 도달 시에만 해당 정면 구역의 기존 교전·표적 경로에 합류한다.

이렇게 하면 사용자에게는 하나의 연결된 전장으로 보이면서도 기존 밸런스와 장계 판정을 무리하게 재작성하지
않는다.

### 2.3 무대 식별자

프론트가 `viewedZoneId`에 경로 ID를 억지로 섞지 않도록 표시 대상은 명시적인 union으로 둔다.

```ts
type TacticalStageId =
  | { kind: 'zone'; zoneId: string }
  | { kind: 'route'; routeId: string };

type TacticalRouteNode = 'approachGate' | 'middle' | 'storehouseGate';

interface TacticalStageTopologyView {
  stages: TacticalStageView[];
  links: TacticalStageLinkView[];
  selectedFallback: TacticalStageId;
}
```

- 저장 대상은 전투 상태와 부대 위치이며, 현재 보고 있는 무대는 UI 로컬 상태로 둔다.
- 미니맵, 이전·다음 이동, 출입구 클릭은 모두 같은 `TacticalStageId`를 사용한다.
- 경로 무대를 닫았다 다시 열어도 부대의 실제 위치는 백엔드 selector에서 다시 계산한다.

---

## 3. 플레이 흐름

### 3.1 준비 단계

1. 플레이어가 좌측 또는 우측 우회로 개방 준비를 선택한다.
2. 개방된 방향의 진입로·창고지대 출입구와 경로 무대가 즉시 탐색 가능 상태가 된다.
3. 적이 비밀 우회를 준비했지만 아군이 경로를 열지 않았다면, 정보 수준에 따라 출입구에 `징후`만 표시한다.
4. `unknown` 상태에서는 실제 적 부대와 정확한 경로 위치를 표시하지 않는다.

기존 준비점수와 개방 비용은 유지한다. 이번 기능이 우회로를 무료 기본 선택으로 만들지 않는다.

### 3.2 배치 단계 — 우회로 직접 배치

1. 하단 배치 대기 카드에서 부대를 잡는다.
2. 개방된 좌·우 우회로 무대로 커서를 옮긴다.
3. 경로 중간의 **차단 지점**에 드롭한다.
4. 부대는 일반 전장에 먼저 놓지 않아도 즉시 `경로 차단 배치` 상태가 된다.
5. 다시 카드 독으로 드래그하면 배치가 취소된다.

확정 규칙:

- 직접 초기 배치가 가능한 경로 앵커는 우선 **중간 차단 지점** 하나로 제한한다.
- 전투 가능한 아군, 아군이 준비 단계에서 개방한 경로만 허용한다.
- 주민·치료반·전투 불능 부대는 경로에 배치할 수 없다.
- 경로 배치도 `배치 완료` 판정에서 정상 배치로 센다.
- 기존 `먼저 부대를 일반 전장에 배치해야 합니다` 제약은 제거한다.
- 자동배치는 현재 정면 기본 진형을 유지한다. 자동배치가 임의로 우회로를 최적 선택하지 않는다.

### 3.3 지휘 단계 — 현장 드래그 명령

| 출발 위치 | 드롭 위치 | 명령 의미 | 처리 |
|---|---|---|---|
| 진입로 | 좌/우 진입로 측 출입구 | 해당 우회로 진입 | 정면 전력에서 이탈, 경로 입구 이동 시작 |
| 창고지대 | 좌/우 창고 측 출입구 | 해당 우회로 진입 | 창고 방어에서 이탈, 반대 방향 이동 시작 |
| 경로 입구 | 경로 중간 | 이동 또는 차단 | 다음 경로 단계로 이동, 적과 만나면 경로 교전 |
| 경로 중간 | 현재 위치 | 차단 유지 | 이동하지 않고 오는 적을 막음 |
| 경로 중간 | 진입로 측 출구 | 진입로 후방 급습 또는 복귀 | 방향·진영에 따라 명령 문구를 명시 |
| 경로 중간 | 창고 측 출구 | 창고지대 진입 또는 복귀 | 출구 도달 뒤 창고지대 후열에 합류 |
| 경로 출입구 | 연결된 정면 무대의 전·중·후열 | 경로에서 나가기 | 해당 라운드 이동 완료 뒤 선택한 열에 합류 |

드롭 확인 카드에는 다음을 반드시 보여준다.

- `누가 → 어느 경로의 어느 출구로 이동하는가`
- 예상 도착 라운드 범위
- 이동 중 정면 전투에서 빠진다는 경고
- 도착 시 `급습`, `복귀`, `창고 방어 합류` 중 어떤 효과가 발생하는가
- 경로 중간에 적이 있으면 이동이 교전으로 전환될 수 있다는 경고

앵커 밖 드롭, 같은 위치 드롭, 미공개 경로 드롭은 상태를 바꾸지 않는다.

### 3.4 교전과 재생

- 경로 무대에서 양측 스프라이트가 중간 지점에 모이고 기존 `resolveEngagementExchange` 결과를 재생한다.
- 차단 성공, 차단 붕괴, 대치, 철수, 출구 돌파는 점이나 텍스트만이 아니라 부대 이동과 피해 포즈로 보인다.
- 결과 숫자와 사상자는 기존 `routeEngagements` 계약에서 읽고 프론트에서 다시 계산하지 않는다.
- 재생 중에는 드래그를 잠그고, 이동 → 교전 → 후퇴/출구 도달 순서를 보장한다.
- 경로에서 창고지대로 나온 적은 기존 후방 급습 판정에 합류한다. 진입 즉시 약탈을 확정하지 않고 해당 구역의
  다음 정상 교전 판정을 거친다.

---

## 4. 백엔드 계약 — Codex

### 4.1 경로 끝점과 물리 위치

`TacticalFlankRoute`에 정면 연결점을 명시한다.

```ts
interface TacticalFlankRoute {
  // 기존 필드 유지
  approachZoneId: 'approach';
  interiorZoneId: 'storehouse';
}

type TacticalRouteNode = 'approachGate' | 'middle' | 'storehouseGate';
type TacticalRoutePurpose = 'block' | 'flank' | 'return' | 'transfer';

interface TacticalRouteTransit {
  routeId: string;
  purpose: TacticalRoutePurpose;
  node: TacticalRouteNode;
  originZoneId: string;
  destinationZoneId: string;
  destinationLine: TacticalFormationLine;
  // 기존 정보·라운드·교전 필드 유지
}
```

- 현재 숫자 `step`은 저장 마이그레이션 입력으로만 받아들이고, 새 UI 계약에는 물리적 `node`를 제공한다.
- 진입 방향이 반대여도 `approachGate / middle / storehouseGate`가 항상 같은 화면 위치를 뜻하게 한다.
- `originZoneId`, `destinationZoneId`, `destinationLine`은 후퇴와 출구 합류를 결정하는 단일 소스다.
- 실제 저장 자료형에서 기존 필드를 당장 제거할 필요는 없지만 selector가 중복 위치를 노출해서는 안 된다.

### 4.2 표시 selector

새 selector는 컴포넌트가 raw `routeTransit`, `defenderIntel`, `deploymentPlacements`를 조합하지 않게 한다.

```ts
interface TacticalRouteStageView {
  stageId: { kind: 'route'; routeId: string };
  routeId: string;
  side: TacticalRouteSide;
  label: string;
  terrain: TacticalRouteTerrain;
  display: 'hidden' | 'suspected' | 'revealed';
  control: TacticalRouteControl;
  nodes: TacticalRouteNodeView[];
  groups: TacticalRouteStageGroupView[];
  expectedArrivalRounds?: readonly [number, number];
}
```

필수 조건:

- `hidden`: 경로 무대 진입 불가, 실제 그룹·노드 점유·step 비공개.
- `suspected`: 잠긴 경로 카드와 징후만 제공, 실제 그룹 ID와 위치 비공개.
- `revealed`: 아군과 발견된 적의 실제 물리 노드, 명령 가능 여부, 통제 상태 제공.
- 준비 단계에서 아군이 개방한 경로는 항상 `revealed`다.
- selector가 그룹 label, sprite descriptor, 상태 label, 선택 가능 여부를 제공하고 프론트는 수치를 추론하지 않는다.

### 4.3 직접 배치 mutation

기존 `placeTacticalRouteBlocker`를 직접 배치 계약으로 확장하거나 명확한 신규 API를 둔다.

```ts
tacticalRouteDeploymentUnavailableReason(battle, groupId, routeId, 'middle')
placeTacticalGroupOnRoute(state, groupId, routeId, 'middle')
removeTacticalDeploymentGroup(state, groupId)
```

- `deploymentPlacements[groupId] == null`인 카드도 허용한다.
- route placement는 `zone` placement와 상호 배타적이어야 한다.
- 경로로 옮길 때 이전 zone·line의 잔여 표시를 제거하고, 독으로 되돌릴 때 route transit도 함께 제거한다.
- 분할·합류 후 route placement와 인원·무기·특수주민 소유권 불변식을 다시 검증한다.
- `applyAutoDeployTacticalGroups`는 경로 배치를 덮어쓰지 않고, 초기 전체 자동배치에서는 기존 정면 진형만 만든다.

### 4.4 지휘 mutation과 미리보기

```ts
type TacticalStageDestination =
  | { kind: 'zoneLane'; zoneId: string; line: TacticalFormationLine }
  | { kind: 'routeNode'; routeId: string; node: TacticalRouteNode };

tacticalStageMoveUnavailableReason(battle, groupId, destination)
tacticalStageMovePreview(battle, groupId, destination)
applyTacticalStageMove(state, groupId, destination)
```

- 정면 레인 이동과 경로 이동이 같은 목적지 타입·preview 흐름을 사용한다.
- mutation은 확정 시점에 다시 검증한다.
- 경로 진입은 연결된 진입로 또는 창고지대에서만 가능하다.
- `routeNode` 드롭은 물리 위치만 이동하고 도착 목적을 암묵적으로 정하지 않는다.
- 경로 안에서는 `진입로 합류`, `방책 후열 급습`, `창고지대 합류`를 별도 목적 버튼으로 선택한다.
- 방책에 생존해 교전 가능한 적이 없으면 `방책 후열 급습`은 비활성화하고 확정 시점에도 같은 조건을 재검증한다.
- 세 목적은 같은 `zoneLane` preview·확정·재검증 흐름으로 flank/return/transfer에 변환한다.
- 경로 안의 부대는 직접 선택·명령 가능하며, 기존 `routeTransit이면 정면 무대에서 숨김` 규칙은 유지한다.
- 후퇴나 차단 붕괴 시 마지막 정상 출입구 또는 명시된 origin으로 돌아간다.

### 4.5 이동 시간

- 기준선은 기존 `기동 부대 전체 통과 1라운드 / 보병 전체 통과 2라운드` 체감을 유지한다.
- 경로 중간에 미리 배치된 차단대가 한쪽 출구로 이동할 때는 전체 경로가 아니라 남은 한 구간만 계산한다.
- 눈보라·해빙 홍수·지형 지연은 기존 설정을 재사용하되 preview와 실제 결과가 같은 함수를 쓴다.
- 경로 중간에서 접촉하면 남은 이동을 중단하고 그 라운드에 경로 교전을 먼저 해결한다.
- 차단 붕괴 직후 승자가 같은 라운드에 창고지대로 순간 진입하지 않게 기존 한 단계 유예를 유지한다.

### 4.6 적 AI

- 적 후방 우회는 `진입로 측 입구 → 중간 → 창고지대 측 입구`를 기본 방향으로 삼는다.
- 적의 출구 목적은 작전 목표로 결정한다. 돌파는 방책 후열 급습, 약탈은 창고지대 침투를 선택한다.
- 방화는 방책이 건재하면 방책 후열을 급습하고, 이미 돌파된 뒤에는 창고지대로 침투한다.
- 방책 급습만 후방 진입 표식을 가지며, 창고지대 침투는 일반 약탈·방화 AI에 합류한다.
- 아군이 경로 중간을 막으면 기존 전용 교전을 먼저 해결한다.
- 아군이 창고지대 쪽에서 경로에 들어가 역으로 접근하는 경우 중간에서 정상적으로 조우한다.

### 4.7 저장 마이그레이션

- 다음 스키마 버전에서 route endpoint, node, destinationLine을 정규화한다.
- 구버전 `step 0/1/2`는 origin·destination 방향을 참조해 새 물리 node로 변환한다.
- 구버전 방어전의 적 `approach → wall` 우회 목적지는 새 지형 구조에 맞춰 `approach → storehouse`로 이관한다.
- 경로 중간의 차단대, 경과 라운드, 피해, 교전 횟수, 정보 공개 상태는 보존한다.
- 잘못된 routeId·zoneId는 기존처럼 route transit을 제거하고 안전한 정면 origin으로 복귀시킨다.
- 저장 직후와 복원 직후 `tacticalStageTopology`와 실제 전투 결과가 같아야 한다.

---

## 5. 프론트엔드 — Fable

### 5.1 컴포넌트 구조

권장 구조:

```text
TacticalBattleScreen
├─ TacticalZoneColumn          기존 정면 무대
│  └─ TacticalRouteGate × 2    진입로/창고지대 좌·우 출입구
├─ TacticalRouteStage          신규 실제 우회로 무대
│  ├─ 접근로 측 입구 앵커
│  ├─ 중간 차단/교전 앵커
│  └─ 창고 측 입구 앵커
├─ TacticalMiniMap             정면·분기 탐색
└─ TacticalDeploymentDock      기존 카드 독
```

- `TacticalRouteStage`가 경로 병력의 실제 스프라이트, 이름표, 상태 배지, 드래그 핸들, 고스트를 렌더한다.
- `TacticalZoneColumn`의 거대한 스프라이트 코드를 복제하지 말고 공용 그룹 배우/포메이션 표시를 추출한다.
- 기존 `TacticalRouteRibbon`은 전환 기간의 비교용으로만 남기고, 실제 무대가 이동·교전·도착 정보를 모두
  표현하면 제거하거나 비조작형 요약 칩으로 축소한다.

### 5.2 출입구 표현

- 진입로와 창고지대의 좌·우 가장자리에 경로명, 통제 상태, 출입 방향을 가진 문/길목 핫스폿을 둔다.
- 출입구를 클릭하면 연결된 경로 무대로 이동한다.
- 부대를 드래그해 출입구에 올리면 경로 무대와 목적 노드의 고스트를 미리 보여준다.
- 미공개 출입구는 비활성, 징후 상태는 점선·물음표·잠금 문구로 표시한다.
- 색상만으로 통제를 표현하지 않고 `아군 통제 / 적 통제 / 교전 중` 문자와 형태를 함께 쓴다.

### 5.3 드래그 규칙

- 기존 `useStagePointerDrag`와 `data-deploy-anchor`를 확장해 zone lane과 route node를 같은 훅에서 찾는다.
- 앵커 ID 문자열을 각 컴포넌트가 직접 파싱하지 않고 공용 encode/decode helper를 사용한다.
- 배치 단계의 유효 드롭은 즉시 적용하고 카드 독으로 되돌리기를 제공한다.
- 지휘 단계의 드롭은 기존 `TacticalOrderConfirm`을 통해 확인 후 적용한다.
- 드래그 중에는 가능한 앵커, 현재 호버 앵커, 불가능한 앵커를 구분하고 불가 사유를 툴팁/상태 메시지로 낸다.
- 키보드 대체 경로로 `부대 선택 → 목적지 선택 → 명령 확인`을 제공한다.
- 재생, 보고, 야습 강제 연출 중에는 모든 드래그를 취소하고 잠근다.

### 5.4 탐색

- `viewedZoneId`를 `viewedStageId` 로컬 상태로 교체한다.
- 진입로/창고지대 출입구, 미니맵 분기선, 경로 전황 알림을 누르면 같은 route stage로 이동한다.
- 이전·다음 화살표는 정면 전장만 순환하고, 우회로에서는 `진입로로`, `창고지대로` 빠른 이동 단추를 제공한다.
- 선택한 부대가 경로에 있으면 무대도 해당 경로로 따라간다. 현재처럼 빈 `zoneId` 때문에 이동이 실패하면 안 된다.
- 작은 화면에서도 명령 카드와 미니맵이 출입구·경로 중간 앵커를 가리지 않게 한다.

### 5.5 연출

- `routeAdvances`: 실제 노드 사이 이동.
- `routeEngagements`: 양측 접근 → 충돌 → 피해/후퇴.
- `routeArrivals`: 출구 돌파 → 연결 zone 후열 진입.
- `reduced-motion`에서는 위치 순간 전환 + 상태 배지로 같은 정보를 전달한다.
- 숨은 적은 silhouette조차 정확한 수와 위치를 누설하지 않는다.

---

## 6. 전술 배경·그래픽 — Codex

### 6.1 필요한 자산

1. **좌측 숲 능선길 무대** — 진입로 입구, 굽은 중간 차단 지점, 창고 쪽 출구가 한 화면에서 읽히는 배경.
2. **우측 하천 둔길 무대** — 물가·둔덕으로 같은 세 노드가 분명한 배경.
3. **진입로 출입구 레이어** — 기존 진입로 배경에 좌·우 길목이 자연스럽게 연결되는 전경/마스크.
4. **창고지대 출입구 레이어** — 울타리·창고 사이에 좌·우 출구가 읽히는 전경/마스크.
5. **상태 오버레이** — 폐쇄, 징후, 아군 개방을 자산 자체에 굽지 않고 UI가 겹칠 수 있는 중립 배경.

### 6.2 자산 규격

- 기존 전술 무대와 같은 시점, 픽셀 밀도, 계절 팔레트, 유닛 발 위치를 사용한다.
- route stage는 좌우 입구보다 중간 교전 공간을 넓게 잡아 2~3개 그룹이 겹치지 않게 한다.
- 배경에는 글자, 화살표, 아군/적 색을 넣지 않는다.
- 봄·여름·가을·겨울과 주간·야간을 지원한다.
- 출입구는 기존 배경 전체를 매번 갈아끼우기보다 투명 전경 레이어로 분리해 Fable이 앵커 상태를 얹을 수 있게 한다.
- 최종 파일명과 `tacticalBackgroundAsset` 매핑을 고정하고 누락·크기·경로 테스트를 추가한다.

권장 파일군:

```text
public/assets/tactical/routes/wooded-ridge-{season}-{day|night}-v1.webp
public/assets/tactical/routes/river-bank-{season}-{day|night}-v1.webp
public/assets/tactical/route-gates/approach-{season}-{day|night}-v1.webp
public/assets/tactical/route-gates/storehouse-{season}-{day|night}-v1.webp
```

### 6.3 그래픽 완료 조건

- 빈 배경만 봐도 진입로 측, 중간, 창고지대 측 이동 방향이 읽힌다.
- 좌측과 우측 경로가 색만이 아니라 숲 능선/하천 둔길 실루엣으로 구분된다.
- 진입로와 창고지대에서 양쪽 출입구가 기존 병력·바리케이드·후방 급습 스프라이트를 가리지 않는다.
- 네 계절·야간에서 유닛과 드롭 고스트의 대비가 WCAG 비텍스트 대비 권고를 심하게 해치지 않는다.
- 1280×720 기준 앵커와 실제 길목 그림의 위치가 맞는다.

---

## 7. 파일 소유권과 충돌 방지

### 7.1 Codex 전담

- `src/game/types.ts`
- `src/game/tacticalRoutes.ts`
- `src/game/tacticalDeployment.ts`
- `src/game/tacticalCommandState.ts`
- `src/game/tacticalBattle.ts`
- `src/game/saveLoad.ts`, `src/game/saveSchema.ts`
- `src/game/config.ts`
- `src/render/tacticalBackgroundAssets.ts`
- `public/assets/tactical/routes/**`
- `public/assets/tactical/route-gates/**`
- `tools/game/test_tactical_routes.mjs`
- `tools/game/test_tactical_deployment.mjs`
- `tools/game/test_tactical_stage_orders.mjs`
- `tools/game/test_tactical_background_assets.mjs`
- 신규 `tools/game/test_tactical_stage_topology.mjs`
- `tools/game/measure_tactical_route_balance.mjs`

### 7.2 Fable 전담

- `src/components/TacticalBattleScreen.tsx`
- `src/components/tactical/TacticalRouteStage.tsx` 신규
- `src/components/tactical/TacticalRouteGate.tsx` 신규
- `src/components/tactical/TacticalZoneColumn.tsx`
- `src/components/tactical/TacticalMiniMap.tsx`
- `src/components/tactical/minimapGeometry.ts`
- `src/components/tactical/stagePointerDrag.ts`
- `src/components/tactical/stageOrderPreview.ts`
- `src/components/tactical/TacticalOrderConfirm.tsx`
- `src/components/tactical/TacticalRouteRibbon.tsx` 축소 또는 제거
- `src/styles/global.css`
- 프론트 구조 계약 테스트 `tools/game/test_tactical_components.mjs`
- 필요 시 `src/sound/sfx.ts`의 경로 이동·교전 효과음 연결

### 7.3 공동 접점 규칙

- Fable은 `src/game/**`를 읽고 공개 selector/mutation만 호출하며 수치·가시성·이동 시간을 재계산하지 않는다.
- Codex는 `src/components/**`와 `global.css`를 수정하지 않는다.
- `TacticalBattleScreen`이 필요한 계약이 없으면 임시 프론트 타입을 만들지 않고 Codex에 selector 변경을 요청한다.
- `App.tsx`의 기존 `onDeploymentAction` 경로로 연결 가능하면 새 전용 callback을 만들지 않는다.
- 같은 파일 수정이 불가피하면 담당자가 파일명·필요 diff를 먼저 인계하고 한쪽만 실제 편집한다.

---

## 8. 구현 단계와 인계 순서

### Phase 0 — 기준선 고정

**담당:** Codex

- [x] 현재 route/deployment/stage order/golden 테스트 결과 기록.
- [x] 좌·우 우회, 차단 승리·패배, 숨은 적, 저장 중 이동 fixture 고정.
- [x] 정면 zone pressure·loot 결과를 변경 금지 기준선으로 저장.

**게이트:** UI 변경 없이 현재 `npm run check`와 경로 밸런스 측정이 재현된다.

### Phase 1 — 무대 토폴로지·저장 계약

**담당:** Codex

- [x] approach/storehouse endpoint와 물리 node 자료형 추가.
- [x] `tacticalStageTopology`·`tacticalRouteStageView` selector 추가.
- [x] 숫자 step·기존 wall 목적지 저장 마이그레이션.
- [x] hidden/suspected/revealed 누설 방지 테스트.
- [x] Fable용 정적 fixture와 타입 인계.

**게이트:** Fable이 raw battle 상태를 조합하지 않고 정면·좌·우 무대와 링크를 그릴 수 있다.

### Phase 2 — 직접 배치 백엔드

**담당:** Codex

- [x] 미배치 카드 → route middle 직접 배치 허용.
- [x] route placement와 zone placement 상호 배타성 보장.
- [x] 카드 독 복귀, 초기화, 분할·합류, 배치 완료 판정 연결.
- [x] 자동배치 기존 결과 보존.

**게이트:** 일반 전장 선배치 없이 차단대를 놓고 저장·복원·배치 취소할 수 있다.

### Phase 3 — 실제 경로 무대 골격

**담당:** Fable, Phase 1 fixture 수령 후 시작

- [x] `viewedStageId` 탐색 전환.
- [x] `TacticalRouteStage`와 세 노드 렌더.
- [x] 공용 부대 배우/스프라이트 표시 추출.
- [x] 선택 부대가 경로에 있을 때 자동 무대 이동.
- [x] 미니맵·출입구·경로 알림 탐색 연결.

**게이트:** fixture만으로 실제 경로 무대에서 아군·공개 적·통제 상태를 볼 수 있다.

### Phase 4 — 양방향 이동·명령 계약

**담당:** Codex

- [x] zone lane ↔ route node 목적지 검증·preview·mutation.
- [x] block/flank/return/transfer와 목적 출구·열 기록.
- [x] 반대 방향 이동과 중간 조우.
- [x] 접근로→창고 AI 목적지 전환.
- [x] 이동 시간·날씨·후퇴·차단 붕괴 테스트.

**게이트:** 버튼 없이 mutation만으로 양쪽 출입구 진입, 차단, 복귀, 급습이 모두 재현된다.

### Phase 5 — 배경 자산

**담당:** Codex

- [x] 두 경로의 계절·주야 배경 제작.
- [ ] 진입로·창고지대 양측 출입구 레이어 제작.
- [ ] `tacticalBackgroundAsset` 공개 API와 fallback 추가.
- [ ] 크기·경로·누락·fallback 자동 테스트.
- [ ] 1280×720 스프라이트 발 위치와 앵커 기준점 스크린샷 인계.

**게이트:** Fable이 CSS 좌표를 추측하지 않고 제공된 anchor guide로 배치할 수 있다.

### Phase 6 — 현장 드래그·출입구

**담당:** Fable, Phase 2·4 계약 수령 후 시작

- [ ] 카드 독 → route middle 직접 드롭.
- [ ] 정면 zone ↔ 양측 출입구 ↔ route node 드래그.
- [ ] 유효/호버/불가 고스트와 unavailable reason.
- [ ] 지휘 확인 카드와 예상 라운드·위험 문구.
- [ ] 키보드 대체 명령.

**게이트:** 배치와 지휘 모두 무대만 보고 완결할 수 있고 기존 하단 경로 버튼이 필수 경로가 아니다.

### Phase 7 — 경로 교전 재생·리본 정리

**담당:** Codex — 이벤트 계약 / Fable — 연출

- [ ] 이동 → 조우 → 교전 → 후퇴/돌파 이벤트 순서 고정.
- [ ] 피해 포즈, 이동, 출구 도달, 창고지대 후열 진입 연출.
- [ ] hidden/suspected 적 연출 누설 방지.
- [ ] `TacticalRouteRibbon`을 비조작 요약으로 축소하거나 제거.
- [ ] reduced-motion·효과음·빠른 재생 검증.

**게이트:** 리본을 보지 않아도 누가 이동·차단·교전·돌파했는지 실제 무대에서 이해된다.

### Phase 8 — 통합 QA·밸런스

**담당:** Codex — 자동화·밸런스 / Fable — 시각·조작 QA

- [ ] 전체 전투 테스트와 빌드.
- [ ] 1280×720, 1440×900, 좁은 화면 겹침 점검.
- [ ] 마우스·터치·키보드 조작 점검.
- [ ] 네 계절·주야·폭설·해빙 홍수 배경 점검.
- [ ] 좌/우 개방·미개방·징후·비공개 조합 점검.
- [ ] 경로 이용이 항상 정답이 되지 않는지 200시드 비교.
- [ ] 장계의 경로 결과와 실제 재생 결과 일치 확인.

**게이트:** 완료 조건 9장을 모두 만족하고 golden 변경은 의도된 목적지 변경만 검토 후 반영한다.

---

## 9. 필수 테스트와 완료 조건

### 9.1 자동 테스트

- 토폴로지: 좌·우 경로가 각각 approach와 storehouse에 한 번씩 연결된다.
- 분리: route stage는 `battle.zones`에 들어가지 않고 경로 교전이 pressure·loot를 만들지 않는다.
- 직접 배치: null placement 카드가 route middle에 바로 배치되고 일반 전장에 잔상이 없다.
- 배치 취소: route middle에서 카드 독으로 복귀하면 transit·placement·화면 점유가 모두 제거된다.
- 배치 완료: 치료반·주민 제외 모든 지휘 가능 그룹이 zone 또는 route 중 정확히 한 곳에 있어야 한다.
- 자동배치: 기존 zone/line 기본 배치가 바뀌지 않는다.
- 양방향: approach→storehouse와 storehouse→approach가 같은 거리·날씨 규칙을 쓴다.
- 중간 차단: 반대 방향 병력이 중간에서 만나면 한 번만 교전한다.
- 후퇴: 패한 차단대가 올바른 origin 출입구로 돌아가고 두 무대에 중복 표시되지 않는다.
- 도착: 양측 모두 선택한 목적에 따라 방책 후열 급습 또는 approach/storehouse zone/line에 정확히 한 번 합류한다.
- 목적 분리: 물리 출구 이동만으로 급습이 자동 발동하지 않고, 아군 UI에 세 목적이 모두 노출된다.
- 빈 방책: 방책에 생존·전투 가능·비퇴각 적이 없으면 급습 버튼·드롭·확정이 모두 같은 사유로 거부된다.
- 적 목적: 돌파·약탈·방화와 방책 돌파 상태가 각각 규정된 급습/침투 목적을 선택한다.
- 정보 은닉: unknown/suspected에서 실제 groupId, 병과, node, 피해, 정확한 도착 라운드를 노출하지 않는다.
- 저장 복원: 이동 전·중간 교전·출구 도달 직전 각각 round, node, direction, 피해가 보존된다.
- 이벤트 순서: advance → engagement → retreat/arrival 순서를 지킨다.
- 배경: 모든 season/light/terrain 키가 존재하고 fallback이 무한 재귀하지 않는다.

### 9.2 수동 QA 시나리오

1. 좌측만 개방하고 배치 카드를 숲 능선길 중간에 직접 놓는다.
2. 우측 적 우회가 suspected인 상태에서 정확한 적 위치가 보이지 않는지 확인한다.
3. 진입로 아군을 좌측 입구로 드래그하고 이동 예상 라운드·정면 이탈 경고를 확인한다.
4. 창고지대 아군을 같은 경로 반대편에서 진입시켜 중간 조우를 만든다.
5. 차단 성공, 대치, 차단 붕괴를 각각 재생한다.
6. 경로 부대가 진입로 합류·방책 후열 급습·창고지대 합류를 각각 선택해 그대로 도착하는지 확인한다.
7. 방책의 마지막 적이 죽거나 퇴각하면 방책 후열 급습이 비활성화되고 사유가 표시되는지 확인한다.
8. 적 돌파·약탈·방화 목표가 방책 상태에 따라 방책 급습 또는 창고 침투를 선택하는지 확인한다.
9. 이동 중 저장·재실행 뒤 같은 무대·같은 위치·같은 예상 도착 시간을 확인한다.
10. 야간·눈보라에서 출입구와 유닛·고스트가 구분되는지 확인한다.
11. 키보드만으로 경로 선택, 목적지 선택, 확인, 취소를 수행한다.

### 9.3 기능 완료 정의

- 플레이어가 미니맵이나 리본의 작은 점을 읽지 않고도 우회 부대의 이동·차단·교전을 파악할 수 있다.
- 배치 카드에서 우회로 중간으로 한 번의 드래그로 직접 배치할 수 있다.
- 진입로와 창고지대 양쪽 출입구를 통해 실제 무대에서 진입·복귀·돌파 명령을 내릴 수 있다.
- 드래그 결과와 실제 라운드 판정, 재생, 장계가 모두 같은 백엔드 결과를 사용한다.
- 미공개 적 경로 정보가 새 무대로 누설되지 않는다.
- 정면 전투의 기존 자동배치·pressure·loot·민간인 보호 규칙이 의도 없이 바뀌지 않는다.

---

## 10. 비범위

- 실시간 자유 이동이나 개별 병사 단위 RTS 조작.
- 우회로 위 건설, 함정 자유 배치, 지형 파괴.
- 성문과 중심지에 추가 우회 출입구 생성.
- 좌측 경로에서 우측 경로로 직접 이동.
- 미공개 경로를 시각 효과만 보고 역추적할 수 있는 비공식 정보 제공.
- 자동배치가 적 교리까지 읽고 최적 우회 차단대를 골라주는 스마트 배치.
- 이번 계획과 무관한 토벌전·맹수 사냥의 분기 무대 재설계.

---

## 11. 주요 위험과 대응

### 경로 무대가 일반 zone으로 오인될 위험

- 표시 그래프만 통합하고 pressure·loot 판정 자료구조는 분리한다.
- route-only combat의 zone 수치 불변 테스트를 유지한다.

### 출입구 드래그가 순간이동처럼 보일 위험

- 확인 카드에 예상 라운드와 정면 이탈을 표시한다.
- 확정 뒤 즉시 목적지 스프라이트를 만들지 않고 출입구/경로 node 이동 이벤트를 재생한다.

### 직접 차단 배치가 지나치게 강해질 위험

- 준비점수·경로 개방 비용과 전투 가능 병력 제한을 유지한다.
- 자동배치에는 넣지 않고 플레이어가 정면 전력을 직접 빼야 한다.
- 200시드에서 양쪽 동시 개방·한쪽 개방·미개방의 승률과 창고 피해를 비교한다.

### 화면 밀도와 드래그 충돌 위험

- route stage를 별도 전체 무대로 두고 정면 무대 위에 작은 전장을 중첩하지 않는다.
- 리본은 실제 무대 완성 후 조작 기능을 제거한다.
- 공용 앵커 codec과 단일 pointer drag 훅으로 중복 drop handler를 피한다.

### 프론트가 숨은 정보를 읽을 위험

- raw state 대신 `TacticalRouteStageView`만 렌더 입력으로 사용한다.
- selector 계약 테스트에서 hidden/suspected payload 자체에 groupId와 node가 없는지 검사한다.

### 기존 저장의 목적지가 바뀌는 위험

- 마이그레이션 전후 round·경과·피해·교전 횟수를 고정한다.
- `wall → storehouse` 목적지 변경은 의도된 설계 변경으로 별도 fixture와 장계 문구를 검토한다.

---

## 12. 착수 체크포인트

1. Codex가 Phase 0 기준선과 Phase 1 타입·selector fixture를 먼저 납품한다.
2. Fable은 fixture로 route stage와 탐색 골격을 만들고 필요한 표시 계약 누락을 한 번에 회신한다.
3. Codex가 직접 배치와 양방향 명령 mutation을 잠근 뒤 Fable이 드래그를 연결한다.
4. 배경 자산은 anchor guide와 함께 전달하고 Fable은 CSS 위치만 담당한다.
5. 정적 표시 → 배치 → 이동 → 교전 재생 순서로 통합하며, 각 단계에서 backend/frontend 테스트를 함께 통과한다.
6. 최종 QA 전까지 golden fixture는 자동 갱신하지 않는다.

