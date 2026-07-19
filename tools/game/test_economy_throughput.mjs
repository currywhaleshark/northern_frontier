import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-economy-throughput-'));
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
const load = name => import(pathToFileURL(join(compiledDir, `${name}.mjs`)).href);
const { CONFIG } = await load('config');
const equipment = await load('equipment');

assert.equal(CONFIG.production.resourceOutputMultiplier, 1.08,
  'gathering, farming, and processing output receives the small eight-percent release adjustment');
assert.equal(CONFIG.agents.carryCapacityMultiplier, 1.1,
  'worker and hauler carrying capacity receives the small ten-percent release adjustment');
assert.equal(equipment.scaledCarryCapacity(10), 11,
  'shared carrying capacity applies the adjustment exactly once');
assert.equal(equipment.haulerCarryCapacity({ job: 'hauler', cartEquipped: false, stage: null }), 11,
  'an adult hauler carries ten percent more without a cart');
assert.ok(Math.abs(equipment.haulerCarryCapacity({ job: 'hauler', cartEquipped: true, stage: null }) - 26.4) < 1e-9,
  'a cart hauler carries ten percent more');
assert.equal(equipment.haulerCarryCapacity({ job: 'hauler', cartEquipped: false, stage: 'youth' }), 5.5,
  'youth half-labor applies after the shared carrying adjustment');

const agentsSource = readFileSync(new URL('../../src/game/agents.ts', import.meta.url), 'utf8');
assert.match(agentsSource, /outputMod:\s*laborOutputMod\s*\*\s*CONFIG\.production\.resourceOutputMultiplier/,
  'the output multiplier is composed once when the daily worker context is built');
assert.equal((agentsSource.match(/ctx\.outputMod/g) ?? []).length, 13,
  'all thirteen gathering, farming, crafting, and livestock output paths use the shared output modifier');
assert.match(agentsSource, /performPhysicianTreatment\(state, r, effOf\(r\) \* ctx\.mMod, ctx\.rng\)/,
  'the resource adjustment does not boost physician treatment strength');
assert.match(agentsSource, /scaledCarryCapacity\(o\.cap\)/,
  'gatherers use the shared carrying adjustment');
assert.match(agentsSource,
  /return scaledCarryCapacity\(capacities\[resource\] \?\? CONFIG\.agents\.haulerCarryCap\);/,
  'processing workers use the shared carrying adjustment when fetching inputs');

const simulationSource = readFileSync(new URL('../../src/game/simulation.ts', import.meta.url), 'utf8');
assert.match(simulationSource, /적재량이 \$\{haulerCarryCapacity\(resident\)\}/,
  'the cart equipment log displays the adjusted carrying capacity');

console.log('economy throughput adjustment tests passed');
