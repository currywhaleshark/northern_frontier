// Kenney Roguelike/RPG Pack (CC0) 기반 스프라이트 아틀라스 구현
// 출처: https://kenney.nl/assets/roguelike-rpg-pack , https://kenney.nl/assets/roguelike-characters
// 라이선스: Creative Commons Zero (퍼블릭 도메인) — 저작자 표기 불필요(감사 표기 권장)
//
// 시트 규격: 16x16 타일, 1px 간격 (pitch 17)
// 이미지가 로드되기 전에는 placeholderSprites가 대신 쓰인다 (getActiveSprites 참고).
import { placeholderSprites, type BuildingDrawParams, type SpriteAPI } from './sprites';
import { CONFIG } from '../game/config';
import { JOB_COLORS } from '../game/constants';
import type { BuildingTypeId, JobId, Season } from '../game/types';
import {
  historicalTerrainSampleOffsetFromHash,
  historicalTerrainSourceRect,
  historicalTerrainVariantFromHash,
} from './historicalTerrain';
import { riverSourceRect } from './riverAutotile';
import {
  GENERATED_TERRAIN_OBJECT_SHEET,
  fertileGroundWash,
  generatedTerrainObjectSourceRect,
  terrainObjectFor,
  type GeneratedTerrainObject,
} from './generatedTerrainObjects';
import { terrainShowsStandaloneGameTrail } from './terrainVisuals';
import {
  GENERATED_BUILDING_SHEET,
  generatedBuildingSourceRect,
} from './generatedBuildingAssets';

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
let loaded = 0;
let started = false;

function ensureLoaded(): void {
  if (started || typeof Image === 'undefined') return;
  started = true;
  sheet = new Image();
  sheet.onload = () => { loaded++; };
  sheet.src = '/assets/roguelikeSheet_transparent.png';
  chars = new Image();
  chars.onload = () => { loaded++; };
  chars.src = '/assets/roguelikeChar_transparent.png';
  riverSheet = new Image();
  riverSheet.onload = () => { loaded++; };
  riverSheet.src = '/assets/river-mask-autotile-28px-sheet.png';
  historicalTerrainSheet = new Image();
  historicalTerrainSheet.onload = () => { loaded++; };
  historicalTerrainSheet.src = '/assets/folk-warm-terrain-v3-28px-sheet.png';
  terrainObjectSheet = new Image();
  terrainObjectSheet.onload = () => { loaded++; };
  terrainObjectSheet.src = GENERATED_TERRAIN_OBJECT_SHEET.src;
  buildingSheet = new Image();
  buildingSheet.onload = () => { loaded++; };
  buildingSheet.src = GENERATED_BUILDING_SHEET.src;
}

export function atlasReady(): boolean {
  ensureLoaded();
  return loaded >= 6;
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
const ICE: CR = [3, 4];
const ROCK_GRAY: CR = [55, 21];
const ROCK_GRAY2: CR = [54, 21];
const ROCK_BROWN: CR = [55, 20];
const ORE_GOLD: CR = [41, 11];

// 나무 변형 (계절별)
const TREES_GREEN: CR[] = [[13, 9], [15, 9], [16, 9], [18, 9], [13, 10], [16, 10]];
const TREES_AUTUMN: CR[] = [[14, 9], [17, 9], [14, 10], [17, 10]];
const TREES_WINTER: CR[] = [[16, 9], [18, 9], [16, 10], [18, 10]];
const BUSHES: CR[] = [[19, 9], [25, 9], [24, 9]];
const BUSHES_AUTUMN: CR[] = [[20, 9], [21, 9]];

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
  storehouse: { roof: ROOF_BROWN, base: FACE_SHOP },
  lumberCamp: { base: LOGS },
  huntLodge:  { base: TENT_TAN },
  herbHut:    { roof: ROOF_BROWN, base: FACE_DOOR, glyph: HERB },
  field:      { base: DIRT }, // 성장 단계는 drawBuilding에서 덧그림
  smithy:     { roof: ROOF_DARK, base: FACE_DOOR, glyph: ANVIL },
  tannery:    { roof: ROOF_BROWN, base: FACE_DOOR, glyph: HIDE },
  beacon:     { base: ROCK_GRAY2, glyph: CAMPFIRE },
  palisade:   { base: FENCE },
  watchtower: { roof: ROOF_WHITE, base: FACE_STONE, roofLift: 12 },
  garrison:   { base: TENT_GREEN, glyph: BANNER_RED },
  market:     { roof: AWNING, base: COUNTER, roofLift: 12 },
};

