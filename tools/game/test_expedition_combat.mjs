import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-expedition-combat-tests-'));
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
const siteDiplomacy = await import(pathToFileURL(join(compiledDir, 'siteDiplomacy.mjs')).href);
const specialEvents = await import(pathToFileURL(join(compiledDir, 'specialEvents.mjs')).href);
const weapons = await import(pathToFileURL(join(compiledDir, 'weapons.mjs')).href);

function prepareState(seed) {
  const state = simulation.newGame(seed);
  for (const resident of state.residents) {
    resident.job = 'idle';
    resident.sick = false;
    resident.health = 100;
    resident.quarantinedUntil = 0;
  }
  const combatants = state.residents.slice(0, 4);
  combatants[0].job = 'militia';
  combatants[1].job = 'militia';
  combatants[2].job = 'watchman';
  combatants[3].job = 'hunter';
  state.resources.muskets = 3;
  state.resources.hornBows = 1;
  state.resources.spears = 0;
  state.resources.gunpowder = 10;
  weapons.clearWeaponAssignments(state);
  assert.equal(weapons.setResidentWeapon(state, combatants[0].id, 'musket'), null);
  assert.equal(weapons.setResidentWeapon(state, combatants[1].id, 'musket'), null);
  assert.equal(weapons.setResidentWeapon(state, combatants[2].id, 'musket'), null);
  assert.equal(weapons.setResidentWeapon(state, combatants[3].id, 'hornBow'), null);
  const lair = state.foreignSites.find(site => site.type === 'banditLair');
  assert.ok(lair);
  lair.discovered = true;
  lair.status = 'active';
  lair.militaryPower = 45;
  return { state, combatants, lair };
}

{
  const { state, combatants, lair } = prepareState(2026071371);
  const memberIds = combatants.slice(0, 2).map(resident => resident.id);
  state.expedition = { memberIds };
  const selectedChance = siteDiplomacy.banditLairRaidChance(state, lair.id, memberIds);
  const largerChance = siteDiplomacy.banditLairRaidChance(
    state,
    lair.id,
    combatants.map(resident => resident.id),
  );
  assert.ok(selectedChance > 0.1, 'away expedition members still contribute when explicitly selected');
  assert.ok(largerChance > selectedChance, 'larger expedition has a higher lair success chance');

  const beforePowder = state.resources.gunpowder;
  const result = siteDiplomacy.resolveBanditLairAssault(state, lair.id, memberIds, () => 0);
  assert.notEqual(typeof result, 'string');
  assert.equal(result.outcome, 'victory');
  assert.ok(Math.abs(result.powderUsed - 0.8) < 1e-9, 'two expedition muskets consume 2 × 0.4 powder');
  assert.ok(Math.abs(state.resources.gunpowder - (beforePowder - 0.8)) < 1e-9);
  assert.equal(lair.status, 'burned');
  assert.deepEqual(result.loot, { grain: 8, hide: 6, tools: 2 });
}

{
  const { state, combatants, lair } = prepareState(2026071372);
  const memberIds = [combatants[0].id, combatants[3].id];
  const outsiderHealth = combatants[1].health;
  const rolls = [0.99, 0.99, 0];
  const result = siteDiplomacy.resolveBanditLairAssault(state, lair.id, memberIds, () => rolls.shift() ?? 0);
  assert.notEqual(typeof result, 'string');
  assert.equal(result.outcome, 'defeat');
  assert.ok(memberIds.includes(result.injuredResidentId));
  assert.equal(combatants[1].health, outsiderHealth, 'non-member cannot be selected as lair casualty');
  assert.equal(lair.status, 'fortified');
}

{
  const { state, lair } = prepareState(2026071376);
  const grainBefore = state.resources.grain;
  assert.equal(siteDiplomacy.applyBanditLairOutcome(state, lair.id, 'victory'), null);
  assert.equal(lair.status, 'burned');
  assert.equal(state.resources.grain, grainBefore + 8);
  assert.equal(
    siteDiplomacy.applyBanditLairOutcome(state, lair.id, 'victory'),
    '이미 비어 있거나 불탄 산채입니다.',
    'strategic outcome cannot award the same lair twice',
  );
  assert.equal(state.resources.grain, grainBefore + 8);
}

{
  const { state, combatants } = prepareState(2026071373);
  const memberIds = [combatants[0].id, combatants[3].id];
  state.expedition = { memberIds };
  state.incidents.predatorThreats.wolf = { kind: 'wolf', untilDay: state.day + 5 };
  const outsiderHealth = combatants[1].health;
  const beforePowder = state.resources.gunpowder;
  const result = specialEvents.resolveWildlifeHunt(state, 'wolf', memberIds, () => 0);
  assert.notEqual(typeof result, 'string');
  assert.equal(result.outcome, 'victory');
  assert.ok(Math.abs(result.powderUsed - 0.4) < 1e-9, 'only the selected musket consumes powder');
  assert.ok(Math.abs(state.resources.gunpowder - (beforePowder - 0.4)) < 1e-9);
  assert.equal(state.incidents.predatorThreats.wolf, undefined);
  assert.equal(combatants[1].health, outsiderHealth);
}

{
  const { state, combatants } = prepareState(2026071374);
  const memberIds = [combatants[0].id, combatants[3].id];
  state.incidents.predatorThreats.tiger = { kind: 'tiger', untilDay: state.day + 5 };
  const outsiderAlive = combatants[1].alive;
  const rolls = [0.99, 0, 0, 0];
  const result = specialEvents.resolveWildlifeHunt(state, 'tiger', memberIds, () => rolls.shift() ?? 0);
  assert.notEqual(typeof result, 'string');
  assert.equal(result.outcome, 'defeat');
  assert.ok(memberIds.includes(result.killedResidentId));
  assert.equal(combatants[1].alive, outsiderAlive, 'non-member cannot be selected as wildlife casualty');
  assert.ok(state.incidents.predatorThreats.tiger);
}

{
  const { state } = prepareState(2026071375);
  state.incidents.predatorThreats.tiger = { kind: 'tiger', untilDay: state.day + 5 };
  const meatBefore = state.resources.meat;
  const strategic = specialEvents.applyWildlifeHuntOutcome(state, 'tiger', 'victory', () => 0);
  assert.equal(state.incidents.predatorThreats.tiger, undefined);
  assert.equal(strategic.specialItem, 'tigerPelt');
  assert.equal(state.resources.meat, meatBefore + strategic.loot.meat);
}

console.log('expedition combat tests passed');
