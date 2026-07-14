import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-combat-roster-tests-'));
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
const roster = await import(pathToFileURL(join(compiledDir, 'combatRoster.mjs')).href);
const capabilities = await import(pathToFileURL(join(compiledDir, 'combatCapabilities.mjs')).href);
const weapons = await import(pathToFileURL(join(compiledDir, 'weapons.mjs')).href);
const tacticalAssault = await import(pathToFileURL(join(compiledDir, 'tacticalAssault.mjs')).href);
const tacticalBattle = await import(pathToFileURL(join(compiledDir, 'tacticalBattle.mjs')).href);
const buildings = await import(pathToFileURL(join(compiledDir, 'buildings.mjs')).href);

function reset(state) {
  for (const resident of state.residents) {
    resident.job = 'idle';
    resident.alive = true;
    resident.sick = false;
    resident.health = 100;
    resident.quarantinedUntil = 0;
  }
  state.expedition = null;
  state.incidents.predatorThreats.wolf = undefined;
  state.incidents.predatorThreats.tiger = undefined;
  state.weaponAllocationMode = 'manual';
  state.weaponAssignments = {};
  state.resources.muskets = 0;
  state.resources.hornBows = 0;
  state.resources.spears = 0;
  state.resources.gunpowder = 0;
}

{
  const state = simulation.newGame(2026071401);
  reset(state);
  const [watchman, hunter] = state.residents;
  watchman.job = 'watchman';
  hunter.job = 'hunter';
  state.resources.hornBows = 1;
  state.resources.spears = 1;
  state.weaponAssignments = { [watchman.id]: 'hornBow', [hunter.id]: 'spear' };

  const snapshot = roster.createCombatRoster(state, { context: 'villageDefense' }).combatants;
  const watchmanSnapshot = snapshot.find(item => item.residentId === watchman.id);
  const hunterSnapshot = snapshot.find(item => item.residentId === hunter.id);
  assert.equal(watchmanSnapshot.weapon, undefined, 'snapshot uses assignedWeapon/readyWeapon fields, not a legacy weapon field');
  assert.equal(watchmanSnapshot.assignedWeapon, 'hornBow');
  assert.equal(watchmanSnapshot.readyWeapon, 'hornBow');
  assert.ok(watchmanSnapshot.capabilities.includes('guard'));
  assert.ok(watchmanSnapshot.capabilities.includes('volley'));
  assert.deepEqual(capabilities.combatSpriteDescriptor(watchmanSnapshot.role, watchmanSnapshot.assignedWeapon), {
    source: 'weapon', id: 'hornBow',
  });

  assert.equal(hunterSnapshot.role, 'hunter');
  assert.equal(hunterSnapshot.assignedWeapon, 'spear');
  assert.ok(hunterSnapshot.capabilities.includes('ambush'));
  assert.ok(hunterSnapshot.capabilities.includes('scout'));
  assert.ok(hunterSnapshot.capabilities.includes('melee'));
  assert.ok(hunterSnapshot.capabilities.includes('charge'));
  assert.deepEqual(
    new Set(hunterSnapshot.capabilities),
    capabilities.combatCapabilities('hunter', 'spear'),
  );
  assert.equal(capabilities.HUNTER_DEFAULT_RANGED, true);
  assert.ok(capabilities.combatCapabilities('hunter', null).has('volley'));

  const groups = tacticalAssault.createExpeditionTacticalGroups(state, [watchman.id, hunter.id]);
  const watchmanGroup = groups.find(group => group.role === 'watchman');
  const hunterGroup = groups.find(group => group.role === 'hunter');
  assert.equal(watchmanGroup.weapon, 'hornBow');
  assert.ok(capabilities.tacticalGroupCapabilities(watchmanGroup).has('volley'));
  assert.equal(hunterGroup.weapon, 'spear');
  assert.ok(capabilities.tacticalGroupCapabilities(hunterGroup).has('ambush'));
  assert.ok(capabilities.tacticalGroupCapabilities(hunterGroup).has('charge'));
}

