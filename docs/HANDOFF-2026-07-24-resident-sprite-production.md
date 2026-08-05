# 주민 스프라이트 제작 인계 — 2026-07-24

## 현재 상태

- 작업 브랜치: `codex/resident-woodcutting-sprite`
- 성인 주민의 직업별 작업 연출, 공통 보행, 영상 기반 무직 주민 보행, 영상 기반 벌목꾼 보행·지게 보행·벌목 작업이 런타임에 연결되어 있다.
- 기본 화면의 표시 크기는 계속 `28x40`이다.
- 지도 확대 2배에서만 캔버스 backing scale을 2배로 올리고 `56x80` HD 시트를 샘플링한다. 확대하지 않았을 때 캐릭터가 커지지는 않는다.
- 특수 주민과 유년·청년 단계는 공통 성인 보행으로 교체하지 않는다.
- 신규 스프라이트 시트는 선택적 프레젠테이션 자산이다. 로딩 실패 시 기존 생성 주민/기존 직업 시트로 폴백한다.

## 작업 원칙

1. 캐릭터의 얼굴·복장·시대감은 승인된 정지 원본으로 잠근다.
2. 직업 변형은 승인 원본을 i2i 기준으로 만들고, 걷기와 작업은 해당 직업 원본을 i2v 입력으로 만든다.
3. 영상은 최종 에셋이 아니다. 영상에서 후보 프레임을 고른 뒤 `sprite-gen`의 component-row 추출·큐레이션·합성 경로를 거친다.
4. 썸네일이나 축소 캡처를 다시 원본으로 삼지 않는다. 가능하면 영상의 전체 프레임을 유지한 채 선택한다.
5. `curation.json`을 직접 갱신할 때는 반드시 `load_curation()`으로 읽고 `stamp_curation()`으로 리비전을 다시 찍는다.
6. 런타임은 알파 경계를 다시 추측하지 않고 매니페스트의 `frame_layout` 사각형만 샘플링한다.
7. 표준/HD는 동일한 표시 크기를 사용한다. HD는 더 큰 텍스처를 같은 화면 크기로 그려 확대 시 도트가 튀는 현상만 줄인다.

## 현재 런타임 자산

### 공통 직업 보행

- 시트: `public/assets/resident-common-locomotion-v1.png`
- 코드:
  - `src/render/residentCommonLocomotionAssets.ts`
  - `src/render/residentCommonLocomotionManifest.json`
- 생성기: `tools/render/generate_resident_common_locomotion_v1.py`
- 전용 보행 시트가 없는 성인 직업이 이동할 때 사용한다.
- 정지 중에는 기존 직업/정지 표현을 유지한다.
- 농부는 이동 중 공통 보행을 쓰고, 정지해 실제 밭일을 할 때만 경작·수확·농우 작업 시트를 쓴다.

### 영상 기반 무직 주민 보행

- 표준: `public/assets/resident-idle-video-walk-v1.png`
- HD: `public/assets/resident-idle-video-walk-hd-v1.png`
- 코드:
  - `src/render/residentIdleVideoWalkAssets.ts`
  - `src/render/residentIdleVideoWalkManifest.json`
- 남녀 모두 `1-2-1-3`, 5fps, 프레임당 200ms로 반복한다.
- 이동하지 않을 때도 새 시트의 첫 프레임을 사용한다. 정지 시 예전 저해상도 스프라이트로 돌아가면 안 된다.
- 로컬 원본/참조: `tools/render/source_images/resident-idle-i2v-reference-v1/`
- 로컬 런:
  - `tools/render/generated/resident-idle-video-male-v1/`
  - `tools/render/generated/resident-idle-video-male-hd-v1/`
  - `tools/render/generated/resident-idle-video-female-v1/`
  - `tools/render/generated/resident-idle-video-female-hd-v1/`

### 영상 기반 벌목꾼 보행

- 표준: `public/assets/resident-woodcutter-video-walk-v2.png`
- HD: `public/assets/resident-woodcutter-video-walk-hd-v2.png`
- 코드:
  - `src/render/residentWoodcutterVideoWalkAssets.ts`
  - `src/render/residentWoodcutterVideoWalkManifest.json`
- 합성기: `tools/render/compose_resident_woodcutter_video_walk_v2.py`
- 상태:
  - `axe_walk`: 도끼를 든 일반 보행
  - `jige_walk`: 지게에 목재를 실은 보행
