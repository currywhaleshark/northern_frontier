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
  type RaiderDrawParams,
  type ResidentDrawParams,
  type SpriteAPI,
  type TerrainDrawParams,
} from './sprites';
import {
  GENERATED_CHARACTER_SHEET,
  generatedCharacterFacingScale,
  generatedMountedRaiderSourceRect,
  generatedResidentSourceRect,
} from './generatedCharacterAssets';
import { CONFIG } from '../game/config';
import { FACTIONS, JOB_COLORS } from '../game/constants';
import { isGateBuilding, isWallBuilding } from '../game/walls';
import type { BuildingTypeId, JobId, Season, Terrain } from '../game/types';
import {
  HISTORICAL_TERRAIN_SAMPLE_SIZE,
  historicalTerrainSampleOffsetFromHash,
  historicalTerrainSourceRect,
  historicalTerrainVariantFromHash,
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
  RESIDENT_HUNTER_HUNT_SHEET,
  RESIDENT_HUNTER_LOAD_SHEET,
  RESIDENT_HUNTER_LOCOMOTION_SHEET,
  hunterHuntSourceRect,
  hunterLoadSourceRect,
  hunterLocomotionSourceRect,
} from './residentHunterAssets';
import {
  RESIDENT_HAULER_CART_LOCOMOTION_SHEET,
  RESIDENT_HAULER_LOCOMOTION_SHEET,
  haulerCartLocomotionSourceRect,
  haulerLocomotionSourceRect,
} from './residentHaulerAssets';
import {
  RESIDENT_FARMER_HARVEST_SHEET,
  RESIDENT_FARMER_OX_PLOW_SHEET,
  RESIDENT_FARMER_TILL_SHEET,
  farmerHarvestSourceRect,
  farmerOxPlowSourceRect,
  farmerTillSourceRect,
} from './residentFarmerAssets';
import {
  RESIDENT_BUILDER_LOCOMOTION_SHEET,
  RESIDENT_BUILDER_WORK_SHEET,
  builderLocomotionSourceRect,
  builderWorkSourceRect,
} from './residentBuilderAssets';
import {
  RESIDENT_MINER_LOAD_SHEET,
  RESIDENT_MINER_LOCOMOTION_SHEET,
  RESIDENT_MINER_WORK_SHEET,
  minerLoadSourceRect,
  minerLocomotionSourceRect,
  minerWorkSourceRect,
} from './residentMinerAssets';
import {
  RESIDENT_HERBALIST_GATHER_SHEET,
  RESIDENT_HERBALIST_LOCOMOTION_SHEET,
  herbalistGatherSourceRect,
  herbalistLocomotionSourceRect,
} from './residentHerbalistAssets';

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
let terrainObjectSheet: HTMLImageElement | null = null;
let buildingSheet: HTMLImageElement | null = null;
let largeBuildingSheet: HTMLImageElement | null = null;
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
let foreignResidentSheet: HTMLImageElement | null = null;
let foreignSiteCoreSheet: HTMLImageElement | null = null;
let foreignSitePropSheet: HTMLImageElement | null = null;
let specialResidentSheet: HTMLImageElement | null = null;
let centerPromotionSheet: HTMLImageElement | null = null;
let residentWoodcutterWorkSheet: HTMLImageElement | null = null;
let residentWoodcutterLocomotionSheet: HTMLImageElement | null = null;
let residentWoodcutterLoadSheet: HTMLImageElement | null = null;
let residentHunterHuntSheet: HTMLImageElement | null = null;
let residentHunterLocomotionSheet: HTMLImageElement | null = null;
let residentHunterLoadSheet: HTMLImageElement | null = null;
let residentHaulerLocomotionSheet: HTMLImageElement | null = null;
let residentHaulerCartLocomotionSheet: HTMLImageElement | null = null;
let residentFarmerTillSheet: HTMLImageElement | null = null;
let residentFarmerHarvestSheet: HTMLImageElement | null = null;
let residentFarmerOxPlowSheet: HTMLImageElement | null = null;
let residentBuilderLocomotionSheet: HTMLImageElement | null = null;
let residentBuilderWorkSheet: HTMLImageElement | null = null;
let residentMinerLocomotionSheet: HTMLImageElement | null = null;
let residentMinerWorkSheet: HTMLImageElement | null = null;
let residentMinerLoadSheet: HTMLImageElement | null = null;
let residentHerbalistLocomotionSheet: HTMLImageElement | null = null;
let residentHerbalistGatherSheet: HTMLImageElement | null = null;
let started = false;