{
  const state = simulation.newGame(2026071402);
  reset(state);
  const fighters = state.residents.slice(0, 5);
  fighters.forEach(resident => { resident.job = 'militia'; });
  state.resources.muskets = 5;
  state.resources.gunpowder = 0.01;
  state.weaponAssignments = Object.fromEntries(fighters.map(resident => [resident.id, 'musket']));

  assert.equal(weapons.musketReadiness(state, fighters.map(resident => resident.id), 0.4).ready, 0);
  assert.equal(weapons.residentDefenseContribution(state, fighters[0], 'musket'), 12);
  state.resources.gunpowder = 0.8;

  const readiness = weapons.musketReadiness(state, fighters.map(resident => resident.id), 0.4);
  assert.deepEqual(readiness, { assigned: 5, ready: 2, dry: 3, powderRequired: 0.8 });
  const snapshots = roster.createCombatRoster(state, { context: 'villageDefense' }).combatants;
  assert.equal(snapshots.filter(item => item.readyWeapon === 'musket').length, 2);
  assert.equal(snapshots.filter(item => item.assignedWeapon === 'musket' && item.readyWeapon === null).length, 3);
  assert.equal(
    snapshots.reduce((sum, item) => sum + item.basePower + item.weaponPower, 0),
    2 * 18 + 3 * 12,
    'partial powder gives two musket contributions and three base contributions',
  );
  const groups = tacticalAssault.createExpeditionTacticalGroups(state, fighters.map(resident => resident.id));
  assert.equal(groups[0].readyMuskets, 2);
  assert.equal(groups[0].power, 2 * 18 + 3 * 12);
  assert.equal(weapons.consumeMusketPowder(state, fighters.map(resident => resident.id), 0.4), 0.8);
  assert.equal(state.resources.gunpowder, 0);
  assert.equal(state.weaponAssignments[fighters[4].id], 'musket', 'dry muskets stay assigned');
  const dryGroups = tacticalAssault.createExpeditionTacticalGroups(state, fighters.map(resident => resident.id));
  assert.equal(dryGroups[0].weapon, 'musket');
  assert.equal(dryGroups[0].readyMuskets, 0);
  assert.equal(dryGroups[0].power, 5 * 12, 'dry muskets contribute only role base power');
  assert.match(
    tacticalAssault.assaultCommandUnavailableReason({ orientation: 'assault' }, dryGroups[0], 'volley'),
    /화약/,
  );
}

{
  const state = simulation.newGame(2026071403);
  reset(state);
  const [healthy, expeditionMember, scout, sick, injured, quarantined] = state.residents;
  for (const resident of [healthy, expeditionMember, scout, sick, injured, quarantined]) resident.job = 'militia';
  sick.sick = true;
  injured.health = 19;
  quarantined.quarantinedUntil = state.day + 1;
  state.expedition = {
    kind: 'lairAssault', targetX: 0, targetY: 0, musterX: 0, musterY: 0,
    phase: 'march', memberIds: [expeditionMember.id], x: 0, y: 0, px: 0, py: 0,
    path: [], trail: [], speed: 1, ticks: 0,
  };
  state.incidents.predatorThreats.wolf = {
    kind: 'wolf', untilDay: state.day + 2,
    scouting: { residentId: scout.id, startedDay: state.day, completesOnDay: state.day + 1, hunterSkill: 0, usedGyrfalcon: false },
  };

  const defenseRoster = roster.createCombatRoster(state, { context: 'villageDefense', includeCivilians: true });
  assert.deepEqual(defenseRoster.combatants.map(item => item.residentId), [healthy.id]);
  const excluded = new Set([expeditionMember.id, scout.id, sick.id, injured.id, quarantined.id]);
  assert.ok(defenseRoster.civilians.every(id => !excluded.has(id)), 'unready residents are not emergency levy candidates');
  const expeditionRoster = roster.createCombatRoster(state, {
    context: 'expedition', memberIds: [expeditionMember.id, healthy.id],
  });
  assert.deepEqual(
    expeditionRoster.combatants.map(item => item.residentId).sort((a, b) => a - b),
    [healthy.id, expeditionMember.id].sort((a, b) => a - b),
  );
}

