import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-formation-balance-'));
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

const FACTIONS = [
  { name: '니마차 우디캐', basePower: 68 },
  { name: '홀라온 야인', basePower: 76 },
  { name: '변경 마적', basePower: 80 },
  { name: '조정 토벌군', basePower: 132 },
];

const SCENARIOS = Array.from({ length: 20 }, (_unused, index) => {
  const faction = FACTIONS[index % FACTIONS.length];
  return {
    id: `formation-balance-${index + 1}`,
    factionName: faction.name,
    power: faction.basePower + Math.floor(index / FACTIONS.length) * 3,
    warned: Math.floor(index / FACTIONS.length) % 2 === 1,
    rearAssault: index % 3 !== 0,
    seed: 2026071420 + index,
  };
});

const DEFENDERS = {
  muskets: 3,
  bows: 3,
  spears: 4,
  unarmedMilitia: 1,
  watchmen: 2,
  hunters: 3,
  civilians: 6,
};

// The verified pre-expansion system already gives the three-line formation a
// substantial kill advantage over collapsing the middle line into the rear.
// Measure drift from that baseline instead of flagging the established advantage.
const HISTORICAL_REFERENCE = {
  baseline: { averageFriendlyCasualties: 3.95, averageEnemyKills: 4.6 },
  threeLine: { averageFriendlyCasualties: 3.65, averageEnemyKills: 6.7 },
};

function advanceToCommand(tactical, state) {
  const battle = state.tacticalBattle;
  for (let guard = 0; guard < 4 && battle.phase !== 'command'; guard += 1) {
    assert.equal(tactical.advanceTacticalPhase(state), null);
  }
  assert.equal(battle.phase, 'command');
}

function forceFlankPlan(battle, rearAssault) {
  const flankers = battle.raiderGroups.find(group => group.kind === 'flankers');
  assert.ok(flankers);
  flankers.flankPlan = rearAssault ? 'rearAssault' : 'breakthrough';
  flankers.targetZoneId = rearAssault ? 'wall' : 'center';
  flankers.rearAssault = false;
}

function runScenario(tactical, battleSimulation, scenario, formationMode) {
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
  if (formationMode === 'two-line-baseline') {
    for (const group of battle.defenderGroups) {
      if (group.line === 'middle') group.line = 'rear';
    }
  }
  advanceToCommand(tactical, state);
  const rearFormationCounters = [];

  for (let guard = 0; guard < 10 && battle.phase === 'command'; guard += 1) {
    const rearZoneIds = [...new Set(battle.raiderGroups.filter(group =>
      group.rearAssault && group.intent !== 'withdraw' && group.power > 0 && group.count - group.killed > 0)
      .map(group => group.zoneId))];
    for (const zoneId of rearZoneIds) {
      const rearAttackers = battle.raiderGroups.filter(group =>
        group.zoneId === zoneId && group.rearAssault && group.intent !== 'withdraw' &&
        group.power > 0 && group.count - group.killed > 0);
      const rearDefenders = battle.defenderGroups.filter(group =>
        group.zoneId === zoneId && group.count - group.wounded - group.killed > 0 &&
        (group.commandable === false || group.line === 'rear' ||
          (group.line === 'middle' && group.command === 'reinforceRear')));
      rearFormationCounters.push(tactical.tacticalRearManeuverFormationCounterForEngagement(
        battle,
        zoneId,
        rearAttackers,
        rearDefenders,
      ));
    }
    assert.equal(tactical.resolveTacticalRound(state), null);
    assert.equal(tactical.completeTacticalSimulation(state), null);
    assert.equal(tactical.acknowledgeTacticalReport(state), null);
  }
  assert.equal(battle.phase, 'finished');
  const outcome = battle.reports.at(-1)?.outcome;
  assert.ok(outcome);
  return {
    friendlyCasualties: battle.defenderGroups.reduce(
      (sum, group) => sum + group.wounded + group.killed,
      0,
    ),
    enemyKills: battle.raiderGroups.reduce((sum, group) => sum + group.killed, 0),
    rearFormationCounter: rearFormationCounters.length > 0
      ? rearFormationCounters.reduce((sum, value) => sum + value, 0) / rearFormationCounters.length
      : 0,
    outcome,
  };
}

function summarize(results) {
  const outcomes = {};
  for (const result of results) outcomes[result.outcome] = (outcomes[result.outcome] ?? 0) + 1;
  return {
    battles: results.length,
    averageFriendlyCasualties: results.reduce((sum, result) => sum + result.friendlyCasualties, 0) / results.length,
    averageEnemyKills: results.reduce((sum, result) => sum + result.enemyKills, 0) / results.length,
    averageRearFormationCounter: results.reduce((sum, result) => sum + result.rearFormationCounter, 0) / results.length,
    outcomes,
  };
}

function relativeDelta(current, baseline) {
  return baseline === 0 ? (current === 0 ? 0 : Number.POSITIVE_INFINITY) : (current - baseline) / baseline;
}

const compiledDir = compileGameModules();
const tactical = await import(pathToFileURL(join(compiledDir, 'tacticalBattle.mjs')).href);
const battleSimulation = await import(pathToFileURL(join(compiledDir, 'battleSimulation.mjs')).href);
const baseline = summarize(SCENARIOS.map(scenario =>
  runScenario(tactical, battleSimulation, scenario, 'two-line-baseline')));
const threeLine = summarize(SCENARIOS.map(scenario =>
  runScenario(tactical, battleSimulation, scenario, 'three-line')));
const deltas = {
  averageFriendlyCasualties: relativeDelta(
    threeLine.averageFriendlyCasualties,
    baseline.averageFriendlyCasualties,
  ),
  averageEnemyKills: relativeDelta(threeLine.averageEnemyKills, baseline.averageEnemyKills),
};
const regressions = {
  baseline: {
    averageFriendlyCasualties: relativeDelta(
      baseline.averageFriendlyCasualties,
      HISTORICAL_REFERENCE.baseline.averageFriendlyCasualties,
    ),
    averageEnemyKills: relativeDelta(
      baseline.averageEnemyKills,
      HISTORICAL_REFERENCE.baseline.averageEnemyKills,
    ),
  },
  threeLine: {
    averageFriendlyCasualties: relativeDelta(
      threeLine.averageFriendlyCasualties,
      HISTORICAL_REFERENCE.threeLine.averageFriendlyCasualties,
    ),
    averageEnemyKills: relativeDelta(
      threeLine.averageEnemyKills,
      HISTORICAL_REFERENCE.threeLine.averageEnemyKills,
    ),
  },
};

console.log(JSON.stringify({ baseline, threeLine, deltas, regressions }, null, 2));

for (const [formation, metrics] of Object.entries(regressions)) {
  assert.ok(Math.abs(metrics.averageFriendlyCasualties) <= 0.15,
    `${formation} friendly casualty regression exceeds 15%: ${metrics.averageFriendlyCasualties}`);
  assert.ok(Math.abs(metrics.averageEnemyKills) <= 0.15,
    `${formation} enemy kill regression exceeds 15%: ${metrics.averageEnemyKills}`);
}
