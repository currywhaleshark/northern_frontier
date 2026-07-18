# UI 재구성 릴리스 후보 — 2026-07

> 상태: 릴리스 안정화 진행 중. 이 문서는 `codex/ui-reorganization`의 단일 최신 상태 문서이며,
> 기존 계획·핸드오프 문서는 역사 기록으로 유지한다.

## 1. 기준 브랜치와 HEAD

- 대상 브랜치: `codex/ui-reorganization`
- 기준 main: `origin/main` `984ff49003617257ecc4de62e5ba9e2287246014`
- 안정화 시작 HEAD: `6fed1e7e0e00175f0cbace07d86828d3fb05025d`
  (`feat: education and literacy system`)
- 시작 시 원격 상태: `origin/codex/ui-reorganization`보다 1커밋 앞섬, 뒤처짐 없음
- 최종 HEAD: 안정화 완료 후 기록
- main 대비 범위: 384개 파일, 59,867줄 추가, 2,140줄 삭제

시작 시 아래 생성·백업 디렉터리는 추적되지 않은 사용자/기존 작업으로 확인했다. 안정화 커밋에
포함하거나 삭제하지 않는다.

- `backup_json/`
- `debug_output/`
- `debug_output_heuristic/`
- `tools/game/debug-temp/`
- `tools/render/generated/`
- `tools/render/source_images/special-resident-events-v1/`
- `tools/render/source_images/special-resident-events-v2/`
- `tools/render/source_images/special-residents-v1/`
- `tools/render/source_images/special-residents-v2/`
- `tools/render/source_images/tactical-support-special-v1/`

## 2. 포함된 주요 시스템

- 자원 그룹·별표·건설 드로어·도킹 창·통합 로그·미니맵
- 전술전·산채 토벌·몰이사냥
- App/캔버스 렌더 시계 분리, viewport 렌더, 광역 목표 경로탐색 최적화
- 부패·보존식·콩·옹기·장·김장
- 가축·농우·군마·기마병
- 의원·전술 치료반
- 귀순 주민
- 은 경제·은광·잠채
- 혼인·출산·성장·노화·장례
- 만족도·서당·종교
- 특수 주민 명부와 후속 사건
- 가변 크기 논밭과 파종·생육·수확
- 다중 저장 슬롯과 저장 마이그레이션

## 3. 저장과 UI 설정 버전

- 안정화 시작 저장 스키마: v23
- UI prefs 버전: v5
- 안정화 최종 저장 스키마: 완료 후 기록
- 미래 스키마: 기존 정책대로 명시적으로 거절

## 4. Phase 0 기준선

기준선은 코드 수정 전 시작 HEAD `6fed1e7e`에서 2026-07-18에 측정했다. 절대 성능 시간은
머신 부하의 영향을 받으므로 최종 측정과 같은 스크립트·시나리오의 방향성 비교에 사용한다.

### 자동 검증

| 항목 | 시작 기준선 |
|---|---|
| `npm run test:game` | 96/96 통과, 172초 |
| `npm run build` | 통과, 187 modules, 4.23초 |
| `npm run check` | 96/96 + build 통과, 194.4초 |
| `git diff --check` | 통과 |
| 프로덕션 CSS | 128.85 kB, gzip 24.56 kB |
| 프로덕션 main JS | 941.95 kB, gzip 335.88 kB |
| 번들 경고 | minified chunk 500 kB 초과 |

### 런타임 측정

| 시나리오 | count | median(p50) | p95 | max | 첫 tick |
|---|---:|---:|---:|---:|---:|
| cold-first-path, 주민 12명·건물 3동 | 24 | 1.205 ms | 19.917 ms | 33.273 ms | 33.273 ms |
| 주민 120명·건물 96동 | 8 | 15.364 ms | 74.219 ms | 74.219 ms | 74.219 ms |

추가로 exploration lookup 30회 측정은 helper p50 0.378 ms / p95 2.337 ms / max 3.229 ms,
raw p50 0.267 ms / p95 0.862 ms / max 1.626 ms였고 평균 비율은 1.61배였다.

### 기존 성능 최적화 보존

커밋 `6fba743 perf: stabilize runtime rendering and pathfinding`의 다음 구조가 현재 HEAD에서도
`test_runtime_performance_structure.mjs`로 검증됐다.

- App은 실제 simulation tick이 있을 때만 React version을 올린다.
- `GameCanvas`가 30fps 상한 RAF를 소유하며 정지·숨김 상태에서는 연속 frame을 중단한다.
- renderer는 viewport 영역만 clear/copy하고 건물·주민을 cull한다.
- 탐사 조회는 O(1)이며 `agentsTick`의 중복 탐사 갱신이 없다.
- 광역 목표장은 직업별로 공유하며 기존 A* 힙·통행 memo·실패 cooldown을 유지한다.
- 관련 30일 고정 시드 결정성 테스트가 기준선 전체 테스트에서 통과했다.

최적화 커밋 이후 `GameCanvas.tsx`는 변경되지 않았다. 보호 파일의 후속 변경은
`agents.ts` +22/-6, `renderer.ts` +2/-0의 국소 변경이며 파일 단위 교체는 없었다.

## 5. 완료된 안정화 작업

완료 후 Phase별로 기록한다.

## 6. 미완성 기능

현재 코드 감사 후 완료/미완성 여부를 확정한다.

- 아이 전용 스프라이트
- 소년 노동·서당 연동
- 팽배수
- 사건 큐
- 전투 무대 드래그 조작
- 특수 주민 추가 후보
- 번들 분할

## 7. 의도적으로 보류한 기능

- 팽배수 신규 구현
- 새 특수 주민·종교 분기·가축·화폐·전투 종류
- 아이 전용 스프라이트
- 전투 무대 전체 드래그 시스템
- Web Worker 전환
- App 전면 재작성과 GameState 불변 구조 전환
- 무차별 memoization과 전투 밸런스 전면 재튜닝

## 8. 알려진 문제

- 시작 기준선의 main JS가 500 kB를 초과한다. Phase 8에서 구성과 효과를 측정한다.
- 나머지는 감사·장기 측정·브라우저 인수 후 기록한다.

## 9. 주요 밸런스 수치

Phase 9 장기 자동 플레이 결과를 표로 기록한다.

## 10. 성능 측정 전후

최종 HEAD 측정 뒤 Phase 0 기준선과 비교한다.

## 11. 전체 테스트 결과

최종 HEAD 검증 뒤 기록한다.

## 12. 구저장 검증 결과

Phase 10 완료 뒤 저장 시나리오별로 기록한다.

## 13. 브라우저 인수 결과

1280×720의 Phase 11 결과와 console error 여부를 기록한다.

## 14. 병합 후 권장 작업

최종 감사 뒤 기록한다. App 분리는 필요한 작은 hook 추출을 넘지 않는 후속 후보로 유지한다.

## 15. 되돌릴 때 주의할 커밋

Phase별 커밋과 의존 관계를 안정화 완료 후 기록한다.
