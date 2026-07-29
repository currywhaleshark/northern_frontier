# 연대기 화면 — 주요 사건과 통계의 회고 (설계)

> **계획 상태:** 미착수
> **상태 갱신:** 2026-07-29 — 후반 엔딩의 선행 작업으로 분리하고 정착지 이름·통계 산식·
> 개칭 청원·구세이브 기록 계약까지 확정했다. **이쪽을 먼저 구현한다.**

- 작성: 2026-07-29
- 동기: 엔딩(부 승격·향후 후반 엔딩)과 전멸 게임오버 뒤에 "우리 마을이 걸어온
  길"을 보여주는 화면이 없다. 그리고 연대기·통계는 **기록을 시작한 시점부터만
  쌓인다** — 엔딩 시스템 구현 때 만들면 그 세이브에는 과거가 없다. 데이터가
  쌓이도록 먼저 넣는다.

## 0. 원칙

1. **기록은 발생 시점에, 화면은 언제든.** 연대기는 사건이 일어나는 순간
   시뮬레이션이 기록한다. 화면은 그 기록을 읽기만 한다 — 화면 쪽에서 상태를
   역산해 사건을 재구성하지 않는다.
2. **로그와 연대기는 다른 물건이다.** 로그(`state.log`)는 `CONFIG.ui.logLimit`으로
   잘리는 흘러가는 소식이고, 연대기(`state.annals`)는 영구 보존되는 굵직한
   사건만 담는다. 로그를 연대기로 재활용하지 않는다.
3. **엔딩 화면 = 평시 화면 + 엔딩 장면 한 장.** 같은 컴포넌트를 쓰고 첫 장만
   다르다. 별도 구현 금지.
4. 후반 엔딩 설계(E4 연대기 회고)가 이 화면을 그대로 재사용한다. 여기서 만드는
   데이터 구조가 그쪽의 기반이다.

## 1. 정착지 이름과 화면

### 1-1. 정착지 이름

개칭 대기 자료형을 정의하고 `GameState`에 이름·대기·재개칭 가능 시점을 보관한다.

```ts
interface PendingSettlementRename {
  requestedName: string;
  sentDay: number;
  dueDay: number;
}

// GameState에 추가
settlementName: string;
pendingSettlementRename: PendingSettlementRename | null;
settlementRenameCooldownUntil: number;
```

- 새 게임 메뉴의 난이도 선택 아래에 이름 입력을 둔다. 화면이 열릴 때 랜덤 후보 하나를
  **이미 입력된 값으로** 보여 주며, 플레이어는 그대로 시작하거나 직접 고칠 수 있다.
- 입력 옆에 주사위 모양 `🎲` 버튼을 둔다. 누를 때마다 새 랜덤 후보를 만들어 입력칸 값을
  교체한다. 버튼에는 `aria-label="정착지 이름 무작위 생성"`을 둔다.
- `generateSettlementName(seed)`는 게임 시드를 별도 salt로 해시하는 **순수 함수**다.
  시뮬레이션 공용 RNG를 소비해 기존 결정성을 바꾸지 않는다.
- `이름 굴리기`는 UI 전용 nonce로 후보 문자열만 만들고 그 문자열을 새 게임 인자로 넘긴다.
  게임 시드나 시뮬레이션 RNG에는 손대지 않는다.
- 입력은 앞뒤 공백을 없애고 빈 문자열을 거부하며 최대 12글자로 제한한다. 입력을 지운
  상태에서는 `개척 시작`을 비활성화하고 자동으로 아무 이름이나 붙이지 않는다.
- `newGame(seed, difficulty, settlementName?)`가 최종 이름을 확정한다. 메뉴에서는 항상
  현재 입력값을 넘긴다. 테스트·디버그처럼 이름을 넘기지 않는 호출만 같은 seed의 자동 이름을
  안전한 기본값으로 쓴다.
- 튜토리얼은 시나리오에 고정된 이름을 쓴다.
- 중심지 선택 팝업에 `개칭을 청원한다`를 둔다. 누르면 새 이름 입력과 함께
  `파발 왕복 12일 · 허가 후 1년간 재개칭 불가`를 보여 주는 확인 창을 연다.
- 개칭은 즉시 적용하지 않는다. 유효한 새 이름으로 청원을 보내면
  `pendingSettlementRename = { requestedName, sentDay: state.day,
  dueDay: state.day + CONFIG.settlementNaming.renameTravelDays }`를 저장한다.
  파발이 돌아오는 날까지 기존 이름을 계속 사용하며, 발송 뒤에는 취소·수정할 수 없다.
