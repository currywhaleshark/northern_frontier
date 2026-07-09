import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-game-tests-'));
  const files = readdirSync(srcDir).filter(file => file.endsWith('.ts'));
  for (const file of files) {
    const source = readFileSync(new URL(file, srcDir), 'utf8');
    let output = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.ES2022,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText;
    output = output.replace(/(from\s+['"])(\.{1,2}\/[^'"]+)(['"])/g, (_match, start, spec, end) => {
      if (/\.[cm]?js$/.test(spec)) return `${start}${spec}${end}`;
      return `${start}${spec}.mjs${end}`;
    });
    writeFileSync(join(outDir, file.replace(/\.ts$/, '.mjs')), output, 'utf8');
  }
  return outDir;
}

const store = new Map();
globalThis.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, v),
  removeItem: k => store.delete(k),
};

const compiledDir = compileGameModules();
const simulation = await import(pathToFileURL(join(compiledDir, 'simulation.mjs')).href);
const saveLoad = await import(pathToFileURL(join(compiledDir, 'saveLoad.mjs')).href);

{
  const state = simulation.newGame(2026070902);
  for (const resident of state.residents) delete resident.assignedBuildingId;

  saveLoad.saveGame(state);
  const loaded = saveLoad.loadGame();

  assert.ok(loaded);
  assert.ok(loaded.residents.length > 0);
  assert.ok(loaded.residents.every(resident => resident.assignedBuildingId === null));
}

{
  const state = simulation.newGame(2026070903);
  for (const resident of state.residents) resident.assignedBuildingId = 'bad-value';

  saveLoad.saveGame(state);
  const loaded = saveLoad.loadGame();

  assert.ok(loaded);
  assert.ok(loaded.residents.length > 0);
  assert.ok(loaded.residents.every(resident => resident.assignedBuildingId === null));
}

console.log('worker slot save-load tests passed');
