// 장면 렌더러 — 게임 상태를 받아 캔버스에 그린다.
// 레이어 구조 (실제 그래픽 파이프라인을 염두에 둔 설계):
//   1) 지형 레이어: 오프스크린 캔버스에 캐싱, 날짜/날씨/건물 변화 시에만 다시 그림
//   2) 엔티티 레이어: 건물/주민/습격 무리 — 매 프레임, 이동 보간 적용
//   3) UI 오버레이: 선택 표시, 경로선, 배치 미리보기
// 그리기 자체는 SpriteAPI(sprites.ts)에 위임하므로, 진짜 그래픽을 붙일 때는
// SpriteAPI 구현체만 교체하면 된다.
import { CONFIG } from '../game/config';
import { armedMusketeers, BUILDING_DEFS, buildingFootprintSize, canAfford, canPlaceBuildingAt } from '../game/buildings';
import { COLLAPSE_RATIO } from '../game/battles';
import { FACTIONS, JOB_COLORS } from '../game/constants';
import { getSeason } from '../game/seasons';
import { findHabitatIconAtTile } from '../game/habitats';
import { isBuildingFootprintExplored, isExplored } from '../game/exploration';
import { builtWallTileSet, isWallBuilding, wallConnectionsFromSet } from '../game/walls';
import { assignedWorkers, workerSlotConfig } from '../game/workerSlots';
import { jitterOf, placeholderSprites, type SpriteAPI } from './sprites';
import { militiaWeaponForResident } from './militiaWeaponAssignment';
import { claimZonesAt } from '../game/claimZones';
import { foreignSiteAt } from '../game/foreignSites';
import { foreignSiteActors, foreignSiteProps, type ForeignSiteProp } from '../game/foreignSiteActivity';
import { activePassageRoutes } from '../game/passage';
import { weaponCountsForResidents } from '../game/weapons';
import { activePredatorScoutIds } from '../game/expeditionIntel';
import { activeExpeditionTargetMarkers, type ExpeditionTargetMarker } from '../game/expeditionTargets';
import type { AnimalHabitat, BattleScar, Building, BuildingTypeId, ClaimZone, ForeignSite, GameState, Resident, Terrain } from '../game/types';

const TILE = CONFIG.ui.tileSize;

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
  hover: { x: number; y: number } | null;
  placingType: BuildingTypeId | null;
  selected: { x: number; y: number } | null;
  selectedResidentId: number | null;
  selectedBuildingId?: number | null;
  sprites?: SpriteAPI;
}

// 주민의 화면 픽셀 위치 (보간 + 지터). 렌더링과 마우스 히트 판정이 공유한다.
export function residentPixelPos(r: Resident, alpha: number): { x: number; y: number } {
  const [jx, jy] = jitterOf(r.id);
  return {
    x: (r.px + (r.x - r.px) * alpha) * TILE + TILE / 2 + jx,
    y: (r.py + (r.y - r.py) * alpha) * TILE + TILE / 2 + jy,
  };
}

// 픽셀 좌표에서 가장 가까운 주민 찾기 (radius 픽셀 이내)
export function findResidentAt(state: GameState, mx: number, my: number, alpha: number, radius = 10): Resident | null {
  let best: Resident | null = null;
  let bestD = radius;
  const expeditionUnitIds = state.expedition && state.expedition.phase !== 'muster'
    ? new Set(state.expedition.memberIds)
    : new Set<number>();
  for (const r of state.residents) {
    if (!r.alive) continue;
    if (expeditionUnitIds.has(r.id)) continue;
    const p = residentPixelPos(r, alpha);
    const d = Math.hypot(p.x - mx, p.y - my);
    if (d <= bestD) { bestD = d; best = r; }
  }
  return best;
}

// ── 지형 레이어 캐시 ──
let terrainLayer: HTMLCanvasElement | null = null;
let terrainKey = '';

