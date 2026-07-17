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
const livestock = await import(pathToFileURL(join(compiledDir, 'livestock.mjs')).href);
const residents = await import(pathToFileURL(join(compiledDir, 'residents.mjs')).href);
const { CONFIG } = await import(pathToFileURL(join(compiledDir, 'config.mjs')).href);

function resetJobs(state) {
  for (const resident of state.residents) resident.job = 'idle';
  state.weaponAssignments = {};
  state.mountAssignments = {};
}

function addHorseStable(state, count) {
  const stable = {
    id: state.nextBuildingId++, type: 'stable', x: 0, y: 0,
    progress: 99, built: true, fieldGrowth: 0,
    livestock: livestock.createLivestockState('horse', count),
  };
  state.buildings.push(stable);
  if (!state.unlockedLivestock.includes('horse')) state.unlockedLivestock.push('horse');
  return stable;
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
  delete legacy.mountAssignments;

  assert.equal(saveLoad.saveGame(legacy), true);
  const loaded = saveLoad.loadGame();
  assert.ok(loaded);
  assert.equal(loaded.weaponAllocationMode, 'auto');
  assert.equal(loaded.weaponAssignments[loaded.residents[0].id], 'spear');
  assert.deepEqual(loaded.mountAssignments, {});
}

// 군마는 무기와 별도 트랙이며, 실제 군마 마릿수까지만 전투 주민에게 배정할 수 있다.
{
  const state = simulation.newGame(2026071345);
  resetJobs(state);
  const [militia, watchman, hunter] = state.residents;
  militia.job = 'militia';
  watchman.job = 'watchman';
  hunter.job = 'hunter';
  addHorseStable(state, 2);

  assert.equal(weapons.horseStock(state), 2);
  assert.equal(weapons.setResidentMount(state, militia.id, 'horse'), null);
  assert.equal(weapons.setResidentMount(state, watchman.id, 'horse'), null);
  assert.match(weapons.setResidentMount(state, hunter.id, 'horse'), /군마/);
  assert.equal(weapons.assignedMount(state, militia.id), 'horse');
  assert.equal(state.weaponAssignments[militia.id], undefined, 'mount assignment does not alter weapons');

  simulation.setResidentJob(state, watchman.id, 'idle');
  assert.equal(state.mountAssignments[watchman.id], undefined, 'leaving a combat job returns the horse');
  assert.equal(weapons.setResidentMount(state, hunter.id, 'horse'), null);
}

// 군마 재고가 줄면 낮은 주민 id부터 배정을 유지해 결과가 항상 동일하다.
{
  const state = simulation.newGame(2026071346);
  resetJobs(state);
  const [lowerId, higherId] = state.residents;
  lowerId.job = 'militia';
  higherId.job = 'watchman';
  const stable = addHorseStable(state, 2);
  assert.equal(weapons.setResidentMount(state, higherId.id, 'horse'), null);
  assert.equal(weapons.setResidentMount(state, lowerId.id, 'horse'), null);
  assert.equal(livestock.slaughterStableLivestock(state, stable.id, 1), null);
  assert.equal(state.mountAssignments[lowerId.id], 'horse');
  assert.equal(state.mountAssignments[higherId.id], undefined);
}

// 기마 주민이 전사하면 배정은 즉시 회수되고, 전투 손실 판정에 걸리면 군마도 줄어든다.
{
  const state = simulation.newGame(2026071347);
  resetJobs(state);
  const rider = state.residents[0];
  rider.job = 'militia';
  const stable = addHorseStable(state, 1);
  assert.equal(weapons.setResidentMount(state, rider.id, 'horse'), null);
  while (weapons.combatMountLossRoll(state, rider.id) >= CONFIG.mounted.combatDeathHorseLossChance) {
    state.seed += 1;
  }
  residents.killResident(state, rider, '시험 전투', false, true);
  assert.equal(state.mountAssignments[rider.id], undefined);
  assert.equal(stable.livestock.headcount, 0, 'the fallen rider can also cost the settlement a horse');
}

// 유효한 탑승 배정은 저장되며, 불러올 때 재고·직업 조건에 맞춰 다시 정리된다.
{
  const state = simulation.newGame(2026071348);
  resetJobs(state);
  state.residents[0].job = 'militia';
  addHorseStable(state, 1);
  assert.equal(weapons.setResidentMount(state, state.residents[0].id, 'horse'), null);
  state.mountAssignments[999999] = 'horse';
  assert.equal(saveLoad.saveGame(state), true);
  const loaded = saveLoad.loadGame();
  assert.equal(loaded.mountAssignments[loaded.residents[0].id], 'horse');
  assert.equal(loaded.mountAssignments[999999], undefined);
}

console.log('weapon assignment tests passed');
