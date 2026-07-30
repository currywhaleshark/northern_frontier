# 사건 삽화 아트 스타일 기준

이 문서는 사건·재난·조정 선택창에 들어가는 가로형 삽화의 기준이다. 2026-07-29에 다시 제작한
늦서리·황충·가축역병 삽화를 현재의 대표 기준으로 삼는다.

## 기준 자산

- `public/assets/events/late-frost-v1.png`
- `public/assets/events/locust-swarm-v1.png`
- `public/assets/events/livestock-epidemic-v1.png`
- `public/assets/events/mine-collapse-v1.png`

셋 중에서는 한 장의 세부 묘사를 그대로 복제하기보다 아래 공통 특성을 유지한다.

## 핵심 방향

- **깨끗한 수묵담채화**: 절제된 먹선 위에 넓고 투명한 담채 면을 얹는다.
- **표면보다 장면**: 종이결이나 붓자국을 과시하지 않고 사건의 인물·피해·행동이 먼저 읽혀야 한다.
- **북방 조선의 현장감**: 조선 시대 복식, 초가·목책·기와, 농기구와 자연환경을 역사적으로
  어색하지 않게 묘사한다.
- **절제된 색**: 먹회색과 흙빛을 중심으로 사건을 설명하는 한두 색만 낮은 채도로 강조한다.
- **매끈한 명암**: 넓은 면의 농담과 부드러운 번짐을 쓰되 작은 점과 잔선을 무수히 쌓지 않는다.

## 반드시 피할 것

- 도트, 픽셀 아트, 디더링
- 점묘, 하프톤, 석판화·동판화 같은 빽빽한 교차선
- 자글거리는 종이결, 모래알 같은 표면 노이즈, 얼룩진 캔버스 질감
- 과도한 샤프닝과 미세 묘사, 화면 전체에 균등하게 뿌린 잔점
- 사진풍, 유화 임파스토, 애니메이션풍 인물
- 서양 중세풍 복식·건축·도구
- 삽화 내부의 글자, 테두리, 워터마크

## 화면 규격과 구도

- 최종 PNG는 **3:1 가로 비율**을 기본으로 한다.
- 현재 기준 해상도는 **2172×724**다.
- UI의 중앙 크롭에서 사건이 즉시 읽히도록 핵심 인물, 피해 대상, 행동을 중앙 가로띠에 둔다.
- 좌우에는 마을·산·들판 같은 환경을 두되 핵심 사건보다 대비를 낮춘다.
- 인물 수를 불필요하게 늘리지 않는다. 작은 카드에서도 자세와 시선이 구분되어야 한다.
- 사건의 결과는 피나 과장된 표정보다 자세, 거리, 날씨, 작물·가축의 상태로 설명한다.

## 재사용 프롬프트 골격

```text
Use case: historical-scene
Asset type: landscape event-card illustration for a historical Joseon frontier settlement game
Primary request: <사건과 핵심 행동>
Scene/backdrop: Joseon-era northern Korean frontier settlement, <계절·장소>
Style/medium: clean refined Korean ink-and-light-color painting (수묵담채화);
clean controlled ink contours, broad translucent washes, restrained pale color,
smooth tonal fields, polished game event illustration
Composition/framing: exact 3:1 landscape; keep the main person, affected subject,
and visible event consequence in the central horizontal band
Lighting/mood: <날씨·시간대·정서>
Color palette: ink gray and muted earth tones with restrained <사건 강조색>
Constraints: historically grounded Korean/Joseon clothing, architecture, tools,
and environment; clear narrative readability; no text, no border, no watermark
Avoid: pixel art, dithering, stippling, halftone, etched crosshatching,
scratchy line noise, granular paper texture, canvas texture, sand-like surface grain,
mottled speckling, over-sharpening, noisy micro-detail, photorealism,
oil-paint impasto, anime style, Western medieval imagery
```

## 제작·검수 순서

1. 사건을 한 문장으로 정리하고 인물·피해 대상·행동을 각각 하나씩 정한다.
2. 위 공통 프롬프트에서 사건, 계절, 강조색만 바꿔 첫 결과를 만든다.
3. 3:1 축소 화면에서 사건이 바로 읽히는지 확인한다.
4. 표면을 확대해 점묘·종이결·교차선이 시선을 빼앗으면 “질감을 더 추가”하지 말고 넓은 담채
   면과 단순한 먹선으로 다시 생성한다.
5. 조선 복식·건축, 손과 도구, 동물의 수와 자세를 확인한다.
6. 최종 파일을 `public/assets/events/`에 넣고 소비 코드의 대체 텍스트와 계획 문서를 갱신한다.
