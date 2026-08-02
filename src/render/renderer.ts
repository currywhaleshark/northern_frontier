// 장면 렌더러 — 게임 상태를 받아 캔버스에 그린다.
// 레이어 구조 (실제 그래픽 파이프라인을 염두에 둔 설계):
//   1) 지형 레이어: 오프스크린 캔버스에 캐싱, 날짜/날씨/건물 변화 시에만 다시 그림
//   2) 엔티티 레이어: 건물/주민/습격 무리 — 매 프레임, 이동 보간 적용
//   3) UI 오버레이: 선택 표시, 경로선, 배치 미리보기
// 그리기 자체는 SpriteAPI(sprites.ts)에 위임하므로, 진짜 그래픽을 붙일 때는
// SpriteAPI 구현체만 교체하면 된다.
import { CONFIG } from '../game/config';
import {
  armedMusketeers, BUILDING_DEFS, buildingCostFor, buildingFootprintDims, buildingFootprintSize,
  canAfford, canAffordCost, canPlaceBuildingAt, canPlaceOn, canRelocateBuildingAt,
  isAreaBuildingType, isPaddyFootprintEligible, isPlotBuildingType, preferredLeveeEdgeAt, type LeveeEdge,
} from '../game/buildings';
import { COLLAPSE_RATIO } from '../game/battles';
import { FACTIONS, JOB_COLORS } from '../game/constants';
import { getDayOfYear, getSeason } from '../game/seasons';
import { DAY_BANDS, DAY_CYCLE_SUBTICKS } from '../game/dayCycle';
import { LEISURE_CLUSTER_CAPACITY } from '../game/agents';
import { findHabitatIconAtTile } from '../game/habitats';
import { isBuildingFootprintExplored, isExplored } from '../game/exploration';
import {
  builtWallTileSet, GATE_CONVERSION_COSTS, isSolidWallBuilding, isWallBuilding,
  wallConnectionsFromSet, wallTileKey,
} from '../game/walls';
import { canalConnectionsAt, canalRiverEdgesAt, flowingCanalTileSet, wouldCanalFlowAt } from '../game/irrigation';
import { assignedWorkers, workerSlotConfig, workerSlotCount } from '../game/workerSlots';
import {
  jitterOf,
  placeholderSprites,
  type BuildingDrawParams,
  type ExpeditionDrawParams,
  type RaiderDrawParams,
  type ResidentDrawParams,
  type SpriteAPI,
  type TerrainDrawParams,
} from './sprites';
import { militiaWeaponForResident } from './militiaWeaponAssignment';
import { farmerSpriteActionFor } from './residentFarmerAssets';
import type { ResidentWorkStance } from './residentWorkLayout';
import {
  buildResidentPresentationSnapshot,
  type ResidentPresentationSnapshot,
} from './residentPresentation';
import { stableResidentAnimationOffset } from './residentAnimation';
import { claimZonesAt } from '../game/claimZones';
import { foreignSiteAt } from '../game/foreignSites';
import { foreignSiteActors, foreignSiteProps, type ForeignSiteProp } from '../game/foreignSiteActivity';
import { activePassageRoutes } from '../game/passage';
import { weaponCountsForResidents } from '../game/weapons';
import { activePredatorScoutIds } from '../game/expeditionIntel';
import { isBuriedSilverVeinTile } from '../game/silver';
import { aquiferSampleAt, hasSubsurfaceInsight, oreSampleAt } from '../game/subsurfaceVeins';
import {
  waterSupplySnapshot,
  wellWaterStatus,
  wellWaterStatusAt,
  PREVIEW_WATER_BUILDING_ID,
  waterDemandForBuildingPlacement,
  type PreviewWell,
  type PreviewWaterBuilding,
  type WaterSupplySnapshot,
} from '../game/waterSupply';
import {
  waterCoverageTileKey,
  type NaturalWaterCoverage,
} from '../game/waterCoverage';
import { activeExpeditionTargetMarkers, type ExpeditionTargetMarker } from '../game/expeditionTargets';
import { normalizeLivestockState } from '../game/livestock';
import { normalizePastureArea, validateStablePasture } from '../game/pastures';
import {
  activeSpringFloodTiles, isDroughtActive, isFarmIrrigatedByWeir, weirReservoirWaterVisuals,
} from '../game/disasters';
import { acceptsClearedLand, forestTilesInFootprint } from '../game/landClearing';
import {
  BUILDING_EFFECT_TABLE, buildingEffectEmitters, buildingShadowSettings,
  type BuildingEffectEmitter, type BuildingEffectWhen, type BuildingShadowSettings,
} from './spriteStudioRegistries';
import { treeStageFor } from '../game/forestGrowth';
import { gatheringWorkArea, isGatheringBuildingType, type GatheringBuildingType } from '../game/gatheringZones';
import {
  linkedLodgingWorksite,
  lodgingHutForWorksite,
  lodgingHutPlacementTarget,
} from '../game/lodgingHuts';
import {
  mineralRemaining,
  mineralVisualTier,
  tileMineralResource,
} from '../game/minerals';
import type { AnimalHabitat, BattleScar, Building, BuildingTypeId, ClaimZone, ForeignSite, GameState, PastureArea, Resident, Season, Terrain, Tile } from '../game/types';
import { historicalTerrainColumn } from './historicalTerrain';
import { pixelRectIntersectsViewport, tileRectIntersectsViewport, type SceneViewport } from './sceneViewport';
import {
  mountainDepthAt,
  mountainProfileFor,
  terrainNeighborsFor,
  terrainVisualHash,
  treeSpeciesFromHash,
} from './terrainGrowthVisuals';
import { waterLayerTintForBuilding } from './waterLayerPresentation';

const TILE = CONFIG.ui.tileSize;

export const CENTER_VISUAL_SCALE: Record<GameState['rank'], number> = {
  settlement: 0.78,
  bo: 0.86,
  jin: 0.93,
  bu: 1,
};

// 배치 모드에서 금색으로 짚어 주는 자원 지형 (건물 → 찾아야 할 지형)
const PLACEMENT_HINT: Partial<Record<BuildingTypeId, Terrain>> = {
  field: 'fertile',
  paddy: 'fertile',
  mine: 'rock',
  bridge: 'river',
  weir: 'river',
  levee: 'river',
  ferry: 'river',
  watermill: 'river',
  dock: 'river',
};

export interface SceneOptions {
  alpha: number; // 서브틱 사이 이동 보간 계수 0~1
  animationTimeMs: number; // 이 장면의 모든 주민 source rect가 공유하는 RAF 시간
  hover: { x: number; y: number } | null;
  placingType: BuildingTypeId | null;
  leveePlacementEdge?: LeveeEdge | null;
  placingRect?: { x: number; y: number; w: number; h: number } | null; // 경작지 드래그 크기 지정 미리보기
  pasturePlacement?: { stableId: number; rect: PastureArea } | null;
  areaExpansion?: { buildingId: number; type: BuildingTypeId; rect: PastureArea } | null;
  relocationPlacement?: { buildingId: number; rect: PastureArea } | null;
  selected: { x: number; y: number } | null;
  selectedResidentId: number | null;
  selectedBuildingId?: number | null;
  viewport?: SceneViewport;
  terrainVisualSignature?: number;
  sprites?: SpriteAPI;
  residentPresentation?: ResidentPresentationSnapshot;
  renderScale?: 1 | 2;
  residentJobMarkers?: boolean;
  residentCargoMarkers?: boolean;
  showAquiferLayer?: boolean;
  showOreLayer?: boolean;
  stateVersion?: number;
  habitatIcon?: CanvasImageSource;
}

function drawSubsurfaceLayers(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  viewport: SceneViewport,
  showAquifer: boolean,
  showOre: boolean,
): void {
  if (!showAquifer && !showOre) return;
  const precise = hasSubsurfaceInsight(state);
  const mapWidth = state.map[0]?.length ?? 0;
  const minX = Math.max(0, viewport.tileMinX - 1);
  const maxX = Math.min(mapWidth - 1, viewport.tileMaxX + 1);
  const minY = Math.max(0, viewport.tileMinY - 1);
  const maxY = Math.min(state.map.length - 1, viewport.tileMaxY + 1);

  ctx.save();
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= Math.min(maxX, state.map[y].length - 1); x++) {
      if (!isExplored(state, x, y)) continue;
      if (showAquifer) {
        const sample = aquiferSampleAt(state.seed, mapWidth, state.map.length, x, y);
        if (sample) {
          const remaining = state.aquiferLevels[sample.vein.id] ?? sample.vein.capacity;
          const depletion = Math.max(0.18, Math.min(1, remaining / Math.max(1, sample.vein.capacity)));
          const strength = precise ? sample.normalizedRichness : 0.58;
          ctx.fillStyle = `rgba(31, 168, 222, ${(0.28 + strength * 0.34) * depletion})`;
          ctx.fillRect(x * TILE + 1, y * TILE + 1, TILE - 2, TILE - 2);
          ctx.strokeStyle = `rgba(158, 237, 255, ${precise ? 0.48 + strength * 0.4 : 0.62})`;
          ctx.lineWidth = precise && strength > 0.68 ? 2.25 : 1.5;
          ctx.strokeRect(x * TILE + 1.5, y * TILE + 1.5, TILE - 3, TILE - 3);
        }
      }
      if (showOre) {
        const sample = oreSampleAt(state.seed, mapWidth, state.map.length, x, y);
        if (sample) {
          const remaining = state.oreVeinRemaining[sample.vein.id] ?? sample.vein.capacity;
          const depletion = Math.max(0.18, Math.min(1, remaining / Math.max(1, sample.vein.capacity)));
          const strength = precise ? sample.normalizedRichness : 0.58;
          const color = sample.vein.mineral === 'iron' ? '177, 83, 48' : '146, 151, 158';
          ctx.fillStyle = `rgba(${color}, ${(0.25 + strength * 0.35) * depletion})`;
          ctx.fillRect(x * TILE + 2, y * TILE + 2, TILE - 4, TILE - 4);
          ctx.strokeStyle = `rgba(${color}, ${precise ? 0.52 + strength * 0.38 : 0.66})`;
          ctx.lineWidth = precise && strength > 0.68 ? 2.25 : 1.5;
          ctx.beginPath();
          ctx.moveTo(x * TILE + TILE / 2, y * TILE + 3);
          ctx.lineTo(x * TILE + TILE - 3, y * TILE + TILE / 2);
          ctx.lineTo(x * TILE + TILE / 2, y * TILE + TILE - 3);
          ctx.lineTo(x * TILE + 3, y * TILE + TILE / 2);
          ctx.closePath();
          ctx.stroke();
        }
      }
    }
  }
  ctx.restore();
}

function waterworksOrientationAt(
  state: Pick<GameState, 'map'>,
  type: BuildingTypeId,
  x: number,
  y: number,
  leveeEdge?: LeveeEdge,
): 'horizontal' | 'vertical' {
  if (type === 'levee') {
    const edge = leveeEdge;
    return edge === 'e' || edge === 'w' ? 'vertical' : 'horizontal';
  }
  const northSouth = Number(state.map[y - 1]?.[x]?.terrain === 'river') +
    Number(state.map[y + 1]?.[x]?.terrain === 'river');
  const eastWest = Number(state.map[y]?.[x - 1]?.terrain === 'river') +
    Number(state.map[y]?.[x + 1]?.terrain === 'river');
  return northSouth >= eastWest ? 'horizontal' : 'vertical';
}

const TERRAIN_VISUAL_CODE: Record<Terrain, number> = {
  forest: 1,
  plain: 2,
  river: 3,
  mountain: 4,
  fertile: 5,
  rock: 6,
  center: 7,
};

export function terrainVisualSignature(state: Pick<GameState, 'map'>): number {
  let hash = 0x811c9dc5;
  for (const row of state.map) {
    for (const tile of row) {
      const treeStage = treeStageFor(tile);
      const treeCode = treeStage === 'stump' ? 1 : treeStage === 'young' ? 2 : treeStage === 'mature' ? 3 : 0;
      const resourceCode = tile.terrain === 'rock'
        ? tile.hasSilver ? 3 : tile.hasIron ? 2 : 1
        : 0;
      const tier = tile.terrain === 'rock' ? mineralVisualTier(mineralRemaining(tile)) : null;
      const tierCode = tier === 'trace' ? 1
        : tier === 'small' ? 2
          : tier === 'medium' ? 3
            : tier === 'large' ? 4
              : tier === 'huge' ? 5
                : 0;
      const visualCode = TERRAIN_VISUAL_CODE[tile.terrain] * 256
        + treeCode * 32
        + resourceCode * 8
        + tierCode;
      hash = Math.imul(hash ^ visualCode, 0x01000193);
    }
  }
  return hash >>> 0;
}

// 주민의 화면 픽셀 위치 (보간 + 지터). 렌더링과 마우스 히트 판정이 공유한다.
export function residentPixelPos(
  r: Resident,
  alpha: number,
  workStance?: ResidentWorkStance,
): { x: number; y: number } {
  const [jx, jy] = jitterOf(r.id);
  return {
    x: (r.px + (r.x - r.px) * alpha) * TILE + TILE / 2 + jx + (workStance?.offsetX ?? 0),
    y: (r.py + (r.y - r.py) * alpha) * TILE + TILE / 2 + jy + (workStance?.offsetY ?? 0),
  };
}

// 픽셀 좌표에서 가장 가까운 주민 찾기 (radius 픽셀 이내)
export function findResidentAt(
  state: GameState,
  mx: number,
  my: number,
  alpha: number,
  radius = 10,
  presentation: ResidentPresentationSnapshot = buildResidentPresentationSnapshot(state),
): Resident | null {
  let best: Resident | null = null;
  let bestD = radius;
  const expeditionUnitIds = state.expedition && state.expedition.phase !== 'muster'
    ? new Set(state.expedition.memberIds)
    : new Set<number>();
  const warDispatchIds = new Set(state.warDispatch?.memberIds ?? []);
  for (const r of state.residents) {
    if (!r.alive) continue;
    if (expeditionUnitIds.has(r.id)) continue;
    if (warDispatchIds.has(r.id)) continue;
    if (presentation.indoorResidentIds.has(r.id)) continue;
    const p = residentPixelPos(r, alpha, presentation.workStances.get(r.id));
    const d = Math.hypot(p.x - mx, p.y - my);
    if (d <= bestD) { bestD = d; best = r; }
  }
  return best;
}

// ── 지형 레이어 캐시 ──
let terrainLayer: HTMLCanvasElement | null = null;
let terrainKey = '';

// 지면 계열이 다른 이웃 중 우세한 쪽(숲 > 바위 > 풀)만 이 타일 가장자리로 번진다.
// 양방향으로 번지면 경계가 두 겹으로 뭉개지므로 한 방향만 허용한다.
const GROUND_BLEND_PRECEDENCE: Record<number, number> = { 0: 0, 3: 1, 5: 2 };

function groundBlendNeighbor(
  map: GameState['map'],
  selfColumn: number | null,
  nx: number,
  ny: number,
): Terrain | undefined {
  if (selfColumn == null) return undefined;
  const neighbor = map[ny]?.[nx];
  if (!neighbor) return undefined;
  const column = historicalTerrainColumn(neighbor.terrain);
  if (column == null || column === selfColumn) return undefined;
  return (GROUND_BLEND_PRECEDENCE[column] ?? 0) > (GROUND_BLEND_PRECEDENCE[selfColumn] ?? 0)
    ? neighbor.terrain
    : undefined;
}

function terrainParams(
  state: GameState,
  x: number,
  y: number,
  season: Season,
  winter: boolean,
  frozenRiver: boolean,
  renderScale: 1 | 2,
): TerrainDrawParams {
  const tile = state.map[y][x];
  const isLand = (tx: number, ty: number): boolean => {
    const neighbor = state.map[ty]?.[tx];
    return neighbor ? neighbor.terrain !== 'river' : false;
  };
  const stableHash = terrainVisualHash(x, y);
  const mountainNearby = tile.terrain === 'forest' && [-1, 0, 1].some(dy =>
    [-1, 0, 1].some(dx =>
      (dx !== 0 || dy !== 0) && state.map[y + dy]?.[x + dx]?.terrain === 'mountain'));
  const mountainNeighbors = tile.terrain === 'mountain'
    ? terrainNeighborsFor(state.map, x, y, 'mountain')
    : undefined;
  const remaining = tile.terrain === 'rock' ? mineralRemaining(tile) : 0;
  const selfGroundColumn = historicalTerrainColumn(tile.terrain);
  const blendN = groundBlendNeighbor(state.map, selfGroundColumn, x, y - 1);
  const blendE = groundBlendNeighbor(state.map, selfGroundColumn, x + 1, y);
  const blendS = groundBlendNeighbor(state.map, selfGroundColumn, x, y + 1);
  const blendW = groundBlendNeighbor(state.map, selfGroundColumn, x - 1, y);
  return {
    terrain: tile.terrain,
    season,
    winter,
    frozenRiver,
    hasIron: tile.hasIron,
    hasSilver: tile.hasSilver,
    treeStage: treeStageFor(tile) ?? undefined,
    treeSpecies: tile.terrain === 'forest'
      ? treeSpeciesFromHash(stableHash, mountainNearby)
      : undefined,
    mineralResource: tile.terrain === 'rock' ? tileMineralResource(tile) : undefined,
    mineralTier: tile.terrain === 'rock' ? mineralVisualTier(remaining) : undefined,
    mountainProfile: mountainNeighbors
      ? mountainProfileFor(mountainNeighbors, mountainDepthAt(state.map, x, y), stableHash)
      : undefined,
    highDefinition: renderScale === 2,
    tileX: x,
    tileY: y,
    x: x * TILE,
    y: y * TILE,
    size: TILE,
    banks: tile.terrain === 'river'
      ? {
          n: isLand(x, y - 1), e: isLand(x + 1, y), s: isLand(x, y + 1), w: isLand(x - 1, y),
          ne: isLand(x + 1, y - 1), se: isLand(x + 1, y + 1),
          sw: isLand(x - 1, y + 1), nw: isLand(x - 1, y - 1),
        }
      : undefined,
    blendEdges: blendN || blendE || blendS || blendW
      ? { n: blendN, e: blendE, s: blendS, w: blendW }
      : undefined,
  };
}

function drawTerrainLayer(
  state: GameState,
  width: number,
  height: number,
  sprites: SpriteAPI,
  visualSignature: number,
  renderScale: 1 | 2,
): HTMLCanvasElement {
  const season = getSeason(state.day);
  const winter = season === 'winter';
  const frozenRiver = winter && state.weather !== 'thawFlood';
  // 계절·결빙·실제 타일 시각 속성이 바뀔 때만 다시 그린다.
  const key = `${season}|${frozenRiver ? 1 : 0}|${visualSignature}|${width}|${height}|${renderScale}|${sprites.id}`;
  if (terrainLayer && terrainKey === key) return terrainLayer;

  const physicalWidth = Math.round(width * renderScale);
  const physicalHeight = Math.round(height * renderScale);
  if (!terrainLayer || terrainLayer.width !== physicalWidth || terrainLayer.height !== physicalHeight) {
    terrainLayer = document.createElement('canvas');
    terrainLayer.width = physicalWidth;
    terrainLayer.height = physicalHeight;
  }
  const ctx = terrainLayer.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, physicalWidth, physicalHeight);
  ctx.setTransform(renderScale, 0, 0, renderScale, 0, 0);
  for (let y = 0; y < state.map.length; y++) {
    const row = state.map[y];
    for (let x = 0; x < row.length; x++) {
      sprites.drawTerrain(ctx, terrainParams(state, x, y, season, winter, frozenRiver, renderScale));
    }
  }
  terrainKey = key;
  return terrainLayer;
}

interface RowRenderEntry {
  sortY: number;
  sortX: number;
  serial: number;
  draw: () => void;
}

function drawMutedTerrainSprite(
  ctx: CanvasRenderingContext2D,
  draw: () => void,
): void {
  ctx.save();
  ctx.globalAlpha *= 0.34;
  ctx.filter = 'grayscale(72%) brightness(118%)';
  draw();
  ctx.restore();
}

let buildingTintCanvas: HTMLCanvasElement | null = null;
let waterVisualSnapshotCache: {
  state: GameState;
  version: number;
  previewKey: string;
  snapshot: WaterSupplySnapshot;
} | null = null;

