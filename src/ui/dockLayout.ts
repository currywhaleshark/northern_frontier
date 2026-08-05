import {
  DOCK_WINDOW_IDS,
  FLOATING_WINDOW_IDS,
  type FloatingWindowId,
} from './dockPresentation';

export interface DockWindowLayout {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type DockWindowLayouts = Partial<Record<FloatingWindowId, DockWindowLayout>>;

export interface DockViewport {
  width: number;
  height: number;
}

export type DockResizeEdge = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';

export const DOCK_WINDOW_MIN_SIZE = { width: 280, height: 180 } as const;
export const DOCK_VIEWPORT_INSETS = { top: 8, right: 54, bottom: 56, left: 8 } as const;
export const DOCK_DEFAULT_HUD_LANE_WIDTH = 360;
export const DOCK_DEFAULT_HUD_GAP = 8;
const DOCK_CASCADE_STEP = 22;

const DEFAULT_DOCK_WINDOW_SIZES: Record<FloatingWindowId, Readonly<{ width: number; height: number }>> = {
  jobs: { width: 340, height: 520 },
  processing: { width: 340, height: 420 },
  residents: { width: 440, height: 540 },
  specialResidents: { width: 420, height: 560 },
  factions: { width: 440, height: 520 },
  court: { width: 420, height: 560 },
  incidents: { width: 380, height: 420 },
  minimap: { width: 280, height: 280 },
  selection: { width: 380, height: 260 },
};

const MAX_SAVED_COORDINATE = 32_768;
const MAX_SAVED_SIZE = 16_384;

function clamp(value: number, minimum: number, maximum: number): number {
  if (maximum <= minimum) return minimum;
  return Math.min(maximum, Math.max(minimum, value));
}

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function normalizeDockWindowLayout(value: unknown): DockWindowLayout | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<DockWindowLayout>;
  if (!finiteNumber(candidate.x) || !finiteNumber(candidate.y)
    || !finiteNumber(candidate.width) || !finiteNumber(candidate.height)) return null;
  if (candidate.x < 0 || candidate.y < 0 || candidate.width <= 0 || candidate.height <= 0) return null;
  if (candidate.x > MAX_SAVED_COORDINATE || candidate.y > MAX_SAVED_COORDINATE
    || candidate.width > MAX_SAVED_SIZE || candidate.height > MAX_SAVED_SIZE) return null;
  return {
    x: Math.round(candidate.x),
    y: Math.round(candidate.y),
    width: Math.round(candidate.width),
    height: Math.round(candidate.height),
  };
}

export function normalizeDockWindowLayouts(value: unknown): DockWindowLayouts {
  if (!value || typeof value !== 'object') return {};
  const candidate = value as Record<string, unknown>;
  const result: DockWindowLayouts = {};
  for (const id of FLOATING_WINDOW_IDS) {
    const layout = normalizeDockWindowLayout(candidate[id]);
    if (layout) result[id] = layout;
  }
  return result;
}

function viewportBounds(viewport: DockViewport) {
  const stageWidth = Math.max(0, Math.round(viewport.width));
  const stageHeight = Math.max(0, Math.round(viewport.height));
  const left = Math.min(DOCK_VIEWPORT_INSETS.left, stageWidth);
  const top = Math.min(DOCK_VIEWPORT_INSETS.top, stageHeight);
  const right = Math.max(left, stageWidth - DOCK_VIEWPORT_INSETS.right);
  const bottom = Math.max(top, stageHeight - DOCK_VIEWPORT_INSETS.bottom);
  return { left, top, right, bottom };
}

export function clampDockWindowLayout(layout: DockWindowLayout, viewport: DockViewport): DockWindowLayout {
  const bounds = viewportBounds(viewport);
  const availableWidth = Math.max(0, bounds.right - bounds.left);
  const availableHeight = Math.max(0, bounds.bottom - bounds.top);
  const minimumWidth = Math.min(DOCK_WINDOW_MIN_SIZE.width, availableWidth);
  const minimumHeight = Math.min(DOCK_WINDOW_MIN_SIZE.height, availableHeight);
  const width = clamp(Math.round(layout.width), minimumWidth, availableWidth);
  const height = clamp(Math.round(layout.height), minimumHeight, availableHeight);
  return {
    x: clamp(Math.round(layout.x), bounds.left, bounds.right - width),
    y: clamp(Math.round(layout.y), bounds.top, bounds.bottom - height),
    width,
    height,
  };
}

