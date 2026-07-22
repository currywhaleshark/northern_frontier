export const DOCK_WINDOW_IDS = ['jobs', 'processing', 'residents', 'specialResidents', 'factions', 'court', 'incidents'] as const;
export const HUD_WINDOW_IDS = ['minimap', 'selection'] as const;
export const FLOATING_WINDOW_IDS = [...DOCK_WINDOW_IDS, ...HUD_WINDOW_IDS] as const;

export type DockWindowId = typeof DOCK_WINDOW_IDS[number];
export type HudWindowId = typeof HUD_WINDOW_IDS[number];
export type FloatingWindowId = typeof FLOATING_WINDOW_IDS[number];

export function isDockWindowId(value: unknown): value is DockWindowId {
  return typeof value === 'string' && (DOCK_WINDOW_IDS as readonly string[]).includes(value);
}
