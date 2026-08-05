import type { DockWindowId } from './dockPresentation';

const DOCK_HOTKEYS: ReadonlyArray<{ key: string; id: DockWindowId }> = [
  { key: 'q', id: 'jobs' },
  { key: 'w', id: 'processing' },
  { key: 'e', id: 'residents' },
  { key: 'r', id: 'specialResidents' },
  { key: 't', id: 'factions' },
  { key: 'y', id: 'court' },
  { key: 'u', id: 'incidents' },
];

export function isEditableTarget(target: EventTarget | null): boolean {
  return typeof HTMLElement !== 'undefined' && target instanceof HTMLElement && (
    target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
  );
}

export function dockWindowForHotkey(key: string): DockWindowId | null {
  return DOCK_HOTKEYS.find(entry => entry.key === key.toLowerCase())?.id ?? null;
}

export function speedForHotkey(code: string): number | null {
  if (code === 'Digit1' || code === 'Numpad1') return 1;
  if (code === 'Digit2' || code === 'Numpad2') return 3;
  return null;
}
