# 계획 문서 상태 색인

> **마지막 전수 감사:** 2026-07-30
> 실제 코드, 커밋 기록, 통합 릴리스 기록을 문서의 체크박스보다 우선해 판정했다.

## 상태 기준

| 상태 | 의미 |
|---|---|
| 완료 | 문서에서 확정한 구현 범위가 반영됨. 명시적 비범위·별도 후속 계획은 제외 |
| 일부 완료 | 구현된 범위와 아직 남은 범위가 함께 있음 |
| 미착수 | 설계·계획만 있고 해당 구현은 시작되지 않음 |
| 보류 | 재개 조건 또는 추가 결정 전까지 의도적으로 멈춤 |
| 대체됨 | 다른 계획이나 구현 방향이 이 문서를 대신함 |

계획을 만들거나 구현 상태가 바뀔 때에는 이 색인과 원문 상단 상태를 같은 변경에서 갱신한다.

## 현재 설계·구현계획

| 문서 | 상태 | 현재 판정 |
|---|---|---|
| [콘텐츠 보완 제안](DESIGN-2026-07-23-content-gap-proposals.md) | 일부 완료 | 일일 생활, 재해 기반, 후반 서사 등 일부가 별도 계획으로 진행됐으나 제안 다수가 남음 |
| [하루 생활 사이클 설계](DESIGN-2026-07-23-daily-cycle.md) | 완료 | 72서브틱 생활 사이클과 최종 감사까지 반영 |
| [절목 시스템](DESIGN-2026-07-23-edict-system.md) | 완료 | 절미·절탄에 이어 모민·방화·야금·휼로·토목 부역까지 이주·화재·노년·가내수공업·저녁 일과에 연결하고 86/86 핵심 회귀와 프로덕션 빌드로 검증 |
| [연간 기후와 실제 날씨 설계](DESIGN-2026-07-28-annual-climate-weather.md) | 완료 | 결정적 연간 기후·계절 날씨·재해 확률 연결 완료 |
| [조정 하사품 설계](DESIGN-2026-07-28-court-grants.md) | 완료 | 기본 하사품과 영구 기물·현판·총통·고유 무기 후속 범위까지 구현 |
| [채광갱과 지하 광맥](DESIGN-2026-07-28-deep-mining.md) | 완료 | M1~M4와 2×2 채광갱 계절 아트·표준/HD 연결·표적 검증 완료 |
| [재해 확장](DESIGN-2026-07-28-disasters.md) | 완료 | D0~D9·U6 완료. 기후 연동 재해, 화재 진화, 갱도 붕괴 전조·매몰·구조까지 표적 회귀와 빌드로 검증 |
| [정기거래 계약](DESIGN-2026-07-28-recurring-trade.md) | 완료 | 계약 전 과정·UI·경보와 체결 불가 사유 중앙 플로트까지 반영 |
| [스프라이트 스튜디오 설계](DESIGN-2026-07-28-sprite-studio.md) | 완료 | 레지스트리 5종·편집 UI·작업자 슬롯과 루트 배포 PNG의 미사용 감사·보관함 정리까지 구현 |
| [착용 장비와 가죽 경제](DESIGN-2026-07-28-wearables-and-footwear.md) | 완료 | 의복·신발 착용, 마모, 제작, 저장, UI 반영. 사망 회수 없음은 확정 범위 |
| [우물과 급수](DESIGN-2026-07-28-wells-and-water.md) | 완료 | 내륙·시작 수맥, 복수 우물·공정 배분·레이어·우물 아트·U6 화재 F0~F3와 U5 농수로(강 연결·논 판정·통행·절차형 렌더), U2 배치 예상 산출 문구를 실제 급수 계산 재사용으로 완료 |
| [연대기 화면](DESIGN-2026-07-29-chronicle-screen.md) | 완료 | C1~C4 구현·검증 완료 (v43). 행정단위 표기(촌·보·진·부)와 상단바·저장 슬롯 표기가 범위 외 추가로 반영됨 |
| [후반 엔딩](DESIGN-2026-07-29-late-game-endings.md) | 보류 | 인물 중심 진행(계승→칭칸→북병사 교지)과 F4 초상·외교 E1~E6 기반은 완료. 역사 시계 세부 결정까지 착수 보류 |
| [외교 인물](DESIGN-2026-07-30-diplomatic-figures.md) | 완료 | 실록 기반 인명 풀, 결정적 인물·임기, 성향 보정, 대표 명의, 고증 초상 16종과 조정·세력·교역 UI 연결 완료 |
| [외교 활동](DESIGN-2026-07-30-diplomatic-actions.md) | 완료 | E1~E6 완료. E6은 관계 80+ 산채 원병의 자동·직접 전투 합류, 부족 전쟁 민병 파견·결산, v52 저장을 E6/E5/E2 표적 회귀와 빌드로 검증 |
| [타 부족 거주지 활동 설계](DESIGN-2026-08-06-foreign-site-activity.md) | 완료 | A0~A5와 v66 저장, 거주지 기반 습격·군사 재편에 더해 소형/중형/대형 3/5/7개 거점, 강 반경 4칸 밖 내륙 부락 분산, 대형 산채 32칸 간격, 부락·경작지·부속물 수목 비겹침까지 구현·검증 |
| [외교 활동 E6 구현계획](IMPLEMENTATION-2026-07-30-diplomatic-actions-e6.md) | 완료 | `gpt-5.6-sol / high` 담당. 원병·부족 전쟁 파견·외부 전투원 분리·v52 저장과 표적 검증 완료 |
| [농수로 U5 구현계획](IMPLEMENTATION-2026-07-30-irrigation-canals.md) | 완료 | `gpt-5.6-terra / high` 담당. 완공 수로 강 연결 BFS, 논 판정·통행·절차형 물길/마른 도랑 렌더, 강 접속·색상 보정과 논 숲 개간 확인까지 완료 |
| [우물 배치 예상 산출 구현계획](IMPLEMENTATION-2026-07-31-well-yield-preview.md) | 완료 | `gpt-5.6-terra / medium` 담당. 실제 우물 산출 계산 재사용, 허생 정보 차등, 미답사 수맥 정보 차단과 표적 검증 완료 |
| [강·농수로 급수권 구현계획](IMPLEMENTATION-2026-07-31-river-canal-water-coverage.md) | 완료 | `GPT-5 Codex 주 에이전트 / high` 담당. 강 3칸·흐르는 농수로 1칸 급수 판정, 수맥 레이어 표시, 표적 회귀와 최종 빌드 완료 |
| [외교 인물 F4 구현계획](IMPLEMENTATION-2026-07-30-diplomatic-figures-f4.md) | 완료 | 1024px 고증 초상 16종, 이름 해시 배정, 조정·세력·교역 UI 연결과 표적 테스트·빌드 완료 |
| [연간 기후 구현계획](IMPLEMENTATION-2026-07-28-annual-climate-weather.md) | 완료 | P1~P7 구현·검증 후 `800f624`로 병합 |
| [조정 하사품 구현계획](IMPLEMENTATION-2026-07-28-court-grants.md) | 완료 | G1~G8 및 P9~P16 후속 구현·집중 회귀 완료 |
| [재해 확장 구현계획](IMPLEMENTATION-2026-07-29-disasters.md) | 완료 | D0+D1 구현, v44 저장·표적 회귀·프로덕션 빌드 검증 완료 |
| [재해 확장 D2 구현계획](IMPLEMENTATION-2026-07-29-disasters-late-frost.md) | 완료 | 밭/논 여름 재파종, 3일 실제 날씨 판정, 공유 백화/경보, 표적 회귀·빌드 완료 |
| [재해 확장 D3 구현계획](IMPLEMENTATION-2026-07-29-disasters-locust.md) | 완료 | 비공개 2~5일 누적 피해·정착지 단위 수확·황충 오버레이·표적 회귀·빌드 완료 |
| [재해 확장 D4 구현계획](IMPLEMENTATION-2026-07-29-disasters-drought-weir.md) | 완료 | 무강수 3일 가뭄·강우 해소·농업/어획 피해·보 관개·표적 회귀·빌드 완료 |
| [재해 확장 D5 구현계획](IMPLEMENTATION-2026-07-29-disasters-spring-flood-levee.md) | 완료 | 대홍수·보 저수지·보 파괴·제방과 원인별 피해 경보 구현, D5 표적 회귀와 빌드 완료 |
| [재해 확장 D6 구현계획](IMPLEMENTATION-2026-07-29-disasters-snow-damage.md) | 완료 | 실제 연속 적설 설해·주거 붕괴·수리 재배치와 원인별 피해 경보 및 표적 회귀 완료 |
| [재해 확장 D7 구현계획](IMPLEMENTATION-2026-07-29-disasters-epidemic.md) | 완료 | 여름·인구 발생 가중, 집·일터 전염망, 동거인 격리, 의료 회복, 2일 무감염 종료와 표적 회귀 완료 |
| [재해 확장 D8 구현계획](IMPLEMENTATION-2026-07-29-disasters-livestock-epidemic.md) | 완료 | 축종군 발생·축사 전염·도살 처분·격리와 목동 간호·농우/군마 정합성·표적 회귀 완료 |
| [재난 일러스트와 수리 시설 아트 구현계획](IMPLEMENTATION-2026-07-29-disaster-art-and-waterworks.md) | 완료 | 깨끗한 수묵담채 사건 카드 3종과 준탑뷰 보·제방 가로/세로 자산, 제방 변 배치·중첩 규칙, 표적 회귀·빌드 완료 |
| [지하 레이어·우물·채광갱 1차 구현계획](IMPLEMENTATION-2026-07-29-subsurface-layers-well-deep-mine.md) | 완료 | P0~P15: 지하자원·채광갱·급수, 복수 우물·공정 배분·실플레이 완화와 레이어·가상 배치 영향까지 검증 완료 |
| [지하 시설 건물 스프라이트 구현계획](IMPLEMENTATION-2026-07-29-subsurface-building-art.md) | 완료 | 우물·채광장·채광갱 계절형과 v2 표준/HD 아틀라스 연결, 알파·열 매핑 검사와 빌드 완료 |
| [마을 화재 구현계획](IMPLEMENTATION-2026-07-30-disasters-fire.md) | 완료 | F0~F3: 스키마 46·건조 발화·서브틱 연소/확산·염초장 현장 폭발·물동이 진화·화재 수리·경고/불꽃/연기, 표적 회귀·타입 검사·프로덕션 빌드 완료 |
| [갱도 붕괴 구현계획](IMPLEMENTATION-2026-07-30-disasters-mine-collapse.md) | 완료 | D9: 스키마 47·광맥 고갈/우천 위험·전조·매몰·긴급/신중 구조·2차 붕괴·부상/사망, 구조 중 파괴·수리 잠금과 구조 후 수리 전환, 2172×724 수묵담채 삽화 연결 완료 |
| [외교 인물 F1+F3 핵심 구현계획](IMPLEMENTATION-2026-07-30-diplomatic-figures.md) | 완료 | P0~P3: 사료 기반 인명, 결정적 생성·스키마 48·96일 임기, 조정·세력·교역 UI와 대표 명의 완료. 표적 테스트·빌드 통과 |
| [외교 인물 F2 북병사 성향 보정 구현계획](IMPLEMENTATION-2026-07-30-diplomatic-figures-f2.md) | 완료 | 엄격·탐욕·온건·지장을 의심·하사·청원·세공 유예·위협 감소에 연결하고 전용 및 관련 회귀·빌드로 검증 |
| [외교 인물 F3 대표 명의 사건 문구 감사](IMPLEMENTATION-2026-07-30-diplomatic-figures-f3.md) | 완료 | 감찰·견책·토벌·개칭 허가에 북병사 명의를, 여진 세력의 통첩·습격·결산에 지도자 무리를 연결하고 표적 회귀로 검증 |
| [외교 활동 E1 예물 사절 구현계획](IMPLEMENTATION-2026-07-30-diplomatic-actions-e1.md) | 완료 | E1-P0~P3: 스키마 49·사절 왕복·예물 가치·의심·세력 창/수량 모달, 표적 테스트·빌드 완료 |
| [외교 활동 E2 화친 맹약 구현계획](IMPLEMENTATION-2026-07-30-diplomatic-actions-e2.md) | 완료 | E2-P0~P3: 동봉 예물·결정적 2~4년 불가침·습격/강탈 정지·원정/항의 묵살 파기·만료 갱신, 표적 회귀·빌드 완료 |
| [외교 활동 E3 습격 귀띔 구현계획](IMPLEMENTATION-2026-07-30-diplomatic-actions-e3.md) | 완료 | 관계 70 문턱·타 세력 제외·결정적 제보자·성향 대사·협박 거절 후 warned 전파를 표적 테스트와 빌드로 검증 |
| [외교 활동 E4 근접 경고 구현계획](IMPLEMENTATION-2026-07-30-diplomatic-actions-e4.md) | 완료 | P0~P3: 경계 밖 2칸 완충의 건물/3일 작업, 발견 거점 외곽 3칸의 3일 배회, 세력×사유 dedupe·4일 약한 압박·중앙 플로트·v50 저장을 E4/E2 표적 회귀와 빌드로 검증 |
| [외교 활동 E5 생활권 협정 구현계획](IMPLEMENTATION-2026-07-30-diplomatic-actions-e5.md) | 완료 | `gpt-5.6-terra / high`: 구역별 사절·반경/관계 가격·연간 권리, 통행/사냥 허가 통합·길/교역 정합, 경고/항의 수습과 v51 저장을 E5/E4/E2 표적 회귀·빌드로 검증 |
| [스프라이트 스튜디오 구현계획](IMPLEMENTATION-2026-07-28-sprite-studio.md) | 완료 | P9까지 완료. 인접 채광 가림 공통화에 더해 루트 PNG 189개의 직접·동적 참조 감사와 안전한 보관함 이동을 검증 |
| [어장·어선·출어 설계](DESIGN-2026-08-02-fishing-boats.md) | 완료 | F0~F5와 선박 개체화 완료. 포구 양측 2슬롯·선박당 어부 최대 2명·배무이터 앞 건조 후 지정 슬롯 진수·개별 선박 선택/정보 UI·하단 원 선택 표시를 v61 저장과 F2~F4 표적 테스트·빌드로 검증했으며, 기존 한선형 어선·복합 포구·어장 아이콘·최대 줌 HD 자산 계약도 유지함 |
| [빗물 저수조 설계](DESIGN-2026-08-03-rainwater-cistern.md) | 완료 | W1~W3와 옹기 인프라에 맞춘 보(堡) 해금 완료. 자연수→우물→저수조 우선순위, 강우·결빙 적설·해빙·가뭄 증발, v62 저장, 선택/급수권 UI, HD 우선 계절 자산을 전용 회귀와 프로덕션 빌드로 검증 |
| [새 게임 설정 개편 설계](DESIGN-2026-08-01-new-game-setup.md) | 완료 | S0~S6 완료. 4지역·3크기와 시작 물자·통합 자원 밀도·기후 혹독도·위협의 단계 설정을 지도·경제·날씨·저장에 연결하고 고정 길잡이·84개 core·UI 회귀·빌드로 검증 |
| [새 게임 설정 S6 세부설정 구현계획](IMPLEMENTATION-2026-08-05-new-game-setup-s6-tuning.md) | 완료 | 네 노브·사용자 설정 UI와 0.75/1/1.25 자원 밀도, 0.85/1/1.2 기후 위험축, 저장 스냅샷을 구현. 시작 보장·기준 지도·구 저장·길잡이를 보존하고 84/84 core·UI·빌드 통과 |
| [새 게임 설정 S0+S1 구현계획](IMPLEMENTATION-2026-08-02-new-game-setup-s0-s1.md) | 완료 | `NewGameOptions`·`worldSetup`, v57 저장, 메뉴/설정 화면과 결정론·구 저장·튜토리얼 회귀를 구현하고 78개 core·빌드·UI 스모크 통과 |
| [새 게임 설정 S2 지도 크기 구현계획](IMPLEMENTATION-2026-08-02-new-game-setup-s2-map-sizes.md) | 완료 | 56²·72²·96² 생성·선택 UI, 중형 RNG 보존, 실제 행렬 기반 저장 보정과 다중 시드·79개 core·성능·실화면 검증 완료 |
| [새 게임 설정 S3 산지 구현계획](IMPLEMENTATION-2026-08-02-new-game-setup-s3-mountain-region.md) | 완료 | 광상 장벽·인접 채광·광부 가림과 산 돌출부의 자연수·외부 거점 침범 방지 마스크를 전용 회귀·빌드·실화면으로 검증 |
| [새 게임 설정 S4 호수 구현계획](IMPLEMENTATION-2026-08-02-new-game-setup-s4-lake-region.md) | 완료 | 큰 연결 호수·자연 급수·호숫가 파문과 액체/결빙·부분 호반 심리스 재질을 평지와 같은 네이티브 1px 밀도로 보정하고 결빙 진행·표적 회귀·빌드로 검증 |
| [새 게임 설정 S5 해안 구현계획](IMPLEMENTATION-2026-08-03-new-game-setup-s5-coast-region.md) | 완료 | 남쪽 연속 바다·자염막·염부와 자동 소금 운반을 구현하고, 골간 우디캐 외 교역 세력의 소금 매입·희소품 가치 3.2로 물·일반 자원 부족을 수출로 보완 |
| [해안 전이 지형과 갯벌 어로 구현계획](IMPLEMENTATION-2026-08-03-coastal-transition-tidal-flat.md) | 완료 | 갯벌·모래·자갈·암반 4종과 정적 바다 심리스 수면을 평지와 같은 네이티브 1px 밀도로 보정하고 `mudflat` 비축·어살터·염부·갯벌 어부 자산을 회귀·빌드로 검증 |
| [디버그 치트 패널 설계](DESIGN-2026-08-03-debug-cheat-panel.md) | 완료 | 8개 섹션 백틱 토글 패널과 단일 조작 모듈 `game/debugActions`, DEV 게이트+지연 import로 프로덕션 무포함, `debugTouched` 표식과 모달·전투 중 파괴적 조작 잠금을 실기동·전용 회귀·빌드로 검증. 공성 강제 개시는 방어 개편 P5 이후, 저장 슬롯 표식 표시는 후속 |
| [밸런스 편집기 설계](DESIGN-2026-08-03-balance-editor.md) | 완료 | B1~B4 구현. 오버레이 병합(`balanceOverlay`+생성 `balanceOverrides`)을 config.ts·buildings.ts 본문에서 끝내 게임·테스트가 같은 값을 보고, 별도 앱 `edit:balance`가 CONFIG·BUILDING_DEFS 2219개 항목을 자동 폼·주석 동반·반영 시점 배지·변경 하이라이트로 편집한다. 흡수용 diff 내보내기 포함. 오버레이 프리셋과 리로드 없는 "다시 읽기"는 후속 |
| [채집 영역 체제 설계](DESIGN-2026-08-01-gathering-zones.md) | 완료 | G1~G4 완료. 작업영역·거점 배정·숙식 움막과 사냥터 비축 보정을 검증했으며, 어부의 영역·비축 편입은 통합 어장·어선 설계 F0~F4로 이관 |
| [방어 개편 설계](DESIGN-2026-08-01-defense-overhaul.md) | 완료 | P1~P5 완료. 성목 통과비 2.0배와 개방 우회 경로 1.1배 선택 비용으로 공성 유도를 소폭 강화하고 소규모 우회 성향은 유지. 지도 파생 성벽 단면·망루 사격·장기 공성·자동/수동 성벽전 단일 처리까지 구현·검증 |
| [튜토리얼 개편 구현계획](superpowers/plans/2026-07-31-tutorial-overhaul.md) | 완료 | M0~M6·R1~R8 반영. 겨울 점검 30/24일분을 권장선으로 전환하고 첫 겨울 지연·둘째 해 봄 복구와 v7 저장 호환을 회귀로 고정 |
| [튜토리얼 개편 착수 지시문](IMPLEMENTATION-2026-07-31-tutorial-overhaul.md) | 완료 | M0~M6·R1~R8 완료. 길잡이 v8에서 점검 미실시 겨울 자동 전환, 봄 진행 걸쇠, 통제 혹한 비재생과 17단계 완주 회귀를 갱신 |