- 남녀 모두 `1-2-1-3`, 5fps, 프레임당 200ms로 반복한다.
- 화물 표시는 기존 게임 로직을 유지한다. `carryingWood`일 때 `jige_walk`, 아니면 `axe_walk`을 쓴다.
- 여성은 알파 실루엣이 다른 주민보다 크게 읽혀 두 상태 모두 95%로 축소했다.
  - HD 런: `scale 0.95`, `dy +2`
  - 표준 런: `scale 0.95`, `dy +1`
  - 발 기준선을 유지하기 위한 양의 `dy`이며 남성은 축소하지 않았다.
- 2026-07-24 실측:
  - 일반 여성 보행 평균 알파 높이 약 67px
  - 여성 도끼 보행 HD 평균 `74 -> 71.7px`
  - 여성 지게 보행 HD 평균 `74.7 -> 72.3px`
- 로컬 런:
  - `tools/render/generated/resident-woodcutter-video-male-v2/`
  - `tools/render/generated/resident-woodcutter-video-male-hd-v2/`
  - `tools/render/generated/resident-woodcutter-video-female-v2/`
  - `tools/render/generated/resident-woodcutter-video-female-hd-v2/`

### 영상 기반 벌목 작업

- 표준: `public/assets/resident-woodcutter-video-work-v2.png`
- HD: `public/assets/resident-woodcutter-video-work-hd-v2.png`
- 코드:
  - `src/render/residentWoodcutterVideoWorkAssets.ts`
  - `src/render/residentWoodcutterVideoWorkManifest.json`
- 합성기: `tools/render/compose_resident_woodcutter_video_work_v2.py`
- 현재 반복은 `1-2-3`, 7fps, 프레임당 140ms이다.
- 이전의 `1-2-3-2` 복제 슬롯은 제거했다. 420ms에서 다시 첫 프레임으로 돌아와야 한다.
- 선택한 영상 시점:
  - 여성: 1.25초 준비, 2.00초 휘두르기, 3.50초 마무리
  - 남성: 1.25초 준비, 2.00초 휘두르기, 3.25초 마무리
- 남성 3.00초 후보에는 몸에서 떨어진 나무 파편이 있어 인접한 깨끗한 3.25초 프레임으로 교체했다.
- 네 작업 런은 90% 스케일로 합성되어 있다.
- 로컬 런:
  - `tools/render/generated/resident-woodcutter-video-male-work-v2/`
  - `tools/render/generated/resident-woodcutter-video-male-work-hd-v2/`
  - `tools/render/generated/resident-woodcutter-video-female-work-v2/`
  - `tools/render/generated/resident-woodcutter-video-female-work-hd-v2/`

## 벌목꾼 원본과 선택 자료

영상 원본은 로컬에 있으며 파생 후보와 함께 대용량이라 이번 커밋에는 넣지 않는다. 같은 작업공간의 다음 세션은 삭제하거나 정리하지 말 것.

```text
tools/render/source_videos/resident-woodcutter-video-v2/
  woodcutter-female-axe-walk-v1.mp4
  woodcutter-female-chop-work-v1.mp4
  woodcutter-female-jige-walk-v1.mp4
  woodcutter-male-axe-walk-v1.mp4
  woodcutter-male-chop-work-v1.mp4
  woodcutter-male-jige-walk-v1.mp4
```

참조·선택 프레임·프롬프트·QA 접촉 시트:

```text
tools/render/source_images/resident-woodcutter-video-v2/
```

중요 하위 경로:

- `anchors/`: i2v에 사용한 남녀 도끼/지게 기준 이미지. `*-clean-v1.png`는 배경을 정확한 `#FF00FF`로 정리한 입력이다.
- `prompts/`: 도끼 보행, 지게 보행, 남녀 벌목 작업 i2v 프롬프트.
- `full-frame-selected-v2/`: 보행에서 사용자가 고른 전체 프레임.
- `work-selected-full-v1/`: 벌목 작업에서 사용자가 고른 전체 프레임.
- `prepared-raw-strips-v2/`: 보행용 component-row 입력.
- `prepared-raw-strips-work-v1/`: 벌목 작업용 component-row 입력.
- `video-qa/`, `work-video-qa-v1/`: 영상 후보 접촉 시트.
- `requests/`: 보행 및 벌목 상태의 수치 계약.

프레임 고르기 웹뷰의 로컬 자료는 `tools/render/curation/`에 있다. 이것도 후보가 많아 커밋하지 않지만, 다시 고를 때는 기존 런을 재사용한다.

## `sprite-gen` 재합성 절차

아래 PowerShell 예시는 저장소 루트에서 실행한다.

