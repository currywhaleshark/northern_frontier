// 시뮬레이션 밸런스 값 모음 — 숫자 튜닝은 전부 여기서 한다.
//
// 아래 리터럴은 **기본값**이다. 밸런스 편집기(npm run edit:balance)가 남긴 오버레이는
// 이 파일 말미에서 얹어져 `CONFIG`가 된다 — 기본값·주석 원본은 그대로 두고 바뀐 값만 덮는다.
import { applyBalanceOverrides, cloneBalanceTree } from './balanceOverlay';
import { DAY_CYCLE_SUBTICKS } from './dayCycle';
import type { JobId, LivestockId, ProcessingInputId, Rank, ResourceId, Season, WeatherId } from './types';

export const CONFIG_DEFAULTS = {
  // 지도 격자 — 세계를 만들 때 한 번 쓰인다.
  map: {
    width: 72,
    height: 72,
  },

  // 광상 — 돌·철·은 매장량과 초기 노두 배치, 채광 산출.
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
    deepMinePerDay: 1.8,
    deepMineStoneByproductRatio: 0.28,
  },

  // 채집 거점의 작업영역 — 거점을 중심으로 한 원의 반경(타일)과 숙영 보급.
  gatheringZones: {
    // G1: 벌목장은 채광장과 같은 원형 작업영역 문법을 쓴다.
    lumberCampRadius: 6,
    lumberCampMinRadius: 3,
    lumberCampMaxRadius: 10,
    huntLodgeRadius: 7,
    herbHutRadius: 6,
    tidalFisheryRadius: 6,
    fishingPortRadius: 9,
    lodgingSupplyDays: 3,
    lodgingHomeRestDays: 1,
  },

  // 갯벌(어살터) — 칸당 조개·해산물 수용량과 회복량, 채집 산출 보정.
  tidalFlats: {
    capacityPerTile: 3,
    recoveryPerTilePerDay: 0.14,
    // 기존 채집 주기 보정을 거친 뒤 봄 맑은 날 어부 1인 약 1.1 fish/일이 되도록 맞춘다.
    yieldMultiplier: 0.44,
    minimumPlacementTiles: 5,
    depletionLogCooldownDays: 8,
    // 계절별 갯벌 채집 배율
    seasonYieldMult: { spring: 1.15, summer: 1.1, autumn: 1, winter: 0.65 },
  },

  // 어장 — 수역(강·호수·바다) × 거리대(연안·중간·먼바다)별 칸당 어획 수용량과 하루 회복량.
  fishingGrounds: {
    shoreRadius: 1,
    midRadius: 3,
    deepRadius: 5,
    // 수역·거리대별 칸당 어획 수용량
    capacityPerTile: {
      river: { shore: 2.4, mid: 2.4, deep: 2.4 },
      lake: { shore: 2.5, mid: 3.5, deep: 4.5 },
      sea: { shore: 2.8, mid: 4, deep: 5.2 },
    },
    // 수역·거리대별 칸당 하루 회복량
    recoveryPerTilePerDay: {
      river: { shore: 0.11, mid: 0.11, deep: 0.11 },
      lake: { shore: 0.12, mid: 0.16, deep: 0.2 },
      sea: { shore: 0.13, mid: 0.18, deep: 0.24 },
    },
  },

  // 어선 — 건조·수리 자재와 공정, 출항 조건, 어획량, 항해 내구도 소모와 풍랑 사고.
  fishingBoats: {
    buildWood: 12,
    buildTools: 1,
    buildWorkDays: 6,
    repairWood: 4,
    repairTools: 1,
    repairWorkDays: 3,
    cargoCapacity: 12,
    durability: 100,
    minimumDepartureDurability: 25,
    baseCatchPerTrip: 4,
    midCatchMultiplier: 1.4,
    deepCatchMultiplier: 1.8,
    distanceCatchBonusPerTile: 0.025,
    maximumDistanceCatchBonus: 0.5,
    fishingWorkSubticks: 6,
    departureDurabilityCost: 1.5,
    travelDurabilityPerTile: 0.18,
    catchDurabilityPerFish: 0.35,
    deepDurabilityMultiplier: 1.25,
    returnSafetySubticks: 2,
    roughDurabilityMultiplier: 1.45,
    stormTravelDurabilityMultiplier: 2,
    stormHullDamageMin: 3,
    stormHullDamageMax: 7,
    stormInjuryChance: 0.12,
    stormInjuryMin: 6,
    stormInjuryMax: 14,
    seaConditionSalt: 0x5eaf17,
    // 날씨별 그날 바다 상태 — rough(거친 바다)·storm(풍랑) 발생 확률
    seaConditionWeatherChance: {
      clear: { rough: 0.16, storm: 0.02 },
      rain: { rough: 0.48, storm: 0.16 },
      frost: { rough: 0.24, storm: 0.04 },
      heavySnow: { rough: 0.48, storm: 0.18 },
      blizzard: { rough: 0.35, storm: 0.55 },
      coldSnap: { rough: 0.36, storm: 0.1 },
      thawFlood: { rough: 0.4, storm: 0.1 },
    } as Record<WeatherId, { rough: number; storm: number }>,
    storminessStormChance: 0.1,
    storminessRoughChance: 0.18,
  },

  // 짐승 서식지 — 숲 크기로 정해지는 사냥감 비축량과 회복 속도.
  habitats: {
    reservePerForestTile: 3,
    reserveMin: 24,
    reserveMax: 180,
    recoveryPerDayRatio: 0.08,
    recoveryPerDayMin: 1.05,
    depletionLogCooldownDays: 8,
  },

  // 물 — 수맥의 배치·저수량과 우물 급수량, 시설별 하루 수요.
  water: {
    wellRadius: 6,
    riverCoverageRadius: 3,
    canalCoverageRadius: 1,
    aquiferInlandShare: 0.35,
    aquiferInlandAdditionRatio: 0.6,
    aquiferInlandMinRiverDistance: 9,
    aquiferMinSpacing: 8,
    startingAquiferRadius: 6,
    startingAquiferCapacity: 130,
    // 보통 수맥 하나가 평시 성인 약 30명분의 생활용수를 감당하되,
    // 복수 우물·산업 수요·가뭄이 겹치면 저장 수위를 소모하도록 맞춘 값.
    wellDailyOutput: 12,
    cisternRadius: 4,
    cisternCapacity: 30,
    cisternDailyOutput: 6,
    cisternRainFillPerDay: 8,
    cisternSnowFillPerDay: 3,
    cisternWinterOutputMultiplier: 0.5,
    cisternDroughtEvaporationPerDay: 1,
    cisternDryWarningCooldownDays: 6,
    aquiferBaseRecoveryPerDay: 9,
    aquiferRainRecoveryBonus: 6,
    aquiferSnowRecoveryBonus: 2,
    climateRecoveryFactor: 0.5,
    safeLevelRatio: 0.25,
    productionFloor: 0.5,
    unservedSickChance: 0.006,
    unservedMoralePenalty: 0.6,
    // 시설별 하루 물 수요
    demand: {
      housingPerBed: 0.3,
      tannery: 4,
      onggiKiln: 1.5,
      clinic: 2,
      stablePerHead: 0.25,
    },
  },

  // 시간 단위 — 계절·1년 길이와 배속별 하루 실시간.
  time: {
    seasonDays: 12,           // 한 계절 길이(일)
    yearDays: 48,             // 1년 = 4계절
    // 하루당 실시간(ms). 72서브틱에서도 기존 틱 간격과 주민 체감 이동 속도를 유지한다.
    // (1배 667ms/틱, 3배 222ms/틱, 10배 67ms/틱)
    msPerDay: { 1: 48000, 3: 16000, 10: 4800 } as Record<number, number>,
  },

  // 시야 — 주민·건물이 안개를 걷는 반경과 밤·날씨 보정.
  exploration: {
    residentRadius: 7,
    buildingRadius: 9,
    nightMult: 0.7,
    // 날씨별 시야 배율
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

  // 새 게임 시작 상태 — 개척민 수와 초기 물자. 난이도의 startRes 배율이 물자에 곱해진다.
  start: {
    residents: 12,
    // 시작 물자 (난이도 startRes 배율이 곱해진다)
    resources: {
      grain: 100, rice: 0, meat: 0, eggs: 0, milk: 0, fish: 0, curedMeat: 0, saltedFish: 0, driedFish: 0, vegetables: 0, kimchi: 0, beans: 0, jang: 0, salt: 0,
      brushwood: 12, firewood: 45, charcoal: 0,
      wood: 30, stone: 12, iron: 4, tools: 10, onggi: 0, carts: 0,
      // 건초 30: 첫 수확 전에도 짚신을 삼을 수 있게 실은 밑천이다.
      // 짚신 1켤레 = 건초 2(wearables.strawShoeHayPerUnit)이고, 시작 인구 12명이 맨발로 출발하므로
      // 12켤레 + 재고 여유분 2켤레(strawShoeStockBuffer) = 14켤레 → 건초 28. 여기에 마모 교체 1켤레분을 더해 30.
      hide: 6, hideClothes: 12, strawShoes: 0, leatherShoes: 0, cotton: 0, wool: 0, hay: 30, cottonClothes: 0, herbs: 5,
      porcelain: 0, brassware: 0, lacquerware: 0, silk: 0, preciousMetal: 0, silver: 0,
      gunpowder: 0, spears: 0, hornBows: 0, muskets: 0,
      reputation: 50, defense: 0,
    },
    // 시작 직업 구성은 폐지했다 — 개척민은 전원 무직으로 도착하고, 배분은 처음부터 플레이어의 몫이다.
    // (옛 분포: 벌목 2·사냥 2·농부 2·건축 2·운반 1·약초 1·파수 1·무직 1)
  },

  // 생존 요구 — 끼니·난방·의복이 하루에 포만도와 체온을 얼마나 올리고 깎는가.
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

  // 의복·신발 — 마모 속도와 착용 효과, 짚신 삼기와 건초 배분.
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

  // 건강 — 상태 이상이 주는 하루 체력 피해와 발병·회복 확률.
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

  // 의료 — 의원의 치료 처리량과 약초 소모, 역병·전술 부상 대응 보정.
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

  // 외부 세력 거점 — 배치 간격, 왕래·예물, 생활권 침범 분쟁, 산채 정찰과 수비.
  foreignSites: {
    minCenterDistance: 16,
    minSiteSpacing: 11,
    minRaidOriginDistance: 14,
    passageRevealRadius: 1,
    passageTradeCapacityMult: 1.2,
    passageTradeCooldownReduction: 2,
    giftGoodwill: 10,
    giftRelation: 3,
    giftFavor: 1,
    claimDailyInterval: 6,
    proximityClaimBufferTiles: 2,
    proximityWorkDays: 3,
    proximitySiteRadius: 3,
    proximityLoiterDays: 3,
    proximityPressureInterval: 4,
    violationWarningDelay: [2, 4] as const,
    violationCompensationGrain: 8,
    violationCompensationRelation: -1,
    violationApologyRelation: -3,
    violationIgnoreRelation: -8,
    banditScoutWarningBonus: 0.25,
    lairSuppressionDays: 18,
    // 산채 정찰 — 성공 확률의 가감 요인과 실패 시 산채 경계 상승
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
    // 산채 수비 — 진지 전력과 방침, 경계로 쌓이는 계략 점수
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
      // 산채 수비 무리별 전력 배분(base 합 1)과 방침별 가감
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

  // 특수 사건 — 등장 가중치와 재발 쿨다운(일), 사건별 판정 확률.
  // 맹수·산삼·멧돼지·역병·징발·표류선 등 하루 한 번 뽑히는 사건들의 몫이다.
  specialEvents: {
    secondEventChance: 0.5,
    wolfWeight: 5,
    tigerWeight: 2,
    ginsengWeight: 2,
    boarWeight: 4,
    grainRequisitionWeight: 2,
    shipwreckWeight: 2,
    gyrfalconWeight: 1.5,
    wolfCooldownDays: 48,
    tigerCooldownDays: 96,
    ginsengCooldownDays: 96,
    boarCooldownDays: 48,
    plagueCooldownDays: 72,
    livestockEpidemicCooldownDays: 72,
    grainRequisitionCooldownDays: 72,
    shipwreckCooldownDays: 72,
    earlyFrostCooldownDays: 48,
    lateFrostCooldownDays: 48,
    locustCooldownDays: 72,
    droughtCooldownDays: 72,
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
    plagueIsolationDays: 7,
    plagueObservationDays: 3,
    // 구 저장의 고정 기간형 역병 모달과 표시값을 이어 주는 호환 범위.
    // D7의 실제 종료는 disasters.epidemic.quietDaysToEnd를 사용한다.
    epidemicDays: [10, 14] as const,
    epidemicDeathChance: 0.018,
    physicianReputationCost: 6,
    physicianGrainCost: 18,
    physicianHerbCost: 8,
    gyrfalconWarningBonus: 0.25,
    ginsengTradeValue: 24,
    tigerPeltTradeValue: 18,
  },

  // 재해 — 사건별 발생 가중치와 진행·피해 수치.
  // occurrence* 계수는 그 해 기후(기온·강수·폭풍우) 편차를 가중치 배율로 옮기는 값이다.
  disasters: {
    // 이른 서리 — 가을 수확 직전. 조기 수확과 기다리기 중 하나를 고른다.
    earlyFrost: {
      occurrenceBaseWeight: 3,
      // temperatureAnomaly가 -1인 한랭 해에는 최대 1.45배, +1인 온난 해에는 0.55배다.
      occurrenceTemperatureCoefficient: -0.45,
      occurrenceMinMultiplier: 0.55,
      occurrenceMaxMultiplier: 1.45,
      observationDays: 4,
      failureFrostDays: 2,
      earlyHarvestYieldMultiplier: 0.55,
      failureGrowthMultiplier: 0.25,
      waitHarvestBaseClearChance: 0.57,
      waitHarvestTemperatureCoefficient: 0.15,
      waitHarvestMinClearChance: 0.42,
      waitHarvestMaxClearChance: 0.72,
    },
    // 늦서리 — 봄 파종 직후. 다시 심기와 기다리기 중 하나를 고른다.
    lateFrost: {
      occurrenceBaseWeight: 2.5,
      occurrenceTemperatureCoefficient: -0.4,
      occurrenceMinMultiplier: 0.6,
      occurrenceMaxMultiplier: 1.4,
      observationDays: 3,
      failureFrostDays: 2,
      waitReplantBaseClearChance: 0.57,
      waitReplantTemperatureCoefficient: 0.14,
      waitReplantMinClearChance: 0.42,
      waitReplantMaxClearChance: 0.72,
    },
    // 황충(메뚜기) — 며칠 동안 작물 성장도를 갉는다.
    locust: {
      occurrenceBaseWeight: 2.4,
      // 온난·건조한 해일수록 황충이 들기 쉽고, 같은 기후라도 연차 고유의 변덕을 남긴다.
      occurrenceTemperatureCoefficient: 0.28,
      occurrencePrecipitationCoefficient: -0.36,
      occurrenceMinMultiplier: 0.5,
      occurrenceMaxMultiplier: 1.65,
      annualVarianceMinMultiplier: 0.72,
      annualVarianceMaxMultiplier: 1.28,
      durationDays: [2, 5] as const,
      dailyGrowthLoss: 12,
    },
    // 가뭄 — 밭 성장과 어획이 줄고, 보(洑)·저수로 일부를 덜어낸다.
    drought: {
      occurrenceBaseWeight: 2.3,
      occurrenceTemperatureCoefficient: 0.12,
      occurrencePrecipitationCoefficient: -0.68,
      occurrenceMinMultiplier: 0.35,
      occurrenceMaxMultiplier: 1.8,
      triggerDryDays: 3,
      durationDays: [6, 12] as const,
      farmGrowthMultiplier: 0.45,
      irrigatedFarmGrowthMultiplier: 0.72,
      fishYieldMultiplier: 0.45,
      weirRadius: 6,
      reservoirTileCount: 2,
      reservoirFillDays: 3,
      reservoirSearchRadius: 2,
    },
    // 봄 홍수 — 해빙기 물이 지도를 덮는다. 침수 깊이·배수 일수와 건물·보 피해.
    springFlood: {
      triggerMinThawFloodDays: 2,
      deepFloodMinThawFloodDays: 3,
      shallowDepth: 1,
      deepDepth: 2,
      drainageDays: [1, 2] as const,
      cropGrowthLoss: 35,
      floodedBuildingDamageChance: 0.52,
      riverBuildingDamageChance: 0.3,
      weirBreachChanceShallow: 0.24,
      weirBreachChanceDeep: 0.46,
      fertileDepositChance: 0.28,
    },
    // 설해 — 연속 적설로 지붕이 내려앉는다. 집 종류별 붕괴 확률.
    snowDamage: {
      triggerConsecutiveSnowDays: 2,
      hutCollapseChance: 0.42,
      ondolCollapseChance: 0.12,
      alertDays: 1,
    },
    // 역병 — 전파·회복·사망 판정. 인구·과밀·노숙이 발생 배율을 올리고 약초·의원·격리가 낮춘다.
    epidemic: {
      summerOccurrenceMultiplier: 1.65,
      winterOccurrenceMultiplier: 0.7,
      populationReference: 24,
      populationMinMultiplier: 0.72,
      populationMaxMultiplier: 1.55,
      crowdingMinMultiplier: 0.85,
      crowdingMaxMultiplier: 1.5,
      homelessMultiplierPerResident: 0.08,
      homelessMaxMultiplier: 1.8,
      householdSpreadChance: 0.24,
      workplaceSpreadChance: 0.14,
      isolationHouseholdSpreadMultiplier: 0.25,
      herbSpreadMultiplier: 0.82,
      clinicSpreadMultiplier: 0.88,
      physicianSpreadMultiplier: 0.82,
      baseRecoveryChance: 0.08,
      herbRecoveryBonus: 0.1,
      clinicRecoveryBonus: 0.04,
      physicianRecoveryBonus: 0.06,
      isolationRecoveryBonus: 0.04,
      maxRecoveryChance: 0.48,
      herbDeathMultiplier: 0.75,
      clinicDeathMultiplier: 0.85,
      quarantineRefreshDays: 2,
      quietDaysToEnd: 2,
    },
    // 가축 역병 — 두수에 비례해 발생하고, 목동이 있으면 폐사·전파가 줄어든다.
    livestockEpidemic: {
      occurrenceBaseWeight: 2.5,
      headcountWeight: 0.35,
      dailyDeathChance: 0.14,
      unattendedDeathMultiplier: 1.35,
      herderDeathMultiplier: 0.58,
      spreadChance: 0.3,
      herderSpreadMultiplier: 0.42,
      recoveryChance: 0.1,
      herderRecoveryBonus: 0.18,
      minimumRecoveryDays: 2,
      cullRatio: 0.5,
    },
    // 화재 — 발화 확률(건조할수록 상승), 번짐과 진화(물통), 건물별 연소 속도.
    fire: {
      dailyIgnitionChance: 0.0025,
      precipitationCoefficient: -0.62,
      annualMinMultiplier: 0.5,
      annualMaxMultiplier: 1.8,
      dryDayBonus: 0.16,
      dryDayCap: 5,
      maxWaterSourceDistance: 12,
      bucketAmount: 0.35,
      initialIntensity: 0.85,
      intensityGrowthPerTick: 0.055,
      burnProgressPerIntensity: 0.12,
      waterSuppressionPerBucket: 1.05,
      spreadChancePerTick: 0.026,
      spreadRange: 1,
      damageBurnProgress: 3.4,
      maximumDurationDays: 6,
      maximumRespondersPerSite: 3,
      nitreExplosionBurnProgress: 0.8,
      nitreExplosionGunpowder: 3,
      nitreExplosionIntensity: 1.4,
      // 건물 종류별 연소 속도 배율
      burnProgressMultipliers: {
        hut: 1.2,
        ondol: 1,
        tileHouse: 0.58,
        charcoalKiln: 1.25,
        default: 1,
      } as Record<string, number>,
      // 건물 종류별 발화 지점으로 뽑힐 가중치
      sourceWeights: {
        nitreYard: 6,
        charcoalKiln: 5,
        onggiKiln: 4.5,
        smithy: 4,
        smokehouse: 3,
        hut: 1.4,
        ondol: 1.1,
        tileHouse: 0.35,
        default: 1,
      } as Record<string, number>,
      noIgnitionWeather: ['rain', 'thawFlood', 'heavySnow', 'blizzard'] as WeatherId[],
    },
    // 갱도 붕락 — 발생 확률과 사전 경고, 구조 방식(신속/신중)별 생존·2차 붕락.
    mineCollapse: {
      dailyBaseChance: 0.004,
      minimumRiskMultiplier: 0.35,
      maximumRiskMultiplier: 2,
      rainMultiplier: 1.8,
      thawFloodMultiplier: 2.7,
      warningChance: 0.64,
      warningLeadDays: [1, 3] as const,
      urgentRescueDays: 2,
      carefulRescueDays: 4,
      baseSurvivalChance: 0.96,
      dailySurvivalLoss: 0.1,
      survivorInjury: [24, 42] as const,
      urgentSecondaryCollapseChance: 0.3,
      urgentRescuerInjuries: [1, 2] as const,
      urgentRescuerInjurySeverity: 24,
      repairProgress: [0.28, 0.52] as const,
    },
    // 역병 의심 환자 — 사건으로 뽑힐 가중치와, 그 의심이 실제 역병일 확률.
    plagueSuspicion: {
      occurrenceBaseWeight: 3,
      // 온난·다습하고 궂은 해일수록 의심 환자가 사건 후보에 오를 가중치가 높다.
      occurrenceTemperatureCoefficient: 0.2,
      occurrencePrecipitationCoefficient: 0.25,
      occurrenceStorminessCoefficient: 0.15,
      occurrenceMinMultiplier: 0.55,
      occurrenceMaxMultiplier: 1.55,
      // 의심 증상이 실제 역병일 확률. 발생 가중치보다 좁은 범위로 제한한다.
      realBaseChance: 0.42,
      realTemperatureCoefficient: 0.06,
      realPrecipitationCoefficient: 0.08,
      realStorminessCoefficient: 0.04,
      realMinChance: 0.28,
      realMaxChance: 0.56,
    },
  },

  // 생산 — 직업별 하루 산출과 변환비(원료 몇 → 산물 1), 시설 보너스, 숙련.
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
    // 가공에 손대지 않고 남겨두는 원료 재고 — 이 수량을 넘는 분만 가공에 쓴다.
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
    saltPerDay: 0.75,
    firewoodPerSalt: 1.25,
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

  // 발효 — 장·김치를 옹기 단위로 담근다. 옹기 1개당 투입·산출과 숙성 일수, 담그는 철.
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
    // 김장 규모별 옹기 수
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
    // 자원별 1회 적재량
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
      chop: 4, hunt: 5, herb: 3, mine: 4, fish: 4,
      herd: 5,
      harvestPerSubtick: 8,   // 가을 수확: 서브틱당 깎는 성장도
      growPerSubtick: 1.4,    // 봄여름 농사: 서브틱당 올리는 성장도
      buildPerSubtick: 0.2,   // 건축가 서브틱당 공정 (건축가-일 환산)
    },
    yields: {                 // 1회 채집으로 지는 짐
      wood: 1.25, game: 0.75, herbs: 0.55, iron: 1.2, mineStone: 0.4, stone: 1.1, fish: 1.2,
      silver: 0.5,
    },
    // 3틱·12%에서 4틱·8%로 조정 — 시간당 성목 고갈은 이전의 정확히 절반.
    forestDepleteChance: 0.08, // 벌목 1회당 성목이 그루터기가 될 확률
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
      // 사냥감 — 등장 가중치(weight)와 1마리당 고기·가죽
      prey: {
        rabbit: { weight: 0.30, meat: 2, hide: 0.25 },
        pheasant: { weight: 0.25, meat: 1.5, hide: 0 },
        roeDeer: { weight: 0.30, meat: 4, hide: 1 },
        wildBoar: { weight: 0.15, meat: 12, hide: 3.5 },
      },
    },
  },

  // 계절 배율 — 소비·채집량에 곱한다.
  seasons: {
    firewoodMult: { spring: 0.9, summer: 0.5, autumn: 1.35, winter: 3 },
    woodMult:     { spring: 1, summer: 1.3, autumn: 1.1, winter: 0.7 },
    gameMult:     { spring: 1.25, summer: 1, autumn: 1.1, winter: 0.5 },
    fishMult:     { spring: 1.2, summer: 1.15, autumn: 0.9, winter: 0.45 },
  },

  // 가축 — 종별 사육 정원·사료·번식·산물과 도축 수확. 축사 1동 기준이다.
  livestock: {
    initialUnlocked: ['chicken'] as LivestockId[],
    hayPerHarvestProgress: 0.1,
    // 닭 — 곡물을 먹고 달걀을 낸다. 방목하지 않는다.
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
    // 염소 — 건초를 먹고 젖을 낸다. 겨울 외에는 방목한다.
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
    // 양 — 건초를 먹고 양털을 낸다.
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
    // 돼지 — 곡물을 먹고 산물은 없다. 도축 고기가 많다.
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
    // 소 — 건초를 먹고 젖을 낸다. 농우로도 쓰인다.
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
    // 말 — 건초를 먹고 산물은 없다. 기마·원정에 쓰인다.
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

  // 방목지 — 구역 크기와 목동 1인 담당 칸수, 가축별 칸당 사육 가능 두수.
  pasture: {
    maxSide: 6,
    tilesPerHerder: 8,
    visibleAnimalLimit: 12,
    // 가축별 칸당 사육 가능 두수
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
    // 품목별 하루 부패율
    dailyRate: {
      fish: 0.06,
      meat: 0.04,
      eggs: 0.025,
      milk: 0.05,
      vegetables: 0.015,
    },
    // 계절별 부패 배율
    seasonMult: {
      spring: 0.9,
      summer: 1.4,
      autumn: 1,
      winter: 0.25,
    } as Record<Season, number>,
    cellarCapacity: 36,
    cellarRateMult: 0.3,
  },

  // 날씨 — 계절별 발생 확률표와 연간 기후 반영, 날씨별 작업·난방·체온 보정.
  weather: {
    // 계절별 날씨 확률 (합 1)
    table: {
      spring: { clear: 0.5, rain: 0.25, frost: 0.1, thawFlood: 0.1, heavySnow: 0.05, blizzard: 0, coldSnap: 0 },
      summer: { clear: 0.65, rain: 0.3, frost: 0.05, thawFlood: 0, heavySnow: 0, blizzard: 0, coldSnap: 0 },
      autumn: { clear: 0.5, rain: 0.2, frost: 0.2, heavySnow: 0.1, blizzard: 0, coldSnap: 0, thawFlood: 0 },
      winter: { clear: 0.35, frost: 0.15, heavySnow: 0.2, blizzard: 0.15, coldSnap: 0.15, rain: 0, thawFlood: 0 },
    } as Record<string, Record<string, number>>,
    // 연간 기후(기온·강수·폭풍우) 편차를 그날 날씨 확률로 옮기는 계수
    schedule: {
      precipitationAnomalyFactor: 0.45,
      temperatureColdFactor: 0.4,
      temperatureWarmFactor: 0.25,
      storminessFactor: 0.4,
      // 해빙 홍수는 직전 겨울에 예정된 적설일과 현재 봄 기온으로만 정한다.
      // 1년차에는 normalWinterSnowDays를 직전 겨울 적설 대신 사용한다.
      thawFlood: {
        normalWinterSnowDays: 4,
        snowDayFactor: 0.35,
        temperatureAnomalyFactor: 0.65,
        maxDays: 4,
      },
      seasonalJitterWeights: { minusOne: 0.15, zero: 0.7, plusOne: 0.15 },
      yearSeedMultiplier: 0x85ebca6b,
      seasonSalts: {
        spring: 0x1b56c4e9,
        summer: 0x2d8f31a7,
        autumn: 0x4a72e6d3,
        winter: 0x6c05b91f,
      },
      streamSalts: {
        thawFlood: 0x1020304,
        precipitationTotal: 0x2131415,
        precipitationSplit: 0x3242526,
        nonPrecipitationSplit: 0x4353637,
        runs: 0x5464748,
      },
      // 같은 날씨가 이어질 수 있는 최대 연속일
      runMax: {
        clear: 3,
        rain: 3,
        frost: 3,
        heavySnow: 2,
        blizzard: 2,
        coldSnap: 2,
        thawFlood: 2,
      },
    },
    // 날씨별 실외 작업 효율
    outdoorMult: { clear: 1, rain: 0.8, frost: 0.9, heavySnow: 0.5, blizzard: 0.15, coldSnap: 0.6, thawFlood: 0.5 },
    // 날씨별 장작 소비 배율
    firewoodMult: { clear: 1, rain: 1.1, frost: 1.2, heavySnow: 1.4, blizzard: 1.8, coldSnap: 1.7, thawFlood: 1 },
    // 날씨별 체온 손실 배율
    warmthLossMult: { clear: 1, rain: 1.05, frost: 1.2, heavySnow: 1.3, blizzard: 1.8, coldSnap: 1.7, thawFlood: 1 },
  },

  // 연간 기후는 저장하지 않고 세계 시드·연차에서 재생성한다. 축별 salt를 분리해
  // 후속 축을 추가하거나 한 축의 난수 소비를 바꿔도 기존 축 값이 흔들리지 않게 한다.
  climate: {
    annualSalts: {
      temperature: 0x2f6e2b1,
      precipitation: 0x51a9d73,
      storminess: 0x7c3d5e9,
    },
    yearSeedMultiplier: 0x9e3779b1,
  },

  // 위협도 — 습격을 부르는 게이지. 하루 증감 요인과 습격 발생 판정·조기 경보.
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

  // 습격 — 무리 전력 산정, 방어 기여(무장별), 지도 위 접근과 교전 결과·피해.
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
    powderPerCannon: 2,        // 교전당 불랑기포·지자총통 1문 화약 소모
    cannonBattleMult: 1.2,     // 포대 가동 시(화약 보유) 전투 방어 배율
    chongtongBattleMult: 1.1,  // 총통 포대 가동 시 전투 방어 배율
    cannonBombardmentLossRate: 0.06,    // 사전포격 때 불랑기포 1문당 적 손실률
    chongtongBombardmentLossRate: 0.03, // 사전포격 때 지자총통 1문당 적 손실률
    levyDefensePerResident: 4, // 징집된 일반 주민 1인당 방어 기여 (수비병 12, 파수꾼 6과 비교)
    warnedDefenseMult: 1.25,
    // 지도 위 습격 무리 이동
    raiderSpeedWarned: 1.2,   // 경보된 습격: 천천히 접근 (대비 시간)
    raiderSpeedSurprise: 2.0, // 기습: 빠르게 들이닥침
    spotDistance: 12,         // 이 거리 안이면 경계병이 발견 로그를 띄움
    arriveDistance: 6,        // 중심지에서 이 거리면 대응 선택 모달 발생
    siegeDefenseMult: 1.15,   // 목책이 무리를 막아섰을 때 방어 보정
    // 이겨도 다치는 확률 — garrison(수비병·파수꾼)/levy(징집 주민)
    victoryInjuryChance: { garrison: 0.35, levy: 0.6 },
    defeatDeathRate: { garrison: 0.12, levy: 0.12 }, // 패배 시 전투 참가자 1인당 전사 확률
    // 상황별로 부서지는 건물 수
    buildingDamage: {
      shelter: 1,
      villageVictory: 1,
      interceptDefeat: 2,
      villageDefeat: 3,
    },
    repairProgressMin: 0.35,  // 파손 직후 남는 공정률 하한
    repairProgressMax: 0.6,   // 파손 직후 남는 공정률 상한
  },

  // 습격 경로 — 지형 통행 비용과 성벽 돌파(내구도·피해), 보수 자재.
  raidPathing: {
    matureForestCostMultiplier: 1.8,
    // 무리 규모별 우회 허용 배율 — 작을수록 돌파보다 우회를 택한다
    detourRatio: { small: 2.0, medium: 1.5, large: 1.2 },
    // 성벽 종류별 내구도
    integrityMax: { palisade: 60, earthFort: 150, stoneWall: 260 },
    // 성벽 종류별 돌파 비용 배율
    breachCostMultiplier: { palisade: 1, earthFort: 1.5, stoneWall: 2.2 },
    breachDamagePerPower: 1 / 30,
    minimumBreachDamage: 0.5,
    // 날씨별 돌파 진행 배율
    breachWeatherMultiplier: {
      clear: 1, rain: 0.85, frost: 1, heavySnow: 0.75,
      blizzard: 0.55, coldSnap: 0.75, thawFlood: 0.85,
    },
    // 성벽 1칸 보수 자재
    repairCost: {
      palisade: { wood: 2 },
      earthFort: { wood: 3, stone: 3 },
      stoneWall: { stone: 4, tools: 1 },
    },
    repairBuildDaysMultiplier: 0.5,
  },

  // 망루 — 사거리·사격 주기와 접근하는 무리에 주는 피해·둔화, 자체 내구도.
  watchtower: {
    range: 7,
    integrityMax: 80,
    escapeIntegrityRatio: 0.25,
    fireIntervalTicks: 6,
    projectileDurationTicks: 5,
    baseDamage: 0.45,
    bowDamage: 0.8,
    dailyDamageCap: 5,
    bowDailyDamageCap: 7,
    suppressionTicks: 7,
    suppressionSpeedMultiplier: 0.82,
    assaultDamagePerPower: 0.012,
    minimumAssaultDamage: 0.7,
    escapeGraceTicks: 10,
  },

  // 포위 — 적 보급 일수와 약탈량, 성벽 압박과 항복·격퇴 처리.
  siege: {
    evacuationTicks: 36,
    baseEnemySupplyDays: 5,
    powerPerSupplyDay: 18,
    maxEnemySupplyDays: 14,
    dailySupplyBurn: 1,
    // 계절별 적 보급 소모 배율
    seasonBurnMultiplier: { spring: 1, summer: 0.9, autumn: 1.05, winter: 1.45 },
    // 날씨별 적 보급 소모 배율
    weatherBurnMultiplier: {
      clear: 1, rain: 1.1, frost: 1.15, heavySnow: 1.3,
      blizzard: 1.6, coldSnap: 1.45, thawFlood: 1.15,
    },
    dailyPlunderCap: 8,
    inventoryPlunderCap: 5,
    plunderMoveStepsPerDay: 8,
    fieldSupplyPerGrowth: 0.035,
    livestockSupplyPerHead: 0.75,
    plunderSupplyPerFood: 0.16,
    // 약탈 대상 저장 건물의 무게 — 클수록 많이 털린다
    storageCapacityWeight: { center: 4, storehouse: 12, cellar: 8 },
    plunderPriority: [
      'grain', 'rice', 'hay', 'meat', 'fish', 'eggs', 'milk', 'vegetables', 'beans',
      'firewood', 'brushwood', 'tools', 'hide', 'wood', 'iron', 'stone',
    ] as ResourceId[],
    // 농성 태세별 성벽 내구도 하루 감소 — wall(성벽에서 맞선다)/hold(안에서 버틴다)
    wallPressureDamage: { hold: 10, wall: 6 },
    wallAttackerLossPerDefense: 0.025,
    wallDefenderInjuryChance: 0.18,
    coldNoFuelHealthLoss: 3,
    coldNoFuelMoraleLoss: 6,
    surrenderResourceLoss: 0.32,
    repelledLootRecovery: 0.6,
  },

  // 전술 전투 — 직접 지휘하는 전장. 사냥 몰이, 부대 상성·배치·지원, 적 계략까지 한 묶음이다.
  // 전력(power) 계열은 서로 견주는 상대값이고, *Multiplier는 그 전력에 곱하는 배율이다.
  tacticalBattle: {
    maxRounds: 5,
    wallStageMaxRounds: 3,
    // 사냥 몰이 — 매복 일격과 포위, 짐승의 판단(돌파·재은신)까지.
    hunt: {
      maxEngagements: 8,
      baitMeatCost: 3,
      // 매복 일격 — 명중 확률과, 실패했을 때의 다중 손실·사망 확률.
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
      // 포위도 — 몰이로 쌓는 값. 짐승을 궁지에 몰아넣는 눈금이다.
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
      // 짐승 판단 — 돌파·매복을 결심하는 포위도·노출도 문턱값.
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
      // 구역 — 몰이 구역의 봉쇄 판정과 열린 쪽으로 달아날 확률.
      sectors: {
        blockadeThreshold: 4,
        holeGainMultiplier: 0.5,
        openEscapeRounds: 2,
        openEscapeEncirclementMin: 10,
        openEscapeChance: 0.45,
      },
      // 수색 — 숨은 짐승을 찾아낼 확률.
      search: {
        baseChance: 0.16,
        perDriveGroup: 0.08,
        perHunterGroup: 0.12,
        hunterSkillMultiplier: 0.24,
        minChance: 0.08,
        maxChance: 0.92,
      },
      // 돌파 — 짐승이 봉쇄를 뚫을 확률.
      breakout: {
        baseSuccessChance: 0.68,
        blockadePenaltyPerPower: 0.018,
        minSuccessChance: 0.08,
        maxSuccessChance: 0.90,
      },
      // 반격 — 짐승이 되받아칠 때의 피해 배율.
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
    // 배치 — 편성 가능한 부대 수와 사전 침투 비용.
    deployment: {
      maxCohortGroups: 3,
      maxCommandableGroups: 10,
      featuredSpriteScale: 1.15,
      preInfiltrationCost: 2,
    },
    // 병종 상성 — 공격 쪽 전력·방어 쪽 저항에 곱하는 배율.
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
    // 지원 부대 — 화포·화차의 사격 횟수와 재장전, 의무병의 회복 몫.
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
    // 적 방침 AI — 의도를 유지하는 최소 라운드.
    doctrineAi: {
      minIntentRounds: 2,
    },
    // 진형 노출 — 방향·전면·후방 기습에 따라 부대가 받는 피해 배율.
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
    // 조준 — 열(전열·중열·후열)별 사격 효율과 화력 집중 상한.
    targeting: {
      musketLineEfficiency: { front: 1, middle: 1, rear: 0 },
      musketScreenedEfficiency: 0.65,
      musketPreparedScreenedEfficiency: 0.8,
      bowLineEfficiency: { front: 1, middle: 0.9, rear: 0.75 },
      concentration: { melee: 0.85, musket: 0.8, bow: 0.65 },
      maxFocusedLossShare: 0.7,
    },
    // 전투 준비 점수 — 경보·봉수대·망루·파수꾼으로 쌓고, 적 계략을 상쇄하는 데 쓴다.
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
    // 우회로 — 측면 길을 막거나 뚫는 준비 비용과 교전 결과.
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
    // 부대 1인당 기본 전력 — 무장·역할별.
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
    // 습격 무리 기본 배분 — main(본대)/looters(약탈조)/flankers(우회조)
    raiderSplit: { main: 0.55, looters: 0.25, flankers: 0.2 },
    // 적 작전 — 목표(돌파·약탈·방화) 선택과 계략 점수·비용·효과.
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
    // 전투 시작 사기
    morale: { village: 70, warnedBonus: 8, siegeBonus: 4, raiders: 72 },
  },

  // 교역 — 방문 주기, 품목별 교역량 한도(계절·승격 보정)와 흥정, 정기거래 계약.
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
    // 품목별 기준 교역량 — 계절·승격 배율이 곱해진다
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
    // 계절별 교역량 배율 (적히지 않은 품목은 1)
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
    // 승격 단계별 교역량 배율
    capacityRankMult: {
      settlement: 1,
      bo: 1.2,
      jin: 1.45,
      bu: 1.75,
    } as Record<Rank, number>,
    dockCapacityMult: 2,

    // 정기거래 계약 — 성사된 협상 조건을 연 단위로 잠근다.
    // 새 밸런스 축을 만들지 않고 우호도·교역량·계절 배율에 전부 얹는다.
    contract: {
      minRelation: 45,        // 이보다 낮으면 연 계약 자체가 불가 ("낯선 상대와 연 계약은 없다")
      maxPerFaction: 2,       // 같은 세력과 동시에 맺을 수 있는 계약 수
      maxCapacityShare: 0.5,  // getAmt 상한 = 체결 시점 그 계절 교역량 총량의 절반
      discountMinRelation: 60, // 이 우호도부터 계약 할인이 붙는다
      discount: 0.95,         // 스팟 협상보다 소폭 유리한 배율 — 폭을 작게 유지한다
      graceDays: 3,           // 물량 부족 시 실행 계절 첫날부터 이만큼은 기다려 준다
      breakStreak: 2,         // 연속 불이행이 이만큼 쌓이면 계약 파기
      // 체결 시 우호도가 정하는 기간 (높은 구간부터 검사)
      durations: [
        { minRelation: 75, minYears: 6, maxYears: 7 },
        { minRelation: 60, minYears: 4, maxYears: 5 },
        { minRelation: 45, minYears: 2, maxYears: 3 },
      ],
      relationFulfill: 1,     // 한 해분을 이행하면 우호도가 소폭 오른다
      relationMiss: 4,        // 유예까지 못 채우면 위약으로 하락
      relationBreak: 6,       // 파기 시 추가 하락
      relationCancel: 8,      // 플레이어 중도 해지 위약
    },
  },

  // 겁박 요구 — 습격 무리가 물러가는 대가로 부르는 양과, 응했을 때 치르는 값.
  extortion: {
    powerAmountDiv: 22,
    payThreatReduction: 25,
    payReputationLoss: 1,
    payMoraleLoss: 4,
  },

  // 조정 세공(歲貢) — 봄 첫날 공지, 겨울 첫날 수거.
  // 장작은 걷지 않는다. 곡물은 먹을 수도 바칠 수도 있어 밭 확장과 비축 판단을 압박한다.
  tribute: {
    // 첫 해는 정착이 우선이라 조정이 거두지 않는다 — 세공은 이 연차의 봄부터 시작한다 (R4).
    // 첫 해 겨울 수거도 courtTribute가 없으니 자연히 없다.
    firstYear: 2,
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
    // 은 대납 — 요구 품목의 교역 가치 총합을 은 시세로 환산해 한 번에 치른다
    silverPayMarkup: 1.1,           // 환산가에 얹는 웃돈 (조정 몫의 예우)
    silverPayRepBonus: 2,           // 현물 납부 대비 추가 명성
    silverPaySuspicionDecayMult: 1.5, // 은까지 바치는 성실함 — 의심을 더 깊이 씻는다
  },

  // 격년 세공 완납 하사품 — 후보표는 courtGrants.ts에, 공통 추첨 상수는 여기 둔다.
  courtGrants: {
    extraPracticalChance: 0.4,
    advancedChance: 0.35,
    yearScalePerYear: 0.08,
    yearScaleMax: 1.8,
    rngYearSalt: 9203,
    rngSeedOffset: 5,
    artifactChance: 0.12,
    artifactPityMisses: 4,
    artifactRngYearSalt: 17107,
    artifactRngSeedOffset: 43,
    reliefGrainVoucherAmount: 48,
    skillArtifactGainMultiplier: 1.15,
    telescopePreparationPoints: 2,
    jijaChongtongPowderAward: 6,
    chongtongPowderSupportWeight: 8,
    artifactWeaponPowerMultiplier: 1.25,
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
    weddingFeastMorale: 6,       // 잔치 시 전 주민 민심
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
    productionMinMult: 0.8,                // 민심 0의 자원 산출·치료 배율
    productionMaxMult: 1.2,                // 민심 100의 자원 산출·치료 배율
    birthMinMult: 0.5,                     // 민심 0의 출산 확률 배율
    birthMaxMult: 1.5,                     // 민심 100의 출산 확률 배율
    departureThreshold: 25,                // 이 미만부터 주민 이탈 위험 발생
    departureDailyMaxChance: 0.015,        // 민심 0에서 정착지 단위 일일 최대 이탈 확률
    departureMinimumRemainingPopulation: 3, // 이탈 뒤 최소 잔류 인구
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
    namedShamanCheerBonus: 2,              // 월향의 큰굿 — 일반 후계 무당에게는 없음
    promotionCheer: 8,                     // 승격 직후 완충 버프
    promotionCheerDays: 12,
    legacyTransitionCheer: 8,              // 구저장 고티어가 새 기대에 적응하는 동안의 별도 완충
    legacyTransitionDays: 12,
    monkGriefRelief: 3,                    // 노승 상주 시 사망 민심 하락 6 → 3
    monkBurialBonus: 2,                    // 노승 상주 시 안장 위로 +2
    namedMonkGriefRelief: 2,               // 해운의 천도재 — 일반 후계 승려보다 강함
    namedMonkBurialBonus: 3,
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
    // 모민령(募民令) — 무작위 유민·귀순 제안 빈도. 직접 초청·조정 모민은 건드리지 않는다.
    immigration: {
      generous: { chanceMult: 1.75, morale: -1, rejectionReputationMult: 1.5 },
      tight: { chanceMult: 0.4, morale: -3, rejectionReputationMult: 1 },
    },
    // 방화령(防火令) — 불씨 단속과 화기 작업장 규제.
    fireCode: {
      tight: { ignitionMult: 0.55, spreadMult: 0.7, fireWorkMult: 0.9, morale: -2 },
    },
    // 야금령(夜禁令) — 저녁 마실을 막고 귀가 뒤 가내수공업을 독려한다.
    curfew: {
      tight: { homeCraftMult: 1.5, stockBufferPerResident: 0.25, morale: -4 },
    },
    // 휼로령(恤老令) — 60세 이상 노동을 덜 시키고 노환·질병 위험을 낮춘다.
    elderCare: {
      generous: { elderLaborMult: 0.6, oldAgeDeathMult: 0.5, sicknessMult: 0.65, morale: 2 },
    },
    // 부역령(賦役令) — 건축가·운반꾼만 저녁 초반까지 연장 근무한다.
    corvee: {
      tight: { eveningSubticks: 5, healthLossPerSubtick: 0.04, morale: -5 },
    },
  },

  // 종교인 등장 — 네임드가 갈래를 열고, 이후에는 신맥·법맥 후계자가 시설을 잇는다.
  religion: {
    minRank: 'jin' as Rank,
    dailyChance: 0.02,
    declineRetryDays: 36,   // 거절해도 훗날 다시 문을 두드린다
    mudangAge: 44,
    nosungAge: 62,          // 노승은 자연사 시계도 함께 돈다
    mudangSuccessionAge: 55,
    monkNoviceMentorAge: 55,
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
    unburiedMoralePerDay: 1.5,   // 방치 시신이 있는 날의 전 주민 민심 하락
    burialMoraleRelief: 3,       // 안장 시 전 주민 민심 회복 (장례의 위로)
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

  // 외교 활동 — 사절·예물(A1)과 습격 귀띔(A3)의 수치를 여기서 한 번에 조절한다.
  diplomacy: {
    envoyTravelDays: 6,
    giftRelationGainScale: 2,
    giftRelationGainMax: 18,
    repeatGiftYearMultiplier: 0.5,
    giftSuspicion: 1.5,
    raidTipRelation: 70,
    pactRelationRequired: 60,
    pactGiftValueMin: 12,
    pactSuspicion: 6,
    pactBreakRelationLoss: 25,
    pactBreakThreat: 12,
    // 생활권 협정은 은 가치 4에서 시작해 구역 반경만큼 더 들고, 관계 100일 때 절반까지 낮아진다.
    claimAccordBaseValue: 4,
    claimAccordRadiusValue: 2,
    claimAccordMinimumRelationMultiplier: 0.5,
    aidRelationRequired: 80,
    aidSuspicion: 15,
    aidBaseWarriors: 3,
    aidMaxWarriors: 5,
    aidGrainPerWarrior: 4,
    aidMeatPerWarrior: 2,
    warDispatchDays: 10,
    warDispatchRelationGain: 16,
    warDispatchOpposingRelationLoss: 18,
    warDispatchSuspicion: 8,
    warDispatchDeclineRelationLoss: 1,
  },

  // 임기제 북병사 성향(F2) — 부족 지도자 성향은 수치에 닿지 않는다.
  borderCommanderEffects: {
    strictSuspicionRiseMultiplier: 1.15,
    strictGrantRankShift: 1,
    greedyPetitionReputationMultiplier: 1.25,
    greedyGrantRankShift: -1,
    lenientSuspicionDecayMultiplier: 1.25,
    tacticianPetitionResourceMultiplier: 1.25,
    tacticianThreatDecayMultiplier: 1.15,
  },

  // 이주민 유입 — 도착 확률과 일행 규모, 돌려보낼 때의 명성 손실.
  immigration: {
    dailyChance: 0.12,
    cooldownDays: 8,
    groupMin: 2,
    groupMax: 5,
    rejectReputation: 2,
  },

  // 귀순자 — 북방에서 넘어오는 무리의 유입 조건, 의심 부담, 출신별 전력 기여와 말 헌납.
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

  // 기마 — 말을 탄 인원의 전투·추격·원정 이동 보정.
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
    // 수월 — 물자가 넉넉하고 습격이 약하다
    easy: {
      name: '이주민', tag: '수월',
      desc: '물자가 넉넉하고 국경이 비교적 조용합니다. 처음 오는 이에게.',
      startRes: 1.5, threatGain: 0.7, raidPower: 0.8, habitatChance: 0.85,
    },
    // 표준 — 설계된 기본 난이도
    normal: {
      name: '개척민', tag: '표준',
      desc: '설계된 기본 난이도. 첫 겨울과 첫 습격이 당신을 시험합니다.',
      startRes: 1, threatGain: 1, raidPower: 1, habitatChance: 0.65,
    },
    // 혹한 — 물자가 빠듯하고 습격이 사납다
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

  // 정착지 개칭 — 파발이 한양을 왕복하는 행정 절차 (docs/DESIGN-2026-07-29-chronicle-screen.md §1-1)
  settlementNaming: {
    renameTravelDays: 12,  // 조정 청원과 같은 한 계절 왕복 감각
  },

  // 조정 청원 — 명성을 소모해 조정 지원 물자를 받는다 (승격 단계 ≥ 보, 계절당 1회)
  petition: {
    cooldownDays: 12,  // 분기(계절)당 1회
    // 진(鎭) 이상은 봄마다 화약이 소량 정기 지급된다 (의도적으로 부족하게 — 단계 3의 긴장 기반)
    yearlyPowder: { settlement: 0, bo: 0, jin: 2, bu: 4 },
    luxuryMorale: 15,  // 사치품(비단·소금) 하사 시 전 주민 민심 상승
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
    // 뇌물 — 어사에게 내주는 물자
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
    // 부(府) 승격 조건
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

  // 길잡이(튜토리얼) 전용 수치 — 통제 사건과 겨울 점검 기준.
  // 기후 시스템은 건드리지 않는다: 혹한은 그날의 소모만 올리는 연출이다.
  tutorial: {
    coldSnapDayOfWinter: 4,      // 겨울 n일째 아침에 한 번 발화
    coldSnapFirewoodMult: 1.3,   // 발화한 날 하루치 장작 소모 배율
    sownAreaGoal: 4,             // 봄 파종 스텝: 배치해야 할 밭 면적(칸)
    // 겨울 점검 패널의 넉넉함 권장선. 길잡이 스텝은 패널 열기만 필수이며 이 값으로 진행을 막지 않는다.
    // 2026-07-31 실측(길잡이 시드, 인구 12): 시작 곳간만으로 이미 식량 25.0일분·장작 18.2일분이라
    // 옛 값(18/14)은 아무것도 하지 않아도 달성되는 죽은 목표였다. 모범 답안이 9단계에 닿는
    // 시점의 실측은 식량 42.6일분·장작 22.7일분이고, 장작 일분은 그 뒤로 하루 0.3일분씩 줄어든다.
    foodDaysGoal: 30,            // 겨울 12일 + 봄 전반까지 내다보는 넉넉함 권장선
    firewoodDaysGoal: 24,        // 겨울 12일의 두 배에 해당하는 넉넉함 권장선
    meatGoal: 6,
    winterEndDayOfSeason: 10,    // 첫 겨울 스텝 완료일 (겨울 n일째)

    // ── 둘째 해(R5) ──
    hideClothesMadeGoal: 2,      // 11단계: 가죽공방이 실제로 지어낸 가죽옷 수 (시작 재고와 섞이지 않는다)
    // 13단계: 채광꾼이 지표 노두에서 캐낸 돌·철의 합. 2026-08-01 실측(길잡이 시드, 채광꾼 1명)
    // 하루 약 1.8~2.0 — 나흘이면 닿는 눈금이다. 채광장 없이 캐는 것을 보이는 데 그 정도면 족하다
    mineralsMinedGoal: 8,
    toolsCraftedGoal: 3,         // 14단계: 대장간이 지어낸 도구 수. 시작 철 6(쉬움 배율)로 6개까지 가능하다
    immigrantRetryDays: 4,       // 12단계: 유민을 돌려보냈을 때 다시 찾아오기까지의 날수
    scriptedRaidPower: 8,        // 16단계: 통제 습격의 전력. 8단계의 목책·수비병·파수꾼으로 감당할 규모
    scriptedRaidFaction: '변경 마적', // 가장 사이가 나쁜 무리 — 협정이 걸릴 일이 없다
  },

  ui: {
    logLimit: 120,
    tileSize: 28, // 지도 칸 픽셀 크기 (렌더/히트판정 전부 이 값을 따른다). 지도는 드래그로 이동.
  },
} as const;

type Config = typeof CONFIG_DEFAULTS;

// ── 오버레이 병합 ───────────────────────────────────────────────────────
// **이 자리가 중요하다.** 다른 모듈은 import 시점에 값을 읽어가기도 하므로
// (`const TILE = CONFIG.ui.tileSize` 같은 모듈 최상위 대입), 병합은 config.ts 본문 안에서 끝난다.
// ESM은 import된 모듈 본문을 소비자 본문보다 먼저 끝까지 실행하므로 순서가 보장된다.
// 오버레이가 비어 있으면 기본값의 깊은 복사본 = 도입 이전과 완전히 같은 값이다.
export const CONFIG: Config = applyBalanceOverrides(cloneBalanceTree(CONFIG_DEFAULTS), '');
