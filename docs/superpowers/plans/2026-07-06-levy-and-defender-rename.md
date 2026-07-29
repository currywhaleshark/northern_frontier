# 수비병 개명 + 전 주민 징집(민병) 선택지 계획

> **계획 상태:** 완료
> **상태 갱신:** 2026-07-29 — 전 주민 징집 선택지와 수비병 표시명 변경을 반영했다.

## 목표

1. 상비 전투 직업 `militia`의 **표시 이름을 "민병" → "수비병"으로 변경** (혼동 해소).
2. 습격 선택지 개편:
   - 기존 선택지: **"수비병으로 요격"** — 지금처럼 수비병(militia) + 파수꾼만 출전.
   - 새 선택지: **"민병을 징집한다"** — 앓지 않고 건강 20 이상인 **주민 전체**가 전투에 참여.
     훈련 안 된 주민이라 1인당 방어 기여는 낮고, 부상 위험은 넓게 퍼진다.

## 필수 배경 (구현 전 읽기)

- `src/game/battles.ts`: 전투 모듈. `startBattle()`이 민병+파수꾼을 `defenderIds`로 징집하고,
  **`draftedJobs`로 원래 직업을 백업한 뒤 전투 동안 job을 'militia'로 바꿨다가 종료 시 복원**하는
  메커니즘이 이미 있다 (Battle.draftedJobs, finishBattle의 복원 루프). 이 메커니즘을 재사용하되
  아래 "방어도 함정"을 반드시 지켜야 한다.
- `src/game/buildings.ts` `computeDefense()`: **job이 'militia'인 주민 1인당 방어도 12**
  (군영 있으면 ×1.3), 파수꾼 6. battleTick은 매 틱 `computeDefense(state)`를 다시 계산한다.
- `src/game/raids.ts` `openRaidChoice()`: 선택지 정의(id 'militia' 유지). `resolveRaid()`:
  `startBattle()`이 false(지도에 무리 없는 폴백 습격)면 즉시 주사위 판정.
- 승패 확률은 `rollBattleOutcome()` = defense/(defense+power). 소모전은 연출.

## ⚠️ 방어도 함정 (가장 중요)

전 주민 징집을 기존 draftedJobs 방식(job을 'militia'로 스왑)으로 구현하면
`computeDefense()`가 **주민 전원을 1인당 12로 계산해 방어도가 폭증**한다 (인구 20명 = +240).
절대 그렇게 하지 말 것. 대신:

- 징집 주민의 **job은 바꾸지 않는다** (전투 행동은 어차피 `defenderIds` 기반
  `battleAgentTick`이 우선하므로 job 스왑 없이 동작한다).
- 징집 보너스는 **명시적 수치로 Battle에 스냅샷**해 두고 방어도에 더한다:
  `battle.levyBonus = levyDefense × (징집된 비전투 주민 수)`.
  `battleTick`에서 `applyBattleDefenseMultipliers(computeDefense(state) + (battle.levyBonus ?? 0), ...)`.
- 참고: 현행 코드도 파수꾼을 'militia'로 스왑해 전투 중 6→12로 부풀리는 문제가 있다.
  이번 작업에서 **기존 요격 경로도 job 스왑을 제거**하고 draftedJobs는 남겨두되
  "복원할 것이 있을 때만" 쓰는 안전망으로 유지하라 (렌더링 색상 때문이라면 무시해도 된다 —
  전투 중 task 문자열로 충분히 구분된다).

## 변경 목록

### 1. 표시 이름 변경 (내부 id `militia`는 유지 — 저장 호환)

- `src/game/constants.ts`: `JOB_NAMES.militia: '수비병'`,
  `JOB_DESC.militia`: "군영(없으면 마을 중심)에서 조련하는 상비 수비병입니다. 방어도가 크게 오릅니다."
- `src/game/buildings.ts` garrison desc: "민병의 방어 기여" → "수비병의 방어 기여".
- `src/game/battles.ts` 로그: "민병대가 소집되었습니다/물리쳤습니다/밀려났습니다" →
  요격 모드는 "수비병"으로. README의 민병 언급도 수정.