- `CONFIG.settlementNaming.renameTravelDays = 12`로 기존 조정 청원의 한 계절 왕복 감각을
  재사용한다. 물자 청원의 `lastPetitionDay`와는 별도 행정 절차라 그 쿨다운을 소비하지 않는다.
- `dueDay`에 도달하면 난수나 추가 승인 판정 없이 조정의 허가가 내려온 것으로 처리한다.
  그날 이름을 적용하고 `settlementRenameCooldownUntil =
  state.day + CONFIG.time.yearDays`로 설정한다. 현재 기준 48일, 정확히 1년이다.
- 청원이 왕복 중이거나 `state.day < settlementRenameCooldownUntil`이면 새 개칭 청원을 막고
  남은 일수를 버튼과 설명에 표시한다. 현재 이름과 같은 이름도 청원할 수 없다.
- 실제 개칭이 적용된 순간에만 `court` 연대기 한 건과 중요 로그를 남긴다
  (개칭 허가는 조정 행정이다 — `special`은 특수 주민 전용).
  청원 발송은 일반 로그만 남긴다. 따라서 왕복 중 저장·로드나 버튼 반복으로 연대기가
  늘어나지 않는다.
- 이미 기록된 연대기 문장은 당시 이름을 보존하고 고쳐 쓰지 않는다.
- 구세이브는 마이그레이션에서 저장된 `seed`로 자동 이름을 생성한다. 같은 저장을 다시
  마이그레이션해도 이름이 바뀌지 않아야 한다. 개칭 상태는 `null`, 쿨다운은 0으로 시작한다.

### 1-2. 화면 — 3부 구성

세로 스크롤 단일 화면 (전체 화면 오버레이, 두루마리 느낌).

1. **표제부** — 진입 맥락에 따라 다른 첫 장:
   - 부 승격 엔딩: 기존 승격 연출 문구 + "개척 성공"
   - 게임오버: 사유(`gameOver.reason`) + "○년의 기록"
   - 평시 열람: 정착지 이름 · 현재 연차 · 등급
   - (후반 엔딩 도입 후: 각 엔딩의 연출 문구 — 이번 범위 아님)
2. **연대기부** — `state.annals`를 연도별로 묶어 나열. 연도 표제(정착 ○년차,
   계절 아이콘) 아래 사건 한 줄씩. 많아도 접지 않는다 — 스크롤이 곧 세월이다.
3. **통계부** — §3의 표와 추이 그래프.

### 1-3. 진입점

| 맥락 | 진입 |
|---|---|
| 부 승격 엔딩 | 기존 게임오버 모달(`GameSession.tsx`의 `state.gameOver` 모달)에 "연대기 보기" 버튼 추가. 닫으면 기존과 같이 계속 플레이 선택 가능 |
| 전멸 게임오버 | 동일 모달에 동일 버튼. 연대기 화면을 닫으면 게임오버 모달로 복귀 |
| 평시 열람 | 중심지 선택 팝업에 "연대기" 버튼 (중심지는 항상 존재하므로 등급 무관 접근 가능) |

## 2. 연대기 — `state.annals`

```ts
export type AnnalsKind =
  | 'legacy'      // 구세이브에서 복원한 불완전한 과거 기록
  | 'founding'     // 정착 (기록 시작)
  | 'promotion'    // 보/진/부 승격
  | 'winter'       // 혹독한 월동 (겨울 사망률 문턱 초과 시만)
  | 'disaster'     // 재해 (이른서리·역병·해빙기 홍수 등)
  | 'raid'         // 습격과 그 결과 (격퇴/피해)
  | 'battle'       // 전술 전투 (원정·토벌)
  | 'special'      // 특수 주민 등장·이탈
  | 'grant'        // 하사·교지·사액
  | 'population'   // 인구 이정표 (25·50·100·200…)
  | 'building'     // 주요 건물 최초 완공 (다리·성벽 최초·관청·서당 등)
  | 'trade'        // 정기거래 체결·파기
  | 'court'        // 조정 관련 (견책·감찰·토벌 유예·개칭 허가)
  | 'ending';      // 엔딩 도달 (후반 엔딩에서 사용)

export interface AnnalsEntry {
  day: number;
  kind: AnnalsKind;
  text: string;     // 기록 시점에 완성된 한 문장 (화면에서 조립하지 않는다)
  dedupeKey?: string; // 인구 이정표·최초 완공처럼 저장 전체에서 1회인 사건
}
```