```powershell
$skill = "$env:USERPROFILE\.codex\skills\sprite-gen\scripts"
$run = 'tools/render/generated/resident-woodcutter-video-female-hd-v2'
python "$skill\compose_sprite_atlas.py" --run-dir $run
python "$skill\preview_animation.py" --run-dir $run
python "$skill\compose_sprite_gif.py" --run-dir $run
```

보행 네 런의 큐레이션이나 프레임을 바꿨으면 게임용 합본도 다시 만든다.

```powershell
python tools/render/compose_resident_woodcutter_video_walk_v2.py
```

벌목 작업 네 런을 바꿨으면 다음을 실행한다.

```powershell
python tools/render/compose_resident_woodcutter_video_work_v2.py
```

큐레이션 파일을 코드로 바꿀 때의 필수 형태:

```python
from pathlib import Path
from sprite_gen.curation import load_curation, stamp_curation

run = Path("tools/render/generated/<run-name>")
doc = load_curation(run)
# doc["states"][state] 수정
doc = stamp_curation(run, doc)
# UTF-8 JSON으로 run / "curation.json"에 저장
```

웹뷰에서 사람이 다시 고르게 할 때:

```powershell
python "$skill\serve_curation.py" --run-dir <run-dir>
```

## 런타임 연결

- `src/render/atlas.ts`
  - 신규 시트를 모두 선택 자산으로 로드한다.
  - 성인 무직 정지/보행은 영상 기반 idle 시트를 우선한다.
  - 벌목꾼은 작업 중 `video-work`, 이동/대기 중 `video-walk`을 우선한다.
  - 다른 성인 직업은 이동 중 `resident-common-locomotion-v1`을 사용한다.
  - 특수 주민·외국인·유년 단계의 기존 우선순위를 침범하지 않는다.
- `src/components/GameCanvas.tsx`, `src/render/renderer.ts`, `src/ui/mapZoom.ts`
  - 줌 2배에서만 backing canvas를 2배로 만든다.
  - 렌더링 좌표와 포인터 좌표는 논리 크기를 계속 사용한다.
  - `drawWoodcutterVideo*`와 `drawIdleVideoWalk`은 현재 canvas transform을 보고 표준/HD 소스를 선택한다.

## 검증 명령

```powershell
node tools/game/test_map_hd_zoom.mjs
node tools/game/test_resident_common_locomotion.mjs
node tools/game/test_resident_idle_video_walk.mjs
node tools/game/test_resident_woodcutter_video_walk.mjs
node tools/game/test_resident_woodcutter_video_work.mjs
node tools/game/test_resident_atlas_loading.mjs
node tools/render/test_worker_slot_overlay.mjs
npm run build
git diff --check
```

`sprite-gen` 자동 QA:

```powershell
python "$skill\run_correction_loop.py" --run-dir <run-dir> --states <state-list> --dry-run
```

2026-07-24 기준 영상 기반 벌목꾼 표준/HD 런은 자동 QA 94점이며, 위 런타임 테스트와 프로덕션 빌드가 통과했다.

## 다음 작업

1. 게임에서 여성 벌목꾼의 95% 축소 결과를 실제 줌 1배/2배로 확인한다.
2. 너무 작으면 여성 보행 두 런의 scale만 `0.97` 정도로 올리고 발 기준 `dy`를 다시 실측한다. 런타임 코드에서 성별 예외 배율을 추가하지 않는다.
3. 다음 직업은 승인된 무직 HD 정지 원본에서 i2i로 직업 앵커를 만들고, 그 앵커로 i2v 보행/작업을 만든다.
4. 직업별 결과가 충분히 쌓이면 현재 64셀 공통 보행 시트를 영상 기반 `28x40`/`56x80` 쌍으로 단계적으로 교체한다.

## 주의할 점

- `backup_json/`, `debug_output*/`, `tools/game/debug-temp/`는 스프라이트 납품물이 아니다.
- `docs/superpowers/plans/2026-07-23-daily-cycle-implementation.md`도 이번 스프라이트 커밋과 무관하다.
- `tools/render/generated/resident-common-locomotion-v1/`은 약 184MB의 파생 런이다. 런타임 시트와 생성 스크립트만 버전 관리하고 전체 런은 커밋하지 않는다.
- 원본 영상, 프레임 후보, 큐레이션 웹뷰 임시 런을 정리하려면 먼저 사용자에게 확인한다.
- 표준/HD 프레임 순서나 셀 크기를 바꾸면 JSON 매니페스트와 테스트 기대값을 동시에 갱신한다.
