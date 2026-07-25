import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import ts from 'typescript';

const source = readFileSync(new URL('../../src/game/forestGrowth.ts', import.meta.url), 'utf8');
const output = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const moduleUrl = `data:text/javascript;base64,${Buffer.from(output).toString('base64')}`;
const {
  advanceForestGrowth,
  ensureForestGrowth,
  markForestHarvest,
  setTreeStage,
  treeStageFor,
} = await import(moduleUrl);

const forest = { x: 0, y: 0, terrain: 'forest', hasIron: false, buildingId: null };
assert.equal(treeStageFor(forest), 'mature', 'legacy forest defaults to mature');
assert.equal(markForestHarvest(forest, () => 0, 0.12), true);
assert.equal(forest.treeStage, 'stump');
assert.equal(advanceForestGrowth(forest, 'winter', () => 0, 1, 1), false);
assert.equal(advanceForestGrowth(forest, 'spring', () => 0, 1, 1), true);
assert.equal(forest.treeStage, 'young');
assert.equal(advanceForestGrowth(forest, 'summer', () => 0, 1, 1), true);
assert.equal(forest.treeStage, 'mature');

const plain = { x: 1, y: 0, terrain: 'plain', treeStage: 'young', hasIron: false, buildingId: null };
setTreeStage(plain, 'young');
assert.equal(plain.terrain, 'forest');
assert.equal(treeStageFor(plain), 'young');
plain.terrain = 'plain';
ensureForestGrowth([[forest, plain]]);
assert.equal(forest.treeStage, 'mature');
assert.equal('treeStage' in plain, false);

console.log('forest growth tests passed');
