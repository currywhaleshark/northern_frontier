# 지하 시설 건물 스프라이트 구현계획

> **계획 상태:** 완료
> **상태 갱신:** 2026-07-29 — 계절별 우물·채광장·채광갱을 v2 표준·HD 아틀라스에 연결하고 알파·열 매핑 표적 검사와 프로덕션 빌드를 통과했다.

## 목표

- 우물은 지붕·도르래·상부 골조가 없는 조선식 낮은 석축 우물로 표현한다.
- 채광장은 갱구가 아니라 노두에서 가져온 광물을 분류·적치하는 야외 채광 캠프로 교체한다.
- 채광갱은 목재 보강 갱구와 암반 절개가 중심인 2×2 영구 시설로 새로 추가한다.
- 세 자산 모두 평상시·겨울형, 표준·HD 아틀라스를 제공한다.

## 작업 단계

- [x] A1 — 기존 사선 건물 투영·셀·앵커 규칙 확인
- [x] A2 — 평상시형 생성 및 동일 형상의 겨울형 생성
- [x] A3 — 크로마키 제거와 가장자리 색 번짐 정리
- [x] A4 — v2 건물 아틀라스 패킹 및 런타임 연결
- [x] A5 — 표적 자산 검사·프로덕션 빌드·접촉 시트 QA

## 담당

- 주 구현·아트 연결: GPT-5.6 Sol, 높은 추론 수준
- 별도 하위 에이전트 없음

## 검증 원칙

- 아틀라스 크기·열 매핑·셀 경계·알파를 표적 검사한다.
- 런타임 타입 검사와 프로덕션 빌드는 한 번 수행한다.
- 이번 범위와 무관한 전체 테스트 반복은 하지 않는다.

## 구현 근거

- 원본·프롬프트: `tools/render/source_images/subsurface-buildings-v1/`
- 재현 패커: `tools/render/pack_subsurface_buildings.py`
- 표준·HD 시트: `public/assets/oblique-buildings-1x1-v2*.png`,
  `public/assets/oblique-buildings-2x2-v2*.png`
- 런타임 매핑: `src/render/obliqueBuildingAssets.ts`
- QA: `docs/assets/buildings/subsurface-buildings-v1-contact.png`,
  `docs/assets/buildings/subsurface-buildings-v1-manifest.json`

## 검증

- `node tools/render/test_oblique_building_assets.mjs`
  - 아틀라스 크기, 열 매핑, 셀 경계 비접촉, 잔여 크로마키 픽셀 0 확인
- `npm run build`
- 접촉 시트 육안 QA
