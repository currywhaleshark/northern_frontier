import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-tactical-tests-'));
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

const compiledDir = compileGameModules();
const simulation = await import(pathToFileURL(join(compiledDir, 'simulation.mjs')).href);
const tactical = await import(pathToFileURL(join(compiledDir, 'tacticalBattle.mjs')).href);
const raids = await import(pathToFileURL(join(compiledDir, 'raids.mjs')).href);

function prepareDefenders(state) {
  state.weather = 'clear';
  state.resources.spears = 2;
  state.resources.hornBows = 2;
  state.resources.muskets = 2;
  state.resources.gunpowder = 20;
  state.residents.slice(0, 8).forEach((resident, index) => {
    resident.job = index < 6 ? 'militia' : 'watchman';
    resident.sick = false;
    resident.health = 100;
  });
  state.residents.slice(8, 10).forEach(resident => {
    resident.job = 'hunter';
    resident.sick = false;
    resident.health = 100;
  });
}

function addBuiltMarker(state, type) {
  state.buildings.push({
    id: state.nextBuildingId++,
    type,
    x: 0,
    y: 0,
    progress: 999,
    built: true,
    fieldGrowth: 0,
  });
}

{
  const state = simulation.newGame(2026071201);
  prepareDefenders(state);
  const battle = tactical.createTacticalBattle(state, {
    factionName: '변경 마적', power: 60, warned: false, siege: false, mode: 'garrison',
  });

  assert.equal(state.tacticalBattle, battle);
  assert.equal(battle.phase, 'preparation');
  assert.equal(battle.zones.length, 4);
  assert.deepEqual(battle.zones.map(zone => zone.id), ['approach', 'wall', 'storehouse', 'center']);
  assert.equal(battle.raiderGroups.length, 3);
  assert.equal(battle.raiderGroups.reduce((sum, group) => sum + group.count, 0), 15);
  assert.ok(battle.raiderGroups.every(group => group.killed === 0));
  assert.ok(battle.defenderGroups.some(group => group.kind === 'militia-musket'));
  assert.ok(battle.defenderGroups.some(group => group.kind === 'militia-bow'));
  assert.ok(battle.defenderGroups.some(group => group.kind === 'militia-spear'));
  assert.ok(battle.prepPoints >= 1 && battle.prepPoints <= 8);
}

{
  const state = simulation.newGame(2026071202);
  prepareDefenders(state);
  addBuiltMarker(state, 'beacon');
  addBuiltMarker(state, 'watchtower');
  addBuiltMarker(state, 'watchtower');
  state.residents.slice(0, 4).forEach(resident => { resident.job = 'watchman'; });
  const battle = tactical.createTacticalBattle(state, {
    factionName: '홀라온 야인', power: 45, warned: true, siege: true, mode: 'levy',
  });
  assert.equal(battle.prepPoints, 8, 'warning, beacon, towers, and watchmen should reach prep cap');

  const before = battle.prepPoints;
  assert.equal(tactical.spendPreparationAction(state, 'repairWall'), null);
  assert.equal(battle.prepPoints, before - 1);
  assert.equal(battle.prepActions.find(action => action.id === 'repairWall').applied, true);
  assert.ok(battle.zones.find(zone => zone.id === 'wall').defenseBonus > 0);
  assert.ok(tactical.spendPreparationAction(state, 'repairWall'));

  assert.equal(tactical.advanceTacticalPhase(state), null);
  assert.equal(battle.phase, 'deployment');
  const movable = battle.defenderGroups.find(group => group.kind !== 'civilian');
  assert.ok(movable);
  assert.equal(tactical.assignDefenderGroup(state, movable.id, 'storehouse'), null);
  assert.equal(movable.zoneId, 'storehouse');

  assert.equal(tactical.advanceTacticalPhase(state), null);
  assert.equal(battle.phase, 'command');
  assert.equal(tactical.setTacticalCommand(state, movable.id, 'guardStorehouse'), null);
  assert.equal(movable.command, 'guardStorehouse');

  assert.equal(tactical.resolveTacticalRound(state), null);
  assert.equal(battle.phase, 'simulating');
  assert.equal(battle.round, 2);
  assert.equal(battle.reports.length, 1);
  assert.equal(battle.pendingReport, battle.reports[0]);
  assert.ok(battle.pendingReport.events.length > 0);
  assert.ok(battle.pendingReport.raidersKilled >= 0);
}