function drawTerrainLayer(state: GameState, width: number, height: number, sprites: SpriteAPI): HTMLCanvasElement {
  const season = getSeason(state.day);
  const winter = season === 'winter';
  const frozenRiver = winter && state.weather !== 'thawFlood';
  // 하루/날씨/건물 수/스프라이트 세트가 바뀔 때만 다시 그린다
  const key = `${state.day}|${state.weather}|${state.buildings.length}|${width}|${sprites.id}`;
  if (terrainLayer && terrainKey === key) return terrainLayer;

  if (!terrainLayer || terrainLayer.width !== width || terrainLayer.height !== height) {
    terrainLayer = document.createElement('canvas');
    terrainLayer.width = width;
    terrainLayer.height = height;
  }
  const ctx = terrainLayer.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, width, height);
  // 지도 밖은 강이 이어지는 것으로 취급 (가장자리에 둑이 생기지 않게)
  const isLand = (x: number, y: number) => {
    const t = state.map[y]?.[x];
    return t ? t.terrain !== 'river' : false;
  };
  for (let y = 0; y < state.map.length; y++) {
    const row = state.map[y];
    for (let x = 0; x < row.length; x++) {
      const tile = row[x];
      sprites.drawTerrain(ctx, {
        terrain: tile.terrain, season, winter, frozenRiver,
        hasIron: tile.hasIron, tileX: x, tileY: y,
        x: x * TILE, y: y * TILE, size: TILE,
        banks: tile.terrain === 'river'
          ? {
              n: isLand(x, y - 1), e: isLand(x + 1, y), s: isLand(x, y + 1), w: isLand(x - 1, y),
              ne: isLand(x + 1, y - 1), se: isLand(x + 1, y + 1),
              sw: isLand(x - 1, y + 1), nw: isLand(x - 1, y - 1),
            }
          : undefined,
      });
    }
  }
  terrainKey = key;
  return terrainLayer;
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

function drawWorkerSlotOverlay(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  building: Building,
  expanded: boolean,
): void {
  if (!building.built) return;
  const config = workerSlotConfig(building.type);
  if (!config) return;
  if (!isBuildingFootprintExplored(state, building.type, building.x, building.y)) return;

  const workers = assignedWorkers(state, building);
  const footprint = buildingFootprintSize(building.type);
  const cx = (building.x + footprint / 2) * TILE;
  const top = building.y * TILE;
  const emptyFill = 'rgba(30,36,43,0.78)';
  const emptyStroke = 'rgba(216,222,229,0.48)';

  ctx.save();
  if (expanded) {
    const radius = 4.4;
    const gap = 3;
    const pad = 4;
    const width = config.slots * radius * 2 + Math.max(0, config.slots - 1) * gap + pad * 2;
    const height = radius * 2 + pad * 2;
    const left = cx - width / 2;
    const y = top - height - 3;
    ctx.fillStyle = 'rgba(20,24,28,0.88)';
    ctx.strokeStyle = 'rgba(217,164,65,0.58)';
    ctx.lineWidth = 1;
    ctx.fillRect(left, y, width, height);
    ctx.strokeRect(left + 0.5, y + 0.5, width - 1, height - 1);
    for (let i = 0; i < config.slots; i++) {
      const worker = workers[i];
      const dotX = left + pad + radius + i * (radius * 2 + gap);
      const dotY = y + height / 2;
      drawSlotDot(
        ctx,
        dotX,
        dotY,
        radius,
        worker ? JOB_COLORS[worker.job] : emptyFill,
        worker ? 'rgba(246,225,178,0.9)' : emptyStroke,
        worker ? 1.2 : 1,
      );
    }
    ctx.restore();
    return;
  }

  const radius = 2.4;
  const gap = 5.5;
  const startX = cx - ((config.slots - 1) * gap) / 2;
  const y = top - 4;
  for (let i = 0; i < config.slots; i++) {
    const worker = workers[i];
    drawSlotDot(
      ctx,
      startX + i * gap,
      y,
      radius,
      worker ? JOB_COLORS[worker.job] : emptyFill,
      worker ? 'rgba(20,24,28,0.82)' : emptyStroke,
    );
  }
  ctx.restore();
}

function drawWorkerSlotOverlays(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  buildings: Building[],
  selectedBuildingId?: number | null,
): void {
  for (const building of buildings) {
    drawWorkerSlotOverlay(ctx, state, building, selectedBuildingId === building.id);
  }
}

