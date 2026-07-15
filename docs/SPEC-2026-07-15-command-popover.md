# 스펙: 전술 전투 유닛 명령 팝오버 — 2026-07-15

`docs/REVIEW-2026-07-15-tactical-battle-ux.md`의 "유닛 클릭 명령 팝오버" 제안의 구현 스펙.
**이 문서는 그대로 따라 만들 수 있도록 좌표 계산·CSS·코드 구조까지 확정해 둔다.**
구현 전 반드시 "선행 조건"과 "하지 말 것" 절을 먼저 읽을 것.

## 0. 설계 원칙 (판단이 갈릴 때 이 순서로 결정)

1. **시선을 무대에 유지** — 부대를 보면서 명령한다. 팝오버는 가용 공간에 따라 유닛 위 또는
   아래에 붙고, 무대 밖으로 나가지 않는다.
2. **클릭 수 최소** — 유닛 클릭(1) → 명령 클릭(2)으로 끝. 열기 위한 별도 버튼 없음.
3. **하단 명령 바가 항상 진실** — 팝오버는 지름길이지 대체물이 아니다. 상태는 전부
   기존 경로(`onSetCommand`/`onSetFormationLine`/`onAssignGroup`)로만 변경한다.
   팝오버 자체는 상태를 소유하지 않는다(열림/앵커 좌표만).
4. **무대를 가리지 않음** — 폭 232px 고정, 유닛 가까이에 뜨고, 최대 높이를 넘으면 내부 스크롤.

## 1. 범위와 선행 조건

- **대상**: `battle.phase === 'command'`에서 무대의 아군 유닛(`.tactical-field-group`) 클릭 시.
- **제외**: 배치 단계(기존 패널 유지), 재생 중(`playbackActive`), 보고/장계 화면.
- **선행 조건**:
  1. REVIEW 문서 #2의 `tacticalSupportedCommands(battle)` 헬퍼가 먼저 존재해야 한다.
     (없으면 임시로 `COMMANDS.filter(c => tacticalCommandUnavailableReason(battle, group, c) !== '이 명령은 아직 사용할 수 없습니다.' ...)` 같은 문자열 비교를 하게 되는데 **금지** — 헬퍼부터 만들 것.)
  2. REVIEW의 **"유닛 클릭 명령 팝오버" 절 1단계**(무대 선택 강조 강화)는 이 작업과
     같은 PR에 넣어도 된다(아래 §8). (REVIEW 수정사항 #8[가시성]의 1번과는 다른 항목이니
     혼동 주의.)

## 2. 동작 명세 (상태 전이표)

팝오버 상태는 `TacticalBattleScreen`의 로컬 state 하나 + 포커스 복귀용 ref 하나:

```ts
interface CommandPopoverState {
  groupId: string;
  x: number;                      // .tactical-stage-shell 기준, 클램핑된 팝오버 중심 x
  y: number;                      // placement 기준점 (above: 유닛 상단 / below: 유닛 하단)
  placement: 'above' | 'below';   // §4의 순수 배치 함수가 결정
  caretShift: number;             // 유닛 중심 − 클램핑된 x (팝오버 폭 안으로 재클램핑됨)
  maxHeight: number;              // 배치 방향의 가용 공간에서 계산
}
const [commandPopover, setCommandPopover] = useState<CommandPopoverState | null>(null);
const popoverAnchorRef = useRef<HTMLElement | null>(null); // Esc 포커스 복귀 대상 유닛
```

닫기 API는 두 경로를 구분한다:

```ts
const closePopover = (options?: { restoreFocus?: boolean }) => {
  setCommandPopover(null);
  if (options?.restoreFocus) popoverAnchorRef.current?.focus();
};
```

**선택 변경으로 닫는 effect의 정확한 계약** (경합 주의 — 아래 그대로 구현):

