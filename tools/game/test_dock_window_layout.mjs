import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function transpile(source) {
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return output.replace(/(from\s+['"])(\.{1,2}\/[^'"]+)(['"])/g, (_match, start, spec, end) => {
    if (/\.[cm]?js$/.test(spec)) return `${start}${spec}${end}`;
    return `${start}${spec}.mjs${end}`;
  });
}

const rootDir = mkdtempSync(join(tmpdir(), 'northern-dock-layout-'));
const uiDir = join(rootDir, 'ui');
mkdirSync(uiDir, { recursive: true });
for (const file of ['dockPresentation.ts', 'dockLayout.ts']) {
  const source = readFileSync(new URL(`../../src/ui/${file}`, import.meta.url), 'utf8');
  writeFileSync(join(uiDir, file.replace(/\.ts$/, '.mjs')), transpile(source), 'utf8');
}

const presentation = await import(pathToFileURL(join(uiDir, 'dockPresentation.mjs')).href);
const layoutModule = await import(pathToFileURL(join(uiDir, 'dockLayout.mjs')).href);
const {
  DOCK_DEFAULT_HUD_GAP,
  DOCK_DEFAULT_HUD_LANE_WIDTH,
  DOCK_VIEWPORT_INSETS,
  DOCK_WINDOW_MIN_SIZE,
  bringDockWindowToFront,
  clampDockWindowLayout,
  defaultDockWindowLayout,
  moveDockWindowLayout,
  normalizeDockWindowLayouts,
  resizeDockWindowLayout,
} = layoutModule;

const viewport = { width: 1600, height: 900 };
for (const [index, id] of presentation.DOCK_WINDOW_IDS.entries()) {
  const layout = defaultDockWindowLayout(id, viewport, index);
  assert.ok(layout.width >= DOCK_WINDOW_MIN_SIZE.width && layout.height >= DOCK_WINDOW_MIN_SIZE.height,
    `${id} must have a usable default size`);
  assert.ok(layout.x >= DOCK_VIEWPORT_INSETS.left && layout.y >= DOCK_VIEWPORT_INSETS.top,
    `${id} must start inside the stage safe bounds`);
  assert.ok(layout.x + layout.width
    <= viewport.width - DOCK_VIEWPORT_INSETS.right - DOCK_DEFAULT_HUD_LANE_WIDTH - DOCK_DEFAULT_HUD_GAP,
  `${id} must avoid the default lower-right HUD lane on a wide stage`);
}

const defaultMinimap = defaultDockWindowLayout('minimap', viewport);
const defaultSelection = defaultDockWindowLayout('selection', viewport);
assert.equal(defaultSelection.y + defaultSelection.height,
  viewport.height - DOCK_VIEWPORT_INSETS.bottom,
  'the selection context must default to the lower safe edge');
assert.equal(defaultMinimap.y + defaultMinimap.height + DOCK_DEFAULT_HUD_GAP, defaultSelection.y,
  'the minimap must default directly above the lower selection context');
assert.equal(defaultMinimap.x + defaultMinimap.width, viewport.width - DOCK_VIEWPORT_INSETS.right,
  'the minimap must default beside the persistent icon strip');

assert.deepEqual(
  clampDockWindowLayout({ x: -100, y: 9999, width: 9999, height: 10 }, { width: 800, height: 600 }),
  { x: 8, y: 364, width: 738, height: 180 },
  'clamping must keep the whole window inside the usable stage and enforce the minimum height',
);

const moved = moveDockWindowLayout(
  { x: 100, y: 100, width: 300, height: 200 },
  10_000,
  10_000,
  { width: 800, height: 600 },
);
assert.deepEqual(moved, { x: 446, y: 344, width: 300, height: 200 },
  'moving must clamp against the right and bottom safe bounds');

const westResized = resizeDockWindowLayout(
  { x: 100, y: 100, width: 400, height: 300 },
  'nw',
  300,
  250,
  viewport,
);
assert.deepEqual(westResized, { x: 220, y: 220, width: 280, height: 180 },
  'north-west resizing must preserve the opposite corner at the minimum size');

assert.deepEqual(normalizeDockWindowLayouts({
  jobs: { x: 1.4, y: 2.6, width: 300.2, height: 200.8 },
  minimap: { x: 900, y: 20, width: 280, height: 280 },
  processing: { x: 0, y: 0, width: -1, height: 200 },
  unknown: { x: 1, y: 1, width: 100, height: 100 },
}), {
  jobs: { x: 1, y: 3, width: 300, height: 201 },
  minimap: { x: 900, y: 20, width: 280, height: 280 },
},
'saved layouts must round finite values and discard invalid layouts and unknown IDs independently');

const order = ['jobs', 'processing', 'residents'];
assert.strictEqual(bringDockWindowToFront(order, 'residents'), order,
  'focusing the already-top window must preserve array identity');
assert.deepEqual(bringDockWindowToFront(order, 'jobs'), ['processing', 'residents', 'jobs'],
  'focusing must move only that window to the top');
assert.deepEqual(bringDockWindowToFront(['minimap', 'jobs'], 'selection'), ['minimap', 'jobs', 'selection'],
  'HUD windows and management windows must share one focus order');

console.log('dock window layout tests passed');
