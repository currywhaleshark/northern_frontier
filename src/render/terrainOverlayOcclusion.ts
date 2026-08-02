import { isNaturalWaterTerrain } from '../game/terrain';
import type { ForeignSite, Tile } from '../game/types';
import { FOREIGN_SITE_CORE_SHEET } from './foreignSiteAssets';
import { TERRAIN_GROWTH_DRAW_SIZE } from './terrainGrowthAssets';

export interface PixelRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function intersects(a: PixelRect, b: PixelRect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x &&
    a.y < b.y + b.h && a.y + a.h > b.y;
}

function containsPoint(rect: PixelRect, x: number, y: number): boolean {
  return x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h;
}

export function mountainOverlayBounds(tileX: number, tileY: number, tileSize: number): PixelRect {
  return {
    x: tileX * tileSize + (tileSize - TERRAIN_GROWTH_DRAW_SIZE.width) / 2,
    y: (tileY + 1) * tileSize - TERRAIN_GROWTH_DRAW_SIZE.height,
    w: TERRAIN_GROWTH_DRAW_SIZE.width,
    h: TERRAIN_GROWTH_DRAW_SIZE.height,
  };
}

export function foreignSiteCoreBounds(site: Pick<ForeignSite, 'x' | 'y' | 'width' | 'height'>, tileSize: number): PixelRect {
  const size = Math.max(site.width, site.height) * tileSize;
  const height = FOREIGN_SITE_CORE_SHEET.spriteHeight * (size / FOREIGN_SITE_CORE_SHEET.spriteWidth);
  return {
    x: site.x * tileSize,
    y: site.y * tileSize + size - height,
    w: size,
    h: height,
  };
}

/** 산 돌출부가 덮으면 안 되는 자연수와 발견된 외부 거점의 실제 화면 영역. */
export function mountainOverlayBlockers(
  map: readonly Tile[][],
  foreignSites: readonly ForeignSite[],
  tileX: number,
  tileY: number,
  tileSize: number,
): PixelRect[] {
  const bounds = mountainOverlayBounds(tileX, tileY, tileSize);
  const minTileX = Math.max(0, Math.floor(bounds.x / tileSize));
  const maxTileX = Math.min((map[0]?.length ?? 1) - 1, Math.ceil((bounds.x + bounds.w) / tileSize) - 1);
  const minTileY = Math.max(0, Math.floor(bounds.y / tileSize));
  const maxTileY = Math.min(map.length - 1, Math.ceil((bounds.y + bounds.h) / tileSize) - 1);
  const blockers: PixelRect[] = [];

  for (let y = minTileY; y <= maxTileY; y++) {
    for (let x = minTileX; x <= maxTileX; x++) {
      const tile = map[y]?.[x];
      if (!tile || !isNaturalWaterTerrain(tile.terrain)) continue;
      blockers.push({ x: x * tileSize, y: y * tileSize, w: tileSize, h: tileSize });
    }
  }
  for (const site of foreignSites) {
    if (!site.discovered) continue;
    const siteBounds = foreignSiteCoreBounds(site, tileSize);
    if (intersects(bounds, siteBounds)) blockers.push(siteBounds);
  }
  return blockers;
}

/**
 * 겹치는 차단 사각형도 다시 뚫리지 않도록 경계 격자로 분할한 비중첩 가시 영역을 만든다.
 * Canvas clip의 even-odd 중첩 반전을 피하기 위한 순수 계산이다.
 */
export function visibleOverlayRects(bounds: PixelRect, blockers: readonly PixelRect[]): PixelRect[] {
  const relevant = blockers.filter(blocker => intersects(bounds, blocker));
  if (relevant.length === 0) return [bounds];
  const xs = new Set<number>([bounds.x, bounds.x + bounds.w]);
  const ys = new Set<number>([bounds.y, bounds.y + bounds.h]);
  for (const blocker of relevant) {
    xs.add(Math.max(bounds.x, blocker.x));
    xs.add(Math.min(bounds.x + bounds.w, blocker.x + blocker.w));
    ys.add(Math.max(bounds.y, blocker.y));
    ys.add(Math.min(bounds.y + bounds.h, blocker.y + blocker.h));
  }
  const sortedX = [...xs].sort((a, b) => a - b);
  const sortedY = [...ys].sort((a, b) => a - b);
  const visible: PixelRect[] = [];
  for (let yi = 0; yi < sortedY.length - 1; yi++) {
    for (let xi = 0; xi < sortedX.length - 1; xi++) {
      const x = sortedX[xi];
      const y = sortedY[yi];
      const w = sortedX[xi + 1] - x;
      const h = sortedY[yi + 1] - y;
      if (w <= 0 || h <= 0) continue;
      const centerX = x + w / 2;
      const centerY = y + h / 2;
      if (relevant.some(blocker => containsPoint(blocker, centerX, centerY))) continue;
      visible.push({ x, y, w, h });
    }
  }
  return visible;
}
