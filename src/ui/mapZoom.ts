const MAP_ZOOM_LEVELS = [0.5, 0.67, 0.8, 1, 1.25, 1.5, 2] as const;

export function mapBackingScaleForZoom(zoom: number): 1 | 2 {
  return Number.isFinite(zoom) && zoom >= 2 - 0.001 ? 2 : 1;
}

export function steppedMapZoom(current: number, deltaY: number): number {
  const direction = deltaY < 0 ? 1 : deltaY > 0 ? -1 : 0;
  if (direction === 0) return current;
  const normalized = Math.min(2, Math.max(0.5, current));
  if (direction > 0) {
    return MAP_ZOOM_LEVELS.find(level => level > normalized + 0.001) ?? MAP_ZOOM_LEVELS[MAP_ZOOM_LEVELS.length - 1];
  }
  return [...MAP_ZOOM_LEVELS].reverse().find(level => level < normalized - 0.001) ?? MAP_ZOOM_LEVELS[0];
}
