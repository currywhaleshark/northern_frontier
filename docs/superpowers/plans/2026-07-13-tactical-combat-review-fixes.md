# 전술 전투 검토 후속 수정 계획 (적 행동 위협 구조 + 연출 흐름)

> 역사 계획 (2026-07-18): 체크박스와 후속 항목은 작성 시점 기록이다. 현재 상태는
> [UI 재구성 릴리스 후보](../../release-candidates/2026-07-ui-reorganization.md)를 기준으로 한다.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 전술 전투(`src/game/tacticalBattle.ts`)의 승패 구조가 "우회조 하나"에 좌우되는 문제를 바로잡아 주력·약탈조·우회조가 각각 제 역할의 위협을 내게 하고, 실측에서 드러난 연출 어색함(빈 구역 백병전, 밋밋한 중심지 돌파, 매복 후 고립 등)을 정리한다. 연출 재생 파이프라인(`TacticalBattleScreen.tsx`)의 골격은 건드리지 않는다.

**진행 현황 (2026-07-13):** Task 1~8과 Task 10의 구현 및 자동 회귀 테스트를 완료했다. TypeScript 검사, 프로덕션 빌드, 전술 전투·일반 전투·구버전 저장 마이그레이션 테스트가 통과했다. 실제 전투 시뮬레이터 화면에서도 전열/후열 토글, 정찰 힌트, 후방 급습대의 우측 배치와 전투 보고를 확인했다. 육안 검증 중 발견한 「급습 이벤트 전 우회조 사전 노출」도 이벤트 재생 시점까지 숨기도록 수정했다.

**검토 방법과 근거 (2026-07-13):** 전투 시뮬레이션 모드로 동일한 수비 구성(조총3·각궁3·창4·파수꾼2·사냥꾼3·주민6, 경보됨, 맑음, 기본 명령 방치)에서 두 판을 실측.

| 판 | 결과 | 관찰 |
|---|---|---|
| 조정 토벌군 166 | 5교전 villageRouted 패배 | 관군 기병 6기가 approach→storehouse→center 우회, 주민만 있는 center에서 압박 +38/+38/+24 → 3교전 만에 돌파. 주력 26명+화포대는 5교전 내내 wall 압박 57이 최대(돌파 실패) |
| 변경 마적 78 | 5교전 만료 defenseSuccess | wall 압박이 내내 0~1 — 주력 완전 무력. 기마 마적 5기가 center 압박 50까지 도달(2교전만 더 있으면 동일 패턴 패배). 약탈패는 wall 게이트에 걸려 3교전 대기, 약탈 시도 0회 |

공통 결론: 방책 정면은 수비가 조금만 갖춰지면 절대 안 뚫리고, 승패는 방책을 우회하는 flankers가 center에 도달하는지로 거의 결정된다. 매복→혼란, 사전포격, 방책 파괴/보강 연출, 저장 마이그레이션은 잘 동작함.

---

### Task 1: 우회조(flankers) 일변도의 승패 구조 완화 — 최우선

**Files:**
- Modify: `src/game/tacticalBattle.ts`
- Modify: `tools/game/test_tactical_battle.mjs`

문제: `shouldRaiderAdvance`의 else 분기(`flankers && round >= 2`)로 우회조가 2교전부터 무조건 전진하며, 경로(`ROUTES.flankers = approach→storehouse→center`)가 방책을 완전히 우회한다. center에는 보통 피난 주민뿐이라 enemyShare≈1 → `pressureDelta = 15 + share×32 − defenseShare×17` ≈ +47/교전 → 도착 후 3교전이면 자동 돌파(villageRouted). 사실상 "center에 전투 병력을 상주시켰는가"가 승패의 전부가 된다.