{
  const state = simulation.newGame(2026071404);
  reset(state);
  const militia = state.residents[0];
  militia.job = 'militia';
  state.resources.spears = 1;
  state.weaponAllocationMode = 'auto';
  state.weaponAssignments = {};
  assert.equal(weapons.assignedWeapon(state, militia.id), 'spear');
  assert.deepEqual(state.weaponAssignments, {}, 'pure weapon lookup must not mutate GameState');
}

{
  const state = simulation.newGame(2026071405);
  reset(state);
  const fighters = state.residents.slice(0, 4);
  fighters.forEach((resident, index) => { resident.job = index === 3 ? 'watchman' : 'militia'; });
  state.resources.muskets = 3;
  state.resources.hornBows = 1;
  state.resources.gunpowder = 0.8;
  state.weaponAssignments = {
    [fighters[0].id]: 'musket', [fighters[1].id]: 'musket', [fighters[2].id]: 'musket',
    [fighters[3].id]: 'hornBow',
  };
  state.buildings.push({
    id: state.nextBuildingId++, type: 'garrison', x: 0, y: 0,
    progress: 1, built: true, fieldGrowth: 0,
  });
  const shared = roster.createCombatRoster(state, { context: 'villageDefense' }).combatants;
  const defense = buildings.computeDefense(state);
  const direct = tacticalBattle.createTacticalBattle(state, {
    factionName: 'roster parity', power: 30, warned: true, siege: false, mode: 'garrison',
  });
  const directIds = direct.defenderGroups
    .filter(group => group.role !== 'civilian')
    .flatMap(group => group.residentIds)
    .sort((a, b) => a - b);
  assert.deepEqual(directIds, shared.map(item => item.residentId).sort((a, b) => a - b));
  assert.equal(
    direct.defenderGroups.reduce((sum, group) => sum + (group.readyMuskets ?? 0), 0),
    shared.filter(item => item.readyWeapon === 'musket').length,
  );
  const sharedPower = shared.reduce((sum, item) => sum + item.basePower + item.weaponPower, 0);
  const directPeoplePower = direct.defenderGroups
    .filter(group => group.role !== 'civilian')
    .reduce((sum, group) => sum + group.power, 0);
  assert.ok(
    Math.abs(directPeoplePower - sharedPower * 1.3) < 1e-9,
    'the garrison people multiplier is identical in automatic and commanded defense',
  );
  const buildingDefense = state.buildings.filter(building => building.built)
    .reduce((sum, building) => sum + buildings.BUILDING_DEFS[building.type].defense, 0);
  assert.equal(defense - buildingDefense, Math.round(sharedPower * 1.3));
}

{
  const state = simulation.newGame(2026071406);
  reset(state);
  const [fighter, healthyCivilian, sickCivilian, injuredCivilian, quarantinedCivilian] = state.residents;
  fighter.job = 'militia';
  sickCivilian.sick = true;
  injuredCivilian.health = 19;
  quarantinedCivilian.quarantinedUntil = state.day + 2;
  const battle = tacticalBattle.createTacticalBattle(state, {
    factionName: 'muster eligibility', power: 20, warned: true, siege: false, mode: 'garrison',
  });
  assert.equal(tacticalBattle.spendPreparationAction(state, 'musterMilitia'), null);
  assert.equal(tacticalBattle.advanceTacticalPhase(state), null);
  const mustered = battle.defenderGroups.find(group => group.id === 'militia-unarmed-mustered');
  assert.ok(mustered?.residentIds.includes(healthyCivilian.id));
  assert.ok(!mustered?.residentIds.includes(sickCivilian.id));
  assert.ok(!mustered?.residentIds.includes(injuredCivilian.id));
  assert.ok(!mustered?.residentIds.includes(quarantinedCivilian.id));
}

console.log('combat roster tests passed');
