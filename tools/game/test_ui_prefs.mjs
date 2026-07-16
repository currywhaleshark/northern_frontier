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
  setAutoAssignBuildingTypes,
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
  pinnedDockWindows: ['jobs', 'unknown', 'jobs', 'processing'],
});
assert.deepEqual(normalized.starredResources, ['tools', 'grain'],
  'prefs must remove duplicates, metrics, and unknown resources');
assert.deepEqual(normalized.pinnedResourceGroups, ['materials', 'food'],
  'prefs must remove duplicate and unknown group pins');
assert.equal(normalized.buildDrawerLastCategory, 'farming');
assert.deepEqual(normalized.autoAssignBuildingTypes, ['field', 'smithy'],
  'auto-assign building preferences must remove duplicates and unknown building types');
assert.deepEqual(normalized.pinnedDockWindows, ['jobs', 'processing'],
  'dock preferences must remove duplicate and unknown window pins');

const legacyStorage = memoryStorage({
  [UI_PREFS_KEY]: JSON.stringify({
    version: 1,
    starredResources: ['tools'],
    pinnedResourceGroups: ['materials'],
  }),
  [LEGACY_BUILD_MENU_OPEN_KEY]: JSON.stringify({ 생산: true }),
});
const migrated = loadUiPrefs(legacyStorage);
assert.equal(migrated.version, 4, 'v1 prefs must migrate to the current schema');
assert.deepEqual(migrated.starredResources, ['tools'], 'v1 stars must survive migration');
assert.deepEqual(migrated.pinnedResourceGroups, ['materials'], 'v1 group pins must survive migration');
assert.equal(migrated.buildDrawerLastCategory, 'production',
  'the old open build section should seed the new last category');
assert.equal(legacyStorage.has(LEGACY_BUILD_MENU_OPEN_KEY), false,
  'the legacy build-menu key must be removed after migration');
assert.deepEqual(migrated.autoAssignBuildingTypes, AUTO_ASSIGN_BUILDING_TYPES,
  'pre-auto-assignment UI prefs must default to every supported building type');
assert.deepEqual(migrated.pinnedDockWindows, [], 'older prefs must start with every dock window closed');

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

const storage = memoryStorage();
saveUiPrefs(normalized, storage);
assert.deepEqual(loadUiPrefs(storage), normalized, 'saved prefs must round-trip independently');
assert.equal(JSON.parse(storage.value()).version, 4, 'saved prefs must retain their own schema version');

console.log('ui prefs tests passed');