```ts
// 열 때 selectGroup(groupId) + setCommandPopover({groupId, ...})를 같은 핸들러에서 호출하므로
// 렌더 후 selectedGroupId === commandPopover.groupId 가 성립해 이 effect는 무시된다.
// 독 칩 등 다른 경로로 선택이 바뀌었을 때만 불일치가 생겨 닫힌다.
useEffect(() => {
  if (commandPopover && selectedGroupId !== commandPopover.groupId) setCommandPopover(null);
}, [selectedGroupId, commandPopover?.groupId]);
```

`selectedGroupId` 변화에 무조건 닫으면 **방금 연 팝오버가 같은 렌더 사이클 뒤 즉시 닫힌다.**
반드시 위처럼 `groupId` 불일치일 때만 닫을 것.

| 사용자 행동 | 결과 |
|---|---|
| command 단계에서 아군 유닛 클릭 (또는 유닛에 포커스 후 Enter/Space) | 해당 부대 선택(기존 `selectGroup`) **+ 팝오버 열기** |
| 팝오버가 열린 유닛을 다시 클릭 | 팝오버 닫기 (선택은 유지) |
| 다른 아군 유닛 클릭 | 선택 이동 + 팝오버가 그 유닛 위로 이동 |
| 팝오버 안 명령 버튼 클릭 | `assignCommandTo(popoverGroup.id, command)` 호출 → **팝오버 닫기**. 기존 자동 다음 부대 선택은 그대로 두되, **다음 부대의 팝오버를 자동으로 열지 않는다** (화면 점프 방지). 다음 부대는 §8의 펄스 강조로만 알린다 |
| 무대 배경 클릭 (유닛·적·팝오버 밖) | 팝오버 닫기 |
| Esc | 팝오버 닫고 포커스를 유닛으로 반환 |
| 하단 독 칩으로 부대 선택 | 팝오버 닫기 (독을 쓰는 사용자는 하단 바 사용 중) |
| 구역 이동 ‹ › / 배속 / 교전 개시 / phase 변화 | 팝오버 닫기 |
| 적 유닛 클릭 (표적 지정) | 팝오버는 유지 (표적과 명령은 독립 — 닫으면 오히려 흐름 끊김) |
| `group.commandable === false` 유닛(피난 주민) 클릭 | 팝오버 열되 §3의 "설명 전용" 모드 |

닫기 트리거 구현: phase/구역/선택 변화는 `useEffect`로, 배경 클릭은 stage shell의
기존 `onClick`(현재 `enableFastForward`)에 `setCommandPopover(null)` 추가, Esc는
팝오버 내부 `onKeyDown`.

## 3. 내용 구성 (위에서 아래로)

```
┌──────────────────────────────┐
│ 창 수비병 2명        [매복중] │  ← 헤더: 부대명+인원, 상태 배지
│ 지금 명령 · 고수              │  ← 현재 명령 (자동 배정이면 "자동 · 고수")
├──────────────────────────────┤
│ [전열] [중열] [후열]          │  ← 열 세그먼트 (방어전·토벌만, §3.2)
├──────────────────────────────┤
│ ● 고수                        │  ← 현재 명령 = 채워진 점 + active 스타일
│   대열을 고수해 적게 피해를…  │
│ ○ 돌격                        │
│   창을 앞세워 적진을 무너뜨…  │
│ ○ 일제 사격                   │
│   활과 조총 사격으로 적 기세…│
├──────────────────────────────┤
│ 적 부대를 클릭하면 집중 표적  │  ← 푸터 힌트 (방어전·토벌만, 9px muted)
│ 전체 명령은 아래 명령판에서   │
└──────────────────────────────┘
          ▼ (caret, 유닛 중앙을 가리킴)
```

### 3.1 명령 목록

- 노출 기준: `tacticalSupportedCommands(battle)` 중
  `tacticalCommandUnavailableReason(battle, group, command) == null`인 것 **만**.
  비활성 버튼을 팝오버에 넣지 않는다 — 비활성 목록·사유는 하단 바의 역할.
