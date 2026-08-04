// Kenney Roguelike/RPG Pack (CC0) 기반 스프라이트 아틀라스 구현
// 출처: https://kenney.nl/assets/roguelike-rpg-pack , https://kenney.nl/assets/roguelike-characters
// 라이선스: Creative Commons Zero (퍼블릭 도메인) — 저작자 표기 불필요(감사 표기 권장)
//
// 시트 규격: 16x16 타일, 1px 간격 (pitch 17)
// 이미지가 로드되기 전에는 placeholderSprites가 대신 쓰인다 (getActiveSprites 참고).
import {
  placeholderSprites,
  type BuildingDamageDrawParams,
  type BuildingDrawParams,
  type ExpeditionDrawParams,
  type ForeignStructureDrawParams,
  type GroundBlendKind,
  type RaiderDrawParams,
  type ResidentDrawParams,
  type SpriteAPI,
  type TerrainDrawParams,
} from './sprites';
import {
  LIVESTOCK_SHEETS,
  livestockSourceRect,
  type LivestockSheet,
} from './livestockAssets';
import {
  CORPSE_COFFIN_SPRITES,
  type CorpseCoffinSprite,
} from './corpseCoffinAssets';
import {
  FISHING_BOAT_SHEET,
  fishingBoatSourceRect,
  type FishingBoatVisualState,
} from './fishingBoatAssets';
import {
  FISHING_PORT_HOUSE_SHEET,
  FISHING_PORT_HOUSE_WINTER_SHEET,
  FISHING_PORT_PIER_SHEET,
  FISHING_PORT_PIER_WINTER_SHEET,
  fishingPortHouseSourceRect,
  fishingPortPierPart,
  fishingPortPierSourceRect,
} from './fishingPortAssets';
import {
  COASTAL_GROUND_SHEET,
  coastalGroundSourceRect,
} from './coastalGroundAssets';
import {
  TIDAL_FISHERY_BUILDING_SHEET,
  tidalFisheryBuildingSourceRect,
} from './tidalFisheryBuildingAssets';
import {
  SALTWORKS_BUILDING_SHEET,
  saltworksBuildingSourceRect,
} from './saltworksBuildingAssets';
import {
  BOATYARD_BUILDING_SHEET,
  boatyardBuildingSourceRect,
} from './boatyardBuildingAssets';
import {
  GENERATED_CHARACTER_SHEET,
  generatedCharacterFacingScale,
  generatedMountedRaiderSourceRect,
  generatedResidentSourceRect,
} from './generatedCharacterAssets';
import { CONFIG } from '../game/config';
import { FACTIONS, JOB_COLORS } from '../game/constants';
import { isGateBuilding, isWallBuilding } from '../game/walls';
import type {
  BuildingTypeId, FishingBoatFacing, FishingPortPierDirection, JobId, Season, Terrain,
} from '../game/types';
import {
  historicalTerrainSourceRect,
} from './historicalTerrain';
import {
  RIVER_AUTOTILE_SIZE,
  RIVER_BANK_COLORS,
  RIVER_BANK_INSET,
  RIVER_BANK_STRIP,
  riverFillSourceRect,
  riverLandCorners,
  riverRoundedCorners,
  riverWaterBox,
} from './riverAutotile';
import {
  GENERATED_TERRAIN_OBJECT_SHEET,
  fertileGroundWash,
  generatedTerrainObjectSourceRect,
  terrainObjectFor,
  type GeneratedTerrainObject,
} from './generatedTerrainObjects';
import {
  GENERATED_BUILDING_SHEET,
  GENERATED_LARGE_BUILDING_SHEET,
  generatedLargeBuildingSourceRect,
  generatedBuildingSourceRect,
} from './generatedBuildingAssets';
import {
  WATERWORK_BUILDING_SHEETS,
  isWaterworksBuildingType,
  waterworksBuildingSourceRect,
} from './waterworksBuildingAssets';
import {
  isPromotionBuildingType,
  PROMOTION_LARGE_BUILDING_SHEET,
  PROMOTION_BUILDING_SHEET,
  promotionLargeBuildingSourceRect,
  promotionBuildingSourceRect,
} from './promotionBuildingAssets';
import {
  isPromotionCharacterJob,
  PROMOTION_CHARACTER_SHEET,
  promotionResidentSourceRect,
} from './promotionCharacterAssets';
import {
  MILITIA_WEAPON_SHEET,
  militiaWeaponSourceRect,
} from './militiaWeaponAssets';
import {
  WALL_FAMILY_SHEET,
  isWallFamilyWallType,
  wallFamilySourceRect,
} from './wallFamilyAssets';
import {
  WALL_GATE_SHEET,
  wallGateSourceRect,
} from './wallGateAssets';
import {
  SPECIALIZED_BUILDING_SHEET,
  SPECIALIZED_LARGE_BUILDING_SHEET,
  isSpecializedBuildingType,
  specializedBuildingSourceRect,
} from './specializedBuildingAssets';
import {
  SPECIALIZED_CHARACTER_SHEET,
  isSpecializedCharacterJob,
  specializedResidentSourceRect,
} from './specializedCharacterAssets';
import {
  NEW_CONTENT_BUILDING_SHEET,
  NEW_CONTENT_LARGE_BUILDING_SHEET,
  NEW_CONTENT_RESIDENT_SHEET,
  isNewContentBuildingType,
  newContentBuildingSourceRect,
  newContentResidentSourceRect,
} from './newContentAssets';
import {
  FACTION_RAIDER_SHEET,
  factionRaiderSourceRect,
} from './factionRaiderAssets';
import {
  BUILDING_DAMAGE_SHEET,
  buildingDamageSourceRect,
} from './buildingDamageAssets';
import {
  CEMETERY_SHEETS,
  cemeterySourceRect,
  type CemeterySheet,
} from './cemeteryAssets';
import {
  OBLIQUE_BUILDING_SHEETS,
  obliqueBuildingFrame,
  obliqueBuildingSourceRect,
  type ObliqueBuildingGroup,
  type ObliqueBuildingSheet,
} from './obliqueBuildingAssets';
import {
  FOREIGN_RESIDENT_SHEET,
  FOREIGN_SITE_CORE_SHEET,
  FOREIGN_SITE_PROP_SHEET,
  foreignResidentSourceRect,
  foreignStructureSourceRect,
} from './foreignSiteAssets';
import {
  SPECIAL_RESIDENT_SHEET,
  specialResidentSourceRect,
} from './specialResidentAssets';
import {
  CENTER_PROMOTION_SHEET,
  centerPromotionSourceRect,
} from './centerPromotionAssets';
import {
  RESIDENT_WOODCUTTER_LOAD_SHEET,
  RESIDENT_WOODCUTTER_LOCOMOTION_SHEET,
  RESIDENT_WOODCUTTER_WORK_SHEET,
  woodcutterLoadSourceRect,
  woodcutterLocomotionSourceRect,
  woodcutterWorkSourceRect,
} from './residentWoodcutterAssets';
import {
  RESIDENT_HUNTER_HUNT_HD_SHEET,
  RESIDENT_HUNTER_HUNT_SHEET,
  RESIDENT_HUNTER_LOAD_HD_SHEET,
  RESIDENT_HUNTER_LOAD_SHEET,
  RESIDENT_HUNTER_LOCOMOTION_SHEET,
  hunterHuntSourceRect,
  hunterLoadSourceRect,
  hunterLocomotionSourceRect,
} from './residentHunterAssets';
import {
  RESIDENT_HAULER_CART_LOAD_LOCOMOTION_HD_SHEET,
  RESIDENT_HAULER_CART_LOAD_LOCOMOTION_SHEET,
  RESIDENT_HAULER_CART_LOCOMOTION_HD_SHEET,
  RESIDENT_HAULER_CART_LOCOMOTION_SHEET,
  RESIDENT_HAULER_LOCOMOTION_SHEET,
  haulerCartLocomotionSourceRect,
  haulerLocomotionSourceRect,
} from './residentHaulerAssets';
import {
  RESIDENT_FARMER_HARVEST_HD_SHEET,
  RESIDENT_FARMER_HARVEST_SHEET,
  RESIDENT_FARMER_OX_PLOW_HD_SHEET,
  RESIDENT_FARMER_OX_PLOW_SHEET,
  RESIDENT_FARMER_TILL_HD_SHEET,
  RESIDENT_FARMER_TILL_SHEET,
  farmerHarvestSourceRect,
  farmerOxPlowSourceRect,
  farmerTillSourceRect,
} from './residentFarmerAssets';
import {
  RESIDENT_BUILDER_LOCOMOTION_SHEET,
  RESIDENT_BUILDER_WORK_HD_SHEET,
  RESIDENT_BUILDER_WORK_SHEET,
  builderLocomotionSourceRect,
  builderWorkSourceRect,
} from './residentBuilderAssets';
import {
  RESIDENT_MINER_LOAD_SHEET,
  RESIDENT_MINER_LOAD_HD_SHEET,
  RESIDENT_MINER_LOCOMOTION_SHEET,
  RESIDENT_MINER_WORK_HD_SHEET,
  RESIDENT_MINER_WORK_SHEET,
  minerLoadSourceRect,
  minerLocomotionSourceRect,
  minerWorkSourceRect,
} from './residentMinerAssets';
import {
  RESIDENT_HERBALIST_GATHER_HD_SHEET,
  RESIDENT_HERBALIST_GATHER_SHEET,
  RESIDENT_HERBALIST_LOCOMOTION_SHEET,
  herbalistGatherSourceRect,
  herbalistLocomotionSourceRect,
} from './residentHerbalistAssets';
import {
  RESIDENT_CHARCOAL_BURNER_WORK_HD_SHEET,
  RESIDENT_CHARCOAL_BURNER_WORK_SHEET,
  RESIDENT_CURER_WORK_HD_SHEET,
  RESIDENT_CURER_WORK_SHEET,
  RESIDENT_FISHER_WORK_HD_SHEET,
  RESIDENT_FISHER_WORK_SHEET,
  RESIDENT_HERDER_WORK_HD_SHEET,
  RESIDENT_HERDER_WORK_SHEET,
  RESIDENT_POWDER_MAKER_WORK_HD_SHEET,
  RESIDENT_POWDER_MAKER_WORK_SHEET,
  RESIDENT_POTTER_WORK_HD_SHEET,
  RESIDENT_POTTER_WORK_SHEET,
  RESIDENT_UNDERTAKER_WORK_HD_SHEET,
  RESIDENT_UNDERTAKER_WORK_SHEET,
  RESIDENT_WOOD_SPLITTER_WORK_HD_SHEET,
  RESIDENT_WOOD_SPLITTER_WORK_SHEET,
  RESIDENT_WORK_PRESENTATION_SCALE,
  RESIDENT_WORK_PRESENTATION_SCALE_BY_JOB,
  charcoalBurnerWorkSourceRect,
  curerWorkSourceRect,
  fisherWorkSourceRect,
  herderWorkSourceRect,
  powderMakerWorkSourceRect,
  potterWorkSourceRect,
  undertakerWorkSourceRect,
  woodSplitterWorkSourceRect,
} from './residentOutdoorWorkAssets';
import { spriteDisplayMetric } from './spriteStudioRegistries';
import {
  RESIDENT_COMMON_LOCOMOTION_SHEET,
  commonLocomotionSourceRect,
} from './residentCommonLocomotionAssets';
import {
  RESIDENT_IDLE_VIDEO_WALK_SHEETS,
  idleVideoWalkSourceRect,
} from './residentIdleVideoWalkAssets';
import {
  RESIDENT_APPROVED_I2V_SHEETS,
  approvedI2VSourceRect,
  isApprovedI2VJob,
} from './residentApprovedI2VLocomotionAssets';
import {
  RELIGIOUS_SUCCESSOR_SHEETS,
  religiousSuccessorSourceRect,
} from './religiousSuccessorAssets';
import {
  RESIDENT_WOODCUTTER_VIDEO_WALK_SHEETS,
  woodcutterVideoWalkSourceRect,
  type WoodcutterVideoWalkKind,
} from './residentWoodcutterVideoWalkAssets';
import {
  RESIDENT_WOODCUTTER_VIDEO_WORK_SHEETS,
  woodcutterVideoWorkSourceRect,
} from './residentWoodcutterVideoWorkAssets';
import {
  RESIDENT_JIGE_CARGO_DISPLAY_FRAME_SIZE,
  RESIDENT_JIGE_CARGO_SHEETS,
  isResidentJigeCargoJob,
  residentJigeCargoSourceRect,
} from './residentJigeCargoAssets';
import {
  RESIDENT_SALT_MAKER_DISPLAY_FRAME_SIZE,
  RESIDENT_SALT_MAKER_SHEETS,
  saltMakerSourceRect,
  type SaltMakerSpriteState,
} from './residentSaltMakerAssets';
import {
  TERRAIN_GROWTH_DRAW_SIZE,
  TERRAIN_GROWTH_SHEETS,
  TERRAIN_GROWTH_TREE_DRAW_SCALE,
  mineralGrowthSourceRect,
  mountainGrowthSourceRect,
  treeGrowthSourceRect,
  type TerrainGrowthSheet,
  type TerrainGrowthSourceRect,
} from './terrainGrowthAssets';

const PITCH = 17;
const T = 16;
// 주민/습격자 캐릭터는 타일 크기에 맞춰 그린다 (16px 소스를 확대). 소품 오프셋도 이 배율을 따른다.
const CHAR = CONFIG.ui.tileSize;
const CHALF = CHAR / 2;
const CF = CHAR / 16; // 소품 스케일 계수

// ── 이미지 로딩 ──
let sheet: HTMLImageElement | null = null;
let chars: HTMLImageElement | null = null;
let riverSheet: HTMLImageElement | null = null;
let historicalTerrainSheet: HTMLImageElement | null = null;
let historicalTerrainHdSheet: HTMLImageElement | null = null;
let coastalGroundSheet: HTMLImageElement | null = null;
let tidalFisheryBuildingSheet: HTMLImageElement | null = null;
let saltworksBuildingSheet: HTMLImageElement | null = null;
let boatyardBuildingSheet: HTMLImageElement | null = null;
type SeamlessGroundFamily = 'plain' | 'forest' | 'rock';
interface SeamlessGroundPair {
  standard: HTMLImageElement | null;
  highDefinition: HTMLImageElement | null;
}
const SEAMLESS_GROUND_VERSIONS: Record<SeamlessGroundFamily, string> = {
  plain: 'v3',
  forest: 'v1',
  rock: 'v1',
};
const seamlessGroundSheets: Record<
  SeamlessGroundFamily,
  Record<Season, SeamlessGroundPair>
> = {
  plain: {
    spring: { standard: null, highDefinition: null },
    summer: { standard: null, highDefinition: null },
    autumn: { standard: null, highDefinition: null },
    winter: { standard: null, highDefinition: null },
  },
  forest: {
    spring: { standard: null, highDefinition: null },
    summer: { standard: null, highDefinition: null },
    autumn: { standard: null, highDefinition: null },
    winter: { standard: null, highDefinition: null },
  },
  rock: {
    spring: { standard: null, highDefinition: null },
    summer: { standard: null, highDefinition: null },
    autumn: { standard: null, highDefinition: null },
    winter: { standard: null, highDefinition: null },
  },
};
let terrainObjectSheet: HTMLImageElement | null = null;
let terrainGrowthSheet: HTMLImageElement | null = null;
let terrainGrowthHdSheet: HTMLImageElement | null = null;
let buildingSheet: HTMLImageElement | null = null;
let largeBuildingSheet: HTMLImageElement | null = null;
let waterworksBuildingSheet: HTMLImageElement | null = null;
let waterworksBuildingHdSheet: HTMLImageElement | null = null;
let generatedCharacterSheet: HTMLImageElement | null = null;
let promotionBuildingSheet: HTMLImageElement | null = null;
let promotionLargeBuildingSheet: HTMLImageElement | null = null;
let promotionCharacterSheet: HTMLImageElement | null = null;
let militiaWeaponSheet: HTMLImageElement | null = null;
let wallFamilySheet: HTMLImageElement | null = null;
let wallGateSheet: HTMLImageElement | null = null;
let specializedBuildingSheet: HTMLImageElement | null = null;
let specializedLargeBuildingSheet: HTMLImageElement | null = null;
let specializedCharacterSheet: HTMLImageElement | null = null;
let newContentBuildingSheet: HTMLImageElement | null = null;
let newContentLargeBuildingSheet: HTMLImageElement | null = null;
let newContentResidentSheet: HTMLImageElement | null = null;
let factionRaiderSheet: HTMLImageElement | null = null;
let buildingDamageSheet: HTMLImageElement | null = null;
let cemeterySheet: HTMLImageElement | null = null;
let cemeteryHdSheet: HTMLImageElement | null = null;
let obliqueOneTileSheet: HTMLImageElement | null = null;
let obliqueOneTileHdSheet: HTMLImageElement | null = null;
let obliqueTwoTileSheet: HTMLImageElement | null = null;
let obliqueTwoTileHdSheet: HTMLImageElement | null = null;
let obliqueCenterSheet: HTMLImageElement | null = null;
let obliqueCenterHdSheet: HTMLImageElement | null = null;
let livestockSheet: HTMLImageElement | null = null;
let livestockHdSheet: HTMLImageElement | null = null;
let corpseCoffinSprite: HTMLImageElement | null = null;
let corpseCoffinHdSprite: HTMLImageElement | null = null;
let fishingBoatSheet: HTMLImageElement | null = null;
let fishingPortHouseSheet: HTMLImageElement | null = null;
let fishingPortHouseWinterSheet: HTMLImageElement | null = null;
let fishingPortPierSheet: HTMLImageElement | null = null;
let fishingPortPierWinterSheet: HTMLImageElement | null = null;
let foreignResidentSheet: HTMLImageElement | null = null;
let foreignSiteCoreSheet: HTMLImageElement | null = null;
let foreignSitePropSheet: HTMLImageElement | null = null;
let specialResidentSheet: HTMLImageElement | null = null;
let centerPromotionSheet: HTMLImageElement | null = null;
let residentWoodcutterWorkSheet: HTMLImageElement | null = null;
let residentWoodcutterLocomotionSheet: HTMLImageElement | null = null;
let residentWoodcutterLoadSheet: HTMLImageElement | null = null;
let residentHunterHuntSheet: HTMLImageElement | null = null;
let residentHunterHuntHdSheet: HTMLImageElement | null = null;
let residentHunterLocomotionSheet: HTMLImageElement | null = null;
let residentHunterLoadSheet: HTMLImageElement | null = null;
let residentHunterLoadHdSheet: HTMLImageElement | null = null;
let residentHaulerLocomotionSheet: HTMLImageElement | null = null;
let residentHaulerCartLocomotionSheet: HTMLImageElement | null = null;
let residentHaulerCartLocomotionHdSheet: HTMLImageElement | null = null;
let residentHaulerCartLoadLocomotionSheet: HTMLImageElement | null = null;
let residentHaulerCartLoadLocomotionHdSheet: HTMLImageElement | null = null;
let residentFarmerTillSheet: HTMLImageElement | null = null;
let residentFarmerTillHdSheet: HTMLImageElement | null = null;
let residentFarmerHarvestSheet: HTMLImageElement | null = null;
let residentFarmerHarvestHdSheet: HTMLImageElement | null = null;
let residentFarmerOxPlowSheet: HTMLImageElement | null = null;
let residentFarmerOxPlowHdSheet: HTMLImageElement | null = null;
let residentBuilderLocomotionSheet: HTMLImageElement | null = null;
let residentBuilderWorkSheet: HTMLImageElement | null = null;
let residentBuilderWorkHdSheet: HTMLImageElement | null = null;
let residentMinerLocomotionSheet: HTMLImageElement | null = null;
let residentMinerWorkSheet: HTMLImageElement | null = null;
let residentMinerWorkHdSheet: HTMLImageElement | null = null;
let residentMinerLoadSheet: HTMLImageElement | null = null;
let residentMinerLoadHdSheet: HTMLImageElement | null = null;
let residentHerbalistLocomotionSheet: HTMLImageElement | null = null;
let residentHerbalistGatherSheet: HTMLImageElement | null = null;
let residentHerbalistGatherHdSheet: HTMLImageElement | null = null;
let residentWoodSplitterWorkSheet: HTMLImageElement | null = null;
let residentWoodSplitterWorkHdSheet: HTMLImageElement | null = null;
let residentFisherWorkSheet: HTMLImageElement | null = null;
let residentFisherWorkHdSheet: HTMLImageElement | null = null;
let residentHerderWorkSheet: HTMLImageElement | null = null;
let residentHerderWorkHdSheet: HTMLImageElement | null = null;
let residentCharcoalBurnerWorkSheet: HTMLImageElement | null = null;
let residentCharcoalBurnerWorkHdSheet: HTMLImageElement | null = null;
let residentPowderMakerWorkSheet: HTMLImageElement | null = null;
let residentPowderMakerWorkHdSheet: HTMLImageElement | null = null;
let residentUndertakerWorkSheet: HTMLImageElement | null = null;
let residentUndertakerWorkHdSheet: HTMLImageElement | null = null;
let residentCurerWorkSheet: HTMLImageElement | null = null;
let residentCurerWorkHdSheet: HTMLImageElement | null = null;
let residentPotterWorkSheet: HTMLImageElement | null = null;
let residentPotterWorkHdSheet: HTMLImageElement | null = null;
const residentSaltMakerSheets: Partial<Record<'male' | 'female', HTMLImageElement>> = {};
const residentSaltMakerHdSheets: Partial<Record<'male' | 'female', HTMLImageElement>> = {};
let residentCommonLocomotionSheet: HTMLImageElement | null = null;
let residentIdleVideoWalkSheet: HTMLImageElement | null = null;
let residentIdleVideoWalkHdSheet: HTMLImageElement | null = null;
let residentApprovedI2VSheet: HTMLImageElement | null = null;
let residentApprovedI2VHdSheet: HTMLImageElement | null = null;
let religiousSuccessorSheet: HTMLImageElement | null = null;
let religiousSuccessorHdSheet: HTMLImageElement | null = null;
let residentWoodcutterVideoWalkSheet: HTMLImageElement | null = null;
let residentWoodcutterVideoWalkHdSheet: HTMLImageElement | null = null;
let residentWoodcutterVideoWorkSheet: HTMLImageElement | null = null;
let residentWoodcutterVideoWorkHdSheet: HTMLImageElement | null = null;
const residentJigeCargoSheets: Partial<Record<JobId, HTMLImageElement>> = {};
const residentJigeCargoHdSheets: Partial<Record<JobId, HTMLImageElement>> = {};
let started = false;