export function defaultDockWindowLayout(
  id: FloatingWindowId,
  viewport: DockViewport,
  registrationIndex = FLOATING_WINDOW_IDS.indexOf(id),
): DockWindowLayout {
  const size = DEFAULT_DOCK_WINDOW_SIZES[id];
  if (id === 'selection') {
    return clampDockWindowLayout({
      x: Math.round(viewport.width) - DOCK_VIEWPORT_INSETS.right - size.width,
      y: Math.round(viewport.height) - DOCK_VIEWPORT_INSETS.bottom - size.height,
      width: size.width,
      height: size.height,
    }, viewport);
  }
  if (id === 'minimap') {
    const selectionHeight = DEFAULT_DOCK_WINDOW_SIZES.selection.height;
    return clampDockWindowLayout({
      x: Math.round(viewport.width) - DOCK_VIEWPORT_INSETS.right - size.width,
      y: Math.round(viewport.height) - DOCK_VIEWPORT_INSETS.bottom
        - selectionHeight - DOCK_DEFAULT_HUD_GAP - size.height,
      width: size.width,
      height: size.height,
    }, viewport);
  }
  const index = Math.max(0, registrationIndex);
  const offset = (index % DOCK_WINDOW_IDS.length) * DOCK_CASCADE_STEP;
  const hudAvoidingX = Math.round(viewport.width) - DOCK_VIEWPORT_INSETS.right
    - DOCK_DEFAULT_HUD_LANE_WIDTH - DOCK_DEFAULT_HUD_GAP - size.width - offset;
  const x = hudAvoidingX >= DOCK_VIEWPORT_INSETS.left
    ? hudAvoidingX
    : DOCK_VIEWPORT_INSETS.left + offset;
  return clampDockWindowLayout({
    x,
    y: DOCK_VIEWPORT_INSETS.top + offset,
    width: size.width,
    height: size.height,
  }, viewport);
}

export function resolveDockWindowLayout(
  id: FloatingWindowId,
  savedLayout: DockWindowLayout | undefined,
  viewport: DockViewport,
  registrationIndex?: number,
): DockWindowLayout {
  return clampDockWindowLayout(
    savedLayout ?? defaultDockWindowLayout(id, viewport, registrationIndex),
    viewport,
  );
}

export function moveDockWindowLayout(
  start: DockWindowLayout,
  deltaX: number,
  deltaY: number,
  viewport: DockViewport,
): DockWindowLayout {
  return clampDockWindowLayout({
    ...start,
    x: start.x + deltaX,
    y: start.y + deltaY,
  }, viewport);
}

export function resizeDockWindowLayout(
  startLayout: DockWindowLayout,
  edge: DockResizeEdge,
  deltaX: number,
  deltaY: number,
  viewport: DockViewport,
): DockWindowLayout {
  const start = clampDockWindowLayout(startLayout, viewport);
  const bounds = viewportBounds(viewport);
  const minimumWidth = Math.min(DOCK_WINDOW_MIN_SIZE.width, bounds.right - bounds.left);
  const minimumHeight = Math.min(DOCK_WINDOW_MIN_SIZE.height, bounds.bottom - bounds.top);
  const startRight = start.x + start.width;
  const startBottom = start.y + start.height;
  let { x, y, width, height } = start;

  if (edge.includes('e')) {
    width = clamp(Math.round(start.width + deltaX), minimumWidth, bounds.right - start.x);
  } else if (edge.includes('w')) {
    x = clamp(Math.round(start.x + deltaX), bounds.left, startRight - minimumWidth);
    width = startRight - x;
  }

  if (edge.includes('s')) {
    height = clamp(Math.round(start.height + deltaY), minimumHeight, bounds.bottom - start.y);
  } else if (edge.includes('n')) {
    y = clamp(Math.round(start.y + deltaY), bounds.top, startBottom - minimumHeight);
    height = startBottom - y;
  }

  return { x, y, width, height };
}

export function bringDockWindowToFront(
  order: readonly FloatingWindowId[],
  id: FloatingWindowId,
): readonly FloatingWindowId[] {
  if (order[order.length - 1] === id) return order;
  return [...order.filter(current => current !== id), id];
}