function cachedWaterVisualSnapshot(
  state: GameState,
  version: number | undefined,
  previewWell: PreviewWell | undefined,
  previewBuilding: PreviewWaterBuilding | undefined,
): WaterSupplySnapshot {
  if (version == null) return waterSupplySnapshot(state, previewWell, previewBuilding);
  const previewKey = [
    previewWell ? `well:${previewWell.x},${previewWell.y}` : 'well:none',
    previewBuilding
      ? `building:${previewBuilding.type},${previewBuilding.x},${previewBuilding.y}`
      : 'building:none',
  ].join('|');
  if (waterVisualSnapshotCache?.state === state &&
      waterVisualSnapshotCache.version === version &&
      waterVisualSnapshotCache.previewKey === previewKey) {
    return waterVisualSnapshotCache.snapshot;
  }
  const snapshot = waterSupplySnapshot(state, previewWell, previewBuilding);
  waterVisualSnapshotCache = { state, version, previewKey, snapshot };
  return snapshot;
}

function drawBuildingSprite(
  ctx: CanvasRenderingContext2D,
  sprites: SpriteAPI,
  params: BuildingDrawParams,
): void {
  if (!params.tint) {
    sprites.drawBuilding(ctx, params);
    return;
  }
  const margin = Math.ceil(params.size);
  const required = Math.max(8, margin * 3);
  if (!buildingTintCanvas) buildingTintCanvas = document.createElement('canvas');
  if (buildingTintCanvas.width < required || buildingTintCanvas.height < required) {
    buildingTintCanvas.width = Math.max(buildingTintCanvas.width, required);
    buildingTintCanvas.height = Math.max(buildingTintCanvas.height, required);
  }
  const tintCtx = buildingTintCanvas.getContext('2d')!;
  tintCtx.setTransform(1, 0, 0, 1, 0, 0);
  tintCtx.globalAlpha = 1;
  tintCtx.globalCompositeOperation = 'source-over';
  tintCtx.filter = 'none';
  tintCtx.imageSmoothingEnabled = false;
  tintCtx.clearRect(0, 0, required, required);
  sprites.drawBuilding(tintCtx, {
    ...params,
    tint: undefined,
    x: margin,
    y: margin,
  });
  tintCtx.save();
  tintCtx.globalCompositeOperation = 'source-atop';
  tintCtx.globalAlpha = params.tint.alpha;
  tintCtx.fillStyle = params.tint.color;
  tintCtx.fillRect(0, 0, required, required);
  tintCtx.restore();
  ctx.drawImage(
    buildingTintCanvas,
    0,
    0,
    required,
    required,
    params.x - margin,
    params.y - margin,
    required,
    required,
  );
}

function queueTerrainOverlays(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  sprites: SpriteAPI,
  viewport: SceneViewport,
  renderScale: 1 | 2,
  queue: RowRenderEntry[],
  muted = false,
): void {
  if (!sprites.drawTerrainOverlay && !sprites.drawTerrainProp) return;
  const season = getSeason(state.day);
  const winter = season === 'winter';
  const frozenRiver = winter && state.weather !== 'thawFlood';
  const mapWidth = state.map[0]?.length ?? 0;
  const minX = Math.max(0, viewport.tileMinX - 4);
  const maxX = Math.min(mapWidth - 1, viewport.tileMaxX + 4);
  const minY = Math.max(0, viewport.tileMinY - 1);
  const maxY = Math.min(state.map.length - 1, viewport.tileMaxY + 4);
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= Math.min(maxX, state.map[y].length - 1); x++) {
      const terrain = state.map[y][x].terrain;
      if (terrain !== 'forest' && terrain !== 'mountain' && terrain !== 'rock') continue;
      const params = terrainParams(state, x, y, season, winter, frozenRiver, renderScale);
      queue.push({
        sortY: (y + 1) * TILE,
        sortX: (x + 0.5) * TILE,
        serial: queue.length,
        draw: () => {
          const draw = () => {
            if (terrain === 'rock') sprites.drawTerrainProp?.(ctx, params);
            else sprites.drawTerrainOverlay?.(ctx, params);
          };
          if (muted) drawMutedTerrainSprite(ctx, draw);
          else draw();
        },
      });
    }
  }
}

function drawTerrainProps(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  sprites: SpriteAPI,
  viewport: SceneViewport,
  renderScale: 1 | 2,
): void {
  if (!sprites.drawTerrainProp) return;
  const season = getSeason(state.day);
  const winter = season === 'winter';
  const frozenRiver = winter && state.weather !== 'thawFlood';
  const mapWidth = state.map[0]?.length ?? 0;
  const minX = Math.max(0, viewport.tileMinX - 4);
  const maxX = Math.min(mapWidth - 1, viewport.tileMaxX + 4);
  const minY = Math.max(0, viewport.tileMinY - 1);
  const maxY = Math.min(state.map.length - 1, viewport.tileMaxY + 4);
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= Math.min(maxX, state.map[y].length - 1); x++) {
      const tile = state.map[y][x];
      if (treeStageFor(tile) !== 'stump') continue;
      sprites.drawTerrainProp(
        ctx,
        terrainParams(state, x, y, season, winter, frozenRiver, renderScale),
      );
    }
  }
}

function rectsIntersect(
  ax: number,
  ay: number,
  aw: number,
  ah: number,
  bx: number,
  by: number,
  bw: number,
  bh: number,
): boolean {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

export interface TreeCanopyProxy {
  sortY: number;
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  trunkHalfWidth: number;
  trunkTop: number;
  trunkBottom: number;
}

/** 수관 판정에 필요한 최소 지도 — 스프라이트 스튜디오가 3×3 장면으로 같은 계산을 쓴다. */
interface CanopyMapSource {
  map: readonly (readonly Pick<Tile, 'terrain' | 'treeStage'>[])[];
}

export function treeCanopiesIntersectingRect(
  state: CanopyMapSource,
  left: number,
  top: number,
  width: number,
  height: number,
): TreeCanopyProxy[] {
  const canopies: TreeCanopyProxy[] = [];
  const minX = Math.max(0, Math.floor((left - 32) / TILE));
  const maxX = Math.min((state.map[0]?.length ?? 0) - 1, Math.floor((left + width + 32) / TILE));
  const minY = Math.max(0, Math.floor(top / TILE));
  const maxY = Math.min(state.map.length - 1, Math.floor((top + height + 72) / TILE));
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= Math.min(maxX, state.map[y].length - 1); x++) {
      const stage = treeStageFor(state.map[y][x]);
      if (stage !== 'young' && stage !== 'mature') continue;
      const anchorX = x * TILE + TILE / 2;
      const anchorY = y * TILE + TILE;
      const canopy = stage === 'mature'
        ? {
            sortY: anchorY,
            cx: anchorX, cy: anchorY - 41.5, rx: 29, ry: 26.5,
            trunkHalfWidth: 3.5, trunkTop: anchorY - 29, trunkBottom: anchorY - 2,
          }
        : {
            sortY: anchorY,
            cx: anchorX, cy: anchorY - 27, rx: 17, ry: 16,
            trunkHalfWidth: 2.5, trunkTop: anchorY - 20, trunkBottom: anchorY - 2,
          };
      if (rectsIntersect(
        left,
        top,
        width,
        height,
        canopy.cx - canopy.rx,
        canopy.cy - canopy.ry,
        canopy.rx * 2,
        canopy.trunkBottom - (canopy.cy - canopy.ry),
      )) {
        canopies.push(canopy);
      }
    }
  }
  return canopies;
}

/** 수관에 가린 대상을 잎 안쪽에만 옅게 겹쳐 그린다 (완전히 사라지지 않게). */
export function drawUnderCanopyGhost(
  ctx: CanvasRenderingContext2D,
  canopies: readonly TreeCanopyProxy[],
  opacityFilter: string,
  draw: () => void,
): void {
  if (canopies.length === 0) return;
  ctx.save();
  ctx.beginPath();
  for (const canopy of canopies) {
    ctx.moveTo(canopy.cx + canopy.rx, canopy.cy);
    ctx.ellipse(canopy.cx, canopy.cy, canopy.rx, canopy.ry, 0, 0, Math.PI * 2);
    ctx.rect(
      canopy.cx - canopy.trunkHalfWidth,
      canopy.trunkTop,
      canopy.trunkHalfWidth * 2,
      canopy.trunkBottom - canopy.trunkTop,
    );
  }
  ctx.clip();
  ctx.filter = opacityFilter;
  draw();
  ctx.restore();
}

function drawOccludedEntityGhosts(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  sprites: SpriteAPI,
  buildings: readonly BuildingDrawParams[],
  residents: readonly ResidentDrawParams[],
): void {
  for (const building of buildings) {
    const buildingSortY = building.y + building.size;
    const canopies = treeCanopiesIntersectingRect(
      state,
      building.x,
      building.y,
      building.size,
      building.size,
    ).filter(canopy => canopy.sortY > buildingSortY);
    drawUnderCanopyGhost(
      ctx,
      canopies,
      'opacity(42%)',
      () => drawBuildingSprite(ctx, sprites, building),
    );
  }
  for (const resident of residents) {
    const scale = resident.sizeScale ?? 1;
    const size = TILE * scale;
    const canopies = treeCanopiesIntersectingRect(
      state,
      resident.x - size / 2,
      resident.y - size / 2,
      size,
      size,
    ).filter(canopy => canopy.sortY > resident.y);
    drawUnderCanopyGhost(ctx, canopies, 'opacity(48%)', () => sprites.drawResident(ctx, resident));
  }
}

// ── 건물 효과 이미터 ──
// 위치는 스프라이트 스튜디오 레지스트리에서 오고, 입자 움직임은 여기 남는다.
// 앵커는 크기 비율(fx·fy) + 픽셀 보정(dx·dy)이라 등급마다 크기가 변하는 중심지에서도 어긋나지 않는다.