// ── 주민 캐릭터 매핑 (완성형 캐릭터 열) ──
const CHAR_BY_JOB: Record<JobId, CR> = {
  idle:       [1, 8],
  woodcutter: [1, 6],
  hunter:     [0, 10],
  farmer:     [0, 7],
  builder:    [0, 8],
  hauler:     [1, 7],
  herbalist:  [1, 5],
  smith:      [1, 9],
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

// 사냥터 표식: 타일을 가로지르는 짐승 발자국 두 줄 (좌우 번갈아 찍힌 발굽)
function drawGameTrail(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, h: number): void {
  const f = size / 16;
  const flip = h % 2 === 0; // 타일마다 발자국 방향을 엇갈리게
  ctx.fillStyle = 'rgba(88,58,30,0.75)';
  for (let i = 0; i < 3; i++) {
    const t = (i + 0.5) / 3;
    const bx = x + (flip ? t : 1 - t) * (size - 6 * f) + 2 * f;
    const by = y + t * (size - 7 * f) + 2 * f;
    const side = i % 2 === 0 ? -1 : 1;
    ctx.fillRect(bx + side * 1.6 * f, by, 2 * f, 2.6 * f);
    ctx.fillRect(bx - side * 1.6 * f, by + 3 * f, 2 * f, 2.6 * f);
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

export const atlasSprites: SpriteAPI = {
  id: 'kenney-atlas-river-mask-historical-ground-generated-objects-buildings-v1',

  drawTerrain(ctx, p) {
    if (!sheet) return;
    ctx.imageSmoothingEnabled = false;
    const h = hash(p.tileX, p.tileY);

    // 강: 겨울엔 물 위에 얼음 워시 + 균열을 얹는다 (팩에 전용 얼음 타일이 없음)
    if (p.terrain === 'river') {
      if (riverSheet) {
        const rect = riverSourceRect(p.season, p.frozenRiver, p.banks);
        ctx.drawImage(riverSheet, rect.sx, rect.sy, rect.sw, rect.sh, p.x, p.y, p.size, p.size);
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
    let drewHistoricalGround = false;
    if (historicalTerrainSheet) {
      const rect = historicalTerrainSourceRect(p.terrain, p.season);
      if (rect) {
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
        drewHistoricalGround = true;
      }
    }

    if (!drewHistoricalGround) {
      let base: CR = GRASS;
      if (p.winter) base = GROUND_PALE;
      else if (p.terrain === 'fertile') base = GRASS_FERTILE;
      else if (p.terrain === 'plain' || p.terrain === 'center' || p.terrain === 'hunting') {
        if (p.season === 'spring' && h % 9 === 0) base = GRASS_FLOWER_WHITE;
        else if (p.season === 'summer' && h % 11 === 0) base = GRASS_FLOWER_RED;
      }
      blit(ctx, sheet, base, p.x, p.y, p.size);
    }

    if (p.terrain === 'fertile') {
      ctx.fillStyle = fertileGroundWash(p.season);
      ctx.fillRect(p.x, p.y, p.size, p.size);
    }

    // 지형 오브젝트
    let terrainObject = terrainObjectFor(p.terrain, p.season, p.hasIron ?? false);
    if (terrainObject === 'lowRock' && h % 2 === 1) terrainObject = 'fieldstone';
    if (terrainObject && terrainObjectSheet) {
      blitTerrainObject(ctx, terrainObjectSheet, terrainObject, p.x, p.y, p.size);
    }

    // 계절 색조 (겨울 눈덮임 / 가을 마름)
    if (!drewHistoricalGround) {
      seasonWash(ctx, p.season, p.x, p.y, p.size);
    }

    // 사냥터: 짐승 발자국을 워시 위에 그려 눈밭에서도 또렷하게 — 사냥터 식별 표식
    if (terrainShowsStandaloneGameTrail(p.terrain)) {
      drawGameTrail(ctx, p.x, p.y, p.size, h);
    }
  },

  drawBuilding(ctx, p: BuildingDrawParams) {
    if (!sheet) return;
    ctx.imageSmoothingEnabled = false;
    const spr = BUILDING_SPRITES[p.type];
    const alpha = p.ghost ? 0.75 : p.built ? 1 : 0.55;
    ctx.globalAlpha = alpha;

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
    if (p.type === 'field' && p.growth01 != null && p.growth01 > 0.05) {
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

  drawResident(ctx, p) {
    if (!chars) return;
    ctx.imageSmoothingEnabled = false;
    const half = CHALF;
    // 걷기 연출: 보브(상하 흔들림) + 이동 방향으로 좌우 반전
    const bob = (p.moving ? Math.floor(performance.now() / 130) % 2 : 0) * CF;
    ctx.save();
    ctx.translate(p.x, p.y - bob);
    if (p.facing === -1) ctx.scale(-1, 1);
    blit(ctx, chars, CHAR_BY_JOB[p.job], -half, -half, CHAR);
    ctx.restore();
    // 직업 식별 점 (머리 위)
    ctx.fillStyle = JOB_COLORS[p.job];
    const dot = Math.max(3, Math.round(3 * CF));
    ctx.fillRect(p.x - dot / 2, p.y - half - 3 * CF - bob, dot, dot);
    if (p.sick) {
      ctx.fillStyle = '#e06c5c';
      ctx.font = `bold ${Math.round(9 * CF)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('+', p.x + half - 2 * CF, p.y - half + 2 * CF);
    }
    if (p.carrying) {
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

  drawRaiders(ctx, p) {
    if (!chars) return;
    ctx.imageSmoothingEnabled = false;
    for (let i = 0; i < p.count; i++) {
      const ox = ((i * 17) % 15 - 7) * 1.1 * CF;
      const oy = ((i * 29) % 11 - 5) * 1.1 * CF;
      // 개별로 어긋난 보브 — 무리가 꿈틀대며 이동하는 느낌
      const bob = (p.moving ? Math.floor(performance.now() / 130 + i) % 2 : 0) * CF;
      ctx.save();
      ctx.translate(p.x + ox, p.y + oy - bob);
      if (p.facing === -1) ctx.scale(-1, 1);
      blit(ctx, chars, CHAR_RAIDER, -CHALF, -CHALF, CHAR);
      ctx.restore();
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