- [ ] flankers의 무조건 전진(`round >= 2`)을 제거하거나 지연시킨다. 권장: 우회조도 각 구역에서 `zone.breached || enemyShare > 0.52 || round >= 3` 수준의 조건을 따르게 하고, storehouse에 수비대가 있으면 최소 1교전은 교전하도록 한다.
- [ ] 후방 구역(storehouse·center)의 압박 상승을 완화한다. 권장안 중 택일: (a) 수비 병력이 전무한 구역의 pressureDelta에 상한(예: +30/교전)을 둔다, (b) center의 breach 임계를 100 초과(예: 120, pressure는 0~100 유지하되 돌파 판정을 「압박 100 상태로 2교전 유지」로 변경)로 바꾼다. — "기병 우회 = 3교전 뒤 자동 패배"가 "우회를 방치하면 5교전 안에 패배할 수 있음" 정도로 완화되면 충분하다.
- [ ] 우회 위협이 다가오는 것을 플레이어가 인지할 수 있게, flankers가 후방 구역으로 전진 확정될 때 교전 보고 `lines`에 경고 한 줄을 추가한다 (예: "관군 기병이 방책을 우회해 창고 뒤편으로 접근합니다.").
- [ ] `test_tactical_battle.mjs`에 회귀 테스트 추가: 주민만 있는 center에 flankers가 도달해도 도달 후 2교전 안에 villageRouted가 되지 않아야 한다.

> **연계:** Task 10(우회조 목적 이원화)이 이 태스크 위에 얹힌다. Task 1의 전진 조건·압박 완화는 Task 10의 「중심 돌파」 계획에 그대로 적용되고, 「후방 급습」 계획은 별도 경로를 탄다. Task 1을 먼저 끝내고 Task 10을 진행할 것.

### Task 2: 주력(main)·화포대의 정면 위협 복원

**Files:**
- Modify: `src/game/tacticalBattle.ts`
- Modify: `tools/game/test_tactical_battle.mjs`

문제: 방책 게이트(주력은 wall 미돌파 시 통과 불가) 자체는 좋으나, `pressureDelta = 15 + enemyShare×32 − defenseShare×17`이 defenseShare에 과민해 수비가 반반만 되어도 압박이 안 오른다. 실측: 마적 주력 p38이 5교전 내내 wall 압박 0~1, 토벌군은 화포대 `wallPressureBonus +12`를 받고도 5교전에 57 — 방책이 한 번도 안 뚫렸고 화포대의 간판 위협이 체감되지 않는다.

- [ ] wall 압박 공식을 조정해 "대등한 전력이 정면에서 5교전 두들기면 돌파가 위협권에 든다"를 목표로 한다. 권장: defenseShare 감쇄 계수를 낮추거나(×17 → ×10 내외), 적 주력이 wall에 붙어 있는 동안 교전마다 최소 압박(예: +6)을 보장한다. 수치는 아래 검증 시나리오로 튜닝할 것.
- [ ] 화포대(`wallPressureBonus`)가 있으면 wall 돌파가 현실적 시나리오가 되게 한다 (토벌군 판에서 5교전 내 wall 돌파가 나올 수 있는 수준). 필요하면 화포대 전용 연출 이벤트(포격으로 방책이 흔들리는 wallHit 계열 약화판)를 교전 중에 추가해 위협을 시각화한다.
- [ ] 회귀 테스트 추가: 동등 전력(수비력 ≈ 적 전력)의 정면 대치에서 5교전 내 wall 압박이 최소 60 이상 도달해야 한다. 반대로 수비가 압도적(2배 이상)이면 여전히 돌파되지 않아야 한다.

### Task 3: 약탈조(looters)의 창고 위협 복구

**Files:**
- Modify: `src/game/tacticalBattle.ts`

문제: looters는 wall에서 `breached || undefended || enemyShare >= 0.7` 게이트에 걸려 사실상 영구 대기하고, 약탈 판정은 looters가 storehouse에 도달해야만 발생하므로 `raidersLooted` 결말이 거의 안 나온다. 창고 위협 서사가 실종됨.