- 기록 API: `recordAnnals(state, kind, text, dedupeKey?)` — `addLog`와 나란히 두고, 연대기감
  사건의 기존 호출 지점에서 **로그와 함께** 부른다. 로그에 없는 문장을 새로 짓지
  말고, 이미 쓰는 문구를 재사용하되 연대기용으로 다듬어도 좋다.
- `dedupeKey`가 이미 존재하면 추가하지 않는다. 예: `population:25`,
  `building:school`, `promotion:bo`. 반복 가능한 습격·교역·출생에는 키를 주지 않는다.
- **상한 없음** (영구 보존). 항목당 수십 바이트 × 장기 플레이 수백 건 수준이라
  저장 부담은 무시 가능. 다만 같은 kind의 도배를 막는 규칙을 기록 지점에 둔다
  (예: `population`은 이정표 통과 시 1회, `winter`는 사망률 문턱 초과 겨울만).
- 인구 이정표·주요 건물 최초 완공처럼 "처음인지"의 판정은 `dedupeKey`를 조회한다
  (별도 플래그를 늘리거나 완성 문장을 비교하지 않는다).

## 3. 통계

### 3-1. 현재값 (저장 안 함 — 열람 시 state에서 계산)

| 묶음 | 내용 |
|---|---|
| 마을 | 정착지 이름, 등급, 정착 연차, 일반 건물 수(종류별), 개간 면적 |
| 인구 | 총원, 성인/청소년/아이/영아, 직업 분포 상위 |
| 농업 | 밭 면적, 논 면적, 총 개간 면적 |
| 군사 | 전투 가능 주민 수, 무기 보유(창·활·조총·총통), 방어시설(성벽 종류별 길이·성문·망루·봉수) |
| 경제 | 자원 보유량(주요 품목), 총 땔감, 은, 가축 수(종별) |

#### 현재값 공용 산식

화면에서 임의로 다시 세지 않고 아래 순수 헬퍼를 게임 계층에 둔다.

```ts
interface CultivatedArea {
  fieldTiles: number;
  paddyTiles: number;
  totalTiles: number;
}

interface FortificationStats {
  palisadeSegments: number;
  earthFortSegments: number;
  stoneWallSegments: number;
  gates: number;
  watchtowers: number;
  beacons: number;
}

function cultivatedArea(state: GameState): CultivatedArea;
function generalBuildingCounts(state: GameState): Partial<Record<BuildingTypeId, number>>;
function fortificationStats(state: GameState): FortificationStats;
function combatReadyResidentCount(state: GameState): number;
```

- **개간 면적:** 완공된 `field`·`paddy` 각각의 `plotArea(building)` 합이다.
  탐사한 땅, 일반 건물 점유칸, 묘역, 성벽은 넣지 않는다. UI 단위는 `칸`.
- **일반 건물 수:** `built === true`만 센다. `field`, `paddy`, `palisade`,
  `earthFort`, `stoneWall`, `gate`는 제외하고 농업·방어시설 통계로 따로 보낸다.
- **성벽 길이:** 완공된 목책·토성·석벽 건물 1개를 1구간으로 센다. 성문·망루·봉수는
  길이에 섞지 않고 각각 개수로 표시한다.
- **전투 가능 주민 수:** `createCombatRoster(state, { context: 'villageDefense' })`가
  돌려주는 실제 전투 가능 주민 수다. 직업명이나 무기 수량으로 별도 추정하지 않는다.
- **총 땔감:** 원목 하나만 보지 않고 기존 `fuelHeatTotal(state)`을 사용한다.
  스냅샷 필드 이름도 `firewood`가 아니라 `fuelHeat`로 둔다.

### 3-2. 누적값 (신규 카운터 — 발생 지점에서 증가)

```ts
export interface LifetimeStats {
  trackingSinceDay: number; // 신규 게임 1, 구세이브는 마이그레이션 당시 day
  births: number;
  deathsByCause: Record<DeathCauseId, number>; // 기존 totalDeaths는 유지·병행
  raidsRepelled: number;
  raidsSuffered: number;
  tradesCompleted: number;   // 플레이어 주도 + 정기거래 이행 합
  grantsReceived: number;
}
```

기존 `totalDeaths`·`winterDeaths` 등은 그대로 두고(다른 시스템이 쓴다),
`lifetimeStats`는 열람 전용으로 따로 쌓는다.

- 구세이브의 역산할 수 없는 누적값을 0부터인 평생 통계처럼 보이지 않는다.
  `trackingSinceDay > 1`이면 통계부에 `정착 N년차 M일부터 기록`이라고 표시한다.
