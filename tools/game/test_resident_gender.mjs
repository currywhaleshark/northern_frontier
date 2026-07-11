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
const constants = await import(pathToFileURL(join(compiledDir, 'constants.mjs')).href);

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
  assert.ok(constants.FEMALE_GIVEN_NAMES.some(name => createdFemale.name.endsWith(name)));
  assert.ok(constants.MALE_GIVEN_NAMES.some(name => createdMale.name.endsWith(name)));
}

{
  assert.ok(constants.SURNAMES.length >= 15 && constants.SURNAMES.length <= 20);
  assert.equal(constants.SURNAME_WEIGHTS.length, constants.SURNAMES.length);
  assert.ok(constants.SURNAME_WEIGHTS[0] > constants.SURNAME_WEIGHTS.at(-1));
  assert.ok(constants.FEMALE_GIVEN_NAMES.length >= 60);
  assert.ok(constants.MALE_GIVEN_NAMES.length >= 60);
  assert.equal(
    constants.FEMALE_GIVEN_NAMES.some(name => constants.MALE_GIVEN_NAMES.includes(name)),
    false,
  );

  const state = simulation.newGame(2024);
  let seed = 0x12345678;
  const rng = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
  for (let i = 0; i < 120; i++) state.residents.push(residents.createResident(state, rng));
  const names = state.residents.map(resident => resident.name);
  assert.equal(new Set(names).size, names.length);
  for (const resident of state.residents) {
    const pool = resident.gender === 'female'
      ? constants.FEMALE_GIVEN_NAMES
      : constants.MALE_GIVEN_NAMES;
    assert.ok(pool.some(name => resident.name.endsWith(name)), `${resident.name} matches ${resident.gender}`);
  }
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