export interface AtlasAssetState {
  src: string;
  status: 'idle' | 'loading' | 'loaded' | 'failed';
  required: boolean;
}

const atlasAssetStates: AtlasAssetState[] = [];
const atlasAssetSettledListeners = new Set<() => void>();
const warnedAssetFailures = new Set<string>();
const requestedSeamlessGroundSeasons = new Set<Season>();

function loadAtlasAsset(
  src: string,
  required: boolean,
  assign: (image: HTMLImageElement | null) => void,
): void {
  const state: AtlasAssetState = { src, required, status: 'loading' };
  atlasAssetStates.push(state);
  const image = new Image();
  const settle = (status: 'loaded' | 'failed') => {
    if (state.status !== 'loading') return;
    state.status = status;
    assign(status === 'loaded' ? image : null);
    if (status === 'failed' && !warnedAssetFailures.has(src)) {
      warnedAssetFailures.add(src);
      const kind = required ? 'core' : 'optional resident presentation';
      console.warn(`[atlas] Failed to load ${kind} asset: ${src}`);
    }
    for (const listener of atlasAssetSettledListeners) listener();
  };
  image.onload = () => { settle('loaded'); };
  image.onerror = () => { settle('failed'); };
  image.src = src;
}

function requestSeamlessGroundSeason(season: Season, required: boolean): void {
  if (requestedSeamlessGroundSeasons.has(season)) return;
  requestedSeamlessGroundSeasons.add(season);
  for (const family of ['plain', 'forest', 'rock'] as const) {
    const version = SEAMLESS_GROUND_VERSIONS[family];
    const pair = seamlessGroundSheets[family][season];
    loadAtlasAsset(
      `/assets/folk-warm-${family}-${season}-seamless-${version}-standard-448px.png`,
      required,
      image => { pair.standard = image; },
    );
    loadAtlasAsset(
      `/assets/folk-warm-${family}-${season}-seamless-${version}-hd-896px.png`,
      required,
      image => { pair.highDefinition = image; },
    );
  }
}

function ensureLoaded(): void {
  if (started || typeof Image === 'undefined') return;
  started = true;
  loadAtlasAsset('/assets/roguelikeSheet_transparent.png', true, image => { sheet = image; });
  loadAtlasAsset('/assets/roguelikeChar_transparent.png', true, image => { chars = image; });
  loadAtlasAsset('/assets/river-mask-autotile-28px-sheet.png', true, image => { riverSheet = image; });
  loadAtlasAsset('/assets/folk-warm-terrain-v3-28px-sheet.png', true, image => { historicalTerrainSheet = image; });
  loadAtlasAsset('/assets/folk-warm-terrain-v3-56px-sheet.png', true, image => { historicalTerrainHdSheet = image; });
  loadAtlasAsset(COASTAL_GROUND_SHEET.src, true, image => { coastalGroundSheet = image; });
  loadAtlasAsset(TIDAL_FISHERY_BUILDING_SHEET.src, true, image => { tidalFisheryBuildingSheet = image; });
  loadAtlasAsset(SALTWORKS_BUILDING_SHEET.src, true, image => { saltworksBuildingSheet = image; });
  loadAtlasAsset(BOATYARD_BUILDING_SHEET.src, true, image => { boatyardBuildingSheet = image; });
  // 새 게임의 봄 자산만 시작 준비에 포함하고, 나머지 계절은 실제 진입 시 요청한다.
  requestSeamlessGroundSeason('spring', true);
  loadAtlasAsset(GENERATED_TERRAIN_OBJECT_SHEET.src, true, image => { terrainObjectSheet = image; });
  loadAtlasAsset(TERRAIN_GROWTH_SHEETS.standard.src, true, image => { terrainGrowthSheet = image; });
  loadAtlasAsset(TERRAIN_GROWTH_SHEETS.highDefinition.src, true, image => { terrainGrowthHdSheet = image; });
  loadAtlasAsset(GENERATED_BUILDING_SHEET.src, true, image => { buildingSheet = image; });
  loadAtlasAsset(GENERATED_LARGE_BUILDING_SHEET.src, true, image => { largeBuildingSheet = image; });
  loadAtlasAsset(WATERWORK_BUILDING_SHEETS.standard.src, true, image => { waterworksBuildingSheet = image; });
  loadAtlasAsset(WATERWORK_BUILDING_SHEETS.highDefinition.src, true, image => { waterworksBuildingHdSheet = image; });
  loadAtlasAsset(PROMOTION_BUILDING_SHEET.src, true, image => { promotionBuildingSheet = image; });
  loadAtlasAsset(PROMOTION_LARGE_BUILDING_SHEET.src, true, image => { promotionLargeBuildingSheet = image; });
  loadAtlasAsset(PROMOTION_CHARACTER_SHEET.src, true, image => { promotionCharacterSheet = image; });
  loadAtlasAsset(MILITIA_WEAPON_SHEET.src, true, image => { militiaWeaponSheet = image; });
  loadAtlasAsset(WALL_FAMILY_SHEET.src, true, image => { wallFamilySheet = image; });
  loadAtlasAsset(WALL_GATE_SHEET.src, true, image => { wallGateSheet = image; });
  loadAtlasAsset(SPECIALIZED_BUILDING_SHEET.src, true, image => { specializedBuildingSheet = image; });
  loadAtlasAsset(SPECIALIZED_LARGE_BUILDING_SHEET.src, true, image => { specializedLargeBuildingSheet = image; });
  loadAtlasAsset(SPECIALIZED_CHARACTER_SHEET.src, true, image => { specializedCharacterSheet = image; });
  loadAtlasAsset(NEW_CONTENT_BUILDING_SHEET.src, true, image => { newContentBuildingSheet = image; });
  loadAtlasAsset(NEW_CONTENT_LARGE_BUILDING_SHEET.src, true, image => { newContentLargeBuildingSheet = image; });
  loadAtlasAsset(NEW_CONTENT_RESIDENT_SHEET.src, true, image => { newContentResidentSheet = image; });
  loadAtlasAsset(FACTION_RAIDER_SHEET.src, true, image => { factionRaiderSheet = image; });
  loadAtlasAsset(BUILDING_DAMAGE_SHEET.src, true, image => { buildingDamageSheet = image; });
  loadAtlasAsset(CEMETERY_SHEETS.standard.src, true, image => { cemeterySheet = image; });
  loadAtlasAsset(CEMETERY_SHEETS.highDefinition.src, true, image => { cemeteryHdSheet = image; });
  loadAtlasAsset(OBLIQUE_BUILDING_SHEETS.oneTile.standard.src, true, image => { obliqueOneTileSheet = image; });
  loadAtlasAsset(OBLIQUE_BUILDING_SHEETS.oneTile.highDefinition.src, true, image => { obliqueOneTileHdSheet = image; });
  loadAtlasAsset(OBLIQUE_BUILDING_SHEETS.twoTile.standard.src, true, image => { obliqueTwoTileSheet = image; });
  loadAtlasAsset(OBLIQUE_BUILDING_SHEETS.twoTile.highDefinition.src, true, image => { obliqueTwoTileHdSheet = image; });
  loadAtlasAsset(OBLIQUE_BUILDING_SHEETS.center.standard.src, true, image => { obliqueCenterSheet = image; });
  loadAtlasAsset(OBLIQUE_BUILDING_SHEETS.center.highDefinition.src, true, image => { obliqueCenterHdSheet = image; });
  loadAtlasAsset(LIVESTOCK_SHEETS.standard.src, true, image => { livestockSheet = image; });
  loadAtlasAsset(LIVESTOCK_SHEETS.highDefinition.src, true, image => { livestockHdSheet = image; });
  loadAtlasAsset(CORPSE_COFFIN_SPRITES.standard.src, true, image => { corpseCoffinSprite = image; });
  loadAtlasAsset(CORPSE_COFFIN_SPRITES.highDefinition.src, true, image => { corpseCoffinHdSprite = image; });
  loadAtlasAsset(FOREIGN_RESIDENT_SHEET.src, true, image => { foreignResidentSheet = image; });
  loadAtlasAsset(FOREIGN_SITE_CORE_SHEET.src, true, image => { foreignSiteCoreSheet = image; });
  loadAtlasAsset(FOREIGN_SITE_PROP_SHEET.src, true, image => { foreignSitePropSheet = image; });
  loadAtlasAsset(SPECIAL_RESIDENT_SHEET.src, true, image => { specialResidentSheet = image; });
  loadAtlasAsset(CENTER_PROMOTION_SHEET.src, true, image => { centerPromotionSheet = image; });
  loadAtlasAsset(GENERATED_CHARACTER_SHEET.src, true, image => { generatedCharacterSheet = image; });

  loadAtlasAsset(RESIDENT_WOODCUTTER_WORK_SHEET.src, false, image => { residentWoodcutterWorkSheet = image; });
  loadAtlasAsset(RESIDENT_WOODCUTTER_LOCOMOTION_SHEET.src, false, image => { residentWoodcutterLocomotionSheet = image; });
  loadAtlasAsset(RESIDENT_WOODCUTTER_LOAD_SHEET.src, false, image => { residentWoodcutterLoadSheet = image; });
  loadAtlasAsset(RESIDENT_HUNTER_HUNT_SHEET.src, false, image => { residentHunterHuntSheet = image; });
  loadAtlasAsset(RESIDENT_HUNTER_HUNT_HD_SHEET.src, false,
    image => { residentHunterHuntHdSheet = image; });
  loadAtlasAsset(RESIDENT_HUNTER_LOCOMOTION_SHEET.src, false, image => { residentHunterLocomotionSheet = image; });
  loadAtlasAsset(RESIDENT_HUNTER_LOAD_SHEET.src, false, image => { residentHunterLoadSheet = image; });
  loadAtlasAsset(RESIDENT_HUNTER_LOAD_HD_SHEET.src, false,
    image => { residentHunterLoadHdSheet = image; });
  loadAtlasAsset(RESIDENT_HAULER_LOCOMOTION_SHEET.src, false, image => { residentHaulerLocomotionSheet = image; });
  loadAtlasAsset(RESIDENT_HAULER_CART_LOCOMOTION_SHEET.src, false, image => { residentHaulerCartLocomotionSheet = image; });
  loadAtlasAsset(RESIDENT_HAULER_CART_LOCOMOTION_HD_SHEET.src, false,
    image => { residentHaulerCartLocomotionHdSheet = image; });
  loadAtlasAsset(RESIDENT_HAULER_CART_LOAD_LOCOMOTION_SHEET.src, false,
    image => { residentHaulerCartLoadLocomotionSheet = image; });
  loadAtlasAsset(RESIDENT_HAULER_CART_LOAD_LOCOMOTION_HD_SHEET.src, false,
    image => { residentHaulerCartLoadLocomotionHdSheet = image; });
  loadAtlasAsset(RESIDENT_FARMER_TILL_SHEET.src, false, image => { residentFarmerTillSheet = image; });
  loadAtlasAsset(RESIDENT_FARMER_TILL_HD_SHEET.src, false,
    image => { residentFarmerTillHdSheet = image; });
  loadAtlasAsset(RESIDENT_FARMER_HARVEST_SHEET.src, false, image => { residentFarmerHarvestSheet = image; });
  loadAtlasAsset(RESIDENT_FARMER_HARVEST_HD_SHEET.src, false,
    image => { residentFarmerHarvestHdSheet = image; });
  loadAtlasAsset(RESIDENT_FARMER_OX_PLOW_SHEET.src, false, image => { residentFarmerOxPlowSheet = image; });
  loadAtlasAsset(RESIDENT_FARMER_OX_PLOW_HD_SHEET.src, false,
    image => { residentFarmerOxPlowHdSheet = image; });
  loadAtlasAsset(RESIDENT_BUILDER_LOCOMOTION_SHEET.src, false, image => { residentBuilderLocomotionSheet = image; });
  loadAtlasAsset(RESIDENT_BUILDER_WORK_SHEET.src, false, image => { residentBuilderWorkSheet = image; });
  loadAtlasAsset(RESIDENT_BUILDER_WORK_HD_SHEET.src, false,
    image => { residentBuilderWorkHdSheet = image; });
  loadAtlasAsset(RESIDENT_MINER_LOCOMOTION_SHEET.src, false, image => { residentMinerLocomotionSheet = image; });
  loadAtlasAsset(RESIDENT_MINER_WORK_SHEET.src, false, image => { residentMinerWorkSheet = image; });
  loadAtlasAsset(RESIDENT_MINER_WORK_HD_SHEET.src, false,
    image => { residentMinerWorkHdSheet = image; });
  loadAtlasAsset(RESIDENT_MINER_LOAD_SHEET.src, false, image => { residentMinerLoadSheet = image; });
  loadAtlasAsset(RESIDENT_MINER_LOAD_HD_SHEET.src, false,
    image => { residentMinerLoadHdSheet = image; });
  loadAtlasAsset(RESIDENT_HERBALIST_LOCOMOTION_SHEET.src, false, image => { residentHerbalistLocomotionSheet = image; });
  loadAtlasAsset(RESIDENT_HERBALIST_GATHER_SHEET.src, false, image => { residentHerbalistGatherSheet = image; });
  loadAtlasAsset(RESIDENT_HERBALIST_GATHER_HD_SHEET.src, false,
    image => { residentHerbalistGatherHdSheet = image; });
  loadAtlasAsset(RESIDENT_WOOD_SPLITTER_WORK_SHEET.src, false,
    image => { residentWoodSplitterWorkSheet = image; });
  loadAtlasAsset(RESIDENT_WOOD_SPLITTER_WORK_HD_SHEET.src, false,
    image => { residentWoodSplitterWorkHdSheet = image; });
  loadAtlasAsset(RESIDENT_FISHER_WORK_SHEET.src, false,
    image => { residentFisherWorkSheet = image; });
  loadAtlasAsset(RESIDENT_FISHER_WORK_HD_SHEET.src, false,
    image => { residentFisherWorkHdSheet = image; });
  loadAtlasAsset(RESIDENT_HERDER_WORK_SHEET.src, false,
    image => { residentHerderWorkSheet = image; });
  loadAtlasAsset(RESIDENT_HERDER_WORK_HD_SHEET.src, false,
    image => { residentHerderWorkHdSheet = image; });
  loadAtlasAsset(RESIDENT_CHARCOAL_BURNER_WORK_SHEET.src, false,
    image => { residentCharcoalBurnerWorkSheet = image; });
  loadAtlasAsset(RESIDENT_CHARCOAL_BURNER_WORK_HD_SHEET.src, false,
    image => { residentCharcoalBurnerWorkHdSheet = image; });
  loadAtlasAsset(RESIDENT_POWDER_MAKER_WORK_SHEET.src, false,
    image => { residentPowderMakerWorkSheet = image; });
  loadAtlasAsset(RESIDENT_POWDER_MAKER_WORK_HD_SHEET.src, false,
    image => { residentPowderMakerWorkHdSheet = image; });
  loadAtlasAsset(RESIDENT_UNDERTAKER_WORK_SHEET.src, false,
    image => { residentUndertakerWorkSheet = image; });
  loadAtlasAsset(RESIDENT_UNDERTAKER_WORK_HD_SHEET.src, false,
    image => { residentUndertakerWorkHdSheet = image; });
  loadAtlasAsset(RESIDENT_CURER_WORK_SHEET.src, false,
    image => { residentCurerWorkSheet = image; });
  loadAtlasAsset(RESIDENT_CURER_WORK_HD_SHEET.src, false,
    image => { residentCurerWorkHdSheet = image; });
  loadAtlasAsset(RESIDENT_POTTER_WORK_SHEET.src, false,
    image => { residentPotterWorkSheet = image; });
  loadAtlasAsset(RESIDENT_POTTER_WORK_HD_SHEET.src, false,
    image => { residentPotterWorkHdSheet = image; });
  for (const gender of ['male', 'female'] as const) {
    loadAtlasAsset(RESIDENT_SALT_MAKER_SHEETS[gender].standard.src, false,
      image => { residentSaltMakerSheets[gender] = image ?? undefined; });
    loadAtlasAsset(RESIDENT_SALT_MAKER_SHEETS[gender].highDefinition.src, false,
      image => { residentSaltMakerHdSheets[gender] = image ?? undefined; });
  }
  loadAtlasAsset(RESIDENT_COMMON_LOCOMOTION_SHEET.src, false, image => { residentCommonLocomotionSheet = image; });
  loadAtlasAsset(RESIDENT_IDLE_VIDEO_WALK_SHEETS.standard.src, false, image => { residentIdleVideoWalkSheet = image; });
  loadAtlasAsset(RESIDENT_IDLE_VIDEO_WALK_SHEETS.highDefinition.src, false,
    image => { residentIdleVideoWalkHdSheet = image; });
  loadAtlasAsset(RESIDENT_APPROVED_I2V_SHEETS.standard.src, false,
    image => { residentApprovedI2VSheet = image; });
  loadAtlasAsset(RESIDENT_APPROVED_I2V_SHEETS.highDefinition.src, false,
    image => { residentApprovedI2VHdSheet = image; });
  loadAtlasAsset(RELIGIOUS_SUCCESSOR_SHEETS.standard.src, false,
    image => { religiousSuccessorSheet = image; });
  loadAtlasAsset(RELIGIOUS_SUCCESSOR_SHEETS.highDefinition.src, false,
    image => { religiousSuccessorHdSheet = image; });
  loadAtlasAsset(RESIDENT_WOODCUTTER_VIDEO_WALK_SHEETS.standard.src, false,
    image => { residentWoodcutterVideoWalkSheet = image; });
  loadAtlasAsset(RESIDENT_WOODCUTTER_VIDEO_WALK_SHEETS.highDefinition.src, false,
    image => { residentWoodcutterVideoWalkHdSheet = image; });
  loadAtlasAsset(RESIDENT_WOODCUTTER_VIDEO_WORK_SHEETS.standard.src, false,
    image => { residentWoodcutterVideoWorkSheet = image; });
  loadAtlasAsset(RESIDENT_WOODCUTTER_VIDEO_WORK_SHEETS.highDefinition.src, false,
    image => { residentWoodcutterVideoWorkHdSheet = image; });
  loadAtlasAsset(FISHING_BOAT_SHEET.src, true, image => { fishingBoatSheet = image; });
  loadAtlasAsset(FISHING_PORT_HOUSE_SHEET.src, false, image => { fishingPortHouseSheet = image; });
  loadAtlasAsset(FISHING_PORT_HOUSE_WINTER_SHEET.src, false, image => { fishingPortHouseWinterSheet = image; });
  loadAtlasAsset(FISHING_PORT_PIER_SHEET.src, false, image => { fishingPortPierSheet = image; });
  loadAtlasAsset(FISHING_PORT_PIER_WINTER_SHEET.src, false, image => { fishingPortPierWinterSheet = image; });
  for (const [job, pair] of Object.entries(RESIDENT_JIGE_CARGO_SHEETS) as
    [JobId, NonNullable<(typeof RESIDENT_JIGE_CARGO_SHEETS)[JobId]>][]) {
    loadAtlasAsset(pair.standard.src, false,
      image => { residentJigeCargoSheets[job] = image ?? undefined; });
    loadAtlasAsset(pair.highDefinition.src, false,
      image => { residentJigeCargoHdSheets[job] = image ?? undefined; });
  }
}