- 정렬: `tacticalSupportedCommands`가 반환한 순서 그대로 (양쪽 UI 순서 일치가 학습에 유리).
- 각 항목: 라벨(기존 `commandLabel(command, group, hunt)`) + 설명 1줄
  (기존 `commandDescription(command, group, hunt)`, CSS로 2줄 초과 말줄임).
- 현재 명령(`group.command === command`): `aria-checked` + active 스타일 + ● 마커.
  클릭하면 그대로 재확정(assignCommand)되고 닫힘 — "그대로 두기"가 한 클릭에 된다.
- 유효 명령이 0개인 극단 케이스(이론상 hold는 항상 유효하므로 거의 없음):
  "지금 내릴 수 있는 명령이 없습니다." 한 줄.

### 3.2 열/이동 세그먼트

- **방어전**: 전열/중열/후열 3버튼. 기존 규칙 그대로 — 인접 열만 활성
  (`tacticalFormationLinesAdjacent`), 비활성엔 title로 사유. 다른 열 클릭 =
  `assignFormationLineTo(groupId, line)` 호출 후 **팝오버 닫기**. 재배치는 그 자체가 이번 라운드의
  명령이고, 첫 지정이면 기존 흐름대로 다음 명령 대기 부대를 자동 선택하므로 팝오버를 유지하지
  않는다. 현재 선택된 열을 다시 누를 때만 유지한다.
  `pendingLine`이 있으면 해당 버튼에 "예약" 배지.
- **토벌전**: 인접 제한 없음. 다른 열을 누르면 유닛 DOM 위치가 즉시 바뀌므로 명령 적용 후
  팝오버를 닫는다(리포지셔닝하지 않는다는 §4 계약과 일치).
- **사냥**: 열 대신 길목 3버튼(`huntDen` 제외 zones). 다른 길목 클릭 =
  `onAssignGroup(groupId, zoneId)` + `setViewedZoneId(zoneId)` 후 팝오버 닫기.
  현재 길목이 아닌 버튼에는 title "이동한 조는 이번 라운드 몰이 기여가 절반으로 줄어듭니다."
  + 라벨 옆 `½` 표기.
- **설명 전용 모드**(피난 주민 등): 헤더 + "피난 주민은 보호 대상이며 전투 명령을 받지
  않습니다." 한 줄만. 버튼 없음.

## 4. 배치 알고리즘 (이대로 구현)

**앵커 컨테이너는 반드시 `.tactical-stage-shell`** (`position: relative`).
`.tactical-battlefield`는 `overflow-y: hidden`이라 그 안에 넣으면 **위로 잘린다** — 넣지 말 것.
그리고 **shell 자체도 `overflow: hidden`이므로 위쪽 배치만으로는 부족하다**: 유닛 위 공간이
모자라면 팝오버가 음수 영역으로 올라가 잘린다. 반드시 `above | below` 분기를 둔다.

배치는 **순수 함수로 추출**한다 — 신규 파일 `src/components/tactical/popoverPlacement.ts`.
DOM 없이 사각형 2개만 받으므로 node 테스트로 경계값 검증이 가능하다.

