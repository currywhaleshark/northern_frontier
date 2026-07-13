import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-weapon-tests-'));
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

const store = new Map();
globalThis.localStorage = {
  getItem: key => store.get(key) ?? null,
  setItem: (key, value) => store.set(key, value),
  removeItem: key => store.delete(key),
};

const compiledDir = compileGameModules();
const simulation = await import(pathToFileURL(join(compiledDir, 'simulation.mjs')).href);
const buildings = await import(pathToFileURL(join(compiledDir, 'buildings.mjs')).href);
const weapons = await import(pathToFileURL(join(compiledDir, 'weapons.mjs')).href);
const saveLoad = await import(pathToFileURL(join(compiledDir, 'saveLoad.mjs')).href);

function resetJobs(state) {
  for (const resident of state.residents) resident.job = 'idle';
  state.weaponAssignments = {};
}

{
  const state = simulation.newGame(2026071341);
  resetJobs(state);
  const militia = state.residents.slice(0, 4);
  militia.forEach(resident => { resident.job = 'militia'; });
  state.residents[4].job = 'watchman';
  state.residents[5].job = 'hunter';
  state.resources.muskets = 1;
  state.resources.hornBows = 2;
  state.resources.spears = 1;
  state.resources.gunpowder = 0;

  weapons.setAutomaticWeaponAllocation(state);
  assert.equal(state.weaponAllocationMode, 'auto');
  assert.deepEqual(militia.map(resident => state.weaponAssignments[resident.id]), [
    'musket', 'hornBow', 'hornBow', 'spear',
  ]);
  assert.deepEqual(buildings.militiaWeaponAllocation(state), {
    muskets: 0, hornBows: 2, spears: 1, unarmed: 1,
  });
  assert.equal(state.weaponAssignments[militia[0].id], 'musket', 'an unloaded musket stays assigned');

  state.resources.gunpowder = 1;
  assert.equal(buildings.militiaWeaponAllocation(state).muskets, 1);
}

{
  const state = simulation.newGame(2026071342);
  resetJobs(state);
  const militia = state.residents[0];
  const watchman = state.residents[1];
  const hunter = state.residents[2];
  militia.job = 'militia';
  watchman.job = 'watchman';
  hunter.job = 'hunter';
  state.resources.spears = 1;
  state.resources.muskets = 1;
  state.resources.hornBows = 1;
  state.resources.gunpowder = 0;

  weapons.clearWeaponAssignments(state);
  assert.equal(weapons.setResidentWeapon(state, militia.id, 'spear'), null);
  assert.equal(weapons.setResidentWeapon(state, watchman.id, 'musket'), null);
  assert.equal(weapons.setResidentWeapon(state, hunter.id, 'hornBow'), null);
  assert.equal(state.weaponAllocationMode, 'manual');
  assert.equal(buildings.computeDefense(state), 41);
  state.resources.gunpowder = 1;
  assert.equal(buildings.computeDefense(state), 53);

  const extra = state.residents[3];
  extra.job = 'hunter';
  assert.match(weapons.setResidentWeapon(state, extra.id, 'hornBow'), /재고/);
  assert.equal(state.weaponAssignments[extra.id], undefined);

  simulation.setResidentJob(state, hunter.id, 'idle');
  assert.equal(state.weaponAssignments[hunter.id], undefined, 'job changes clear incompatible weapons');
}

{
  const state = simulation.newGame(2026071343);
  resetJobs(state);
  const [lowerId, higherId] = state.residents;
  lowerId.job = 'militia';
  higherId.job = 'militia';
  state.resources.hornBows = 2;
  weapons.clearWeaponAssignments(state);
  assert.equal(weapons.setResidentWeapon(state, higherId.id, 'hornBow'), null);
  assert.equal(weapons.setResidentWeapon(state, lowerId.id, 'hornBow'), null);

  state.resources.hornBows = 1;
  weapons.synchronizeWeaponAssignments(state);
  assert.equal(state.weaponAssignments[lowerId.id], 'hornBow');
  assert.equal(state.weaponAssignments[higherId.id], undefined, 'lower resident id wins deterministic stock reconciliation');

  lowerId.alive = false;
  weapons.synchronizeWeaponAssignments(state);
  assert.equal(state.weaponAssignments[lowerId.id], undefined, 'dead residents cannot retain weapons');
}

{
  const legacy = simulation.newGame(2026071344);
  resetJobs(legacy);
  legacy.residents[0].job = 'militia';
  legacy.resources.spears = 1;
  delete legacy.weaponAssignments;
  delete legacy.weaponAllocationMode;

  assert.equal(saveLoad.saveGame(legacy), true);
  const loaded = saveLoad.loadGame();
  assert.ok(loaded);
  assert.equal(loaded.weaponAllocationMode, 'auto');
  assert.equal(loaded.weaponAssignments[loaded.residents[0].id], 'spear');
}

console.log('weapon assignment tests passed');
