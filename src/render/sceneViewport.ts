export interface SceneViewport {
  pixelX: number;
  pixelY: number;
  pixelWidth: number;
  pixelHeight: number;
  tileMinX: number;
  tileMinY: number;
  tileMaxX: number;
  tileMaxY: number;
}

export interface SceneViewportInput {
  scrollLeft: number;
  scrollTop: number;
  clientWidth: number;
  clientHeight: number;
  canvasLeft: number;
  canvasTop: number;
  canvasWidth: number;
  canvasHeight: number;
  tileSize: number;
  overscanTiles?: number;
}

const finite = (value: number): number => Number.isFinite(value) ? value : 0;
const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

export function sceneViewportFromScroll(input: SceneViewportInput): SceneViewport {
  const canvasWidth = Math.max(0, finite(input.canvasWidth));
  const canvasHeight = Math.max(0, finite(input.canvasHeight));
  const tileSize = Math.max(1, finite(input.tileSize));
  const overscan = Math.max(0, Math.floor(finite(input.overscanTiles ?? 1))) * tileSize;
  const visibleX = finite(input.scrollLeft) - finite(input.canvasLeft);
  const visibleY = finite(input.scrollTop) - finite(input.canvasTop);
  const visibleRight = visibleX + Math.max(0, finite(input.clientWidth));
  const visibleBottom = visibleY + Math.max(0, finite(input.clientHeight));

  const pixelX = Math.floor(clamp(visibleX - overscan, 0, canvasWidth));
  const pixelY = Math.floor(clamp(visibleY - overscan, 0, canvasHeight));
  const pixelRight = Math.ceil(clamp(visibleRight + overscan, pixelX, canvasWidth));
  const pixelBottom = Math.ceil(clamp(visibleBottom + overscan, pixelY, canvasHeight));
  const tileCountX = Math.ceil(canvasWidth / tileSize);
  const tileCountY = Math.ceil(canvasHeight / tileSize);

  return {
    pixelX,
    pixelY,
    pixelWidth: pixelRight - pixelX,
    pixelHeight: pixelBottom - pixelY,
    tileMinX: clamp(Math.floor(pixelX / tileSize), 0, Math.max(0, tileCountX - 1)),
    tileMinY: clamp(Math.floor(pixelY / tileSize), 0, Math.max(0, tileCountY - 1)),
    tileMaxX: clamp(Math.max(0, Math.ceil(pixelRight / tileSize) - 1), 0, Math.max(0, tileCountX - 1)),
    tileMaxY: clamp(Math.max(0, Math.ceil(pixelBottom / tileSize) - 1), 0, Math.max(0, tileCountY - 1)),
  };
}

export function tileRectIntersectsViewport(
  viewport: SceneViewport,
  x: number,
  y: number,
  width = 1,
  height = 1,
): boolean {
  return x + width - 1 >= viewport.tileMinX && x <= viewport.tileMaxX &&
    y + height - 1 >= viewport.tileMinY && y <= viewport.tileMaxY;
}

export function pixelRectIntersectsViewport(
  viewport: SceneViewport,
  x: number,
  y: number,
  width: number,
  height: number,
): boolean {
  return x + width >= viewport.pixelX && x <= viewport.pixelX + viewport.pixelWidth &&
    y + height >= viewport.pixelY && y <= viewport.pixelY + viewport.pixelHeight;
}
