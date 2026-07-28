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

const rootDir = mkdtempSync(join(tmpdir(), 'northern-resource-display-'));
transpileDirectory(new URL('../../src/game/', import.meta.url), join(rootDir, 'game'));
transpileDirectory(new URL('../../src/ui/', import.meta.url), join(rootDir, 'ui'));

const display = await import(pathToFileURL(join(rootDir, 'ui', 'resourceDisplay.mjs')).href);
const cssSource = readFileSync(new URL('../../src/styles/global.css', import.meta.url), 'utf8');
const topBarSource = readFileSync(new URL('../../src/components/TopBar.tsx', import.meta.url), 'utf8');
const popoverSource = readFileSync(new URL('../../src/components/ResourceBreakdownPopover.tsx', import.meta.url), 'utf8');
const {
  DISPLAY_RESOURCE_ORDER,
  RESOURCE_DISPLAY_GROUPS,
  RESOURCE_DISPLAY_GROUP_BY_RESOURCE,
  STOCK_RESOURCE_ORDER,
  isResourceDisplayGroupLow,
  isResourceLow,
  resourceDisplayGroupTotal,
} = display;

const groupedResources = RESOURCE_DISPLAY_GROUPS.flatMap(group => group.resources);
assert.equal(RESOURCE_DISPLAY_GROUPS.length, 7, 'the top bar must have seven stock groups');
assert.equal(new Set(groupedResources).size, groupedResources.length,
  'a stock resource must not appear in more than one display group');
assert.deepEqual([...groupedResources].sort(), [...STOCK_RESOURCE_ORDER].sort(),
  'every stock resource must appear in exactly one display group');
assert.deepEqual(DISPLAY_RESOURCE_ORDER, groupedResources,
  'starred resource order must follow display group order');
assert.equal(RESOURCE_DISPLAY_GROUP_BY_RESOURCE.rice, 'food', 'unmilled rice belongs in the food display group');
assert.equal(RESOURCE_DISPLAY_GROUP_BY_RESOURCE.salt, 'materials', 'salt belongs in the materials display group');
assert.equal(RESOURCE_DISPLAY_GROUP_BY_RESOURCE.preciousMetal, 'valuables',
  'precious metal has its own display group without changing gameplay luxury rules');
assert.equal('reputation' in RESOURCE_DISPLAY_GROUP_BY_RESOURCE, false, 'reputation is a metric, not stock');
assert.equal('defense' in RESOURCE_DISPLAY_GROUP_BY_RESOURCE, false, 'defense is a metric, not stock');

const resources = Object.fromEntries([
  ...STOCK_RESOURCE_ORDER.map(resource => [resource, 0]),
  ['reputation', 0],
  ['defense', 0],
]);
const state = { resources };
state.resources.tools = 2;
state.resources.wood = 20;
assert.equal(isResourceLow(state, 'tools', 10), true, 'tools below three must be low');
assert.equal(isResourceDisplayGroupLow(state, 'materials', 10), true,
  'a hidden low item must mark its display group as low');
state.resources.porcelain = 2;
state.resources.silk = 3;
state.resources.preciousMetal = 11;
assert.equal(resourceDisplayGroupTotal(state, 'luxury'), 5,
  'the luxury display total must not double-count the separate valuables group');
assert.equal(resourceDisplayGroupTotal(state, 'valuables'), 11,
  'the valuables display total must contain precious metal');
assert.match(topBarSource, /Math\.floor\(resourceDisplayGroupTotal\(state, group\.id\)\)/,
  'top-bar resource group totals must discard fractional stock');
assert.ok((topBarSource.match(/Math\.floor\(state\.resources\[resource\]\)/g) ?? []).length >= 2,
  'top-bar metric and starred resources must discard fractional stock');
assert.match(popoverSource, /Math\.floor\(item\.amount\)/,
  'resource breakdown stock amounts must discard fractional stock');
assert.doesNotMatch(popoverSource, /item\.amount\.toFixed/,
  'resource breakdown stock amounts must not expose fractional stock');

const popoverZIndexMatch = cssSource.match(/\.resource-breakdown-popover\s*\{[^}]*z-index:\s*(\d+);/);
const unifiedLogZIndexMatch = cssSource.match(/\.unified-log\s*\{[^}]*z-index:\s*(\d+);/);
assert.ok(popoverZIndexMatch, 'the resource popover must declare an explicit z-index');
assert.ok(unifiedLogZIndexMatch, 'the unified log must declare an explicit z-index');
assert.ok(Number(popoverZIndexMatch[1]) > Number(unifiedLogZIndexMatch[1]),
  'resource popovers must remain interactive above the upper-left unified log');

console.log('resource display tests passed');