- [ ] looters의 wall 통과 조건을 완화한다. 권장: enemyShare 임계를 0.7 → 0.55 수준으로 내리고, 「wall에서 2교전 이상 대기하면 몰래 새어 나가듯 소수가 우회 침투」 같은 대안 경로를 준다 (침투 시 전력 일부만 이동시키는 방식도 가능).
- [ ] 또는(택일) flankers도 storehouse에서 약탈을 시도할 수 있게 `lootersPresent` 판정을 `kind === 'looters'` 한정에서 「intent가 loot인 조 또는 storehouse에 도달한 비주력 조」로 넓힌다.
- [ ] 약탈 성공 시 연출은 기존 `loot` 이벤트(lootCrash 효과음 포함)를 그대로 쓴다 — 새 연출 불필요.

### Task 4: 빈 구역 백병전 자막 제거 (연출)

**Files:**
- Modify: `src/game/tacticalBattle.ts`

문제: 구역 교전 이벤트 폴백(`!volley && !surpriseAttack && !charge → melee "방어선에서 짧고 거친 백병전이 벌어집니다."`)이 수비대 유무를 보지 않는다. 실측 두 판 모두 무수비 storehouse/center를 기마조가 지나갈 때 백병전 자막+금속음이 재생됐다.

- [ ] `defenders.length === 0`(전투 가능 수비대 없음)인 구역은 melee 대신 별도 이벤트를 낸다. 권장: kind `advance`, 자막 "적이 저항 없이 {구역명}을(를) 휩쓸고 지나갑니다.", side 없음. 효과음은 raidDrum이 자연스럽다.
- [ ] 피난 주민만 있는 구역(전투력만 미미한 civilian)은 "주민들이 비명을 지르며 흩어집니다" 계열 자막으로 구분하면 더 좋다 (선택).

### Task 5: 중심지·창고 돌파 연출 강화 (연출)

**Files:**
- Modify: `src/game/tacticalBattle.ts`
- Modify: `src/components/TacticalBattleScreen.tsx`
- Modify: `src/styles/global.css`

문제: wall 돌파는 wallHit(화면 흔들림+붉은 비네트+방책 파괴)로 극적인데, 게임을 끝내는 center 돌파는 kind `advance` 한 줄이라 패배 확정 순간이 밋밋하다.

- [ ] center(및 storehouse) breach 이벤트에 전용 kind를 부여하거나(`TacticalAnimationEvent.kind`에 예: `zoneFall` 추가 — 구버전 저장은 선택 필드가 아니므로 kind 추가는 재생 스위치의 default 처리만 확인), 기존 wallHit 연출(shaking + vignette)을 재사용하도록 화면 쪽 조건에 포함시킨다.
- [ ] center 돌파 시 자막을 결정적 사건답게: "적이 마을 중심지로 쏟아져 들어옵니다 — 방어선이 무너졌습니다." + durationMs 900 이상, moraleBreak 효과음 또는 wallHit 효과음.

### Task 6: 매복 후 사냥꾼 고립 방지 (연출+위협 균형)

**Files:**
- Modify: `src/game/tacticalBattle.ts`

문제: 급습(surprise) 소진 후 `command = null` → 기본 명령이 hold가 되어 사냥꾼이 approach에서 적 본대와 정면 백병전을 계속한다. 원거리 노출 배율 1.45까지 겹쳐 실측에서 사냥꾼 3→1명으로 소모됐다. "치고 빠지는 매복꾼" 서사와 어긋남.

- [ ] 급습 소진 시 command를 null 대신 `fallback`으로 설정해 자동으로 한 구역 물러나게 한다 (연출은 기존 retreat 이벤트 재사용). 또는 기본 명령 선택(`chooseDefaultTacticalCommands`)에서 「사냥꾼 + 적과 같은 구역 + 비매복」이면 fallback을 기본값으로 한다.
- [ ] 매복 상태(`ambushed`, 숨어 있는 중)의 수비대는 `formationExposureMultiplier`의 원거리 노출 1.45를 받지 않게 예외 처리한다 (숨은 부대가 더 많이 맞는 것은 부자연). 급습을 실행한 교전 자체의 위험(ambush casualtyMultiplier 1.08)은 유지.

