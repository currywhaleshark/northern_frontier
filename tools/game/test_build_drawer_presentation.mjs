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

const rootDir = mkdtempSync(join(tmpdir(), 'northern-build-drawer-'));
transpileDirectory(new URL('../../src/game/', import.meta.url), join(rootDir, 'game'));
transpileDirectory(new URL('../../src/ui/', import.meta.url), join(rootDir, 'ui'));

const { BUILD_MENU_ORDER } = await import(pathToFileURL(join(rootDir, 'game', 'buildings.mjs')).href);
const {
  BUILD_CATEGORIES,
  BUILD_CATEGORY_BY_TYPE,
  beginBuildPlacement,
  buildCategoryFor,
  closedBuildDrawerState,
  finishBuildPlacement,
  isBuildCategoryId,
  toggleBuildDrawerCategory,
} = await import(pathToFileURL(join(rootDir, 'ui', 'buildPresentation.mjs')).href);

const categorized = BUILD_CATEGORIES.flatMap(category => category.types);
assert.equal(BUILD_CATEGORIES.length, 5, 'the persistent build bar must have five categories');
assert.equal(new Set(categorized).size, categorized.length, 'a building must not appear in two drawer categories');
assert.deepEqual([...categorized].sort(), [...BUILD_MENU_ORDER].sort(),
  'every build-menu building must appear in exactly one drawer category');
assert.equal(categorized.includes('center'), false, 'the settlement center is not player-buildable');
assert.equal(buildCategoryFor('field'), 'farming');
assert.equal(buildCategoryFor('cannonEmplacement'), 'defense');
assert.equal(BUILD_CATEGORY_BY_TYPE.office, 'special');
assert.equal(isBuildCategoryId('production'), true);
assert.equal(isBuildCategoryId('unknown'), false);

let drawer = closedBuildDrawerState();
drawer = toggleBuildDrawerCategory(drawer, 'farming');
assert.equal(drawer.openCategory, 'farming', 'a category button must open its drawer');
drawer = beginBuildPlacement(drawer, 'farming');
assert.deepEqual(drawer, { openCategory: null, restoreCategory: 'farming' },
  'starting placement must collapse the drawer and remember its category');
drawer = finishBuildPlacement(drawer, 'housing');
assert.deepEqual(drawer, { openCategory: 'farming', restoreCategory: null },
  'finishing or cancelling placement must restore the originating category');
drawer = toggleBuildDrawerCategory(drawer, 'farming');
assert.equal(drawer.openCategory, null, 'pressing the active category again must close the drawer');

console.log('build drawer presentation tests passed');
