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
const battleSimulation = await import(pathToFileURL(join(compiledDir, 'battleSimulation.mjs')).href);

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
  assert.deepEqual(
    Object.fromEntries(battle.prepActions.map(action => [action.id, action.cost])),
    {
      evacuateCivilians: 1,
      hideSupplies: 1,
      repairWall: 1,
      setAmbush: 2,
      prepareVolley: 2,
      preliminaryBombardment: 3,
      musterMilitia: 1,
    },
  );
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
  const wallDefenseBefore = battle.zones.find(zone => zone.id === 'wall').defenseBonus;
  assert.equal(tactical.spendPreparationAction(state, 'repairWall'), null);
  assert.equal(battle.prepPoints, before - 1);
  assert.equal(battle.prepActions.find(action => action.id === 'repairWall').selected, true);
  assert.equal(battle.prepActions.find(action => action.id === 'repairWall').applied, false);
  assert.equal(battle.zones.find(zone => zone.id === 'wall').defenseBonus, wallDefenseBefore);
  assert.equal(tactical.spendPreparationAction(state, 'repairWall'), null, 'a selected preparation can be cancelled');
  assert.equal(battle.prepPoints, before, 'cancelling refunds its preparation points');
  assert.equal(battle.prepActions.find(action => action.id === 'repairWall').selected, false);
  assert.equal(tactical.spendPreparationAction(state, 'repairWall'), null);

  assert.equal(tactical.advanceTacticalPhase(state), null);
  assert.equal(battle.phase, 'preparationExecution');
  assert.equal(battle.prepActions.find(action => action.id === 'repairWall').applied, true);
  assert.ok(battle.zones.find(zone => zone.id === 'wall').defenseBonus > wallDefenseBefore);
  assert.ok(battle.preparationEvents.some(event => event.kind === 'fortify' && event.zoneId === 'wall'));
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
  assert.deepEqual(
    battleSimulation.BATTLE_SIMULATION_ENEMIES.map(enemy => enemy.name),
    ['니마차 우디캐', '홀라온 야인', '변경 마적', '조정 토벌군'],
    'battle simulation should only offer actual hostile forces',
  );
  const state = battleSimulation.createBattleSimulation({
    mode: 'garrison', factionName: '조정 토벌군', power: 20, warned: true, siege: true,
    season: 'winter', weather: 'clear', prepPoints: 'auto', seed: 2026071310,
    defenders: { muskets: 2, bows: 2, spears: 2, unarmedMilitia: 0, watchmen: 2, hunters: 2, civilians: 6 },
    cannonEmplacements: 3,
  });
  const battle = state.tacticalBattle;
  assert.ok(battle);
  assert.equal(battle.originalPower, 120, 'court punitive force keeps a hard minimum power');
  assert.equal(battle.raiderMorale, 92, 'court punitive force starts with elite morale');
  assert.equal(state.buildings.filter(building => building.type === 'cannonEmplacement' && building.built).length, 3);
  assert.ok(state.resources.gunpowder >= 3 * 2, 'simulator supplies powder for its cannon emplacements');
  assert.deepEqual(
    new Set(battle.raiderGroups.map(group => group.unitType)),
    new Set(['court-gunner', 'court-archer', 'court-melee', 'court-cavalry', 'court-artillery']),
  );
  assert.ok(battle.raiderGroups.every(group => group.revealed && group.morale >= 88));
  assert.ok(battle.raiderGroups.find(group => group.unitType === 'court-artillery').wallPressureBonus >= 10);
}

{
  const expectedTypes = new Map([
    ['니마차 우디캐', ['nimacha-hunter', 'nimacha-looter', 'nimacha-spearman']],
    ['홀라온 야인', ['holaon-lancer', 'holaon-raider', 'holaon-horse-archer']],
    ['변경 마적', ['bandit-vanguard', 'bandit-looter', 'bandit-rider']],
  ]);
  for (const [factionName, unitTypes] of expectedTypes) {
    const state = simulation.newGame(2026071311);
    prepareDefenders(state);
    const battle = tactical.createTacticalBattle(state, {
      factionName, power: 48, warned: true, siege: false, mode: 'garrison',
    });
    assert.deepEqual(battle.raiderGroups.map(group => group.unitType), unitTypes);
  }
}

