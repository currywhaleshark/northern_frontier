// 시뮬레이션 밸런스 값 모음 — 숫자 튜닝은 전부 여기서 한다.
import { DAY_CYCLE_SUBTICKS } from './dayCycle';
import type { JobId, LivestockId, ProcessingInputId, Rank, ResourceId, Season } from './types';

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
    silverMin: 80,   // 잠채/설점으로 전환된 은맥의 매장량
    silverMax: 130,
    nearbyStone: 36,
    nearbyIron: 16,
    nearbyMinDistance: 4,
    nearbyMaxDistance: 7,
    mineWorkRadius: 6, // 채광장 거점에서 주변 광상을 찾아 왕복하는 반경
  },

  time: {
    seasonDays: 12,           // 한 계절 길이(일)
    yearDays: 48,             // 1년 = 4계절
    // 하루당 실시간(ms). 72서브틱에서도 기존 틱 간격과 주민 체감 이동 속도를 유지한다.
    // (1배 667ms/틱, 3배 222ms/틱, 10배 67ms/틱)
    msPerDay: { 1: 48000, 3: 16000, 10: 4800 } as Record<number, number>,
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
      grain: 100, rice: 0, meat: 0, eggs: 0, milk: 0, fish: 0, curedMeat: 0, saltedFish: 0, driedFish: 0, vegetables: 0, kimchi: 0, beans: 0, jang: 0, salt: 0,
      brushwood: 12, firewood: 45, charcoal: 0,
      wood: 30, stone: 12, iron: 4, tools: 10, onggi: 0, carts: 0,
      hide: 6, hideClothes: 12, strawShoes: 0, leatherShoes: 0, cotton: 0, wool: 0, hay: 0, cottonClothes: 0, herbs: 5,
      porcelain: 0, brassware: 0, lacquerware: 0, silk: 0, preciousMetal: 0, silver: 0,
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

  wearables: {
    clothingWearPerDay: 0.008,
    footwearWearPerDay: 0.04,
    winterWearMultiplier: 2.5,
    badWeatherWearMultiplier: 1.3,
    outdoorFootwearWearMultiplier: 1.5,
    childWearMultiplier: 0.5,
    barefootMoveMultiplier: 0.85,
    strawShoeMoveMultiplier: 1,
    leatherShoeMoveMultiplier: 1.03,
    strawShoeHayPerUnit: 2,
    strawShoePerEvening: 0.3,
    strawShoeStockBuffer: 2,
    livestockHayReserveDays: 3,
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

  medicine: {
    patientHealthThreshold: 75,
    treatmentHealthPerDay: 6,
    herbsPerPhysicianPerDay: 0.6,
    normalSickRecoveryBonusPerDay: 0.18,
    diagnosisDays: 1,
    isolationDaysReduction: 3,
    epidemicSpreadMult: 0.5,
    epidemicDeathMult: 0.4,
    epidemicDamageMult: 0.6,
    tacticalReturnsPerPhysicianPerRound: 1,
    tacticalReturnChance: 0.2,
    tacticalHerbsPerReturn: 1,
    tacticalInjurySeverityMult: 0.75,
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
      // 직접 지휘와 자동판정이 공유하는 산채 진지 전력 배율이다.
      positionPowerMultiplier: 3.2,
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
    predatorMinSettlementDistance: 12,
    predatorPreferredForestTiles: 18,
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
    // RC 장기 측정의 초반 아사·냉사 완화: 변환비는 그대로 두고 노동 산출만 소폭 높인다.
    resourceOutputMultiplier: 1.08,
    // 승격으로 전문직이 늘어나는 만큼 작업 조직·도구 운용이 정비된다.
    // 개척지 초반 난이도는 유지하고 보 이후의 기초·가공 생산만 보완한다.
    rankLaborEfficiency: {
      settlement: 1,
      bo: 1.1,
      jin: 1.15,
      bu: 1.18,
    } as Record<Rank, number>,
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
    silverworkPerDay: 0.5,       // 대장간 은세공 — 화폐(은)를 사치재(귀금속)로 바꾸는 싱크
    silverworkSilverPerUnit: 2,
    silverworkCharcoalPerUnit: 0.5,
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
    woodReserve: 25,           // 건축용으로 남겨둘 목재 (이 이상만 장작으로 팬다)
    processingReserves: {
      wood: 25,
      rice: 0,
      hide: 0,
      iron: 0,
      meat: 8,
      fish: 8,
    } as Record<ProcessingInputId, number>,
    curedMeatPerDay: 1.8,
    meatPerCuredMeat: 1.15,
    firewoodPerCuredMeat: 0.35,
    charcoalPerCuredMeat: 0.22,
    saltedFishPerDay: 2,
    fishPerSaltedFish: 1,
    saltPerSaltedFish: 0.25,
    driedFishPerDay: 1.3,
    fishPerDriedFish: 1.25,
    onggiPerDay: 0.75,
    firewoodPerOnggi: 1,
    charcoalPerOnggi: 0.65,
    tanneryHidePerDay: 2,      // 가죽공방 하루 가죽 소비 (가죽 2 → 옷 1)
    weaverCottonPerDay: 2,
    cottonClothesPerCotton: 0.5,
    fieldGrainYield: 36,       // 밭 1개가 만작일 때 곡물 수확량
    fertileBonus: 1.3,
    lumberCampBonus: 1.4,
    huntLodgeBonus: 1.5,
    herbHutBonus: 1.6,
    toolWearPerWorker: 0.01,   // 중노동 생산직 1인당 하루 도구 마모 기준
    skillGainPerDay: 0.012,
    skillEffect: 0.5,          // 숙련 1.0일 때 생산 +50%
  },

  // 경작지 (드래그 크기 지정 논밭)
  farming: {
    maxPlotSide: 3,       // 경작지 한 변 최대 칸수 (3×3 = 9칸 상한)
    tilesPerFarmer: 3,    // 농부 1명이 감당하는 칸수 — 슬롯 수 = ceil(면적/이 값)
    // 칸 1개 파종에 드는 농부 서브틱. 봄 96서브틱 기준: 혼자 3×3(9칸)은 5칸 남짓에서 봄이 끝나고
    // (의도된 실패), 적정 인원 3명이면 7일째쯤 다 심고 생육으로 넘어간다.
    sowWorkPerTile: 18,
    plowOxWorkMultiplier: 1.4, // 농우 배정 시 파종·생육·수확 작업 배수
    plowOxenPerPlotMax: 1,     // 경작지당 농우 상한 (9칸 대형은 +1)
    largePlotOxThreshold: 7,   // 이 칸수 이상이면 농우 상한 +1
  },

  fermentation: {
    jangdokdaeOnggiCapacity: 4,
    jangBeansPerOnggi: 4,
    jangSaltPerOnggi: 1,
    jangOutputPerOnggi: 4,
    jangMaturationDays: 24,
    onggiRecoveryRate: 0.9,
    jangAutumnStartDay: 7,
    jangWinterEndDay: 4,
    kimchiVegetablesPerOnggi: 6,
    kimchiSaltPerOnggi: 1,
    kimchiOutputPerOnggi: 6,
    kimchiMaturationDays: 4,
    kimjangMoralePerOnggi: 1.5,
    kimjangReservedOnggiPerYard: 2,
    kimjangAutumnStartDay: 10,
    kimjangWinterEndDay: 2,
    kimjangSizes: {
      small: 1,
      medium: 2,
      large: 4,
    },
  },

  // 주민 에이전트 (이동/작업/운반)
  agents: {
    subticksPerDay: DAY_CYCLE_SUBTICKS, // 새벽9 + 노동36 + 저녁13 + 밤14
    moveSpeed: 2,             // 서브틱당 이동 타일 수
    moveSpeedWinter: 1.5,     // 겨울 눈길
    moveSpeedSnow: 1,         // 폭설/눈보라
    haulerMoveSpeedMultiplier: 1.1, // 운반꾼 왕복 이동만 소폭 보완
    shelterThreshold: 0.3,    // 실외작업 중단 기준 (날씨 효율이 이 밑이면 대피)
    carryCapacityMultiplier: 1.1, // 채집·가공 원료·운반꾼 적재량 공용 보정
    carryCap: {
      grain: 6, rice: 6, meat: 5, eggs: 5, milk: 5, fish: 5, curedMeat: 5, saltedFish: 5, driedFish: 5, vegetables: 5, kimchi: 5, beans: 5, jang: 5,
      brushwood: 4, firewood: 4, charcoal: 3, wood: 4,
      stone: 3, iron: 3, hide: 2, cotton: 3, wool: 3, hay: 5, herbs: 1.5, silver: 2,
    },
    haulerCarryCap: 10,       // 운반꾼 전용 적재량
    haulerBatchMin: 2,        // 평시 소량 왕복을 막는 작업장 최소 수거량
    haulerCartCarryCap: 24,   // 수레 장비 운반꾼 적재량
    haulerCartBatchMin: 8,
    work: {                   // 작업지에서 1회 채집에 드는 서브틱
      chop: 3, hunt: 5, herb: 3, mine: 4, fish: 4,
      herd: 5,
      harvestPerSubtick: 8,   // 가을 수확: 서브틱당 깎는 성장도
      growPerSubtick: 1.4,    // 봄여름 농사: 서브틱당 올리는 성장도
      buildPerSubtick: 0.2,   // 건축가 서브틱당 공정 (건축가-일 환산)
    },
    yields: {                 // 1회 채집으로 지는 짐
      wood: 1.1, game: 0.75, herbs: 0.55, iron: 1.2, mineStone: 0.4, stone: 1.1, fish: 1.2,
      silver: 0.5,
    },
    forestDepleteChance: 0.12, // 벌목 1회당 성목이 그루터기가 될 확률
    // 공사터 개간: 한 현장에 붙는 벌목꾼 상한. 낮게 잡아야 벌목꾼이 한 곳에
    // 우르르 몰리지 않고, 사람이 많으면 여러 공사터를 동시에 열 수 있다.
    clearingCuttersPerSite: 2,
    forestRegrowChance: 0.003,  // 봄여름, 숲 인접 평지가 숲이 될 하루 확률
    forestPioneerChance: 0.00018, // 봄여름, 고립된 평지에 새 숲 씨앗이 들 확률
    forestStumpSproutChance: 0.012, // 봄여름, 그루터기가 어린나무로 회복될 하루 확률
    forestYoungMatureChance: 0.006, // 봄여름, 어린나무가 성목이 될 하루 확률
    // 사냥 수확 배율 — 짐승 서식지(숲 덩어리)가 클수록 사냥감이 풍부하다
    hunting: {
      habitatYieldBase: 0.8,     // 서식지 기본
      habitatYieldPerTile: 0.012, // 서식지 숲 1타일당 가산 (숲 50타일에서 최대치)
      habitatYieldMax: 1.4,
      prey: {
        rabbit: { weight: 0.30, meat: 2, hide: 0.25 },
        pheasant: { weight: 0.25, meat: 1.5, hide: 0 },
        roeDeer: { weight: 0.30, meat: 4, hide: 1 },
        wildBoar: { weight: 0.15, meat: 12, hide: 3.5 },
      },
    },
  },

  seasons: {
    firewoodMult: { spring: 0.9, summer: 0.5, autumn: 1.35, winter: 3 },
    woodMult:     { spring: 1, summer: 1.3, autumn: 1.1, winter: 0.7 },
    gameMult:     { spring: 1.25, summer: 1, autumn: 1.1, winter: 0.5 },
    fishMult:     { spring: 1.2, summer: 1.15, autumn: 0.9, winter: 0.45 },
  },

  livestock: {
    initialUnlocked: ['chicken'] as LivestockId[],
    hayPerHarvestProgress: 0.1,
    chicken: {
      capacity: 8,
      initialHeadcount: 4,
      feedResource: 'grain' as ResourceId,
      feedPerHeadPerDay: 0.06,
      grazesOutsideWinter: false,
      grainPerHeadPerDay: 0.06,
      breedingPerHeadPerDay: 0.025,
      productResource: 'eggs' as ResourceId,
      productPerHeadPerHerderDay: 0.12,
      productSeasonMult: { spring: 1, summer: 1, autumn: 0.9, winter: 0.65 } as Record<Season, number>,
      eggPerHeadPerHerderDay: 0.12,
      eggSeasonMult: { spring: 1, summer: 1, autumn: 0.9, winter: 0.65 } as Record<Season, number>,
      shortageGraceDays: 3,
      starvationLossIntervalDays: 2,
      slaughterMeatPerHead: 0.75,
      slaughterHidePerHead: 0,
    },
    goat: {
      capacity: 5,
      initialHeadcount: 0,
      feedResource: 'hay' as ResourceId,
      feedPerHeadPerDay: 0.18,
      grazesOutsideWinter: true,
      grainPerHeadPerDay: 0,
      breedingPerHeadPerDay: 0.012,
      productResource: 'milk' as ResourceId,
      productPerHeadPerHerderDay: 0.18,
      productSeasonMult: { spring: 1, summer: 0.9, autumn: 0.75, winter: 0.55 } as Record<Season, number>,
      eggPerHeadPerHerderDay: 0,
      eggSeasonMult: { spring: 1, summer: 1, autumn: 1, winter: 1 } as Record<Season, number>,
      shortageGraceDays: 2,
      starvationLossIntervalDays: 2,
      slaughterMeatPerHead: 3,
      slaughterHidePerHead: 0.8,
    },
    sheep: {
      capacity: 5,
      initialHeadcount: 0,
      feedResource: 'hay' as ResourceId,
      feedPerHeadPerDay: 0.2,
      grazesOutsideWinter: true,
      grainPerHeadPerDay: 0,
      breedingPerHeadPerDay: 0.01,
      productResource: 'wool' as ResourceId,
      productPerHeadPerHerderDay: 0.08,
      productSeasonMult: { spring: 1, summer: 0.45, autumn: 0.85, winter: 0.15 } as Record<Season, number>,
      eggPerHeadPerHerderDay: 0,
      eggSeasonMult: { spring: 1, summer: 1, autumn: 1, winter: 1 } as Record<Season, number>,
      shortageGraceDays: 2,
      starvationLossIntervalDays: 2,
      slaughterMeatPerHead: 3.5,
      slaughterHidePerHead: 1.2,
    },
    pig: {
      capacity: 6,
      initialHeadcount: 0,
      feedResource: 'grain' as ResourceId,
      feedPerHeadPerDay: 0.24,
      grazesOutsideWinter: false,
      grainPerHeadPerDay: 0.24,
      breedingPerHeadPerDay: 0.02,
      productResource: null,
      productPerHeadPerHerderDay: 0,
      productSeasonMult: { spring: 0, summer: 0, autumn: 0, winter: 0 } as Record<Season, number>,
      eggPerHeadPerHerderDay: 0,
      eggSeasonMult: { spring: 1, summer: 1, autumn: 1, winter: 1 } as Record<Season, number>,
      shortageGraceDays: 2,
      starvationLossIntervalDays: 2,
      slaughterMeatPerHead: 12,
      slaughterHidePerHead: 0.5,
    },
    cattle: {
      capacity: 3,
      initialHeadcount: 0,
      feedResource: 'hay' as ResourceId,
      feedPerHeadPerDay: 0.45,
      grazesOutsideWinter: true,
      grainPerHeadPerDay: 0,
      breedingPerHeadPerDay: 0.005,
      productResource: 'milk' as ResourceId,
      productPerHeadPerHerderDay: 0.32,
      productSeasonMult: { spring: 1, summer: 0.95, autumn: 0.8, winter: 0.6 } as Record<Season, number>,
      eggPerHeadPerHerderDay: 0,
      eggSeasonMult: { spring: 1, summer: 1, autumn: 1, winter: 1 } as Record<Season, number>,
      shortageGraceDays: 2,
      starvationLossIntervalDays: 2,
      slaughterMeatPerHead: 8,
      slaughterHidePerHead: 2.5,
    },
    horse: {
      capacity: 3,
      initialHeadcount: 0,
      feedResource: 'hay' as ResourceId,
      feedPerHeadPerDay: 0.35,
      grazesOutsideWinter: true,
      grainPerHeadPerDay: 0,
      breedingPerHeadPerDay: 0.004,
      productResource: null,
      productPerHeadPerHerderDay: 0,
      productSeasonMult: { spring: 0, summer: 0, autumn: 0, winter: 0 } as Record<Season, number>,
      eggPerHeadPerHerderDay: 0,
      eggSeasonMult: { spring: 1, summer: 1, autumn: 1, winter: 1 } as Record<Season, number>,
      shortageGraceDays: 2,
      starvationLossIntervalDays: 2,
      slaughterMeatPerHead: 5,
      slaughterHidePerHead: 1.5,
    },
  },

  pasture: {
    maxSide: 6,
    tilesPerHerder: 8,
    visibleAnimalLimit: 12,
    capacityPerTile: {
      chicken: 2,
      goat: 1,
      sheep: 1,
      pig: 1,
      cattle: 0.5,
      horse: 0.5,
    } as Record<LivestockId, number>,
  },

  // K2 보존 경제. 생선·고기는 빠르게 상하므로 훈연·염장·건조로 손실을 피해야 한다.
  spoilage: {
    dailyRate: {
      fish: 0.06,
      meat: 0.04,
      eggs: 0.025,
      milk: 0.05,
      vegetables: 0.015,
    },
    seasonMult: {
      spring: 0.9,
      summer: 1.4,
      autumn: 1,
      winter: 0.25,
    } as Record<Season, number>,
    cellarCapacity: 36,
    cellarRateMult: 0.3,
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
      maxEngagements: 8,
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
        baseGain: 9,
        perDriver: 2.2,
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
        breakoutEncirclement: {
          wolf: 60,
          tiger: 70,
          greatTiger: 62,
          mountainLord: 55,
        },
        breakoutBlockadeMax: {
          wolf: 24,
          tiger: 20,
          greatTiger: 25,
          mountainLord: 30,
        },
        woundedPowerShare: 0.45,
        ambushDecisionChance: 0.72,
        ambushExposureThreshold: {
          wolf: 34,
          tiger: 38,
          greatTiger: 32,
          mountainLord: 26,
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
        blockadeThreshold: 4,
        holeGainMultiplier: 0.5,
        openEscapeRounds: 2,
        openEscapeEncirclementMin: 10,
        openEscapeChance: 0.45,
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
      wolfMultiAmbushHitMultiplier: 0.72,
      rehideChance: { tiger: 0.46, greatTiger: 0.38, mountainLord: 0.30 },
      rehideEncirclementMax: 70,
    },
    raiderPowerPerFighter: 4,
    deployment: {
      maxCohortGroups: 3,
      maxCommandableGroups: 10,
      featuredSpriteScale: 1.15,
      preInfiltrationCost: 2,
    },
    unitMatchups: {
      spearVsMountedDefense: 1.15,
      bowVsShieldedDefense: 0.9,
      firearmVsShieldedDefense: 1.05,
      mountedShockVsSpear: 0.86,
      mountedShockVsWall: 0.76,
      firstContactShock: 1.16,
      wallBreakerLossScale: 1.24,
      rearRangedLossScale: 1.18,
      probingRangedPower: 1.08,
      formingPower: 0.72,
      withdrawingPower: 0.82,
      withdrawingLossScale: 0.78,
      reserveCommitPower: 1.15,
      rangedWeather: { heavySnow: 0.82, blizzard: 0.62 },
      firearmWeather: { rain: 0.82, heavySnow: 0.72, blizzard: 0.55 },
    },
    supportUnits: {
      directArtillery: {
        maxShots: 3,
        reloadRounds: 1,
        firingPowerMultiplier: 1.18,
        wallPressureMultiplier: 4,
      inactivePowerMultiplier: 0.12,
      },
      hwacha: {
        maxShots: 2,
        reloadRounds: 2,
        firingPowerMultiplier: 1.08,
        denseTargetMultiplier: 1.22,
        sparseTargetMultiplier: 0.62,
        denseTargetCount: 8,
        inactivePowerMultiplier: 0.1,
      },
      medic: {
        recoveryPerActiveMedic: 0.65,
        maximumBattleRecoveryShare: 0.1,
        combatPowerMultiplier: 0.06,
      },
      rearLossMultiplier: 1.35,
    },
    doctrineAi: {
      minIntentRounds: 2,
    },
    formationExposure: {
      facing: {
        turnPowerMultiplier: 0.75,
        wrongDirectionExposureMultiplier: 1.5,
      },
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
    flankRoutes: {
      preparationCost: 2,
      weatherDelayRounds: 1,
      engagement: {
        preparedBlockPowerMultiplier: 1.15,
        isolatedRangedCasualtyMultiplier: 1.35,
        defenderWinShare: 0.56,
        raiderWinShare: 0.56,
        withdrawMoraleThreshold: 24,
        rearRaidPowerMultiplier: 1.12,
      },
      sides: {
        left: { label: '숲 능선길', terrain: 'woodedRidge' as const },
        right: { label: '하천 둥길', terrain: 'riverBank' as const },
      },
    },
    groupPower: {
      militiaMusket: 18,
      militiaBow: 16,
      militiaSpear: 14,
      militiaUnarmed: 9,
      watchman: 6,
      hunter: 8,
      healer: 0.5,
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
        wallBreakers: { wallPressureBonus: 10, lossResistancePenalty: 0.2, powerShare: 0.18 },
        fireArrows: { pressureBonus: 8, buildingDamageChance: 0.35 },
        feint: { powerShift: 0.14, estimatedMainMultiplier: 1.25 },
        nightApproach: {
          prepPointPenalty: 1,
          rangedEfficiencyPenalty: 0.3,
          firstRoundMoraleBonus: 8,
          forcedAutoDeployThreshold: 0.5,
        },
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
      grain: 28, rice: 24, meat: 16, eggs: 14, fish: 18, curedMeat: 12, saltedFish: 12, driedFish: 12, vegetables: 14, beans: 14, jang: 8,
      brushwood: 24, firewood: 20, charcoal: 12,
      wood: 24, stone: 20, iron: 9, tools: 6, onggi: 4, carts: 2,
      hide: 14, hideClothes: 7, strawShoes: 8, leatherShoes: 6, cotton: 12, cottonClothes: 7, herbs: 10, salt: 12,
      gunpowder: 4, spears: 6, hornBows: 4, muskets: 3,
      porcelain: 5, brassware: 5, lacquerware: 5, silk: 4, preciousMetal: 3,
      silver: 12, // 상단이 한 철에 싣고 오는 은 — 은 수취(수출 흑자)의 상한
      reputation: 0, defense: 0,
    } as Record<ResourceId, number>,
    // 은이 낀 거래는 관계 마진이 절반 이하로 줄어든다(1 + (마진-1)×이 값).
    // 물물교환보다 은 결제가 항상 약간 이득이 되게 하는 장치다.
    silverMarginKeep: 0.4,
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
    // 은 대납 — 요구 품목의 교역 가치 총합을 은 시세로 환산해 한 번에 치른다
    silverPayMarkup: 1.1,           // 환산가에 얹는 웃돈 (조정 몫의 예우)
    silverPayRepBonus: 2,           // 현물 납부 대비 추가 명성
    silverPaySuspicionDecayMult: 1.5, // 은까지 바치는 성실함 — 의심을 더 깊이 씻는다
  },

  // 생애 주기 — 압축 성장(총 2.5게임년) + 나이별 소비 몫 + 노년·자연사.
  // 계획: docs/superpowers/plans/2026-07-17-marriage-birth-growth.md
  lifecycle: {
    stageDays: { infant: 24, child: 48, youth: 48 },  // 합계 120일 = 2.5게임년
    consumptionShare: { infant: 0.3, child: 0.5, youth: 0.7 }, // 성인 1.0 기준
    growthPauseHungerBelow: 25,  // 굶주리면 성장이 멈춘다
    growthPauseWarmthBelow: 25,  // 혹한에 떨어도 멈춘다
    adultAge: 16,
    childBedShare: 0.5,          // 아이는 침상 정원의 절반만 차지
    // 혼인 — 조건 충족 시 자연 성사 (강제 중매 없음)
    marriageDailyChance: 0.03,   // 자격 있는 짝이 있을 때의 일일 성사 확률
    maxMarriageAge: 50,
    weddingFeastFood: 8,         // 잔치 비용 (식용 식량)
    weddingFeastMorale: 6,       // 잔치 시 전 주민 사기
    weddingQuietMorale: 2,       // 조용히 치러도 당사자들 주변의 잔잔한 기쁨
    // 출산 — 같은 집에 사는 부부. 굶는 마을엔 아기가 안 생긴다.
    birthDailyChance: 0.025,     // 부부당, 식량·온기 여유 시
    birthFoodDaysRequired: 6,    // 이 일수분의 식량 여유가 없으면 확률 0
    birthWarmthRequired: 40,     // 평균 체온이 이보다 낮으면 확률 0
    birthHousingFullMult: 0.15,  // 집이 꽉 차면 확률이 크게 떨어진다
    maxMotherAge: 45,
    maxChildrenPerCouple: 3,
    birthRecoveryDays: 4,        // 산모 노동 이탈
    birthWinterExtraRecovery: 3, // 겨울 출산은 회복이 느리다
    // 노년 — 나이는 새해마다 +1세(압축 없음). 60부터 자연사 위험이 오른다.
    elderDeathCheckAge: 60,
    elderDeathAnnualBase: 0.1,   // 60세 연간 사망 확률
    elderDeathAnnualPerYear: 0.05, // 이후 1세당 가산
    elderLaborAge: 60,
    elderLaborMult: 0.85,        // 노년 노동 효율 (완만 — 늙은 사냥꾼도 일한다)
    youthWorkEfficiency: 0.5,    // 소년의 안전 직무 생산은 성인의 반몫
    youthAllowedJobs: ['idle', 'hauler', 'farmer', 'woodSplitter', 'herder'] as JobId[],
    // 이주 가족 구성 — 홀몸만 오지 않는다
    immigrantChildChance: 0.4,   // 일행에 아이(어린이/소년) 1명이 섞일 확률
    immigrantElderChance: 0.15,  // 노부모(55~64세) 1명이 섞일 확률
  },

  // 교육 — 서당 취학은 아이의 반몫 노동을 포기하는 대신 문해자를 길러낸다.
  // 문해자만 의원·아전·훈장을 맡을 수 있고, 무엇을 배워도 빠르다.
  education: {
    seatsPerTeacher: 5,          // 훈장 1명당 취학 정원
    schoolingDays: 30,           // 취학 이 일수면 문해 (어린이+소년 성장 96일 중)
    schoolProgressPerDay: 1,
    schoolDaysForAdultBonus: 30,
    schoolAdultSkillBonus: 0.2,  // 성인 전환 시 아전·훈장 초기 숙련
    literateSkillGainMult: 1.5,  // 문해자의 숙련 성장 배율
    literateCarryover: 0.5,      // 전직 시 최고 숙련의 이 비율을 새 직업에 이월
    childLaborMult: 0.5,         // 미취학 아이 심부름의 적재 배율 (반몫)
    immigrantLiterateChance: 0.1, // 성인 유민이 문해자일 확률
    startLiterateAdults: 2,      // 시작 개척민 중 문해자 수 (관직 콜드 스타트 방지)
  },

  // 만족도 — 티어가 오를수록 기대 항목이 늘어난다 (성분 기반, 잠긴 항목은 계산 제외)
  // 계획: docs/superpowers/plans/2026-07-17-satisfaction-religion.md
  satisfaction: {
    base: 50,
    mealOk: 10, mealShort: -18,            // 정착지: 끼니
    warmthGood: 8, warmthBad: -12,         // 정착지: 온기 (60 이상 / 35 미만)
    varietyPenalty: -8,                    // 정착지: 식단 단조 (다양성 0.5 미만)
    clothingGood: 5, clothingBad: -6,      // 보: 입성 (보급률 0.8 이상 / 0.4 미만)
    marketGood: 4, marketMissing: -3,      // 보: 장터
    fermentGood: 6, fermentMissing: -6,    // 진: 밥상의 격 (최근 장·김치)
    fermentWindowDays: 4,
    educationGood: 6, educationMissing: -6, // 진: 서당 (훈장 배정)
    luxuryGood: 6, luxuryMissing: -6,      // 부: 사치품 (인구당 재고)
    luxuryPerCapita: 0.4,
    religionGood: 6, religionMissing: -6,  // 부: 종교 시설
    shamanCheer: 2,                        // 당집에 무당 상주 (부가)
    promotionCheer: 8,                     // 승격 직후 완충 버프
    promotionCheerDays: 12,
    legacyTransitionCheer: 8,              // 구저장 고티어가 새 기대에 적응하는 동안의 별도 완충
    legacyTransitionDays: 12,
    monkGriefRelief: 3,                    // 노승 상주 시 사망 사기 하락 6 → 3
    monkBurialBonus: 2,                    // 노승 상주 시 안장 위로 +2
  },

  // 절목 — 중심지에서 반포하는 시행 세칙. 평시(기본값)는 기존 거동과 완전히 같다.
  // 모든 령은 "항상 켜두면 손해"여야 한다 (docs/DESIGN-2026-07-23-edict-system.md §7).
  edicts: {
    slotsByRank: { settlement: 1, bo: 2, jin: 3, bu: 4 } as Record<Rank, number>,
    officeSlotBonus: 1,        // 관청 + 아전이 있으면 동시 시행 슬롯 +1
    clerkHoldDaysMult: 0.5,    // 아전의 행정력이 최소 유지 기간을 줄인다
    whiplashMoralePenalty: -10, // 조령모개 — 아침에 내린 영을 저녁에 바꾼 대가
    whiplashDays: 6,
    whiplashReputation: -2,
    // 절미령(節米令) — 배급 조절. 절미의 본체는 민심이 아니라 누적 배고픔·건강 저하다.
    ration: {
      tight: { foodMult: 0.75, morale: -6 },
      generous: { foodMult: 1.2, morale: 4 },
    },
    // 절탄령(節炭令) — 난방 제한. 혹한·눈보라에는 배급이 더 야박해진다.
    fuelRation: {
      tight: { fuelMult: 0.7, morale: -4, harshWeatherMult: 0.85 },
    },
  },

  // 종교인 등장 — 사람이 먼저 온다. 네임드가 합류해야 그 갈래의 시설이 열린다.
  religion: {
    minRank: 'jin' as Rank,
    dailyChance: 0.02,
    declineRetryDays: 36,   // 거절해도 훗날 다시 문을 두드린다
    mudangAge: 44,
    nosungAge: 62,          // 노승은 자연사 시계도 함께 돈다
  },

  // 이름 있는 특수 주민 — 크게 돕는 만큼 지속 위험을 가져온다.
  specialResidents: {
    exiledScholarMinRank: 'bu' as Rank,
    exiledScholarDailyChance: 0.012,
    exiledScholarConfinedDays: 48,
    exiledScholarAge: 51,
    exiledScholarOfficeBonus: 0.2,
    exiledScholarSuspicionPerDay: 0.2,
    exiledScholarCourtDemandChance: 0.04,
    exiledScholarCourtDemandSuspicion: 70,
    exiledScholarHideSuspicionRise: 15,
    exiledScholarSurrenderSuspicionRelief: 12,
    exiledScholarPardonServiceDays: 180,
    exiledScholarPardonChance: 0.006,
    exiledScholarPardonMaxSuspicion: 20,
    exiledScholarPardonReputation: 18,
    exiledScholarPardonSuspicionRelief: 10,
    jurchenWarriorMinRank: 'jin' as Rank,
    jurchenWarriorDailyChance: 0.008,
    jurchenWarriorMinRelation: 65,
    jurchenWarriorAge: 37,
    jurchenWarriorBasePowerBonus: 6,
    jurchenWarriorSuspicionPerDay: 0.12,
    jurchenWarriorRecruitRelationLoss: 8,
    jurchenWarriorRelationGainMult: 0.65,
    jurchenWarriorDemandChance: 0.012,
    jurchenWarriorDemandCooldownDays: 90,
    jurchenWarriorSurrenderRelationGain: 12,
    jurchenWarriorRefuseRelationLoss: 15,
    jurchenWarriorRefuseThreatRise: 8,
    jurchenWarriorDesertRelationBelow: 10,
    jurchenWarriorDesertChance: 0.003,
    // 착호 포수 박돌개 — 맹수 추적·사냥 특화, 조정의 착호 징발이 부담
    tigerHunterMinRank: 'bo' as Rank,
    tigerHunterDailyChance: 0.010,
    tigerHunterAge: 61,
    tigerHunterBasePowerBonus: 5,
    tigerHunterScoutDaysReduction: 1,
    tigerHunterDemandChance: 0.010,
    tigerHunterDemandCooldownDays: 120,
    tigerHunterLevyReputation: 8,
    tigerHunterLevyHealthLoss: 25,
    tigerHunterRefuseReputationLoss: 6,
    // 맹인 지관 허생 — 채광·은맥 특화, 은 소문이 더 빨리 퍼지는 게 부담
    geomancerMinRank: 'bo' as Rank,
    geomancerDailyChance: 0.010,
    geomancerAge: 58,
    geomancerMiningYieldBonus: 0.15,
    geomancerVeinChanceMult: 3,
    geomancerSilverSuspicionMult: 1.5,
    // 내의원 의녀 단심 — 치료·방역 특화, 죄인 은닉 의심과 누명 벗김 후속
    uinyeoMinRank: 'jin' as Rank,
    uinyeoDailyChance: 0.010,
    uinyeoAge: 34,
    uinyeoTreatmentMult: 1.5,
    uinyeoEpidemicSpreadMult: 0.6,
    uinyeoSuspicionPerDay: 0.08,
    uinyeoExonerationServiceDays: 150,
    uinyeoExonerationChance: 0.006,
    uinyeoExonerationReputation: 14,
    uinyeoExonerationSuspicionRelief: 6,
    // 도망 야장 막쇠 — 대장간 특화, 추노꾼 방문이 부담
    runawaySmithMinRank: 'jin' as Rank,
    runawaySmithDailyChance: 0.010,
    runawaySmithAge: 29,
    runawaySmithSmithyMult: 1.6,
    runawaySmithDemandChance: 0.012,
    runawaySmithDemandCooldownDays: 100,
    runawaySmithRansomSilver: 15,
    runawaySmithRefuseReputationLoss: 6,
    // 퇴역 역관 배수겸 — 여진 외교 특화, 양다리 의심이 부담
    interpreterMinRank: 'bu' as Rank,
    interpreterDailyChance: 0.008,
    interpreterAge: 66,
    interpreterMinRelation: 55,
    interpreterRelationGainMult: 1.5,
    interpreterSuspicionPerDay: 0.10,
    // 항왜 철포수 사야카 — 조총 특화, 왜인 은닉 의심과 조정 압송 요구가 부담
    hangwaeMinRank: 'bu' as Rank,
    hangwaeDailyChance: 0.008,
    hangwaeAge: 68,
    hangwaeMusketPowerBonus: 6,
    hangwaePowderMult: 0.8,
    hangwaeSuspicionPerDay: 0.15,
    hangwaeDemandChance: 0.010,
    hangwaeDemandCooldownDays: 110,
    hangwaeSurrenderSuspicionRelief: 10,
    hangwaeRefuseSuspicionRise: 8,
  },

  // 장례 — 모든 죽음은 시신을 남기고, 시신은 묘지에 묻힌다
  funeral: {
    plotsPerTile: 4,             // 묘역 한 칸을 2×2로 나눠 네 사람을 안장
    unburiedGraceDays: 3,        // 이 일수를 넘긴 시신부터 방치 페널티
    unburiedMoralePerDay: 1.5,   // 방치 시신이 있는 날의 전 주민 사기 하락
    burialMoraleRelief: 3,       // 안장 시 전 주민 사기 회복 (장례의 위로)
    corpseRetryDays: 2,          // 접근 불가 시신의 재시도 간격
  },

  // 은맥 — 바위/철광을 캐는 동안 낮은 확률로 드러나는 게임당 1회 사건
  silver: {
    veinDailyChance: 0.015,   // 채광이 있었던 날의 발견 확률
    pityMiningDays: 60,       // 누적 채광일이 이에 달하면 강제 발견 (게임당 최소 1회 보장)
    sanctionChance: 0.25,     // 보고 시 설점 허가 확률 (나머지는 봉인 명령)
    sanctionTaxRatio: 0.6,    // 설점 채굴 산출 중 조정 몫
    reportReputation: 4,      // 보고 즉시 명성
    reportSuspicionDecay: 6,  // 보고 즉시 의심 감소 (성실한 신고)
    exposeBaseChance: 0.004,  // 잠채 발각 일일 기본 확률
    exposePerMined: 0.0004,   // 캔 은 1당 추가 확률 (많이 캘수록 소문이 돈다)
    exposeChanceMax: 0.05,
    exposeSpike: 30,          // 발각 시 모반 의심 상승
    exposeSpikeSealBroken: 40, // 봉인을 어긴 잠채가 발각되면 더 크게
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

  defectors: {
    immigrationDailyChance: 0.025,
    groupMin: 2,
    groupMax: 4,
    rejectRelation: 3,
    suspicionPerNorthernResident: 0.04,
    nimachaBasePowerBonus: 0.75,
    holaonBasePowerBonus: 0.4,
    courtMusketPowerBonus: 2,
    siteMinGoodwill: 45,
    siteMinTrust: 35,
    siteFavorCost: 2,
    siteGroupMin: 2,
    siteGroupMax: 4,
    horseOfferChance: 0.035,
    horseOfferCooldownDays: 24,
    horseGroupSize: 2,
    horseCount: 2,
  },

  mounted: {
    combatDeathHorseLossChance: 0.45,
    maneuverPowerMultiplier: 0.82,
    chargePowerBonus: 0.1,
    routedLootRecoveryBase: 0.5,
    routedLootRecoveryPerMounted: 0.04,
    routedLootRecoveryMax: 0.75,
    pursuitKillsPerMounted: 0.4,
    pursuitKillsMax: 6,
    expeditionSpeedMaxBonus: 0.3,
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
    perSecretSilver: 0.5,     // 잠채 은광 가동 중 — 조정 탭에는 익명 라벨로만 보인다
    perSealBrokenSilver: 0.8, // 봉인을 어긴 잠채 — 조정이 위치를 아는 만큼 더 위험하다
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