### Task 7: 이동 명령(advance/fallback)의 잔존 문제 (조작 흐름)

**Files:**
- Modify: `src/game/tacticalBattle.ts`

문제: `applyNextEngagementStates`가 이동만 시키고 명령을 유지해, 플레이어가 바꾸지 않으면 다음 교전에도 0.45/0.22 배율로 싸우며 매 교전 계속 이동한다. ambush는 소진 시 초기화되는 것과 비일관.

- [ ] advance/fallback으로 실제 이동이 일어난 뒤에는 command를 `hold`로 되돌린다 (한 번 실행하고 소모되는 이동 명령으로 통일). 더 물러날 곳이 없어 이동이 안 일어난 fallback도 hold로 되돌린다.

### Task 8: 연출 잔손질 (저우선 일괄)

**Files:**
- Modify: `src/game/tacticalBattle.ts`
- Modify: `src/components/TacticalBattleScreen.tsx`
- Modify: `src/styles/global.css`
- Modify: `src/sound/sfx.ts` (필요 시)

- [ ] 준비 실행 연출을 구역별로 묶어 카메라 지그재그(wall→approach→wall→approach)를 줄인다 — `applySelectedPreparationActions`에서 이벤트 생성 후 zoneId 기준 안정 정렬이면 충분 (같은 구역 내 상대 순서 유지).
- [ ] 같은 구역에서 여러 조가 연달아 전진할 때 advance 이벤트를 조별 1개씩(620ms×N) 내지 말고 구역당 1개로 합치고 자막에 조 이름들을 나열한다.
- [ ] 아군 사전포격 연출이 적 피격 신호(붉은 비네트 + 화면 흔들림)를 재사용하는 문제: bombardment용 비네트는 색을 구분(예: 주황/화약 연기색)하거나 비네트 없이 흔들림만 남긴다.
- [ ] 준비 이벤트 효과음 중 UI 재사용이 튀는 것 교체: `readyVolley`/`conceal`의 'good'(완공 목탁음), `muster`의 'welcome'(이주민 아르페지오). 권장: readyVolley → 화승 거는 느낌의 짧은 노이즈(신규 또는 'hunt'), muster → 'raidDrum' 1타, conceal → 'hammer' 약화. 신규 합성이 부담이면 기존 음 볼륨을 낮춰 재사용해도 무방.
- [ ] (선택) 교전 시작 camera 이벤트가 직전 nextFocus 구역을 비췄다가 첫 전투 이벤트에서 되돌아가는 지그재그: 첫 전투 이벤트의 구역으로 camera를 내도록 focus 계산을 events 생성 후로 옮기는 것을 검토.

### Task 10: 우회조 목적 이원화 — 중심 돌파 vs 주 방어선 후방 급습 (신규 설계, Task 1 완료 후)

**Files:**
- Modify: `src/game/types.ts`
- Modify: `src/game/tacticalBattle.ts`
- Modify: `src/game/saveLoad.ts`
- Modify: `src/components/TacticalBattleScreen.tsx`
- Modify: `src/styles/global.css`
- Modify: `tools/game/test_tactical_battle.mjs`
- Modify (선택): `src/components/BattleSimulationSetup.tsx` — 테스트용으로 우회조 계획을 강제 지정하는 옵션

**설계 의도:** 우회조의 목적을 전투 생성 시 둘 중 하나로 굴린다.

1. **중심 돌파(breakthrough)** — 기존 경로(approach→storehouse→center)로 마을 심장부를 노린다. Task 1에서 완화된 전진·압박 규칙을 그대로 따른다.
2. **주 방어선 후방 급습(rearAssault)** — 방어선(wall)을 우회해 **wall 구역의 후방에서** 나타나 후열(원거리 병종)을 직접 타격한다.