{
  const state = simulation.newGame(2026071209);
  prepareDefenders(state);
  const battle = tactical.createTacticalBattle(state, {
    factionName: 'ambush-preparation-test', power: 60, warned: true, siege: false, mode: 'garrison',
  });
  const hunters = battle.defenderGroups.find(group => group.kind === 'hunter');
  assert.ok(hunters);
  assert.equal(hunters.ambushed, false);
  assert.equal(tactical.spendPreparationAction(state, 'setAmbush'), null);
  assert.equal(hunters.ambushed, false, 'selecting a preparation does not apply it yet');
  battle.zones.find(zone => zone.id === 'approach').ambushBonus = 100;
  tactical.advanceTacticalPhase(state);
  assert.equal(hunters.ambushed, true, 'confirming preparations puts approach hunters in ambush');
  assert.equal(battle.phase, 'preparationExecution');
  assert.ok(battle.preparationEvents.some(event => event.kind === 'prepareAmbush' && event.groupId === hunters.id));
  tactical.advanceTacticalPhase(state);
  tactical.advanceTacticalPhase(state);
  assert.equal(hunters.command, 'ambush', 'an ambushed hunter defaults to the surprise attack command');
  const raiderZones = new Map(battle.raiderGroups.map(group => [group.id, group.zoneId]));
  assert.equal(tactical.resolveTacticalRound(state), null);
  assert.equal(hunters.ambushed, false, 'a surprise attack consumes the ambushed state');
  assert.equal(hunters.command, null, 'a consumed surprise attack waits for a new order');
  assert.ok(battle.raiderGroups.every(group => group.confused), 'guaranteed test chance confuses every raider group');
  assert.ok(battle.pendingReport.events.some(event => event.kind === 'ambush' && event.float === '혼란!'));
  assert.ok(
    battle.raiderGroups.every(group => group.zoneId === raiderZones.get(group.id)),
    'confused raiders cancel movement for the engagement',
  );
  assert.equal(tactical.completeTacticalSimulation(state), null);
  assert.equal(tactical.acknowledgeTacticalReport(state), null);
  assert.ok(battle.raiderGroups.every(group => !group.confused), 'confusion expires before the next engagement');
}

{
  const state = simulation.newGame(2026071311);
  prepareDefenders(state);
  const battle = tactical.createTacticalBattle(state, {
    factionName: 'preliminary-bombardment-test', power: 80, warned: true, siege: true, mode: 'garrison',
  });
  battle.prepPoints = 8;
  assert.match(
    tactical.spendPreparationAction(state, 'preliminaryBombardment'),
    /불랑기포대/,
    'preliminary bombardment requires a completed cannon emplacement',
  );
  addBuiltMarker(state, 'cannonEmplacement');
  addBuiltMarker(state, 'cannonEmplacement');
  const action = battle.prepActions.find(candidate => candidate.id === 'preliminaryBombardment');
  const powerBefore = battle.raiderGroups.reduce((sum, group) => sum + group.power, 0);
  const powderBefore = state.resources.gunpowder;
  assert.equal(tactical.spendPreparationAction(state, 'preliminaryBombardment'), null);
  assert.equal(action.selected, true);
  assert.equal(action.applied, false);
  assert.equal(battle.prepPoints, 5);
  assert.equal(state.resources.gunpowder, powderBefore, 'selection does not consume powder');
  assert.equal(tactical.spendPreparationAction(state, 'preliminaryBombardment'), null);
  assert.equal(battle.prepPoints, 8, 'cancelling bombardment refunds all three points');
  assert.equal(tactical.spendPreparationAction(state, 'preliminaryBombardment'), null);
  assert.equal(tactical.advanceTacticalPhase(state), null);
  assert.equal(battle.phase, 'preparationExecution');
  assert.equal(action.applied, true);
  assert.equal(battle.preliminaryBombardmentCannons, 2);
  assert.equal(state.resources.gunpowder, powderBefore - 2 * 2);
  assert.ok(battle.preliminaryBombardmentCasualties > 0);
  assert.ok(battle.raiderGroups.reduce((sum, group) => sum + group.power, 0) < powerBefore);
  assert.ok(battle.preparationEvents.some(event => event.kind === 'bombardment'));
  assert.ok(battle.preparationEvents.some(event => event.kind === 'casualty' && event.side === 'raider'));
  assert.equal(tactical.advanceTacticalPhase(state), null);
  assert.equal(battle.phase, 'deployment');
}

