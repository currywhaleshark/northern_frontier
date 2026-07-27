import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
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

function transpileDirectory(sourceUrl, targetDir) {
  mkdirSync(targetDir, { recursive: true });
  for (const file of readdirSync(sourceUrl).filter(file => file.endsWith('.ts'))) {
    const source = readFileSync(new URL(file, sourceUrl), 'utf8');
    writeFileSync(join(targetDir, file.replace(/\.ts$/, '.mjs')), transpile(source), 'utf8');
  }
}

const rootDir = mkdtempSync(join(tmpdir(), 'northern-ui-prefs-'));
transpileDirectory(new URL('../../src/game/', import.meta.url), join(rootDir, 'game'));
transpileDirectory(new URL('../../src/ui/', import.meta.url), join(rootDir, 'ui'));

const prefsModule = await import(pathToFileURL(join(rootDir, 'ui', 'uiPrefs.mjs')).href);
const displayModule = await import(pathToFileURL(join(rootDir, 'ui', 'resourceDisplay.mjs')).href);
const {
  LEGACY_BUILD_MENU_OPEN_KEY,
  MAX_STARRED_RESOURCES,
  UI_PREFS_KEY,
  defaultUiPrefs,
  loadUiPrefs,
  normalizeUiPrefs,
  saveUiPrefs,
  setAutoFastForwardSleepingNight,
  setResidentMarkerPrefs,
  setDockWindowLayout,
  setAutoAssignBuildingTypes,
  resetDockWindowLayout,
  toggleAutoAssignBuildingType,
  togglePinnedDockWindow,
  togglePinnedResourceGroup,
  toggleStarredResource,
} = prefsModule;
const { DISPLAY_RESOURCE_ORDER } = displayModule;
const slotsModule = await import(pathToFileURL(join(rootDir, 'game', 'workerSlots.mjs')).href);
const { AUTO_ASSIGN_BUILDING_TYPES } = slotsModule;

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(
    typeof initial === 'string' ? { [UI_PREFS_KEY]: initial } : initial,
  ));
  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, next) {
      values.set(key, next);
    },
    removeItem(key) { values.delete(key); },
    has(key) { return values.has(key); },
    value(key = UI_PREFS_KEY) { return values.get(key) ?? null; },
  };
}

assert.deepEqual(loadUiPrefs(memoryStorage('{broken json')), defaultUiPrefs(),
  'broken JSON must fall back without throwing');
assert.deepEqual(normalizeUiPrefs({ version: 99, starredResources: ['tools'] }), defaultUiPrefs(),
  'an unknown prefs version must reset to defaults');

const normalized = normalizeUiPrefs({
  version: 4,
  starredResources: ['tools', 'tools', 'reputation', 'unknown', 'grain'],
  pinnedResourceGroups: ['materials', 'unknown', 'materials', 'food'],
  buildDrawerLastCategory: 'farming',
  autoAssignBuildingTypes: ['field', 'field', 'unknown', 'smithy'],
  pinnedDockWindows: ['jobs', 'unknown', 'jobs', 'processing', 'residents', 'factions', 'court'],
});
assert.deepEqual(normalized.starredResources, ['tools', 'grain'],
  'prefs must remove duplicates, metrics, and unknown resources');
assert.deepEqual(normalized.pinnedResourceGroups, ['materials', 'food'],
  'prefs must remove duplicate and unknown group pins');
assert.equal(normalized.buildDrawerLastCategory, 'farming');
assert.deepEqual(normalized.autoAssignBuildingTypes, ['field', 'smithy'],
  'auto-assign building preferences must remove duplicates and unknown building types');
assert.deepEqual(normalized.pinnedDockWindows, ['jobs', 'processing', 'residents', 'factions', 'court'],
  'dock preferences must remove duplicate and unknown window pins');
assert.deepEqual(normalized.dockWindowLayouts, {}, 'v4 prefs must start without saved window layouts');
assert.equal(normalized.version, 8, 'v4 prefs must migrate to the current schema without resetting');
assert.deepEqual(normalized.audio, { sfxEnabled: true, sfxVolume: 0.7, musicEnabled: true, musicVolume: 0.7 });
assert.equal(normalized.mapZoom, 1);
assert.equal(normalized.showResidentJobMarkers, true);
assert.equal(normalized.showResidentCargoMarkers, true);
assert.equal(normalized.autoFastForwardSleepingNight, true);

