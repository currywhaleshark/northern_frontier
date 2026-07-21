import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-expedition-muster-tests-'));
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
const simulation = await import(pathToFileURL(join(compiledDir, 'simulation.mjs')).href);
const buildings = await import(pathToFileURL(join(compiledDir, 'buildings.mjs')).href);
const expedition = await import(pathToFileURL(join(compiledDir, 'expedition.mjs')).href);
const siteDiplomacy = await import(pathToFileURL(join(compiledDir, 'siteDiplomacy.mjs')).href);
const specialEvents = await import(pathToFileURL(join(compiledDir, 'specialEvents.mjs')).href);
const weapons = await import(pathToFileURL(join(compiledDir, 'weapons.mjs')).href);

function prepareCombatants(seed) {
  const state = simulation.newGame(seed);
  for (const resident of state.residents) {
    resident.job = 'idle';
    resident.sick = false;
    resident.health = 100;
    resident.quarantinedUntil = 0;
  }
  const combatants = state.residents.slice(0, 5);
  combatants[0].job = 'militia';
  combatants[1].job = 'militia';
  combatants[2].job = 'watchman';
  combatants[3].job = 'hunter';
  combatants[4].job = 'hunter';
  state.resources.muskets = 1;
  state.resources.hornBows = 2;
  state.resources.spears = 2;
  state.resources.gunpowder = 5;
  weapons.setAutomaticWeaponAllocation(state);
  return { state, combatants };
}

{
  const { state, combatants } = prepareCombatants(2026071361);
  combatants[1].quarantinedUntil = state.day + 2;
  combatants[3].sick = true;
  combatants[4].health = 19;
  assert.deepEqual(
    expedition.availableExpeditionResidents(state).map(resident => resident.id),
    [combatants[0].id, combatants[2].id],
    'quarantined, sick, and severely injured residents cannot muster',
  );
}

{
  const { state } = prepareCombatants(2026071362);
  const center = state.buildings.find(building => building.type === 'center' && building.built);
  assert.ok(center);
  state.incidents.predatorThreats.wolf = { kind: 'wolf', untilDay: state.day + 5 };
  state.habitats = [
    { id: 20, x: Math.max(0, center.x - 15), y: center.y, radius: 5, active: true },
    { id: 10, x: Math.min(state.map[0].length - 1, center.x + 3), y: center.y, radius: 5, active: true },
    { id: 1, x: center.x, y: center.y, radius: 5, active: false },
  ];
  assert.equal(expedition.predatorExpeditionTarget(state, 'wolf')?.habitatId, 20,
    'predator hunts must prefer a habitat outside the village safety distance');
  delete state.incidents.predatorThreats.wolf;
  assert.equal(expedition.predatorExpeditionTarget(state, 'wolf'), null, 'inactive threat cannot open a hunt target');
}

{
  const { state, combatants } = prepareCombatants(2026071363);
  const twoIds = combatants.slice(0, 2).map(resident => resident.id);
  const allIds = combatants.map(resident => resident.id);
  const fullDefense = buildings.computeDefense(state);
  const remainingDefense = buildings.computeDefense(state, { excludedResidentIds: twoIds });
  assert.ok(remainingDefense < fullDefense, 'selected expedition members lower the defense preview');
  assert.ok(expedition.expeditionCombatPower(state, allIds) > expedition.expeditionCombatPower(state, twoIds));
  assert.ok(
    specialEvents.predatorHuntChance(state, 'tiger', allIds) >
      specialEvents.predatorHuntChance(state, 'tiger', twoIds),
    'predator preview uses only selected members',
  );

  const lair = state.foreignSites.find(site => site.type === 'banditLair');
  assert.ok(lair);
  lair.status = 'active';
  lair.militaryPower = 40;
  lair.discovered = false;
  assert.equal(siteDiplomacy.banditLairRaidChance(state, lair.id, allIds), 0);
  lair.discovered = true;
  assert.ok(
    siteDiplomacy.banditLairRaidChance(state, lair.id, allIds) >
      siteDiplomacy.banditLairRaidChance(state, lair.id, twoIds),
    'lair preview uses only selected members and requires discovery',
  );
}

{
  const { state, combatants } = prepareCombatants(2026071406);
  const [sick, injured, quarantined, scout] = state.residents.slice(5, 9);
  for (const resident of [...combatants, sick, injured, quarantined, scout]) resident.job = 'militia';
  sick.sick = true;
  injured.health = 19;
  quarantined.quarantinedUntil = state.day + 2;
  state.incidents.predatorThreats.wolf = {
    kind: 'wolf', untilDay: state.day + 2,
    scouting: {
      residentId: scout.id, startedDay: state.day, completesOnDay: state.day + 1,
      hunterSkill: 0, usedGyrfalcon: false,
    },
  };
  state.resources.muskets = 9;
  state.resources.hornBows = 0;
  state.resources.spears = 0;
  state.resources.gunpowder = 0.8;
  state.weaponAllocationMode = 'manual';
  state.weaponAssignments = Object.fromEntries(
    [...combatants, sick, injured, quarantined, scout].map(resident => [resident.id, 'musket']),
  );

  const all = expedition.expeditionMusterPreview(state, combatants.map(resident => resident.id));
  assert.equal(all.expeditionWeapons.assignedMuskets, 5);
  assert.equal(all.expeditionWeapons.readyMuskets, 2);
  assert.equal(all.expeditionWeapons.dryMuskets, 3);
  assert.equal(all.expeditionPower, 2 * 18 + 3 * 12);
  assert.deepEqual(
    all.expeditionCombatants.map(combatant => combatant.readyWeapon),
    ['musket', 'musket', null, null, null],
    'individual rows distinguish ready and dry muskets deterministically',
  );

  const one = expedition.expeditionMusterPreview(state, [combatants[0].id]);
  assert.equal(one.expeditionWeapons.readyMuskets, 1);
  assert.equal(one.remainingWeapons.assignedMuskets, 4);
  assert.equal(one.remainingWeapons.readyMuskets, 1,
    'powder left by the selected expedition is reassigned to remaining defenders');
  assert.equal(one.remainingWeapons.dryMuskets, 3);
  const remainingIds = new Set(one.remainingCombatants.map(combatant => combatant.residentId));
  for (const excluded of [sick, injured, quarantined, scout]) assert.equal(remainingIds.has(excluded.id), false);
}

{
  const source = readFileSync(new URL('../../src/components/ExpeditionMusterDialog.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /residentDefenseContribution/,
    'the muster UI must not use the legacy per-resident defense helper');
  assert.match(source, /조총 준비/);
  assert.match(source, /화약 부족/);
}

console.log('expedition muster tests passed');
