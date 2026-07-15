# 스펙: 전술 전투 미니맵 (전장 지도) — 2026-07-15

무대 우상단에 전장 전체의 아군·확인된 적 배치를 점/아이콘으로 보여주는 표시 컴포넌트.
상시 텍스트 라벨 없음, 정보는 마우스오버 툴팁. 전투 종류에 따라 형태가 바뀐다:

- **방어전·토벌전**: 가로 스트립형 (전장이 선형이므로)
- **몰이사냥**: 원형 — 부채꼴 3구역이 중앙(굴)을 둘러싼 형태

기준 코드: `codex/combat-system-expansion` @ `2544766` (팝오버·REVIEW 계획 구현 완료 상태).
게임 로직 변경 없음 — 기존 상태만 읽는 순수 표시 컴포넌트 + 클릭 내비게이션.

## 0. 설계 원칙

1. **읽는 지도이지 조작판이 아니다** — 1차 기능은 상황 파악. 클릭은 '구역 보기'와
   '부대 선택' 두 가지만. 명령·표적 지정은 여기서 하지 않는다 (무대·팝오버의 역할).
2. **상시 텍스트 0에 가깝게** — 점·아이콘·게이지만. 구역 이름은 지도 아래 한 줄
   슬롯에 호버/현재 구역 것만 표시.
3. **전장의 안개 준수** — 무대에 보이는 것만 지도에 보인다. 판정은 무대와 같은 함수
   (`tacticalRaiderVisibleDuringPlayback`)를 재사용하고, 새 노출 규칙을 만들지 않는다.
4. **기존 조작과 중복 금지** — 하단 `.tactical-stage-index`(구역명 + N/M)는 미니맵이
   흡수하므로 **제거**한다 (`TacticalBattleScreen.tsx:673` 부근). ‹ › 내비 버튼은 유지.

## 1. 파일 구성

| 파일 | 내용 |
|---|---|
| `src/components/tactical/TacticalMiniMap.tsx` | 신규. 스트립/원형 두 레이아웃 렌더 |
| `src/components/tactical/minimapGeometry.ts` | 신규. 원형 지도의 순수 기하 함수 (node 테스트 가능) |
| `src/styles/global.css` | `.tactical-minimap*` 스타일 추가 |
| `tools/game/test_minimap_geometry.mjs` | 신규. 기하 함수 단위 테스트 |
| `tools/game/test_tactical_components.mjs` | 소스 계약 assert 추가 (§9) |

## 2. 컴포넌트 계약

```tsx
interface Props {
  battle: NonNullable<GameState['tacticalBattle']>;
  hunt: boolean;
  assault: boolean;
  viewedZoneId: string;
  selectedGroupId: string | null;
  eventIndex: number;               // 재생 중 노출 판정에 필요 (무대와 동일 인자)
  playback: boolean;                // true면 클릭 잠금 (표시는 계속 갱신)
  onViewZone: (zoneId: string) => void;      // 기존 showZone/setViewedZoneId 재사용
  onSelectGroup: (groupId: string) => void;  // 기존 selectGroup 재사용
}
```

렌더 위치: `.tactical-stage-shell`의 자식 (팝오버와 형제). 절대 배치 우상단.
`z-index: 70` — 계층 계약: 부대 인라인 z ≤ 60대 < **미니맵 70** < 선택 부대 80 < **팝오버 90**.
미니맵은 70으로 **일반 스프라이트와 무대 연출 요소 위, 선택 부대·팝오버 아래**이며
우상단 코너라 실제 겹침은 드물다. 팝오버가 미니맵을 덮는 것은 허용(팝오버가 우선).

데이터는 전부 기존 상태에서 파생 (새 상태 없음):
`battle.zones`(id/name/pressure/breached), `defenderGroups`(zoneId/line/kind/label/count/
wounded/killed/command/ambushed), `raiderGroups`(zoneId/line/label/count/killed/power/
intent/revealed/rearAssault/confused/beastKind), `huntEncirclement`,
`huntPredatorState`, `huntBaitZoneId`, `huntTrapZoneId`.

## 3. 마커 규칙 (두 레이아웃 공통)