export function atlasReady(): boolean {
  ensureLoaded();
  const requiredAssets = atlasAssetStates.filter(asset => asset.required);
  return started && requiredAssets.length > 0 && requiredAssets.every(asset => asset.status === 'loaded');
}

export function atlasAssetStateSnapshot(): readonly Readonly<AtlasAssetState>[] {
  ensureLoaded();
  return atlasAssetStates.map(asset => ({ ...asset }));
}

export function onAtlasAssetSettled(listener: () => void): () => void {
  atlasAssetSettledListeners.add(listener);
  return () => { atlasAssetSettledListeners.delete(listener); };
}

// 아틀라스가 준비되면 아틀라스, 아니면 임시 그래픽
export function getActiveSprites(): SpriteAPI {
  return atlasReady() ? atlasSprites : placeholderSprites;
}

type CR = [number, number]; // [col, row]

// 시트에서 타일 하나를 찍는다
function blit(ctx: CanvasRenderingContext2D, img: HTMLImageElement, [c, r]: CR,
  x: number, y: number, size: number): void {
  ctx.drawImage(img, c * PITCH, r * PITCH, T, T, x, y, size, size);
}

function blitTerrainObject(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  kind: GeneratedTerrainObject,
  x: number,
  y: number,
  size: number,
): void {
  const rect = generatedTerrainObjectSourceRect(kind);
  ctx.drawImage(img, rect.sx, rect.sy, rect.sw, rect.sh, x, y, size, size);
}

function blitGeneratedBuilding(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  p: BuildingDrawParams,
): void {
  const rect = generatedBuildingSourceRect(p.type, p.season);
  const scale = p.size / GENERATED_BUILDING_SHEET.tileSize;
  const destHeight = GENERATED_BUILDING_SHEET.spriteHeight * scale;
  ctx.drawImage(img, rect.sx, rect.sy, rect.sw, rect.sh, p.x, p.y + p.size - destHeight, p.size, destHeight);
}

function blitLargeGeneratedBuilding(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  p: BuildingDrawParams,
): void {
  const rect = generatedLargeBuildingSourceRect(p.type, p.season);
  const scale = p.size / GENERATED_LARGE_BUILDING_SHEET.tileSize;
  const destHeight = GENERATED_LARGE_BUILDING_SHEET.spriteHeight * scale;
  ctx.drawImage(img, rect.sx, rect.sy, rect.sw, rect.sh, p.x, p.y + p.size - destHeight, p.size, destHeight);
}

function activeCemeterySheet(
  highDefinition: boolean | undefined,
): { image: HTMLImageElement; sheet: CemeterySheet } | null {
  if (highDefinition && cemeteryHdSheet) {
    return { image: cemeteryHdSheet, sheet: CEMETERY_SHEETS.highDefinition };
  }
  if (cemeterySheet) {
    return { image: cemeterySheet, sheet: CEMETERY_SHEETS.standard };
  }
  if (cemeteryHdSheet) {
    return { image: cemeteryHdSheet, sheet: CEMETERY_SHEETS.highDefinition };
  }
  return null;
}

function blitCemeteryPlot(ctx: CanvasRenderingContext2D, p: BuildingDrawParams): boolean {
  const active = activeCemeterySheet(p.highDefinition);
  if (!active) return false;
  const rect = cemeterySourceRect(active.sheet, p.graveCount ?? 0, p.season === 'winter');
  const destHeight = p.size * (CEMETERY_SHEETS.standard.cellHeight / CEMETERY_SHEETS.standard.cellWidth);
  ctx.drawImage(
    active.image,
    rect.sx,
    rect.sy,
    rect.sw,
    rect.sh,
    p.x,
    p.y + p.size - destHeight,
    p.size,
    destHeight,
  );
  return true;
}

function activeObliqueBuildingSheet(
  group: ObliqueBuildingGroup,
  highDefinition: boolean | undefined,
): { image: HTMLImageElement; sheet: ObliqueBuildingSheet } | null {
  const images = group === 'oneTile'
    ? { standard: obliqueOneTileSheet, highDefinition: obliqueOneTileHdSheet }
    : group === 'twoTile'
      ? { standard: obliqueTwoTileSheet, highDefinition: obliqueTwoTileHdSheet }
      : { standard: obliqueCenterSheet, highDefinition: obliqueCenterHdSheet };
  const sheets = OBLIQUE_BUILDING_SHEETS[group];
  if (highDefinition && images.highDefinition) {
    return { image: images.highDefinition, sheet: sheets.highDefinition };
  }
  if (images.standard) {
    return { image: images.standard, sheet: sheets.standard };
  }
  if (images.highDefinition) {
    return { image: images.highDefinition, sheet: sheets.highDefinition };
  }
  return null;
}

function blitObliqueBuilding(ctx: CanvasRenderingContext2D, p: BuildingDrawParams): boolean {
  const frame = obliqueBuildingFrame(p.type, p.rank);
  if (!frame) return false;
  const active = activeObliqueBuildingSheet(frame.group, p.highDefinition);
  if (!active) return false;
  const rect = obliqueBuildingSourceRect(active.sheet, frame.column, p.season);
  const destHeight = p.size * (active.sheet.cellHeight / active.sheet.cellWidth);
  ctx.drawImage(
    active.image,
    rect.sx,
    rect.sy,
    rect.sw,
    rect.sh,
    p.x,
    p.y + p.size - destHeight,
    p.size,
    destHeight,
  );
  return true;
}

function activeLivestockSheet(
  highDefinition: boolean | undefined,
): { image: HTMLImageElement; sheet: LivestockSheet } | null {
  if (highDefinition && livestockHdSheet) {
    return { image: livestockHdSheet, sheet: LIVESTOCK_SHEETS.highDefinition };
  }
  if (livestockSheet) return { image: livestockSheet, sheet: LIVESTOCK_SHEETS.standard };
  if (livestockHdSheet) return { image: livestockHdSheet, sheet: LIVESTOCK_SHEETS.highDefinition };
  return null;
}

function activeCorpseCoffinSprite(
  highDefinition: boolean | undefined,
): { image: HTMLImageElement; sprite: CorpseCoffinSprite } | null {
  if (highDefinition && corpseCoffinHdSprite) {
    return { image: corpseCoffinHdSprite, sprite: CORPSE_COFFIN_SPRITES.highDefinition };
  }
  if (corpseCoffinSprite) {
    return { image: corpseCoffinSprite, sprite: CORPSE_COFFIN_SPRITES.standard };
  }
  if (corpseCoffinHdSprite) {
    return { image: corpseCoffinHdSprite, sprite: CORPSE_COFFIN_SPRITES.highDefinition };
  }
  return null;
}

function drawCemeteryPlotFallback(ctx: CanvasRenderingContext2D, p: BuildingDrawParams): void {
  const winter = p.season === 'winter';
  const inset = Math.max(1, Math.round(p.size * 0.06));
  ctx.save();
  ctx.fillStyle = winter ? '#c7d0d2' : '#6d7047';
  ctx.fillRect(p.x + inset, p.y + inset, p.size - inset * 2, p.size - inset * 2);
  ctx.strokeStyle = winter ? '#89969a' : '#4c4932';
  ctx.lineWidth = Math.max(1, Math.round(p.size / 28));
  ctx.strokeRect(p.x + inset + 0.5, p.y + inset + 0.5, p.size - inset * 2 - 1, p.size - inset * 2 - 1);

  const graves = Math.min(CONFIG.funeral.plotsPerTile, Math.max(0, Math.floor(p.graveCount ?? 0)));
  const slots = [
    [0.28, 0.31],
    [0.71, 0.31],
    [0.28, 0.72],
    [0.71, 0.72],
  ] as const;
  const moundWidth = Math.max(5, Math.round(p.size * 0.25));
  const moundHeight = Math.max(3, Math.round(p.size * 0.13));
  const stoneWidth = Math.max(2, Math.round(p.size * 0.10));
  const stoneHeight = Math.max(4, Math.round(p.size * 0.18));
  for (let i = 0; i < graves; i++) {
    const [fx, fy] = slots[i];
    const cx = Math.round(p.x + p.size * fx);
    const cy = Math.round(p.y + p.size * fy);
    ctx.fillStyle = winter ? '#eef3f4' : '#75613e';
    ctx.fillRect(cx - Math.floor(moundWidth / 2), cy, moundWidth, moundHeight);
    ctx.fillStyle = winter ? '#8d989b' : '#6f716c';
    ctx.fillRect(cx - Math.floor(stoneWidth / 2), cy - stoneHeight + 1, stoneWidth, stoneHeight);
    ctx.fillStyle = winter ? '#d9e1e3' : '#a2a49d';
    ctx.fillRect(cx - Math.floor(stoneWidth / 2), cy - stoneHeight + 1, stoneWidth, 1);
  }
  ctx.restore();
}

function blitSpecializedBuilding(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  p: BuildingDrawParams,
  large: boolean,
): void {
  const rect = specializedBuildingSourceRect(p.type, p.season, large);
  if (!rect) return;
  const spriteHeight = large
    ? SPECIALIZED_LARGE_BUILDING_SHEET.spriteHeight
    : SPECIALIZED_BUILDING_SHEET.spriteHeight;
  const tileSize = large
    ? SPECIALIZED_LARGE_BUILDING_SHEET.tileSize
    : SPECIALIZED_BUILDING_SHEET.tileSize;
  const destHeight = spriteHeight * (p.size / tileSize);
  ctx.drawImage(img, rect.sx, rect.sy, rect.sw, rect.sh, p.x, p.y + p.size - destHeight, p.size, destHeight);
}

function blitNewContentBuilding(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  p: BuildingDrawParams,
  large: boolean,
): void {
  const rect = newContentBuildingSourceRect(p.type, p.season, large);
  if (!rect) return;
  const sheetMeta = large ? NEW_CONTENT_LARGE_BUILDING_SHEET : NEW_CONTENT_BUILDING_SHEET;
  const destHeight = sheetMeta.spriteHeight * (p.size / sheetMeta.tileSize);
  ctx.drawImage(img, rect.sx, rect.sy, rect.sw, rect.sh, p.x, p.y + p.size - destHeight, p.size, destHeight);
}

function blitWaterworksBuilding(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  p: BuildingDrawParams,
  highDefinition: boolean,
): void {
  const sheet = highDefinition
    ? WATERWORK_BUILDING_SHEETS.highDefinition
    : WATERWORK_BUILDING_SHEETS.standard;
  const rect = waterworksBuildingSourceRect(p.type, p.waterworksOrientation ?? 'horizontal', sheet);
  if (!rect) return;
  const destHeight = sheet.spriteHeight * (p.size / sheet.tileSize);
  const edge = p.type === 'levee' ? p.waterworksEdge : undefined;
  const offsetX = edge === 'e' ? p.size * 0.5 : edge === 'w' ? -p.size * 0.5 : 0;
  const offsetY = edge === 's' ? p.size * 0.5 : edge === 'n' ? -p.size * 0.5 : 0;
  ctx.drawImage(
    img,
    rect.sx,
    rect.sy,
    rect.sw,
    rect.sh,
    p.x + offsetX,
    p.y + p.size - destHeight + offsetY,
    p.size,
    destHeight,
  );
}

function drawCanalBuilding(ctx: CanvasRenderingContext2D, p: BuildingDrawParams): void {
  const half = p.size / 2;
  const width = Math.max(2, p.size * 0.2);
  const connections = p.connections ?? { n: false, e: false, s: false, w: false };
  const river = p.canalRiverEdges ?? { n: false, e: false, s: false, w: false };
  const riverReach = p.size * 0.36;
  const activeEdges = (['n', 'e', 's', 'w'] as const).filter(edge => connections[edge]);
  const edgePoint = (edge: 'n' | 'e' | 's' | 'w'): readonly [number, number] => {
    if (edge === 'n') return [p.x + half, p.y];
    if (edge === 'e') return [p.x + p.size, p.y + half];
    if (edge === 's') return [p.x + half, p.y + p.size];
    return [p.x, p.y + half];
  };
  const traceCanal = () => {
    if (activeEdges.length === 0) {
      ctx.moveTo(p.x + p.size * 0.22, p.y + half);
      ctx.lineTo(p.x + p.size * 0.78, p.y + half);
      return;
    }
    if (activeEdges.length === 1) {
      const [ex, ey] = edgePoint(activeEdges[0]);
      ctx.moveTo(ex, ey);
      ctx.lineTo(p.x + half, p.y + half);
      return;
    }
    if (activeEdges.length === 2) {
      const [ax, ay] = edgePoint(activeEdges[0]);
      const [bx, by] = edgePoint(activeEdges[1]);
      ctx.moveTo(ax, ay);
      if (activeEdges[0] !== 'n' || activeEdges[1] !== 's') {
        if (activeEdges[0] !== 'e' || activeEdges[1] !== 'w') {
          ctx.lineTo(p.x + half, p.y + half);
        }
      }
      ctx.lineTo(bx, by);
      return;
    }
    if (connections.n && connections.s) {
      ctx.moveTo(p.x + half, p.y);
      ctx.lineTo(p.x + half, p.y + p.size);
    } else {
      if (connections.n) {
        ctx.moveTo(p.x + half, p.y);
        ctx.lineTo(p.x + half, p.y + half);
      }
      if (connections.s) {
        ctx.moveTo(p.x + half, p.y + p.size);
        ctx.lineTo(p.x + half, p.y + half);
      }
    }
    if (connections.e && connections.w) {
      ctx.moveTo(p.x, p.y + half);
      ctx.lineTo(p.x + p.size, p.y + half);
    } else {
      if (connections.e) {
        ctx.moveTo(p.x + p.size, p.y + half);
        ctx.lineTo(p.x + half, p.y + half);
      }
      if (connections.w) {
        ctx.moveTo(p.x, p.y + half);
        ctx.lineTo(p.x + half, p.y + half);
      }
    }
  };
  const strokeCanal = (color: string, lineWidth: number) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = activeEdges.length === 0 ? 'round' : 'butt';
    ctx.beginPath();
    traceCanal();
    ctx.stroke();
    if (activeEdges.length === 1) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(p.x + half, p.y + half, lineWidth / 2, 0, Math.PI * 2);
      ctx.fill();
    }
  };
  const drawRiverMouth = (edge: 'n' | 'e' | 's' | 'w') => {
    const overlap = p.size * 0.08;
    const startHalf = width * 0.65;
    const endHalf = width * 0.9;
    const horizontal = edge === 'e' || edge === 'w';
    const startX = edge === 'e' ? p.x + p.size - overlap : edge === 'w' ? p.x + overlap : p.x + half;
    const startY = edge === 's' ? p.y + p.size - overlap : edge === 'n' ? p.y + overlap : p.y + half;
    const endX = edge === 'e' ? p.x + p.size + riverReach : edge === 'w' ? p.x - riverReach : startX;
    const endY = edge === 's' ? p.y + p.size + riverReach : edge === 'n' ? p.y - riverReach : startY;
    const gradient = ctx.createLinearGradient(startX, startY, endX, endY);
    gradient.addColorStop(0, 'rgba(73,138,168,1)');
    gradient.addColorStop(0.58, 'rgba(73,138,168,0.88)');
    gradient.addColorStop(1, 'rgba(73,138,168,0.12)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    if (horizontal) {
      ctx.moveTo(startX, startY - startHalf);
      ctx.lineTo(endX, endY - endHalf);
      ctx.lineTo(endX, endY + endHalf);
      ctx.lineTo(startX, startY + startHalf);
    } else {
      ctx.moveTo(startX - startHalf, startY);
      ctx.lineTo(endX - endHalf, endY);
      ctx.lineTo(endX + endHalf, endY);
      ctx.lineTo(startX + startHalf, startY);
    }
    ctx.closePath();
    ctx.fill();
  };
  ctx.save();
  // 타일 경계는 butt로 정확히 맞대고, 한 타일 안의 실제 꺾임만 round join으로 잇는다.
  ctx.lineJoin = 'round';
  strokeCanal(p.canalFlowing ? '#3b728b' : '#725f42', width + Math.max(2, p.size * 0.08));
  strokeCanal(p.canalFlowing ? '#498aa8' : '#9a8055', width);
  if (p.canalFlowing) {
    strokeCanal('rgba(112,166,187,0.55)', Math.max(1, p.size * 0.045));
    if (river.n) drawRiverMouth('n');
    if (river.e) drawRiverMouth('e');
    if (river.s) drawRiverMouth('s');
    if (river.w) drawRiverMouth('w');
  }
  ctx.restore();
}