{
  const state = simulation.newGame(2026071312);
  prepareDefenders(state);
  const battle = tactical.createTacticalBattle(state, {
    factionName: 'muster-preparation-test', power: 60, warned: true, siege: false, mode: 'garrison',
  });
  battle.prepPoints = 8;
  const civilians = battle.defenderGroups.find(group => group.kind === 'civilian');
  assert.ok(civilians && civilians.count > 0);
  const civiliansBefore = civilians.count;
  assert.equal(tactical.spendPreparationAction(state, 'musterMilitia'), null);
  assert.equal(tactical.advanceTacticalPhase(state), null);
  assert.equal(battle.phase, 'preparationExecution');
  const mustered = battle.defenderGroups.find(group => group.id === 'militia-unarmed-mustered');
  assert.ok(mustered);
  assert.equal(mustered.zoneId, 'wall', 'newly mustered militia joins the defensive front');
  assert.equal(civilians.count + mustered.count, civiliansBefore);
  assert.ok(battle.preparationEvents.some(event =>
    event.kind === 'muster' && event.zoneId === 'wall' && event.groupId === mustered.id));
}

{
  const state = simulation.newGame(2026071210);
  prepareDefenders(state);
  const battle = tactical.createTacticalBattle(state, {
    factionName: 'ambush-command-test', power: 80, warned: true, siege: false, mode: 'garrison',
  });
  const hunters = battle.defenderGroups.find(group => group.kind === 'hunter');
  assert.ok(hunters);
  tactical.advanceTacticalPhase(state);
  tactical.advanceTacticalPhase(state);
  assert.equal(hunters.command, 'hold', 'hunters cannot default to ambush while enemies occupy their zone');
  assert.match(
    tactical.setTacticalCommand(state, hunters.id, 'ambush'),
    /새로 매복할 수 없습니다/,
    'hunters cannot establish an ambush in an enemy-occupied zone',
  );
}

{
  const state = simulation.newGame(2026071211);
  prepareDefenders(state);
  const battle = tactical.createTacticalBattle(state, {
    factionName: 'ambush-next-engagement-test', power: 80, warned: true, siege: false, mode: 'garrison',
  });
  const hunters = battle.defenderGroups.find(group => group.kind === 'hunter');
  assert.ok(hunters);
  tactical.advanceTacticalPhase(state);
  assert.equal(tactical.assignDefenderGroup(state, hunters.id, 'storehouse'), null);
  tactical.advanceTacticalPhase(state);
  assert.equal(hunters.command, 'ambush', 'hunters in an empty zone default to preparing an ambush');
  assert.equal(tactical.resolveTacticalRound(state), null);
  assert.equal(hunters.ambushed, false, 'the setup engagement does not grant ambush early');
  assert.equal(tactical.completeTacticalSimulation(state), null);
  assert.equal(tactical.acknowledgeTacticalReport(state), null);
  assert.equal(hunters.ambushed, true, 'the ambush command becomes active for the following engagement');
}

{
  const state = simulation.newGame(2026071212);
  prepareDefenders(state);
  const battle = tactical.createTacticalBattle(state, {
    factionName: 'main-force-hold-test', power: 80, warned: true, siege: false, mode: 'garrison',
  });
  tactical.advanceTacticalPhase(state);
  for (const defender of battle.defenderGroups) defender.zoneId = 'wall';
  tactical.advanceTacticalPhase(state);
  for (const defender of battle.defenderGroups) defender.command = 'hold';
  const main = battle.raiderGroups.find(group => group.kind === 'main');
  assert.ok(main);
  main.zoneId = 'wall';
  battle.raiderGroups.filter(group => group !== main).forEach(group => { group.intent = 'withdraw'; });
  battle.round = 2;
  const wall = battle.zones.find(zone => zone.id === 'wall');
  wall.breached = false;
  wall.pressure = 0;
  assert.equal(tactical.resolveTacticalRound(state), null);
  assert.equal(main.zoneId, 'wall');
  assert.equal(main.pendingZoneId, undefined, 'main force cannot pass an intact, well-manned defensive line');
}

