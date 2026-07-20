import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-tactical-faction-balance-'));
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

const SAMPLE_COUNT = Number.parseInt(process.env.TACTICAL_FACTION_SAMPLES ?? '200', 10);
assert.ok(Number.isInteger(SAMPLE_COUNT) && SAMPLE_COUNT > 0, 'sample count must be a positive integer');

const SEED_BASE = 2026072500;
const POWER = 120;
const DEFENDERS = {
  muskets: 3,
  bows: 3,
  spears: 4,
  unarmedMilitia: 1,
  watchmen: 2,
  hunters: 2,
  civilians: 6,
};
const FACTIONS = [
  { id: 'nimacha', name: '니마차 우디캐' },
  { id: 'holaon', name: '홀라온 야인' },
  { id: 'bandit', name: '변경 마적' },
  { id: 'court', name: '조정 토벌군' },
];
const WEATHER_MATRIX = [
  { season: 'spring', weather: 'clear' },
  { season: 'winter', weather: 'blizzard' },
  { season: 'spring', weather: 'thawFlood' },
];

function advanceToCommand(tactical, state) {
  const battle = state.tacticalBattle;
  for (let guard = 0; guard < 8 && battle.phase !== 'command'; guard += 1) {
    if (battle.phase === 'deployment') tactical.applyAutoDeployTacticalGroups(battle);
    assert.equal(tactical.advanceTacticalPhase(state), null);
  }
  assert.equal(battle.phase, 'command');
}

function average(results, select) {
  return results.reduce((sum, result) => sum + select(result), 0) / results.length;
}

function rate(results, predicate) {
  return results.filter(predicate).length / results.length;
}

function distribution(results, select) {
  return Object.fromEntries([...results.reduce((counts, result) => {
    const key = select(result) ?? 'unknown';
    counts.set(key, (counts.get(key) ?? 0) + 1);
    return counts;
  }, new Map()).entries()].sort(([left], [right]) => left.localeCompare(right)));
}

function runBattle(tactical, battleSimulation, faction, index) {
  const condition = WEATHER_MATRIX[index % WEATHER_MATRIX.length];
  const seed = SEED_BASE + index;
  const state = battleSimulation.createBattleSimulation({
    scenario: 'defense',
    mode: 'garrison',
    factionName: faction.name,
    power: POWER,
    warned: index % 2 === 0,
    siege: index % 4 === 0,
    season: condition.season,
    weather: condition.weather,
    prepPoints: 'auto',
    defenders: DEFENDERS,
    cannonEmplacements: 0,
    enemyDoctrine: 'auto',
    enemyCompositionTemplateId: 'auto',
    enemyFlankRoute: 'auto',
    enemyRelation: 0,
    seed,
  });
  const battle = state.tacticalBattle;
  assert.ok(battle?.enemyPlan?.doctrine);
  advanceToCommand(tactical, state);

  for (let guard = 0; guard < 12 && battle.phase === 'command'; guard += 1) {
    assert.equal(tactical.resolveTacticalRound(state), null);
    assert.ok(battle.pendingReport);
    assert.equal(tactical.completeTacticalSimulation(state), null);
    assert.equal(tactical.acknowledgeTacticalReport(state), null);
  }
  assert.equal(battle.phase, 'finished');
  const outcome = battle.reports.at(-1)?.outcome;
  assert.ok(outcome);
  const friendlyCasualties = battle.defenderGroups.reduce(
    (sum, group) => sum + group.killed + group.wounded,
    0,
  );
  const heavyWeaponReports = battle.reports.filter(report => report.events
    .some(event => event.kind === 'artilleryHit' || event.kind === 'hwachaVolley'));
  const heavyWeaponRoundCasualties = heavyWeaponReports.reduce(
    (sum, report) => sum + report.killed + report.wounded,
    0,
  );
  const peakHeavyWeaponRoundCasualties = Math.max(0, ...heavyWeaponReports
    .map(report => report.killed + report.wounded));
  const routeArrivals = battle.reports.flatMap(report => report.routeArrivals ?? []);
  const lootUnits = battle.reports.reduce((sum, report) => sum + Object.values(report.loot)
    .reduce((lootSum, amount) => lootSum + Number(amount ?? 0), 0), 0);
  tactical.finishTacticalBattle(state);
  assert.ok(state.tacticalBattleReport);
  return {
    seed,
    warned: battle.warned,
    weather: state.weather,
    doctrine: battle.enemyPlan.doctrine,
    objective: battle.enemyPlan.objective,
    composition: battle.enemyPlan.compositionTemplateId ?? 'unassigned',
    flankAttempted: battle.enemyPlan.flankRouteSide != null,
    raiderReachedRear: routeArrivals.some(arrival => arrival.side === 'raider'),
    outcome,
    result: state.tacticalBattleReport.result,
    rounds: battle.reports.length,
    friendlyCasualties,
    enemyCasualties: battle.raiderGroups.reduce((sum, group) => sum + group.killed, 0),
    lootUnits,
    heavyWeaponRounds: heavyWeaponReports.length,
    heavyWeaponRoundCasualties,
    peakHeavyWeaponRoundCasualties,
    raiderPowerRestored: battle.reports.reduce((sum, report) => sum + (report.raiderPowerRestored ?? 0), 0),
  };
}

