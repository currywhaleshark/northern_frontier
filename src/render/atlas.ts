// Kenney Roguelike/RPG Pack (CC0) 기반 스프라이트 아틀라스 구현
// 출처: https://kenney.nl/assets/roguelike-rpg-pack , https://kenney.nl/assets/roguelike-characters
// 라이선스: Creative Commons Zero (퍼블릭 도메인) — 저작자 표기 불필요(감사 표기 권장)
//
// 시트 규격: 16x16 타일, 1px 간격 (pitch 17)
// 이미지가 로드되기 전에는 placeholderSprites가 대신 쓰인다 (getActiveSprites 참고).
import {
  placeholderSprites,
  type BuildingDrawParams,
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
import { JOB_COLORS } from '../game/constants';
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
let generatedCharacterSheet: HTMLImageElement | null = null;
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
  const characterSheet = new Image();
  characterSheet.onload = () => {
    generatedCharacterSheet = characterSheet;
  };
  characterSheet.src = GENERATED_CHARACTER_SHEET.src;
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
): void {
  const scale = CHAR / GENERATED_CHARACTER_SHEET.residentWidth;
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
  drawGeneratedCharacterRect(ctx, img, generatedResidentSourceRect(p.job, p.gender), p.x, p.y, p.facing, bob);
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
  tileHouse:  { roof: ROOF_DARK, base: FACE_STONE, glyph: CAMPFIRE },
  storehouse: { roof: ROOF_BROWN, base: FACE_SHOP },
  bridge:     { base: FENCE },
  lumberCamp: { base: LOGS },
  huntLodge:  { base: TENT_TAN },
  herbHut:    { roof: ROOF_BROWN, base: FACE_DOOR, glyph: HERB },
  field:      { base: DIRT }, // 성장 단계는 drawBuilding에서 덧그림
  smithy:     { roof: ROOF_DARK, base: FACE_DOOR, glyph: ANVIL },
  mine:       { base: ROCK_GRAY2, glyph: ANVIL },
  ferry:      { base: TENT_TAN, glyph: WATER },
  charcoalKiln: { base: CAMPFIRE, glyph: LOGS },
  stable:     { base: TENT_TAN, glyph: HIDE },
  nitreYard:  { roof: ROOF_DARK, base: FACE_STONE, glyph: CAMPFIRE },
  dock:       { base: TENT_TAN, glyph: WATER },
  tannery:    { roof: ROOF_BROWN, base: FACE_DOOR, glyph: HIDE },
  beacon:     { base: ROCK_GRAY2, glyph: CAMPFIRE },
  palisade:   { base: FENCE },
  earthFort:  { base: FACE_STONE, glyph: FENCE },
  stoneWall:  { base: FACE_STONE, glyph: FENCE },
  watchtower: { roof: ROOF_WHITE, base: FACE_STONE, roofLift: 12 },
  garrison:   { base: TENT_GREEN, glyph: BANNER_RED },
  office:     { roof: ROOF_DARK, base: FACE_SHOP, glyph: BANNER_RED },
  market:     { roof: AWNING, base: COUNTER, roofLift: 12 },
  cannonEmplacement: { base: FACE_STONE, glyph: BANNER_RED }, // 돌 포대 (전용 그림 나오기 전 임시)
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
  miner:      [1, 9],
  fisher:     [1, 10],
  charcoalBurner: [1, 9],
  herder:     [1, 7],
  powderMaker: [1, 9],
  clerk:      [1, 7],
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

export const atlasSprites: SpriteAPI = {
  id: 'kenney-atlas-river-mask-historical-ground-generated-objects-buildings-v1',

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
    const characterSheet = generatedCharacterSheet;
    const kenneyChars = chars;
    if (!characterSheet && !kenneyChars) return;
    ctx.imageSmoothingEnabled = false;
    const half = CHALF;
    const bob = (p.moving ? Math.floor(performance.now() / 130) % 2 : 0) * CF;

    if (characterSheet) {
      drawGeneratedResident(ctx, characterSheet, p, bob);
    } else if (kenneyChars) {
      ctx.save();
      ctx.translate(p.x, p.y - bob);
      if (p.facing === -1) ctx.scale(-1, 1);
      blit(ctx, kenneyChars, CHAR_BY_JOB[p.job], -half, -half, CHAR);
      ctx.restore();
    }

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
    const characterSheet = generatedCharacterSheet;
    const kenneyChars = chars;
    if (!characterSheet && !kenneyChars) return;
    ctx.imageSmoothingEnabled = false;
    const visible = characterSheet ? Math.min(p.count, 4) : p.count;
    for (let i = 0; i < visible; i++) {
      const ox = ((i * 17) % 15 - 7) * 1.1 * CF;
      const oy = ((i * 29) % 11 - 5) * 1.1 * CF;
      const bob = (p.moving ? Math.floor(performance.now() / 130 + i) % 2 : 0) * CF;
      if (characterSheet) {
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
