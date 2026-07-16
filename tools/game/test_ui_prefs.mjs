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
  togglePinnedResourceGroup,
  toggleStarredResource,
} = prefsModule;
const { DISPLAY_RESOURCE_ORDER } = displayModule;

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
  version: 2,
  starredResources: ['tools', 'tools', 'reputation', 'unknown', 'grain'],
  pinnedResourceGroups: ['materials', 'unknown', 'materials', 'food'],
  buildDrawerLastCategory: 'farming',
});
assert.deepEqual(normalized.starredResources, ['tools', 'grain'],
  'prefs must remove duplicates, metrics, and unknown resources');
assert.deepEqual(normalized.pinnedResourceGroups, ['materials', 'food'],
  'prefs must remove duplicate and unknown group pins');
assert.equal(normalized.buildDrawerLastCategory, 'farming');

const legacyStorage = memoryStorage({
  [UI_PREFS_KEY]: JSON.stringify({
    version: 1,
    starredResources: ['tools'],
    pinnedResourceGroups: ['materials'],
  }),
  [LEGACY_BUILD_MENU_OPEN_KEY]: JSON.stringify({ 생산: true }),
});
const migrated = loadUiPrefs(legacyStorage);
assert.equal(migrated.version, 2, 'v1 prefs must migrate to the U2 schema');
assert.deepEqual(migrated.starredResources, ['tools'], 'v1 stars must survive migration');
assert.deepEqual(migrated.pinnedResourceGroups, ['materials'], 'v1 group pins must survive migration');
assert.equal(migrated.buildDrawerLastCategory, 'production',
  'the old open build section should seed the new last category');
assert.equal(legacyStorage.has(LEGACY_BUILD_MENU_OPEN_KEY), false,
  'the legacy build-menu key must be removed after migration');

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

const storage = memoryStorage();
saveUiPrefs(normalized, storage);
assert.deepEqual(loadUiPrefs(storage), normalized, 'saved prefs must round-trip independently');
assert.equal(JSON.parse(storage.value()).version, 2, 'saved prefs must retain their own schema version');

console.log('ui prefs tests passed');