export interface AtlasAssetState {
  src: string;
  status: 'idle' | 'loading' | 'loaded' | 'failed';
  required: boolean;
}

const atlasAssetStates: AtlasAssetState[] = [];
const atlasAssetSettledListeners = new Set<() => void>();
const warnedAssetFailures = new Set<string>();

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

function ensureLoaded(): void {
  if (started || typeof Image === 'undefined') return;
  started = true;
  loadAtlasAsset('/assets/roguelikeSheet_transparent.png', true, image => { sheet = image; });
  loadAtlasAsset('/assets/roguelikeChar_transparent.png', true, image => { chars = image; });
  loadAtlasAsset('/assets/river-mask-autotile-28px-sheet.png', true, image => { riverSheet = image; });
  loadAtlasAsset('/assets/folk-warm-terrain-v3-28px-sheet.png', true, image => { historicalTerrainSheet = image; });
  loadAtlasAsset(GENERATED_TERRAIN_OBJECT_SHEET.src, true, image => { terrainObjectSheet = image; });
  loadAtlasAsset(GENERATED_BUILDING_SHEET.src, true, image => { buildingSheet = image; });
  loadAtlasAsset(GENERATED_LARGE_BUILDING_SHEET.src, true, image => { largeBuildingSheet = image; });
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
  loadAtlasAsset(RESIDENT_HUNTER_LOCOMOTION_SHEET.src, false, image => { residentHunterLocomotionSheet = image; });
  loadAtlasAsset(RESIDENT_HUNTER_LOAD_SHEET.src, false, image => { residentHunterLoadSheet = image; });
  loadAtlasAsset(RESIDENT_HAULER_LOCOMOTION_SHEET.src, false, image => { residentHaulerLocomotionSheet = image; });
  loadAtlasAsset(RESIDENT_HAULER_CART_LOCOMOTION_SHEET.src, false, image => { residentHaulerCartLocomotionSheet = image; });
  loadAtlasAsset(RESIDENT_FARMER_TILL_SHEET.src, false, image => { residentFarmerTillSheet = image; });
  loadAtlasAsset(RESIDENT_FARMER_HARVEST_SHEET.src, false, image => { residentFarmerHarvestSheet = image; });
  loadAtlasAsset(RESIDENT_FARMER_OX_PLOW_SHEET.src, false, image => { residentFarmerOxPlowSheet = image; });
  loadAtlasAsset(RESIDENT_BUILDER_LOCOMOTION_SHEET.src, false, image => { residentBuilderLocomotionSheet = image; });
  loadAtlasAsset(RESIDENT_BUILDER_WORK_SHEET.src, false, image => { residentBuilderWorkSheet = image; });
  loadAtlasAsset(RESIDENT_MINER_LOCOMOTION_SHEET.src, false, image => { residentMinerLocomotionSheet = image; });
  loadAtlasAsset(RESIDENT_MINER_WORK_SHEET.src, false, image => { residentMinerWorkSheet = image; });
  loadAtlasAsset(RESIDENT_MINER_LOAD_SHEET.src, false, image => { residentMinerLoadSheet = image; });
  loadAtlasAsset(RESIDENT_HERBALIST_LOCOMOTION_SHEET.src, false, image => { residentHerbalistLocomotionSheet = image; });
  loadAtlasAsset(RESIDENT_HERBALIST_GATHER_SHEET.src, false, image => { residentHerbalistGatherSheet = image; });
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

function drawGeneratedCharacterRect(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  rect: SourceRect,
  x: number,
  y: number,
  facing: 1 | -1 | undefined,
  bob: number,
  sizeScale = 1,
): void {
  const scale = (CHAR / GENERATED_CHARACTER_SHEET.residentWidth) * sizeScale;
  const dw = rect.sw * scale;
  const dh = rect.sh * scale;
  ctx.save();
  ctx.translate(x, y - bob);
  ctx.scale(generatedCharacterFacingScale(facing), 1);
  ctx.drawImage(img, rect.sx, rect.sy, rect.sw, rect.sh, -dw / 2, CHALF - dh, dw, dh);
  ctx.restore();
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

function drawOptionalResidentPresentation(
  ctx: CanvasRenderingContext2D,
  p: ResidentDrawParams,
  animationTimeMs: number,
): boolean {
  const draw = (image: HTMLImageElement | null, rect: SourceRect): boolean => {
    if (!image) return false;
    drawGeneratedCharacterRect(ctx, image, rect, p.x, p.y, p.facing, 0, p.sizeScale ?? 1);
    return true;
  };

  switch (p.job) {
    case 'woodcutter':
      if (p.working && !p.moving) {
        return draw(residentWoodcutterWorkSheet, woodcutterWorkSourceRect(p.gender, animationTimeMs));
      }
      if (p.carryingWood) {
        return draw(residentWoodcutterLoadSheet, woodcutterLoadSourceRect(p.gender, Boolean(p.moving), animationTimeMs));
      }
      return draw(residentWoodcutterLocomotionSheet,
        woodcutterLocomotionSourceRect(p.gender, Boolean(p.moving), animationTimeMs));
    case 'hunter':
      if (p.working && !p.moving) {
        return draw(residentHunterHuntSheet, hunterHuntSourceRect(p.gender, animationTimeMs));
      }
      if (p.carryingGame) {
        return draw(residentHunterLoadSheet, hunterLoadSourceRect(p.gender, Boolean(p.moving), animationTimeMs));
      }
      return draw(residentHunterLocomotionSheet,
        hunterLocomotionSourceRect(p.gender, Boolean(p.moving), animationTimeMs));
    case 'hauler':
      if (p.cartEquipped) {
        return draw(residentHaulerCartLocomotionSheet,
          haulerCartLocomotionSourceRect(p.gender, Boolean(p.moving), animationTimeMs));
      }
      return draw(residentHaulerLocomotionSheet,
        haulerLocomotionSourceRect(p.gender, Boolean(p.moving), animationTimeMs));
    case 'farmer':
      if (p.farmerAction === 'oxPlow') {
        return draw(residentFarmerOxPlowSheet, farmerOxPlowSourceRect(p.gender, animationTimeMs));
      }
      if (p.farmerAction === 'harvest') {
        return draw(residentFarmerHarvestSheet, farmerHarvestSourceRect(p.gender, animationTimeMs));
      }
      if (p.farmerAction === 'till') {
        return draw(residentFarmerTillSheet, farmerTillSourceRect(p.gender, animationTimeMs));
      }
      return false;
    case 'builder':
      if (p.working && !p.moving) {
        return draw(residentBuilderWorkSheet, builderWorkSourceRect(p.gender, animationTimeMs));
      }
      return draw(residentBuilderLocomotionSheet,
        builderLocomotionSourceRect(p.gender, Boolean(p.moving), animationTimeMs));
    case 'herbalist':
      if (p.working && !p.moving) {
        return draw(residentHerbalistGatherSheet, herbalistGatherSourceRect(p.gender, animationTimeMs));
      }
      return draw(residentHerbalistLocomotionSheet,
        herbalistLocomotionSourceRect(p.gender, Boolean(p.moving), animationTimeMs));
    case 'miner':
      if (p.working && !p.moving) {
        return draw(residentMinerWorkSheet, minerWorkSourceRect(p.gender, animationTimeMs));
      }
      if (p.carryingMinerals) {
        return draw(residentMinerLoadSheet, minerLoadSourceRect(p.gender, Boolean(p.moving), animationTimeMs));
      }
      return draw(residentMinerLocomotionSheet,
        minerLocomotionSourceRect(p.gender, Boolean(p.moving), animationTimeMs));
    default:
      return false;
  }
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
  jangdokdae: { base: FACE_STONE, glyph: HIDE },
  bridge:     { base: FENCE },
  lumberCamp: { base: LOGS },
  woodShed:   { base: LOGS, glyph: CAMPFIRE },
  huntLodge:  { base: TENT_TAN },
  herbHut:    { roof: ROOF_BROWN, base: FACE_DOOR, glyph: HERB },
  clinic:     { roof: ROOF_DARK, base: FACE_DOOR, glyph: HERB },
  field:      { base: DIRT }, // 성장 단계는 drawBuilding에서 덧그림
  smithy:     { roof: ROOF_DARK, base: FACE_DOOR, glyph: ANVIL },
  mine:       { base: ROCK_GRAY2, glyph: ANVIL },
  ferry:      { base: TENT_TAN, glyph: WATER },
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
function drawHistoricalGround(
  ctx: CanvasRenderingContext2D, terrain: Terrain, p: TerrainDrawParams, h: number,
): boolean {
  if (!historicalTerrainSheet) return false;
  const rect = historicalTerrainSourceRect(terrain, p.season);
  if (!rect) return false;
  const variant = historicalTerrainVariantFromHash(h);
  const sampleOffset = historicalTerrainSampleOffsetFromHash(h);
  ctx.save();
  ctx.translate(p.x + (variant.flipX ? p.size : 0), p.y + (variant.flipY ? p.size : 0));
  ctx.scale(variant.flipX ? -1 : 1, variant.flipY ? -1 : 1);
  ctx.drawImage(
    historicalTerrainSheet,
    rect.sx + sampleOffset.dx,
    rect.sy + sampleOffset.dy,
    rect.sw,
    rect.sh,
    0,
    0,
    p.size,
    p.size,
  );
  ctx.restore();
  return true;
}

// 강 타일: 밑에 이웃 평지와 같은 땅 텍스처를 깔고, 이웃 정보로 물 영역을 계산해 채운다.
// 물은 뭍 방향으로만 둑 여백을 두므로 지도상의 강 폭(1~3타일)이 화면에 그대로 드러난다.
function drawRiverTile(ctx: CanvasRenderingContext2D, p: TerrainDrawParams, h: number): void {
  const nb = p.banks!;
  const f = p.size / RIVER_AUTOTILE_SIZE;
  const inset = RIVER_BANK_INSET * f;
  const strip = RIVER_BANK_STRIP * f;
  const bankColor = RIVER_BANK_COLORS[p.season];

  // 1) 땅 밑바탕 — 주변 지형과 같은 시트라 물가 바깥이 이웃 타일과 이어진다
  drawHistoricalGround(ctx, 'plain', p, h);

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

  // 3) 물 — 전면 물 텍스처에서 물 상자와 같은 위치를 잘라와 이웃 타일과 무늬가 이어진다
  const fill = riverFillSourceRect(p.season, p.frozenRiver);
  ctx.drawImage(
    riverSheet!,
    fill.sx + box.x0, fill.sy + box.y0, box.x1 - box.x0, box.y1 - box.y0,
    bx, by, bw, bh,
  );

  // 4) 양옆이 뭍인 바깥 굽이 모서리는 계단식으로 둥글려 손그림 느낌을 살린다
  ctx.fillStyle = bankColor;
  const step = 3 * f;
  for (const corner of riverRoundedCorners(nb)) {
    const cx = corner === 'ne' || corner === 'se' ? bx + bw - step : bx;
    const cy = corner === 'se' || corner === 'sw' ? by + bh - step : by;
    ctx.fillRect(cx, cy, step, step);
  }

  // 5) 대각선만 뭍인 모서리는 뭍+둑으로 되메워 이웃 강 타일의 물가와 맞물린다
  const groundRect = historicalTerrainSourceRect('plain', p.season);
  const srcScale = HISTORICAL_TERRAIN_SAMPLE_SIZE / RIVER_AUTOTILE_SIZE;
  for (const corner of riverLandCorners(nb)) {
    const right = corner === 'ne' || corner === 'se';
    const bottom = corner === 'se' || corner === 'sw';
    const cx = p.x + (right ? p.size - inset : 0);
    const cy = p.y + (bottom ? p.size - inset : 0);
    if (groundRect && historicalTerrainSheet) {
      ctx.drawImage(
        historicalTerrainSheet,
        groundRect.sx + (right ? HISTORICAL_TERRAIN_SAMPLE_SIZE - RIVER_BANK_INSET * srcScale : 0),
        groundRect.sy + (bottom ? HISTORICAL_TERRAIN_SAMPLE_SIZE - RIVER_BANK_INSET * srcScale : 0),
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

export const atlasSprites: SpriteAPI = {
  id: 'kenney-atlas-river-mask-historical-ground-generated-objects-buildings-promotion-centers-specialized-special-residents-v3',

  drawTerrain(ctx, p) {
    if (!sheet) return;
    ctx.imageSmoothingEnabled = false;
    const h = hash(p.tileX, p.tileY);

    // 강: 이웃 정보 기반 면적 렌더링 — 땅 밑바탕 + 물 영역 + 둑 (겨울엔 얼음 텍스처)
    if (p.terrain === 'river') {
      if (riverSheet && historicalTerrainSheet && p.banks) {
        drawRiverTile(ctx, p, h);
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

    // 바닥 (겨울엔 크림색 지면으로 갈아 눈밭 느낌을 낸다)
    const drewHistoricalGround = drawHistoricalGround(ctx, p.terrain, p, h);

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

    // 지형 오브젝트 (숲은 활엽수/소나무를 타일 해시로 섞어 단조로움을 줄인다)
    let terrainObject = terrainObjectFor(p.terrain, p.season, p.hasIron ?? false);
    if (terrainObject === 'lowRock' && h % 2 === 1) terrainObject = 'fieldstone';
    if (terrainObject === 'broadleaf' && h % 3 === 0) terrainObject = 'pine';
    if (terrainObject === 'winterTree' && h % 3 === 0) terrainObject = 'snowPine';
    if (terrainObject && terrainObjectSheet) {
      blitTerrainObject(ctx, terrainObjectSheet, terrainObject, p.x, p.y, p.size);
    }

    // 계절 색조 (겨울 눈덮임 / 가을 마름)
    if (!drewHistoricalGround) {
      seasonWash(ctx, p.season, p.x, p.y, p.size);
    }
  },

  drawBuilding(ctx, p: BuildingDrawParams) {
    if (!sheet) return;
    ctx.imageSmoothingEnabled = false;
    const spr = BUILDING_SPRITES[p.type];
    const alpha = p.ghost ? 0.75 : p.built ? 1 : 0.55;
    ctx.globalAlpha = alpha;

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
        (!newContentResidentSheet || !newContentRect) && (!foreignResidentSheet || !foreignRect)) return;
    ctx.imageSmoothingEnabled = false;
    const half = CHALF;
    const animationTime = p.animationTimeMs ?? performance.now();
    const bob = (p.moving ? Math.floor(animationTime / 130) % 2 : 0) * CF;
    let drewOptionalResidentPresentation = false;

    const specialRect = p.special ? specialResidentSourceRect(p.special) : null;
    if (specialResidentSheet && specialRect) {
      drawGeneratedCharacterRect(ctx, specialResidentSheet, specialRect, p.x, p.y, p.facing, bob, 1.16);
    } else if (foreignResidentSheet && foreignRect) {
      drawGeneratedCharacterRect(ctx, foreignResidentSheet, foreignRect, p.x, p.y, p.facing, bob);
    } else if (newContentResidentSheet && newContentRect) {
      drawGeneratedCharacterRect(ctx, newContentResidentSheet, newContentRect, p.x, p.y, p.facing, bob);
    } else if ((drewOptionalResidentPresentation = drawOptionalResidentPresentation(ctx, p, animationTime))) {
      // Optional sheets are selected by the requested presentation state. If that exact
      // sheet is unavailable, the chain continues to the generated resident fallback.
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
    } else {
      ctx.fillStyle = JOB_COLORS[p.job];
      ctx.fillRect(p.x - dot / 2, p.y - half - 3 * CF - bob, dot, dot);
    }
    if (p.sick) {
      ctx.fillStyle = '#e06c5c';
      ctx.font = `bold ${Math.round(9 * CF)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('+', p.x + half - 2 * CF, p.y - half + 2 * CF);
    }
    const integratedCargo = drewOptionalResidentPresentation && (
      p.job === 'hauler' || Boolean(p.carryingWood || p.carryingGame || p.carryingMinerals)
    );
    if (p.carrying && !integratedCargo) {
      const b = Math.round(4 * CF);
      ctx.fillStyle = '#f0e6c8';
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(p.x + half - 5 * CF, p.y + CF, b, b);
      ctx.strokeRect(p.x + half - 5 * CF, p.y + CF, b, b);
    }
    if (p.selected) {
      ctx.strokeStyle = '#d9a441';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y + half - CF, 7 * CF, 3 * CF, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 1;
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
