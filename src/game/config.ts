// 시뮬레이션 밸런스 값 모음 — 숫자 튜닝은 전부 여기서 한다.
import type { ProcessingInputId } from './types';

export const CONFIG = {
  map: {
    width: 56,
    height: 56,
  },

  time: {
    seasonDays: 12,           // 한 계절 길이(일)
    yearDays: 48,             // 1년 = 4계절
    // 하루당 실시간(ms). 밤낮 사이클을 느긋하게 볼 수 있도록 1배속을 8초/일로 늦췄다.
    // (3배 ≈ 2.7초/일, 10배 ≈ 0.8초/일로 빨리감기)
    msPerDay: { 1: 8000, 3: 2700, 10: 800 } as Record<number, number>,
  },

  start: {
    residents: 12,
    resources: {
      food: 100, firewood: 45, wood: 30, stone: 12, iron: 4, tools: 10,
      hide: 6, clothes: 12, herbs: 5, grain: 0, game: 0,
      gunpowder: 0, muskets: 0,
      reputation: 50, defense: 0,
    },
    // 시작 직업 구성
    jobs: {
      woodcutter: 2, hunter: 2, farmer: 2, builder: 2,
      hauler: 1, herbalist: 1, watchman: 1, idle: 1,
    } as Record<string, number>,
  },

  needs: {
    foodPerDay: 0.5,          // 1인당 하루 식량 소비
    hungerGainFed: 40,        // 식사 시 포만도 회복
    hungerLossUnfed: 30,      // 굶을 때 포만도 감소
    firewoodPerPerson: 0.12,  // 1인당 기본 장작 소비 (계절/날씨 배율 적용)
    clothesWearWinter: 0.02,  // 겨울철 1인당 옷 마모
    warmthLossWinterBase: 13, // 겨울 기본 체온 손실
    warmthRegenWarmSeason: 20,
    heatOndol: 12,            // 장작이 충분할 때 온돌집 난방량
    heatHut: 8,               // 초가집 난방량
    heatHomeless: 3,          // 노숙 난방량
    homelessLossMult: 1.7,
    noClothesLossMult: 0.9,   // 옷 없는 비율만큼 추가 손실 (×이 값)
  },

  health: {
    coldDamage: 5,        // 체온 25 미만
    freezeDamage: 10,     // 체온 10 미만
    hungryDamage: 4,      // 포만 25 미만
    starveDamage: 8,      // 포만 0
    sickDamage: 3,
    sickDamageWithHerbs: 1,
    naturalHeal: 2,
    sickBaseChance: 0.002,
    sickColdChance: 0.015,    // 체온 30 미만 추가
    sickSummerChance: 0.006,  // 여름 질병 위험 소폭 증가
    sickHungryChance: 0.01,
    recoverChance: 0.10,
    recoverChanceHerbs: 0.28,
    herbsPerSickPerDay: 0.5,
  },

  production: {
    woodPerDay: 1.3,
    gamePerDay: 0.9,
    herbsPerDay: 0.5,
    toolsPerDay: 1.0,
    ironMinePerDay: 0.8,
    fishPerDay: 1.4,
    haulerWoodToFirewood: 2.5, // 운반꾼 1인 하루 목재 가공량
    firewoodPerWood: 1.4,
    charcoalWoodPerDay: 2.2,    // 숯쟁이 1인 하루 목재 처리량
    charcoalFirewoodPerWood: 2.0,
    gunpowderPerDay: 0.9,
    gunpowderFirewoodPerPowder: 1.0,
    gunpowderStonePerPowder: 0.6,
    officeBonusPerClerk: 0.05,
    officeMaxBonus: 0.2,
    haulerGamePerDay: 2,       // 사냥감 손질량
    foodPerGame: 4,
    hidePerGame: 1,
    haulerGrainPerDay: 4,      // 운반꾼 1인 하루 곡물 도정량
    foodPerGrain: 1.5,         // 곡물 1 → 식량 1.5
    haulerStonePerDay: 0.4,    // 돌이 부족할 때 채석
    stoneReserveTarget: 40,
    woodReserve: 25,           // 건축용으로 남겨둘 목재 (이 이상만 장작으로 팬다)
    processingReserves: {
      wood: 25,
      grain: 0,
      game: 0,
      hide: 0,
      iron: 0,
    } as Record<ProcessingInputId, number>,
    tanneryHidePerDay: 2,      // 가죽공방 하루 가죽 소비 (가죽 2 → 옷 1)
    fieldGrainYield: 36,       // 밭 1개가 만작일 때 곡물 수확량
    fertileBonus: 1.3,
    lumberCampBonus: 1.4,
    huntLodgeBonus: 1.5,
    herbHutBonus: 1.6,
    toolWearPerWorker: 0.015,  // 생산직 1인당 하루 도구 마모
    skillGainPerDay: 0.012,
    skillEffect: 0.5,          // 숙련 1.0일 때 생산 +50%
  },

  // 주민 에이전트 (이동/작업/운반)
  agents: {
    subticksPerDay: 8,        // 하루를 나누는 서브틱 수
    moveSpeed: 2,             // 서브틱당 이동 타일 수
    moveSpeedWinter: 1.5,     // 겨울 눈길
    moveSpeedSnow: 1,         // 폭설/눈보라
    shelterThreshold: 0.3,    // 실외작업 중단 기준 (날씨 효율이 이 밑이면 대피)
    carryCap: { wood: 4, game: 2, herbs: 1.5, iron: 3, stone: 3, grain: 6, food: 5, hide: 2 },
    work: {                   // 작업지에서 1회 채집에 드는 서브틱
      chop: 3, hunt: 5, herb: 3, mine: 4, quarry: 3, fish: 4,
      herd: 5,
      harvestPerSubtick: 8,   // 가을 수확: 서브틱당 깎는 성장도
      growPerSubtick: 1.4,    // 봄여름 농사: 서브틱당 올리는 성장도
      buildPerSubtick: 0.2,   // 건축가 서브틱당 공정 (건축가-일 환산)
    },
    yields: {                 // 1회 채집으로 지는 짐
      wood: 1.1, game: 0.75, herbs: 0.55, iron: 1.2, mineStone: 0.4, stone: 1.1, fish: 1.2,
      herdFood: 1, herdHide: 0.25,
    },
    forestDepleteChance: 0.12, // 벌목 1회당 숲이 평지가 될 확률
    forestRegrowChance: 0.003,  // 봄여름, 숲 인접 평지가 숲이 될 하루 확률
    forestPioneerChance: 0.00018, // 봄여름, 고립된 평지에 새 숲 씨앗이 들 확률
    // 사냥 수확 배율 — 짐승 서식지(숲 덩어리)가 클수록 사냥감이 풍부하다
    hunting: {
      habitatYieldBase: 0.8,     // 서식지 기본
      habitatYieldPerTile: 0.012, // 서식지 숲 1타일당 가산 (숲 50타일에서 최대치)
      habitatYieldMax: 1.4,
    },
  },

  seasons: {
    firewoodMult: { spring: 1, summer: 0.6, autumn: 1.5, winter: 3 },
    woodMult:     { spring: 1, summer: 1.3, autumn: 1.1, winter: 0.7 },
    gameMult:     { spring: 1.25, summer: 1, autumn: 1.1, winter: 0.5 },
    fishMult:     { spring: 1.2, summer: 1.15, autumn: 0.9, winter: 0.45 },
  },

  weather: {
    // 계절별 날씨 확률 (합 1)
    table: {
      spring: { clear: 0.5, rain: 0.25, frost: 0.1, thawFlood: 0.1, heavySnow: 0.05, blizzard: 0, coldSnap: 0 },
      summer: { clear: 0.65, rain: 0.3, frost: 0.05, thawFlood: 0, heavySnow: 0, blizzard: 0, coldSnap: 0 },
      autumn: { clear: 0.5, rain: 0.2, frost: 0.2, heavySnow: 0.1, blizzard: 0, coldSnap: 0, thawFlood: 0 },
      winter: { clear: 0.35, frost: 0.15, heavySnow: 0.2, blizzard: 0.15, coldSnap: 0.15, rain: 0, thawFlood: 0 },
    } as Record<string, Record<string, number>>,
    outdoorMult: { clear: 1, rain: 0.8, frost: 0.9, heavySnow: 0.5, blizzard: 0.15, coldSnap: 0.6, thawFlood: 0.5 },
    firewoodMult: { clear: 1, rain: 1.1, frost: 1.2, heavySnow: 1.4, blizzard: 1.8, coldSnap: 1.7, thawFlood: 1 },
    warmthLossMult: { clear: 1, rain: 1.05, frost: 1.2, heavySnow: 1.3, blizzard: 1.8, coldSnap: 1.7, thawFlood: 1 },
  },

  threat: {
    basePerDay: 0.5,
    coldSeasonExtra: 0.7,      // 가을/겨울 추가 증가
    wealthExtra: 0.25,         // 식량+가죽 비축이 많을 때
    wealthThreshold: 160,
    perWatchman: 0.08,         // 파수꾼 1인당 감소
    defenseFactor: 500,        // 방어도/이 값 만큼 매일 감소
    lowRepExtra: 0.2,          // 명성 35 미만
    tradeRefusedExtra: 0.6,    // 교역 거절 여파 기간 동안
    raidThreshold: 60,
    raidChanceDiv: 180,        // (위협-60)/이 값 = 일일 습격 확률
    afterRaidThreat: 20,
    raidCooldownDays: 10,
    earlyWarnChance: 0.65,     // 봉수대/망루 보유 시 조기 경보 확률
    earlyWarnLeadDays: 2,
  },

  raid: {
    basePower: 22,
    powerPerYear: 8,
    powerYearCap: 8,   // 연차 스케일 상한 — 승격 후 장기전에서 습격이 무한정 세지지 않게
    powerRandom: 15,
    wealthPowerDiv: 60,
    watchmanDefense: 6,
    militiaDefense: 12,
    musketDefense: 18,         // 조총으로 무장한 수비병 1인당 방어 기여 (화약이 있을 때만)
    powderPerMusket: 0.4,      // 교전당 조총 1정 화약 소모
    powderPerCannon: 2,        // 교전당 불랑기포 1문 화약 소모
    cannonBattleMult: 1.2,     // 포대 가동 시(화약 보유) 전투 방어 배율
    levyDefensePerResident: 4, // 징집된 일반 주민 1인당 방어 기여 (수비병 12, 파수꾼 6과 비교)
    warnedDefenseMult: 1.25,
    // 지도 위 습격 무리 이동
    raiderSpeedWarned: 1.2,   // 경보된 습격: 천천히 접근 (대비 시간)
    raiderSpeedSurprise: 2.0, // 기습: 빠르게 들이닥침
    spotDistance: 12,         // 이 거리 안이면 경계병이 발견 로그를 띄움
    arriveDistance: 2,        // 중심지에서 이 거리면 위기 이벤트 발생
    siegeDefenseMult: 1.15,   // 목책이 무리를 막아섰을 때 방어 보정
  },

  trade: {
    minIntervalDays: 14,
    dailyChance: 0.07,
    minRelationToTrade: 35, // 이보다 관계가 나쁘면 먼저 청해도 상대해 주지 않는다
    playerCooldownDays: 6,  // 플레이어 주도 교역의 세력별 간격 (교환비 고정이라 반복 차익 방지)
    dockOfferScale: 1.5,
    dockPlayerCooldownDays: 4,
  },

  // 조정 세공(歲貢) — 봄 첫날 공지, 겨울 첫날 수거.
  // 겨울 생존 필수품(식량·장작)은 걷지 않는다. 곡물만 식량 경로와 겹치는 의도된 압박(밭 확장 동기).
  tribute: {
    baseAmounts: { hide: 8, grain: 25, iron: 3, clothes: 6, herbs: 6 }, // 품목별 기준량
    yearScale: 0.3,        // 연차당 요구량 증가 (1 + 0.3×(연차-1))
    popScaleBase: 0.7,     // 인구 배율 = 0.7 + 인구/40
    popScaleDiv: 40,
    repPaid: 6,            // 납부 시 명성
    repFail: 12,           // 미납 시 명성 하락
    repFailStreakExtra: 8, // 2년 연속 미납 시 추가 하락 (합계 -20)
    threatFail: 8,         // 미납 시 위협도 상승
    rewardTools: 2,        // 격년 하사품 (도구 또는 옷, 결정적 롤)
    rewardClothes: 3,
  },

  // 세력별 우호도 증감
  relations: {
    driftFactor: 0.01,     // 하루에 기본 성향 쪽으로 1%씩 수렴
    tradeAccept: 4,
    tradeDecline: -3,
    tribute: 6,            // 공물을 바치면 그 세력과의 관계 개선
    negotiateSuccess: 8,
    negotiateFail: -5,
    militiaWin: -6,        // 물리치면 원한이 남는다
    militiaLoss: -2,
    shelter: -1,
    beacon: -2,
    lowRelThreatBelow: 45, // 적대 세력 평균 관계가 이보다 낮으면 위협도 가산
    lowRelThreatScale: 0.02,
  },

  immigration: {
    dailyChance: 0.12,
    minFoodPerPerson: 8,
    minMorale: 45,
    groupMin: 2,
    groupMax: 5,
  },

  // 난이도별 보정 (메인 메뉴에서 선택)
  // habitatChance: 숲 덩어리마다 짐승 서식지가 자리 잡을 확률 — 어려울수록 사냥감이 귀하다
  difficulty: {
    easy: {
      name: '이주민', tag: '수월',
      desc: '물자가 넉넉하고 국경이 비교적 조용합니다. 처음 오는 이에게.',
      startRes: 1.5, threatGain: 0.7, raidPower: 0.8, habitatChance: 0.85,
    },
    normal: {
      name: '개척민', tag: '표준',
      desc: '설계된 기본 난이도. 첫 겨울과 첫 습격이 당신을 시험합니다.',
      startRes: 1, threatGain: 1, raidPower: 1, habitatChance: 0.65,
    },
    hard: {
      name: '변방 첨사', tag: '혹한',
      desc: '물자가 빠듯하고 습격이 사납습니다. 국경의 겨울은 자비가 없습니다.',
      startRes: 0.7, threatGain: 1.35, raidPower: 1.25, habitatChance: 0.45,
    },
  },

  // 보(堡) 승격 조건 — 첫 승격. (예전의 "승리 조건" — 이제 끝이 아니라 첫 계단이다)
  victory: {
    years: 5,
    population: 40,
    maxWinterDeathRate: 0.10,
    defense: 100,
    food: 100,
    firewood: 100,
  },

  // 조정 청원 — 명성을 소모해 조정 지원 물자를 받는다 (승격 단계 ≥ 보, 계절당 1회)
  petition: {
    cooldownDays: 12,  // 분기(계절)당 1회
    // 진(鎭) 이상은 봄마다 화약이 소량 정기 지급된다 (의도적으로 부족하게 — 단계 3의 긴장 기반)
    yearlyPowder: { settlement: 0, bo: 0, jin: 2, bu: 4 },
    luxuryMorale: 15,  // 사치품(비단·소금) 하사 시 전 주민 사기 상승
  },

  // 모반 의심 — "변방 수령이 딴마음을 품었는가". 화약 자급은 강하지만 몰래 해야 하는 것.
  suspicion: {
    // ── 일일 상승 요인 ──
    perNitreYard: 0.5,        // 가동 중인 염초장 1곳당
    stockThreshold: 15,       // 화약+조총 비축이 이보다 많으면 (조정 하사량을 크게 넘는 수준)
    stockExtra: 0.15,
    perInitiatedTrade: 0.08,  // 최근 한 계절 안에 먼저 청한 교역 1건당 (상대가 온 제안은 무혐의)
    tradeWindowDays: 12,
    cozyRelationAbove: 75,    // 이 관계 이상인 북방 세력마다 (적대 성향은 2배)
    perCozyFaction: 0.06,
    // ── 감소 ──
    baseDecay: 0.25,          // 하루 자연 감소
    tributeDecay: 6,          // 세공 납부 시 즉시
    petitionDecay: 3,         // 청원 수령 시 즉시 (조정과의 접촉)
    // ── 감찰 어사 (40+) ──
    inspectionAt: 40,
    inspectionChance: 0.15,   // 구간 내 일일 확률
    inspectionCooldownDays: 24,
    bribeCost: { food: 25, hide: 8 },
    bribeDecay: 15,
    hideDays: 6,              // 은닉: 염초장 가동 중지 일수
    hideDecay: 8,
    honestBase: 0.35,         // 정직: 성공 기본 확률 (+ 명성/200, 비축 초과 시 -0.2)
    honestSuccessDecay: 25,
    honestFailRise: 10,
    // ── 조정 견책 (70+) ──
    censureAt: 70,
    censureRep: 20,
    censureSeizeRatio: 0.5,   // 화약·조총 몰수 비율
    // ── 강등·토벌 (100) ──
    crackdownGraceDays: 24,   // 유예 두 계절
    crackdownClearBelow: 60,  // 유예 중 이 밑으로 내리면 토벌 취소 (이 값 이상이면 승격도 없음)
    crackdownStartSuspicion: 80, // 강등 직후 의심 값 (유예 중 내릴 수 있게)
    crackdownPower: 160,      // 토벌군 규모 — 어떤 습격보다 크다
  },

  // 승격 사다리 — 개척지 → 보(堡) → 진(鎭) → 부(府). 부 승격이 최종 승리.
  ranks: {
    promotionReputation: 10, // 승격 시 명성 보너스
    // 보 승격 조건은 victory 섹션을 그대로 쓴다. 이후 단계는 아래 조건.
    jin: {
      population: 60, defense: 160, tributeYears: 3,
      buildings: { garrison: 1, watchtower: 2 },
    },
    bu: {
      population: 100, defense: 250, tributeYears: 5,
      buildings: { garrison: 1, watchtower: 3, market: 1 },
    },
    // 승격 효과 배율 — 이주민 유입 / 위협 증가(부유해질수록 노려진다) / 세공 요구량
    effects: {
      settlement: { immigration: 1,    threatGain: 1,    tribute: 1 },
      bo:         { immigration: 1.25, threatGain: 1.15, tribute: 1.3 },
      jin:        { immigration: 1.5,  threatGain: 1.3,  tribute: 1.7 },
      bu:         { immigration: 1.75, threatGain: 1.45, tribute: 2.2 },
    },
  },

  ui: {
    logLimit: 120,
    tileSize: 28, // 지도 칸 픽셀 크기 (렌더/히트판정 전부 이 값을 따른다). 지도는 드래그로 이동.
  },
} as const;

export type Config = typeof CONFIG;
