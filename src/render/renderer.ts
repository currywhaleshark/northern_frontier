// 장면 렌더러 — 게임 상태를 받아 캔버스에 그린다.
// 레이어 구조 (실제 그래픽 파이프라인을 염두에 둔 설계):
//   1) 지형 레이어: 오프스크린 캔버스에 캐싱, 날짜/날씨/건물 변화 시에만 다시 그림
//   2) 엔티티 레이어: 건물/주민/습격 무리 — 매 프레임, 이동 보간 적용
//   3) UI 오버레이: 선택 표시, 경로선, 배치 미리보기
// 그리기 자체는 SpriteAPI(sprites.ts)에 위임하므로, 진짜 그래픽을 붙일 때는
// SpriteAPI 구현체만 교체하면 된다.
import { CONFIG } from '../game/config';
import { BUILDING_DEFS, buildingFootprintSize, canAfford, canPlaceBuildingAt } from '../game/buildings';
import { getSeason } from '../game/seasons';
import { findHabitatIconAtTile } from '../game/habitats';
import { isBuildingFootprintExplored, isExplored } from '../game/exploration';
import { builtWallTileSet, isWallBuilding, wallConnectionsFromSet } from '../game/walls';
import { jitterOf, placeholderSprites, type SpriteAPI } from './sprites';
import { militiaWeaponForResident } from './militiaWeaponAssignment';
import type { AnimalHabitat, BuildingTypeId, GameState, Resident, Terrain } from '../game/types';

const TILE = CONFIG.ui.tileSize;

// 배치 모드에서 금색으로 짚어 주는 자원 지형 (건물 → 찾아야 할 지형)
const PLACEMENT_HINT: Partial<Record<BuildingTypeId, Terrain>> = {
  field: 'fertile',
  mine: 'rock',
  bridge: 'river',
  ferry: 'river',
  dock: 'river',
};

export interface SceneOptions {
  alpha: number; // 서브틱 사이 이동 보간 계수 0~1
  hover: { x: number; y: number } | null;
  placingType: BuildingTypeId | null;
  selected: { x: number; y: number } | null;
  selectedResidentId: number | null;
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
  for (const r of state.residents) {
    if (!r.alive) continue;
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
function drawSmoke(ctx: CanvasRenderingContext2D, bx: number, by: number, id: number, footprint: number): void {
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


function drawBattleClash(ctx: CanvasRenderingContext2D, frontX: number, frontY: number): void {
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

export function renderScene(canvas: HTMLCanvasElement, state: GameState, o: SceneOptions): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const sprites = o.sprites ?? placeholderSprites;
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

  // 2) 건물 — 지붕이 위 타일에 겹치므로 y 순서로 그린다
  const season = getSeason(state.day);
  const heating = (season === 'autumn' || season === 'winter') && state.resources.firewood > 0;
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
      growth01: b.type === 'field' ? b.fieldGrowth / 100 : undefined,
      connections: b.built && isWallBuilding(b.type)
        ? wallConnectionsFromSet(wallTiles, b.x, b.y)
        : undefined,
      x: b.x * TILE, y: b.y * TILE, size,
    });
    // 아궁이에 불을 땔 때 온돌집/중심지 굴뚝에서 연기가 오른다
    if (b.built && heating && (b.type === 'ondol' || b.type === 'center')) {
      drawSmoke(ctx, b.x * TILE, b.y * TILE, b.id, footprint);
    }
  }

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

  // 4) 주민
  for (const r of state.residents) {
    if (!r.alive) continue;
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

  // 5) 습격 무리 (+겨울 눈밭 발자국)
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
    });
    if (state.battle?.phase === 'clash') drawBattleClash(ctx, state.battle.frontX, state.battle.frontY);
  }

  // 6) 밤낮 색조 — 하루 진행도(subTick+보간)로 계산. 세계를 물들이고 창에는 불이 켜진다.
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
    const ok = isBuildingFootprintExplored(state, o.placingType, o.hover.x, o.hover.y) &&
      canPlaceBuildingAt(state, o.placingType, o.hover.x, o.hover.y) &&
      canAfford(state, def);
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
