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
  canAfford, canAffordCost, canPlaceBuildingAt, canPlaceOn, isAreaBuildingType, isPlotBuildingType,
} from '../game/buildings';
import { COLLAPSE_RATIO } from '../game/battles';
import { FACTIONS, JOB_COLORS } from '../game/constants';
import { getSeason } from '../game/seasons';
import { DAY_BANDS, DAY_CYCLE_SUBTICKS } from '../game/dayCycle';
import { LEISURE_CLUSTER_CAPACITY } from '../game/agents';
import { findHabitatIconAtTile } from '../game/habitats';
import { isBuildingFootprintExplored, isExplored } from '../game/exploration';
import { builtWallTileSet, isWallBuilding, wallConnectionsFromSet } from '../game/walls';
import { assignedWorkers, workerSlotConfig, workerSlotCount } from '../game/workerSlots';
import {
  jitterOf,
  placeholderSprites,
  type BuildingDrawParams,
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
import { activeExpeditionTargetMarkers, type ExpeditionTargetMarker } from '../game/expeditionTargets';
import { workplaceActivityStyle, type WorkplaceActivityStyle } from '../game/workplacePresentation';
import { normalizeLivestockState } from '../game/livestock';
import { normalizePastureArea, validateStablePasture } from '../game/pastures';
import { treeStageFor } from '../game/forestGrowth';
import {
  mineralRemaining,
  mineralVisualTier,
  tileMineralResource,
} from '../game/minerals';
import type { AnimalHabitat, BattleScar, Building, BuildingTypeId, ClaimZone, ForeignSite, GameState, PastureArea, Resident, Season, Terrain } from '../game/types';
import { pixelRectIntersectsViewport, tileRectIntersectsViewport, type SceneViewport } from './sceneViewport';
import {
  mountainDepthAt,
  mountainProfileFor,
  terrainNeighborsFor,
  terrainVisualHash,
  treeSpeciesFromHash,
} from './terrainGrowthVisuals';

const TILE = CONFIG.ui.tileSize;

const CENTER_VISUAL_SCALE: Record<GameState['rank'], number> = {
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
  ferry: 'river',
  watermill: 'river',
  dock: 'river',
};

export interface SceneOptions {
  alpha: number; // 서브틱 사이 이동 보간 계수 0~1
  animationTimeMs: number; // 이 장면의 모든 주민 source rect가 공유하는 RAF 시간
  hover: { x: number; y: number } | null;
  placingType: BuildingTypeId | null;
  placingRect?: { x: number; y: number; w: number; h: number } | null; // 경작지 드래그 크기 지정 미리보기
  pasturePlacement?: { stableId: number; rect: PastureArea } | null;
  selected: { x: number; y: number } | null;
  selectedResidentId: number | null;
  selectedBuildingId?: number | null;
  viewport?: SceneViewport;
  terrainVisualSignature?: number;
  sprites?: SpriteAPI;
  residentPresentation?: ResidentPresentationSnapshot;
  renderScale?: 1 | 2;
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
  for (const r of state.residents) {
    if (!r.alive) continue;
    if (expeditionUnitIds.has(r.id)) continue;
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

function drawTerrainOverlays(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  sprites: SpriteAPI,
  viewport: SceneViewport,
  renderScale: 1 | 2,
): void {
  if (!sprites.drawTerrainOverlay) return;
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
      if (terrain !== 'forest' && terrain !== 'mountain') continue;
      sprites.drawTerrainOverlay(
        ctx,
        terrainParams(state, x, y, season, winter, frozenRiver, renderScale),
      );
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
      if (tile.terrain !== 'rock' && treeStageFor(tile) !== 'stump') continue;
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

interface TreeCanopyProxy {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  trunkHalfWidth: number;
  trunkTop: number;
  trunkBottom: number;
}

function treeCanopiesIntersectingRect(
  state: GameState,
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
            cx: anchorX, cy: anchorY - 41.5, rx: 29, ry: 26.5,
            trunkHalfWidth: 3.5, trunkTop: anchorY - 29, trunkBottom: anchorY - 2,
          }
        : {
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

function drawOccludedEntityGhosts(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  sprites: SpriteAPI,
  buildings: readonly BuildingDrawParams[],
  residents: readonly ResidentDrawParams[],
): void {
  for (const building of buildings) {
    const canopies = treeCanopiesIntersectingRect(
      state,
      building.x,
      building.y,
      building.size,
      building.size,
    );
    if (canopies.length === 0) continue;
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
    ctx.filter = 'opacity(42%)';
    sprites.drawBuilding(ctx, building);
    ctx.restore();
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
    );
    if (canopies.length === 0) continue;
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
    ctx.filter = 'opacity(48%)';
    sprites.drawResident(ctx, resident);
    ctx.restore();
  }
}

// 굴뚝 연기: 위로 오르며 흩어지는 회백색 입자 (건물 id로 위상을 어긋나게)
function drawChimneySmoke(ctx: CanvasRenderingContext2D, bx: number, by: number, id: number, footprint: number): void {
  const t = performance.now() / 1000;
  for (let k = 0; k < 4; k++) {
    const ph = ((t / 2.6) + k / 4 + (id % 7) / 7) % 1; // 0(굴뚝)→1(소멸)
    const sy = by - 13 - ph * 13;
    const sx = bx + TILE * footprint - 4 + Math.sin((ph * 5 + id) * 2) * 1.8;
    ctx.fillStyle = `rgba(206,211,218,${(0.65 * (1 - ph)).toFixed(2)})`;
    ctx.beginPath();
    ctx.arc(sx, sy, 1.6 + ph * 2.4, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawWorkplaceActivity(
  ctx: CanvasRenderingContext2D,
  bx: number,
  by: number,
  id: number,
  size: number,
  workers: number,
  style: WorkplaceActivityStyle,
): void {
  const t = performance.now();
  ctx.save();
  if (style === 'fire') {
    drawChimneySmoke(ctx, bx, by, id, size / TILE);
    const count = Math.min(5, 2 + workers);
    for (let i = 0; i < count; i++) {
      const phase = ((t / 180 + i * 1.7 + id * 0.61) % 7) / 7;
      const x = bx + size * 0.7 + Math.sin(i * 2.3 + id) * 3 + phase * 2;
      const y = by + size * 0.68 - phase * 12;
      ctx.fillStyle = `rgba(255,${Math.round(150 + phase * 70)},70,${(0.9 * (1 - phase)).toFixed(2)})`;
      ctx.fillRect(Math.round(x), Math.round(y), phase < 0.45 ? 2 : 1, phase < 0.45 ? 2 : 1);
    }
  } else if (style === 'craft') {
    const pulse = (Math.sin(t / 150 + id) + 1) / 2;
    ctx.strokeStyle = `rgba(238,213,158,${(0.35 + pulse * 0.45).toFixed(2)})`;
    ctx.lineWidth = 1.2;
    for (let i = 0; i < Math.min(3, workers + 1); i++) {
      const x = bx + size * (0.35 + i * 0.14);
      const y = by + size * 0.72 - ((i + Math.floor(t / 220)) % 2) * 2;
      ctx.beginPath();
      ctx.moveTo(x - 2, y + 2);
      ctx.lineTo(x + 2, y - 2);
      ctx.stroke();
    }
  } else {
    const pulse = (Math.sin(t / 420 + id * 0.7) + 1) / 2;
    const x = bx + size * 0.5;
    const y = by + size * 0.55;
    ctx.fillStyle = `rgba(255,205,104,${(0.13 + pulse * 0.11).toFixed(2)})`;
    ctx.beginPath();
    ctx.arc(x, y, 7 + pulse * 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `rgba(255,221,139,${(0.72 + pulse * 0.2).toFixed(2)})`;
    ctx.fillRect(Math.round(x - 2), Math.round(y - 1.5), 4, 3);
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

function drawHabitatIcon(ctx: CanvasRenderingContext2D, habitat: AnimalHabitat): void {
  const cx = (habitat.x + 0.5) * TILE;
  const cy = (habitat.y + 0.5) * TILE;
  const r = TILE * 0.36;
  ctx.save();
  ctx.fillStyle = 'rgba(32,24,14,0.58)';
  ctx.strokeStyle = 'rgba(245,214,146,0.88)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
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
      sprites.drawBuilding(ctx, {
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

function drawPastureLivestock(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  sprites: SpriteAPI,
  viewport: SceneViewport,
  animationTimeMs: number,
  highDefinition: boolean,
): void {
  const animals: Array<{
    species: ReturnType<typeof normalizeLivestockState>['species'];
    x: number;
    y: number;
    facing: 1 | -1;
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
      });
    }
  }
  animals.sort((left, right) => left.y - right.y || left.x - right.x);
  for (const animal of animals) {
    sprites.drawLivestock(ctx, { ...animal, highDefinition });
  }
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
  const presentation = o.residentPresentation ?? buildResidentPresentationSnapshot(state);
  const lerp = (a: number, b: number) => a + (b - a) * o.alpha;
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
  ctx.drawImage(
    layer,
    viewport.pixelX * renderScale,
    viewport.pixelY * renderScale,
    viewport.pixelWidth * renderScale,
    viewport.pixelHeight * renderScale,
    viewport.pixelX, viewport.pixelY, viewport.pixelWidth, viewport.pixelHeight,
  );
  ctx.save();
  ctx.beginPath();
  ctx.rect(viewport.pixelX, viewport.pixelY, viewport.pixelWidth, viewport.pixelHeight);
  ctx.clip();
  // 바닥 캐시와 분리해 큰 노두가 뒤에 그려지는 이웃 타일 바닥에 잘리지 않게 한다.
  drawTerrainProps(ctx, state, sprites, viewport, renderScale);

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
    if (isPlotBuildingType(b.type)) {
      // 경작지는 발자국 칸마다 스프라이트를 타일링 — 파종을 마친 칸만 작물이 자라 보인다
      const area = dims.w * dims.h;
      const sown = b.built ? Math.min(area, Math.max(0, Math.floor(b.sownArea ?? area))) : 0;
      for (let i = 0; i < area; i++) {
        const cellX = b.x + (i % dims.w);
        const cellY = b.y + Math.floor(i / dims.w);
        const drawParams: BuildingDrawParams = {
          type: b.type, built: b.built, ghost: false,
          season,
          highDefinition: renderScale === 2,
          progress01: def.buildDays > 0 ? b.progress / def.buildDays : 1,
          growth01: i < sown ? b.fieldGrowth / 100 : 0,
          x: cellX * TILE, y: cellY * TILE, size: TILE,
        };
        sprites.drawBuilding(ctx, drawParams);
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
      const graves = b.built ? Math.min(area * CONFIG.funeral.plotsPerTile, Math.max(0, b.graves ?? 0)) : 0;
      for (let i = 0; i < area; i++) {
        const cellX = b.x + (i % dims.w);
        const cellY = b.y + Math.floor(i / dims.w);
        const drawParams: BuildingDrawParams = {
          type: b.type, built: b.built, ghost: false,
          season,
          highDefinition: renderScale === 2,
          progress01: def.buildDays > 0 ? b.progress / def.buildDays : 1,
          graveCount: Math.min(CONFIG.funeral.plotsPerTile, Math.max(0, graves - i * CONFIG.funeral.plotsPerTile)),
          x: cellX * TILE, y: cellY * TILE, size: TILE,
        };
        sprites.drawBuilding(ctx, drawParams);
        occludedBuildingDraws.push(drawParams);
      }
      continue;
    }
    const drawParams: BuildingDrawParams = {
      type: b.type, built: b.built, ghost: false,
      rank: b.type === 'center' ? state.rank : undefined,
      season,
      highDefinition: renderScale === 2,
      progress01: def.buildDays > 0 ? b.progress / def.buildDays : 1,
      connections: b.built && isWallBuilding(b.type)
        ? wallConnectionsFromSet(wallTiles, b.x, b.y)
        : undefined,
      x: drawX, y: drawY, size,
    };
    sprites.drawBuilding(ctx, drawParams);
    occludedBuildingDraws.push(drawParams);
    if (b.repairing) {
      sprites.drawBuildingDamage(ctx, { season, x: drawX, y: drawY, size });
      drawDamageSmoke(ctx, drawX, drawY, b.id, size / TILE);
    }
    // 아궁이에 불을 땔 때 온돌집/중심지 굴뚝에서 연기가 오른다
    if (b.built && heating && (b.type === 'ondol' || b.type === 'center')) {
      drawChimneySmoke(ctx, drawX, drawY, b.id, size / TILE);
    }
    const activeWorkerCount = presentation.workplaceActiveCountByBuilding.get(b.id) ?? 0;
    const activityStyle = workplaceActivityStyle(b.type);
    if (b.built && activeWorkerCount > 0 && activityStyle) {
      drawWorkplaceActivity(ctx, drawX, drawY, b.id, size, activeWorkerCount, activityStyle);
    }
  }

  const discoveredSites = state.foreignSites.filter(candidate => candidate.discovered);
  const visibleSites = discoveredSites.filter(site =>
    tileRectIntersectsViewport(viewport, site.x - 1, site.y - 1, site.width + 2, site.height + 2));
  for (const site of visibleSites) {
    for (const prop of foreignSiteProps(state, site)) drawForeignSiteProp(ctx, sprites, prop, site, season, state.day);
  }
  for (const site of visibleSites) {
    const selected = !!o.selected && foreignSiteAt(state, o.selected.x, o.selected.y)?.id === site.id;
    drawForeignSite(ctx, sprites, site, selected, season);
  }
  drawPastureLivestock(ctx, state, sprites, viewport, o.animationTimeMs, renderScale === 2);

  lap('2-buildings');
  drawWorkerSlotOverlays(ctx, state, visibleBuildings, o.selectedBuildingId, presentation.indoorResidentIds);
  lap('2b-slotOverlays');

  // 3) 선택 주민의 예정 경로 — 행군하는 점선(개미행렬) 애니메이션
  if (o.selectedResidentId != null) {
    const sel = state.residents.find(r => r.id === o.selectedResidentId && r.alive);
    if (sel && sel.path.length > 0) {
      ctx.strokeStyle = 'rgba(217,164,65,0.6)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.lineDashOffset = -((performance.now() / 60) % 8);
      ctx.beginPath();
      ctx.moveTo(lerp(sel.px, sel.x) * TILE + TILE / 2, lerp(sel.py, sel.y) * TILE + TILE / 2);
      for (const p of sel.path) {
        ctx.lineTo(p.x * TILE + TILE / 2, p.y * TILE + TILE / 2);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineDashOffset = 0;
      ctx.lineWidth = 1;
    }
  }

  // 4) 외부 거점 생활 인구와 개척지 주민
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
        selected: false,
        moving: actor.moving,
        facing: actor.facing,
        foreignFaction: site.factionName ?? undefined,
      };
      sprites.drawResident(ctx, drawParams);
      occludedResidentDraws.push(drawParams);
    }
  }
  // 매장을 기다리는 시신 — 장의사가 운구 중이면 표시하지 않는다
  for (const corpse of state.corpses ?? []) {
    if (corpse.carried || corpse.withExpedition) continue;
    if (!tileRectIntersectsViewport(viewport, corpse.x, corpse.y)) continue;
    ctx.font = `${Math.round(TILE * 0.55)}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('⚰️', corpse.x * TILE + TILE / 2, corpse.y * TILE + TILE / 2);
  }
  for (const r of state.residents) {
    if (!r.alive || predatorScoutIds.has(r.id) || presentation.indoorResidentIds.has(r.id)) continue;
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
    const drawParams: ResidentDrawParams = {
      job: r.job,
      gender: r.gender,
      x: p.x,
      y: p.y,
      sick: r.sick,
      carrying: Object.keys(r.carrying).length > 0,
      carryingWood: (r.carrying.wood ?? 0) > 0 || (r.carrying.brushwood ?? 0) > 0,
      carryingGame: (r.carrying.meat ?? 0) > 0 || (r.carrying.hide ?? 0) > 0,
      carryingMinerals: (r.carrying.stone ?? 0) > 0 || (r.carrying.iron ?? 0) > 0 ||
        (r.carrying.silver ?? 0) > 0,
      cartEquipped: r.cartEquipped,
      farmerAction: farmerSpriteActionFor(r, presentation.oxPlowFarmerIds),
      selected: r.id === o.selectedResidentId,
      moving: r.px !== r.x || r.py !== r.y,
      working: r.phase === 'working' && r.px === r.x && r.py === r.y,
      facing: workStance?.facing ?? leisureFacing ?? (r.x < r.px ? -1 : 1),
      militiaWeapon: militiaWeaponForResident(state, r),
      special: r.special,
      stage: r.stage,
      sizeScale: r.stage === 'infant' ? 0.42 : r.stage === 'child' ? 0.62 : r.stage === 'youth' ? 0.8 : 1,
      animationTimeMs: o.animationTimeMs + stableResidentAnimationOffset(r.id),
    };
    sprites.drawResident(ctx, drawParams);
    occludedResidentDraws.push(drawParams);
  }

  // 5) 아군 원정부대 — 집결 중에는 개별 주민, 출발 후에는 단일 부대로 표시한다.
  if (state.expedition) {
    const expedition = state.expedition;
    if (expedition.phase === 'muster') {
      drawMusterFlag(ctx, expedition.musterX, expedition.musterY);
    } else {
      if (season === 'winter' && expedition.trail.length > 0) drawFootprints(ctx, expedition.trail);
      const members = state.residents.filter(resident => resident.alive && expedition.memberIds.includes(resident.id));
      sprites.drawExpedition(ctx, {
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
      });
      if (expedition.phase === 'engage') {
        const muskets = weaponCountsForResidents(state, members).readyMuskets > 0;
        drawBattleClash(ctx, expedition.targetX, expedition.targetY, muskets);
      }
    }
  }

  // 6) 습격 무리 (+겨울 눈밭 발자국)
  if (state.raiders) {
    const b = state.raiders;
    if (getSeason(state.day) === 'winter' && b.trail && b.trail.length > 0) {
      drawFootprints(ctx, b.trail);
    }
    sprites.drawRaiders(ctx, {
      x: lerp(b.px, b.x) * TILE + TILE / 2,
      y: lerp(b.py, b.y) * TILE + TILE / 2,
      count: b.size,
      spotted: b.spotted,
      moving: b.px !== b.x || b.py !== b.y,
      facing: b.x < b.px ? -1 : 1,
      faction: b.faction,
    });
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
  }

  // 키 큰 나무와 산맥은 발자국 타일보다 위로 솟아 배우를 부분적으로 가린다.
  drawTerrainOverlays(ctx, state, sprites, viewport, renderScale);
  drawOccludedEntityGhosts(ctx, state, sprites, occludedBuildingDraws, occludedResidentDraws);
  // 사냥터 범위와 표식은 수관보다 위에 그려 항상 식별 가능하게 한다.
  if (hoveredHabitat) drawHabitatRange(ctx, hoveredHabitat);
  for (const habitat of habitats) {
    if (tileRectIntersectsViewport(viewport, habitat.x, habitat.y)) drawHabitatIcon(ctx, habitat);
  }
  lap('6-terrain-overlays');

  lap('3-6-actors');

  // 7) 밤낮 색조 — 하루 진행도(subTick+보간)로 계산. 세계를 물들이고 창에는 불이 켜진다.
  // 72서브틱 체제에서는 한낮 = 노동 대역 중앙, 자정 = 밤 대역 중앙으로 정렬한다 (M4 계약).
  // 두 중앙이 정확히 반나절(SUB/2) 떨어져 있어 균등 선형 이동만으로 두 앵커가 동시에 성립한다.
  // 이전 설정을 읽는 개발 빌드에서는 종전 선형 매핑을 유지한다.
  const SUB: number = CONFIG.agents.subticksPerDay;
  const subU = (state.subTick + o.alpha) % SUB;
  const workCenter = (DAY_BANDS.work.start + DAY_BANDS.work.end + 1) / 2;
  const dayFrac = SUB === DAY_CYCLE_SUBTICKS
    ? ((subU - workCenter + 0.25 * SUB + SUB) % SUB) / SUB
    : subU / SUB;
  drawDayNight(ctx, state, dayFrac, viewport);
  lap('7-daynight');

  // 7) 선택 타일 표시 (밤에도 잘 보이게 색조 위에)
  if (o.selected) {
    ctx.strokeStyle = '#d9a441';
    ctx.lineWidth = 2;
    ctx.strokeRect(o.selected.x * TILE + 1, o.selected.y * TILE + 1, TILE - 2, TILE - 2);
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

  // 10) 배치 모드: 관련 자원 하이라이트 (사냥막→서식지 범위, 밭→비옥한 땅)
  if (o.placingType) {
    // 사냥막 배치 중엔 모든 서식지 범위를 보여줘 자리를 잡기 쉽게 한다
    if (o.placingType === 'huntLodge') {
      for (const habitat of habitats) drawHabitatRange(ctx, habitat);
    }
    if (o.placingType === 'mine' && o.hover) drawMineWorkRange(ctx, o.hover.x, o.hover.y);
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
  if (o.placingType && isAreaBuildingType(o.placingType) && o.placingRect) {
    // 경작지·묘역: 드래그 사각형을 칸별 유효/무효로 칠한다
    const def = BUILDING_DEFS[o.placingType];
    const rect = o.placingRect;
    const affordable = canAffordCost(state, buildingCostFor(o.placingType, rect.w, rect.h));
    for (let dy = 0; dy < rect.h; dy++) {
      for (let dx = 0; dx < rect.w; dx++) {
        const tx = rect.x + dx;
        const ty = rect.y + dy;
        const tile = state.map[ty]?.[tx];
        const ok = affordable && !!tile && isExplored(state, tx, ty) &&
          canPlaceOn(def, tile, state) && !foreignSiteAt(state, tx, ty);
        ctx.fillStyle = ok ? 'rgba(111,191,115,0.45)' : 'rgba(224,108,92,0.45)';
        ctx.fillRect(tx * TILE, ty * TILE, TILE, TILE);
        sprites.drawBuilding(ctx, {
          type: o.placingType, built: true, ghost: true, progress01: 1,
          season, highDefinition: renderScale === 2,
          x: tx * TILE, y: ty * TILE, size: TILE,
        });
      }
    }
    ctx.strokeStyle = 'rgba(255,214,90,0.9)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(rect.x * TILE + 0.75, rect.y * TILE + 0.75, rect.w * TILE - 1.5, rect.h * TILE - 1.5);
    ctx.lineWidth = 1;
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
    ctx.fillStyle = ok ? 'rgba(111,191,115,0.45)' : 'rgba(224,108,92,0.45)';
    ctx.fillRect(o.hover.x * TILE, o.hover.y * TILE, size, size);
    sprites.drawBuilding(ctx, {
      type: o.placingType, built: true, ghost: true, progress01: 1,
      season, highDefinition: renderScale === 2,
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

function drawDayNight(ctx: CanvasRenderingContext2D, state: GameState, dayFrac: number, viewport: SceneViewport): void {
  const daylight = SEASON_DAYLIGHT_FRAC[getSeason(state.day)];
  const dawnT = 0.25 - daylight / 2;
  const duskT = 0.25 + daylight / 2;
  const sun = dayFrac >= dawnT && dayFrac < duskT
    ? Math.sin(Math.PI * ((dayFrac - dawnT) / daylight))          // 낮 구간: 0→1→0
    : -Math.sin(Math.PI * ((dayFrac - duskT + 1) % 1) / (1 - daylight)); // 밤 구간: 0→-1→0
  const night = Math.max(0, -sun);             // 낮엔 0, 자정에 1

  // 밤의 푸른 어둠
  if (night > 0.002) {
    ctx.fillStyle = `rgba(16,24,56,${(night * 0.5).toFixed(3)})`;
    ctx.fillRect(viewport.pixelX, viewport.pixelY, viewport.pixelWidth, viewport.pixelHeight);
  }
  // 여명/황혼의 따뜻한 빛 (해가 지평선 근처일 때만)
  const twilight = Math.max(0, 1 - Math.abs(sun) * 3.5);
  if (twilight > 0.002) {
    const dusk = dayFrac > 0.25 && dayFrac < 0.75; // 해질녘은 붉게, 새벽은 노랗게
    const col = dusk ? '255,110,70' : '255,175,95';
    ctx.fillStyle = `rgba(${col},${(twilight * 0.17).toFixed(3)})`;
    ctx.fillRect(viewport.pixelX, viewport.pixelY, viewport.pixelWidth, viewport.pixelHeight);
  }
  // 밤이 깊어지면 집·군영·중심지 창에 불이 켜진다
  if (night > 0.28) {
    const a = Math.min(1, (night - 0.28) / 0.5);
    for (const b of state.buildings) {
      if (!b.built) continue;
      if (b.type === 'hut' || b.type === 'ondol' || b.type === 'center' || b.type === 'garrison') {
        const dims = buildingFootprintDims(b);
        if (!tileRectIntersectsViewport(viewport, b.x, b.y, dims.w, dims.h)) continue;
        const size = TILE * dims.w;
        ctx.fillStyle = `rgba(255,205,95,${(0.85 * a).toFixed(2)})`;
        ctx.fillRect(b.x * TILE + size * 0.5 - 1.5, b.y * TILE + size * 0.42, 3, 3);
      }
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
