import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-hunt-beast-ai-tests-'));
  for (const file of readdirSync(srcDir).filter(candidate => candidate.endsWith('.ts'))) {
    const source = readFileSync(new URL(file, srcDir), 'utf8');
    let output = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    output = output.replace(/(from\s+['"])(\.{1,2}\/[^'"]+)(['"])/g, (_match, start, specifier, end) =>
      /\.[cm]?js$/.test(specifier) ? `${start}${specifier}${end}` : `${start}${specifier}.mjs${end}`);
    writeFileSync(join(outDir, file.replace(/\.ts$/, '.mjs')), output, 'utf8');
  }
  return outDir;
}

const compiledDir = compileGameModules();
const { chooseBeastAction } = await import(pathToFileURL(join(compiledDir, 'huntBeastAI.mjs')).href);

function group(id, effectivePower, options = {}) {
  return {
    id,
    count: options.count ?? 1,
    effectivePower,
    meleeCapable: options.meleeCapable ?? false,
    spearWall: options.spearWall ?? false,
  };
}

function sector(id, blockade, groups) {
  return { id, blockade, groups };
}

function input(overrides = {}) {
  return {
    sectors: [
      sector('ridge', 42, [group('ridge-strong', 34, { count: 2, meleeCapable: true })]),
      sector('ravine', 15, [group('ravine-weak', 7)]),
      sector('brook', 30, [group('brook-medium', 20, { meleeCapable: true })]),
    ],
    encirclement: 25,
    predatorState: 'hidden',
    predatorKind: 'tiger',
    tigerTier: 'tiger',
    remainingPowerShare: 1,
    decisionRoll: 0.1,
    ...overrides,
  };
}

{
  const action = chooseBeastAction(input());
  assert.deepEqual(action, { kind: 'ambush', sectorId: 'ravine', targetGroupId: 'ravine-weak' });
}

{
  const action = chooseBeastAction(input({
    sectors: [
      sector('ridge', 80, [group('ridge-wall', 80, { count: 4, meleeCapable: true, spearWall: true })]),
      sector('ravine', 75, [group('ravine-wall', 72, { count: 4, meleeCapable: true, spearWall: true })]),
      sector('brook', 78, [group('brook-wall', 76, { count: 4, meleeCapable: true, spearWall: true })]),
    ],
  }));
  assert.deepEqual(action, { kind: 'lurk' });
}

{
  const action = chooseBeastAction(input({ encirclement: 72 }));
  assert.deepEqual(action, { kind: 'breakout', sectorId: 'ravine' });
}

{
  const action = chooseBeastAction(input({ predatorState: 'wounded', encirclement: 30 }));
  assert.deepEqual(action, { kind: 'breakout', sectorId: 'ravine' });
}

{
  const action = chooseBeastAction(input({ encirclement: 100 }));
  assert.deepEqual(action, { kind: 'cornered' });
}

{
  const deterministicInput = input({ decisionRoll: 0.42, baitSectorId: 'brook', trapSectorId: 'ridge' });
  const first = chooseBeastAction(deterministicInput);
  for (let index = 0; index < 20; index += 1) {
    assert.deepEqual(chooseBeastAction(structuredClone(deterministicInput)), first);
  }
}

{
  assert.deepEqual(chooseBeastAction(input({ decisionRoll: 0.99 })), { kind: 'lurk' });
}

{
  assert.deepEqual(chooseBeastAction(input({ decisionRoll: 0.99, baitSectorId: 'ravine' })), {
    kind: 'ambush', sectorId: 'ravine', targetGroupId: 'ravine-weak',
  }, 'bait makes the first viable ambush deterministic even when the normal decision roll would lurk');
}

console.log('hunt beast AI tests passed');
