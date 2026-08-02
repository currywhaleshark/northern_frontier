# 새 게임 설정 S0+S1 구현계획 — 옵션 계약·시작 설정 화면

> **계획 상태:** 완료
> **상태 갱신:** 2026-08-02 — 옵션·저장 계약, v57 마이그레이션, 시작 설정 화면과 회귀 검증까지 S0+S1 범위를 완료했다.

- 상위 설계: [새 게임 설정 개편](DESIGN-2026-08-01-new-game-setup.md)
- 후속 의존: [어선과 출어](DESIGN-2026-08-02-fishing-boats.md)는 S4 호수 지형 이후
- 기준 코드: `src/components/MainMenu.tsx`, `src/App.tsx`, `src/sessionLaunch.ts`,
  `src/GameSession.tsx`, `src/game/simulation.ts`, `src/game/map.ts`, `src/game/saveLoad.ts`

## 0. 이번 범위의 결과

메인 메뉴에서 이름·난이도 카드를 걷어내고, 「시작」을 누르면 별도 시작 설정 화면으로 이동한다.
이 화면에서 이름·난이도·시드를 실제로 선택해 새 게임을 시작할 수 있다. 지역·지도 크기·세부 노브는
전체 형태를 미리 보여 주되, 아직 시뮬레이션에 연결되지 않은 선택지는 `준비 중`으로 잠근다.

동시에 향후 S2~S5가 같은 UI를 다시 뜯지 않도록 `NewGameOptions`와 저장용 `worldSetup` 계약을 먼저
도입한다. S0+S1 자체는 기존 `easy/normal/hard` 밸런스, 72×72 평원 지도, 지도·주민 RNG 순서를
바꾸지 않는다.

## 1. 확정 결정

1. 메인 메뉴의 네 주요 진입점은 **시작 / 튜토리얼 / 전투 시뮬레이터 / 설정**이다.
   기존 저장이 있을 때의 **이어하기**는 조건부 보조 버튼으로 유지한다.
2. 시작 설정은 중첩 모달이 아니라 `App`의 독립 화면(`menuView = 'newGameSetup'`)으로 연다.
   뒤로 가면 입력을 버리고 메인 메뉴로 돌아간다.
3. S1에서 활성인 입력은 정착지 이름, 난이도 프리셋 3종, 정수 시드 입력이다.
   빈 시드는 시작 순간 무작위 정수로 확정한다.
4. 지역은 평원, 크기는 중형만 활성이다. 산지·호수·해안과 소형·대형은 카드가 보이되
   각각 S2~S5의 `준비 중` 설명과 함께 disabled 처리한다.
5. 세부설정은 접을 수 있는 절로 표시한다. 네 노브와 현재 프리셋에서 파생된 값은 읽을 수 있지만,
   사용자 변경은 각 소비처가 연결되는 단계까지 잠근다. 작동하지 않는 노브를 선택 가능하게 두지 않는다.
6. 현행 `newGame(seed?, difficulty?, settlementName?)`는 테스트·도구 호환 래퍼로 유지한다.
   새 UI는 `newGameFromOptions(options)`만 사용한다.
7. 기존 저장은 `평원·중형`과 기존 `difficulty`에서 파생한 실효값으로 마이그레이션한다.
   튜토리얼은 설정 화면을 거치지 않고 고정 시드·평원·중형을 명시적으로 사용한다.

## 2. 데이터 계약

### 2-1. UI 입력과 정규화 결과

`src/game/newGameOptions.ts`를 새 잎 모듈로 만든다. React·저장·지도 모듈을 import하지 않는다.

```ts
export type MapRegion = 'plains' | 'mountain' | 'lake' | 'coast';
export type MapSize = 'small' | 'medium' | 'large';
export type SetupLevel = 'low' | 'normal' | 'high';

export interface NewGameTuning {
  startingResources: SetupLevel;
  resourceDensity: SetupLevel;
  climateSeverity: SetupLevel;
  threat: SetupLevel;
}

export interface NewGameOptions {
  settlementName: string;
  difficultyPreset: Difficulty | 'custom';
  baseDifficulty: Difficulty;
  region: MapRegion;
  mapSize: MapSize;
  tuning: NewGameTuning;
  seed?: number;
}

export interface WorldSetupSnapshot extends Omit<NewGameOptions, 'settlementName' | 'seed'> {
  seedSource: 'random' | 'manual' | 'legacy' | 'tutorial';
  effective: {
    startResourceMultiplier: number;
    threatGainMultiplier: number;
    raidPowerMultiplier: number;
    habitatChance: number;
    resourceDensityMultiplier: number;
    climateSeverityMultiplier: number;
  };
}
```