function drawFogOverlay(ctx: CanvasRenderingContext2D, state: GameState): void {
  ctx.save();
  for (let y = 0; y < state.map.length; y++) {
    const row = state.map[y];
    for (let x = 0; x < row.length; x++) {
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

export function renderScene(canvas: HTMLCanvasElement, state: GameState, o: SceneOptions): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const sprites = o.sprites ?? placeholderSprites;
  const predatorScoutIds = activePredatorScoutIds(state);
  const lerp = (a: number, b: number) => a + (b - a) * o.alpha;
  ctx.imageSmoothingEnabled = false;

  // 1) 지형
  const layer = drawTerrainLayer(state, canvas.width, canvas.height, sprites);
  // 짐승이 떠난(비활성) 서식지는 지도에서도 숨긴다
  const habitats = state.habitats.filter(h => h.active && isExplored(state, h.x, h.y));
  const hoveredHabitat = o.hover ? findHabitatIconAtTile(habitats, o.hover.x, o.hover.y) : null;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(layer, 0, 0);
  if (hoveredHabitat) drawHabitatRange(ctx, hoveredHabitat);
  for (const habitat of habitats) drawHabitatIcon(ctx, habitat);

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

  // 2) 건물 — 지붕이 위 타일에 겹치므로 y 순서로 그린다
  const season = getSeason(state.day);
  const heating = (season === 'autumn' || season === 'winter') && state.resources.firewood > 0;
  // 끝난 전투 자리의 교란 자국 — 건물·주민 아래 바닥 데칼로 깔린다
  for (const scar of state.battleScars ?? []) {
    if (scar.until < state.day) continue;
    if (!isExplored(state, scar.x, scar.y)) continue;
    drawBattleScarDecal(ctx, scar, state.day, season === 'winter');
  }
  const wallTiles = builtWallTileSet(state);
  const sorted = [...state.buildings].sort((a, b) =>
    (a.y + buildingFootprintSize(a.type)) - (b.y + buildingFootprintSize(b.type)) || a.x - b.x);
  for (const b of sorted) {
    if (!isBuildingFootprintExplored(state, b.type, b.x, b.y)) continue;
    const def = BUILDING_DEFS[b.type];
    const footprint = buildingFootprintSize(b.type);
    const size = TILE * footprint;
    sprites.drawBuilding(ctx, {
      type: b.type, built: b.built, ghost: false,
      season,
      progress01: def.buildDays > 0 ? b.progress / def.buildDays : 1,
      growth01: b.type === 'field' || b.type === 'paddy' ? b.fieldGrowth / 100 : undefined,
      connections: b.built && isWallBuilding(b.type)
        ? wallConnectionsFromSet(wallTiles, b.x, b.y)
        : undefined,
      x: b.x * TILE, y: b.y * TILE, size,
    });
    if (b.repairing) {
      sprites.drawBuildingDamage(ctx, { season, x: b.x * TILE, y: b.y * TILE, size });
      drawDamageSmoke(ctx, b.x * TILE, b.y * TILE, b.id, footprint);
    }
    // 아궁이에 불을 땔 때 온돌집/중심지 굴뚝에서 연기가 오른다
    if (b.built && heating && (b.type === 'ondol' || b.type === 'center')) {
      drawChimneySmoke(ctx, b.x * TILE, b.y * TILE, b.id, footprint);
    }
  }

  const discoveredSites = state.foreignSites.filter(candidate => candidate.discovered);
  for (const site of discoveredSites) {
    for (const prop of foreignSiteProps(state, site)) drawForeignSiteProp(ctx, sprites, prop, site, season, state.day);
  }
  for (const site of discoveredSites) {
    const selected = !!o.selected && foreignSiteAt(state, o.selected.x, o.selected.y)?.id === site.id;
    drawForeignSite(ctx, sprites, site, selected, season);
  }

  drawWorkerSlotOverlays(ctx, state, sorted, o.selectedBuildingId);

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
  for (const site of discoveredSites) {
    for (const actor of foreignSiteActors(state, site, activityTime)) {
      sprites.drawResident(ctx, {
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
      });
    }
  }
  for (const r of state.residents) {
    if (!r.alive || predatorScoutIds.has(r.id)) continue;
    const p = residentPixelPos(r, o.alpha);
    sprites.drawResident(ctx, {
      job: r.job,
      gender: r.gender,
      x: p.x,
      y: p.y,
      sick: r.sick,
      carrying: Object.keys(r.carrying).length > 0,
      selected: r.id === o.selectedResidentId,
      moving: r.px !== r.x || r.py !== r.y,
      facing: r.x < r.px ? -1 : 1,
      militiaWeapon: militiaWeaponForResident(state, r),
    });
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

  // 7) 밤낮 색조 — 하루 진행도(subTick+보간)로 계산. 세계를 물들이고 창에는 불이 켜진다.
  const SUB = CONFIG.agents.subticksPerDay;
  const dayFrac = ((state.subTick + o.alpha) % SUB) / SUB;
  drawDayNight(ctx, state, dayFrac, canvas.width, canvas.height);

  // 7) 선택 타일 표시 (밤에도 잘 보이게 색조 위에)
  if (o.selected) {
    ctx.strokeStyle = '#d9a441';
    ctx.lineWidth = 2;
    ctx.strokeRect(o.selected.x * TILE + 1, o.selected.y * TILE + 1, TILE - 2, TILE - 2);
    ctx.lineWidth = 1;
  }

  // 8) 날씨 오버레이 (비/눈/눈보라/서리/혹한/해빙 홍수)
  drawWeather(ctx, state.weather, canvas.width, canvas.height);

  // 9) 미답사 안개 — 지형/자원/건물/서식지를 탐색 전까지 가린다
  drawFogOverlay(ctx, state);

  // 활성 토벌 목표는 미답사 안개 위에도 표시해 위치를 잃지 않게 한다.
  for (const marker of activeExpeditionTargetMarkers(state)) drawExpeditionTargetMarker(ctx, marker);

  // 10) 배치 모드: 관련 자원 하이라이트 (사냥막→서식지 범위, 밭→비옥한 땅)
  if (o.placingType) {
    // 사냥막 배치 중엔 모든 서식지 범위를 보여줘 자리를 잡기 쉽게 한다
    if (o.placingType === 'huntLodge') {
      for (const habitat of habitats) drawHabitatRange(ctx, habitat);
    }
    const want = PLACEMENT_HINT[o.placingType];
    if (want) {
      const pulse = 0.22 + 0.14 * Math.sin(performance.now() / 280);
      ctx.fillStyle = `rgba(255,214,90,${pulse.toFixed(3)})`;
      ctx.strokeStyle = 'rgba(255,214,90,0.8)';
      for (let y = 0; y < state.map.length; y++) {
        const row = state.map[y];
        for (let x = 0; x < row.length; x++) {
          if (row[x].terrain !== want || !isExplored(state, x, y)) continue;
          ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
          ctx.strokeRect(x * TILE + 0.5, y * TILE + 0.5, TILE - 1, TILE - 1);
        }
      }
    }
  }

  // 11) 건설 배치 미리보기 — 날씨 위에 얹어 잘 보이게
  if (o.placingType && o.hover) {
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
      season,
      x: o.hover.x * TILE, y: o.hover.y * TILE, size,
    });
  }
}

// ── 밤낮 사이클 ──
// dayFrac 0=새벽, 0.25=한낮, 0.5=해질녘, 0.75=한밤중. 시간 흐름은 config.time.msPerDay가 정한다.
function drawDayNight(ctx: CanvasRenderingContext2D, state: GameState, dayFrac: number, W: number, H: number): void {
  const sun = Math.sin(dayFrac * Math.PI * 2); // +1 한낮, -1 한밤중
  const night = Math.max(0, -sun);             // 낮엔 0, 자정에 1

  // 밤의 푸른 어둠
  if (night > 0.002) {
    ctx.fillStyle = `rgba(16,24,56,${(night * 0.5).toFixed(3)})`;
    ctx.fillRect(0, 0, W, H);
  }
  // 여명/황혼의 따뜻한 빛 (해가 지평선 근처일 때만)
  const twilight = Math.max(0, 1 - Math.abs(sun) * 3.5);
  if (twilight > 0.002) {
    const dusk = dayFrac > 0.25 && dayFrac < 0.75; // 해질녘은 붉게, 새벽은 노랗게
    const col = dusk ? '255,110,70' : '255,175,95';
    ctx.fillStyle = `rgba(${col},${(twilight * 0.17).toFixed(3)})`;
    ctx.fillRect(0, 0, W, H);
  }
  // 밤이 깊어지면 집·군영·중심지 창에 불이 켜진다
  if (night > 0.28) {
    const a = Math.min(1, (night - 0.28) / 0.5);
    for (const b of state.buildings) {
      if (!b.built) continue;
      if (b.type === 'hut' || b.type === 'ondol' || b.type === 'center' || b.type === 'garrison') {
        const size = TILE * buildingFootprintSize(b.type);
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

function drawWeather(ctx: CanvasRenderingContext2D, weather: GameState['weather'], W: number, H: number): void {
  const t = performance.now();

  switch (weather) {
    case 'rain': {
      ctx.fillStyle = 'rgba(60,90,130,0.10)'; // 흐린 하늘 색조
      ctx.fillRect(0, 0, W, H);
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
      ctx.fillRect(0, 0, W, H);
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
      ctx.fillRect(0, 0, W, H);
      drawSnow(ctx, t, W, H, 130, 0.13, 0.9, 1.6);
      break;
    }
    case 'blizzard': {
      ctx.fillStyle = 'rgba(228,235,245,0.24)'; // 앞이 잘 안 보이는 흰 안개
      ctx.fillRect(0, 0, W, H);
      // 세차게 옆으로 몰아치는 눈
      drawSnow(ctx, t, W, H, 240, 0.34, 1.5, 1.7, 0.5);
      break;
    }
    case 'frost': {
      ctx.fillStyle = 'rgba(210,225,240,0.10)'; // 서리 — 옅은 냉기
      ctx.fillRect(0, 0, W, H);
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
      ctx.fillRect(0, 0, W, H);
      const grd = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.75);
      grd.addColorStop(0, 'rgba(30,50,80,0)');
      grd.addColorStop(1, 'rgba(30,50,80,0.28)');
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, W, H);
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
