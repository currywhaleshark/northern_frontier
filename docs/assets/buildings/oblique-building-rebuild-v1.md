# 기울어진 직교 탑뷰 건물 재작업 v1

## 공통 투영 규격

- 카메라: 지면 위 약 55도, 정면에서 동쪽으로 약 15도만 회전한 직교 투영
- 화면에는 남쪽 정면을 거의 수평으로 두고 동쪽 측벽을 조금만 노출한다.
- 소실점, 원근 수렴, 아이소메트릭 마름모 바닥판을 사용하지 않는다.
- 기둥은 수직이며 모든 건물의 지붕 노출량과 벽 높이 비율을 같게 유지한다.
- 접지점은 셀 아래쪽의 같은 수평 기준선에 맞춘다.
- 건물 주변은 바로 `#FF00FF` 단색 배경이어야 하며 기하학적 바닥 받침을 그리지 않는다.
- 재료와 시대상: 조선 후기 북방 개척지, 목구조·초가·기와·돌기단 중심.
- 광원: 좌상단의 중립적인 낮빛. 그림자는 발밑에 작고 단단하게 붙인다.

## 해상도

- 원본은 HD만 생성한다.
- 1×1 발자국: HD 출력 셀 `56×80`, 일반 출력 셀 `28×40`
- 2×2 발자국: HD 출력 셀 `112×160`, 일반 출력 셀 `56×80`
- 일반 출력은 HD 결과를 정확히 1/2 최근접 이웃 축소해 만든다.
- 생성 원본에서는 모든 부속물과 지붕 끝에 충분한 마젠타 여백을 둔다.

## 생성 묶음

1. 주거·기초 시설
   - `center`, `hut`, `ondol`, `tileHouse`, `storehouse`, `cellar`, `smokehouse`, `clinic`
2. 채취·공방
   - `lumberCamp`, `woodShed`, `huntLodge`, `herbHut`, `smithy`, `mine`, `tannery`, `weavingHouse`
3. 식품·강변
   - `dryingRack`, `onggiKiln`, `jangdokdae`, `watermill`, `ferry`, `charcoalKiln`, `stable`, `dock`
4. 행정·군사
   - `nitreYard`, `beacon`, `watchtower`, `garrison`, `office`, `market`, `school`, `cannonEmplacement`
5. 종교·토목
   - `shrine`, `hermitage`, `bridge`, `palisade`, `earthFort`, `stoneWall`, `gate`
6. 별도 모듈
   - 중심지 승격 `bo`, `jin`, `bu`
   - 밭·논 계절/성장 타일
   - 연결형 목책·토성·석벽·성문
   - 빈 묘역과 0~4기 안치 변형

## 묘역 규격

- 묘지는 1×1부터 3×3까지 드래그로 지정한다.
- 한 타일을 2×2 소구획으로 나누고 시신 한 구마다 한 구획을 사용한다.
- 타일당 용량은 4기이며 영역 전체 용량은 `가로×세로×4`이다.
- 빈 묘역에는 낮은 밧줄 경계와 정돈된 흙만 보인다.
- 안치 순서는 좌상, 우상, 좌하, 우하이며 기록 배열 인덱스와 시각 슬롯을 일치시킨다.

## 계절

- 비겨울판을 기준 형태로 만든다.
- 겨울판은 구조와 카메라를 바꾸지 않고 지붕·기단·노출 지면에만 적설한다.
- 연기, 불꽃처럼 움직이는 효과는 본체 시트와 분리하는 것을 원칙으로 한다.

## 파일럿

- 원본: `tools/render/generated/buildings-oblique-pilot-v1/raw-sheet.png`
- 배치: 위 행 `hut`, `storehouse`, `smithy`; 아래 행 `lumberCamp`, `watchtower`, 빈 `cemetery`
- 이 파일의 카메라와 벽 높이를 이후 생성의 스타일 앵커로 사용한다.