## 역사 계획

이 절의 문서는 당시 구현 절차와 판단을 보존한다. 체크박스가 갱신되지 않은 문서는 현재 코드와
후속 통합 기록으로 상태를 판정했다.

| 문서 | 상태 | 현재 판정 |
|---|---|---|
| [Historical Style Board](superpowers/plans/2026-07-05-historical-style-board.md) | 완료 | folk warm 방향 선정과 역사 에셋 반영 |
| [Historical Character Atlas](superpowers/plans/2026-07-06-character-atlas-implementation.md) | 완료 | 성별 메타데이터·아틀라스·렌더 연결 완료 |
| [목책 연결과 문](superpowers/plans/2026-07-06-connected-palisade-and-gate.md) | 완료 | 연결 목책·통행 가능한 문·습격 차단 구현 |
| [조정 공물](superpowers/plans/2026-07-06-court-tribute.md) | 완료 | 격년 세공 납부와 조정 UI 구현 |
| [징집과 수비병 개명](superpowers/plans/2026-07-06-levy-and-defender-rename.md) | 완료 | 전 주민 징집 선택지와 표시명 변경 반영 |
| [민병 실제 전투](superpowers/plans/2026-07-06-militia-real-battle.md) | 완료 | 소집에서 실제 전투로 이어지는 흐름 구현 |
| [플레이어 주도 교역](superpowers/plans/2026-07-06-player-initiated-trade.md) | 완료 | 세력 탭·장터 거래 시작과 협상 구현 |
| [승격·화약 로드맵](superpowers/plans/2026-07-06-promotion-and-gunpowder-roadmap.md) | 완료 | 승격, 청원·화기, 화약·의심, 전투 연계까지 후속 구현됨 |
| [River Mask Tileset Builder](superpowers/plans/2026-07-06-river-mask-tileset-builder.md) | 완료 | 둑 마스크·폴백 시트를 유지하며 강 액체/결빙 심리스 바탕을 평지와 같은 네이티브 1px 밀도로 보정하고 기존 흐름 패스·자산 회귀·빌드 검증 |
| [Agent Loiter Farming](superpowers/plans/2026-07-07-agent-loiter-farming.md) | 완료 | 작업자가 지정 경작지에 머무는 동작과 테스트 반영 |
| [보 등급 해금](superpowers/plans/2026-07-07-bo-rank-unlocks.md) | 완료 | 보 등급 건물·직업 해금 구현 |
| [교량 등급](superpowers/plans/2026-07-07-bridge-tier.md) | 완료 | 교량 배치·등급 규칙 반영 |
| [건물 충돌 길찾기](superpowers/plans/2026-07-07-building-collision-pathfinding.md) | 완료 | 점유영역 충돌·길찾기 반영 |
| [건물 점유영역](superpowers/plans/2026-07-07-building-footprints.md) | 완료 | 다칸 건물 점유영역과 배치 규칙 구현 |
| [세력명 툴팁](superpowers/plans/2026-07-07-faction-name-tooltips.md) | 완료 | 세력 색상명·툴팁 구현 |
| [농지 식량 산출](superpowers/plans/2026-07-07-farm-food-yield.md) | 완료 | 농지 산출 조정 반영 |
| [진 등급 해금](superpowers/plans/2026-07-07-jin-rank-unlocks.md) | 완료 | 진 등급 건물·직업·나루 배치 구현 |
| [지도·숲 재생](superpowers/plans/2026-07-07-map-forest-regrowth.md) | 완료 | 지도 확장과 숲 재생 규칙 구현 |
| [민병 무기 시각화](superpowers/plans/2026-07-07-militia-weapon-visuals.md) | 완료 | 무기별 민병 스프라이트와 생산 연결 |
| [가공 비축량](superpowers/plans/2026-07-07-processing-reserves.md) | 완료 | 가공 중지선과 비축 조절 UI 구현 |
| [선택 대상 행동](superpowers/plans/2026-07-07-selection-actions.md) | 완료 | 선택 컨텍스트 행동과 탐사 연계 구현 |
| [탑다운 건물 재생성](superpowers/plans/2026-07-07-topdown-building-regeneration.md) | 완료 | 계절 건물 에셋과 렌더 연결 완료 |
| [성벽 계열 문](superpowers/plans/2026-07-08-wall-family-gate.md) | 완료 | 주민 통행·습격 차단·철거·UI 구현 |
| [모듈식 성벽 스프라이트](superpowers/plans/2026-07-08-wall-family-sprite-generation.md) | 완료 | 모듈 시트 생성·검증과 렌더 연결 완료 |
| [건물 작업자 슬롯](superpowers/plans/2026-07-09-building-worker-slots.md) | 완료 | 배정 모델·저장 마이그레이션·UI·생산 연결 완료 |
| [자원 물류·교역 개편](superpowers/plans/2026-07-10-resource-logistics-trade-overhaul.md) | 완료 | 자원 카탈로그, 물류, 소비, 연료·작물·의복, 가치 교역으로 후속 구현됨 |
| [전투 연출 로드맵](superpowers/plans/2026-07-13-battle-presentation-roadmap.md) | 완료 | 1차 연출 범위와 체크리스트 완료 |
| [공격 원정 전투](superpowers/plans/2026-07-13-offensive-expedition-battles.md) | 완료 | 산채·맹수 원정, 자동·직접 전투, 시뮬레이터까지 구현 |
| [전술 전투 검토 수정](superpowers/plans/2026-07-13-tactical-combat-review-fixes.md) | 완료 | Task 1~8·10과 무장 종류 무관 사냥꾼 준비 매복 회귀 보정 완료 |
| [가축·의원·귀순병·병종](superpowers/plans/2026-07-14-livestock-physician-defectors-units.md) | 일부 완료 | 가축·의원·귀순병·기마병은 구현, 팽배수 등 명시적 후속 범위가 남음 |
| [전술 진형·적 계책](superpowers/plans/2026-07-14-tactical-formation-and-enemy-plans.md) | 완료 | 3열 진형, 표적, 후방 교전, 적 계획이 후속 전술 단계에 통합됨 |
| [호랑이 몰이사냥](superpowers/plans/2026-07-14-tiger-hunt-encirclement-rework.md) | 완료 | 포위망·결정표·반격 창구와 전술 화면 구현 |
| [UI 재구성](superpowers/plans/2026-07-14-ui-reorganization.md) | 완료 | 건설 드로어·도킹 창·선택 바·통합 로그와 자원 상세 행·계산 수치·주민 역할 호칭 표시 안정화 완료 |
| [발효·김장](superpowers/plans/2026-07-15-fermentation-kimjang.md) | 완료 | 부패·보존·발효·장독대·김장 구현 |
| [논밭 드래그 크기](superpowers/plans/2026-07-17-farm-plot-drag-sizing.md) | 완료 | 가변 경작지·면적 노동·농우 연결 구현 |
| [이동식 관리 창](superpowers/plans/2026-07-17-floating-management-windows.md) | 완료 | 관리 창·미니맵·선택 컨텍스트까지 확장 완료 |
| [혼인·출산·성장](superpowers/plans/2026-07-17-marriage-birth-growth.md) | 완료 | 생애 주기·장례·소년 활동과 성장기 표시 나이·종교인 혼인 예외 구현. 소년 5직업 남녀 표준/HD I2V 완료, 어린이 전용 동작은 후속 |
| [런타임 성능 안정화](superpowers/plans/2026-07-17-runtime-performance-stabilization.md) | 완료 | 렌더 시계·viewport·탐사·광역 경로 최적화와 측정 기록 완료 |
| [만족도·종교](superpowers/plans/2026-07-17-satisfaction-religion.md) | 완료 | 두 종교·단일 후계 계보·2인 시설 슬롯·저장·명부/선택 UI와 일반 무당·승려·동자승 남녀 표준/HD idle·walk I2V 구현 |
| [은 화폐](superpowers/plans/2026-07-17-silver-currency.md) | 완료 | 확정 범위 G1~G2 완료, G3 상평통보는 의도적 비범위로 보류 |
| [특수 주민](superpowers/plans/2026-07-17-special-residents.md) | 일부 완료 | 공통 명부와 확정 주민은 구현, 추가 후보 S3는 남음 |
| [전술 확장 2단계 기준선](superpowers/plans/2026-07-19-tactical-combat-expansion-phase-2-baseline.md) | 완료 | Phase 0 golden·계약 기준선 확보 |
| [전술 확장 2단계](superpowers/plans/2026-07-19-tactical-combat-expansion-phase-2.md) | 완료 | 편성·배치·무대·경로·지원·보고 단계가 후속 커밋으로 통합됨 |
| [우회로 실전 무대](superpowers/plans/2026-07-21-tactical-route-battlefield-stage.md) | 완료 | 경로 배치·출입구·분할·합류와 전투 무대가 Phase 3에 통합됨 |
| [하루 생활 사이클 구현](superpowers/plans/2026-07-23-daily-cycle-implementation.md) | 완료 | M0~M7, 통합·성능 게이트, 2026-07-24 최종 감사 완료 |