```ts
// src/components/tactical/popoverPlacement.ts
export interface PopoverPlacement {
  x: number;
  y: number;
  placement: 'above' | 'below';
  caretShift: number;
  maxHeight: number;
}

const WIDTH = 232;
const EDGE = 8;              // shell 가장자리 여백
const GAP = 10;              // caret 포함 유닛과의 간격
const MIN_HEIGHT = 120;      // 이보다 작으면 반대편으로 뒤집는다
const CARET_MARGIN = 20;     // caret이 팝오버 모서리 radius를 벗어나지 않게

export function computeCommandPopoverPlacement(
  unit: { left: number; top: number; width: number; height: number },   // shell 기준 좌표
  shell: { width: number; height: number },
): PopoverPlacement {
  const half = WIDTH / 2;
  const unitCenterX = unit.left + unit.width / 2;
  const x = Math.min(shell.width - half - EDGE, Math.max(half + EDGE, unitCenterX));
  const caretShift = Math.max(-(half - CARET_MARGIN), Math.min(half - CARET_MARGIN, unitCenterX - x));
  const spaceAbove = unit.top - GAP - EDGE;
  const spaceBelow = shell.height - (unit.top + unit.height) - GAP - EDGE;
  // 유닛은 무대 바닥에 붙어 있어 보통 above가 성립한다. above 공간이 부족할 때만 below.
  const placement: 'above' | 'below' =
    spaceAbove >= MIN_HEIGHT || spaceAbove >= spaceBelow ? 'above' : 'below';
  // MIN_HEIGHT는 방향 선택 기준일 뿐, 반환 높이의 하한이 아니다. 실제 가용 공간보다 큰 값을
  // 반환하면 shell의 overflow:hidden에 다시 잘린다. 양쪽 모두 좁으면 더 넓은 쪽의 실제 높이를
  // 반환하고 컴포넌트가 constrained 모드로 전체 내용을 스크롤한다.
  return placement === 'above'
    ? { x, y: unit.top - GAP, placement, caretShift, maxHeight: Math.max(0, spaceAbove) }
    : { x, y: unit.top + unit.height + GAP, placement, caretShift,
        maxHeight: Math.max(0, spaceBelow) };
}
```

호출부 (`TacticalBattleScreen`):

```ts
// TacticalZoneColumn의 유닛 onClick에서 element를 함께 넘긴다 (시그니처 확장):
//   onSelectGroup(group.id, event.currentTarget)
const openCommandPopover = (groupId: string, element: HTMLElement) => {
  const shell = stageShellRef.current;           // .tactical-stage-shell에 ref 추가
  if (!shell || battle.phase !== 'command') { selectGroup(groupId); return; }
  if (commandPopover?.groupId === groupId) { closePopover(); return; }   // 토글
  const unit = element.getBoundingClientRect();
  const shellRect = shell.getBoundingClientRect();
  const placed = computeCommandPopoverPlacement(
    { left: unit.left - shellRect.left, top: unit.top - shellRect.top,
      width: unit.width, height: unit.height },
    { width: shellRect.width, height: shellRect.height },
  );
  popoverAnchorRef.current = element;
  selectGroup(groupId);
  setCommandPopover({ groupId, ...placed });
};
```

렌더링 (`.tactical-stage-shell`의 마지막 자식으로):

```tsx
{commandPopover && popoverGroup && (
  <TacticalCommandPopover
    battle={battle}
    group={popoverGroup}
    hunt={hunt}
    assault={assault}
    placement={commandPopover.placement}
    style={{
      left: commandPopover.x,
      top: commandPopover.y,
      '--caret-shift': `${commandPopover.caretShift}px`,
    } as CSSProperties}
    maxHeight={commandPopover.maxHeight}
    onCommand={command => { assignCommandTo(popoverGroup.id, command); closePopover(); }}
    onSetLine={line => {
      const displayedLine = popoverGroup.pendingLine ?? popoverGroup.line;
      assignFormationLineTo(popoverGroup.id, line);
      if (line !== displayedLine) closePopover();
    }}
    onMoveZone={zoneId => {
      if (zoneId === popoverGroup.zoneId) return;
      onAssignGroup(popoverGroup.id, zoneId);
      setViewedZoneId(zoneId);
      closePopover();
    }}
    onClose={restoreFocus => closePopover({ restoreFocus })}
  />
)}
```

- **명령 대상은 반드시 `popoverGroup.id`를 명시적으로 전달한다.** 현재
  `assignCommand`/`assignFormationLine`(TacticalBattleScreen.tsx:447대)은 `selectedGroup`
  클로저에 의존하므로, `assignCommandTo(groupId, command)` /
  `assignFormationLineTo(groupId, line)` 형태로 groupId 인자를 받게 리팩터링하고
  하단 바(`selectedGroup.id`)와 팝오버(`popoverGroup.id`)가 같은 함수를 쓰게 한다.
  선택 상태와 팝오버 상태가 어긋나는 순간에도 다른 부대에 명령이 가지 않는다.
