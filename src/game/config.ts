// 시뮬레이션 밸런스 값 모음 — 숫자 튜닝은 전부 여기서 한다.
import type { ProcessingInputId, Rank, ResourceId, Season } from './types';

export const CONFIG = {
  map: {
    width: 72,
    height: 72,
  },

  minerals: {
    stoneMin: 120,
    stoneMax: 180,
    ironMin: 100,
    ironMax: 140,
    legacyStone: 150,
    legacyIron: 120,
    nearbyStone: 36,
    nearbyIron: 16,
    nearbyMinDistance: 4,
    nearbyMaxDistance: 7,
  },

  time: {
    seasonDays: 12,           // 한 계절 길이(일)
    yearDays: 48,             // 1년 = 4계절
    // 하루당 실시간(ms). 밤낮 사이클을 느긋하게 볼 수 있도록 1배속을 8초/일로 늦췄다.
    // (3배 ≈ 2.7초/일, 10배 ≈ 0.8초/일로 빨리감기)
    msPerDay: { 1: 8000, 3: 2700, 10: 800 } as Record<number, number>,
  },

  exploration: {
    residentRadius: 7,
    buildingRadius: 9,
    nightMult: 0.7,
    weatherMult: {
      clear: 1,
      rain: 0.85,
      frost: 0.9,
      heavySnow: 0.7,
      blizzard: 0.45,
      coldSnap: 0.75,
      thawFlood: 0.85,
    },
  },

  start: {
    residents: 12,
    resources: {
      grain: 100, rice: 0, meat: 0, fish: 0, vegetables: 0,
      brushwood: 12, firewood: 45, charcoal: 0,
      wood: 30, stone: 12, iron: 4, tools: 10, carts: 0,
      hide: 6, hideClothes: 12, cotton: 0, cottonClothes: 0, herbs: 5,
      porcelain: 0, brassware: 0, lacquerware: 0, silk: 0, preciousMetal: 0,
      gunpowder: 0, spears: 0, hornBows: 0, muskets: 0,
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
    heatHut: 11,              // 초가집 난방량 — 평시 겨울은 안정적으로 버티되 혹한에는 여전히 취약
    heatHomeless: 3,          // 노숙 난방량
    homelessLossMult: 1.7,
    noClothesLossMult: 0.9,   // 옷 없는 비율만큼 추가 손실 (×이 값)
    monotonyMoralePenalty: 8,
    vegetableShortageHealthPenalty: 1,
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
    poorDietDamage: 1,
  },

  foreignSites: {
    minCenterDistance: 16,
    minSiteSpacing: 11,
    minRaidOriginDistance: 14,
    passageDays: 48,
    passageRevealRadius: 1,
    passageTradeCapacityMult: 1.2,
    passageTradeCooldownReduction: 2,
    huntingRightsDays: 48,
    passageGiftGrain: 8,
    huntingGiftGrain: 10,
    highTrustHuntingGiftGrain: 5,
    giftGoodwill: 10,
    giftRelation: 3,
    giftFavor: 1,
    claimDailyInterval: 6,
    violationWarningDelay: [2, 4] as const,
    violationCompensationGrain: 8,
    violationCompensationRelation: -1,
    violationApologyRelation: -3,
    violationIgnoreRelation: -8,
    banditScoutWarningBonus: 0.25,
    lairSuppressionDays: 18,
    banditLairScouting: {
      baseChance: 0.28,
      hunterBonus: 0.09,
      watchmanBonus: 0.07,
      militiaBonus: 0.06,
      maxHunters: 4,
      maxWatchmen: 3,
      maxMilitia: 3,
      alarmPenaltyPerPoint: 0.003,
      repeatAttemptPenalty: 0.06,
      blizzardPenalty: 0.24,
      coldSnapPenalty: 0.12,
      minChance: 0.12,
      maxChance: 0.92,
      successAlarm: 4,
      failureAlarm: 12,
      repeatedFailureAlarm: 4,
      intelDays: 48,
    },
    banditLairDefense: {
      doctrineReviewIntervalDays: 24,
      doctrineChangeChance: 0.65,
      baseStratagemPoints: 1,
      alarmPerPoint: 25,
      maxAlarmPoints: 4,
      scoutFailurePoints: 1,
      maxScoutFailurePoints: 2,
      assaultDefeatPoints: 1,
      maxAssaultDefeatPoints: 2,
      militaryPowerPerPoint: 40,
      maxMilitaryPowerPoints: 2,
      maxStratagemPoints: 8,
      pointEffectStep: 0.06,
      maxPointEffectBonus: 0.3,
      groupPowerShares: {
        base: {
          sentries: 0.10,
          trailArchers: 0.06,
          wallSpears: 0.11,
          wallArchers: 0.16,
          yardVanguard: 0.20,
          yardSkirmishers: 0.11,
          leaderGuard: 0.14,
          keepArchers: 0.07,
          leaderEscapeGroup: 0.05,
        },
        doctrineShift: {
          trailAttrition: {
            sentries: 0.02, trailArchers: 0.01, wallSpears: 0, wallArchers: 0,
            yardVanguard: -0.02, yardSkirmishers: 0, leaderGuard: -0.01,
            keepArchers: 0, leaderEscapeGroup: 0,
          },
          wallHold: {
            sentries: 0, trailArchers: 0, wallSpears: 0.015, wallArchers: 0.02,
            yardVanguard: -0.015, yardSkirmishers: 0, leaderGuard: -0.01,
            keepArchers: -0.01, leaderEscapeGroup: 0,
          },
          leaderEscape: {
            sentries: -0.01, trailArchers: 0, wallSpears: -0.01, wallArchers: -0.01,
            yardVanguard: -0.005, yardSkirmishers: 0, leaderGuard: 0.015,
            keepArchers: 0, leaderEscapeGroup: 0.02,
          },
        },
      },
      trailAttrition: {
        trailDefenseBonus: 2,
        sentryCombatBonus: 0.02,
      },
      wallHold: {
        wallDefenseBonus: 2,
        wallCombatBonus: 0.02,
        innerDefensePenalty: 4,
      },
      leaderEscape: {
        keepEscapeChance: 0.62,
        moraleEscapeChance: 0.43,
        preparedBlockEffectiveness: 0.95,
        preRemovedLootDamage: 1,
      },
    },
  },

  specialEvents: {
    secondEventChance: 0.5,
    wolfWeight: 5,
    tigerWeight: 2,
    ginsengWeight: 2,
    boarWeight: 4,
    plagueWeight: 3,
    grainRequisitionWeight: 2,
    shipwreckWeight: 2,
    earlyFrostWeight: 3,
    gyrfalconWeight: 1.5,
    wolfCooldownDays: 48,
    tigerCooldownDays: 96,
    ginsengCooldownDays: 96,
    boarCooldownDays: 48,
    plagueCooldownDays: 72,
    grainRequisitionCooldownDays: 72,
    shipwreckCooldownDays: 72,
    earlyFrostCooldownDays: 48,
    gyrfalconCooldownDays: 144,
    wolfThreatDays: [12, 18] as const,
    tigerThreatDays: [18, 24] as const,
    wolfForestEncounterChance: 0.06,
    tigerForestEncounterChance: 0.05,
    tigerNightEncounterChance: 0.025,
    wolfEncounterDeathChance: 0.005,
    tigerEncounterDeathChance: 0.025,
    wolfHuntDeathChance: 0.02,
    tigerHuntDeathChance: 0.08,
    wolfBaitMeat: 6,
    boarThreatDays: [12, 18] as const,
    boarInitialCropLoss: 0.12,
    boarCropDamageChance: 0.32,
    boarStoredFoodDamageChance: 0.22,
    boarTrapWood: 8,
    boarTrapTools: 1,
    boarTrapSuccessChance: 0.72,
    plagueRealChance: 0.42,
    plagueIsolationDays: 7,
    plagueObservationDays: 3,
    epidemicDays: [10, 14] as const,
    epidemicSpreadChance: 0.24,
    epidemicDeathChance: 0.018,
    physicianReputationCost: 6,
    physicianGrainCost: 18,
    physicianHerbCost: 8,
    gyrfalconWarningBonus: 0.25,
    ginsengTradeValue: 24,
    tigerPeltTradeValue: 18,
  },

  production: {
    woodPerDay: 1.3,
    gamePerDay: 0.9,
    herbsPerDay: 0.5,
    foragedVegetablesPerHerb: 2.5, // 약초 채집 1당 야생과일·버섯·산나물
    toolsPerDay: 1.0,
    cartsPerDay: 0.2,
    cartWoodPerUnit: 6,
    cartIronPerUnit: 3,
    cartToolsPerUnit: 1,
    spearsPerDay: 0.8,
    spearIronPerUnit: 1.0,
    spearWoodPerUnit: 0.6,
    hornBowsPerDay: 0.55,
    hornBowWoodPerUnit: 1.0,
    hornBowHidePerUnit: 0.5,
    musketsPerDay: 0.35,
    musketIronPerUnit: 1.4,
    musketWoodPerUnit: 0.8,
    musketToolsPerUnit: 0.45,
    ironMinePerDay: 0.8,
    fishPerDay: 1.4,
    brushwoodPerWood: 0.35,
    firewoodWoodPerDay: 2.5,
    firewoodPerWood: 1.4,
    charcoalWoodPerDay: 2.2,    // 숯쟁이 1인 하루 목재 처리량
    charcoalPerWood: 1.4,
    gunpowderPerDay: 0.9,
    gunpowderFirewoodPerPowder: 1.0,
    gunpowderStonePerPowder: 0.6,
    officeBonusPerClerk: 0.05,
    officeMaxBonus: 0.2,
    meatPerGame: 4,
    hidePerGame: 1,
    millerRicePerDay: 4,       // 방아꾼 1인 하루 벼 도정량
    grainPerRice: 1.5,         // 벼 1 → 먹을 수 있는 곡물 1.5
    haulerStonePerDay: 0.4,    // 돌이 부족할 때 채석
    stoneReserveTarget: 40,
    woodReserve: 25,           // 건축용으로 남겨둘 목재 (이 이상만 장작으로 팬다)
    processingReserves: {
      wood: 25,
      rice: 0,
      hide: 0,
      iron: 0,
    } as Record<ProcessingInputId, number>,
    tanneryHidePerDay: 2,      // 가죽공방 하루 가죽 소비 (가죽 2 → 옷 1)
    weaverCottonPerDay: 2,
    cottonClothesPerCotton: 0.5,
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
    carryCap: {
      grain: 6, rice: 6, meat: 5, fish: 5, vegetables: 5,
      brushwood: 4, firewood: 4, charcoal: 3, wood: 4,
      stone: 3, iron: 3, hide: 2, cotton: 3, herbs: 1.5,
    },
    haulerCarryCap: 10,       // 운반꾼 전용 적재량 (채석 귀환에도 사용)
    haulerBatchMin: 2,        // 평시 소량 왕복을 막는 작업장 최소 수거량
    haulerQuarryBatchMin: 6,  // 돌 비축 부족 시 이만큼 모인 짐만 채석을 중단하고 수거
    haulerCartCarryCap: 24,   // 수레 장비 운반꾼 적재량
    haulerCartBatchMin: 8,
    haulerCartQuarryBatchMin: 14,
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
    firewoodMult: { spring: 0.9, summer: 0.5, autumn: 1.35, winter: 3 },
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
    maxDefenseThreatReduction: 0.35, // 높은 방어도가 습격 발생 자체를 완전히 지우지 못하게 하는 일일 상한
    lowRepExtra: 0.2,          // 명성 35 미만
    tradeRefusedExtra: 0.6,    // 교역 거절 여파 기간 동안
    raidThreshold: 60,
    raidChanceDiv: 140,        // (위협-60)/이 값 = 일일 습격 확률
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
    spearDefense: 14,          // 창으로 무장한 수비병 1인당 방어 기여
    hornBowDefense: 16,        // 각궁으로 무장한 수비병 1인당 방어 기여
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
    arriveDistance: 6,        // 중심지에서 이 거리면 대응 선택 모달 발생
    siegeDefenseMult: 1.15,   // 목책이 무리를 막아섰을 때 방어 보정
    victoryInjuryChance: { garrison: 0.35, levy: 0.6 },
    defeatDeathRate: { garrison: 0.12, levy: 0.12 }, // 패배 시 전투 참가자 1인당 전사 확률
    buildingDamage: {
      shelter: 1,
      villageVictory: 1,
      interceptDefeat: 2,
      villageDefeat: 3,
    },
    repairProgressMin: 0.35,  // 파손 직후 남는 공정률 하한
    repairProgressMax: 0.6,   // 파손 직후 남는 공정률 상한
  },

  tacticalBattle: {
    maxRounds: 5,
    hunt: {
      maxEngagements: 5,
      baitMeatCost: 3,
      ambush: {
        tigerHitChance: { base: 0.68, min: 0.46, max: 0.92 },
        wolfHitChance: {
          base: 0.31,
          packThreshold: 3,
          perExtraBeast: 0.035,
          min: 0.28,
          max: 0.64,
        },
        spearWallMultiplier: { tiger: 0.38, wolf: 0.55 },
        splitDriversHitMultiplier: 1.35,
        multipleLossChance: {
          tiger: 0.12,
          greatTiger: 0.30,
          mountainLord: 0.54,
          wolfMediumPackThreshold: 7,
          wolfMediumPack: 0.12,
          wolfLargePackThreshold: 9,
          wolfLargePack: 0.28,
        },
        deathChance: {
          tigerBase: 0.15,
          tigerMin: 0.10,
          tigerMax: 0.28,
          wolfBase: 0.045,
          wolfPerBeast: 0.006,
          wolfMin: 0.06,
          wolfMax: 0.12,
        },
      },
      encirclement: {
        baseGain: 7,
        perDriver: 1.8,
        hunterSkillMultiplier: 12,
        wolfBaseMultiplier: 1.16,
        wolfPackThreshold: 3,
        wolfPenaltyPerExtraBeast: 0.038,
        wolfMinMultiplier: 0.82,
        wolfMaxMultiplier: 1.16,
        splitDriversMultiplier: 1.42,
        fallbackMultiplier: 0.55,
        movedDriveMultiplier: 0.5,
        minimumGain: 2,
      },
      beastAI: {
        corneredEncirclement: 100,
        breakoutEncirclement: 65,
        breakoutBlockadeMax: 24,
        woundedPowerShare: 0.45,
        ambushDecisionChance: 0.72,
        ambushExposureThreshold: {
          wolf: 30,
          tiger: 28,
          greatTiger: 34,
          mountainLord: 40,
        },
        exposure: {
          perMember: 2,
          meleeBonus: 10,
          spearWallBonus: 18,
          baitPenalty: 12,
          trapBonus: 15,
        },
      },
      sectors: {
        blockadeThreshold: 6,
        holeGainMultiplier: 0.5,
        openEscapeRounds: 2,
        openEscapeEncirclementMin: 35,
        openEscapeChance: 0.35,
      },
      search: {
        baseChance: 0.16,
        perDriveGroup: 0.08,
        perHunterGroup: 0.12,
        hunterSkillMultiplier: 0.24,
        minChance: 0.08,
        maxChance: 0.92,
      },
      breakout: {
        baseSuccessChance: 0.68,
        blockadePenaltyPerPower: 0.018,
        minSuccessChance: 0.08,
        maxSuccessChance: 0.90,
      },
      counterAttack: {
        sameSectorMultiplier: 1.45,
        adjacentSectorMultiplier: 0.72,
        specialistMultiplier: 1.15,
        searchRevealMultiplier: 0.9,
      },
      rehideChance: { tiger: 0.46, greatTiger: 0.38, mountainLord: 0.30 },
      rehideEncirclementMax: 70,
    },
    raiderPowerPerFighter: 4,
    formationExposure: {
      ambushed: 0.55,
      frontal: {
        chargingRanged: 1.7,
        meleeScreenedRanged: 0.42,
        lineScreened: 0.72,
        exposedRanged: 1.45,
        screeningMelee: 1.25,
        exposed: 1,
      },
      rearAssault: {
        adjacentProtected: 0.85,
        deepProtected: 0.5,
        guardedMelee: 1.65,
        guardedRanged: 0.48,
        exposedRanged: 2.2,
        exposedCivilian: 1.8,
        exposedOther: 1.45,
        middleGuardStrength: 0.55,
        unguardedAttackerLossMultiplier: 0.55,
      },
    },
    targeting: {
      musketLineEfficiency: { front: 1, middle: 1, rear: 0 },
      musketScreenedEfficiency: 0.65,
      musketPreparedScreenedEfficiency: 0.8,
      bowLineEfficiency: { front: 1, middle: 0.9, rear: 0.75 },
      concentration: { melee: 0.85, musket: 0.8, bow: 0.65 },
      maxFocusedLossShare: 0.7,
    },
    prep: {
      surpriseBase: 1,
      warned: 3,
      beacon: 1,
      watchtowerMax: 2,
      watchmenPerPoint: 2,
      watchmenMax: 2,
      severeWeatherPenalty: 1,
      max: 8,
    },
    groupPower: {
      militiaMusket: 18,
      militiaBow: 16,
      militiaSpear: 14,
      militiaUnarmed: 9,
      watchman: 6,
      hunter: 8,
      civilian: 1,
    },
    raiderSplit: { main: 0.55, looters: 0.25, flankers: 0.2 },
    enemyPlan: {
      objectiveActivationRelation: { default: 50, nimacha: 45, holaon: 35, bandit: 25, court: 50 },
      objectiveWeights: {
        default: { breakthrough: 0.45, plunder: 0.35, arson: 0.2 },
        nimacha: { breakthrough: 0.35, plunder: 0.45, arson: 0.2 },
        holaon: { breakthrough: 0.45, plunder: 0.35, arson: 0.2 },
        bandit: { breakthrough: 0.25, plunder: 0.55, arson: 0.2 },
        court: { breakthrough: 0.7, plunder: 0.1, arson: 0.2 },
      },
      objectivePowerBreakthroughBonus: 0.65,
      objectiveLowPowerPlunderBonus: 0.25,
      objectiveHostilityArsonBonus: 0.8,
      objectiveProfiles: {
        breakthrough: {
          raiderSplit: { main: 0.55, looters: 0.25, flankers: 0.2 },
          lootRoundsToExit: 2,
          damageToExit: Number.POSITIVE_INFINITY,
        },
        plunder: {
          raiderSplit: { main: 0.4, looters: 0.4, flankers: 0.2 },
          lootRoundsToExit: 1,
          damageToExit: Number.POSITIVE_INFINITY,
        },
        arson: {
          raiderSplit: { main: 0.45, looters: 0.2, flankers: 0.35 },
          lootRoundsToExit: 2,
          damageToExit: 2,
        },
      },
      stratagemPoints: {
        factionBase: { default: 2, nimacha: 2, holaon: 2, bandit: 2, court: 3 },
        powerPerPoint: 70,
        maxPowerBonus: 2,
        hostilityBonusAt: 10,
        grudgeBonusAt: 20,
        max: 7,
      },
      stratagemCosts: {
        rearManeuver: 2,
        wallBreakers: 2,
        fireArrows: 3,
        feint: 2,
        nightApproach: 2,
      },
      objectiveCandidates: {
        breakthrough: ['wallBreakers', 'feint', 'nightApproach', 'fireArrows'],
        plunder: ['feint', 'nightApproach', 'wallBreakers', 'fireArrows'],
        arson: ['fireArrows', 'nightApproach', 'feint', 'wallBreakers'],
      },
      maxStratagems: 3,
      counteredEffectScale: 0.4,
      counterStrength: {
        preparation: 0.6,
        intelFull: 1,
        formationCurveExponent: 1,
      },
      effects: {
        rearManeuver: { counteredCombatPenalty: 0.25 },
        wallBreakers: { wallPressureBonus: 10, lossResistancePenalty: 0.2 },
        fireArrows: { pressureBonus: 8, buildingDamageChance: 0.35 },
        feint: { powerShift: 0.14, estimatedMainMultiplier: 1.25 },
        nightApproach: { prepPointPenalty: 1, rangedEfficiencyPenalty: 0.3, firstRoundMoraleBonus: 8 },
      },
    },
    morale: { village: 70, warnedBonus: 8, siegeBonus: 4, raiders: 72 },
  },

  trade: {
    minIntervalDays: 14,
    dailyChance: 0.07,
    minRelationToTrade: 35, // 이보다 관계가 나쁘면 먼저 청해도 상대해 주지 않는다
    playerCooldownDays: 6,  // 플레이어 주도 교역의 세력별 간격 (교환비 고정이라 반복 차익 방지)
    dockOfferScale: 1.5,
    dockPlayerCooldownDays: 4,
    incomingOfferPremium: 1.25,
    haggleMarginStep: 0.1,
    maxHaggleRounds: 2,
    counterTolerance: 1.45,
    capacityBase: {
      grain: 28, rice: 24, meat: 16, fish: 18, vegetables: 14,
      brushwood: 24, firewood: 20, charcoal: 12,
      wood: 24, stone: 20, iron: 9, tools: 6, carts: 2,
      hide: 14, hideClothes: 7, cotton: 12, cottonClothes: 7, herbs: 10,
      gunpowder: 4, spears: 6, hornBows: 4, muskets: 3,
      porcelain: 5, brassware: 5, lacquerware: 5, silk: 4, preciousMetal: 3,
      reputation: 0, defense: 0,
    } as Record<ResourceId, number>,
    capacitySeasonMult: {
      spring: {
        grain: 0.65, rice: 0.55, fish: 1.25, vegetables: 0.85,
        brushwood: 1.1, wood: 1.05, herbs: 1.25,
      },
      summer: {
        grain: 0.85, rice: 0.9, meat: 1.1, fish: 1.2, vegetables: 1.4,
        brushwood: 1.2, firewood: 1.1, wood: 1.15, herbs: 1.4,
      },
      autumn: {
        grain: 1.65, rice: 1.7, meat: 1.25, vegetables: 1.5,
        brushwood: 1.3, firewood: 1.35, wood: 1.2, hide: 1.3, herbs: 1.1,
      },
      winter: {
        grain: 0.8, rice: 0.75, meat: 0.75, fish: 0.35, vegetables: 0.4,
        brushwood: 0.55, firewood: 0.5, charcoal: 0.8,
        wood: 0.7, stone: 0.8, iron: 0.8, herbs: 0.45,
      },
    } as Record<Season, Partial<Record<ResourceId, number>>>,
    capacityRankMult: {
      settlement: 1,
      bo: 1.2,
      jin: 1.45,
      bu: 1.75,
    } as Record<Rank, number>,
    dockCapacityMult: 2,
  },

  extortion: {
    powerAmountDiv: 22,
    payThreatReduction: 25,
    payReputationLoss: 1,
    payMoraleLoss: 4,
  },

  // 조정 세공(歲貢) — 봄 첫날 공지, 겨울 첫날 수거.
  // 장작은 걷지 않는다. 곡물은 먹을 수도 바칠 수도 있어 밭 확장과 비축 판단을 압박한다.
  tribute: {
    baseAmounts: { hide: 8, grain: 25, iron: 3, hideClothes: 6, herbs: 6 }, // 품목별 기준량
    yearScale: 0.3,        // 연차당 요구량 증가 (1 + 0.3×(연차-1))
    popScaleBase: 0.7,     // 인구 배율 = 0.7 + 인구/40
    popScaleDiv: 40,
    repPaid: 6,            // 납부 시 명성
    repFail: 12,           // 미납 시 명성 하락
    repFailStreakExtra: 8, // 2년 연속 미납 시 추가 하락 (합계 -20)
    threatFail: 8,         // 미납 시 위협도 상승
    partialFailStreakAvoidRatio: 0.5,
    partialSuspicionDecayMult: 0.5,
    rewardTools: 2,        // 격년 하사품 (도구 또는 옷, 결정적 롤)
    rewardCottonClothes: 3,
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
    cooldownDays: 8,
    groupMin: 2,
    groupMax: 5,
    rejectReputation: 2,
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
