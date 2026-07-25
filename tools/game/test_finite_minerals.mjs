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
      /\.[cm]?js$/.test(spec) ? start + spec + end : start + spec + '.mjs' + end);
    writeFileSync(join(outDir, file.replace(/\.ts$/, '.mjs')), output, 'utf8');
  }
  return outDir;
}

const compiledDir = compileGameModules();
const simulation = await import(pathToFileURL(join(compiledDir, 'simulation.mjs')).href);
const agents = await import(pathToFileURL(join(compiledDir, 'agents.mjs')).href);
const minerals = await import(pathToFileURL(join(compiledDir, 'minerals.mjs')).href);
const { CONFIG } = await import(pathToFileURL(join(compiledDir, 'config.mjs')).href);

assert.equal(minerals.mineralVisualTier(1), 'trace');
assert.equal(minerals.mineralVisualTier(20), 'small');
assert.equal(minerals.mineralVisualTier(40), 'medium');
assert.equal(minerals.mineralVisualTier(65), 'large');
assert.equal(minerals.mineralVisualTier(90), 'huge');
assert.equal(minerals.mineralVisualTier(50), 'medium');
assert.equal(minerals.mineralVisualTier(100), 'huge');

let naturalStoneCount = 0;
let naturalIronCount = 0;
const generationSeeds = Array.from({ length: 32 }, (_value, index) => 1 + index * 104729);
for (const seed of generationSeeds) {
  const state = simulation.newGame(seed);
  const center = state.buildings.find(building => building.type === 'center');
  assert.ok(center);
  const rocks = state.map.flat().filter(tile => tile.terrain === 'rock');
  const nearbyStone = rocks.find(tile =>
    !tile.hasIron && tile.mineralRemaining === CONFIG.minerals.nearbyStone);
  const nearbyIron = rocks.find(tile =>
    tile.hasIron && tile.mineralRemaining === CONFIG.minerals.nearbyIron);
  assert.ok(nearbyStone, 'seed ' + seed + ' has a guaranteed nearby stone deposit');
  assert.ok(nearbyIron, 'seed ' + seed + ' has a guaranteed nearby iron deposit');

  for (const deposit of [nearbyStone, nearbyIron]) {
    const distance = Math.abs(deposit.x - center.x) + Math.abs(deposit.y - center.y);
    assert.ok(distance >= CONFIG.minerals.nearbyMinDistance);
    assert.ok(distance <= CONFIG.minerals.nearbyMaxDistance);
    const reachableByResident = state.residents.some(resident =>
      agents.findPath(state, resident.x, resident.y, tile => tile === deposit));
    assert.ok(
      reachableByResident,
      `seed ${seed} residents cannot reach nearby ${deposit.hasIron ? 'iron' : 'stone'} at ${deposit.x},${deposit.y}`,
    );
  }

  for (const tile of rocks) {
    assert.ok(minerals.mineralRemaining(tile) > 0);
    if (tile.mineralRemaining === CONFIG.minerals.nearbyStone ||
        tile.mineralRemaining === CONFIG.minerals.nearbyIron) continue;
    if (tile.hasIron) {
      naturalIronCount++;
      assert.ok(tile.mineralRemaining >= CONFIG.minerals.ironMin);
      assert.ok(tile.mineralRemaining <= CONFIG.minerals.ironMax);
    } else {
      naturalStoneCount++;
      assert.ok(tile.mineralRemaining >= CONFIG.minerals.stoneMin);
      assert.ok(tile.mineralRemaining <= CONFIG.minerals.stoneMax);
    }
  }
}
assert.ok(naturalStoneCount > 0);
assert.ok(naturalIronCount > 0);

{
  const tile = {
    x: 0, y: 0, terrain: 'rock', hasIron: true, mineralRemaining: 1.5, buildingId: null,
  };
  const result = minerals.extractMineralDeposit(tile, 3);
  assert.equal(result.resource, 'iron');
  assert.equal(result.amount, 1.5);
  assert.equal(result.remaining, 0);
  assert.equal(result.depleted, true);
  assert.equal(tile.terrain, 'plain');
  assert.equal(tile.hasIron, false);
}

console.log('finite mineral tests passed');