- 루트 CSS: `above`는 `transform: translate(-50%, -100%)`, `below`는
  `transform: translate(-50%, 0)`. caret은 above면 아래쪽(`::after`), below면
  위쪽(`::before`)에 그린다 (§6).
- 팝오버 루트 인라인 스타일에 반드시 `maxHeight`를 적용한다. `maxHeight >= MIN_HEIGHT`이면
  명령 목록 영역만 `overflow-y: auto`(헤더·세그먼트·푸터 고정), 그보다 작으면 루트에
  `constrained` 클래스를 붙여 전체 내용을 스크롤한다. 어떤 경우에도 실제 가용 공간보다 큰
  최소 높이를 강제하지 않는다.
- **리포지셔닝은 하지 않는다** — 위치가 바뀌는 이벤트(구역 스크롤, 리사이즈)에서는 그냥 닫는다.
  `useEffect`로 `window resize`와 `viewportRef` scroll에 닫기 핸들러 1개씩.

## 5. 새 컴포넌트

`src/components/tactical/TacticalCommandPopover.tsx` (신규, ~120줄 예상).
로직은 전부 기존 함수 재사용: `tacticalSupportedCommands`, `tacticalCommandUnavailableReason`,
`commandLabel`/`commandDescription`(현재 TacticalBattleScreen 내부 함수 — **export하거나
`src/components/tactical/commandText.ts`로 추출**해서 팝오버와 하단 바가 같은 문자열을 쓰게 한다.
문자열 소스가 두 벌이 되면 안 된다).

```tsx
interface Props {
  battle: NonNullable<GameState['tacticalBattle']>;
  group: TacticalDefenderGroup;
  hunt: boolean;
  assault: boolean;
  placement: 'above' | 'below';
  style: CSSProperties;
  maxHeight: number;
  onCommand: (command: TacticalCommandId) => void;
  onSetLine: (line: TacticalFormationLine) => void;
  onMoveZone: (zoneId: string) => void;
  onClose: (restoreFocus: boolean) => void;
}
```

**ARIA 구조 — `role="menu"`를 쓰지 않는다.** 팝오버에는 명령 radio 외에 열/길목 버튼·헤더·
안내문이 섞여 있고, menu 패턴은 화살표 내비게이션+단일 탭스톱을 요구하므로 Tab 기본 동작과
맞지 않는다. 비모달 dialog 패턴으로 구성:

- 루트: `role="dialog"` + `aria-labelledby={headerId}` (헤더 `<strong>`에 id 부여).
- 명령 목록 컨테이너: `role="group"` + `aria-label="명령 선택"`.
  각 명령 버튼은 네이티브 `<button>` + `aria-pressed={group.command === command}`.
  명령은 선택 즉시 실행되고 팝오버가 닫히므로, 화살표 내비게이션·단일 탭스톱을 요구하는
  radiogroup 패턴을 사용하지 않는다.
- 열/길목 세그먼트: `role="group"` + `aria-label`("전열 선택" / "길목 이동").
- 버튼은 전부 네이티브 `<button>` 유지. Tab 순환은 브라우저 기본에 맡긴다
  (항목 수가 적어 포커스 트랩 불필요).
- 마운트 시 **현재 명령 버튼**에 `focus()` (없으면 첫 버튼) — `useEffect` + ref.
- 루트 `onKeyDown`에서 Esc → `onClose(true)` (포커스를 앵커 유닛으로 복귀,
  `popoverAnchorRef` 사용). 바깥 클릭·기타 닫힘은 `onClose(false)`.
- 루트 `onClick`에 `event.stopPropagation()` (stage shell 배경 클릭 닫기와 충돌 방지).

## 6. CSS (global.css에 추가 — 기존 무대 팔레트와 일치시킴)