이로써 (a) 적이 수비 랭크 뒤에서 나타나는 새 연출, (b) 후열 원거리 병종의 노출이라는 실질 위협, (c) 「전선 유지 vs 후방 정리」라는 플레이어 선택이 생긴다. 선택을 가능하게 하려면 **수비 그룹의 전열/후열 위치를 플레이어가 바꿀 수 있어야 한다.**

**상태 모델:**

- [ ] `TacticalRaiderGroup`에 `flankPlan?: 'breakthrough' | 'rearAssault'` 추가 (kind === 'flankers'만 사용). 전투 생성 시 결정 — 권장: 기마 성향 세력(홀라온 기마 궁수, 관군 기병, 기마 마적)은 rearAssault 확률을 높게(예: 60%), 도보 우회대(니마차 창잡이)는 breakthrough 위주(예: 70%). 구버전 저장은 `saveLoad.ts`에서 'breakthrough' 기본값.
- [ ] `TacticalDefenderGroup`에 `line?: 'front' | 'rear'` 추가. 기본값: 근접 병종(창·맨손·파수꾼) front, 원거리(각궁·조총·사냥꾼)·주민 rear. 구버전 저장 마이그레이션 동일 규칙.

**후방 급습 규칙:**

- [ ] rearAssault 우회조는 route를 `approach → wall`로 타되, wall 도착 시 정면이 아니라 **후방 진입 상태**(`rearAssault: true` 또는 별도 플래그)로 들어온다. 도착 조건은 Task 1의 완화 규칙과 동급(무조건 2교전 전진 금지).
- [ ] 후방 진입 상태의 공격자는 그 구역 casualty 배분에서 **후열(line==='rear') 그룹을 우선 타격**하고, `formationExposureMultiplier`의 근접 스크린 보호(0.42)를 무시한다 → 원거리 병종이 실제로 위험해진다.
- [ ] 반대로 후방 공격자는 정면 압박(pressureDelta)에는 기여를 절반 이하로 — 목적이 방책 붕괴가 아니라 후열 살상·기세 붕괴이므로. 대신 후방 급습이 성공(후열 사상 발생)하면 마을 기세 추가 하락(예: -3)을 준다.
- [ ] 후열에 근접 그룹이 배치되어 있으면(플레이어가 전환) 그 근접 그룹이 후방 공격자를 요격 — 후방 공격자의 casualty를 정상 배율로 받아내고 원거리 병종 보호가 회복된다. 단, 근접이 후열로 빠진 만큼 **전면 스크린이 사라져** 정면의 원거리·전체 노출이 오른다(기존 1.45 노출 배율 재사용) — 이것이 「전선 유지 vs 후방 정리」 트레이드오프의 본체.

**전열/후열 전환 UI:**

- [ ] 배치 단계와 지휘 단계에서 그룹별로 전열/후열을 토글할 수 있게 한다. 권장: 그룹 탭/배치 행에 「전열·후열」 토글 버튼 한 개 (새 명령을 늘리기보다 위치 속성으로 처리 — 명령 체계는 그대로 유지).
- [ ] 화면 배치 반영: `tactical-defender-rank` 안에서 line==='front' 그룹을 왼쪽(적 쪽), 'rear' 그룹을 오른쪽에 정렬 (현재 defenderFormationOrder의 근접→원거리→주민 정렬을 line 기준 정렬로 대체).

**연출:**

- [ ] 후방 진입 순간 전용 이벤트 kind `rearAssault` 추가: 수비 랭크 **오른쪽(후방)에서** 적 스프라이트가 미끄러져 들어오는 진입 애니메이션(CSS: 오른쪽 밖 → 제자리 translateX), 경고 플로트 「후방 급습!」, 짧은 붉은 비네트 + raidHorn 계열 효과음. 이벤트 kind 추가이므로 재생 스위치의 기본 처리(알 수 없는 kind 무시)가 안전한지 확인.
- [ ] 후방 진입 상태의 적 그룹은 해당 구역에서 raider-rank가 아니라 **defender-rank 우측(후방 위치)에 렌더**한다 (별도 컨테이너 `.tactical-rear-assault-rank` 권장 — 기존 랭크 레이아웃을 흐트러뜨리지 않게).
- [ ] 정찰이 충분하면(경보됨 또는 망루+사냥꾼 — 기존 deepScouted 조건 재사용) 배치 단계에서 우회조 계획을 미리 힌트로 노출: 「기병이 방어선 뒤편을 노리는 듯합니다」/「우회대가 마을 안쪽 깊숙이 파고들 낌새입니다」. 정찰이 부족하면 rearAssault 이벤트가 기습으로 온다.