- `raidsRepelled`: 전략·지도·전술 경로를 막론하고 최종 방어 결과가 승리인 습격 1건.
- `raidsSuffered`: 약탈, 건물 피해, 주민 사망 중 하나 이상이 발생한 습격 1건.
  발생만 하고 피해 없이 격퇴한 습격은 여기에 넣지 않는다.
- `tradesCompleted`: 실제 자원이 오간 거래 1회. 정기거래 체결 때 즉시 오가는 첫해분도
  1회이며, 계약 생성 자체를 별도로 더하지 않는다.
- `grantsReceived`: 한 번의 조정 하사 행사 전체를 1회로 센다. 품목 수는 세지 않는다.
- 전략 습격·지도 전투·전술 전투의 각 최종 결산 함수에서만 증가시키며 중간 라운드나
  장계 확인에서는 증가시키지 않는다.

### 3-3. 연도별 스냅샷 (추이 그래프용)

```ts
export interface YearlySnapshot {
  year: number;
  population: number;
  food: number;        // 식량 계열 합산
  fuelHeat: number;    // fuelHeatTotal(state)
  combatReadyResidents: number;
  buildings: number;   // 일반 건물만
  fieldTiles: number;
  paddyTiles: number;
  wallSegments: number; // 목책+토성+석벽
  silver: number;
}
```

- 신규 게임 day 1에 첫 스냅샷을 즉시 기록한다. 이후 날짜 증가로
  `getDayOfYear(day) === 1`이 된 직후, 그날의 소비·출생·사건을 처리하기 전에 1건 기록한다.
- `year`가 같은 스냅샷이 이미 있으면 추가하지 않는다. 저장·로드나 반복 호출로 중복되지 않는다.
- 구세이브는 마이그레이션 당일 현재 상태를 첫 스냅샷으로 기록한다. 과거 연도는 역산하지 않는다.
- `food`는 `foodTotal(state)`, `fuelHeat`는 `fuelHeatTotal(state)`,
  `combatReadyResidents`는 §3-1 공용 헬퍼를 사용한다.
- 상한 없음.
- 그래프는 인구·식량·군사 3개 선이면 충분하다. 캔버스가 아니라 SVG/div로 가볍게 —
  게임 렌더러와 무관한 UI 컴포넌트다.

## 4. 저장 스키마

- `state.settlementName`, `state.pendingSettlementRename`,
  `state.settlementRenameCooldownUntil`, `state.annals: AnnalsEntry[]`,
  `state.lifetimeStats: LifetimeStats`, `state.yearlySnapshots: YearlySnapshot[]` 신규 →
  마이그레이션 1회. 현재 v42 기준으로 **v43**이며, 실제 착수 전에 최신 버전을 다시 읽고
  그 값에서 정확히 +1 한다.
- **구세이브 백필**: 마이그레이션에서 `state.log`의 `important` 항목을 annals로
  옮긴다. `raid`는 `raid`, `trade`는 `trade`로만 확정 매핑하고
  `info/good/bad/weather`는 의미를 억지로 추정하지 않고 `legacy`로 넣는다.
  로그가 잘려 있으므로 불완전함을 감수하되 화면에 불완전 복원임을 표시한다.
- 구세이브에는 `generateSettlementName(seed)`로 이름을 넣고 개칭 대기 상태 `null`,
  개칭 쿨다운 0으로 초기화한다. day 1에
  `founding` 키를 가진 창건 기록을 만든다. 마이그레이션 당일에는
  `legacy:migration` 키로 `이전 기록은 남아 있는 주요 소식만 복원되었습니다`를 남긴다.
- 구세이브 `lifetimeStats`는 `trackingSinceDay = state.day`, 나머지 신규 카운터는 0으로
  시작한다. 기존 `totalDeaths`는 전체 기간 누적값으로 계속 표시하고, 원인별 사망만
  `trackingSinceDay` 이후 통계임을 밝힌다.
- `yearlySnapshots`의 과거 연도는 백필하지 않고 마이그레이션 당일 현재 상태를 첫 건으로 넣는다.
- 신규 게임은 `trackingSinceDay = 1`, `founding` 항목 1건, year 1 스냅샷 1건으로 시작한다.
- 모든 배열·카운터·이름은 일반 저장/로드 정규화에서도 타입과 유한값을 검사한다.

## 5. 구현 단계