// 굴뚝 연기: 위로 오르며 흩어지는 회백색 입자 (건물 id로 위상을 어긋나게)
function drawChimneySmokeAt(
  ctx: CanvasRenderingContext2D, ax: number, ay: number, id: number, scale: number,
): void {
  const t = performance.now() / 1000;
  for (let k = 0; k < 4; k++) {
    const ph = ((t / 2.6) + k / 4 + (id % 7) / 7) % 1; // 0(굴뚝)→1(소멸)
    const sy = ay - ph * 13 * scale;
    const sx = ax + Math.sin((ph * 5 + id) * 2) * 1.8 * scale;
    ctx.fillStyle = `rgba(206,211,218,${(0.65 * (1 - ph)).toFixed(2)})`;
    ctx.beginPath();
    ctx.arc(sx, sy, (1.6 + ph * 2.4) * scale, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawFireSparksAt(
  ctx: CanvasRenderingContext2D, ax: number, ay: number, id: number, scale: number, workers: number,
): void {
  const t = performance.now();
  const count = Math.min(5, 2 + workers);
  for (let i = 0; i < count; i++) {
    const phase = ((t / 180 + i * 1.7 + id * 0.61) % 7) / 7;
    const x = ax + (Math.sin(i * 2.3 + id) * 3 + phase * 2) * scale;
    const y = ay - phase * 12 * scale;
    const dot = phase < 0.45 ? 2 : 1;
    ctx.fillStyle = `rgba(255,${Math.round(150 + phase * 70)},70,${(0.9 * (1 - phase)).toFixed(2)})`;
    ctx.fillRect(Math.round(x), Math.round(y), dot, dot);
  }
}

function drawCraftGlintAt(
  ctx: CanvasRenderingContext2D, ax: number, ay: number, id: number, scale: number,
  workers: number, size: number,
): void {
  const t = performance.now();
  const pulse = (Math.sin(t / 150 + id) + 1) / 2;
  ctx.strokeStyle = `rgba(238,213,158,${(0.35 + pulse * 0.45).toFixed(2)})`;
  ctx.lineWidth = 1.2 * scale;
  for (let i = 0; i < Math.min(3, workers + 1); i++) {
    const x = ax + size * (i * 0.14);
    const y = ay - ((i + Math.floor(t / 220)) % 2) * 2;
    ctx.beginPath();
    ctx.moveTo(x - 2 * scale, y + 2 * scale);
    ctx.lineTo(x + 2 * scale, y - 2 * scale);
    ctx.stroke();
  }
}

function drawServiceGlowAt(
  ctx: CanvasRenderingContext2D, ax: number, ay: number, id: number, scale: number,
): void {
  const t = performance.now();
  const pulse = (Math.sin(t / 420 + id * 0.7) + 1) / 2;
  ctx.fillStyle = `rgba(255,205,104,${(0.13 + pulse * 0.11).toFixed(2)})`;
  ctx.beginPath();
  ctx.arc(ax, ay, (7 + pulse * 2) * scale, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = `rgba(255,221,139,${(0.72 + pulse * 0.2).toFixed(2)})`;
  ctx.fillRect(Math.round(ax - 2 * scale), Math.round(ay - 1.5 * scale), 4 * scale, 3 * scale);
}

function drawWindowGlowAt(
  ctx: CanvasRenderingContext2D, ax: number, ay: number, scale: number, alpha: number,
): void {
  ctx.fillStyle = `rgba(255,205,95,${(0.85 * alpha).toFixed(2)})`;
  ctx.fillRect(ax, ay, 3 * scale, 3 * scale);
}

const NIGHT_EFFECT_PASS: ReadonlySet<BuildingEffectWhen> = new Set<BuildingEffectWhen>(['night']);

// 밤 창불이 있는 건물 종류만 추려 둔다 — 매 프레임 전 건물의 발자국을 재는 대신
// 원본과 같은 값싼 종류 검사로 걸러 낸다.
let nightEffectTypeCache: Set<BuildingTypeId> | null = null;
function typesWithNightEffect(): ReadonlySet<BuildingTypeId> {
  if (!nightEffectTypeCache) {
    nightEffectTypeCache = new Set<BuildingTypeId>();
    for (const [type, emitters] of Object.entries(BUILDING_EFFECT_TABLE)) {
      if (emitters?.some(emitter => emitter.when === 'night')) {
        nightEffectTypeCache.add(type as BuildingTypeId);
      }
    }
  }
  return nightEffectTypeCache;
}

export interface BuildingEffectPass {
  /** 이번 패스에서 그릴 발동 조건들 — 건물 패스와 밤 색조 패스가 나뉘어 있다 */
  active: ReadonlySet<BuildingEffectWhen>;
  workers: number;
  /** windowGlow의 밤 램프 (0~1) */
  nightAlpha: number;
}

export function drawBuildingEffects(
  ctx: CanvasRenderingContext2D,
  type: BuildingTypeId,
  id: number,
  bx: number,
  by: number,
  size: number,
  pass: BuildingEffectPass,
  // 스프라이트 스튜디오는 아직 저장하지 않은 배열을 그대로 넘긴다.
  emitters: readonly BuildingEffectEmitter[] = buildingEffectEmitters(type),
): void {
  if (emitters.length === 0) return;
  ctx.save();
  for (const emitter of emitters) {
    if (!pass.active.has(emitter.when)) continue;
    const ax = bx + size * emitter.fx + emitter.dx;
    const ay = by + size * emitter.fy + emitter.dy;
    switch (emitter.kind) {
      case 'chimneySmoke': drawChimneySmokeAt(ctx, ax, ay, id, emitter.scale); break;
      case 'fireSparks': drawFireSparksAt(ctx, ax, ay, id, emitter.scale, pass.workers); break;
      case 'craftGlint': drawCraftGlintAt(ctx, ax, ay, id, emitter.scale, pass.workers, size); break;
      case 'serviceGlow': drawServiceGlowAt(ctx, ax, ay, id, emitter.scale); break;
      case 'windowGlow': drawWindowGlowAt(ctx, ax, ay, emitter.scale, pass.nightAlpha); break;
    }
  }
  ctx.restore();
}

function drawDamageSmoke(ctx: CanvasRenderingContext2D, bx: number, by: number, id: number, footprint: number): void {
  const t = performance.now() / 1000;
  const size = TILE * footprint;
  for (let k = 0; k < 6; k++) {
    const ph = ((t / 3.8) + k / 6 + (id % 11) / 11) % 1;
    const sway = Math.sin(ph * 7 + id * 0.9 + k) * (2 + ph * 3);
    const sx = bx + size * 0.52 + sway;
    const sy = by + size * 0.5 - ph * (15 + size * 0.28);
    const alpha = 0.5 * (1 - ph) * (0.72 + (k % 3) * 0.12);
    ctx.fillStyle = `rgba(73,67,62,${alpha.toFixed(2)})`;
    ctx.beginPath();
    ctx.ellipse(sx, sy, 2.3 + ph * 4.2, 1.8 + ph * 3.2, sway * 0.025, 0, Math.PI * 2);
    ctx.fill();
  }
}

// 눈밭 발자국: 지나온 자취를 따라 어긋난 점 두 줄, 오래된 것일수록 옅게
function drawFootprints(ctx: CanvasRenderingContext2D, trail: { x: number; y: number }[]): void {
  const len = trail.length;
  for (let i = 0; i < len; i++) {
    const p = trail[i];
    const alpha = ((i + 1) / len) * 0.35;
    ctx.fillStyle = `rgba(90,100,115,${alpha.toFixed(2)})`;
    const cx = p.x * TILE + TILE / 2;
    const cy = p.y * TILE + TILE / 2;
    // 왼발/오른발 어긋나게
    const side = i % 2 === 0 ? -2.5 : 2.5;
    ctx.fillRect(cx + side - 1, cy - 1, 2, 3);
    ctx.fillRect(cx - side - 1, cy + 3, 2, 3);
  }
}


function drawBattleClash(ctx: CanvasRenderingContext2D, frontX: number, frontY: number, muskets: boolean): void {
  const t = performance.now() / 140;
  const cx = frontX * TILE + TILE / 2;
  const cy = frontY * TILE + TILE / 2;
  ctx.save();
  for (let i = 0; i < 18; i++) {
    const phase = fract(t + i * 0.173);
    const angle = i * 2.399 + t * 0.08;
    const radius = (0.35 + phase * 1.2) * TILE;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius * 0.62;
    const alpha = 0.6 * (1 - phase);
    ctx.fillStyle = i % 3 === 0
      ? `rgba(230,130,64,${alpha.toFixed(2)})`
      : `rgba(238,222,184,${(alpha * 0.75).toFixed(2)})`;
    ctx.beginPath();
    ctx.arc(x, y, 1.2 + phase * 1.8, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(120,60,36,0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(cx, cy, TILE * 1.45, TILE * 0.9, 0, 0, Math.PI * 2);
  ctx.stroke();
  if (muskets) {
    // 조총 무장 + 화약 보유: 먼지구름 사이 총구 섬광 점멸 + 흰 초연이 피어오른다
    for (let i = 0; i < 4; i++) {
      const flick = fract(t * 0.23 + i * 0.334);
      if (flick < 0.09) {
        const angle = i * 1.71 + Math.floor(t * 0.23 + i * 0.334) * 2.4;
        const fx = cx + Math.cos(angle) * TILE * 1.05;
        const fy = cy + Math.sin(angle) * TILE * 0.62;
        const a = 0.9 * (1 - flick / 0.09);
        ctx.strokeStyle = `rgba(255,244,196,${a.toFixed(2)})`;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(fx - 4, fy);
        ctx.lineTo(fx + 4, fy);
        ctx.moveTo(fx, fy - 4);
        ctx.lineTo(fx, fy + 4);
        ctx.stroke();
        ctx.fillStyle = `rgba(255,252,232,${(a * 0.8).toFixed(2)})`;
        ctx.beginPath();
        ctx.arc(fx, fy, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    for (let i = 0; i < 5; i++) {
      const phase = fract(t * 0.05 + i * 0.21);
      const sx = cx + Math.sin(i * 2.1) * TILE * 0.9 + Math.sin(phase * 5 + i) * 3;
      const sy = cy - TILE * 0.3 - phase * TILE * 1.1;
      ctx.fillStyle = `rgba(235,235,228,${(0.4 * (1 - phase)).toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(sx, sy, 2 + phase * 4.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

// 집결 단계: 전선 지점에 펄럭이는 깃발과 집결 링을 그린다
function drawMusterFlag(ctx: CanvasRenderingContext2D, frontX: number, frontY: number): void {
  const t = performance.now() / 1000;
  const cx = frontX * TILE + TILE / 2;
  const cy = frontY * TILE + TILE / 2;
  ctx.save();
  // 집결 지점 링 — 천천히 맥동
  const pulse = 0.5 + 0.5 * Math.sin(t * 2.4);
  ctx.strokeStyle = `rgba(233,163,74,${(0.3 + pulse * 0.35).toFixed(2)})`;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 5]);
  ctx.beginPath();
  ctx.ellipse(cx, cy, TILE * (1.15 + pulse * 0.12), TILE * (0.72 + pulse * 0.08), 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  // 장대
  ctx.strokeStyle = '#6b5232';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx, cy + 5);
  ctx.lineTo(cx, cy - 26);
  ctx.stroke();
  // 펄럭이는 깃발 — 끝단이 바람에 흔들린다
  const wave = Math.sin(t * 6) * 3;
  ctx.fillStyle = '#b6412f';
  ctx.beginPath();
  ctx.moveTo(cx, cy - 26);
  ctx.quadraticCurveTo(cx + 9, cy - 25 + wave * 0.4, cx + 17, cy - 23 + wave);
  ctx.lineTo(cx + 15, cy - 16 + wave * 0.6);
  ctx.quadraticCurveTo(cx + 8, cy - 18, cx, cy - 15);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// 승기가 기운 습격 무리: 도주 방향으로 흘러나가는 작은 인영 입자
function drawRoutStream(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  dirX: number,
  dirY: number,
): void {
  const t = performance.now() / 900;
  ctx.save();
  for (let i = 0; i < 10; i++) {
    const phase = fract(t + i * 0.137);
    const spread = ((i % 5) - 2) * 4;
    const x = cx + dirX * phase * TILE * 2.7 - dirY * spread;
    const y = cy + dirY * phase * TILE * 2.7 * 0.62 + dirX * spread;
    const alpha = 0.55 * (1 - phase);
    ctx.fillStyle = `rgba(72,58,48,${alpha.toFixed(2)})`;
    ctx.fillRect(x - 1, y - 2, 2, 4);
  }
  ctx.restore();
}

// 전투가 끝난 자리의 교란 자국 — 겨울엔 짓밟힌 눈, 그 외 계절엔 파헤쳐진 땅.
// 남은 날수에 따라 옅어진다.
function drawBattleScarDecal(ctx: CanvasRenderingContext2D, scar: BattleScar, day: number, winter: boolean): void {
  const cx = scar.x * TILE + TILE / 2;
  const cy = scar.y * TILE + TILE / 2;
  const fade = Math.max(0.25, Math.min(1, (scar.until - day) / 4));
  const col = winter ? '88,98,114' : '66,54,40';
  ctx.save();
  ctx.fillStyle = `rgba(${col},${(0.16 * fade).toFixed(2)})`;
  ctx.beginPath();
  ctx.ellipse(cx, cy, TILE * 1.3, TILE * 0.8, 0, 0, Math.PI * 2);
  ctx.fill();
  // 흩어진 짧은 긁힘 자국 (자리 좌표로 결정적 배치)
  for (let i = 0; i < 14; i++) {
    const s = (scar.x * 31 + scar.y * 57 + i * 97) % 113;
    const ox = ((s * 13) % 60 - 30) / 30;
    const oy = ((s * 29) % 60 - 30) / 30;
    const px = cx + ox * TILE * 1.1;
    const py = cy + oy * TILE * 0.65;
    ctx.fillStyle = `rgba(${col},${((0.22 + (s % 3) * 0.06) * fade).toFixed(2)})`;
    if (s % 2 === 0) ctx.fillRect(px - 1, py - 1, 2, 3);
    else ctx.fillRect(px - 2, py - 1, 4, 2);
  }
  ctx.restore();
}

function drawHabitatRange(ctx: CanvasRenderingContext2D, habitat: AnimalHabitat): void {
  const cx = (habitat.x + 0.5) * TILE;
  const cy = (habitat.y + 0.5) * TILE;
  ctx.save();
  ctx.fillStyle = 'rgba(217,164,65,0.13)';
  ctx.strokeStyle = 'rgba(217,164,65,0.8)';
  ctx.lineWidth = 2;
  ctx.setLineDash([7, 5]);
  ctx.beginPath();
  ctx.arc(cx, cy, habitat.radius * TILE, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawBuriedSilverVeinMarker(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  const cx = x * TILE + TILE / 2;
  const cy = y * TILE + TILE / 2;
  ctx.save();
  ctx.strokeStyle = 'rgba(235, 205, 116, 0.95)';
  ctx.fillStyle = 'rgba(55, 43, 29, 0.78)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([3, 2]);
  ctx.beginPath();
  ctx.arc(cx, cy, Math.max(5, TILE * 0.28), 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#e6c970';
  ctx.fillRect(cx - 1, cy - 4, 2, 8);
  ctx.fillRect(cx - 4, cy - 1, 8, 2);
  ctx.restore();
}

function drawMineWorkRange(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  const cx = (x + 0.5) * TILE;
  const cy = (y + 0.5) * TILE;
  ctx.save();
  ctx.fillStyle = 'rgba(122,179,217,0.10)';
  ctx.strokeStyle = 'rgba(122,179,217,0.9)';
  ctx.lineWidth = 2;
  ctx.setLineDash([7, 5]);
  ctx.beginPath();
  ctx.arc(cx, cy, CONFIG.minerals.mineWorkRadius * TILE, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawWatchtowerProjectiles(ctx: CanvasRenderingContext2D, state: GameState, alpha: number): void {
  for (const shot of state.watchtowerProjectiles ?? []) {
    const progress = Math.max(0, Math.min(1, (shot.ageTicks + alpha) / Math.max(1, shot.durationTicks)));
    const fromX = shot.fromX * TILE + TILE / 2;
    const fromY = shot.fromY * TILE + TILE * 0.12;
    const toX = shot.toX * TILE + TILE / 2;
    const toY = shot.toY * TILE + TILE / 2;
    const x = fromX + (toX - fromX) * progress;
    const y = fromY + (toY - fromY) * progress - Math.sin(progress * Math.PI) * TILE * 0.18;
    const angle = Math.atan2(toY - fromY, toX - fromX);
    const tail = shot.bow ? 11 : 8;
    ctx.save();
    ctx.strokeStyle = shot.bow ? '#f2d18a' : '#d7b06a';
    ctx.fillStyle = '#f4e4bd';
    ctx.lineWidth = shot.bow ? 2 : 1.5;
    ctx.beginPath();
    ctx.moveTo(x - Math.cos(angle) * tail, y - Math.sin(angle) * tail);
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(3, 0);
    ctx.lineTo(-2, -2.5);
    ctx.lineTo(-1, 0);
    ctx.lineTo(-2, 2.5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

function drawGatheringWorkRange(
  ctx: CanvasRenderingContext2D,
  building: Pick<Building, 'type' | 'x' | 'y' | 'gatheringWorkArea'> & { type: GatheringBuildingType },
): void {
  const area = gatheringWorkArea(building);
  const cx = (area.x + 0.5) * TILE;
  const cy = (area.y + 0.5) * TILE;
  ctx.save();
  const color = building.type === 'huntLodge'
    ? { fill: 'rgba(217,164,65,0.11)', stroke: 'rgba(232,184,84,0.95)' }
    : building.type === 'herbHut'
      ? { fill: 'rgba(112,188,150,0.11)', stroke: 'rgba(125,214,169,0.95)' }
      : { fill: 'rgba(105,175,96,0.11)', stroke: 'rgba(132,211,117,0.95)' };
  ctx.fillStyle = color.fill;
  ctx.strokeStyle = color.stroke;
  ctx.lineWidth = 2;
  ctx.setLineDash([7, 5]);
  ctx.beginPath();
  ctx.arc(cx, cy, area.radius * TILE, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawLodgingWorksiteRange(ctx: CanvasRenderingContext2D, worksite: Building): void {
  if (worksite.type === 'mine') {
    drawMineWorkRange(ctx, worksite.x, worksite.y);
  } else if (isGatheringBuildingType(worksite.type)) {
    drawGatheringWorkRange(ctx, worksite as Building & { type: GatheringBuildingType });
  }
}

function drawLodgingLink(
  ctx: CanvasRenderingContext2D,
  hut: Pick<Building, 'x' | 'y' | 'w' | 'h'>,
  worksite: Building,
): void {
  const hutCx = (hut.x + (hut.w ?? 1) / 2) * TILE;
  const hutCy = (hut.y + (hut.h ?? 1) / 2) * TILE;
  const worksiteCx = (worksite.x + (worksite.w ?? 1) / 2) * TILE;
  const worksiteCy = (worksite.y + (worksite.h ?? 1) / 2) * TILE;
  ctx.save();
  ctx.strokeStyle = 'rgba(255,196,92,0.98)';
  ctx.fillStyle = 'rgba(255,220,132,0.98)';
  ctx.lineWidth = 2.5;
  ctx.setLineDash([8, 5]);
  ctx.beginPath();
  ctx.moveTo(hutCx, hutCy);
  ctx.lineTo(worksiteCx, worksiteCy);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.arc(worksiteCx, worksiteCy, Math.max(4, TILE * 0.18), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawHabitatIcon(
  ctx: CanvasRenderingContext2D,
  habitat: AnimalHabitat,
  icon?: CanvasImageSource,
): void {
  const cx = (habitat.x + 0.5) * TILE;
  const cy = (habitat.y + 0.5) * TILE;
  const r = TILE * 0.43;
  ctx.save();
  ctx.fillStyle = 'rgba(24,18,11,0.78)';
  ctx.strokeStyle = 'rgba(245,214,146,0.95)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  if (icon) {
    const size = TILE * 0.82;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(icon, cx - size / 2, cy - size / 2, size, size);
    ctx.restore();
    return;
  }
  ctx.fillStyle = '#f3d79c';
  const s = TILE / 28;
  for (const [ox, oy, rr] of [[-5, -4, 2.6], [0, -6, 2.8], [5, -4, 2.6], [-3, 1, 3.2], [3, 1, 3.2]] as const) {
    ctx.beginPath();
    ctx.arc(cx + ox * s, cy + oy * s, rr * s, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.ellipse(cx, cy + 5 * s, 5.2 * s, 3.7 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawExpeditionTargetMarker(ctx: CanvasRenderingContext2D, marker: ExpeditionTargetMarker): void {
  const cx = (marker.x + 0.5) * TILE;
  const cy = (marker.y + 0.5) * TILE;
  const color = marker.kind === 'tiger' ? '224,95,82' : marker.kind === 'wolf' ? '226,153,55' : '194,76,66';
  const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 260);
  const radius = marker.radius * TILE * (1 + pulse * 0.045);
  ctx.save();
  ctx.fillStyle = `rgba(${color},${(0.08 + pulse * 0.05).toFixed(3)})`;
  ctx.strokeStyle = `rgba(${color},${(0.72 + pulse * 0.24).toFixed(3)})`;
  ctx.lineWidth = marker.expeditionTarget ? 3 : 2;
  ctx.setLineDash([10, 6]);
  ctx.lineDashOffset = -(performance.now() / 45) % 16;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = `rgb(${color})`;
  ctx.strokeStyle = 'rgba(18,20,22,0.95)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx, cy - 11);
  ctx.lineTo(cx + 9, cy);
  ctx.lineTo(cx, cy + 11);
  ctx.lineTo(cx - 9, cy);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.font = '700 11px sans-serif';
  const width = ctx.measureText(marker.label).width + 14;
  const labelX = cx - width / 2;
  const labelY = cy - radius - 25;
  ctx.fillStyle = 'rgba(22,24,26,0.92)';
  ctx.strokeStyle = `rgba(${color},0.9)`;
  ctx.lineWidth = 1;
  ctx.fillRect(labelX, labelY, width, 19);
  ctx.strokeRect(labelX + 0.5, labelY + 0.5, width - 1, 18);
  ctx.fillStyle = '#f4ead4';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(marker.label, cx, labelY + 10);
  ctx.restore();
}

function drawSlotDot(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  fill: string,
  stroke: string,
  lineWidth = 1,
): void {
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.lineWidth = 1;
}

function drawActiveWorkerPulse(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  residentId: number,
): void {
  const pulse = (Math.sin(performance.now() / 190 + residentId * 0.8) + 1) / 2;
  ctx.strokeStyle = `rgba(255,205,104,${(0.48 + pulse * 0.42).toFixed(2)})`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(x, y, radius + 1.2 + pulse * 0.8, 0, Math.PI * 2);
  ctx.stroke();
}

function drawWorkerSlotOverlay(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  building: Building,
  expanded: boolean,
  activeResidentIds: ReadonlySet<number>,
): void {
  if (!building.built) return;
  const config = workerSlotConfig(building.type);
  if (!config) return;
  if (!isBuildingFootprintExplored(state, building.type, building.x, building.y, building.w, building.h)) return;

  const slotCount = workerSlotCount(building);
  const workers = assignedWorkers(state, building);
  const activeCount = workers.filter(worker => activeResidentIds.has(worker.id)).length;
  const dims = buildingFootprintDims(building);
  const cx = (building.x + dims.w / 2) * TILE;
  const top = building.y * TILE;
  const emptyFill = 'rgba(30,36,43,0.78)';
  const emptyStroke = 'rgba(216,222,229,0.48)';

  ctx.save();
  if (expanded) {
    const radius = 4.4;
    const gap = 3;
    const pad = 4;
    const width = slotCount * radius * 2 + Math.max(0, slotCount - 1) * gap + pad * 2;
    const statusHeight = 12;
    const height = radius * 2 + pad * 2 + statusHeight;
    const left = cx - width / 2;
    const y = top - height - 3;
    ctx.fillStyle = 'rgba(20,24,28,0.88)';
    ctx.strokeStyle = 'rgba(217,164,65,0.58)';
    ctx.lineWidth = 1;
    ctx.fillRect(left, y, width, height);
    ctx.strokeRect(left + 0.5, y + 0.5, width - 1, height - 1);
    for (let i = 0; i < slotCount; i++) {
      const worker = workers[i];
      const dotX = left + pad + radius + i * (radius * 2 + gap);
      const dotY = y + pad + radius;
      drawSlotDot(
        ctx,
        dotX,
        dotY,
        radius,
        worker ? JOB_COLORS[worker.job] : emptyFill,
        worker ? 'rgba(246,225,178,0.9)' : emptyStroke,
        worker ? 1.2 : 1,
      );
      if (worker && activeResidentIds.has(worker.id)) {
        drawActiveWorkerPulse(ctx, dotX, dotY, radius, worker.id);
      }
    }
    ctx.fillStyle = activeCount > 0 ? '#f1cf7a' : 'rgba(216,222,229,0.68)';
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`작업 ${activeCount}/${slotCount}`, cx, y + height - statusHeight / 2);
    ctx.restore();
    return;
  }

  const radius = 2.4;
  const gap = 5.5;
  const startX = cx - ((slotCount - 1) * gap) / 2;
  const y = top - 4;
  for (let i = 0; i < slotCount; i++) {
    const worker = workers[i];
    drawSlotDot(
      ctx,
      startX + i * gap,
      y,
      radius,
      worker ? JOB_COLORS[worker.job] : emptyFill,
      worker ? 'rgba(20,24,28,0.82)' : emptyStroke,
    );
    if (worker && activeResidentIds.has(worker.id)) {
      drawActiveWorkerPulse(ctx, startX + i * gap, y, radius, worker.id);
    }
  }
  ctx.restore();
}

function drawWorkerSlotOverlays(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  buildings: Building[],
  selectedBuildingId?: number | null,
  activeResidentIds: ReadonlySet<number> = new Set<number>(),
): void {
  for (const building of buildings) {
    drawWorkerSlotOverlay(ctx, state, building, selectedBuildingId === building.id, activeResidentIds);
  }
}

function drawFogOverlay(ctx: CanvasRenderingContext2D, state: GameState, viewport: SceneViewport): void {
  ctx.save();
  for (let y = viewport.tileMinY; y <= viewport.tileMaxY; y++) {
    const row = state.map[y];
    if (!row) continue;
    for (let x = viewport.tileMinX; x <= Math.min(viewport.tileMaxX, row.length - 1); x++) {
      if (isExplored(state, x, y)) continue;
      ctx.fillStyle = 'rgba(2,5,8,0.94)';
      ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
      if ((x * 17 + y * 31) % 7 === 0) {
        ctx.fillStyle = 'rgba(65,78,90,0.14)';
        ctx.fillRect(x * TILE + 9, y * TILE + 10, 3, 2);
      }
    }
  }
  ctx.restore();
}

// 평시 화재는 작업장 불씨와 혼동되지 않도록 주황 불길과 검은 연기를 함께 그린다.
// 별도 스프라이트 시트 없이도 표준/HD 캔버스에서 같은 픽셀 밀도로 보이게 논리 좌표로만 계산한다.
function drawBuildingFire(
  ctx: CanvasRenderingContext2D,
  bx: number,
  by: number,
  id: number,
  size: number,
  intensity: number,
): void {
  const t = performance.now() / 1000;
  const strength = Math.max(0.4, Math.min(3.2, intensity));
  const centerX = bx + size * 0.5;
  const baseY = by + size * 0.58;
  const flameCount = Math.min(6, 2 + Math.ceil(strength));
  ctx.save();
  for (let i = 0; i < flameCount; i++) {
    const phase = t * (2.5 + i * 0.13) + id * 0.71 + i * 1.9;
    const offsetX = ((i - (flameCount - 1) / 2) * size * 0.11) + Math.sin(phase) * 1.7;
    const height = size * (0.23 + strength * 0.075) * (0.78 + (Math.sin(phase * 1.7) + 1) * 0.13);
    const width = Math.max(3, size * (0.09 + strength * 0.015));
    ctx.fillStyle = i % 2 === 0 ? 'rgba(238,77,30,0.9)' : 'rgba(255,154,46,0.94)';
    ctx.beginPath();
    ctx.moveTo(centerX + offsetX - width, baseY);
    ctx.quadraticCurveTo(centerX + offsetX - width * 0.45, baseY - height * 0.56, centerX + offsetX, baseY - height);
    ctx.quadraticCurveTo(centerX + offsetX + width * 0.85, baseY - height * 0.42, centerX + offsetX + width, baseY);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,225,106,0.92)';
    ctx.beginPath();
    ctx.ellipse(centerX + offsetX, baseY - height * 0.3, width * 0.33, height * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  const smokeCount = Math.min(7, 3 + Math.ceil(strength));
  for (let i = 0; i < smokeCount; i++) {
    const phase = (t * 0.42 + i * 0.19 + (id % 13) * 0.071) % 1;
    const x = centerX + Math.sin(phase * 7 + id + i) * size * (0.11 + phase * 0.15);
    const y = baseY - size * (0.26 + phase * (0.72 + strength * 0.1));
    const radius = size * (0.055 + phase * 0.09) * (0.8 + strength * 0.12);
    ctx.fillStyle = `rgba(45,39,37,${(0.56 * (1 - phase) * (0.6 + strength * 0.12)).toFixed(2)})`;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawWellSupplyRange(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  emphasis = true,
  color = '#6dd3f2',
): void {
  const cx = (x + 0.5) * TILE;
  const cy = (y + 0.5) * TILE;
  const radius = CONFIG.water.wellRadius * TILE;
  ctx.save();
  ctx.fillStyle = color;
  ctx.globalAlpha = emphasis ? 0.13 : 0.06;
  ctx.lineWidth = emphasis ? 2 : 1.25;
  ctx.setLineDash(emphasis ? [7, 5] : [4, 5]);
  ctx.beginPath();
  ctx.moveTo(cx, cy - radius);
  ctx.lineTo(cx + radius, cy);
  ctx.lineTo(cx, cy + radius);
  ctx.lineTo(cx - radius, cy);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = emphasis ? 0.95 : 0.54;
  ctx.strokeStyle = color;
  ctx.stroke();
  ctx.restore();
}

function drawNaturalWaterCoverage(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  viewport: SceneViewport,
  coverage: NaturalWaterCoverage,
): void {
  ctx.save();
  ctx.lineWidth = 1;
  for (let y = viewport.tileMinY; y <= viewport.tileMaxY; y++) {
    const row = state.map[y];
    if (!row) continue;
    for (let x = viewport.tileMinX; x <= Math.min(viewport.tileMaxX, row.length - 1); x++) {
      if (!isExplored(state, x, y)) continue;
      const tileKey = waterCoverageTileKey(x, y);
      const source = coverage.river.has(tileKey)
        ? 'river'
        : coverage.canal.has(tileKey)
          ? 'canal'
          : null;
      if (!source) continue;
      ctx.fillStyle = source === 'river'
        ? 'rgba(79, 214, 200, 0.25)'
        : 'rgba(73, 138, 168, 0.29)';
      ctx.strokeStyle = source === 'river'
        ? 'rgba(118, 242, 226, 0.58)'
        : 'rgba(111, 187, 217, 0.62)';
      ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
      ctx.strokeRect(x * TILE + 0.5, y * TILE + 0.5, TILE - 1, TILE - 1);
    }
  }
  ctx.restore();
}

// 물이 차오르는 방향 — 범람은 이웃한 강 쪽 변에서 밀려들고, 보 저수지는 아래에서 차오른다.
type WaterRiseFrom = 'bottom' | 'left' | 'right' | 'top';

function drawWaterRiseOverlay(
  ctx: CanvasRenderingContext2D,
  tileX: number,
  tileY: number,
  progress: number,
  animationTimeMs: number,
  flood: boolean,
  from: WaterRiseFrom = 'bottom',
): void {
  const clamped = Math.max(0, Math.min(1, progress));
  if (clamped <= 0) return;
  const x = tileX * TILE;
  const y = tileY * TILE;
  const span = TILE * clamped;
  const rect = from === 'left' ? [x, y, span, TILE] as const
    : from === 'right' ? [x + TILE - span, y, span, TILE] as const
      : from === 'top' ? [x, y, TILE, span] as const
        : [x, y + TILE - span, TILE, span] as const;
  const [rectX, rectY, rectW, rectH] = rect;
  ctx.save();
  ctx.beginPath();
  ctx.rect(rectX, rectY, rectW, rectH);
  ctx.clip();
  ctx.fillStyle = flood ? 'rgba(72, 129, 157, 0.54)' : 'rgba(70, 132, 158, 0.62)';
  ctx.fillRect(rectX, rectY, rectW, rectH);
  ctx.strokeStyle = flood ? 'rgba(201, 231, 234, 0.76)' : 'rgba(190, 228, 230, 0.82)';
  ctx.lineWidth = 1;
  const phase = animationTimeMs / 360 + tileX * 0.8 + tileY * 0.45;
  for (let offset = 4; offset < TILE; offset += 8) {
    const waveY = y + offset;
    ctx.beginPath();
    for (let px = 1; px < TILE; px += 3) {
      const py = waveY + Math.sin(phase + px * 0.45 + offset) * 0.8;
      if (px === 1) ctx.moveTo(x + px, py);
      else ctx.lineTo(x + px, py);
    }
    ctx.stroke();
  }
  ctx.restore();
}

// 범람 칸이 접한 강 쪽 변 — 좌우 강을 먼저 보고, 없으면 상하, 그것도 없으면 아래에서 차오른다.
function floodRiseFrom(state: GameState, x: number, y: number): WaterRiseFrom {
  const terrainAt = (tx: number, ty: number) => state.map[ty]?.[tx]?.terrain;
  if (terrainAt(x - 1, y) === 'river') return 'left';
  if (terrainAt(x + 1, y) === 'river') return 'right';
  if (terrainAt(x, y - 1) === 'river') return 'top';
  if (terrainAt(x, y + 1) === 'river') return 'bottom';
  return 'bottom';
}

// 강 흐름 시각화 — 물비늘이 강줄기를 따라 상류에서 하류로 흘러내리며 햇빛에 반짝인다.
// 범람·해빙 중에는 흙탕물 색으로 탁해진다. 겨울 결빙 강은 흐르지 않는다.
function riverGlintHash(x: number, y: number, i: number): number {
  const h = Math.sin(x * 127.1 + y * 311.7 + i * 74.7) * 43758.5453;
  return h - Math.floor(h);
}

// 타일별 흐름 방향 필드 — 강 연결을 성분마다 가장 북쪽 칸(상류)에서 BFS로 훑어,
// 각 칸이 하류 이웃을 향하는 단위 방향을 갖는다. ㄱ·ㄴ자로 꺾이는 구간에서는
// 그 칸의 방향이 옆으로 눕는다. 지형은 불변이라 시드당 한 번만 계산한다.
let riverFlowCache: { key: string; dirs: Map<number, readonly [number, number]> } | null = null;

function riverFlowDirs(state: GameState): Map<number, readonly [number, number]> {
  const height = state.map.length;
  const width = state.map[0]?.length ?? 0;
  const key = `${state.seed}:${width}x${height}`;
  if (riverFlowCache?.key === key) return riverFlowCache.dirs;

  const idxOf = (x: number, y: number) => y * width + x;
  const riverIdx = new Set<number>();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (state.map[y][x].terrain === 'river') riverIdx.add(idxOf(x, y));
    }
  }
  const dist = new Map<number, number>();
  const NEIGHBORS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
  // 성분별 상류 출발점: 아직 거리가 없는 강 칸 중 가장 북쪽(같으면 서쪽) 칸
  const sorted = [...riverIdx].sort((a, b) => a - b); // idx 정렬 = y 우선, x 차선
  for (const source of sorted) {
    if (dist.has(source)) continue;
    dist.set(source, 0);
    const queue = [source];
    for (let head = 0; head < queue.length; head++) {
      const current = queue[head];
      const cx = current % width;
      const cy = (current - cx) / width;
      for (const [dx, dy] of NEIGHBORS) {
        const next = idxOf(cx + dx, cy + dy);
        if (cx + dx < 0 || cx + dx >= width || cy + dy < 0 || cy + dy >= height) continue;
        if (!riverIdx.has(next) || dist.has(next)) continue;
        dist.set(next, (dist.get(current) ?? 0) + 1);
        queue.push(next);
      }
    }
  }
  const dirs = new Map<number, readonly [number, number]>();
  for (const idx of riverIdx) {
    const x = idx % width;
    const y = (idx - x) / width;
    const here = dist.get(idx) ?? 0;
    let dir: readonly [number, number] | null = null;
    let incoming: readonly [number, number] | null = null;
    for (const [dx, dy] of NEIGHBORS) {
      if (x + dx < 0 || x + dx >= width || y + dy < 0 || y + dy >= height) continue;
      const neighbor = idxOf(x + dx, y + dy);
      if (!riverIdx.has(neighbor)) continue;
      const d = dist.get(neighbor);
      if (d === here + 1 && !dir) dir = [dx, dy];
      if (d === here - 1 && !incoming) incoming = [dx, dy];
    }
    dirs.set(idx, dir ?? incoming ?? [0, 1]); // 하구는 들어온 방향을 그대로 잇는다
  }
  riverFlowCache = { key, dirs };
  return dirs;
}

function drawRiverFlow(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  viewport: SceneViewport,
  animationTimeMs: number,
  muddy: boolean,
): void {
  const frozen = getSeason(state.day) === 'winter' && state.weather !== 'thawFlood';
  if (frozen) return;
  const turbid = muddy || state.weather === 'thawFlood';
  const flowDirs = riverFlowDirs(state);
  const mapWidth = state.map[0]?.length ?? 0;
  ctx.save();
  for (let ty = viewport.tileMinY; ty <= viewport.tileMaxY; ty++) {
    for (let tx = viewport.tileMinX; tx <= viewport.tileMaxX; tx++) {
      const tile = state.map[ty]?.[tx];
      if (!tile || tile.terrain !== 'river' || !isExplored(state, tx, ty)) continue;
      const px = tx * TILE;
      const py = ty * TILE;
      if (turbid) {
        ctx.fillStyle = 'rgba(121, 94, 53, 0.30)';
        ctx.fillRect(px, py, TILE, TILE);
      }
      const [dirX, dirY] = flowDirs.get(ty * mapWidth + tx) ?? [0, 1];
      const perpX = -dirY;
      const perpY = dirX;
      const centerX = px + TILE / 2;
      const centerY = py + TILE / 2;
      ctx.lineWidth = 1;
      for (let i = 0; i < 3; i++) {
        const seed = riverGlintHash(tx, ty, i);
        // 물비늘 하나가 이 칸의 흐름 방향을 따라 지나가는 진행도 (칸·비늘마다 위상이 어긋난다)
        const phase = (animationTimeMs / (turbid ? 2600 : 1900) + seed) % 1;
        const along = (phase - 0.5) * TILE;
        const offset = (riverGlintHash(tx, ty, i + 7) - 0.5) * (TILE - 8) +
          Math.sin(animationTimeMs / 700 + seed * 12) * 1.5;
        const gx = centerX + dirX * along + perpX * offset;
        const gy = centerY + dirY * along + perpY * offset;
        const alpha = Math.sin(Math.PI * phase) * (turbid ? 0.22 : 0.4);
        if (alpha <= 0.02) continue;
        ctx.strokeStyle = turbid
          ? `rgba(214, 190, 148, ${alpha.toFixed(3)})`
          : `rgba(233, 246, 252, ${alpha.toFixed(3)})`;
        ctx.beginPath();
        ctx.moveTo(gx, gy);
        ctx.lineTo(gx + dirX * 3.2 + perpX * 0.8, gy + dirY * 3.2 + perpY * 0.8);
        ctx.stroke();
      }
    }
  }
  ctx.restore();
}

// 숲 새 떼 — 주민이 숲 칸에 들어서면 이따금 작은 새 몇 마리가 날아오른다.
// 순수 연출이라 게임 상태에 남기지 않고 렌더러 안에서만 산다.
interface BirdFlight {
  x: number; y: number;      // 출발 픽셀
  vx: number; vy: number;    // 픽셀/초 (위로 오르며 옆으로 흩어진다)
  born: number;              // animationTimeMs 기준 출생 시각
  seed: number;              // 날갯짓 위상
}
const BIRD_FLIGHT_MS = 1500;
const BIRD_TILE_COOLDOWN_MS = 9000;
const birdFlights: BirdFlight[] = [];
const birdResidentTileMemo = new Map<number, string>();
const birdTileCooldown = new Map<string, number>();

function spawnForestBirds(state: GameState, timeMs: number): void {
  for (const r of state.residents) {
    if (!r.alive) { birdResidentTileMemo.delete(r.id); continue; }
    const key = `${r.x},${r.y}`;
    if (birdResidentTileMemo.get(r.id) === key) continue; // 같은 칸에 머무는 동안은 조용히
    birdResidentTileMemo.set(r.id, key);
    const tile = state.map[r.y]?.[r.x];
    if (!tile || tile.terrain !== 'forest' || !isExplored(state, r.x, r.y)) continue;
    if ((birdTileCooldown.get(key) ?? 0) > timeMs) continue;
    if (riverGlintHash(r.x, r.y, Math.floor(timeMs / 1000)) > 0.35) continue; // 매번은 아니고 이따금
    birdTileCooldown.set(key, timeMs + BIRD_TILE_COOLDOWN_MS);
    const flock = 2 + Math.floor(riverGlintHash(r.x, r.y, 3) * 3); // 2~4마리
    for (let i = 0; i < flock && birdFlights.length < 60; i++) {
      const jitter = riverGlintHash(r.x + i, r.y, i);
      birdFlights.push({
        x: (r.x + 0.3 + jitter * 0.4) * TILE,
        y: (r.y + 0.25 + riverGlintHash(r.x, r.y + i, i) * 0.3) * TILE,
        vx: (jitter - 0.5) * 26,
        vy: -(20 + jitter * 14),
        born: timeMs + i * 90, // 순차로 날아올라 떼 같아 보이게
        seed: jitter * Math.PI * 2,
      });
    }
  }
}

function drawForestBirds(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  viewport: SceneViewport,
  timeMs: number,
): void {
  spawnForestBirds(state, timeMs);
  if (birdFlights.length === 0) return;
  ctx.save();
  ctx.lineWidth = 1;
  for (let i = birdFlights.length - 1; i >= 0; i--) {
    const bird = birdFlights[i];
    const t = (timeMs - bird.born) / BIRD_FLIGHT_MS;
    if (t >= 1) { birdFlights.splice(i, 1); continue; }
    if (t < 0) continue; // 아직 날아오르기 전 (순차 출발)
    const bx = bird.x + bird.vx * t * (BIRD_FLIGHT_MS / 1000);
    const by = bird.y + bird.vy * t * (BIRD_FLIGHT_MS / 1000);
    if (bx < viewport.pixelX - 8 || bx > viewport.pixelX + viewport.pixelWidth + 8 ||
        by < viewport.pixelY - 8 || by > viewport.pixelY + viewport.pixelHeight + 8) continue;
    const alpha = t < 0.15 ? t / 0.15 : 1 - Math.max(0, (t - 0.6) / 0.4);
    // 아주 작은 ˅꼴 — 날갯짓으로 벌어졌다 오므라든다
    const flap = 1.1 + Math.sin(timeMs / 70 + bird.seed) * 0.9;
    ctx.strokeStyle = `rgba(50, 46, 40, ${(alpha * 0.85).toFixed(3)})`;
    ctx.beginPath();
    ctx.moveTo(bx - 2, by - flap);
    ctx.lineTo(bx, by);
    ctx.lineTo(bx + 2, by - flap);
    ctx.stroke();
  }
  ctx.restore();
}

function drawEarlyFrostCropOverlay(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.save();
  ctx.fillStyle = 'rgba(225, 239, 246, 0.30)';
  ctx.fillRect(x + 1, y + 1, TILE - 2, TILE - 2);
  ctx.strokeStyle = 'rgba(242, 250, 253, 0.72)';
  ctx.lineWidth = 0.8;
  for (const [dx, dy] of [[6, 7], [17, 5], [12, 17], [22, 20]] as const) {
    ctx.beginPath();
    ctx.moveTo(x + dx - 2, y + dy);
    ctx.lineTo(x + dx + 2, y + dy);
    ctx.moveTo(x + dx, y + dy - 2);
    ctx.lineTo(x + dx, y + dy + 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawLocustCropOverlay(ctx: CanvasRenderingContext2D, x: number, y: number, day: number): void {
  ctx.save();
  ctx.fillStyle = 'rgba(112, 76, 25, 0.78)';
  ctx.strokeStyle = 'rgba(64, 45, 18, 0.82)';
  ctx.lineWidth = 0.8;
  for (let index = 0; index < 7; index++) {
    const phase = day * 3 + index * 11 + Math.floor(x + y) * 2;
    const px = x + 3 + ((phase * 7) % (TILE - 6));
    const py = y + 4 + ((phase * 5) % (TILE - 8));
    ctx.beginPath();
    ctx.ellipse(px, py, 1.45, 0.8, (phase % 5) * 0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(px - 2, py + 1);
    ctx.lineTo(px + 2, py - 1);
    ctx.stroke();
  }
  ctx.restore();
}

function drawDroughtCropOverlay(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  irrigated: boolean,
): void {
  ctx.save();
  ctx.fillStyle = irrigated ? 'rgba(78, 137, 142, 0.10)' : 'rgba(151, 105, 45, 0.23)';
  ctx.fillRect(x + 1, y + 1, TILE - 2, TILE - 2);
  if (!irrigated) {
    ctx.strokeStyle = 'rgba(92, 62, 28, 0.48)';
    ctx.lineWidth = 0.75;
    ctx.beginPath();
    ctx.moveTo(x + 5, y + 22);
    ctx.lineTo(x + 10, y + 16);
    ctx.lineTo(x + 8, y + 11);
    ctx.moveTo(x + 20, y + 7);
    ctx.lineTo(x + 16, y + 13);
    ctx.lineTo(x + 22, y + 18);
    ctx.stroke();
  }
  ctx.restore();
}

function siteColor(site: ForeignSite): string {
  return FACTIONS.find(faction => faction.name === site.factionName)?.color ?? '#9aa0a6';
}

function drawClaimZone(ctx: CanvasRenderingContext2D, zone: ClaimZone, color: string): void {
  ctx.save();
  ctx.beginPath();
  ctx.arc((zone.x + 0.5) * TILE, (zone.y + 0.5) * TILE, zone.radius * TILE, 0, Math.PI * 2);
  ctx.fillStyle = color + '18';
  ctx.strokeStyle = color + '99';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 4]);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawPassageRoute(ctx: CanvasRenderingContext2D, route: ReturnType<typeof activePassageRoutes>[number]): void {
  if (route.tiles.length < 2) return;
  ctx.save();
  ctx.strokeStyle = siteColor(route.site) + 'cc';
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 4]);
  ctx.beginPath();
  route.tiles.forEach((tile, index) => {
    const x = (tile.x + 0.5) * TILE;
    const y = (tile.y + 0.5) * TILE;
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
  ctx.restore();
}

function drawForeignSite(
  ctx: CanvasRenderingContext2D,
  sprites: SpriteAPI,
  site: ForeignSite,
  selected: boolean,
  season: ReturnType<typeof getSeason>,
): void {
  const x = site.x * TILE;
  const y = site.y * TILE;
  const w = site.width * TILE;
  const h = site.height * TILE;
  const color = siteColor(site);
  const inactive = site.type === 'seasonalCamp' && site.seasonalActive === false;
  ctx.save();
  ctx.globalAlpha = inactive ? 0.45 : 1;

  const drewSprite = sprites.drawForeignStructure(ctx, {
    factionName: site.factionName,
    siteType: site.type,
    status: site.status,
    variant: 'core',
    season,
    x,
    y,
    size: Math.max(w, h),
  });
  if (drewSprite) {
    ctx.fillStyle = color;
    ctx.fillRect(x + 2, y + 2, Math.max(4, w * 0.12), 3);
    if (selected) {
      ctx.strokeStyle = '#f3ce68';
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
    }
    ctx.restore();
    return;
  }

  if (site.type === 'village' || site.type === 'fishingVillage') {
    ctx.fillStyle = '#4f3c2d';
    ctx.fillRect(x + w * 0.12, y + h * 0.46, w * 0.34, h * 0.3);
    ctx.fillRect(x + w * 0.56, y + h * 0.38, w * 0.3, h * 0.34);
    ctx.fillStyle = '#85705a';
    ctx.beginPath();
    ctx.moveTo(x + w * 0.07, y + h * 0.48);
    ctx.lineTo(x + w * 0.3, y + h * 0.2);
    ctx.lineTo(x + w * 0.5, y + h * 0.48);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x + w * 0.5, y + h * 0.4);
    ctx.lineTo(x + w * 0.72, y + h * 0.12);
    ctx.lineTo(x + w * 0.92, y + h * 0.4);
    ctx.fill();
    if (site.type === 'fishingVillage') {
      ctx.strokeStyle = '#8fc1d4';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + w * 0.18, y + h * 0.86);
      ctx.quadraticCurveTo(x + w * 0.5, y + h * 0.98, x + w * 0.8, y + h * 0.82);
      ctx.stroke();
    }
  } else if (site.type === 'seasonalCamp') {
    ctx.fillStyle = inactive ? '#67615b' : '#8d7659';
    ctx.beginPath();
    ctx.moveTo(x + w * 0.12, y + h * 0.76);
    ctx.lineTo(x + w * 0.5, y + h * 0.16);
    ctx.lineTo(x + w * 0.88, y + h * 0.76);
    ctx.fill();
    if (!inactive) {
      ctx.fillStyle = '#e9a34a';
      ctx.beginPath();
      ctx.arc(x + w * 0.5, y + h * 0.82, Math.max(2, TILE * 0.1), 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (site.type === 'banditLair') {
    ctx.fillStyle = site.status === 'burned' ? '#2b211e' : '#30292a';
    ctx.fillRect(x + w * 0.15, y + h * 0.4, w * 0.68, h * 0.38);
    ctx.fillStyle = '#1f1b1c';
    ctx.beginPath();
    ctx.moveTo(x + w * 0.08, y + h * 0.42);
    ctx.lineTo(x + w * 0.5, y + h * 0.12);
    ctx.lineTo(x + w * 0.9, y + h * 0.42);
    ctx.fill();
    ctx.strokeStyle = '#b9473f';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + w * 0.78, y + h * 0.38);
    ctx.lineTo(x + w * 0.78, y + h * 0.08);
    ctx.lineTo(x + w * 0.95, y + h * 0.16);
    ctx.stroke();
  } else if (site.type === 'outpost') {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.strokeRect(x + w * 0.25, y + h * 0.25, w * 0.5, h * 0.55);
    ctx.beginPath();
    ctx.moveTo(x + w * 0.5, y + h * 0.25);
    ctx.lineTo(x + w * 0.5, y + h * 0.04);
    ctx.stroke();
  } else {
    ctx.fillStyle = '#77756f';
    ctx.fillRect(x + w * 0.15, y + h * 0.58, w * 0.28, h * 0.18);
    ctx.fillRect(x + w * 0.48, y + h * 0.42, w * 0.34, h * 0.2);
  }

  ctx.fillStyle = color;
  ctx.fillRect(x + 2, y + 2, Math.max(4, w * 0.12), 3);
  if (selected) {
    ctx.strokeStyle = '#f3ce68';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
  }
  ctx.restore();
}

function drawForeignSiteProp(
  ctx: CanvasRenderingContext2D,
  sprites: SpriteAPI,
  prop: ForeignSiteProp,
  site: ForeignSite,
  season: ReturnType<typeof getSeason>,
  day: number,
): void {
  const x = prop.x * TILE;
  const y = prop.y * TILE;
  if (prop.kind === 'field' || prop.kind === 'hut' || prop.kind === 'storehouse' || prop.kind === 'huntLodge') {
    const type = prop.kind === 'field' ? 'field'
      : prop.kind === 'hut' ? 'hut'
        : prop.kind === 'huntLodge' ? 'huntLodge' : 'storehouse';
    const seasonalGrowth = season === 'spring' ? 0.35 : season === 'summer' ? 0.72 : season === 'autumn' ? 0.95 : 0.08;
    const drewForeign = prop.kind !== 'field' && sprites.drawForeignStructure(ctx, {
      factionName: site.factionName,
      siteType: site.type,
      status: site.status,
      variant: 'prop',
      season,
      x,
      y,
      size: TILE,
    });
    if (!drewForeign) {
      drawBuildingSprite(ctx, sprites, {
        type,
        built: true,
        ghost: false,
        progress01: 1,
        growth01: prop.kind === 'field' ? Math.min(1, seasonalGrowth + ((day + prop.x + prop.y) % 4) * 0.04) : undefined,
        x,
        y,
        size: TILE,
        season,
      });
    }
    ctx.fillStyle = siteColor(site);
    ctx.fillRect(x + 4, y + TILE - 3, TILE - 8, 2);
    return;
  }
  ctx.save();
  if (prop.kind === 'dryingRack') {
    ctx.strokeStyle = '#8b6c48';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + 5, y + TILE - 5);
    ctx.lineTo(x + 9, y + 7);
    ctx.lineTo(x + TILE - 7, y + 7);
    ctx.lineTo(x + TILE - 4, y + TILE - 5);
    ctx.moveTo(x + 8, y + 12);
    ctx.lineTo(x + TILE - 6, y + 12);
    ctx.stroke();
    ctx.fillStyle = '#b7c2b0';
    for (let i = 0; i < 3; i++) ctx.fillRect(x + 10 + i * 4, y + 13, 2, 6);
  } else {
    ctx.fillStyle = '#67513a';
    ctx.strokeStyle = '#9ac2d0';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(x + TILE / 2, y + TILE / 2 + 2, TILE * 0.38, TILE * 0.16, -0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + TILE * 0.34, y + TILE * 0.38);
    ctx.lineTo(x + TILE * 0.66, y + TILE * 0.62);
    ctx.stroke();
  }
  ctx.restore();
}

// 프레임 병목 계측 (옵트인) — 콘솔에서 `window.__renderPerf = {}`를 넣으면 구간별 누적 ms가 쌓인다
type RenderPerfBucket = { total: number; count: number };
declare global {
  interface Window { __renderPerf?: Record<string, RenderPerfBucket> }
}

function drawPastureGround(
  ctx: CanvasRenderingContext2D,
  area: PastureArea,
  winter: boolean,
  highlighted: boolean,
): void {
  const x = area.x * TILE;
  const y = area.y * TILE;
  const width = area.w * TILE;
  const height = area.h * TILE;
  ctx.save();
  ctx.fillStyle = winter ? 'rgba(205,220,224,0.16)' : 'rgba(118,139,70,0.16)';
  ctx.fillRect(x + 1, y + 1, width - 2, height - 2);
  ctx.strokeStyle = highlighted ? 'rgba(245,203,94,0.95)' : 'rgba(111,76,43,0.78)';
  ctx.lineWidth = highlighted ? 2 : 1.25;
  ctx.setLineDash([Math.max(3, TILE * 0.22), Math.max(2, TILE * 0.13)]);
  ctx.strokeRect(x + 1.5, y + 1.5, width - 3, height - 3);
  ctx.setLineDash([]);
  ctx.fillStyle = winter ? '#aa9271' : '#76502f';
  const post = Math.max(2, Math.round(TILE * 0.12));
  for (const [px, py] of [
    [x + 1, y + 1],
    [x + width - post - 1, y + 1],
    [x + 1, y + height - post * 2 - 1],
    [x + width - post - 1, y + height - post * 2 - 1],
  ]) ctx.fillRect(px, py, post, post * 2);
  ctx.restore();
}

function livestockPositionSeed(stableId: number, animalIndex: number, salt: number): number {
  let value = (stableId * 73856093) ^ (animalIndex * 19349663) ^ (salt * 83492791);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 0xffffffff;
}

function pastureLivestockDraws(
  state: GameState,
  viewport: SceneViewport,
  animationTimeMs: number,
  highDefinition: boolean,
): Array<{
    species: ReturnType<typeof normalizeLivestockState>['species'];
    x: number;
    y: number;
    facing: 1 | -1;
    highDefinition: boolean;
  }> {
  const animals: Array<{
    species: ReturnType<typeof normalizeLivestockState>['species'];
    x: number;
    y: number;
    facing: 1 | -1;
    highDefinition: boolean;
  }> = [];
  for (const stable of state.buildings) {
    if (stable.type !== 'stable' || !stable.built) continue;
    const pasture = normalizePastureArea(stable.pasture);
    if (!pasture || !tileRectIntersectsViewport(viewport, pasture.x, pasture.y, pasture.w, pasture.h)) continue;
    const livestock = normalizeLivestockState(stable.livestock);
    const visible = Math.min(
      Math.max(0, Math.floor(livestock.headcount)),
      CONFIG.pasture.visibleAnimalLimit,
    );
    const inset = TILE * 0.28;
    const usableWidth = Math.max(1, pasture.w * TILE - inset * 2);
    const usableHeight = Math.max(1, pasture.h * TILE - inset * 2);
    for (let index = 0; index < visible; index++) {
      const baseX = pasture.x * TILE + inset + livestockPositionSeed(stable.id, index, 1) * usableWidth;
      const baseY = pasture.y * TILE + inset + livestockPositionSeed(stable.id, index, 2) * usableHeight;
      const phase = animationTimeMs / 2200 + livestockPositionSeed(stable.id, index, 3) * Math.PI * 2;
      animals.push({
        species: livestock.species,
        x: Math.min(pasture.x * TILE + pasture.w * TILE - inset, Math.max(pasture.x * TILE + inset, baseX + Math.sin(phase) * 1.8)),
        y: Math.min(pasture.y * TILE + pasture.h * TILE - inset, Math.max(pasture.y * TILE + inset, baseY + Math.cos(phase * 0.73) * 1.2)),
        facing: livestockPositionSeed(stable.id, index, 4) > 0.5 ? 1 : -1,
        highDefinition,
      });
    }
  }
  animals.sort((left, right) => left.y - right.y || left.x - right.x);
  return animals;
}

export function renderScene(canvas: HTMLCanvasElement, state: GameState, o: SceneOptions): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const renderScale = o.renderScale === 2 ? 2 : 1;
  const logicalWidth = canvas.width / renderScale;
  const logicalHeight = canvas.height / renderScale;
  if (typeof ctx.setTransform === 'function') ctx.setTransform(renderScale, 0, 0, renderScale, 0, 0);
  const viewport = o.viewport ?? {
    pixelX: 0,
    pixelY: 0,
    pixelWidth: logicalWidth,
    pixelHeight: logicalHeight,
    tileMinX: 0,
    tileMinY: 0,
    tileMaxX: Math.max(0, Math.ceil(logicalWidth / TILE) - 1),
    tileMaxY: Math.max(0, Math.ceil(logicalHeight / TILE) - 1),
  };
  if (viewport.pixelWidth <= 0 || viewport.pixelHeight <= 0) return;
  const perf = typeof window !== 'undefined' ? window.__renderPerf : undefined;
  let perfLast = perf ? performance.now() : 0;
  const lap = (name: string): void => {
    if (!perf) return;
    const now = performance.now();
    const bucket = perf[name] ?? (perf[name] = { total: 0, count: 0 });
    bucket.total += now - perfLast;
    bucket.count++;
    perfLast = now;
  };
  const sprites = o.sprites ?? placeholderSprites;
  const occludedBuildingDraws: BuildingDrawParams[] = [];
  const occludedResidentDraws: ResidentDrawParams[] = [];
  const predatorScoutIds = activePredatorScoutIds(state);
  const warDispatchIds = new Set(state.warDispatch?.memberIds ?? []);
  const presentation = o.residentPresentation ?? buildResidentPresentationSnapshot(state);
  const lerp = (a: number, b: number) => a + (b - a) * o.alpha;
  const rowRenderQueue: RowRenderEntry[] = [];
  const enqueueRowDraw = (sortY: number, sortX: number, draw: () => void): void => {
    rowRenderQueue.push({ sortY, sortX, serial: rowRenderQueue.length, draw });
  };
  const localResidentDraws: ResidentDrawParams[] = [];
  const showAquiferLayer = o.showAquiferLayer ?? false;
  const showOreLayer = o.showOreLayer ?? false;
  const subsurfaceLayerActive = showAquiferLayer || showOreLayer;
  const selectedWell = o.selectedBuildingId == null
    ? undefined
    : state.buildings.find(building =>
        building.id === o.selectedBuildingId && building.type === 'well');
  const waterVisualizationActive =
    showAquiferLayer || o.placingType === 'well' || selectedWell != null;
  const validWaterPlacement = o.placingType && o.hover
    ? isBuildingFootprintExplored(
        state,
        o.placingType,
        o.hover.x,
        o.hover.y,
      ) && canPlaceBuildingAt(state, o.placingType, o.hover.x, o.hover.y)
    : false;
  const previewWell = o.placingType === 'well' && o.hover && validWaterPlacement
    ? o.hover
    : undefined;
  const previewWaterDemand = showAquiferLayer && o.placingType
    ? waterDemandForBuildingPlacement(o.placingType)
    : 0;
  const previewWaterBuilding: PreviewWaterBuilding | undefined =
    showAquiferLayer && o.placingType && o.hover && validWaterPlacement && previewWaterDemand > 0
      ? {
          id: PREVIEW_WATER_BUILDING_ID,
          type: o.placingType,
          x: o.hover.x,
          y: o.hover.y,
          w: buildingFootprintSize(o.placingType),
          h: buildingFootprintSize(o.placingType),
          demand: previewWaterDemand,
        }
      : undefined;
  const waterSnapshot = waterVisualizationActive
    ? cachedWaterVisualSnapshot(state, o.stateVersion, previewWell, previewWaterBuilding)
    : null;
  const naturalWaterCoverage = waterSnapshot?.naturalCoverage ?? null;
  for (const r of state.residents) {
    if (!r.alive || r.trappedInMineId != null || predatorScoutIds.has(r.id) || warDispatchIds.has(r.id) ||
        presentation.indoorResidentIds.has(r.id)) continue;
    const workStance = presentation.workStances.get(r.id);
    const p = residentPixelPos(r, o.alpha, workStance);
    // 저녁 마실 — 같은 타일에 모인 소그룹(최대 4인)이 겹치지 않게 둘러서고, 마실 지점을 바라본다.
    let leisureFacing: -1 | 1 | undefined;
    if (r.phase === 'leisure' && r.px === r.x && r.py === r.y) {
      const angle = (r.id % LEISURE_CLUSTER_CAPACITY) * (Math.PI * 2 / LEISURE_CLUSTER_CAPACITY) + Math.PI / 4;
      p.x += Math.cos(angle) * 5;
      p.y += Math.sin(angle) * 3;
      const dest = r.targetId != null ? presentation.buildingById.get(r.targetId) : undefined;
      if (dest) leisureFacing = dest.x * TILE + TILE / 2 >= p.x ? 1 : -1;
    }
    if (!pixelRectIntersectsViewport(viewport, p.x - TILE, p.y - TILE, TILE * 2, TILE * 2)) continue;
    const params: ResidentDrawParams = {
      job: r.job,
      gender: r.gender,
      x: p.x,
      y: p.y,
      sick: r.sick,
      carrying: Object.values(r.carrying).some(amount => amount > 0),
      carryingWood: (r.carrying.wood ?? 0) > 0 || (r.carrying.brushwood ?? 0) > 0,
      carryingGame: (r.carrying.meat ?? 0) > 0 || (r.carrying.hide ?? 0) > 0,
      carryingMinerals: (r.carrying.stone ?? 0) > 0 || (r.carrying.iron ?? 0) > 0 ||
        (r.carrying.silver ?? 0) > 0,
      showJobMarker: o.residentJobMarkers ?? true,
      showCargoMarker: o.residentCargoMarkers ?? true,
      cartEquipped: r.cartEquipped,
      farmerAction: farmerSpriteActionFor(r, presentation.oxPlowFarmerIds),
      selected: r.id === o.selectedResidentId,
      moving: r.px !== r.x || r.py !== r.y,
      working: r.phase === 'working' && r.px === r.x && r.py === r.y ||
        r.job === 'undertaker' && r.task === '묘지 돌봄' && r.px === r.x && r.py === r.y,
      facing: workStance?.facing ?? leisureFacing ?? (r.x < r.px ? -1 : 1),
      militiaWeapon: militiaWeaponForResident(state, r),
      special: r.special,
      stage: r.stage,
      religiousVocation: r.religiousVocation,
      sizeScale: r.stage === 'infant' ? 0.42 : r.stage === 'child' ? 0.62 : r.stage === 'youth' ? 0.8 : 1,
      animationTimeMs: o.animationTimeMs + stableResidentAnimationOffset(r.id),
    };
    localResidentDraws.push(params);
  }
  ctx.imageSmoothingEnabled = false;

  // 1) 지형
  const layer = drawTerrainLayer(
    state,
    logicalWidth,
    logicalHeight,
    sprites,
    o.terrainVisualSignature ?? terrainVisualSignature(state),
    renderScale,
  );
  // 짐승이 떠난(비활성) 서식지는 지도에서도 숨긴다
  const habitats = state.habitats.filter(h => h.active && isExplored(state, h.x, h.y));
  const hoveredHabitat = o.hover ? findHabitatIconAtTile(habitats, o.hover.x, o.hover.y) : null;
  ctx.clearRect(viewport.pixelX, viewport.pixelY, viewport.pixelWidth, viewport.pixelHeight);
  if (subsurfaceLayerActive) {
    ctx.fillStyle = '#dce5e3';
    ctx.fillRect(viewport.pixelX, viewport.pixelY, viewport.pixelWidth, viewport.pixelHeight);
    ctx.save();
    ctx.globalAlpha = 0.46;
    ctx.filter = 'grayscale(68%) brightness(112%)';
    ctx.drawImage(
      layer,
      viewport.pixelX * renderScale,
      viewport.pixelY * renderScale,
      viewport.pixelWidth * renderScale,
      viewport.pixelHeight * renderScale,
      viewport.pixelX, viewport.pixelY, viewport.pixelWidth, viewport.pixelHeight,
    );
    ctx.restore();
  } else {
    ctx.drawImage(
      layer,
      viewport.pixelX * renderScale,
      viewport.pixelY * renderScale,
      viewport.pixelWidth * renderScale,
      viewport.pixelHeight * renderScale,
      viewport.pixelX, viewport.pixelY, viewport.pixelWidth, viewport.pixelHeight,
    );
  }
  ctx.save();
  ctx.beginPath();
  ctx.rect(viewport.pixelX, viewport.pixelY, viewport.pixelWidth, viewport.pixelHeight);
  ctx.clip();
  // 바닥 캐시와 분리해 큰 노두가 뒤에 그려지는 이웃 타일 바닥에 잘리지 않게 한다.
  if (subsurfaceLayerActive) {
    drawMutedTerrainSprite(ctx, () => drawTerrainProps(ctx, state, sprites, viewport, renderScale));
  } else {
    drawTerrainProps(ctx, state, sprites, viewport, renderScale);
  }
  drawSubsurfaceLayers(ctx, state, viewport, showAquiferLayer, showOreLayer);
  if (naturalWaterCoverage) {
    drawNaturalWaterCoverage(ctx, state, viewport, naturalWaterCoverage);
  }
  for (const water of weirReservoirWaterVisuals(state)) {
    if (!isExplored(state, water.x, water.y) ||
        !tileRectIntersectsViewport(viewport, water.x, water.y)) continue;
    drawWaterRiseOverlay(ctx, water.x, water.y, water.progress, o.animationTimeMs, false);
  }
  const activeFlood = state.pendingDisasters.find(disaster => disaster.id === 'springFlood');
  const floodRiseProgress = activeFlood?.startedDay === state.day
    ? Math.min(1, 0.25 + (state.subTick + o.alpha) / (DAY_CYCLE_SUBTICKS * 0.6))
    : 1;
  for (const flooded of activeSpringFloodTiles(state)) {
    if (!isExplored(state, flooded.x, flooded.y) ||
        !tileRectIntersectsViewport(viewport, flooded.x, flooded.y)) continue;
    drawWaterRiseOverlay(
      ctx, flooded.x, flooded.y, floodRiseProgress, o.animationTimeMs, true,
      floodRiseFrom(state, flooded.x, flooded.y),
    );
  }
  drawRiverFlow(ctx, state, viewport, o.animationTimeMs, activeFlood != null);

  const activeClaimZones = new Map<number, ClaimZone>();
  for (const point of [o.hover, o.selected]) {
    if (!point) continue;
    for (const zone of claimZonesAt(state, point.x, point.y)) {
      if (zone.discovered) activeClaimZones.set(zone.id, zone);
    }
  }
  for (const zone of activeClaimZones.values()) {
    const owner = state.foreignSites.find(site => site.id === zone.siteId);
    drawClaimZone(ctx, zone, owner ? siteColor(owner) : '#aab1b8');
  }
  for (const route of activePassageRoutes(state)) drawPassageRoute(ctx, route);
  const buriedVein = state.silverVein;
  if (buriedVein?.status === 'buried') {
    const buriedTile = state.map[buriedVein.y]?.[buriedVein.x];
    if (buriedTile && isExplored(state, buriedVein.x, buriedVein.y)
      && isBuriedSilverVeinTile(state, buriedTile)
      && tileRectIntersectsViewport(viewport, buriedVein.x, buriedVein.y)) {
      drawBuriedSilverVeinMarker(ctx, buriedVein.x, buriedVein.y);
    }
  }
  lap('1-terrain');

  // 2) 건물 — 지붕이 위 타일에 겹치므로 y 순서로 그린다
  const season = getSeason(state.day);
  const heating = (season === 'autumn' || season === 'winter') && state.resources.firewood > 0;
  for (const stable of state.buildings) {
    if (stable.type !== 'stable' || !stable.built) continue;
    const pasture = normalizePastureArea(stable.pasture);
    if (!pasture || !tileRectIntersectsViewport(viewport, pasture.x, pasture.y, pasture.w, pasture.h)) continue;
    drawPastureGround(ctx, pasture, season === 'winter', o.selectedBuildingId === stable.id);
  }
  // 끝난 전투 자리의 교란 자국 — 건물·주민 아래 바닥 데칼로 깔린다
  for (const scar of state.battleScars ?? []) {
    if (scar.until < state.day) continue;
    if (!isExplored(state, scar.x, scar.y)) continue;
    if (!tileRectIntersectsViewport(viewport, scar.x - 2, scar.y - 2, 5, 5)) continue;
    drawBattleScarDecal(ctx, scar, state.day, season === 'winter');
  }
  const wallTiles = builtWallTileSet(state);
  const flowingCanals = flowingCanalTileSet(state);
  const frostObservationBuildingIds = new Set(
    state.pendingDisasters
      .filter(disaster => disaster.id === 'earlyFrost' || disaster.id === 'lateFrost')
      .flatMap(disaster => disaster.targetBuildingIds ?? []),
  );
  const locustBuildingIds = new Set(
    state.pendingDisasters
      .filter(disaster => disaster.id === 'locust')
      .flatMap(disaster => disaster.targetBuildingIds ?? []),
  );
  const droughtActive = isDroughtActive(state);
  const fireByBuildingId = new Map(
    state.pendingDisasters
      .filter(disaster => disaster.id === 'fire')
      .flatMap(disaster => disaster.fireSites ?? [])
      .map(site => [site.buildingId, site]),
  );
  const sorted = [...state.buildings].sort((a, b) =>
    (a.y + buildingFootprintDims(a).h) - (b.y + buildingFootprintDims(b).h) || a.x - b.x);
  const visibleBuildings: Building[] = [];
  for (const b of sorted) {
    if (!isBuildingFootprintExplored(state, b.type, b.x, b.y, b.w, b.h)) continue;
    const def = BUILDING_DEFS[b.type];
    const dims = buildingFootprintDims(b);
    const topMargin = b.type === 'center' ? 3 : 1;
    if (!tileRectIntersectsViewport(viewport, b.x - 1, b.y - topMargin, dims.w + 2, dims.h + topMargin + 1)) continue;
    visibleBuildings.push(b);
    const footprintWidth = TILE * dims.w;
    const footprintHeight = TILE * dims.h;
    const size = b.type === 'center'
      ? Math.round(footprintWidth * CENTER_VISUAL_SCALE[state.rank])
      : footprintWidth;
    const drawX = b.type === 'center'
      ? b.x * TILE + Math.round((footprintWidth - size) / 2)
      : b.x * TILE;
    const drawY = b.type === 'center'
      ? b.y * TILE + footprintHeight - size
      : b.y * TILE;
    const visuallyBuilt = b.built || b.workOrder?.phase === 'dismantling';
    const visualProgress = b.workOrder?.phase === 'rebuilding'
      ? b.workOrder.progress / Math.max(1, b.workOrder.required)
      : def.buildDays > 0 ? b.progress / def.buildDays : 1;
    if (isPlotBuildingType(b.type)) {
      // 경작지는 발자국 칸마다 스프라이트를 타일링 — 파종을 마친 칸만 작물이 자라 보인다
      const area = dims.w * dims.h;
      const sown = visuallyBuilt ? Math.min(area, Math.max(0, Math.floor(b.sownArea ?? area))) : 0;
      const droughtIrrigated = droughtActive && isFarmIrrigatedByWeir(state, b);
      for (let i = 0; i < area; i++) {
        const cellX = b.x + (i % dims.w);
        const cellY = b.y + Math.floor(i / dims.w);
        const drawParams: BuildingDrawParams = {
          type: b.type, built: visuallyBuilt, ghost: false,
          season,
          highDefinition: renderScale === 2,
          progress01: visualProgress,
          growth01: i < sown ? b.fieldGrowth / 100 : 0,
          x: cellX * TILE, y: cellY * TILE, size: TILE,
        };
        drawBuildingSprite(ctx, sprites, drawParams);
        if (frostObservationBuildingIds.has(b.id)) {
          drawEarlyFrostCropOverlay(ctx, drawParams.x, drawParams.y);
        }
        if (locustBuildingIds.has(b.id)) {
          drawLocustCropOverlay(ctx, drawParams.x, drawParams.y, state.day);
        }
        if (droughtActive) {
          drawDroughtCropOverlay(ctx, drawParams.x, drawParams.y, droughtIrrigated);
        }
        occludedBuildingDraws.push(drawParams);
      }
      if (b.repairing) {
        sprites.drawBuildingDamage(ctx, { season, x: b.x * TILE, y: b.y * TILE, size });
        drawDamageSmoke(ctx, b.x * TILE, b.y * TILE, b.id, dims.w);
      }
      continue;
    }
    if (b.type === 'cemetery') {
      const area = dims.w * dims.h;
      const graves = visuallyBuilt ? Math.min(area * CONFIG.funeral.plotsPerTile, Math.max(0, b.graves ?? 0)) : 0;
      for (let i = 0; i < area; i++) {
        const cellX = b.x + (i % dims.w);
        const cellY = b.y + Math.floor(i / dims.w);
        const drawParams: BuildingDrawParams = {
          type: b.type, built: visuallyBuilt, ghost: false,
          season,
          highDefinition: renderScale === 2,
          progress01: visualProgress,
          graveCount: Math.min(CONFIG.funeral.plotsPerTile, Math.max(0, graves - i * CONFIG.funeral.plotsPerTile)),
          x: cellX * TILE, y: cellY * TILE, size: TILE,
        };
        drawBuildingSprite(ctx, sprites, drawParams);
        occludedBuildingDraws.push(drawParams);
      }
      continue;
    }
    const leveeEdge = b.type === 'levee'
      ? b.leveeEdge ?? preferredLeveeEdgeAt(state, b.x, b.y) ?? undefined
      : undefined;
    const drawParams: BuildingDrawParams = {
      type: b.type, built: visuallyBuilt, ghost: false,
      rank: b.type === 'center' ? state.rank : undefined,
      season,
      highDefinition: renderScale === 2,
      progress01: visualProgress,
      connections: visuallyBuilt && isWallBuilding(b.type)
        ? wallConnectionsFromSet(wallTiles, b.x, b.y)
        : b.type === 'canal' ? canalConnectionsAt(state, b.x, b.y, visuallyBuilt) : undefined,
      canalFlowing: b.type === 'canal' && visuallyBuilt && flowingCanals.has(`${b.x},${b.y}`),
      canalRiverEdges: b.type === 'canal' ? canalRiverEdgesAt(state, b.x, b.y) : undefined,
      waterworksOrientation: b.type === 'weir' || b.type === 'levee'
        ? waterworksOrientationAt(state, b.type, b.x, b.y, leveeEdge)
        : undefined,
      waterworksEdge: leveeEdge,
      tint: waterVisualizationActive
        ? waterLayerTintForBuilding(
            b.type,
            b.built,
            waterSnapshot?.buildings.get(b.id),
            b.type === 'well' ? wellWaterStatus(state, b) : null,
          ) ?? undefined
        : b.type === 'gate' && b.gateWallType === 'earthFort'
          ? { color: '#8b633f', alpha: 0.18 }
          : b.type === 'gate' && b.gateWallType === 'stoneWall'
            ? { color: '#9ca3ad', alpha: 0.22 }
            : undefined,
      x: drawX, y: drawY, size,
    };
    if (b.type === 'canal') {
      // 낮은 도랑은 논밭처럼 바닥층에 둔다. 주민·나무보다 뒤에 깔려야 통행 표현이 자연스럽다.
      drawBuildingSprite(ctx, sprites, drawParams);
      occludedBuildingDraws.push(drawParams);
      continue;
    }
    const activeWorkerCount = presentation.workplaceActiveCountByBuilding.get(b.id) ?? 0;
    // 밤 창불(windowGlow)은 밤 색조 패스에서 따로 그린다 — 여기서는 낮에도 도는 효과만.
    const daytimeWhen = new Set<BuildingEffectWhen>(['always']);
    if (activeWorkerCount > 0) daytimeWhen.add('working');
    if (heating) daytimeWhen.add('winterHeating');
    const leveeSortOffsetX = leveeEdge === 'e' ? 0.5 : leveeEdge === 'w' ? -0.5 : 0;
    const leveeSortOffsetY = leveeEdge === 's' ? 0.5 : leveeEdge === 'n' ? -0.5 : 0;
    enqueueRowDraw(
      (b.y + dims.h + leveeSortOffsetY) * TILE,
      (b.x + dims.w / 2 + leveeSortOffsetX) * TILE,
      () => {
        drawBuildingSprite(ctx, sprites, drawParams);
        occludedBuildingDraws.push(drawParams);
        if (b.breached) {
          ctx.save();
          ctx.fillStyle = 'rgba(48, 38, 31, 0.5)';
          ctx.fillRect(drawX + size * 0.08, drawY + size * 0.58, size * 0.84, size * 0.3);
          ctx.strokeStyle = 'rgba(235, 184, 112, 0.9)';
          ctx.lineWidth = Math.max(1.5, size * 0.055);
          ctx.beginPath();
          ctx.moveTo(drawX + size * 0.24, drawY + size * 0.3);
          ctx.lineTo(drawX + size * 0.75, drawY + size * 0.8);
          ctx.moveTo(drawX + size * 0.75, drawY + size * 0.3);
          ctx.lineTo(drawX + size * 0.24, drawY + size * 0.8);
          ctx.stroke();
          ctx.restore();
        }
        if (b.repairing) {
          sprites.drawBuildingDamage(ctx, { season, x: drawX, y: drawY, size });
          drawDamageSmoke(ctx, drawX, drawY, b.id, size / TILE);
        }
        const fire = fireByBuildingId.get(b.id);
        if (fire) drawBuildingFire(ctx, drawX, drawY, b.id, size, fire.intensity);
        if (b.built) {
          drawBuildingEffects(ctx, b.type, b.id, drawX, drawY, size, {
            active: daytimeWhen, workers: activeWorkerCount, nightAlpha: 0,
          });
        }
      },
    );
  }

  const discoveredSites = state.foreignSites.filter(candidate => candidate.discovered);
  const visibleSites = discoveredSites.filter(site =>
    tileRectIntersectsViewport(viewport, site.x - 1, site.y - 1, site.width + 2, site.height + 2));
  for (const site of visibleSites) {
    for (const prop of foreignSiteProps(state, site)) {
      if (prop.kind === 'field') {
        drawForeignSiteProp(ctx, sprites, prop, site, season, state.day);
      } else {
        enqueueRowDraw((prop.y + 1) * TILE, (prop.x + 0.5) * TILE, () =>
          drawForeignSiteProp(ctx, sprites, prop, site, season, state.day));
      }
    }
  }
  for (const site of visibleSites) {
    const selected = !!o.selected && foreignSiteAt(state, o.selected.x, o.selected.y)?.id === site.id;
    enqueueRowDraw((site.y + site.height) * TILE, (site.x + site.width / 2) * TILE, () =>
      drawForeignSite(ctx, sprites, site, selected, season));
  }
  for (const animal of pastureLivestockDraws(
    state,
    viewport,
    o.animationTimeMs,
    renderScale === 2,
  )) {
    enqueueRowDraw(animal.y, animal.x, () => sprites.drawLivestock(ctx, animal));
  }

  lap('2-buildings');

  // 3) 외부 거점 생활 인구와 개척지 주민도 같은 행 큐에 넣는다.
  const activityTime = (state.day - 1) * CONFIG.agents.subticksPerDay + state.subTick + o.alpha;
  for (const site of visibleSites) {
    for (const actor of foreignSiteActors(state, site, activityTime)) {
      if (!pixelRectIntersectsViewport(viewport, actor.x * TILE - TILE, actor.y * TILE - TILE, TILE * 2, TILE * 2)) continue;
      const drawParams: ResidentDrawParams = {
        job: actor.job,
        gender: actor.gender,
        x: actor.x * TILE,
        y: actor.y * TILE,
        sick: false,
        carrying: actor.carrying,
        showCargoMarker: o.residentCargoMarkers ?? true,
        selected: false,
        moving: actor.moving,
        facing: actor.facing,
        foreignFaction: site.factionName ?? undefined,
      };
      enqueueRowDraw(drawParams.y, drawParams.x, () => {
        sprites.drawResident(ctx, drawParams);
        occludedResidentDraws.push(drawParams);
      });
    }
  }
  // 매장을 기다리는 시신 — 장의사가 운구 중이면 표시하지 않는다
  for (const corpse of state.corpses ?? []) {
    if (corpse.carried || corpse.withExpedition) continue;
    if (!tileRectIntersectsViewport(viewport, corpse.x, corpse.y)) continue;
    const drawParams = {
      x: corpse.x * TILE,
      y: corpse.y * TILE,
      size: TILE,
      highDefinition: renderScale === 2,
    };
    enqueueRowDraw((corpse.y + 1) * TILE, (corpse.x + 0.5) * TILE, () =>
      sprites.drawCorpse(ctx, drawParams));
  }
  for (const resident of localResidentDraws) {
    enqueueRowDraw(resident.y, resident.x, () => {
      sprites.drawResident(ctx, resident);
      occludedResidentDraws.push(resident);
    });
  }

  // 5) 아군 원정부대 — 집결 중에는 개별 주민, 출발 후에는 단일 부대로 표시한다.
  if (state.expedition) {
    const expedition = state.expedition;
    if (expedition.phase === 'muster') {
      enqueueRowDraw(
        (expedition.musterY + 0.5) * TILE,
        (expedition.musterX + 0.5) * TILE,
        () => drawMusterFlag(ctx, expedition.musterX, expedition.musterY),
      );
    } else {
      if (season === 'winter' && expedition.trail.length > 0) drawFootprints(ctx, expedition.trail);
      const members = state.residents.filter(resident => resident.alive && expedition.memberIds.includes(resident.id));
      const drawParams: ExpeditionDrawParams = {
        x: lerp(expedition.px, expedition.x) * TILE + TILE / 2,
        y: lerp(expedition.py, expedition.y) * TILE + TILE / 2,
        members: members.map(member => ({
          job: member.job,
          gender: member.gender,
          militiaWeapon: militiaWeaponForResident(state, member),
          special: member.special,
        })),
        total: members.length,
        moving: expedition.px !== expedition.x || expedition.py !== expedition.y,
        facing: expedition.x < expedition.px ? -1 : 1,
      };
      enqueueRowDraw(drawParams.y, drawParams.x, () => {
        sprites.drawExpedition(ctx, drawParams);
        if (expedition.phase === 'engage') {
          const muskets = weaponCountsForResidents(state, members).readyMuskets > 0;
          drawBattleClash(ctx, expedition.targetX, expedition.targetY, muskets);
        }
      });
    }
  }

  // 6) 습격 무리 (+겨울 눈밭 발자국)
  if (state.raiders) {
    const b = state.raiders;
    if (getSeason(state.day) === 'winter' && b.trail && b.trail.length > 0) {
      drawFootprints(ctx, b.trail);
    }
    const drawParams: RaiderDrawParams = {
      x: lerp(b.px, b.x) * TILE + TILE / 2,
      y: lerp(b.py, b.y) * TILE + TILE / 2,
      count: b.size,
      spotted: b.spotted,
      moving: b.px !== b.x || b.py !== b.y,
      facing: b.x < b.px ? -1 : 1,
      faction: b.faction,
    };
    enqueueRowDraw(drawParams.y, drawParams.x, () => {
      sprites.drawRaiders(ctx, drawParams);
      const battle = state.battle;
      if (battle?.phase === 'muster') drawMusterFlag(ctx, battle.frontX, battle.frontY);
      if (battle?.phase === 'clash') {
        const muskets = armedMusketeers(state) > 0 && state.resources.gunpowder > 0;
        drawBattleClash(ctx, battle.frontX, battle.frontY, muskets);
        // 무리 전력이 붕괴선에 가까워지면 습격자 입자가 도주 방향(마을 반대편)으로 흘러나간다
        const ratio = battle.initialPower > 0 ? b.power / battle.initialPower : 1;
        if (battle.outcome === 'victory' && ratio <= COLLAPSE_RATIO + 0.18) {
          const center = state.buildings.find(candidate => candidate.type === 'center' && candidate.built);
          const dx = battle.frontX - (center?.x ?? battle.frontX);
          const dy = battle.frontY - (center?.y ?? battle.frontY + 2);
          const len = Math.hypot(dx, dy) || 1;
          drawRoutStream(ctx, battle.frontX * TILE + TILE / 2, battle.frontY * TILE + TILE / 2, dx / len, dy / len);
        }
      }
    });
  }

  const dayFrac = visualDayFraction(state, o.alpha);
  drawWorldShadows(ctx, state, viewport, localResidentDraws, dayFrac, sprites, renderScale);

  // 건물·주민·가축·부대·큰 나무/산맥을 하나의 화면 행 기준으로 정렬한다.
  queueTerrainOverlays(
    ctx,
    state,
    sprites,
    viewport,
    renderScale,
    rowRenderQueue,
    subsurfaceLayerActive,
  );
  rowRenderQueue.sort((left, right) =>
    left.sortY - right.sortY || left.sortX - right.sortX || left.serial - right.serial);
  for (const entry of rowRenderQueue) entry.draw();
  drawWatchtowerProjectiles(ctx, state, o.alpha);

  drawWorkerSlotOverlays(ctx, state, visibleBuildings, o.selectedBuildingId, presentation.indoorResidentIds);
  lap('2b-slotOverlays');

  // 선택 주민의 예정 경로 — 행 정렬을 마친 뒤 UI 오버레이로 표시한다.
  if (o.selectedResidentId != null) {
    const sel = state.residents.find(r => r.id === o.selectedResidentId && r.alive);
    if (sel && sel.path.length > 0) {
      ctx.strokeStyle = 'rgba(217,164,65,0.6)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.lineDashOffset = -((performance.now() / 60) % 8);
      ctx.beginPath();
      ctx.moveTo(lerp(sel.px, sel.x) * TILE + TILE / 2, lerp(sel.py, sel.y) * TILE + TILE / 2);
      for (const p of sel.path) ctx.lineTo(p.x * TILE + TILE / 2, p.y * TILE + TILE / 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineDashOffset = 0;
      ctx.lineWidth = 1;
    }
  }

  drawOccludedEntityGhosts(ctx, state, sprites, occludedBuildingDraws, occludedResidentDraws);
  // 사냥터 범위와 표식은 수관보다 위에 그려 항상 식별 가능하게 한다.
  if (hoveredHabitat) drawHabitatRange(ctx, hoveredHabitat);
  for (const habitat of habitats) {
    if (tileRectIntersectsViewport(viewport, habitat.x, habitat.y)) {
      drawHabitatIcon(ctx, habitat, o.habitatIcon);
    }
  }
  lap('6-terrain-overlays');

  lap('3-6-actors');

  // 숲에서 날아오르는 새 — 밤낮 색조에 함께 물들도록 색조 직전에 그린다.
  drawForestBirds(ctx, state, viewport, o.animationTimeMs);

  // 7) 밤낮 색조 — 하루 진행도(subTick+보간)로 계산. 세계를 물들이고 창에는 불이 켜진다.
  // 72서브틱 체제에서는 한낮 = 노동 대역 중앙, 자정 = 밤 대역 중앙으로 정렬한다 (M4 계약).
  // 두 중앙이 정확히 반나절(SUB/2) 떨어져 있어 균등 선형 이동만으로 두 앵커가 동시에 성립한다.
  // 이전 설정을 읽는 개발 빌드에서는 종전 선형 매핑을 유지한다.
  drawDayNight(ctx, state, dayFrac, viewport);
  lap('7-daynight');

  // 7) 선택 표시 (밤에도 잘 보이게 색조 위에). 건물은 클릭 칸이 아니라 전체 점유영역을 감싼다.
  if (o.selected) {
    const selectedBuilding = o.selectedBuildingId == null
      ? undefined
      : state.buildings.find(building => building.id === o.selectedBuildingId);
    const selectionRect = selectedBuilding
      ? { x: selectedBuilding.x, y: selectedBuilding.y, ...buildingFootprintDims(selectedBuilding) }
      : { x: o.selected.x, y: o.selected.y, w: 1, h: 1 };
    ctx.fillStyle = 'rgba(217,164,65,0.10)';
    ctx.fillRect(
      selectionRect.x * TILE + 1,
      selectionRect.y * TILE + 1,
      selectionRect.w * TILE - 2,
      selectionRect.h * TILE - 2,
    );
    ctx.strokeStyle = '#d9a441';
    ctx.lineWidth = 2;
    ctx.strokeRect(
      selectionRect.x * TILE + 1,
      selectionRect.y * TILE + 1,
      selectionRect.w * TILE - 2,
      selectionRect.h * TILE - 2,
    );
    ctx.lineWidth = 1;
  }

  // 8) 날씨 오버레이 (비/눈/눈보라/서리/혹한/해빙 홍수)
  drawWeather(ctx, state.weather, logicalWidth, logicalHeight, viewport);
  lap('8-weather');

  // 9) 미답사 안개 — 지형/자원/건물/서식지를 탐색 전까지 가린다
  drawFogOverlay(ctx, state, viewport);
  lap('9-fog');

  // 활성 토벌 목표는 미답사 안개 위에도 표시해 위치를 잃지 않게 한다.
  for (const marker of activeExpeditionTargetMarkers(state)) drawExpeditionTargetMarker(ctx, marker);

  const selectedMine = o.selectedBuildingId == null
    ? undefined
    : state.buildings.find(building => building.id === o.selectedBuildingId && building.type === 'mine');
  if (selectedMine) drawMineWorkRange(ctx, selectedMine.x, selectedMine.y);
  const selectedGatheringBuilding = o.selectedBuildingId == null
    ? undefined
    : state.buildings.find(building =>
      building.id === o.selectedBuildingId && isGatheringBuildingType(building.type));
  if (selectedGatheringBuilding && isGatheringBuildingType(selectedGatheringBuilding.type)) {
    drawGatheringWorkRange(ctx, selectedGatheringBuilding as typeof selectedGatheringBuilding & { type: GatheringBuildingType });
  }
  const selectedBuilding = o.selectedBuildingId == null
    ? undefined
    : state.buildings.find(building => building.id === o.selectedBuildingId);
  if (selectedBuilding?.type === 'lodgingHut') {
    const worksite = linkedLodgingWorksite(state, selectedBuilding);
    if (worksite) {
      drawLodgingWorksiteRange(ctx, worksite);
      drawLodgingLink(ctx, selectedBuilding, worksite);
    }
  } else if (selectedBuilding) {
    const lodgingHut = lodgingHutForWorksite(state, selectedBuilding.id);
    if (lodgingHut) drawLodgingLink(ctx, lodgingHut, selectedBuilding);
  }
  if (waterVisualizationActive) {
    for (const well of state.buildings) {
      if (well.type !== 'well' ||
          !isBuildingFootprintExplored(state, well.type, well.x, well.y, well.w, well.h)) continue;
      const tint = waterLayerTintForBuilding(
        well.type,
        well.built,
        undefined,
        wellWaterStatus(state, well),
      );
      drawWellSupplyRange(
        ctx,
        well.x,
        well.y,
        selectedWell?.id === well.id,
        tint?.color,
      );
    }
  }

  // 10) 배치 모드: 관련 자원 하이라이트 (사냥막→서식지 범위, 밭→비옥한 땅)
  if (o.placingType) {
    // 사냥막 배치 중엔 모든 서식지 범위를 보여줘 자리를 잡기 쉽게 한다
    if (o.placingType === 'huntLodge') {
      for (const habitat of habitats) drawHabitatRange(ctx, habitat);
    }
    if (o.placingType === 'mine' && o.hover) drawMineWorkRange(ctx, o.hover.x, o.hover.y);
    if (o.hover && isGatheringBuildingType(o.placingType)) {
      drawGatheringWorkRange(ctx, { ...o.hover, type: o.placingType });
    }
    if (o.placingType === 'lodgingHut' && o.hover) {
      const worksite = lodgingHutPlacementTarget(state, o.hover.x, o.hover.y);
      if (worksite) {
        drawLodgingWorksiteRange(ctx, worksite);
        drawLodgingLink(ctx, { ...o.hover, w: 1, h: 1 }, worksite);
      }
    }
    if (o.placingType === 'well') {
      if (o.hover) {
        const previewTint = waterLayerTintForBuilding(
          'well',
          true,
          undefined,
          wellWaterStatusAt(state, o.hover.x, o.hover.y),
        );
        drawWellSupplyRange(
          ctx,
          o.hover.x,
          o.hover.y,
          true,
          previewTint?.color ?? '#76e4ff',
        );
      }
    }
    const want = PLACEMENT_HINT[o.placingType];
    if (want) {
      const pulse = 0.22 + 0.14 * Math.sin(performance.now() / 280);
      ctx.fillStyle = `rgba(255,214,90,${pulse.toFixed(3)})`;
      ctx.strokeStyle = 'rgba(255,214,90,0.8)';
      for (let y = viewport.tileMinY; y <= viewport.tileMaxY; y++) {
        const row = state.map[y];
        if (!row) continue;
        for (let x = viewport.tileMinX; x <= Math.min(viewport.tileMaxX, row.length - 1); x++) {
          if (row[x].terrain !== want || !isExplored(state, x, y)) continue;
          ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
          ctx.strokeRect(x * TILE + 0.5, y * TILE + 0.5, TILE - 1, TILE - 1);
        }
      }
    }
  }

  // 11) 건설 배치 미리보기 — 날씨 위에 얹어 잘 보이게
  if (o.relocationPlacement) {
    const { buildingId, rect } = o.relocationPlacement;
    const building = state.buildings.find(candidate => candidate.id === buildingId);
    const valid = !!building &&
      canRelocateBuildingAt(state, building, rect.x, rect.y) &&
      Array.from({ length: rect.h }, (_, dy) =>
        Array.from({ length: rect.w }, (_unused, dx) => {
          const x = rect.x + dx;
          const y = rect.y + dy;
          return isExplored(state, x, y) && !foreignSiteAt(state, x, y);
        })).flat().every(Boolean);
    // 새 자리에 나무가 있으면 "옮길 수는 있으나 먼저 개간해야 한다"로 칠한다
    const needsClearing = valid && !!building &&
      forestTilesInFootprint(state, building.type, rect.x, rect.y, rect.w, rect.h).length > 0;
    ctx.fillStyle = needsClearing
      ? 'rgba(224,164,92,0.45)'
      : valid ? 'rgba(111,191,115,0.42)' : 'rgba(224,108,92,0.45)';
    ctx.fillRect(rect.x * TILE, rect.y * TILE, rect.w * TILE, rect.h * TILE);
    if (building) {
      if (isAreaBuildingType(building.type)) {
        for (let dy = 0; dy < rect.h; dy++) {
          for (let dx = 0; dx < rect.w; dx++) {
            drawBuildingSprite(ctx, sprites, {
              type: building.type, built: true, ghost: true, progress01: 1,
              season, highDefinition: renderScale === 2,
              x: (rect.x + dx) * TILE, y: (rect.y + dy) * TILE, size: TILE,
            });
          }
        }
      } else {
        drawBuildingSprite(ctx, sprites, {
          type: building.type, built: true, ghost: true, progress01: 1,
          season, highDefinition: renderScale === 2,
          x: rect.x * TILE, y: rect.y * TILE,
          size: TILE * buildingFootprintSize(building.type),
        });
      }
    }
    ctx.strokeStyle = valid ? 'rgba(255,214,90,0.95)' : 'rgba(245,145,125,0.95)';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 3]);
    ctx.strokeRect(rect.x * TILE + 1, rect.y * TILE + 1, rect.w * TILE - 2, rect.h * TILE - 2);
    ctx.setLineDash([]);
    ctx.lineWidth = 1;
  }
  if (o.pasturePlacement) {
    const { stableId, rect } = o.pasturePlacement;
    const valid = validateStablePasture(state, stableId, rect) == null;
    ctx.fillStyle = valid ? 'rgba(111,191,115,0.38)' : 'rgba(224,108,92,0.42)';
    ctx.fillRect(rect.x * TILE, rect.y * TILE, rect.w * TILE, rect.h * TILE);
    ctx.strokeStyle = valid ? 'rgba(255,214,90,0.95)' : 'rgba(245,145,125,0.95)';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 3]);
    ctx.strokeRect(rect.x * TILE + 1, rect.y * TILE + 1, rect.w * TILE - 2, rect.h * TILE - 2);
    ctx.setLineDash([]);
    ctx.lineWidth = 1;
  }
  if (o.areaExpansion) {
    const { buildingId, type, rect } = o.areaExpansion;
    const def = BUILDING_DEFS[type];
    const rectTiles = Array.from({ length: rect.h }, (_, dy) =>
      Array.from({ length: rect.w }, (__, dx) => state.map[rect.y + dy]?.[rect.x + dx]),
    ).flat().filter(tile => tile != null);
    const paddyAreaValid = type !== 'paddy' ||
      (rectTiles.length === rect.w * rect.h && isPaddyFootprintEligible(state, rectTiles));
    for (let dy = 0; dy < rect.h; dy++) {
      for (let dx = 0; dx < rect.w; dx++) {
        const tx = rect.x + dx;
        const ty = rect.y + dy;
        const tile = state.map[ty]?.[tx];
        const ownTile = tile?.buildingId === buildingId;
        const ok = paddyAreaValid && !!tile && isExplored(state, tx, ty) &&
          (ownTile || (canPlaceOn(def, tile, state) && !foreignSiteAt(state, tx, ty)));
        // 벨 나무가 선 칸은 "지을 수는 있으나 먼저 개간해야 하는 칸"으로 따로 칠한다
        const needsClearing = ok && !ownTile && acceptsClearedLand(def) && tile!.terrain === 'forest';
        ctx.fillStyle = ownTile
          ? 'rgba(255,214,90,0.2)'
          : needsClearing ? 'rgba(224,164,92,0.45)'
            : ok ? 'rgba(111,191,115,0.45)' : 'rgba(224,108,92,0.45)';
        ctx.fillRect(tx * TILE, ty * TILE, TILE, TILE);
        if (!ownTile) {
          drawBuildingSprite(ctx, sprites, {
            type, built: true, ghost: true, progress01: 1,
            season, highDefinition: renderScale === 2,
            x: tx * TILE, y: ty * TILE, size: TILE,
          });
        }
      }
    }
    ctx.strokeStyle = paddyAreaValid ? 'rgba(255,214,90,0.95)' : 'rgba(245,145,125,0.95)';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 3]);
    ctx.strokeRect(rect.x * TILE + 1, rect.y * TILE + 1, rect.w * TILE - 2, rect.h * TILE - 2);
    ctx.setLineDash([]);
    ctx.lineWidth = 1;
  } else if (o.placingType && isSolidWallBuilding(o.placingType) && o.placingRect) {
    const type = o.placingType;
    const rect = o.placingRect;
    const segmentCount = rect.w * rect.h;
    const totalCost = Object.fromEntries(Object.entries(BUILDING_DEFS[type].cost)
      .map(([resource, amount]) => [resource, (amount ?? 0) * segmentCount]));
    const affordable = canAffordCost(state, totalCost);
    const previewWallTiles = builtWallTileSet(state);
    for (let dy = 0; dy < rect.h; dy++) {
      for (let dx = 0; dx < rect.w; dx++) previewWallTiles.add(wallTileKey(rect.x + dx, rect.y + dy));
    }
    const valid = affordable && Array.from({ length: rect.h }, (_, dy) =>
      Array.from({ length: rect.w }, (__, dx) => ({ x: rect.x + dx, y: rect.y + dy })),
    ).flat().every(({ x, y }) => isExplored(state, x, y) && !foreignSiteAt(state, x, y) &&
      canPlaceBuildingAt(state, type, x, y));
    for (let dy = 0; dy < rect.h; dy++) {
      for (let dx = 0; dx < rect.w; dx++) {
        const tx = rect.x + dx;
        const ty = rect.y + dy;
        const tileValid = affordable && isExplored(state, tx, ty) && !foreignSiteAt(state, tx, ty) &&
          canPlaceBuildingAt(state, type, tx, ty);
        const needsClearing = tileValid && state.map[ty]?.[tx]?.terrain === 'forest';
        ctx.fillStyle = needsClearing
          ? 'rgba(224,164,92,0.45)'
          : tileValid ? 'rgba(111,191,115,0.45)' : 'rgba(224,108,92,0.45)';
        ctx.fillRect(tx * TILE, ty * TILE, TILE, TILE);
        drawBuildingSprite(ctx, sprites, {
          type, built: true, ghost: true, progress01: 1,
          season, highDefinition: renderScale === 2,
          connections: wallConnectionsFromSet(previewWallTiles, tx, ty),
          x: tx * TILE, y: ty * TILE, size: TILE,
        });
      }
    }
    ctx.strokeStyle = valid ? 'rgba(255,214,90,0.9)' : 'rgba(245,145,125,0.95)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(rect.x * TILE + 0.75, rect.y * TILE + 0.75, rect.w * TILE - 1.5, rect.h * TILE - 1.5);
    ctx.lineWidth = 1;
  } else if (o.placingType && isAreaBuildingType(o.placingType) && o.placingRect) {
    // 경작지·묘역: 드래그 사각형을 칸별 유효/무효로 칠한다
    const def = BUILDING_DEFS[o.placingType];
    const rect = o.placingRect;
    const affordable = canAffordCost(state, buildingCostFor(o.placingType, rect.w, rect.h));
    const rectTiles = Array.from({ length: rect.h }, (_, dy) =>
      Array.from({ length: rect.w }, (__, dx) => state.map[rect.y + dy]?.[rect.x + dx]),
    ).flat().filter(tile => tile != null);
    const paddyAreaValid = o.placingType !== 'paddy' ||
      (rectTiles.length === rect.w * rect.h && isPaddyFootprintEligible(state, rectTiles));
    for (let dy = 0; dy < rect.h; dy++) {
      for (let dx = 0; dx < rect.w; dx++) {
        const tx = rect.x + dx;
        const ty = rect.y + dy;
        const tile = state.map[ty]?.[tx];
        const ok = affordable && paddyAreaValid && !!tile && isExplored(state, tx, ty) &&
          canPlaceOn(def, tile, state) && !foreignSiteAt(state, tx, ty);
        const needsClearing = ok && acceptsClearedLand(def) && tile!.terrain === 'forest';
        ctx.fillStyle = needsClearing
          ? 'rgba(224,164,92,0.45)'
          : ok ? 'rgba(111,191,115,0.45)' : 'rgba(224,108,92,0.45)';
        ctx.fillRect(tx * TILE, ty * TILE, TILE, TILE);
        drawBuildingSprite(ctx, sprites, {
          type: o.placingType, built: true, ghost: true, progress01: 1,
          season, highDefinition: renderScale === 2,
          x: tx * TILE, y: ty * TILE, size: TILE,
        });
      }
    }
    ctx.strokeStyle = paddyAreaValid ? 'rgba(255,214,90,0.9)' : 'rgba(245,145,125,0.95)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(rect.x * TILE + 0.75, rect.y * TILE + 0.75, rect.w * TILE - 1.5, rect.h * TILE - 1.5);
    ctx.lineWidth = 1;
  } else if (o.placingType === 'gate' && o.hover) {
    const buildingId = state.map[o.hover.y]?.[o.hover.x]?.buildingId;
    const wall = buildingId == null ? null : state.buildings.find(building => building.id === buildingId) ?? null;
    const valid = !!wall && isSolidWallBuilding(wall.type) && wall.built && !wall.repairing &&
      !wall.workOrder && !wall.expansion && !wall.gateConversion &&
      !(wall as typeof wall & { breached?: boolean }).breached &&
      canAffordCost(state, GATE_CONVERSION_COSTS[wall.type]);
    ctx.fillStyle = valid ? 'rgba(111,191,115,0.45)' : 'rgba(224,108,92,0.45)';
    ctx.fillRect(o.hover.x * TILE, o.hover.y * TILE, TILE, TILE);
    drawBuildingSprite(ctx, sprites, {
      type: 'gate', built: true, ghost: true, progress01: 1,
      season, highDefinition: renderScale === 2,
      connections: wallConnectionsFromSet(builtWallTileSet(state), o.hover.x, o.hover.y),
      x: o.hover.x * TILE, y: o.hover.y * TILE, size: TILE,
    });
  } else if (o.placingType && o.hover) {
    const def = BUILDING_DEFS[o.placingType];
    const footprint = buildingFootprintSize(o.placingType);
    const size = TILE * footprint;
    const overlapsForeignSite = Array.from({ length: footprint }, (_, dy) =>
      Array.from({ length: footprint }, (_unused, dx) => foreignSiteAt(state, o.hover!.x + dx, o.hover!.y + dy)))
      .flat()
      .some(site => site != null);
    const ok = isBuildingFootprintExplored(state, o.placingType, o.hover.x, o.hover.y) &&
      canPlaceBuildingAt(state, o.placingType, o.hover.x, o.hover.y) &&
      canAfford(state, def) && !overlapsForeignSite;
    const needsClearing = ok &&
      forestTilesInFootprint(state, o.placingType, o.hover.x, o.hover.y).length > 0;
    ctx.fillStyle = needsClearing
      ? 'rgba(224,164,92,0.45)'
      : ok ? 'rgba(111,191,115,0.45)' : 'rgba(224,108,92,0.45)';
    ctx.fillRect(o.hover.x * TILE, o.hover.y * TILE, size, size);
    drawBuildingSprite(ctx, sprites, {
      type: o.placingType, built: true, ghost: true, progress01: 1,
      season, highDefinition: renderScale === 2,
      tint: o.placingType === 'well'
        ? waterLayerTintForBuilding(
            'well',
            true,
            undefined,
            wellWaterStatusAt(state, o.hover.x, o.hover.y),
          ) ?? undefined
        : showAquiferLayer
          ? waterLayerTintForBuilding(
              o.placingType,
              true,
              waterSnapshot?.buildings.get(PREVIEW_WATER_BUILDING_ID),
              null,
            ) ?? undefined
          : undefined,
      waterworksOrientation: o.placingType === 'weir' || o.placingType === 'levee'
        ? waterworksOrientationAt(state, o.placingType, o.hover.x, o.hover.y, o.leveePlacementEdge ?? undefined)
        : undefined,
      connections: o.placingType === 'canal'
        ? canalConnectionsAt(state, o.hover.x, o.hover.y)
        : undefined,
      canalFlowing: o.placingType === 'canal' && wouldCanalFlowAt(state, o.hover.x, o.hover.y),
      canalRiverEdges: o.placingType === 'canal'
        ? canalRiverEdgesAt(state, o.hover.x, o.hover.y)
        : undefined,
      waterworksEdge: o.placingType === 'levee'
        ? o.leveePlacementEdge ?? undefined
        : undefined,
      x: o.hover.x * TILE, y: o.hover.y * TILE, size,
    });
  }
  lap('10-11-overlay');
  ctx.restore();
}

// ── 밤낮 사이클 ──
// dayFrac 0=새벽, 0.25=한낮, 0.5=해질녘, 0.75=한밤중. 시간 흐름은 config.time.msPerDay가 정한다.
// 계절별 낮 길이 — 순수 시각 계층. 에이전트 대역·생산 수치에는 영향을 주지 않는다
// (겨울 생산 페널티는 날씨 시스템 소관 — 이중 페널티 금지). 낮은 0.25, 자정은 0.75에 고정되고
// 여명·황혼 시각만 계절에 따라 이동한다.
const SEASON_DAYLIGHT_FRAC: Readonly<Record<Season, number>> = {
  spring: 0.5, summer: 0.58, autumn: 0.5, winter: 0.42,
};

function visualDayFraction(state: GameState, alpha: number): number {
  const subticks: number = CONFIG.agents.subticksPerDay;
  const subU = (state.subTick + alpha) % subticks;
  const workCenter = (DAY_BANDS.work.start + DAY_BANDS.work.end + 1) / 2;
  return subticks === DAY_CYCLE_SUBTICKS
    ? ((subU - workCenter + 0.25 * subticks + subticks) % subticks) / subticks
    : subU / subticks;
}

// 연중 태양 기세 — 하지(여름 중앙)에 1, 동지에 0인 날짜 기반 연속 코사인.
// 그림자 길이(태양 고도)와 황혼 색조가 공유한다.
function annualSunFactor01(day: number): number {
  return (1 + Math.cos(Math.PI * 2 * (getDayOfYear(day) - CONFIG.time.seasonDays * 1.5) / CONFIG.time.yearDays)) / 2;
}

export interface DayShadow {
  ux: number; // 높이 1px가 만드는 화면 가로 오프셋 (부호 = 해 반대 방향)
  uy: number; // 높이 1px가 만드는 화면 세로(아래) 오프셋 — 3/4 시점이라 항상 살짝 앞으로 깔린다
  angle: number;
  alpha: number;
}

export function dayShadowFor(state: Pick<GameState, 'day' | 'weather'>, dayFrac: number): DayShadow | null {
  const daylight = SEASON_DAYLIGHT_FRAC[getSeason(state.day)];
  const dawnT = 0.25 - daylight / 2;
  const duskT = 0.25 + daylight / 2;
  if (dayFrac < dawnT || dayFrac >= duskT) return null;
  // 방향과 길이를 32단계로 고정해 미세한 떨림과 불필요한 매 프레임 변화를 줄인다.
  const progress = Math.round((dayFrac - dawnT) / daylight * 32) / 32;
  const diurnal = Math.max(0, Math.sin(Math.PI * progress));
  // 태양 고도의 연중 변화 — 겨울로 갈수록 그림자가 서서히 길어지고 계절 경계에서 튀지 않는다.
  const altitude = diurnal * (0.6 + 0.4 * annualSunFactor01(state.day));
  // 전단 계수: 모든 피사체가 자기 높이에 이 값을 곱한 만큼 같은 각도로 눕는다.
  // 정오에는 발밑에 고이고 해가 낮을수록(아침·저녁, 그리고 겨울) 길게 눕는다.
  const ux = (progress * 2 - 1) * (0.22 + Math.pow(1 - altitude, 1.5) * 1.5);
  const uy = 0.1 + diurnal * 0.08;
  const weatherMultiplier =
    state.weather === 'clear' || state.weather === 'coldSnap' ? 1
      : state.weather === 'frost' ? 0.78
        : state.weather === 'rain' || state.weather === 'thawFlood' ? 0.48
          : 0.34;
  const alpha = (0.1 + Math.sqrt(altitude) * 0.16) * weatherMultiplier;
  if (alpha < 0.04) return null;
  return { ux, uy, angle: Math.atan2(uy, ux), alpha };
}

// 그림자 합성 레이어 — 모든 그림자를 불투명하게 모아 마지막에 한 번만 옅게 얹는다.
// 나무·건물·주민 그림자가 겹쳐도 이중으로 어두워지는 얼룩이 생기지 않는다.
let shadowLayer: HTMLCanvasElement | null = null;

// 건물 그림자 실루엣 캐시 — 스프라이트를 오프스크린에 그려 알파만 남기고 검게 굽는다.
// 키당 한 번만 생성하므로 이후에는 건물당 drawImage 두 번이 전부다.
// baseRow: 실루엣의 실제 시각적 밑변(마지막 불투명 행). 봉수대처럼 스프라이트가
// 풋프린트 밑변까지 닿지 않는 건물은 이 줄에 그림자를 붙여야 잘려 보이지 않는다.
export interface BuildingShadowSilhouette {
  canvas: HTMLCanvasElement;
  baseRow: number;
  visualHeight: number;
}

/** 태양 물리에서 나오는 전단·눌림 — 건물 전부가 공유한다 (건물별 lengthScale은 이 위에 곱한다). */
export function worldShadowShear(shadow: DayShadow): { shearX: number; flattenY: number } {
  const shearX = shadow.ux * 0.6;
  return { shearX, flattenY: Math.min(0.42, 0.16 + Math.abs(shearX) * 0.3) };
}

const buildingShadowSilhouettes = new Map<string, BuildingShadowSilhouette>();

// 건물별 그림자 보정은 스프라이트 스튜디오 레지스트리(buildingShadowSettings)가 갖는다.
// 마당형 건물 — 스프라이트 앞쪽이 마당(지면)이고 본채는 뒤에 서 있는 유형.
// groundFrac: 실루엣 시각 높이 중 아래쪽 마당 비율(그림자 투영에서 제외).
// anchorDepthFrac: 풋프린트 밑변에서 뒤로 물러날 깊이 비율(본채 접지선).
// 나무·주민 그림자와 태양 물리(dayShadowFor)는 전역 시스템이라 여기서 다루지 않는다.

export function buildingShadowSilhouette(
  sprites: SpriteAPI,
  state: Pick<GameState, 'rank'>,
  building: Pick<Building, 'type' | 'x' | 'y'>,
  dims: { w: number; h: number },
  season: Season,
  highDefinition: boolean,
  wallTiles: ReadonlySet<string>,
): BuildingShadowSilhouette | null {
  const size = dims.w * TILE;
  const connections = isWallBuilding(building.type)
    ? wallConnectionsFromSet(wallTiles, building.x, building.y)
    : undefined;
  const rank = building.type === 'center' ? state.rank : undefined;
  const key = [
    sprites.id, building.type, season, size, rank ?? '', highDefinition ? 1 : 0,
    connections ? `${+connections.n}${+connections.e}${+connections.s}${+connections.w}` : '',
  ].join('|');
  const cached = buildingShadowSilhouettes.get(key);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size * 2;
  const silCtx = canvas.getContext('2d');
  if (!silCtx) return null;
  sprites.drawBuilding(silCtx, {
    type: building.type, rank, built: true, progress01: 1, ghost: false,
    season, highDefinition, connections,
    x: 0, y: size, size,
  });
  silCtx.globalCompositeOperation = 'source-in';
  silCtx.fillStyle = '#161b21';
  silCtx.fillRect(0, 0, canvas.width, canvas.height);
  // 알파에서 시각적 밑변·꼭대기를 찾는다. 은은한 스프라이트 내장 그림자는 무시한다.
  // 시트가 아직 로드 전이면 빈 캔버스가 나온다 — 캐시하지 않고 다음 프레임에 다시 시도한다.
  const probe = silCtx.getImageData(0, 0, canvas.width, canvas.height).data;
  let topRow = -1;
  let baseRow = -1;
  for (let y = 0; y < canvas.height; y++) {
    let rowHasPixel = false;
    for (let x = 0; x < canvas.width; x++) {
      if (probe[(y * canvas.width + x) * 4 + 3] > 32) { rowHasPixel = true; break; }
    }
    if (rowHasPixel) {
      if (topRow < 0) topRow = y;
      baseRow = y;
    }
  }
  if (baseRow < 0) return null;
  const entry: BuildingShadowSilhouette = { canvas, baseRow, visualHeight: baseRow - topRow + 1 };
  buildingShadowSilhouettes.set(key, entry);
  return entry;
}

/** 눕힌 실루엣이 어디에 얹혔는지 — 스튜디오가 잘린 영역과 접지선을 겹쳐 그리는 데 쓴다. */
export interface BuildingShadowPlacement {
  /** 투영에 실제로 쓰인 실루엣 마지막 행 (마당형은 마당만큼 위로 잘린다) */
  baseRowUsed: number;
  /** 앞쪽 스탬프의 접지선 y */
  frontAnchor: number;
  /** 뒤쪽 스탬프가 물러나는 거리 */
  backOffset: number;
}

/**
 * 구운 실루엣을 지면에 눕힌다. 접지선 기준으로 한 번, 그보다 뒤쪽 기준으로 한 번 찍어
 * 뒤쪽 사본이 옆벽을 절반 높이까지 감싸며 상자 부피감을 만든다.
 * 게임과 스프라이트 스튜디오가 같은 투영을 쓰도록 여기 한 곳에 둔다.
 */
export function drawBuildingShadowSilhouette(
  layer: CanvasRenderingContext2D,
  sil: BuildingShadowSilhouette,
  settings: BuildingShadowSettings,
  baseX: number,
  footprintBottom: number,
  footprintDepth: number,
  shearX: number,
  flattenY: number,
): BuildingShadowPlacement {
  // 그림자는 풋프린트 밑변이 아니라 스프라이트의 시각적 밑변에 붙인다.
  // 봉수대처럼 스프라이트가 풋프린트 아래까지 닿지 않는 건물도 잘려 보이지 않는다.
  // 접지선에 딱 붙이지 않고 접지면 절반쯤 안쪽(위)으로 물러나 시작해야
  // 그림자가 건물 밑에서 흘러나오듯 이어진다. 물러남은 반 칸을 넘지 않는다.
  // 마당형 건물은 마당 부분을 잘라내고 본채 접지선(깊이 비율)에 붙인다.
  const courtyard = settings.mode === 'courtyard' ? settings : null;
  const bottomGap = sil.canvas.height - 1 - sil.baseRow;
  const lift = Math.min(TILE * 0.5, sil.visualHeight * 0.16);
  const baseRowUsed = courtyard
    ? sil.baseRow - Math.round(sil.visualHeight * courtyard.groundFrac)
    : sil.baseRow;
  const frontAnchor = courtyard
    ? footprintBottom - 1 - footprintDepth * courtyard.anchorDepthFrac
    : footprintBottom - 1 - bottomGap - lift;
  const backOffset = footprintDepth * (courtyard ? 0.2 : 0.5);
  for (const anchor of [frontAnchor, frontAnchor - backOffset]) {
    layer.save();
    layer.transform(1, 0, -shearX, -flattenY, baseX + shearX * baseRowUsed, anchor + flattenY * baseRowUsed);
    layer.drawImage(sil.canvas, 0, 0, sil.canvas.width, baseRowUsed + 1, 0, 0, sil.canvas.width, baseRowUsed + 1);
    layer.restore();
  }
  return { baseRowUsed, frontAnchor, backOffset };
}

function drawWorldShadows(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  viewport: SceneViewport,
  residents: readonly ResidentDrawParams[],
  dayFrac: number,
  sprites: SpriteAPI,
  renderScale: 1 | 2,
): void {
  const shadow = dayShadowFor(state, dayFrac);
  if (!shadow) return;
  const layerW = Math.max(1, Math.ceil(viewport.pixelWidth));
  const layerH = Math.max(1, Math.ceil(viewport.pixelHeight));
  if (!shadowLayer) shadowLayer = document.createElement('canvas');
  if (shadowLayer.width < layerW || shadowLayer.height < layerH) {
    shadowLayer.width = layerW;
    shadowLayer.height = layerH;
  }
  const layer = shadowLayer.getContext('2d');
  if (!layer) return;
  layer.setTransform(1, 0, 0, 1, 0, 0);
  layer.clearRect(0, 0, shadowLayer.width, shadowLayer.height);
  layer.translate(-viewport.pixelX, -viewport.pixelY);
  layer.fillStyle = '#161b21';

  // 건물 — 스프라이트 알파를 구운 실루엣을 밑변 기준으로 눕혀 지면에 투영한다.
  // 밭·논·묘역은 바닥 시설이라 제외하고, 공사 중인 건물은 아직 벽이 없으니 건너뛴다.
  // 오블리크 스프라이트는 세로축에 깊이와 높이가 섞여 있어 전단을 0.6배로 보정한다.
  const season = getSeason(state.day);
  const wallTiles = builtWallTileSet(state);
  // 세로 눌림은 uy(접지 오프셋)와 분리해 실루엣이 덩어리로 보일 만큼 남긴다.
  // 해가 낮을수록 그림자가 앞으로도 더 뻗는다.
  const { shearX, flattenY } = worldShadowShear(shadow);
  for (const building of state.buildings) {
    if (!building.built || isAreaBuildingType(building.type)) continue;
    const shadowSettings = buildingShadowSettings(building.type);
    if (shadowSettings.mode === 'none') continue;
    const dims = buildingFootprintDims(building);
    const sil = buildingShadowSilhouette(sprites, state, building, dims, season, renderScale === 2, wallTiles);
    if (!sil) continue;
    // 길이 배율은 이 건물의 전단에만 먹는다 — 도달 범위 계산과 변환이 같은 값을 쓴다.
    const buildingShearX = shearX * shadowSettings.lengthScale;
    const reachTiles = Math.ceil((Math.abs(buildingShearX) * sil.visualHeight + 6) / TILE);
    if (!tileRectIntersectsViewport(
      viewport,
      building.x - reachTiles, building.y - 1,
      dims.w + reachTiles * 2, dims.h + 3,
    )) continue;
    drawBuildingShadowSilhouette(
      layer,
      sil,
      shadowSettings,
      building.x * TILE,
      (building.y + dims.h) * TILE,
      dims.h * TILE,
      buildingShearX,
      flattenY,
    );
  }

  // 나무 — 실제 수관 비례(treeCanopiesIntersectingRect와 같은 치수)를 지면에 투영한다.
  const minX = Math.max(0, viewport.tileMinX - 5);
  const maxX = Math.min((state.map[0]?.length ?? 0) - 1, viewport.tileMaxX + 5);
  const minY = Math.max(0, viewport.tileMinY - 3);
  const maxY = Math.min(state.map.length - 1, viewport.tileMaxY + 2);
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= Math.min(maxX, state.map[y].length - 1); x++) {
      const stage = treeStageFor(state.map[y][x]);
      if (stage !== 'young' && stage !== 'mature') continue;
      const mature = stage === 'mature';
      const canopyHeight = mature ? 41.5 : 27;
      const canopyRx = mature ? 29 : 17;
      const trunkHalf = mature ? 3.5 : 2.5;
      const footX = x * TILE + TILE / 2;
      const footY = (y + 1) * TILE - 2;
      const cx = footX + shadow.ux * canopyHeight;
      const cy = footY + shadow.uy * canopyHeight;
      // 줄기 — 발치에서 수관 그림자 중심까지 가늘어지며 이어진다.
      layer.beginPath();
      layer.moveTo(footX - trunkHalf, footY);
      layer.lineTo(footX + trunkHalf, footY);
      layer.lineTo(cx + trunkHalf * 0.6, cy);
      layer.lineTo(cx - trunkHalf * 0.6, cy);
      layer.closePath();
      layer.fill();
      // 수관 — 회전 없는 가로 타원. 태양 방위는 중심 이동과 가로 반지름으로만 표현해,
      // 정오에 ux 부호가 바뀌어도 타원이 빙글 돌지 않는다.
      const rx = canopyRx * (0.92 + Math.abs(shadow.ux) * 0.4);
      const ry = canopyRx * 0.36;
      layer.beginPath();
      layer.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      layer.fill();
      // 보조 타원 — 줄기 쪽으로 되돌아오며 윤곽을 흩뜨린다 (타일 좌표 기반 결정적 지터).
      const drift = ((x * 31 + y * 17) % 7 - 3) * 0.9;
      layer.beginPath();
      layer.ellipse(
        footX + shadow.ux * canopyHeight * 0.55 + drift,
        footY + shadow.uy * canopyHeight * 0.55,
        rx * 0.62,
        ry * 0.72,
        0,
        0,
        Math.PI * 2,
      );
      layer.fill();
    }
  }

  // 주민 — 발끝에서 뻗는 캡슐 + 발밑 접지 타원.
  // 스프라이트 발끝은 sizeScale과 무관하게 y + TILE/2에 고정이므로 발 위치에 scale을 곱하지 않는다.
  for (const resident of residents) {
    const scale = resident.sizeScale ?? 1;
    const footX = resident.x;
    const footY = resident.y + TILE / 2 - 1.5;
    const heightPx = TILE * 0.78 * scale;
    const endX = footX + shadow.ux * heightPx;
    const endY = footY + shadow.uy * heightPx;
    const along = Math.max(2.6 * scale, Math.hypot(endX - footX, endY - footY) / 2 + 1.2);
    layer.beginPath();
    layer.ellipse(
      (footX + endX) / 2,
      (footY + endY) / 2,
      along,
      Math.max(1.6, 2.6 * scale),
      shadow.angle,
      0,
      Math.PI * 2,
    );
    layer.fill();
    layer.beginPath();
    layer.ellipse(footX, footY + 0.8, 3.4 * scale + 0.6, 1.9 * scale + 0.4, 0, 0, Math.PI * 2);
    layer.fill();
  }

  ctx.save();
  ctx.globalAlpha = shadow.alpha;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(shadowLayer, 0, 0, layerW, layerH, viewport.pixelX, viewport.pixelY, layerW, layerH);
  ctx.restore();
}

/**
 * 검푸른 밤 — 멀티플라이로 따뜻한 색을 눌러 식히고, 스크린으로 남빛 바닥광을 깔아
 * 어두운 부분까지 푸르게 만든다. 단순 알파 덮기보다 대비가 살아 훨씬 밤답다.
 * 창불빛을 밤 배경 위에서 판단해야 하므로 스프라이트 스튜디오도 이 함수를 쓴다.
 */
export function drawNightTint(ctx: CanvasRenderingContext2D, night: number, fill: () => void): void {
  if (night <= 0.002) return;
  const mix = (from: number, to: number) => Math.round(from + (to - from) * night);
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = `rgb(${mix(255, 52)},${mix(255, 74)},${mix(255, 148)})`;
  fill();
  ctx.globalCompositeOperation = 'screen';
  ctx.fillStyle = `rgba(24,42,108,${(night * 0.5).toFixed(3)})`;
  fill();
  ctx.restore();
}

/** 해의 세기 — 낮은 양수(정오 1), 밤은 음수(자정 −1). 계절마다 낮 길이가 다르다. */
export function sunFactorFor(state: Pick<GameState, 'day'>, dayFrac: number): number {
  const daylight = SEASON_DAYLIGHT_FRAC[getSeason(state.day)];
  const dawnT = 0.25 - daylight / 2;
  const duskT = 0.25 + daylight / 2;
  return dayFrac >= dawnT && dayFrac < duskT
    ? Math.sin(Math.PI * ((dayFrac - dawnT) / daylight))          // 낮 구간: 0→1→0
    : -Math.sin(Math.PI * ((dayFrac - duskT + 1) % 1) / (1 - daylight)); // 밤 구간: 0→-1→0
}

/** 밤의 깊이 (낮 0, 자정 1). */
export function nightFactorFor(state: Pick<GameState, 'day'>, dayFrac: number): number {
  return Math.max(0, -sunFactorFor(state, dayFrac));
}

function drawDayNight(ctx: CanvasRenderingContext2D, state: GameState, dayFrac: number, viewport: SceneViewport): void {
  const sun = sunFactorFor(state, dayFrac);
  const night = Math.max(0, -sun);             // 낮엔 0, 자정에 1

  const fillViewport = () => ctx.fillRect(viewport.pixelX, viewport.pixelY, viewport.pixelWidth, viewport.pixelHeight);
  drawNightTint(ctx, night, fillViewport);
  // 여명/황혼의 따뜻한 빛 (해가 지평선 근처일 때만) — 멀티플라이 틴트라
  // 눈밭도 분홍으로 뜨지 않고 불그스름하게 물든다.
  const twilight = Math.max(0, 1 - Math.abs(sun) * 3.5);
  if (twilight > 0.002) {
    const dusk = dayFrac > 0.25 && dayFrac < 0.75; // 해질녘은 붉게, 새벽은 노랗게
    // 동지에 가까울수록 석양이 더 붉고 짙어진다 (겨울 낮은 해의 긴 대기 산란).
    const winterness = 1 - annualSunFactor01(state.day);
    const col = dusk
      ? `235,${Math.round(150 - winterness * 45)},${Math.round(120 - winterness * 50)}`
      : '255,215,170';
    const strength = twilight * (dusk ? 0.4 + winterness * 0.15 : 0.3);
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = `rgba(${col},${strength.toFixed(3)})`;
    fillViewport();
    ctx.restore();
  }
  // 밤이 깊어지면 집·군영·중심지 창에 불이 켜진다 (어느 건물인지는 레지스트리가 정한다)
  if (night > 0.28) {
    const a = Math.min(1, (night - 0.28) / 0.5);
    const nightWhen = NIGHT_EFFECT_PASS;
    const lit = typesWithNightEffect();
    for (const b of state.buildings) {
      if (!b.built || !lit.has(b.type)) continue;
      const dims = buildingFootprintDims(b);
      if (!tileRectIntersectsViewport(viewport, b.x, b.y, dims.w, dims.h)) continue;
      // 이 패스는 중심지도 발자국 폭을 쓴다 — 등급 시각 배율은 건물 패스 쪽 이야기다.
      drawBuildingEffects(ctx, b.type, b.id, b.x * TILE, b.y * TILE, TILE * dims.w, {
        active: nightWhen, workers: 0, nightAlpha: a,
      });
    }
  }
}

// ── 날씨 시각 효과 ──
// 상태 없이 시간(performance.now)과 파티클 인덱스로 위치를 계산하는 절차적 효과.
// 게임 루프가 매 프레임 renderScene을 부르므로 자연히 애니메이션된다.
function fract(n: number): number {
  return n - Math.floor(n);
}

function drawWeather(
  ctx: CanvasRenderingContext2D,
  weather: GameState['weather'],
  W: number,
  H: number,
  viewport: SceneViewport,
): void {
  const t = performance.now();
  const fillViewport = () => ctx.fillRect(viewport.pixelX, viewport.pixelY, viewport.pixelWidth, viewport.pixelHeight);

  switch (weather) {
    case 'rain': {
      ctx.fillStyle = 'rgba(60,90,130,0.10)'; // 흐린 하늘 색조
      fillViewport();
      ctx.strokeStyle = 'rgba(190,205,230,0.4)';
      ctx.lineWidth = 1;
      const n = 150, fall = 0.9, slant = 3, len = 9;
      for (let i = 0; i < n; i++) {
        const x = (i * 97) % W;
        const y = fract((i * 0.137) + (t * fall) / (H + 40)) * (H + 40) - 20;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - slant, y + len);
        ctx.stroke();
      }
      break;
    }
    case 'thawFlood': {
      ctx.fillStyle = 'rgba(80,120,150,0.12)'; // 해빙 — 푸르고 축축하게
      fillViewport();
      ctx.strokeStyle = 'rgba(200,215,235,0.32)';
      ctx.lineWidth = 1;
      const n = 90, fall = 0.7, slant = 2, len = 7;
      for (let i = 0; i < n; i++) {
        const x = (i * 113) % W;
        const y = fract((i * 0.191) + (t * fall) / (H + 40)) * (H + 40) - 20;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - slant, y + len);
        ctx.stroke();
      }
      break;
    }
    case 'heavySnow': {
      ctx.fillStyle = 'rgba(235,240,248,0.10)';
      fillViewport();
      drawSnow(ctx, t, W, H, 130, 0.13, 0.9, 1.6);
      break;
    }
    case 'blizzard': {
      ctx.fillStyle = 'rgba(228,235,245,0.24)'; // 앞이 잘 안 보이는 흰 안개
      fillViewport();
      // 세차게 옆으로 몰아치는 눈
      drawSnow(ctx, t, W, H, 240, 0.34, 1.5, 1.7, 0.5);
      break;
    }
    case 'frost': {
      ctx.fillStyle = 'rgba(210,225,240,0.10)'; // 서리 — 옅은 냉기
      fillViewport();
      // 드문드문 반짝이는 서리 결정 (거의 정지)
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      for (let i = 0; i < 40; i++) {
        const x = (i * 149.3) % W;
        const y = (i * 89.7) % H;
        const tw = 0.5 + 0.5 * Math.sin(t / 500 + i);
        if (tw > 0.7) ctx.fillRect(x, y, 1, 1);
      }
      break;
    }
    case 'coldSnap': {
      // 혹한 — 강한 푸른 색조 + 비네트, 공기는 정지, 미세한 성에가 떠다닌다
      ctx.fillStyle = 'rgba(90,130,175,0.16)';
      fillViewport();
      const grd = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.75);
      grd.addColorStop(0, 'rgba(30,50,80,0)');
      grd.addColorStop(1, 'rgba(30,50,80,0.28)');
      ctx.fillStyle = grd;
      fillViewport();
      ctx.fillStyle = 'rgba(215,230,245,0.55)';
      for (let i = 0; i < 60; i++) {
        const x = fract((i * 0.083) + (t * 0.02) / W) * W;
        const y = (i * 71.3) % H + Math.sin(t / 900 + i) * 3;
        ctx.fillRect(x, y, 1, 1);
      }
      break;
    }
    default:
      break; // clear: 오버레이 없음
  }
}

// 흩날리는 눈송이: n개, drift=수평 이동, fall=낙하 속도, size, sway=흔들림 폭, driftBias=일정 방향 바람
function drawSnow(
  ctx: CanvasRenderingContext2D, t: number, W: number, H: number,
  n: number, drift: number, fall: number, size: number, sway = 2,
): void {
  ctx.fillStyle = 'rgba(250,252,255,0.9)';
  for (let i = 0; i < n; i++) {
    const baseX = (i * 61) % W;
    const y = fract((i * 0.113) + (t * fall) / (H + 40)) * (H + 40) - 20;
    const x = (baseX + t * drift * 0.06 + Math.sin(t / 600 + i) * sway) % (W + 20) - 10;
    const r = size * (0.6 + 0.4 * ((i * 7) % 5) / 5);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}
