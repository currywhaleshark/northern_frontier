import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-composition-balance-'));
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

const SAMPLE_COUNT = Number.parseInt(process.env.TACTICAL_COMPOSITION_SAMPLES ?? '200', 10);
assert.ok(Number.isInteger(SAMPLE_COUNT) && SAMPLE_COUNT > 0, 'sample count must be a positive integer');

const SEED_BASE = 2026071900;
const POWER = 154;
const DEFENDERS = {
  muskets: 3,
  bows: 3,
  spears: 4,
  unarmedMilitia: 1,
  watchmen: 2,
  hunters: 3,
  civilians: 6,
};

const CONFIGURATIONS = [
  {
    id: 'cavalryWing',
    label: '관군 기병익대',
    doctrine: 'shockBreakthrough',
    composition: 'court-cavalry-wing',
    artillery: false,
  },
  {
    id: 'siegeBattery',
    label: '정규 공성대',
    doctrine: 'shockBreakthrough',
    composition: 'court-siege-battery',
    artillery: true,
  },
  {
    id: 'legacyPunitiveForce',
    label: '기존 조정 토벌군',
    doctrine: 'missileSuppression',
    composition: 'court-legacy-punitive-force',
    artillery: true,
  },
  {
    id: 'threeArmies',
    label: '삼수진',
    doctrine: 'missileSuppression',
    composition: 'court-three-armies',
    artillery: false,
  },
  {
    id: 'firearmColumn',
    label: '포수 전진대',
    doctrine: 'missileSuppression',
    composition: 'court-firearm-column',
    artillery: false,
  },
];

function advanceToCommand(tactical, state) {
  const battle = state.tacticalBattle;
  for (let guard = 0; guard < 4 && battle.phase !== 'command'; guard += 1) {
    assert.equal(tactical.advanceTacticalPhase(state), null);
  }
  assert.equal(battle.phase, 'command');
}

function zone(battle, id) {
  const found = battle.zones.find(candidate => candidate.id === id);
  assert.ok(found, `missing tactical zone: ${id}`);
  return found;
}

function runBattle(tactical, battleSimulation, configuration, seed) {
  const state = battleSimulation.createBattleSimulation({
    mode: 'garrison',
    factionName: '조정 토벌군',
    power: POWER,
    warned: true,
    siege: true,
    season: 'winter',
    weather: 'clear',
    prepPoints: 'auto',
    defenders: DEFENDERS,
    cannonEmplacements: 0,
    enemyDoctrine: configuration.doctrine,
    enemyCompositionTemplateId: configuration.composition,
    enemyFlankRoute: 'none',
    seed,
  });
  const battle = state.tacticalBattle;
  assert.ok(battle);
  assert.equal(battle.enemyPlan?.doctrine, configuration.doctrine);
  assert.equal(battle.enemyPlan?.compositionTemplateId, configuration.composition);
  assert.equal(battle.enemyPlan?.flankRouteSide, undefined);
  assert.ok(!battle.enemyPlan?.stratagems.some(stratagem => stratagem.id === 'rearManeuver'));
  assert.equal(
    battle.raiderGroups.some(group => group.unitType === 'court-artillery'),
    configuration.artillery,
    `${configuration.id} artillery expectation drifted`,
  );

  const initialEnemyPower = battle.raiderGroups.reduce((sum, group) => sum + group.power, 0);
  const initialEnemyCount = battle.raiderGroups.reduce((sum, group) => sum + group.count, 0);
  advanceToCommand(tactical, state);

  let peakWallPressure = zone(battle, 'wall').pressure;
  let wallBreachRound = null;
  let centerBreachRound = null;
  let buildingsDamaged = 0;
  let lootUnits = 0;

  for (let guard = 0; guard < 10 && battle.phase === 'command'; guard += 1) {
    assert.equal(tactical.resolveTacticalRound(state), null);
    assert.ok(battle.pendingReport);
    peakWallPressure = Math.max(peakWallPressure, zone(battle, 'wall').pressure);
    if (wallBreachRound == null && zone(battle, 'wall').breached) wallBreachRound = battle.round;
    if (centerBreachRound == null && zone(battle, 'center').breached) centerBreachRound = battle.round;
    buildingsDamaged += battle.pendingReport.buildingsDamaged;
    lootUnits += Object.values(battle.pendingReport.loot).reduce((sum, amount) => sum + (amount ?? 0), 0);
    assert.equal(tactical.completeTacticalSimulation(state), null);
    assert.equal(tactical.acknowledgeTacticalReport(state), null);
  }

  assert.equal(battle.phase, 'finished');
  const outcome = battle.reports.at(-1)?.outcome;
  assert.ok(outcome);
  return {
    seed,
    outcome,
    rounds: battle.round,
    initialEnemyPower,
    initialEnemyCount,
    friendlyWounded: battle.defenderGroups.reduce((sum, group) => sum + group.wounded, 0),
    friendlyKilled: battle.defenderGroups.reduce((sum, group) => sum + group.killed, 0),
    enemyKilled: battle.raiderGroups.reduce((sum, group) => sum + group.killed, 0),
    peakWallPressure,
    wallBreached: wallBreachRound != null,
    wallBreachRound,
    centerBreached: centerBreachRound != null,
    centerBreachRound,
    buildingsDamaged,
    lootUnits,
  };
}

function average(results, select) {
  return results.reduce((sum, result) => sum + select(result), 0) / results.length;
}

function rate(results, predicate) {
  return results.filter(predicate).length / results.length;
}