function summarize(results) {
  const compositions = distribution(results, result => result.composition);
  const doctrines = distribution(results, result => result.doctrine);
  const compositionResults = Object.fromEntries(Object.keys(compositions).map(composition => {
    const entries = results.filter(result => result.composition === composition);
    return [composition, {
      battles: entries.length,
      victoryRate: rate(entries, result => result.result === 'victory'),
      averageFriendlyCasualties: average(entries, result => result.friendlyCasualties),
      averageEnemyCasualties: average(entries, result => result.enemyCasualties),
      lootRate: rate(entries, result => result.lootUnits > 0),
      averageLootUnits: average(entries, result => result.lootUnits),
      objectives: distribution(entries, result => result.objective),
      rearArrivalRate: rate(entries, result => result.raiderReachedRear),
    }];
  }));
  const objectiveResults = Object.fromEntries([...new Set(results.map(result => result.objective))].sort()
    .map(objective => {
      const entries = results.filter(result => result.objective === objective);
      return [objective, {
        battles: entries.length,
        victoryRate: rate(entries, result => result.result === 'victory'),
        lootRate: rate(entries, result => result.lootUnits > 0),
        averageLootUnits: average(entries, result => result.lootUnits),
        compositions: distribution(entries, result => result.composition),
      }];
    }));
  const compositionVictoryRates = Object.values(compositionResults).map(summary => summary.victoryRate);
  const mostCommonComposition = Math.max(...Object.values(compositions)) / results.length;
  const friendlyCasualtyTotal = results.reduce((sum, result) => sum + result.friendlyCasualties, 0);
  const heavyWeaponRoundCasualtyTotal = results.reduce((sum, result) => sum + result.heavyWeaponRoundCasualties, 0);
  return {
    battles: results.length,
    outcomes: distribution(results, result => result.outcome),
    doctrines,
    compositions,
    compositionResults,
    objectiveResults,
    compositionVictoryRateSpread: Math.max(...compositionVictoryRates) - Math.min(...compositionVictoryRates),
    victoryRate: rate(results, result => result.result === 'victory'),
    defenseSuccessRate: rate(results, result => result.outcome === 'defenseSuccess'),
    warnedVictoryRate: rate(results.filter(result => result.warned), result => result.result === 'victory'),
    unwarnedVictoryRate: rate(results.filter(result => !result.warned), result => result.result === 'victory'),
    flankAttemptRate: rate(results, result => result.flankAttempted),
    rearArrivalRate: rate(results, result => result.raiderReachedRear),
    averageRounds: average(results, result => result.rounds),
    averageFriendlyCasualties: average(results, result => result.friendlyCasualties),
    averageEnemyCasualties: average(results, result => result.enemyCasualties),
    lootRate: rate(results, result => result.lootUnits > 0),
    averageLootUnits: average(results, result => result.lootUnits),
    averageRaiderPowerRestored: average(results, result => result.raiderPowerRestored),
    heavyWeaponRoundRate: rate(results, result => result.heavyWeaponRounds > 0),
    heavyWeaponRoundCasualtyUpperBoundShare: heavyWeaponRoundCasualtyTotal / Math.max(1, friendlyCasualtyTotal),
    peakHeavyWeaponRoundCasualties: Math.max(...results.map(result => result.peakHeavyWeaponRoundCasualties)),
    mostCommonCompositionShare: mostCommonComposition,
    unassignedCompositionRate: rate(results, result => result.composition === 'unassigned'),
  };
}

const compiledDir = compileGameModules();
const tactical = await import(pathToFileURL(join(compiledDir, 'tacticalBattle.mjs')).href);
const battleSimulation = await import(pathToFileURL(join(compiledDir, 'battleSimulation.mjs')).href);
const results = Object.fromEntries(FACTIONS.map(faction => [
  faction.id,
  Array.from({ length: SAMPLE_COUNT }, (_unused, index) =>
    runBattle(tactical, battleSimulation, faction, index)),
]));

for (const faction of FACTIONS) {
  const replayed = Array.from({ length: Math.min(3, SAMPLE_COUNT) }, (_unused, index) =>
    runBattle(tactical, battleSimulation, faction, index));
  assert.deepEqual(replayed, results[faction.id].slice(0, replayed.length),
    `${faction.id} fixed-seed replay drifted`);
}

const factions = Object.fromEntries(FACTIONS.map(faction => [faction.id, {
  name: faction.name,
  ...summarize(results[faction.id]),
}]));
const victoryRates = Object.values(factions).map(summary => summary.victoryRate);
const compositionSpreadsByFaction = Object.fromEntries(Object.entries(factions)
  .map(([faction, summary]) => [faction, summary.compositionVictoryRateSpread]));
const output = {
  conditions: {
    samplesPerFaction: SAMPLE_COUNT,
    seedBase: SEED_BASE,
    power: POWER,
    warned: 'paired true/false',
    siege: 'one in four',
    weatherMatrix: WEATHER_MATRIX,
    prepPoints: 'auto',
    doctrine: 'auto',
    composition: 'auto',
    flankRoute: 'auto',
    enemyRelation: 0,
    defenders: DEFENDERS,
  },
  factions,
  gates: {
    crossFactionVictoryRateSpreadDiagnostic: Math.max(...victoryRates) - Math.min(...victoryRates),
    compositionVictoryRateSpreads: compositionSpreadsByFaction,
    compositionsWithinThirtyPercentagePoints: Object.values(compositionSpreadsByFaction)
      .every(spread => spread <= 0.3),
    compositionDiversityWithinFortyFivePercent: Object.values(factions)
      .every(summary => summary.mostCommonCompositionShare <= 0.45),
    allPlansHaveComposition: Object.values(factions)
      .every(summary => summary.unassignedCompositionRate === 0),
  },
};

console.log(JSON.stringify(output, null, 2));