const legacyStorage = memoryStorage({
  [UI_PREFS_KEY]: JSON.stringify({
    version: 1,
    starredResources: ['tools'],
    pinnedResourceGroups: ['materials'],
  }),
  [LEGACY_BUILD_MENU_OPEN_KEY]: JSON.stringify({ 생산: true }),
});
const migrated = loadUiPrefs(legacyStorage);
assert.equal(migrated.version, 8, 'v1 prefs must migrate to the current schema');
assert.deepEqual(migrated.starredResources, ['tools'], 'v1 stars must survive migration');
assert.deepEqual(migrated.pinnedResourceGroups, ['materials'], 'v1 group pins must survive migration');
assert.equal(migrated.buildDrawerLastCategory, 'production',
  'the old open build section should seed the new last category');
assert.equal(legacyStorage.has(LEGACY_BUILD_MENU_OPEN_KEY), false,
  'the legacy build-menu key must be removed after migration');
assert.deepEqual(migrated.autoAssignBuildingTypes, AUTO_ASSIGN_BUILDING_TYPES,
  'pre-auto-assignment UI prefs must default to every supported building type');
assert.deepEqual(migrated.pinnedDockWindows, [], 'older prefs must start with every dock window closed');

const legacyMuted = loadUiPrefs(memoryStorage({
  [UI_PREFS_KEY]: JSON.stringify({ version: 5 }),
  'buksae-muted': '1',
}));
assert.equal(legacyMuted.audio.sfxEnabled, false, 'legacy global mute must migrate to the SE channel');
assert.equal(legacyMuted.audio.musicEnabled, false, 'legacy global mute must migrate to the BGM channel');

const v2Migrated = normalizeUiPrefs({
  version: 2,
  starredResources: ['tools'],
  pinnedResourceGroups: [],
  buildDrawerLastCategory: 'production',
});
assert.deepEqual(v2Migrated.autoAssignBuildingTypes, AUTO_ASSIGN_BUILDING_TYPES,
  'v2 prefs must enable all building types when migrating to automatic assignment');

const v3Migrated = normalizeUiPrefs({
  version: 3,
  starredResources: ['tools'],
  pinnedResourceGroups: [],
  buildDrawerLastCategory: 'production',
  autoAssignBuildingTypes: ['field'],
});
assert.deepEqual(v3Migrated.autoAssignBuildingTypes, ['field'],
  'v3 auto-assignment choices must survive dock preference migration');
assert.deepEqual(v3Migrated.pinnedDockWindows, [], 'v3 prefs must default dock pins to closed');

const v5Layouts = normalizeUiPrefs({
  version: 5,
  starredResources: ['tools'],
  pinnedResourceGroups: ['materials'],
  buildDrawerLastCategory: 'production',
  autoAssignBuildingTypes: ['field'],
  pinnedDockWindows: ['jobs'],
  dockWindowLayouts: {
    jobs: { x: 10.4, y: 20.6, width: 340.2, height: 520.8 },
    minimap: { x: 700, y: 30, width: 280, height: 280 },
    selection: { x: 600, y: 330, width: 380, height: 260 },
    residents: { x: 40, y: 30, width: -1, height: 540 },
    unknown: { x: 1, y: 1, width: 300, height: 200 },
  },
});
assert.deepEqual(v5Layouts.dockWindowLayouts, {
  jobs: { x: 10, y: 21, width: 340, height: 521 },
  minimap: { x: 700, y: 30, width: 280, height: 280 },
  selection: { x: 600, y: 330, width: 380, height: 260 },
}, 'one damaged or unknown window layout must not reset valid layouts or unrelated prefs');
assert.deepEqual(v5Layouts.starredResources, ['tools']);
assert.deepEqual(v5Layouts.pinnedDockWindows, ['jobs']);

const v6Settings = normalizeUiPrefs({
  ...defaultUiPrefs(),
  version: 6,
  audio: { sfxEnabled: false, sfxVolume: 2, musicEnabled: true, musicVolume: -1 },
  mapZoom: 9,
});
assert.deepEqual(v6Settings.audio, {
  sfxEnabled: false,
  sfxVolume: 1,
  musicEnabled: true,
  musicVolume: 0,
});
assert.equal(v6Settings.mapZoom, 2, 'zoom preferences must clamp to the supported range');
assert.equal(v6Settings.showResidentJobMarkers, true,
  'pre-marker prefs must keep resident job markers visible while migrating');
