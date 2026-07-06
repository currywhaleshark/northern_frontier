import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-resident-gender-tests-'));
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

class MemoryStorage {
  constructor() {
    this.values = new Map();
  }

  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }

  setItem(key, value) {
    this.values.set(key, String(value));
  }

  removeItem(key) {
    this.values.delete(key);
  }
}

function isGender(value) {
  return value === 'male' || value === 'female';
}

const compiledDir = compileGameModules();
const simulation = await import(pathToFileURL(join(compiledDir, 'simulation.mjs')).href);
const residents = await import(pathToFileURL(join(compiledDir, 'residents.mjs')).href);
const saveLoad = await import(pathToFileURL(join(compiledDir, 'saveLoad.mjs')).href);

{
  const state = simulation.newGame(123);
  assert.ok(state.residents.length > 0);
  assert.ok(state.residents.every(r => isGender(r.gender)));
}

{
  const state = simulation.newGame(456);
  const createdFemale = residents.createResident(state, () => 0.25, 'farmer');
  const createdMale = residents.createResident(state, () => 0.75, 'hunter');
  assert.equal(createdFemale.gender, 'female');
  assert.equal(createdMale.gender, 'male');
}

{
  globalThis.localStorage = new MemoryStorage();
  const oldState = simulation.newGame(789);
  for (const resident of oldState.residents) delete resident.gender;
  localStorage.setItem('buksae-save-v3', JSON.stringify(oldState));

  const loaded = saveLoad.loadGame();
  assert.ok(loaded);
  assert.ok(loaded.residents.every(r => isGender(r.gender)));

  localStorage.setItem('buksae-save-v3', JSON.stringify(oldState));
  const loadedAgain = saveLoad.loadGame();
  assert.ok(loadedAgain);
  assert.deepEqual(
    loadedAgain.residents.map(r => r.gender),
    loaded.residents.map(r => r.gender),
  );
}

console.log('resident gender tests passed');