| 단계 | 내용 | 완료 기준 |
|---|---|---|
| C1 | 데이터 층: 정착지 이름·생성기·개칭 대기/쿨다운·일일 허가 처리, annals·lifetimeStats·yearlySnapshots, 통계 헬퍼, v43 마이그레이션, 기록 지점 | 새 게임 3년 방치 시 이름·연대기·스냅샷이 쌓인다. 구세이브 이름·백필·기록 시작일 확인 |
| C2 | 이름 UI: 새 게임 랜덤 후보·주사위·직접 입력, 중심지 개칭 청원 | 빈칸 시작 없음, 파발 12일 뒤 적용, 적용 후 48일 제한, 왕복 중 저장 복원, 과거 문장 보존 |
| C3 | 연대기 화면 + 평시 진입점(중심지 팝업) | 평시에 열람·스크롤·현재 통계·그래프 표시 |
| C4 | 엔딩·게임오버 연결 (모달에 "연대기 보기") | 승격 엔딩과 전멸 각각에서 표제부가 맥락에 맞게 나오고 닫으면 원래 모달로 복귀 |

C1이 핵심이고 먼저 나가야 한다 — 이름·화면 작업(C2~C4)이 늦어져도 데이터는
쌓이고 있어야 한다.

### 기록 지점 (C1에서 삽입할 곳, 대표만)

- 정착지 이름: `newGame` 초기화, 중심지 개칭 청원 발송, 일일 파발 귀환·허가 처리부
- 승격: `promotion.ts` (승격 처리부)
- 게임오버: `simulation.ts`, `promotion.ts`, `suspicion.ts` 등 모든 `state.gameOver`
  설정 지점을 공용 `setGameOver` 계열 헬퍼로 모아 사유를 `ending`으로 1회 기록
- 습격·전투: 즉시 습격, 지도 전투, 전술 전투의 **최종 결산부**
- 재해·역병: 각 재해 발동/결산부
- 하사·교지: 하사품 처리부
- 특수 주민: 등장 이벤트 처리부
- 교역: 플레이어 주도 거래 확정과 정기거래의 실제 자원 교환부
- 출생·사망: 출생 처리부(`births`↑), 사망 처리부(`deathsByCause`↑ —
  기존 `lastDeathCause` 판정 재사용)
- 인구·건물: 인구 이정표 통과와 주요 건물 최초 완공 시 `dedupeKey` 사용
- 연초 스냅샷: 일 전환 처리에서 `getDayOfYear(day) === 1`일 때

### 표적 검증

- 같은 시드 자동 이름의 결정성과 이름 생성이 시뮬레이션 RNG 순서를 바꾸지 않는지
- 새 게임 입력칸에 후보가 미리 들어가고 주사위마다 후보가 바뀌며, 빈칸 시작이 막히는지
- 직접 입력 정규화·12글자 제한과 이름 저장 왕복
- 개칭 청원 발송 직후에는 옛 이름 유지, 11일에는 미적용, 12일에 적용되는지
- 개칭 적용일부터 47일에는 재청원 불가, 48일에는 가능하며 남은 일수 표기가 맞는지
- 개칭 왕복 중 저장·로드, 같은 이름 거부, 중복 청원 거부, 실제 적용 시 연대기 1건만 추가되는지
- v42→v43 구세이브 이름·개칭 기본 상태, `legacy` 로그 백필,
  `trackingSinceDay`, 현재 연도 스냅샷
- 신규 게임 창건 기록과 year 1 스냅샷이 정확히 한 번만 생기는지
- 출생과 사망 원인별 카운터, 전략·지도·전술 습격의 승리/피해 카운터가 결산당 한 번인지
- 플레이어 거래, 정기거래 체결 즉시 이행분, 정기거래 후속 이행분이 각각 한 번인지
- 인구·주요 건물 `dedupeKey`가 저장·로드 뒤에도 중복을 막는지
- `cultivatedArea`가 완공 밭·논의 확장 면적을 합산하고 공사 중·성벽·묘역을 제외하는지
- 일반 건물 수, 방어시설 구간, 전투 가능 주민 수, 총 땔감이 기존 공용 계산과 일치하는지
- C1은 위 표적 게임 테스트와 저장 회귀만 실행한다. 전체 게임 테스트는 최종 감사에서
  공용 결산 경로 변경의 영향이 크다고 판단될 때 한 번만 실행한다.

## 6. 비범위 (하지 말 것)

- 후반 엔딩의 연출·게이트·역사 시계 — 별도 계획(late-game-endings) 소관
- 로그 시스템 개편 — `state.log`는 그대로 둔다
- 사건의 소급 재구성 — 백필은 로그 important 한정, 그 이상 추정하지 않는다
- 통계의 실시간 그래프/대시보드화 — 이 화면은 회고용이다. 평시 운영 정보는
  기존 UI 소관
- 스크린샷/공유 기능 — 추후