- `defaultNewGameOptions()`는 normal·plains·medium·네 노브 normal을 반환한다.
- `optionsForDifficulty(difficulty)`는 현행 `CONFIG.difficulty`의 수치를 그대로 실효값으로 옮긴다.
  S0+S1에서 `resourceDensityMultiplier`와 `climateSeverityMultiplier`는 1이다.
- `baseDifficulty`는 `GameState.difficulty`를 읽는 기존 코드의 호환 기준이다. S0+S1에서는 선택한
  프리셋과 항상 같다. 후속 사용자 설정에서는 마지막으로 고른 프리셋을 유지하되, 새 소비처는
  `worldSetup.effective`를 읽어야 하며 저장 슬롯 표기는 `difficultyPreset = 'custom'`을 우선한다.
- `normalizeNewGameOptions()`는 이름 정규화, 정수 시드 범위, 잠긴 region/mapSize 강제 기본값,
  프리셋과 tuning의 정합을 한 곳에서 보장한다.
- `worldSetupLabel()`은 UI·연대기가 함께 쓰는 `평원의 중형 개척지` 문구를 만든다.

### 2-2. 상태와 저장

- `GameState.worldSetup: WorldSetupSnapshot`을 필수 필드로 추가한다.
- 저장 스키마를 56→57로 올리고 `migrateV56ToV57`에서 기존 `difficulty`를 읽어 기본 스냅샷을 만든다.
- 저장 후 정규화에서도 손상된 region/mapSize/level/effective 수치를 안전한 기본값으로 복구한다.
- `SaveSlotSummary`에 `region`, `mapSize`, `difficultyPreset`을 선택적으로 추가한다.
  오래된 슬롯 요약을 읽을 때는 평원·중형과 기존 difficulty 표기를 사용한다.
- 새 게임의 창건 연대기는 이름 뒤에 `평원의 중형 개척지` 문맥을 한 번만 붙인다.
  기존 저장의 과거 연대기 문장은 다시 쓰지 않는다.

## 3. 구현 단계

### P0 — 계약·순수 테스트

- [x] `src/game/newGameOptions.ts` 타입, 기본값, 프리셋 변환, 정규화, 표시 문구 구현
- [x] `tools/game/test_new_game_setup.mjs` 신설:
  - 기본값 normal/plains/medium
  - 같은 수동 시드+옵션의 정규화 결과 결정론
  - easy/normal/hard의 실효값이 현행 CONFIG와 동일
  - 잠긴 지역·크기가 평원·중형으로 안전 보정
  - 이름 정규화가 시뮬레이션 RNG를 소비하지 않음

### P1 — 시뮬레이션·저장 연결

- [x] `newGameFromOptions(options)` 추가, 기존 `newGame`은 이를 부르는 호환 래퍼로 전환
- [x] `GameState.worldSetup`, 스키마 v57, v56→v57 마이그레이션과 손상 저장 정규화
- [x] `createTutorialGame()`은 고정 옵션을 명시하고 튜토리얼 시드·지도 불변식 유지
- [x] `recordAnnals` 창건 문장과 `SaveSlotSummary`에 지역·크기 문맥 연결
- [x] 기존 `test_chronicle`, `test_resource_save_migration`, `test_tutorial_scenario` 보강

### P2 — 시작 설정 화면

- [x] `src/components/NewGameSetup.tsx` 신설: 이름·주사위·난이도·시드·지역·크기·세부설정
- [x] disabled 카드는 키보드·스크린리더에도 선택 불가이며 `준비 중` 사유를 노출
- [x] `MainMenu`는 선택 상태를 가지지 않고 시작·튜토리얼·이어하기·전투·설정 진입만 담당
- [x] `App`에 `newGameSetup` 화면과 뒤로 가기 흐름 추가
- [x] `GameSessionLaunch`의 `kind: 'new'`는 개별 필드 대신 `options` 객체를 전달
- [x] `GameSession.initialSessionState`는 `newGameFromOptions(launch.options)` 사용
- [x] 기존 메뉴 설경·음악·설정·저장 다이얼로그 동작 유지

