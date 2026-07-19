import type { TacticalAnimationEventKind } from './types';

export const TACTICAL_ANIMATION_EVENT_KINDS = Object.freeze([
  'camera', 'bombardment', 'fortify', 'prepareAmbush', 'readyVolley', 'muster', 'evacuate',
  'conceal', 'zoneFall', 'artilleryHit', 'rearAssault', 'advance', 'ambush', 'volley', 'melee',
  'wallAssault', 'wallHit', 'loot', 'retreat', 'fire', 'leaderEscape', 'escapeBlocked',
  'beastReveal', 'beastAmbush', 'beastRout', 'casualty', 'moraleBreak', 'report',
  'doctrineShift',
] satisfies readonly TacticalAnimationEventKind[]);

const TACTICAL_ANIMATION_EVENT_KIND_SET = new Set<string>(TACTICAL_ANIMATION_EVENT_KINDS);

/**
 * UI event players must ignore values for which this guard returns false. This keeps
 * older frontends forward-compatible with event kinds added by a newer backend.
 */
export function isKnownTacticalAnimationEventKind(value: unknown): value is TacticalAnimationEventKind {
  return typeof value === 'string' && TACTICAL_ANIMATION_EVENT_KIND_SET.has(value);
}