function blitPromotionBuilding(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  p: BuildingDrawParams,
): void {
  const rect = promotionBuildingSourceRect(p.type, p.season);
  if (!rect) return;
  const scale = p.size / PROMOTION_BUILDING_SHEET.tileSize;
  const destHeight = PROMOTION_BUILDING_SHEET.spriteHeight * scale;
  ctx.drawImage(img, rect.sx, rect.sy, rect.sw, rect.sh, p.x, p.y + p.size - destHeight, p.size, destHeight);
}

function blitLargePromotionBuilding(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  p: BuildingDrawParams,
): void {
  const rect = promotionLargeBuildingSourceRect(p.type, p.season);
  if (!rect) return;
  const scale = p.size / PROMOTION_LARGE_BUILDING_SHEET.tileSize;
  const destHeight = PROMOTION_LARGE_BUILDING_SHEET.spriteHeight * scale;
  ctx.drawImage(img, rect.sx, rect.sy, rect.sw, rect.sh, p.x, p.y + p.size - destHeight, p.size, destHeight);
}

function blitCenterPromotion(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  p: BuildingDrawParams,
): void {
  if (!p.rank) return;
  const rect = centerPromotionSourceRect(p.rank, p.season);
  if (!rect) return;
  const scale = p.size / CENTER_PROMOTION_SHEET.tileSize;
  const destHeight = CENTER_PROMOTION_SHEET.spriteHeight * scale;
  ctx.drawImage(img, rect.sx, rect.sy, rect.sw, rect.sh, p.x, p.y + p.size - destHeight, p.size, destHeight);
}

function blitWallFamilyBuilding(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  p: BuildingDrawParams,
): void {
  if (!isWallFamilyWallType(p.type)) return;
  const rect = wallFamilySourceRect(p.type, p.connections, p.season);
  const scale = p.size / WALL_FAMILY_SHEET.tileSize;
  const destHeight = WALL_FAMILY_SHEET.spriteHeight * scale;
  ctx.drawImage(img, rect.sx, rect.sy, rect.sw, rect.sh, p.x, p.y + p.size - destHeight, p.size, destHeight);
}

function blitWallGateBuilding(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  p: BuildingDrawParams,
): void {
  const rect = wallGateSourceRect(p.connections, p.season);
  const scale = p.size / WALL_GATE_SHEET.tileSize;
  const destHeight = WALL_GATE_SHEET.spriteHeight * scale;
  ctx.drawImage(img, rect.sx, rect.sy, rect.sw, rect.sh, p.x, p.y + p.size - destHeight, p.size, destHeight);
}

interface SourceRect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

// 스프라이트 스튜디오의 표시 비율을 한자리에서 먹인다. 값이 없으면 1배·오프셋 0이라
// 레지스트리 도입 전과 완전히 같은 그림이 나온다.
function drawResidentImageRect(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  rect: SourceRect,
  x: number,
  y: number,
  facing: 1 | -1 | undefined,
  displayWidth: number,
  displayHeight: number,
  metricKey?: string,
): void {
  const metric = spriteDisplayMetric(metricKey);
  const dw = displayWidth * metric.scale;
  const dh = displayHeight * metric.scale;
  ctx.save();
  ctx.translate(x, y + metric.dy);
  ctx.scale(generatedCharacterFacingScale(facing), 1);
  ctx.drawImage(img, rect.sx, rect.sy, rect.sw, rect.sh, -dw / 2, CHALF - dh, dw, dh);
  ctx.restore();
}

function drawGeneratedCharacterRect(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  rect: SourceRect,
  x: number,
  y: number,
  facing: 1 | -1 | undefined,
  bob: number,
  sizeScale = 1,
  metricKey?: string,
): void {
  const scale = (CHAR / GENERATED_CHARACTER_SHEET.residentWidth) * sizeScale;
  drawResidentImageRect(
    ctx, img, rect, x, y - bob, facing, rect.sw * scale, rect.sh * scale, metricKey,
  );
}

function drawGeneratedResident(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  p: ResidentDrawParams,
  bob: number,
): void {
  drawGeneratedCharacterRect(
    ctx, img, generatedResidentSourceRect(p.job, p.gender), p.x, p.y, p.facing, bob, p.sizeScale ?? 1,
  );
}

function drawResidentCellRect(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  rect: SourceRect,
  p: ResidentDrawParams,
  metricKey?: string,
): void {
  const displaySize = RESIDENT_COMMON_LOCOMOTION_SHEET.displaySize * (p.sizeScale ?? 1);
  drawResidentImageRect(
    ctx, img, rect, p.x, p.y, p.facing, displaySize, displaySize, metricKey,
  );
}

function canvasBackingScale(ctx: CanvasRenderingContext2D): number {
  if (typeof ctx.getTransform !== 'function') return 1;
  const transform = ctx.getTransform();
  return Math.hypot(transform.a, transform.b);
}

function drawIdleVideoWalk(
  ctx: CanvasRenderingContext2D,
  p: ResidentDrawParams,
  animationTimeMs: number,
): boolean {
  const wantsHighDefinition = canvasBackingScale(ctx) >= 1.5;
  const highDefinition = wantsHighDefinition && residentIdleVideoWalkHdSheet != null;
  const image = highDefinition ? residentIdleVideoWalkHdSheet : residentIdleVideoWalkSheet;
  if (!image) return false;
  const rect = idleVideoWalkSourceRect(p.gender, animationTimeMs, highDefinition);
  const sizeScale = p.sizeScale ?? 1;
  drawResidentImageRect(
    ctx, image, rect, p.x, p.y, p.facing,
    RESIDENT_IDLE_VIDEO_WALK_SHEETS.displayWidth * sizeScale,
    RESIDENT_IDLE_VIDEO_WALK_SHEETS.displayHeight * sizeScale,
    'video.idle.walk',
  );
  return true;
}

function drawApprovedI2VLocomotion(
  ctx: CanvasRenderingContext2D,
  p: ResidentDrawParams,
  animationTimeMs: number,
): boolean {
  const wantsHighDefinition = canvasBackingScale(ctx) >= 1.5;
  const highDefinition = wantsHighDefinition && residentApprovedI2VHdSheet != null;
  const image = highDefinition ? residentApprovedI2VHdSheet : residentApprovedI2VSheet;
  if (!image) return false;
  const rect = approvedI2VSourceRect(
    p.job,
    p.gender,
    p.militiaWeapon,
    Boolean(p.moving),
    animationTimeMs,
    highDefinition,
    p.special,
    p.stage,
    p.religiousVocation,
  );
  if (!rect) return false;
  const textureScale = highDefinition ? 0.5 : 1;
  const sizeScale = p.sizeScale ?? 1;
  drawResidentImageRect(
    ctx, image, rect, p.x, p.y, p.facing,
    rect.sw * textureScale * sizeScale,
    rect.sh * textureScale * sizeScale,
    `i2v.${p.job}`,
  );
  return true;
}

function drawReligiousSuccessorStatic(
  ctx: CanvasRenderingContext2D,
  p: ResidentDrawParams,
): boolean {
  if (p.special || !p.religiousVocation) return false;
  const wantsHighDefinition = canvasBackingScale(ctx) >= 1.5;
  const highDefinition = wantsHighDefinition && religiousSuccessorHdSheet != null;
  const image = highDefinition ? religiousSuccessorHdSheet : religiousSuccessorSheet;
  if (!image) return false;
  const rect = religiousSuccessorSourceRect(
    p.religiousVocation,
    p.gender,
    p.stage,
    highDefinition,
  );
  if (!rect) return false;
  drawResidentImageRect(
    ctx,
    image,
    rect,
    p.x,
    p.y,
    p.facing,
    RELIGIOUS_SUCCESSOR_SHEETS.standard.residentWidth,
    RELIGIOUS_SUCCESSOR_SHEETS.standard.spriteHeight,
    `religious.${p.religiousVocation}.${p.stage ? 'novice' : 'adult'}`,
  );
  return true;
}

function allowsApprovedI2VLocomotion(p: ResidentDrawParams): boolean {
  if (p.stage) return false;
  if (p.carrying && isResidentJigeCargoJob(p.job) &&
      !(p.job === 'hauler' && p.cartEquipped)) return false;
  switch (p.job) {
    case 'farmer':
      return Boolean(p.moving) || p.farmerAction == null;
    case 'hunter':
      return !(p.working && !p.moving) && !p.carryingGame;
    case 'hauler':
      return !p.cartEquipped;
    case 'herbalist':
    case 'builder':
      return !(p.working && !p.moving);
    case 'miner':
      return !(p.working && !p.moving) && !p.carryingMinerals;
    case 'fisher':
    case 'herder':
      return !(p.working && !p.moving);
    case 'militia':
      return true;
    default:
      return isApprovedI2VJob(p.job) && (Boolean(p.moving) || !p.working);
  }
}

function drawWoodcutterVideoWalk(
  ctx: CanvasRenderingContext2D,
  p: ResidentDrawParams,
  animationTimeMs: number,
  kind: WoodcutterVideoWalkKind,
): boolean {
  const wantsHighDefinition = canvasBackingScale(ctx) >= 1.5;
  const highDefinition = wantsHighDefinition && residentWoodcutterVideoWalkHdSheet != null;
  const image = highDefinition ? residentWoodcutterVideoWalkHdSheet : residentWoodcutterVideoWalkSheet;
  if (!image) return false;
  const rect = woodcutterVideoWalkSourceRect(p.gender, kind, animationTimeMs, highDefinition);
  const sizeScale = p.sizeScale ?? 1;
  drawResidentImageRect(
    ctx, image, rect, p.x, p.y, p.facing,
    RESIDENT_WOODCUTTER_VIDEO_WALK_SHEETS.displayWidth * sizeScale,
    RESIDENT_WOODCUTTER_VIDEO_WALK_SHEETS.displayHeight * sizeScale,
    `video.woodcutter.walk.${kind}`,
  );
  return true;
}

function drawWoodcutterVideoWork(
  ctx: CanvasRenderingContext2D,
  p: ResidentDrawParams,
  animationTimeMs: number,
): boolean {
  const wantsHighDefinition = canvasBackingScale(ctx) >= 1.5;
  const highDefinition = wantsHighDefinition && residentWoodcutterVideoWorkHdSheet != null;
  const image = highDefinition ? residentWoodcutterVideoWorkHdSheet : residentWoodcutterVideoWorkSheet;
  if (!image) return false;
  const rect = woodcutterVideoWorkSourceRect(p.gender, animationTimeMs, highDefinition);
  const sizeScale = p.sizeScale ?? 1;
  drawResidentImageRect(
    ctx, image, rect, p.x, p.y, p.facing,
    RESIDENT_WOODCUTTER_VIDEO_WORK_SHEETS.displayWidth * sizeScale * RESIDENT_WORK_PRESENTATION_SCALE,
    RESIDENT_WOODCUTTER_VIDEO_WORK_SHEETS.displayHeight * sizeScale * RESIDENT_WORK_PRESENTATION_SCALE,
    'video.woodcutter.work',
  );
  return true;
}

