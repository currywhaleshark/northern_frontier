# 조정 공물(세공) 시스템 계획

> **계획 상태:** 완료
> **상태 갱신:** 2026-07-29 — 격년 세공 납부, 기한, 조정 UI를 구현했다.

## 목표

해마다 조정(한양)에 공물을 보내야 한다. **그 해에 무엇을 얼마나 보내야 하는지는
봄 첫날에 미리 공지**되어 플레이어가 세 계절 동안 준비하고, **겨울 첫날 조정의 사자가
도착해 거둬 간다**. 바치면 명성이 오르고, 못 바치면 명성이 크게 떨어지며 국경이 험악해진다.

## 필수 배경

- 계절: `seasonDays 12 / yearDays 48`, `getSeason`/`getYear`(src/game/seasons.ts).
  계절 전환 훅은 `simulation.ts`의 `onSeasonChange(state, prev, next)` — 봄/겨울 분기가 이미 있다.
- 모달: `PendingChoice`는 현재 `kind: 'raid' | 'trade'`. `resolveChoice()`(simulation.ts)가
  kind별로 라우팅. 'tribute' kind를 추가하면 흐름 재사용 가능 (`advanceTick`이 모달 중 정지하는
  것도 그대로 적용됨).
- 명성: `resources.reputation`(0~100). 35 미만이면 위협도 가산(threat.lowRepExtra),
  습격 협상 성공률에도 쓰인다 — 공물은 이 명성 루프의 주 공급원이 된다.
- 난수: `makeRng(seed + …)` 패턴으로 결정적 롤 (resolveChoice 참고).

## 설계

### 1. 상태/타입 (`types.ts`)

```ts
export interface CourtTribute {
  year: number;                                // 몇 년차 공물인지
  items: Partial<Record<ResourceId, number>>;  // 요구 품목 (1~2종)
  dueDay: number;                              // 겨울 첫날 (수거일)
  paid: boolean;
}
```
`GameState.courtTribute: CourtTribute | null` 추가.

### 2. 신규 모듈 `src/game/courtTribute.ts`

- `rollCourtTribute(seed, year, population): CourtTribute` — **시드+연차만으로 결정적**
  (불러오기 시 재생성 가능). 품목 풀: 가죽(북방 특산), 곡물, 철, 옷, 약초 중 1~2종.
  수량은 연차와 인구에 비례해 상승: 대략 `기준량 × (1 + 0.3×(year-1)) × (0.7 + pop/40)`.
  기준량 예시(config로): 가죽 8, 곡물 25, 철 3, 옷 6, 약초 6. 1년차는 가볍게(한 품목).
- `announceCourtTribute(state)` — 봄 첫날 호출: `state.courtTribute = rollCourtTribute(…)`,
  로그(kind 'info'): "조정에서 파발이 왔습니다. 올해 세공: 가죽 10, 곡물 30 — 겨울이 오기 전까지 준비하십시오."
- `openCourtTributeChoice(state)` — 겨울 첫날 호출(미납 상태일 때): `PendingChoice(kind:'tribute')`:
  - "공물을 바친다" — 자원 부족 시 disabled(사유 표기). 효과: 자원 차감, 명성 +6(최대 100),
    격년 보상: 조정 하사품(도구 2 또는 옷 3, 결정적 롤)으로 성실 납부에 답례.
  - "올해는 바치지 못한다" — 명성 -12, threat +8, `tributeFailStreak`(신규 카운터) +1,
    로그: "조정의 눈 밖에 났습니다…". 2년 연속 실패 시 명성 -20으로 가중(게임오버는 아님 —
    기존 패배 조건과 겹치지 않게).
- `resolveCourtTribute(state, optionId)` — 위 효과 적용 + `paid=true` + pendingChoice 해제.

### 3. 연결 (`simulation.ts`)

- `onSeasonChange`: `next === 'spring'` → `announceCourtTribute(state)`;
  `next === 'winter'` → 미납이면 `openCourtTributeChoice(state)`.
  주의: **겨울 진입 시 이미 습격 모달이 떠 있으면**(pendingChoice 충돌) 다음 날로 미룬다 —
  endOfDay에서 "겨울 && courtTribute 미납 && pendingChoice 없음 && battle 없음"이면 열도록
  하는 편이 안전하다 (계절 훅 한 번이 아니라 매일 검사).
- `newGame`: 1년차 봄이 day 1이므로 초기화 직후 `announceCourtTribute` 호출.
- `resolveChoice`: `kind === 'tribute'` 라우팅 추가.

### 4. UI — 미리 준비할 수 있게

- 우측 사이드바의 승리 조건 패널(문자열 '승격까지 남은 조건'으로 Grep해 컴포넌트 위치 확인)
  아래에 "조정 공물" 섹션 추가: 품목별 `요구량 / 현재 보유` (충족 품목은 초록, 부족은 붉게),
  남은 기한("겨울까지 N일"). 납부 완료 후엔 "올해 세공 납부 완료 ✓".
- 봄 공지·수거·실패는 모두 로그에도 남긴다 (위 §2).

### 5. 저장 호환 (`saveLoad.ts`)

- `if (!('courtTribute' in parsed))`: `rollCourtTribute(parsed.seed, 현재 연차, 인구)`로 재생성하되,
  이미 겨울이면 `paid: true`로 (구 저장은 올해분 면제, 다음 봄부터 정상 진행).
- `tributeFailStreak` 없으면 0.

### 6. 밸런스 메모

- 공물은 "가을 수확 직후 겨울 비축과 경쟁하는 지출"이 핵심 긴장이다. 겨울 생존 필수품(식량·장작)은
  **요구 품목에서 제외**하고 교역/생산 자원(가죽·곡물·철·옷·약초)만 걷는다 — 아사 유도 방지.
  곡물만 예외적으로 식량 경로와 겹치는데, 이는 의도된 압박(밭 확장 동기).
- 명성 +6/년이면 성실 납부만으로 습격 협상권(명성 높음)이 유지된다. 실패 -12는 2년 연속 시
  위협 가산 구간(35 미만)으로 떨어질 수 있는 수준.

### 7. 테스트 — `tools/game/test_court_tribute.mjs` (test_battles.mjs 컴파일 패턴 복사)

- `rollCourtTribute` 결정성(같은 seed+year → 같은 요구) / 연차·인구 스케일링 / 품목 풀 준수
  (식량·장작 미포함).
- 봄 전환 시 공지·state 세팅, 겨울 전환 시 모달 오픈, pendingChoice 충돌 시 다음 날로 밀리는지.
- 납부: 자원 차감·명성 +6·paid=true. 실패: 명성 -12·threat +8·streak 증가, 2연속 가중.
- 저장 마이그레이션 (겨울 로드 시 올해분 면제).
- `npm run build` + 기존/신규 노드 테스트.

## 건드리지 않는 것

- 세력 관계/교역/습격 공물(tribute 옵션 — 이름은 겹치지만 별개 시스템, id 충돌 없음:
  PendingChoice kind가 다르다). 승리/패배 조건.
