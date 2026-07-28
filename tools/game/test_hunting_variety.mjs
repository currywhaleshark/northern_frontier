import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-hunting-variety-'));
  for (const file of readdirSync(srcDir).filter(file => file.endsWith('.ts'))) {
    const source = readFileSync(new URL(file, srcDir), 'utf8');
    let output = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    output = output.replace(/(from\s+['"])(\.{1,2}\/[^'"]+)(['"])/g, (_m, start, spec, end) =>
      /\.[cm]?js$/.test(spec) ? `${start}${spec}${end}` : `${start}${spec}.mjs${end}`);
    writeFileSync(join(outDir, file.replace(/\.ts$/, '.mjs')), output, 'utf8');
  }
  return outDir;
}

const compiledDir = compileGameModules();
const hunting = await import(pathToFileURL(join(compiledDir, 'hunting.mjs')).href);
const agentsSource = readFileSync(new URL('../../src/game/agents.ts', import.meta.url), 'utf8');
const sessionSource = readFileSync(new URL('../../src/GameSession.tsx', import.meta.url), 'utf8');

assert.deepEqual(hunting.HUNT_PREY_ORDER, ['rabbit', 'pheasant', 'roeDeer', 'wildBoar']);
assert.equal(hunting.selectHuntPrey(0).id, 'rabbit');
assert.equal(hunting.selectHuntPrey(0.299999).id, 'rabbit');
assert.equal(hunting.selectHuntPrey(0.3).id, 'pheasant');
assert.equal(hunting.selectHuntPrey(0.55).id, 'roeDeer');
assert.equal(hunting.selectHuntPrey(0.85).id, 'wildBoar');

const defs = hunting.HUNT_PREY_DEFS;
assert.equal(defs.pheasant.hide, 0, 'pheasants yield meat only');
assert.ok(defs.rabbit.hide > 0 && defs.rabbit.hide < defs.roeDeer.hide,
  'rabbits yield a small hide');
assert.ok(defs.wildBoar.meat > defs.roeDeer.meat && defs.wildBoar.hide > defs.roeDeer.hide,
  'wild boar yield more meat and hide than roe deer');

const expectedMeat = hunting.HUNT_PREY_ORDER.reduce(
  (sum, id) => sum + defs[id].weight * defs[id].meat,
  0,
);
const expectedHide = hunting.HUNT_PREY_ORDER.reduce(
  (sum, id) => sum + defs[id].weight * defs[id].hide,
  0,
);
assert.ok(Math.abs(expectedMeat - 4) < 0.1,
  'mixed prey preserve the former long-run meat output');
assert.ok(expectedHide >= 0.8 && expectedHide < 1,
  'mixed prey slightly reduce average hide output while preserving the leather chain');
assert.deepEqual(hunting.scaledHuntYield(defs.roeDeer, 4), { meat: 4, hide: 1 });

assert.match(agentsSource, /rollHuntPrey\(ctx\.rng\)/,
  'each completed ordinary hunt rolls a prey species');
assert.match(agentsSource, /taskHaul: resident => `\$\{huntPreyName\(resident\.lastHuntPrey\)\} 운반`/,
  'the resident task exposes the actual carried prey');
assert.doesNotMatch(agentsSource, /노루를 잡아 식량과 가죽/,
  'ordinary hunting is no longer hard-coded to roe deer');
for (const prey of ['토끼', '꿩', '노루', '멧돼지']) {
  assert.ok(sessionSource.includes(`'${prey}'`), `${prey} hunting logs trigger the hunt sound`);
}

console.log('hunting variety tests passed');
