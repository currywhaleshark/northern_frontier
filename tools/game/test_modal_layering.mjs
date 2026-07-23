import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../../src/styles/global.css', import.meta.url), 'utf8');
const gameMenu = readFileSync(new URL('../../src/components/GameMenu.tsx', import.meta.url), 'utf8');
const saveSlot = readFileSync(new URL('../../src/components/SaveSlotDialog.tsx', import.meta.url), 'utf8');

const layerFor = selector => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`${escaped}\\s*\\{[^}]*--modal-layer:\\s*(\\d+)`, 's'));
  assert.ok(match, `${selector} defines an explicit modal layer`);
  return Number(match[1]);
};

assert.match(css, /\.modal-overlay\s*\{[^}]*z-index:\s*var\(--modal-layer,\s*100\)/s,
  'modal overlays use the element-specific layer with a safe default');
assert.match(gameMenu, /modal-overlay game-menu-overlay/,
  'game menu opts into the game menu modal layer');
assert.match(saveSlot, /modal-overlay save-slot-overlay/,
  'save slot dialog opts into the save dialog modal layer');

const gameMenuLayer = layerFor('.game-menu-overlay');
const saveSlotLayer = layerFor('.save-slot-overlay');
assert.ok(gameMenuLayer > 100, 'game menu stays above ordinary modals');
assert.ok(saveSlotLayer > gameMenuLayer, 'save dialog stays above the open game menu');

console.log('modal layering tests passed');