function drawOptionalResidentPresentation(
  ctx: CanvasRenderingContext2D,
  p: ResidentDrawParams,
  animationTimeMs: number,
): boolean {
  const draw = (
    image: HTMLImageElement | null,
    rect: SourceRect,
    textureScale = 1,
    metricKey?: string,
  ): boolean => {
    if (!image) return false;
    drawGeneratedCharacterRect(
      ctx,
      image,
      rect,
      p.x,
      p.y,
      p.facing,
      0,
      (p.sizeScale ?? 1) * textureScale,
      metricKey,
    );
    return true;
  };
  const drawWork = (
    standard: HTMLImageElement | null,
    highDefinition: HTMLImageElement | null,
    sourceRect: (highDefinition: boolean) => SourceRect,
    standardTextureScale = 1,
    metricKey?: string,
  ): boolean => {
    const useHighDefinition = canvasBackingScale(ctx) >= 1.5 && highDefinition != null;
    return draw(
      useHighDefinition ? highDefinition : standard,
      sourceRect(useHighDefinition),
      useHighDefinition ? standardTextureScale * 0.5 : standardTextureScale,
      metricKey,
    );
  };
  const drawStationaryWork = (
    standard: HTMLImageElement | null,
    highDefinition: HTMLImageElement | null,
    sourceRect: (highDefinition: boolean) => SourceRect,
    standardTextureScale = 1,
    metricKey?: string,
  ): boolean => drawWork(
    standard,
    highDefinition,
    sourceRect,
    standardTextureScale * RESIDENT_WORK_PRESENTATION_SCALE *
      (RESIDENT_WORK_PRESENTATION_SCALE_BY_JOB[p.job] ?? 1),
    metricKey,
  );
  const drawCommon = (rect: SourceRect | null): boolean => {
    if (!residentCommonLocomotionSheet || !rect) return false;
    drawResidentCellRect(ctx, residentCommonLocomotionSheet, rect, p, 'common');
    return true;
  };

  if (allowsApprovedI2VLocomotion(p) &&
      drawApprovedI2VLocomotion(ctx, p, animationTimeMs)) return true;

  if (p.carrying && !p.stage && isResidentJigeCargoJob(p.job) &&
      !(p.job === 'hauler' && p.cartEquipped)) {
    const pair = RESIDENT_JIGE_CARGO_SHEETS[p.job];
    if (pair) {
      const drewCargo = drawWork(
        residentJigeCargoSheets[p.job] ?? null,
        residentJigeCargoHdSheets[p.job] ?? null,
        highDefinition => residentJigeCargoSourceRect(
          p.job,
          p.gender,
          Boolean(p.moving),
          animationTimeMs,
          highDefinition,
        ) ?? { sx: 0, sy: 0, sw: pair.standard.frameSize, sh: pair.standard.frameSize },
        RESIDENT_JIGE_CARGO_DISPLAY_FRAME_SIZE / pair.standard.frameSize,
        `jige.${p.job}`,
      );
      if (drewCargo) return true;
    }
  }

  switch (p.job) {
    case 'idle':
      if (!p.stage && drawIdleVideoWalk(ctx, p, p.moving ? animationTimeMs : 0)) return true;
      break;
    case 'woodcutter':
      if (p.working && !p.moving) {
        if (!p.stage && drawWoodcutterVideoWork(ctx, p, animationTimeMs)) return true;
        return draw(
          residentWoodcutterWorkSheet,
          woodcutterWorkSourceRect(p.gender, animationTimeMs),
          RESIDENT_WORK_PRESENTATION_SCALE,
          'work.woodcutter',
        );
      }
      if (!p.stage) {
        const kind: WoodcutterVideoWalkKind = p.carryingWood ? 'jige' : 'axe';
        if (drawWoodcutterVideoWalk(ctx, p, p.moving ? animationTimeMs : 0, kind)) return true;
      }
      if (p.carryingWood) {
        return draw(residentWoodcutterLoadSheet,
          woodcutterLoadSourceRect(p.gender, Boolean(p.moving), animationTimeMs), 1, 'load.woodcutter');
      }
      return draw(residentWoodcutterLocomotionSheet,
        woodcutterLocomotionSourceRect(p.gender, Boolean(p.moving), animationTimeMs), 1, 'walk.woodcutter');
    case 'hunter':
      if (p.working && !p.moving) {
        return drawStationaryWork(
          residentHunterHuntSheet,
          residentHunterHuntHdSheet,
          highDefinition => hunterHuntSourceRect(p.gender, animationTimeMs, highDefinition),
          1,
          'work.hunter',
        );
      }
      if (p.carryingGame) {
        return drawWork(
          residentHunterLoadSheet,
          residentHunterLoadHdSheet,
          highDefinition => hunterLoadSourceRect(
            p.gender,
            Boolean(p.moving),
            animationTimeMs,
            highDefinition,
          ),
          RESIDENT_HUNTER_LOAD_SHEET.displayFrameSize / RESIDENT_HUNTER_LOAD_SHEET.frameSize,
          'load.hunter',
        );
      }
      return draw(residentHunterLocomotionSheet,
        hunterLocomotionSourceRect(p.gender, Boolean(p.moving), animationTimeMs), 1, 'walk.hunter');
    case 'hauler':
      if (p.cartEquipped) {
        return drawWork(
          p.carrying ? residentHaulerCartLoadLocomotionSheet : residentHaulerCartLocomotionSheet,
          p.carrying
            ? residentHaulerCartLoadLocomotionHdSheet
            : residentHaulerCartLocomotionHdSheet,
          highDefinition => haulerCartLocomotionSourceRect(
            p.gender,
            Boolean(p.moving),
            animationTimeMs,
            p.carrying,
            highDefinition,
          ),
          RESIDENT_HAULER_CART_LOCOMOTION_SHEET.displayFrameSize /
            RESIDENT_HAULER_CART_LOCOMOTION_SHEET.frameSize,
          p.carrying ? 'cart-load.hauler' : 'cart.hauler',
        );
      }
      return draw(residentHaulerLocomotionSheet,
        haulerLocomotionSourceRect(p.gender, Boolean(p.moving), animationTimeMs), 1, 'walk.hauler');
    case 'farmer':
      if (p.moving) break;
      if (p.farmerAction === 'oxPlow') {
        return drawStationaryWork(
          residentFarmerOxPlowSheet,
          residentFarmerOxPlowHdSheet,
          highDefinition => farmerOxPlowSourceRect(p.gender, animationTimeMs, highDefinition),
          1,
          'work.farmer.oxPlow',
        );
      }
      if (p.farmerAction === 'harvest') {
        return drawStationaryWork(
          residentFarmerHarvestSheet,
          residentFarmerHarvestHdSheet,
          highDefinition => farmerHarvestSourceRect(p.gender, animationTimeMs, highDefinition),
          1,
          'work.farmer.harvest',
        );
      }
      if (p.farmerAction === 'till') {
        return drawStationaryWork(
          residentFarmerTillSheet,
          residentFarmerTillHdSheet,
          highDefinition => farmerTillSourceRect(p.gender, animationTimeMs, highDefinition),
          1,
          'work.farmer.till',
        );
      }
      return false;
    case 'builder':
      if (p.working && !p.moving) {
        return drawStationaryWork(
          residentBuilderWorkSheet,
          residentBuilderWorkHdSheet,
          highDefinition => builderWorkSourceRect(p.gender, animationTimeMs, highDefinition),
          1,
          'work.builder',
        );
      }
      return draw(residentBuilderLocomotionSheet,
        builderLocomotionSourceRect(p.gender, Boolean(p.moving), animationTimeMs), 1, 'walk.builder');
    case 'herbalist':
      if (p.working && !p.moving) {
        return drawStationaryWork(
          residentHerbalistGatherSheet,
          residentHerbalistGatherHdSheet,
          highDefinition => herbalistGatherSourceRect(p.gender, animationTimeMs, highDefinition),
          1,
          'work.herbalist',
        );
      }
      return draw(residentHerbalistLocomotionSheet,
        herbalistLocomotionSourceRect(p.gender, Boolean(p.moving), animationTimeMs), 1, 'walk.herbalist');
    case 'miner':
      if (p.working && !p.moving) {
        return drawStationaryWork(
          residentMinerWorkSheet,
          residentMinerWorkHdSheet,
          highDefinition => minerWorkSourceRect(p.gender, animationTimeMs, highDefinition),
          1,
          'work.miner',
        );
      }
      if (p.carryingMinerals) {
        return drawWork(
          residentMinerLoadSheet,
          residentMinerLoadHdSheet,
          highDefinition => minerLoadSourceRect(
            p.gender,
            Boolean(p.moving),
            animationTimeMs,
            highDefinition,
          ),
          RESIDENT_MINER_LOAD_SHEET.displayFrameSize / RESIDENT_MINER_LOAD_SHEET.frameSize,
          'load.miner',
        );
      }
      return draw(residentMinerLocomotionSheet,
        minerLocomotionSourceRect(p.gender, Boolean(p.moving), animationTimeMs), 1, 'walk.miner');
    case 'woodSplitter':
      if (p.working && !p.moving) {
        return drawStationaryWork(
          residentWoodSplitterWorkSheet,
          residentWoodSplitterWorkHdSheet,
          highDefinition => woodSplitterWorkSourceRect(p.gender, animationTimeMs, highDefinition),
          1,
          'work.woodSplitter',
        );
      }
      break;
    case 'fisher':
      if (p.working && !p.moving) {
        return drawStationaryWork(
          residentFisherWorkSheet,
          residentFisherWorkHdSheet,
          highDefinition => fisherWorkSourceRect(p.gender, animationTimeMs, highDefinition),
          RESIDENT_FISHER_WORK_SHEET.displayFrameSize / RESIDENT_FISHER_WORK_SHEET.frameSize,
          'work.fisher',
        );
      }
      break;
    case 'herder':
      if (p.working && !p.moving) {
        return drawStationaryWork(
          residentHerderWorkSheet,
          residentHerderWorkHdSheet,
          highDefinition => herderWorkSourceRect(p.gender, animationTimeMs, highDefinition),
          RESIDENT_HERDER_WORK_SHEET.displayFrameSize / RESIDENT_HERDER_WORK_SHEET.frameSize,
          'work.herder',
        );
      }
      break;
    case 'charcoalBurner':
      if (p.working && !p.moving) {
        return drawStationaryWork(
          residentCharcoalBurnerWorkSheet,
          residentCharcoalBurnerWorkHdSheet,
          highDefinition => charcoalBurnerWorkSourceRect(p.gender, animationTimeMs, highDefinition),
          RESIDENT_CHARCOAL_BURNER_WORK_SHEET.displayFrameSize /
            RESIDENT_CHARCOAL_BURNER_WORK_SHEET.frameSize,
          'work.charcoalBurner',
        );
      }
      break;
    case 'powderMaker':
      if (p.working && !p.moving) {
        return drawStationaryWork(
          residentPowderMakerWorkSheet,
          residentPowderMakerWorkHdSheet,
          highDefinition => powderMakerWorkSourceRect(p.gender, animationTimeMs, highDefinition),
          RESIDENT_POWDER_MAKER_WORK_SHEET.displayFrameSize /
            RESIDENT_POWDER_MAKER_WORK_SHEET.frameSize,
          'work.powderMaker',
        );
      }
      break;
    case 'undertaker':
      if (p.working && !p.moving) {
        return drawStationaryWork(
          residentUndertakerWorkSheet,
          residentUndertakerWorkHdSheet,
          highDefinition => undertakerWorkSourceRect(p.gender, animationTimeMs, highDefinition),
          RESIDENT_UNDERTAKER_WORK_SHEET.displayFrameSize /
            RESIDENT_UNDERTAKER_WORK_SHEET.frameSize,
          'work.undertaker',
        );
      }
      break;
    case 'curer':
      if (p.working && !p.moving) {
        return drawStationaryWork(
          residentCurerWorkSheet,
          residentCurerWorkHdSheet,
          highDefinition => curerWorkSourceRect(p.gender, animationTimeMs, highDefinition),
          RESIDENT_CURER_WORK_SHEET.displayFrameSize / RESIDENT_CURER_WORK_SHEET.frameSize,
          'work.curer',
        );
      }
      break;
    case 'potter':
      if (p.working && !p.moving) {
        return drawStationaryWork(
          residentPotterWorkSheet,
          residentPotterWorkHdSheet,
          highDefinition => potterWorkSourceRect(p.gender, animationTimeMs, highDefinition),
          RESIDENT_POTTER_WORK_SHEET.displayFrameSize / RESIDENT_POTTER_WORK_SHEET.frameSize,
          'work.potter',
        );
      }
      break;
    case 'saltMaker':
      if (!p.stage) {
        const state: SaltMakerSpriteState = p.moving
          ? 'walk'
          : p.working
            ? p.saltMakerAction ?? 'kilnWork'
            : 'idle';
        const pair = RESIDENT_SALT_MAKER_SHEETS[p.gender];
        return drawWork(
          residentSaltMakerSheets[p.gender] ?? null,
          residentSaltMakerHdSheets[p.gender] ?? null,
          highDefinition => saltMakerSourceRect(p.gender, state, animationTimeMs, highDefinition),
          RESIDENT_SALT_MAKER_DISPLAY_FRAME_SIZE / pair.standard.frameSize,
          `saltMaker.${state}`,
        );
      }
      break;
    default:
      break;
  }
  if (!p.moving || p.stage) return false;
  return drawCommon(commonLocomotionSourceRect(
    p.job,
    p.gender,
    p.militiaWeapon,
    true,
    animationTimeMs,
  ));
}

function drawForeignStructureSprite(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  p: ForeignStructureDrawParams,
): boolean {
  if (p.status === 'burned' || p.status === 'abandoned') return false;
  const rect = foreignStructureSourceRect(p.factionName, p.variant);
  if (!rect) return false;
  const baseWidth = p.variant === 'core' ? FOREIGN_SITE_CORE_SHEET.spriteWidth : FOREIGN_SITE_PROP_SHEET.spriteWidth;
  const scale = p.size / baseWidth;
  const destHeight = rect.sh * scale;
  ctx.drawImage(img, rect.sx, rect.sy, rect.sw, rect.sh, p.x, p.y + p.size - destHeight, p.size, destHeight);
  return true;
}

function drawGeneratedMountedRaider(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  p: RaiderDrawParams,
  index: number,
  bob: number,
  ox: number,
  oy: number,
): void {
  drawGeneratedCharacterRect(
    ctx,
    img,
    generatedMountedRaiderSourceRect(index),
    p.x + ox,
    p.y + oy,
    p.facing,
    bob,
  );
}

// 결정적 의사난수 (타일 좌표 → 변형 선택)
function hash(x: number, y: number): number {
  return ((x * 73856093) ^ (y * 19349663)) >>> 0;
}

// ── 지형 타일 매핑 ──
const GRASS: CR = [5, 0];
const GROUND_PALE: CR = [8, 0]; // 크림색 지면 — 겨울 설원 베이스
const GRASS_FLOWER_RED: CR = [1, 6];    // 붉은 꽃 풀 (여름)
const GRASS_FLOWER_WHITE: CR = [1, 9];  // 흰 꽃 풀 (봄)
const GRASS_FERTILE: CR = [9, 1];       // 싹이 돋은 풀 (비옥지)
const DIRT: CR = [6, 0];
const WATER: CR = [1, 0];
const WATER_SPARKLE: CR = [0, 0];
const ROCK_GRAY2: CR = [54, 21];

// ── 건물 매핑: 지붕(위) + 몸체(아래) + 부속 표식 ──
const ROOF_BROWN: CR = [34, 21];
const ROOF_BROWN_DARK: CR = [35, 21];
const ROOF_WHITE: CR = [27, 21];
const ROOF_DARK: CR = [29, 21];
const FACE_DOOR: CR = [33, 11];    // 문 달린 나무 벽
const FACE_SHOP: CR = [38, 11];    // 진열창 벽
const FACE_STONE: CR = [24, 14];   // 창 있는 돌벽
const TENT_GREEN: CR = [46, 10];
const TENT_TAN: CR = [48, 10];
const FENCE: CR = [46, 23];
const LOGS: CR = [52, 24];
const CAMPFIRE: CR = [13, 8];
const ANVIL: CR = [15, 0];
const HIDE: CR = [53, 12];
const BANNER_RED: CR = [49, 0];
const AWNING: CR = [10, 0];
const COUNTER: CR = [10, 4];
const SPROUT: CR = [22, 10];
const CROP: CR = [24, 9];
const HERB: CR = [48, 4]; // 버섯

interface BuildingSprite {
  roof?: CR;        // 위쪽에 얹는 타일 (지붕/차양)
  base: CR;         // 타일 자리에 그리는 몸체
  glyph?: CR;       // 구분용 소형 표식 (우하단)
  roofLift?: number; // 지붕을 몇 px 위로 올릴지
}

const BUILDING_SPRITES: Record<BuildingTypeId, BuildingSprite> = {
  center:     { roof: ROOF_BROWN, base: FACE_DOOR, glyph: BANNER_RED },
  hut:        { roof: ROOF_BROWN, base: FACE_DOOR },
  ondol:      { roof: ROOF_BROWN_DARK, base: FACE_DOOR, glyph: CAMPFIRE },
  tileHouse:  { roof: ROOF_DARK, base: FACE_STONE, glyph: CAMPFIRE },
  storehouse: { roof: ROOF_BROWN, base: FACE_SHOP },
  cellar:     { roof: ROOF_BROWN_DARK, base: FACE_STONE },
  smokehouse: { roof: ROOF_DARK, base: FACE_STONE, glyph: CAMPFIRE },
  dryingRack: { base: FENCE, glyph: WATER },
  onggiKiln:  { roof: ROOF_DARK, base: FACE_STONE, glyph: CAMPFIRE },
  saltworks:  { roof: ROOF_DARK, base: FACE_STONE, glyph: WATER },
  jangdokdae: { base: FACE_STONE, glyph: HIDE },
  bridge:     { base: FENCE },
  weir:       { base: FENCE, glyph: WATER },
  levee:      { base: FACE_STONE, glyph: WATER },
  canal:      { base: DIRT, glyph: WATER },
  lumberCamp: { base: LOGS },
  woodShed:   { base: LOGS, glyph: CAMPFIRE },
  huntLodge:  { base: TENT_TAN },
  herbHut:    { roof: ROOF_BROWN, base: FACE_DOOR, glyph: HERB },
  lodgingHut: { base: TENT_TAN, glyph: CAMPFIRE },
  clinic:     { roof: ROOF_DARK, base: FACE_DOOR, glyph: HERB },
  field:      { base: DIRT }, // 성장 단계는 drawBuilding에서 덧그림
  smithy:     { roof: ROOF_DARK, base: FACE_DOOR, glyph: ANVIL },
  mine:       { base: ROCK_GRAY2, glyph: ANVIL },
  well:       { base: FACE_STONE, glyph: WATER },
  deepMine:   { roof: ROOF_DARK, base: ROCK_GRAY2, glyph: ANVIL },
  ferry:      { base: TENT_TAN, glyph: WATER },
  fishingPort: { base: TENT_TAN, glyph: WATER },
  boatyard:   { base: LOGS, glyph: WATER },
  tidalFishery: { base: FENCE, glyph: WATER },
  charcoalKiln: { base: CAMPFIRE, glyph: LOGS },
  stable:     { base: TENT_TAN, glyph: HIDE },
  nitreYard:  { roof: ROOF_DARK, base: FACE_STONE, glyph: CAMPFIRE },
  dock:       { base: TENT_TAN, glyph: WATER },
  paddy:      { base: WATER, glyph: CROP },
  watermill:  { roof: ROOF_BROWN, base: FACE_DOOR, glyph: WATER },
  tannery:    { roof: ROOF_BROWN, base: FACE_DOOR, glyph: HIDE },
  weavingHouse: { roof: ROOF_BROWN, base: FACE_SHOP, glyph: HIDE },
  beacon:     { base: ROCK_GRAY2, glyph: CAMPFIRE },
  palisade:   { base: FENCE },
  earthFort:  { base: FACE_STONE, glyph: FENCE },
  stoneWall:  { base: FACE_STONE, glyph: FENCE },
  gate:       { base: FENCE },
  watchtower: { roof: ROOF_WHITE, base: FACE_STONE, roofLift: 12 },
  garrison:   { base: TENT_GREEN, glyph: BANNER_RED },
  office:     { roof: ROOF_DARK, base: FACE_SHOP, glyph: BANNER_RED },
  market:     { roof: AWNING, base: COUNTER, roofLift: 12 },
  cemetery:   { base: FACE_STONE }, // 봉분·비석 (전용 그림 나오기 전 임시)
  school:     { roof: ROOF_WHITE, base: FACE_SHOP }, // 전용 그림 나오기 전 임시
  shrine:     { roof: ROOF_DARK, base: TENT_GREEN }, // 전용 그림 나오기 전 임시
  hermitage:  { roof: ROOF_DARK, base: FACE_STONE }, // 전용 그림 나오기 전 임시
  cannonEmplacement: { base: FACE_STONE, glyph: BANNER_RED }, // 돌 포대 (전용 그림 나오기 전 임시)
  chongtongEmplacement: { base: FACE_STONE, glyph: BANNER_RED }, // 지자총통은 기존 포대 그림을 공유
};

// ── 주민 캐릭터 매핑 (완성형 캐릭터 열) ──
const CHAR_BY_JOB: Record<JobId, CR> = {
  idle:       [1, 8],
  woodcutter: [1, 6],
  woodSplitter: [1, 6],
  hunter:     [0, 10],
  farmer:     [0, 7],
  miller:      [1, 7],
  builder:    [0, 8],
  hauler:     [1, 7],
  herbalist:  [1, 5],
  physician:  [1, 5],
  curer:      [1, 7],
  potter:     [1, 9],
  saltMaker:  [1, 9],
  smith:      [1, 9],
  miner:      [1, 9],
  fisher:     [1, 10],
  charcoalBurner: [1, 9],
  herder:     [1, 7],
  tanner:     [1, 7],
  weaver:     [1, 7],
  powderMaker: [1, 9],
  clerk:      [1, 7],
  undertaker: [1, 7],
  teacher:    [1, 7],
  shaman:     [1, 8],
  monk:       [1, 8],
  watchman:   [0, 11],
  militia:    [0, 9],
};
const CHAR_RAIDER: CR = [1, 10];

// 못 가장자리 타일 좌표 (물가 띠 소스)
const POND_EDGE_N: CR = [3, 0];
const POND_EDGE_S: CR = [3, 2];
const POND_EDGE_W: CR = [2, 1];
const POND_EDGE_E: CR = [4, 1];

// 강 타일의 뭍 방향에 풀 둑 띠를 그린다 (5px 폭을 타일 크기에 비례해 확대)
function drawBanks(
  ctx: CanvasRenderingContext2D, x: number, y: number, size: number,
  banks: { n: boolean; e: boolean; s: boolean; w: boolean }, season: Season,
): void {
  if (!sheet) return;
  const strip = Math.round((size * 5) / T); // 원본 5px 띠
  if (banks.n) {
    ctx.drawImage(sheet, POND_EDGE_N[0] * PITCH, POND_EDGE_N[1] * PITCH, T, 5, x, y, size, strip);
  }
  if (banks.s) {
    ctx.drawImage(sheet, POND_EDGE_S[0] * PITCH, POND_EDGE_S[1] * PITCH + (T - 5), T, 5, x, y + size - strip, size, strip);
  }
  if (banks.w) {
    ctx.drawImage(sheet, POND_EDGE_W[0] * PITCH, POND_EDGE_W[1] * PITCH, 5, T, x, y, strip, size);
  }
  if (banks.e) {
    ctx.drawImage(sheet, POND_EDGE_E[0] * PITCH + (T - 5), POND_EDGE_E[1] * PITCH, 5, T, x + size - strip, y, strip, size);
  }
  // 둑도 계절 색조를 따라간다 (가을 워시)
  if (season === 'autumn') {
    ctx.fillStyle = 'rgba(170,110,40,0.16)';
    if (banks.n) ctx.fillRect(x, y, size, strip);
    if (banks.s) ctx.fillRect(x, y + size - strip, size, strip);
    if (banks.w) ctx.fillRect(x, y, strip, size);
    if (banks.e) ctx.fillRect(x + size - strip, y, strip, size);
  }
}