assert.equal(v6Settings.showResidentCargoMarkers, true,
  'pre-marker prefs must keep resident cargo markers visible while migrating');

const v7Markers = normalizeUiPrefs({
  ...defaultUiPrefs(),
  version: 7,
  showResidentJobMarkers: false,
  showResidentCargoMarkers: false,
});
assert.equal(v7Markers.showResidentJobMarkers, false);
assert.equal(v7Markers.showResidentCargoMarkers, false);
assert.equal(v7Markers.autoFastForwardSleepingNight, true,
  'pre-auto-night prefs must enable the existing automatic night behavior while migrating');

const v8NightSpeed = normalizeUiPrefs({
  ...defaultUiPrefs(),
  autoFastForwardSleepingNight: false,
});
assert.equal(v8NightSpeed.autoFastForwardSleepingNight, false);

let prefs = defaultUiPrefs();
for (const resource of DISPLAY_RESOURCE_ORDER.slice(0, MAX_STARRED_RESOURCES)) {
  prefs = toggleStarredResource(prefs, resource);
}
const atLimit = prefs;
prefs = toggleStarredResource(prefs, DISPLAY_RESOURCE_ORDER[MAX_STARRED_RESOURCES]);
assert.strictEqual(prefs, atLimit, 'adding a ninth star must not evict an existing choice');
prefs = toggleStarredResource(prefs, DISPLAY_RESOURCE_ORDER[0]);
assert.equal(prefs.starredResources.length, MAX_STARRED_RESOURCES - 1,
  'an existing star must remain removable at the limit');

prefs = togglePinnedResourceGroup(prefs, 'military');
assert.deepEqual(prefs.pinnedResourceGroups, ['military']);
prefs = togglePinnedResourceGroup(prefs, 'military');
assert.deepEqual(prefs.pinnedResourceGroups, []);

prefs = setAutoAssignBuildingTypes(prefs, ['field']);
assert.deepEqual(prefs.autoAssignBuildingTypes, ['field']);
prefs = setAutoAssignBuildingTypes(prefs, AUTO_ASSIGN_BUILDING_TYPES);
assert.deepEqual(prefs.autoAssignBuildingTypes, AUTO_ASSIGN_BUILDING_TYPES,
  'all supported building types must be selectable together');
prefs = setAutoAssignBuildingTypes(prefs, ['field']);
prefs = toggleAutoAssignBuildingType(prefs, 'smithy');
assert.deepEqual(prefs.autoAssignBuildingTypes, ['field', 'smithy']);
prefs = toggleAutoAssignBuildingType(prefs, 'field');
assert.deepEqual(prefs.autoAssignBuildingTypes, ['smithy']);

prefs = togglePinnedDockWindow(prefs, 'jobs');
assert.deepEqual(prefs.pinnedDockWindows, ['jobs']);
prefs = togglePinnedDockWindow(prefs, 'processing');
assert.deepEqual(prefs.pinnedDockWindows, ['jobs', 'processing']);
prefs = togglePinnedDockWindow(prefs, 'jobs');
assert.deepEqual(prefs.pinnedDockWindows, ['processing']);

prefs = setDockWindowLayout(prefs, 'jobs', { x: 12.4, y: 18.8, width: 340, height: 520 });
assert.deepEqual(prefs.dockWindowLayouts.jobs, { x: 12, y: 19, width: 340, height: 520 });
prefs = resetDockWindowLayout(prefs, 'jobs');
assert.deepEqual(prefs.dockWindowLayouts, {});

prefs = setResidentMarkerPrefs(prefs, { showResidentJobMarkers: false });
assert.equal(prefs.showResidentJobMarkers, false);
assert.equal(prefs.showResidentCargoMarkers, true);
prefs = setResidentMarkerPrefs(prefs, { showResidentCargoMarkers: false });
assert.equal(prefs.showResidentCargoMarkers, false);
prefs = setAutoFastForwardSleepingNight(prefs, false);
assert.equal(prefs.autoFastForwardSleepingNight, false);

const storage = memoryStorage();
saveUiPrefs(normalized, storage);
assert.deepEqual(loadUiPrefs(storage), normalized, 'saved prefs must round-trip independently');
assert.equal(JSON.parse(storage.value()).version, 8, 'saved prefs must retain their own schema version');

console.log('ui prefs tests passed');