{
  const state = simulation.newGame(2026071203);
  prepareDefenders(state);
  const battle = tactical.createTacticalBattle(state, {
    factionName: '변경 마적', power: 24, warned: true, siege: false, mode: 'garrison',
  });
  tactical.advanceTacticalPhase(state);
  tactical.advanceTacticalPhase(state);
  battle.raiderMorale = 1;
  battle.raiderGroups.forEach(group => { group.morale = 1; });
  assert.equal(tactical.resolveTacticalRound(state), null);
  assert.equal(battle.pendingReport.ended, true);
  assert.equal(battle.pendingReport.outcome, 'defenseSuccess');
  const woundedGroup = battle.defenderGroups.find(group => group.count > 0);
  assert.ok(woundedGroup);
  woundedGroup.wounded = 1;
  battle.pendingReport.wounded = 1;
  battle.pendingReport.loot = { grain: 5 };
  battle.pendingReport.buildingsDamaged = 1;
  const grainBeforeFinish = state.resources.grain;

  assert.equal(tactical.completeTacticalSimulation(state), null);
  assert.equal(battle.phase, 'report');
  assert.equal(tactical.acknowledgeTacticalReport(state), null);
  assert.equal(battle.phase, 'finished');

  const beforeSubTick = state.subTick;
  simulation.advanceTick(state);
  assert.equal(state.subTick, beforeSubTick, 'ordinary simulation must pause during tactical battle');

  tactical.finishTacticalBattle(state);
  assert.equal(state.tacticalBattle, null);
  assert.ok(state.tacticalBattleReport);
  assert.equal(state.raiders, null);
  assert.equal(state.battle, null);
  assert.ok(state.raidCooldown > 0);
  assert.ok(state.threat <= 40);
  assert.equal(state.resources.grain, grainBeforeFinish - 5);
  assert.ok(state.buildings.some(building => building.repairing), 'deferred building damage should be applied on finish');
  assert.ok(state.residents.some(resident => resident.alive && resident.health < 100), 'deferred wounds should be applied on finish');
  assert.ok(state.log.some(entry => entry.text.startsWith('전투 장계:')));
  assert.equal(
    state.tacticalBattleReport.raidersKilled + state.tacticalBattleReport.raidersEscaped,
    state.tacticalBattleReport.raidersCommitted,
  );
  assert.ok(Array.isArray(state.tacticalBattleReport.wounded));
  const pausedAtReport = state.subTick;
  simulation.advanceTick(state);
  assert.equal(state.subTick, pausedAtReport, 'simulation must remain paused while the detailed battle report is open');
  tactical.dismissTacticalBattleReport(state);
  assert.equal(state.tacticalBattleReport, null);
  simulation.advanceTick(state);
  assert.notEqual(state.subTick, pausedAtReport, 'simulation may resume after the detailed report is dismissed');
}

{
  const state = simulation.newGame(2026071207);
  prepareDefenders(state);
  const battle = tactical.createTacticalBattle(state, {
    factionName: '변경 마적', power: 40, warned: false, siege: false, mode: 'levy',
  });
  tactical.advanceTacticalPhase(state);
  for (const defender of battle.defenderGroups) {
    assert.equal(tactical.assignDefenderGroup(state, defender.id, 'center'), null);
  }
  tactical.advanceTacticalPhase(state);
  assert.equal(tactical.resolveTacticalRound(state), null);
  assert.equal(
    battle.pendingReport.raiderMoraleDelta,
    0,
    'raiders should not lose morale merely for advancing through an undefended zone',
  );
}

for (const optionId of ['militia', 'levy']) {
  const state = simulation.newGame(optionId === 'militia' ? 2026071204 : 2026071205);
  prepareDefenders(state);
  raids.openRaidChoice(state, () => 0.5, true, 12, '변경 마적', false);
  const ids = state.pendingChoice.options.map(option => option.id);
  assert.ok(ids.includes('manual-garrison'));
  assert.ok(ids.includes('manual-levy'));
  assert.ok(ids.includes('militia'));
  assert.ok(ids.includes('levy'));

  raids.resolveRaid(state, optionId, () => 0);
  assert.equal(state.tacticalBattle, null, `${optionId} should remain on the automatic combat path`);
  assert.equal(state.pendingChoice, null);
  assert.ok(state.raidCooldown > 0);
}

{
  const state = simulation.newGame(2026071206);
  prepareDefenders(state);
  raids.openRaidChoice(state, () => 0.5, false, 36, '변경 마적', false);
  raids.resolveRaid(state, 'manual-garrison', () => 0.5);
  assert.ok(state.tacticalBattle);
  assert.equal(state.tacticalBattle.mode, 'garrison');
  assert.equal(state.pendingChoice, null);
}

console.log('tactical battle tests passed');
