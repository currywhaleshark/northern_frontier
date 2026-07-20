import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-doctrine-tests-'));
  for (const file of readdirSync(srcDir).filter(candidate => candidate.endsWith('.ts'))) {
    const source = readFileSync(new URL(file, srcDir), 'utf8');
    let output = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
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
const doctrineAi = await import(pathToFileURL(join(compiledDir, 'tacticalDoctrine.mjs')).href);
const enemyPlan = await import(pathToFileURL(join(compiledDir, 'enemyPlan.mjs')).href);
const events = await import(pathToFileURL(join(compiledDir, 'tacticalEvents.mjs')).href);
const tactical = await import(pathToFileURL(join(compiledDir, 'tacticalBattle.mjs')).href);
const battleSimulation = await import(pathToFileURL(join(compiledDir, 'battleSimulation.mjs')).href);

function group(id, unitType, power, kind = 'main') {
  return {
    id, kind, unitType, label: id, zoneId: 'wall', line: 'front', targetZoneId: 'wall',
    power, count: 20, killed: 0, morale: 90, intent: kind === 'flankers' ? 'flank' : 'advance',
    revealed: true, engagementsInZone: 0,
  };
}

function doctrineBattle(doctrine, groups) {
  return {
    encounterKind: 'raidDefense', id: 1, factionName: '홀라온 야인', warned: true, siege: true,
    originalPower: groups.reduce((sum, candidate) => sum + candidate.power, 0),
    initialFriendlyPower: 100, initialEnemyPower: 100, phase: 'command', round: 1,
    prepPoints: 0, prepActions: [], preparationEvents: [], zones: [], defenderGroups: [],
    raiderGroups: groups, enemyPlan: {
      objective: 'breakthrough', objectiveRevealed: true, doctrine, doctrineRevealed: true,
      compositionTemplateId: 'test', compositionRevealed: true, stratagemPoints: 0, stratagems: [],
    }, currentZoneId: 'wall', villageMorale: 70, raiderMorale: 80,
    reports: [], pendingReport: null, mode: 'garrison', orientation: 'defense',
  };
}

const skirmishGroup = group('horse-archers', 'holaon-horse-archer', 80);
const skirmish = doctrineBattle('mountedSkirmish', [skirmishGroup]);
assert.equal(doctrineAi.applyTacticalDoctrineAi(skirmish).length, 1);
assert.equal(skirmishGroup.aiState, 'probing');
assert.equal(skirmishGroup.intent, 'defend');
assert.equal(skirmishGroup.intentLockedUntilRound, 3);
skirmish.round = 2;
assert.equal(doctrineAi.applyTacticalDoctrineAi(skirmish).length, 0,
  'an intent cannot oscillate before its two-round lock expires');
skirmish.round = 3;
assert.equal(doctrineAi.applyTacticalDoctrineAi(skirmish)[0].toState, 'withdrawing');
skirmish.round = 4;
assert.equal(doctrineAi.applyTacticalDoctrineAi(skirmish).length, 0);
skirmish.round = 5;
assert.equal(doctrineAi.applyTacticalDoctrineAi(skirmish)[0].toState, 'probing');

const skirmishWing = group('screening-lancers', 'holaon-lancer', 60, 'flankers');
const wingBattle = doctrineBattle('mountedSkirmish', [skirmishWing]);
doctrineAi.applyTacticalDoctrineAi(wingBattle);
assert.equal(skirmishWing.aiState, 'engaging');
assert.equal(skirmishWing.intent, 'flank',
  'screening wings keep maneuvering while the mounted-skirmish main body shoots and withdraws');

const reserve = group('reserve-lancers', 'holaon-lancer', 90, 'flankers');
const main = group('main-archers', 'holaon-horse-archer', 110);
const counterattack = doctrineBattle('reserveCounterattack', [main, reserve]);
doctrineAi.applyTacticalDoctrineAi(counterattack);
assert.equal(reserve.aiState, 'forming');
assert.equal(main.aiState, 'engaging');
counterattack.round = 2;
assert.equal(doctrineAi.applyTacticalDoctrineAi(counterattack).length, 0);
counterattack.round = 3;
const reserveCommit = doctrineAi.applyTacticalDoctrineAi(counterattack)
  .find(transition => transition.groupId === reserve.id);
assert.equal(reserveCommit.toState, 'committingReserve');
assert.equal(reserve.intent, 'flank');

const hiddenView = enemyPlan.enemyDoctrineIntentView({
  enemyPlan: { ...counterattack.enemyPlan, doctrineRevealed: false },
  raiderGroups: counterattack.raiderGroups,
});
assert.equal(hiddenView.doctrineLabel, '미확인 교리');
assert.ok(hiddenView.groups.every(item => item.signal.length > 0),
  'visible movement signals do not require leaking the hidden doctrine name');
const revealedView = enemyPlan.enemyDoctrineIntentView(counterattack);
assert.equal(revealedView.doctrineId, 'reserveCounterattack');
assert.equal(revealedView.groups.find(item => item.groupId === reserve.id).state, 'committingReserve');

const state = battleSimulation.createBattleSimulation({
  mode: 'garrison', factionName: '조정 토벌군', power: 154, warned: true, siege: true,
  season: 'winter', weather: 'clear', prepPoints: 0,
  defenders: { muskets: 3, bows: 3, spears: 4, unarmedMilitia: 1, watchmen: 2, hunters: 3, civilians: 6 },
  cannonEmplacements: 0, enemyDoctrine: 'shockBreakthrough',
  enemyCompositionTemplateId: 'court-cavalry-wing', enemyFlankRoute: 'none', seed: 2026071952,
});
for (let guard = 0; guard < 4 && state.tacticalBattle.phase !== 'command'; guard += 1) {
  if (state.tacticalBattle.phase === 'deployment') {
    tactical.applyAutoDeployTacticalGroups(state.tacticalBattle);
  }
  assert.equal(tactical.advanceTacticalPhase(state), null);
}
assert.equal(tactical.resolveTacticalRound(state), null);
assert.ok(state.tacticalBattle.pendingReport.events.some(event => event.kind === 'doctrineShift'));
assert.ok(state.tacticalBattle.pendingReport.lines.some(line => line.includes('한 구역에 전력을 모아')));
assert.equal(events.isKnownTacticalAnimationEventKind('doctrineShift'), true);
for (let guard = 0; guard < 10 && state.tacticalBattle.phase !== 'finished'; guard += 1) {
  if (state.tacticalBattle.phase === 'simulating') assert.equal(tactical.completeTacticalSimulation(state), null);
  if (state.tacticalBattle.phase === 'report') assert.equal(tactical.acknowledgeTacticalReport(state), null);
  if (state.tacticalBattle.phase === 'command') assert.equal(tactical.resolveTacticalRound(state), null);
}
assert.equal(state.tacticalBattle.phase, 'finished');
assert.equal(state.tacticalBattle.zones.find(zone => zone.id === 'approach').breached, true,
  'a dominant frontal advance records the overrun approach as a lost defense line');

console.log('tactical doctrine tests passed');
