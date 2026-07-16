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

function memoryStorage(initial = null) {
  let value = initial;
  return {
    getItem(key) {
      assert.equal(key, UI_PREFS_KEY);
      return value;
    },
    setItem(key, next) {
      assert.equal(key, UI_PREFS_KEY);
      value = next;
    },
    value() { return value; },
  };
}

assert.deepEqual(loadUiPrefs(memoryStorage('{broken json')), defaultUiPrefs(),
  'broken JSON must fall back without throwing');
assert.deepEqual(normalizeUiPrefs({ version: 99, starredResources: ['tools'] }), defaultUiPrefs(),
  'an unknown prefs version must reset to defaults');

const normalized = normalizeUiPrefs({
  version: 1,
  starredResources: ['tools', 'tools', 'reputation', 'unknown', 'grain'],
  pinnedResourceGroups: ['materials', 'unknown', 'materials', 'food'],
});
assert.deepEqual(normalized.starredResources, ['tools', 'grain'],
  'prefs must remove duplicates, metrics, and unknown resources');
assert.deepEqual(normalized.pinnedResourceGroups, ['materials', 'food'],
  'prefs must remove duplicate and unknown group pins');

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
assert.equal(JSON.parse(storage.value()).version, 1, 'saved prefs must retain their own schema version');

console.log('ui prefs tests passed');