- 검색: `Grep '민병' src README.md` 로 남은 문자열 일괄 확인.

### 2. 타입/설정

- `types.ts` `Battle`에 `mode: 'garrison' | 'levy'`(요격/총동원)와 `levyBonus?: number` 추가.
  구버전 저장: `mode` 없으면 'garrison'으로 간주 (`battle.mode ?? 'garrison'` 또는 saveLoad에서 채움).
- `config.ts` `raid`에 `levyDefensePerResident: 4` 추가 (파수꾼 6, 수비병 12와 비교되는 값).
  주석: "징집된 일반 주민 1인당 방어 기여".

### 3. `battles.ts`

- `startBattle(state, mode: 'garrison' | 'levy')`:
  - garrison: 지금과 동일 (militia+watchman 징집), job 스왑 제거(§함정).
  - levy: 필터를 전 주민(!sick && health ≥ 20)으로 확장. 비전투 직업 주민 수 × levyDefensePerResident를
    `battle.levyBonus`로 저장. 로그: "온 마을이 낫과 도끼를 들었습니다. ○○에 맞서 주민들이 나섭니다."
- `battleTick`: defense 계산에 `+ (battle.levyBonus ?? 0)` (muster의 outcome 굴림과 clash 양쪽 —
  현재 defense 계산이 한 곳이라 그대로 반영됨).
- 부상 리스크 차등: levy는 `maybeInjureDefender` 심각도 그대로 두되 **틱당 최대 2명**으로
  (일반 주민이 앞줄에 서니 피해가 넓게 퍼진다). 패배 시 마무리 부상도 garrison 1~2명 → levy 2~4명.
- 승리 로그도 모드별 문구 분리.

### 4. `raids.ts`

- `openRaidChoice()` options 교체:
  - id 'militia' → label "수비병으로 요격", desc "수비병과 파수꾼이 출전합니다. 훈련된 소수의 싸움입니다."
  - 신규 id 'levy' → label "민병을 징집한다", desc "온 주민이 무기를 듭니다. 방어도가 오르지만
    부상이 널리 퍼지고, 며칠간 일손이 흔들립니다." (선택 불가 조건 없음).
- `resolveRaid()`:
  - 'militia' case: `startBattle(state, 'garrison')`.
  - 'levy' case: `startBattle(state, 'levy')`; 폴백(무리 없음)은 즉시 판정 —
    successP 계산에 `+ levyDefensePerResident × 비전투 주민 수`를 더하고, 패배 부상 2~4명.

### 5. UI/문서

- `openRaidChoice` body의 "현재 방어도" 표기는 그대로 (levy 보너스는 desc로 설명).
- README 습격 선택지 설명 갱신 (피난/요격/징집/공물/협상/봉수).

### 6. 테스트 (`tools/game/test_battles.mjs`)

- 기존 케이스는 `startBattle(state, 'garrison')` 시그니처로 갱신.
- 추가:
  - levy 징집: 전 주민이 defenderIds에 들어가고 levyBonus = 인원 × 4.
  - **방어도 함정 회귀**: levy 시작 후 `computeDefense(state)`가 시작 전과 같아야 한다
    (job 스왑으로 부풀지 않음).
  - levy 밸런스: 기존 full-loop 승률 테스트를 복제해 expected = (defense+levyBonus)/(…+power) 확인.
  - 폴백 levy 즉시 판정 경로.
- `npm run build` + `node tools/game/test_battles.mjs`.

## 밸런스 메모

- levy는 "방어도 부족한 초반의 도박" 포지션: 인구 12명(비전투 ~10명)이면 +40 방어 —
  초반 습격(power 22~40)을 뒤집을 수 있는 수준. 대신 부상이 생산 인력 전체에 퍼져
  이후 며칠 생산이 꺾인다. 수비병을 갖춘 후반엔 요격이 우월하도록 levyDefensePerResident는
  4를 넘기지 말 것.
