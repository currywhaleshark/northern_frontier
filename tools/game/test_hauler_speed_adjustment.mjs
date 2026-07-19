import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-hauler-speed-'));
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

assert.equal(CONFIG.agents.haulerMoveSpeedMultiplier, 1.1,
  'hauler round trips receive the requested small speed adjustment');
assert.equal(equipment.haulingMoveSpeedMultiplier({ job: 'hauler' }), 1.1,
  'the speed adjustment applies to haulers');
assert.equal(equipment.haulingMoveSpeedMultiplier({ job: 'farmer' }), 1,
  'the speed adjustment does not change ordinary resident movement');

const agentsSource = readFileSync(new URL('../../src/game/agents.ts', import.meta.url), 'utf8');
assert.match(agentsSource, /sp \*= haulingMoveSpeedMultiplier\(r\);/,
  'weather-adjusted movement speed receives the hauler multiplier exactly once');
assert.match(agentsSource, /const steps = moveSteps\(state, r, ctx\);/,
  'movement step calculation receives the resident whose job controls the adjustment');

console.log('hauler speed adjustment tests passed');