| 대상 | 마커 | 색 |
|---|---|---|
| 아군 전투조 | 채운 사각 점 6px (5명 미만) / 8px (5명 이상) | `#d2a958` |
| 피난 주민(civilian) | 속 빈 원 6px | `#9fb3a8` |
| 확인된 적 | 채운 원 6px / 8px (5명 이상) | `#c96f57` |
| 정체불명 적 (`revealed === false`) | 속 빈 원 6px | `#8f979b`, 툴팁 "정체불명" |
| 후방 급습대 (`rearAssault`) | 채운 원 + 1px 붉은 외곽링 | `#c96f57` + ring `#e8b9ae` |
| 혼란(`confused`) / 퇴각(`intent === 'withdraw'`) | 해당 마커 opacity 0.45 | — |
| 짐승 (사냥, 발각) | 채운 마름모 8px, 상태색 | 경계 `#c96f57` / 부상 `#e0a33f` / 도주 `#8f979b` |
| 짐승 (사냥, 은닉) | 중앙 원에 발자국 점 3개 | `#8f979b`, 툴팁 "은닉 — 위치 미확인" |
| 미끼 / 함정 (사냥) | 4px 마름모, 부채꼴 안쪽 가장자리 | 미끼 `#e0a33f` / 함정 `#7f9bb3` |

- 전멸한 조(`activeCount === 0`)는 그리지 않는다.
- **선택 부대**: 점 둘레에 금색 링 (`box-shadow: 0 0 0 2px #f2c35f`).
- 인원수를 점 크기 연속 스케일로 표현하지 않는다 — 2단계뿐. 수치는 툴팁.

**툴팁 (전부 `title` 속성, 커스텀 툴팁 금지 — 게임 전역 관례)**
- 아군: `` `${group.label} ${active}명 · ${열|길목} · ${commandLabel(...)}` `` —
  라벨·명령 문자열은 반드시 `commandText.ts`의 기존 함수 재사용.
- 적: `` `${raider.label} ${active}명 · 전력 ${Math.round(power)}` `` + 무대 칩과 동일한
  의도 문자열 (TacticalZoneColumn이 쓰는 함수를 export해 재사용 — 문자열 이중화 금지).

## 4. 레이아웃 A — 스트립형 (방어전·토벌전)

크기: 전체 224×72px (지도 224×56 + 이름 슬롯 224×16). 반투명 배경
`rgba(14,17,19,0.82)`, 테두리 `1px solid rgba(143,110,57,0.45)`, radius 4px.

```
┌──────┬──────┬──────┬──────┐  세그먼트 폭 = 224 / zones.length
│ ●●│▲▲│ ●│▲▲▲│      │    ○│  세그먼트 내부: 적 40% | 아군 60%
│______│______│      │      │  하단 3px = 압박 게이지 (zone.pressure/100)
└──────┴──────┴──────┴──────┘
│  ▾(현재 초점)                │  이름 슬롯: 호버 중 구역 > 없으면 보는 구역
```

- **세그먼트 = `<button>`**, `aria-label={`${zone.name} 보기 · 아군 ${n}개 조 · 적 ${m}개 조`}`,
  클릭 → `onViewZone(zone.id)`. 보는 구역(`viewedZoneId`)은 밝은 테두리 `#d0a651`.
