# 플레이어 주도 교역 계획 (장터/세력탭에서 거래 시작)

## 목표

장터를 지어도 지금은 무작위 제안(`maybeOfferTrade`)을 기다리는 수밖에 없다.
플레이어가 먼저 거래를 걸 수 있게 한다:

1. **세력 탭**: 교역품이 있는 세력마다 "거래하기" 버튼.
2. **장터 클릭**: 타일 정보 패널에 거래 가능한 세력 버튼 목록 표시 (같은 헬퍼 재사용).

## 필수 배경

- `src/game/events.ts`: `maybeOfferTrade()`(무작위 제안 → `PendingChoice(kind:'trade')`),
  `resolveTrade()`(accept/decline 처리, decline은 명성 -1 + `tradeRefusedDays=10` 벌칙).
- `src/game/constants.ts` `FACTIONS[].trades: TradeOffer[]` — 세력별 고정 교환비 목록.
  trades가 빈 세력(홀라온, 변경 마적)은 거래 불가.
- `src/components/InspectorPanel.tsx`: 세력 탭(`tab === 'factions'`)에서 FACTIONS를 나열,
  타일 탭에서 building 정보 표시. App.tsx가 콜백을 내려주는 패턴(`onSetResidentJob` 참고).
- `advanceTick`은 `pendingChoice`가 있으면 멈춘다 — 플레이어 주도 거래도 같은 모달 흐름을 쓰면 된다.
- `resolveChoice()`(simulation.ts)가 kind별로 `resolveTrade`/`resolveRaid`로 라우팅한다.

## 설계

### 1. 게임 로직 — `events.ts`에 `requestTrade(state, factionName): string | null`

성공 시 null, 실패 시 사유 문자열(UI가 버튼 비활성 사유로도 사용):

- 장터 미건설 → "장터가 필요합니다"
- `state.pendingChoice || state.battle` → "지금은 거래할 수 없습니다"
- 해당 세력 trades 비어 있음 → "거래 품목이 없는 세력입니다"
- 관계 게이트: `getRelation < CONFIG.trade.minRelationToTrade`(신규, 35) → "관계가 나빠 상대해 주지 않습니다"
- 세력별 쿨다운: `state.day - (state.lastTradeByFaction[faction] ?? -999) < CONFIG.trade.playerCooldownDays`(신규, 6일)
  → "상단이 아직 돌아오지 않았습니다"

통과하면 `PendingChoice(kind:'trade')` 오픈:

- title: `장터 교역 — ${faction.name}`, body: 세력 설명 + "우리 쪽에서 먼저 사람을 보냈습니다."
- options: **그 세력의 trades 전부**를 `id: 'offer-0', 'offer-1', …`로 나열
  (label: "곡물 12 ↔ 가죽 8" 식, 자원 부족 시 disabled+사유) + `id: 'cancel', label: '돌려보낸다'`.
- data: `{ faction: faction.name, initiated: true, offers: faction.trades }`.

### 2. `resolveTrade()` 확장

- `data.initiated`가 참이면:
  - `optionId === 'offer-N'` → `data.offers[N]` 교환 적용 (자원 차감/증가, 관계 +tradeAccept).
    명성은 **+1만** (무작위 제안 수락 +2보다 작게 — 먼저 아쉬운 쪽이므로).
    `state.lastTradeByFaction[faction] = state.day` 기록. 로그 추가.
  - `optionId === 'cancel'` → **아무 벌칙 없이** 모달만 닫는다
    (기존 decline의 명성 -1 / tradeRefusedDays 벌칙은 상대가 찾아온 제안 전용 — 절대 섞지 말 것).
- 기존 무작위 제안 경로(accept/decline)는 변경 없음.

### 3. 상태/설정/저장

- `types.ts` `GameState`에 `lastTradeByFaction: Record<string, number>` 추가 (키: 세력 이름, 값: day).
- `simulation.ts` newGame에 `lastTradeByFaction: {}` 추가.
- `saveLoad.ts` 마이그레이션: `if (!parsed.lastTradeByFaction) parsed.lastTradeByFaction = {};`
- `config.ts` trade에 `minRelationToTrade: 35`, `playerCooldownDays: 6` 추가.

### 4. UI

- **App.tsx**: `onRequestTrade(factionName)` 핸들러 — `requestTrade(stateRef.current, name)` 호출,
  실패 사유는 로그로(`addLog(state, 사유, 'info')`)도 무방하나, 버튼을 미리 비활성화하므로
  보통 도달하지 않는다. InspectorPanel에 prop으로 전달.
- **InspectorPanel.tsx 세력 탭**: `f.trades.length > 0`인 세력 행에 "거래하기" 버튼.
  비활성 사유는 `requestTrade`의 검사와 같은 로직을 UI에서 재현하지 말고,
  **`canRequestTrade(state, name): string | null` 헬퍼를 events.ts에 분리**해
  버튼 disabled/title과 requestTrade 내부 검증이 같은 함수를 쓰게 한다.
- **타일 탭 (장터 클릭)**: `building.type === 'market' && building.built`이면 건물 설명 아래에
  거래 가능 세력 버튼 목록(세력 탭과 같은 버튼 컴포넌트/헬퍼 재사용).
- 모달 UI는 기존 PendingChoice 렌더링을 그대로 쓴다 — options가 2개보다 많아져도
  기존 컴포넌트가 배열을 나열하는지 확인만 할 것 (ChoicePanel/모달 컴포넌트 확인 필요).

### 5. 밸런스 메모

- 고정 교환비 + 세력별 6일 쿨다운이면 여러 세력을 돌려도 주기당 교환 횟수가 제한돼
  차익 반복(예: 도구→곡물 무한 반복)이 억제된다. 쿨다운은 세력별이 맞다 —
  전역 쿨다운이면 장터의 존재감이 죽는다.
- 관계 게이트(35) 덕에 적대 세력(니마차 등)과는 관계를 데운 뒤에만 거래 가능 — 기존
  "평시엔 장사꾼" 설정과 일치.

### 6. 테스트 — `tools/game/test_trades.mjs` 신규 (test_battles.mjs의 컴파일 패턴 복사)

- requestTrade 거부 사유들: 장터 없음 / trades 없는 세력 / 관계 낮음 / 쿨다운 / 전투 중.
- 성공 시 pendingChoice 생성 + options 수 = trades 수 + 1(cancel).
- resolveTrade: `offer-1` 수락 → 자원 이동·관계 상승·명성 +1·쿨다운 기록;
  `cancel` → 자원/명성/tradeRefusedDays 전부 불변 (벌칙 없음 회귀 고정).
- 무작위 제안 경로(accept/decline) 기존 동작 불변 확인.
- `npm run build` + 신규/기존 노드 테스트 실행.

## 건드리지 않는 것

- `maybeOfferTrade`(무작위 제안)와 그 확률/주기, 습격 협상(negotiate) 경로.
- FACTIONS 교환비 자체.