```css
/* ── 유닛 명령 팝오버 ── */
.tactical-command-popover {
  position: absolute;
  z-index: 90;                     /* 선택 부대 인라인 z(80, §8)보다 위 */
  width: 232px;
  display: flex;
  flex-direction: column;
  border: 1px solid #8f6e39;       /* .tactical-screen 테두리와 동일 */
  border-radius: 5px;
  background: rgba(14, 17, 19, 0.96);
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.6);
  font-size: 10px;
  color: #cfd6d4;
  overflow: hidden;
}
.tactical-command-popover.above { transform: translate(-50%, -100%); }
.tactical-command-popover.below { transform: translate(-50%, 0); }
/* caret — --caret-shift는 §4의 배치 함수가 계산해 인라인 스타일로 전달 */
.tactical-command-popover.above::after,
.tactical-command-popover.below::before {
  content: '';
  position: absolute;
  left: calc(50% + var(--caret-shift, 0px));
  width: 10px;
  height: 10px;
  background: rgba(14, 17, 19, 0.96);
}
.tactical-command-popover.above::after {
  bottom: -6px;
  transform: translateX(-50%) rotate(45deg);
  border-right: 1px solid #8f6e39;
  border-bottom: 1px solid #8f6e39;
}
.tactical-command-popover.below::before {
  top: -6px;
  transform: translateX(-50%) rotate(45deg);
  border-top: 1px solid #8f6e39;
  border-left: 1px solid #8f6e39;
}
.tactical-command-popover-header {
  padding: 8px 10px 6px;
  border-bottom: 1px solid rgba(143, 110, 57, 0.35);
}
.tactical-command-popover-header strong { display: block; font-size: 11px; color: #ead8ac; }
.tactical-command-popover-header small { color: #8f979b; }
.tactical-command-popover-lines {
  display: flex;
  gap: 4px;
  padding: 6px 10px;
  border-bottom: 1px solid rgba(143, 110, 57, 0.35);
}
.tactical-command-popover-lines button {
  flex: 1;
  padding: 4px 0;
  border: 1px solid #4b5050;
  border-radius: 3px;
  background: #1c2124;
  color: #cfd6d4;
  font-size: 10px;
  cursor: pointer;
}
.tactical-command-popover-lines button.active {
  border-color: #d0a651;
  background: rgba(64, 51, 24, 0.92);   /* .tactical-field-group.selected와 동일 계열 */
  color: #f4dfa8;
}
.tactical-command-popover-lines button:disabled { opacity: 0.45; cursor: not-allowed; }
.tactical-command-popover-list { min-height: 0; overflow-y: auto; padding: 4px; }
.tactical-command-popover.constrained { overflow-y: auto; }
.tactical-command-popover.constrained .tactical-command-popover-list {
  min-height: auto;
  overflow: visible;
}
.tactical-command-popover-list button {
  display: block;
  width: 100%;
  min-height: 34px;                 /* 클릭 타깃 확보 */
  padding: 5px 8px 5px 22px;
  position: relative;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}
.tactical-command-popover-list button::before {   /* ○/● 마커 */
  content: '';
  position: absolute;
  left: 8px;
  top: 9px;
  width: 7px;
  height: 7px;
  border: 1px solid #8f979b;
  border-radius: 50%;
}
.tactical-command-popover-list button:hover,
.tactical-command-popover-list button:focus-visible { background: rgba(210, 169, 88, 0.12); }
.tactical-command-popover-list button.current { background: rgba(64, 51, 24, 0.55); }
.tactical-command-popover-list button.current::before { border-color: #d2a958; background: #d2a958; }
.tactical-command-popover-list b { display: block; font-size: 11px; color: #ead8ac; }
.tactical-command-popover-list small {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  color: #8f979b;
  line-height: 1.35;
}
.tactical-command-popover-footer {
  padding: 5px 10px 7px;
  border-top: 1px solid rgba(143, 110, 57, 0.35);
  color: #8f979b;
  font-size: 9px;
  line-height: 1.4;
}

@media (max-width: 900px) {
  /* 모바일: 좁은 화면에서는 유닛 위 대신 무대 하단 시트로 */
  .tactical-command-popover {
    left: 50% !important;
    top: auto !important;
    bottom: 8px;
    width: min(320px, calc(100% - 16px));
    max-height: calc(100% - 16px) !important;
    margin-top: 0;
  }
  .tactical-command-popover.above,
  .tactical-command-popover.below { transform: translateX(-50%); }
  .tactical-command-popover::before,
  .tactical-command-popover::after { display: none; }
}
```

