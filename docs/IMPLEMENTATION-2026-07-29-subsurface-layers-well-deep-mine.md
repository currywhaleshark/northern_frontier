# 지하 레이어·우물·채광갱 1차 구현계획

> **계획 상태:** 완료
> **상태 갱신:** 2026-07-30 — P0~P15를 구현하고 복수 우물·공정 배분·실플레이 급수 완화까지 표적 테스트와 빌드를 통과했다.

- 담당 모델: GPT-5.6 Sol
- 추론 수준: 높음
- 연관 설계:
  - [`DESIGN-2026-07-28-wells-and-water.md`](DESIGN-2026-07-28-wells-and-water.md)
  - [`DESIGN-2026-07-28-deep-mining.md`](DESIGN-2026-07-28-deep-mining.md)

## 범위

이번 묶음은 두 설계가 공유하는 지하 데이터와 표시 기반을 먼저 완성한다.

- [x] P0 — 시드 결정적 수맥·철맥·석맥 기하와 칸별 농도 표본
- [x] P1 — `aquiferLevels`·`oreVeinRemaining` 상태와 v45 저장 마이그레이션
- [x] P2 — 수맥 위 우물 배치, 광맥 위 부 등급 채광갱 배치
- [x] P3 — 채광꾼 4인의 갱내 철·석재 생산, 공유 광맥 잔량과 고갈
- [x] P4 — 탐사 지역 레이어, 지관 정밀 농담 판독, 관련 건물 배치 중 자동 표시
- [x] P5 — 지도 왼쪽 수맥·광맥 수동 탭과 UI 설정 저장
- [x] P6 — 연간 강수·실제 비/눈·가뭄을 반영한 수맥 일일 회복과 수요 소비
- [x] P7 — 강 반경 3칸·우물 반경 6칸 공급, 주거 우선·수맥 공유 배분
- [x] P8 — 무두장·옹기가마·의원·축사 효율, 주거 위생·민심, 선택 정보 급수 표시
- [x] P9 — 기존 수맥 위치를 보존한 채 전체 1/3 이상의 내륙 수맥을 추가하고 중심 간격 확보
- [x] P10 — 우물 배치·선택 급수반경 표시, 수맥·광맥 탭을 미니맵 옆으로 이동
- [x] P11 — 기존 수맥 ID 뒤에 중심지 전용 수맥을 추가해 시작 인근 우물 후보 보장
- [x] P12 — 우물 배치 중 완공·건설 중 우물의 기존 급수권을 옅게 동시 표시
- [x] P13 — 지하 레이어의 지형 감쇠·범위 대비 강화, 수맥 모드 우물 급수권·건물 상태 착색,
  가상 우물 및 급수 필요 건물 배치 영향 미리보기
- [x] P14 — 같은 수맥의 복수 우물 취수량 합산·공용 수위 소비, 수위 이상 과취수 방지,
  주거 우선·동순위 비례 급수
- [x] P15 — 우물 취수·평시 회복 상향과 생활 수요 완화로 수맥 하나의 평시 생활권을
  약 30명 규모로 조정하되 산업 수요·건조한 해·가뭄의 압박은 유지

## 명시적 후속 범위

- 농수로와 내륙 논 판정
- 우물을 급수원으로 사용하는 화재 진화
- 광맥 잔량과 연동하는 갱도 붕괴
- [x] 우물·채광장·채광갱 전용 최종 아트 교체 —
  [`IMPLEMENTATION-2026-07-29-subsurface-building-art.md`](IMPLEMENTATION-2026-07-29-subsurface-building-art.md)

강은 고갈되지 않는 안정적 급수원이며 우물보다 반경이 좁다. 같은 수맥의 우물은 공용 수위를
공유하되 우물마다 취수량을 더하며, 실제 사용량이 늘어난 만큼 수위도 더 빨리 내려간다.

## 구현 근거

- 지하 기하·상태: `src/game/subsurfaceVeins.ts`, `src/game/types.ts`
- 급수 부기·효과: `src/game/waterCoverage.ts`, `src/game/waterSupply.ts`
- 저장: `src/game/saveSchema.ts`, `src/game/saveLoad.ts`
- 건물·생산: `src/game/buildings.ts`, `src/game/agents.ts`, `src/game/workerSlots.ts`
- 레이어·탭: `src/render/renderer.ts`, `src/components/MapLayerTabs.tsx`, `src/ui/uiPrefs.ts`

## 검증

- `node tools/game/test_subsurface_layers.mjs`
- `node tools/game/test_ui_prefs.mjs`
- `node tools/game/test_resource_save_migration.mjs`
- `node tools/game/test_water_coverage.mjs`
- `node tools/render/test_water_layer_presentation.mjs`
- `npm run build`
- 로컬 화면 QA — 수맥 레이어의 지형 감쇠·공급 상태색, 우물 범위, 가상 배치 영향,
  레이어 해제 시 기존 건설 미리보기 복귀 확인
