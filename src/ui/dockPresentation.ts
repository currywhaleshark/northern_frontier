export const DOCK_WINDOW_IDS = ['jobs', 'processing', 'residents', 'factions', 'court'] as const;

export type DockWindowId = typeof DOCK_WINDOW_IDS[number];

export function isDockWindowId(value: unknown): value is DockWindowId {
  return typeof value === 'string' && (DOCK_WINDOW_IDS as readonly string[]).includes(value);
}
