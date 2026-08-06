import { readAppCss } from '../app-stylesheets.mjs';
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
const drawerSource = readFileSync(new URL('../../src/components/BuildDrawer.tsx', import.meta.url), 'utf8');
const cssSource = readAppCss();
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

assert.match(drawerSource, /const currentRankBuildItems = buildItems\.filter\(item => !item\.rankLocked\)/,
  'resource-short buildings must remain in the current-rank group');
assert.match(drawerSource, /const rankLockedBuildItems = buildItems\.filter\(item => item\.rankLocked\)/,
  'only promotion-locked buildings should move into the lower group');
assert.match(drawerSource, /현재 단계[\s\S]*?currentRankBuildItems\.map\(renderBuildItem\)[\s\S]*?승격 후 해금[\s\S]*?rankLockedBuildItems\.map\(renderBuildItem\)/,
  'current-rank buildings must render before promotion-locked buildings');
assert.match(drawerSource, /resourceShortage && <span className="build-drawer-item-status">자원 부족<\/span>/,
  'resource shortages need a distinct disabled badge');
assert.match(drawerSource, /showShortages=\{reason === '자원 부족'\}/,
  'only resource-shortage locks should annotate current stock in the cost line');
assert.match(drawerSource, /shortage \? `\(\$\{available\}\)` : ''/,
  'a missing resource must append the floored current stock after the required amount');
assert.match(cssSource, /\.build-drawer-tooltip-cost-shortage\s*\{[^}]*color:\s*var\(--bad\);[^}]*font-weight:\s*700;/,
  'missing cost entries must use the established red warning color');
assert.match(drawerSource, /title=\{reason \? `사용 불가: \$\{reason\}` : def\.name\}/,
  'unavailable items must preserve an explicit lock reason');
assert.match(cssSource, /\.build-drawer-list\s*\{[\s\S]*grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\)[\s\S]*overflow-y:\s*auto;/,
  'drawer cards must use a four-column vertical scroll grid');
assert.doesNotMatch(cssSource, /\.build-drawer-grid\s*\{[\s\S]*grid-auto-flow:\s*column/,
  'the old horizontal auto-column drawer must be removed');

console.log('build drawer presentation tests passed');