{
  const state = simulation.newGame(2026071213);
  prepareDefenders(state);
  const battle = tactical.createTacticalBattle(state, {
    factionName: 'main-force-breakthrough-test', power: 80, warned: true, siege: false, mode: 'garrison',
  });
  tactical.advanceTacticalPhase(state);
  for (const defender of battle.defenderGroups) defender.zoneId = 'center';
  tactical.advanceTacticalPhase(state);
  const main = battle.raiderGroups.find(group => group.kind === 'main');
  assert.ok(main);
  main.zoneId = 'wall';
  battle.raiderGroups.filter(group => group !== main).forEach(group => { group.intent = 'withdraw'; });
  battle.round = 2;
  battle.zones.find(zone => zone.id === 'wall').breached = true;
  assert.equal(tactical.resolveTacticalRound(state), null);
  assert.equal(main.zoneId, 'wall', 'raiders remain at the combat line throughout playback');
  assert.equal(main.pendingZoneId, 'center', 'a broken undefended line schedules the main force advance');
  assert.ok(
    battle.pendingReport.events.some(event => event.kind === 'advance' && event.zoneId === 'wall'),
    'advance animation is emitted from the line where combat occurred',
  );
  assert.equal(tactical.completeTacticalSimulation(state), null);
  assert.equal(tactical.acknowledgeTacticalReport(state), null);
  assert.equal(main.zoneId, 'center', 'scheduled movement applies only after combat playback and its report');
  assert.equal(main.pendingZoneId, undefined);
}

{
  const state = simulation.newGame(2026071214);
  prepareDefenders(state);
  const battle = tactical.createTacticalBattle(state, {
    factionName: 'command-availability-test', power: 80, warned: true, siege: false, mode: 'garrison',
  });
  tactical.advanceTacticalPhase(state);
  tactical.advanceTacticalPhase(state);
  const bow = battle.defenderGroups.find(group => group.kind === 'militia-bow');
  const spear = battle.defenderGroups.find(group => group.kind === 'militia-spear');
  const hunter = battle.defenderGroups.find(group => group.kind === 'hunter');
  const civilians = battle.defenderGroups.find(group => group.kind === 'civilian');
  assert.ok(bow && spear && hunter && civilians);
  assert.equal(tactical.tacticalCommandUnavailableReason(battle, bow, 'volley'), null);
  assert.ok(tactical.tacticalCommandUnavailableReason(battle, spear, 'volley'));
  spear.zoneId = 'storehouse';
  assert.equal(tactical.tacticalCommandUnavailableReason(battle, spear, 'guardStorehouse'), null);
  spear.zoneId = 'wall';
  assert.ok(tactical.tacticalCommandUnavailableReason(battle, spear, 'guardStorehouse'));
  assert.ok(tactical.tacticalCommandUnavailableReason(battle, spear, 'protectCivilians'));
  spear.zoneId = 'center';
  assert.equal(tactical.tacticalCommandUnavailableReason(battle, spear, 'protectCivilians'), null);
  assert.equal(tactical.tacticalCommandUnavailableReason(battle, spear, 'advance'), null);
  assert.ok(tactical.tacticalCommandUnavailableReason(battle, spear, 'charge'));
  spear.zoneId = 'approach';
  assert.equal(tactical.tacticalCommandUnavailableReason(battle, spear, 'charge'), null);
  assert.ok(tactical.tacticalCommandUnavailableReason(battle, bow, 'charge'));
  assert.ok(tactical.tacticalCommandUnavailableReason(battle, civilians, 'advance'));
  assert.ok(tactical.tacticalCommandUnavailableReason(battle, hunter, 'ambush'));
  hunter.ambushed = true;
  assert.equal(tactical.tacticalCommandUnavailableReason(battle, hunter, 'ambush'), null);
}

{
  const state = simulation.newGame(2026071216);
  prepareDefenders(state);
  const battle = tactical.createTacticalBattle(state, {
    factionName: 'charge-formation-test', power: 100, warned: true, siege: false, mode: 'garrison',
  });
  tactical.advanceTacticalPhase(state);
  const spear = battle.defenderGroups.find(group => group.kind === 'militia-spear');
  const bow = battle.defenderGroups.find(group => group.kind === 'militia-bow');
  assert.ok(spear && bow);
  assert.equal(tactical.assignDefenderGroup(state, spear.id, 'approach'), null);
  assert.equal(tactical.assignDefenderGroup(state, bow.id, 'approach'), null);
  tactical.advanceTacticalPhase(state);
  assert.equal(tactical.setTacticalCommand(state, spear.id, 'charge'), null);
  assert.equal(tactical.setTacticalCommand(state, bow.id, 'volley'), null);
  assert.equal(tactical.resolveTacticalRound(state), null);
  assert.ok(
    battle.pendingReport.events.some(event => event.kind === 'melee' && event.float === '돌격!'),
    'melee charge produces a dedicated combat event',
  );
  assert.ok(
    battle.pendingReport.events.some(event => event.kind === 'melee' && event.float === '후열 노출!'),
    'charging melee exposes ranged troops to a flanking strike',
  );
  assert.ok(battle.pendingReport.lines.some(line => line.includes('우회 타격')));
}

