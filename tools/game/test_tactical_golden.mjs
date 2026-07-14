import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-tactical-golden-'));
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

const SCENARIOS = [
  { id: 'nimacha-unwarned-front', factionName: '니마차 우디캐', power: 68, warned: false, rearAssault: false, seed: 2026071401 },
  { id: 'nimacha-warned-rear', factionName: '니마차 우디캐', power: 74, warned: true, rearAssault: true, seed: 2026071402 },
  { id: 'holaon-unwarned-rear', factionName: '홀라온 야인', power: 78, warned: false, rearAssault: true, seed: 2026071403 },
  { id: 'holaon-warned-front', factionName: '홀라온 야인', power: 84, warned: true, rearAssault: false, seed: 2026071404 },
  { id: 'bandit-unwarned-rear', factionName: '변경 마적', power: 82, warned: false, rearAssault: true, seed: 2026071405 },
  { id: 'court-warned-front', factionName: '조정 토벌군', power: 154, warned: true, rearAssault: false, seed: 2026071406 },
];

const DEFENDERS = {
  muskets: 3,
  bows: 3,
  spears: 4,
  unarmedMilitia: 1,
  watchmen: 2,
  hunters: 3,
  civilians: 6,
};

function groupCasualties(group) {
  return {
    id: group.id,
    wounded: group.wounded,
    killed: group.killed,
  };
}

function raiderState(group) {
  return {
    id: group.id,
    killed: group.killed,
    power: group.power,
    morale: group.morale,
    zoneId: group.zoneId,
    pendingZoneId: group.pendingZoneId ?? null,
    intent: group.intent,
    rearAssault: group.rearAssault ?? false,
  };
}

function zoneState(zone) {
  return {
    id: zone.id,
    pressure: zone.pressure,
    breached: zone.breached,
  };
}

function snapshotRound(battle, report) {
  return {
    round: report.round,
    focusZoneId: report.focusZoneId,
    nextFocusZoneId: report.nextFocusZoneId,
    defenders: battle.defenderGroups.map(groupCasualties),
    raiders: battle.raiderGroups.map(raiderState),
    zones: battle.zones.map(zoneState),
    villageMorale: battle.villageMorale,
    raiderMorale: battle.raiderMorale,
    villageMoraleDelta: report.villageMoraleDelta,
    raiderMoraleDelta: report.raiderMoraleDelta,
    wounded: report.wounded,
    killed: report.killed,
    raidersKilled: report.raidersKilled,
    buildingsDamaged: report.buildingsDamaged,
    loot: report.loot,
    events: report.events.map(event => ({
      zoneId: event.zoneId,
      kind: event.kind,
      groupId: event.groupId ?? null,
    })),
    ended: report.ended ?? false,
    outcome: report.outcome ?? null,
  };
}

function advanceToCommand(tactical, state) {
  const battle = state.tacticalBattle;
  for (let guard = 0; guard < 4 && battle.phase !== 'command'; guard += 1) {
    const error = tactical.advanceTacticalPhase(state);
    assert.equal(error, null);
  }
  assert.equal(battle.phase, 'command');
}

function forceFlankPlan(battle, rearAssault) {
  const flankers = battle.raiderGroups.find(group => group.kind === 'flankers');
  assert.ok(flankers, 'golden scenarios require a flanker group');
  flankers.flankPlan = rearAssault ? 'rearAssault' : 'breakthrough';
  flankers.targetZoneId = rearAssault ? 'wall' : 'center';
  flankers.rearAssault = false;
}

function runScenario(tactical, battleSimulation, scenario) {
  const state = battleSimulation.createBattleSimulation({
    mode: 'garrison',
    factionName: scenario.factionName,
    power: scenario.power,
    warned: scenario.warned,
    siege: true,
    season: 'winter',
    weather: 'clear',
    prepPoints: 'auto',
    defenders: DEFENDERS,
    cannonEmplacements: 0,
    seed: scenario.seed,
  });
  const battle = state.tacticalBattle;
  assert.ok(battle);
  forceFlankPlan(battle, scenario.rearAssault);
  advanceToCommand(tactical, state);

  const rounds = [];
  for (let guard = 0; guard < 10 && battle.phase === 'command'; guard += 1) {
    assert.equal(tactical.resolveTacticalRound(state), null);
    assert.equal(battle.phase, 'simulating');
    assert.ok(battle.pendingReport);
    rounds.push(snapshotRound(battle, battle.pendingReport));
    assert.equal(tactical.completeTacticalSimulation(state), null);
    assert.equal(tactical.acknowledgeTacticalReport(state), null);
  }
  assert.equal(battle.phase, 'finished');
  const finalReport = battle.reports.at(-1);
  assert.ok(finalReport?.outcome);
  return {
    id: scenario.id,
    factionName: scenario.factionName,
    power: scenario.power,
    warned: scenario.warned,
    rearAssault: scenario.rearAssault,
    seed: scenario.seed,
    rounds,
    outcome: finalReport.outcome,
  };
}

const compiledDir = compileGameModules();
const tactical = await import(pathToFileURL(join(compiledDir, 'tacticalBattle.mjs')).href);
const battleSimulation = await import(pathToFileURL(join(compiledDir, 'battleSimulation.mjs')).href);
const actual = SCENARIOS.map(scenario => runScenario(tactical, battleSimulation, scenario));

const fixtureDir = new URL('./fixtures/', import.meta.url);
const fixtureUrl = new URL('./fixtures/tactical_golden.json', import.meta.url);
if (process.argv.includes('--update')) {
  mkdirSync(fixtureDir, { recursive: true });
  writeFileSync(fixtureUrl, `${JSON.stringify(actual, null, 2)}\n`, 'utf8');
  console.log('tactical golden fixture updated');
} else {
  const expected = JSON.parse(readFileSync(fixtureUrl, 'utf8'));
  assert.deepEqual(actual, expected);
  console.log('tactical golden tests passed');
}