### P3 — UI·통합 회귀

- [x] `test_quality_of_life_ui.mjs`: 메인 메뉴의 입력 제거, 시작 설정 화면과 조건부 이어하기 보존
- [x] `test_new_game_setup.mjs`: App→sessionLaunch→simulation 소스 계약과 표시 문구
- [x] 통합 스모크·회귀:
  - 실제 화면에서 시작 → 이름 입력 → easy 선택 → 수동 시드 입력 → 개척 시작
  - 자동 회귀에서 같은 입력의 지도·주민·시작 자원 결정론 확인
  - 메뉴 진입점과 저장 슬롯의 `평원 · 중형 · 이주민` 문맥을 소스·저장 회귀로 확인
- [x] `npm run test:game` core 78개, `npm run build` 통과

## 4. 파일 소유권과 하위 모델 분업

사용량을 아끼되 계약 충돌을 피하도록 최대 두 하위 모델만 병렬 사용한다. 같은 파일을 두 에이전트가
동시에 수정하지 않는다.

| 담당 | 모델/노력 | 소유 범위 | 산출물 |
|---|---|---|---|
| 주 에이전트 | 주 에이전트 / high | `newGameOptions.ts`, `types.ts`, `simulation.ts`, `saveLoad.ts`, 최종 통합·문서 상태 | 데이터 계약·마이그레이션·리뷰 |
| 하위 A | `gpt-5.6-terra` / medium | `NewGameSetup.tsx`, `MainMenu.tsx`, `App.tsx`, `sessionLaunch.ts`, 관련 CSS | 시작 설정 화면·화면 전환 |
| 하위 B | `gpt-5.6-terra` / medium | `test_new_game_setup.mjs`, 기존 테스트의 독립 블록 | 계약·UI·저장 회귀 |

- 주 에이전트가 P0 타입 계약을 먼저 커밋하거나 최소한 파일 인터페이스를 고정한 뒤 하위 A/B를 시작한다.
- 하위 에이전트는 전체 core를 각각 돌리지 않는다. 자기 표적 테스트만 실행하고, 주 에이전트가 통합 후
  core 78개와 빌드를 실행한다.
- 지도 크기 고정 참조 전수 감사와 성능 측정은 S2 계획의 하위 모델 조사 과제로 넘긴다.

## 5. 비범위

- 실제 소형·대형 지도 생성과 `CONFIG.map` 직접 참조 제거
- 산지·호수·해안 생성, `lake`·`sea` 지형과 아트
- 세부 노브의 사용자 변경 및 자원·기후·습격 소비처 연결
- 자염막·어선·수상 길찾기
- 기존 저장의 지도 재생성 또는 크기 변경

## 6. 완료 기준

- 새 게임은 반드시 시작 설정 화면을 거치고, 튜토리얼·불러오기·전투 시뮬레이션은 기존 경로를 유지한다.
- 기존 normal·무작위 시드로 시작했을 때 S0 이전과 같은 72×72 지도·주민·시작 자원 결과가 나온다.
- 수동 시드와 설정 스냅샷이 저장·로드·슬롯 요약·창건 연대기에 일관되게 남는다.
- v56 저장이 평원·중형으로 이관되고 core 게임 테스트와 프로덕션 빌드가 통과한다.

## 7. 완료 기록

- 하위 A/B는 계획대로 `gpt-5.6-terra / medium`으로 UI와 테스트를 분리 구현했고, 주 에이전트가
  데이터 계약·저장 마이그레이션·최종 통합을 담당했다.
- 검증: `npx tsc --noEmit`, `npm run test:game` 78/78, `npm run build` 통과.
- 브라우저 스모크: 메인 메뉴→새 개척 설정→이름 `청설`·easy·시드 `20260802`→게임 생성 성공,
  잠긴 지역/크기와 범위 밖 시드 비활성화 및 콘솔 오류 없음 확인.