## 7. 하지 말 것 (예상 실수 목록)

- `.tactical-battlefield`나 `.tactical-zone` 내부에 팝오버 렌더 금지 — `overflow`에 잘린다.
- `createPortal`·외부 라이브러리 불필요. stage shell absolute로 충분하다.
- 팝오버에 자체 명령 문자열/목록 하드코딩 금지 — 라벨·설명·유효성 전부 기존 함수에서 온다.
- 명령 선택 후 다음 부대 팝오버 자동 오픈 금지 (§2).
- 비활성 명령을 팝오버에 나열하지 않는다 — "왜 없지?"는 푸터의
  "전체 명령은 아래 명령판에서" 한 줄이 답한다.
- `useEffect` 없이 render 중 `setCommandPopover` 호출 금지 (무한 렌더).
- 유닛 클릭 핸들러의 기존 `event.stopPropagation()` 제거 금지 — 배경 클릭 닫기가 이것에 의존.
- 선택 변경 시 무조건 닫는 effect 금지 — `groupId` 불일치 가드 필수 (§2). 아니면 방금 연
  팝오버가 즉시 닫힌다.
- 선택 부대 z-index를 CSS 클래스로 올리려 하지 말 것 — 인라인 스타일이 이긴다 (§8).
- 팝오버에서 `selectedGroup` 클로저에 의존하는 `assignCommand` 직접 호출 금지 —
  `popoverGroup.id`를 명시적으로 받는 `assignCommandTo(groupId, command)` 경유 (§4).
- `formationStackStyle`의 zIndex 공식 문자열 변경 금지 — `test_tactical_components.mjs:176`이
  고정. 상향은 사용처 style 병합으로만.

## 8. 같은 PR에 포함: 무대 선택 강조 강화 (REVIEW '팝오버 제안' 절의 1단계)

팝오버가 뜨는 유닛이 "지금 지휘 중"임을 무대만 봐도 알 수 있어야 한다.

**z-index 주의**: 부대의 z-index는 CSS가 아니라 `formationStackStyle`이 **인라인 스타일**로
지정한다(`TacticalZoneColumn.tsx:952`, 공식은 `zIndex: 60 - round(distance*10) + index`).
CSS 클래스(`.selected { z-index: 70 }`)는 인라인을 **덮지 못하므로 쓰지 말 것.**
또한 이 공식 문자열은 `tools/game/test_tactical_components.mjs:176`이 정규식으로 고정하고
있으므로 공식 자체를 바꾸지도 말 것. 대신 **사용처에서 style 병합**으로 덮는다:

```tsx
// TacticalZoneColumn.tsx:952 — 선택 부대만 zIndex를 인라인으로 상향 (공식은 그대로)
style={{
  ...formationStackStyle(stackIndex, lineGroups.length),
  ...(commandable && selectedGroupId === group.id ? { zIndex: 80 } : null),
}}
```

계층 계약: 일반 부대 인라인 z ≤ 60대 < **선택 부대 80** < **팝오버 90** (§6).

```css
.tactical-field-group.selected > span {
  overflow: visible;                        /* 라벨 말줄임 해제 — 선택 중엔 풀네임 */
  max-width: none;
}
.tactical-field-group.selected .tactical-unit-line {
  filter: drop-shadow(0 0 7px rgba(220, 178, 92, 0.55))
          drop-shadow(0 0 2px rgba(242, 195, 95, 0.9));
}
```

명령 확정 후 자동 선택된 다음 부대 강조(1회 펄스):

