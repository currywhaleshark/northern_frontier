# 전투 확장 3단계 — 우회로 화살표 QA

- source visual truth path: `C:\Users\yurib\AppData\Local\Temp\codex-clipboard-3239d266-864e-40a8-a979-cc2ada6c9b5f.png`
- implementation screenshot path: `C:\Users\yurib\Documents\New project\northern\docs\qa\combat-expansion-phase-3-route-gates-approach.png`
- route-stage implementation screenshot path: `C:\Users\yurib\Documents\New project\northern\docs\qa\combat-expansion-phase-3-route-stage-right-exits.png`
- comparison image path: `C:\Users\yurib\Documents\New project\northern\docs\qa\combat-expansion-phase-3-route-gates-comparison.png`
- viewport: 1280 × 720 (구현), 1468 × 550 (사용자 주석 원본)
- state: 겨울 마을 방어전, 배치 단계, 우측 우회로 개방·적 부대 진입

## Full-view comparison evidence

사용자 주석의 핵심 배치는 일반 전장에서 중앙 위쪽 화살표가 좌측 우회로, 하단 경계 화살표가 우측 우회로를 뜻한다. 구현 화면에서도 동일한 세로 배치와 방향을 유지하며, 창고 지역에서도 순서를 뒤집지 않는다. 손그림 빨간색은 위치 설명용 주석으로 보고 실제 UI는 기존 전술 화면의 금색 강조색, 어두운 반투명 라벨, 9px 계열 보조 문구를 사용했다.

## Focused region comparison evidence

- 일반 전장: 위쪽 좌측 우회로와 아래쪽 우측 우회로 화살표가 중앙 경계에 놓이며 부대 스프라이트와 전열 라벨을 가리지 않는다.
- 우측 우회 전장: 진입로·창고지대 양쪽 끝에 위쪽 출구 화살표가 있고, 실제 적 부대 스프라이트가 입구 노드에 보인다.
- 좌측 우회 전장: 같은 구성요소의 반대 상태로 양쪽 끝에 아래쪽 출구 화살표가 배치되도록 정적 구성요소 테스트로 고정했다.

## Required fidelity surfaces

- Fonts and typography: 기존 전술 화면의 글꼴 상속, 굵기, 8–9px 보조 라벨 체계를 유지했다. 줄바꿈이나 잘림은 없다.
- Spacing and layout rhythm: 일반 전장 입구는 상단 63%/하단 8px 기준을 사용한다. 우회 전장 출구는 노드 외곽 38px에 붙어 전투 노드와 분리된다.
- Colors and visual tokens: 기존 금색 강조색과 통제 상태별 적색·경합색을 재사용했다. 숨김/의심/비활성 상태는 투명도와 문구를 함께 사용한다.
- Image quality and asset fidelity: 화살표는 Phosphor 정식 아이콘을 사용하고, 부대는 기존 전술 스프라이트 렌더러를 그대로 쓴다. CSS 도형·문자 화살표·대체 이미지는 없다.
- Copy and content: 일반 전장은 `좌측 우회로`/`우측 우회로`, 우회 전장은 `진입로 출구`/`창고지대 출구`로 구분한다. 화면 낭독기 이름에는 방향과 상태가 포함된다.

## Findings

최종 화면에 남은 P0/P1/P2 차이는 없다.

## Comparison history

1. 첫 우측 우회 전장 캡처에서 창고지대 출구 라벨 일부가 전장 미니맵 아래로 들어가는 P2 문제가 있었다.
   - earlier evidence: `C:\Users\yurib\Documents\New project\northern\docs\qa\combat-expansion-phase-3-route-stage-right-exits-iteration-1.png`
   - fix: 창고지대 끝 출구 묶음을 해당 노드 너비의 36% 지점으로 옮겼다.
   - post-fix evidence: `C:\Users\yurib\Documents\New project\northern\docs\qa\combat-expansion-phase-3-route-stage-right-exits.png`
   - result: 화살표와 `창고지대 출구` 라벨이 모두 노출된다.

## Browser verification

- 일반 전장의 우측 우회로 아래쪽 화살표를 눌러 우회 전장으로 이동했다.
- 우회 전장의 진입로 위쪽 출구 화살표를 눌러 일반 전장으로 복귀했다.
- 일반 전장 DOM에서 진입 지역과 창고 지역 모두 위=좌측, 아래=우측 접근성 이름을 확인했다.
- 우측 우회 전장 DOM에서 진입로와 창고지대 양쪽 출구가 모두 위쪽 화살표임을 확인했다.
- 브라우저 콘솔 error/warning: 0건.

final result: passed