function summarize(results) {
  const outcomes = {};
  for (const result of results) outcomes[result.outcome] = (outcomes[result.outcome] ?? 0) + 1;
  return {
    battles: results.length,
    outcomes,
    defenseSuccessRate: rate(results, result => result.outcome === 'defenseSuccess'),
    partialLossRate: rate(results, result => result.outcome === 'partialLoss'),
    wallBreachRate: rate(results, result => result.wallBreached),
    centerBreachRate: rate(results, result => result.centerBreached),
    averageRounds: average(results, result => result.rounds),
    averageInitialEnemyPower: average(results, result => result.initialEnemyPower),
    averageInitialEnemyCount: average(results, result => result.initialEnemyCount),
    averageFriendlyWounded: average(results, result => result.friendlyWounded),
    averageFriendlyKilled: average(results, result => result.friendlyKilled),
    averageFriendlyCasualties: average(results, result => result.friendlyWounded + result.friendlyKilled),
    averageEnemyKilled: average(results, result => result.enemyKilled),
    averagePeakWallPressure: average(results, result => result.peakWallPressure),
    averageBuildingsDamaged: average(results, result => result.buildingsDamaged),
    averageLootUnits: average(results, result => result.lootUnits),
  };
}

function compare(candidateResults, referenceResults) {
  assert.equal(candidateResults.length, referenceResults.length);
  const outcomeSeverity = {
    defenseSuccess: 0,
    partialLoss: 1,
    raidersLooted: 2,
    villageRouted: 3,
  };
  let candidateBetter = 0;
  let equal = 0;
  let candidateWorse = 0;
  for (let index = 0; index < candidateResults.length; index += 1) {
    const candidate = outcomeSeverity[candidateResults[index].outcome];
    const reference = outcomeSeverity[referenceResults[index].outcome];
    assert.notEqual(candidate, undefined);
    assert.notEqual(reference, undefined);
    if (candidate < reference) candidateBetter += 1;
    else if (candidate > reference) candidateWorse += 1;
    else equal += 1;
  }
  const candidateSummary = summarize(candidateResults);
  const referenceSummary = summarize(referenceResults);
  return {
    pairedOutcomes: { candidateBetter, equal, candidateWorse },
    defenseSuccessRateDelta: candidateSummary.defenseSuccessRate - referenceSummary.defenseSuccessRate,
    wallBreachRateDelta: candidateSummary.wallBreachRate - referenceSummary.wallBreachRate,
    centerBreachRateDelta: candidateSummary.centerBreachRate - referenceSummary.centerBreachRate,
    averagePeakWallPressureDelta:
      candidateSummary.averagePeakWallPressure - referenceSummary.averagePeakWallPressure,
    averageFriendlyCasualtiesDelta:
      candidateSummary.averageFriendlyCasualties - referenceSummary.averageFriendlyCasualties,
    averageEnemyKilledDelta: candidateSummary.averageEnemyKilled - referenceSummary.averageEnemyKilled,
    averageRoundsDelta: candidateSummary.averageRounds - referenceSummary.averageRounds,
  };
}

const compiledDir = compileGameModules();
const tactical = await import(pathToFileURL(join(compiledDir, 'tacticalBattle.mjs')).href);
const battleSimulation = await import(pathToFileURL(join(compiledDir, 'battleSimulation.mjs')).href);
const seeds = Array.from({ length: SAMPLE_COUNT }, (_unused, index) => SEED_BASE + index);
const results = Object.fromEntries(CONFIGURATIONS.map(configuration => [
  configuration.id,
  seeds.map(seed => runBattle(tactical, battleSimulation, configuration, seed)),
]));

// Re-run a small paired sample so the measurement fails loudly if seeded battles drift.
for (const configuration of CONFIGURATIONS) {
  const replayed = seeds.slice(0, Math.min(5, seeds.length))
    .map(seed => runBattle(tactical, battleSimulation, configuration, seed));
  const originals = results[configuration.id].slice(0, replayed.length);
  assert.deepEqual(replayed, originals, `${configuration.id} fixed-seed replay drifted`);
}

const summaries = Object.fromEntries(CONFIGURATIONS.map(configuration => [
  configuration.id,
  {
    label: configuration.label,
    doctrine: configuration.doctrine,
    composition: configuration.composition,
    artillery: configuration.artillery,
    ...summarize(results[configuration.id]),
  },
]));
const defenseSuccessRates = Object.values(summaries).map(summary => summary.defenseSuccessRate);
const output = {
  conditions: {
    samplesPerComposition: SAMPLE_COUNT,
    seedBase: SEED_BASE,
    factionName: '조정 토벌군',
    power: POWER,
    warned: true,
    siege: true,
    season: 'winter',
    weather: 'clear',
    prepPoints: 'auto',
    cannonEmplacements: 0,
    enemyFlankRoute: 'none',
    defenders: DEFENDERS,
  },
  summaries,
  comparisons: {
    cavalryWingVsSiegeBatteryMatchedDoctrine: compare(results.cavalryWing, results.siegeBattery),
    cavalryWingVsLegacyPunitiveForce: compare(results.cavalryWing, results.legacyPunitiveForce),
  },
  gates: {
    compositionDefenseSuccessSpread:
      Math.max(...defenseSuccessRates) - Math.min(...defenseSuccessRates),
    finalDraftWithinThirtyPercentagePoints:
      Math.max(...defenseSuccessRates) - Math.min(...defenseSuccessRates) <= 0.3,
  },
};

console.log(JSON.stringify(output, null, 2));