// 역사 지형 시트에서 땅 텍스처를 그린다 (타일 좌표 해시로 뒤집기/표본 위치 변형)
function activeHistoricalTerrain(
  highDefinition: boolean | undefined,
): { image: HTMLImageElement; sourceScale: 1 | 2 } | null {
  if (highDefinition && historicalTerrainHdSheet) {
    return { image: historicalTerrainHdSheet, sourceScale: 2 };
  }
  if (historicalTerrainSheet) {
    return { image: historicalTerrainSheet, sourceScale: 1 };
  }
  if (historicalTerrainHdSheet) {
    return { image: historicalTerrainHdSheet, sourceScale: 2 };
  }
  return null;
}

function activeSeamlessGroundTerrain(
  terrain: Terrain,
  season: Season,
  highDefinition: boolean | undefined,
): { image: HTMLImageElement; sourceScale: 1 | 2 } | null {
  if (typeof Image !== 'undefined') requestSeamlessGroundSeason(season, false);
  let family: SeamlessGroundFamily | null = null;
  if (terrain === 'plain' || terrain === 'center' || terrain === 'fertile') {
    family = 'plain';
  } else if (terrain === 'forest') {
    family = 'forest';
  } else if (terrain === 'mountain' || terrain === 'rock') {
    family = 'rock';
  }
  if (!family) return null;
  const pair = seamlessGroundSheets[family][season];
  if (highDefinition && pair.highDefinition) {
    return { image: pair.highDefinition, sourceScale: 2 };
  }
  if (pair.standard) return { image: pair.standard, sourceScale: 1 };
  if (pair.highDefinition) return { image: pair.highDefinition, sourceScale: 2 };
  return null;
}

const historicalGroundPatterns = new Map<string, HTMLCanvasElement>();

function quiltedGroundPattern(
  patternName: string,
  active: { image: HTMLImageElement; sourceScale: 1 | 2 },
  rect: { sx: number; sy: number; sw: number; sh: number },
  centeredInset: number,
): HTMLCanvasElement | null {
  const key = `${active.image.src}|${patternName}|${active.sourceScale}`;
  const cached = historicalGroundPatterns.get(key);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  const gridSize = 8;
  const step = rect.sw;
  const feather = 6 * active.sourceScale;
  canvas.width = step * gridSize;
  canvas.height = step * gridSize;
  const patternCtx = canvas.getContext('2d');
  if (!patternCtx) return null;
  patternCtx.imageSmoothingEnabled = false;

  // 셀 안쪽 표본을 여러 위상·방향으로 겹쳐 160 논리 픽셀짜리 매크로 텍스처를 만든다.
  // 조각 가장자리는 서로 페더링하고 캔버스 바깥으로 나간 기여분은 반대편에 더한다.
  // 따라서 매크로 텍스처 자체가 무봉제이면서 짧은 거울 반복의 띠 무늬도 피한다.
  const sourceCanvas = document.createElement('canvas');
  sourceCanvas.width = rect.sw;
  sourceCanvas.height = rect.sh;
  const sourceCtx = sourceCanvas.getContext('2d', { willReadFrequently: true });
  if (!sourceCtx) return null;
  sourceCtx.imageSmoothingEnabled = false;
  sourceCtx.drawImage(
    active.image,
    rect.sx + centeredInset,
    rect.sy + centeredInset,
    rect.sw,
    rect.sh,
    0,
    0,
    rect.sw,
    rect.sh,
  );
  const sourcePixels = sourceCtx.getImageData(0, 0, rect.sw, rect.sh).data;
  const accum = new Float32Array(canvas.width * canvas.height * 3);
  const weights = new Float32Array(canvas.width * canvas.height);
  const mirrorIndex = (value: number): number => {
    const period = step * 2;
    const wrapped = positiveMod(value, period);
    return wrapped < step ? wrapped : period - 1 - wrapped;
  };
  const edgeWeight = (value: number): number => {
    if (value < 0) return (value + feather + 1) / (feather + 1);
    if (value >= step) return (step + feather - value) / (feather + 1);
    return 1;
  };

  let randomState = 0x811c9dc5;
  for (const char of patternName) {
    randomState ^= char.charCodeAt(0);
    randomState = Math.imul(randomState, 0x01000193) >>> 0;
  }
  const nextRandom = (): number => {
    randomState ^= randomState << 13;
    randomState ^= randomState >>> 17;
    randomState ^= randomState << 5;
    return randomState >>> 0;
  };

  for (let cellY = 0; cellY < gridSize; cellY++) {
    for (let cellX = 0; cellX < gridSize; cellX++) {
      const phaseX = (nextRandom() % 40) * active.sourceScale;
      const phaseY = (nextRandom() % 40) * active.sourceScale;
      const rotation = nextRandom() % 4;
      for (let localY = -feather; localY < step + feather; localY++) {
        const weightY = edgeWeight(localY);
        const destY = positiveMod(cellY * step + localY, canvas.height);
        for (let localX = -feather; localX < step + feather; localX++) {
          const weight = weightY * edgeWeight(localX);
          const destX = positiveMod(cellX * step + localX, canvas.width);
          let sampleX = localX;
          let sampleY = localY;
          if (rotation === 1) [sampleX, sampleY] = [localY, -localX];
          else if (rotation === 2) [sampleX, sampleY] = [-localX, -localY];
          else if (rotation === 3) [sampleX, sampleY] = [-localY, localX];
          sampleX = mirrorIndex(sampleX + phaseX);
          sampleY = mirrorIndex(sampleY + phaseY);
          const sourceIndex = (sampleY * step + sampleX) * 4;
          const destIndex = destY * canvas.width + destX;
          const colorIndex = destIndex * 3;
          accum[colorIndex] += sourcePixels[sourceIndex] * weight;
          accum[colorIndex + 1] += sourcePixels[sourceIndex + 1] * weight;
          accum[colorIndex + 2] += sourcePixels[sourceIndex + 2] * weight;
          weights[destIndex] += weight;
        }
      }
    }
  }

  const output = patternCtx.createImageData(canvas.width, canvas.height);
  for (let pixel = 0; pixel < weights.length; pixel++) {
    const weight = weights[pixel] || 1;
    const sourceIndex = pixel * 3;
    const outputIndex = pixel * 4;
    output.data[outputIndex] = Math.round(accum[sourceIndex] / weight);
    output.data[outputIndex + 1] = Math.round(accum[sourceIndex + 1] / weight);
    output.data[outputIndex + 2] = Math.round(accum[sourceIndex + 2] / weight);
    output.data[outputIndex + 3] = 255;
  }
  patternCtx.putImageData(output, 0, 0);
  historicalGroundPatterns.set(key, canvas);
  return canvas;
}

function blitTidalFisheryBuilding(
  ctx: CanvasRenderingContext2D,
  p: BuildingDrawParams,
): boolean {
  if (p.type !== 'tidalFishery' || !tidalFisheryBuildingSheet) return false;
  const rect = tidalFisheryBuildingSourceRect(p.season);
  const destHeight = p.size * (TIDAL_FISHERY_BUILDING_SHEET.height / TIDAL_FISHERY_BUILDING_SHEET.width);
  ctx.drawImage(
    tidalFisheryBuildingSheet,
    rect.x,
    rect.y,
    rect.w,
    rect.h,
    p.x,
    p.y + p.size - destHeight,
    p.size,
    destHeight,
  );
  return true;
}

function blitSaltworksBuilding(
  ctx: CanvasRenderingContext2D,
  p: BuildingDrawParams,
): boolean {
  if (p.type !== 'saltworks' || !saltworksBuildingSheet) return false;
  const rect = saltworksBuildingSourceRect(p.season);
  const destHeight = p.size * (SALTWORKS_BUILDING_SHEET.height / SALTWORKS_BUILDING_SHEET.width);
  ctx.drawImage(
    saltworksBuildingSheet,
    rect.x,
    rect.y,
    rect.w,
    rect.h,
    p.x,
    p.y + p.size - destHeight,
    p.size,
    destHeight,
  );
  return true;
}

function blitBoatyardBuilding(
  ctx: CanvasRenderingContext2D,
  p: BuildingDrawParams,
): boolean {
  if (p.type !== 'boatyard' || !boatyardBuildingSheet) return false;
  const rect = boatyardBuildingSourceRect(p.season);
  const destHeight = p.size * (BOATYARD_BUILDING_SHEET.height / BOATYARD_BUILDING_SHEET.width);
  ctx.drawImage(
    boatyardBuildingSheet,
    rect.x,
    rect.y,
    rect.w,
    rect.h,
    p.x,
    p.y + p.size - destHeight,
    p.size,
    destHeight,
  );
  return true;
}

function quiltedHistoricalGroundPattern(
  terrain: Terrain,
  season: Season,
  active: { image: HTMLImageElement; sourceScale: 1 | 2 },
): HTMLCanvasElement | null {
  const rect = historicalTerrainSourceRect(terrain, season, active.sourceScale);
  if (!rect) return null;
  return quiltedGroundPattern(
    `historical:${terrain}:${season}`,
    active,
    rect,
    active.sourceScale,
  );
}

function quiltedCoastalGroundPattern(
  kind: 'mudflat' | 'sand' | 'shingle' | 'rocky',
): HTMLCanvasElement | null {
  if (!coastalGroundSheet) return null;
  const rect = coastalGroundSourceRect(kind);
  return quiltedGroundPattern(
    `coastal:${kind}`,
    { image: coastalGroundSheet, sourceScale: COASTAL_GROUND_SHEET.sourceScale },
    { sx: rect.x, sy: rect.y, sw: rect.w, sh: rect.h },
    0,
  );
}

function positiveMod(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}

function drawWrappedHistoricalGround(
  ctx: CanvasRenderingContext2D,
  pattern: HTMLCanvasElement | HTMLImageElement,
  sourceScale: 1 | 2,
  p: TerrainDrawParams,
): void {
  const logicalPatternSize = pattern.width / sourceScale;
  let destY = p.y;
  let sourceY = positiveMod(p.y, logicalPatternSize);
  let remainingH = p.size;
  while (remainingH > 0) {
    const pieceH = Math.min(remainingH, logicalPatternSize - sourceY);
    let destX = p.x;
    let sourceX = positiveMod(p.x, logicalPatternSize);
    let remainingW = p.size;
    while (remainingW > 0) {
      const pieceW = Math.min(remainingW, logicalPatternSize - sourceX);
      ctx.drawImage(
        pattern,
        sourceX * sourceScale,
        sourceY * sourceScale,
        pieceW * sourceScale,
        pieceH * sourceScale,
        destX,
        destY,
        pieceW,
        pieceH,
      );
      destX += pieceW;
      remainingW -= pieceW;
      sourceX = 0;
    }
    destY += pieceH;
    remainingH -= pieceH;
    sourceY = 0;
  }
}

function drawHistoricalGround(
  ctx: CanvasRenderingContext2D, terrain: Terrain, p: TerrainDrawParams,
): boolean {
  const seamlessGround = activeSeamlessGroundTerrain(
    terrain,
    p.season,
    p.highDefinition,
  );
  if (seamlessGround) {
    drawWrappedHistoricalGround(
      ctx,
      seamlessGround.image,
      seamlessGround.sourceScale,
      p,
    );
    return true;
  }
  const active = activeHistoricalTerrain(p.highDefinition);
  if (!active) return false;
  const pattern = quiltedHistoricalGroundPattern(terrain, p.season, active);
  if (!pattern) return false;
  drawWrappedHistoricalGround(ctx, pattern, active.sourceScale, p);
  return true;
}

const GROUND_EDGE_BAYER_4 = [
  0, 8, 2, 10,
  12, 4, 14, 6,
  3, 11, 1, 9,
  15, 7, 13, 5,
] as const;

function drawGroundBlendKind(
  ctx: CanvasRenderingContext2D,
  kind: GroundBlendKind,
  p: TerrainDrawParams,
): void {
  if (kind === 'mudflat' || kind === 'sand' || kind === 'shingle' || kind === 'rocky') {
    drawCoastalGround(ctx, p, kind);
    return;
  }
  drawHistoricalGround(ctx, kind, p);
}

export function drawFishingBoatAtlas(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  baselineY: number,
  facing: FishingBoatFacing,
  state: FishingBoatVisualState,
): boolean {
  ensureLoaded();
  if (!fishingBoatSheet) return false;
  const source = fishingBoatSourceRect(facing, state);
  ctx.save();
  ctx.translate(centerX, baselineY);
  if (source.mirrorX) ctx.scale(-1, 1);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(
    fishingBoatSheet,
    source.x, source.y, source.w, source.h,
    -FISHING_BOAT_SHEET.width / 2, -FISHING_BOAT_SHEET.height,
    FISHING_BOAT_SHEET.width, FISHING_BOAT_SHEET.height,
  );
  ctx.restore();
  return true;
}

export function drawFishingPortHouseAtlas(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  alpha = 1,
  season: Season = 'summer',
): boolean {
  ensureLoaded();
  const winter = season === 'winter' && fishingPortHouseWinterSheet !== null;
  const sheet = winter ? fishingPortHouseWinterSheet : fishingPortHouseSheet;
  if (!sheet) return false;
  const source = fishingPortHouseSourceRect(winter ? 'winter' : 'summer');
  const scale = size / FISHING_PORT_HOUSE_SHEET.width;
  const height = FISHING_PORT_HOUSE_SHEET.height * scale;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(
    sheet,
    source.x, source.y, source.w, source.h,
    x, y + size - height, size, height,
  );
  ctx.restore();
  return true;
}

export function drawFishingPortPierAtlas(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  direction: FishingPortPierDirection,
  terminal: boolean,
  alpha = 1,
  season: Season = 'summer',
): boolean {
  ensureLoaded();
  const winter = season === 'winter' && fishingPortPierWinterSheet !== null;
  const sheet = winter ? fishingPortPierWinterSheet : fishingPortPierSheet;
  if (!sheet) return false;
  const source = fishingPortPierSourceRect(
    fishingPortPierPart(direction, terminal),
    winter ? 'winter' : 'summer',
  );
  const drawScale = terminal
    ? FISHING_PORT_PIER_SHEET.terminalScale
    : FISHING_PORT_PIER_SHEET.middleScale;
  const drawSize = size * drawScale;
  const drawX = x + (size - drawSize) / 2;
  const drawY = y + (size - drawSize) / 2;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(
    sheet,
    source.x, source.y, source.w, source.h,
    drawX, drawY, drawSize, drawSize,
  );
  ctx.restore();
  return true;
}

// 이웃 지형 바닥 번짐 — 우세 지형(숲>암반>갯벌·자갈>모래>풀)을 월드 좌표 고정 픽셀 디더로 섞는다.
// HD에서는 0.5 논리 px(실제 1px) 셀을 써 확대해도 경계 해상도가 굵어지지 않는다.
function blendGroundEdges(ctx: CanvasRenderingContext2D, p: TerrainDrawParams): void {
  const blend = p.blendEdges;
  if (!blend) return;
  const samplesPerLogicalPixel = p.highDefinition ? 2 : 1;
  const sampleSize = 1 / samplesPerLogicalPixel;
  const axisSamples = Math.ceil(p.size * samplesPerLogicalPixel);
  const blendDepth = Math.min(9, p.size * 0.36);
  const depthSamples = Math.ceil(blendDepth * samplesPerLogicalPixel);
  const dirs = [['n', blend.n], ['e', blend.e], ['s', blend.s], ['w', blend.w]] as const;
  for (let dirIndex = 0; dirIndex < dirs.length; dirIndex++) {
    const neighborGround = dirs[dirIndex][1];
    if (!neighborGround) continue;
    const dir = dirs[dirIndex][0];
    ctx.save();
    ctx.beginPath();
    for (let along = 0; along < axisSamples; along++) {
      for (let depth = 0; depth < depthSamples; depth++) {
        const horizontal = dir === 'n' || dir === 's';
        const localSampleX = horizontal
          ? along
          : dir === 'w' ? depth : axisSamples - depth - 1;
        const localSampleY = horizontal
          ? dir === 'n' ? depth : axisSamples - depth - 1
          : along;
        const worldSampleX = p.tileX * axisSamples + localSampleX;
        const worldSampleY = p.tileY * axisSamples + localSampleY;
        const coarseNoise = (
          (hash(worldSampleX >> 2, (worldSampleY >> 2) + dirIndex * 131) % 1024) / 1023
          - 0.5
        ) * 0.28;
        const distance = (depth + 0.5) * sampleSize;
        const coverage = Math.max(
          0,
          Math.min(1, 1 - distance / blendDepth + coarseNoise),
        );
        const bayerIndex = positiveMod(worldSampleX, 4)
          + positiveMod(worldSampleY, 4) * 4;
        const threshold = (GROUND_EDGE_BAYER_4[bayerIndex] + 0.5) / 16;
        if (depth !== 0 && threshold > coverage) continue;
        const localX = localSampleX * sampleSize;
        const localY = localSampleY * sampleSize;
        ctx.rect(p.x + localX, p.y + localY, sampleSize, sampleSize);
      }
    }
    ctx.clip();
    drawGroundBlendKind(ctx, neighborGround, p);
    ctx.restore();
  }
}

const LAKE_WATER_COLORS: Record<Season, string> = {
  spring: '#326c91',
  summer: '#2f688c',
  autumn: '#356a87',
  winter: '#3e6f9e',
};

const SEA_WATER_COLORS: Record<Season, string> = {
  spring: '#285f82',
  summer: '#275f88',
  autumn: '#315f7c',
  winter: '#376b91',
};

const COAST_GROUND_COLORS: Record<Season, Record<'mudflat' | 'sand' | 'shingle' | 'rocky', string>> = {
  spring: { mudflat: '#75654d', sand: '#a99a73', shingle: '#9c927b', rocky: '#817d70' },
  summer: { mudflat: '#6f5f47', sand: '#b1a078', shingle: '#a3977d', rocky: '#817b6e' },
  autumn: { mudflat: '#675946', sand: '#9e8d69', shingle: '#93866f', rocky: '#797367' },
  winter: { mudflat: '#89837a', sand: '#b8b1a3', shingle: '#aca79c', rocky: '#96958f' },
};