- **현재 초점(`battle.currentZoneId`)**: 세그먼트 아래 4px 삼각 마커. 보는 구역과 다른
  개념임을 시각적으로 분리 (REVIEW #7에서 두 개념이 어긋날 수 있음이 확인됨).
- 세그먼트 내부 방향: 방어전은 적이 왼쪽(진격 방향과 일치). **토벌전은 무대가 좌우
  반전이므로(`.tactical-screen.assault`) 미니맵도 `row-reverse`로 반전** — 무대와 지도의
  좌우가 항상 일치해야 한다.
- 아군 60% 영역은 전열→중열→후열 3개 서브 컬럼 (전열이 적 쪽). 컬럼 안에서 점을
  세로로 쌓는다 (최대 4개, 그 이상은 마지막 점을 8px 대형으로 대체).
- **후방 급습대는 아군 후열 컬럼 뒤(바깥쪽)에** 배치 — "뒤를 잡혔다"가 지도에서 보인다.
- 돌파(`zone.breached`): 세그먼트 배경에 붉은 톤 `rgba(160,58,44,0.25)`.
- **점 = `<span title=...>`이고 클릭 불가가 기본. 아군 점만 `<button tabIndex={-1}>`**
  (마우스 클릭 → `onSelectGroup`, `event.stopPropagation()`; Tab 순회에는 안 잡힘 —
  세그먼트 버튼 안에 탭스톱을 늘리지 않기 위함). 버튼 안에 버튼을 넣을 수 없으므로
  **세그먼트는 `role="button"`인 div**로 구현한다 (Enter/Space 키핸들러 포함).

이름 슬롯: 한 줄 고정 높이. 우선순위 = 호버 중 세그먼트 > `viewedZoneId`.
텍스트: `` `${zone.name} ${index + 1}/${zones.length}` `` (기존 stage-index 문자열 계승).

## 5. 레이아웃 B — 원형 (몰이사냥)

SVG `viewBox="0 0 128 128"`, 실크기 128×128 + 아래 이름 슬롯 16px.

| 요소 | 기하 |
|---|---|
| 부채꼴 3개 | 환형 섹터, 외경 R=52, 내경 r=22, 각 120° |
| 섹터 0 (첫 길목) | 중심각 −90°(정북) → 시작 −150°, 끝 −30° |
| 섹터 1, 2 | 시계방향으로 +120°씩 (우하, 좌하) |
| 중앙 굴(huntDen) | 원 r=17, 채움 `rgba(28,33,36,0.9)` |
| 포위망 링 | 원 r=58, strokeWidth 3, `stroke-dasharray`로 `huntEncirclement`% 진행, 시작점 정북, 색 `#d2a958` |
| 부대 점 | 섹터 중심각 반경 37 위치, 같은 섹터 복수 조는 중심각 ±16° 간격 부채 배치 |
| 미끼/함정 | 해당 섹터 중심각, 반경 26 (안쪽 가장자리) |
| 짐승(발각) | 해당 구역 섹터 반경 37 (굴이면 중앙) |
| 짐승(은닉) | 중앙 원 안 발자국 3점 |

**섹터↔길목 매핑은 `battle.zones`에서 `huntDen`을 제외한 배열 순서로 고정** (0=북,
1=우하, 2=좌하). 라운드가 바뀌어도 절대 재배열하지 않는다.

기하는 전부 `minimapGeometry.ts`의 순수 함수로:

```ts
// 각도는 deg, 0°=동쪽, −90°=북쪽 (SVG 표준 극좌표)
export function polarPoint(cx: number, cy: number, r: number, deg: number): [number, number];
// 환형 섹터 path d 문자열 (M→A→L→A→Z)
export function annularSectorPath(
  cx: number, cy: number, rOuter: number, rInner: number,
  startDeg: number, endDeg: number,
): string;
// 섹터 index(0..2)와 슬롯 index로 점 좌표 계산 (복수 조 부채 배치 포함)
export function huntDotPosition(
  sectorIndex: number, slotIndex: number, slotCount: number, radius?: number,
): [number, number];
// 포위망 링의 stroke-dasharray 값
export function encirclementDash(percent: number, radius?: number): string;
```

- 섹터는 `<path role="button" aria-label=...>` + `tabIndex={0}` + 키핸들러,
  클릭 → `onViewZone`. 보는 구역 섹터는 `stroke: #d0a651; stroke-width: 1.5`.
- 호버 섹터는 채움을 `rgba(210,169,88,0.14)`로.
- 아군 점은 `<circle>`/`<rect>` + `<title>` 자식 요소 (SVG 네이티브 툴팁) +
  `pointer-events: all`, 클릭 → `onSelectGroup`.

## 6. 상태·수명 규칙

- **표시 대상 phase**: `deployment`, `command`, `simulating`, `report`.
  `preparation`/`preparationExecution`에서는 렌더하지 않는다 (배치 전이라 지도가 비고,
  준비 연출과 겹침).
- **재생 중(`playback === true`)**: 클릭 전부 잠금 (`pointer-events: none`) +
  opacity 0.85. 표시는 상태를 따라 자동 갱신 — 라이브 전황판 역할.
- 적 노출 판정: 무대와 동일하게 `tacticalRaiderVisibleDuringPlayback(battle, group,
  eventIndex)` 통과분만. `revealed === false`면 정체불명 마커.
- 팝오버가 열려 있어도 미니맵 동작에 영향 없음. 미니맵 클릭으로 구역이 바뀌면
  기존 계약(구역 스크롤 시 팝오버 닫힘)이 그대로 발동한다 — 별도 처리 불필요.

## 7. CSS 골격

```css
.tactical-minimap {
  position: absolute;
  z-index: 70;
  top: 34px;            /* 구역 헤더 바(이름/압박) 아래 */
  right: 10px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 5px;
  border: 1px solid rgba(143, 110, 57, 0.45);
  border-radius: 4px;
  background: rgba(14, 17, 19, 0.82);
}
.tactical-minimap.playback { pointer-events: none; opacity: 0.85; }
.tactical-minimap-strip { display: flex; width: 224px; height: 56px; }
.tactical-minimap-strip.assault { flex-direction: row-reverse; }
.tactical-minimap-name {
  height: 14px;
  overflow: hidden;
  color: #8f979b;
  font-size: 9px;
  text-align: center;
  white-space: nowrap;
}
/* 세그먼트·점·게이지·SVG 클래스는 §4·§5 규칙대로 — 색상 토큰은 §3 표의 값 사용 */

@media (max-width: 900px) { .tactical-minimap { display: none; } }
/* 모바일은 무대 자체가 작아 지도가 연출을 가린다 — 1차 범위에서 제외 */
```

## 8. 하지 말 것

- 미니맵에서 명령·표적 지정 금지 — 클릭은 '구역 보기'와 '아군 부대 선택' 둘뿐.
- 마커 옆 상시 텍스트(이름·숫자) 금지 — 이름 슬롯 한 줄과 툴팁이 전부.
- 노출 판정 자체 구현 금지 — 무대와 다른 걸 보여주는 순간 지도가 거짓말을 한다.
  반드시 `tacticalRaiderVisibleDuringPlayback` 재사용.
- 툴팁 문자열 하드코딩 금지 — `commandText.ts`와 무대 공용 함수에서 가져온다.
- `<button>` 안에 `<button>` 중첩 금지 — §4의 role="button" div 패턴을 따를 것.
- 사냥 섹터를 라운드 상황에 따라 재배열 금지 — 매핑은 zones 배열 순서로 불변.
- `.tactical-stage-index`를 남겨두고 미니맵을 추가하지 말 것 — 역할 중복. 제거가 조건.
- 원형 기하를 컴포넌트 안에 인라인으로 쓰지 말 것 — `minimapGeometry.ts`로 분리
  (테스트 가능해야 함).

## 9. 검증

수동 (전투 시뮬레이션 1280×720):
- [ ] 방어전: 4세그먼트, 아군 점이 배치대로, 적은 확인된 조만. 정체불명 = 속 빈 원
- [ ] 배치 단계에서 부대를 옮기면 즉시 반영, 아군 점 클릭 → 해당 부대 선택 + 무대 이동
- [ ] 세그먼트 클릭 → 무대 이동, 이름 슬롯 갱신, ▾(현재 초점)와 테두리(보는 구역) 구분
- [ ] 후방 급습 라운드: 급습대 점이 아군 후열 바깥에 링 달고 표시
- [ ] 재생 중: 클릭 잠김, 사상·퇴각에 따라 점이 사라지고 흐려짐
- [ ] 토벌전: 좌우 반전이 무대와 일치
- [ ] 사냥: 섹터 3 + 중앙, 은닉 시 발자국·발각 시 실구역 마름모, 미끼/함정 아이콘,
      포위망 링이 헤더 %와 일치, 섹터 클릭 이동
- [ ] 하단 stage-index가 사라졌고 ‹ ›는 동작
- [ ] 팝오버와 동시 표시 시 팝오버가 위 (z 90 > 50)

자동:
- `test_minimap_geometry.mjs`: `annularSectorPath` 시작/끝점 좌표, `huntDotPosition`
  단일/복수 슬롯 대칭, `encirclementDash` 0%/50%/100% 경계값
- `test_tactical_components.mjs` 소스 계약:
  - [ ] 미니맵 소스가 `tacticalRaiderVisibleDuringPlayback`를 import할 것
  - [ ] 미니맵 소스가 `commandText` 모듈을 import할 것 (문자열 하드코딩 금지 계약)
  - [ ] `tactical-stage-index`가 TacticalBattleScreen에서 제거되었을 것
  - [ ] 일반 부대 z-index 60대 < 미니맵 70 < 선택 부대 80 < 팝오버 90 계약 (CSS 정규식)
- [ ] `npm run test:combat` / `npm run test:game` / `npm run build` / `git diff --check`