**검증(이 태스크 전용):**

- [ ] 회귀 테스트: rearAssault 도달 교전에서 후열 원거리 그룹의 피해가 전열 근접 그룹보다 커야 하고, 근접 그룹을 후열로 전환하면 원거리 피해가 유의미하게 줄어야 한다.
- [ ] 회귀 테스트: rearAssault 우회조는 wall pressure에 기존 flanker 대비 절반 이하로만 기여해야 한다.
- [ ] 시뮬레이터 육안 확인: 후방 진입 연출(오른쪽 진입 + 경고 플로트), 전열/후열 토글이 화면 배치에 즉시 반영되는지, 구버전 저장(flankPlan/line 없음) 로드가 깨지지 않는지.

### Task 9: 검증

Run:

```bash
npx tsc --noEmit -p .
node tools/game/test_tactical_battle.mjs
node tools/game/test_battles.mjs
node tools/game/test_resource_save_migration.mjs
```

- [ ] 시뮬레이션 모드(메인 메뉴 → 전투 시뮬레이션)로 아래 2개 기준 시나리오를 기본 명령 방치로 재실측한다. 동일 조건: 수비 조총3·각궁3·창4·파수꾼2·사냥꾼3·주민6, 경보됨, 맑음.
  - 변경 마적, 전력 78 고정: wall 압박이 5교전 동안 의미 있게 오르내리고(0~1 고착 금지), 기마 마적 단독으로 center가 돌파되지 않으며, 약탈 시도가 최소 1회 발생하는지.
  - 조정 토벌군, 전력 166 고정: 여전히 패배가 유력하되(최고 난도 유지), 패인이 「기병 우회 단독」이 아니라 방책 붕괴/정면 압박이 함께 기여하는지. 화포대가 wall을 실제로 위협하는지.
- [ ] 빈 구역(무수비 storehouse/center) 통과 시 백병전 자막·금속음이 더 이상 나오지 않는지 육안 확인.
- [ ] center 돌파 순간에 강화된 연출(흔들림/비네트/전용 자막)이 나오는지 확인.
- [ ] 매복 급습 다음 교전에서 사냥꾼이 자동으로 물러나는지(전멸 소모 패턴 재발 없음) 확인.
- [ ] 구버전 저장(선택 필드 없는 이벤트, preliminaryBombardment 없는 prepActions) 로드 후 교전 재생이 깨지지 않는지 확인 (`saveLoad.ts` 마이그레이션 경로).

---

**우선순위:** Task 1 → 2 → 4 → 6 → 7 → 3 → 5 → 8 → 10 → 9(최종 검증). 승패 구조(1·2)가 먼저고, 빈 구역 백병전(4)은 저비용 고체감. Task 10(우회조 이원화)은 Task 1의 완화 규칙이 자리 잡은 뒤에 얹는 신규 설계라 마지막 기능 태스크로 두되, 문서 순서와 무관하게 Task 9의 기준 시나리오 실측은 모든 태스크 뒤에 최종으로 1회 더 수행한다. Task 10 적용 후에는 토벌군 시나리오에서 관군 기병이 rearAssault를 뽑았을 때 「후방 급습 연출 + 전열/후열 전환으로 대응 가능」까지 확인. 밸런스 수치는 Task 9의 두 기준 시나리오를 반복 실측하며 맞출 것 — 목표는 「일반 세력: 준비된 수비로 신승, 방치하면 창고 털림」, 「토벌군: 만반의 준비로도 패배가 기본, 다만 패인이 다원화」.