function drawCoastalGround(
  ctx: CanvasRenderingContext2D,
  p: TerrainDrawParams,
  kind: 'mudflat' | 'sand' | 'shingle' | 'rocky',
): void {
  ctx.fillStyle = COAST_GROUND_COLORS[p.season][kind];
  ctx.fillRect(p.x, p.y, p.size, p.size);
  const pattern = quiltedCoastalGroundPattern(kind);
  if (pattern) {
    drawWrappedHistoricalGround(ctx, pattern, COASTAL_GROUND_SHEET.sourceScale, p);
    const tint = p.season === 'spring'
      ? 'rgba(210, 199, 145, 0.07)'
      : p.season === 'autumn'
        ? 'rgba(104, 67, 31, 0.15)'
        : p.season === 'winter'
          ? 'rgba(222, 229, 232, 0.42)'
          : null;
    if (tint) {
      ctx.fillStyle = tint;
      ctx.fillRect(p.x, p.y, p.size, p.size);
    }
    return;
  }
  const h = hash(p.tileX, p.tileY);
  if (kind === 'mudflat') {
    ctx.strokeStyle = p.winter ? 'rgba(211,220,220,0.24)' : 'rgba(61,91,91,0.38)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(p.x + 2, p.y + 7 + (h % 4));
    ctx.quadraticCurveTo(p.x + p.size * 0.45, p.y + 4 + ((h >>> 3) % 7), p.x + p.size - 2, p.y + 12 + ((h >>> 6) % 6));
    ctx.stroke();
    ctx.fillStyle = 'rgba(166,184,166,0.38)';
    if (h % 3 === 0) {
      ctx.fillRect(p.x + 5 + (h % 9), p.y + 3, 1, 7);
      ctx.fillRect(p.x + 8 + ((h >>> 4) % 10), p.y + 5, 1, 6);
    }
    return;
  }
  const dots = kind === 'rocky' ? 5 : kind === 'shingle' ? 8 : 3;
  for (let i = 0; i < dots; i++) {
    const px = p.x + 3 + ((h >>> (i % 12)) + i * 7) % Math.max(1, p.size - 6);
    const py = p.y + 3 + ((h >>> ((i + 5) % 14)) + i * 11) % Math.max(1, p.size - 6);
    ctx.fillStyle = kind === 'sand'
      ? 'rgba(215,205,169,0.34)'
      : kind === 'rocky' ? 'rgba(65,65,61,0.48)' : 'rgba(67,65,61,0.34)';
    const size = kind === 'rocky' ? 2 + (i % 2) : 1;
    ctx.fillRect(px, py, size, size);
  }
}

// 자연 수면 타일: 강·호수 모두 뭍 방향에만 둑 여백을 둔다.
function drawNaturalWaterTile(ctx: CanvasRenderingContext2D, p: TerrainDrawParams): void {
  const nb = p.banks!;
  const f = p.size / RIVER_AUTOTILE_SIZE;
  const inset = RIVER_BANK_INSET * f;
  const strip = RIVER_BANK_STRIP * f;
  const bankColor = RIVER_BANK_COLORS[p.season];

  // 1) 땅 밑바탕 — 주변 지형과 같은 시트라 물가 바깥이 이웃 타일과 이어진다
  if (p.terrain === 'sea' && p.coastalGround) drawCoastalGround(ctx, p, p.coastalGround);
  else drawHistoricalGround(ctx, 'plain', p);
  blendGroundEdges(ctx, p);

  const box = riverWaterBox(nb);
  const bx = p.x + box.x0 * f;
  const by = p.y + box.y0 * f;
  const bw = (box.x1 - box.x0) * f;
  const bh = (box.y1 - box.y0) * f;

  // 2) 둑 띠 — 물 상자를 뭍 방향으로만 띠 두께만큼 키워 테두리로 남긴다
  ctx.fillStyle = bankColor;
  ctx.fillRect(
    bx - (nb.w ? strip : 0),
    by - (nb.n ? strip : 0),
    bw + (nb.w ? strip : 0) + (nb.e ? strip : 0),
    bh + (nb.n ? strip : 0) + (nb.s ? strip : 0),
  );

  // 3) 물 — 강은 방향성이 있는 시트, 액체 호수는 고요한 단색 수면을 쓴다.
  // 호수의 움직임은 별도 물가 파문 레이어만 담당해 강물 같은 사선 흐름이 생기지 않는다.
  if ((p.terrain === 'lake' || p.terrain === 'sea') && !p.frozenRiver) {
    ctx.fillStyle = p.terrain === 'sea' ? SEA_WATER_COLORS[p.season] : LAKE_WATER_COLORS[p.season];
    ctx.fillRect(bx, by, bw, bh);
  } else {
    const fill = riverFillSourceRect(p.season, p.frozenRiver);
    ctx.drawImage(
      riverSheet!,
      fill.sx + box.x0, fill.sy + box.y0, box.x1 - box.x0, box.y1 - box.y0,
      bx, by, bw, bh,
    );
  }

  // 4) 양옆이 뭍인 바깥 굽이 모서리는 계단식으로 둥글려 손그림 느낌을 살린다
  ctx.fillStyle = bankColor;
  const step = 3 * f;
  for (const corner of riverRoundedCorners(nb)) {
    const cx = corner === 'ne' || corner === 'se' ? bx + bw - step : bx;
    const cy = corner === 'se' || corner === 'sw' ? by + bh - step : by;
    ctx.fillRect(cx, cy, step, step);
  }

  // 5) 대각선만 뭍인 모서리는 뭍+둑으로 되메워 이웃 강 타일의 물가와 맞물린다
  const activeGround = activeHistoricalTerrain(p.highDefinition);
  const groundRect = activeGround
    ? historicalTerrainSourceRect('plain', p.season, activeGround.sourceScale)
    : null;
  const srcScale = groundRect ? groundRect.sw / RIVER_AUTOTILE_SIZE : 1;
  for (const corner of riverLandCorners(nb)) {
    const right = corner === 'ne' || corner === 'se';
    const bottom = corner === 'se' || corner === 'sw';
    const cx = p.x + (right ? p.size - inset : 0);
    const cy = p.y + (bottom ? p.size - inset : 0);
    if (groundRect && activeGround) {
      ctx.drawImage(
        activeGround.image,
        groundRect.sx + (right ? groundRect.sw - RIVER_BANK_INSET * srcScale : 0),
        groundRect.sy + (bottom ? groundRect.sh - RIVER_BANK_INSET * srcScale : 0),
        RIVER_BANK_INSET * srcScale, RIVER_BANK_INSET * srcScale,
        cx, cy, inset, inset,
      );
    }
    // 물을 향한 두 면의 둑 띠 (L자)
    ctx.fillStyle = bankColor;
    ctx.fillRect(right ? cx : cx + inset - strip, cy, strip, inset);
    ctx.fillRect(cx, bottom ? cy : cy + inset - strip, inset, strip);
  }

  // 6) 언 강 표시 — 얼음 텍스처 위에 옅은 균열 한 줄 (겨울에 건널 수 있다는 표식)
  if (p.frozenRiver) {
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.beginPath();
    ctx.moveTo(bx + 2 * f, by + bh - 3 * f);
    ctx.lineTo(bx + bw - 3 * f, by + 2 * f);
    ctx.stroke();
  }
}

// 계절 색조 보정 (지형 레이어에 타일 단위로 적용)
function seasonWash(ctx: CanvasRenderingContext2D, season: Season, x: number, y: number, size: number): void {
  if (season === 'autumn') {
    ctx.fillStyle = 'rgba(170,110,40,0.16)';
    ctx.fillRect(x, y, size, size);
  } else if (season === 'winter') {
    ctx.fillStyle = 'rgba(238,243,250,0.55)';
    ctx.fillRect(x, y, size, size);
  }
}

function drawProgressBar(ctx: CanvasRenderingContext2D, p: BuildingDrawParams): void {
  if (p.built || p.ghost) return;
  ctx.fillStyle = '#10141a';
  ctx.fillRect(p.x + 2, p.y + p.size - 4, p.size - 4, 3);
  ctx.fillStyle = '#d9a441';
  ctx.fillRect(p.x + 2, p.y + p.size - 4, (p.size - 4) * p.progress01, 3);
}

function drawWallFamilyBuilding(ctx: CanvasRenderingContext2D, p: BuildingDrawParams): boolean {
  if (!isWallBuilding(p.type)) return false;
  if (isWallFamilyWallType(p.type) && wallFamilySheet) {
    blitWallFamilyBuilding(ctx, wallFamilySheet, p);
    return true;
  }
  if (isGateBuilding(p.type) && wallGateSheet) {
    blitWallGateBuilding(ctx, wallGateSheet, p);
    return true;
  }

  const c = p.connections ?? { n: false, e: false, s: false, w: false };
  const x = p.x;
  const y = p.y;
  const s = p.size;
  const midX = x + s / 2;
  const midY = y + s / 2;
  const unit = Math.max(1, Math.round(s / 14));
  const post = Math.max(4, Math.round(s * 0.26));
  const rail = Math.max(3, Math.round(s * 0.15));

  const palette = p.type === 'stoneWall'
    ? { body: '#8b8d86', dark: '#5f625d', light: '#c7c2ae' }
    : p.type === 'earthFort'
      ? { body: '#9b744d', dark: '#66442e', light: '#c89a62' }
      : { body: '#7b4e2f', dark: '#4a2f1f', light: '#b87943' };

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (isGateBuilding(p.type)) {
    ctx.strokeStyle = palette.dark;
    ctx.lineWidth = rail;
    if (c.w) {
      ctx.beginPath();
      ctx.moveTo(x + 2, midY - rail);
      ctx.lineTo(midX - post * 0.45, midY - rail);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + 2, midY + rail);
      ctx.lineTo(midX - post * 0.45, midY + rail);
      ctx.stroke();
    }
    if (c.e) {
      ctx.beginPath();
      ctx.moveTo(midX + post * 0.45, midY - rail);
      ctx.lineTo(x + s - 2, midY - rail);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(midX + post * 0.45, midY + rail);
      ctx.lineTo(x + s - 2, midY + rail);
      ctx.stroke();
    }
    if (c.n || c.s) {
      ctx.strokeStyle = palette.dark;
      ctx.lineWidth = rail;
      ctx.beginPath();
      ctx.moveTo(midX - rail, c.n ? y + 2 : midY - post * 0.5);
      ctx.lineTo(midX - rail, c.s ? y + s - 2 : midY + post * 0.5);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(midX + rail, c.n ? y + 2 : midY - post * 0.5);
      ctx.lineTo(midX + rail, c.s ? y + s - 2 : midY + post * 0.5);
      ctx.stroke();
    }
    ctx.fillStyle = palette.dark;
    ctx.fillRect(midX - post * 0.55, y + s * 0.2, unit * 3, s * 0.6);
    ctx.fillRect(midX + post * 0.35, y + s * 0.2, unit * 3, s * 0.6);
    ctx.fillStyle = '#c99552';
    ctx.fillRect(midX - post * 0.28, y + s * 0.28, post * 0.56, s * 0.44);
    ctx.strokeStyle = '#3d291c';
    ctx.lineWidth = unit;
    ctx.strokeRect(midX - post * 0.28, y + s * 0.28, post * 0.56, s * 0.44);
  } else {
    ctx.strokeStyle = palette.dark;
    ctx.lineWidth = rail;
    if (c.w || c.e) {
      ctx.beginPath();
      ctx.moveTo(c.w ? x + 1 : midX, midY - rail);
      ctx.lineTo(c.e ? x + s - 1 : midX, midY - rail);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(c.w ? x + 1 : midX, midY + rail);
      ctx.lineTo(c.e ? x + s - 1 : midX, midY + rail);
      ctx.stroke();
    }
    if (c.n || c.s) {
      ctx.beginPath();
      ctx.moveTo(midX - rail, c.n ? y + 1 : midY);
      ctx.lineTo(midX - rail, c.s ? y + s - 1 : midY);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(midX + rail, c.n ? y + 1 : midY);
      ctx.lineTo(midX + rail, c.s ? y + s - 1 : midY);
      ctx.stroke();
    }
    ctx.fillStyle = palette.body;
    ctx.fillRect(midX - post / 2, midY - post / 2, post, post);
    ctx.strokeStyle = palette.dark;
    ctx.lineWidth = unit;
    ctx.strokeRect(midX - post / 2, midY - post / 2, post, post);
    ctx.fillStyle = palette.light;
    ctx.fillRect(midX - post / 2 + unit, midY - post / 2 + unit, post - unit * 2, unit * 2);
  }

  if (p.season === 'winter') {
    ctx.fillStyle = 'rgba(245, 240, 220, 0.72)';
    ctx.fillRect(x + s * 0.2, y + s * 0.18, s * 0.6, unit * 2);
  }

  ctx.restore();
  return true;
}

function activeTerrainGrowthSheet(
  highDefinition: boolean | undefined,
): { image: HTMLImageElement; sheet: TerrainGrowthSheet } | null {
  if (highDefinition && terrainGrowthHdSheet) {
    return { image: terrainGrowthHdSheet, sheet: TERRAIN_GROWTH_SHEETS.highDefinition };
  }
  if (terrainGrowthSheet) {
    return { image: terrainGrowthSheet, sheet: TERRAIN_GROWTH_SHEETS.standard };
  }
  if (terrainGrowthHdSheet) {
    return { image: terrainGrowthHdSheet, sheet: TERRAIN_GROWTH_SHEETS.highDefinition };
  }
  return null;
}

function blitTerrainGrowth(
  ctx: CanvasRenderingContext2D,
  p: TerrainDrawParams,
  source: TerrainGrowthSourceRect,
  image: HTMLImageElement,
  drawScale = 1,
): void {
  const width = TERRAIN_GROWTH_DRAW_SIZE.width * drawScale;
  const height = TERRAIN_GROWTH_DRAW_SIZE.height * drawScale;
  const x = p.x + p.size / 2 - width / 2;
  const y = p.y + p.size - height;
  ctx.drawImage(image, source.sx, source.sy, source.sw, source.sh, x, y, width, height);
}

