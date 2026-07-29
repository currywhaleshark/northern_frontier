# Battle Presentation Roadmap (전투 연출 보강 계획)

> **계획 상태:** 완료
> **상태 갱신:** 2026-07-29 — 1차 전투 연출 범위와 문서 체크리스트를 완료했다.

> 역사 계획 (2026-07-18): 체크박스와 후속 항목은 작성 시점 기록이다. 현재 상태는
> [UI 재구성 릴리스 후보](../../release-candidates/2026-07-ui-reorganization.md)를 기준으로 한다.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 전술 전투 화면과 지도 위 실시간 전투의 연출을 단계적으로 보강해 전투의 긴장감과 피해의 체감을 높인다. 밸런스·판정 로직은 건드리지 않고 연출 계층만 확장한다.

**Architecture:** 이미 구축된 `TacticalAnimationEvent` 큐(선택 필드 `side`/`groupId`/`casualties`/`float` 포함)와 CSS `event-*` 클래스 체계, Web Audio 절차 합성(`src/sound/sfx.ts`)을 그대로 활용한다. 신규 연출은 이벤트 재생 루프(`TacticalBattleScreen.tsx`)와 캔버스 렌더러(`src/render/renderer.ts`)에 레이어로 얹는다.

**완료된 1차 작업 (2026-07-13):**
- 전투 효과음 7종(`volley`/`melee`/`ambush`/`casualty`/`moraleBreak`/`lootCrash`/`wallHit`) + 라운드 재생 중 군고 루프(`setBattleDrums`)
- 이벤트 종류별 효과음 자동 재생 연결
- 피해 이벤트 시 개별 스프라이트 쓰러짐(`.tactical-sprite.falling`), 진영별 플로팅 전황 텍스트(`.tactical-float`)

---

### Task 1: 투사체·타격 이펙트 레이어

**Files:**
- Modify: `src/components/TacticalBattleScreen.tsx`
- Modify: `src/styles/global.css`

- [x] 구역 위에 절대배치 이펙트 레이어(`.tactical-fx-layer`)를 추가한다.
- [x] `volley` 이벤트: 화살 여러 발이 수비 랭크 → 적 랭크로 호를 그리며 날아가는 애니메이션. 조총 그룹이 있으면 총구 섬광(흰 플래시) + 퍼지는 연기(반투명 blur 원 확산)를 함께 표시한다.
- [x] `wallHit`(방어선 붕괴) 이벤트: `.tactical-screen` 전체 흔들림(shake 키프레임) + 붉은 비네트 플래시.
- [x] 사격 그룹 스프라이트에 volley 순간 반동(recoil) 모션을 준다.

### Task 2: 지속형 전장 상태 표현

**Files:**
- Modify: `src/components/TacticalBattleScreen.tsx`
- Modify: `src/styles/global.css`

- [x] 돌파(`breached`)된 구역에 일회성 필터 대신 지속되는 연기/불꽃 오버레이 애니메이션을 깐다 (CSS 그라디언트 애니메이션 또는 반복 파티클).
- [x] 피해가 발생한 구역 바닥에 떨어진 무기·흔적 마크를 라운드가 끝나도 남긴다 (구역별 누적 피해 수 기반).

### Task 3: 날씨를 전투 화면 안으로

**Files:**
- Modify: `src/components/TacticalBattleScreen.tsx`
- Modify: `src/styles/global.css`

- [x] `state.weather`에 따라 전장 위 눈 입자 오버레이를 표시한다 (`heavySnow`/`blizzard`/`coldSnap`).
- [x] 눈보라 시 시야가 뿌옇게 되는 반투명 레이어를 추가해, volley 명중률 페널티(`tacticalBattle.ts`의 `commandPowerMultiplier`)가 시각적으로 납득되게 한다.
- [x] 눈보라 중에는 바람 앰비언트(`setWeatherAmbient`)가 전투 화면에서도 유지되는지 확인한다.

### Task 4: 페이싱 조정

**Files:**
- Modify: `src/components/TacticalBattleScreen.tsx`
- Modify: `src/game/tacticalBattle.ts` (필요 시 이벤트 duration 조정만)
- Modify: `src/styles/global.css`

- [x] 라운드 재생 시작 시 "제N라운드" 스팅어 배너 + 북 1타.
- [x] 재생 중 클릭(또는 스페이스)으로 남은 이벤트를 배속/스킵할 수 있게 한다. 단, 결과(outcome) 이벤트는 항상 표시한다.
- [x] 자막(`.tactical-caption`)에 타자기 효과를 넣는다.

### Task 5: 지도 위 실시간 전투 보강

**Files:**
- Modify: `src/render/renderer.ts`
- Modify: `src/game/battles.ts` (연출 트리거용 상태 노출이 필요한 경우만)
- Modify: `src/App.tsx` (사운드 트리거)

- [x] 집결(muster) 단계: 전선 지점에 깃발/장대 표식을 그리고 `raidDrum`을 울린다.
- [x] 교전(clash) 중 조총 무장 수비병 + 화약이 있으면 먼지구름 사이 총구 섬광 점멸 + 흰 연기를 추가한다 (`armedMusketeers`, `state.resources.gunpowder` 활용).
- [x] 승기가 기울면(무리 전력이 붕괴선 `COLLAPSE_RATIO`에 접근) 습격자 쪽 입자가 도주 방향으로 흘러나가게 한다.
- [x] 전투 종료 후 그 자리에 눈밭 교란 자국 데칼을 며칠간 남긴다 (발자국 `drawFootprints` 패턴 참고).
- [x] 교전 종료 시 승리면 뿔나팔, 패배면 저음 조종을 울린다.

### Task 6: 검증

Run:

```bash
npx tsc --noEmit -p .
node tools/game/test_tactical_battle.mjs
node tools/game/test_battles.mjs
node tools/game/test_resource_save_migration.mjs
```

- [x] 브라우저에서 `window.__game` 훅으로 습격 전투를 열어 (`pendingChoice` 주입 → `choose('manual-garrison')`) 각 이펙트를 육안 확인한다.
- [x] 구버전 저장(선택 필드 없는 `TacticalAnimationEvent`)을 불러와도 재생이 깨지지 않는지 확인한다.

---

**우선순위:** Task 1 → 4 → 2 → 3 → 5. 투사체·흔들림이 클라이맥스 체감에 가장 크고, 페이싱은 효과음이 붙은 현재 상태에서 가장 거슬리는 부분이다.
