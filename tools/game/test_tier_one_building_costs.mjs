import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-game-tests-'));
  for (const file of readdirSync(srcDir).filter(file => file.endsWith('.ts'))) {
    const source = readFileSync(new URL(file, srcDir), 'utf8');
    let output = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    output = output.replace(/(from\s+['"])(\.{1,2}\/[^'"]+)(['"])/g, (_match, start, spec, end) =>
      /\.[cm]?js$/.test(spec) ? `${start}${spec}${end}` : `${start}${spec}.mjs${end}`);
    writeFileSync(join(outDir, file.replace(/\.ts$/, '.mjs')), output, 'utf8');
  }
  return outDir;
}

const compiledDir = compileGameModules();
const { BUILDING_DEFS } = await import(pathToFileURL(join(compiledDir, 'buildings.mjs')).href);
const { CONFIG } = await import(pathToFileURL(join(compiledDir, 'config.mjs')).href);

const expected = {
  hut: { wood: 7 },
  storehouse: { wood: 9, stone: 2 },
  cellar: { wood: 5, stone: 3 },
  bridge: { wood: 14, stone: 9 },
  lumberCamp: { wood: 5 },
  woodShed: { wood: 7, stone: 2, tools: 1 },
  huntLodge: { wood: 7, hide: 2 },
  herbHut: { wood: 5 },
  field: { wood: 2, tools: 1 },
  smithy: { wood: 9, stone: 5 },
  tannery: { wood: 7, tools: 1 },
  beacon: { wood: 5, stone: 11 },
  palisade: { wood: 4 },
  gate: { wood: 5 },
  watchtower: { wood: 9, stone: 2 },
  garrison: { wood: 18, stone: 9, iron: 4 },
  market: { wood: 11, stone: 4 },
};

for (const [type, cost] of Object.entries(expected)) {
  assert.deepEqual(BUILDING_DEFS[type].cost, cost, `${type} keeps the tuned tier-one cost`);
}

assert.deepEqual(BUILDING_DEFS.ondol.cost, { wood: 12, stone: 8 });
assert.deepEqual(BUILDING_DEFS.watermill.cost, { wood: 16, stone: 10, tools: 2 });
assert.deepEqual(BUILDING_DEFS.cannonEmplacement.cost, { wood: 6, stone: 10 });

const openingPackage = ['hut', 'bridge', 'woodShed', 'field']
  .map(type => BUILDING_DEFS[type].cost)
  .reduce((sum, cost) => ({
    wood: sum.wood + (cost.wood ?? 0),
    stone: sum.stone + (cost.stone ?? 0),
    tools: sum.tools + (cost.tools ?? 0),
  }), { wood: 0, stone: 0, tools: 0 });
assert.ok(openingPackage.wood <= CONFIG.start.resources.wood);
assert.ok(openingPackage.stone <= CONFIG.start.resources.stone);
assert.ok(openingPackage.tools <= CONFIG.start.resources.tools);

assert.ok(
  BUILDING_DEFS.bridge.cost.stone + BUILDING_DEFS.smithy.cost.stone > CONFIG.start.resources.stone,
  'bridge plus smithy still requires additional stone gathering',
);

console.log('tier-one building cost tests passed');