export const atlasSprites: SpriteAPI = {
  id: 'kenney-atlas-lake-calm-water-historical-ground-terrain-growth-hd-v5',

  drawTerrain(ctx, p) {
    if (!sheet) return;
    ctx.imageSmoothingEnabled = false;
    const h = hash(p.tileX, p.tileY);

    // 자연 수면: 이웃 정보 기반 면적 렌더링 — 땅 밑바탕 + 물 영역 + 둑 (결빙 시 얼음 텍스처)
    if (p.terrain === 'river' || p.terrain === 'lake' || p.terrain === 'sea') {
      if (riverSheet && historicalTerrainSheet && p.banks) {
        drawNaturalWaterTile(ctx, p);
        return;
      }
      blit(ctx, sheet, h % 7 === 0 ? WATER_SPARKLE : WATER, p.x, p.y, p.size);
      // 뭍과 닿는 방향에 못(pond) 가장자리 타일의 띠를 잘라 붙여 물가를 만든다
      if (p.banks && !p.winter) {
        drawBanks(ctx, p.x, p.y, p.size, p.banks, p.season);
      }
      if (p.frozenRiver) {
        ctx.fillStyle = 'rgba(226,238,248,0.7)';
        ctx.fillRect(p.x, p.y, p.size, p.size);
        ctx.strokeStyle = 'rgba(255,255,255,0.65)';
        ctx.beginPath();
        ctx.moveTo(p.x + 3, p.y + p.size - 4);
        ctx.lineTo(p.x + p.size - 3, p.y + 4);
        ctx.stroke();
      }
      return;
    }

    if (p.terrain === 'mudflat') {
      drawCoastalGround(ctx, p, 'mudflat');
      blendGroundEdges(ctx, p);
      return;
    }

    // 바닥 (겨울엔 크림색 지면으로 갈아 눈밭 느낌을 낸다)
    const drewHistoricalGround = drawHistoricalGround(ctx, p.terrain, p);

    if (!drewHistoricalGround) {
      let base: CR = GRASS;
      if (p.winter) base = GROUND_PALE;
      else if (p.terrain === 'fertile') base = GRASS_FERTILE;
      else if (p.terrain === 'plain' || p.terrain === 'center') {
        if (p.season === 'spring' && h % 9 === 0) base = GRASS_FLOWER_WHITE;
        else if (p.season === 'summer' && h % 11 === 0) base = GRASS_FLOWER_RED;
      }
      blit(ctx, sheet, base, p.x, p.y, p.size);
    }

    if (p.terrain === 'fertile') {
      ctx.fillStyle = fertileGroundWash(p.season);
      ctx.fillRect(p.x, p.y, p.size, p.size);
    }

    if (p.coastalGround && (p.terrain === 'plain' || p.terrain === 'fertile')) {
      drawCoastalGround(ctx, p, p.coastalGround);
    }

    // 우세 이웃 지형의 바닥이 경계를 넘어 번진다 (숲·바위 경계의 직선 절단 완화).
    blendGroundEdges(ctx, p);

    // 새 자산이 준비되지 않은 동안에는 기존 한 칸 소품을 폴백으로 유지한다.
    if (!activeTerrainGrowthSheet(p.highDefinition)) {
      let terrainObject = terrainObjectFor(p.terrain, p.season, p.hasIron ?? false);
      if (terrainObject === 'lowRock' && h % 2 === 1) terrainObject = 'fieldstone';
      if (terrainObject === 'broadleaf' && h % 3 === 0) terrainObject = 'pine';
      if (terrainObject === 'winterTree' && h % 3 === 0) terrainObject = 'snowPine';
      if (terrainObject && terrainObjectSheet) {
        blitTerrainObject(ctx, terrainObjectSheet, terrainObject, p.x, p.y, p.size);
      }
    }

    // 계절 색조 (겨울 눈덮임 / 가을 마름)
    if (!drewHistoricalGround) {
      seasonWash(ctx, p.season, p.x, p.y, p.size);
    }
  },

  drawTerrainProp(ctx, p) {
    const growth = activeTerrainGrowthSheet(p.highDefinition);
    if (!growth) return;
    ctx.imageSmoothingEnabled = false;
    if (p.terrain === 'forest' && p.treeStage === 'stump') {
      const source = treeGrowthSourceRect(
        growth.sheet,
        p.season,
        p.treeSpecies ?? 'broadleaf',
        'stump',
      );
      blitTerrainGrowth(ctx, p, source, growth.image, TERRAIN_GROWTH_TREE_DRAW_SCALE);
    } else if (p.terrain === 'rock' && p.mineralResource && p.mineralTier) {
      const source = mineralGrowthSourceRect(growth.sheet, p.mineralResource, p.mineralTier);
      blitTerrainGrowth(ctx, p, source, growth.image);
    }
  },

  drawTerrainOverlay(ctx, p) {
    const growth = activeTerrainGrowthSheet(p.highDefinition);
    if (!growth) return;
    ctx.imageSmoothingEnabled = false;
    if (p.terrain === 'forest' && p.treeStage && p.treeStage !== 'stump') {
      const source = treeGrowthSourceRect(
        growth.sheet,
        p.season,
        p.treeSpecies ?? 'broadleaf',
        p.treeStage,
      );
      blitTerrainGrowth(ctx, p, source, growth.image, TERRAIN_GROWTH_TREE_DRAW_SCALE);
    } else if (p.terrain === 'mountain') {
      const source = mountainGrowthSourceRect(
        growth.sheet,
        p.winter,
        p.mountainProfile ?? 'shoulder',
      );
      blitTerrainGrowth(ctx, p, source, growth.image);
    }
  },

  drawBuilding(ctx, p: BuildingDrawParams) {
    if (!sheet) return;
    ctx.imageSmoothingEnabled = false;
    const spr = BUILDING_SPRITES[p.type];
    const alpha = p.ghost ? 0.75 : p.built ? 1 : 0.55;
    ctx.globalAlpha = alpha;

    if (p.type === 'cemetery') {
      if (!blitCemeteryPlot(ctx, p)) drawCemeteryPlotFallback(ctx, p);
      ctx.globalAlpha = 1;
      drawProgressBar(ctx, p);
      return;
    }

    if (blitTidalFisheryBuilding(ctx, p)) {
      ctx.globalAlpha = 1;
      drawProgressBar(ctx, p);
      return;
    }

    if (blitSaltworksBuilding(ctx, p)) {
      ctx.globalAlpha = 1;
      drawProgressBar(ctx, p);
      return;
    }

    if (blitBoatyardBuilding(ctx, p)) {
      ctx.globalAlpha = 1;
      drawProgressBar(ctx, p);
      return;
    }

    if (blitObliqueBuilding(ctx, p)) {
      ctx.globalAlpha = 1;
      drawProgressBar(ctx, p);
      return;
    }

    if (p.type === 'center' && p.rank && p.rank !== 'settlement' && centerPromotionSheet) {
      blitCenterPromotion(ctx, centerPromotionSheet, p);
      ctx.globalAlpha = 1;
      drawProgressBar(ctx, p);
      return;
    }

    if (drawWallFamilyBuilding(ctx, p)) {
      ctx.globalAlpha = 1;
      drawProgressBar(ctx, p);
      return;
    }

    if (p.type === 'canal') {
      drawCanalBuilding(ctx, p);
      ctx.globalAlpha = 1;
      drawProgressBar(ctx, p);
      return;
    }

    if (isWaterworksBuildingType(p.type)) {
      const useHighDefinition = Boolean(p.highDefinition && waterworksBuildingHdSheet);
      const image = useHighDefinition ? waterworksBuildingHdSheet : waterworksBuildingSheet ?? waterworksBuildingHdSheet;
      if (image) {
        blitWaterworksBuilding(ctx, image, p, useHighDefinition || !waterworksBuildingSheet);
        ctx.globalAlpha = 1;
        drawProgressBar(ctx, p);
        return;
      }
    }

    if (isNewContentBuildingType(p.type)) {
      const useLarge = p.size > NEW_CONTENT_BUILDING_SHEET.tileSize && newContentLargeBuildingSheet;
      const image = useLarge ? newContentLargeBuildingSheet : newContentBuildingSheet;
      if (image) {
        blitNewContentBuilding(ctx, image, p, Boolean(useLarge));
        ctx.globalAlpha = 1;
        drawProgressBar(ctx, p);
        return;
      }
    }

    if (isSpecializedBuildingType(p.type)) {
      const useLarge = p.size > SPECIALIZED_BUILDING_SHEET.tileSize && specializedLargeBuildingSheet;
      const image = useLarge ? specializedLargeBuildingSheet : specializedBuildingSheet;
      if (image) {
        blitSpecializedBuilding(ctx, image, p, Boolean(useLarge));
        ctx.globalAlpha = 1;
        drawProgressBar(ctx, p);
        return;
      }
    }

    if (isPromotionBuildingType(p.type) && p.size > PROMOTION_BUILDING_SHEET.tileSize && promotionLargeBuildingSheet) {
      blitLargePromotionBuilding(ctx, promotionLargeBuildingSheet, p);
      ctx.globalAlpha = 1;
      if (!p.built && !p.ghost) {
        ctx.fillStyle = '#10141a';
        ctx.fillRect(p.x + 2, p.y + p.size - 4, p.size - 4, 3);
        ctx.fillStyle = '#d9a441';
        ctx.fillRect(p.x + 2, p.y + p.size - 4, (p.size - 4) * p.progress01, 3);
      }
      return;
    }

    if (promotionBuildingSheet && isPromotionBuildingType(p.type)) {
      blitPromotionBuilding(ctx, promotionBuildingSheet, p);
      ctx.globalAlpha = 1;
      if (!p.built && !p.ghost) {
        ctx.fillStyle = '#10141a';
        ctx.fillRect(p.x + 2, p.y + p.size - 4, p.size - 4, 3);
        ctx.fillStyle = '#d9a441';
        ctx.fillRect(p.x + 2, p.y + p.size - 4, (p.size - 4) * p.progress01, 3);
      }
      return;
    }

    if (largeBuildingSheet && p.size > GENERATED_BUILDING_SHEET.tileSize) {
      blitLargeGeneratedBuilding(ctx, largeBuildingSheet, p);
      ctx.globalAlpha = 1;
      if (!p.built && !p.ghost) {
        ctx.fillStyle = '#10141a';
        ctx.fillRect(p.x + 2, p.y + p.size - 4, p.size - 4, 3);
        ctx.fillStyle = '#d9a441';
        ctx.fillRect(p.x + 2, p.y + p.size - 4, (p.size - 4) * p.progress01, 3);
      }
      return;
    }

    if (buildingSheet) {
      blitGeneratedBuilding(ctx, buildingSheet, p);
      ctx.globalAlpha = 1;
      if (!p.built && !p.ghost) {
        ctx.fillStyle = '#10141a';
        ctx.fillRect(p.x + 2, p.y + p.size - 4, p.size - 4, 3);
        ctx.fillStyle = '#d9a441';
        ctx.fillRect(p.x + 2, p.y + p.size - 4, (p.size - 4) * p.progress01, 3);
      }
      return;
    }

    // 몸체
    blit(ctx, sheet, spr.base, p.x, p.y, p.size);
    // 지붕 (위 타일 쪽으로 살짝 겹침, 타일 크기에 비례)
    if (spr.roof) {
      const lift = Math.round((spr.roofLift ?? 9) * (p.size / T));
      blit(ctx, sheet, spr.roof, p.x, p.y - lift, p.size);
    }
    // 표식
    if (spr.glyph) {
      const s = Math.floor(p.size * 0.55);
      blit(ctx, sheet, spr.glyph, p.x + p.size - s, p.y + p.size - s, s);
    }
    // 밭: 성장 단계 덧그림
    if ((p.type === 'field' || p.type === 'paddy') && p.growth01 != null && p.growth01 > 0.05) {
      blit(ctx, sheet, p.growth01 < 0.55 ? SPROUT : CROP, p.x, p.y, p.size);
    }
    ctx.globalAlpha = 1;

    // 공정률 막대
    if (!p.built && !p.ghost) {
      ctx.fillStyle = '#10141a';
      ctx.fillRect(p.x + 2, p.y + p.size - 4, p.size - 4, 3);
      ctx.fillStyle = '#d9a441';
      ctx.fillRect(p.x + 2, p.y + p.size - 4, (p.size - 4) * p.progress01, 3);
    }
  },

  drawBuildingDamage(ctx, p: BuildingDamageDrawParams) {
    if (!buildingDamageSheet) return;
    const rect = buildingDamageSourceRect(p.season);
    const destHeight = BUILDING_DAMAGE_SHEET.spriteHeight * (p.size / BUILDING_DAMAGE_SHEET.spriteWidth);
    ctx.drawImage(
      buildingDamageSheet,
      rect.sx,
      rect.sy,
      rect.sw,
      rect.sh,
      p.x,
      p.y + p.size - destHeight,
      p.size,
      destHeight,
    );
  },

  drawLivestock(ctx, p) {
    const active = activeLivestockSheet(p.highDefinition);
    if (!active) return;
    const rect = livestockSourceRect(active.sheet, p.species);
    const drawSize = CONFIG.ui.tileSize;
    ctx.save();
    ctx.translate(p.x, p.y);
    if (p.facing === -1) ctx.scale(-1, 1);
    ctx.drawImage(
      active.image,
      rect.sx,
      rect.sy,
      rect.sw,
      rect.sh,
      -drawSize / 2,
      -drawSize / 2,
      drawSize,
      drawSize,
    );
    ctx.restore();
  },

  drawCorpse(ctx, p) {
    const active = activeCorpseCoffinSprite(p.highDefinition);
    if (!active) return;
    const drawSize = p.size * 1.14;
    ctx.drawImage(
      active.image,
      0,
      0,
      active.sprite.cellSize,
      active.sprite.cellSize,
      p.x + (p.size - drawSize) / 2,
      p.y + (p.size - drawSize) / 2,
      drawSize,
      drawSize,
    );
  },

  drawForeignStructure(ctx, p) {
    const sheet = p.variant === 'core' ? foreignSiteCoreSheet : foreignSitePropSheet;
    return sheet ? drawForeignStructureSprite(ctx, sheet, p) : false;
  },

  drawResident(ctx, p) {
    const characterSheet = generatedCharacterSheet;
    const militiaSheet = militiaWeaponSheet;
    const kenneyChars = chars;
    const specializedSheet = specializedCharacterSheet;
    const foreignRect = foreignResidentSourceRect(p.foreignFaction, p.gender);
    const newContentRect = newContentResidentSourceRect(p.job, p.gender, p.stage);
    if (!characterSheet && !specializedSheet && !militiaSheet && !kenneyChars && !specialResidentSheet &&
        !residentApprovedI2VSheet && !residentApprovedI2VHdSheet &&
        !religiousSuccessorSheet && !religiousSuccessorHdSheet &&
        (!newContentResidentSheet || !newContentRect) && (!foreignResidentSheet || !foreignRect)) return;
    ctx.imageSmoothingEnabled = false;
    const half = CHALF;
    const animationTime = p.animationTimeMs ?? performance.now();
    const bob = (p.moving ? Math.floor(animationTime / 130) % 2 : 0) * CF;
    let drewOptionalResidentPresentation = false;

    if (p.selected) {
      ctx.strokeStyle = '#d9a441';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y + half - CF, 7 * CF, 3 * CF, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 1;
    }

    const specialRect = p.special ? specialResidentSourceRect(p.special) : null;
    if (p.special && drawApprovedI2VLocomotion(ctx, p, animationTime)) {
      drewOptionalResidentPresentation = true;
    } else if (specialResidentSheet && specialRect) {
      drawGeneratedCharacterRect(ctx, specialResidentSheet, specialRect, p.x, p.y, p.facing, bob, 1.16);
    } else if (!p.special && (p.religiousVocation || p.stage === 'youth') &&
        drawApprovedI2VLocomotion(ctx, p, animationTime)) {
      drewOptionalResidentPresentation = true;
    } else if (drawReligiousSuccessorStatic(ctx, p)) {
      drewOptionalResidentPresentation = true;
    } else if (foreignResidentSheet && foreignRect) {
      drawGeneratedCharacterRect(ctx, foreignResidentSheet, foreignRect, p.x, p.y, p.facing, bob);
    } else if (newContentResidentSheet && newContentRect && p.stage) {
      drawGeneratedCharacterRect(ctx, newContentResidentSheet, newContentRect, p.x, p.y, p.facing, bob);
    } else if ((drewOptionalResidentPresentation = drawOptionalResidentPresentation(ctx, p, animationTime))) {
      // Optional sheets are selected by the requested presentation state. If that exact
      // sheet is unavailable, the chain continues to the generated resident fallback.
    } else if (newContentResidentSheet && newContentRect) {
      drawGeneratedCharacterRect(ctx, newContentResidentSheet, newContentRect, p.x, p.y, p.facing, bob);
    } else if (militiaSheet && p.job === 'militia' && p.militiaWeapon) {
      drawGeneratedCharacterRect(
        ctx,
        militiaSheet,
        militiaWeaponSourceRect(p.militiaWeapon, p.gender),
        p.x,
        p.y,
        p.facing,
        bob,
      );
    } else if (promotionCharacterSheet && isPromotionCharacterJob(p.job)) {
      const rect = promotionResidentSourceRect(p.job, p.gender);
      if (rect) drawGeneratedCharacterRect(ctx, promotionCharacterSheet, rect, p.x, p.y, p.facing, bob);
    } else if (specializedSheet && isSpecializedCharacterJob(p.job)) {
      const rect = specializedResidentSourceRect(p.job, p.gender);
      if (rect) drawGeneratedCharacterRect(ctx, specializedSheet, rect, p.x, p.y, p.facing, bob);
    } else if (characterSheet) {
      drawGeneratedResident(ctx, characterSheet, p, bob);
    } else if (kenneyChars) {
      ctx.save();
      ctx.translate(p.x, p.y - bob);
      if (p.facing === -1) ctx.scale(-1, 1);
      blit(ctx, kenneyChars, CHAR_BY_JOB[p.job], -half, -half, CHAR);
      ctx.restore();
    }

    // 개척지 주민은 직업색 사각형, 외부 주민은 세력색 마름모로 구분한다.
    const factionColor = p.foreignFaction
      ? FACTIONS.find(faction => faction.name === p.foreignFaction)?.color
      : null;
    const dot = Math.max(3, Math.round(3 * CF));
    if (factionColor) {
      ctx.save();
      ctx.translate(p.x, p.y - half - 2 * CF - bob);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = factionColor;
      ctx.strokeStyle = 'rgba(0,0,0,0.75)';
      ctx.lineWidth = 1;
      ctx.fillRect(-dot / 2, -dot / 2, dot, dot);
      ctx.strokeRect(-dot / 2, -dot / 2, dot, dot);
      ctx.restore();
    } else if (p.showJobMarker !== false) {
      ctx.fillStyle = JOB_COLORS[p.job];
      // HD 작업 자세의 머리·모자까지 가리지 않도록 실제 캐릭터 상단보다 높게 둔다.
      ctx.fillRect(p.x - dot / 2, p.y - half - 12 * CF - bob, dot, dot);
    }
    if (p.sick) {
      ctx.fillStyle = '#e06c5c';
      ctx.font = `bold ${Math.round(9 * CF)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('+', p.x + half - 2 * CF, p.y - half + 2 * CF);
    }
    const integratedCargo = drewOptionalResidentPresentation && (
      p.job === 'hauler' ||
      isResidentJigeCargoJob(p.job) ||
      Boolean(p.carryingWood || p.carryingGame || p.carryingMinerals)
    );
    if (p.carrying && !integratedCargo && p.showCargoMarker !== false) {
      const b = Math.round(4 * CF);
      ctx.fillStyle = '#f0e6c8';
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(p.x + half - 5 * CF, p.y + CF, b, b);
      ctx.strokeRect(p.x + half - 5 * CF, p.y + CF, b, b);
    }
  },

  drawExpedition(ctx, p: ExpeditionDrawParams) {
    const visible = Math.min(p.members.length, 4);
    for (let i = 0; i < visible; i++) {
      const member = p.members[i];
      const ox = ((i * 17) % 15 - 7) * 0.8 * CF;
      const oy = ((i * 29) % 11 - 5) * 0.75 * CF;
      atlasSprites.drawResident(ctx, {
        job: member.job,
        gender: member.gender,
        x: p.x + ox,
        y: p.y + oy,
        sick: false,
        carrying: false,
        selected: false,
        moving: p.moving,
        facing: p.facing,
        militiaWeapon: member.militiaWeapon,
        special: member.special,
      });
    }
    ctx.save();
    ctx.strokeStyle = '#263d50';
    ctx.lineWidth = Math.max(1.5, 1.5 * CF);
    ctx.beginPath();
    ctx.moveTo(p.x + 9 * CF, p.y + 7 * CF);
    ctx.lineTo(p.x + 9 * CF, p.y - 15 * CF);
    ctx.stroke();
    ctx.fillStyle = '#4f83a8';
    ctx.strokeStyle = '#d7e5ee';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(p.x + 10 * CF, p.y - 15 * CF);
    ctx.lineTo(p.x + 22 * CF, p.y - 12 * CF);
    ctx.lineTo(p.x + 10 * CF, p.y - 7 * CF);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    if (p.total > visible) {
      ctx.fillStyle = '#edf4f7';
      ctx.strokeStyle = '#263d50';
      ctx.font = `bold ${Math.round(8 * CF)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.strokeText(String(p.total), p.x, p.y - 13 * CF);
      ctx.fillText(String(p.total), p.x, p.y - 13 * CF);
    }
    ctx.restore();
  },

  drawRaiders(ctx, p) {
    const characterSheet = generatedCharacterSheet;
    const raiderSheet = factionRaiderSheet;
    const factionRect = factionRaiderSourceRect(p.faction);
    const kenneyChars = chars;
    if ((!raiderSheet || !factionRect) && !characterSheet && !kenneyChars) return;
    ctx.imageSmoothingEnabled = false;
    const visible = raiderSheet || characterSheet ? Math.min(p.count, 4) : p.count;
    for (let i = 0; i < visible; i++) {
      const ox = ((i * 17) % 15 - 7) * 1.1 * CF;
      const oy = ((i * 29) % 11 - 5) * 1.1 * CF;
      const bob = (p.moving ? Math.floor(performance.now() / 130 + i) % 2 : 0) * CF;
      if (raiderSheet && factionRect) {
        drawGeneratedCharacterRect(ctx, raiderSheet, factionRect, p.x + ox, p.y + oy, p.facing, bob);
      } else if (characterSheet) {
        drawGeneratedMountedRaider(ctx, characterSheet, p, i, bob, ox, oy);
      } else if (kenneyChars) {
        ctx.save();
        ctx.translate(p.x + ox, p.y + oy - bob);
        if (p.facing === -1) ctx.scale(-1, 1);
        blit(ctx, kenneyChars, CHAR_RAIDER, -CHALF, -CHALF, CHAR);
        ctx.restore();
      }
    }
    if (p.spotted) {
      ctx.fillStyle = '#e05f5f';
      ctx.font = `bold ${Math.round(11 * CF)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('!', p.x, p.y - 14 * CF);
    }
  },
};