```css
@keyframes tactical-next-pulse {
  0% { box-shadow: 0 0 0 0 rgba(242, 195, 95, 0.7); }
  100% { box-shadow: 0 0 0 12px rgba(242, 195, 95, 0); }
}
.tactical-field-group.next-pending > span { animation: tactical-next-pulse 900ms ease-out 2; }
```

(`next-pending` 클래스는 자동 선택 직후 1.8초만 부여 — `setTimeout` + state.)

## 9. 검증 체크리스트

수동 (전투 시뮬레이션 1280×720):
- [ ] 방어전 command 단계: 유닛 클릭 → 팝오버가 유닛 위에, caret이 유닛 중심을 가리킴
- [ ] 화면 왼쪽/오른쪽 끝 유닛: 팝오버가 무대 밖으로 잘리지 않고 caret만 이동
- [ ] 창 높이를 줄여(≤720px) 유닛 위 공간이 좁을 때: below 배치로 뒤집히고 잘림 없음
- [ ] 같은 유닛 재클릭 토글 / 다른 유닛 클릭 시 이동 / 배경 클릭·Esc·‹›·교전 개시로 닫힘
- [ ] 명령 클릭 → 칩·하단 바·팝오버 3곳 모두 같은 명령 표시, 다음 부대 펄스, 팝오버는 닫힘
- [ ] 열 세그먼트: 인접 열만 활성(방어전), 예약 배지, 다른 열 선택 시 기존 자동 진행 후 닫힘
- [ ] 토벌전 열 이동·사냥 길목 이동 시 팝오버가 닫히고, 사냥은 목적 길목으로 화면 이동
- [ ] 사냥: 길목 3버튼 + ½ 패널티 표기, 몰이/반격 대기 등 사냥 라벨 사용
- [ ] 피난 주민: 설명 전용 모드
- [ ] 적 클릭(표적 지정) 시 팝오버 유지
- [ ] 재생 진입 시 자동 닫힘, 재생 중 유닛 클릭해도 열리지 않음 (배속만 동작)
- [ ] ≤900px: 하단 시트 모드

자동:

`computeCommandPopoverPlacement` 단위 테스트 (순수 함수 — 신규
`tools/game/test_command_popover_placement.mjs` 또는 기존 컴포넌트 테스트에 추가):
- [ ] 무대 중앙 유닛: `above`, caretShift 0, maxHeight = 유닛 위 공간
- [ ] 무대 왼쪽 끝 유닛: x가 `half+EDGE`로 클램핑되고 caretShift < 0,
      caret이 팝오버 폭 안(`±(half−20)`)으로 재클램핑됨
- [ ] 무대 오른쪽 끝 유닛: 대칭 케이스
- [ ] 유닛 위 공간 < 120px: `below` 반환, y = 유닛 하단 + GAP
- [ ] 위·아래 모두 좁을 때: 더 넓은 쪽 선택, maxHeight가 그쪽 실제 가용 공간과 같고
      `MIN_HEIGHT`를 강제로 초과하지 않음

실행 테스트는 저장소의 기존 게임 테스트처럼 `typescript.transpileModule`로 대상 `.ts`를 임시
JS로 변환해 import한다. `node`에서 `.ts` 파일을 직접 import하는 방식에 의존하지 않는다.

`test_tactical_components.mjs`에 추가 (소스 계약):
- [ ] 팝오버 소스에 명령 문자열 하드코딩이 없을 것 (commandText 모듈 import 확인)
- [ ] 팝오버가 `.tactical-stage-shell` 스코프에 렌더되고 battlefield 내부가 아닐 것
- [ ] 선택 변경 닫기 effect에 `commandPopover.groupId` 불일치 가드가 있을 것
- [ ] 팝오버 명령 실행이 `assignCommandTo(popoverGroup.id`(명시적 groupId)를 쓸 것
- [ ] Esc 경로가 `restoreFocus`/`popoverAnchorRef`를 경유할 것
- [ ] caret 스타일이 `--caret-shift` 변수를 소비할 것

통과 기준:
- [ ] `npm run test:combat` / `npm run test:game` / `npm run build` / `git diff --check`