{
  const state = simulation.newGame(2026071215);
  prepareDefenders(state);
  const battle = tactical.createTacticalBattle(state, {
    factionName: 'defender-advance-test', power: 80, warned: true, siege: false, mode: 'garrison',
  });
  tactical.advanceTacticalPhase(state);
  const advancingGroup = battle.defenderGroups.find(group => group.kind === 'militia-spear');
  assert.ok(advancingGroup);
  assert.equal(tactical.assignDefenderGroup(state, advancingGroup.id, 'center'), null);
  tactical.advanceTacticalPhase(state);
  assert.equal(tactical.setTacticalCommand(state, advancingGroup.id, 'advance'), null);
  assert.equal(tactical.resolveTacticalRound(state), null);
  assert.equal(advancingGroup.zoneId, 'center', 'defender advance waits for combat playback');
  assert.ok(
    battle.pendingReport.events.some(event => event.kind === 'advance' && event.side === 'defender'),
    'defender advance is described after the engagement',
  );
  assert.equal(tactical.completeTacticalSimulation(state), null);
  assert.equal(tactical.acknowledgeTacticalReport(state), null);
  assert.equal(advancingGroup.zoneId, 'storehouse', 'defender advances one line after the report');
}

{
  const state = simulation.newGame(2026071208);
  prepareDefenders(state);
  const battle = tactical.createTacticalBattle(state, {
    factionName: 'retreat-test', power: 60, warned: true, siege: false, mode: 'garrison',
  });
  tactical.advanceTacticalPhase(state);
  tactical.advanceTacticalPhase(state);
  const retreatingGroup = battle.defenderGroups.find(group => group.zoneId === 'approach');
  assert.ok(retreatingGroup);
  assert.equal(tactical.setTacticalCommand(state, retreatingGroup.id, 'fallback'), null);
  assert.equal(tactical.resolveTacticalRound(state), null);
  assert.equal(retreatingGroup.zoneId, 'approach', 'retreat animation should remain on the current line');
  assert.equal(battle.pendingReport.ended, false, 'retreat movement test requires another engagement');
  assert.equal(tactical.completeTacticalSimulation(state), null);
  assert.equal(tactical.acknowledgeTacticalReport(state), null);
  assert.equal(retreatingGroup.zoneId, 'wall', 'retreating defenders move to the next rear line');
  retreatingGroup.zoneId = 'center';
  assert.match(
    tactical.setTacticalCommand(state, retreatingGroup.id, 'fallback'),
    /물러날 수 없습니다/,
    'the final defensive line has nowhere left to retreat',
  );
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

{
  const wallPressureAfter = mixedCommands => {
    const state = simulation.newGame(2026071317);
    prepareDefenders(state);
    const battle = tactical.createTacticalBattle(state, {
      factionName: 'pressure-command-share-test', power: 80, warned: true, siege: false, mode: 'garrison',
    });
    tactical.advanceTacticalPhase(state);
    battle.defenderGroups.forEach(group => { group.zoneId = 'wall'; });
    battle.raiderGroups.forEach(group => { group.zoneId = 'wall'; });
    tactical.advanceTacticalPhase(state);
    battle.defenderGroups.forEach((group, index) => {
      group.command = mixedCommands && index > 0 ? 'volley' : 'hold';
    });
    assert.equal(tactical.resolveTacticalRound(state), null);
    return battle.zones.find(zone => zone.id === 'wall').pressure;
  };
  const allHolding = wallPressureAfter(false);
  const mixedLine = wallPressureAfter(true);
  assert.ok(
    mixedLine > allHolding + 2,
    'one holding unit must not grant the full pressure reduction to an entire mixed defensive line',
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
